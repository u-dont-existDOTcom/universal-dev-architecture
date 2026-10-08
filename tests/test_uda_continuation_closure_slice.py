"""Continuation/closure source coverage and exact-candidate admission.

Synthetic judgments are bound at test time. These regressions prove binding and
preservation, not semantic truth, authenticated identity or live gate invocation.
Pre-action receipts remain due before the action even when a fixture describes
its evidence in a final-looking text payload.
"""

import copy
import hashlib
import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts import uda_enforcement_coverage as coverage
from scripts import uda_rule_graph_task_time as tt

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests/fixtures/continuation-closure-slice"
SOURCES = ("patterns/terminal-response-admission-and-autonomous-continuation.md",
           "patterns/context-compaction-resilience.md",
           "patterns/exclusive-active-task-locks.md")
ACTIONS = ("exclusive_task", "mission_control_terminal", "provider_wait",
           "resume_reconciliation", "task_completion", "black_box_model_test",
           "task_closeout", "control_plane_testing", "instruction_maintenance")

# Independent boundary pins: changing metadata does not rewrite this table.
# Columns: phase, reason-bound N/A, event (None means the whole exclusive scope).
BOUNDARIES = {
    "uda.continuity.step-checkpoint": ("persistence", False, "continuity"),
    "uda.continuity.turn-end-handoff": ("final-delivery", False, "continuity"),
    "uda.continuity.usage-warning": ("persistence", False, "warning"),
    "uda.continuation.state-reconciliation": ("pre-action", False, None),
    "uda.continuation.controller-resume": ("pre-action", False, None),
    "uda.continuation.terminal-admission": ("final-delivery", False, None),
    "uda.continuation.recovery-events": ("persistence", False, None),
    "uda.continuation.provider-waits": ("pre-action", True, "provider_wait"),
    "uda.continuation.mission-control-gate": ("final-delivery", False, "mission_control_terminal"),
    "uda.continuation.pause-semantics": ("final-delivery", False, None),
    "uda.continuation.rejection-repair": ("pre-action", True, None),
    "uda.continuation.authority-limits": ("pre-action", False, None),
    "uda.compaction.resume-reconciliation": ("pre-action", True, "resume_reconciliation"),
    "uda.compaction.completion-closeout": ("final-delivery", True, "task_completion"),
    "uda.compaction.portable-instruction": ("handoff", True, "instruction_maintenance"),
    "uda.task-lock.exclusive-controls": ("pre-action", False, None),
    "uda.task-lock.lock-storage": ("pre-action", False, None),
    "uda.task-lock.competing-sources": ("pre-action", False, None),
    "uda.task-lock.preflight": ("pre-action", False, None),
    "uda.task-lock.checkpoint-mirror": ("persistence", False, None),
    "uda.task-lock.authority-resolution": ("pre-action", False, None),
    "uda.task-lock.blocker-scope": ("pre-action", True, None),
    "uda.task-lock.wait-admission": ("pre-action", True, None),
    "uda.task-lock.artifact-acceptance": ("pre-action", False, None),
    "uda.task-lock.terminal-states": ("final-delivery", False, None),
    "uda.task-lock.model-input-separation": ("pre-action", True, "black_box_model_test"),
    "uda.task-lock.retirement": ("persistence", True, "task_closeout"),
    "uda.task-lock.control-plane-regressions": ("pre-action", True, "control_plane_testing"),
    "uda.task-lock.anti-substitutes": ("pre-action", False, None),
    "uda.task-lock.portable-instruction": ("handoff", True, "instruction_maintenance"),
    "uda.task-lock.scope-authority": ("pre-action", False, None),
}
REFRESH_EVENTS = {rid: event for rid, (_, _, event) in BOUNDARIES.items()
                  if event not in (None, "continuity", "warning")}


