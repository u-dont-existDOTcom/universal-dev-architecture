import copy
import json
import unittest
from pathlib import Path

from scripts import uda_rule_graph_task_time as task_time

ROOT = Path(__file__).resolve().parents[1]


class UdaRuleGraphTaskTimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / "rules/rule-graph/task-time-metadata.v1.json").read_text())
        cls.profile = json.loads((ROOT / "scripts/instruction-layering-profile.json").read_text())
        cls.work = json.loads((ROOT / "examples/rule-graph/work-handoff.json").read_text())
        cls.instruction = json.loads((ROOT / "examples/rule-graph/instruction-only.json").read_text())
        cls.evaluator_followup = json.loads((ROOT / "examples/rule-graph/evaluator-followup.json").read_text())

    def ids(self, contract):
        return [item["rule_id"] for item in contract["selected_rules"]]

    def test_graph_closure_adds_boundary_rule_over_flat_catalog(self):
        flat = task_time.compile_contract(self.catalog, self.profile, self.work, "flat")
        graph = task_time.compile_contract(self.catalog, self.profile, self.work, "graph")
        self.assertNotIn("uda.active-contract.boundary-binding", self.ids(flat))
        self.assertIn("uda.active-contract.boundary-binding", self.ids(graph))
        self.assertGreater(len(graph["selected_rules"]), len(flat["selected_rules"]))

    def test_evaluator_followup_activates_owner_goal_derivation(self):
        graph = task_time.compile_contract(self.catalog, self.profile, self.evaluator_followup, "graph")
        ids = self.ids(graph)
        self.assertIn("uda.owner-goal.followup-derivation", ids)
        self.assertIn("uda.active-contract.boundary-binding", ids)

    def test_instruction_only_blocks_continuation_trigger(self):
        graph = task_time.compile_contract(self.catalog, self.profile, self.instruction, "graph")
        self.assertIn("uda.scope.explicit-no-change", self.ids(graph))
        self.assertNotIn("uda.continuation.open-outcome", self.ids(graph))

    def test_owner_correction_recompiles_with_reactivation(self):
        task = copy.deepcopy(self.work)
        task["facts"]["owner_correction_present"] = {"state": "KNOWN", "value": True, "provenance": "owner"}
        graph = task_time.compile_contract(self.catalog, self.profile, task, "graph")
        self.assertIn("uda.owner-correction.reactivate", self.ids(graph))

    def test_three_valued_logic_preserves_unknown(self):
        self.assertEqual(task_time.evaluate({"fact": "x", "eq": True}, {}), task_time.UNKNOWN)
        self.assertEqual(task_time.evaluate({"not": {"fact": "x", "eq": True}}, {}), task_time.UNKNOWN)
        known_false = {"x": {"state": "KNOWN", "value": False, "provenance": "test"}}
        self.assertEqual(task_time.evaluate({"all": [{"fact": "missing", "eq": True}, {"fact": "x", "eq": False}]}, known_false), task_time.UNKNOWN)
        known_true = {"x": {"state": "KNOWN", "value": True, "provenance": "test"}}
        self.assertEqual(task_time.evaluate({"any": [{"fact": "missing", "eq": True}, {"fact": "x", "eq": True}]}, known_true), task_time.TRUE)

    def test_source_selector_drift_fails_closed(self):
        mutant = copy.deepcopy(self.catalog)
        mutant["records"][0]["source"]["selectors"][0]["text"] += " impossible-drift"
        with self.assertRaises(task_time.RuleGraphError) as caught:
            task_time.validate(mutant, self.profile)
        self.assertEqual(caught.exception.code, "SOURCE_SELECTOR_CARDINALITY")

    def test_positive_requires_cycle_is_finite(self):
        mutant = copy.deepcopy(self.catalog)
        boundary = next(x for x in mutant["records"] if x["rule_id"] == "uda.active-contract.boundary-binding")
        boundary["relations"] = [{"type": "requires", "rule_id": "uda.final.timestamp", "supplies": ["cycle fixture"]}]
        contract = task_time.compile_contract(mutant, self.profile, self.instruction, "graph")
        ids = self.ids(contract)
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIn("uda.final.timestamp", ids)
        self.assertIn("uda.active-contract.boundary-binding", ids)

    def test_timestamp_check_binds_literal_first_line(self):
        contract = task_time.compile_contract(self.catalog, self.profile, self.instruction, "graph")
        good = task_time.check_contract(contract, "final-delivery", "2026-09-22 17:55 UTC\nResult")
        bad = task_time.check_contract(contract, "final-delivery", "Result\n2026-09-22 17:55 UTC")
        self.assertEqual(good["admission"], "ADMITTED")
        self.assertEqual(bad["admission"], "BLOCKED")

    def test_semantic_handoff_does_not_self_certify(self):
        contract = task_time.compile_contract(self.catalog, self.profile, self.work, "graph")
        checked = task_time.check_contract(contract, "handoff", "bounded directive")
        self.assertEqual(checked["admission"], "BLOCKED")
        self.assertTrue(any(item["status"] == "UNKNOWN" for item in checked["results"]))

    def test_identical_bound_input_is_deterministic(self):
        first = task_time.compile_contract(self.catalog, self.profile, self.work, "graph")
        second = task_time.compile_contract(self.catalog, self.profile, copy.deepcopy(self.work), "graph")
        self.assertEqual(first["content_sha256"], second["content_sha256"])
        self.assertEqual(first["rendered_contract"], second["rendered_contract"])


if __name__ == "__main__":
    unittest.main()
