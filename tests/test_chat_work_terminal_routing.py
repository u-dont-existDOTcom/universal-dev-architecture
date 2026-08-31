from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ChatWorkTerminalRoutingTests(unittest.TestCase):
    def test_capability_boundary_is_projected_to_operational_instructions(self) -> None:
        documents = {
            "root agreement": ROOT / "AGENTS.md",
            "root-agent template": ROOT / "templates" / "AGENTS-CODEX.md",
            "routing pattern": ROOT / "patterns" / "chat-work-terminal-routing.md",
            "provenance audit": (
                ROOT
                / "audits"
                / "2026-08-24-chat-work-terminal-routing-owner-policy.md"
            ),
        }
        required_behavior = (
            "Repository involvement alone is not a reason",
            "terminal or shell execution",
            "local-filesystem tooling unavailable in Chat",
            "tests or scripts",
            "command-line Git",
            "bounded ChatGPT Work task",
        )

        for document_name, path in documents.items():
            with self.subTest(document=document_name):
                text = path.read_text(encoding="utf-8")
                for behavior in required_behavior:
                    with self.subTest(behavior=behavior):
                        self.assertIn(behavior, text)

    def test_round_trip_keeps_chat_as_supervisor_without_owner_shuttling(self) -> None:
        documents = (
            ROOT / "AGENTS.md",
            ROOT / "templates" / "AGENTS-CODEX.md",
            ROOT / "patterns" / "chat-work-terminal-routing.md",
        )
        required_behavior = (
            "Chat as the owner-facing supervisor",
            "retrieve its result",
            "originating Chat",
            "without asking the owner to shuttle prompts, logs, files, or results",
        )

        for path in documents:
            with self.subTest(path=path):
                text = path.read_text(encoding="utf-8")
                for behavior in required_behavior:
                    with self.subTest(behavior=behavior):
                        self.assertIn(behavior, text)

    def test_routing_does_not_broaden_authority(self) -> None:
        for path in (
            ROOT / "AGENTS.md",
            ROOT / "templates" / "AGENTS-CODEX.md",
            ROOT / "patterns" / "chat-work-terminal-routing.md",
            ROOT
            / "audits"
            / "2026-08-24-chat-work-terminal-routing-owner-policy.md",
        ):
            with self.subTest(path=path):
                text = path.read_text(encoding="utf-8")
                for boundary in (
                    "scope",
                    "permissions",
                    "spending",
                    "publication",
                    "destructive-action authority",
                ):
                    with self.subTest(boundary=boundary):
                        self.assertIn(boundary, text)

    def test_lesson_index_routes_the_current_pattern(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertIn("patterns/chat-work-terminal-routing.md", index)
        self.assertIn("missing terminal/shell capability", index)

    def test_reasoning_execution_boundary_is_artifact_enforced(self) -> None:
        documents = (
            ROOT / "AGENTS.md",
            ROOT / "templates" / "AGENTS-CODEX.md",
            ROOT / "templates" / "AGENTS-UNIVERSAL-BOOTSTRAP.md",
            ROOT / "patterns" / "chat-work-terminal-routing.md",
            ROOT
            / "audits"
            / "2026-08-24-chat-work-terminal-routing-owner-policy.md",
        )
        required_behavior = (
            "reasoning-complete execution packet",
            "Codex must not invent missing semantic inputs",
            "fail closed",
            "structural validator",
            "separate reasoning context",
        )

        for path in documents:
            with self.subTest(path=path):
                text = path.read_text(encoding="utf-8")
                for behavior in required_behavior:
                    with self.subTest(behavior=behavior):
                        self.assertIn(behavior, text)

    def test_lesson_index_routes_reasoning_execution_boundary(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertIn("reasoning-complete artifact-bound execution packet", index)
        self.assertIn("fail closed", index)
        self.assertIn("self-certify independent judgment", index)


if __name__ == "__main__":
    unittest.main()
