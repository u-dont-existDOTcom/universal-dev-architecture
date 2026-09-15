"""Instruction-scope regression, not runtime authorization evidence."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class MaintenanceScopeTests(unittest.TestCase):
    def test_owner_maintenance_is_separate_without_forged_evidence(self):
        text = (ROOT / "patterns/runtime-chat-work-authority-admission-and-internal-routing.md").read_text()
        self.assertIn("do not\nrequire a model-routing task-creation receipt", text)
        self.assertIn("not an unauthenticated runtime bypass", text)
        self.assertIn("A worker cannot relabel its own proposal", text)

    def test_local_trigger_does_not_reintroduce_circular_gate(self):
        text = (ROOT / "tools/codex-mission-control/restored/codex-mission-control/AGENTS.md").read_text()
        self.assertNotIn("Before substantive Work", text)
        self.assertIn("For autonomous delegated Work", text)
        self.assertIn("worker raw setters are forbidden", text)
        self.assertIn("Do not require Mission Control's model-routing receipt", text)
