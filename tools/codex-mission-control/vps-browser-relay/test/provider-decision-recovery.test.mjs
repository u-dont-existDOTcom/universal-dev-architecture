import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256 } from '../src/core.mjs';
import {
  CANONICAL_DECISION_PREFIX,
  extractCanonicalDecisionBlock,
  validateRecoveredDecisionObservation,
} from '../src/provider-decision-recovery.mjs';

const expected = {
  prompt: 'exact\nprovider prompt',
  promptSha256: sha256('exact\nprovider prompt'),
  requestId: 'fleet-review:1234567890abcdef1234567890abcdef',
  supervisorId: 'mc-project-manager',
  providerSessionId: 'provider-session:test',
  nonce: 'nonce:test',
  inBandBindingSha256: 'b'.repeat(64),
  evidenceCapsule: { id: 'capsule:test', sha256: 'c'.repeat(64) },
  ownerOutcome: { id: 'owner:test', epoch: 2, sha256: 'd'.repeat(64) },
  reasoningLane: 'EXTRA_HIGH_DIRECT',
};

function body(change = {}) {
  const exactText = 'Proceed with the exact bounded directive.';
  return CANONICAL_DECISION_PREFIX + JSON.stringify({
    schema_version: 5,
    envelope_kind: 'MISSION_CONTROL_CANONICAL_DECISION',
    request_id: expected.requestId,
    supervisor_id: expected.supervisorId,
    provider_session_id: expected.providerSessionId,
    nonce: expected.nonce,
    in_band_binding_sha256: expected.inBandBindingSha256,
    execution_provenance: 'IN_BAND_REQUEST_BINDING_GITHUB_OBSERVED',
    evidence_capsule: expected.evidenceCapsule,
    owner_outcome: expected.ownerOutcome,
    reasoning_lane: expected.reasoningLane,
    decision_block: { decision_id: 'decision:test', exact_text: exactText, sha256: sha256(exactText) },
    pro_decision_block: { used: false, model_mode: null, exact_text: null, sha256: null },
    writer_contract: { mode: 'EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY', reinterpretation_allowed: false },
    ...change,
  });
}

function observation(assistant = body(), user = expected.prompt) {
  return { urlMismatch: false, turns: [
    { key: 'user-turn', role: 'user', text: user },
    { key: 'assistant-turn', role: 'assistant', text: assistant },
  ] };
}

test('recovers one exact submitted-message-bound canonical decision', () => {
  const result = validateRecoveredDecisionObservation(observation(), expected);
  assert.equal(result.classification, 'VALID_DECISION_PRESENT_COPIER_FAILED');
  assert.equal(result.canonicalBody, body());
  assert.equal(result.canonicalBodySha256, sha256(body()));
});

test('normalizes only CRLF to LF for exact prompt and canonical bytes', () => {
  const result = validateRecoveredDecisionObservation(observation(body().replaceAll('\n', '\r\n'), expected.prompt.replaceAll('\n', '\r\n')), expected);
  assert.equal(result.canonicalBody, body());
});

test('classifies empty, malformed, mismatched, and ambiguous assistant recovery fail closed', () => {
  assert.throws(() => validateRecoveredDecisionObservation({ urlMismatch: false, turns: [{ key: 'u', role: 'user', text: expected.prompt }] }, expected),
    (error) => error.classification === 'EMPTY_PROVIDER_COMPLETION');
  assert.throws(() => validateRecoveredDecisionObservation(observation('not canonical'), expected),
    (error) => error.classification === 'ASSISTANT_RESPONSE_PRESENT_BUT_INVALID');
  assert.throws(() => validateRecoveredDecisionObservation(observation(body({ request_id: 'wrong' })), expected),
    (error) => error.classification === 'ASSISTANT_RESPONSE_PRESENT_BUT_INVALID');
  assert.throws(() => validateRecoveredDecisionObservation({ urlMismatch: false, turns: [
    { key: 'u', role: 'user', text: expected.prompt },
    { key: 'a1', role: 'assistant', text: body() },
    { key: 'a2', role: 'assistant', text: body() },
  ] }, expected), (error) => error.classification === 'READBACK_UNRESOLVED');
});

test('rejects truncation, altered characters, duplicate markers, and trailing content', () => {
  assert.throws(() => extractCanonicalDecisionBlock(body().slice(0, -1)), /incomplete|malformed/i);
  assert.throws(() => validateRecoveredDecisionObservation(observation(body(), expected.prompt + 'x'), expected),
    (error) => error.classification === 'READBACK_UNRESOLVED');
  assert.throws(() => extractCanonicalDecisionBlock(`${body()}\n${body()}`), /Multiple canonical/);
  assert.throws(() => extractCanonicalDecisionBlock(`${body()}\nextra`), /Content follows/);
});

test('decision identity uses exact structured equality, not display-equivalent objects', () => {
  const changed = structuredClone(expected.evidenceCapsule);
  changed.sha256 = 'e'.repeat(64);
  assert.notEqual(canonicalJson(changed), canonicalJson(expected.evidenceCapsule));
  assert.throws(() => validateRecoveredDecisionObservation(observation(body({ evidence_capsule: changed })), expected), /evidence capsule mismatch/);
});
