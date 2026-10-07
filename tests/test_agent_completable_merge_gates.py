from __future__ import annotations

import re
import unittest
from pathlib import Path

from tests.root_migration_assertions import assert_routed_rule


ROOT = Path(__file__).resolve().parents[1]
RELATIVE = "patterns/agent-completable-merge-gates.md"
PATTERN = ROOT / RELATIVE


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class AgentCompletableMergeGatesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pattern = PATTERN.read_text(encoding="utf-8")

    def test_rules_state_each_requirement(self) -> None:
        for phrase in (
            "**Check the gates when the workstream starts.**",
            "from current settings evidence, not from repository files",
            "the permission or safety layer's own refusals, which can block an action the platform allows",
            "Check the exact action, not a neighboring one",
            "never by creating a hosted object just to probe",
            "Record can or cannot for each gate in the task checkpoint.",
            "**If the agent cannot complete a gate, raise one owner decision early.**",
            "at the start, not at the first merge",
            "**Do not hand the owner a recurring chore list.**",
            "the one decision in rule 2 covers them all",
            "**Keep owner clicks for decisions.**",
            "batch it into one step",
            "exact links to every target in one place",
            "a read-back the agent runs afterward to confirm it worked",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.pattern)

    def test_rules_are_listed_in_order(self) -> None:
        order = [
            self.pattern.index("1. **Check the gates when the workstream starts.**"),
            self.pattern.index("2. **If the agent cannot complete a gate, raise one owner decision early.**"),
            self.pattern.index("3. **Do not hand the owner a recurring chore list.**"),
            self.pattern.index("4. **Keep owner clicks for decisions.**"),
        ]
        self.assertEqual(order, sorted(order))

    def test_owner_decision_offers_the_substance_check_and_owner_approved_automation(self) -> None:
        for phrase in (
            "**Replace the gate with a check the agent can run that verifies substance** (the recommendation for a clerical gate; never offered for an approval gate).",
            "An approval gate exists for independent human authorization",
            "an agent-run check cannot stand in for that separation",
            "**Keep the gate and the clicks,** (the recommendation for an approval gate)",
            "the latest review of the exact head commit reports nothing open",
            "every earlier finding maps to a fix commit or to a written reason it was not changed",
            "the required status checks pass",
            "**Automate the gate with owner-approved tooling,**",
            "The agent never grants itself the permission that was refused.",
            "**Keep the gate and the clicks,**",
            "It is the owner's decision because it changes what the platform enforces.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.pattern)

    def test_the_pattern_grants_no_bypass_and_keeps_declared_gates(self) -> None:
        for phrase in (
            "It adds no gate and grants no authority.",
            "**No bypass.**",
            "use an owner-only bypass, merge around a refusal, or disguise a refused action behind another tool or route",
            "A refusal by the permission or safety layer is a boundary",
            "**A declared gate stays until the owner changes it.**",
            "A hosted setting counts as changed only when settings or API evidence shows it",
            "**One question per gate.**",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.pattern)
        # The sections the Bounds and rules point to exist.
        self.assertIn("### 5. Fail closed on genuine boundaries", read("patterns/worker-self-remediation-before-owner-interruption.md"))
        self.assertIn("### Declared gates are not accretion", read("patterns/owner-goal-followup-and-requirement-accretion.md"))
        self.assertIn("Treat every capability as an exact directional source", read("patterns/reasoning-selection.md"))

    def test_routes(self) -> None:
        assert_routed_rule(self, RELATIVE, (
            "Current universal pattern, promoted 2026-10-03",
            "## Transfer rationale and limits",
        ))
        index = read("LESSON-INDEX.md")
        entry = [line for line in index.splitlines() if f"`{RELATIVE}` —" in line]
        self.assertEqual(len(entry), 1)
        self.assertRegex(entry[0].split(" — ", 1)[1], r"^When\b")
        self.assertIn("a declared gate stays until the owner changes it", entry[0])
        self.assertIn("`../patterns/agent-completable-merge-gates.md`", read("docs/INDEX.md"))
        failure_map = read("patterns/logic-failure-map.md")
        row = [line for line in failure_map.splitlines() if line.startswith("| LF-8.6 |")]
        self.assertEqual(len(row), 1)
        self.assertIn(f"`{RELATIVE}`", row[0])
        self.assertIn("`patterns/worker-self-remediation-before-owner-interruption.md`", row[0])

    def test_existing_patterns_that_cover_part_of_the_lesson_point_here(self) -> None:
        system = read("patterns/codex-github-operating-system.md")
        section_six = system.split("## 6. Pull requests and default-branch governance", 1)[1].split("\n## 7.", 1)[0]
        self.assertIn("- review conversations resolved;", section_six)
        self.assertIn(f"`{RELATIVE}`", section_six)
        questions = read("patterns/owner-questions-page.md")
        for phrase in (
            "**For you to do (no decision needed).**",
            "an exact link to every target",
            "group them into one step",
            "it becomes one open question about removing or automating it",
            f"`{RELATIVE}`",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, questions)
        self.assertIn(f"`{RELATIVE}`", read("patterns/worker-self-remediation-before-owner-interruption.md"))

    def test_every_cited_pattern_exists(self) -> None:
        cited = set(re.findall(r"`(patterns/[A-Za-z0-9._-]+\.md)`", self.pattern))
        self.assertTrue(cited)
        for path in sorted(cited):
            with self.subTest(path=path):
                self.assertTrue((ROOT / path).is_file(), path)

    def test_pattern_carries_no_owner_person_or_project_data(self) -> None:
        self.assertNotRegex(self.pattern, r"https?://")
        self.assertNotRegex(self.pattern, r"(?i)claude\.ai|chatgpt\.com|u-dont-exist")
        self.assertNotRegex(self.pattern, r"(?<![\w`])#\d+\b")
        self.assertNotRegex(self.pattern, r"(?:^|[\s`(])(?:~?/|[A-Za-z]:\\)[^\s`]+")


if __name__ == "__main__":
    unittest.main()
