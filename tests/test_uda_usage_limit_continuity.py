import copy
import json
import re
import subprocess
import sys
import tempfile
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

    def test_tiny_one_shot_task_does_not_require_checkpoint_receipts(self):
        catalog = json.loads((ROOT / 'rules/rule-graph/task-time-metadata.v1.json').read_text())
        profile = json.loads((ROOT / 'scripts/instruction-layering-profile.json').read_text())
        task = json.loads((ROOT / 'examples/rule-graph/work-handoff.json').read_text())
        task['facts']['continuity_required'] = {
            'state': 'KNOWN', 'value': False, 'provenance': 'tiny one-shot change; no recovery handoff needed'}
        payload = b'2026-10-07 00:02:00 UTC\nElapsed time: 2 minutes\nChange ready.\n'
        for mode in ('flat', 'graph'):
            with self.subTest(mode=mode):
                contract = tt.compile_contract(catalog, profile, task, mode)
                self.assertFalse(set(RULES) & {r['rule_id'] for r in contract['selected_rules']})
                self.assertEqual(contract['unresolved'], [])
                self.assertTrue(contract['usable'])
                self.assertEqual(tt.receipt_skeleton(contract, 'final-delivery', payload)['receipts'], [])
                checked = tt.check_contract(
                    contract, 'final-delivery', payload,
                    clock_start='2026-10-07T00:00:00Z', clock_end='2026-10-07T00:02:00Z')
                self.assertEqual(checked['admission'], 'ADMITTED')

    def test_unknown_or_missing_continuity_scope_remains_unresolved(self):
        for fact in ({'state': 'UNKNOWN', 'provenance': 'duration not classified'}, None):
            task = copy.deepcopy(self.task)
            if fact is None:
                task['facts'].pop('continuity_required', None)
            else:
                task['facts']['continuity_required'] = fact
            with self.subTest(fact=fact):
                contract = fixture_contract(task)
                self.assertEqual({r['rule_id'] for r in contract['unresolved']},
                                 {'uda.continuity.step-checkpoint', 'uda.continuity.turn-end-handoff'})
                self.assertFalse(contract['usable'])
                self.assertEqual(tt.check_contract(contract, 'final-delivery', b'No checkpoint.')['admission'],
                                 'BLOCKED')

    def test_one_shot_exemption_does_not_suppress_visible_usage_warning(self):
        task = self.record_task('uda.continuity.usage-warning')
        task['facts']['continuity_required'] = {
            'state': 'KNOWN', 'value': False, 'provenance': 'tiny one-shot change'}
        contract = fixture_contract(task)
        self.assertEqual({r['rule_id'] for r in contract['selected_rules']},
                         {'uda.continuity.usage-warning'})
        self.assertEqual(contract['unresolved'], [])

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
                                           receipts=receipts, destination=DESTINATION,
                                           current_facts=task['facts'])
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
                    if paragraph == '- Tiny one-shot tasks do not need a dedicated current-state file.':
                        self.assertIn(paragraph, source.split('## Limits\n', 1)[1])
                    else:
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
                                               destination=DESTINATION,
                                               current_facts=self.record_task(rule_id)['facts'])
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
                result = tt.check_contract(contract, phase, payload, destination=DESTINATION,
                                           current_facts=self.record_task(rule_id)['facts'])
                self.assertEqual(result['results'][0]['status'], 'UNKNOWN')
                self.assertEqual(result['admission'], 'BLOCKED')
            with self.subTest(rule=rule_id, boundary='chat final is not checkpoint'):
                result = tt.check_contract(contract, phase, payload,
                                           receipts=bound_receipts(contract, phase, payload, case),
                                           destination='owner-visible-final',
                                           current_facts=self.record_task(rule_id)['facts'])
                self.assertEqual(result['results'], [])
                self.assertEqual(result['admission'], 'NOT_EVALUATED')
                self.assertEqual(result['out_of_scope'], [
                    {'rule_id': rule_id, 'obligation_id': RULES[rule_id][0],
                     'destination': DESTINATION}])

    def test_rewrite_or_owner_correction_requires_new_receipt(self):
        for rule_id, (_, phase) in RULES.items():
            contract = fixture_contract(self.record_task(rule_id), [rule_id])
            case = self.cases(rule_id)[1]
            payload = (FIXTURE / case['payload']).read_bytes()
            receipts = bound_receipts(contract, phase, payload, case)
            rewritten = payload + b'Checkpoint copy verified.\n'
            with self.subTest(rule=rule_id, boundary='rewritten checkpoint'):
                result = tt.check_contract(contract, phase, rewritten, receipts=receipts,
                                           destination=DESTINATION,
                                           current_facts=self.record_task(rule_id)['facts'])
                self.assertEqual(result['results'][0]['status'], 'UNKNOWN')
                self.assertEqual(result['admission'], 'BLOCKED')
                renewed = bound_receipts(contract, phase, rewritten, case)
                self.assertEqual(tt.check_contract(contract, phase, rewritten, receipts=renewed,
                                                   destination=DESTINATION,
                                                   current_facts=self.record_task(rule_id)['facts'])['admission'], 'ADMITTED')
            with self.subTest(rule=rule_id, boundary='owner correction'):
                task = self.record_task(rule_id)
                task['owner_correction'] = 'Validate the artifact before any external handoff.'
                corrected = fixture_contract(task, [rule_id])
                result = tt.check_contract(corrected, phase, payload, receipts=receipts,
                                           destination=DESTINATION, current_facts=task['facts'])
                self.assertEqual(result['results'][0]['status'], 'UNKNOWN')
                self.assertEqual(result['admission'], 'BLOCKED')


class DestinationScopedContinuityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        catalog = json.loads((ROOT / 'rules/rule-graph/task-time-metadata.v1.json').read_text())
        profile = json.loads((ROOT / 'scripts/instruction-layering-profile.json').read_text())
        task = json.loads((ROOT / 'examples/rule-graph/work-handoff.json').read_text())
        cls.contract = tt.compile_contract(catalog, profile, task, 'graph')
        cls.final = b'2026-10-07 00:02:00 UTC\nElapsed time: 2 minutes\nWork saved.\n'
        cls.readings = {'clock_start': '2026-10-07T00:00:00Z',
                        'clock_end': '2026-10-07T00:02:00Z'}
        cls.checkpoint = (FIXTURE / 'turn-end-handoff-compliant.txt').read_bytes()
        verdicts = json.loads((FIXTURE / 'turn-end-handoff.verdicts.json').read_text())
        cls.receipts = bound_receipts(cls.contract, 'final-delivery', cls.checkpoint, verdicts[1])
        cls.handoff = {'rule_id': 'uda.continuity.turn-end-handoff',
                       'obligation_id': 'save-turn-end-handoff', 'destination': DESTINATION}

    def check(self, payload, **kwargs):
        return tt.check_contract(self.contract, 'final-delivery', payload, **kwargs)

    def test_open_task_final_scoped_check_excludes_continuity_handoff(self):
        result = self.check(self.final, destination='owner-visible-final', **self.readings)
        self.assertEqual(result['admission'], 'ADMITTED')
        self.assertEqual(result['destination'], 'owner-visible-final')
        self.assertEqual(result['out_of_scope'], [self.handoff])
        self.assertEqual({r['obligation_id'] for r in result['results']},
                         {'final-first-line-timestamp', 'final-elapsed-time'})
        self.assertTrue(all(r['status'] == 'PASS' for r in result['results']))

    def test_checkpoint_scoped_check_needs_its_own_payload_receipt(self):
        result = self.check(self.checkpoint, destination=DESTINATION, receipts=self.receipts)
        self.assertEqual(result['admission'], 'ADMITTED')
        self.assertEqual(result['destination'], DESTINATION)
        self.assertEqual(len(result['results']), 1)
        self.assertEqual(result['results'][0]['obligation_id'], self.handoff['obligation_id'])
        self.assertEqual(result['results'][0]['status'], 'PASS')
        self.assertEqual(result['out_of_scope'], [
            {'rule_id': 'uda.final.timestamp', 'obligation_id': obligation,
             'destination': 'owner-visible-final'}
            for obligation in ('final-first-line-timestamp', 'final-elapsed-time')])
        for payload, receipts in ((self.checkpoint, None), (self.final, self.receipts)):
            with self.subTest(payload=payload, receipts_supplied=receipts is not None):
                blocked = self.check(payload, destination=DESTINATION, receipts=receipts)
                self.assertEqual(blocked['admission'], 'BLOCKED')
                self.assertEqual(blocked['results'][0]['status'], 'UNKNOWN')

    def test_destination_with_no_due_obligation_is_not_evaluated(self):
        result = self.check(self.final, destination='another-surface',
                            receipts=self.receipts, **self.readings)
        self.assertEqual(result['admission'], 'NOT_EVALUATED')
        self.assertEqual(result['destination'], 'another-surface')
        self.assertEqual(result['results'], [])
        self.assertEqual(len(result['out_of_scope']), 3)
        self.assertIn(self.handoff, result['out_of_scope'])

    def test_unscoped_multidestination_check_still_evaluates_every_due_obligation(self):
        result = self.check(self.final, **self.readings)
        self.assertEqual(result['admission'], 'BLOCKED')
        self.assertEqual(len(result['results']), 3)
        self.assertEqual(next(r for r in result['results']
                              if r['obligation_id'] == 'save-turn-end-handoff')['status'], 'UNKNOWN')
        self.assertNotIn('destination', result)
        self.assertNotIn('out_of_scope', result)

    def test_both_clis_scope_checks_to_their_own_payloads(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            contract, final, checkpoint, receipts = (root / name for name in
                ('contract.json', 'final.txt', 'checkpoint.txt', 'receipts.json'))
            contract.write_text(json.dumps(self.contract))
            final.write_bytes(self.final)
            checkpoint.write_bytes(self.checkpoint)
            receipts.write_text(json.dumps(self.receipts))
            for script in ('uda_rule_graph_task_time.py', 'uda_rule_graph.py'):
                for destination, payload, extra, expected in (
                    ('owner-visible-final', final, ['--clock-start', self.readings['clock_start'],
                     '--clock-end', self.readings['clock_end']], 'ADMITTED'),
                    (DESTINATION, checkpoint, ['--receipts', str(receipts)], 'ADMITTED'),
                    (DESTINATION, checkpoint, [], 'BLOCKED'),
                    ('another-surface', final, [], 'NOT_EVALUATED'),
                ):
                    with self.subTest(script=script, destination=destination, expected=expected):
                        run = subprocess.run([sys.executable, str(ROOT / 'scripts' / script),
                            'check', '--contract', str(contract), '--phase', 'final-delivery',
                            '--destination', destination, '--payload', str(payload), *extra],
                            capture_output=True, text=True, cwd=ROOT)
                        self.assertEqual(run.returncode, 0 if expected == 'ADMITTED' else 4,
                                         run.stderr or run.stdout)
                        result = json.loads(run.stdout)
                        self.assertEqual(result['admission'], expected)
                        self.assertEqual(result['destination'], destination)

    def test_readme_owner_correction_checks_final_and_checkpoint_separately(self):
        readme = (ROOT / 'examples/rule-graph/README.md').read_text()
        sections = re.split(r'^## ', readme, flags=re.MULTILINE)
        workflow = '\n'.join(section for section in sections if section.startswith((
            'Owner correction / recompile\n', 'Literal final-output check\n',
            'Durable checkpoint check\n')))
        blocks = re.findall(r'```bash\n(.*?)\n```', workflow, flags=re.DOTALL)
        checks = {}
        with tempfile.TemporaryDirectory() as directory:
            for block in blocks:
                # Run the documented workflow, isolating its temporary artifacts.
                run = subprocess.run(['bash', '-e', '-c', block.replace('/tmp/', directory + '/')],
                                     capture_output=True, text=True, cwd=ROOT)
                self.assertEqual(run.returncode, 0, run.stderr or run.stdout)
                if ' check ' in block:
                    result = json.loads(run.stdout)
                    self.assertEqual(result['admission'], 'ADMITTED')
                    checks[result['destination']] = result
        self.assertEqual(set(checks), {'owner-visible-final', DESTINATION})
        self.assertEqual({r['obligation_id'] for r in checks['owner-visible-final']['results']},
                         {'final-first-line-timestamp', 'final-elapsed-time'})
        handoff, = checks[DESTINATION]['results']
        self.assertEqual(handoff['obligation_id'], 'save-turn-end-handoff')
        self.assertEqual(handoff['binding_status'], 'RECEIPT_BINDING_VERIFIED')
        self.assertFalse(handoff['judgment_proved'])


class UsageWarningRefreshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / 'rules/rule-graph/task-time-metadata.v1.json').read_text())
        cls.profile = json.loads((ROOT / 'scripts/instruction-layering-profile.json').read_text())
        cls.task = json.loads((ROOT / 'examples/rule-graph/work-handoff.json').read_text())
        cls.payload = (FIXTURE / 'step-checkpoint-compliant.txt').read_bytes()
        cls.verdict = json.loads((FIXTURE / 'step-checkpoint.verdicts.json').read_text())[1]

    def compile(self, task, mode='graph'):
        return tt.compile_contract(self.catalog, self.profile, task, mode)

    def check(self, contract, task, receipts):
        return tt.check_contract(contract, 'persistence', self.payload, receipts=receipts,
                                 destination=DESTINATION, current_facts=task['facts'])

    def test_legacy_clis_do_not_require_facts_for_unselected_warning(self):
        with tempfile.TemporaryDirectory() as directory:
            contract_path = Path(directory) / 'contract.json'
            for script in ('uda_rule_graph_task_time.py', 'uda_rule_graph.py'):
                with self.subTest(script=script):
                    command = [sys.executable, str(ROOT / 'scripts' / script)]
                    compiled = subprocess.run(command + ['compile', '--task',
                        str(ROOT / 'examples/rule-graph/work-handoff.json'), '--mode', 'legacy',
                        '--output', str(contract_path)], capture_output=True, text=True, cwd=ROOT)
                    self.assertEqual(compiled.returncode, 0, compiled.stderr or compiled.stdout)
                    contract = json.loads(contract_path.read_text())
                    self.assertNotIn('uda.continuity.usage-warning',
                                     {r['rule_id'] for r in contract['selected_rules']})
                    for destination, expected in ((None, 'ADMITTED'), (DESTINATION, 'NOT_EVALUATED')):
                        with self.subTest(destination=destination):
                            check = command + ['check', '--contract', str(contract_path),
                                '--phase', 'persistence', '--payload',
                                str(FIXTURE / 'step-checkpoint-compliant.txt')]
                            if destination:
                                check += ['--destination', destination]
                            checked = subprocess.run(check, capture_output=True, text=True, cwd=ROOT)
                            self.assertEqual(json.loads(checked.stdout)['admission'], expected,
                                             checked.stderr or checked.stdout)
                            self.assertEqual(checked.returncode, 0 if expected == 'ADMITTED' else 4)

    def test_legacy_explicit_warning_keeps_refresh_guard(self):
        task = copy.deepcopy(self.task)
        task['legacy_rule_ids'].append('uda.continuity.usage-warning')
        contract = self.compile(task, 'legacy')
        receipts = bound_receipts(contract, 'persistence', self.payload, self.verdict)
        missing = tt.check_contract(contract, 'persistence', self.payload, receipts=receipts,
                                    destination=DESTINATION)
        self.assertEqual(missing['admission'], 'BLOCKED')
        self.assertEqual(self.check(contract, task, receipts)['admission'], 'ADMITTED')
        task['facts']['usage_warning_visible']['value'] = True
        changed = self.check(contract, task, receipts)
        self.assertEqual(changed['admission'], 'BLOCKED')
        self.assertIn('recompile', changed['reason'])

    def test_running_task_cannot_reuse_ordinary_receipt_after_warning_changes(self):
        for mode in ('flat', 'graph'):
            for initial in ({'state': 'KNOWN', 'value': False, 'provenance': 'below warning'},
                            {'state': 'ABSENT', 'provenance': 'no signal exposed'}):
                with self.subTest(mode=mode, initial=initial):
                    task = copy.deepcopy(self.task)
                    task['facts']['usage_warning_visible'] = initial
                    contract = self.compile(task, mode)
                    self.assertNotIn('uda.continuity.usage-warning',
                                     {r['rule_id'] for r in contract['selected_rules']})
                    receipts = bound_receipts(contract, 'persistence', self.payload, self.verdict)
                    self.assertEqual(self.check(contract, task, receipts)['admission'], 'ADMITTED')
                    # A new observation with unchanged state/value does not need recompilation.
                    task['facts']['usage_warning_visible']['provenance'] = 'latest observation'
                    self.assertEqual(self.check(contract, task, receipts)['admission'], 'ADMITTED')
                    task['facts']['usage_warning_visible'] = {
                        'state': 'KNOWN', 'value': True, 'provenance': 'usage now at 92%'}
                    changed = self.check(contract, task, receipts)
                    self.assertEqual(changed['admission'], 'BLOCKED')
                    self.assertIn('recompile', changed['reason'])

                    refreshed = self.compile(task, mode)
                    self.assertIn('uda.continuity.usage-warning',
                                  {r['rule_id'] for r in refreshed['selected_rules']})
                    self.assertEqual(self.check(refreshed, task, receipts)['admission'], 'BLOCKED')
                    ordinary = bound_receipts(refreshed, 'persistence', self.payload, self.verdict)
                    ordinary['receipts'] = [r for r in ordinary['receipts']
                                            if r['rule_id'] != 'uda.continuity.usage-warning']
                    blocked = self.check(refreshed, task, ordinary)
                    self.assertEqual(blocked['admission'], 'BLOCKED')
                    warning, = [r for r in blocked['results']
                                if r['rule_id'] == 'uda.continuity.usage-warning']
                    self.assertEqual(warning['status'], 'UNKNOWN')
                    payload = (FIXTURE / 'usage-warning-compliant.txt').read_bytes()
                    verdict = json.loads((FIXTURE / 'usage-warning.verdicts.json').read_text())[1]
                    checked = tt.check_contract(refreshed, 'persistence', payload,
                        receipts=bound_receipts(refreshed, 'persistence', payload, verdict),
                        destination=DESTINATION, current_facts=task['facts'])
                    self.assertEqual(checked['admission'], 'ADMITTED')

    def test_persistence_requires_current_warning_fact_even_when_rule_was_omitted(self):
        contract = self.compile(self.task)
        receipts = bound_receipts(contract, 'persistence', self.payload, self.verdict)
        missing = tt.check_contract(contract, 'persistence', self.payload, receipts=receipts,
                                    destination=DESTINATION)
        self.assertEqual(missing['admission'], 'BLOCKED')
        for observed in (None, {'state': 'UNKNOWN', 'provenance': 'signal not classified'},
                         {'state': 'ABSENT', 'provenance': 'signal no longer exposed'}):
            with self.subTest(observed=observed):
                task = copy.deepcopy(self.task)
                if observed is None:
                    task['facts'].pop('usage_warning_visible')
                else:
                    task['facts']['usage_warning_visible'] = observed
                self.assertEqual(self.check(contract, task, receipts)['admission'], 'BLOCKED')

    def test_both_clis_refresh_the_checked_work_handoff_projection(self):
        contract = json.loads((ROOT / 'tools/codex-mission-control/restored/codex-mission-control/generated/rule-graph/work-handoff-contract.json').read_text())
        receipts = bound_receipts(contract, 'persistence', self.payload, self.verdict)
        with tempfile.TemporaryDirectory() as directory:
            paths = {name: Path(directory) / name for name in
                     ('contract.json', 'task.json', 'checkpoint.txt', 'receipts.json')}
            paths['contract.json'].write_text(json.dumps(contract))
            paths['checkpoint.txt'].write_bytes(self.payload)
            paths['receipts.json'].write_text(json.dumps(receipts))
            for script in ('uda_rule_graph_task_time.py', 'uda_rule_graph.py'):
                for warning, supply_task, expected in ((False, True, 'ADMITTED'),
                                                       (True, True, 'BLOCKED'),
                                                       (False, False, 'BLOCKED')):
                    with self.subTest(script=script, warning=warning, supply_task=supply_task):
                        task = copy.deepcopy(self.task)
                        task['facts']['usage_warning_visible']['value'] = warning
                        paths['task.json'].write_text(json.dumps(task))
                        command = [sys.executable, str(ROOT / 'scripts' / script), 'check',
                            '--contract', str(paths['contract.json']), '--phase', 'persistence',
                            '--destination', DESTINATION, '--payload', str(paths['checkpoint.txt']),
                            '--receipts', str(paths['receipts.json'])]
                        if supply_task:
                            command += ['--task', str(paths['task.json'])]
                        run = subprocess.run(command, capture_output=True, text=True, cwd=ROOT)
                        self.assertEqual(run.returncode, 0 if expected == 'ADMITTED' else 4,
                                         run.stderr or run.stdout)
                        self.assertEqual(json.loads(run.stdout)['admission'], expected)


if __name__ == '__main__':
    unittest.main()
