from __future__ import annotations

import json
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
            "duplicate the full artifact inline after linking it",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_root_agents_enforces_pattern(self) -> None:
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        required = (
            "patterns/worker-directive-delivery-and-chat-output-budget.md",
            "same-turn runnable directive",
            "long operational payloads go to `.md`/text artifacts",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, agents)

    def test_output_budget_is_a_per_turn_rule_for_any_recipient(self) -> None:
        # 2026-09-24 owner correction: takeover handoffs were pasted inline because the rule
        # only activated for Work handoffs. It must sit in the per-turn invariants.
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        per_turn = agents.split("## Per-turn bootstrap invariants", 1)[1].split("\n## ", 1)[0]
        for phrase in (
            "**Every turn:** reusable output over ~8,000 characters",
            "goes in a file, for any recipient",
            "patterns/worker-directive-delivery-and-chat-output-budget.md",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, per_turn)
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "every reusable long output, on every turn, on every surface, for every recipient",
            "handoffs, takeover or continuation packets for any agent",
            "say which tool failed",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)
        graph = json.loads((ROOT / "rules" / "UDA-RULE-GRAPH.json").read_text(encoding="utf-8"))
        nodes = {n["rule_id"]: n for n in graph["nodes"]}
        budget = nodes["chat-output-budget"]
        self.assertIn("handoff or continuation packet for any agent", budget["trigger"])
        self.assertIn("final-delivery", budget["enforcement_phase"])
        self.assertEqual(budget["requires"], [], "output budgeting must not pull in Work routing")
        worker = nodes["worker-directive-delivery-and-chat-output-budget"]
        self.assertIn("Worker execution is selected", worker["trigger"])
        self.assertIn("chat-work-execution-routing-threshold", worker["requires"])

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
