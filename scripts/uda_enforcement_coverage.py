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
    from . import uda_rule_graph_task_time as task_time
    from .uda_rule_graph_task_time import RuleGraphError, validate_trigger
else:
    import uda_rule_graph_task_time as task_time
    from uda_rule_graph_task_time import RuleGraphError, validate_trigger

COVERAGE = "rules/rule-graph/enforcement-coverage.v1.json"
BASELINE = "rules/rule-graph/enforcement-legacy-baseline.v1.json"
METADATA = "rules/rule-graph/task-time-metadata.v1.json"
LOCK = "rules/rule-graph/generated/source-lock.v1.json"
WORK_TASK = "examples/rule-graph/work-handoff.json"
WORK_CONTRACT = "tools/codex-mission-control/restored/codex-mission-control/generated/rule-graph/work-handoff-contract.json"
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
TRIGGER_FREQUENCY_ORDER = {"EVERY_TURN": 0, "FREQUENT": 1, "CONDITIONAL": 2, "SPECIALIST": 3}
INDEX_LINE = re.compile(r"^\s*\d+\.\s+`(patterns/[^`]+\.md)`\s+—\s+(.*)$", re.M)


def slug(heading: str) -> str:
    return re.sub(r"[^\w -]", "", heading.lower()).replace(" ", "-")


