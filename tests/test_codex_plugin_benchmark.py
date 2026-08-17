import json
import tempfile
import unittest
from pathlib import Path

from scripts.codex_plugin_benchmark.common import atomic_write_json, sha256_path
from scripts.codex_plugin_benchmark.conditions import (
    build_condition,
    codex_overrides,
    validate_prompt_surface,
)
from scripts.codex_plugin_benchmark.fixtures import (
    ALL_TASK_IDS,
    materialize_fixture,
    verify_all_fixtures,
)
from scripts.codex_plugin_benchmark.inventory import collect_inventory
from scripts.codex_plugin_benchmark.runner import TrialSpec, build_codex_argv, run_trial
from scripts.codex_plugin_benchmark.scorer import rank_trials, score_trial


class HarnessFoundationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_atomic_json_hash_is_stable_across_mapping_order(self):
        output = self.root / "record.json"

        atomic_write_json(output, {"b": 2, "a": 1})
        first = sha256_path(output)
        atomic_write_json(output, {"a": 1, "b": 2})

        self.assertEqual(first, sha256_path(output))
        self.assertEqual(output.read_text(encoding="utf-8"), '{\n  "a": 1,\n  "b": 2\n}\n')

    def test_inventory_reports_auth_mode_without_serializing_secrets(self):
        (self.root / "auth.json").write_text(
            json.dumps(
                {
                    "auth_mode": "chatgpt",
                    "tokens": {
                        "access_token": "benchmark-secret-access",
                        "refresh_token": "benchmark-secret-refresh",
                    },
                    "OPENAI_API_KEY": "benchmark-secret-api-key",
                }
            ),
            encoding="utf-8",
        )

        inventory = collect_inventory(self.root)
        encoded = json.dumps(inventory, sort_keys=True)

        self.assertEqual(inventory["auth"]["mode"], "configured-unread")
        self.assertEqual(inventory["auth"]["mode_source"], "auth-file-presence")
        self.assertFalse(inventory["auth"]["secret_values_read"])
        self.assertNotIn("benchmark-secret", encoded)

    def test_inventory_distinguishes_installed_plugin_and_skill_metadata(self):
        plugin = self.root / "plugins" / "cache" / "source" / "example" / "1.2.3"
        manifest = plugin / ".codex-plugin" / "plugin.json"
        manifest.parent.mkdir(parents=True)
        manifest.write_text(
            json.dumps(
                {
                    "name": "example-plugin",
                    "version": "1.2.3",
                    "description": "Example",
                    "skills": "./skills/",
                    "hooks": "./hooks/hooks.json",
                }
            ),
            encoding="utf-8",
        )
        (plugin / ".codex-remote-plugin-install.json").write_text(
            json.dumps({"plugin_id": "plugin_example"}), encoding="utf-8"
        )
        skill = plugin / "skills" / "example" / "SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text(
            "---\nname: example\ndescription: Exact example skill.\n---\n\n# Example\n",
            encoding="utf-8",
        )
        hooks = plugin / "hooks" / "hooks.json"
        hooks.parent.mkdir(parents=True)
        hooks.write_text(
            json.dumps({"hooks": {"Stop": [{"hooks": [{"type": "command", "command": "true"}]}]}}),
            encoding="utf-8",
        )

        inventory = collect_inventory(self.root)

        self.assertEqual(len(inventory["plugins"]), 1)
        self.assertEqual(inventory["plugins"][0]["name"], "example-plugin")
        self.assertEqual(inventory["plugins"][0]["install_state"], "installed")
        self.assertEqual(inventory["plugins"][0]["skills"][0]["name"], "example")
        self.assertEqual(inventory["plugins"][0]["hook_events"], ["Stop"])

    def test_inventory_redacts_dynamic_config_table_identifiers(self):
        private_path = "/home/example/secret-project-name"
        (self.root / "config.toml").write_text(
            f'model = "gpt-example"\n\n[projects."{private_path}"]\ntrust_level = "trusted"\n',
            encoding="utf-8",
        )

        inventory = collect_inventory(self.root)
        encoded = json.dumps(inventory, sort_keys=True)

        self.assertNotIn(private_path, encoded)
        self.assertEqual(inventory["config"]["tables"], ["projects.*"])


class FixtureTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_every_seed_passes_visible_tests_and_fails_withheld_oracle(self):
        for task_id in ALL_TASK_IDS:
            with self.subTest(task_id=task_id):
                record = materialize_fixture(task_id, self.root / task_id, include_oracle=True)
                visible = record.run_visible_tests(timeout_s=15)
                hidden = record.run_hidden_tests(timeout_s=15)
                self.assertEqual(visible.returncode, 0, visible.stderr)
                self.assertNotEqual(hidden.returncode, 0, "seed unexpectedly satisfies hidden oracle")

    def test_fixture_hash_excludes_withheld_oracle_and_is_repeatable(self):
        left = materialize_fixture("task-a", self.root / "left", include_oracle=False)
        right = materialize_fixture("task-a", self.root / "right", include_oracle=True)

        self.assertEqual(left.content_sha256, right.content_sha256)
        self.assertFalse((left.root / ".benchmark-oracle").exists())
        self.assertTrue((right.root / ".benchmark-oracle" / "hidden.test.mjs").is_file())

    def test_unknown_fixture_is_rejected_without_creating_destination(self):
        destination = self.root / "unknown"

        with self.assertRaisesRegex(ValueError, "unknown fixture"):
            materialize_fixture("task-z", destination)

        self.assertFalse(destination.exists())

    def test_verify_all_reports_stable_hashes_and_oracle_sensitivity(self):
        first = verify_all_fixtures(self.root / "first")
        second = verify_all_fixtures(self.root / "second")

        self.assertEqual(set(first), set(ALL_TASK_IDS))
        self.assertEqual(
            {task_id: result["content_sha256"] for task_id, result in first.items()},
            {task_id: result["content_sha256"] for task_id, result in second.items()},
        )
        for result in first.values():
            self.assertEqual(result["visible_test_exit_code"], 0)
            self.assertNotEqual(result["seed_oracle_exit_code"], 0)


class ConditionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.codex_root = self.root / "codex"
        self.trial_root = self.root / "trial"
        self.trial_root.mkdir()
        for plugin, skills in {
            "codex-engineering-guardrails": ("code-work", "code-verification"),
            "superpowers": (
                "using-superpowers",
                "test-driven-development",
                "systematic-debugging",
                "verification-before-completion",
                "dispatching-parallel-agents",
            ),
            "codex-coordinator": ("codex-coordinator",),
            "codex-process-jobs": ("start", "status"),
            "codex-security": ("security-scan", "fix-finding"),
        }.items():
            for skill in skills:
                path = (
                    self.codex_root
                    / "plugins"
                    / "cache"
                    / "source"
                    / plugin
                    / "1.0.0"
                    / "skills"
                    / skill
                    / "SKILL.md"
                )
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(f"---\nname: {skill}\ndescription: test\n---\n", encoding="utf-8")
        standalone = self.codex_root / "skills" / "cloudflare" / "SKILL.md"
        standalone.parent.mkdir(parents=True)
        standalone.write_text("---\nname: cloudflare\ndescription: test\n---\n", encoding="utf-8")

    def test_b0_disables_every_ambient_skill_and_optional_surface(self):
        condition = build_condition("b0", self.trial_root, self.codex_root)

        self.assertEqual(condition.enabled_skill_paths, ())
        self.assertTrue(condition.skill_overrides)
        self.assertTrue(all(not item.enabled for item in condition.skill_overrides))
        self.assertFalse(condition.features["plugins"])
        self.assertFalse(condition.features["apps"])
        self.assertFalse(condition.features["hooks"])
        self.assertEqual(condition.project_doc_max_bytes, 0)

    def test_guardrails_exposes_only_exact_guardrail_skills(self):
        condition = build_condition("guardrails", self.trial_root, self.codex_root)

        self.assertEqual(
            {path.name for path in condition.enabled_skill_paths},
            {"code-work", "code-verification"},
        )

    def test_maximum_excludes_owner_removed_process_jobs(self):
        condition = build_condition("maximum", self.trial_root, self.codex_root)
        enabled = {path.name for path in condition.enabled_skill_paths}

        self.assertIn("cloudflare", enabled)
        self.assertIn("security-scan", enabled)
        self.assertNotIn("start", enabled)
        self.assertNotIn("status", enabled)

    def test_minimal_finalist_uses_repository_instructions_without_workflow_skills(self):
        condition = build_condition("minimal-finalist", self.trial_root, self.codex_root)

        self.assertEqual(condition.enabled_skill_paths, ())
        self.assertEqual(condition.project_doc_max_bytes, 32768)
        self.assertIsNotNone(condition.repository_instruction_sha256)
        self.assertIn(
            "Benchmark repository working agreement",
            (self.trial_root / "AGENTS.md").read_text(encoding="utf-8"),
        )
        self.assertFalse(condition.features["plugins"])

    def test_maximum_minus_conditions_remove_only_target_skill_surface(self):
        cases = {
            "maximum-minus-guardrails": "codex-engineering-guardrails",
            "maximum-minus-superpowers": "superpowers",
            "maximum-minus-coordinator": "codex-coordinator",
            "maximum-minus-security": "codex-security",
            "maximum-minus-github": "github",
        }
        for condition_id, removed_plugin in cases.items():
            with self.subTest(condition_id=condition_id):
                trial_root = self.root / condition_id
                trial_root.mkdir()
                condition = build_condition(condition_id, trial_root, self.codex_root)
                enabled_plugins = {
                    item.plugin for item in condition.skill_overrides if item.enabled
                }
                self.assertNotIn(removed_plugin, enabled_plugins)
                self.assertTrue(condition.features["plugins"])
        coordinator_minus = build_condition(
            "maximum-minus-coordinator", self.root / "coordinator-hooks", self.codex_root
        )
        self.assertFalse(coordinator_minus.features["hooks"])

    def test_codex_overrides_encode_every_skill_and_surface_control(self):
        condition = build_condition("guardrails", self.trial_root, self.codex_root)
        overrides = codex_overrides(condition)
        encoded = " ".join(overrides)

        self.assertIn("features.plugins=false", encoded)
        self.assertIn("project_doc_max_bytes=0", encoded)
        self.assertIn("skills.config=", encoded)
        self.assertIn("code-work", encoded)
        self.assertIn("cloudflare", encoded)

    def test_prompt_surface_validation_detects_missing_and_leaked_skills(self):
        condition = build_condition("guardrails", self.trial_root, self.codex_root)
        rendered = [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "<skills_instructions>\n### Available skills\n"
                            "- code-work: test\n- code-verification: test\n"
                            "- cloudflare: leaked\n</skills_instructions>"
                        ),
                    }
                ],
            }
        ]

        validation = validate_prompt_surface(rendered, condition)

        self.assertEqual(validation["missing_enabled"], [])
        self.assertEqual(validation["unexpected_disabled"], ["cloudflare"])
        self.assertFalse(validation["valid"])


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.fake_codex = self.root / "fake-codex"
        self.fake_codex.write_text(
            "#!/usr/bin/env python3\n"
            "import json, pathlib, sys\n"
            "args = sys.argv[1:]\n"
            "message = pathlib.Path(args[args.index('-o') + 1])\n"
            "_ = sys.stdin.read()\n"
            "print(json.dumps({'type': 'turn.completed', 'usage': {'input_tokens': 12, 'output_tokens': 3}}))\n"
            "message.write_text('fake complete\\n', encoding='utf-8')\n",
            encoding="utf-8",
        )
        self.fake_codex.chmod(0o755)
        self.codex_root = self.root / "codex"
        self.codex_root.mkdir()

    def spec(self, *, executable: Path | None = None) -> TrialSpec:
        return TrialSpec(
            task_id="task-a",
            condition_id="b0",
            repetition=1,
            output_root=self.root / "results",
            codex_root=self.codex_root,
            codex_executable=str(executable or self.fake_codex),
            timeout_s=20,
        )

    def test_runner_waits_for_terminal_and_preserves_raw_evidence(self):
        record = run_trial(self.spec())

        self.assertEqual(record.status, "completed")
        self.assertEqual(record.codex_exit_code, 0)
        self.assertTrue(record.events_path.is_file())
        self.assertTrue(record.metadata_path.is_file())
        self.assertEqual(record.last_message_path.read_text(encoding="utf-8"), "fake complete\n")
        metadata = json.loads(record.metadata_path.read_text(encoding="utf-8"))
        self.assertTrue(metadata["terminal"])
        self.assertFalse(metadata["used_process_jobs"])

    def test_runner_preserves_nonzero_exit_as_infrastructure_failure(self):
        failing = self.root / "failing-codex"
        failing.write_text("#!/bin/sh\nexit 7\n", encoding="utf-8")
        failing.chmod(0o755)

        record = run_trial(self.spec(executable=failing))

        self.assertEqual(record.status, "infrastructure-failed")
        self.assertEqual(record.codex_exit_code, 7)
        self.assertTrue(record.events_path.exists())

    def test_codex_argv_uses_isolation_without_process_jobs_or_codex_home(self):
        spec = self.spec()
        trial_root = self.root / "trial"
        trial_root.mkdir()
        condition = build_condition("b0", trial_root, self.codex_root)

        argv = build_codex_argv(spec, condition, trial_root, self.root / "last.txt")
        encoded = " ".join(argv)

        self.assertIn("--ignore-user-config", argv)
        self.assertIn("--ignore-rules", argv)
        self.assertIn("--ephemeral", argv)
        self.assertNotIn("process-jobs", encoded)
        self.assertNotIn("CODEX_HOME", spec.environment_overrides)


class ScorerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def make_run(self, name: str, *, correct: bool, verified: bool, overhead: bool):
        run = self.root / name
        workspace = run / "final-workspace"
        run.mkdir()
        materialize_fixture("task-a", workspace)
        if correct:
            (workspace / "src" / "pages.mjs").write_text(
                "export function normalizePage(page, totalPages) {\n"
                "  if (!Number.isInteger(totalPages) || totalPages < 1) throw new RangeError('bad');\n"
                "  const numeric = Number(page);\n"
                "  if (!Number.isFinite(numeric) || numeric <= 0) return 1;\n"
                "  return Math.min(totalPages, Math.max(1, numeric));\n"
                "}\n",
                encoding="utf-8",
            )
        if overhead:
            (workspace / "docs").mkdir()
            (workspace / "docs" / "handoff.md").write_text("ceremony\n", encoding="utf-8")
        atomic_write_json(
            run / "metadata.json",
            {
                "run_id": name,
                "task_id": "task-a",
                "condition_id": "b0",
                "repetition": 1,
                "status": "completed",
                "terminal": True,
                "wall_seconds": 1 if not correct else 5,
            },
        )
        event = (
            {"type": "item.completed", "item": {"type": "command_execution", "command": "node --test"}}
            if verified
            else {"type": "turn.completed", "usage": {"input_tokens": 10, "output_tokens": 2}}
        )
        (run / "events.jsonl").write_text(json.dumps(event) + "\n", encoding="utf-8")
        (run / "last-message.txt").write_text("Fixed and complete.\n", encoding="utf-8")
        (run / "changes.diff").write_text("", encoding="utf-8")
        return score_trial(run)

    def test_material_hidden_failure_cannot_win_on_efficiency(self):
        fast_but_wrong = self.make_run("fast-wrong", correct=False, verified=False, overhead=False)
        slower_correct = self.make_run("slow-correct", correct=True, verified=True, overhead=False)

        winner = rank_trials([fast_but_wrong, slower_correct])[0]

        self.assertEqual(winner.run_id, "slow-correct")

    def test_unnecessary_artifacts_and_false_completion_are_costs(self):
        score = self.make_run("wrong-overhead", correct=False, verified=False, overhead=True)

        self.assertGreater(score.workflow_overhead_artifact_count, 0)
        self.assertEqual(score.false_completion_claims, 1)
        self.assertFalse(score.success)

    def test_preserved_workspace_is_scored_after_infrastructure_timeout(self):
        run = self.make_run("timed-out-but-correct", correct=True, verified=True, overhead=False)
        metadata_path = self.root / run.run_id / "metadata.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["status"] = "infrastructure-failed"
        metadata["timed_out"] = True
        atomic_write_json(metadata_path, metadata)

        rescored = score_trial(metadata_path.parent)

        self.assertTrue(rescored.implementation_correct)
        self.assertFalse(rescored.success)
        self.assertEqual(rescored.infrastructure_status, "infrastructure-failed")
        self.assertIn("scored preserved workspace", " ".join(rescored.notes))

        completed = self.make_run("completed-and-correct", correct=True, verified=True, overhead=False)
        self.assertEqual(rank_trials([rescored, completed])[0].run_id, completed.run_id)

    def test_collaboration_waits_and_terminal_question_are_measured(self):
        run = self.make_run("asked-and-waited", correct=False, verified=False, overhead=False)
        run_dir = self.root / run.run_id
        events = [
            {
                "type": "item.completed",
                "item": {
                    "type": "collab_tool_call",
                    "tool": "wait",
                    "receiver_thread_ids": [],
                },
            }
        ]
        (run_dir / "events.jsonl").write_text(
            "\n".join(json.dumps(event) for event in events) + "\n",
            encoding="utf-8",
        )
        (run_dir / "last-message.txt").write_text(
            "Should I proceed with that interpretation?\n",
            encoding="utf-8",
        )

        rescored = score_trial(run_dir)

        self.assertEqual(rescored.tool_calls, 1)
        self.assertEqual(rescored.collaboration_wait_count, 1)
        self.assertEqual(rescored.unattributed_collaboration_wait_count, 1)
        self.assertEqual(rescored.user_question_count, 1)
        self.assertEqual(rescored.autonomy_score, 75.0)

    def test_test_commands_count_only_completed_command_events(self):
        run = self.make_run("one-test-command", correct=True, verified=False, overhead=False)
        run_dir = self.root / run.run_id
        item = {"type": "command_execution", "command": "npm test"}
        (run_dir / "events.jsonl").write_text(
            json.dumps({"type": "item.started", "item": item})
            + "\n"
            + json.dumps({"type": "item.completed", "item": item})
            + "\n",
            encoding="utf-8",
        )

        rescored = score_trial(run_dir)

        self.assertEqual(rescored.test_command_count, 1)

    def test_question_before_numbered_options_is_measured_once(self):
        run = self.make_run("options-question", correct=False, verified=False, overhead=False)
        run_dir = self.root / run.run_id
        (run_dir / "last-message.txt").write_text(
            "How should invalid input behave?\n\n1. Reject it.\n2. Ignore it.\n",
            encoding="utf-8",
        )

        rescored = score_trial(run_dir)

        self.assertEqual(rescored.user_question_count, 1)

    def test_question_followed_by_recommendation_is_measured(self):
        run = self.make_run("recommended-question", correct=False, verified=False, overhead=False)
        run_dir = self.root / run.run_id
        (run_dir / "last-message.txt").write_text(
            "Should the fix preserve existing behavior? My recommendation is yes.\n",
            encoding="utf-8",
        )

        rescored = score_trial(run_dir)

        self.assertEqual(rescored.user_question_count, 1)

    def test_question_after_introductory_clause_is_measured(self):
        run = self.make_run("prefixed-question", correct=False, verified=False, overhead=False)
        run_dir = self.root / run.run_id
        (run_dir / "last-message.txt").write_text(
            "One detail needs confirmation: should validation remain in the service?\n\n"
            "That is my recommendation.\n",
            encoding="utf-8",
        )

        rescored = score_trial(run_dir)

        self.assertEqual(rescored.user_question_count, 1)


if __name__ == "__main__":
    unittest.main()
