import copy
import json
import unittest
from pathlib import Path

from scripts import uda_rule_graph_task_time as tt

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'tests/fixtures/usage-limit-continuity'
RULES = {
    'uda.continuity.step-checkpoint': ('save-completed-step', 'persistence'),
    'uda.continuity.turn-end-handoff': ('save-turn-end-handoff', 'final-delivery'),
    'uda.continuity.usage-warning': ('checkpoint-visible-usage-warning', 'persistence'),
}
DESTINATION = 'durable-task-checkpoint'


def fixture_contract(task=None, rule_ids=None):
    """Exercise the selected continuity slice with production source bindings."""
    catalog = json.loads((ROOT / 'rules/rule-graph/task-time-metadata.v1.json').read_text())
    catalog['records'] = [r for r in catalog['records'] if r['rule_id'] in (rule_ids or RULES)]
    profile = json.loads((ROOT / 'scripts/instruction-layering-profile.json').read_text())
    envelope = task or json.loads((FIXTURE / 'task.json').read_text())
    return tt.compile_contract(catalog, profile, envelope, 'graph')


def bound_receipts(contract, phase, payload, verdict):
    """Golden files contain judgments only; bind exact current bytes at test time."""
    receipts = tt.receipt_skeleton(contract, phase, payload)
    for receipt in receipts['receipts']:
        receipt.update(verdict=verdict['verdict'], evidence=verdict['evidence'],
                       actor={'id': 'continuity-regression', 'kind': 'fixture', 'relation': 'SAME_AGENT'},
                       issued_at='2026-10-07T00:00:00Z')
    return receipts


class UsageLimitContinuityRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.task = json.loads((FIXTURE / 'task.json').read_text())

    def record_task(self, rule_id):
        task = copy.deepcopy(self.task)
        if rule_id == 'uda.continuity.usage-warning':
            task['facts']['usage_warning_visible'] = {
                'state': 'KNOWN', 'value': True, 'provenance': 'visible warning at 92% in this fixture'}
        return task

    def cases(self, rule_id):
        name = rule_id.removeprefix('uda.continuity.')
        return json.loads((FIXTURE / (name + '.verdicts.json')).read_text())

    def test_open_multistep_task_selects_continuous_saves_for_each_actor(self):
        for actor in ('chat', 'work', 'codex', 'claude'):
            task = copy.deepcopy(self.task)
            task['facts']['actor']['value'] = actor
            with self.subTest(actor=actor):
                contract = fixture_contract(task)
                self.assertEqual({r['rule_id'] for r in contract['selected_rules']},
                                 {'uda.continuity.step-checkpoint', 'uda.continuity.turn-end-handoff'})
                self.assertEqual(contract['unresolved'], [])
                self.assertTrue(contract['usable'])

    def test_instruction_diagnostic_no_change_and_stop_modes_do_not_select(self):
        for mode in ('INSTRUCTION_ONLY', 'DIAGNOSTIC_ONLY', 'NO_CHANGE', 'STOP'):
            task = self.record_task('uda.continuity.usage-warning')
            task['facts']['task_mode']['value'] = mode
            with self.subTest(mode=mode):
                contract = fixture_contract(task)
                self.assertEqual(contract['selected_rules'], [])
                self.assertEqual(contract['unresolved'], [])

    def test_nonopen_outcomes_do_not_select(self):
        for status in ('SATISFIED', 'SUPERSEDED', 'CANCELED', 'AUTHORITY_UNRESOLVED'):
            task = self.record_task('uda.continuity.usage-warning')
            task['facts']['owner_outcome_status']['value'] = status
            with self.subTest(status=status):
                self.assertEqual(fixture_contract(task)['selected_rules'], [])

    def test_visible_warning_selects_all_three_records(self):
        contract = fixture_contract(self.record_task('uda.continuity.usage-warning'))
        self.assertEqual({r['rule_id'] for r in contract['selected_rules']}, set(RULES))
        self.assertEqual(contract['unresolved'], [])

    def test_false_or_absent_warning_never_cancels_continuous_saves(self):
        for fact in ({'state': 'KNOWN', 'value': False, 'provenance': 'no visible warning'},
                     {'state': 'ABSENT', 'provenance': 'surface has no usage signal'}):
            task = copy.deepcopy(self.task)
            task['facts']['usage_warning_visible'] = fact
            with self.subTest(fact=fact):
                contract = fixture_contract(task)
                self.assertEqual(contract['direct_evaluations']['uda.continuity.usage-warning'], tt.FALSE)
                self.assertEqual(len(contract['selected_rules']), 2)
                self.assertEqual(contract['unresolved'], [])

    def test_unknown_or_missing_warning_stays_unresolved_and_blocks(self):
        for fact in ({'state': 'UNKNOWN', 'provenance': 'not classified'}, None):
            task = copy.deepcopy(self.task)
            if fact is None:
                task['facts'].pop('usage_warning_visible')
            else:
                task['facts']['usage_warning_visible'] = fact
            with self.subTest(fact=fact):
                contract = fixture_contract(task)
                self.assertEqual(contract['unresolved'], [
                    {'rule_id': 'uda.continuity.usage-warning', 'reason': 'UNKNOWN_APPLICABILITY'}])
                self.assertFalse(contract['usable'])
                case = self.cases('uda.continuity.step-checkpoint')[1]
                payload = (FIXTURE / case['payload']).read_bytes()
                receipts = bound_receipts(contract, 'persistence', payload, case)
                result = tt.check_contract(contract, 'persistence', payload,
                                           receipts=receipts, destination=DESTINATION)
                self.assertEqual(result['results'][0]['status'], 'PASS')
                self.assertEqual(result['admission'], 'BLOCKED')

    def test_unknown_open_outcome_or_mode_stays_unresolved(self):
        for name in ('owner_outcome_status', 'task_mode'):
            task = self.record_task('uda.continuity.usage-warning')
            task['facts'][name] = {'state': 'UNKNOWN', 'provenance': 'not classified'}
            with self.subTest(fact=name):
                contract = fixture_contract(task)
                self.assertEqual({r['rule_id'] for r in contract['unresolved']}, set(RULES))
                self.assertFalse(contract['usable'])

    def test_every_example_envelope_declares_warning_false_or_absent(self):
        for path in sorted((ROOT / 'examples/rule-graph').glob('*.json')):
            with self.subTest(example=path.name):
                fact = json.loads(path.read_text())['facts']['usage_warning_visible']
                self.assertTrue(fact['state'] == 'ABSENT' or
                                (fact['state'] == 'KNOWN' and fact['value'] is False))
                self.assertTrue(fact['provenance'])

    def test_requirement_preserves_verbatim_request_and_origin_split(self):
        requirement = json.loads((ROOT / 'docs/requirements/2026-10-07-usage-limit-continuity.owner-requirement.json').read_text())
        self.assertEqual(requirement['owner_statement'],
                         'can we make a rule that once claude usage reaches 98%, workers launch a cheap sonnet (f that makes sense) to save their work in github so i can easily continue in my other claude account with just one line, without losing any work? does that make sense? any better ideas?')
        self.assertEqual(requirement['origin']['classification'], 'OWNER_REQUIRED')
        self.assertEqual(requirement['origin']['mechanism']['classification'], 'ASSISTANT_INFERENCE')
        self.assertIn('No lost work', requirement['origin']['owner_outcome'])
        self.assertIn('one line', requirement['origin']['owner_outcome'])
        self.assertTrue(any('never loaded UDA' in claim for claim in requirement['nonclaims']))
        self.assertTrue(any('status-line warning is surface-specific' in claim for claim in requirement['nonclaims']))

    def test_exact_subsection_bindings_and_due_destinations(self):
        source = (ROOT / 'patterns/context-compaction-resilience.md').read_text()
        subsection = source.split('#### Usage limits and account switches\n\n', 1)[1].split('\n### 4.', 1)[0]
        for rule_id, (obligation_id, phase) in RULES.items():
            with self.subTest(rule=rule_id):
                contract = fixture_contract(self.record_task(rule_id), [rule_id])
                self.assertEqual(len(contract['selected_rules']), 1)
                rule = contract['selected_rules'][0]
                self.assertEqual(rule['source']['path'], 'patterns/context-compaction-resilience.md')
                for paragraph in rule['source_text'].split('\n\n'):
                    self.assertIn(paragraph, subsection)
                self.assertEqual(len(rule['obligations']), 1)
                obligation = rule['obligations'][0]
                self.assertEqual(obligation['obligation_id'], obligation_id)
                self.assertEqual(obligation['due_phase'], phase)
                self.assertEqual(obligation['destination'], DESTINATION)
                self.assertEqual(obligation['enforcement'], 'semantic')

    def test_violating_compliant_and_near_miss_candidates(self):
        for rule_id, (_, phase) in RULES.items():
            contract = fixture_contract(self.record_task(rule_id), [rule_id])
            cases = self.cases(rule_id)
            self.assertEqual([c['case'] for c in cases], ['violating', 'compliant', 'near-miss'])
            for case in cases:
                with self.subTest(rule=rule_id, candidate=case['case']):
                    # Do not store source/contract/payload hashes in verdict files.
                    self.assertEqual(set(case), {'case', 'payload', 'verdict', 'evidence'})
                    payload = (FIXTURE / case['payload']).read_bytes()
                    receipts = bound_receipts(contract, phase, payload, case)
                    result = tt.check_contract(contract, phase, payload, receipts=receipts,
                                               destination=DESTINATION)
                    expected = 'PASS' if case['case'] == 'compliant' else 'FAIL'
                    self.assertEqual(result['results'][0]['status'], expected)
                    self.assertEqual(result['admission'], 'ADMITTED' if expected == 'PASS' else 'BLOCKED')
                    self.assertEqual(result['results'][0]['binding_status'], 'RECEIPT_BINDING_VERIFIED')
                    self.assertFalse(result['results'][0]['judgment_proved'])

    def test_missing_receipt_and_wrong_destination_cannot_admit(self):
        for rule_id, (_, phase) in RULES.items():
            contract = fixture_contract(self.record_task(rule_id), [rule_id])
            case = self.cases(rule_id)[1]
            payload = (FIXTURE / case['payload']).read_bytes()
            with self.subTest(rule=rule_id, boundary='no receipt'):
                result = tt.check_contract(contract, phase, payload, destination=DESTINATION)
                self.assertEqual(result['results'][0]['status'], 'UNKNOWN')
                self.assertEqual(result['admission'], 'BLOCKED')
            with self.subTest(rule=rule_id, boundary='chat final is not checkpoint'):
                result = tt.check_contract(contract, phase, payload,
                                           receipts=bound_receipts(contract, phase, payload, case),
                                           destination='owner-visible-final')
                self.assertEqual(result['results'][0]['status'], 'UNKNOWN')
                self.assertEqual(result['admission'], 'BLOCKED')

    def test_rewrite_or_owner_correction_requires_new_receipt(self):
        for rule_id, (_, phase) in RULES.items():
            contract = fixture_contract(self.record_task(rule_id), [rule_id])
            case = self.cases(rule_id)[1]
            payload = (FIXTURE / case['payload']).read_bytes()
            receipts = bound_receipts(contract, phase, payload, case)
            rewritten = payload + b'Checkpoint copy verified.\n'
            with self.subTest(rule=rule_id, boundary='rewritten checkpoint'):
                result = tt.check_contract(contract, phase, rewritten, receipts=receipts,
                                           destination=DESTINATION)
                self.assertEqual(result['results'][0]['status'], 'UNKNOWN')
                self.assertEqual(result['admission'], 'BLOCKED')
                renewed = bound_receipts(contract, phase, rewritten, case)
                self.assertEqual(tt.check_contract(contract, phase, rewritten, receipts=renewed,
                                                   destination=DESTINATION)['admission'], 'ADMITTED')
            with self.subTest(rule=rule_id, boundary='owner correction'):
                task = self.record_task(rule_id)
                task['owner_correction'] = 'Validate the artifact before any external handoff.'
                corrected = fixture_contract(task, [rule_id])
                result = tt.check_contract(corrected, phase, payload, receipts=receipts,
                                           destination=DESTINATION)
                self.assertEqual(result['results'][0]['status'], 'UNKNOWN')
                self.assertEqual(result['admission'], 'BLOCKED')


if __name__ == '__main__':
    unittest.main()