def universe(root: Path) -> dict[str, dict[str, Any]]:
    result = {p.relative_to(root).as_posix(): {"kind": "pattern", "source": p.read_text(encoding="utf-8")}
              for p in sorted((root / "patterns").rglob("*.md"))}
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
        profile = json.loads(file_at(root, "scripts/instruction-layering-profile.json").read_text(encoding="utf-8"))
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
        for record in records:
            try:
                validate_trigger(record.get("trigger"), record["rule_id"])
                task_time.validate_refresh_facts(record, profile)
            except RuleGraphError as exc:
                errors.append(f"{record['rule_id']}: {exc.code}: {exc}")
        lock_ids = [e["rule_id"] for e in lock["entries"]]
        if Counter(lock_ids) != Counter(record_ids):
            errors.append("task-time records differ from source lock (deleted or added mapping)")
        if lock.get("catalog_sha256") != canonical_hash(catalog):
            errors.append("task-time catalog/source lock drift; regenerate using uda_rule_graph.py")
        graph_nodes = {n["rule_id"]: n for n in graph["nodes"]}
        manifest_backed_ids = requirement.get("manifest_backed_ids")
        if (not isinstance(manifest_backed_ids, list) or not manifest_backed_ids
                or any(not isinstance(eid, str) or eid not in sources
                       or any(c in eid for c in "*?[") for eid in manifest_backed_ids)
                or len(manifest_backed_ids) != len(set(manifest_backed_ids))):
            errors.append("manifest_backed_ids must be a nonempty unique list of exact source identities")
            manifest_backed_ids = []
        for eid in requirement.get("source_clause_manifest", {}):
            if eid not in manifest_backed_ids:
                errors.append("source clause manifest identity is not independently pinned: " + eid)
        authorized_additions = set()
        for addition in baseline.get("owner_authorized_additions", []):
            try:
                date.fromisoformat(addition["date"])
                if (not isinstance(addition.get("owner_quote"), str) or not addition["owner_quote"].strip()
                        or not isinstance(addition.get("source"), str) or not addition["source"].strip()
                        or not isinstance(addition.get("id"), str) or not addition["id"].strip()
                        or any(c in addition["id"] for c in "*?[")):
                    raise ValueError("incomplete authorization")
                authorized_additions.add(addition["id"])
            except (KeyError, TypeError, ValueError):
                errors.append("owner_authorized_addition needs exact id, owner_quote, date and source")
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
            migration = entry.get("migration", {})
            if migration.get("priority") == "P1" and entry.get("behavioral") is not True:
                errors.append(prefix + "every P1 entry must be behavioral")
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
                if migration.get("trigger_frequency") not in TRIGGER_FREQUENCY_ORDER:
                    errors.append(prefix + "backlog needs a declared trigger_frequency estimate")
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
            obligation_map = entry.get("obligation_map")
            if disposition == "STRUCTURED_ENFORCED":
                if not isinstance(obligation_map, list) or not obligation_map:
                    errors.append(prefix + "enforced disposition needs a complete obligation_map")
                if not {"ADMISSION", "BEHAVIORAL_REGRESSION"}.issubset(evidence_classes):
                    errors.append(prefix + "enforced disposition needs both ADMISSION and BEHAVIORAL_REGRESSION evidence")
            if disposition == "STRUCTURED_ENFORCED" or (
                    disposition == "STRUCTURED_PARTIAL"
                    and (eid in manifest_backed_ids
                         or eid in requirement.get("source_clause_manifest", {}))):
                # Pin the source clauses in the requirement, independently of
                # editable records/maps and their regenerable lock/projection.
                manifest = requirement.get("source_clause_manifest", {}).get(eid)
                released = disposition in BACKLOG and eid in authorized_additions
                if not isinstance(manifest, dict):
                    if not released:
                        errors.append(prefix + "missing independent source clause manifest")
                elif not isinstance(obligation_map, list) or not obligation_map:
                    if not released:
                        errors.append(prefix + "manifest-backed disposition needs a nonempty obligation_map")
                else:
                    clauses = sorted(item["sentence"] for item in obligation_map
                                     if isinstance(item, dict) and isinstance(item.get("sentence"), str))
                    if (manifest.get("clause_count") != len(clauses)
                            or manifest.get("clauses_sha256") != canonical_hash(clauses)):
                        errors.append(prefix + "obligation_map differs from independent source clause manifest")
                    if entry.get("kind") == "pattern" and source:
                        # Independent pins cover the pre-section span and every
                        # section body so new prose, even beside mapped clauses,
                        # requires review.
                        section_pins = {}
                        section_manifest = manifest.get("sections")
                        headings = list(re.finditer(r"^## (.+)$", source["source"], re.M))
                        pre_section = source["source"][:headings[0].start()] if headings else source["source"]
                        if manifest.get("pre_section_sha256") != hashlib.sha256(pre_section.encode()).hexdigest():
                            errors.append(prefix + "pre-section source differs from independent source pin")
                        for i, heading in enumerate(headings):
                            section = slug(heading[1])
                            if section in section_pins:
                                errors.append(prefix + "duplicate structured section: " + section)
                            body = source["source"][heading.end():headings[i + 1].start() if i + 1 < len(headings) else len(source["source"])]
                            owned = sorted(c for c in clauses if body.count(c) == 1)
                            if owned:
                                section_pins[section] = {
                                    "clause_count": len(owned), "clauses_sha256": canonical_hash(owned),
                                    "source_sha256": hashlib.sha256(body.encode()).hexdigest()}
                            else:
                                declared = section_manifest.get(section) if isinstance(section_manifest, dict) else None
                                reason = declared.get("reason") if isinstance(declared, dict) else None
                                if (not isinstance(declared, dict)
                                        or declared.get("classification") != "NON_OPERATIVE"
                                        or not specific_reason(reason)):
                                    errors.append(prefix + "section needs mapped clauses or explicit non-operative classification: " + section)
                                section_pins[section] = {
                                    "classification": "NON_OPERATIVE", "reason": reason,
                                    "source_sha256": hashlib.sha256(body.encode()).hexdigest()}
                        if manifest.get("sections") != section_pins:
                            errors.append(prefix + "obligation_map differs from independent section clause manifests")
            mapped_obligations = set()
            if obligation_map is not None:
                if not isinstance(obligation_map, list) or not obligation_map:
                    errors.append(prefix + "obligation_map must be a nonempty list")
                else:
                    sentences = set()
                    for item in obligation_map:
                        if not isinstance(item, dict):
                            errors.append(prefix + "invalid obligation_map item")
                            continue
                        sentence = item.get("sentence")
                        if (not isinstance(sentence, str) or not sentence.strip()
                                or not source or source["source"].count(sentence) != 1):
                            errors.append(prefix + "obligation_map sentence missing or ambiguous in owning section")
                        elif sentence in sentences:
                            errors.append(prefix + "duplicate obligation_map sentence")
                        else:
                            sentences.add(sentence)
                        if "exception" in item:
                            exception = item["exception"]
                            if "record" in item or "obligation_id" in item:
                                errors.append(prefix + "obligation exception cannot also map a record")
                            if not isinstance(exception, dict):
                                errors.append(prefix + "invalid obligation exception")
                                continue
                            if exception.get("kind") not in {"BOOTSTRAP_NOT_LOADED", "OWNER_SETTINGS_CHANGE"}:
                                errors.append(prefix + "obligation exception must be bootstrap-not-loaded or owner-settings-change")
                            if not specific_reason(exception.get("reason")):
                                errors.append(prefix + "obligation exception needs a specific reason")
                            carrier = exception.get("carrier")
                            try:
                                if not isinstance(carrier, str) or not carrier.strip():
                                    raise ValueError("obligation exception needs a named carrier")
                                path, _, anchor = carrier.partition("#")
                                body = file_at(root, path).read_text(encoding="utf-8")
                                if anchor and anchor not in {slug(h) for h in re.findall(r"^#{1,6} (.+)$", body, re.M)}:
                                    raise ValueError("obligation exception carrier anchor does not exist")
                            except ValueError as exc:
                                errors.append(prefix + str(exc))
                            continue
                        rid, oid = item.get("record"), item.get("obligation_id")
                        record = by_record.get(rid) if isinstance(rid, str) else None
                        if (rid not in mapped or not record
                                or not isinstance(oid, str)
                                or not any(o.get("obligation_id") == oid for o in record.get("obligations", []))):
                            errors.append(prefix + "obligation_map references missing record obligation")
                            continue
                        if not isinstance(sentence, str) or not any(
                                selector.get("kind") == "exact_text"
                                and sentence in selector.get("text", "")
                                for selector in record["source"].get("selectors", [])):
                            errors.append(prefix + "obligation_map sentence absent from record selectors")
                        binding = (rid, oid)
                        mapped_obligations.add(binding)
                    expected = {(rid, ob.get("obligation_id")) for rid in mapped
                                for ob in by_record.get(rid, {}).get("obligations", [])}
                    if expected - mapped_obligations:
                        errors.append(prefix + "obligation_map omits record obligations")
                    if disposition == "STRUCTURED_ENFORCED":
                        # Several exact clauses may form one coherent behavior.
                        # Removing one clause must still fail even if that
                        # behavior retains other mappings.
                        for rid in mapped:
                            record = by_record.get(rid, {})
                            clauses = [item["sentence"] for item in obligation_map
                                       if item.get("record") == rid
                                       and isinstance(item.get("sentence"), str)]
                            for selector in record.get("source", {}).get("selectors", []):
                                if selector.get("kind") != "exact_text":
                                    continue
                                remainder = selector.get("text", "")
                                for clause in sorted(clauses, key=len, reverse=True):
                                    remainder = remainder.replace(clause, "")
                                if remainder.strip():
                                    errors.append(prefix + "obligation_map omits selector sentence: " + rid)
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
                        # A semantic admission path binds an assertion; it does
                        # not certify that the source's full meaning was captured.
                        if not mechanical and ob.get("enforcement") != "semantic":
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
        if (len(anchors) != 1 or anchors[0].get("backlog_count") != len(pinned)
                or anchors[0].get("backlog_ids_sha256") != canonical_hash(pinned)):
            errors.append("baseline backlog_ids drift from the captured owner requirement; use owner_authorized_additions for growth")
        allowed = set(pinned) | authorized_additions
        for eid in pinned:
            if not isinstance(eid, str) or any(c in eid for c in "*?["):
                errors.append("baseline identities must be exact")
        for eid in sorted(e["id"] for e in entries if e.get("disposition") in BACKLOG and e["id"] not in allowed):
            errors.append("unauthorized backlog growth: " + eid)
        for eid in pinned:
            if eid not in by_id or by_id[eid].get("disposition") not in BACKLOG | {"STRUCTURED_ENFORCED"}:
                errors.append("baseline backlog may shrink only through STRUCTURED_ENFORCED: " + eid)
        # Independently pinned identities persist manifest-backed coverage,
        # including partial promotions. Deleting the manifest cannot unpin one;
        # original baseline membership cannot authorize putting it back.
        corrections = set()
        for correction in requirement.get("owner_authorized_coverage_corrections", []):
            try:
                date.fromisoformat(correction["date"])
                if (correction.get("id") not in pinned
                        or correction.get("disposition") != "STRUCTURED_PARTIAL"
                        or not specific_reason(correction.get("owner_quote"))
                        or not specific_reason(correction.get("reason"))
                        or not isinstance(correction.get("source"), str)
                        or not correction["source"].strip()):
                    raise ValueError("incomplete corrective authority")
                corrections.add(correction["id"])
            except (KeyError, TypeError, ValueError):
                errors.append("coverage correction needs exact baseline id, partial disposition, owner_quote, date, source and reason")
        for eid in sorted(set(manifest_backed_ids) | set(requirement.get("source_clause_manifest", {}))):
            entry = by_id.get(eid, {})
            disposition = entry.get("disposition")
            corrected = disposition == "STRUCTURED_PARTIAL" and eid in corrections
            manifest = requirement.get("source_clause_manifest", {}).get(eid)
            obligation_map = entry.get("obligation_map")
            evidence_intact = (isinstance(manifest, dict)
                               and isinstance(obligation_map, list) and bool(obligation_map))
            released = disposition in BACKLOG and eid in authorized_additions
            if not released and (not evidence_intact or (disposition != "STRUCTURED_ENFORCED" and not corrected)):
                errors.append("unauthorized promoted coverage regression: " + eid)
        # Compare complete regenerated content, not just IDs or a self-declared
        # checksum. Regeneration stays in memory and uses the audited root.
        profile = task_time.read_json(file_at(root, "scripts/instruction-layering-profile.json"))
        file_at(root, "scripts/uda_rule_graph_task_time.py")
        if lock != task_time.build_lock(catalog, profile, root=root):
            errors.append("source lock differs from regenerated artifact; regenerate using uda_rule_graph.py")
        envelope = task_time.read_json(file_at(root, WORK_TASK))
        projection = task_time.read_json(file_at(root, WORK_CONTRACT))
        if projection != task_time.compile_contract(catalog, profile, envelope, "graph", root=root):
            errors.append("Work handoff projection differs from regenerated artifact; regenerate using uda_rule_graph.py")
    except (OSError, ValueError, KeyError, TypeError, AttributeError, RuleGraphError) as exc:
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
               for e in sorted(entries, key=lambda e: (e.get("migration", {}).get("priority", ""),
                   TRIGGER_FREQUENCY_ORDER.get(e.get("migration", {}).get("trigger_frequency"), 99), e["id"]))
               if e["disposition"] in BACKLOG]
    current = {e["id"] for e in backlog}
    return {
        "schema_version": 1,
        "status": "COVERAGE_VALIDATED_NOT_UNIVERSAL_ENFORCEMENT",
        "entry_count": len(entries),
        "indexed_pattern_count": sum(e["indexed"] for e in entries),
        "counts_by_disposition": {d: sum(e["disposition"] == d for e in entries) for d in DISPOSITIONS},
        "backlog_count": len(backlog),
        "backlog": backlog,
        "backlog_order": "Priority P1, P2, P3; then estimated trigger frequency EVERY_TURN, FREQUENT, CONDITIONAL, SPECIALIST; then id. Estimates are routing judgments, not measured usage.",
        "backlog_counts_by_priority": dict(sorted(Counter(e["priority"] for e in backlog).items())),
        "baseline_backlog_count": len(baseline["backlog_ids"]),
        "removed_since_baseline": sorted(set(baseline["backlog_ids"]) - current),
        "obligation_exceptions": [{"id": e["id"], "sentence": item["sentence"], **item["exception"]}
                                  for e in entries for item in e.get("obligation_map", [])
                                  if "exception" in item],
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
