import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyFailedContinueRetry,
  createContinueRecoveryAnchor,
  validateContinueRetryBinding,
} from '../src/continue-recovery.mjs';

const prior = [
  { key: 'original-user', role: 'user', retryControls: [] },
  { key: 'original-assistant', role: 'assistant', retryControls: [{ label: 'Retry' }] },
];

test('Retry is bound only to the assistant turn created after the persisted continue anchor', () => {
  const anchor = createContinueRecoveryAnchor({ turns: prior });
  const observation = { turns: [
    ...prior,
    { key: 'continue-user', role: 'user', retryControls: [] },
    { key: 'continue-assistant', role: 'assistant', retryControls: [{ label: 'Retry' }] },
  ] };
  const result = classifyFailedContinueRetry(anchor, observation);
  assert.equal(result.status, 'RETRY_FAILED_CONTINUE');
  assert.equal(result.binding.continueUserTurnKey, 'continue-user');
  assert.equal(result.binding.failedAssistantTurnKey, 'continue-assistant');
  assert.equal(result.binding.controlLabel, 'Retry');
  assert.equal(result.assistantContentObserved, false);
  assert.deepEqual(validateContinueRetryBinding(anchor, result.binding, observation), result);
});

test('a Retry on the original semantic turn is never sufficient before continue', () => {
  const anchor = createContinueRecoveryAnchor({ turns: prior });
  assert.throws(
    () => classifyFailedContinueRetry(anchor, { turns: prior }),
    /exact continue user\/assistant turn pair is not uniquely established/,
  );
});

test('successful continue has no Retry transport action', () => {
  const anchor = createContinueRecoveryAnchor({ turns: prior });
  const result = classifyFailedContinueRetry(anchor, { turns: [
    ...prior,
    { key: 'continue-user', role: 'user', retryControls: [] },
    { key: 'continue-assistant', role: 'assistant', retryControls: [] },
  ] });
  assert.equal(result.status, 'CONTINUE_TURN_COMPLETE_NO_RETRY');
  assert.equal(result.assistantContentObserved, false);
});

test('ambiguous ancestry or generic Retry controls fail closed', () => {
  const anchor = createContinueRecoveryAnchor({ turns: prior });
  assert.throws(() => classifyFailedContinueRetry(anchor, { turns: [
    ...prior,
    { key: 'continue-user', role: 'user', retryControls: [] },
  ] }), /ANCESTRY_AMBIGUOUS/);
  assert.throws(() => classifyFailedContinueRetry(anchor, { turns: [
    ...prior,
    { key: 'continue-user', role: 'user', retryControls: [] },
    { key: 'continue-assistant', role: 'assistant', retryControls: [{ label: 'Retry' }, { label: 'Try again' }] },
  ] }), /CONTROL_AMBIGUOUS/);
  assert.throws(() => classifyFailedContinueRetry(anchor, { turns: [
    { ...prior[0], key: 'changed-original' },
    prior[1],
    { key: 'continue-user', role: 'user', retryControls: [] },
    { key: 'continue-assistant', role: 'assistant', retryControls: [{ label: 'Retry' }] },
  ] }), /ANCESTRY_AMBIGUOUS/);
});
