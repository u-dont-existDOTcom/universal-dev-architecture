from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ExclusiveActiveTaskPatternTests(unittest.TestCase):
    def test_pattern_contains_task_identity_and_completion_controls(self) -> None:
        pattern = (ROOT / "patterns" / "exclusive-active-task-locks.md").read_text(
            encoding="utf-8"
        )
        required = (
            "machine-readable active-task lock",
            "A wrong branch is a **hard preflight failure**",
            "suspended competing sources",
            "artifact-based acceptance command",
            "Ordinary tests do not solve this",
            "INCOMPLETE",
            "BLOCKED",
            "READY_FOR_PROTECTED_MERGE",
            "COMPLETE",
            "protected merge and an immutable receipt",
            "model-input/grader leakage fails closed",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

    def test_template_is_machine_readable_and_exclusive(self) -> None:
        template_path = ROOT / "templates" / "ACTIVE-TASK.json"
        template = json.loads(template_path.read_text(encoding="utf-8"))
        self.assertEqual(template["schemaVersion"], 1)
        self.assertTrue(template["exclusive"])
        self.assertEqual(template["status"], "active")
        self.assertTrue(template["requiredBranch"].startswith("agent/"))
        self.assertEqual(template["preflightCommand"], "npm run task:preflight")
        self.assertEqual(template["completionCommand"], "npm run task:acceptance")
        self.assertGreaterEqual(len(template["suspendedTaskSources"]), 4)
        self.assertIn("requiredArtifacts", template["acceptance"])

    def test_index_routes_to_the_pattern_and_template(self) -> None:
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        self.assertIn("patterns/exclusive-active-task-locks.md", index)
        self.assertIn("templates/ACTIVE-TASK.json", index)
        self.assertIn("branch-bound task identity", index)
        self.assertIn("artifact-based completion", index)

    def test_promotion_audit_preserves_origin_and_limits(self) -> None:
        audit = (
            ROOT
            / "audits"
            / "2026-08-18-inner-signal-exclusive-task-lock.md"
        ).read_text(encoding="utf-8")
        required = (
            "u-dont-existDOTcom/innerSignalGraph",
            "PR #11",
            "bbcf8dad4e2fa00a00bf236b5f4fc9266b25a8ef",
            "wrong branch fails preflight",
            "blocked actual-model campaign remains `BLOCKED`",
            "query/grader leakage fails closed",
            "This is not therapy-specific",
            "Tiny one-turn tasks do not require this machinery",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, audit)


if __name__ == "__main__":
    unittest.main()
