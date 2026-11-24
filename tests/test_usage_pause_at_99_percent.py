"""The owner's 99% usage pause rule (2026-11-24): text, routing, bindings and candidates."""
import json
import unittest
from pathlib import Path

from scripts import uda_rule_graph_task_time as tt

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'tests/fixtures/usage-limit-continuity'
PATTERN = ROOT / 'patterns/context-compaction-resilience.md'
REQUIREMENT = ROOT / 'docs/requirements/2026-11-24-pause-at-99-percent-usage.owner-requirement.json'
RULE_ID = 'uda.continuity.usage-warning'
DESTINATION = 'durable-task-checkpoint'
OWNER_STATEMENT = ('make a rule that once usage reaches 99% work is paused at a good spot with a github '
                   'handoff for my other account, unless i tell it to continue until credits run out')


def pause_paragraph():
    source = PATTERN.read_text()
    section = source.split('#### Usage limits and account switches\n\n', 1)[1].split('\n### 4.', 1)[0]
    paragraphs = [p for p in section.split('\n\n') if p.startswith('At 99% usage,')]
    assert len(paragraphs) == 1, paragraphs
    return paragraphs[0]


def contract_at_99(rule_ids=(RULE_ID,)):
    catalog = json.loads((ROOT / 'rules/rule-graph/task-time-metadata.v1.json').read_text())
    catalog['records'] = [r for r in catalog['records'] if r['rule_id'] in rule_ids]
    profile = json.loads((ROOT / 'scripts/instruction-layering-profile.json').read_text())
    task = json.loads((FIXTURE / 'task.json').read_text())
    task['facts']['usage_warning_visible'] = {
        'state': 'KNOWN', 'value': True, 'provenance': 'visible usage meter at 99% in this fixture'}
    return tt.compile_contract(catalog, profile, task, 'graph'), task


class UsagePauseAt99PercentTests(unittest.TestCase):
    def test_pattern_states_the_pause_its_exception_and_its_signal(self):
        paragraph = pause_paragraph()
        for phrase in ('pause the work at a good stopping point',
                       'unless the owner has said to continue until the credits run out',
                       'The signal must be visible', 'never guess usage', 'start no new step',
                       'commit the unfinished part as work in progress', 'never discard it', 'Push the work',
                       'end the turn with the turn-end handoff above',
                       'continues in another account from GitHub with one line',
                       'patterns/cross-account-continuity.md',
                       'the outcome stays OPEN',
                       'keep working with the continuous saves above'):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, paragraph)

    def test_pause_does_not_replace_continuous_saving(self):
        source = PATTERN.read_text()
        self.assertIn('Never defer saving to a usage threshold.', source)
        self.assertLess(source.index('This warning supplements continuous checkpoints'),
                        source.index('At 99% usage, pause the work'))
        self.assertIn('At 99% visible usage, pause at a good stopping point with that handoff, '
                      'unless the owner said to continue until the credits run out.', source)

    def test_index_routes_the_pause(self):
        index = (ROOT / 'LESSON-INDEX.md').read_text()
        entry = next(line for line in index.splitlines()
                     if line.startswith('4. `patterns/context-compaction-resilience.md`'))
        self.assertIn('pause at a good stopping point with a GitHub handoff', entry)
        self.assertIn('99%', entry)
        self.assertIn('continue until the credits run out', entry)

    def test_rule_records_bind_the_exact_new_text(self):
        records = {r['rule_id']: r for r in
                   json.loads((ROOT / 'rules/rule-graph/task-time-metadata.v1.json').read_text())['records']}
        warning = records[RULE_ID]
        self.assertEqual(warning['revision'], 5)
        self.assertIn(pause_paragraph(), [s['text'] for s in warning['source']['selectors']])
        obligation = warning['obligations'][0]
        self.assertIn('At 99% visible usage', obligation['required_behavior'])
        self.assertIn('continue until the credits run out', obligation['required_behavior'])
        self.assertIn('a guessed 99% usage level', obligation['non_substitutes'])
        self.assertIn('pausing at 99% when the owner said to continue until the credits run out',
                      obligation['non_substitutes'])
        portable = records['uda.compaction.portable-instruction']
        self.assertEqual(portable['revision'], 3)
        self.assertIn('At 99% visible usage, pause at a good stopping point with that handoff, '
                      'unless the owner said to continue until the credits run out.',
                      [s['text'] for s in portable['source']['selectors']])

    def test_compiled_rule_carries_the_pause_text(self):
        contract, _ = contract_at_99()
        self.assertEqual([r['rule_id'] for r in contract['selected_rules']], [RULE_ID])
        self.assertIn(pause_paragraph(), contract['selected_rules'][0]['source_text'])
        self.assertEqual(contract['unresolved'], [])

    def test_candidates(self):
        contract, task = contract_at_99()
        cases = json.loads((FIXTURE / 'usage-pause.verdicts.json').read_text())
        self.assertEqual([c['case'] for c in cases], ['violating', 'compliant', 'near-miss', 'owner-continue'])
        for case in cases:
            with self.subTest(candidate=case['case']):
                self.assertEqual(set(case), {'case', 'payload', 'verdict', 'evidence'})
                payload = (FIXTURE / case['payload']).read_bytes()
                receipts = tt.receipt_skeleton(contract, 'persistence', payload)
                for receipt in receipts['receipts']:
                    receipt.update(verdict=case['verdict'], evidence=case['evidence'],
                                   actor={'id': 'usage-pause-regression', 'kind': 'fixture',
                                          'relation': 'SAME_AGENT'},
                                   issued_at='2026-11-24T00:00:00Z')
                result = tt.check_contract(contract, 'persistence', payload, receipts=receipts,
                                           destination=DESTINATION, current_task=task)
                expected = 'PASS' if case['case'] in ('compliant', 'owner-continue') else 'FAIL'
                self.assertEqual(case['verdict'], expected)
                self.assertEqual(result['results'][0]['status'], expected)
                self.assertEqual(result['admission'], 'ADMITTED' if expected == 'PASS' else 'BLOCKED')
                self.assertFalse(result['results'][0]['judgment_proved'])

    def test_fixtures_name_the_signal_and_the_exception(self):
        compliant = (FIXTURE / 'usage-pause-compliant.txt').read_text()
        self.assertIn('99%', compliant)
        self.assertIn('Outcome: OPEN.', compliant)
        self.assertIn('Resume in another account', compliant)
        self.assertIn('continue until the credits run out',
                      (FIXTURE / 'usage-pause-owner-continue.txt').read_text())
        portable = ROOT / 'tests/fixtures/continuation-closure-slice/uda.compaction.portable-instruction'
        self.assertIn('the 99% pause at a good stopping point', (portable / 'compliant.txt').read_text())
        self.assertIn('the 99% pause at a good stopping point',
                      json.loads((portable / 'verdicts.json').read_text())['compliant.txt']['evidence'])

    def test_requirement_preserves_the_owner_statement(self):
        requirement = json.loads(REQUIREMENT.read_text())
        self.assertEqual(requirement['owner_statement'], OWNER_STATEMENT)
        self.assertEqual(requirement['origin']['classification'], 'OWNER_REQUIRED')
        self.assertEqual(requirement['origin']['mechanism']['classification'], 'ASSISTANT_INFERENCE')
        self.assertTrue(any('does not fire' in claim for claim in requirement['nonclaims']))


if __name__ == '__main__':
    unittest.main()
