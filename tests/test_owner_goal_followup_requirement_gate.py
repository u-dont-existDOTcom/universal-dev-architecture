import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class OwnerGoalFollowupRequirementGateTests(unittest.TestCase):
    def read(self, rel):
        return (ROOT / rel).read_text(encoding="utf-8")

    def test_root_bootstrap_activates_gate_at_followup_authoring(self):
        text = self.read("AGENTS.md")
        self.assertIn("## Follow-up goal derivation and assistant-added requirements", text)
        self.assertIn("patterns/owner-goal-followup-and-requirement-accretion.md", text)
        self.assertIn("First classify the root outcome", text)
        self.assertIn("This gate runs at follow-up-task authoring", text)
        self.assertIn("previously working owner-aligned path", text)

    def test_pattern_catches_requirement_accretion_symmetrically(self):
        text = self.read("patterns/owner-goal-followup-and-requirement-accretion.md")
        for token in (
            "ASSISTANT_ADDED_MANDATORY_REQUIREMENT",
            "UNAUTHORIZED_ASSURANCE_ESCALATION",
            "MANUFACTURED_PREREQUISITE",
            "REJECT_REQUIREMENT_ACCRETION",
            "BOUNDED_EXPERIMENT_ONLY",
            "OPTIONAL_IMPROVEMENT",
        ):
            self.assertIn(token, text)
        self.assertIn("requirement accretion / scope expansion", text.lower())
        self.assertIn("strongest materially simpler route", text.lower())

    def test_unresolved_assistant_requirement_cannot_become_blocker(self):
        text = self.read("patterns/owner-goal-followup-and-requirement-accretion.md")
        self.assertIn("`ASSISTANT_INFERENCE`", text)
        self.assertIn("`UNRESOLVED`", text)
        self.assertIn("It may not become:", text)
        self.assertIn("a fail-closed blocker", text)
        self.assertIn("a reason to disable a working owner-aligned capability", text)

    def test_assurance_escalation_is_treated_as_new_requirement(self):
        text = self.read("patterns/owner-goal-followup-and-requirement-accretion.md")
        self.assertIn("## 4. Assurance escalation is requirement accretion", text)
        self.assertIn("independent readback", text.lower())
        self.assertIn("provider-side attestation", text.lower())
        self.assertIn("smallest sufficient assurance level", text.lower())
        self.assertIn("assurance ratchet", text.lower())

    def test_exact_model_routing_regression_is_preserved(self):
        text = self.read("patterns/owner-goal-followup-and-requirement-accretion.md")
        self.assertIn("## 8. Exact regression: model-routing wild-goose chase", text)
        self.assertIn("optimize GPT-5.6 Sol vs GPT-6 Astra Work routing", text)
        self.assertIn("browser control can already create chats/Work threads", text)
        self.assertIn("REJECT_REQUIREMENT_ACCRETION", text)
        self.assertIn("RESTORE_OWNER_ALIGNED_WORKING_PATH", text)

    def test_codex_task_carries_followup_derivation_gate(self):
        text = self.read("templates/CODEX-TASK.md")
        self.assertIn("### Follow-up goal / added-requirement gate", text)
        self.assertIn("Parent owner-outcome state", text)
        self.assertIn("Exact remaining owner gap", text)
        self.assertIn("Strongest simpler alternative", text)
        self.assertIn("Necessity", text)
        self.assertIn("REJECT_REQUIREMENT_ACCRETION", text)
        self.assertIn("patterns/owner-goal-followup-and-requirement-accretion.md", text)

    def test_lesson_index_and_owner_requirement_are_durable(self):
        index = self.read("LESSON-INDEX.md")
        requirement = self.read(
            "docs/requirements/2026-09-14-owner-goal-followup-and-requirement-accretion.owner-requirement.md"
        )
        self.assertIn("patterns/owner-goal-followup-and-requirement-accretion.md", index)
        self.assertIn("follow-up-task authoring", requirement)
        self.assertIn("ASSISTANT_ADDED_MANDATORY_REQUIREMENT", requirement)
        self.assertIn("UNAUTHORIZED_ASSURANCE_ESCALATION", requirement)


if __name__ == "__main__":
    unittest.main()
