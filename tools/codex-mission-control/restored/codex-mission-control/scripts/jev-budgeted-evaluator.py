#!/usr/bin/env python3
"""Bounded Jev version discovery and deidentified independent-evaluation runner.

Owner authorization: total NEW Jev eval spend USD 1.00, 2026-11-15.
Always discover available Decisions models first, pinned model IDs only; never
replace authoritative Mission Control routing. Runs only when called explicitly
or by an authorized configured schedule. No account recharge or key management.

Two key routes, never printed or persisted here:
  * this process's OPENROUTER_API_KEY, or --key-file (an owner-only file);
  * --via-mission-control HOST:CONTAINER: each request is forwarded through Mission
    Control's own container (scripts/jev-decisions-forward.mjs), which signs it with
    the key already configured there; the key never leaves that process.
"""
from __future__ import annotations
import argparse
from contextlib import contextmanager
from decimal import Decimal, InvalidOperation
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

CATALOG = "https://openrouter.ai/api/v1/models?endpoints=/api/alpha/decisions"
DECISIONS = "https://openrouter.ai/api/alpha/decisions"
KEY_STATUS = "https://openrouter.ai/api/v1/key"
VERSION = re.compile(r"^typesafe/jev-(\d+)\.(\d+)$")
MAX_ADDITIONAL_USD = Decimal("1.00")  # owner-approved total across both evaluations
MAX_PRICE_PER_INPUT_TOKEN = Decimal("0.000000042")  # currently 1.13/1.14
MAX_PACKET_BYTES = 24_000
MAX_ATTEMPTS_PER_INVOCATION = 2  # default per invocation; --max-calls raises it up to the ceiling
MAX_CALLS_CEILING = 60  # with stop-on-first-failure, a full planned run fits in one invocation
MAX_REQUEST_RESERVATION_USD = Decimal("0.015")  # conservative liability bound
USER_AGENT = "MissionControl-Jev-evaluation/2.0"
CANONICAL_LEDGER = Path.home()/".local/state/mission-control/jev-eval-20261115-budget.json"
FORWARDER = "/app/scripts/jev-decisions-forward.mjs"  # inside Mission Control's image
SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


class Refused(Exception):
    pass


def json_request(url: str, *, payload: bytes | None = None,
                 key: str | None = None, timeout: float = 12, opener=urlopen):
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if key:
        headers["Authorization"] = "Bearer " + key
    method = "POST" if payload is not None else "GET"
    req = Request(url, data=payload, headers=headers, method=method)
    try:
        with opener(req, timeout=timeout) as response:
            raw = response.read(200_000)
            return int(response.status), json.loads(raw), None
    except HTTPError as error:
        # Never return response body, Authorization header, or hidden prompts.
        limit_source = None
        if error.code in (402, 429):
            try:
                doc = json.loads(error.read(4096))
                value = (doc.get("error") or {}).get("metadata") or {}
                if value.get("limit_source") in (
                    "openrouter_in_flight_budget", "openrouter_key_limit",
                    "openrouter_credits",
                ):
                    limit_source = value["limit_source"]
            except (ValueError, AttributeError, TypeError):
                pass
        return int(error.code), None, limit_source


def discover(*, opener=urlopen) -> list[dict]:
    status, response, _ = json_request(CATALOG, opener=opener)
    if status != 200 or not isinstance(response, dict):
        raise Refused("Official Decisions model catalog unavailable; no paid calls.")
    models: list[dict] = []
    for row in response.get("data", []):
        if not isinstance(row, dict):
            continue
        match = VERSION.fullmatch(row.get("id", ""))
        if not match or "/api/alpha/decisions" not in row.get("endpoints", []):
            continue
        try:
            pricing = row["pricing"]
            price = Decimal(str(pricing["prompt"]))
            # Only the input price may be non-zero: an output, per-request or other fee is refused.
            if any(Decimal(str(value)) != 0 for key, value in pricing.items() if key != "prompt"):
                continue
        except (KeyError, ValueError, TypeError, InvalidOperation, AttributeError):
            continue
        models.append({
            "id": row["id"],
            "sort_key": [int(match.group(1)), int(match.group(2))],
            "price_usd_per_input_token": str(price),
            "context_length": row.get("context_length"),
        })
    models.sort(key=lambda r: tuple(r["sort_key"]), reverse=True)
    if not models:
        raise Refused("No pinned TypeSafe Jev models found on the Decisions catalog.")
    return models


