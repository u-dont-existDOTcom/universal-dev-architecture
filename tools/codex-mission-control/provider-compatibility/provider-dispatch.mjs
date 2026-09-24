import { createHash } from 'node:crypto';
import { delegateExistingOpenAI } from './compatibility.mjs';
import { CLAUDE_PROVIDER_BINDING, dispatchClaudeMissionControlExecution } from './host-transport.mjs';

export const EXECUTION_PROVIDER = Object.freeze({ OPENAI: 'OPENAI', ANTHROPIC: 'ANTHROPIC' });

export function isClaudeProviderBinding(value) {
  return value?.provider === CLAUDE_PROVIDER_BINDING.provider
    && value?.surface === CLAUDE_PROVIDER_BINDING.surface
    && value?.role === CLAUDE_PROVIDER_BINDING.role
    && Object.keys(value).length === 3;
}

export function classifyExecutionProvider(directive) {
  const binding = directive?.executionProviderBinding ?? null;
  if (binding === null) return EXECUTION_PROVIDER.OPENAI;
  if (isClaudeProviderBinding(binding)) return EXECUTION_PROVIDER.ANTHROPIC;
  throw new Error('UNSUPPORTED_EXECUTION_PROVIDER_BINDING');
}

/** Digest all Claude execution semantics while replacing the self-referential digest field with null. */
export function claudeDirectiveArtifactSha256(directive) {
  if (classifyExecutionProvider(directive) !== EXECUTION_PROVIDER.ANTHROPIC) {
    throw new Error('CLAUDE_DIRECTIVE_REQUIRED');
  }
  const request = directive?.claudeExecutionRequest;
  if (!request?.binding || typeof request.binding !== 'object') throw new Error('CLAUDE_EXECUTION_REQUEST_REQUIRED');
  const normalizedRequest = structuredClone(request);
  normalizedRequest.binding.directiveSha256 = null;
  return createHash('sha256').update(canonicalJson({
    schemaVersion: directive?.schemaVersion ?? null,
    sourceDirective: directive?.sourceDirective ?? null,
    executionProviderBinding: directive.executionProviderBinding,
    claudeExecutionRequest: normalizedRequest,
  }), 'utf8').digest('hex');
}

/** This is the exact provider-selection seam used by the existing execution runner. */
export async function dispatchAtProviderEntrypoint({
  directive,
  existingOpenAIArguments,
  existingOpenAIHandler,
  claudeHandler = null,
}) {
  const provider = classifyExecutionProvider(directive);
  if (provider === EXECUTION_PROVIDER.OPENAI) {
    return delegateExistingOpenAI(existingOpenAIHandler, existingOpenAIArguments);
  }
  const request = directive?.claudeExecutionRequest;
  if (!request?.binding) throw new Error('CLAUDE_EXECUTION_REQUEST_REQUIRED');
  const computed = claudeDirectiveArtifactSha256(directive);
  if (request.binding.directiveSha256 !== computed) throw new Error('CLAUDE_DIRECTIVE_ARTIFACT_MISMATCH');
  if (typeof claudeHandler !== 'function') throw new Error('CLAUDE_DISPATCHER_REQUIRED');
  return claudeHandler(request);
}

export async function dispatchExecutionProvider({
  originalArguments,
  existingOpenAIDispatcher,
  claudeDispatcher = dispatchClaudeMissionControlExecution,
}) {
  return dispatchAtProviderEntrypoint({
    directive: originalArguments?.directive,
    existingOpenAIArguments: originalArguments,
    existingOpenAIHandler: existingOpenAIDispatcher,
    claudeHandler: (request) => claudeDispatcher({
      worker: originalArguments.worker,
      admissionInput: originalArguments.admissionInput,
      request,
      missionControl: originalArguments.missionControl,
      claudeBinary: originalArguments.config?.claudeBinary ?? 'claude',
      environment: originalArguments.config?.environment ?? process.env,
      spawnImpl: originalArguments.spawnImpl,
    }),
  });
}

function canonicalJson(value) { return JSON.stringify(sortValue(value)); }
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortValue(child)]));
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Canonical JSON cannot encode non-finite number.');
  return value;
}
