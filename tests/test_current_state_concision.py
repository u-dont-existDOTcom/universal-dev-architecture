from __future__ import annotations

import re
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

    def test_gate_evidence_is_durable_and_records_status_and_counts(self) -> None:
        text = CURRENT_STATE.read_text(encoding="utf-8")
        evidence = text.split("## Evidence / artifacts", 1)[1].split("## Remaining", 1)[0]

        self.assertNotIn("see the pull request description", evidence)
        self.assertRegex(
            evidence,
            re.compile(
                r"python3 -m unittest discover -s tests -v`: (?:"
                r"\*\*(?:PASS|FAIL)\*\*[^\n]*\d+ tests?|"
                r"\*\*UNVERIFIED\*\*[^\n]*counts unavailable)",
            ),
        )
        self.assertRegex(
            evidence,
            re.compile(
                r"python3 scripts/audit_codex_github.py --root \. --fail-on error`: "
                r"(?:\*\*(?:PASS|FAIL)\*\*[^\n]*\d+ errors?[^\n]*\d+ warnings?|"
                r"\*\*UNVERIFIED\*\*[^\n]*counts unavailable)",
            ),
        )


if __name__ == "__main__":
    unittest.main()
