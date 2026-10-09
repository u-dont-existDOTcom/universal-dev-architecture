"""Source-complete review/merge admission, using synthetic asserted judgments.

Receipts bind at test time. These tests verify admission and preservation, not
semantic truth, hosted permissions, reviewer independence or live tool actions.
"""

import copy
import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts import uda_enforcement_coverage as coverage
from scripts import uda_rule_graph_task_time as tt

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests/fixtures/review-merge-slice"
SOURCES = ("patterns/convergent-review-acceptance-gates.md",
           "patterns/agent-completable-merge-gates.md")
ACTIONS = ("review_round", "review_finding_judgment", "merge_gate")


class ReviewMergeSliceTests(unittest.TestCase):
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

    def test_complete_fixture_table_is_domain_neutral_and_hash_free(self):
        self.assertEqual({r["rule_id"] for r in self.records}, {p.name for p in FIXTURES.iterdir()})
        self.assertEqual(14, len(self.records))
        for folder, record, *_ in self.cases():
            with self.subTest(record=record["rule_id"]):
                judgments = tt.read_json(folder / "verdicts.json")
                self.assertEqual({"violating.txt", "compliant.txt", "near-miss.txt"}, set(judgments))
                self.assertNotIn("sha256", json.dumps(judgments))
                near = judgments["near-miss.txt"]
                obligation = next(o for o in record["obligations"] if o["obligation_id"] == near["obligation_id"])
                self.assertIn(near["non_substitute"], obligation["non_substitutes"])
                self.assertIn(near["non_substitute"], (folder / "near-miss.txt").read_text())
                for path in folder.iterdir():
                    self.assertNotRegex(path.read_text(), r"https?://|/home/|AGENTS\.md|u-dont-exist|joel|#31[27]|patterns/|state/")

    def test_table_blocks_violations_and_near_misses_and_admits_compliance(self):
        for folder, record, _, task, contract in self.cases():
            for filename, judgment in tt.read_json(folder / "verdicts.json").items():
                payload = (folder / filename).read_bytes()
                admissions = []
                for phase in {o["due_phase"] for o in record["obligations"]}:
                    with self.subTest(record=record["rule_id"], candidate=filename, phase=phase):
                        result = tt.check_contract(contract, phase, payload,
                                                   receipts=self.bind(contract, phase, payload, judgment), current_task=task)
                        target_due = "obligation_id" not in judgment or any(
                            o["obligation_id"] == judgment["obligation_id"] and o["due_phase"] == phase
                            for o in record["obligations"])
                        expected = "BLOCKED" if judgment["verdict"] == "FAIL" and target_due else "ADMITTED"
                        self.assertEqual(expected, result["admission"])
                        self.assertTrue(result["results"])
                        self.assertTrue(all(r["judgment_proved"] is False for r in result["results"]))
                        admissions.append(result["admission"])
                self.assertEqual(judgment["verdict"] == "PASS", all(a == "ADMITTED" for a in admissions))

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
                    self.assertEqual("BLOCKED", tt.check_contract(contract, phase, payload, receipts=bound, current_task=task)["admission"])
                    target["verdict"] = "PASS"
                    for other in ("violating.txt", "near-miss.txt"):
                        result = tt.check_contract(contract, phase, (folder / other).read_bytes(), receipts=bound, current_task=task)
                        self.assertEqual("BLOCKED", result["admission"])
                    self.assertEqual("BLOCKED", tt.check_contract(contract, phase, payload + b"Rewritten.\n", receipts=bound, current_task=task)["admission"])
                    bound["receipts"].remove(target)
                    self.assertEqual("BLOCKED", tt.check_contract(contract, phase, payload, receipts=bound, current_task=task)["admission"])

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
                    for reason in ("", " ", "The conditional action has not occurred in this synthetic candidate."):
                        target["not_applicable_reason"] = reason
                        expected = "ADMITTED" if reason.strip() and ob["not_applicable_allowed"] else "BLOCKED"
                        self.assertEqual(expected, tt.check_contract(contract, phase, payload, receipts=bound, current_task=task)["admission"])
                    self.assertEqual("BLOCKED", tt.check_contract(contract, phase, payload + b"Changed\n", receipts=bound, current_task=task)["admission"])

    def test_actor_action_and_unknown_fact_scope_fail_closed(self):
        for folder, record, catalog, task, _ in self.cases():
            for actor in ("chat", "work", "codex", "claude", "unrelated-actor"):
                envelope = copy.deepcopy(task)
                envelope["facts"]["actor"]["value"] = actor
                selected = tt.compile_contract(catalog, self.profile, envelope, "graph")["selected_rules"]
                self.assertEqual(actor in record["applies_to"]["actors"], bool(selected))
            relevant = {"review_round", "review_finding_judgment"} if record["rule_id"].startswith("uda.review.") else {"merge_gate"}
            for action in (*ACTIONS, "instruction_maintenance", "worker_handoff"):
                envelope = copy.deepcopy(task)
                envelope["facts"]["action_classes"]["value"] = [action]
                selected = tt.compile_contract(catalog, self.profile, envelope, "graph")["selected_rules"]
                self.assertEqual(action in relevant, bool(selected))
            for name in ("actor", "action_classes", "governance_required"):
                for state in ("UNKNOWN", "MISSING"):
                    envelope = copy.deepcopy(task)
                    if state == "MISSING":
                        envelope["facts"].pop(name)
                    else:
                        envelope["facts"][name] = {"state": state, "provenance": "synthetic unresolved input"}
                    contract = tt.compile_contract(catalog, self.profile, envelope, "graph")
                    self.assertFalse(contract["usable"])
                    phase = record["obligations"][0]["due_phase"]
                    self.assertEqual("BLOCKED", tt.check_contract(contract, phase, b"Candidate")["admission"])
            for value in ([],):
                envelope = copy.deepcopy(task)
                envelope["facts"]["action_classes"]["value"] = value
                self.assertFalse(tt.compile_contract(catalog, self.profile, envelope, "graph")["selected_rules"])
            envelope = copy.deepcopy(task)
            envelope["facts"]["action_classes"] = {"state": "ABSENT", "provenance": "synthetic absence"}
            self.assertFalse(tt.compile_contract(catalog, self.profile, envelope, "graph")["selected_rules"])

    def test_generic_examples_declare_absence_and_do_not_select_these_actions(self):
        for path in (ROOT / "examples/rule-graph").glob("*.json"):
            task = tt.read_json(path)
            if "facts" not in task:
                continue
            with self.subTest(example=path.name):
                fact = task["facts"]["action_classes"]
                self.assertEqual("KNOWN", fact["state"])
                self.assertFalse(set(fact["value"]).intersection(ACTIONS))
                for value in ACTIONS:
                    self.assertIn(value, fact["provenance"])
                contract = tt.compile_contract(self.catalog, self.profile, task, "graph")
                self.assertTrue(contract["usable"])
                self.assertFalse({r["rule_id"] for r in self.records}.intersection(r["rule_id"] for r in contract["selected_rules"]))
        work = tt.read_json(ROOT / coverage.WORK_CONTRACT)
        self.assertLessEqual(len(work["rendered_contract"].encode()), 32 * 1024)

    def test_new_identities_do_not_change_legacy_baseline_or_shrinkage(self):
        baseline = tt.read_json(ROOT / coverage.BASELINE)
        self.assertFalse(set(SOURCES).intersection(baseline["backlog_ids"]))
        self.assertFalse(baseline.get("owner_authorized_additions"))
        report = coverage.report(ROOT)
        self.assertEqual(77, report["backlog_count"])
        self.assertEqual(7, len(report["removed_since_baseline"]))
        self.assertFalse(set(SOURCES).intersection(report["removed_since_baseline"]))
        for source, expected in zip(SOURCES, (70, 58)):
            entry = next(e for e in self.inventory["entries"] if e["id"] == source)
            self.assertEqual("STRUCTURED_ENFORCED", entry["disposition"])
            self.assertEqual(expected, len(entry["obligation_map"]))
            self.assertFalse(any("exception" in item for item in entry["obligation_map"]))

    def test_activation_slice_summary_matches_enforced_clause_maps(self):
        total = sum(len(e["obligation_map"]) for e in self.inventory["entries"]
                    if e["id"] in SOURCES)
        summary = (ROOT / "patterns/task-time-lesson-activation.md").read_text().split(
            "### Review/merge-gate migration slice 2", 1)[1]
        self.assertIn(f"bind {total} operative clauses", summary)

    def test_false_failure_contract_carries_pilot_uncertainty(self):
        _, _, _, _, contract = next(case for case in self.cases()
                                    if case[1]["rule_id"] == "uda.review.false-failure")
        obligation = contract["selected_rules"][0]["obligations"][0]
        for phrase in ("confidence level and method", "pilot counts", "sample size",
                       "upper confidence bound", "lower confidence bound",
                       "every unit/run and hard-floor calculation",
                       "enlarge the pilot or redesign before scale"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, obligation["acceptance_evidence"])
        self.assertIn("zero observed false flags treated as zero risk",
                      obligation["non_substitutes"])
        self.assertIn("an empirical pass rate extrapolated without a confidence bound",
                      obligation["non_substitutes"])

    def test_change_scope_contract_invalidates_verdicts_on_configuration_drift(self):
        _, _, _, _, contract = next(case for case in self.cases()
                                    if case[1]["rule_id"] == "uda.review.change-scope")
        obligation = contract["selected_rules"][0]["obligations"][0]
        for phrase in (
            "complete evaluator configuration", "reviewer prompt", "rubric",
            "model/version", "sampling settings", "frozen reference",
            "match earlier verdicts mechanically", "ID/content/configuration mismatch",
            "configuration change invalidates every affected carried verdict",
            "re-review before aggregate acceptance",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, obligation["acceptance_evidence"])
        self.assertIn("carried verdict from a different evaluator configuration",
                      obligation["non_substitutes"])

    def test_false_failure_contract_counts_flagged_items_once(self):
        _, _, _, _, contract = next(case for case in self.cases()
                                    if case[1]["rule_id"] == "uda.review.false-failure")
        obligation = contract["selected_rules"][0]["obligations"][0]
        self.assertIn("distinct eligible reviewed items with at least one adjudicated false flag",
                      obligation["acceptance_evidence"])
        self.assertIn("count each item once even if it has multiple false findings",
                      obligation["acceptance_evidence"])
        self.assertIn("raw false-finding count as the Bernoulli numerator",
                      obligation["non_substitutes"])

    def test_requirement_slice_summary_matches_enforced_clause_maps(self):
        requirement = tt.read_json(ROOT / coverage.REQUIREMENT)
        summary = next(f["implemented"] for f in requirement["related_findings"]
                       if f["finding_id"] == "slice-2-review-merge")
        for source, label in zip(SOURCES, ("review", "merge")):
            with self.subTest(source=source):
                entry = next(e for e in self.inventory["entries"] if e["id"] == source)
                self.assertIn(f"{len(entry['obligation_map'])} {label} clauses", summary)


