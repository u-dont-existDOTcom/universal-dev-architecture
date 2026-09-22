import copy
import json
import subprocess
import sys
import unittest
from pathlib import Path

from scripts.uda_rule_graph import load_graph, resolve_rules, validate_graph

ROOT = Path(__file__).resolve().parents[1]


class UdaRuleGraphTests(unittest.TestCase):
    def test_graph_is_structurally_valid(self):
        graph = load_graph(ROOT)
        self.assertEqual(validate_graph(graph, ROOT), [])
        self.assertEqual(graph["status"], "ROUTING_METADATA_NOT_NORMATIVE_AUTHORITY")
        self.assertGreaterEqual(len(graph["nodes"]), 20)

    def test_mission_control_resolution_expands_owner_and_reasoning_dependencies(self):
        graph = load_graph(ROOT)
        resolved = resolve_rules(graph, ["codex-pro-supervision-mission-control"])
        ids = [item["rule_id"] for item in resolved["ordered_rules"]]
        self.assertLess(ids.index("chat-work-execution-routing-threshold"), ids.index("chat-led-reasoning-codex-execution-separation"))
        self.assertLess(ids.index("owner-outcome-invariant-and-contract-laundering-prevention"), ids.index("outcome-advancement-and-strategy-efficacy"))
        self.assertLess(ids.index("outcome-advancement-and-strategy-efficacy"), ids.index("codex-pro-supervision-mission-control"))
        self.assertEqual(resolved["status"], "RESOLVED_ROUTING_METADATA_NOT_APPLICATION_EVIDENCE")

    def test_superseded_rule_redirects_to_current_rule(self):
        graph = load_graph(ROOT)
        resolved = resolve_rules(graph, ["codex-github-operating-standard"])
        self.assertEqual(resolved["normalized_selected"], ["codex-github-operating-system"])
        self.assertEqual(resolved["supersession_redirects"], [{"from": "codex-github-operating-standard", "to": "codex-github-operating-system"}])

    def test_inheritance_cycle_is_rejected_but_positive_requires_cycle_is_finite(self):
        graph = load_graph(ROOT)
        mutant = copy.deepcopy(graph)
        by_id = {node["rule_id"]: node for node in mutant["nodes"]}
        by_id["instruction-composition-and-portable-intelligence"]["inherits"] = ["task-time-lesson-activation"]
        by_id["task-time-lesson-activation"]["inherits"] = ["instruction-composition-and-portable-intelligence"]
        errors = validate_graph(mutant, ROOT)
        self.assertTrue(any("inherits cycle" in error for error in errors))

        requires_cycle = copy.deepcopy(graph)
        by_id = {node["rule_id"]: node for node in requires_cycle["nodes"]}
        by_id["instruction-composition-and-portable-intelligence"]["requires"] = ["task-time-lesson-activation"]
        self.assertEqual(validate_graph(requires_cycle, ROOT), [])
        resolved = resolve_rules(requires_cycle, ["instruction-composition-and-portable-intelligence"])
        ids = [item["rule_id"] for item in resolved["ordered_rules"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIn("task-time-lesson-activation", ids)

    def test_cli_validate_and_resolve(self):
        validate = subprocess.run([sys.executable, "scripts/uda_rule_graph.py", "validate"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(validate.returncode, 0, validate.stdout + validate.stderr)
        result = json.loads(validate.stdout)
        self.assertEqual(result["status"], "PASS")
        resolve = subprocess.run([sys.executable, "scripts/uda_rule_graph.py", "resolve", "--rule", "task-time-lesson-activation"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(resolve.returncode, 0, resolve.stdout + resolve.stderr)
        payload = json.loads(resolve.stdout)
        self.assertEqual(payload["ordered_rules"][-1]["rule_id"], "task-time-lesson-activation")

    def test_instruction_surfaces_route_to_graph_without_making_it_authority(self):
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        lesson_index = (ROOT / "LESSON-INDEX.md").read_text(encoding="utf-8")
        contract = (ROOT / "templates/ACTIVE-LESSON-CONTRACT.md").read_text(encoding="utf-8")
        self.assertIn("rules/UDA-RULE-GRAPH.json", agents)
        self.assertIn("canonical prose remains authoritative", agents)
        self.assertIn("rule-graph-activation-and-dependency-resolution.md", lesson_index)
        self.assertIn("Rule graph expansion", contract)


if __name__ == "__main__":
    unittest.main()
