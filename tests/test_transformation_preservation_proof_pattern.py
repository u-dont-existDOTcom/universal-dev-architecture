from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "LESSON-INDEX.md"
PATTERN = ROOT / "patterns" / "transformation-preservation-proof.md"
AUDIT = ROOT / "audits" / "2026-08-22-joel-articles-transformation-preservation-proof.md"


CORE_PHRASES = (
    "freeze source authority",
    "authorized-change whitelist",
    "Forward traceability: source → target",
    "Reverse traceability: target → authority",
    "Zero-unexplained-delta gate",
    "translation validation",
    "mutation testing",
    "downstream green result cannot override this gate",
)


def missing_core(text: str) -> set[str]:
    return {phrase for phrase in CORE_PHRASES if phrase not in text}


class TransformationPreservationProofPatternTests(unittest.TestCase):
    def test_lesson_index_routes_to_pattern(self) -> None:
        index = INDEX.read_text(encoding="utf-8")
        self.assertIn("patterns/transformation-preservation-proof.md", index)
        self.assertIn("zero unexplained substantive deltas", index)
        self.assertIn("bidirectional", index)

    def test_pattern_contains_complete_bidirectional_gate(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        self.assertEqual(missing_core(pattern), set())
        self.assertIn("source → target", pattern)
        self.assertIn("target → authority", pattern)
        self.assertIn("Anything outside the whitelist is presumed invariant", pattern)
        self.assertIn("Unexplained additions are failures too", pattern)

    def test_removing_forward_traceability_breaks_contract(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        mutant = pattern.replace("## 5. Forward traceability: source → target", "## 5. Source coverage", 1)
        self.assertIn("Forward traceability: source → target", missing_core(mutant))

    def test_removing_reverse_traceability_breaks_contract(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        mutant = pattern.replace("## 6. Reverse traceability: target → authority", "## 6. Target review", 1)
        self.assertIn("Reverse traceability: target → authority", missing_core(mutant))

    def test_removing_zero_unexplained_delta_gate_breaks_contract(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        mutant = pattern.replace("## 7. Zero-unexplained-delta gate", "## 7. Completion", 1)
        self.assertIn("Zero-unexplained-delta gate", missing_core(mutant))

    def test_pattern_keeps_downstream_evaluation_subordinate(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        required = (
            "performance improvement does not prove behavioral preservation",
            "detector improvement does not prove semantic fidelity",
            "readability improvement does not prove provenance preservation",
            "successful rendering does not prove native-object identity",
            "schema validation does not prove data meaning",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

    def test_promotion_audit_is_closed_and_exact(self) -> None:
        audit = AUDIT.read_text(encoding="utf-8")
        self.assertIn("Status: **promoted**", audit)
        self.assertIn("u-dont-existDOTcom/universal-dev-architecture#32", audit)
        self.assertIn("c59dd24f4f18814cae4af516d17f46087fd839a1", audit)
        self.assertIn("32540594665", audit)
        self.assertNotIn("promoted-candidate", audit)

    def test_origin_and_limits_remain_explicit(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        audit = AUDIT.read_text(encoding="utf-8")
        self.assertIn("u-dont-existDOTcom/joel-articles", pattern)
        self.assertIn("## Limits", pattern)
        self.assertIn("Natural-language semantic equivalence cannot generally be proven", pattern)
        self.assertIn("COMPOSE + ADAPT", audit)
        self.assertIn("This is not claimed as a novel formal method", audit)


if __name__ == "__main__":
    unittest.main()
