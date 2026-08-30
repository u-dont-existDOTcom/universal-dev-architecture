from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SupervisedLongTaskHandoffProtocolTests(unittest.TestCase):
    def setUp(self) -> None:
        self.projections = (
            ROOT / "AGENTS.md",
            ROOT / "patterns" / "codex-github-operating-system.md",
            ROOT / "templates" / "AGENTS-CODEX.md",
            ROOT / "templates" / "AGENTS-UNIVERSAL-BOOTSTRAP.md",
        )

    def test_chat_github_and_self_contained_handoff_are_projected(self) -> None:
        required = (
            "Chat as the owner-facing supervisor",
            "GitHub as the canonical durable state",
            "full self-contained handoff",
            "fresh Codex worker",
            "acceptance criteria",
            "completed/current/remaining work",
            "next safe action",
            "without the old chat",
        )
        self._assert_every_projection_contains(required)

    def test_pro_extra_high_and_domain_defaults_are_projected(self) -> None:
        required = (
            "Brave to open a new Pro chat",
            "GitHub link alone is insufficient",
            "use GPT with extra-high reasoning instead of Pro",
            "therapy-bot work",
            "therapy or clinical-conceptual considerations",
            "AskRigor work",
            "research-methodology or scientific considerations",
            "article work",
            "unless it is unusually complex",
        )
        self._assert_every_projection_contains(required)

    def test_decision_and_failure_behavior_prevent_stalls(self) -> None:
        required = (
            "genuine owner decision involving material tradeoffs",
            "continue automatically without asking for approval",
            "Write supervisory decisions and updated status back",
            "If Brave or Pro is unavailable",
            "record the exact capability failure",
            "pause only when required supervision remains unavailable",
        )
        self._assert_every_projection_contains(required)

    def test_lesson_index_routes_protocol(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertIn("Chat as supervisor and GitHub canonical", index)
        self.assertIn("Brave Pro or GitHub-capable extra-high reasoning", index)

    def test_provenance_preserves_owner_source_limits_and_failure_rule(self) -> None:
        audit = (
            ROOT / "audits" / "2026-08-30-supervised-long-task-handoff-protocol.md"
        ).read_text(encoding="utf-8")
        required = (
            "Joel established a cross-project protocol",
            "owner-specific workflow preferences",
            "not empirical claims",
            "secret, privacy, confidentiality, copyright, access, and data-sharing rules",
            "does not broaden task scope",
            "If Brave or Pro is unavailable",
            "required supervision remains unavailable",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, audit)

    def _assert_every_projection_contains(self, required: tuple[str, ...]) -> None:
        for path in self.projections:
            with self.subTest(path=path):
                text = path.read_text(encoding="utf-8")
                for phrase in required:
                    with self.subTest(phrase=phrase):
                        self.assertIn(phrase, text)


if __name__ == "__main__":
    unittest.main()
