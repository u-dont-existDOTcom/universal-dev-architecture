from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.audit_codex_github import audit_repository


class RepositoryAuditTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def write(self, relative: str, content: str = "") -> Path:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def write_profile(self, **overrides: object) -> None:
        profile: dict[str, object] = {
            "schema_version": 1,
            "repository_kind": "content",
            "active": True,
            "long_running": False,
            "visibility": "private",
            "risk": "normal",
            "commands": {},
            "current_state": "state/CURRENT-STATE.md",
            "github_controls": {
                "default_branch_rules": "unverified",
                "secret_scanning": "unverified",
                "push_protection": "unverified",
                "code_scanning": "unverified",
            },
        }
        profile.update(overrides)
        self.write(
            ".github/codex-repository.json",
            json.dumps(profile, indent=2) + "\n",
        )

    @staticmethod
    def codes(findings: list[dict[str, object]]) -> set[str]:
        return {str(item["code"]) for item in findings}

    @staticmethod
    def severities(findings: list[dict[str, object]], code: str) -> set[str]:
        return {
            str(item["severity"])
            for item in findings
            if item["code"] == code
        }

    def add_minimal_repository_files(self) -> None:
        self.write(
            "AGENTS.md",
            "# Agent instructions\n\nRead the repository profile and verify changes.\n",
        )
        self.write("README.md", "# Example repository\n")
        self.write(".gitignore", ".env\n")

    def test_empty_repository_reports_foundational_errors(self) -> None:
        findings = audit_repository(self.root)
        codes = self.codes(findings)
        self.assertIn("codex.agents.missing", codes)
        self.assertIn("repo.readme.missing", codes)
        self.assertIn("repo.profile.missing", codes)

    def test_minimal_private_content_repository_has_no_errors(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile()
        findings = audit_repository(self.root)
        errors = [item for item in findings if item["severity"] == "error"]
        self.assertEqual([], errors)

    def test_large_root_agents_file_is_reported(self) -> None:
        """Catch root instructions that consume most of the discovery budget."""
        self.add_minimal_repository_files()
        self.write("AGENTS.md", "# Instructions\n" + ("verify changes\n" * 1800))
        self.write_profile()
        findings = audit_repository(self.root)
        self.assertIn("codex.agents.oversized", self.codes(findings))

    def test_root_to_nested_instruction_chain_over_32k_is_an_error(self) -> None:
        """Catch a valid-file hierarchy that Codex would truncate by default."""
        self.add_minimal_repository_files()
        self.write("AGENTS.md", "# Root\n" + ("verify root\n" * 1500))
        self.write(".github/AGENTS.md", "# Local\n" + ("secure workflow\n" * 1100))
        self.write_profile()
        findings = audit_repository(self.root)
        self.assertIn("codex.agents.chain-oversized", self.codes(findings))
        self.assertEqual(
            {"error"},
            self.severities(findings, "codex.agents.chain-oversized"),
        )

    def test_unreadable_nested_instruction_file_is_an_error(self) -> None:
        """Catch a scoped instruction file Codex cannot decode safely."""
        self.add_minimal_repository_files()
        nested = self.root / ".github" / "AGENTS.md"
        nested.parent.mkdir(parents=True, exist_ok=True)
        nested.write_bytes(b"\xff\xfe\x00")
        self.write_profile()
        findings = audit_repository(self.root)
        self.assertIn("codex.agents.unreadable", self.codes(findings))
        self.assertEqual(
            {"error"}, self.severities(findings, "codex.agents.unreadable")
        )

    def test_invalid_profile_is_an_error(self) -> None:
        self.add_minimal_repository_files()
        self.write(".github/codex-repository.json", "{not-json}\n")
        findings = audit_repository(self.root)
        self.assertIn("repo.profile.invalid", self.codes(findings))
        self.assertEqual(
            {"error"}, self.severities(findings, "repo.profile.invalid")
        )

    def test_profile_command_values_must_be_nonempty_strings(self) -> None:
        """Catch profiles that make an unverifiable command look declared."""
        self.add_minimal_repository_files()
        self.write_profile(commands={"test": "", "audit": 17})
        findings = audit_repository(self.root)
        self.assertEqual(
            {"error"},
            self.severities(findings, "repo.profile.command-value"),
        )

    def test_active_policy_requires_test_and_audit_commands(self) -> None:
        """Catch an active control-plane profile with no executable gates."""
        self.add_minimal_repository_files()
        self.write_profile(repository_kind="policy", commands={})
        findings = audit_repository(self.root)
        self.assertIn("policy.command.test.missing", self.codes(findings))
        self.assertIn("policy.command.audit.missing", self.codes(findings))
        self.assertEqual(
            {"error"}, self.severities(findings, "policy.command.test.missing")
        )
        self.assertEqual(
            {"error"}, self.severities(findings, "policy.command.audit.missing")
        )

    def test_verified_hosted_control_requires_dated_api_evidence(self) -> None:
        """Catch file-only claims that a hosted GitHub setting was verified."""
        self.add_minimal_repository_files()
        self.write_profile(
            github_controls={
                "default_branch_rules": "verified",
                "secret_scanning": "unverified",
                "push_protection": "unverified",
                "code_scanning": "not_applicable",
            }
        )
        findings = audit_repository(self.root)
        self.assertIn("github-control.evidence.missing", self.codes(findings))
        self.assertEqual(
            {"error"},
            self.severities(findings, "github-control.evidence.missing"),
        )

    def test_verified_hosted_control_accepts_dated_api_evidence(self) -> None:
        """Allow a hosted claim only when its independent check is recorded."""
        self.add_minimal_repository_files()
        self.write_profile(
            github_controls={
                "default_branch_rules": "verified",
                "secret_scanning": "unverified",
                "push_protection": "unverified",
                "code_scanning": "not_applicable",
            },
            github_control_evidence={
                "default_branch_rules": {
                    "checked_at": "2026-08-14",
                    "method": "GitHub REST GET /repos/owner/repo/rulesets",
                    "result": "Active ruleset 42 targets refs/heads/main",
                }
            },
        )
        findings = audit_repository(self.root)
        evidence_findings = [
            item
            for item in findings
            if item["code"] == "github-control.evidence.missing"
        ]
        self.assertEqual([], evidence_findings)

    def test_active_long_running_repository_requires_current_state(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile(long_running=True)
        findings = audit_repository(self.root)
        self.assertIn("continuity.current-state.missing", self.codes(findings))
        self.assertEqual(
            {"error"},
            self.severities(findings, "continuity.current-state.missing"),
        )

    def test_current_state_requires_recovery_headings(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile(long_running=True)
        self.write("state/CURRENT-STATE.md", "# Current State\n\n## Goal\n")
        findings = audit_repository(self.root)
        self.assertIn("continuity.current-state.incomplete", self.codes(findings))

    def test_complete_current_state_satisfies_continuity_check(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile(long_running=True)
        self.write(
            "state/CURRENT-STATE.md",
            """# Current State

## Goal

## Authority / baseline

## Completed

## Current checkpoint

## Remaining

## Blockers / unresolved

## Evidence / artifacts

## Next safe action
""",
        )
        findings = audit_repository(self.root)
        current_state_codes = {
            code for code in self.codes(findings) if code.startswith("continuity.current-state")
        }
        self.assertEqual(set(), current_state_codes)

    def test_active_software_repository_requires_ci_and_test_command(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile(repository_kind="software", commands={})
        findings = audit_repository(self.root)
        codes = self.codes(findings)
        self.assertIn("software.command.test.missing", codes)
        self.assertIn("software.command.bootstrap.missing", codes)
        self.assertIn("software.ci.missing", codes)
        self.assertEqual(
            {"error"},
            self.severities(findings, "software.command.bootstrap.missing"),
        )

    def test_unpinned_remote_action_is_reported(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile(
            repository_kind="software",
            commands={"test": "python -m unittest"},
        )
        self.write(
            ".github/workflows/ci.yml",
            """name: CI
on: [push]
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
""",
        )
        findings = audit_repository(self.root)
        self.assertIn("actions.ref.unpinned", self.codes(findings))

    def test_full_commit_sha_action_reference_is_accepted(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile(
            repository_kind="software",
            commands={"test": "python -m unittest"},
        )
        self.write(
            ".github/workflows/ci.yml",
            """name: CI
on: [push]
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567
""",
        )
        findings = audit_repository(self.root)
        refs = [item for item in findings if item["code"] == "actions.ref.unpinned"]
        self.assertEqual([], refs)

    def test_workflow_without_explicit_permissions_is_reported(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile(
            repository_kind="software",
            commands={"test": "python -m unittest"},
        )
        self.write(
            ".github/workflows/ci.yml",
            """name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo ok
""",
        )
        findings = audit_repository(self.root)
        self.assertIn("actions.permissions.implicit", self.codes(findings))

    def test_top_level_write_permission_is_an_error(self) -> None:
        """Catch a write scope inherited by every job in a workflow."""
        self.add_minimal_repository_files()
        self.write_profile()
        self.write(
            ".github/workflows/report.yml",
            """name: Broad writer
on: workflow_dispatch
permissions:
  contents: write
jobs:
  report:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: echo report
""",
        )
        findings = audit_repository(self.root)
        self.assertIn("actions.permissions.top-level-write", self.codes(findings))
        self.assertEqual(
            {"error"},
            self.severities(findings, "actions.permissions.top-level-write"),
        )

    def test_every_workflow_job_requires_a_timeout(self) -> None:
        """Catch a job that can consume a runner indefinitely."""
        self.add_minimal_repository_files()
        self.write_profile()
        self.write(
            ".github/workflows/ci.yml",
            """name: CI
on: push
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo test
""",
        )
        findings = audit_repository(self.root)
        self.assertIn("actions.job.timeout-missing", self.codes(findings))
        self.assertEqual(
            {"error"},
            self.severities(findings, "actions.job.timeout-missing"),
        )

    def test_write_capable_workflow_requires_concurrency(self) -> None:
        """Catch overlapping issue/release/deploy mutations."""
        self.add_minimal_repository_files()
        self.write_profile()
        self.write(
            ".github/workflows/drift.yml",
            """name: Drift report
on: workflow_dispatch
permissions:
  contents: read
jobs:
  report:
    permissions:
      issues: write
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: gh issue create --title drift --body inspect
""",
        )
        findings = audit_repository(self.root)
        self.assertIn("actions.concurrency.missing", self.codes(findings))

    def test_read_only_validation_does_not_require_concurrency(self) -> None:
        """Avoid imposing state-mutation ceremony on a bounded read-only gate."""
        self.add_minimal_repository_files()
        self.write_profile()
        self.write(
            ".github/workflows/ci.yml",
            """name: CI
on: push
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: python3 -m unittest
""",
        )
        findings = audit_repository(self.root)
        concurrency_findings = [
            item for item in findings if item["code"] == "actions.concurrency.missing"
        ]
        self.assertEqual([], concurrency_findings)

    def test_unpinned_reusable_workflow_is_reported(self) -> None:
        """Catch mutable refs on reusable workflows, not only action steps."""
        self.add_minimal_repository_files()
        self.write_profile()
        self.write(
            ".github/workflows/reuse.yml",
            """name: Reuse
on: workflow_dispatch
permissions:
  contents: read
jobs:
  delegated:
    uses: octo-org/automation/.github/workflows/check.yml@main
""",
        )
        findings = audit_repository(self.root)
        self.assertIn("actions.ref.unpinned", self.codes(findings))

    def test_pull_request_target_with_checkout_is_an_error(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile(
            repository_kind="software",
            commands={"test": "python -m unittest"},
        )
        self.write(
            ".github/workflows/review.yml",
            """name: Unsafe review
on: pull_request_target
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567
""",
        )
        findings = audit_repository(self.root)
        self.assertIn("actions.pull-request-target.checkout", self.codes(findings))
        self.assertEqual(
            {"error"},
            self.severities(findings, "actions.pull-request-target.checkout"),
        )

    def test_pull_request_target_mapping_with_checkout_is_an_error(self) -> None:
        """Catch a privileged mapping-form event that checks out PR-controlled code."""
        self.add_minimal_repository_files()
        self.write_profile(
            repository_kind="software",
            commands={"test": "python -m unittest"},
        )
        self.write(
            ".github/workflows/review.yml",
            """name: Unsafe review
on:
  pull_request_target:
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567
""",
        )
        findings = audit_repository(self.root)
        self.assertIn("actions.pull-request-target.checkout", self.codes(findings))
        self.assertEqual(
            {"error"},
            self.severities(findings, "actions.pull-request-target.checkout"),
        )

    def test_write_all_permissions_are_an_error(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile(
            repository_kind="software",
            commands={"test": "python -m unittest"},
        )
        self.write(
            ".github/workflows/ci.yml",
            """name: CI
on: [push]
permissions: write-all
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo unsafe
""",
        )
        findings = audit_repository(self.root)
        self.assertIn("actions.permissions.write-all", self.codes(findings))

    def test_likely_committed_secret_filename_is_an_error(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile()
        self.write(".env", "TOKEN=not-a-real-token\n")
        findings = audit_repository(self.root)
        self.assertIn("secrets.likely-file", self.codes(findings))
        self.assertEqual(
            {"error"}, self.severities(findings, "secrets.likely-file")
        )

    def test_private_key_content_in_ordinary_file_is_an_error(self) -> None:
        """Catch high-confidence private-key material hidden by a safe filename."""
        self.add_minimal_repository_files()
        self.write_profile()
        private_key_header = "-----BEGIN " + "PRIVATE KEY-----"
        private_key_footer = "-----END " + "PRIVATE KEY-----"
        self.write(
            "docs/notes.txt",
            private_key_header + "\n" + ("A" * 64) + "\n" + private_key_footer + "\n",
        )
        findings = audit_repository(self.root)
        self.assertIn("secrets.likely-content", self.codes(findings))
        self.assertEqual(
            {"error"}, self.severities(findings, "secrets.likely-content")
        )

    def test_negative_private_key_assertion_is_not_a_secret(self) -> None:
        """Do not flag a guard that rejects the standalone PEM header marker."""
        self.add_minimal_repository_files()
        self.write_profile()
        private_key_header = "-----BEGIN " + "PRIVATE KEY-----"
        self.write(
            "tests/release.test.ts",
            'expect(file).not.toContain("' + private_key_header + '");\n',
        )
        findings = audit_repository(self.root)
        self.assertNotIn("secrets.likely-content", self.codes(findings))

    def test_provider_token_content_in_ordinary_file_is_an_error(self) -> None:
        """Catch a high-confidence provider-token shape without exposing it."""
        self.add_minimal_repository_files()
        self.write_profile()
        github_token = "gh" + "p_" + ("a" * 36)
        self.write("config/settings.ini", "token=" + github_token + "\n")
        findings = audit_repository(self.root)
        matches = [
            item for item in findings if item["code"] == "secrets.likely-content"
        ]
        self.assertEqual(["config/settings.ini"], [item["path"] for item in matches])
        self.assertNotIn(github_token, str(matches))

    def test_redacted_secret_examples_are_allowed(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile()
        self.write("docs/example.md", "OPENAI_API_KEY=sk-REDACTED\n")
        findings = audit_repository(self.root)
        self.assertNotIn("secrets.likely-content", self.codes(findings))

    def test_unsafe_cross_platform_filenames_are_errors(self) -> None:
        """Catch names that are ambiguous in shells, archives, or Windows checkouts."""
        self.add_minimal_repository_files()
        self.write_profile()
        unsafe_paths = {
            "-runner.sh",
            "docs/trailing. ",
            "docs/back\\slash.md",
            "docs/control\nname.md",
        }
        for relative in unsafe_paths:
            self.write(relative, "safe contents\n")
        findings = audit_repository(self.root)
        unsafe_findings = [
            item for item in findings if item["code"] == "repo.filename.unsafe"
        ]
        self.assertEqual(unsafe_paths, {str(item["path"]) for item in unsafe_findings})
        self.assertEqual({"error"}, {str(item["severity"]) for item in unsafe_findings})

    def test_private_high_risk_repository_requires_security_policy(self) -> None:
        """Catch a high-consequence private repository with no reporting contract."""
        self.add_minimal_repository_files()
        self.write(".github/CODEOWNERS", "* @owner\n")
        self.write_profile(risk="high")
        findings = audit_repository(self.root)
        self.assertIn("security.policy.missing", self.codes(findings))
        self.assertEqual(
            {"error"}, self.severities(findings, "security.policy.missing")
        )

    def test_public_high_risk_posture_requires_license_contributing_and_owners(self) -> None:
        """Catch missing public reuse, contribution, and sensitive-path posture."""
        self.add_minimal_repository_files()
        self.write("SECURITY.md", "# Security\n\nReport privately.\n")
        self.write_profile(visibility="public", risk="critical")
        findings = audit_repository(self.root)
        codes = self.codes(findings)
        self.assertIn("repo.license.missing", codes)
        self.assertIn("repo.contributing.missing", codes)
        self.assertIn("review.codeowners.missing", codes)

    def test_example_environment_file_is_allowed(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile()
        self.write(".env.example", "TOKEN=\n")
        findings = audit_repository(self.root)
        secret_findings = [
            item for item in findings if item["code"] == "secrets.likely-file"
        ]
        self.assertEqual([], secret_findings)


if __name__ == "__main__":
    unittest.main()