def eligible_price(model: dict) -> bool:
    try:
        price = Decimal(str(model["price_usd_per_input_token"]))
    except (KeyError, InvalidOperation, TypeError, ValueError):
        return False
    return price.is_finite() and Decimal(0) < price <= MAX_PRICE_PER_INPUT_TOKEN


def latest_eligible(models: list[dict]) -> dict:
    for model in models:
        if eligible_price(model):
            return model
    raise Refused("New Jev catalog has changed pricing; refusing unapproved paid version.")


def _ledger_template() -> dict:
    return {"schema": 1, "experiment": "jev-independent-value-2026-11-15",
            "cap_usd": str(MAX_ADDITIONAL_USD), "entries": [],
            "last_seen_latest": None, "last_discovery": None}


@contextmanager
def locked_ledger(path: Path):
    parent = path.parent
    if not parent.is_dir() or parent.is_symlink():
        raise Refused("A private existing ledger parent directory is required.")
    if parent.stat().st_mode & stat.S_IWOTH:
        raise Refused("Budget ledger parent directory cannot be world-writable.")
    flags = os.O_RDWR | os.O_CREAT
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise Refused("Budget ledger must be an ordinary file.")
        if stat.S_IMODE(os.fstat(fd).st_mode) & 0o077:
            raise Refused("Budget ledger may be read only by its owner.")
        with os.fdopen(fd, "r+", encoding="utf-8") as stream:
            fd = -1
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
            raw = stream.read()
            ledger = json.loads(raw) if raw else _ledger_template()
            if (ledger.get("schema") != 1
                or ledger.get("experiment") != "jev-independent-value-2026-11-15"
                or Decimal(str(ledger.get("cap_usd"))) != MAX_ADDITIONAL_USD
                or not isinstance(ledger.get("entries"), list)):
                raise Refused("Budget ledger identity or cap differs from owner authority.")
            yield ledger, lambda: _save(stream, ledger)
    finally:
        if fd >= 0:
            os.close(fd)


def _save(stream, ledger: dict):
    stream.seek(0)
    stream.write(json.dumps(ledger, sort_keys=True, separators=(",", ":")))
    stream.truncate()
    stream.flush()
    os.fsync(stream.fileno())


def committed_plus_reserved(ledger: dict) -> Decimal:
    total = Decimal("0")
    for entry in ledger["entries"]:
        amount = Decimal(str(entry.get("final_usd")
                             if entry.get("final_usd") is not None
                             else entry.get("reserved_usd", "0")))
        if amount < 0:
            raise Refused("Invalid negative spend in ledger.")
        total += amount
    if total > MAX_ADDITIONAL_USD:
        raise Refused("Existing ledger already exceeds owner cap; abort.")
    return total


def load_packets(path: Path) -> list[dict]:
    if not path.is_file() or path.stat().st_size > 3_000_000:
        raise Refused("Small, existing deidentified JSONL packet file required.")
    rows = []
    cases = set()
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        packet = json.loads(line)
        case = packet.get("case_id")
        req = packet.get("jev_request") or packet.get("request")
        if (not isinstance(case, str) or not re.fullmatch(r"[a-zA-Z0-9_.:-]{1,96}",case)
            or not isinstance(req, dict) or not isinstance(req.get("state"), (str, dict))
            or not isinstance(req.get("questions"),dict)):
            raise Refused(f"Invalid blind packet at line {number}.")
        if case in cases:
            raise Refused("Duplicate case ID: evaluation has ambiguous state identity.")
        cases.add(case)
        serialized = json.dumps(req, separators=(",", ":"), ensure_ascii=False)
        if len(serialized.encode()) > MAX_PACKET_BYTES:
            raise Refused("Request too large for conservative budget and privacy review.")
        if re.search(r"sk-or-v1-|authorization[\"']?\s*:\s*[\"']?Bearer",serialized,re.I):
            raise Refused("Credential-like content in proposed model input.")
        rows.append({"case_id": case, "request": req})
    if not rows:
        raise Refused("No deidentified evaluation cases provided.")
    return rows


def reserve_cost(packet: bytes, token_price: Decimal) -> Decimal:
    # One UTF-8 byte can never represent more than one token for these text-only
    # payloads; 2,048 additional tokens cover provider serialization overhead.
    estimated = (Decimal(len(packet) + 2048) * token_price)
    reserve = max(estimated * Decimal("2"), Decimal("0.002"))
    if reserve > MAX_REQUEST_RESERVATION_USD:
        raise Refused("One call exceeds the per-request conservative liability limit.")
    return reserve


