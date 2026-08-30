from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SupervisionAssurancePlanesPatternTests(unittest.TestCase):
    def test_pattern_separates_alignment_planes_and_fail_closes(self) -> None:
        pattern = (
            ROOT / "patterns" / "supervision-assurance-planes-and-pro-meta-review.md"
        ).read_text(encoding="utf-8")
        required = (
            "worker_to_contract: GREEN",
            "contract_to_owner: RED",
            "root_task_traffic: RED",
            "Independent supervisor receipt",
            "Objective-reconciliation matrix",
            "Do not average the two states",
            "OBJECTIVE_SOURCE_MISSING",
            "COMPLETION_CLAIM_UNSUPPORTED",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

    def test_machine_readable_templates_expose_required_planes(self) -> None:
        reconciliation = json.loads(
            (ROOT / "templates" / "OBJECTIVE-RECONCILIATION.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(reconciliation["schemaVersion"], 1)
        self.assertIn("independentSupervisorReceipt", reconciliation)
        self.assertIn("workerToContract", reconciliation["alignment"])
        self.assertIn("contractToOwner", reconciliation["alignment"])
        self.assertEqual(reconciliation["completionClaim"]["type"], "WORKING")
        self.assertFalse(reconciliation["result"]["rootTerminalizationAllowed"])

        feedback = json.loads(
            (ROOT / "templates" / "SUPERVISION-DESIGN-FEEDBACK.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertTrue(feedback["routing"]["proMetaReviewRequired"])
        self.assertTrue(
            feedback["routing"]["sharedProScopeKey"].startswith(
                "supervision-architecture/"
            )
        )
        self.assertEqual(feedback["status"], "PENDING_PRO_META_REVIEW")

        research = json.loads(
            (ROOT / "templates" / "RESEARCH-SUPERVISION-VERDICT.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertIn("operationalAlignment", research)
        self.assertIn("scientificAdequacy", research)
        self.assertIn("releaseAdequacy", research)
        self.assertFalse(research["releasePermission"]["allowed"])

    def test_article_regression_keeps_worker_green_contract_red(self) -> None:
        fixture = json.loads(
            (
                ROOT
                / "evals"
                / "mission-control"
                / "contract-laundering-article-humanization-13.82.json"
            ).read_text(encoding="utf-8")
        )
        self.assertEqual(fixture["schema_version"], 2)
        self.assertEqual(fixture["alignment"]["worker_to_contract"], "GREEN")
        self.assertEqual(fixture["alignment"]["contract_to_owner"], "DIVERGED")
        self.assertEqual(fixture["alignment"]["overall_traffic"], "RED")
        self.assertEqual(fixture["completion_claim_type"], "READY_FOR_OWNER_REVIEW")
        self.assertEqual(
            fixture["expected"]["required_directive"], "CONTINUE_HUMANIZATION"
        )
        self.assertTrue(fixture["expected"]["root_task_must_remain_open"])

    def test_bootstrap_routes_substantive_design_feedback_to_shared_pro(self) -> None:
        bootstrap = (
            ROOT / "templates" / "CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md"
        ).read_text(encoding="utf-8")
        required = (
            "Machine-checkable dual alignment and typed completion",
            "Supervision-design improvements and questions must reach shared Pro meta-review",
            "supervision-architecture/<epoch>",
            "A worker with no substantive supervision-design improvement or question does not need a ceremonial Pro check-in",
            "operational_alignment",
            "scientific_adequacy",
            "release_adequacy",
            "templates/SUPERVISION-DESIGN-FEEDBACK.json",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, bootstrap)

    def test_indexes_and_pilot_route_current_controls(self) -> None:
        lesson_index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        docs_index = (ROOT / "docs" / "INDEX.md").read_text(encoding="utf-8")
        pilot = (
            ROOT
            / "docs"
            / "exec-plans"
            / "2026-08-30-mission-control-dual-alignment-and-pro-meta-review-addendum.md"
        ).read_text(encoding="utf-8")
        for text in (lesson_index, docs_index):
            self.assertIn(
                "patterns/supervision-assurance-planes-and-pro-meta-review.md",
                text,
            )
            self.assertIn("templates/OBJECTIVE-RECONCILIATION.json", text)
            self.assertIn("templates/SUPERVISION-DESIGN-FEEDBACK.json", text)
            self.assertIn("templates/RESEARCH-SUPERVISION-VERDICT.json", text)
        self.assertIn("GREEN + DIVERGED -> overall RED", pilot)
        self.assertIn("shared Pro meta-review chat", pilot)


if __name__ == "__main__":
    unittest.main()
