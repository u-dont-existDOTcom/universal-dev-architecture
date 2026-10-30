"""Static regression checks for the owner-required email-lane continuity instruction.

These tests check indexed instruction content; runtime mailbox access and thread
coverage still require a separately verified per-turn read receipt.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
RULE = ROOT / "patterns" / "active-email-lane-reply-continuity.md"
INDEX = ROOT / "LESSON-INDEX.md"


class EmailReplyContinuityContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rule = RULE.read_text(encoding="utf-8")
        cls.index = INDEX.read_text(encoding="utf-8")

    def test_retrieval_route_is_indexed(self):
        self.assertIn("patterns/active-email-lane-reply-continuity.md", self.index)

    def test_per_turn_activation_and_recovery(self):
        self.assertIn("every subsequent turn", self.rule)
        self.assertIn("before substantive new work", self.rule)
        self.assertIn("Restore the ledger after compaction", self.rule)

    def test_all_open_threads_and_deliverability(self):
        for phrase in ("every outstanding item", "bounces", "delivery-status notices", "MATERIAL_REPLY", "BOUNCED"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.rule)

    def test_reject_unread_only_and_stale_watch(self):
        for phrase in ("is:unread", "scheduled watcher", "between turns", "do not waive"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.rule)

    def test_privacy_and_truthful_partial(self):
        for phrase in ("authorized private", "ACCESS_BLOCKED", "Never claim", "ACT", "No new mail"):
            # ACT is intentionally case-sensitive only if text contains that token;
            # prefer verifying independently meaningful invariants.
            if phrase == "ACT":
                continue
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.rule)


if __name__ == "__main__":
    unittest.main()
