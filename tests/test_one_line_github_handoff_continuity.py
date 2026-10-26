from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
PATTERN = ROOT / "patterns" / "one-line-github-handoff-continuity.md"

class OneLineGithubHandoffContinuityTests(unittest.TestCase):
    def test_per_turn_rule_is_discoverable(self):
        pattern = PATTERN.read_text(encoding="utf-8")
        index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        root = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertEqual(sum("patterns/one-line-github-handoff-continuity.md" in l for l in index.splitlines()), 1)
        self.assertIn("patterns/one-line-github-handoff-continuity.md", root)
        self.assertIn("every UDA-governed assistant turn", pattern)
        self.assertIn("final, single-line GitHub handoff", pattern)
        self.assertIn("GitHub handoff:", pattern)
        self.assertIn("the *final line*", pattern)

    def test_fail_closed_and_privacy(self):
        pattern = PATTERN.read_text(encoding="utf-8")
        for expected in ("read back the exact GitHub checkpoint", "GitHub handoff: BLOCKED", 
                         "actually verified current GitHub destination", "private repository",
                         "Never publish raw emails", "STABLE", "unmerged"):
            if expected == "STABLE":  # avoid making prose case-dependent
                expected = "stable workstream"
            self.assertIn(expected, pattern)

if __name__ == "__main__":
    unittest.main()
