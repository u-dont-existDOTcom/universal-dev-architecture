import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts import uda_enforcement_coverage as coverage
from scripts.audit_codex_github import audit_repository

ROOT = Path(__file__).resolve().parents[1]


class EnforcementCoverageTests(unittest.TestCase):
    """Each fault is injected into a private copy, never canonical files."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        inventory = json.loads((ROOT / coverage.COVERAGE).read_text())
        paths = {coverage.COVERAGE, coverage.BASELINE, coverage.METADATA,
                 coverage.LOCK, coverage.REQUIREMENT, "rules/UDA-RULE-GRAPH.json", "AGENTS.md",
                 "LESSON-INDEX.md", "docs/uda-enforcement-coverage.md"}
        paths.update(p.relative_to(ROOT).as_posix() for p in (ROOT / "patterns").glob("*.md"))
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
                     migration={"priority": "P2", "next_step": "Carry this newly behavioral rule into an exact task-time contract."})
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
            migration={"priority": "P2", "next_step": "Carry these newly behavioral obligations into exact records and admission fixtures."}))
        baseline = self.read(coverage.BASELINE)
        baseline["backlog_ids"].append(target)
        self.write(coverage.BASELINE, baseline)
        self.rejected("baseline backlog_ids drift from the captured owner requirement")

    def test_specific_owner_authorized_addition_can_grow_backlog(self):
        entries = self.read(coverage.COVERAGE)["entries"]
        target = self.workflow(entries)["id"]
        self.change(lambda items: self.workflow(items).update(
            disposition="LEGACY_UNSTRUCTURED", behavioral=True,
            migration={"priority": "P2", "next_step": "Carry the newly authorized behavioral obligations into exact records and admission fixtures."}))
        baseline = self.read(coverage.BASELINE)
        for quote in ("I authorize this exact existing workflow entry to enter the migration backlog for this test.",
                      "Approved for migration."):
            with self.subTest(owner_quote=quote):
                baseline["owner_authorized_additions"] = [{"id": target, "date": "2026-10-06", "source": "test-only owner directive",
                    "owner_quote": quote}]
                self.write(coverage.BASELINE, baseline)
                self.assertEqual([], coverage.validate(self.root))

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

    def test_semantic_unknown_cannot_be_relabelled_fully_enforced(self):
        self.change(lambda entries: self.structured(entries).update(disposition="STRUCTURED_ENFORCED", legacy_remainder=""))
        self.rejected("obligation has no evaluable admission path")

    def test_report_lists_exact_backlog_ids_priorities_and_shrinkage(self):
        report = coverage.report(self.root)
        entries = self.read(coverage.COVERAGE)["entries"]
        expected = {e["id"]: e["migration"]["priority"] for e in entries if e["disposition"] in coverage.BACKLOG}
        self.assertEqual(expected, {e["id"]: e["priority"] for e in report["backlog"]})
        self.assertEqual(len(expected), report["backlog_count"])
        self.assertEqual([], report["removed_since_baseline"])
        removed = self.workflow(entries)["id"]
        # A temporary coherent baseline anchor models an earlier migration.
        baseline = self.read(coverage.BASELINE)
        baseline["backlog_ids"].append(removed)
        self.write(coverage.BASELINE, baseline)
        requirement = self.read(coverage.REQUIREMENT)
        next(f for f in requirement["related_findings"] if f["finding_id"] == "pass-1-legacy-baseline")["backlog_ids"].append(removed)
        self.write(coverage.REQUIREMENT, requirement)
        self.assertEqual([removed], coverage.report(self.root)["removed_since_baseline"])

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

    def test_missing_coverage_file_fails_audit(self):
        (self.root / coverage.COVERAGE).unlink()
        self.assertTrue(any(f["code"] == "uda.enforcement.coverage" and f["severity"] == "error" for f in audit_repository(self.root)))

    def test_removing_all_metadata_sentinels_cannot_disable_audit_gate(self):
        for path in (coverage.COVERAGE, coverage.METADATA, coverage.BASELINE,
                     coverage.REQUIREMENT, "rules/UDA-RULE-GRAPH.json"):
            (self.root / path).unlink()
        self.assertTrue(any(f["code"] == "uda.enforcement.coverage" and f["severity"] == "error" for f in audit_repository(self.root)))

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
