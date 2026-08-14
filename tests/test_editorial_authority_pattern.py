from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "LESSON-INDEX.md"
PATTERN = ROOT / "patterns" / "editorial-authority-and-lossless-editing.md"


class EditorialAuthorityPatternTests(unittest.TestCase):
    def test_lesson_index_routes_to_the_pattern(self) -> None:
        index = INDEX.read_text(encoding="utf-8")

        self.assertIn("patterns/editorial-authority-and-lossless-editing.md", index)
        self.assertIn("owner locks", index)
        self.assertIn("reversible deletion", index)

    def test_pattern_covers_authority_and_losslessness(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")

        required = (
            "## Prove authority before editing",
            "## Keep one complete, self-contained artifact family",
            "## Preserve exact owner locks and protected functions",
            "## Make deletion and consolidation reversible",
            "## Keep citations and detector evidence subordinate",
            "## Bind publication and export provenance",
            "## Represent blocked and empty states truthfully",
            "competing masters",
            "unincorporated ideas",
            "additional artifacts",
            "symlink",
            "hash",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

    def test_pattern_records_exact_joel_origin(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")

        required = (
            "u-dont-existDOTcom/joel-articles",
            "c0d73ba6e983a4d93ceec1799ad4ac7f526b61db",
            "dcde124ef2f983c5027d85481f9aa33b2c353d9b",
            "31785508088",
            "c28ad9c03adb6275228e9cfc7356c39b24949e6d",
            "4b7825f03702271c6b5c61dfbe98f34a82fe0a0c",
            "8ac3b6e989c946d4ebce29f286486515437b0fe6",
        )
        for identifier in required:
            with self.subTest(identifier=identifier):
                self.assertIn(identifier, pattern)

    def test_pattern_states_limits_and_project_local_boundaries(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")

        self.assertIn("## Project-local choices", pattern)
        self.assertIn("## Limits", pattern)
        self.assertIn("does not prove factual truth", pattern)
        self.assertIn("does not grant publication authority", pattern)
        self.assertIn("license", pattern)
        self.assertIn("privacy", pattern)
        self.assertIn("detector use is optional", pattern)


if __name__ == "__main__":
    unittest.main()
