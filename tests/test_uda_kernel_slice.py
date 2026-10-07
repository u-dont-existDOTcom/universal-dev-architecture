"""Kernel-source admission regressions; judgments remain authored assertions.

Bindings are compiled at test time, never stored as source-dependent hashes.
The table checks admission at each record's actual due phases, using candidate
summaries as observable boundary evidence rather than pretending to replay tools.
"""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts import uda_enforcement_coverage as coverage
from scripts import uda_rule_graph_task_time as tt
from uda_test_helpers import predicate_catalog

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests/fixtures/kernel-slice"
CLOCKS = {"clock_start": "2030-01-02T10:00:00Z", "clock_end": "2030-01-02T10:02:00Z"}


class KernelSliceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = tt.read_json(ROOT / coverage.METADATA)
        cls.profile = tt.read_json(ROOT / "scripts/instruction-layering-profile.json")
        cls.inventory = tt.read_json(ROOT / coverage.COVERAGE)
        cls.record_ids = {rid for e in cls.inventory["entries"] if e.get("obligation_map")
                          for rid in e["task_time_records"]}

    def cases(self):
        for folder in sorted(FIXTURES.iterdir()):
            record = next(r for r in self.catalog["records"] if r["rule_id"] == folder.name)
            catalog = {**self.catalog, "records": [record]}
            envelope = tt.read_json(folder / "task.json")
            contract = tt.compile_contract(catalog, self.profile, envelope, "graph")
            self.assertTrue(contract["usable"])
            yield folder, record, contract

    def bind(self, contract, phase, payload, verdict):
        receipts = tt.receipt_skeleton(contract, phase, payload)
        for receipt in receipts["receipts"]:
            receipt.update({k: verdict[k] for k in ("verdict", "evidence", "actor")})
            if "obligation_id" in verdict and receipt["obligation_id"] != verdict["obligation_id"]:
                receipt["verdict"] = "PASS"
            receipt["issued_at"] = "2030-01-02T10:02:00+00:00"
        return receipts

    def test_each_record_has_neutral_candidates_and_no_stored_hashes(self):
        self.assertEqual(self.record_ids, {p.name for p in FIXTURES.iterdir()})
        for folder, record, contract in self.cases():
            with self.subTest(record=record["rule_id"]):
                judgments = tt.read_json(folder / "verdicts.json")
                self.assertEqual(set(judgments), {"violating-final.txt", "compliant-final.txt", "near-miss-final.txt"})
                self.assertNotIn("sha256", json.dumps(judgments))
                near = judgments["near-miss-final.txt"]
                obligation = next(o for o in record["obligations"] if o["obligation_id"] == near["obligation_id"])
                self.assertIn(near["non_substitute"], obligation["non_substitutes"])
                self.assertIn(near["non_substitute"].lower(), (folder / "near-miss-final.txt").read_text().lower())
                for path in folder.iterdir():
                    self.assertNotRegex(path.read_text(), r"https?://|/home/|AGENTS\.md|u-dont-exist|joel|#317|#324")

    def test_table_blocks_violations_and_near_misses_and_admits_compliance(self):
        for folder, record, contract in self.cases():
            judgments = tt.read_json(folder / "verdicts.json")
            for filename, judgment in judgments.items():
                payload = (folder / filename).read_bytes()
                admissions = []
                for phase in {o["due_phase"] for o in record["obligations"]}:
                    with self.subTest(record=record["rule_id"], candidate=filename, phase=phase):
                        bound = self.bind(contract, phase, payload, judgment)
                        result = tt.check_contract(contract, phase, payload, receipts=bound, **CLOCKS)
                        self.assertTrue(result["results"])
                        target_due = ("obligation_id" not in judgment or any(
                            o["obligation_id"] == judgment["obligation_id"] and o["due_phase"] == phase
                            for o in record["obligations"]))
                        self.assertEqual("BLOCKED" if judgment["verdict"] == "FAIL" and target_due else "ADMITTED", result["admission"])
                        admissions.append(result["admission"])
                        for result_item in result["results"]:
                            ob = next(o for o in record["obligations"] if o["obligation_id"] == result_item["obligation_id"])
                            if ob["enforcement"] == "semantic":
                                self.assertIs(result_item["judgment_proved"], False)
                            elif ob["mechanical_check"]["kind"] == "final_timestamp_first_line":
                                self.assertEqual(payload.decode().splitlines()[0], result_item["evidence"])
                            else:
                                self.assertEqual(120, result_item["evidence"]["actual_seconds"])
                self.assertEqual(judgment["verdict"] == "PASS", all(a == "ADMITTED" for a in admissions))

    def test_current_full_contract_enforces_all_selected_kernel_boundaries(self):
        task = tt.read_json(FIXTURES / "uda.bootstrap.live-root/task.json")
        contract = tt.compile_contract(self.catalog, self.profile, task, "graph")
        selected = {r["rule_id"] for r in contract["selected_rules"]}
        expected = self.record_ids - {"uda.kernel.work-permissions"}
        self.assertTrue(expected.issubset(selected))
        self.assertTrue(contract["usable"])
        payload = b"2030-01-02 10:02:00 UTC\nElapsed time: 120 seconds\nSynthetic integrated candidate with current boundary evidence.\n"
        judgment = {"verdict": "PASS", "evidence": "The synthetic integrated candidate supplies all selected boundary evidence.",
                    "actor": {"id": "fixture-author", "kind": "chat", "relation": "SAME_AGENT"}}
        for phase in {o["due_phase"] for r in contract["selected_rules"] for o in r["obligations"]}:
            with self.subTest(phase=phase):
                facts = {"current_facts": task["facts"]}  # satisfies the continuity refresh boundary
                self.assertEqual("BLOCKED", tt.check_contract(contract, phase, payload, **facts, **CLOCKS)["admission"])
                receipts = self.bind(contract, phase, payload, judgment)
                self.assertEqual("ADMITTED", tt.check_contract(contract, phase, payload, receipts=receipts, **facts, **CLOCKS)["admission"])
                for target in receipts["receipts"]:
                    if target["rule_id"] not in expected:
                        continue
                    target["verdict"] = "FAIL"
                    self.assertEqual("BLOCKED", tt.check_contract(contract, phase, payload, receipts=receipts, **facts, **CLOCKS)["admission"])
                    target["verdict"] = "PASS"

    def test_each_obligation_individually_blocks_and_candidate_receipts_cannot_replay(self):
        for folder, record, contract in self.cases():
            payload = (folder / "compliant-final.txt").read_bytes()
            judgment = tt.read_json(folder / "verdicts.json")["compliant-final.txt"]
            for obligation in record["obligations"]:
                phase = obligation["due_phase"]
                with self.subTest(record=record["rule_id"], obligation=obligation["obligation_id"]):
                    bound = self.bind(contract, phase, payload, judgment)
                    if obligation["enforcement"] == "mechanical":
                        self.assertFalse(any(r["obligation_id"] == obligation["obligation_id"] for r in bound["receipts"]))
                        for other in ("violating-final.txt", "near-miss-final.txt"):
                            result = tt.check_contract(contract, phase, (folder / other).read_bytes(), receipts=bound, **CLOCKS)
                            self.assertEqual("BLOCKED", result["admission"])
                            self.assertEqual("FAIL", next(r for r in result["results"] if r["obligation_id"] == obligation["obligation_id"])["status"])
                        continue
                    target = next(r for r in bound["receipts"] if r["obligation_id"] == obligation["obligation_id"])
                    target["verdict"] = "FAIL"
                    self.assertEqual("BLOCKED", tt.check_contract(contract, phase, payload, receipts=bound, **CLOCKS)["admission"])
                    target["verdict"] = "PASS"
                    bound["receipts"].remove(target)
                    self.assertEqual("BLOCKED", tt.check_contract(contract, phase, payload, receipts=bound, **CLOCKS)["admission"])
                    bound = self.bind(contract, phase, payload, judgment)
                    for other in ("violating-final.txt", "near-miss-final.txt"):
                        self.assertEqual("BLOCKED", tt.check_contract(contract, phase, (folder / other).read_bytes(), receipts=bound, **CLOCKS)["admission"])
                    self.assertEqual("BLOCKED", tt.check_contract(contract, phase, payload + b"Rewritten.\n", receipts=bound, **CLOCKS)["admission"])

    def test_not_applicable_requires_permission_and_nonempty_reason(self):
        for folder, record, contract in self.cases():
            payload = (folder / "compliant-final.txt").read_bytes()
            judgment = tt.read_json(folder / "verdicts.json")["compliant-final.txt"]
            for obligation in record["obligations"]:
                phase = obligation["due_phase"]
                with self.subTest(record=record["rule_id"], obligation=obligation["obligation_id"]):
                    bound = self.bind(contract, phase, payload, judgment)
                    if obligation["enforcement"] == "mechanical":
                        self.assertFalse(obligation["not_applicable_allowed"])
                        self.assertFalse(any(r["obligation_id"] == obligation["obligation_id"] for r in bound["receipts"]))
                        continue
                    target = next(r for r in bound["receipts"] if r["obligation_id"] == obligation["obligation_id"])
                    target["verdict"] = "NOT_APPLICABLE"
                    for reason in ("", " ", "The conditional payload or action is absent in this candidate."):
                        target["not_applicable_reason"] = reason
                        expected = "ADMITTED" if reason.strip() and obligation.get("not_applicable_allowed") else "BLOCKED"
                        self.assertEqual(expected, tt.check_contract(contract, phase, payload, receipts=bound, **CLOCKS)["admission"])

    def test_actor_scope_and_unknown_trigger_fail_closed(self):
        for folder, record, contract in self.cases():
            catalog = {**self.catalog, "records": [record]}
            task = tt.read_json(folder / "task.json")
            for actor in ("chat", "work", "codex", "claude"):
                with self.subTest(record=record["rule_id"], actor=actor):
                    task["facts"]["actor"]["value"] = actor
                    selected = tt.compile_contract(catalog, self.profile, task, "graph")["selected_rules"]
                    self.assertEqual(actor in record["applies_to"]["actors"], bool(selected))
            task = tt.read_json(folder / "task.json")
            task["facts"].pop("governance_required")
            unresolved = tt.compile_contract(catalog, self.profile, task, "graph")
            self.assertFalse(unresolved["usable"])
            self.assertEqual("BLOCKED", tt.check_contract(unresolved, "final-delivery", "Candidate")["admission"])

    def test_mechanical_obligations_ignore_receipts_in_both_directions(self):
        catalog = predicate_catalog(self.catalog)
        catalog["records"] = [r for r in catalog["records"] if r["rule_id"] == "uda.final.timestamp"]
        task = tt.read_json(FIXTURES / "uda.final.timestamp/task.json")
        contract = tt.compile_contract(catalog, self.profile, task, "graph")
        clocks = {"clock_start": "2030-01-02T10:00:00Z", "clock_end": "2030-01-02T10:02:00Z"}
        for payload, assertion, expected in (
                (b"2030-01-02 10:02:00 UTC\nElapsed time: 120 seconds\n", "FAIL", "ADMITTED"),
                (b"Result\nElapsed time: 120 seconds\n", "PASS", "BLOCKED")):
            self.assertEqual([], tt.receipt_skeleton(contract, "final-delivery", payload)["receipts"])
            receipts = [{"contract_sha256": contract["content_sha256"], "rule_id": "uda.final.timestamp",
                         "obligation_id": ob["obligation_id"], "phase": "final-delivery", "destination": ob["destination"],
                         "payload_sha256": tt.sha256(payload), "verdict": assertion, "evidence": "A contrary assertion.",
                         "not_applicable_reason": "", "actor": {"id": "fixture-reviewer", "kind": "fixture", "relation": "SAME_AGENT"},
                         "issued_at": "2030-01-02T10:02:00Z"} for ob in catalog["records"][0]["obligations"]]
            for supplied in (None, receipts):
                self.assertEqual(expected, tt.check_contract(contract, "final-delivery", payload, receipts=supplied, **clocks)["admission"])

    def test_map_matches_docs_and_has_no_unmapped_record_obligations(self):
        doc = (ROOT / "docs/uda-enforcement-coverage.md").read_text()
        for entry in self.inventory["entries"]:
            if not entry.get("obligation_map"):
                continue
            with self.subTest(section=entry["id"]):
                self.assertEqual(entry["disposition"], "STRUCTURED_ENFORCED")
                for item in entry["obligation_map"]:
                    sentence = item["sentence"].replace("|", "\\|").replace("\n", " ")
                    self.assertIn(sentence, doc)
                    if "record" in item:
                        self.assertIn(item["record"] + " / " + item["obligation_id"], doc)
                    else:
                        self.assertIn(item["exception"]["carrier"], doc)

    def test_work_projection_budget_preserves_records_sources_and_behaviors(self):
        task = tt.read_json(ROOT / coverage.WORK_TASK)
        contract = tt.compile_contract(self.catalog, self.profile, task, "graph")
        self.assertEqual(contract, tt.read_json(ROOT / coverage.WORK_CONTRACT))
        rendered = contract["rendered_contract"]
        # 32 KiB keeps the graph projection inside Codex's default instruction-discovery budget;
        # Mission Control separately bounds the injected Work block and its directive reserve.
        self.assertLessEqual(len(rendered.encode("utf-8")), 32 * 1024)
        for record in contract["selected_rules"]:
            with self.subTest(record=record["rule_id"]):
                self.assertEqual(1, rendered.count(record["source_text"]))
                original = next(r for r in self.catalog["records"] if r["rule_id"] == record["rule_id"])
                self.assertEqual(original["obligations"], record["obligations"])
                for ob in record["obligations"]:
                    for text in (ob["obligation_id"], ob["required_behavior"], ob["due_phase"],
                                 ob["destination"], ob["carry_through"], ob["repair"],
                                 *ob["non_substitutes"]):
                        self.assertIn(text, rendered)

    def test_same_artifact_has_one_destination_and_clock_cadence_is_final(self):
        records = {r["rule_id"]: r for r in self.catalog["records"]}
        for rid in ("uda.final.timestamp", "uda.kernel.clock-cadence", "uda.kernel.continuation"):
            for ob in records[rid]["obligations"]:
                if ob["due_phase"] == "final-delivery":
                    self.assertEqual("owner-visible-final", ob["destination"])
        for rid in ("uda.kernel.operational-references", "uda.kernel.outbound-links", "uda.kernel.target-recovery"):
            self.assertEqual({"owner-visible-message"}, {o["destination"] for o in records[rid]["obligations"]})
        self.assertEqual("owner-visible-message", records["uda.kernel.owner-interaction"]["obligations"][1]["destination"])


