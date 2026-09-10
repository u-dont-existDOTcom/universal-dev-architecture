from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "worker-directive-delivery-and-chat-output-budget.md"


class WorkerDirectiveDeliveryOutputBudgetTests(unittest.TestCase):
    def test_pattern_requires_same_turn_runnable_directive(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        required = (
            "the reasoning chat must deliver the runnable execution directive in the same turn",
            "DIRECT_HANDOFF_COMPLETE",
            "OWNER_RUNNABLE_DIRECTIVE_DELIVERED",
            "HANDOFF_BLOCKED",
            "The owner must not have to send a follow-up",
            "A declined direct Work handoff does not erase the obligation",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_pattern_bounds_large_chat_payloads(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        required = (
            "Large reusable operational payloads belong in artifacts, not in chat scrollback",
            "a couple of rendered pages or less",
            ">1,200 words or >8,000 characters",
            "create a `.md` or other appropriate text artifact",
            "Do not split one large directive across several chat messages",
            "Do not duplicate the full artifact inline after linking it",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_root_agents_enforces_pattern(self) -> None:
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        required = (
            "patterns/worker-directive-delivery-and-chat-output-budget.md",
            "Do not stop after explaining what the worker should do",
            "deliver a complete owner-runnable directive",
            "create a `.md` or appropriate text artifact",
            "1,200 words or 8,000 characters",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, agents)

    def test_lesson_is_discoverable_and_has_promotion_record(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        audit = (
            ROOT
            / "audits"
            / "2026-09-10-worker-directive-delivery-and-chat-output-budget.md"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "patterns/worker-directive-delivery-and-chat-output-budget.md", index
        )
        self.assertIn("Originating workflow: AskRigor evaluation supervision", audit)
        self.assertIn("Transfer rationale", audit)
        self.assertIn("Limits", audit)


if __name__ == "__main__":
    unittest.main()
