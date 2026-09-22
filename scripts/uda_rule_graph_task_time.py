#!/usr/bin/env python3
"""Deterministic source-bound rule graph compiler for UDA task-time activation."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "rules" / "rule-graph" / "task-time-metadata.v1.json"
DEFAULT_PROFILE = ROOT / "scripts" / "instruction-layering-profile.json"
PHASES = ["retrieval", "reasoning", "pre-action", "handoff", "persistence", "publication", "final-delivery"]


class RuleGraphError(RuntimeError):
    def __init__(self, code: str, message: str, detail: Any = None):
        super().__init__(message)
        self.code = code
        self.detail = detail


TRUE, FALSE, UNKNOWN = "TRUE", "FALSE", "UNKNOWN"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def git(*args: str) -> str:
    p = subprocess.run(["git", "-C", str(ROOT), *args], text=True, capture_output=True)
    if p.returncode:
        raise RuleGraphError("GIT_UNAVAILABLE", p.stderr.strip() or "git failed", list(args))
    return p.stdout.strip()


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuleGraphError("FILE_NOT_FOUND", str(path)) from exc
    except json.JSONDecodeError as exc:
        raise RuleGraphError("INVALID_JSON", f"{path}: {exc}") from exc


def safe_path(relative: str) -> Path:
    raw = Path(relative)
    if raw.is_absolute() or ".." in raw.parts:
        raise RuleGraphError("UNSAFE_SOURCE_PATH", relative)
    root = ROOT.resolve()
    try:
        resolved = (ROOT / raw).resolve(strict=True)
    except FileNotFoundError as exc:
        raise RuleGraphError("SOURCE_NOT_FOUND", relative) from exc
    if root != resolved and root not in resolved.parents:
        raise RuleGraphError("SOURCE_PATH_ESCAPE", relative)
    if not resolved.is_file():
        raise RuleGraphError("SOURCE_NOT_FILE", relative)
    return resolved


def source_lock(rule: dict[str, Any]) -> dict[str, Any]:
    path = safe_path(rule["source"]["path"])
    body = path.read_text(encoding="utf-8")
    parts = []
    for i, selector in enumerate(rule["source"]["selectors"]):
        if selector.get("kind") != "exact_text" or not isinstance(selector.get("text"), str):
            raise RuleGraphError("INVALID_SELECTOR", f"{rule['rule_id']} selector {i}")
        text = selector["text"]
        count = body.count(text)
        if count != 1:
            raise RuleGraphError("SOURCE_SELECTOR_CARDINALITY", f"{rule['rule_id']} selector {i} matched {count}", {"path": rule["source"]["path"]})
        parts.append(text)
    extracted = "\n\n".join(parts)
    rel = rule["source"]["path"]
    blob = git("hash-object", rel)
    head = git("rev-parse", "HEAD")
    clean = subprocess.run(["git", "-C", str(ROOT), "diff", "--quiet", "HEAD", "--", rel]).returncode == 0
    return {
        "path": rel,
        "selectors": rule["source"]["selectors"],
        "repository_revision": head if clean else f"WORKTREE:{blob}",
        "git_blob_sha1": blob,
        "extracted_utf8_bytes": len(extracted.encode()),
        "extracted_sha256": sha256(extracted.encode()),
        "extracted_text": extracted,
    }


def validate_trigger(expr: Any, where: str) -> None:
    if not isinstance(expr, dict) or not expr:
        raise RuleGraphError("INVALID_TRIGGER", where)
    if "all" in expr or "any" in expr:
        op = "all" if "all" in expr else "any"
        if set(expr) != {op} or not isinstance(expr[op], list) or not expr[op]:
            raise RuleGraphError("INVALID_TRIGGER", f"{where}.{op}")
        for i, child in enumerate(expr[op]):
            validate_trigger(child, f"{where}.{op}[{i}]")
        return
    if "not" in expr:
        if set(expr) != {"not"}:
            raise RuleGraphError("INVALID_TRIGGER", f"{where}.not")
        validate_trigger(expr["not"], f"{where}.not")
        return
    if not isinstance(expr.get("fact"), str):
        raise RuleGraphError("INVALID_TRIGGER", f"{where}.fact")
    ops = set(expr) - {"fact"}
    if len(ops) != 1 or next(iter(ops)) not in {"eq", "in", "contains", "present"}:
        raise RuleGraphError("UNSUPPORTED_TRIGGER_OPERATOR", where)
    op = next(iter(ops))
    if op == "in" and not isinstance(expr[op], list):
        raise RuleGraphError("INVALID_TRIGGER", f"{where}.in")
    if op == "present" and not isinstance(expr[op], bool):
        raise RuleGraphError("INVALID_TRIGGER", f"{where}.present")


def role_closure(profile: dict[str, Any], role: str) -> set[str]:
    roles = profile["roles"]
    result: set[str] = set()
    stack = [role]
    while stack:
        item = stack.pop()
        if item in result:
            continue
        result.add(item)
        stack.extend(roles.get(item, {}).get("inherits", []))
    return result


def assert_acyclic(graph: dict[str, list[str]], code: str) -> None:
    active: set[str] = set()
    done: set[str] = set()
    def visit(node: str, trail: list[str]) -> None:
        if node in active:
            start = trail.index(node)
            raise RuleGraphError(code, " -> ".join(trail[start:] + [node]))
        if node in done:
            return
        active.add(node)
        trail.append(node)
        for target in graph.get(node, []):
            visit(target, trail)
        trail.pop()
        active.remove(node)
        done.add(node)
    for node in sorted(graph):
        visit(node, [])


def validate(catalog: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    if catalog.get("schema_version") != 1 or catalog.get("status") not in {"CANDIDATE", "CURRENT", "HISTORICAL", "REVIEWED_METADATA_NOT_NORMATIVE_AUTHORITY"}:
        raise RuleGraphError("INVALID_CATALOG", "catalog version/status")
    roles = profile.get("roles")
    if not isinstance(roles, dict) or not roles:
        raise RuleGraphError("INVALID_ROLE_PROFILE", "missing roles")
    assert_acyclic({k: v.get("inherits", []) for k, v in roles.items()}, "INHERITANCE_CYCLE")
    rules = catalog.get("rules", catalog.get("records"))
    if not isinstance(rules, list) or not rules:
        raise RuleGraphError("EMPTY_RULE_CATALOG", "no rules")
    by_id: dict[str, dict[str, Any]] = {}
    locks: dict[str, dict[str, Any]] = {}
    for rule in rules:
        rid = rule.get("rule_id")
        if not isinstance(rid, str) or not re.fullmatch(r"[a-z0-9][a-z0-9._-]+", rid):
            raise RuleGraphError("INVALID_RULE_ID", str(rid))
        if rid in by_id:
            raise RuleGraphError("DUPLICATE_RULE_ID", rid)
        if rule.get("status") not in {"CANDIDATE", "CURRENT", "HISTORICAL"} or not isinstance(rule.get("revision"), int):
            raise RuleGraphError("INVALID_RULE_STATE", rid)
        validate_trigger(rule.get("trigger"), rid)
        for role in rule.get("applies_to", {}).get("roles", []):
            if role not in roles:
                raise RuleGraphError("UNKNOWN_RULE_ROLE", f"{rid}:{role}")
        obligations = rule.get("obligations")
        if not isinstance(obligations, list) or not obligations:
            raise RuleGraphError("MISSING_OBLIGATIONS", rid)
        seen = set()
        for ob in obligations:
            oid = ob.get("obligation_id")
            if not isinstance(oid, str) or oid in seen:
                raise RuleGraphError("INVALID_OBLIGATION", f"{rid}:{oid}")
            seen.add(oid)
            if ob.get("due_phase") not in PHASES:
                raise RuleGraphError("INVALID_DUE_PHASE", f"{rid}:{ob.get('due_phase')}")
            if ob.get("enforcement") not in {"mechanical", "semantic", "owner-evaluated", "unobserved"}:
                raise RuleGraphError("INVALID_ENFORCEMENT", f"{rid}:{oid}")
            if ob.get("enforcement") != "mechanical" and ob.get("mechanical_check") is not None:
                raise RuleGraphError("NONMECHANICAL_CHECK_DECLARED", f"{rid}:{oid}")
        by_id[rid] = rule
        locks[rid] = source_lock(rule)
    for rid, rule in by_id.items():
        for rel in rule.get("relations", []):
            if rel.get("type") not in {"requires", "supersedes", "conflicts_with", "related_to"}:
                raise RuleGraphError("INVALID_RELATION_TYPE", f"{rid}:{rel}")
            if rel.get("rule_id") not in by_id:
                raise RuleGraphError("DANGLING_RELATION", f"{rid}:{rel.get('rule_id')}")
    assert_acyclic({rid: [r["rule_id"] for r in rule.get("relations", []) if r["type"] == "supersedes"] for rid, rule in by_id.items()}, "SUPERSESSION_CYCLE")
    return {"by_id": by_id, "locks": locks}


def fact(facts: dict[str, Any], name: str) -> dict[str, Any]:
    item = facts.get(name)
    if item is None:
        return {"state": "UNKNOWN", "provenance": "missing"}
    if not isinstance(item, dict) or item.get("state") not in {"KNOWN", "ABSENT", "UNKNOWN"}:
        raise RuleGraphError("INVALID_FACT", name)
    if item["state"] == "KNOWN" and "value" not in item:
        raise RuleGraphError("INVALID_FACT", f"{name}:known-without-value")
    return item


def tri_not(v: str) -> str:
    return UNKNOWN if v == UNKNOWN else (FALSE if v == TRUE else TRUE)


def tri_all(values: list[str]) -> str:
    return FALSE if FALSE in values else (UNKNOWN if UNKNOWN in values else TRUE)


def tri_any(values: list[str]) -> str:
    return TRUE if TRUE in values else (UNKNOWN if UNKNOWN in values else FALSE)


def evaluate(expr: dict[str, Any], facts: dict[str, Any]) -> str:
    if "all" in expr:
        return tri_all([evaluate(x, facts) for x in expr["all"]])
    if "any" in expr:
        return tri_any([evaluate(x, facts) for x in expr["any"]])
    if "not" in expr:
        return tri_not(evaluate(expr["not"], facts))
    item = fact(facts, expr["fact"])
    op = next(k for k in expr if k != "fact")
    expected = expr[op]
    if op == "present":
        if item["state"] == "UNKNOWN":
            return UNKNOWN
        return TRUE if (item["state"] == "KNOWN") == expected else FALSE
    if item["state"] == "UNKNOWN":
        return UNKNOWN
    if item["state"] == "ABSENT":
        return FALSE
    value = item["value"]
    if op == "eq":
        return TRUE if value == expected else FALSE
    if op == "in":
        return TRUE if value in expected else FALSE
    if op == "contains":
        return TRUE if isinstance(value, (list, str)) and expected in value else FALSE
    raise RuleGraphError("UNSUPPORTED_TRIGGER_OPERATOR", op)


def scope(rule: dict[str, Any], envelope: dict[str, Any], profile: dict[str, Any]) -> str:
    facts = envelope["facts"]
    app = rule.get("applies_to", {})
    checks: list[str] = []
    if app.get("roles"):
        item = fact(facts, "role")
        checks.append(UNKNOWN if item["state"] == "UNKNOWN" else FALSE if item["state"] == "ABSENT"
                      else TRUE if role_closure(profile, str(item["value"])).intersection(app["roles"]) else FALSE)
    for field, name, plural in [("actors", "actor", False), ("destinations", "destination", False), ("action_classes", "action_classes", True)]:
        if not app.get(field):
            continue
        item = fact(facts, name)
        if item["state"] == "UNKNOWN":
            checks.append(UNKNOWN)
        elif item["state"] == "ABSENT":
            checks.append(FALSE)
        elif plural:
            values = item["value"] if isinstance(item["value"], list) else [item["value"]]
            checks.append(TRUE if set(values).intersection(app[field]) else FALSE)
        else:
            checks.append(TRUE if item["value"] in app[field] else FALSE)
    return tri_all(checks) if checks else TRUE


def applicability(rule: dict[str, Any], envelope: dict[str, Any], profile: dict[str, Any]) -> str:
    return tri_all([scope(rule, envelope, profile), evaluate(rule["trigger"], envelope["facts"])])


def order_rules(selected: set[str], by_id: dict[str, dict[str, Any]]) -> list[str]:
    emitted, active, ordered = set(), set(), []
    def visit(rid: str) -> None:
        if rid in emitted or rid in active:
            return
        active.add(rid)
        for rel in sorted(by_id[rid].get("relations", []), key=lambda x: (x["type"], x["rule_id"])):
            if rel["type"] == "requires" and rel["rule_id"] in selected:
                visit(rel["rule_id"])
        active.remove(rid)
        emitted.add(rid)
        ordered.append(rid)
    for rid in sorted(selected):
        visit(rid)
    return ordered


def render(envelope: dict[str, Any], rules: list[dict[str, Any]], unresolved: list[dict[str, Any]]) -> str:
    lines = [
        "# Active Lesson Contract — graph projection",
        "",
        f"Task: {envelope.get('task_id', 'unknown')}",
        "Projection owner: existing Active Lesson Contract lifecycle",
        "",
        "## Active lessons",
    ]
    for rule in rules:
        lines += [
            "",
            f"### {rule['rule_id']} @ r{rule['revision']}",
            f"- Source: {rule['source']['path']} · blob {rule['source']['git_blob_sha1']} · extracted sha256 {rule['source']['extracted_sha256']}",
            f"- Authority: {rule['authority_owner']} / {rule['authority_domain']}",
            "- Exact operative source:",
            "",
            rule["source_text"],
            "",
        ]
        for ob in rule["obligations"]:
            lines += [
                f"- Obligation {ob['obligation_id']}",
                f"  - Required behavior: {ob['required_behavior']}",
                f"  - Due: {ob['due_phase']} -> {ob['destination']}",
                f"  - Acceptance evidence: {ob['acceptance_evidence']}",
                f"  - Non-substitutes: {'; '.join(ob['non_substitutes']) or 'none'}",
                f"  - Carry-through: {ob['carry_through']}",
                f"  - Repair: {ob['repair']}",
                f"  - Enforcement: {ob['enforcement']}",
            ]
    if unresolved:
        lines += ["", "## Unresolved applicability", json.dumps(unresolved, sort_keys=True)]
    return "\n".join(lines).rstrip() + "\n"


def compile_contract(catalog: dict[str, Any], profile: dict[str, Any], envelope: dict[str, Any], mode: str) -> dict[str, Any]:
    state = validate(catalog, profile)
    by_id, locks = state["by_id"], state["locks"]
    if envelope.get("schema_version") != 1 or not isinstance(envelope.get("facts"), dict):
        raise RuleGraphError("INVALID_TASK_ENVELOPE", "schema_version=1 and facts required")
    evaluations, direct, unresolved = {}, set(), []
    for rid, rule in sorted(by_id.items()):
        if rule["status"] != "CURRENT":
            continue
        value = applicability(rule, envelope, profile)
        evaluations[rid] = value
        if value == TRUE:
            direct.add(rid)
        elif value == UNKNOWN:
            unresolved.append({"rule_id": rid, "reason": "UNKNOWN_APPLICABILITY"})
    reasons: dict[str, list[dict[str, Any]]] = defaultdict(list)
    if mode == "legacy":
        selected = set(envelope.get("legacy_rule_ids", []))
        unknown = selected - set(by_id)
        if unknown:
            raise RuleGraphError("UNKNOWN_LEGACY_RULE", ",".join(sorted(unknown)))
        for rid in selected:
            reasons[rid].append({"kind": "legacy", "path": [rid]})
    else:
        selected = set(direct)
        for rid in direct:
            reasons[rid].append({"kind": "trigger", "path": [rid]})
        if mode == "graph":
            q = deque(sorted(selected))
            while q:
                rid = q.popleft()
                for rel in by_id[rid].get("relations", []):
                    if rel["type"] != "requires":
                        continue
                    target = rel["rule_id"]
                    target_scope = scope(by_id[target], envelope, profile)
                    if target_scope == FALSE:
                        raise RuleGraphError("REQUIRED_RULE_OUT_OF_SCOPE", f"{rid}->{target}")
                    if target_scope == UNKNOWN:
                        unresolved.append({"rule_id": target, "reason": "UNKNOWN_REQUIRED_SCOPE", "required_by": rid})
                        continue
                    if target not in selected:
                        selected.add(target)
                        q.append(target)
                    reasons[target].append({"kind": "requires", "from": rid, "path": [rid, target], "supplies": rel.get("supplies", [])})
    for rid in list(selected):
        for rel in by_id[rid].get("relations", []):
            if rel["type"] == "supersedes" and rel["rule_id"] in selected:
                selected.remove(rel["rule_id"])
                reasons[rid].append({"kind": "supersedes", "replaces": rel["rule_id"]})
    for rid in selected:
        for rel in by_id[rid].get("relations", []):
            if rel["type"] == "conflicts_with" and rel["rule_id"] in selected and rid < rel["rule_id"]:
                unresolved.append({"reason": "UNRESOLVED_CONFLICT", "left": rid, "right": rel["rule_id"]})
    out_rules = []
    for rid in order_rules(selected, by_id):
        rule, lock = by_id[rid], locks[rid]
        out_rules.append({
            "rule_id": rid,
            "revision": rule["revision"],
            "authority_owner": rule["authority_owner"],
            "authority_domain": rule["authority_domain"],
            "source": {k: lock[k] for k in ["path", "repository_revision", "git_blob_sha1", "extracted_utf8_bytes", "extracted_sha256"]},
            "source_text": lock["extracted_text"],
            "obligations": rule["obligations"],
            "explanation": reasons.get(rid, []),
        })
    rendered = render(envelope, out_rules, unresolved)
    deterministic = {
        "schema_version": 1,
        "catalog_schema_version": catalog["schema_version"],
        "mode": mode,
        "task_id": envelope.get("task_id"),
        "selected_rules": out_rules,
        "unresolved": sorted(unresolved, key=canonical),
        "rendered_contract": rendered,
    }
    return {
        **deterministic,
        "content_sha256": sha256(canonical(deterministic).encode()),
        "usable": not unresolved,
        "direct_evaluations": evaluations,
        "legacy_covered_sources": catalog.get("legacy_covered_sources", []),
    }


def build_lock(catalog: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    state = validate(catalog, profile)
    entries = [{"rule_id": rid, **{k: v for k, v in lock.items() if k != "extracted_text"}}
               for rid, lock in sorted(state["locks"].items())]
    base = {
        "schema_version": 1,
        "catalog_sha256": sha256(canonical(catalog).encode()),
        "compiler_sha256": sha256(Path(__file__).read_bytes()),
        "entries": entries,
    }
    return {**base, "content_sha256": sha256(canonical(base).encode())}


def check_contract(contract: dict[str, Any], phase: str, payload: str) -> dict[str, Any]:
    results = []
    for rule in contract.get("selected_rules", []):
        for ob in rule.get("obligations", []):
            if ob.get("due_phase") != phase:
                continue
            if ob.get("enforcement") != "mechanical":
                results.append({"rule_id": rule["rule_id"], "obligation_id": ob["obligation_id"], "status": "UNKNOWN", "reason": f"{ob.get('enforcement')} is not mechanically certifiable"})
                continue
            check = ob.get("mechanical_check")
            if not check:
                results.append({"rule_id": rule["rule_id"], "obligation_id": ob["obligation_id"], "status": "UNKNOWN", "reason": "no predicate"})
                continue
            kind = check["kind"]
            if kind == "final_timestamp_first_line":
                first = payload.splitlines()[0] if payload.splitlines() else ""
                ok = bool(re.search(r"\b\d{4}-\d{2}-\d{2}\b.*\b\d{1,2}:\d{2}\b.*(?:UTC|GMT|[+-]\d{2}:?\d{2}|[A-Z][A-Za-z_]+/[A-Za-z_]+)", first))
                evidence = first
            elif kind == "contains_literal":
                evidence = check.get("value", "")
                ok = bool(evidence) and evidence in payload
            elif kind == "nonempty":
                evidence = f"{len(payload.encode())} bytes"
                ok = bool(payload.strip())
            else:
                results.append({"rule_id": rule["rule_id"], "obligation_id": ob["obligation_id"], "status": "UNKNOWN", "reason": f"unsupported predicate {kind}"})
                continue
            results.append({"rule_id": rule["rule_id"], "obligation_id": ob["obligation_id"], "status": "PASS" if ok else "FAIL", "evidence": evidence})
    admitted = not contract.get("unresolved") and all(x["status"] in {"PASS", "NOT_APPLICABLE"} for x in results)
    return {"schema_version": 1, "phase": phase, "results": results, "admission": "ADMITTED" if admitted else "BLOCKED"}


def impact(catalog: dict[str, Any], profile: dict[str, Any], paths: list[str]) -> dict[str, Any]:
    state = validate(catalog, profile)
    by_id = state["by_id"]
    direct = {rid for rid, rule in by_id.items() if rule["source"]["path"] in paths}
    reverse: dict[str, set[str]] = defaultdict(set)
    for rid, rule in by_id.items():
        for rel in rule.get("relations", []):
            if rel["type"] == "requires":
                reverse[rel["rule_id"]].add(rid)
    affected = set(direct)
    q = deque(sorted(direct))
    while q:
        node = q.popleft()
        for dep in reverse.get(node, set()):
            if dep not in affected:
                affected.add(dep)
                q.append(dep)
    return {
        "schema_version": 1,
        "changed_paths": sorted(set(paths)),
        "direct_rules": sorted(direct),
        "affected_rules": sorted(affected),
        "consumers": ["repository compiler", "Active Lesson Contract export", "Mission Control Work handoff adapter"] if affected else [],
        "cache_invalidation_required": bool(affected),
    }


def emit(path: str | None, value: Any) -> None:
    data = json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    if path:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(data, encoding="utf-8")
    else:
        sys.stdout.write(data)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default=str(DEFAULT_CATALOG))
    parser.add_argument("--profile", default=str(DEFAULT_PROFILE))
    sub = parser.add_subparsers(dest="command", required=True)
    v = sub.add_parser("validate"); v.add_argument("--write-lock")
    for name in ["compile", "explain"]:
        p = sub.add_parser(name); p.add_argument("--task", required=True); p.add_argument("--mode", choices=["legacy", "flat", "graph"], default="graph"); p.add_argument("--output")
    c = sub.add_parser("check"); c.add_argument("--contract", required=True); c.add_argument("--phase", choices=PHASES, required=True); c.add_argument("--payload", required=True); c.add_argument("--output")
    i = sub.add_parser("impact"); i.add_argument("paths", nargs="+"); i.add_argument("--output")
    x = sub.add_parser("compare"); x.add_argument("--task", required=True); x.add_argument("--output")
    args = parser.parse_args()
    catalog, profile = read_json(Path(args.catalog)), read_json(Path(args.profile))
    if args.command == "validate":
        state, lock = validate(catalog, profile), build_lock(catalog, profile)
        if args.write_lock: emit(args.write_lock, lock)
        emit(None, {"status": "STRUCTURE_VALIDATED", "rule_count": len(state["by_id"]), "source_lock_sha256": lock["content_sha256"], "legacy_covered_sources": catalog.get("legacy_covered_sources", [])})
        return 0
    if args.command in {"compile", "explain"}:
        contract = compile_contract(catalog, profile, read_json(Path(args.task)), args.mode)
        if args.command == "explain":
            selected = {r["rule_id"] for r in contract["selected_rules"]}
            value = {
                "schema_version": 1, "task_id": contract["task_id"], "mode": contract["mode"], "usable": contract["usable"],
                "selected": [{"rule_id": r["rule_id"], "why": r["explanation"], "source": r["source"]} for r in contract["selected_rules"]],
                "omitted": [{"rule_id": rid, "disposition": state} for rid, state in sorted(contract["direct_evaluations"].items()) if rid not in selected],
                "unresolved": contract["unresolved"], "content_sha256": contract["content_sha256"],
            }
        else:
            value = contract
        emit(args.output, value)
        return 0 if value.get("usable", True) else 3
    if args.command == "check":
        result = check_contract(read_json(Path(args.contract)), args.phase, Path(args.payload).read_text(encoding="utf-8"))
        emit(args.output, result)
        return 0 if result["admission"] == "ADMITTED" else 4
    if args.command == "impact":
        emit(args.output, impact(catalog, profile, args.paths)); return 0
    if args.command == "compare":
        task = read_json(Path(args.task))
        variants = {mode: compile_contract(catalog, profile, task, mode) for mode in ["legacy", "flat", "graph"]}
        ids = {mode: {r["rule_id"] for r in value["selected_rules"]} for mode, value in variants.items()}
        emit(args.output, {
            "schema_version": 1, "task_id": task.get("task_id"),
            "routes": {mode: {
                "selected_rule_ids": [r["rule_id"] for r in value["selected_rules"]],
                "selected_rule_count": len(value["selected_rules"]),
                "rendered_utf8_bytes": len(value["rendered_contract"].encode()),
                "unresolved_count": len(value["unresolved"]),
                "content_sha256": value["content_sha256"],
            } for mode, value in variants.items()},
            "graph_added_over_flat": sorted(ids["graph"] - ids["flat"]),
            "graph_missing_from_legacy": sorted(ids["legacy"] - ids["graph"]),
        }); return 0
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuleGraphError as exc:
        sys.stderr.write(json.dumps({"status": "RULE_GRAPH_ERROR", "code": exc.code, "message": str(exc), "detail": exc.detail}, sort_keys=True) + "\n")
        raise SystemExit(2)
