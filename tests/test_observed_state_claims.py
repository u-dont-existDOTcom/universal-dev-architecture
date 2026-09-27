from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "reasoning-selection.md"


class ObservedStateClaimTests(unittest.TestCase):
    def test_current_state_claims_need_a_current_check_or_an_estimate_label(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        section = text.split("## Evidence, specificity, and target discipline", 1)[1].split("\n## ", 1)[0]
        for phrase in (
            "perform an **observed-state check**",
            "are observations only when a check made in the current turn shows them",
            "arithmetic, memory, summaries, earlier turns, and plausible inference do not count",
            "say in the same sentence that the claim is an estimate or last-known state, and give its basis and age",
            "run the check when one is available and cheap",
            "correct it to the owner unprompted in the next message",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, section)

    def test_correction_is_recorded_in_provenance(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        provenance = text.split("## Provenance", 1)[1]
        self.assertIn("observed-state check was added on 2026-09-27", provenance)


if __name__ == "__main__":
    unittest.main()
