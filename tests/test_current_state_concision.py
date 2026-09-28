from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CURRENT_STATE = ROOT / "state" / "CURRENT-STATE.md"


class CurrentStateConcisionTests(unittest.TestCase):
    def test_current_state_is_one_concise_recovery_checkpoint(self) -> None:
        text = CURRENT_STATE.read_text(encoding="utf-8")
        lines = text.splitlines()

        self.assertLessEqual(
            len(lines),
            120,
            "CURRENT-STATE.md must route recovery, not retain review transcripts",
        )
        self.assertEqual(1, text.count("## Current checkpoint"))
        self.assertEqual(1, text.count("## Review finding disposition"))
        self.assertNotIn("## Journal work runner Codex review at `", text)

    def test_current_state_records_the_reviewed_commit_as_the_durable_boundary(self) -> None:
        text = CURRENT_STATE.read_text(encoding="utf-8")

        self.assertIn("Last verified durable boundary: `af245cf`", text)
        self.assertRegex(text, r"already contains the two\s+earlier review repairs")
        self.assertNotIn("Baseline: reviewed commit `bd52bbe`", text)
        self.assertNotIn("may collect, commit, and push this working tree", text)


if __name__ == "__main__":
    unittest.main()
