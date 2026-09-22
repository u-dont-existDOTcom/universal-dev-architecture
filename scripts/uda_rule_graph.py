#!/usr/bin/env python3
"""Validate and resolve the machine-readable UDA rule dependency graph."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

try:
    from scripts import uda_rule_graph_task_time as task_time
except ImportError:
    import uda_rule_graph_task_time as task_time

GRAPH_PATH = Path("rules/UDA-RULE-GRAPH.json")
ALLOWED_PHASES = {"retrieval", "reasoning", "action", "handoff", "persistence", "delivery", "release", "pre-action", "publication", "final-delivery"}
RELATIONS = ("requires", "inherits", "supersedes", "conflicts_with")


def load_graph(root: Path) -> dict[str, Any]:
    path = root / GRAPH_PATH
    if not path.is_file():
        raise ValueError(f"missing rule graph: {GRAPH_PATH}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid rule graph JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError("rule graph root must be an object")
    return value


def validate_graph(graph: dict[str, Any], root: Path) -> list[str]:
    errors: list[str] = []
    if graph.get("schema_version") != 1:
        errors.append("schema_version must equal 1")
    if graph.get("status") != "ROUTING_METADATA_NOT_NORMATIVE_AUTHORITY":
        errors.append("graph status must preserve non-normative routing semantics")
    nodes = graph.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        return errors + ["nodes must be a non-empty array"]

    by_id: dict[str, dict[str, Any]] = {}
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            errors.append(f"nodes[{index}] must be an object")
            continue
        rule_id = node.get("rule_id")
        if not isinstance(rule_id, str) or not rule_id:
            errors.append(f"nodes[{index}].rule_id must be a non-empty string")
            continue
        if rule_id in by_id:
            errors.append(f"duplicate rule_id: {rule_id}")
        by_id[rule_id] = node

    for rule_id, node in by_id.items():
        path = node.get("canonical_path")
        if not isinstance(path, str) or not path:
            errors.append(f"{rule_id}: canonical_path must be a non-empty string")
        elif not (root / path).is_file():
            errors.append(f"{rule_id}: missing canonical_path {path}")
        if node.get("status") not in {"active", "superseded"}:
            errors.append(f"{rule_id}: status must be active or superseded")
        trigger = node.get("trigger")
        if not isinstance(trigger, str) or not trigger.strip():
            errors.append(f"{rule_id}: trigger must be a non-empty string")
        phases = node.get("enforcement_phase")
        if not isinstance(phases, list) or not phases:
            errors.append(f"{rule_id}: enforcement_phase must be a non-empty array")
        elif any(phase not in ALLOWED_PHASES for phase in phases):
            errors.append(f"{rule_id}: invalid enforcement phase")
        elif len(phases) != len(set(phases)):
            errors.append(f"{rule_id}: duplicate enforcement phase")
        for relation in RELATIONS:
            targets = node.get(relation)
            if not isinstance(targets, list):
                errors.append(f"{rule_id}: {relation} must be an array")
                continue
            if len(targets) != len(set(targets)):
                errors.append(f"{rule_id}: duplicate {relation} target")
            for target in targets:
                if not isinstance(target, str) or not target:
                    errors.append(f"{rule_id}: {relation} contains an invalid target")
                elif target == rule_id:
                    errors.append(f"{rule_id}: {relation} cannot point to itself")
                elif target not in by_id:
                    errors.append(f"{rule_id}: {relation} references unknown rule {target}")

    for rule_id, node in by_id.items():
        for target in node.get("supersedes", []):
            if target in by_id and by_id[target].get("status") != "superseded":
                errors.append(f"{rule_id}: supersedes target {target} is not marked superseded")
        for target in node.get("conflicts_with", []):
            if target in by_id and rule_id not in by_id[target].get("conflicts_with", []):
                errors.append(f"{rule_id}: conflict with {target} is not symmetric")

    # Positive requires cycles are finite co-required components. Only inheritance
    # must remain acyclic in the routing graph.
    adjacency = {
        rule_id: [target for target in node.get("inherits", []) if target in by_id]
        for rule_id, node in by_id.items()
    }
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(rule_id: str, trail: list[str]) -> None:
        if rule_id in visiting:
            cycle = trail[trail.index(rule_id):] + [rule_id] if rule_id in trail else trail + [rule_id]
            errors.append("inherits cycle: " + " -> ".join(cycle))
            return
        if rule_id in visited:
            return
        visiting.add(rule_id)
        trail.append(rule_id)
        for target in adjacency.get(rule_id, []):
            visit(target, trail)
        trail.pop()
        visiting.remove(rule_id)
        visited.add(rule_id)

    for rule_id in by_id:
        visit(rule_id, [])

    superseders: dict[str, list[str]] = {}
    for rule_id, node in by_id.items():
        if node.get("status") != "active":
            continue
        for target in node.get("supersedes", []):
            superseders.setdefault(target, []).append(rule_id)
    for rule_id, node in by_id.items():
        if node.get("status") == "superseded" and len(superseders.get(rule_id, [])) != 1:
            errors.append(f"{rule_id}: superseded rule must have exactly one active successor")
    return errors


def resolve_rules(graph: dict[str, Any], selected: list[str]) -> dict[str, Any]:
    nodes = {node["rule_id"]: node for node in graph["nodes"]}
    superseders: dict[str, list[str]] = {}
    for rule_id, node in nodes.items():
        if node["status"] != "active":
            continue
        for target in node["supersedes"]:
            superseders.setdefault(target, []).append(rule_id)

    redirects: list[dict[str, str]] = []

    def active_id(rule_id: str) -> str:
        if rule_id not in nodes:
            raise ValueError(f"unknown selected rule: {rule_id}")
        if nodes[rule_id]["status"] == "active":
            return rule_id
        successors = superseders.get(rule_id, [])
        if len(successors) != 1:
            raise ValueError(f"superseded rule has ambiguous or missing successor: {rule_id}")
        redirects.append({"from": rule_id, "to": successors[0]})
        return successors[0]

    normalized = []
    for rule_id in selected:
        resolved = active_id(rule_id)
        if resolved not in normalized:
            normalized.append(resolved)

    ordered: list[str] = []
    seen: set[str] = set()

    expanding: set[str] = set()

    def expand(rule_id: str) -> None:
        rule_id = active_id(rule_id)
        if rule_id in seen:
            return
        if rule_id in expanding:
            return
        expanding.add(rule_id)
        node = nodes[rule_id]
        for relation in ("requires", "inherits"):
            for target in node[relation]:
                expand(target)
        expanding.remove(rule_id)
        seen.add(rule_id)
        ordered.append(rule_id)

    for rule_id in normalized:
        expand(rule_id)

    active = set(ordered)
    conflicts: list[tuple[str, str]] = []
    for rule_id in ordered:
        for target in nodes[rule_id]["conflicts_with"]:
            target = active_id(target)
            if target in active:
                pair = tuple(sorted((rule_id, target)))
                if pair not in conflicts:
                    conflicts.append(pair)
    if conflicts:
        rendered = ", ".join(f"{left}<->{right}" for left, right in conflicts)
        raise ValueError(f"unresolved rule conflicts: {rendered}")

    edges = []
    for rule_id in ordered:
        for relation in ("requires", "inherits"):
            for target in nodes[rule_id][relation]:
                resolved = active_id(target)
                if resolved in active:
                    edges.append({"from": rule_id, "relation": relation, "to": resolved})

    return {
        "schema_version": 1,
        "status": "RESOLVED_ROUTING_METADATA_NOT_APPLICATION_EVIDENCE",
        "selected": selected,
        "normalized_selected": normalized,
        "supersession_redirects": redirects,
        "ordered_rules": [
            {
                "rule_id": rule_id,
                "canonical_path": nodes[rule_id]["canonical_path"],
                "trigger": nodes[rule_id]["trigger"],
                "enforcement_phase": nodes[rule_id]["enforcement_phase"],
            }
            for rule_id in ordered
        ],
        "edges": edges,
        "limits": [
            "Resolution proves declared dependency expansion only.",
            "Canonical prose and current owner/project authority remain normative.",
            "Activation and application require separate task-time evidence.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--catalog", default=None)
    parser.add_argument("--profile", default=None)
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate = subparsers.add_parser("validate")
    validate.add_argument("--write-lock")
    resolve = subparsers.add_parser("resolve")
    resolve.add_argument("--rule", action="append", required=True)
    for name in ("compile", "explain"):
        child = subparsers.add_parser(name)
        child.add_argument("--task", required=True)
        child.add_argument("--mode", choices=["legacy", "flat", "graph"], default="graph")
        child.add_argument("--output")
    check = subparsers.add_parser("check")
    check.add_argument("--contract", required=True)
    check.add_argument("--phase", choices=task_time.PHASES, required=True)
    check.add_argument("--payload", required=True)
    check.add_argument("--output")
    impact = subparsers.add_parser("impact")
    impact.add_argument("paths", nargs="+")
    impact.add_argument("--output")
    compare = subparsers.add_parser("compare")
    compare.add_argument("--task", required=True)
    compare.add_argument("--output")
    args = parser.parse_args()

    root = args.root.resolve()
    try:
        graph = load_graph(root)
        errors = validate_graph(graph, root)
        if errors:
            print(json.dumps({"status": "FAIL", "errors": errors}, indent=2))
            return 1

        catalog_path = Path(args.catalog) if args.catalog else root / "rules" / "rule-graph" / "task-time-metadata.v1.json"
        profile_path = Path(args.profile) if args.profile else root / "scripts" / "instruction-layering-profile.json"
        catalog = task_time.read_json(catalog_path)
        profile = task_time.read_json(profile_path)

        if args.command == "validate":
            state = task_time.validate(catalog, profile)
            lock = task_time.build_lock(catalog, profile)
            if args.write_lock:
                task_time.emit(args.write_lock, lock)
            print(json.dumps({
                "status": "PASS",
                "node_count": len(graph["nodes"]),
                "task_time_rule_count": len(state["by_id"]),
                "graph": str(GRAPH_PATH),
                "task_time_metadata": str(catalog_path.relative_to(root) if catalog_path.is_relative_to(root) else catalog_path),
                "source_lock_sha256": lock["content_sha256"],
            }, indent=2))
            return 0

        if args.command == "resolve":
            print(json.dumps(resolve_rules(graph, args.rule), indent=2))
            return 0

        if args.command in {"compile", "explain"}:
            contract = task_time.compile_contract(catalog, profile, task_time.read_json(Path(args.task)), args.mode)
            if args.command == "compile":
                value = contract
            else:
                selected = {item["rule_id"] for item in contract["selected_rules"]}
                value = {
                    "schema_version": 1,
                    "task_id": contract["task_id"],
                    "mode": contract["mode"],
                    "usable": contract["usable"],
                    "selected": [
                        {"rule_id": item["rule_id"], "why": item["explanation"], "source": item["source"]}
                        for item in contract["selected_rules"]
                    ],
                    "omitted": [
                        {"rule_id": rid, "disposition": disposition}
                        for rid, disposition in sorted(contract["direct_evaluations"].items())
                        if rid not in selected
                    ],
                    "unresolved": contract["unresolved"],
                    "content_sha256": contract["content_sha256"],
                }
            task_time.emit(args.output, value)
            return 0 if value.get("usable", True) else 3

        if args.command == "check":
            result = task_time.check_contract(
                task_time.read_json(Path(args.contract)),
                args.phase,
                Path(args.payload).read_text(encoding="utf-8"),
            )
            task_time.emit(args.output, result)
            return 0 if result["admission"] == "ADMITTED" else 4

        if args.command == "impact":
            task_time.emit(args.output, task_time.impact(catalog, profile, args.paths))
            return 0

        if args.command == "compare":
            task = task_time.read_json(Path(args.task))
            variants = {mode: task_time.compile_contract(catalog, profile, task, mode) for mode in ("legacy", "flat", "graph")}
            ids = {mode: {item["rule_id"] for item in value["selected_rules"]} for mode, value in variants.items()}
            task_time.emit(args.output, {
                "schema_version": 1,
                "task_id": task.get("task_id"),
                "routes": {
                    mode: {
                        "selected_rule_ids": [item["rule_id"] for item in value["selected_rules"]],
                        "selected_rule_count": len(value["selected_rules"]),
                        "rendered_utf8_bytes": len(value["rendered_contract"].encode()),
                        "unresolved_count": len(value["unresolved"]),
                        "content_sha256": value["content_sha256"],
                    }
                    for mode, value in variants.items()
                },
                "graph_added_over_flat": sorted(ids["graph"] - ids["flat"]),
                "graph_missing_from_legacy": sorted(ids["legacy"] - ids["graph"]),
            })
            return 0
        raise AssertionError(args.command)
    except (ValueError, task_time.RuleGraphError) as exc:
        code = getattr(exc, "code", "FAIL")
        detail = getattr(exc, "detail", None)
        print(json.dumps({"status": "FAIL", "code": code, "errors": [str(exc)], "detail": detail}, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