class KernelCoverageMutations(unittest.TestCase):
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
        for path in paths:
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / path, target)
        self.assertEqual([], coverage.validate(self.root))

    def mutate_json(self, path, mutation):
        data = tt.read_json(self.root / path)
        mutation(data)
        (self.root / path).write_text(json.dumps(data, indent=2) + "\n")

    def rejected(self, fragment):
        self.assertTrue(any(fragment in e for e in coverage.validate(self.root)), coverage.validate(self.root))

    def test_removing_record_fails_mapping(self):
        self.mutate_json(coverage.METADATA, lambda d: d["records"].remove(next(r for r in d["records"] if r["rule_id"] == "uda.kernel.outbound-links")))
        self.rejected("obligation_map references missing record obligation")

    def test_removing_selector_fails_even_with_regenerated_artifacts(self):
        self.mutate_json(coverage.METADATA, lambda d: next(r for r in d["records"] if r["rule_id"] == "uda.kernel.outbound-links")["source"]["selectors"].pop())
        self.regenerate_artifacts()
        self.rejected("obligation_map sentence absent from record selectors")

    def regenerate_artifacts(self):
        catalog = tt.read_json(self.root / coverage.METADATA)
        profile = tt.read_json(self.root / "scripts/instruction-layering-profile.json")
        (self.root / coverage.LOCK).write_text(json.dumps(tt.build_lock(catalog, profile, root=self.root)))
        task = tt.read_json(self.root / coverage.WORK_TASK)
        (self.root / coverage.WORK_CONTRACT).write_text(json.dumps(tt.compile_contract(catalog, profile, task, "graph", root=self.root)))

    def test_coordinated_record_and_map_deletion_fails_after_regeneration(self):
        rid = "uda.kernel.coordination"
        self.mutate_json(coverage.METADATA, lambda d: d.update(
            records=[r for r in d["records"] if r["rule_id"] != rid]))
        def remove(data):
            entry = next(e for e in data["entries"] if e["id"] == "AGENTS.md#workflow")
            entry["task_time_records"].remove(rid)
            entry["obligation_map"] = [i for i in entry["obligation_map"] if i.get("record") != rid]
        self.mutate_json(coverage.COVERAGE, remove)
        self.regenerate_artifacts()
        errors = coverage.validate(self.root)
        self.assertEqual(["AGENTS.md#workflow: obligation_map differs from independent source clause manifest"], errors)

    def test_coordinated_clause_and_selector_shortening_fails_with_same_count(self):
        rid = "uda.kernel.coordination"
        catalog = tt.read_json(self.root / coverage.METADATA)
        selector = next(r for r in catalog["records"] if r["rule_id"] == rid)["source"]["selectors"][0]
        sentence = selector["text"]
        shortened = sentence.split(",", 1)[0]
        self.assertNotEqual(sentence, shortened)
        def shorten(data):
            entry = next(e for e in data["entries"] if e["id"] == "AGENTS.md#workflow")
            next(i for i in entry["obligation_map"] if i["sentence"] == sentence)["sentence"] = shortened
        self.mutate_json(coverage.COVERAGE, shorten)
        self.mutate_json(coverage.METADATA, lambda d: next(r for r in d["records"] if r["rule_id"] == rid)["source"]["selectors"][0].update(text=shortened))
        self.regenerate_artifacts()
        self.rejected("obligation_map differs from independent source clause manifest")

    def test_removing_exception_map_clause_fails(self):
        def remove(data):
            entry = next(e for e in data["entries"] if e["id"] == "AGENTS.md#per-turn-bootstrap-invariants")
            entry["obligation_map"] = [i for i in entry["obligation_map"] if "exception" not in i]
        self.mutate_json(coverage.COVERAGE, remove)
        self.rejected("obligation_map differs from independent source clause manifest")

    def test_fully_enforced_section_requires_independent_clause_manifest(self):
        self.mutate_json(coverage.REQUIREMENT, lambda d: d.get("source_clause_manifest", {}).pop("AGENTS.md#workflow", None))
        self.rejected("missing independent source clause manifest")

    def test_removing_exception_sentence_from_source_fails(self):
        entries = tt.read_json(self.root / coverage.COVERAGE)["entries"]
        item = next(i for e in entries for i in e.get("obligation_map", []) if "exception" in i)
        path = self.root / "AGENTS.md"
        path.write_text(path.read_text().replace(item["sentence"], ""))
        self.rejected("obligation_map sentence missing or ambiguous in owning section")

    def test_missing_exception_sentence_reason_carrier_or_invalid_kind_fails(self):
        original = (self.root / coverage.COVERAGE).read_text()
        for field in ("sentence", "reason", "carrier", "kind"):
            with self.subTest(field=field):
                (self.root / coverage.COVERAGE).write_text(original)
                def remove(data):
                    item = next(i for e in data["entries"] for i in e.get("obligation_map", []) if "exception" in i)
                    (item if field == "sentence" else item["exception"]).pop(field)
                self.mutate_json(coverage.COVERAGE, remove)
                self.assertTrue(coverage.validate(self.root))

    def test_missing_obligation_evidence_or_map_fails(self):
        original = (self.root / coverage.COVERAGE).read_text()
        for mutation in (lambda e: e["obligation_map"].pop(0),
                         lambda e: e["obligation_map"][0].update(obligation_id="missing-obligation"),
                         lambda e: e.update(evidence=[x for x in e["evidence"] if x["class"] != "ADMISSION"]),
                         lambda e: e.pop("obligation_map")):
            (self.root / coverage.COVERAGE).write_text(original)
            self.mutate_json(coverage.COVERAGE, lambda d: mutation(next(e for e in d["entries"] if e["id"] == "AGENTS.md#workflow")))
            self.assertTrue(coverage.validate(self.root))

    def test_consolidated_behavior_accepts_multiple_clauses_but_not_a_missing_clause(self):
        inventory = tt.read_json(self.root / coverage.COVERAGE)
        entry = next(e for e in inventory["entries"] if e["id"] == "AGENTS.md#workflow")
        items = [i for i in entry["obligation_map"] if i["record"] == "uda.kernel.coordination"]
        self.assertGreater(len(items), 1)
        self.assertEqual(1, len({i["obligation_id"] for i in items}))
        self.assertEqual([], coverage.validate(self.root))
        entry["obligation_map"].remove(items[0])
        (self.root / coverage.COVERAGE).write_text(json.dumps(inventory))
        self.rejected("obligation_map omits selector sentence")

    def test_baseline_cannot_shrink_by_workflow_reclassification(self):
        self.mutate_json(coverage.COVERAGE, lambda d: next(e for e in d["entries"] if e["id"] == "AGENTS.md#workflow").update(disposition="WORKFLOW_ONLY"))
        self.rejected("baseline backlog may shrink only through STRUCTURED_ENFORCED")

    def test_baseline_cannot_shrink_by_deleting_source_and_inventory_entry(self):
        entries = tt.read_json(self.root / coverage.COVERAGE)["entries"]
        entry = next(e for e in entries if e["disposition"] == "LEGACY_UNSTRUCTURED"
                     and e["kind"] == "pattern" and e["activation_route"]["kind"] == "INDEX_TRIGGER")
        eid = entry["id"]
        (self.root / eid).unlink()
        index = self.root / "LESSON-INDEX.md"
        lines = index.read_text().splitlines(keepends=True)
        index.write_text("".join(line for line in lines if "`" + eid + "`" not in line))
        self.mutate_json(coverage.COVERAGE, lambda d: d["entries"].remove(next(e for e in d["entries"] if e["id"] == eid)))
        self.rejected("baseline backlog may shrink only through STRUCTURED_ENFORCED: " + eid)


if __name__ == "__main__":
    unittest.main()
