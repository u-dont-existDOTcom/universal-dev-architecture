from __future__ import annotations

import subprocess
import sys
import tempfile
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

    def test_readme_directs_readers_to_the_checkpoint_path_helper(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        checkpoint_entry = next(
            line for line in readme.splitlines() if "retained checkpoint per task" in line
        )
        self.assertIn("python3 scripts/task_checkpoint_path.py", checkpoint_entry)

    def test_long_valid_branch_names_have_creatable_distinct_paths(self) -> None:
        branches = ("x/" * 138 + "x", "x/" * 138 + "y")
        for branch in branches:
            subprocess.run(
                ["git", "check-ref-format", "--branch", branch],
                check=True,
                capture_output=True,
            )
        paths = [Path(checkpoint_path(branch)) for branch in branches]
        self.assertNotEqual(paths[0], paths[1])
        with tempfile.TemporaryDirectory() as directory:
            for path in paths:
                self.assertLessEqual(len(path.name.encode("utf-8")), 255)
                destination = Path(directory) / path
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text("# Current State\n", encoding="utf-8")

    def test_gpt6_sol_checkpoint_is_at_its_declared_branch_path(self) -> None:
        branch = "claude/gpt-6-sol-work-default-20260929"
        path = ROOT / checkpoint_path(branch)
        self.assertTrue(path.is_file())
        self.assertIn(f"- Branch: `{branch}`.", path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
