from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "LESSON-INDEX.md"
PATTERN = ROOT / "patterns" / "paid-workflow-safety.md"


class PaidWorkflowSafetyPatternTests(unittest.TestCase):
    def test_lesson_index_routes_to_the_pattern(self) -> None:
        index = INDEX.read_text(encoding="utf-8")

        self.assertIn("patterns/paid-workflow-safety.md", index)
        self.assertIn("paid, privileged, or irreversible", index)

    def test_pattern_covers_the_security_boundaries(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")

        required = (
            "## Registration and dispatch topology",
            "## Separate validation from execution",
            "## Treat environment files as command channels",
            "## Credential and secret boundary",
            "## Archive obsolete workflows without losing provenance",
            "workflow_dispatch",
            "default branch",
            "GITHUB_OUTPUT",
            "CR/LF",
            "persist-credentials: false",
            "snapshot-lock",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

    def test_pattern_records_exact_origin_evidence(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")

        required = (
            "u-dont-existDOTcom/pangram-humanization-lab",
            "8bf49ac0132c2fa55429d78d4ab79997081413a3",
            "81b5cd017e3be088c0638e527ce25f5df6a2f4e8",
            "c8147df0831a3a38589a3df7b17f5d76d899b8f4",
            "f6aed38791db48f494be78ee79239dc8b6bec478",
            "d0d74e0e35fe7994d8e431295881e9b713ee8786",
            "cfc8bd9aff78b0f8c04613248599f8ff853dbefa",
            "208ccd24ba33b9ce46fe1a2e1698aa318a79f45e",
            "e7ad49a2fde26a782c8151cd4612ed4aea48b2b3",
        )
        for identifier in required:
            with self.subTest(identifier=identifier):
                self.assertIn(identifier, pattern)

    def test_pattern_records_sources_and_limits(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")

        self.assertIn(
            "https://docs.github.com/actions/managing-workflow-runs/manually-running-a-workflow",
            pattern,
        )
        self.assertIn(
            "https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands",
            pattern,
        )
        self.assertIn("## Limits", pattern)
        self.assertIn("does not prove", pattern)
        self.assertIn("hosted", pattern)


if __name__ == "__main__":
    unittest.main()
