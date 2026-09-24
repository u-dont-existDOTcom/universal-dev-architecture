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

    def test_repair_candidate_admission_preserves_direct_outcome(self) -> None:
        pattern = (
            ROOT / "patterns" / "outcome-advancement-and-strategy-efficacy.md"
        ).read_text(encoding="utf-8")
        required = (
            "Repair-candidate admission and evidence ordering",
            "candidate cause",
            "Existing direct evidence first",
            "ALREADY_FALSIFIED",
            "Known-failure regression before broader validation",
            "DEV_PASS_NONVALIDATING",
            "DEV_FAIL",
            "Treat a case as design-independent only if",
            "Do not manufacture a regression case",
            "a development failure can falsify a candidate immediately",
            "do not jump to it while an available earlier rung can already reject the candidate",
            "available direct-outcome evidence can already reject the current repair candidate",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("repair-candidate admission rule before broader validation", agents)

        lesson_index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertIn("development failures reject; development passes do not validate", lesson_index)

        graph = json.loads((ROOT / "rules" / "UDA-RULE-GRAPH.json").read_text())
        node = next(
            item
            for item in graph["nodes"]
            if item["rule_id"] == "outcome-advancement-and-strategy-efficacy"
        )
        self.assertIn("repair/intervention candidate", node["trigger"])
        self.assertIn("direct-outcome failure", node["trigger"])

        receipt = json.loads(
            (ROOT / "templates" / "OUTCOME-PROGRESS-RECEIPT.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertIn("repairAdmission", receipt["strategy"])
        self.assertFalse(receipt["strategy"]["repairAdmission"]["applicable"])
        self.assertEqual(
            receipt["strategy"]["repairAdmission"]["existingDirectEvidenceCheck"],
            "NOT_APPLICABLE",
        )

    def test_repair_candidate_regression_fixture(self) -> None:
        fixture = json.loads(
            (
                ROOT
                / "evals"
                / "method-premise"
                / "repair-candidate-admission.json"
            ).read_text(encoding="utf-8")
        )
        by_id = {item["case_id"]: item for item in fixture["cases"]}
        self.assertEqual(
            by_id["RC-001-known-failure-not-improved"]["expected_strategy_state"],
            "REPLACEMENT_REQUIRED",
        )
        self.assertFalse(
            by_id["RC-001-known-failure-not-improved"]["prospective_validation_admitted"]
        )
        self.assertEqual(
            by_id["RC-002-known-failure-pass-is-nonvalidating"][
                "expected_development_status"
            ],
            "DEV_PASS_NONVALIDATING",
        )
        self.assertFalse(
            by_id["RC-002-known-failure-pass-is-nonvalidating"][
                "full_repair_established"
            ]
        )
        self.assertEqual(
            by_id["RC-003-prior-run-already-falsifies-mechanism"][
                "expected_next_action"
            ],
            "REVISE_CAUSAL_HYPOTHESIS_BEFORE_NEW_DATA",
        )
        self.assertEqual(
            by_id["RC-003-prior-run-already-falsifies-mechanism"][
                "expected_strategy_state"
            ],
            "REPLACEMENT_REQUIRED",
        )
        self.assertFalse(
            by_id["RC-004-no-reproducible-failure"]["development_regression_required"]
        )
        self.assertFalse(
            by_id["RC-005-process-metric-improves-direct-flat"][
                "counts_as_owner_outcome_repair"
            ]
        )
        self.assertEqual(
            by_id["RC-005-process-metric-improves-direct-flat"][
                "expected_strategy_state"
            ],
            "REPLACEMENT_REQUIRED",
        )
        self.assertEqual(
            by_id["RC-006-motivating-case-claimed-independent"][
                "expected_development_status"
            ],
            "DEV_PASS_NONVALIDATING",
        )
        self.assertFalse(
            by_id["RC-006-motivating-case-claimed-independent"][
                "can_count_as_design_independent_validation"
            ]
        )

        pattern = (
            ROOT / "patterns" / "outcome-advancement-and-strategy-efficacy.md"
        ).read_text(encoding="utf-8")
        for case in fixture["cases"]:
            for key in ("expected_strategy_state", "expected_development_status"):
                if key in case:
                    with self.subTest(case=case["case_id"], key=key):
                        self.assertIn(case[key], pattern)

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
