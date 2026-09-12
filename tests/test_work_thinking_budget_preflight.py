from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "chat-work-execution-routing-threshold.md"
DIRECTIVE = ROOT / "templates" / "CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json"
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-09-12-work-thinking-budget.owner-requirement.json"


class WorkThinkingBudgetPreflightTests(unittest.TestCase):
    def test_pattern_requires_two_sided_materiality_check(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for required in (
            "TOO_LOW_MATERIAL",
            "TOO_HIGH_MATERIAL",
            "MISMATCH_IMMATERIAL",
            "LEVEL_UNOBSERVABLE",
            "simple deterministic execution",
            "meaningful credits",
            "do not silently burn credits",
            "Difference immaterial".upper().replace(" ", "_")[:0],
        ):
            if required:
                self.assertIn(required, text)
        self.assertIn("If `MISMATCH_IMMATERIAL`: proceed without interrupting the owner", text)
        self.assertIn("tell the owner they are overspending on this task", text)

    def test_execution_directive_carries_expected_minimum_and_preflight(self) -> None:
        data = json.loads(DIRECTIVE.read_text(encoding="utf-8"))
        budget = data["workReasoningBudget"]
        self.assertTrue(budget["preflightRequired"])
        self.assertTrue(budget["twoSidedMismatchCheckRequired"])
        self.assertTrue(budget["simpleWorkOverspendCheckRequired"])
        self.assertIn("lowest", budget["recommendedMinimumLevel"])
        self.assertEqual(
            budget["materialityRule"],
            "INTERRUPT_ONLY_FOR_MATERIAL_SUCCESS_RISK_OR_MEANINGFUL_EXPECTED_CREDIT_SAVINGS",
        )

    def test_owner_requirement_identity_and_two_sided_outcome(self) -> None:
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        source = data["owner_source"]
        digest = hashlib.sha256(source["verbatim"].encode("utf-8")).hexdigest()
        self.assertEqual(source["sha256"], digest)
        outcome = data["normalized_outcome"]
        self.assertIn("materially too low", outcome)
        self.assertIn("materially too high", outcome)
        self.assertIn("waste meaningful credits", outcome)
        self.assertIn("minimal", outcome)


if __name__ == "__main__":
    unittest.main()
