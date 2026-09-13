from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "source-interpretation-provenance.md"


class SourceInterpretationProvenancePatternTests(unittest.TestCase):
    def test_pattern_preserves_claim_scope_and_polarity(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        required = (
            "## Preserve claim scope and polarity",
            "Rejecting a characterization does not by itself reject the underlying factual predicate.",
            "Silence is neither admission nor denial.",
            "A denial of one proposition must not be widened to adjacent propositions.",
            "A qualification must not be rewritten as a categorical acceptance or rejection.",
            "A paraphrase must be no stronger, broader, or more categorical than the source language supports.",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)


if __name__ == "__main__":
    unittest.main()