def load_key(key_file: Path | None = None) -> str | None:
    """The key from this process's environment or from an owner-only key file; never printed or stored."""
    if key_file is not None:
        if key_file.is_symlink() or not key_file.is_file():
            raise Refused("The key file must be an ordinary file.")
        if stat.S_IMODE(key_file.stat().st_mode) & 0o077:
            raise Refused("The key file may be readable only by its owner (mode 600).")
        value = key_file.read_text(encoding="utf-8").strip()
        return value or None
    env = os.getenv("OPENROUTER_API_KEY", "").strip()
    if env:
        return env
    # Do not discover, copy, print or persist raw credential material.
    return None


class DirectTransport:
    """Calls OpenRouter from this process with a key it already holds."""

    def __init__(self, key: str, opener=urlopen):
        self.key = key
        self.opener = opener

    def key_status(self):
        status, data, _ = json_request(KEY_STATUS, key=self.key, opener=self.opener)
        return status, data

    def decide(self, body: bytes):
        return json_request(DECISIONS, payload=body, key=self.key, timeout=12, opener=self.opener)


class MissionControlTransport:
    """Forwards each request through Mission Control's container, which signs it with its own configured key.

    Nothing secret crosses this boundary: the request body goes in, typed fields come back. A broken connection
    after the request may have been sent is reported as status 0, which the ledger treats as billable.
    """

    def __init__(self, target: str, runner=subprocess.run):
        host, sep, container = target.partition(":")
        if not sep or not SAFE_NAME.fullmatch(host) or not SAFE_NAME.fullmatch(container):
            raise Refused("--via-mission-control needs HOST:CONTAINER (letters, digits, dot, dash, underscore).")
        self.command = ["ssh", "-o", "ClearAllForwardings=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=30",
                        host, f"sudo -n docker exec -i {container} node {FORWARDER}"]
        self.runner = runner

    def _call(self, payload: bytes, *extra: str):
        command = self.command[:-1] + [self.command[-1] + "".join(" " + item for item in extra)]
        try:
            done = self.runner(command, input=payload, capture_output=True, timeout=60)
        except (OSError, subprocess.SubprocessError):
            return 0, None, None
        lines = [line for line in done.stdout.decode("utf-8", "replace").splitlines() if line.startswith("{")]
        try:
            reply = json.loads(lines[-1]) if lines else {}
            status = int(reply.get("http_status", 0))
        except (ValueError, TypeError, AttributeError):
            return 0, None, None
        limit = reply.get("limit_source")
        if limit not in ("openrouter_in_flight_budget", "openrouter_key_limit", "openrouter_credits"):
            limit = None
        return status, reply.get("body"), limit

    def key_status(self):
        status, body, _ = self._call(b"", "--key-status")
        return status, body

    def decide(self, body: bytes):
        return self._call(body)


def key_budget_check(transport, reserve: Decimal) -> dict:
    status, data = transport.key_status()
    if status != 200 or not isinstance(data, dict) or not isinstance(data.get("data"),dict):
        raise Refused(f"OpenRouter key metadata returned HTTP {status}; no inference calls.")
    data = data["data"]
    limit_remaining = data.get("limit_remaining")
    if limit_remaining is not None and Decimal(str(limit_remaining)) < reserve:
        raise Refused("OpenRouter per-key credit cap insufficient for reserved request cost.")
    # The key metadata does not necessarily show the full account cash balance.
    return {"key_limit_remaining": limit_remaining is not None, "key_validated": True}


def _probability(value) -> bool:
    return type(value) in (int, float) and 0 <= value <= 1


