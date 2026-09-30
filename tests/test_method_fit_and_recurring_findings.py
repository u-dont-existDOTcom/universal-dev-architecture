from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "reasoning-selection.md"
FRONTIER = ROOT / "patterns" / "executable-frontier-coherence.md"


class MethodFitAndRecurringFindingTests(unittest.TestCase):
    def section(self) -> str:
        text = PATTERN.read_text(encoding="utf-8")
        return text.split("## Evidence, specificity, and target discipline", 1)[1].split("\n## ", 1)[0]

    def test_pattern_matching_is_for_exact_questions_not_meaning(self) -> None:
        section = self.section()
        for phrase in (
            "perform a **pattern-matching fit check**",
            "Pattern matching fits exact, structural, closed-set questions",
            "It does not fit judgments about meaning",
            "No word list makes those judgments in every language people write in",
            "have that model declare its judgment in a form the system then checks exactly",
            "state the check's limit and fail toward the safe side",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, section)

    def test_recurring_findings_stop_local_patching_whatever_their_source(self) -> None:
        section = self.section()
        for phrase in (
            "perform a **recurring-finding check** before writing another local fix",
            "Ask whether the mechanism can decide that class at all or can only enumerate cases of it",
            "A fix that adds another word, pattern, route or special case to a list is a local exception",
            "A third local fix of the same class needs a written reason why redesign is not possible",
            "a repeat reviewer finding is as much evidence as a repeat owner correction",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, section)

    def test_recurrence_diagnosis_fires_on_any_source(self) -> None:
        text = " ".join(FRONTIER.read_text(encoding="utf-8").split())
        self.assertIn("found again by a reviewer, test, CI or evaluation run", text)
        self.assertIn("method-fit defect", text)

    def test_correction_is_recorded_in_provenance(self) -> None:
        provenance = PATTERN.read_text(encoding="utf-8").split("## Provenance", 1)[1]
        self.assertIn("recurring-finding check were added on 2026-09-29", provenance)


if __name__ == "__main__":
    unittest.main()
