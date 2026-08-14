from __future__ import annotations

import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "templates/WORKFLOW-POLICY.yml"


def embedded_policy_script() -> str:
    lines = TEMPLATE.read_text(encoding="utf-8").splitlines()
    start = lines.index("          python3 - <<'PY'") + 1
    end = lines.index("          PY", start)
    return textwrap.dedent("\n".join(lines[start:end]))


class WorkflowPolicyTemplateTests(unittest.TestCase):
    def run_policy(self, workflows: dict[str, str]) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            workflow_dir = Path(directory) / ".github/workflows"
            workflow_dir.mkdir(parents=True)
            for name, workflow in workflows.items():
                (workflow_dir / name).write_text(workflow, encoding="utf-8")
            return subprocess.run(
                [sys.executable, "-c", embedded_policy_script()],
                cwd=directory,
                capture_output=True,
                text=True,
                check=False,
            )

    def test_template_does_not_flag_its_own_embedded_source(self) -> None:
        result = self.run_policy({"policy.yml": TEMPLATE.read_text(encoding="utf-8")})

        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("workflow policy passed", result.stdout)

    def test_pull_request_target_checkout_forms_are_rejected(self) -> None:
        triggers = {
            "scalar": "on: pull_request_target",
            "block-map": "on:\n  pull_request_target:",
            "block-sequence": "on:\n  - push\n  - pull_request_target",
            "indentationless-block-sequence": "on:\n- push\n- pull_request_target",
            "split-block-sequence-item": "on:\n  - push\n  -\n    pull_request_target",
            "anchored-block-sequence": "on: &events\n  - push\n  - pull_request_target",
            "aliased-event-node": (
                "x-events: &events\n  - push\n  - pull_request_target\non: *events"
            ),
            "block-scalar": "on: >-\n  pull_request_target",
            "escaped-scalar": 'on: "pull_request_\\u0074arget"',
            "explicit-key": "? on\n: pull_request_target",
            "flow-sequence": "on: [push, pull_request_target]",
            "flow-map": "on: {push: {}, pull_request_target: {}}",
            "multiline-flow-sequence": "on: [\n  push,\n  pull_request_target\n]",
            "multiline-flow-map": "on: {\n  push: {},\n  pull_request_target: {}\n}",
        }
        for label, trigger in triggers.items():
            with self.subTest(label=label):
                result = self.run_policy(
                    {
                        "unsafe.yml": f"""name: Unsafe
{trigger}
permissions:
  contents: read
jobs:
  unsafe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567
"""
                    }
                )

                self.assertEqual(1, result.returncode, result.stdout)
                self.assertIn(
                    "pull_request_target must not check out or execute untrusted pull-request code",
                    result.stdout,
                )

    def test_root_flow_workflow_with_pull_request_target_is_rejected(self) -> None:
        result = self.run_policy(
            {
                "unsafe.yml": """{name: Unsafe, on: pull_request_target,
permissions: {contents: read}, jobs: {unsafe: {runs-on: ubuntu-latest,
steps: [{"uses": actions/checkout@0123456789abcdef0123456789abcdef01234567}]}}}
"""
            }
        )

        self.assertEqual(1, result.returncode, result.stdout)
        self.assertIn(
            "pull_request_target must not check out or execute untrusted pull-request code",
            result.stdout,
        )

    def test_document_marker_before_root_flow_workflow_is_rejected(self) -> None:
        result = self.run_policy(
            {
                "unsafe.yml": """---
{name: Unsafe, on: pull_request_target,
permissions: {contents: read}, jobs: {unsafe: {runs-on: ubuntu-latest,
steps: [{uses: actions/checkout@0123456789abcdef0123456789abcdef01234567}]}}}
"""
            }
        )

        self.assertEqual(1, result.returncode, result.stdout)
        self.assertIn(
            "pull_request_target must not check out or execute untrusted pull-request code",
            result.stdout,
        )

    def test_flow_filter_value_is_not_a_privileged_event(self) -> None:
        result = self.run_policy(
            {
                "safe.yml": """name: Safe branch filter
on: {push: {branches: [pull_request_target]}}
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - "uses" : actions/checkout@0123456789abcdef0123456789abcdef01234567
"""
            }
        )

        self.assertEqual(0, result.returncode, result.stdout)

    def test_mixed_case_checkout_owner_and_repository_is_rejected(self) -> None:
        result = self.run_policy(
            {
                "unsafe.yml": """name: Unsafe mixed-case checkout
on: pull_request_target
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: Actions/Checkout@0123456789abcdef0123456789abcdef01234567
"""
            }
        )

        self.assertEqual(1, result.returncode, result.stdout)
        self.assertIn(
            "pull_request_target must not check out or execute untrusted pull-request code",
            result.stdout,
        )

    def test_explicit_uses_key_inside_step_is_rejected(self) -> None:
        result = self.run_policy(
            {
                "unsafe.yml": """name: Unsafe explicit action key
on: pull_request_target
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        ? uses
        : actions/checkout@0123456789abcdef0123456789abcdef01234567
"""
            }
        )

        self.assertEqual(1, result.returncode, result.stdout)
        self.assertIn(
            "pull_request_target must not check out or execute untrusted pull-request code",
            result.stdout,
        )

    def test_quoted_flow_unpinned_action_is_rejected(self) -> None:
        result = self.run_policy(
            {
                "unsafe.yml": """name: Unpinned flow action
on: push
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps: [{"uses": owner/action@v1}]
"""
            }
        )

        self.assertEqual(1, result.returncode, result.stdout)
        self.assertIn("owner/action@v1", result.stdout)

    def test_escaped_uses_key_is_rejected_when_unpinned(self) -> None:
        result = self.run_policy(
            {
                "unsafe.yml": """name: Escaped action key
on: push
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - "\\u0075ses": owner/action@v1
"""
            }
        )

        self.assertEqual(1, result.returncode, result.stdout)
        self.assertIn("owner/action@v1", result.stdout)

    def test_aliased_action_is_unresolved_and_may_hide_checkout(self) -> None:
        result = self.run_policy(
            {
                "unsafe.yml": """name: Unsafe alias
on: pull_request_target
permissions:
  contents: read
env:
  CHECKOUT_ACTION: &checkout actions/checkout@0123456789abcdef0123456789abcdef01234567
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: *checkout
"""
            }
        )

        self.assertEqual(1, result.returncode, result.stdout)
        self.assertIn(
            "pull_request_target must not check out or execute untrusted pull-request code",
            result.stdout,
        )
        self.assertIn("cannot be resolved statically", result.stdout)

    def test_non_action_uses_mappings_are_ignored(self) -> None:
        result = self.run_policy(
            {
                "safe.yml": """name: Safe uses inputs
on: pull_request_target
permissions:
  contents: read
env:
  uses: harmless
jobs:
  review:
    runs-on: ubuntu-latest
    env:
      uses: harmless
    steps:
      - name: Pinned non-checkout action
        uses: owner/action@0123456789abcdef0123456789abcdef01234567
        with: {uses: harmless}
"""
            }
        )

        self.assertEqual(0, result.returncode, result.stdout)

    def test_job_level_reusable_workflow_is_rejected_when_unpinned(self) -> None:
        result = self.run_policy(
            {
                "unsafe.yml": """name: Reusable workflow caller
on: push
permissions:
  contents: read
jobs:
  call:
    uses: owner/repository/.github/workflows/reusable.yml@v1
"""
            }
        )

        self.assertEqual(1, result.returncode, result.stdout)
        self.assertIn("owner/repository/.github/workflows/reusable.yml@v1", result.stdout)

    def test_indentationless_step_sequence_is_rejected_when_unpinned(self) -> None:
        result = self.run_policy(
            {
                "unsafe.yml": """name: Indentationless steps
on: push
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - name: Unpinned action
      uses: owner/action@v1
"""
            }
        )

        self.assertEqual(1, result.returncode, result.stdout)
        self.assertIn("owner/action@v1", result.stdout)

    def test_aliased_steps_node_is_unresolved_and_may_hide_checkout(self) -> None:
        result = self.run_policy(
            {
                "unsafe.yml": """name: Unsafe aliased steps
on: pull_request_target
permissions:
  contents: read
x-steps: &review-steps
  - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567
jobs:
  review:
    runs-on: ubuntu-latest
    steps: *review-steps
"""
            }
        )

        self.assertEqual(1, result.returncode, result.stdout)
        self.assertIn(
            "pull_request_target must not check out or execute untrusted pull-request code",
            result.stdout,
        )
        self.assertIn("cannot be resolved statically", result.stdout)


if __name__ == "__main__":
    unittest.main()
