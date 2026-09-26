from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


class DeclaredGatesNotWaivableTests(unittest.TestCase):
    def assert_fragments(self, text, fragments):
        for fragment in fragments:
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, text)

    def test_owner_requirement_is_active(self):
        data = json.loads(read("docs/requirements/2026-09-26-declared-gates-not-waivable.owner-requirement.json"))
        self.assertEqual(data["status"], "ACTIVE_OWNER_REQUIREMENT")
        self.assertEqual(data["date"], "2026-09-26")
        self.assert_fragments(data["normalized_rule"], (
            "hard gate in every assurance lane",
            "never downgrades it",
            "persist the evidence before the call",
            "enters the active lesson contract as one unit",
            "never instead of them",
            "persists through context compaction",
        ))
        self.assertIn("transfer_rationale", data)
        self.assertIn("limits", data)

    def test_root_bootstrap_carries_the_rule(self):
        # The root instruction chain sits at Codex's 32 KiB discovery budget, so the root
        # carries only the accretion carve-out and routes to the patterns for the rest.
        text = read("AGENTS.md")
        self.assert_fragments(text, (
            "inherited choice (not a declared gate) with unresolved necessity",
            "activation uses `patterns/task-time-lesson-activation.md`",
            "patterns/owner-goal-followup-and-requirement-accretion.md",
        ))

    def test_assurance_lanes_keep_declared_gates_hard(self):
        self.assert_fragments(read("patterns/development-assurance-lanes.md"), (
            "Gates that the project's authority files or the owner declare blocking are hard gates in every lane.",
            "early owner or product evaluation comes after those gates, never instead of them",
        ))

    def test_compaction_checkpoint_carries_gates(self):
        self.assert_fragments(read("patterns/context-compaction-resilience.md"), (
            "bootstrap requirements and blocking gates that the task directive or handoff established",
            "Re-activating the task's gates is part of resuming.",
        ))

    def test_activation_pattern_enforces_declared_checks(self):
        self.assert_fragments(read("patterns/task-time-lesson-activation.md"), (
            "enters the contract as **one unit**",
            "never licenses running part of a declared checklist or skipping a declared gate",
            "Early return comes **after** the candidate passes every check the owner has already stated",
            "It never makes the owner the checker for rules the owner already gave",
            "Submitting a candidate to an external evaluator or detector is a consequential tool action.",
            "context compaction, a resumed session, or work continued from a summary or handoff",
            "A summary that names a rule is not activation evidence",
        ))

    def test_unhelpful_inherited_rules_are_flagged_not_ignored(self):
        data = json.loads(read("docs/requirements/2026-09-26-declared-gates-not-waivable.owner-requirement.json"))
        self.assertIn("we can't just go anarchist", data["owner_refinement"])
        self.assertIn("never silently ignored, worked around, or obeyed against the owner's evident intent", data["normalized_rule"])
        self.assert_fragments(read("patterns/owner-goal-followup-and-requirement-accretion.md"), (
            "### Inherited rules that look unhelpful: flag them, don't ignore them",
            "keep following it, and tell the owner in the same turn",
            "I find this inherited rule unhelpful here, and I suggest we remove it",
            "when two rules conflict, say so instead of silently picking one",
            "pause that step and ask",
            "record the flag next to the rule",
            "It is not for deciding whether a rule applies to you.",
            "A disagreement with a rule is raised, not acted on alone, and the owner decides what changes.",
        ))
        self.assert_fragments(read("patterns/task-time-lesson-activation.md"), (
            "A lesson that looks unhelpful for this task is still applied",
            "never for a rule the agent disagrees with",
        ))

    def test_accretion_pattern_exempts_declared_gates(self):
        self.assert_fragments(read("patterns/owner-goal-followup-and-requirement-accretion.md"), (
            "### Declared gates are not accretion",
            "It never downgrades a gate that already exists in the project's current authority",
            "Such a gate is not an `INHERITED_PROJECT_CHOICE` with unresolved necessity.",
            "Skipping or thinning a declared gate on the strength of this pattern is itself an owner-outcome violation",
            "Running a reviewer, evaluator or check that the project's authority or the owner already requires is not escalation",
        ))


if __name__ == "__main__":
    unittest.main()
