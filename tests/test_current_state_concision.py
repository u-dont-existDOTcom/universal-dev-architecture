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


if __name__ == "__main__":
    unittest.main()
