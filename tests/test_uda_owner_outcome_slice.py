"""Owner-outcome clause preservation and exact-bound semantic admission.

Golden judgments are synthetic and hash-free until test-time binding. PASS does
not prove meaning, reviewer authentication or live invocation. Deferred records
are tested as proposals in isolation and never claimed as activated coverage.
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
SOURCE = 'patterns/owner-outcome-invariant-and-contract-laundering-prevention.md'
DEFERRED = 'rules/rule-graph/owner-outcome-budget-deferred.v1.json'
FIXTURES = ROOT / 'tests/fixtures/owner-outcome-slice'
PREFIX = 'uda.owner-outcome.'
# Independent boundary pins, not generated from the mutable metadata.
# phase, destination, N/A, event fact, event value
BOUNDARIES = {
    'epoch-amendment': ('pre-action', 'owner-outcome-authority', True, 'owner_correction_present', True),
    'derived-contract': ('pre-action', 'owner-outcome-authority', False, 'action_classes', 'derived_contract_acceptance'),
    'supervisor-order': ('pre-action', 'supervisor-verdict', False, 'action_classes', 'owner_outcome_supervision'),
    'terminal-evidence': ('final-delivery', 'owner-visible-final', False, 'action_classes', 'task_completion'),
    'child-parent-closure': ('final-delivery', 'owner-visible-final', False, 'action_classes', 'task_completion'),
    'source-authority': ('pre-action', 'owner-outcome-authority', False, 'continuity_required', True),
    'checkpoint-packet': ('persistence', 'durable-task-checkpoint', False, 'continuity_required', True),
    'migration-repair': ('persistence', 'durable-task-checkpoint', False, 'continuity_required', True),
}


class OwnerOutcomeSliceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = tt.read_json(ROOT / coverage.METADATA)
        cls.profile = tt.read_json(ROOT / 'scripts/instruction-layering-profile.json')
        cls.active = [r for r in cls.catalog['records'] if r['source']['path'] == SOURCE]
        cls.deferred = tt.read_json(ROOT / DEFERRED)['records']
        cls.records = cls.active + cls.deferred

    def cases(self):
        for record in self.records:
            folder = FIXTURES / record['rule_id']
            record = {**record, 'status': 'CURRENT'}  # proposed records are activated only in this isolated experiment
            catalog = {**self.catalog, 'records': [record]}
            task = tt.read_json(folder / 'task.json')
            yield folder, record, catalog, task

    def bind(self, contract, phase, payload, judgment):
        receipts = tt.receipt_skeleton(contract, phase, payload)
        for receipt in receipts['receipts']:
            receipt.update({k: judgment[k] for k in ('verdict', 'evidence', 'actor')})
            receipt['issued_at'] = '2030-01-02T10:02:00+00:00'
        return receipts

    def test_fixture_inventory_is_complete_domain_neutral_and_hash_free(self):
        self.assertEqual(5, len(self.active))
        self.assertEqual(3, len(self.deferred))
        self.assertEqual({PREFIX + name for name in BOUNDARIES}, {r['rule_id'] for r in self.records})
        self.assertEqual({r['rule_id'] for r in self.records}, {p.name for p in FIXTURES.iterdir()})
        for folder, record, _, task in self.cases():
            judgments = tt.read_json(folder / 'verdicts.json')
            self.assertEqual({'compliant.txt', 'violating.txt', 'near-miss.txt'}, set(judgments))
            self.assertNotIn('sha256', json.dumps(judgments).lower())
            self.assertNotRegex(json.dumps(judgments), r'[0-9a-f]{64}')
            self.assertTrue(set(record['refresh_on_facts']) - {'envelope.bootstrap', 'envelope.legacy_rule_ids'} <= set(task['facts']))
            near = judgments['near-miss.txt']
            self.assertIn(near['non_substitute'], record['obligations'][0]['non_substitutes'])
            self.assertEqual(record['obligations'][0]['obligation_id'], near['obligation_id'])
            self.assertNotIn((folder / 'compliant.txt').read_text().strip(), (folder / 'near-miss.txt').read_text())
            for path in folder.iterdir():
                self.assertNotRegex(path.read_text(), r'https?://|/home/|AGENTS\.md|u-dont-exist|joel|Pangram|13\.82|patterns/|state/')

    def test_boundary_trigger_and_complete_refresh_table(self):
        for record in self.records:
            name = record['rule_id'].removeprefix(PREFIX)
            phase, destination, na, fact, value = BOUNDARIES[name]
            op = 'contains' if fact == 'action_classes' else 'eq'
            trigger = {'all': [{'fact': 'governance_required', 'eq': True}, {'fact': fact, op: value}]}
            with self.subTest(record=name):
                self.assertEqual(trigger, record['trigger'])
                self.assertEqual({'roles': ['universal_internal'], 'actors': ['chat', 'work', 'codex', 'claude']}, record['applies_to'])
                self.assertEqual(sorted({'governance_required', fact, 'actor', 'role', 'envelope.bootstrap', 'envelope.legacy_rule_ids'}), record['refresh_on_facts'])
                self.assertEqual(1, len(record['obligations']))
                ob = record['obligations'][0]
                self.assertEqual((phase, destination, na), (ob['due_phase'], ob['destination'], ob['not_applicable_allowed']))
                self.assertEqual('semantic', ob['enforcement'])
                self.assertIsNone(ob['mechanical_check'])
                self.assertFalse(ob['independent_review_required'])

    def test_table_rejects_violation_and_bespoke_near_miss_and_admits_compliance(self):
        for folder, record, catalog, task in self.cases():
            for mode in ('graph', 'flat'):
                contract = tt.compile_contract(catalog, self.profile, task, mode)
                self.assertTrue(contract['usable'])
                self.assertEqual([record['rule_id']], [r['rule_id'] for r in contract['selected_rules']])
                ob = record['obligations'][0]
                for filename, judgment in tt.read_json(folder / 'verdicts.json').items():
                    payload = (folder / filename).read_bytes()
                    with self.subTest(rule=record['rule_id'], mode=mode, payload=filename):
                        result = tt.check_contract(contract, ob['due_phase'], payload, current_task=task,
                            destination=ob['destination'], receipts=self.bind(contract, ob['due_phase'], payload, judgment))
                        self.assertEqual('ADMITTED' if judgment['verdict'] == 'PASS' else 'BLOCKED', result['admission'])
                        self.assertTrue(all(r['judgment_proved'] is False for r in result['results']))

    def test_every_record_requires_its_own_exact_payload_receipt(self):
        for folder, record, catalog, task in self.cases():
            phase, destination = BOUNDARIES[record['rule_id'].removeprefix(PREFIX)][:2]
            payload = (folder / 'compliant.txt').read_bytes()
            judgment = tt.read_json(folder / 'verdicts.json')['compliant.txt']
            contract = tt.compile_contract(catalog, self.profile, task, 'graph')
            bound = self.bind(contract, phase, payload, judgment)
            options = dict(current_task=task, destination=destination)
            self.assertEqual('BLOCKED', tt.check_contract(contract, phase, payload, **options)['admission'])
            self.assertEqual('ADMITTED', tt.check_contract(contract, phase, payload, receipts=bound, **options)['admission'])
            for key in ('contract_sha256', 'rule_id', 'obligation_id', 'phase', 'destination', 'payload_sha256'):
                altered = copy.deepcopy(bound)
                altered['receipts'][0][key] = 'wrong-binding'
                with self.subTest(rule=record['rule_id'], binding=key):
                    self.assertEqual('BLOCKED', tt.check_contract(contract, phase, payload, receipts=altered, **options)['admission'])
            self.assertEqual('BLOCKED', tt.check_contract(contract, phase, payload + b' rewritten', receipts=bound, **options)['admission'])
            self.assertEqual('BLOCKED', tt.check_contract(contract, phase, (folder / 'near-miss.txt').read_bytes(), receipts=bound, **options)['admission'])

    def test_not_applicable_is_bound_and_only_amendment_can_use_it(self):
        for folder, record, catalog, task in self.cases():
            ob = record['obligations'][0]
            payload = (folder / 'compliant.txt').read_bytes()
            contract = tt.compile_contract(catalog, self.profile, task, 'graph')
            judgment = tt.read_json(folder / 'verdicts.json')['compliant.txt']
            bound = self.bind(contract, ob['due_phase'], payload, judgment)
            receipt = bound['receipts'][0]
            receipt['verdict'] = 'NOT_APPLICABLE'
            options = dict(current_task=task, destination=ob['destination'], receipts=bound)
            self.assertEqual('BLOCKED', tt.check_contract(contract, ob['due_phase'], payload, **options)['admission'])
            receipt['not_applicable_reason'] = 'The owner correction affects execution wording only; it does not amend the outcome.'
            self.assertEqual('ADMITTED' if ob['not_applicable_allowed'] else 'BLOCKED', tt.check_contract(contract, ob['due_phase'], payload, **options)['admission'])

    def test_changed_trigger_facts_block_omitted_contract_until_recompiled(self):
        for folder, record, catalog, task in self.cases():
            name = record['rule_id'].removeprefix(PREFIX)
            phase, destination, _, fact, _ = BOUNDARIES[name]
            payload = (folder / 'compliant.txt').read_bytes()
            judgment = tt.read_json(folder / 'verdicts.json')['compliant.txt']
            for mode in ('graph', 'flat'):
                initial = copy.deepcopy(task)
                initial['facts'][fact]['value'] = [] if fact == 'action_classes' else False
                omitted = tt.compile_contract(catalog, self.profile, initial, mode)
                self.assertFalse(omitted['selected_rules'])
                self.assertEqual('NOT_EVALUATED', tt.check_contract(omitted, phase, payload, destination=destination, current_task=initial)['admission'])
                self.assertEqual('BLOCKED', tt.check_contract(omitted, phase, payload, destination=destination, current_task=task)['admission'])
                self.assertEqual('BLOCKED', tt.check_contract(omitted, phase, payload, destination=destination)['admission'])
                fresh = tt.compile_contract(catalog, self.profile, task, mode)
                self.assertEqual('BLOCKED', tt.check_contract(fresh, phase, payload, destination=destination, current_task=task)['admission'])
                bound = self.bind(fresh, phase, payload, judgment)
                self.assertEqual('ADMITTED', tt.check_contract(fresh, phase, payload, destination=destination, current_task=task, receipts=bound)['admission'])
                self.assertEqual('BLOCKED', tt.check_contract(fresh, phase, payload, destination=destination, current_task=initial, receipts=bound)['admission'])

    def test_every_refresh_input_change_invalidates_bound_receipts(self):
        for folder, record, catalog, task in self.cases():
            phase, destination = BOUNDARIES[record['rule_id'].removeprefix(PREFIX)][:2]
            payload = (folder / 'compliant.txt').read_bytes()
            judgment = tt.read_json(folder / 'verdicts.json')['compliant.txt']
            contract = tt.compile_contract(catalog, self.profile, task, 'graph')
            bound = self.bind(contract, phase, payload, judgment)
            for fact in record['refresh_on_facts']:
                changed = copy.deepcopy(task)
                if fact.startswith('envelope.'):
                    changed[fact.removeprefix('envelope.')] = {'changed': True}
                else:
                    changed['facts'][fact] = {'state': 'UNKNOWN', 'provenance': 'changed observation'}
                with self.subTest(record=record['rule_id'], input=fact):
                    self.assertEqual('BLOCKED', tt.check_contract(contract, phase, payload, destination=destination, current_task=changed, receipts=bound)['admission'])
                    observations = tt.refresh_observations(record['refresh_on_facts'], changed)
                    self.assertEqual('BLOCKED', tt.check_contract(contract, phase, payload, destination=destination, current_facts=observations, receipts=bound)['admission'])

    def test_unknown_declared_event_fails_closed_at_selection(self):
        for folder, record, catalog, task in self.cases():
            fact = BOUNDARIES[record['rule_id'].removeprefix(PREFIX)][3]
            task['facts'][fact] = {'state': 'UNKNOWN', 'provenance': 'unobserved event'}
            contract = tt.compile_contract(catalog, self.profile, task, 'graph')
            self.assertFalse(contract['usable'])
            self.assertTrue(contract['unresolved'])

    def test_preserved_work_selects_continuity_and_deferred_candidates_really_exceed_cap(self):
        task = tt.read_json(ROOT / coverage.WORK_TASK)
        actual = tt.compile_contract(self.catalog, self.profile, task, 'graph')
        ids = {r['rule_id'] for r in actual['selected_rules']}
        self.assertTrue({'uda.continuity.step-checkpoint', 'uda.continuity.turn-end-handoff'} <= ids)
        self.assertFalse({r['rule_id'] for r in self.records} & ids)
        self.assertEqual(32561, len(actual['rendered_contract'].encode()))
        self.assertLessEqual(len(actual['rendered_contract'].encode()), 32768)
        expected = {'source-authority': (34906, 2345), 'checkpoint-packet': (33887, 1326), 'migration-repair': (34526, 1965)}
        for record in self.deferred:
            candidate = tt.compile_contract({**self.catalog, 'records': self.catalog['records'] + [{**record, 'status': 'CURRENT'}]}, self.profile, task, 'graph')
            name = record['rule_id'].removeprefix(PREFIX)
            self.assertIn(record['rule_id'], {r['rule_id'] for r in candidate['selected_rules']})
            size = len(candidate['rendered_contract'].encode())
            self.assertEqual(expected[name], (size, size - 32561))
            self.assertGreater(size, 32768)


class OwnerOutcomeCoverageMutations(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        inventory = tt.read_json(ROOT / coverage.COVERAGE)
        paths = {coverage.COVERAGE, coverage.BASELINE, coverage.METADATA, coverage.LOCK, coverage.REQUIREMENT,
                 'rules/UDA-RULE-GRAPH.json', 'AGENTS.md', 'LESSON-INDEX.md', 'docs/uda-enforcement-coverage.md',
                 'scripts/uda_rule_graph_task_time.py', 'scripts/instruction-layering-profile.json', coverage.WORK_TASK, coverage.WORK_CONTRACT}
        paths.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'patterns').rglob('*.md'))
        paths.update(i['path'] for entry in inventory['entries'] for i in entry['evidence'])
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
        (self.root / path).write_text(json.dumps(data, indent=2) + '\n')

    def entry(self, data):
        return next(e for e in data['entries'] if e['id'] == SOURCE)

    def regenerate(self):
        catalog = tt.read_json(self.root / coverage.METADATA)
        profile = tt.read_json(self.root / 'scripts/instruction-layering-profile.json')
        (self.root / coverage.LOCK).write_text(json.dumps(tt.build_lock(catalog, profile, root=self.root)))
        (self.root / coverage.WORK_CONTRACT).write_text(json.dumps(tt.compile_contract(catalog, profile, tt.read_json(self.root / coverage.WORK_TASK), 'graph', root=self.root)))

    def rejected(self, fragment):
        errors = coverage.validate(self.root)
        self.assertTrue(any(fragment in e for e in errors), errors)

    def test_remove_each_active_record_fails_coverage_after_regeneration(self):
        entry = self.entry(tt.read_json(self.root / coverage.COVERAGE))
        for rid in entry['task_time_records']:
            self.restore()
            self.mutate(coverage.METADATA, lambda d: d.update(records=[r for r in d['records'] if r['rule_id'] != rid]))
            self.regenerate()
            self.rejected('missing task-time record')

    def test_remove_each_active_selector_fails_coverage_after_regeneration(self):
        catalog = tt.read_json(self.root / coverage.METADATA)
        for record in catalog['records']:
            if record['source']['path'] != SOURCE:
                continue
            for index in range(len(record['source']['selectors'])):
                self.restore()
                self.mutate(coverage.METADATA, lambda d: next(r for r in d['records'] if r['rule_id'] == record['rule_id'])['source']['selectors'].pop(index))
                self.regenerate()
                self.rejected('sentence absent from record selectors')

    def test_remove_map_item_from_each_operative_section_fails_independent_pin(self):
        entry = self.entry(tt.read_json(self.root / coverage.COVERAGE))
        sections = {i['section'] for i in entry['obligation_map']}
        self.assertEqual(17, len(sections))
        for section in sections:
            self.restore()
            self.mutate(coverage.COVERAGE, lambda d: self.entry(d)['obligation_map'].remove(next(i for i in self.entry(d)['obligation_map'] if i['section'] == section)))
            self.rejected('obligation_map differs from independent source clause manifest')

    def test_remove_exception_sentence_fails_independent_pin(self):
        def remove(data):
            e = next(e for e in data['entries'] if e['id'] == 'AGENTS.md#per-turn-bootstrap-invariants')
            next(i for i in e['obligation_map'] if 'exception' in i).pop('sentence')
        self.mutate(coverage.COVERAGE, remove)
        self.rejected('obligation_map differs from independent source clause manifest')

    def test_coordinated_record_and_map_removal_still_fails(self):
        rid = self.entry(tt.read_json(self.root / coverage.COVERAGE))['task_time_records'][0]
        self.mutate(coverage.METADATA, lambda d: d.update(records=[r for r in d['records'] if r['rule_id'] != rid]))
        def drop(data):
            e = self.entry(data)
            e['task_time_records'].remove(rid)
            e['obligation_map'] = [i for i in e['obligation_map'] if i.get('record') != rid]
        self.mutate(coverage.COVERAGE, drop)
        self.regenerate()
        self.rejected('obligation_map differs from independent source clause manifest')

    def test_same_clause_cannot_be_reclassified_to_legacy_without_reviewed_carrier_pin(self):
        def change(data):
            e = self.entry(data)
            item = next(i for i in e['obligation_map'] if 'record' in i)
            item.pop('record'); item.pop('obligation_id')
            item['legacy'] = {'reason': 'The current worker claims this clause is inconvenient to enforce.', 'due_phase': 'pre-action', 'destination': 'owner-outcome-authority'}
            e['legacy_remainder'] += '\n' + item['sentence']
        self.mutate(coverage.COVERAGE, change)
        self.rejected('obligation carriers differ from independent manifest')

    def test_legacy_and_server_carriers_cannot_be_used_to_claim_full_enforcement(self):
        self.mutate(coverage.COVERAGE, lambda d: self.entry(d).update(disposition='STRUCTURED_ENFORCED', legacy_remainder=''))
        self.rejected('legacy clause needs exact partial remainder and boundary')

    def test_legacy_remainder_cannot_drop_a_mapped_sentence(self):
        self.mutate(coverage.COVERAGE, lambda d: self.entry(d).update(legacy_remainder='Some unspecified server obligations remain and will be implemented later.'))
        self.rejected('legacy clause needs exact partial remainder and boundary')

    def test_implementation_paths_and_exact_test_names_are_required(self):
        entry = self.entry(tt.read_json(self.root / coverage.COVERAGE))
        for kind, anchor in [('code', 'symbol'), ('tests', 'test')]:
            self.restore()
            ref = next(i['implementation'][kind][0] for i in entry['obligation_map'] if 'implementation' in i)
            path = self.root / ref['path']
            path.write_text(path.read_text().replace(ref[anchor], 'removed-anchor'))
            self.rejected('implementation code/test anchor missing')

    def test_deferred_record_and_selector_removal_fail_independent_candidate_pin(self):
        for mutation in ('record', 'selector'):
            self.restore()
            def drop(data):
                if mutation == 'record': data['records'].pop()
                else: data['records'][0]['source']['selectors'].pop()
            self.mutate(DEFERRED, drop)
            self.rejected('deferred candidate catalog differs from independent pin')

    def test_whole_source_and_each_section_are_pinned_including_context(self):
        original = self.originals[SOURCE].decode()
        changes = [original.replace('# Owner-Outcome', '# Renamed Owner-Outcome', 1)]
        for h in re.finditer(r'^## .+$', original, re.M):
            changes.append(original[:h.end()] + '\nAn executor must add another obligation.\n' + original[h.end():])
        for text in changes:
            self.restore()
            (self.root / SOURCE).write_text(text)
            self.regenerate()
            self.rejected('whole source differs from independent source pin')

    def test_removing_partial_map_manifest_or_status_fails_promoted_ratchet(self):
        for target in ('map', 'manifest', 'status'):
            self.restore()
            if target == 'map': self.mutate(coverage.COVERAGE, lambda d: self.entry(d).pop('obligation_map'))
            elif target == 'manifest': self.mutate(coverage.REQUIREMENT, lambda d: d['source_clause_manifest'].pop(SOURCE))
            else: self.mutate(coverage.COVERAGE, lambda d: self.entry(d).update(disposition='LEGACY_UNSTRUCTURED', task_time_records=[]))
            self.rejected('unauthorized promoted coverage regression')
