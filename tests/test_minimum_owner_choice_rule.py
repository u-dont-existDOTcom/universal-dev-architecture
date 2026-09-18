import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class MinimumOwnerChoiceRuleTests(unittest.TestCase):
    def test_root_contract_minimizes_owner_choice_and_coalesces_mandatory_gates(self):
        text = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("Minimize owner choice as an execution invariant", text)
        self.assertIn("consolidate the exact dependent actions", text)
        self.assertIn("resume automatically after the answer", text)
        self.assertIn("destination, data boundary, scope, and consequence", text)
        self.assertIn("across retries, resumed execution, or an alternate authorized transport path", text)
        self.assertIn("does not consume that approval", text)
        self.assertIn("concrete downside or risk", text)

    def test_reasoning_pattern_distinguishes_tradeoffs_from_mandatory_confirmation(self):
        text = (ROOT / "patterns/reasoning-selection.md").read_text(encoding="utf-8")
        self.assertIn("### Minimum-owner-choice rule", text)
        self.assertIn("irreducible human value, preference, or understanding", text)
        self.assertIn("do not misrepresent the interruption as a preference choice", text)
        self.assertIn("a fresh platform-mandated gesture", text)
        self.assertIn("alternate authorized transport mechanisms", text)
        self.assertIn("failed tool call, safety review, credential path, or transport path", text)
        self.assertIn("recommended default", text)

    def test_owner_requirement_preserves_the_choice_minimization_instruction(self):
        text = (ROOT / "docs/requirements/2026-09-12-universal-reasoning-retrieval-and-delivery.owner-requirement.md").read_text(encoding="utf-8")
        self.assertIn("Require as little owner choice as possible", text)
        self.assertIn("Ask only for a real material tradeoff", text)
        self.assertIn("continue automatically once it is satisfied", text)


    def test_worker_pattern_carries_prior_approval_across_execution_path_failures(self):
        text = (ROOT / "patterns/worker-self-remediation-before-owner-interruption.md").read_text(encoding="utf-8")
        self.assertIn("### 3B. Carry forward valid owner approval", text)
        self.assertIn("failed tool call, safety review, credential helper, remote transport", text)
        self.assertIn("explain the concrete downside or risk", text)
        self.assertIn("Do not send a bare", text)

    def test_owner_correction_is_durable(self):
        text = (ROOT / "docs/requirements/2026-09-18-owner-approval-carry-forward.owner-requirement.json").read_text(encoding="utf-8")
        self.assertIn("OWNER-APPROVAL-CARRY-FORWARD-001", text)
        self.assertIn("OWNER-INTERRUPTION-DOWNSIDE-001", text)


if __name__ == "__main__":
    unittest.main()
