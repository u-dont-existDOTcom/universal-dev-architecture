from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RULE_FILE = "patterns/reasoning-selection.md"
MC_ROUTE = "patterns/outcome-advancement-and-strategy-efficacy.md"


class StrategyFitAndEfficacyRuleTests(unittest.TestCase):
    """The strategy rule is universal (owner, 2026-10-09), not a Mission Control-only control."""

    def read(self, relative_path: str) -> str:
        return (ROOT / relative_path).read_text(encoding="utf-8")

    def core(self) -> str:
        text = self.read(RULE_FILE)
        return text.split("## Universal core", 1)[1].split("\n## ", 1)[0]

    def test_rule_sits_in_the_universal_core_for_every_task(self) -> None:
        block = self.core().split("STRATEGY FIT AND EFFICACY", 1)[1]
        for phrase in (
            "any agent on any substantive or iterative task, in any domain",
            "the MC rule should have been a UDA rule actually",
            "**Fit before building.**",
            "A model reads and judges language, meaning, tone and intent.",
            "Code computes exact, structural and repeatable things.",
            "**Judge progress by the outcome, not the activity.**",
            "Continuation is goal-directed, not method-directed.",
            "**Switch when the method isn't working.**",
            "causally different approach",
            "The same method renamed or reworded is not a new approach.",
            "**Don't wait for the owner.**",
            "don't invent attempt counts",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, block)

    def test_index_routes_every_method_choice_to_the_rule(self) -> None:
        index_lines = self.read("LESSON-INDEX.md").splitlines()
        entry = next(line for line in index_lines if line.startswith("38. `patterns/reasoning-selection.md` — "))
        self.assertIn("For any substantive or iterative task, when choosing, building or switching a method", entry)
        self.assertIn("switch to a causally different approach", entry)

    def test_mission_control_patterns_are_its_implementation(self) -> None:
        block = self.core().split("STRATEGY FIT AND EFFICACY", 1)[1]
        self.assertIn(MC_ROUTE, block)
        self.assertIn("patterns/failed-strategy-lineage-and-negative-evidence-binding.md", block)
        mc = self.read(MC_ROUTE)
        self.assertIn("universal strategy fit and efficacy rule in `patterns/reasoning-selection.md`", mc.split("\n## 1.", 1)[0])
        index_lines = self.read("LESSON-INDEX.md").splitlines()
        mc_entry = next(line for line in index_lines if f"`{MC_ROUTE}` —" in line)
        self.assertIn("Mission Control implementation of the universal strategy fit and efficacy rule", mc_entry)


if __name__ == "__main__":
    unittest.main()
