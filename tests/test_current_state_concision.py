from __future__ import annotations

import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.task_checkpoint_path import checkpoint_path


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
        self.assertIn("scripts/task_checkpoint_path.py", text)

    def test_task_checkpoints_have_one_derived_file_per_identity(self) -> None:
        identities: set[tuple[str, str]] = set()
        for path in sorted(TASK_STATES.glob("*.md")):
            with self.subTest(path=path.relative_to(ROOT)):
                text = path.read_text(encoding="utf-8")
                branch = re.search(r"(?m)^- Branch: `(.*)`\.$", text)
                task_id = re.search(r"(?m)^- Task ID: `(.*)`\.$", text)
                self.assertIsNotNone(branch)
                self.assertIsNotNone(task_id)
                if branch is None or task_id is None:
                    continue
                identity = (branch.group(1), task_id.group(1))
                self.assertNotIn(identity, identities)
                identities.add(identity)
                self.assertEqual(checkpoint_path(*identity), str(path.relative_to(ROOT)))

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

    def test_pr_297_recovery_checkpoints_route_past_published_repair(self) -> None:
        for name in (
            "task-c9c0fffdc4040cf56325d5d487b6f8dbdb5615432ed48f292abbebd7c74ecc22.md",
            "task-42196ace1e80fec5b957f664ae6f352337b7324c7f0ceeb6526c612bf7a35894.md",
        ):
            with self.subTest(path=name):
                text = (TASK_STATES / name).read_text(encoding="utf-8")
                remaining = text.split("## Remaining", 1)[1].split("\n## ", 1)[0]
                next_action = text.split("## Next safe action", 1)[1].split("\n## ", 1)[0]

                self.assertNotRegex(remaining + next_action, r"(?i)\brunner\b[^\n]*\b(?:commit|push)\b")

    def test_pr_297_recovery_checkpoints_can_advance_without_old_commit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            task_states = Path(directory)
            for name in (
                "task-c9c0fffdc4040cf56325d5d487b6f8dbdb5615432ed48f292abbebd7c74ecc22.md",
                "task-42196ace1e80fec5b957f664ae6f352337b7324c7f0ceeb6526c612bf7a35894.md",
            ):
                (task_states / name).write_text(
                    "## Current checkpoint\n- A newer durable boundary.\n"
                    "## Remaining\n- Verify the next CI run.\n"
                    "## Next safe action\n- Inspect that CI run.\n",
                    encoding="utf-8",
                )
            with mock.patch.dict(globals(), {"TASK_STATES": task_states}):
                self.test_pr_297_recovery_checkpoints_route_past_published_repair()

    def test_pr_340_recovery_checkpoints_route_past_committed_handoff(self) -> None:
        for name in (
            "task-5e54bcd1e5766e40fe276c2f61bbb571a2ee3bb0febddf6b7a2a44309fc30f0b.md",
            "task-bb6e46e5581cf4d85c63d1e63cbd675d51203ca44658f9b15a187af662aedc7c.md",
        ):
            text = (TASK_STATES / name).read_text(encoding="utf-8")
            with self.subTest(path=name, section="Current checkpoint"):
                current = text.split("## Current checkpoint", 1)[1].split("\n## ", 1)[0]
                self.assertRegex(current, r"(?i)\bcommitted\b")
                self.assertNotRegex(
                    current,
                    r"(?i)\buncommitted\b|\bno\b[^\n]*\bcommitted\b|\bworking.tree (?:candidate|handoff)\b",
                )
            for heading in ("Remaining", "Next safe action"):
                with self.subTest(path=name, section=heading):
                    section = text.split(f"## {heading}", 1)[1].split("\n## ", 1)[0]
                    self.assertNotRegex(section, r"(?i)\brunner\b[^\n]*\b(?:commit\w*|push\w*)\b")
                    self.assertIn("CI", section)

if __name__ == "__main__":
    unittest.main()
