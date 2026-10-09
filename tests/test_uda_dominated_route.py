import copy
import json
import unittest
from pathlib import Path

from scripts import uda_rule_graph_task_time as tt

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'tests/fixtures/dominated-route'
RULE = 'uda.reasoning.dominated-alternative'


def fixture_contract(task=None):
    """Compile the selected slice with production source and receipt bindings."""
    catalog = json.loads((ROOT / 'rules/rule-graph/task-time-metadata.v1.json').read_text())
    catalog['records'] = [r for r in catalog['records'] if r['rule_id'] == RULE]
    profile = json.loads((ROOT / 'scripts/instruction-layering-profile.json').read_text())
    envelope = task or json.loads((FIXTURE / 'task.json').read_text())
    return tt.compile_contract(catalog, profile, envelope, 'graph')


class DominatedRouteRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.task = json.loads((FIXTURE / 'task.json').read_text())
        cls.contract = fixture_contract(cls.task)

    def check(self, payload, receipts, contract=None, task=None):
        return tt.check_contract(contract or self.contract, 'final-delivery', (FIXTURE / payload).read_bytes(),
                                 receipts=json.loads((FIXTURE / receipts).read_text()), destination='owner-visible-final',
                                 current_facts=(task or self.task)['facts'])

    def test_operational_kinds_select_rule_for_each_actor(self):
        for actor in ('chat', 'work', 'codex', 'claude'):
            for kind in ('operational_command', 'procedure', 'practical_method'):
                task = copy.deepcopy(self.task)
                task['facts']['actor']['value'] = actor
                task['facts']['request_kind']['value'] = kind
                with self.subTest(actor=actor, kind=kind):
                    contract = fixture_contract(task)
                    self.assertEqual([r['rule_id'] for r in contract['selected_rules']], [RULE])
                    self.assertEqual(contract['unresolved'], [])

    def test_unrelated_request_does_not_select_rule(self):
        task = copy.deepcopy(self.task)
        task['facts']['request_kind']['value'] = 'conceptual_explanation'
        self.assertEqual(fixture_contract(task)['selected_rules'], [])

    def test_unknown_request_kind_remains_unresolved_and_cannot_admit(self):
        for value in ({'state': 'UNKNOWN', 'provenance': 'not yet classified'}, None):
            task = copy.deepcopy(self.task)
            if value is None:
                task['facts'].pop('request_kind')
            else:
                task['facts']['request_kind'] = value
            contract = fixture_contract(task)
            self.assertEqual(contract['unresolved'], [{'rule_id': RULE, 'reason': 'UNKNOWN_APPLICABILITY'}])
            self.assertFalse(contract['usable'])
            scoped = self.check('repaired-final.txt', 'repaired.receipts.json', contract, task)
            self.assertEqual(scoped['admission'], 'NOT_EVALUATED')
            self.assertEqual(scoped['results'], [])
            self.assertEqual(scoped['out_of_scope'], [])
            unscoped = tt.check_contract(contract, 'final-delivery',
                                         (FIXTURE / 'repaired-final.txt').read_bytes())
            self.assertEqual(unscoped['admission'], 'BLOCKED')

    def test_old_final_with_golden_fail_receipt_blocks(self):
        result = self.check('old-final.txt', 'old.receipts.json')
        self.assertEqual(result['admission'], 'BLOCKED')
        self.assertEqual(result['results'][0]['status'], 'FAIL')
        self.assertEqual(result['results'][0]['binding_status'], 'RECEIPT_BINDING_VERIFIED')

    def test_repaired_final_with_golden_pass_receipt_admits(self):
        self.assertEqual(self.check('repaired-final.txt', 'repaired.receipts.json')['admission'], 'ADMITTED')

    def test_pass_receipt_bound_to_old_payload_cannot_admit_repaired(self):
        result = self.check('repaired-final.txt', 'old-payload-pass.receipts.json')
        self.assertEqual(result['admission'], 'BLOCKED')
        self.assertEqual(result['results'][0]['status'], 'UNKNOWN')

    def test_rewritten_final_needs_a_new_receipt(self):
        rewritten = (FIXTURE / 'repaired-final.txt').read_bytes() + b'Output is ready immediately.\n'
        receipts = json.loads((FIXTURE / 'repaired.receipts.json').read_text())
        self.assertEqual(tt.check_contract(self.contract, 'final-delivery', rewritten, receipts=receipts, current_facts=self.task["facts"])['admission'], 'BLOCKED')
        renewed = tt.receipt_skeleton(self.contract, 'final-delivery', rewritten)
        renewed['receipts'][0].update(verdict='PASS', evidence='The rewritten literal final still has one direct command; its added sentence introduces no alternative.',
                                     actor={'id': 'regression-reviewer', 'kind': 'fixture', 'relation': 'INDEPENDENT'}, issued_at='2026-10-06T12:01:00Z')
        self.assertEqual(tt.check_contract(self.contract, 'final-delivery', rewritten, receipts=renewed, current_facts=self.task["facts"])['admission'], 'ADMITTED')

    def test_material_tradeoffs_keep_both_alternatives_and_admit(self):
        task = json.loads((FIXTURE / 'materially-different-task.json').read_text())
        contract = fixture_contract(task)
        result = self.check('materially-different-final.txt', 'materially-different.receipts.json', contract, task)
        self.assertEqual(result['admission'], 'ADMITTED')
        payload = (FIXTURE / 'materially-different-final.txt').read_text()
        self.assertIn('Route A:', payload)
        self.assertIn('Route B:', payload)
        self.assertIn('approval must precede output generation', payload)

    def test_simple_repaired_final_stays_concise(self):
        payload = (FIXTURE / 'repaired-final.txt').read_text()
        self.assertEqual(len(payload.splitlines()), 1)
        self.assertLessEqual(len(payload), 160)
        self.assertNotIn('Route A', payload)
        self.assertEqual(payload.count('`transform '), 1)
        self.assertEqual(self.check('repaired-final.txt', 'repaired.receipts.json')['admission'], 'ADMITTED')


if __name__ == '__main__':
    unittest.main()
