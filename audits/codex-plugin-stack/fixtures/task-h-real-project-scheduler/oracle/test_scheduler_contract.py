from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from scripts.codex_plugin_benchmark import cli, scheduler


class SchedulerContractTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.output = self.root / "raw"
        self.schedule = self.root / "role-relevant.json"

    def write_schedule(self, trials):
        self.schedule.write_text(json.dumps({"trials": trials}), encoding="utf-8")

    def run_schedule(self):
        return scheduler.run_schedule(
            self.schedule,
            self.output,
            self.root / "codex",
            "model-x",
            "high",
            123.0,
        )

    def test_rejects_all_invalid_trials_before_running_anything(self):
        invalid_values = [
            {},
            {"trials": "not-a-list"},
            {"trials": [{}]},
            {"trials": [{"task_id": "task-a", "condition_id": "b0", "repetition": 0}]},
            {"trials": [{"task_id": "task-a", "condition_id": "b0", "repetition": True}]},
        ]
        for index, value in enumerate(invalid_values):
            with self.subTest(index=index):
                self.schedule.write_text(json.dumps(value), encoding="utf-8")
                with patch.object(scheduler, "run_trial") as run_trial:
                    with self.assertRaises((TypeError, ValueError)):
                        self.run_schedule()
                    run_trial.assert_not_called()

    def test_orders_trials_skips_terminal_relocates_incomplete_and_continues(self):
        self.write_schedule(
            [
                {"task_id": "task-a", "condition_id": "b0", "repetition": 1},
                {"task_id": "task-b", "condition_id": "guardrails", "repetition": 2},
                {"task_id": "task-c", "condition_id": "coordinator", "repetition": 3},
                {"task_id": "task-d", "condition_id": "b0", "repetition": 4},
            ]
        )
        terminal = self.output / "task-a--b0--r01"
        terminal.mkdir(parents=True)
        (terminal / "metadata.json").write_text('{"terminal": true}', encoding="utf-8")
        incomplete = self.output / "task-b--guardrails--r02"
        incomplete.mkdir(parents=True)
        (incomplete / "sentinel.txt").write_text("preserve me", encoding="utf-8")

        seen = []

        def fake_run(spec):
            seen.append(spec)
            if spec.task_id == "task-c":
                raise RuntimeError(
                    "synthetic runner failure token=BENCHMARK_SENTINEL_SECRET"
                )
            return SimpleNamespace(status="completed")

        with patch.object(scheduler, "run_trial", side_effect=fake_run):
            ledger = self.run_schedule()

        self.assertEqual([entry["state"] for entry in ledger], [
            "skipped-existing-terminal", "completed", "runner-exception", "completed"
        ])
        self.assertEqual([entry["schedule_index"] for entry in ledger], [1, 2, 3, 4])
        self.assertEqual([spec.task_id for spec in seen], ["task-b", "task-c", "task-d"])
        self.assertEqual(seen[0].condition_id, "guardrails")
        self.assertEqual(seen[0].repetition, 2)
        self.assertEqual(seen[0].model, "model-x")
        self.assertEqual(seen[0].reasoning_effort, "high")
        self.assertEqual(seen[0].timeout_s, 123.0)
        self.assertFalse(incomplete.exists())
        preserved = list((self.output / "excluded").glob("task-b--guardrails--r02*"))
        self.assertEqual(len(preserved), 1)
        self.assertEqual((preserved[0] / "sentinel.txt").read_text(encoding="utf-8"), "preserve me")
        self.assertEqual(ledger[2]["error_type"], "RuntimeError")
        self.assertIn("synthetic runner failure", ledger[2]["error"])
        self.assertNotIn("BENCHMARK_SENTINEL_SECRET", ledger[2]["error"])

        ledger_path = self.output / "schedule-ledger-role-relevant.json"
        self.assertTrue(ledger_path.is_file())
        persisted = ledger_path.read_text(encoding="utf-8")
        self.assertNotIn("BENCHMARK_SENTINEL_SECRET", persisted)
        self.assertEqual(json.loads(persisted), ledger)

    def test_cli_returns_failure_only_after_schedule_finishes(self):
        arguments = [
            "run-schedule", "--schedule", str(self.schedule), "--output", str(self.output)
        ]
        with patch.object(cli, "run_schedule", return_value=[{"state": "completed"}, {"state": "runner-exception"}]) as call:
            self.assertEqual(cli.main(arguments), 1)
            call.assert_called_once()
        with patch.object(cli, "run_schedule", return_value=[
            {"state": "completed"}, {"state": "skipped-existing-terminal"}
        ]):
            self.assertEqual(cli.main(arguments), 0)


if __name__ == "__main__":
    unittest.main()
