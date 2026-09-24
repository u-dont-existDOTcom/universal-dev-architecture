import assert from 'node:assert/strict';
import test from 'node:test';

import { dispatchExecutionProvider } from '../scripts/provider-execution-dispatch.mjs';

test('real execution selector preserves the exact existing OpenAI argument object', async () => {
  const args = {
    worker: 'worker-existing',
    directive: { workExecutionProfile: { model: 'GPT_5_6_SOL' } },
    admissionInput: { opaque: true },
    missionControl: { client: true },
  };
  const expected = { status: 'EXISTING_RESULT' };
  let claudeCalls = 0;
  const result = await dispatchExecutionProvider({
    directive: args.directive,
    dispatchArguments: args,
    openAiDispatcher: async (received) => {
      assert.strictEqual(received, args);
      return expected;
    },
    claudeDispatcher: async () => {
      claudeCalls += 1;
      throw new Error('Claude must not receive an OpenAI directive.');
    },
  });
  assert.strictEqual(result, expected);
  assert.equal(claudeCalls, 0);
});

test('explicit Anthropic directive selects only the Claude handler', async () => {
  const args = { directive: { executionProvider: 'ANTHROPIC' } };
  let openAiCalls = 0;
  const expected = { receipt: { status: 'EXECUTION_REPORTED_COMPLETE' } };
  const result = await dispatchExecutionProvider({
    directive: args.directive,
    dispatchArguments: args,
    openAiDispatcher: async () => { openAiCalls += 1; },
    claudeDispatcher: async (received) => {
      assert.strictEqual(received, args);
      return expected;
    },
  });
  assert.strictEqual(result, expected);
  assert.equal(openAiCalls, 0);
});

test('unknown providers fail closed instead of silently becoming Claude', async () => {
  await assert.rejects(() => dispatchExecutionProvider({
    directive: { executionProvider: 'UNKNOWN' },
    dispatchArguments: {},
    openAiDispatcher: async () => null,
    claudeDispatcher: async () => null,
  }), /UNSUPPORTED_EXECUTION_PROVIDER/);
});
