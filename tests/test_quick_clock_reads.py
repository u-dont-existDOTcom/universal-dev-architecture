from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIREMENT = ROOT / "docs" / "requirements" / "2026-09-30-quick-clock-reads.owner-requirement.json"


class QuickClockReadsTests(unittest.TestCase):
    def setUp(self) -> None:
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.per_turn = agents.split("## Per-turn bootstrap invariants", 1)[1].split("\n## ", 1)[0]

    def test_clock_rule_sits_in_the_per_turn_invariants(self) -> None:
        for phrase in (
            "Use the first clock available (a clock tool, or `date` in a shell or code tool) and move on",
            "minute precision is enough",
            "Never compare clock sources, weigh their accuracy, or seek a faster one.",
            "treat the clock tool as cached: read a shell or code clock once, or say the later time could not be read",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.per_turn)

    def test_clock_rule_follows_the_clock_read_rule(self) -> None:
        self.assertLess(
            self.per_turn.index("Read an available current clock for this turn"),
            self.per_turn.index("Use the first clock available"),
        )

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