def typed_decisions(answers: dict) -> dict:
    """Persist only compact typed values, never a free-form provider body.

    The Decisions API returns {"type": "noul", "noul": p}, {"type": "choice", "choice": option, "confidence": c,
    "probabilities": {option: p}} and {"type": "score", "score": n, ...}; a choice given only as a probability map
    is reduced to its most probable option.
    """
    if len(answers) > 60:
        raise ValueError("Too many decision answers.")
    result: dict = {}
    for key, value in answers.items():
        if not isinstance(key, str) or not re.fullmatch(r"[a-zA-Z0-9_.-]{1,80}", key):
            raise ValueError("Unsafe answer key.")
        if not isinstance(value, dict):
            raise ValueError("Malformed typed decision.")
        if "noul" in value:
            number = value["noul"]
            if type(number) is bool:
                result[key] = {"noul": number}
            elif _probability(number):
                result[key] = {"noul": number}
            else:
                raise ValueError("Invalid Noul probability.")
        elif "choice" in value:
            choice = value["choice"]
            probabilities = value.get("probabilities")
            if isinstance(choice, dict):
                probabilities, choice = choice, None
            typed: dict = {}
            if probabilities is not None:
                if (not isinstance(probabilities, dict) or len(probabilities) > 40
                        or not all(isinstance(k, str) and re.fullmatch(r"[a-zA-Z0-9_.-]{1,80}", k)
                                   and _probability(v) for k, v in probabilities.items())):
                    raise ValueError("Invalid choice probabilities.")
                typed["probabilities"] = dict(probabilities)
                if choice is None and probabilities:
                    choice = sorted(probabilities.items(), key=lambda item: (-item[1], item[0]))[0][0]
            if not isinstance(choice, str) or not re.fullmatch(r"[a-zA-Z0-9_.-]{1,80}", choice):
                raise ValueError("Invalid typed choice.")
            typed["choice"] = choice
            if _probability(value.get("confidence")):
                typed["confidence"] = value["confidence"]
            result[key] = typed
        elif "score" in value:
            score = value["score"]
            if type(score) not in (int, float) or not -100 <= score <= 100:
                raise ValueError("Invalid score.")
            result[key] = {"score": score}
        else:
            raise ValueError("Unexpected decision response type.")
    return result


def reported_cost(body: dict) -> Decimal | None:
    usage = body.get("usage")
    if not isinstance(usage, dict) or usage.get("cost") is None or type(usage.get("cost")) is bool:
        return None
    try:
        value = Decimal(str(usage["cost"]))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return value if value.is_finite() and value >= 0 else None


def answers_match_questions(typed: dict, questions) -> bool:
    """Every question asked has an answer of its type; a choice is one of the question's own options."""
    if not isinstance(questions, dict) or not questions:
        return False
    for key, question in questions.items():
        kind = question.get("type") if isinstance(question, dict) else None
        answer = typed.get(key)
        if kind not in ("noul", "choice", "score") or not isinstance(answer, dict) or kind not in answer:
            return False
        criteria = question.get("criteria")
        if kind == "choice" and isinstance(criteria, dict) and answer["choice"] not in criteria:
            return False
    return True


