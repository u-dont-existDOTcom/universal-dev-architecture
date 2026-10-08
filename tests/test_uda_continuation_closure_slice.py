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
        self.assertEqual(37, len(self.records))
        self.assertEqual({r["rule_id"] for r in self.records}, {p.name for p in FIXTURES.iterdir()})
        for folder, record, *_ in self.cases():
            with self.subTest(record=record["rule_id"]):
                judgments = tt.read_json(folder / "verdicts.json")
                self.assertEqual({"violating.txt", "compliant.txt", "near-miss.txt"}, set(judgments))
                self.assertNotIn("sha256", json.dumps(judgments))
                near = judgments["near-miss.txt"]
                ob = next(o for o in record["obligations"] if o["obligation_id"] == near["obligation_id"])
                self.assertIn(near["non_substitute"], ob["non_substitutes"])
                self.assertIn(near["non_substitute"], (folder / "near-miss.txt").read_text())
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
                        self.assertEqual("ADMITTED" if judgment["verdict"] == "PASS" else "BLOCKED", result["admission"])
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
            for absent in ([], [a for a in ACTIONS if a != "exclusive_task"]):
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
            self.assertEqual([], final_receipts["receipts"])
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
        for payload, verdict, expected in ((b"2030-01-02 10:02:00 UTC\nElapsed time: 120 seconds\n", "FAIL", "PASS"),
                                           (b"Done.\n", "PASS", "FAIL")):
            receipts = {"receipts": [{"rule_id": record["rule_id"], "obligation_id": o["obligation_id"],
                          "verdict": verdict, "contract_sha256": contract["content_sha256"],
                          "payload_sha256": hashlib.sha256(payload).hexdigest(), "phase": "final-delivery",
                          "destination": o["destination"], "evidence": "Synthetic contradictory assertion.",
                          "actor": {"id": "fixture", "kind": "fixture", "relation": "SAME_AGENT"},
                          "issued_at": "2030-01-02T10:02:00Z"} for o in record["obligations"]]}
            result = tt.check_contract(contract, "final-delivery", payload, receipts=receipts, **clocks)
            for row in result["results"]:
                if row["obligation_id"] in {o["obligation_id"] for o in record["obligations"] if o["enforcement"] == "mechanical"}:
                    self.assertEqual(expected, row["status"])

    def test_complete_maps_pins_and_backlog_shrinkage(self):
        report = coverage.report(ROOT)
        self.assertEqual(75, report["backlog_count"])
        self.assertEqual(9, len(report["removed_since_baseline"]))
        self.assertTrue(set(SOURCES).issubset(report["removed_since_baseline"]))
        for source, count in zip(SOURCES, (63, 89, 143)):
            entry = next(e for e in self.inventory["entries"] if e["id"] == source)
            self.assertEqual("STRUCTURED_ENFORCED", entry["disposition"])
            self.assertEqual(count, len(entry["obligation_map"]))
            self.assertFalse(entry["legacy_remainder"])
            self.assertFalse(any("exception" in i for i in entry["obligation_map"]))
            manifest = tt.read_json(ROOT / coverage.REQUIREMENT)["source_clause_manifest"][source]
            self.assertEqual(count, manifest["clause_count"])
            for section in manifest["sections"].values():
                self.assertIn("source_sha256", section)
        baseline = tt.read_json(ROOT / coverage.BASELINE)
        self.assertEqual(84, len(baseline["backlog_ids"]))
        self.assertFalse(baseline.get("owner_authorized_additions"))

    def test_representative_work_selects_only_its_actual_bounded_receiving_scope(self):
        work = tt.read_json(ROOT / coverage.WORK_TASK)
        self.assertEqual("work", work["facts"]["actor"]["value"])
        self.assertFalse(work["facts"]["continuity_required"]["value"])
        self.assertIn("one-shot", work["facts"]["continuity_required"]["provenance"])
        self.assertNotIn("exclusive_task", work["facts"]["action_classes"]["value"])
        projection = tt.read_json(ROOT / coverage.WORK_CONTRACT)
        self.assertLessEqual(len(projection["rendered_contract"].encode()), 32768)
        self.assertFalse({r["rule_id"] for r in self.records} & {r["rule_id"] for r in projection["selected_rules"]})
        # A real multi-step envelope must retain the complete checkpoint duties.
        multistep = copy.deepcopy(work)
        multistep["facts"]["continuity_required"]["value"] = True
        contract = tt.compile_contract(self.catalog, self.profile, multistep, "graph")
        self.assertTrue({"uda.compaction.durable-memory", "uda.compaction.recovery-checkpoint",
                         "uda.compaction.durable-boundaries", "uda.compaction.reasoning-outcomes",
                         "uda.compaction.fresh-worker-recovery", "uda.compaction.recovery-limits"}.issubset(
                             {r["rule_id"] for r in contract["selected_rules"]}))


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
