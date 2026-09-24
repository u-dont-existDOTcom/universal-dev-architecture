import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeDirectiveArtifactSha256, dispatchExecutionProvider } from '../provider-dispatch.mjs';

test('runner provider seam preserves the exact existing OpenAI argument object and result identity', async () => {
  const originalArguments = { directive: { jobId: 'existing-openai-job' }, missionControl: { opaque: true }, setterEvidenceId: 'setter:1' };
  const result = { status: 'EXISTING_RESULT' };
  let calls = 0;
  const returned = await dispatchExecutionProvider({ originalArguments,
    existingOpenAIDispatcher(input) { calls += 1; assert.strictEqual(input, originalArguments); return result; },
    claudeDispatcher() { throw new Error('Claude path must not run'); } });
  assert.equal(calls, 1); assert.strictEqual(returned, result);
});

test('runner provider seam selects Claude only for the exact explicit binding', async () => {
  const directive = { executionProviderBinding: { provider: 'ANTHROPIC', surface: 'CLAUDE_CODE_CLI', role: 'EXECUTION' },
    claudeExecutionRequest: { binding: { directiveSha256: '0'.repeat(64) }, marker: 'request' } };
  directive.claudeExecutionRequest.binding.directiveSha256 = claudeDirectiveArtifactSha256(directive);
  const originalArguments = { worker: 'worker-x', admissionInput: { request: {} }, missionControl: {}, config: {}, directive };
  let openAiCalls = 0;
  const returned = await dispatchExecutionProvider({ originalArguments,
    existingOpenAIDispatcher() { openAiCalls += 1; },
    claudeDispatcher(input) { assert.equal(input.request.marker, 'request'); return { status: 'CLAUDE_SELECTED' }; } });
  assert.equal(openAiCalls, 0); assert.equal(returned.status, 'CLAUDE_SELECTED');
});

test('unknown provider binding never silently falls back to Claude or OpenAI', async () => {
  const originalArguments = { directive: { executionProviderBinding: { provider: 'OTHER', surface: 'CLI', role: 'EXECUTION' } } };
  await assert.rejects(() => dispatchExecutionProvider({ originalArguments,
    existingOpenAIDispatcher() { throw new Error('must not run'); }, claudeDispatcher() { throw new Error('must not run'); } }),
  /UNSUPPORTED_EXECUTION_PROVIDER_BINDING/);
});

test('Claude request bytes are bound to the directive artifact digest before dispatch', async () => {
  const directive = { executionProviderBinding: { provider: 'ANTHROPIC', surface: 'CLAUDE_CODE_CLI', role: 'EXECUTION' },
    claudeExecutionRequest: { binding: { directiveSha256: '0'.repeat(64) }, instruction: 'authorized' } };
  directive.claudeExecutionRequest.binding.directiveSha256 = claudeDirectiveArtifactSha256(directive);
  directive.claudeExecutionRequest.instruction = 'mutated-after-authorization';
  await assert.rejects(() => dispatchExecutionProvider({ originalArguments: { directive },
    existingOpenAIDispatcher() { throw new Error('must not run'); }, claudeDispatcher() { throw new Error('must not run'); } }),
  /CLAUDE_DIRECTIVE_ARTIFACT_MISMATCH/);
});
