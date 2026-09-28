from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "agent-to-agent-consultation.md"


class AgentToAgentConsultationPatternTests(unittest.TestCase):
    def read(self, relative_path: str) -> str:
        return (ROOT / relative_path).read_text(encoding="utf-8")

    def test_root_index_and_docs_route_the_pattern(self) -> None:
        for relative_path in ("AGENTS.md", "LESSON-INDEX.md", "docs/INDEX.md"):
            with self.subTest(path=relative_path):
                self.assertIn("patterns/agent-to-agent-consultation.md", self.read(relative_path))

    def test_claims_are_scoped_and_settled_in_their_runtime(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "Scope every claim about another agent",
            "state the exact runtime it holds for",
            "Settle it in that runtime",
            "An agent's report about itself is evidence, not proof",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_agents_consult_directly_and_the_owner_is_not_the_channel(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        for phrase in (
            "Talk directly",
            "The owner never carries messages between agents",
            "at most one reconciliation round",
            "A relayed message means the route was missed",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_the_route_is_read_only_and_bounded(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        self.assertIn("codex exec -s read-only", text)
        self.assertIn('claude -p', text)
        self.assertIn('--tools ""', text)
        self.assertIn("Never include credentials or secrets", text)
        self.assertIn("A consultation adds no authority", text)

    def test_owner_specific_example_is_labeled_and_keeps_no_host_path(self) -> None:
        text = PATTERN.read_text(encoding="utf-8")
        self.assertIn("## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)", text)
        example = text.split("## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)", 1)[1]
        self.assertNotIn("~/", example)
        self.assertNotIn("/home/", example)


if __name__ == "__main__":
    unittest.main()
