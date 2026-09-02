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

    def test_automatic_continuation_preserves_real_pause_boundaries(self) -> None:
        """Continuous advancement must not silently expand authority or risk."""
        pause_boundaries = (
            "genuine missing owner decision",
            "new authority",
            "destructive or irreversible risk",
            "unavailable permission or credential",
            "spending, publication, or access",
            "explicit request to stop",
        )
        for path in (
            ROOT / "patterns" / "codex-github-operating-system.md",
            ROOT / "templates" / "AGENTS-CODEX.md",
            ROOT / "audits" / "2026-08-15-universal-next-step-continuation-rule.md",
        ):
            with self.subTest(path=path):
                text = path.read_text(encoding="utf-8")
                for boundary in pause_boundaries:
                    with self.subTest(boundary=boundary):
                        self.assertIn(boundary, text)

    def test_exclusive_tasks_require_terminal_response_admission(self) -> None:
        """A routine checkpoint/context boundary must not become a terminal handoff."""
        pattern = (
            ROOT / "patterns" / "terminal-response-admission-and-autonomous-continuation.md"
        ).read_text(encoding="utf-8")
        required_behavior = (
            "ending a response is a controlled terminal action",
            "context compaction or context-window pressure",
            "response/token-budget pressure",
            "a checkpoint or recovery commit",
            "provider cooldown",
            "advance independent safe in-scope work",
            "GET /api/worker-channel/<worker>/finalization",
            "409 terminalResponseAllowed:false",
            "mustContinue:true",
            "REJECT_SAFE_WORK_REMAINS",
            "ALLOW_REASONING_HANDOFF_PAUSE",
            "root task open",
        )
        for behavior in required_behavior:
            with self.subTest(behavior=behavior):
                self.assertIn(behavior, pattern)

    def test_lesson_index_routes_continuous_next_step_advancement(self) -> None:
        """The lesson index must make the universal behavior discoverable."""
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertIn("continuous next-step advancement after owner input", index)
        self.assertIn(
            "continue automatically until the stated goal is complete or a genuine boundary requires a pause",
            index,
        )


if __name__ == "__main__":
    unittest.main()
