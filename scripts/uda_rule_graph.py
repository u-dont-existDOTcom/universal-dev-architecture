#!/usr/bin/env python3
"""Validate and resolve the machine-readable UDA rule dependency graph."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

GRAPH_PATH = Path("rules/UDA-RULE-GRAPH.json")
ALLOWED_PHASES = {"retrieval", "reasoning", "action", "handoff", "persistence", "delivery", "release"}
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

    adjacency = {
        rule_id: [target for relation in ("requires", "inherits") for target in node.get(relation, []) if target in by_id]
        for rule_id, node in by_id.items()
    }
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(rule_id: str, trail: list[str]) -> None:
        if rule_id in visiting:
            cycle = trail[trail.index(rule_id):] + [rule_id] if rule_id in trail else trail + [rule_id]
            errors.append("requires/inherits cycle: " + " -> ".join(cycle))
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

    def expand(rule_id: str) -> None:
        rule_id = active_id(rule_id)
        if rule_id in seen:
            return
        node = nodes[rule_id]
        for relation in ("requires", "inherits"):
            for target in node[relation]:
                expand(target)
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
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("validate")
    resolve = subparsers.add_parser("resolve")
    resolve.add_argument("--rule", action="append", required=True)
    args = parser.parse_args()

    root = args.root.resolve()
    try:
        graph = load_graph(root)
        errors = validate_graph(graph, root)
        if errors:
            print(json.dumps({"status": "FAIL", "errors": errors}, indent=2))
            return 1
        if args.command == "validate":
            print(json.dumps({"status": "PASS", "node_count": len(graph["nodes"]), "graph": str(GRAPH_PATH)}, indent=2))
            return 0
        result = resolve_rules(graph, args.rule)
        print(json.dumps(result, indent=2))
        return 0
    except ValueError as exc:
        print(json.dumps({"status": "FAIL", "errors": [str(exc)]}, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
