from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class WorkerSelfRemediationBeforeOwnerInterruptionTests(unittest.TestCase):
    def test_pattern_requires_self_remediation_before_owner_labor(self) -> None:
        pattern = (
            ROOT
            / "patterns"
            / "worker-self-remediation-before-owner-interruption.md"
        ).read_text(encoding="utf-8")
        required = (
            "Before assigning any routine configuration, permission, recovery, or setup work to the owner",
            "the worker performs it",
            "smallest genuinely irreducible action",
            "Do not infer owner necessity from the current sandbox alone",
            "self-remediation-before-owner-interruption admission check",
            "patterns/codex-worker-permissions.md",
            "patterns/worker-directive-delivery-and-chat-output-budget.md",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

    def test_existing_codex_permission_pattern_already_assigns_routine_permissions_to_worker(self) -> None:
        permissions = (
            ROOT / "patterns" / "codex-worker-permissions.md"
        ).read_text(encoding="utf-8")
        self.assertIn("The worker, not the owner, selects the permission level", permissions)
        self.assertIn(
            "rather than asking the owner to configure it",
            permissions,
        )

    def test_incident_records_activation_gap_not_missing_broad_rule(self) -> None:
        audit = (
            ROOT / "audits" / "2026-09-13-worker-self-remediation-owner-friction.md"
        ).read_text(encoding="utf-8")
        self.assertIn("activation/application gap", audit)
        self.assertIn("no-new-lesson", audit)
        self.assertIn("promoted", audit)


if __name__ == "__main__":
    unittest.main()
