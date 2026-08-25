from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "executable-frontier-coherence.md"
AUDIT = ROOT / "audits" / "2026-08-25-askrigor-executable-frontier-coherence.md"


class ExecutableFrontierCoherenceTests(unittest.TestCase):
    def test_index_and_docs_route_controller_frontier_failures(self) -> None:
        for relative_path in ("LESSON-INDEX.md", "docs/INDEX.md"):
            text = (ROOT / relative_path).read_text(encoding="utf-8")
            self.assertIn("patterns/executable-frontier-coherence.md", text)

    def test_nonfinal_state_requires_work_or_terminal_boundary(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "Every authoritative nonfinal state must expose a coherent executable frontier",
            "Never emit an ordinary continue state with no server-directed work",
            "Never map absence of a next capability to finalization",
            "retryable work remains",
            "explicit blocked or bounded output",
            "One terminal lane cannot suppress unrelated executable lanes",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_operation_frontier_projection_and_receipts_stay_aligned(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "operation, frontier, and product projection aligned",
            "Preserve valid earlier results",
            "A retryable failure remains executable",
            "progress recorded while the operation remains in progress",
            "blocked retryable",
            "blocked terminal",
            "resulting authoritative state",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_wrapper_cannot_weaken_specialist_contract(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "test the composition boundary",
            "compact integration wrapper quietly weakens the specialist contract",
            "preserves the specialist contract's minimum breadth",
            "Wrapper weakens specialist breadth",
            "wrapper-plus-worker tests",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text, msg=phrase)

    def test_recurring_failure_routes_to_architecture_not_more_prose(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        self.assertIn("repeatedly corrected the same observable failure", text)
        self.assertIn("state-machine, projection, integration, or verification defect", text)
        self.assertIn("Do not blindly add another prose reminder", text)

    def test_promotion_preserves_source_and_limits(self) -> None:
        pattern = PATTERN.read_text(encoding="utf-8")
        audit = AUDIT.read_text(encoding="utf-8")
        for text in (pattern, audit):
            self.assertIn("0f706fcb07c37eea14267688715d091ccba72f1f", text)
            self.assertIn("ab2433c5d774081dff4fecb2f78600b213b250a2", text)
        self.assertIn("u-dont-existDOTcom/AskRigor", audit)
        self.assertIn("The pattern enforces coherent state and liveness, not semantic truth", audit)


if __name__ == "__main__":
    unittest.main()
