from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CURRENT_STATE = ROOT / "state" / "CURRENT-STATE.md"
TASK_STATES = ROOT / "state" / "tasks"


class CurrentStateConcisionTests(unittest.TestCase):
    def state_files(self) -> list[Path]:
        return [CURRENT_STATE, *sorted(TASK_STATES.glob("*.md"))]

    def test_state_files_are_concise_single_checkpoints(self) -> None:
        for path in self.state_files():
            with self.subTest(path=path.relative_to(ROOT)):
                text = path.read_text(encoding="utf-8")
                self.assertLessEqual(len(text.splitlines()), 120)
                self.assertEqual(1, text.count("## Current checkpoint"))
                self.assertLessEqual(text.count("## Review finding disposition"), 1)
                self.assertNotIn("## Journal work runner Codex review at `", text)

    def test_repository_entry_point_routes_to_one_file_per_task(self) -> None:
        text = CURRENT_STATE.read_text(encoding="utf-8")
        self.assertIn("state/tasks/", text)
        self.assertIn("Each task has one file", text)
        self.assertIn("every `/`", text)

    def test_gate_evidence_is_durable_and_records_status_and_counts(self) -> None:
        task_states = sorted(TASK_STATES.glob("*.md"))
        self.assertTrue(task_states, "At least one task checkpoint is required")
        for path in task_states:
            with self.subTest(path=path.relative_to(ROOT)):
                text = path.read_text(encoding="utf-8")
                evidence = text.split("## Evidence / artifacts", 1)[1].split("\n## ", 1)[0]

                self.assertNotIn("see the pull request description", evidence)
                self.assertRegex(
                    evidence,
                    re.compile(
                        r"python3 -m unittest discover -s tests -v`: (?:"
                        r"\*\*(?:PASS|FAIL)\*\*[^\n]*\d+ tests?|"
                        r"\*\*UNVERIFIED\*\*[^\n]*counts unavailable)",
                    ),
                )
                self.assertRegex(
                    evidence,
                    re.compile(
                        r"python3 scripts/audit_codex_github.py --root \. --fail-on error`: "
                        r"(?:\*\*(?:PASS|FAIL)\*\*[^\n]*\d+ errors?[^\n]*\d+ warnings?|"
                        r"\*\*UNVERIFIED\*\*[^\n]*counts unavailable)",
                    ),
                )

    def test_checkpoint_has_a_recovery_action_without_stale_placeholders(self) -> None:
        for path in self.state_files():
            with self.subTest(path=path.relative_to(ROOT)):
                text = path.read_text(encoding="utf-8")
                for heading in ("Current checkpoint", "Remaining", "Next safe action"):
                    section = text.split(f"## {heading}", 1)[1].split("\n## ", 1)[0]
                    self.assertTrue(section.strip())
                self.assertNotIn("replace-with", text)
if __name__ == "__main__":
    unittest.main()
