import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class RecoveredReasoningPatternsTests(unittest.TestCase):
    def test_normality_pattern_preserves_frequency_target(self):
        text = (ROOT / "patterns/normality-base-rate-target-preservation.md").read_text()
        self.assertIn("Mechanistic plausibility and population frequency are different variables", text)
        self.assertIn("population prevalence or distribution of the exact observation", text)
        self.assertIn("possible / mechanistically plausible", text)
        self.assertIn("common / typical in the relevant population", text)

    def test_interview_pattern_preserves_independence_and_information_gain(self):
        text = (ROOT / "patterns/interview-evidence-information-gain.md").read_text()
        self.assertIn("Specificity is not independence", text)
        self.assertIn("Exception-first recurrence probing", text)
        self.assertIn("Do not collect evidence by format quota", text)
        self.assertIn("Expected-information-gain gate", text)

    def test_indexes_route_both_patterns(self):
        lessons = (ROOT / "LESSON-INDEX.md").read_text()
        docs = (ROOT / "docs/INDEX.md").read_text()
        for name in ("normality-base-rate-target-preservation.md", "interview-evidence-information-gain.md"):
            self.assertIn(name, lessons)
            self.assertIn(name, docs)


if __name__ == "__main__":
    unittest.main()