def run(packets: list[dict], ledger_path: Path, *,
        models: list[dict], compare_legacy=False, opener=urlopen,
        transport=None, max_calls: int = MAX_ATTEMPTS_PER_INVOCATION,
        key_file: Path | None = None) -> dict:
    if not isinstance(max_calls, int) or not 1 <= max_calls <= MAX_CALLS_CEILING:
        raise Refused(f"--max-calls must be between 1 and {MAX_CALLS_CEILING}.")
    latest = latest_eligible(models)
    legacy = next((m for m in models if m["id"] == "typesafe/jev-1.13"), None)
    selected = [latest]
    if compare_legacy and legacy and legacy["id"] != latest["id"]:
        selected.append(legacy)
    # Every version called, the legacy comparison included, passes the same price guard.
    for model in selected:
        if not eligible_price(model):
            raise Refused(f"{model['id']} is priced outside the owner-approved guard; no paid calls.")
    if transport is None:
        key = load_key(key_file)
        if not key:
            return {"status": "BLOCKED_CREDENTIAL_UNAVAILABLE",
                    "selected_models": [m["id"] for m in selected],
                    "new_provider_calls": 0, "cap_usd": str(MAX_ADDITIONAL_USD)}
        transport = DirectTransport(key, opener=opener)
    # Fail closed if the account/key is not usable before making a paid call.
    key_budget_check(transport, Decimal("0.002"))
    results = []
    attempts = 0
    for packet in packets:
        for model in selected:
            if attempts >= max_calls:
                break
            req = dict(packet["request"])
            req["model"] = model["id"]  # never trust packet's model choice
            req["provider"] = {"allow_fallbacks": False}
            body = json.dumps(req, separators=(",", ":"),ensure_ascii=False).encode()
            reserve = reserve_cost(body, Decimal(model["price_usd_per_input_token"]))
            fingerprint = hashlib.sha256(body).hexdigest()
            unique_key = hashlib.sha256((packet["case_id"]+"\0"+model["id"]+"\0"+fingerprint).encode()).hexdigest()
            with locked_ledger(ledger_path) as (ledger, save):
                if ledger.get("halted"):
                    raise Refused("A charge above its reservation is recorded; paid runs stay stopped until the owner reviews the ledger.")
                if any(item.get("call_identity") == unique_key for item in ledger["entries"]):
                    results.append({"case_id":packet["case_id"],"model":model["id"],"status":"SKIPPED_DUPLICATE"})
                    continue
                if committed_plus_reserved(ledger) + reserve > MAX_ADDITIONAL_USD:
                    return {"status": "STOPPED_BUDGET_CAP", "results": results,
                            "new_provider_calls":sum(x.get("attempted",0) for x in results)}
                entry = {"call_identity":unique_key,"case_id":packet["case_id"],
                         "model":model["id"],"reserved_usd":str(reserve),
                         "final_usd":None,"status":"RESERVED_UNCONFIRMED",
                         "http_status":None,"response_id":None}
                ledger["entries"].append(entry)
                save()  # durable before paid boundary; retained on crash or ambiguity
                attempts += 1
                started = time.monotonic()
                try:
                    status, body_result, limit_source = transport.decide(body)
                except (OSError, ValueError, URLError, TimeoutError):
                    status, body_result, limit_source = 0, None, None
                latency = round((time.monotonic()-started)*1000)
                entry["http_status"] = status
                entry["latency_ms"] = latency
                entry["limit_source"] = limit_source
                if status == 200 and isinstance(body_result, dict):
                    # Settle what the provider says it charged, whatever the answers look like; with no usable
                    # figure (the API marks usage.cost optional) the conservative reservation stays the spend.
                    reported = reported_cost(body_result)
                    entry["final_usd"] = str(reserve if reported is None else reported)
                    entry["cost_source"] = ("RESERVED_NO_PROVIDER_COST" if reported is None
                                            else "PROVIDER_USAGE_COST")
                    if isinstance(body_result.get("model"), str):
                        entry["response_model"] = body_result["model"][:120]
                    if reported is not None and reported > reserve:
                        # A charge above its reservation means the bound was wrong: stop every later paid run too.
                        entry["status"] = "COST_ABOVE_RESERVATION"
                        ledger["halted"] = {"reason": "COST_ABOVE_RESERVATION", "case_id": packet["case_id"],
                                            "model": model["id"], "reserved_usd": str(reserve),
                                            "reported_usd": str(reported)}
                    else:
                        try:
                            if not isinstance(body_result.get("id"), str) or not isinstance(body_result.get("answers"), dict):
                                raise ValueError("Reply has no id or answers.")
                            cleaned = typed_decisions(body_result["answers"])
                            if not answers_match_questions(cleaned, req.get("questions")):
                                raise ValueError("Reply does not answer every question asked, in its type.")
                            entry["status"] = "OK"
                            entry["response_id"] = body_result["id"][:200]
                            entry["typed_answers"] = cleaned
                        except (ValueError, KeyError, TypeError):
                            entry["status"] = "INVALID_RESPONSE_BILLABLE"
                else:
                    entry["status"] = ("INVALID_RESPONSE_UNCONFIRMED" if status == 200
                                       else "HTTP_ERROR" if status
                                       else "NETWORK_OR_PROVIDER_ERROR")
                save()
                results.append({"case_id":packet["case_id"],"model":model["id"],
                                "status":entry["status"],"http_status":status,
                                "latency_ms":latency,"attempted":1,
                                "response_id":entry["response_id"],
                                "typed_answers":entry.get("typed_answers"),
                                "cost_usd":entry["final_usd"]})
                if entry["status"] != "OK":
                    return {"status":"STOPPED_PROVIDER_FAILURE", "results":results,
                            "new_provider_calls":sum(x.get("attempted",0) for x in results)}
        if attempts >= max_calls:
            break
    with locked_ledger(ledger_path) as (ledger, save):
        remaining = MAX_ADDITIONAL_USD-committed_plus_reserved(ledger)
    return {"status":"DONE_BOUNDED", "results":results,
            "new_provider_calls":sum(x.get("attempted",0) for x in results),
            "remaining_eval_cap_usd":str(remaining)}


