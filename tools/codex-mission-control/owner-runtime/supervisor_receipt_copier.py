#!/usr/bin/env python3
"""Deterministically copy bound ChatGPT supervisor/Work machine receipts to GitHub.

This owner-runtime bridge performs no task reasoning. It reads completed provider
threads through the app-owned read_thread surface, validates the machine block
against durable Mission Control events, and publishes those exact bytes with the
owner's existing authenticated `gh` credential. It never asks the owner to relay
content and never retries a semantic provider request.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import shlex
import subprocess
import time
from typing import Any, Iterable

V6_ROUTE_PREFIX = "MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V6\n"
DECISION_PREFIX = "MISSION_CONTROL_CANONICAL_DECISION_V1\n"
WORK_RECEIPT_PREFIX = "MISSION_CONTROL_WORK_CLOUD_EXECUTION_RECEIPT_V1\n"
PROVIDER_SESSION_SUMMARY = "MISSION_CONTROL_PROVIDER_SESSION_V1"
IN_BAND_PRE_SEND_SUMMARY = "MISSION_CONTROL_IN_BAND_REQUEST_BINDING_PRE_SEND_V1"
IN_BAND_PROVENANCE = "IN_BAND_REQUEST_BINDING_GITHUB_OBSERVED"


class CopierError(RuntimeError):
    pass


@dataclasses.dataclass(frozen=True)
class DecisionCandidate:
    sequence: int
    worker: str
    request_id: str
    thread_id: str
    provider_session_id: str
    route: dict[str, Any]
    pre_send_refs: list[str]


@dataclasses.dataclass(frozen=True)
class WorkCandidate:
    sequence: int
    dispatch_id: str
    thread_id: str
    request: dict[str, Any]
    result: dict[str, Any]


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def event_id(event: dict[str, Any]) -> str:
    return str(event.get("eventId") or event.get("event_id") or "")


def event_sequence(event: dict[str, Any]) -> int:
    value = event.get("sequence")
    return int(value) if isinstance(value, int) else -1


def event_data(event: dict[str, Any]) -> dict[str, Any]:
    value = event.get("data")
    return value if isinstance(value, dict) else {}


def ref_value(refs: Iterable[Any], prefix: str) -> str | None:
    matches = [value[len(prefix):] for value in refs if isinstance(value, str) and value.startswith(prefix)]
    if len(matches) > 1:
        raise CopierError(f"duplicate receipt ref for {prefix.rstrip(':')}")
    return matches[0] if matches else None


def parse_iso(value: str) -> dt.datetime:
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise CopierError(f"invalid timestamp: {value}") from exc
    if parsed.tzinfo is None:
        raise CopierError(f"timestamp lacks offset: {value}")
    return parsed.astimezone(dt.timezone.utc)


def parse_v6_route(body: Any) -> dict[str, Any] | None:
    if not isinstance(body, str) or not body.startswith(V6_ROUTE_PREFIX):
        return None
    try:
        root = json.loads(body[len(V6_ROUTE_PREFIX):])
    except json.JSONDecodeError:
        return None
    if not isinstance(root, dict) or root.get("schemaVersion") != 6:
        return None
    return root


def refs_include(refs: Iterable[Any], exact: str) -> bool:
    return any(value == exact for value in refs)


def discover_decision_candidates(
    events: list[dict[str, Any]], *, min_sequence: int = 0, now: dt.datetime | None = None,
) -> list[DecisionCandidate]:
    now = now or dt.datetime.now(dt.timezone.utc)
    completed = {
        str(event_data(event).get("request_id"))
        for event in events
        if event_data(event).get("type") == "github_decision_receipt_ingested"
    }
    candidates: list[DecisionCandidate] = []
    for route_event in events:
        sequence = event_sequence(route_event)
        if sequence < min_sequence:
            continue
        data = event_data(route_event)
        if data.get("type") != "worker_message_recorded":
            continue
        route = parse_v6_route(data.get("body"))
        if not route:
            continue
        request_id = route.get("requestId")
        worker = route.get("worker")
        supervisor = route.get("destinationSupervisorId")
        expires = route.get("expiresAt")
        if not all(isinstance(value, str) and value for value in (request_id, worker, supervisor, expires)):
            continue
        if request_id in completed or parse_iso(expires) <= now:
            continue
        pre_send_events = []
        for event in events:
            ed = event_data(event)
            refs = ed.get("refs") if isinstance(ed.get("refs"), list) else []
            if (event_sequence(event) >= sequence
                and ed.get("type") == "evidence_receipt_recorded"
                and ed.get("summary") == IN_BAND_PRE_SEND_SUMMARY
                and ed.get("worker") == worker
                and refs_include(refs, f"request:{request_id}")
                and refs_include(refs, f"supervisor:{supervisor}")):
                pre_send_events.append(event)
        if not pre_send_events:
            continue
        pre_send = max(pre_send_events, key=event_sequence)
        pre_refs = event_data(pre_send).get("refs") or []
        provider_session_id = ref_value(pre_refs, "provider_session:")
        binding_sha = ref_value(pre_refs, "in_band_binding_sha256:")
        if not provider_session_id or not binding_sha:
            continue
        completed_sessions = []
        for event in events:
            ed = event_data(event)
            refs = ed.get("refs") if isinstance(ed.get("refs"), list) else []
            if (event_sequence(event) >= event_sequence(pre_send)
                and ed.get("type") == "evidence_receipt_recorded"
                and ed.get("summary") == PROVIDER_SESSION_SUMMARY
                and ed.get("worker") == worker
                and refs_include(refs, f"request:{request_id}")
                and refs_include(refs, f"provider_session:{provider_session_id}")
                and refs_include(refs, "session_role:IN_BAND_REQUEST_DECISION_SESSION")
                and refs_include(refs, "lifecycle_status:COMPLETE")
                and refs_include(refs, "url_binding_status:EXACT")):
                completed_sessions.append(event)
        if not completed_sessions:
            continue
        completed_session = max(completed_sessions, key=event_sequence)
        session_refs = event_data(completed_session).get("refs") or []
        conversation_url = ref_value(session_refs, "conversation_url:")
        if not conversation_url:
            continue
        match = re.fullmatch(r"https://chatgpt\.com/c/([A-Za-z0-9_-]+)", conversation_url)
        if not match:
            continue
        candidates.append(DecisionCandidate(
            sequence=sequence,
            worker=worker,
            request_id=request_id,
            thread_id=match.group(1),
            provider_session_id=provider_session_id,
            route=route,
            pre_send_refs=list(pre_refs),
        ))
    return sorted(candidates, key=lambda item: (item.sequence, item.request_id))


def discover_work_candidates(events: list[dict[str, Any]], *, min_sequence: int = 0) -> list[WorkCandidate]:
    completed = {
        str(event_data(event).get("dispatch_id"))
        for event in events
        if event_data(event).get("type") == "chatgpt_work_cloud_execution_receipt_recorded"
    }
    requests: dict[str, tuple[int, dict[str, Any]]] = {}
    results: dict[str, tuple[int, dict[str, Any]]] = {}
    for event in events:
        data = event_data(event)
        dispatch_id = data.get("dispatch_id")
        if not isinstance(dispatch_id, str) or not dispatch_id:
            continue
        if data.get("type") == "chatgpt_work_cloud_dispatch_requested":
            requests[dispatch_id] = (event_sequence(event), data)
        elif data.get("type") == "chatgpt_work_cloud_dispatch_recorded":
            current = results.get(dispatch_id)
            if not current or event_sequence(event) > current[0]:
                results[dispatch_id] = (event_sequence(event), data)
    candidates: list[WorkCandidate] = []
    for dispatch_id, (request_seq, request) in requests.items():
        if dispatch_id in completed or request_seq < min_sequence:
            continue
        result_entry = results.get(dispatch_id)
        if not result_entry:
            continue
        result_seq, result = result_entry
        thread_id = result.get("work_thread_id")
        if (result.get("status") != "READY"
            or result.get("surface_verification") != "VERIFIED_NATIVE_WORK"
            or not isinstance(thread_id, str) or not thread_id):
            continue
        candidates.append(WorkCandidate(
            sequence=max(request_seq, result_seq), dispatch_id=dispatch_id, thread_id=thread_id,
            request=request, result=result,
        ))
    return sorted(candidates, key=lambda item: (item.sequence, item.dispatch_id))


def extract_machine_block(text: str | None, prefix: str) -> tuple[str, dict[str, Any]] | None:
    if not isinstance(text, str):
        return None
    index = text.find(prefix)
    if index < 0:
        return None
    block = text[index:].strip()
    if not block.startswith(prefix):
        return None
    try:
        payload = json.loads(block[len(prefix):])
    except json.JSONDecodeError as exc:
        raise CopierError("machine receipt block is not strict JSON or has trailing prose") from exc
    if not isinstance(payload, dict):
        raise CopierError("machine receipt payload must be a JSON object")
    return block, payload


def _equal(actual: Any, expected: Any, field: str) -> None:
    if actual != expected:
        raise CopierError(f"{field} does not match durable Mission Control binding")


def validate_decision_block(block: str, payload: dict[str, Any], candidate: DecisionCandidate) -> None:
    route = candidate.route
    binding_sha = ref_value(candidate.pre_send_refs, "in_band_binding_sha256:")
    _equal(payload.get("schema_version"), 5, "schema_version")
    _equal(payload.get("envelope_kind"), "MISSION_CONTROL_CANONICAL_DECISION", "envelope_kind")
    _equal(payload.get("request_id"), candidate.request_id, "request_id")
    _equal(payload.get("supervisor_id"), route.get("destinationSupervisorId"), "supervisor_id")
    _equal(payload.get("provider_session_id"), candidate.provider_session_id, "provider_session_id")
    _equal(payload.get("nonce"), route.get("nonce"), "nonce")
    _equal(payload.get("in_band_binding_sha256"), binding_sha, "in_band_binding_sha256")
    _equal(payload.get("execution_provenance"), IN_BAND_PROVENANCE, "execution_provenance")
    _equal(payload.get("evidence_capsule"), route.get("evidenceCapsule"), "evidence_capsule")
    _equal(payload.get("owner_outcome"), route.get("ownerOutcome"), "owner_outcome")
    _equal(payload.get("reasoning_lane"), route.get("reasoningLane"), "reasoning_lane")
    _equal(payload.get("writer_contract"), {
        "mode": "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", "reinterpretation_allowed": False,
    }, "writer_contract")
    decision = payload.get("decision_block")
    if not isinstance(decision, dict) or not isinstance(decision.get("exact_text"), str) or not decision.get("exact_text"):
        raise CopierError("decision_block is incomplete")
    _equal(decision.get("sha256"), sha256_text(decision["exact_text"]), "decision_block.sha256")
    pro = payload.get("pro_decision_block")
    if route.get("reasoningLane") == "EXTRA_HIGH_DIRECT":
        _equal(pro, {"used": False, "model_mode": None, "exact_text": None, "sha256": None}, "pro_decision_block")
    elif route.get("reasoningLane") == "PRO_ESCALATED":
        if not isinstance(pro, dict) or pro.get("used") is not True or pro.get("model_mode") != "PRO":
            raise CopierError("Pro decision block does not match admitted lane")
        _equal(pro.get("exact_text"), decision.get("exact_text"), "pro_decision_block.exact_text")
        _equal(pro.get("sha256"), decision.get("sha256"), "pro_decision_block.sha256")
    else:
        raise CopierError("unsupported reasoning lane")
    if not block.startswith(DECISION_PREFIX):
        raise CopierError("decision block prefix mismatch")


def validate_work_receipt(block: str, payload: dict[str, Any], candidate: WorkCandidate) -> None:
    request = candidate.request
    allowed = {
        "schemaVersion", "dispatchId", "worker", "taskId", "directiveId", "directiveRevision",
        "status", "terminalState", "checksPassed", "checksFailed", "checksNotRun", "blockerCodes",
        "artifactSha256s",
    }
    if set(payload) != allowed:
        raise CopierError("Work receipt contains unexpected or missing fields")
    _equal(payload.get("schemaVersion"), 1, "schemaVersion")
    _equal(payload.get("dispatchId"), candidate.dispatch_id, "dispatchId")
    _equal(payload.get("worker"), request.get("worker"), "worker")
    _equal(payload.get("taskId"), request.get("task_id"), "taskId")
    _equal(payload.get("directiveId"), request.get("directive_id"), "directiveId")
    _equal(payload.get("directiveRevision"), request.get("directive_revision"), "directiveRevision")
    if payload.get("status") not in {"COMPLETED", "PARTIAL", "BLOCKED", "FAILED"}:
        raise CopierError("Work receipt status is invalid")
    terminal = payload.get("terminalState")
    if not isinstance(terminal, str) or not re.fullmatch(r"[A-Z0-9][A-Z0-9_.:-]{0,179}", terminal):
        raise CopierError("Work receipt terminalState is not privacy-safe")
    for field in ("checksPassed", "checksFailed", "checksNotRun"):
        value = payload.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise CopierError(f"{field} must be a nonnegative integer")
    blockers = payload.get("blockerCodes")
    if not isinstance(blockers, list) or len(blockers) > 50 or any(not isinstance(v, str) or not re.fullmatch(r"[A-Z0-9][A-Z0-9_.:-]{0,179}", v) for v in blockers):
        raise CopierError("blockerCodes must contain only privacy-safe codes")
    artifacts = payload.get("artifactSha256s")
    if not isinstance(artifacts, list) or len(artifacts) > 100 or any(not isinstance(v, str) or not re.fullmatch(r"[a-f0-9]{64}", v) for v in artifacts):
        raise CopierError("artifactSha256s must contain only SHA-256 values")
    if not block.startswith(WORK_RECEIPT_PREFIX):
        raise CopierError("Work receipt prefix mismatch")


@dataclasses.dataclass(frozen=True)
class Config:
    primary_ssh: str
    remote_app_root: str
    remote_env_file: str
    repository: str
    stage_issue: int
    min_sequence: int
    state_dir: pathlib.Path
    interval_seconds: float
    gh_command: str


def config_from_env() -> Config:
    def required(name: str) -> str:
        value = os.environ.get(name, "").strip()
        if not value:
            raise CopierError(f"{name} is required")
        return value
    state_dir = pathlib.Path(os.environ.get(
        "MISSION_CONTROL_COPIER_STATE_DIR", "~/.local/state/mission-control-supervisor-receipt-copier",
    )).expanduser().resolve()
    return Config(
        primary_ssh=os.environ.get("MISSION_CONTROL_COPIER_PRIMARY_SSH", "mission-control-primary").strip(),
        remote_app_root=required("MISSION_CONTROL_COPIER_REMOTE_APP_ROOT"),
        remote_env_file=required("MISSION_CONTROL_COPIER_REMOTE_ENV_FILE"),
        repository=required("MISSION_CONTROL_COPIER_REPOSITORY"),
        stage_issue=int(required("MISSION_CONTROL_COPIER_STAGE_ISSUE")),
        min_sequence=int(os.environ.get("MISSION_CONTROL_COPIER_MIN_SEQUENCE", "0")),
        state_dir=state_dir,
        interval_seconds=float(os.environ.get("MISSION_CONTROL_COPIER_INTERVAL_SECONDS", "10")),
        gh_command=os.environ.get("MISSION_CONTROL_COPIER_GH_COMMAND", "gh").strip() or "gh",
    )


def run(command: list[str], *, input_text: str | None = None, timeout: float = 60) -> str:
    completed = subprocess.run(command, input=input_text, text=True, capture_output=True, timeout=timeout)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip().replace("\n", " ")[:500]
        raise CopierError(f"command failed ({command[0]}): {detail}")
    return completed.stdout


def ssh_json(config: Config, remote_command: str, *, timeout: float = 90) -> Any:
    output = run([
        "ssh", "-o", "BatchMode=yes", "-o", "ClearAllForwardings=yes", config.primary_ssh, remote_command,
    ], timeout=timeout)
    return json.loads(output)


def fetch_events(config: Config) -> list[dict[str, Any]]:
    payload = ssh_json(config, "curl -fsS --max-time 30 http://127.0.0.1:4100/events", timeout=45)
    events = payload.get("events") if isinstance(payload, dict) else None
    if not isinstance(events, list):
        raise CopierError("Mission Control /events response is invalid")
    return [event for event in events if isinstance(event, dict)]


def read_thread(config: Config, thread_id: str) -> dict[str, Any]:
    command = (
        f"cd {shlex.quote(config.remote_app_root)} && set -a; . {shlex.quote(config.remote_env_file)}; set +a; "
        f"node_modules/.bin/tsx scripts/read-chatgpt-thread-final-message.ts --thread-id {shlex.quote(thread_id)}"
    )
    value = ssh_json(config, command, timeout=90)
    if not isinstance(value, dict):
        raise CopierError("provider thread reader returned invalid JSON")
    return value


def github_comments(config: Config, issue: int) -> list[dict[str, Any]]:
    raw = run([
        config.gh_command, "api", "--paginate", "--slurp",
        f"repos/{config.repository}/issues/{issue}/comments?per_page=100",
    ], timeout=90)
    pages = json.loads(raw)
    if not isinstance(pages, list):
        raise CopierError("GitHub comments response is invalid")
    comments: list[dict[str, Any]] = []
    for page in pages:
        if isinstance(page, list):
            comments.extend(item for item in page if isinstance(item, dict))
    return comments


def _machine_identity(body: str, prefix: str, identity_field: str) -> str | None:
    parsed = extract_machine_block(body, prefix)
    if not parsed:
        return None
    _, payload = parsed
    value = payload.get(identity_field)
    return value if isinstance(value, str) else None


def publish_exact(config: Config, *, issue: int, body: str, prefix: str, identity_field: str, identity: str) -> int:
    comments = github_comments(config, issue)
    for comment in comments:
        existing = comment.get("body")
        if not isinstance(existing, str):
            continue
        if existing == body:
            cid = comment.get("id")
            if isinstance(cid, int):
                return cid
        if _machine_identity(existing, prefix, identity_field) == identity:
            raise CopierError(f"GitHub already contains conflicting machine receipt for {identity}")
    response = json.loads(run([
        config.gh_command, "api", "--method", "POST", f"repos/{config.repository}/issues/{issue}/comments", "--input", "-",
    ], input_text=json.dumps({"body": body}), timeout=90))
    cid = response.get("id") if isinstance(response, dict) else None
    if not isinstance(cid, int):
        raise CopierError("GitHub write returned no comment ID")
    return cid


def load_state(config: Config) -> dict[str, Any]:
    config.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(config.state_dir, 0o700)
    path = config.state_dir / "state.json"
    if not path.exists():
        return {"schemaVersion": 1, "published": {}}
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schemaVersion") != 1 or not isinstance(value.get("published"), dict):
        raise CopierError("copier state is invalid")
    return value


def save_state(config: Config, state: dict[str, Any]) -> None:
    path = config.state_dir / "state.json"
    temp = config.state_dir / f"state.{os.getpid()}.tmp"
    temp.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(temp, 0o600)
    os.replace(temp, path)


def process_once(config: Config) -> dict[str, Any]:
    events = fetch_events(config)
    state = load_state(config)
    published = state["published"]
    copied: list[dict[str, Any]] = []

    for candidate in discover_decision_candidates(events, min_sequence=config.min_sequence):
        key = f"decision:{candidate.request_id}:{candidate.provider_session_id}"
        if key in published:
            continue
        thread = read_thread(config, candidate.thread_id)
        parsed = extract_machine_block(thread.get("finalAgentMessage"), DECISION_PREFIX)
        if not parsed:
            continue
        block, payload = parsed
        validate_decision_block(block, payload, candidate)
        issue = candidate.route.get("githubReceipt", {}).get("issueNumber")
        repository = candidate.route.get("githubReceipt", {}).get("repository")
        if repository != config.repository or not isinstance(issue, int):
            raise CopierError("decision target does not match configured repository")
        comment_id = publish_exact(config, issue=issue, body=block, prefix=DECISION_PREFIX,
                                   identity_field="request_id", identity=candidate.request_id)
        published[key] = {"commentId": comment_id, "sha256": sha256_text(block), "kind": "decision"}
        copied.append({"kind": "decision", "requestId": candidate.request_id, "commentId": comment_id})
        save_state(config, state)

    # Refetch after decisions because ingestion may append the Work directive/dispatch asynchronously.
    events = fetch_events(config)
    for candidate in discover_work_candidates(events, min_sequence=config.min_sequence):
        key = f"work:{candidate.dispatch_id}"
        if key in published:
            continue
        thread = read_thread(config, candidate.thread_id)
        parsed = extract_machine_block(thread.get("finalAgentMessage"), WORK_RECEIPT_PREFIX)
        if not parsed:
            continue
        block, payload = parsed
        validate_work_receipt(block, payload, candidate)
        comment_id = publish_exact(config, issue=config.stage_issue, body=block, prefix=WORK_RECEIPT_PREFIX,
                                   identity_field="dispatchId", identity=candidate.dispatch_id)
        published[key] = {"commentId": comment_id, "sha256": sha256_text(block), "kind": "work"}
        copied.append({"kind": "work", "dispatchId": candidate.dispatch_id, "commentId": comment_id})
        save_state(config, state)

    return {"status": "COPIED" if copied else "IDLE", "copied": copied, "eventCount": len(events)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    config = config_from_env()
    if config.interval_seconds <= 0:
        raise CopierError("MISSION_CONTROL_COPIER_INTERVAL_SECONDS must be positive")
    while True:
        try:
            print(json.dumps(process_once(config), sort_keys=True), flush=True)
        except Exception as exc:
            print(json.dumps({"status": "ERROR", "error": f"{type(exc).__name__}:{exc}"}), flush=True)
            if args.once:
                raise
        if args.once:
            return 0
        time.sleep(config.interval_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
