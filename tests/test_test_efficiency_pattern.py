import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "test_efficiency.py"

spec = importlib.util.spec_from_file_location("test_efficiency_tool", SCRIPT_PATH)
tool = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(tool)


class TestEfficiencyPatternTests(unittest.TestCase):
    def read(self, rel):
        return (ROOT / rel).read_text(encoding="utf-8")

    def test_pattern_routes_progressive_verification_and_mutation_gate(self):
        text = self.read("patterns/test-efficiency-and-verification-budget.md").lower()
        for token in (
            "focused tests",
            "affected tests",
            "full relevant suite",
            "mutation testing",
            "redundant-green-same-state",
            "test wall time as a percentage of task wall time",
            "compose and adapt",
            "independent conception snapshot",
        ):
            self.assertIn(token, text)

    def test_universal_entry_points_route_to_pattern(self):
        for rel in (
            "AGENTS.md",
            "LESSON-INDEX.md",
            "docs/INDEX.md",
            "templates/AGENTS-UNIVERSAL-BOOTSTRAP.md",
            "templates/CODEX-TASK.md",
            "templates/EXEC-PLAN.md",
        ):
            self.assertIn(
                "test-efficiency-and-verification-budget.md",
                self.read(rel),
                rel,
            )

    def test_missing_project_observer_cannot_silently_disable_telemetry(self):
        pattern = self.read("patterns/test-efficiency-and-verification-budget.md").lower()
        agents = self.read("AGENTS.md").lower()
        bootstrap = self.read("templates/AGENTS-UNIVERSAL-BOOTSTRAP.md").lower()
        task = self.read("templates/CODEX-TASK.md").lower()
        plan = self.read("templates/EXEC-PLAN.md").lower()

        self.assertIn("missing local observer", pattern)
        self.assertIn("--root <project>", pattern)
        self.assertIn("do not silently skip", agents)
        self.assertIn("do not silently skip", bootstrap)
        self.assertIn("missing local observer", task)
        self.assertIn("missing local observer", plan)
        for text in (pattern, agents, bootstrap, task, plan):
            self.assertIn("vendor", text)

    def test_full_and_mutation_scopes_require_explicit_trigger_vocabularies(self):
        self.assertIn("pre-pr", tool.FULL_TRIGGERS)
        self.assertIn("high-risk-change", tool.FULL_TRIGGERS)
        self.assertIn("explicit-owner", tool.MUTATION_TRIGGERS)
        self.assertIn("test-quality-change", tool.MUTATION_TRIGGERS)

    def test_equivalent_green_detection_requires_same_scope_state_and_command(self):
        events = [
            {
                "event": "test_run",
                "scope": "full",
                "worktree_fingerprint": "state-a",
                "command_fingerprint": "cmd-a",
                "exit_code": 0,
                "duration_seconds": 12.5,
            }
        ]
        self.assertIsNotNone(
            tool.prior_equivalent_green(events, "full", "state-a", "cmd-a")
        )
        self.assertIsNone(
            tool.prior_equivalent_green(events, "full", "state-b", "cmd-a")
        )
        self.assertIsNone(
            tool.prior_equivalent_green(events, "affected", "state-a", "cmd-a")
        )

    def test_summary_reports_test_share_failures_and_redundant_cost(self):
        events = [
            {
                "event": "task_start",
                "task_id": "task-1",
                "epoch_seconds": 100.0,
            },
            {
                "event": "test_run",
                "scope": "focused",
                "duration_seconds": 10.0,
                "exit_code": 1,
                "forced_redundant_green_rerun": False,
            },
            {
                "event": "test_run",
                "scope": "full",
                "duration_seconds": 20.0,
                "exit_code": 0,
                "forced_redundant_green_rerun": True,
            },
            {
                "event": "test_skip",
                "scope": "full",
                "skip_reason": "redundant-green-same-state",
                "estimated_seconds_avoided": 20.0,
            },
        ]
        summary = tool.build_summary(events, now=200.0)
        self.assertEqual(summary["task_elapsed_seconds"], 100.0)
        self.assertEqual(summary["test_wall_seconds"], 30.0)
        self.assertEqual(summary["test_share_percent"], 30.0)
        self.assertEqual(summary["forced_redundant_green_seconds"], 20.0)
        self.assertEqual(summary["redundant_runs_skipped"], 1)
        self.assertEqual(summary["estimated_seconds_avoided"], 20.0)
        self.assertEqual(summary["by_scope"]["focused"]["failures"], 1)

    def test_script_defaults_to_git_internal_telemetry(self):
        text = self.read("scripts/test_efficiency.py")
        self.assertIn('"codex-test-efficiency"', text)
        self.assertIn("--force-rerun", text)
        self.assertIn("--full-trigger", text)
        self.assertIn("--mutation-trigger", text)


if __name__ == "__main__":
    unittest.main()
