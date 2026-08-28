from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class UniversalNextStepRuleTests(unittest.TestCase):
    def test_owner_input_advances_the_active_task_in_every_operational_projection(
        self,
    ) -> None:
        """An answer or correction must not collapse into an acknowledgment-only turn."""
        documents = {
            "root agreement": ROOT / "AGENTS.md",
            "operational pattern": ROOT / "patterns" / "codex-github-operating-system.md",
            "root-agent template": ROOT / "templates" / "AGENTS-CODEX.md",
            "universal bootstrap template": (
                ROOT / "templates" / "AGENTS-UNIVERSAL-BOOTSTRAP.md"
            ),
            "provenance audit": (
                ROOT / "audits" / "2026-08-15-universal-next-step-continuation-rule.md"
            ),
        }
        required_behavior = (
            "owner answer, correction, upload, or requested clarification",
            "input to the active task, not a completion event",
            "continue automatically to the next safe in-scope action",
            "while the stated goal remains unfinished",
            "Do not return only an acknowledgment",
            "ask the owner what to do next",
        )

        for document_name, path in documents.items():
            with self.subTest(document=document_name):
                text = path.read_text(encoding="utf-8")
                for behavior in required_behavior:
                    with self.subTest(behavior=behavior):
                        self.assertIn(behavior, text)

    def test_authorized_routine_execution_does_not_request_owner_approval(self) -> None:
        """All governed surfaces must advance routine reversible work autonomously."""
        documents = (
            ROOT / "AGENTS.md",
            ROOT / "patterns" / "codex-github-operating-system.md",
            ROOT / "templates" / "AGENTS-CODEX.md",
            ROOT / "templates" / "AGENTS-UNIVERSAL-BOOTSTRAP.md",
            ROOT / "audits" / "2026-08-15-universal-next-step-continuation-rule.md",
        )
        required_behavior = (
            "Chat, Work, Codex/agent execution, and browser or computer-use",
            "routine, reversible, in-scope execution",
            "inspect or edit in-scope files",
            "run commands or tests",
            "debug failures",
            "browse for task-required information",
            "validate results",
            "obvious next step",
            "Do not convert ordinary implementation decisions into owner decisions",
        )

        for path in documents:
            with self.subTest(path=path):
                text = path.read_text(encoding="utf-8")
                for behavior in required_behavior:
                    with self.subTest(behavior=behavior):
                        self.assertIn(behavior, text)

    def test_automatic_continuation_preserves_real_pause_boundaries(self) -> None:
        """Continuous advancement must not silently expand authority or risk."""
        pause_boundaries = (
            "materially different viable choices",
            "destructive or difficult to reverse",
            "publishing, sending communications, purchases or spending",
            "security, account, or privacy consequences",
            "material scope expansion or new authority",
            "genuinely unavailable required information, permission, or credential",
            "explicit request to stop",
        )
        for path in (
            ROOT / "AGENTS.md",
            ROOT / "patterns" / "codex-github-operating-system.md",
            ROOT / "templates" / "AGENTS-CODEX.md",
            ROOT / "templates" / "AGENTS-UNIVERSAL-BOOTSTRAP.md",
            ROOT / "audits" / "2026-08-15-universal-next-step-continuation-rule.md",
        ):
            with self.subTest(path=path):
                text = path.read_text(encoding="utf-8")
                for boundary in pause_boundaries:
                    with self.subTest(boundary=boundary):
                        self.assertIn(boundary, text)

    def test_environment_approval_gate_does_not_gain_a_duplicate_chat_request(
        self,
    ) -> None:
        """Harness approval and owner judgment must remain separate control planes."""
        required_behavior = (
            "execution environment or security sandbox presents an approval gate",
            "do not add a redundant conversational approval request",
        )
        for path in (
            ROOT / "AGENTS.md",
            ROOT / "patterns" / "codex-github-operating-system.md",
            ROOT / "templates" / "AGENTS-CODEX.md",
            ROOT / "templates" / "AGENTS-UNIVERSAL-BOOTSTRAP.md",
            ROOT / "audits" / "2026-08-15-universal-next-step-continuation-rule.md",
        ):
            with self.subTest(path=path):
                text = path.read_text(encoding="utf-8")
                for behavior in required_behavior:
                    with self.subTest(behavior=behavior):
                        self.assertIn(behavior, text)

    def test_lesson_index_routes_continuous_next_step_advancement(self) -> None:
        """The lesson index must make the universal behavior discoverable."""
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertIn("continuous next-step advancement after owner input", index)
        self.assertIn("autonomous routine reversible execution", index)
        self.assertIn(
            "continue automatically until the stated goal is complete or a genuine boundary requires a pause",
            index,
        )


if __name__ == "__main__":
    unittest.main()
