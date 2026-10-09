import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts import uda_enforcement_coverage as coverage
from scripts import uda_rule_graph_task_time as task_time
from scripts.audit_codex_github import audit_repository

ROOT = Path(__file__).resolve().parents[1]
WORK_CONTRACT = "tools/codex-mission-control/restored/codex-mission-control/generated/rule-graph/work-handoff-contract.json"


class EnforcementCoverageTests(unittest.TestCase):
    """Each fault is injected into a private copy, never canonical files."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        inventory = json.loads((ROOT / coverage.COVERAGE).read_text())
        paths = {coverage.COVERAGE, coverage.BASELINE, coverage.METADATA,
                 coverage.LOCK, coverage.REQUIREMENT, "rules/UDA-RULE-GRAPH.json", "AGENTS.md",
                 "LESSON-INDEX.md", ".github/codex-repository.json", ".github/uda-kernel", "docs/uda-enforcement-coverage.md",
                 "scripts/uda_rule_graph_task_time.py", "scripts/instruction-layering-profile.json",
                 "examples/rule-graph/work-handoff.json", WORK_CONTRACT}
        paths.update(p.relative_to(ROOT).as_posix() for p in (ROOT / "patterns").rglob("*.md"))
        paths.update(e["path"] for entry in inventory["entries"] for e in entry["evidence"])
        for path in paths:
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / path, target)
        self.assertEqual([], coverage.validate(self.root))

    def read(self, path):
        return json.loads((self.root / path).read_text())

    def write(self, path, data):
        (self.root / path).write_text(json.dumps(data, indent=2) + "\n")

    def change(self, mutation):
        data = self.read(coverage.COVERAGE)
        mutation(data["entries"])
        self.write(coverage.COVERAGE, data)

    def rejected(self, fragment):
        errors = coverage.validate(self.root)
        self.assertTrue(any(fragment in error for error in errors), errors)

    def structured(self, entries):
        return next(e for e in entries if e["disposition"] == "STRUCTURED_PARTIAL")

    def workflow(self, entries):
        return next(e for e in entries if e["disposition"] == "WORKFLOW_ONLY")

    def test_repository_inventory_is_valid_and_each_active_indexed_source_is_unique(self):
        self.assertEqual([], coverage.validate(ROOT))
        entries = self.read(coverage.COVERAGE)["entries"]
        for eid in coverage.index_routes(self.root):
            self.assertEqual(1, sum(e["id"] == eid for e in entries))
            self.assertNotEqual("NOT_ACTIVE", next(e for e in entries if e["id"] == eid)["disposition"])

    def test_refresh_validation_rejects_missing_trigger_fact_or_absent_policy(self):
        original = self.read(coverage.METADATA)
        for rid, name in (("uda.final.timestamp", None),
                          ("uda.final.timestamp", "role"),
                          ("uda.final.timestamp", "envelope.bootstrap"),
                          ("uda.final.timestamp", "envelope.legacy_rule_ids"),
                          ("uda.continuation.controller-resume", "actor"),
                          ("uda.task-lock.exclusive-controls", "governance_required")):
            with self.subTest(rule=rid, fact=name):
                catalog = json.loads(json.dumps(original))
                rule = next(r for r in catalog["records"] if r["rule_id"] == rid)
                if name is None:
                    rule.pop("refresh_on_facts")
                else:
                    rule["refresh_on_facts"].remove(name)
                self.write(coverage.METADATA, catalog)
                self.rejected(rid + ": TRIGGER_FACTS_NOT_REFRESHED")

    def test_active_indexed_pattern_without_disposition_fails(self):
        self.change(lambda entries: entries.remove(next(e for e in entries if e["indexed"])))
        self.rejected("missing disposition")

    def test_new_index_entry_without_disposition_fails(self):
        with (self.root / "LESSON-INDEX.md").open("a") as handle:
            handle.write("\n999. `patterns/new-rule.md` — When handling the new action, check its boundary.\n")
        self.rejected("index source missing from universe: patterns/new-rule.md")

    def test_new_pattern_file_without_disposition_fails(self):
        (self.root / "patterns/new-rule.md").write_text("# New live rule\nWhen acting, check the result.\n")
        self.rejected("missing disposition: patterns/new-rule.md")

    def test_nested_pattern_without_disposition_fails_validator_and_audit(self):
        for relative in ("patterns/domain/new-rule.md", "patterns/domain/deeper/new-rule.md"):
            with self.subTest(path=relative):
                path = self.root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("# New live rule\nWhen acting, check the result.\n")
                self.rejected("missing disposition: " + relative)
                self.artifact_rejected_by_audit("missing disposition: " + relative)
                path.unlink()

    def test_new_kernel_section_without_disposition_fails(self):
        with (self.root / "AGENTS.md").open("a") as handle:
            handle.write("\n## New kernel rule\nCheck the real boundary.\n")
        self.rejected("missing disposition: AGENTS.md#new-kernel-rule")

    def test_duplicate_disposition_fails(self):
        self.change(lambda entries: entries.append(dict(entries[0])))
        self.rejected("duplicate/conflicting disposition")

    def test_conflicting_dispositions_fail(self):
        self.change(lambda entries: entries.append({**entries[0], "disposition": "NOT_ACTIVE"}))
        self.rejected("duplicate/conflicting disposition")

    def test_deleted_task_time_record_fails(self):
        catalog = self.read(coverage.METADATA)
        catalog["records"].pop()
        self.write(coverage.METADATA, catalog)
        self.rejected("missing task-time record")

    def test_deleted_record_id_from_inventory_fails(self):
        self.change(lambda entries: self.structured(entries)["task_time_records"].pop())
        self.rejected("task-time record must be claimed exactly once")

    def test_record_cannot_be_claimed_by_two_entries(self):
        def mutate(entries):
            structured = [e for e in entries if e["disposition"] in coverage.STRUCTURED]
            structured[1]["task_time_records"].append(structured[0]["task_time_records"][0])
        self.change(mutate)
        self.rejected("task-time record must be claimed exactly once")

    def test_record_source_mismatch_fails(self):
        catalog = self.read(coverage.METADATA)
        catalog["records"][0]["source"]["path"] = "patterns/logic-failure-map.md"
        self.write(coverage.METADATA, catalog)
        self.rejected("task-time record source mismatch")

    def test_selector_drift_fails(self):
        catalog = self.read(coverage.METADATA)
        catalog["records"][0]["source"]["selectors"][0]["text"] += " no longer canonical"
        self.write(coverage.METADATA, catalog)
        self.rejected("source/selector drift")

    def test_empty_selectors_cannot_claim_exact_source_mapping(self):
        catalog = self.read(coverage.METADATA)
        catalog["records"][0]["source"]["selectors"] = []
        self.write(coverage.METADATA, catalog)
        lock = self.read(coverage.LOCK)
        lock["catalog_sha256"] = coverage.canonical_hash(catalog)
        self.write(coverage.LOCK, lock)
        self.rejected("exact source mapping needs nonempty selectors")

    def test_record_cannot_lose_its_trigger(self):
        catalog = self.read(coverage.METADATA)
        catalog["records"][0].pop("trigger")
        self.write(coverage.METADATA, catalog)
        self.rejected("record needs a valid explicit trigger")

    def test_historical_record_cannot_keep_active_structured_mapping(self):
        catalog = self.read(coverage.METADATA)
        catalog["records"][0]["status"] = "HISTORICAL"
        self.write(coverage.METADATA, catalog)
        self.rejected("structured mapping must reference a CURRENT record")

    def test_actor_scope_must_be_a_nonempty_list(self):
        catalog = self.read(coverage.METADATA)
        catalog["records"][0]["applies_to"]["actors"] = "chat"
        self.write(coverage.METADATA, catalog)
        self.rejected("record needs obligations and actor scope")

    def test_inventory_cannot_omit_a_record_actor(self):
        self.change(lambda entries: self.structured(entries).update(actors=["unrelated actor"]))
        self.rejected("inventory omits record actor scope")

    def test_wildcard_paths_fail(self):
        for wildcard in ("patterns/*", "patterns/?.md", "patterns/[ab].md"):
            with self.subTest(wildcard=wildcard):
                original = self.read(coverage.COVERAGE)
                self.change(lambda entries: entries[0]["evidence"].append({"path": wildcard, "class": "ADMISSION"}))
                self.rejected("wildcard/glob coverage")
                self.write(coverage.COVERAGE, original)

    def test_legacy_covered_sources_never_counts_as_coverage(self):
        self.change(lambda entries: entries[0].update(legacy_covered_sources=["patterns/logic-failure-map.md"]))
        self.rejected("legacy_covered_sources is not coverage")

    def test_wildcard_activation_fails(self):
        original = self.read(coverage.COVERAGE)
        self.change(lambda entries: self.structured(entries)["activation_route"].update(kind="STRUCTURED_TRIGGER", detail="patterns/*"))
        self.rejected("wildcard/glob activation")
        self.write(coverage.COVERAGE, original)
        entry = next(e for e in original["entries"] if e["activation_route"] and e["activation_route"]["kind"] == "INDEX_TRIGGER")
        detail = entry["activation_route"]["detail"]
        entry["activation_route"]["detail"] = detail + " *"
        index = self.root / "LESSON-INDEX.md"
        index.write_text(index.read_text().replace(" — " + detail, " — " + detail + " *", 1))
        self.write(coverage.COVERAGE, original)
        self.rejected("wildcard/glob activation")

    def test_backlog_growth_without_owner_authorization_fails(self):
        def mutate(entries):
            e = self.workflow(entries)
            e.update(disposition="LEGACY_UNSTRUCTURED", behavioral=True,
                     migration={"priority": "P2", "trigger_frequency": "CONDITIONAL", "next_step": "Carry this newly behavioral rule into an exact task-time contract."})
            e.pop("exception_reason")
        self.change(mutate)
        self.rejected("unauthorized backlog growth")

    def test_owner_authorization_requires_quote_date_and_source(self):
        baseline = self.read(coverage.BASELINE)
        baseline["owner_authorized_additions"] = [{"id": "patterns/new-rule.md", "date": "yesterday", "owner_quote": "approved"}]
        self.write(coverage.BASELINE, baseline)
        self.rejected("owner_authorized_addition needs")
        baseline["owner_authorized_additions"] = [{"id": "patterns/*", "date": "2026-10-06", "owner_quote": "Approved.", "source": "test-only owner directive"}]
        self.write(coverage.BASELINE, baseline)
        self.rejected("owner_authorized_addition needs exact id")

    def test_editing_baseline_cannot_silently_authorize_growth(self):
        target = self.workflow(self.read(coverage.COVERAGE)["entries"])["id"]
        self.change(lambda entries: self.workflow(entries).update(
            disposition="LEGACY_UNSTRUCTURED", behavioral=True,
            migration={"priority": "P2", "trigger_frequency": "CONDITIONAL", "next_step": "Carry these newly behavioral obligations into exact records and admission fixtures."}))
        baseline = self.read(coverage.BASELINE)
        baseline["backlog_ids"].append(target)
        self.write(coverage.BASELINE, baseline)
        self.rejected("baseline backlog_ids drift from the captured owner requirement")

    def test_specific_owner_authorized_addition_can_grow_backlog(self):
        entries = self.read(coverage.COVERAGE)["entries"]
        target = self.workflow(entries)["id"]
        self.change(lambda items: self.workflow(items).update(
            disposition="LEGACY_UNSTRUCTURED", behavioral=True,
            migration={"priority": "P2", "trigger_frequency": "CONDITIONAL", "next_step": "Carry the newly authorized behavioral obligations into exact records and admission fixtures."}))
        baseline = self.read(coverage.BASELINE)
        existing = list(baseline.get("owner_authorized_additions", []))
        for quote in ("I authorize this exact existing workflow entry to enter the migration backlog for this test.",
                      "Approved for migration."):
            with self.subTest(owner_quote=quote):
                baseline["owner_authorized_additions"] = existing + [{"id": target, "date": "2026-10-06", "source": "test-only owner directive",
                    "owner_quote": quote}]
                self.write(coverage.BASELINE, baseline)
                self.assertEqual([], coverage.validate(self.root))

    def test_promoted_baseline_entries_cannot_regress_without_owner_authorization(self):
        original = self.read(coverage.COVERAGE)
        requirement = self.read(coverage.REQUIREMENT)
        promoted = requirement["source_clause_manifest"]
        # Simulate absence of this owner's explicit corrective reclassification.
        requirement.pop("owner_authorized_coverage_corrections", None)
        self.write(coverage.REQUIREMENT, requirement)
        self.assertTrue(promoted)
        for target in promoted:
            with self.subTest(target=target):
                self.write(coverage.COVERAGE, original)
                self.change(lambda entries: next(e for e in entries if e["id"] == target).update(
                    disposition="STRUCTURED_PARTIAL",
                    legacy_remainder="Some operative obligations remain outside the exact task-time admission path.",
                    migration={"priority": "P1", "trigger_frequency": "EVERY_TURN",
                               "next_step": "Restore complete task-time admission coverage for the remaining operative obligations."}))
                self.rejected("unauthorized promoted coverage regression")

    def test_explicit_owner_authorization_can_return_a_promoted_entry_to_backlog(self):
        target = next(iter(self.read(coverage.REQUIREMENT)["source_clause_manifest"]))
        self.change(lambda entries: next(e for e in entries if e["id"] == target).update(
            disposition="STRUCTURED_PARTIAL",
            legacy_remainder="Some operative obligations remain outside the exact task-time admission path.",
            migration={"priority": "P1", "trigger_frequency": "EVERY_TURN",
                       "next_step": "Restore complete task-time admission coverage for the remaining operative obligations."}))
        baseline = self.read(coverage.BASELINE)
        for addition in (
                {"id": target, "date": "2026-10-07", "owner_quote": "Approved.", "source": "test-only owner directive"},
                {"id": target, "date": "2026-10-07", "owner_quote": "Approved."},
                {"id": "patterns/another-entry.md", "date": "2026-10-07", "owner_quote": "Approved.", "source": "test-only owner directive"}):
            with self.subTest(addition=addition):
                baseline["owner_authorized_additions"] = [addition]
                self.write(coverage.BASELINE, baseline)
                if addition.get("source") and addition["id"] == target:
                    self.assertEqual([], coverage.validate(self.root))
                else:
                    self.rejected("unauthorized promoted coverage regression")

    def test_manifest_backed_identity_pin_covers_enforced_and_partial_entries(self):
        requirement = self.read(coverage.REQUIREMENT)
        entries = {e["id"]: e for e in self.read(coverage.COVERAGE)["entries"]}
        self.assertEqual(sorted(requirement["source_clause_manifest"]),
                         requirement["manifest_backed_ids"])
        self.assertEqual({"STRUCTURED_ENFORCED", "STRUCTURED_PARTIAL"},
                         {entries[eid]["disposition"] for eid in requirement["manifest_backed_ids"]})
        self.assertEqual([], coverage.validate(self.root))

    def test_manifest_backed_partials_pass_unchanged_and_fail_coordinated_deletion(self):
        original_requirement = self.read(coverage.REQUIREMENT)
        original_coverage = self.read(coverage.COVERAGE)
        for target in ("patterns/context-compaction-resilience.md",
                       "patterns/terminal-response-admission-and-autonomous-continuation.md"):
            for deleted in (False, True):
                with self.subTest(target=target, deleted=deleted):
                    requirement = json.loads(json.dumps(original_requirement))
                    inventory = json.loads(json.dumps(original_coverage))
                    entry = next(e for e in inventory["entries"] if e["id"] == target)
                    self.assertEqual("STRUCTURED_PARTIAL", entry["disposition"])
                    if deleted:
                        requirement["source_clause_manifest"].pop(target)
                        entry.pop("obligation_map")
                    self.write(coverage.REQUIREMENT, requirement)
                    self.write(coverage.COVERAGE, inventory)
                    result = subprocess.run(
                        [sys.executable, str(ROOT / "scripts/uda_enforcement_coverage.py"),
                         "validate", "--root", str(self.root)],
                        capture_output=True, text=True)
                    self.assertEqual(1 if deleted else 0, result.returncode, result.stdout + result.stderr)
                    if deleted:
                        self.assertIn("unauthorized promoted coverage regression: " + target, result.stdout)
                    else:
                        self.assertEqual("VALID", json.loads(result.stdout)["status"])

    def test_manifest_backed_entries_reject_individual_evidence_loss(self):
        original_requirement = self.read(coverage.REQUIREMENT)
        original_coverage = self.read(coverage.COVERAGE)
        for target in original_requirement["source_clause_manifest"]:
            for missing in ("manifest", "obligation_map", "structured_status"):
                with self.subTest(target=target, missing=missing):
                    requirement = json.loads(json.dumps(original_requirement))
                    inventory = json.loads(json.dumps(original_coverage))
                    entry = next(e for e in inventory["entries"] if e["id"] == target)
                    if missing == "manifest":
                        requirement["source_clause_manifest"].pop(target)
                    elif missing == "obligation_map":
                        entry.pop("obligation_map")
                    else:
                        entry["disposition"] = "LEGACY_UNSTRUCTURED"
                    self.write(coverage.REQUIREMENT, requirement)
                    self.write(coverage.COVERAGE, inventory)
                    self.rejected("unauthorized promoted coverage regression: " + target)

    def test_existing_owner_authorization_can_release_partial_manifest_evidence(self):
        original_requirement = self.read(coverage.REQUIREMENT)
        original_coverage = self.read(coverage.COVERAGE)
        baseline = self.read(coverage.BASELINE)
        original_additions = list(baseline.get("owner_authorized_additions", []))
        for target in ("patterns/context-compaction-resilience.md",
                       "patterns/terminal-response-admission-and-autonomous-continuation.md"):
            baseline["owner_authorized_additions"] = original_additions + [{
                "id": target, "date": "2026-10-09", "owner_quote": "Approved.",
                "source": "test-only owner directive"}]
            self.write(coverage.BASELINE, baseline)
            for missing in ("manifest", "obligation_map", "both"):
                with self.subTest(target=target, missing=missing):
                    requirement = json.loads(json.dumps(original_requirement))
                    inventory = json.loads(json.dumps(original_coverage))
                    if missing in {"manifest", "both"}:
                        requirement["source_clause_manifest"].pop(target)
                    if missing in {"obligation_map", "both"}:
                        next(e for e in inventory["entries"] if e["id"] == target).pop("obligation_map")
                    self.write(coverage.REQUIREMENT, requirement)
                    self.write(coverage.COVERAGE, inventory)
                    self.assertEqual([], coverage.validate(self.root))

    def test_manifest_identity_pin_is_required_exact_and_complete(self):
        original = self.read(coverage.REQUIREMENT)
        for pin in (None, [], "patterns/context-compaction-resilience.md",
                    ["patterns/*"], list(original["source_clause_manifest"]) * 2):
            with self.subTest(pin=pin):
                requirement = json.loads(json.dumps(original))
                if pin is None:
                    requirement.pop("manifest_backed_ids", None)
                else:
                    requirement["manifest_backed_ids"] = pin
                self.write(coverage.REQUIREMENT, requirement)
                self.rejected("manifest_backed_ids must be a nonempty unique list of exact source identities")
        requirement = json.loads(json.dumps(original))
        requirement["manifest_backed_ids"] = sorted(original["source_clause_manifest"])[1:]
        self.write(coverage.REQUIREMENT, requirement)
        self.rejected("source clause manifest identity is not independently pinned")

    def test_missing_exception_reason_fails(self):
        self.change(lambda entries: self.workflow(entries).pop("exception_reason"))
        self.rejected("missing or generic exception_reason")

    def test_generic_exception_reason_fails(self):
        for reason in ("workflow only", "This is governed by a specialist authoritative workflow rather than a task-time behavioral rule."):
            with self.subTest(reason=reason):
                self.change(lambda entries: self.workflow(entries).update(exception_reason=reason))
                self.rejected("missing or generic exception_reason")

    def test_not_active_without_reason_fails(self):
        self.change(lambda entries: next(e for e in entries if e["disposition"] == "NOT_ACTIVE").pop("not_active_reason"))
        self.rejected("NOT_ACTIVE needs")

    def test_superseded_entry_requires_active_successor(self):
        self.change(lambda entries: next(e for e in entries if e["disposition"] == "NOT_ACTIVE").pop("superseded_by"))
        self.rejected("superseded entry needs active superseded_by")

    def test_index_trigger_requires_actual_leading_trigger(self):
        entry = next(e for e in self.read(coverage.COVERAGE)["entries"] if e["activation_route"] and e["activation_route"]["kind"] == "INDEX_TRIGGER")
        index = self.root / "LESSON-INDEX.md"
        text = index.read_text().replace(" — " + coverage.index_routes(self.root)[entry["id"]], " — apply the current rule.", 1)
        index.write_text(text)
        self.rejected("INDEX_TRIGGER lacks matching explicit trigger clause")

    def test_parent_route_requires_literal_child_path(self):
        entry = next(e for e in self.read(coverage.COVERAGE)["entries"] if e["activation_route"] and e["activation_route"]["kind"] == "PARENT_PATTERN")
        parent = self.root / entry["activation_route"]["detail"]
        parent.write_text(parent.read_text().replace(entry["id"], "historical-child-reference"))
        self.rejected("PARENT_PATTERN must be active and name the child path")

    def test_text_presence_and_routing_cannot_support_structured_disposition(self):
        for evidence_class in ("TEXT_PRESENCE", "ROUTING"):
            with self.subTest(evidence_class=evidence_class):
                self.change(lambda entries: self.structured(entries).update(evidence=[{"path": "tests/test_uda_rule_graph.py", "class": evidence_class}]))
                self.rejected("ADMISSION or BEHAVIORAL_REGRESSION evidence")

    def test_partial_requires_operative_remainder(self):
        self.change(lambda entries: self.structured(entries).pop("legacy_remainder"))
        self.rejected("partial disposition needs operative legacy_remainder")

    def test_unobserved_obligation_cannot_be_relabelled_fully_enforced(self):
        catalog = self.read(coverage.METADATA)
        entry = self.structured(self.read(coverage.COVERAGE)["entries"])
        record = next(r for r in catalog["records"] if r["rule_id"] in entry["task_time_records"])
        record["obligations"][0].update(enforcement="unobserved", mechanical_check=None)
        self.write(coverage.METADATA, catalog)
        self.change(lambda entries: self.structured(entries).update(disposition="STRUCTURED_ENFORCED", legacy_remainder=""))
        self.rejected("obligation has no evaluable admission path")

    def test_nonbehavioral_entry_cannot_be_p1_even_outside_backlog(self):
        self.change(lambda entries: self.workflow(entries).update(
            behavioral=False, migration={"priority": "P1", "next_step": "test-only promotion"}))
        self.rejected("every P1 entry must be behavioral")

    def test_p1_matches_supervisor_high_leverage_list(self):
        expected = {
            "patterns/reasoning-selection.md", "AGENTS.md#workflow", "patterns/task-time-lesson-activation.md",
            "AGENTS.md#instruction-composition", "patterns/logic-failure-map.md", "patterns/source-interpretation-provenance.md",
            "AGENTS.md#pre-final-continuation-invariant", "patterns/codex-github-operating-system.md",
            "patterns/terminal-response-admission-and-autonomous-continuation.md",
            "patterns/owner-outcome-invariant-and-contract-laundering-prevention.md",
            "patterns/owner-goal-followup-and-requirement-accretion.md",
            "AGENTS.md#follow-up-goal-derivation-and-assistant-added-requirements",
            "patterns/chatgpt-client-surface-capability-and-thread-recovery.md",
            "patterns/worker-directive-delivery-and-chat-output-budget.md", "AGENTS.md#owner-facing-operational-references",
            "patterns/recommendation-preflight-integrity.md", "patterns/shopping-research.md",
            "patterns/cross-family-reasoning-check.md", "patterns/chat-work-execution-routing-threshold.md",
            "patterns/exclusive-active-task-locks.md", "patterns/context-compaction-resilience.md",
            "AGENTS.md#per-turn-bootstrap-invariants",
        }
        report = coverage.report(self.root)
        backlog = report["backlog"]
        migrated_baseline = set(report["removed_since_baseline"])
        self.assertEqual(expected, {e["id"] for e in backlog if e["priority"] == "P1"} | migrated_baseline)
        self.assertEqual(7, len(migrated_baseline))

    def test_report_orders_priority_then_estimated_trigger_frequency(self):
        report = coverage.report(self.root)
        keys = [(e["priority"], coverage.TRIGGER_FREQUENCY_ORDER[e["trigger_frequency"]], e["id"]) for e in report["backlog"]]
        self.assertEqual(keys, sorted(keys))
        self.assertIn("not measured usage", report["backlog_order"])

    def test_condensed_requirement_retains_counts_and_exact_list_pointers(self):
        findings = self.read(coverage.REQUIREMENT)["related_findings"]
        self.assertLess(len(json.dumps(findings, indent=2, ensure_ascii=False).encode()), 4096)
        historical = next(f for f in findings if f["finding_id"] == "pass-2-inventory")
        # A later migration must not rewrite the pass-2 historical snapshot.
        counts = historical["identity_counts_by_disposition"]
        self.assertEqual(historical["entry_count"], sum(counts.values()))
        self.assertEqual(historical["backlog_count"], sum(counts[d] for d in coverage.BACKLOG))
        self.assertEqual(historical["exact_lists"], coverage.COVERAGE)
        self.assertEqual(historical["report_command"], "python3 scripts/uda_enforcement_coverage.py report")
        # The newest slice records the live counts until the next slice adds its own finding.
        self.assertTrue(any(f["finding_id"] == "slice-1-kernel" for f in findings))
        current = next(f for f in reversed(findings) if f["finding_id"].startswith("slice-"))
        self.assertEqual(coverage.report(self.root)["counts_by_disposition"], current["identity_counts_by_disposition"])
        self.assertEqual(current["backlog_count"], sum(current["identity_counts_by_disposition"][d] for d in coverage.BACKLOG))
        self.assertEqual(current["exact_lists"], coverage.COVERAGE)
        self.assertEqual(current["report_command"], "python3 scripts/uda_enforcement_coverage.py report")

    def test_report_lists_exact_backlog_ids_priorities_and_shrinkage(self):
        report = coverage.report(self.root)
        entries = self.read(coverage.COVERAGE)["entries"]
        expected = {e["id"]: e["migration"]["priority"] for e in entries if e["disposition"] in coverage.BACKLOG}
        self.assertEqual(expected, {e["id"]: e["priority"] for e in report["backlog"]})
        self.assertEqual(len(expected), report["backlog_count"])
        baseline_ids = set(self.read(coverage.BASELINE)["backlog_ids"])
        removed = sorted(e["id"] for e in entries if e["disposition"] == "STRUCTURED_ENFORCED" and e["id"] in baseline_ids)
        self.assertEqual(removed, report["removed_since_baseline"])
        self.assertEqual(7, len(removed))
        self.assertEqual(84, report["baseline_backlog_count"])
        self.assertEqual(77, report["backlog_count"])

    def test_documented_counts_match_report(self):
        report = coverage.report(self.root)
        doc = (self.root / "docs/uda-enforcement-coverage.md").read_text()
        for disposition, count in report["counts_by_disposition"].items():
            self.assertIn(f"| {disposition} | {count} |", doc)
        self.assertIn(f"Inventory entries: {report['entry_count']}", doc)
        self.assertIn(f"Indexed patterns: {report['indexed_pattern_count']}", doc)
        self.assertIn(f"Migration backlog: {report['backlog_count']}", doc)
        for entry in report["backlog"]:
            self.assertIn(f"| `{entry['id']}` | {entry['priority']} |", doc)

    def test_audit_runs_coverage_at_error_level(self):
        self.change(lambda entries: entries.pop())
        findings = audit_repository(self.root)
        errors = [f for f in findings if f["code"] == "uda.enforcement.coverage"]
        self.assertTrue(errors)
        self.assertTrue(all(f["severity"] == "error" for f in errors))

    def artifact_rejected_by_audit(self, fragment):
        findings = audit_repository(self.root)
        self.assertTrue(any(f["code"] == "uda.enforcement.coverage"
                            and f["severity"] == "error" and fragment in f["message"]
                            for f in findings), findings)

    def test_audit_rejects_source_lock_tampering_even_with_consistent_hash(self):
        lock = self.read(coverage.LOCK)
        lock["entries"][0]["repository_revision"] = "BLOB:" + "0" * 40
        lock["content_sha256"] = coverage.canonical_hash({k: v for k, v in lock.items() if k != "content_sha256"})
        self.write(coverage.LOCK, lock)
        self.artifact_rejected_by_audit("source lock differs from regenerated artifact")

    def test_audit_rejects_work_projection_tampering_even_with_consistent_hash(self):
        contract = self.read(WORK_CONTRACT)
        contract["rendered_contract"] += "\nStale projection text\n"
        contract["content_sha256"] = coverage.canonical_hash({k: contract[k] for k in task_time.CONTRACT_CONTENT_FIELDS})
        self.write(WORK_CONTRACT, contract)
        self.artifact_rejected_by_audit("Work handoff projection differs from regenerated artifact")

    def test_audit_binds_whole_source_blob_beyond_selected_text(self):
        with (self.root / "patterns/task-time-lesson-activation.md").open("a") as handle:
            handle.write("\nChanged source outside every exact selector.\n")
        self.artifact_rejected_by_audit("source lock differs from regenerated artifact")
        self.artifact_rejected_by_audit("Work handoff projection differs from regenerated artifact")

    def test_audit_binds_compiler_bytes_in_audited_root(self):
        with (self.root / "scripts/uda_rule_graph_task_time.py").open("a") as handle:
            handle.write("\n# Changed compiler fixture\n")
        self.artifact_rejected_by_audit("source lock differs from regenerated artifact")

    def test_audit_artifact_comparison_is_read_only(self):
        def snapshot():
            return {p.relative_to(self.root): p.read_bytes()
                    for p in self.root.rglob("*") if p.is_file()}
        before = snapshot()
        self.assertEqual([], [f for f in audit_repository(self.root) if f["code"] == "uda.enforcement.coverage"])
        self.assertEqual(before, snapshot())

    def test_missing_coverage_file_fails_audit(self):
        (self.root / coverage.COVERAGE).unlink()
        self.assertTrue(any(f["code"] == "uda.enforcement.coverage" and f["severity"] == "error" for f in audit_repository(self.root)))

    def test_removing_all_metadata_sentinels_cannot_disable_audit_gate(self):
        for path in (coverage.COVERAGE, coverage.METADATA, coverage.BASELINE,
                     coverage.REQUIREMENT, "rules/UDA-RULE-GRAPH.json"):
            (self.root / path).unlink()
        self.assertTrue(any(f["code"] == "uda.enforcement.coverage" and f["severity"] == "error" for f in audit_repository(self.root)))

    def test_heading_edits_cannot_disable_missing_or_corrupt_inventory_gate(self):
        agents = self.root / "AGENTS.md"
        body = agents.read_text(encoding="utf-8").split("\n", 1)[1]
        inventory = self.root / coverage.COVERAGE
        for heading in ("# Universal architecture", "# UNIVERSAL DEVELOPMENT ARCHITECTURE",
                        "\ufeff# Universal development architecture"):
            for content in (None, "{not-json}\n"):
                with self.subTest(heading=heading, inventory=content):
                    agents.write_text(heading + "\n" + body, encoding="utf-8")
                    if content is None:
                        inventory.unlink(missing_ok=True)
                    else:
                        inventory.write_text(content, encoding="utf-8")
                    errors = [f for f in audit_repository(self.root)
                              if f["code"] == "uda.enforcement.coverage" and f["severity"] == "error"]
                    self.assertTrue(errors)
                    self.assertEqual(coverage.validate(self.root), [f["message"] for f in errors])

    def test_kernel_marker_edits_cannot_disable_missing_or_corrupt_inventory_gate(self):
        profile_path = ".github/codex-repository.json"
        original = self.read(profile_path)
        inventory = self.root / coverage.COVERAGE
        for marker in ("missing", False, None, 0, 1, "true", {}, []):
            profile = dict(original)
            if marker == "missing":
                profile.pop("uda_kernel")
            else:
                profile["uda_kernel"] = marker
            self.write(profile_path, profile)
            for content in (None, "{not-json}\n"):
                with self.subTest(marker=marker, inventory=content):
                    if content is None:
                        inventory.unlink(missing_ok=True)
                    else:
                        inventory.write_text(content, encoding="utf-8")
                    findings = audit_repository(self.root)
                    errors = [f for f in findings
                              if f["code"] == "uda.enforcement.coverage" and f["severity"] == "error"]
                    self.assertTrue(errors)
                    self.assertEqual(coverage.validate(self.root), [f["message"] for f in errors])
                    self.assertTrue(any(f["code"] == "repo.profile.uda-kernel"
                                        and f["severity"] == "error" for f in findings))

    def test_kernel_profile_downgrade_cannot_disable_missing_or_corrupt_inventory_gate(self):
        self.assertFalse((self.root / ".git").exists())
        profile_path = ".github/codex-repository.json"
        original = self.read(profile_path)
        inventory = self.root / coverage.COVERAGE
        for marker in ("missing", False):
            profile = dict(original, repository_kind="policy")
            if marker == "missing":
                profile.pop("uda_kernel")
            else:
                profile["uda_kernel"] = marker
            self.write(profile_path, profile)
            for content in (None, "{not-json}\n"):
                with self.subTest(marker=marker, inventory=content):
                    if content is None:
                        inventory.unlink(missing_ok=True)
                    else:
                        inventory.write_text(content, encoding="utf-8")
                    errors = [f for f in audit_repository(self.root)
                              if f["code"] == "uda.enforcement.coverage" and f["severity"] == "error"]
                    self.assertTrue(errors)
                    self.assertEqual(coverage.validate(self.root), [f["message"] for f in errors])

    def test_cli_report_and_invalid_exit_status(self):
        script = str(ROOT / "scripts/uda_enforcement_coverage.py")
        good = subprocess.run([sys.executable, script, "report", "--root", str(self.root)], capture_output=True, text=True)
        self.assertEqual(0, good.returncode, good.stdout + good.stderr)
        self.assertEqual(coverage.report(self.root), json.loads(good.stdout))
        self.change(lambda entries: entries.pop())
        bad = subprocess.run([sys.executable, script, "validate", "--root", str(self.root)], capture_output=True, text=True)
        self.assertEqual(1, bad.returncode)
        self.assertEqual("INVALID", json.loads(bad.stdout)["status"])


if __name__ == "__main__":
    unittest.main()
