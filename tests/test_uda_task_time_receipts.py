import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts import uda_rule_graph_task_time as tt

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'tests/fixtures/dominated-route'


class SemanticReceiptTests(unittest.TestCase):
    def setUp(self):
        self.catalog = json.loads((ROOT / 'rules/rule-graph/task-time-metadata.v1.json').read_text())
        self.catalog['records'] = [r for r in self.catalog['records'] if r['rule_id'] == 'uda.reasoning.dominated-alternative']
        self.profile = json.loads((ROOT / 'scripts/instruction-layering-profile.json').read_text())
        self.task = json.loads((FIXTURE / 'task.json').read_text())
        self.payload = (FIXTURE / 'repaired-final.txt').read_bytes()
        self.contract = self.compile()
        self.receipt = tt.receipt_skeleton(self.contract, 'final-delivery', self.payload)['receipts'][0]
        self.receipt.update(verdict='PASS', evidence='The literal final contains one direct-output command and says the intermediate is retained.',
                            actor={'id': 'candidate-author', 'kind': 'chat', 'relation': 'SAME_AGENT'}, issued_at='2026-10-06T12:00:00Z')

    def compile(self):
        return tt.compile_contract(self.catalog, self.profile, self.task, 'graph')

    def check(self, receipts=None, **kwargs):
        return tt.check_contract(self.contract, 'final-delivery', self.payload, receipts=receipts, **kwargs)

    def test_missing_receipt_blocks(self):
        result = self.check()
        self.assertEqual(result['admission'], 'BLOCKED')
        self.assertEqual(result['results'][0]['status'], 'UNKNOWN')

    def test_matching_well_formed_receipt_admits(self):
        result = self.check([self.receipt])
        self.assertEqual(result['admission'], 'ADMITTED')
        self.assertEqual(result['results'][0]['binding_status'], 'RECEIPT_BINDING_VERIFIED')
        self.assertEqual(result['results'][0]['asserted_by'], self.receipt['actor'])
        self.assertIs(result['results'][0]['judgment_proved'], False)

    def test_each_binding_mismatch_stays_unknown_and_blocks(self):
        for field in ('contract_sha256', 'payload_sha256', 'rule_id', 'obligation_id', 'phase', 'destination'):
            with self.subTest(field=field):
                receipt = {**self.receipt, field: 'wrong-binding'}
                result = self.check([receipt])
                self.assertEqual(result['admission'], 'BLOCKED')
                self.assertEqual(result['results'][0]['status'], 'UNKNOWN')

    def test_check_destination_mismatch_cannot_admit(self):
        result = self.check([self.receipt], destination='another-surface')
        self.assertEqual(result['admission'], 'NOT_EVALUATED')
        self.assertEqual(result['destination'], 'another-surface')
        self.assertEqual(result['results'], [])
        self.assertEqual(result['out_of_scope'], [
            {'rule_id': self.receipt['rule_id'], 'obligation_id': self.receipt['obligation_id'],
             'destination': self.receipt['destination']}])

    def test_malformed_or_unbound_receipts_stay_unknown(self):
        variants = [None, {}, [], 'not a receipt', {'receipts': 'wrong-type'}]
        variants += [[{k: v for k, v in self.receipt.items() if k != field}] for field in self.receipt]
        for field, value in (('actor', []), ('actor', {'id': '', 'kind': 'chat', 'relation': 'SAME_AGENT'}),
                             ('actor', {'id': 'x', 'kind': 'chat', 'relation': []}), ('verdict', {}),
                             ('verdict', 'APPROVED'), ('evidence', ''), ('evidence', ['text']),
                             ('issued_at', 'yesterday'), ('issued_at', '2026-10-06T12:00:00'), ('not_applicable_reason', None)):
            variants.append([{**self.receipt, field: value}])
        for receipts in variants:
            with self.subTest(receipts=receipts):
                result = self.check(receipts)
                self.assertEqual(result['admission'], 'BLOCKED')
                self.assertEqual(result['results'][0]['status'], 'UNKNOWN')

    def test_duplicate_assertions_do_not_pick_a_convenient_verdict(self):
        for second in (self.receipt, {**self.receipt, 'verdict': 'FAIL'}):
            self.assertEqual(self.check([self.receipt, second])['admission'], 'BLOCKED')

    def test_owner_correction_changes_contract_hash_and_invalidates_receipt(self):
        prior = self.contract['content_sha256']
        # Same applicability; an owner correction still invalidates the old judgment.
        self.task['owner_correction'] = 'Retain the intermediate artifact and emit only the requested output.'
        self.contract = self.compile()
        self.assertNotEqual(prior, self.contract['content_sha256'])
        self.assertEqual(self.check([self.receipt])['admission'], 'BLOCKED')

    def test_fail_receipt_blocks(self):
        result = self.check([{**self.receipt, 'verdict': 'FAIL'}])
        self.assertEqual(result['admission'], 'BLOCKED')
        self.assertEqual(result['results'][0]['status'], 'FAIL')

    def test_not_applicable_without_permission_blocks(self):
        result = self.check([{**self.receipt, 'verdict': 'NOT_APPLICABLE', 'not_applicable_reason': 'The task changed.'}])
        self.assertEqual(result['admission'], 'BLOCKED')
        self.assertEqual(result['results'][0]['status'], 'FAIL')

    def test_allowed_not_applicable_requires_reason_and_admits_with_one(self):
        self.catalog['records'][0]['obligations'][0]['not_applicable_allowed'] = True
        self.contract = self.compile()
        receipt = {**self.receipt, 'contract_sha256': self.contract['content_sha256'], 'verdict': 'NOT_APPLICABLE'}
        for reason in ('', '   '):
            self.assertEqual(self.check([{**receipt, 'not_applicable_reason': reason}])['admission'], 'BLOCKED')
        result = self.check([{**receipt, 'not_applicable_reason': 'The corrected task asks for an explanation rather than an operational method.'}])
        self.assertEqual(result['admission'], 'ADMITTED')
        self.assertEqual(result['results'][0]['status'], 'NOT_APPLICABLE')

    def test_independent_requirement_rejects_same_agent_and_accepts_independent(self):
        self.catalog['records'][0]['obligations'][0]['independent_review_required'] = True
        self.contract = self.compile()
        receipt = {**self.receipt, 'contract_sha256': self.contract['content_sha256']}
        result = self.check([receipt])
        self.assertEqual(result['admission'], 'BLOCKED')
        self.assertEqual(result['results'][0]['status'], 'UNKNOWN')
        independent = {**receipt, 'actor': {'id': 'other-reviewer', 'kind': 'reviewer', 'relation': 'INDEPENDENT'}}
        self.assertEqual(self.check([independent])['admission'], 'ADMITTED')

    def test_same_agent_is_application_evidence_never_independent_verification(self):
        result = self.check([self.receipt])['results'][0]
        self.assertEqual(result['judgment_basis'], 'APPLICATION_EVIDENCE')
        self.assertNotIn('independent', json.dumps(result).lower())
        self.assertIs(result['judgment_proved'], False)

    def test_exact_bytes_include_crlf_unicode_and_final_newline(self):
        original = self.payload
        self.payload = original.replace(b'\n', b'\r\n') + 'Ω\n'.encode()
        bound = tt.receipt_skeleton(self.contract, 'final-delivery', self.payload)['receipts'][0]
        self.assertEqual(bound['payload_sha256'], tt.sha256(self.payload))
        self.assertEqual(self.check([self.receipt])['admission'], 'BLOCKED')
        receipt = {**self.receipt, 'payload_sha256': bound['payload_sha256']}
        self.assertEqual(self.check([receipt])['admission'], 'ADMITTED')
        self.payload = self.payload.rstrip(b'\n')
        self.assertEqual(self.check([receipt])['admission'], 'BLOCKED')

    def test_mutating_contract_without_recompiling_blocks(self):
        self.contract['selected_rules'][0]['obligations'][0]['required_behavior'] = 'weakened behavior'
        self.assertEqual(self.check([self.receipt])['admission'], 'BLOCKED')

    def test_skeleton_is_bound_but_unfilled_and_cannot_admit(self):
        skeleton = tt.receipt_skeleton(self.contract, 'final-delivery', self.payload)
        self.assertEqual(skeleton['receipts'][0]['contract_sha256'], self.contract['content_sha256'])
        self.assertEqual(self.check(skeleton)['admission'], 'BLOCKED')

    def test_obligation_permissions_must_be_booleans(self):
        for field in ('not_applicable_allowed', 'independent_review_required'):
            self.catalog['records'][0]['obligations'][0][field] = 'true'
            with self.subTest(field=field), self.assertRaises(tt.RuleGraphError) as caught:
                self.compile()
            self.assertEqual(caught.exception.code, 'INVALID_OBLIGATION_FLAG')
            self.catalog['records'][0]['obligations'][0].pop(field)

    def test_existing_semantic_records_accept_bound_receipts_at_their_phases(self):
        catalog = json.loads((ROOT / 'rules/rule-graph/task-time-metadata.v1.json').read_text())
        envelope = json.loads((ROOT / 'examples/rule-graph/work-handoff.json').read_text())
        contract = tt.compile_contract(catalog, self.profile, envelope, 'graph')
        for phase in ('retrieval', 'reasoning', 'handoff'):
            with self.subTest(phase=phase):
                payload = b'Current authority was loaded; the active contract binds obligations. Perform only the bounded mechanical task and return facts to Chat.'
                receipts = tt.receipt_skeleton(contract, phase, payload)
                self.assertTrue(receipts['receipts'])
                for receipt in receipts['receipts']:
                    receipt.update(verdict='PASS', evidence='The literal test candidate binds the current contract and directs only mechanical work with facts returned to Chat.',
                                   actor={'id': 'application-author', 'kind': 'chat', 'relation': 'SAME_AGENT'}, issued_at='2026-10-06T12:00:00Z')
                result = tt.check_contract(contract, phase, payload, receipts=receipts)
                self.assertEqual(result['admission'], 'ADMITTED')
                self.assertTrue(all(r['binding_status'] == 'RECEIPT_BINDING_VERIFIED' for r in result['results']))

    def test_receipt_cannot_override_mechanical_failure_or_change_its_output(self):
        catalog = json.loads((ROOT / 'rules/rule-graph/task-time-metadata.v1.json').read_text())
        envelope = json.loads((ROOT / 'examples/rule-graph/instruction-only.json').read_text())
        contract = tt.compile_contract(catalog, self.profile, envelope, 'graph')
        payload = b'Done.\nElapsed time: 2 minutes\n'
        receipt = {**self.receipt, 'contract_sha256': contract['content_sha256'], 'payload_sha256': tt.sha256(payload),
                   'rule_id': 'uda.final.timestamp', 'obligation_id': 'final-first-line-timestamp'}
        result = tt.check_contract(contract, 'final-delivery', payload, receipts=[receipt],
                                   clock_start='2026-09-30T09:40:00Z', clock_end='2026-09-30T09:42:00Z')
        self.assertEqual(result['admission'], 'BLOCKED')
        self.assertEqual(result['results'][0], {'rule_id': 'uda.final.timestamp', 'obligation_id': 'final-first-line-timestamp',
                                               'status': 'FAIL', 'evidence': 'Done.'})

    def test_cli_receipt_and_check_use_exact_bytes_in_both_entrypoints(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            contract, payload, receipts = (root / name for name in ('contract.json', 'payload.txt', 'receipts.json'))
            contract.write_text(json.dumps(self.contract))
            payload.write_bytes(self.payload.replace(b'\n', b'\r\n'))
            for script in ('uda_rule_graph_task_time.py', 'uda_rule_graph.py'):
                args = [sys.executable, str(ROOT / 'scripts' / script)]
                bound = ['--contract', str(contract), '--phase', 'final-delivery', '--payload', str(payload)]
                result = subprocess.run(args + ['receipt'] + bound, capture_output=True, text=True, cwd=ROOT)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                skeleton = json.loads(result.stdout)
                self.assertEqual(skeleton['receipts'][0]['payload_sha256'], tt.sha256(payload.read_bytes()))
                skeleton['receipts'][0].update({k: self.receipt[k] for k in ('verdict', 'evidence', 'actor', 'issued_at')})
                receipts.write_text(json.dumps(skeleton))
                result = subprocess.run(args + ['check'] + bound + ['--receipts', str(receipts)], capture_output=True, text=True, cwd=ROOT)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(json.loads(result.stdout)['admission'], 'ADMITTED')
                for malformed in (b'{malformed', b'\xff\xfe'):
                    receipts.write_bytes(malformed)
                    result = subprocess.run(args + ['check'] + bound + ['--receipts', str(receipts)], capture_output=True, text=True, cwd=ROOT)
                    self.assertEqual(result.returncode, 4)
                    self.assertEqual(json.loads(result.stdout)['results'][0]['status'], 'UNKNOWN')


class ActivationTests(unittest.TestCase):
    def setUp(self):
        self.case = SemanticReceiptTests()
        self.case.setUp()

    def test_loaded_task_carries_active_governance_and_runs_enforcement(self):
        contract = self.case.contract
        self.assertEqual(contract['uda_activation']['state'], 'ACTIVE')
        self.assertEqual(contract['uda_activation']['via']['state'], 'LOADED')
        self.assertEqual(contract['uda_protection'], 'UDA_GOVERNED')
        self.assertEqual(self.case.check([self.case.receipt])['admission'], 'ADMITTED')

    def test_unactivated_or_unspecified_bootstrap_cannot_claim_protection(self):
        for bootstrap in ({'state': 'NOT_LOADED'}, {}, {'state': 'UNKNOWN'}, None):
            with self.subTest(bootstrap=bootstrap):
                self.case.task['bootstrap'] = bootstrap
                contract = self.case.compile()
                self.assertEqual(contract['uda_protection'], 'OUTSIDE_UDA')
                self.assertEqual(contract['uda_activation']['state'], 'NOT_ACTIVATED')
                self.assertFalse(contract['usable'])
                result = tt.check_contract(contract, 'final-delivery', self.case.payload)
                self.assertEqual(result['admission'], 'NOT_EVALUATED')
                self.assertEqual(result['results'], [])
        self.case.task.pop('bootstrap')
        self.assertEqual(self.case.compile()['uda_protection'], 'OUTSIDE_UDA')

    def test_owner_skip_exemption_is_outside_never_pass_or_admitted(self):
        self.case.task['bootstrap'] = {'state': 'SKIPPED_BY_OWNER_EXEMPTION'}
        contract = self.case.compile()
        self.assertEqual(contract['uda_activation']['via']['state'], 'SKIPPED_BY_OWNER_EXEMPTION')
        self.assertEqual(contract['uda_protection'], 'OUTSIDE_UDA')
        result = tt.check_contract(contract, 'final-delivery', self.case.payload, receipts=[self.case.receipt])
        self.assertEqual(result['admission'], 'NOT_EVALUATED')
        self.assertNotIn('PASS', json.dumps(result))
        self.assertNotIn('ADMITTED', json.dumps(result))

    def test_no_contract_is_not_evaluated_in_api_and_both_clis(self):
        self.assertEqual(tt.check_contract(None, 'final-delivery', self.case.payload)['admission'], 'NOT_EVALUATED')
        with tempfile.TemporaryDirectory() as directory:
            payload = Path(directory) / 'final.txt'
            payload.write_bytes(self.case.payload)
            for script in ('uda_rule_graph_task_time.py', 'uda_rule_graph.py'):
                result = subprocess.run([sys.executable, str(ROOT / 'scripts' / script), 'check', '--phase', 'final-delivery', '--payload', str(payload)], capture_output=True, text=True, cwd=ROOT)
                self.assertEqual(result.returncode, 4, result.stdout + result.stderr)
                self.assertEqual(json.loads(result.stdout)['admission'], 'NOT_EVALUATED')


if __name__ == '__main__':
    unittest.main()
