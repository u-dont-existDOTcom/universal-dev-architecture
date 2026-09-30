from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-09-30-quick-clock-reads.owner-requirement.json"
LATEST_REQUIREMENT = ROOT / "docs" / "requirements" / "2026-09-30-clock-at-start-and-end.owner-requirement.json"


class QuickClockReadsTests(unittest.TestCase):
    def setUp(self) -> None:
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.per_turn = agents.split("## Per-turn bootstrap invariants", 1)[1].split("\n## ", 1)[0]

    def test_two_read_clock_rule_sits_in_the_per_turn_invariants(self) -> None:
        for phrase in (
            "Read the clock twice per turn and only then: quickly at the start, and again right before writing the final answer",
            "Use the fastest source available, such as a current-time tool or `date -u` in a shell",
            "don't search for the time or deliberate over it, and never read it mid-task",
            "final answer opens with the second reading and says how long the turn took in total",
            "prepend the second reading; the check needs no further reading",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.per_turn)

    def test_old_mid_task_fallback_is_gone(self) -> None:
        self.assertNotIn("If two reads that should differ match exactly", self.per_turn)
        self.assertNotIn("Use the first clock available", self.per_turn)

    def test_literal_output_check_follows_the_clock_read_rule(self) -> None:
        self.assertLess(
            self.per_turn.index("Read the clock twice per turn"),
            self.per_turn.index("Before finalizing every assistant turn"),
        )

    def test_latest_owner_requirement_records_timing_and_supersession(self) -> None:
        data = json.loads(LATEST_REQUIREMENT.read_text(encoding="utf-8"))
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        self.assertIn("quickly at start and quickly right before output", data["owner_statement"])
        self.assertIn("2026-09-30-quick-clock-reads", data["authority"])
        self.assertTrue(any("timezone" in item for item in data["required_behavior"]))

    def test_requirement_quotes_the_owner_and_keeps_the_contract(self) -> None:
        data = json.loads(REQUIREMENT.read_text(encoding="utf-8"))
        self.assertEqual(data["requirement_id"], "2026-09-30-quick-clock-reads")
        self.assertIn("quickest time check", data["owner_statement"])
        self.assertIn("most accurate", data["owner_statement"])
        self.assertIn("owner-protected", data["authority"])
        self.assertIn("the timestamp contract itself is unchanged", data["authority"])
        self.assertEqual(data["origin"]["classification"], "OWNER_REQUIRED")
        for surface in data["execution_surfaces"]:
            if surface["disposition"] in {"DEFERRED", "NOT_APPLICABLE"}:
                with self.subTest(surface=surface["surface"]):
                    self.assertTrue(surface.get("reason"))
        self.assertNotIn("LIVE_VERIFIED", data["learning_state_at_merge"])
        self.assertTrue(data["nonclaims"])


if __name__ == "__main__":
    unittest.main()
