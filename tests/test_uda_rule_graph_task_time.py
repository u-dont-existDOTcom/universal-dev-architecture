import copy
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import uda_rule_graph_task_time as task_time

ROOT = Path(__file__).resolve().parents[1]


class UdaRuleGraphTaskTimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / "rules/rule-graph/task-time-metadata.v1.json").read_text())
        cls.profile = json.loads((ROOT / "scripts/instruction-layering-profile.json").read_text())
        cls.work = json.loads((ROOT / "examples/rule-graph/work-handoff.json").read_text())
        cls.instruction = json.loads((ROOT / "examples/rule-graph/instruction-only.json").read_text())

    def ids(self, contract):
        return [item["rule_id"] for item in contract["selected_rules"]]

    def test_graph_closure_adds_boundary_rule_over_flat_catalog(self):
        flat = task_time.compile_contract(self.catalog, self.profile, self.work, "flat")
        graph = task_time.compile_contract(self.catalog, self.profile, self.work, "graph")
        self.assertNotIn("uda.active-contract.boundary-binding", self.ids(flat))
        self.assertIn("uda.active-contract.boundary-binding", self.ids(graph))
        self.assertGreater(len(graph["selected_rules"]), len(flat["selected_rules"]))

    def test_instruction_only_blocks_continuation_trigger(self):
        graph = task_time.compile_contract(self.catalog, self.profile, self.instruction, "graph")
        self.assertIn("uda.scope.explicit-no-change", self.ids(graph))
        self.assertNotIn("uda.continuation.open-outcome", self.ids(graph))

    def test_owner_correction_recompiles_with_reactivation(self):
        task = copy.deepcopy(self.work)
        task["facts"]["owner_correction_present"] = {"state": "KNOWN", "value": True, "provenance": "owner"}
        graph = task_time.compile_contract(self.catalog, self.profile, task, "graph")
        self.assertIn("uda.owner-correction.reactivate", self.ids(graph))

    def test_consequential_followup_activates_owner_goal_rebind(self):
        task = json.loads((ROOT / "examples/rule-graph/followup-benchmark.json").read_text())
        graph = task_time.compile_contract(self.catalog, self.profile, task, "graph")
        self.assertIn("uda.followup.owner-goal-rebind", self.ids(graph))
        rendered = graph["rendered_contract"]
        self.assertIn("parent owner outcome", rendered)
        self.assertIn("proxy objective", rendered)
        self.assertIn("fail-closed blocker", rendered)

    def test_ordinary_implementation_does_not_activate_followup_gate(self):
        graph = task_time.compile_contract(self.catalog, self.profile, self.work, "graph")
        self.assertNotIn("uda.followup.owner-goal-rebind", self.ids(graph))

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
        timestamp = "final-first-line-timestamp"
        self.assertEqual(next(x for x in good["results"] if x["obligation_id"] == timestamp)["status"], "PASS")
        self.assertEqual(next(x for x in bad["results"] if x["obligation_id"] == timestamp)["status"], "FAIL")

    def test_elapsed_time_cannot_be_certified_from_final_payload_alone(self):
        compiled = task_time.compile_contract(self.catalog, self.profile, self.instruction, "graph")
        generated = json.loads((ROOT / "tools/codex-mission-control/restored/codex-mission-control/generated/rule-graph/work-handoff-contract.json").read_text())
        for contract in (compiled, generated):
            timestamp = next(x for x in contract["selected_rules"] if x["rule_id"] == "uda.final.timestamp")
            elapsed = next(x for x in timestamp["obligations"] if x["obligation_id"] == "final-elapsed-time")
            self.assertIn("elapsed", elapsed["required_behavior"].lower())
            self.assertIn("clock readings", elapsed["acceptance_evidence"].lower())
            self.assertEqual(elapsed["enforcement"], "mechanical")
            for payload in ("2026-09-30 09:40 UTC\nDone.", "2026-09-30 09:40 UTC\nElapsed: 2 minutes. Done."):
                checked = task_time.check_contract(contract, "final-delivery", payload)
                self.assertEqual(checked["admission"], "BLOCKED")
                self.assertEqual(next(x for x in checked["results"] if x["obligation_id"] == "final-elapsed-time")["status"], "UNKNOWN")
            admitted = task_time.check_contract(
                contract, "final-delivery", "2026-09-30 09:42 UTC\nElapsed time: 2 minutes",
                clock_start="2026-09-30T09:40:00+00:00", clock_end="2026-09-30T09:42:00+00:00",
            )
            self.assertEqual(admitted["admission"], "ADMITTED")

    def test_final_delivery_validates_clock_readings_and_reported_elapsed_time(self):
        contract = task_time.compile_contract(self.catalog, self.profile, self.instruction, "graph")
        payload = "2026-09-30 09:42 UTC\nElapsed time: 2 minutes\nDone."
        readings = {"clock_start": "2026-09-30T09:40:00+00:00", "clock_end": "2026-09-30T09:42:00+00:00"}
        good = task_time.check_contract(contract, "final-delivery", payload, **readings)
        self.assertEqual(good["admission"], "ADMITTED")
        self.assertEqual(next(x for x in good["results"] if x["obligation_id"] == "final-elapsed-time")["status"], "PASS")
        for changed_payload, changed_readings in (
            (payload.replace("2 minutes", "3 minutes"), readings),
            (payload.replace("2 minutes", "2 minutes plus 1 hour"), readings),
            (payload, {**readings, "clock_end": "2026-09-30T09:43:00+00:00"}),
            (payload, {**readings, "clock_start": "2026-09-30T09:43:00+00:00"}),
            (payload, {"clock_start": "2026-09-30T09:41:00+00:00", "clock_end": "2026-09-30T09:43:00+00:00"}),
            (payload, {**readings, "clock_start": "invalid"}),
        ):
            checked = task_time.check_contract(contract, "final-delivery", changed_payload, **changed_readings)
            self.assertEqual(checked["admission"], "BLOCKED")

    def test_mechanical_final_delivery_rejects_wrong_destination(self):
        payload = "2026-09-30 09:42 UTC\nElapsed time: 2 minutes"
        readings = {"clock_start": "2026-09-30T09:40:00+00:00", "clock_end": "2026-09-30T09:42:00+00:00"}
        for mode in ("graph", "flat"):
            with self.subTest(mode=mode):
                contract = task_time.compile_contract(self.catalog, self.profile, self.instruction, mode)
                for destination in (None, "owner-visible-final"):
                    good = task_time.check_contract(
                        contract, "final-delivery", payload, destination=destination, **readings,
                    )
                    self.assertEqual(good["admission"], "ADMITTED")
                    self.assertTrue(good["results"])
                    self.assertTrue(all(result["status"] == "PASS" for result in good["results"]))
                wrong = task_time.check_contract(
                    contract, "final-delivery", payload, destination="another-surface", **readings,
                )
                self.assertEqual(wrong["admission"], "BLOCKED")
                self.assertTrue(all(result["status"] == "UNKNOWN" for result in wrong["results"]))
                self.assertTrue(all("destination" in result["reason"] for result in wrong["results"]))

    def test_final_delivery_accepts_fractional_readings_at_reported_precision(self):
        contract = task_time.compile_contract(self.catalog, self.profile, self.instruction, "graph")
        start = "2026-09-30T09:40:00.000+00:00"
        for end, report, first_line in (
            ("2026-09-30T09:42:00.250+00:00", "2 minutes", "2026-09-30 09:42 UTC"),
            ("2026-09-30T09:42:00.250+00:00", "120 seconds", "2026-09-30 09:42:00 UTC"),
            ("2026-09-30T09:42:00.500+00:00", "120 seconds", "2026-09-30 09:42 UTC"),
            ("2026-09-30T09:42:00.750+00:00", "121 seconds", "2026-09-30 09:42 UTC"),
        ):
            with self.subTest(end=end, report=report):
                checked = task_time.check_contract(
                    contract, "final-delivery", f"{first_line}\nElapsed time: {report}",
                    clock_start=start, clock_end=end,
                )
                self.assertEqual(checked["admission"], "ADMITTED")

    def test_final_delivery_cli_admits_valid_readings(self):
        correction = json.loads((ROOT / "examples/rule-graph/owner-correction.json").read_text())
        contract = task_time.compile_contract(self.catalog, self.profile, correction, "graph")
        with tempfile.TemporaryDirectory() as directory:
            contract_path = Path(directory) / "contract.json"
            payload_path = Path(directory) / "final.txt"
            contract_path.write_text(json.dumps(contract))
            payload_path.write_text("2026-09-30 09:42 UTC\nElapsed time: 2 minutes\nDone.")
            for script in ("uda_rule_graph.py", "uda_rule_graph_task_time.py"):
                result = subprocess.run([
                    sys.executable, str(ROOT / "scripts" / script), "check",
                    "--contract", str(contract_path), "--phase", "final-delivery",
                    "--payload", str(payload_path),
                    "--clock-start", "2026-09-30T09:40:00+00:00",
                    "--clock-end", "2026-09-30T09:42:00.250+00:00",
                ], cwd=ROOT, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
                self.assertEqual(json.loads(result.stdout)["admission"], "ADMITTED")

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

    def test_lock_contract_and_receipts_survive_containing_and_unrelated_commits(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(task_time, "ROOT", Path(directory)):
            root = Path(directory)
            paths = {r["source"]["path"] for r in self.catalog["records"]}
            paths.add("scripts/uda_rule_graph_task_time.py")
            for relative in paths:
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / relative, target)

            def git(*args):
                result = subprocess.run(["git", "-C", str(root), *args],
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)

            git("init")
            git("config", "user.name", "Regression fixture")
            git("config", "user.email", "fixture@example.invalid")
            git("add", ".")
            git("commit", "-m", "Initial sources")
            initial_lock = task_time.build_lock(self.catalog, self.profile)
            initial_contract = task_time.compile_contract(self.catalog, self.profile, self.work, "graph")
            source = root / "patterns/task-time-lesson-activation.md"
            source.write_text(source.read_text() + "\nProvenance regression fixture.\n")
            dirty_lock = task_time.build_lock(self.catalog, self.profile)
            dirty_contract = task_time.compile_contract(self.catalog, self.profile, self.work, "graph")
            self.assertNotEqual(initial_lock["content_sha256"], dirty_lock["content_sha256"])
            self.assertNotEqual(initial_contract["content_sha256"], dirty_contract["content_sha256"])
            payload = b"bounded directive"
            receipts = task_time.receipt_skeleton(dirty_contract, "handoff", payload)
            for receipt in receipts["receipts"]:
                receipt.update(verdict="PASS", evidence="Fixture directive meets the selected handoff obligation.",
                               actor={"id": "fixture", "kind": "test", "relation": "INDEPENDENT"},
                               issued_at="2026-10-06T12:00:00Z")
            task_time.emit(str(root / "source-lock.json"), dirty_lock)
            task_time.emit(str(root / "contract.json"), dirty_contract)
            git("add", ".")
            git("commit", "-m", "Sources and generated artifacts")
            for boundary in ("containing commit", "unrelated commit"):
                with self.subTest(boundary=boundary):
                    self.assertEqual(dirty_lock, task_time.build_lock(self.catalog, self.profile))
                    clean_contract = task_time.compile_contract(self.catalog, self.profile, self.work, "graph")
                    self.assertEqual(dirty_contract, clean_contract)
                    checked = task_time.check_contract(clean_contract, "handoff", payload, receipts=receipts)
                    self.assertEqual(checked["admission"], "ADMITTED")
                if boundary == "containing commit":
                    (root / "checkpoint.txt").write_text("Unrelated checkpoint\n")
                    git("add", ".")
                    git("commit", "-m", "Unrelated checkpoint")


if __name__ == "__main__":
    unittest.main()
