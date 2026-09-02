import assert from 'node:assert/strict';
import test from 'node:test';
import { installStuckRecovery, isGenerationStallTimeout } from '../src/stuck-recovery.mjs';
import { sha256 } from '../src/core.mjs';

test('recognizes only the stable-generation timeout as recoverable', () => {
  assert.equal(isGenerationStallTimeout(new Error('ChatGPT generation did not reach a stable complete UI state.')), true);
  assert.equal(isGenerationStallTimeout(new Error('ChatGPT login is required')), false);
});

test('any model turn that times out gets same-chat continue and then resumes waiting', async () => {
  let waits = 0;
  const submissions = [];
  const browser = {
    async waitForGenerationComplete() {
      waits += 1;
      if (waits === 1) throw new Error('ChatGPT generation did not reach a stable complete UI state.');
      return { status: 'GENERATION_COMPLETE', completedAtObserved: '2026-09-02T17:00:00.000Z', inspectedAssistantOutput: false };
    },
    async submitExactMessage(target, input) {
      submissions.push({ target, input });
      return { generationStarted: true, startedAtObserved: '2026-09-02T16:59:00.000Z' };
    },
  };
  installStuckRecovery(browser, {
    maxNudges: 3,
    logger: { warn() {} },
    stopStalledGeneration: async () => ({ stoppedGeneration: true, inspectedAssistantOutput: false }),
  });

  const result = await browser.waitForGenerationComplete({ id: 'chat-target' }, {
    expectedUrl: 'https://chatgpt.com/c/example',
    generationStarted: true,
  });

  assert.equal(waits, 2);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].input.body, 'continue');
  assert.equal(submissions[0].input.bodySha256, sha256('continue'));
  assert.equal(result.stuckRecovery.nudgesSent, 1);
  assert.equal(result.stuckRecovery.recoveries[0].modelChanged, false);
  assert.equal(result.stuckRecovery.inspectedAssistantOutput, false);
});

test('repeated stalls recover up to the configured ceiling and then fail closed', async () => {
  let waits = 0;
  let submissions = 0;
  const browser = {
    async waitForGenerationComplete() {
      waits += 1;
      throw new Error('ChatGPT generation did not reach a stable complete UI state.');
    },
    async submitExactMessage() {
      submissions += 1;
      return { generationStarted: true, startedAtObserved: `2026-09-02T17:0${submissions}:00.000Z` };
    },
  };
  installStuckRecovery(browser, {
    maxNudges: 3,
    logger: { warn() {} },
    stopStalledGeneration: async () => ({ stoppedGeneration: true, inspectedAssistantOutput: false }),
  });

  await assert.rejects(
    browser.waitForGenerationComplete({ id: 'pro-target' }, { expectedUrl: 'https://chatgpt.com/c/pro', generationStarted: true }),
    /stable complete UI state/,
  );
  assert.equal(waits, 4);
  assert.equal(submissions, 3);
});

test('non-stall failures are never converted into continue messages', async () => {
  let submissions = 0;
  const browser = {
    async waitForGenerationComplete() { throw new Error('ChatGPT login is required in the VPS browser profile.'); },
    async submitExactMessage() { submissions += 1; },
  };
  installStuckRecovery(browser, {
    maxNudges: 3,
    logger: { warn() {} },
    stopStalledGeneration: async () => ({ stoppedGeneration: true }),
  });
  await assert.rejects(
    browser.waitForGenerationComplete({ id: 'x' }, { expectedUrl: 'https://chatgpt.com/c/x', generationStarted: true }),
    /login is required/,
  );
  assert.equal(submissions, 0);
});
