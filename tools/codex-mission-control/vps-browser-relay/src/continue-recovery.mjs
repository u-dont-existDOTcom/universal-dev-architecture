import { canonicalJson, sha256 } from './core.mjs';

export const CONTINUE_RECOVERY_SCHEMA_VERSION = 1;

export function createContinueRecoveryAnchor(observation) {
  const turns = normalizeTurns(observation);
  if (turns.length === 0) throw new Error('CONTINUE_RECOVERY_TURN_STRUCTURE_MISSING.');
  const structuralTurns = turns.map(({ key, role }) => ({ key, role }));
  return {
    schemaVersion: CONTINUE_RECOVERY_SCHEMA_VERSION,
    structuralTurns,
    structuralSha256: sha256(canonicalJson(structuralTurns)),
    capturedAt: new Date().toISOString(),
    assistantContentObserved: false,
  };
}

export function classifyFailedContinueRetry(anchor, observation) {
  validateAnchor(anchor);
  const turns = normalizeTurns(observation);
  const prior = anchor.structuralTurns;
  if (turns.length < prior.length) throw new Error('CONTINUE_RETRY_ANCESTRY_AMBIGUOUS: prior structural turns disappeared.');
  for (let index = 0; index < prior.length; index += 1) {
    if (turns[index].key !== prior[index].key || turns[index].role !== prior[index].role) {
      throw new Error('CONTINUE_RETRY_ANCESTRY_AMBIGUOUS: prior structural turn order changed.');
    }
  }
  const added = turns.slice(prior.length);
  if (added.length !== 2 || added[0].role !== 'user' || added[1].role !== 'assistant') {
    throw new Error('CONTINUE_RETRY_ANCESTRY_AMBIGUOUS: exact continue user/assistant turn pair is not uniquely established.');
  }
  const retryControls = added[1].retryControls;
  if (retryControls.length === 0) {
    return {
      status: 'CONTINUE_TURN_COMPLETE_NO_RETRY',
      continueUserTurnKey: added[0].key,
      assistantTurnKey: added[1].key,
      assistantContentObserved: false,
    };
  }
  if (retryControls.length !== 1) {
    throw new Error('CONTINUE_RETRY_CONTROL_AMBIGUOUS: exact failed continue turn exposes multiple Retry controls.');
  }
  const control = retryControls[0];
  if (!['Retry', 'Try again'].includes(control.label)) {
    throw new Error('CONTINUE_RETRY_CONTROL_AMBIGUOUS: retry control label is not exact.');
  }
  const binding = {
    schemaVersion: CONTINUE_RECOVERY_SCHEMA_VERSION,
    anchorStructuralSha256: anchor.structuralSha256,
    continueUserTurnKey: added[0].key,
    failedAssistantTurnKey: added[1].key,
    controlLabel: control.label,
  };
  return {
    status: 'RETRY_FAILED_CONTINUE',
    binding,
    bindingSha256: sha256(canonicalJson(binding)),
    assistantContentObserved: false,
  };
}

export function validateContinueRetryBinding(anchor, binding, observation) {
  const classified = classifyFailedContinueRetry(anchor, observation);
  if (classified.status !== 'RETRY_FAILED_CONTINUE'
    || canonicalJson(classified.binding) !== canonicalJson(binding)) {
    throw new Error('CONTINUE_RETRY_BINDING_CHANGED_OR_MISSING.');
  }
  return classified;
}

function validateAnchor(anchor) {
  if (!anchor || anchor.schemaVersion !== CONTINUE_RECOVERY_SCHEMA_VERSION
    || !Array.isArray(anchor.structuralTurns) || anchor.structuralTurns.length === 0
    || !/^[0-9a-f]{64}$/.test(anchor.structuralSha256 ?? '')
    || sha256(canonicalJson(anchor.structuralTurns)) !== anchor.structuralSha256) {
    throw new Error('CONTINUE_RECOVERY_ANCHOR_INVALID.');
  }
}

function normalizeTurns(observation) {
  if (!observation || observation.urlMismatch === true || !Array.isArray(observation.turns)) {
    throw new Error('CONTINUE_RECOVERY_TURN_STRUCTURE_UNAVAILABLE.');
  }
  const seen = new Set();
  return observation.turns.map((turn) => {
    if (!turn || typeof turn.key !== 'string' || turn.key.trim() === ''
      || !['user', 'assistant'].includes(turn.role) || seen.has(turn.key)
      || !Array.isArray(turn.retryControls)
      || turn.retryControls.some((control) => !control || typeof control.label !== 'string')) {
      throw new Error('CONTINUE_RECOVERY_TURN_STRUCTURE_AMBIGUOUS.');
    }
    seen.add(turn.key);
    return {
      key: turn.key,
      role: turn.role,
      retryControls: turn.retryControls.map(({ label }) => ({ label })),
    };
  });
}
