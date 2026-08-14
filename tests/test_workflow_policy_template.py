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
            "flow-sequence": "on: [push, pull_request_target]",
            "flow-map": "on: {push: {}, pull_request_target: {}}",
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


if __name__ == "__main__":
    unittest.main()
