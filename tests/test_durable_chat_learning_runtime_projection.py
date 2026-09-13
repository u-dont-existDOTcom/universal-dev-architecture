from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "durable-chat-learning.md"
INDEX = ROOT / "LESSON-INDEX.md"


class DurableChatLearningRuntimeProjectionTests(unittest.TestCase):
    def test_index_routes_to_durable_learning(self) -> None:
        index = INDEX.read_text(encoding="utf-8")
        self.assertIn("patterns/durable-chat-learning.md", index)

    def test_end_user_lessons_require_runtime_projection(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        required = (
            "Promotion is not runtime deployment.",
            "developer_governance",
            "product_runtime",
            "PROJECTED",
            "NOT_APPLICABLE",
            "DEFERRED",
            "Where should the lesson be remembered?",
            "Where must the lesson execute?",
            "the universal repository contains the rule, therefore public users get it",
            "merged`, `released/deployed`, and `live-verified",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)


if __name__ == "__main__":
    unittest.main()