def expected_trigger(rid, event):
    if event in ("continuity", "warning"):
        executable = {"all": [{"fact": "owner_outcome_status", "eq": "OPEN"},
                    {"not": {"fact": "task_mode", "in": ["INSTRUCTION_ONLY", "DIAGNOSTIC_ONLY", "NO_CHANGE", "STOP"]}}]}
        if event == "warning":
            return {"all": [executable, {"fact": "usage_warning_visible", "eq": True}]}
        return {"all": executable["all"] + [{"fact": "continuity_required", "eq": True}]}
    clauses = [{"fact": "governance_required", "eq": True}]
    if event != "instruction_maintenance":
        clauses += [{"fact": "continuity_required", "eq": True}] if rid.startswith("uda.compaction.") else [{"fact": "action_classes", "contains": "exclusive_task"}]
    if event:
        clauses.append({"fact": "action_classes", "contains": event})
    return {"all": clauses}


def facts_in(expr):
    if "fact" in expr:
        return {expr["fact"]}
    return set().union(*(facts_in(x) for v in expr.values()
                         for x in (v if isinstance(v, list) else [v])))


class ContinuationClosureSliceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = tt.read_json(ROOT / coverage.METADATA)
        cls.profile = tt.read_json(ROOT / "scripts/instruction-layering-profile.json")
        cls.inventory = tt.read_json(ROOT / coverage.COVERAGE)
        cls.records = [r for r in cls.catalog["records"] if r["source"]["path"] in SOURCES]

    def cases(self):
        for record in self.records:
            folder = FIXTURES / record["rule_id"]
            catalog = {**self.catalog, "records": [record]}
            task = tt.read_json(folder / "task.json")
            contract = tt.compile_contract(catalog, self.profile, task, "graph")
            self.assertTrue(contract["usable"])
            self.assertEqual([record["rule_id"]], [r["rule_id"] for r in contract["selected_rules"]])
            yield folder, record, catalog, task, contract

    def bind(self, contract, phase, payload, judgment):
        bound = tt.receipt_skeleton(contract, phase, payload)
        for receipt in bound["receipts"]:
            receipt.update({k: judgment[k] for k in ("verdict", "evidence", "actor")})
            if judgment.get("obligation_id", receipt["obligation_id"]) != receipt["obligation_id"]:
                receipt["verdict"] = "PASS"
            receipt["issued_at"] = "2030-01-02T10:02:00+00:00"
        return bound

    def check(self, contract, phase, payload, task, **kwargs):
        return tt.check_contract(contract, phase, payload, current_facts=task["facts"], **kwargs)

    def test_complete_fixture_table_is_domain_neutral_and_hash_free(self):
        self.assertEqual(31, len(self.records))
        self.assertEqual({r["rule_id"] for r in self.records}, {p.name for p in FIXTURES.iterdir()})
        for folder, record, *_ in self.cases():
            with self.subTest(record=record["rule_id"]):
                judgments = tt.read_json(folder / "verdicts.json")
                self.assertEqual({"violating.txt", "compliant.txt", "near-miss.txt"}, set(judgments))
                self.assertNotIn("sha256", json.dumps(judgments))
                near = judgments["near-miss.txt"]
                ob = next(o for o in record["obligations"] if o["obligation_id"] == near["obligation_id"])
                self.assertIn(near["non_substitute"], ob["non_substitutes"])
                for path in folder.iterdir():
                    self.assertNotRegex(path.read_text(), r"https?://|/home/|AGENTS\.md|u-dont-exist|joel|#31[27]|patterns/|state/")

    def test_table_blocks_violations_and_near_misses_and_admits_compliance(self):
        for folder, record, _, task, contract in self.cases():
            for filename, judgment in tt.read_json(folder / "verdicts.json").items():
                payload = (folder / filename).read_bytes()
                for phase in {o["due_phase"] for o in record["obligations"]}:
                    with self.subTest(record=record["rule_id"], candidate=filename, phase=phase):
                        result = self.check(contract, phase, payload, task,
                                            receipts=self.bind(contract, phase, payload, judgment))
                        target_due = any(o["obligation_id"] == judgment.get("obligation_id") and o["due_phase"] == phase for o in record["obligations"])
                        expected = "ADMITTED" if judgment["verdict"] == "PASS" or (judgment.get("obligation_id") and not target_due) else "BLOCKED"
                        self.assertEqual(expected, result["admission"])
                        self.assertTrue(result["results"])
                        self.assertTrue(all(r["judgment_proved"] is False for r in result["results"]))

    def test_every_obligation_blocks_without_its_own_exact_candidate_receipt(self):
        for folder, record, _, task, contract in self.cases():
            payload = (folder / "compliant.txt").read_bytes()
            judgment = tt.read_json(folder / "verdicts.json")["compliant.txt"]
            for ob in record["obligations"]:
                phase = ob["due_phase"]
                with self.subTest(record=record["rule_id"], obligation=ob["obligation_id"]):
                    bound = self.bind(contract, phase, payload, judgment)
                    target = next(r for r in bound["receipts"] if r["obligation_id"] == ob["obligation_id"])
                    target["verdict"] = "FAIL"
                    self.assertEqual("BLOCKED", self.check(contract, phase, payload, task, receipts=bound)["admission"])
                    target["verdict"] = "PASS"
                    for other in ("violating.txt", "near-miss.txt"):
                        self.assertEqual("BLOCKED", self.check(contract, phase, (folder / other).read_bytes(), task, receipts=bound)["admission"])
                    self.assertEqual("BLOCKED", self.check(contract, phase, payload + b"Rewritten.\n", task, receipts=bound)["admission"])
                    bound["receipts"].remove(target)
                    self.assertEqual("BLOCKED", self.check(contract, phase, payload, task, receipts=bound)["admission"])

    def test_not_applicable_needs_permission_and_a_bound_nonempty_reason(self):
        for folder, record, _, task, contract in self.cases():
            payload = (folder / "compliant.txt").read_bytes()
            judgment = tt.read_json(folder / "verdicts.json")["compliant.txt"]
            for ob in record["obligations"]:
                phase = ob["due_phase"]
                with self.subTest(record=record["rule_id"], obligation=ob["obligation_id"]):
                    bound = self.bind(contract, phase, payload, judgment)
                    target = next(r for r in bound["receipts"] if r["obligation_id"] == ob["obligation_id"])
                    target["verdict"] = "NOT_APPLICABLE"
                    for reason in ("", " ", "The conditional event is absent in this synthetic candidate."):
                        target["not_applicable_reason"] = reason
                        expected = "ADMITTED" if reason.strip() and ob["not_applicable_allowed"] else "BLOCKED"
                        self.assertEqual(expected, self.check(contract, phase, payload, task, receipts=bound)["admission"])
                    self.assertEqual("BLOCKED", self.check(contract, phase, payload + b"Changed\n", task, receipts=bound)["admission"])

    def test_actor_and_each_unknown_trigger_fact_fail_closed(self):
        for folder, record, catalog, task, _ in self.cases():
            for actor in ("chat", "work", "codex", "claude", "controller", "unrelated-actor"):
                envelope = copy.deepcopy(task)
                envelope["facts"]["actor"]["value"] = actor
                selected = tt.compile_contract(catalog, self.profile, envelope, "graph")["selected_rules"]
                self.assertEqual(actor in record["applies_to"]["actors"], bool(selected))
            for name in facts_in(record["trigger"]) | {"actor", "role"}:
                for state in ("UNKNOWN", "MISSING"):
                    envelope = copy.deepcopy(task)
                    if state == "MISSING":
                        envelope["facts"].pop(name)
                    else:
                        envelope["facts"][name] = {"state": state, "provenance": "synthetic unresolved input"}
                    with self.subTest(record=record["rule_id"], fact=name, state=state):
                        contract = tt.compile_contract(catalog, self.profile, envelope, "graph")
                        self.assertFalse(contract["usable"])
                        self.assertEqual("BLOCKED", self.check(contract, record["obligations"][0]["due_phase"], b"Candidate", envelope)["admission"])

    def test_exclusive_and_event_actions_select_only_their_scopes(self):
        for folder, record, catalog, task, _ in self.cases():
            if record["source"]["path"] == SOURCES[1]:
                continue
            absent_sets = ([],) if record["rule_id"].endswith("portable-instruction") else ([], [a for a in ACTIONS if a != "exclusive_task"])
            for absent in absent_sets:
                envelope = copy.deepcopy(task)
                envelope["facts"]["action_classes"]["value"] = absent
                self.assertFalse(tt.compile_contract(catalog, self.profile, envelope, "graph")["selected_rules"])
            for expr in record["trigger"]["all"]:
                if expr.get("fact") != "action_classes":
                    continue
                envelope = copy.deepcopy(task)
                envelope["facts"]["action_classes"]["value"].remove(expr["contains"])
                self.assertFalse(tt.compile_contract(catalog, self.profile, envelope, "graph")["selected_rules"])

    def test_pre_action_duties_cannot_be_discharged_at_final_delivery(self):
        for folder, record, _, task, contract in self.cases():
            if record["obligations"][0]["due_phase"] != "pre-action":
                continue
            payload = (folder / "compliant.txt").read_bytes()
            judgment = tt.read_json(folder / "verdicts.json")["compliant.txt"]
            final_receipts = self.bind(contract, "final-delivery", payload, judgment)
            self.assertFalse(any(r["phase"] == "pre-action" for r in final_receipts["receipts"]))
            self.assertEqual("BLOCKED", self.check(contract, "pre-action", payload, task, receipts=final_receipts)["admission"])
            ob = record["obligations"][0]
            wrong_dest = self.bind(contract, "pre-action", payload, judgment)
            wrong_dest["receipts"][0]["destination"] = "owner-visible-final"
            self.assertNotEqual("owner-visible-final", ob["destination"])
            self.assertEqual("BLOCKED", self.check(contract, "pre-action", payload, task, receipts=wrong_dest)["admission"])

    def test_changed_owner_authority_invalidates_old_receipts(self):
        for folder, record, catalog, task, contract in self.cases():
            payload = (folder / "compliant.txt").read_bytes()
            phase = record["obligations"][0]["due_phase"]
            receipts = self.bind(contract, phase, payload, tt.read_json(folder / "verdicts.json")["compliant.txt"])
            changed = copy.deepcopy(task)
            changed["owner_correction"] = "Preserve the changed acceptance boundary."
            refreshed = tt.compile_contract(catalog, self.profile, changed, "graph")
            self.assertNotEqual(contract["content_sha256"], refreshed["content_sha256"])
            self.assertEqual("BLOCKED", self.check(refreshed, phase, payload, changed, receipts=receipts)["admission"])

    def test_mechanical_timestamp_ignores_receipts_both_ways(self):
        record = next(r for r in self.catalog["records"] if r["rule_id"] == "uda.final.timestamp")
        catalog = {**self.catalog, "records": [record]}
        task = tt.read_json(ROOT / "examples/rule-graph/instruction-only.json")
        contract = tt.compile_contract(catalog, self.profile, task, "graph")
        clocks = {"clock_start": "2030-01-02T10:00:00Z", "clock_end": "2030-01-02T10:02:00Z"}
        for payload, verdict, expected in ((b"2030-01-02 10:02:00 UTC\nElapsed time: 120 seconds\n", "FAIL", ("PASS", "PASS")),
                                           (b"2030-01-02 10:02:00 UTC\nElapsed time: 180 seconds\n", "PASS", ("PASS", "FAIL"))):
            receipts = {"receipts": [{"rule_id": record["rule_id"], "obligation_id": o["obligation_id"],
                          "verdict": verdict, "contract_sha256": contract["content_sha256"],
                          "payload_sha256": hashlib.sha256(payload).hexdigest(), "phase": "final-delivery",
                          "destination": o["destination"], "evidence": "Synthetic contradictory assertion.",
                          "actor": {"id": "fixture", "kind": "fixture", "relation": "SAME_AGENT"},
                          "issued_at": "2030-01-02T10:02:00Z"} for o in record["obligations"]]}
            result = tt.check_contract(contract, "final-delivery", payload, receipts=receipts, **clocks)
            actual = {row["obligation_id"]: row["status"] for row in result["results"]}
            self.assertEqual(expected, (actual["final-first-line-timestamp"], actual["final-elapsed-time"]))

    def test_complete_maps_pins_and_backlog_shrinkage(self):
        report = coverage.report(ROOT)
        self.assertEqual(77, report["backlog_count"])
        self.assertEqual(7, len(report["removed_since_baseline"]))
        self.assertIn(SOURCES[2], report["removed_since_baseline"])
        for source, count, disposition in zip(SOURCES, (65, 73, 143), ("STRUCTURED_PARTIAL", "STRUCTURED_PARTIAL", "STRUCTURED_ENFORCED")):
            entry = next(e for e in self.inventory["entries"] if e["id"] == source)
            self.assertEqual(disposition, entry["disposition"])
            self.assertEqual(count, len(entry["obligation_map"]))
            self.assertEqual(disposition == "STRUCTURED_PARTIAL", bool(entry["legacy_remainder"]))
            self.assertFalse(any("exception" in i for i in entry["obligation_map"]))
            manifest = tt.read_json(ROOT / coverage.REQUIREMENT)["source_clause_manifest"][source]
            self.assertEqual(count, manifest["clause_count"])
            for section in manifest["sections"].values():
                self.assertIn("source_sha256", section)
        baseline = tt.read_json(ROOT / coverage.BASELINE)
        self.assertEqual(84, len(baseline["backlog_ids"]))
        self.assertFalse(baseline.get("owner_authorized_additions"))

    def test_representative_work_keeps_usage_limit_continuity_under_both_budgets(self):
        work = tt.read_json(ROOT / coverage.WORK_TASK)
        self.assertEqual("work", work["facts"]["actor"]["value"])
        self.assertTrue(work["facts"]["continuity_required"]["value"])
        self.assertEqual("multi-step work requires durable recovery across turns or sessions", work["facts"]["continuity_required"]["provenance"])
        self.assertNotIn("exclusive_task", work["facts"]["action_classes"]["value"])
        projection = tt.read_json(ROOT / coverage.WORK_CONTRACT)
        self.assertLessEqual(len(projection["rendered_contract"].encode()), 32768)
        selected = {r["rule_id"] for r in projection["selected_rules"]}
        self.assertTrue({"uda.continuity.step-checkpoint", "uda.continuity.turn-end-handoff"}.issubset(selected))
        self.assertFalse({"uda.compaction.durable-memory", "uda.compaction.recovery-checkpoint", "uda.compaction.durable-boundaries"} & selected)

    def test_expected_phases_not_applicable_and_triggers_are_pinned(self):
        self.assertEqual(set(BOUNDARIES), {r["rule_id"] for r in self.records})
        for r in self.records:
            rid = r["rule_id"]
            phase, na, event = BOUNDARIES[rid]
            with self.subTest(record=rid):
                self.assertEqual(expected_trigger(rid, event), r["trigger"])
                self.assertEqual((phase, na), (r["obligations"][0]["due_phase"], r["obligations"][0]["not_applicable_allowed"]))
                expected = [(phase, na)]
                if rid == "uda.task-lock.anti-substitutes":
                    expected.append(("final-delivery", False))
                self.assertEqual(expected, [(o["due_phase"], o["not_applicable_allowed"]) for o in r["obligations"]])
        # These owner-identified evidence omissions previously passed synthetic
        # verdict fixtures. Preserve the actual claim/gate requirements as well.
        demands = {
            "uda.task-lock.terminal-states": ("while acceptance findings remain", "exact claimed head", "command, head and output cited", "no open acceptance findings", "protected merge, readback and the immutable closeout receipt"),
            "uda.continuation.mission-control-gate": ("actual output", "exit status", "terminalResponseAllowed", "decision", "terminalStateVectorSha256", "tests/final-response-gate.test.ts"),
            "uda.continuation.authority-limits": ("privacy", "security", "explicit owner-stop"),
            "uda.task-lock.authority-resolution": ("scripts/active_task_authority.py", "CURRENT_OWNER_STOP", "TASK_LOCAL_CHECKPOINT_CONTENT_SHA256_MISMATCH"),
            "uda.task-lock.blocker-scope": ("scripts/active_task_authority.py", "STALE_GLOBAL_BLOCKER_INHERITED", "BLOCKER_SCOPE_MISMATCH", "BLOCKER_CAUSAL_DEPENDENCY_MISSING", "GLOBAL_STATE_STALE_FOR_ACTIVE_TASK", "CROSS_TASK_BLOCKER_LEAKAGE", "INVALID_TASK_INDEPENDENCE_OVERRIDE"),
            "uda.task-lock.wait-admission": ("scripts/active_task_authority.py", "WAIT_CONDITION_NOT_ACTIONABLE", "WAIT_WITHOUT_ADMISSION", "GITHUB_UPDATE_WAIT_WITHOUT_CAUSAL_DEPENDENCY", "WAIT_REASONING_HANDOFF_MISSING", "WAIT_NEXT_CHECK_OUTSIDE_HORIZON"),
        }
        by_id = {r["rule_id"]: r for r in self.records}
        for rid, clauses in demands.items():
            evidence = by_id[rid]["obligations"][0]["acceptance_evidence"]
            for clause in clauses:
                with self.subTest(record=rid, required=clause):
                    self.assertIn(clause, evidence)

    def test_event_fact_changes_block_until_recompiled_even_if_initially_excluded(self):
        for folder, r, catalog, task, _ in self.cases():
            rid = r["rule_id"]
            if rid not in REFRESH_EVENTS:
                continue
            with self.subTest(record=rid):
                self.assertEqual(["action_classes"], r["refresh_on_facts"])
                task["facts"]["action_classes"]["value"] = ["exclusive_task"]
                initial = tt.compile_contract(catalog, self.profile, task, "graph")
                self.assertFalse(initial["selected_rules"])
                phase = r["obligations"][0]["due_phase"]
                payload = (folder / "compliant.txt").read_bytes()
                self.assertEqual("ADMITTED", self.check(initial, phase, payload, task)["admission"])
                self.assertEqual("BLOCKED", tt.check_contract(initial, phase, payload)["admission"])
                changed = copy.deepcopy(task)
                changed["facts"]["action_classes"]["value"].append(REFRESH_EVENTS[rid])
                self.assertEqual("BLOCKED", self.check(initial, phase, payload, changed)["admission"])
                refreshed = tt.compile_contract(catalog, self.profile, changed, "graph")
                self.assertEqual([rid], [x["rule_id"] for x in refreshed["selected_rules"]])
                self.assertEqual("BLOCKED", self.check(refreshed, phase, payload, changed)["admission"])
                receipts = self.bind(refreshed, phase, payload, tt.read_json(folder / "verdicts.json")["compliant.txt"])
                self.assertEqual("ADMITTED", self.check(refreshed, phase, payload, changed, receipts=receipts)["admission"])
                self.assertEqual("ADMITTED", self.check(refreshed, phase, payload, copy.deepcopy(changed), receipts=receipts)["admission"])

    def test_becoming_exclusive_blocks_each_core_destination_until_recompiled(self):
        for folder, record, catalog, task, _ in self.cases():
            if BOUNDARIES[record["rule_id"]][2] is not None:
                continue
            payload = (folder / "compliant.txt").read_bytes()
            judgment = tt.read_json(folder / "verdicts.json")["compliant.txt"]
            for mode in ("graph", "flat"):
                for initial_fact in ({"state": "KNOWN", "value": []}, {"state": "ABSENT"}):
                    initial_task = copy.deepcopy(task)
                    initial_task["facts"]["action_classes"] = initial_fact
                    initial = tt.compile_contract(catalog, self.profile, initial_task, mode)
                    self.assertFalse(initial["selected_rules"])
                    changed = copy.deepcopy(initial_task)
                    changed["facts"]["action_classes"] = {"state": "KNOWN", "value": ["exclusive_task"]}
                    refreshed = tt.compile_contract(catalog, self.profile, changed, mode)
                    self.assertEqual([record["rule_id"]], [r["rule_id"] for r in refreshed["selected_rules"]])
                    for ob in record["obligations"]:
                        phase, destination = ob["due_phase"], ob["destination"]
                        with self.subTest(record=record["rule_id"], mode=mode,
                                          initial_state=initial_fact["state"], destination=destination):
                            self.assertEqual("NOT_EVALUATED", self.check(
                                initial, phase, payload, initial_task, destination=destination)["admission"])
                            stale = self.check(initial, phase, payload, changed, destination=destination)
                            self.assertEqual("BLOCKED", stale["admission"])
                            self.assertEqual("task facts changed; recompile contract before checking", stale["reason"])
                            self.assertEqual("BLOCKED", tt.check_contract(
                                initial, phase, payload, destination=destination)["admission"])
                            self.assertEqual("BLOCKED", self.check(
                                refreshed, phase, payload, changed, destination=destination)["admission"])
                            receipts = self.bind(refreshed, phase, payload, judgment)
                            self.assertEqual("ADMITTED", self.check(
                                refreshed, phase, payload, changed, destination=destination, receipts=receipts)["admission"])
                            # Leaving the exclusive scope also invalidates old receipts.
                            self.assertEqual("BLOCKED", self.check(
                                refreshed, phase, payload, initial_task, destination=destination, receipts=receipts)["admission"])

    def test_one_shot_governance_instruction_adopts_both_portable_controls(self):
        task = tt.read_json(ROOT / coverage.WORK_TASK)
        task["facts"]["continuity_required"]["value"] = False
        task["facts"]["action_classes"]["value"] = ["instruction_maintenance"]
        contract = tt.compile_contract(self.catalog, self.profile, task, "graph")
        self.assertTrue({"uda.kernel.instruction-maintenance", "uda.compaction.portable-instruction", "uda.task-lock.portable-instruction"}.issubset({r["rule_id"] for r in contract["selected_rules"]}))


