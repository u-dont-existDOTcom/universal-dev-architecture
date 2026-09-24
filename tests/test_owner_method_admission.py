"""Behavioral fixtures: no prose-token assertions can satisfy these tests."""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("owner_method", ROOT / "scripts/owner_method_admission.py")
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class OwnerMethodAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.owner = {
            "owner_outcome_id": "synthetic-owner-goal-v1",
            "protected_dimensions": {"composition": "pooled_components", "fitting": "authorized", "weights": "equal_binary"},
            "required_operations": ["raw_stack", "lineage_dedup", "staged_challenge"],
            "permitted_operations": ["development_refit"],
            "required_outcomes": ["date_recovery", "time_resolution"],
        }
        self.operation = {
            "owner_outcome_id": self.owner["owner_outcome_id"],
            "protected_dimensions": copy.deepcopy(self.owner["protected_dimensions"]),
            "operations": list(self.owner["required_operations"]),
            "parent_outcome_status": "OPEN",
        }

    def test_authorized_fitting_is_admitted(self):
        guard.admit(self.owner, self.operation)

    def test_stricter_component_gate_is_substitution(self):
        self.operation["protected_dimensions"]["composition"] = "every_component_independently_passes"
        with self.assertRaisesRegex(ValueError, "OWNER_DIMENSION_CHANGED:composition"):
            guard.admit(self.owner, self.operation)

    def test_training_prohibition_is_rejected(self):
        self.operation["prohibited_operations"] = ["development_refit"]
        with self.assertRaisesRegex(ValueError, "OWNER_PERMISSION_REMOVED"):
            guard.admit(self.owner, self.operation)

    def test_arbitrary_weights_are_rejected(self):
        self.operation["protected_dimensions"]["weights"] = "continuous_fitted_weights"
        self.assertIn("OWNER_DIMENSION_CHANGED:weights", guard.violations(self.owner, self.operation))

    def test_omitted_promised_arm_is_rejected(self):
        self.operation["operations"].remove("raw_stack")
        self.assertIn("OWNER_OPERATION_OMITTED:raw_stack", guard.violations(self.owner, self.operation))

    def test_label_does_not_prohibit_experiment(self):
        self.operation["added_requirements"] = [{"id": "in_sample", "origin": "ASSISTANT_INFERENCE", "effect": "claim_qualification_only"}]
        guard.admit(self.owner, self.operation)

    def test_other_arm_success_cannot_be_invented_gate(self):
        self.operation["added_requirements"] = [{"id": "other_arm_must_pass", "origin": "ASSISTANT_INFERENCE", "necessity": "UNRESOLVED", "effect": "blocks_execution"}]
        self.assertIn("UNAUTHORIZED_MANDATORY_REQUIREMENT:other_arm_must_pass", guard.violations(self.owner, self.operation))

    def test_real_external_requirement_preserved(self):
        self.operation["added_requirements"] = [{"id": "privacy", "origin": "EXTERNAL_HARD_REQUIREMENT", "effect": "blocks_execution"}]
        guard.admit(self.owner, self.operation)

    def test_child_complete_does_not_close_parent(self):
        self.operation.update(parent_outcome_status="SATISFIED", outcome_evidence={"diagnostic": "MET"})
        self.assertIn("CHILD_COMPLETION_CANNOT_CLOSE_PARENT", guard.violations(self.owner, self.operation))

    def test_all_owner_outcomes_required_for_close(self):
        self.operation.update(parent_outcome_status="SATISFIED", outcome_evidence={"date_recovery": "MET", "time_resolution": "MET"})
        guard.admit(self.owner, self.operation)

    def test_malformed_and_stale_contracts_fail(self):
        for owner, operation in [(None, self.operation), ({}, {}), (self.owner, {**self.operation, "owner_outcome_id": "old"})]:
            self.assertTrue(guard.violations(owner, operation))


if __name__ == "__main__":
    unittest.main()
