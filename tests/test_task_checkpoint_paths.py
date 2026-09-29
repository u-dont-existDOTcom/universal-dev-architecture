from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path
from urllib.parse import unquote

from scripts.task_checkpoint_path import checkpoint_path


ROOT = Path(__file__).resolve().parents[1]


class TaskCheckpointPathTests(unittest.TestCase):
    def test_distinct_branch_names_have_distinct_reversible_paths(self) -> None:
        branches = ("team/foo", "team-foo", "team%2Ffoo")
        paths = [checkpoint_path(branch) for branch in branches]
        self.assertEqual(len(branches), len(set(paths)))
        self.assertEqual("state/tasks/team%2Ffoo.md", paths[0])
        self.assertEqual("state/tasks/team-foo.md", paths[1])
        self.assertEqual("state/tasks/team%252Ffoo.md", paths[2])
        self.assertEqual(list(branches), [unquote(Path(path).stem) for path in paths])

    def test_documented_lookup_command_prints_the_encoded_path(self) -> None:
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "task_checkpoint_path.py"), "team/foo"],
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertEqual("state/tasks/team%2Ffoo.md", result.stdout.strip())

    def test_gpt6_sol_checkpoint_is_at_its_declared_branch_path(self) -> None:
        branch = "claude/gpt-6-sol-work-default-20260929"
        path = ROOT / checkpoint_path(branch)
        self.assertTrue(path.is_file())
        self.assertIn(f"- Branch: `{branch}`.", path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