class ReviewMergeCoverageMutations(unittest.TestCase):
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

    def test_new_unmapped_section_blocks_even_after_regeneration(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                path = self.root / source
                path.write_text(path.read_text() +
                                "\n## Additional obligation\n\n"
                                "The executor must obtain a second approval before every repair.\n")
                self.regenerate()
                self.rejected("section needs mapped clauses or explicit non-operative classification: additional-obligation")

    def test_added_clause_in_mapped_section_blocks_even_after_regeneration(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                path = self.root / source
                path.write_text(path.read_text().replace(
                    "## Rules\n", "## Rules\n\n"
                    "The executor must obtain a second approval before every repair.\n", 1))
                self.regenerate()
                self.rejected("obligation_map differs from independent section clause manifests")

    def test_added_pre_section_clause_blocks_even_after_regeneration(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                path = self.root / source
                title, newline, remainder = path.read_text().partition("\n")
                path.write_text(title + newline +
                                "\nThe executor must obtain a second approval before every repair.\n" +
                                remainder)
                self.regenerate()
                self.rejected("pre-section source differs from independent source pin")

    def test_pre_section_source_pin_is_required_and_verified(self):
        for source, entry, rid in self.targets():
            for pin in (None, "0" * 64):
                with self.subTest(source=source, pin=pin):
                    self.restore()
                    def change(data):
                        manifest = data["source_clause_manifest"][source]
                        if pin is None:
                            manifest.pop("pre_section_sha256", None)
                        else:
                            manifest["pre_section_sha256"] = pin
                    self.mutate(coverage.REQUIREMENT, change)
                    self.regenerate()
                    self.rejected("pre-section source differs from independent source pin")

    def test_non_operative_section_requires_explicit_reason_and_content_pin(self):
        source = SOURCES[0]
        section = "reference-notes"
        body = "\n\nHistorical examples explain the origin of this pattern.\n"
        path = self.root / source
        # Preserve the preceding section's complete pinned body.
        path.write_text(path.read_text() + "## Reference notes" + body)
        pin = {"classification": "NON_OPERATIVE",
               "reason": "These historical examples provide context without adding any behavioral rule.",
               "source_sha256": hashlib.sha256(body.encode()).hexdigest()}
        def declare(value):
            self.mutate(coverage.REQUIREMENT,
                        lambda d: d["source_clause_manifest"][source]["sections"].update({section: value}))
        declare(pin)
        self.regenerate()
        self.assertEqual([], coverage.validate(self.root))
        for key, value in (("classification", "MAPPED"), ("reason", ""),
                           ("reason", "reference only"), ("source_sha256", "0" * 64)):
            with self.subTest(field=key, value=value):
                declare({**pin, key: value})
                self.assertTrue(coverage.validate(self.root))
        for key in pin:
            with self.subTest(missing=key):
                declare({k: v for k, v in pin.items() if k != key})
                self.rejected("obligation_map differs from independent section clause manifests")
        declare({"clause_count": 0, "clauses_sha256": coverage.canonical_hash([])})
        self.rejected("section needs mapped clauses or explicit non-operative classification: " + section)

    def test_existing_non_operative_sections_cannot_be_omitted_or_changed(self):
        for source, entry, rid in self.targets():
            manifest = tt.read_json(self.root / coverage.REQUIREMENT)["source_clause_manifest"][source]
            sections = [s for s, pin in manifest["sections"].items()
                        if pin.get("classification") == "NON_OPERATIVE"]
            self.assertTrue(sections)
            for section in sections:
                with self.subTest(source=source, section=section):
                    self.restore()
                    self.mutate(coverage.REQUIREMENT,
                                lambda d: d["source_clause_manifest"][source]["sections"].pop(section))
                    self.rejected("section needs mapped clauses or explicit non-operative classification: " + section)
                    self.restore()
                    path = self.root / source
                    heading = next(h for h in path.read_text().splitlines()
                                   if h.startswith("## ") and coverage.slug(h[3:]) == section)
                    path.write_text(path.read_text().replace(
                        heading + "\n", heading + "\n\nThe executor must obtain a second approval before every repair.\n", 1))
                    self.regenerate()
                    self.rejected("obligation_map differs from independent section clause manifests")

    def test_duplicate_section_identity_blocks_even_after_regeneration(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                path = self.root / source
                path.write_text(path.read_text() +
                                "\n## Rules!\n\nThe executor must obtain a second approval before every repair.\n")
                self.regenerate()
                self.rejected("duplicate structured section: rules")

    def test_removing_record_blocks_both_patterns(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                self.mutate(coverage.METADATA, lambda d: d.update(records=[r for r in d["records"] if r["rule_id"] != rid]))
                self.rejected("obligation_map references missing record obligation")

    def test_removing_selector_blocks_even_after_regeneration(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                self.mutate(coverage.METADATA, lambda d: next(r for r in d["records"] if r["rule_id"] == rid)["source"]["selectors"].pop())
                self.regenerate()
                self.rejected("obligation_map sentence absent from record selectors")

    def test_removing_map_item_blocks_even_after_regeneration(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                self.mutate(coverage.COVERAGE, lambda d: next(e for e in d["entries"] if e["id"] == source)["obligation_map"].pop())
                self.regenerate()
                self.rejected("obligation_map differs from independent source clause manifest")

    def test_coordinated_record_and_map_deletion_cannot_evade_clause_pin(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                self.mutate(coverage.METADATA, lambda d: d.update(records=[r for r in d["records"] if r["rule_id"] != rid]))
                def remove(d):
                    e = next(e for e in d["entries"] if e["id"] == source)
                    e["task_time_records"].remove(rid)
                    e["obligation_map"] = [i for i in e["obligation_map"] if i["record"] != rid]
                self.mutate(coverage.COVERAGE, remove)
                self.regenerate()
                self.assertEqual(sorted([
                    source + ": obligation_map differs from independent source clause manifest",
                    source + ": obligation_map differs from independent section clause manifests",
                ]), coverage.validate(self.root))

    def test_removing_pinned_clause_from_source_blocks(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                clause = entry["obligation_map"][0]["sentence"]
                path = self.root / source
                path.write_text(path.read_text().replace(clause, "", 1))
                self.rejected("obligation_map sentence missing or ambiguous in owning section")

    def test_formula_drift_blocks_source_lock_regeneration(self):
        for old, changed in (("(1 - p)^n", "(1 - p)^(2n)"),
                             ("q^N", "q^(2N)"),
                             ("1 - (1 - p)^m", "1 - (1 - p)^(2m)")):
            with self.subTest(formula=old):
                self.restore()
                path = self.root / SOURCES[0]
                self.assertEqual(1, path.read_text().count(old))
                path.write_text(path.read_text().replace(old, changed))
                self.rejected("obligation_map sentence missing or ambiguous in owning section")
                with self.assertRaises(tt.RuleGraphError) as caught:
                    self.regenerate()
                self.assertEqual("SOURCE_SELECTOR_CARDINALITY", caught.exception.code)

    def test_coordinated_formula_rewrite_cannot_evade_independent_pin(self):
        for old, changed in (("(1 - p)^n", "(1 - p)^(2n)"),
                             ("q^N", "q^(2N)"),
                             ("1 - (1 - p)^m", "1 - (1 - p)^(2m)")):
            with self.subTest(formula=old):
                self.restore()
                path = self.root / SOURCES[0]
                path.write_text(path.read_text().replace(old, changed))
                def update_map(data):
                    entry = next(e for e in data["entries"] if e["id"] == SOURCES[0])
                    for item in entry["obligation_map"]:
                        item["sentence"] = item["sentence"].replace(old, changed)
                def update_selectors(data):
                    record = next(r for r in data["records"] if r["rule_id"] == "uda.review.false-failure")
                    for selector in record["source"]["selectors"]:
                        selector["text"] = selector["text"].replace(old, changed)
                self.mutate(coverage.COVERAGE, update_map)
                self.mutate(coverage.METADATA, update_selectors)
                self.regenerate()
                self.rejected("obligation_map differs from independent source clause manifest")
                self.rejected("obligation_map differs from independent section clause manifests")

    def test_each_operative_section_requires_its_independent_clause_pin(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                self.mutate(coverage.REQUIREMENT, lambda d: d["source_clause_manifest"][source]["sections"].pop("rules"))
                self.rejected("obligation_map differs from independent section clause manifests")

    def test_coordinated_same_count_shortening_cannot_evade_clause_pin(self):
        for source, entry, rid in self.targets():
            with self.subTest(source=source):
                sentence = entry["obligation_map"][0]["sentence"]
                shortened = sentence.split(",", 1)[0]
                self.assertNotEqual(sentence, shortened)
                self.mutate(coverage.COVERAGE, lambda d: next(i for e in d["entries"] if e["id"] == source for i in e["obligation_map"] if i["sentence"] == sentence).update(sentence=shortened))
                self.mutate(coverage.METADATA, lambda d: next(s for r in d["records"] if r["rule_id"] == rid for s in r["source"]["selectors"] if s["text"] == sentence).update(text=shortened))
                self.regenerate()
                self.rejected("obligation_map differs from independent source clause manifest")


if __name__ == "__main__":
    unittest.main()
