import { canonicalJson, sha256 } from './core.mjs';

export const CANONICAL_DECISION_PREFIX = 'MISSION_CONTROL_CANONICAL_DECISION_V1\n';

export function normalizeProviderText(value) {
  if (typeof value !== 'string') throw new Error('Provider turn text must be a string.');
  return value.replace(/\r\n?/g, '\n');
}

export function extractCanonicalDecisionBlock(assistantText) {
  const text = normalizeProviderText(assistantText);
  const first = text.indexOf(CANONICAL_DECISION_PREFIX);
  if (first < 0) throw recoveryError('ASSISTANT_RESPONSE_PRESENT_BUT_INVALID', 'Canonical decision marker is missing.');
  if (text.indexOf(CANONICAL_DECISION_PREFIX, first + CANONICAL_DECISION_PREFIX.length) >= 0) {
    throw recoveryError('ASSISTANT_RESPONSE_PRESENT_BUT_INVALID', 'Multiple canonical decision markers are present.');
  }
  const jsonStart = first + CANONICAL_DECISION_PREFIX.length;
  const jsonEnd = jsonObjectEnd(text, jsonStart);
  if (text.slice(jsonEnd).trim() !== '') {
    throw recoveryError('ASSISTANT_RESPONSE_PRESENT_BUT_INVALID', 'Content follows the canonical decision JSON.');
  }
  const body = text.slice(first, jsonEnd);
  let decision;
  try { decision = JSON.parse(text.slice(jsonStart, jsonEnd)); }
  catch { throw recoveryError('ASSISTANT_RESPONSE_PRESENT_BUT_INVALID', 'Canonical decision JSON is malformed.'); }
  return { body, bodySha256: sha256(body), decision };
}

export function validateRecoveredDecisionObservation(observation, expected) {
  if (!observation || observation.urlMismatch) throw recoveryError('READBACK_UNRESOLVED', 'Bound provider conversation URL is not available.');
  if (!Array.isArray(observation.turns)) throw recoveryError('READBACK_UNRESOLVED', 'Provider turn structure is unavailable.');
  const prompt = normalizeProviderText(expected.prompt);
  if (sha256(prompt) !== expected.promptSha256) throw new Error('Locally reconstructed provider prompt hash does not match the frozen pre-send hash.');
  const candidates = observation.turns.filter((turn) => turn.role === 'user'
    && typeof turn.text === 'string' && sha256(normalizeProviderText(turn.text)) === expected.promptSha256);
  if (candidates.length !== 1) {
    throw recoveryError('READBACK_UNRESOLVED', `Expected exactly one exact submitted user turn; found ${candidates.length}.`);
  }
  const userIndex = observation.turns.indexOf(candidates[0]);
  const following = [];
  for (let index = userIndex + 1; index < observation.turns.length; index += 1) {
    const turn = observation.turns[index];
    if (turn.role === 'user') break;
    if (turn.role === 'assistant') following.push(turn);
  }
  if (following.length === 0) throw recoveryError('EMPTY_PROVIDER_COMPLETION', 'The exact submitted request has no assistant turn.');
  if (following.length !== 1) throw recoveryError('READBACK_UNRESOLVED', `The exact submitted request has ${following.length} candidate assistant turns.`);
  const assistant = following[0];
  if (typeof assistant.text !== 'string' || normalizeProviderText(assistant.text).trim() === '') {
    throw recoveryError('EMPTY_PROVIDER_COMPLETION', 'The exact assistant turn is empty.');
  }
  const canonical = extractCanonicalDecisionBlock(assistant.text);
  validateDecision(canonical.decision, expected);
  return {
    classification: 'VALID_DECISION_PRESENT_COPIER_FAILED',
    canonicalBody: canonical.body,
    canonicalBodySha256: canonical.bodySha256,
    userTurnKeySha256: sha256(String(candidates[0].key ?? '')),
    assistantTurnKeySha256: sha256(String(assistant.key ?? '')),
  };
}

function validateDecision(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('Canonical decision must be an object.');
  const pairs = [
    ['schema_version', 5],
    ['envelope_kind', 'MISSION_CONTROL_CANONICAL_DECISION'],
    ['request_id', expected.requestId],
    ['supervisor_id', expected.supervisorId],
    ['provider_session_id', expected.providerSessionId],
    ['nonce', expected.nonce],
    ['in_band_binding_sha256', expected.inBandBindingSha256],
    ['execution_provenance', 'IN_BAND_REQUEST_BINDING_GITHUB_OBSERVED'],
    ['reasoning_lane', expected.reasoningLane],
  ];
  for (const [field, wanted] of pairs) if (value[field] !== wanted) throw invalid(`Canonical decision ${field} mismatch.`);
  if (canonicalJson(value.evidence_capsule) !== canonicalJson(expected.evidenceCapsule)) throw invalid('Canonical decision evidence capsule mismatch.');
  if (canonicalJson(value.owner_outcome) !== canonicalJson(expected.ownerOutcome)) throw invalid('Canonical decision owner outcome mismatch.');
  if (!value.decision_block || typeof value.decision_block.exact_text !== 'string'
    || value.decision_block.sha256 !== sha256(value.decision_block.exact_text)) throw invalid('Canonical decision block digest mismatch.');
  if (!value.writer_contract || value.writer_contract.mode !== 'EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY'
    || value.writer_contract.reinterpretation_allowed !== false) throw invalid('Canonical decision writer contract mismatch.');
}

function jsonObjectEnd(text, start) {
  let index = start;
  while (/\s/.test(text[index] ?? '')) index += 1;
  if (text[index] !== '{') throw invalid('Canonical decision JSON must be one object.');
  let depth = 0, inString = false, escaped = false;
  for (; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return index + 1;
  }
  throw invalid('Canonical decision JSON is incomplete.');
}

function invalid(message) {
  return recoveryError('ASSISTANT_RESPONSE_PRESENT_BUT_INVALID', message);
}

export function recoveryError(classification, message) {
  const error = new Error(message);
  error.code = 'PROVIDER_DECISION_RECOVERY_FAILED';
  error.classification = classification;
  return error;
}