def export_askrigor(ledger_path: Path, output: Path):
    """Export stored, version-separated Noul decisions to AskRigor's offline scorer.
    Existing known responses only: no request to OpenRouter is made.
    """
    with locked_ledger(ledger_path) as (ledger, save):
        entries = ledger["entries"]
        rows = []
        for item in entries:
            answers = item.get("typed_answers") or {}
            flags = sorted(
                key for key, value in answers.items()
                if isinstance(value, dict) and
                ((type(value.get("noul")) is bool and value["noul"]) or
                 (type(value.get("noul")) in (int,float) and value["noul"] >= 0.5))
            )
            rows.append({
                "case_id": item["case_id"], "model": "jev",
                "model_version": item["model"],
                "status": "OK" if item.get("status") == "OK" else "ERROR",
                "flags": flags if item.get("status") == "OK" else [],
                "response_id": item.get("response_id"),
                "fallback_identity": item["call_identity"] if item.get("status") != "OK" else None,
                "latency_ms": item.get("latency_ms"),
                "cost_usd": item.get("final_usd"),
            })
    if not output.parent.is_dir() or output.parent.is_symlink():
        raise Refused("A private existing output folder is required.")
    if output.parent.stat().st_mode & stat.S_IWOTH:
        raise Refused("Cannot save private model results in a world-writable directory.")
    if output.exists():
        raise Refused("Never overwrite a potentially audited model result file.")
    fd = os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"w",encoding="utf-8") as stream:
        for row in rows:
            stream.write(json.dumps(row,sort_keys=True)+"\n")
    return {"exported":len(rows),"provider_calls":0,"path":str(output)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("discover","status","run","export-askrigor"))
    parser.add_argument("--out",type=Path,help="Private existing directory destination, for offline export")
    parser.add_argument("--packets",type=Path)
    parser.add_argument("--ledger",type=Path,default=CANONICAL_LEDGER)
    parser.add_argument("--compare-legacy",action="store_true")
    parser.add_argument("--max-calls", type=int, default=MAX_ATTEMPTS_PER_INVOCATION,
                        help=f"paid calls allowed in this run, 1-{MAX_CALLS_CEILING}; the run still stops at the first failure")
    route = parser.add_mutually_exclusive_group()
    route.add_argument("--key-file", type=Path, help="owner-only file holding an OpenRouter key (never printed)")
    route.add_argument("--via-mission-control", metavar="HOST:CONTAINER",
                       help="sign requests inside Mission Control's container with the key configured there")
    args = parser.parse_args()
    try:
        if args.action == "run" and args.ledger.resolve() != CANONICAL_LEDGER.resolve():
            raise Refused("Every paid evaluation must use the single canonical owner-approved USD 1.00 ledger.")
        if args.action == "status":
            with locked_ledger(args.ledger) as (ledger,save):
                total=committed_plus_reserved(ledger)
                result={"cap_usd":str(MAX_ADDITIONAL_USD),
                        "conservative_spent_usd":str(total),
                        "remaining_usd":str(MAX_ADDITIONAL_USD-total),
                        "attempts":len(ledger["entries"]),
                        "last_seen_latest":ledger.get("last_seen_latest")}
        elif args.action == "export-askrigor":
            if args.out is None:
                raise Refused("Offline AskRigor export requires --out.")
            result = export_askrigor(args.ledger,args.out)
        else:
            models = discover()
            latest = latest_eligible(models)
            with locked_ledger(args.ledger) as (ledger,save):
                old = ledger.get("last_seen_latest")
                ledger["last_seen_latest"] = latest["id"]
                ledger["last_discovery"] = {"catalog":CATALOG,"models":models}
                save()
            if args.action == "discover":
                result = {"previous_model":old,
                          "runtime_pinned_model": "typesafe/jev-1.13",
                          "latest_catalog_model": models[0]["id"],
                          "latest_eligible_model": latest["id"],
                          "upgrade_available": latest["id"] != "typesafe/jev-1.13",
                          "new_version_detected":old is not None and old != latest["id"],
                          "models":models, "paid_calls":0,"cap_usd":str(MAX_ADDITIONAL_USD)}
            else:
                if args.packets is None:
                    raise Refused("Paid run requires --packets with deidentified, frozen cases.")
                transport = (MissionControlTransport(args.via_mission_control)
                             if args.via_mission_control else None)
                result = run(load_packets(args.packets),args.ledger,
                             models=models,compare_legacy=args.compare_legacy,
                             transport=transport, max_calls=args.max_calls,
                             key_file=args.key_file)
        print(json.dumps(result,sort_keys=True))
    except (Refused,FileNotFoundError,ValueError,HTTPError,URLError) as error:
        print(json.dumps({"status":"REFUSED","reason":str(error)[:200],
                          "new_provider_calls":0}),file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
