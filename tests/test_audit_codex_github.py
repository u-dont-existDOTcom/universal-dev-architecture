from __future__ import annotations

import json
import subprocess
import tempfile
import textwrap
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

    def test_invalid_profile_is_an_error(self) -> None:
        self.add_minimal_repository_files()
        self.write(".github/codex-repository.json", "{not-json}\n")
        findings = audit_repository(self.root)
        self.assertIn("repo.profile.invalid", self.codes(findings))
        self.assertEqual(
            {"error"}, self.severities(findings, "repo.profile.invalid")
        )

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
        self.assertIn("software.ci.missing", codes)

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

    def test_pull_request_target_text_inside_script_is_not_an_event(self) -> None:
        self.add_minimal_repository_files()
        self.write_profile(
            repository_kind="software",
            commands={"test": "python -m unittest"},
        )
        self.write(
            ".github/workflows/policy.yml",
            """name: Safe policy
on:
  pull_request:
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567
      - run: |
          if "pull_request_target" in workflow_text:
              print("inspect only")
          on: pull_request_target
          uses: actions/checkout@v4
""",
        )
        findings = audit_repository(self.root)
        self.assertNotIn("actions.pull-request-target.checkout", self.codes(findings))
        self.assertNotIn("actions.ref.unpinned", self.codes(findings))

    def test_pull_request_target_flow_forms_with_checkout_are_errors(self) -> None:
        for index, event in enumerate(
            (
                "on: [push, pull_request_target]",
                "on: {push: {}, pull_request_target: {}}",
                "on:\n  - push\n  - pull_request_target",
            )
        ):
            with self.subTest(event=event):
                self.add_minimal_repository_files()
                self.write_profile(
                    repository_kind="software",
                    commands={"test": "python -m unittest"},
                )
                self.write(
                    f".github/workflows/review-{index}.yml",
                    f"""name: Unsafe flow review
{event}
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
                (self.root / f".github/workflows/review-{index}.yml").unlink()

    def test_portable_workflow_policy_ignores_its_own_scanner_text(self) -> None:
        template = Path("templates/WORKFLOW-POLICY.yml").read_text(encoding="utf-8")
        marker = "          python3 - <<'PY'\n"
        self.assertIn(marker, template)
        embedded = template.split(marker, 1)[1].rsplit("\n          PY", 1)[0]
        script = textwrap.dedent(embedded)
        self.write(".github/workflows/policy.yml", template)
        self.write(
            ".github/workflows/safe-job-name.yml",
            """name: Safe job name
on: pull_request
permissions:
  contents: read
jobs:
  pull_request_target:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567
""",
        )

        safe = subprocess.run(
            ["python3", "-c", script],
            cwd=self.root,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(0, safe.returncode, safe.stdout + safe.stderr)

        self.write(
            ".github/workflows/unsafe.yml",
            """name: Unsafe
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
        unsafe = subprocess.run(
            ["python3", "-c", script],
            cwd=self.root,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(1, unsafe.returncode, unsafe.stdout + unsafe.stderr)

        self.write(
            ".github/workflows/unsafe.yml",
            """name: Unsafe block list
on:
  - push
  - pull_request_target
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567
""",
        )
        unsafe_list = subprocess.run(
            ["python3", "-c", script],
            cwd=self.root,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(1, unsafe_list.returncode, unsafe_list.stdout + unsafe_list.stderr)

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
