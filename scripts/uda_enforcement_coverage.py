#!/usr/bin/env python3
"""Inventory UDA enforcement without mistaking routing or prose for admission.

Standard-library-only and root-parametric: mutation tests never edit canonical
files. This validates declared coverage and source bindings, not semantic truth.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any

if __package__:
    from .uda_rule_graph_task_time import RuleGraphError, validate_trigger
else:
    from uda_rule_graph_task_time import RuleGraphError, validate_trigger

COVERAGE = "rules/rule-graph/enforcement-coverage.v1.json"
BASELINE = "rules/rule-graph/enforcement-legacy-baseline.v1.json"
METADATA = "rules/rule-graph/task-time-metadata.v1.json"
LOCK = "rules/rule-graph/generated/source-lock.v1.json"
REQUIREMENT = "docs/requirements/2026-10-06-universal-enforcement-coverage.owner-requirement.json"
DISPOSITIONS = ("STRUCTURED_ENFORCED", "STRUCTURED_PARTIAL", "WORKFLOW_ONLY",
                "LEGACY_UNSTRUCTURED", "NOT_ACTIVE")
BACKLOG = {"STRUCTURED_PARTIAL", "LEGACY_UNSTRUCTURED"}
STRUCTURED = {"STRUCTURED_ENFORCED", "STRUCTURED_PARTIAL"}
EVIDENCE_CLASSES = ("TEXT_PRESENCE", "ROUTING", "COMPILATION", "ADMISSION",
                    "BEHAVIORAL_REGRESSION")
PHASES = {"retrieval", "reasoning", "pre-action", "handoff", "persistence",
          "publication", "final-delivery"}
ENFORCEMENT_TYPES = {"mechanical", "semantic", "owner-evaluated", "unobserved", "none"}
TRIGGER = re.compile(r"^(?:owner rule:\s*)?(?:When|Before|For|After|Whenever|While|If)\b", re.I)
INDEX_LINE = re.compile(r"^\s*\d+\.\s+`(patterns/[^`]+\.md)`\s+—\s+(.*)$", re.M)


def slug(heading: str) -> str:
    return re.sub(r"[^\w -]", "", heading.lower()).replace(" ", "-")


def universe(root: Path) -> dict[str, dict[str, Any]]:
    result = {p.relative_to(root).as_posix(): {"kind": "pattern", "source": p.read_text(encoding="utf-8")}
              for p in sorted((root / "patterns").glob("*.md"))}
    body = (root / "AGENTS.md").read_text(encoding="utf-8")
    matches = list(re.finditer(r"^## (.+)$", body, re.M))
    for i, match in enumerate(matches):
        eid = "AGENTS.md#" + slug(match[1])
        if eid in result:
            raise ValueError("Duplicate kernel section: " + eid)
        result[eid] = {"kind": "kernel_section", "source": body[match.end():matches[i + 1].start() if i + 1 < len(matches) else len(body)]}
    return result


def index_routes(root: Path) -> dict[str, str]:
    routes = {}
    for path, text in INDEX_LINE.findall((root / "LESSON-INDEX.md").read_text(encoding="utf-8")):
        if path in routes:
            raise ValueError("Duplicate index entry: " + path)
        routes[path] = text
    return routes


def canonical_hash(value: Any) -> str:
    body = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(body.encode()).hexdigest()


def specific_reason(value: Any) -> bool:
    """Reject placeholders; whether the explanation is true still needs review."""
    if not isinstance(value, str) or len(value.split()) < 8:
        return False
    generic = r"(?:n/?a|none|todo|tbd|not applicable|workflow only|specialist workflow|reference only|historical|superseded)[. ]*"
    return not re.fullmatch(generic, value.strip(), re.I) and not re.search(r"\b(?:TODO|TBD|generic reason|because it is a workflow)\b", value, re.I)


def exception_specific(value: Any, eid: str) -> bool:
    words = set(re.findall(r"[a-z]{4,}", eid.lower())) - {"patterns", "workflow", "pattern", "only"}
    return specific_reason(value) and bool(words.intersection(re.findall(r"[a-z]{4,}", value.lower())))


def file_at(root: Path, value: Any) -> Path:
    if not isinstance(value, str) or not value or any(c in value for c in "*?["):
        raise ValueError("Invalid exact path: " + str(value))
    raw = Path(value)
    if raw.is_absolute() or ".." in raw.parts:
        raise ValueError("Unsafe path: " + value)
    path = (root / raw).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError("Missing or escaping file: " + value)
    return path


def strings(value: Any):
    if isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)
    elif isinstance(value, str):
        yield value


def validate(root: Path | str) -> list[str]:
    root = Path(root).resolve()
    errors: list[str] = []
    try:
        coverage = json.loads(file_at(root, COVERAGE).read_text(encoding="utf-8"))
        baseline = json.loads(file_at(root, BASELINE).read_text(encoding="utf-8"))
        catalog = json.loads(file_at(root, METADATA).read_text(encoding="utf-8"))
        lock = json.loads(file_at(root, LOCK).read_text(encoding="utf-8"))
        graph = json.loads(file_at(root, "rules/UDA-RULE-GRAPH.json").read_text(encoding="utf-8"))
        requirement = json.loads(file_at(root, REQUIREMENT).read_text(encoding="utf-8"))
        sources, routes = universe(root), index_routes(root)
        if any(v.get("schema_version") != 1 for v in (coverage, baseline, catalog, lock)):
            errors.append("schema_version must be 1")
        entries, records = coverage["entries"], catalog["records"]
        if not isinstance(entries, list) or not isinstance(records, list):
            raise ValueError("entries and records must be lists")
        ids = [e["id"] for e in entries]
        if any(not isinstance(eid, str) for eid in ids):
            raise ValueError("entry ids must be strings")
        counts = Counter(ids)
        for eid, count in sorted(counts.items()):
            if count != 1:
                errors.append(f"duplicate/conflicting disposition: {eid} ({count})")
        errors += ["missing disposition: " + eid for eid in sorted(set(sources) - set(ids))]
        errors += ["extra disposition: " + eid for eid in sorted(set(ids) - set(sources))]
        errors += ["index source missing from universe: " + eid for eid in sorted(set(routes) - set(sources))]
        by_id = {e["id"]: e for e in entries}
        record_ids = [r["rule_id"] for r in records]
        if len(record_ids) != len(set(record_ids)):
            errors.append("duplicate task-time record")
        by_record = {r["rule_id"]: r for r in records}
        lock_ids = [e["rule_id"] for e in lock["entries"]]
        if Counter(lock_ids) != Counter(record_ids):
            errors.append("task-time records differ from source lock (deleted or added mapping)")
        if lock.get("catalog_sha256") != canonical_hash(catalog):
            errors.append("task-time catalog/source lock drift; regenerate using uda_rule_graph.py")
        graph_nodes = {n["rule_id"]: n for n in graph["nodes"]}
        claims: dict[str, list[str]] = defaultdict(list)
        for entry in entries:
            eid = entry["id"]
            source = sources.get(eid)
            disposition = entry.get("disposition")
            prefix = eid + ": "
            if disposition not in DISPOSITIONS:
                errors.append(prefix + "invalid disposition")
            if source and entry.get("kind") != source["kind"]:
                errors.append(prefix + "kind mismatch")
            if type(entry.get("indexed")) is not bool or entry["indexed"] != (eid in routes):
                errors.append(prefix + "indexed flag differs from LESSON-INDEX")
            if type(entry.get("behavioral")) is not bool:
                errors.append(prefix + "behavioral must be a boolean")
            # Coverage identifiers/paths must be exact; explanations are prose.
            for key in ("id", "task_time_records", "graph_node", "superseded_by", "evidence"):
                if any(any(c in s for c in "*?[") for s in strings(entry.get(key))):
                    errors.append(prefix + "wildcard/glob coverage is forbidden")
            if any("legacy_covered_sources" in s for s in strings(entry)):
                errors.append(prefix + "legacy_covered_sources is not coverage")
            for key in ("actors", "phases", "destinations", "enforcement_types", "task_time_records", "evidence"):
                if not isinstance(entry.get(key), list):
                    errors.append(prefix + key + " must be a list")
            if any(not isinstance(x, str) or not x.strip() for key in ("actors", "destinations") for x in entry.get(key, [])):
                errors.append(prefix + "actors/destinations must be nonempty strings")
            if not set(entry.get("phases", [])).issubset(PHASES):
                errors.append(prefix + "invalid phase")
            if not set(entry.get("enforcement_types", [])).issubset(ENFORCEMENT_TYPES):
                errors.append(prefix + "invalid enforcement type")
            if disposition != "NOT_ACTIVE" and any(not entry.get(k) for k in ("actors", "phases", "destinations", "enforcement_types")):
                errors.append(prefix + "active entry needs actors, phases, destinations and enforcement types")
            if disposition in BACKLOG:
                migration = entry.get("migration", {})
                if not entry.get("behavioral") or migration.get("priority") not in {"P1", "P2", "P3"} or not specific_reason(migration.get("next_step")):
                    errors.append(prefix + "behavioral backlog needs priority and specific migration next_step")
            if disposition == "STRUCTURED_PARTIAL" and not specific_reason(entry.get("legacy_remainder")):
                errors.append(prefix + "partial disposition needs operative legacy_remainder")
            if disposition == "WORKFLOW_ONLY" and not exception_specific(entry.get("exception_reason"), eid):
                errors.append(prefix + "missing or generic exception_reason")
            if disposition == "NOT_ACTIVE":
                if not specific_reason(entry.get("not_active_reason")):
                    errors.append(prefix + "NOT_ACTIVE needs a specific not_active_reason")
                if eid in routes or entry.get("activation_route") is not None:
                    errors.append(prefix + "NOT_ACTIVE cannot have a live activation route")
                if "supersed" in str(entry.get("not_active_reason", "")).lower():
                    target = by_id.get(entry.get("superseded_by"))
                    if not target or target.get("disposition") == "NOT_ACTIVE":
                        errors.append(prefix + "superseded entry needs active superseded_by")
            else:
                route = entry.get("activation_route", {})
                kind, detail = route.get("kind"), route.get("detail")
                if not isinstance(detail, str) or not detail.strip():
                    errors.append(prefix + "activation route needs detail")
                # Existing index clauses may use Markdown emphasis. Strip only
                # paired bold formatting; a glob in the clause still fails.
                coverage_detail = (re.sub(r"\*\*([^*\n]+)\*\*", r"\1", detail)
                                   if kind == "INDEX_TRIGGER" and isinstance(detail, str) else detail)
                if isinstance(coverage_detail, str) and any(c in coverage_detail for c in "*?["):
                    errors.append(prefix + "wildcard/glob activation coverage is forbidden")
                if kind == "KERNEL_ALWAYS":
                    if entry.get("kind") != "kernel_section":
                        errors.append(prefix + "KERNEL_ALWAYS only applies to kernel sections")
                elif kind == "INDEX_TRIGGER":
                    text = routes.get(eid, "")
                    if not TRIGGER.match(text) or not isinstance(detail, str) or not TRIGGER.match(detail) or not text.startswith(detail):
                        errors.append(prefix + "INDEX_TRIGGER lacks matching explicit trigger clause")
                elif kind == "STRUCTURED_TRIGGER":
                    if disposition not in STRUCTURED or not entry.get("task_time_records"):
                        errors.append(prefix + "STRUCTURED_TRIGGER needs exact structured records")
                elif kind == "PARENT_PATTERN":
                    parent = by_id.get(detail)
                    if not parent or parent.get("disposition") == "NOT_ACTIVE" or parent.get("kind") != "pattern" or detail == eid or eid not in sources.get(detail, {}).get("source", ""):
                        errors.append(prefix + "PARENT_PATTERN must be active and name the child path")
                else:
                    errors.append(prefix + "invalid activation route")
            node_id = entry.get("graph_node")
            if node_id is not None:
                node = graph_nodes.get(node_id)
                if not node or node.get("canonical_path") != eid.split("#")[0]:
                    errors.append(prefix + "graph_node source mismatch")
            evidence_classes = set()
            for item in entry.get("evidence", []):
                if not isinstance(item, dict) or item.get("class") not in EVIDENCE_CLASSES:
                    errors.append(prefix + "invalid evidence class")
                    continue
                evidence_classes.add(item["class"])
                try:
                    file_at(root, item.get("path"))
                except ValueError as exc:
                    errors.append(prefix + str(exc))
            mapped = entry.get("task_time_records", [])
            if len(mapped) != len(set(mapped)):
                errors.append(prefix + "duplicate task_time_records id")
            if disposition in STRUCTURED:
                if not mapped or not evidence_classes.intersection({"ADMISSION", "BEHAVIORAL_REGRESSION"}):
                    errors.append(prefix + "structured disposition needs records and ADMISSION or BEHAVIORAL_REGRESSION evidence")
            elif mapped:
                errors.append(prefix + "only structured dispositions may claim task-time records")
            for rid in mapped:
                claims[rid].append(eid)
                record = by_record.get(rid)
                if not record:
                    errors.append(prefix + "missing task-time record: " + rid)
                    continue
                if record["source"]["path"] != eid.split("#")[0]:
                    errors.append(prefix + "task-time record source mismatch: " + rid)
                elif source:
                    selectors = record["source"].get("selectors", [])
                    if not isinstance(selectors, list) or not selectors:
                        errors.append(prefix + "exact source mapping needs nonempty selectors: " + rid)
                    for selector in selectors:
                        text = selector.get("text")
                        if selector.get("kind") != "exact_text" or not isinstance(text, str) or not text or source["source"].count(text) != 1:
                            errors.append(prefix + "source/selector drift or wrong kernel section: " + rid)
                obligations = record.get("obligations", [])
                actors = record.get("applies_to", {}).get("actors")
                if not obligations or not isinstance(actors, list) or not actors or any(not isinstance(a, str) or not a.strip() for a in actors):
                    errors.append(prefix + "record needs obligations and actor scope: " + rid)
                elif not set(actors).issubset(entry.get("actors", [])):
                    errors.append(prefix + "inventory omits record actor scope: " + rid)
                if record.get("status") != "CURRENT":
                    errors.append(prefix + "structured mapping must reference a CURRENT record: " + rid)
                try:
                    validate_trigger(record.get("trigger"), rid)
                except RuleGraphError:
                    errors.append(prefix + "record needs a valid explicit trigger: " + rid)
                for ob in obligations:
                    if any(not ob.get(k) for k in ("obligation_id", "required_behavior", "due_phase", "destination", "acceptance_evidence", "carry_through", "repair", "enforcement")) or "non_substitutes" not in ob:
                        errors.append(prefix + "incomplete obligation binding: " + rid)
                    if ob.get("due_phase") not in entry.get("phases", []) or ob.get("destination") not in entry.get("destinations", []) or ob.get("enforcement") not in entry.get("enforcement_types", []):
                        errors.append(prefix + "inventory omits record boundary/type: " + rid)
                    if disposition == "STRUCTURED_ENFORCED":
                        mechanical = ob.get("enforcement") == "mechanical" and (ob.get("mechanical_check") or {}).get("kind") in {"final_timestamp_first_line", "final_elapsed_time", "contains_literal", "nonempty"}
                        # No semantic receipt path exists in pass 1. Partial entries
                        # preserve those records honestly until pass 2 implements it.
                        if not mechanical:
                            errors.append(prefix + "obligation has no evaluable admission path: " + rid)
            if disposition == "STRUCTURED_ENFORCED" and entry.get("legacy_remainder"):
                errors.append(prefix + "enforced disposition cannot retain a legacy remainder")
        for rid in record_ids:
            if len(claims[rid]) != 1:
                errors.append("task-time record must be claimed exactly once: " + rid)
        # Parent chains must end at a real activation entry, not a routing cycle.
        for eid in by_id:
            visited, cursor = set(), eid
            while cursor in by_id and (by_id[cursor].get("activation_route") or {}).get("kind") == "PARENT_PATTERN":
                if cursor in visited:
                    errors.append(eid + ": parent activation cycle")
                    break
                visited.add(cursor)
                cursor = by_id[cursor]["activation_route"]["detail"]
        pinned = baseline["backlog_ids"]
        if not isinstance(pinned, list) or len(pinned) != len(set(pinned)):
            errors.append("baseline backlog_ids must be a unique list")
        anchors = [f for f in requirement.get("related_findings", [])
                   if f.get("finding_id") == "pass-1-legacy-baseline"]
        if len(anchors) != 1 or anchors[0].get("backlog_ids") != pinned:
            errors.append("baseline backlog_ids drift from the captured owner requirement; use owner_authorized_additions for growth")
        allowed = set(pinned)
        for addition in baseline.get("owner_authorized_additions", []):
            try:
                date.fromisoformat(addition["date"])
                if (not isinstance(addition.get("owner_quote"), str) or not addition["owner_quote"].strip()
                        or not isinstance(addition.get("source"), str) or not addition["source"].strip()
                        or not isinstance(addition.get("id"), str) or not addition["id"].strip()
                        or any(c in addition["id"] for c in "*?[")):
                    raise ValueError("incomplete authorization")
                allowed.add(addition["id"])
            except (KeyError, TypeError, ValueError):
                errors.append("owner_authorized_addition needs exact id, owner_quote, date and source")
        for eid in pinned:
            if not isinstance(eid, str) or any(c in eid for c in "*?["):
                errors.append("baseline identities must be exact")
        for eid in sorted(e["id"] for e in entries if e.get("disposition") in BACKLOG and e["id"] not in allowed):
            errors.append("unauthorized backlog growth: " + eid)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        errors.append("invalid coverage inputs: " + str(exc))
    return sorted(set(errors))


def report(root: Path | str) -> dict[str, Any]:
    root = Path(root)
    errors = validate(root)
    if errors:
        raise ValueError("\n".join(errors))
    entries = json.loads((root / COVERAGE).read_text(encoding="utf-8"))["entries"]
    baseline = json.loads((root / BASELINE).read_text(encoding="utf-8"))
    backlog = [{"id": e["id"], "disposition": e["disposition"], **e["migration"]}
               for e in sorted(entries, key=lambda e: (e.get("migration", {}).get("priority", ""), e["id"])) if e["disposition"] in BACKLOG]
    current = {e["id"] for e in backlog}
    return {
        "schema_version": 1,
        "status": "COVERAGE_VALIDATED_NOT_UNIVERSAL_ENFORCEMENT",
        "entry_count": len(entries),
        "indexed_pattern_count": sum(e["indexed"] for e in entries),
        "counts_by_disposition": {d: sum(e["disposition"] == d for e in entries) for d in DISPOSITIONS},
        "backlog_count": len(backlog),
        "backlog": backlog,
        "baseline_backlog_count": len(baseline["backlog_ids"]),
        "removed_since_baseline": sorted(set(baseline["backlog_ids"]) - current),
        "entries_by_evidence_class": {c: sorted(e["id"] for e in entries if any(x["class"] == c for x in e["evidence"])) for c in EVIDENCE_CLASSES},
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("validate", "report"))
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[1]))
    args = parser.parse_args(argv)
    errors = validate(args.root)
    if errors:
        print(json.dumps({"status": "INVALID", "errors": errors}, indent=2))
        return 1
    print(json.dumps(report(args.root) if args.command == "report" else {"status": "VALID", "errors": []}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
