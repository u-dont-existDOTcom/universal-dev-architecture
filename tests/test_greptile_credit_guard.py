"""Verify the owner-specific repository Greptile budget guard stays manual-only."""

import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class GreptileCreditGuardTests(unittest.TestCase):
    def test_no_automatic_greptile_reviews(self):
        p = ROOT / "greptile.json"
        config = json.loads(p.read_text(encoding="utf-8"))
        self.assertEqual([], config["autoReview"])
        self.assertEqual("AUTOMATIC", config["skipReview"])
        self.assertIs(False, config["triggerOnUpdates"])
        self.assertIs(False, config["triggerOnDrafts"])
        self.assertEqual("base", config["effort"])

    def test_manual_review_policy_explicit(self):
        text = (ROOT / "docs" / "ai-tool-radar-roadmap.md").read_text(encoding="utf-8")
        self.assertIn("Greptile credits: default to no review", text)
        self.assertIn("Before any manual Greptile invocation", text)
        self.assertIn("Greptile's confirmed AskRigor findings", text)


if __name__ == "__main__":
    unittest.main()
