from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.task_checkpoint_path import checkpoint_path


ROOT = Path(__file__).resolve().parents[1]


class TaskCheckpointPathTests(unittest.TestCase):
    def test_reused_and_case_distinct_branches_have_distinct_paths(self) -> None:
        identities = (("team/Foo", "pr-1"), ("team/Foo", "pr-2"), ("team/foo", "pr-1"))
        paths = [checkpoint_path(branch, task_id) for branch, task_id in identities]
        self.assertEqual(len(identities), len({path.casefold() for path in paths}))
        self.assertTrue(all(Path(path).name == Path(path).name.lower() for path in paths))
        self.assertEqual(paths[0], checkpoint_path("team/Foo", "pr-1"))

    def test_documented_lookup_command_prints_the_task_path(self) -> None:
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "task_checkpoint_path.py"), "team/foo", "pr-1"],
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertEqual(checkpoint_path("team/foo", "pr-1"), result.stdout.strip())

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
        paths = [Path(checkpoint_path(branch, "pr-1")) for branch in branches]
        self.assertNotEqual(paths[0], paths[1])
        with tempfile.TemporaryDirectory() as directory:
            for path in paths:
                self.assertLessEqual(len(path.name.encode("utf-8")), 255)
                destination = Path(directory) / path
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text("# Current State\n", encoding="utf-8")

    def test_gpt6_sol_checkpoint_is_at_its_declared_branch_path(self) -> None:
        branch = "claude/gpt-6-sol-work-default-20260929"
        path = ROOT / checkpoint_path(branch, "pr-280")
        self.assertTrue(path.is_file())
        self.assertIn(f"- Branch: `{branch}`.", path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
