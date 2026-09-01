from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLAN = (
    ROOT
    / "docs"
    / "exec-plans"
    / "active"
    / "2026-08-31-mission-control-owner-worker-messaging-and-adapter-experiments.md"
)


class MissionControlOwnerWorkerExperimentQueueTests(unittest.TestCase):
    def test_channel_is_ledger_first_and_remote_safe(self) -> None:
        plan = PLAN.read_text(encoding="utf-8")
        required = (
            "append owner event + enqueue delivery",
            "commits both or neither",
            "Network delivery starts only after commit",
            "worker-initiated VPS/cloud connection/poll",
            "The browser never connects directly to an arbitrary worker",
            "Same-ID/different-byte replay is rejected",
            "Symphony behavior is unchanged",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, plan)

    def test_delivery_acknowledgement_and_reconciliation_are_distinct(self) -> None:
        plan = PLAN.read_text(encoding="utf-8")
        required = (
            "RECORDED -> QUEUED -> DELIVERY_ATTEMPTED -> DELIVERED",
            "DELIVERED -> ACKNOWLEDGED -> RECONCILED",
            "DELIVERED` is transport evidence",
            "ACKNOWLEDGED` binds the worker's stated interpretation",
            "RECONCILED` binds a current work-queue publication",
            "DASHBOARD_BEHIND_OWNER",
            "work_queue_published",
            "structured_blocker_recorded",
            "change_proposal_recorded",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, plan)

    def test_hermes_and_n8n_are_bounded_non_authoritative_experiments(self) -> None:
        plan = PLAN.read_text(encoding="utf-8")
        self.assertIn("MC-EXP-HERMES-001", plan)
        self.assertIn("At most three matched", plan)
        self.assertIn("zero critical authority violations", plan)
        self.assertIn("No architecture adoption from these three runs", plan)
        self.assertIn("MC-EVAL-N8N-001", plan)
        self.assertIn("optional edge adapter", plan)
        self.assertIn("n8n is never the event ledger", plan)
        self.assertIn("credible recurring integration flows", plan)

    def test_current_architecture_records_the_implementation_without_adopting_experiments(self) -> None:
        pattern = (
            ROOT / "patterns" / "codex-pro-supervision-mission-control.md"
        ).read_text(encoding="utf-8")
        adapted = (
            ROOT / "tools" / "codex-mission-control" / "ARCHITECTURE.md"
        ).read_text(encoding="utf-8")
        implementation = (
            ROOT / "tools" / "codex-mission-control" / "IMPLEMENTATION-SPEC.md"
        ).read_text(encoding="utf-8")
        docs_index = (ROOT / "docs" / "INDEX.md").read_text(encoding="utf-8")

        for text in (pattern, adapted, implementation, docs_index):
            self.assertIn(
                "2026-08-31-mission-control-owner-worker-messaging-and-adapter-experiments.md",
                text,
            )
        self.assertIn("Implemented owner↔worker messaging channel", pattern)
        self.assertIn("Implemented owner↔worker channel", adapted)
        self.assertIn("Implemented channel and bounded evaluation queue", implementation)
        self.assertIn("Hermes and n8n remain design-ready experiments", implementation)
        self.assertIn("POST /api/mcp", pattern)


if __name__ == "__main__":
    unittest.main()
