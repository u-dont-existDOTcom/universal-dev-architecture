from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PaidCommitmentRecommendationPreflightTests(unittest.TestCase):
    def test_root_routes_paid_commitments_to_recommendation_preflight(self) -> None:
        text = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        required = (
            "Paid purchase and subscription recommendation gate",
            "new recurring charge",
            "prepaid/annual plan",
            "account/workspace/surface/mode/workload",
            "what the purchase does not replace",
            "cheapest reversible path",
            "do not recommend the purchase",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_canonical_pattern_blocks_workspace_scope_and_replacement_errors(self) -> None:
        text = (
            ROOT / "patterns" / "recommendation-preflight-integrity.md"
        ).read_text(encoding="utf-8")
        required = (
            "Software plans, subscriptions, and paid replacements",
            "account-level from workspace-level entitlement",
            "what the purchase does not replace",
            "Allowance fit",
            "Billing separation",
            "minimum seat counts",
            "Workflow continuity",
            "cheapest reversible path",
            "Do not recommend annual prepayment merely because it lowers the monthly equivalent",
            "decision-relevant entitlement",
            "new value proposition",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_lesson_index_routes_subscription_entitlement_checks(self) -> None:
        text = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        for phrase in (
            "account/workspace/surface entitlement",
            "allowance fit",
            "billing-pool separation",
            "replacement proof",
            "reversible validation before annual/prepaid commitments",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)


if __name__ == "__main__":
    unittest.main()
