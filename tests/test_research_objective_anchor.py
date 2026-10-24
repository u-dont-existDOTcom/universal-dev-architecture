"""Objective-anchor source/routing preservation, not live semantic enforcement."""
from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import uda_enforcement_coverage as coverage
from scripts import uda_rule_graph_task_time as tt

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "patterns/owner-outcome-invariant-and-contract-laundering-prevention.md"
SECTION = "8-checkpoint-and-packet-requirements"
CLAUSES = (
    "Every long-range research turn and every research handoff must carry a compact objective anchor in the research message or outgoing handoff itself; an earlier turn's anchor does not cover a later turn, including after interruption or compaction.",
    "- Main objective: preserve the original main objective from the authoritative owner-outcome record, with its ID, epoch and hash when available; do not substitute the current subtask.",
    "- Current contribution: name the current step and explain how it advances the main objective and its remaining gap.",
    "- Scope boundaries: carry the applicable permitted scope, constraints and non-goals into the current step and handoff.",
    "Keep the main objective stable across turns; only an explicit owner amendment changes its authoritative outcome epoch.",
    "Label side investigations as supporting work, retain the unmet main objective, and do not silently replace it or close it with the side investigation's result.",
    "Keep private objective context in authorized private destinations; public anchors must use public-safe wording and must not disclose private locators, manifests, bindings or audit details.",
)


class ResearchObjectiveAnchorTests(unittest.TestCase):
    def test_every_required_clause_belongs_to_the_existing_packet_section(self):
        source = (ROOT / SOURCE).read_text()
        section = source.split("## 8. Checkpoint and packet requirements\n", 1)[1].split("\n## 9.", 1)[0]
        for clause in CLAUSES:
            with self.subTest(clause=clause):
                self.assertEqual(1, source.count(clause))
                self.assertIn(clause, section)

    def test_task_and_recovery_templates_carry_all_three_anchor_fields(self):
        for name, heading in (("CURRENT-STATE.md", "## Goal"), ("CODEX-TASK.md", "### Research objective anchor")):
            with self.subTest(template=name):
                body = (ROOT / "templates" / name).read_text().split(heading + "\n", 1)[1].split("\n## ", 1)[0]
                for text in ("- Main objective", "- Current contribution:", "- Scope boundaries:", "authoritative owner-outcome record", "main objective and remaining gap", "side investigations as supporting work", "every research turn and every research handoff", "public-safe wording outside authorized private destinations", SOURCE):
                    self.assertIn(text, body)

    def test_documented_mapping_carries_each_exact_anchor_clause(self):
        doc = (ROOT / "docs/uda-enforcement-coverage.md").read_text()
        for clause in CLAUSES:
            with self.subTest(clause=clause):
                self.assertIn(f"| {SECTION} | {clause} | LEGACY: handoff → research-message-or-handoff |", doc)

    def test_index_graph_and_partial_coverage_route_research_turns(self):
        self.assertIn("Before each long-range research turn or handoff", coverage.index_routes(ROOT)[SOURCE])
        graph = tt.read_json(ROOT / "rules/UDA-RULE-GRAPH.json")
        node = next(n for n in graph["nodes"] if n["canonical_path"] == SOURCE)
        self.assertIn("Each long-range research turn or handoff", node["trigger"])
        entry = next(e for e in tt.read_json(ROOT / coverage.COVERAGE)["entries"] if e["id"] == SOURCE)
        self.assertEqual("STRUCTURED_PARTIAL", entry["disposition"])
        self.assertIn("Before each long-range research turn or handoff", entry["activation_route"]["detail"])
        for clause in CLAUSES:
            row = next(r for r in entry["obligation_map"] if r["sentence"] == clause)
            self.assertEqual(SECTION, row["section"])
            self.assertNotIn("record", row)
            self.assertEqual("research-message-or-handoff", row["legacy"]["destination"])
            self.assertIn(clause, entry["legacy_remainder"])

    def test_removing_any_anchor_clause_fails_the_independent_source_pin(self):
        original = coverage.universe(ROOT)
        for clause in CLAUSES:
            altered = copy.deepcopy(original)
            altered[SOURCE]["source"] = altered[SOURCE]["source"].replace(clause, "", 1)
            with self.subTest(clause=clause), mock.patch.object(coverage, "universe", return_value=altered):
                errors = coverage.validate(ROOT)
                self.assertTrue(any(SOURCE in e and "whole source differs from independent source pin" in e for e in errors), errors)

    def test_removing_any_anchor_mapping_fails_the_independent_clause_pin(self):
        original_file_at = coverage.file_at
        with tempfile.TemporaryDirectory() as directory:
            altered_file = Path(directory) / "coverage.json"

            def file_at(root, path):
                return altered_file if path == coverage.COVERAGE else original_file_at(root, path)

            for clause in CLAUSES:
                inventory = tt.read_json(ROOT / coverage.COVERAGE)
                entry = next(e for e in inventory["entries"] if e["id"] == SOURCE)
                entry["obligation_map"] = [r for r in entry["obligation_map"] if r["sentence"] != clause]
                altered_file.write_text(json.dumps(inventory))
                with self.subTest(clause=clause), mock.patch.object(coverage, "file_at", side_effect=file_at):
                    errors = coverage.validate(ROOT)
                    self.assertTrue(any("obligation_map differs from independent source clause manifest" in e for e in errors), errors)

    def test_no_runtime_activation_or_work_prompt_budget_increase_is_claimed(self):
        catalog = tt.read_json(ROOT / coverage.METADATA)
        deferred = tt.read_json(ROOT / "rules/rule-graph/owner-outcome-budget-deferred.v1.json")["records"]
        self.assertEqual(3, len(deferred))
        self.assertTrue(all(r["status"] == "CANDIDATE" for r in deferred))
        self.assertTrue({r["rule_id"] for r in deferred}.isdisjoint(r["rule_id"] for r in catalog["records"]))
        contract = tt.compile_contract(catalog, tt.read_json(ROOT / "scripts/instruction-layering-profile.json"), tt.read_json(ROOT / coverage.WORK_TASK), "graph")
        self.assertTrue(contract["usable"])
        self.assertLessEqual(len(contract["rendered_contract"].encode()), 32768)
        self.assertNotIn(CLAUSES[0], contract["rendered_contract"])
        requirement = json.loads((ROOT / "docs/requirements/2026-10-24-research-objective-anchor.owner-requirement.json").read_text())
        self.assertIn("NOT_IMPLEMENTED", {s["disposition"] for s in requirement["execution_surfaces"]})
        self.assertIn("do not prove", " ".join(requirement["nonclaims"]))


if __name__ == "__main__":
    unittest.main()
