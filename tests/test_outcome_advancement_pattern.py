from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class OutcomeAdvancementPatternTests(unittest.TestCase):
    def test_pattern_separates_progress_from_alignment(self) -> None:
        pattern = (
            ROOT / "patterns" / "outcome-advancement-and-strategy-efficacy.md"
        ).read_text(encoding="utf-8")
        required = (
            "worker_to_contract_alignment: GREEN",
            "contract_to_owner_alignment: MATCH",
            "outcome_advancement: REGRESSING",
            "strategy_efficacy: REPLACEMENT_REQUIRED",
            "overall_control_state: RED",
            "The owner must never have to ask the worker manually",
            "Do not average these planes",
            "STRATEGY_REPLACEMENT_REQUIRED",
            "ACTIVITY_PROGRESS_CONFUSION",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

    def test_progress_receipt_exposes_required_fields(self) -> None:
        receipt = json.loads(
            (ROOT / "templates" / "OUTCOME-PROGRESS-RECEIPT.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(receipt["schemaVersion"], 1)
        self.assertIn("outcomeAdvancement", receipt["controlPlanes"])
        self.assertIn("efficacy", receipt["strategy"])
        self.assertIn("baseline", receipt["directOutcomeEvidence"])
        self.assertIn("current", receipt["directOutcomeEvidence"])
        self.assertIn("best", receipt["directOutcomeEvidence"])
        self.assertTrue(receipt["intervention"]["required"])
        self.assertTrue(receipt["intervention"]["sameStrategyWorkHeld"])

    def test_somatic_fixture_fails_healthy_projection(self) -> None:
        fixture = json.loads(
            (
                ROOT
                / "evals"
                / "mission-control"
                / "outcome-regression-somatic-r15.json"
            ).read_text(encoding="utf-8")
        )
        self.assertEqual(fixture["alignment"]["worker_to_contract"], "GREEN")
        self.assertEqual(fixture["alignment"]["contract_to_owner"], "MATCH")
        values = [item["value"] for item in fixture["measurements"]]
        self.assertLess(values[-1], values[0])
        self.assertEqual(fixture["expected"]["outcome_advancement"], "REGRESSING")
        self.assertEqual(
            fixture["expected"]["strategy_efficacy"], "REPLACEMENT_REQUIRED"
        )
        self.assertEqual(fixture["expected"]["overall_control_state"], "RED")
        self.assertFalse(
            fixture["expected"]["same_strategy_continuation_allowed"]
        )
        self.assertTrue(
            fixture["expected"]["progress_audit_triggered_without_owner_prompt"]
        )

    def test_bootstrap_requires_progress_controls(self) -> None:
        bootstrap = (
            ROOT / "templates" / "CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md"
        ).read_text(encoding="utf-8")
        required = (
            "Machine-checkable outcome advancement and strategy efficacy",
            "templates/OUTCOME-PROGRESS-RECEIPT.json",
            "The owner must not have to ask whether substantial work made progress",
            "strategy_efficacy REPLACEMENT_REQUIRED",
            "Commits, tests, audits, packets, documentation",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, bootstrap)

    def test_docs_and_template_index_route_progress_pattern(self) -> None:
        docs = (ROOT / "docs" / "INDEX.md").read_text(encoding="utf-8")
        templates = (ROOT / "templates" / "README.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("patterns/outcome-advancement-and-strategy-efficacy.md", docs)
        self.assertIn("templates/OUTCOME-PROGRESS-RECEIPT.json", docs)
        self.assertIn("OUTCOME-PROGRESS-RECEIPT.json", templates)
        self.assertIn("outcome advancement", templates.lower())


if __name__ == "__main__":
    unittest.main()
