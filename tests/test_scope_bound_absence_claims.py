from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "reasoning-selection.md"


class ScopeBoundAbsenceClaimTests(unittest.TestCase):
    def test_absence_claims_are_scope_bound_before_owner_questions(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        minimum_owner_choice = text.split("### Minimum-owner-choice rule", 1)[1].split("\n## ", 1)[0]
        for phrase in (
            "check that its premise cannot be settled by lookup",
            "are true only for the scope actually searched",
            "the owner's other repositories",
            "A delegated worker's absence claim inherits that worker's search scope",
            "A question whose premise a lookup would settle is not admitted under this rule.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, minimum_owner_choice)

    def test_correction_is_recorded_in_provenance(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        provenance = text.split("## Provenance", 1)[1]
        self.assertIn("scope-bound absence-claim check was added on 2026-09-26", provenance)


if __name__ == "__main__":
    unittest.main()
