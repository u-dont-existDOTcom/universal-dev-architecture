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

    def test_pattern_switches_control_plane_after_ineffective_config_repair(self) -> None:
        pattern = (
            ROOT
            / "patterns"
            / "worker-self-remediation-before-owner-interruption.md"
        ).read_text(encoding="utf-8")
        required = (
            "wrong control plane",
            "effective runtime roots/policy",
            "stop trying to repair that config path",
            "Repeated config edits or identical restarts are the wrong control plane",
            "client/thread/task initialization",
            "A fresh-process failure is therefore a strategy checkpoint",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

    def test_opaque_target_identity_and_route_recovery_precede_owner_escalation(self) -> None:
        pattern = (
            ROOT
            / "patterns"
            / "worker-self-remediation-before-owner-interruption.md"
        ).read_text(encoding="utf-8")
        required = (
            "Recover opaque target identity and alternate authorized routes",
            "route-specific failure",
            "SSH config/aliases",
            "read-only",
            "hostname",
            "target equivalence",
            "alternate route",
            "Never ask the owner to “access device",
            "healthy local workstation already has authorized SSH access",
        )
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, pattern)

    def test_opaque_target_recovery_is_projected_to_root_and_reusable_templates(self) -> None:
        documents = (
            ROOT / "AGENTS.md",
            ROOT / "templates" / "AGENTS-CODEX.md",
            ROOT / "templates" / "AGENTS-UNIVERSAL-BOOTSTRAP.md",
        )
        for path in documents:
            with self.subTest(path=path):
                text = path.read_text(encoding="utf-8")
                self.assertIn("opaque", text.lower())
                self.assertIn("route-specific", text)
                self.assertIn("authorized", text)
                self.assertIn("owner", text.lower())

    def test_human_reference_rule_covers_machine_generated_targets(self) -> None:
        refs = (
            ROOT / "patterns" / "human-readable-operational-references.md"
        ).read_text(encoding="utf-8")
        for phrase in (
            "device IDs",
            "host/service/session handles",
            "authorized topology evidence",
            "direct connector outage is route-specific evidence",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, refs)

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
        self.assertIn("non-controlling", audit)
        self.assertIn("client/task runtime authority", audit)


if __name__ == "__main__":
    unittest.main()