class ContinuationClosureCoverageMutations(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        inventory = tt.read_json(ROOT / coverage.COVERAGE)
        paths = {coverage.COVERAGE, coverage.BASELINE, coverage.METADATA, coverage.LOCK,
                 coverage.REQUIREMENT, "rules/UDA-RULE-GRAPH.json", "AGENTS.md", "LESSON-INDEX.md",
                 "docs/uda-enforcement-coverage.md", "scripts/uda_rule_graph_task_time.py",
                 "scripts/instruction-layering-profile.json", coverage.WORK_TASK, coverage.WORK_CONTRACT}
        paths.update(p.relative_to(ROOT).as_posix() for p in (ROOT / "patterns").rglob("*.md"))
        paths.update(e["path"] for entry in inventory["entries"] for e in entry["evidence"])
        self.originals = {}
        for path in paths:
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / path, target)
            self.originals[path] = target.read_bytes()
        self.assertEqual([], coverage.validate(self.root))

    def restore(self):
        for path, data in self.originals.items():
            (self.root / path).write_bytes(data)

    def mutate(self, path, change):
        data = tt.read_json(self.root / path)
        change(data)
        (self.root / path).write_text(json.dumps(data, indent=2) + "\n")

    def regenerate(self):
        catalog = tt.read_json(self.root / coverage.METADATA)
        profile = tt.read_json(self.root / "scripts/instruction-layering-profile.json")
        (self.root / coverage.LOCK).write_text(json.dumps(tt.build_lock(catalog, profile, root=self.root)))
        task = tt.read_json(self.root / coverage.WORK_TASK)
        (self.root / coverage.WORK_CONTRACT).write_text(json.dumps(tt.compile_contract(catalog, profile, task, "graph", root=self.root)))

    def targets(self):
        for source in SOURCES:
            self.restore()
            entry = next(e for e in tt.read_json(self.root / coverage.COVERAGE)["entries"] if e["id"] == source)
            yield source, entry, entry["task_time_records"][0]

    def rejected(self, fragment):
        errors = coverage.validate(self.root)
        self.assertTrue(any(fragment in e for e in errors), errors)

    def test_removing_record_fails_coverage(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                self.mutate(coverage.METADATA, lambda d: d.update(records=[r for r in d["records"] if r["rule_id"] != rid]))
                self.regenerate()
                self.rejected("missing task-time record")

    def test_removing_selector_fails_coverage(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                self.mutate(coverage.METADATA, lambda d: next(r for r in d["records"] if r["rule_id"] == rid)["source"]["selectors"].pop())
                self.regenerate()
                self.rejected("sentence absent from record selectors")

    def test_removing_map_item_fails_independent_pin(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                self.mutate(coverage.COVERAGE, lambda d: next(e for e in d["entries"] if e["id"] == source)["obligation_map"].pop())
                self.regenerate()
                self.rejected("obligation_map differs from independent source clause manifest")

    def test_coordinated_record_and_map_deletion_still_fails(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                self.mutate(coverage.METADATA, lambda d: d.update(records=[r for r in d["records"] if r["rule_id"] != rid]))
                def drop(d):
                    e = next(e for e in d["entries"] if e["id"] == source)
                    e["task_time_records"].remove(rid)
                    e["obligation_map"] = [i for i in e["obligation_map"] if i.get("record") != rid]
                self.mutate(coverage.COVERAGE, drop)
                self.regenerate()
                self.rejected("obligation_map differs from independent source clause manifest")

    def test_removing_existing_bootstrap_exception_sentence_fails_coverage(self):
        # This slice adds no exceptions; the inherited allowed exception stays pinned.
        def remove(d):
            entry = next(e for e in d["entries"] if e["id"] == "AGENTS.md#per-turn-bootstrap-invariants")
            next(i for i in entry["obligation_map"] if "exception" in i).pop("sentence")
        self.mutate(coverage.COVERAGE, remove)
        self.regenerate()
        self.rejected("obligation_map differs from independent source clause manifest")

    def test_new_operative_section_and_pre_section_prose_fail_after_regeneration(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source, mutation="section"):
                path = self.root / source
                path.write_text(path.read_text() + "\n## Additional obligation\n\nThe executor must acquire a second lock before editing.\n")
                self.regenerate()
                self.rejected("section needs mapped clauses or explicit non-operative classification")
            self.restore()
            with self.subTest(source=source, mutation="pre-section"):
                path = self.root / source
                title, newline, remainder = path.read_text().partition("\n")
                path.write_text(title + newline + "The executor must acquire a second lock before editing.\n" + remainder)
                self.regenerate()
                self.rejected("pre-section source differs from independent source pin")

    def test_added_clause_in_existing_section_fails_section_source_pin(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                path = self.root / source
                text = path.read_text()
                heading = re.search(r"^## .+$", text, re.M)
                path.write_text(text[:heading.end()] + "\nThe executor must acquire a second lock before editing.\n" + text[heading.end():])
                self.regenerate()
                self.rejected("obligation_map differs from independent section clause manifests")

    def test_corrective_partial_dispositions_need_exact_owner_authority(self):
        for source in SOURCES[:2]:
            self.restore()
            with self.subTest(source=source):
                self.mutate(coverage.REQUIREMENT, lambda d: d.update(
                    owner_authorized_coverage_corrections=[c for c in d["owner_authorized_coverage_corrections"] if c["id"] != source]))
                self.rejected("unauthorized promoted coverage regression: " + source)
                self.restore()
                self.mutate(coverage.REQUIREMENT, lambda d: next(c for c in d["owner_authorized_coverage_corrections"] if c["id"] == source).update(owner_quote=""))
                self.rejected("coverage correction needs exact baseline id")
