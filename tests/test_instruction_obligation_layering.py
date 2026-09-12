from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("instruction_surface_audit", ROOT / "scripts/instruction_surface_audit.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

class InstructionBoundarySourceTests(unittest.TestCase):
    """Structural source checks only: not a provider-behavior or runtime receipt."""
    def test_source_profile_resolves_without_cycles(self):
        profile = json.loads((ROOT / "scripts/instruction-layering-profile.json").read_text())
        self.assertEqual(MODULE.check_profile(ROOT, profile), [])

    def test_mission_control_native_chain_fits_documented_default(self):
        paths = ["AGENTS.md", "tools/codex-mission-control/AGENTS.md",
                 "tools/codex-mission-control/restored/codex-mission-control/AGENTS.md"]
        self.assertLessEqual(sum((ROOT / p).stat().st_size for p in paths), 32768)

    def test_timestamp_destination_and_current_turn_remain_explicit(self):
        text = (ROOT / "AGENTS.md").read_text()
        self.assertIn("every assistant turn", text)
        self.assertIn("repeat it in the final answer", text)
        self.assertIn("If the cause is unknown", text)

    def test_unknown_is_not_admission(self):
        contract = (ROOT / "templates/ACTIVE-LESSON-CONTRACT.md").read_text()
        self.assertIn("`UNKNOWN` evidence for a mandatory obligation", contract)
        self.assertIn("blocks the affected delivery/action", contract)

    def test_different_domains_do_not_grant_authority(self):
        pattern = (ROOT / "patterns/instruction-composition-and-portable-intelligence.md").read_text()
        self.assertIn("HRP does not authorize deployment or spending", pattern)
        self.assertIn("does not establish scientific adequacy", pattern)

if __name__ == "__main__":
    unittest.main()
