import assert from 'node:assert/strict';
import test from 'node:test';
import { installStuckRecovery, isGenerationStallTimeout } from '../src/stuck-recovery.mjs';
import { sha256 } from '../src/core.mjs';

const noRecoverableControl = async () => ({ recoverable: false, controlLabel: null });

test('recognizes only the stable-generation timeout as recoverable', () => {
  assert.equal(isGenerationStallTimeout(new Error('ChatGPT generation did not reach a stable complete UI state.')), true);
  assert.equal(isGenerationStallTimeout(new Error('ChatGPT login is required')), false);
});

test('any model turn that remains actively generating gets same-chat continue and then resumes waiting', async () => {
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
    inspectRecoverableControl: noRecoverableControl,
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
  assert.equal(result.stuckRecovery.recoveries[0].source, 'ACTIVE_GENERATION_TIMEOUT');
  assert.equal(result.stuckRecovery.recoveries[0].modelChanged, false);
  assert.equal(result.stuckRecovery.inspectedAssistantOutput, false);
});

test('idle Continue or Retry UI controls are treated as unfinished without reading assistant output', async () => {
  let waits = 0;
  let inspections = 0;
  const submissions = [];
  const browser = {
    async waitForGenerationComplete() {
      waits += 1;
      return { status: 'GENERATION_COMPLETE', completedAtObserved: `2026-09-02T17:0${waits}:00.000Z`, inspectedAssistantOutput: false };
    },
    async submitExactMessage(target, input) {
      submissions.push({ target, input });
      return { generationStarted: true, startedAtObserved: '2026-09-02T17:01:30.000Z' };
    },
  };
  installStuckRecovery(browser, {
    maxNudges: 3,
    logger: { warn() {} },
    stopStalledGeneration: async () => ({ stoppedGeneration: true }),
    inspectRecoverableControl: async () => {
      inspections += 1;
      return inspections === 1
        ? { recoverable: true, controlLabel: 'Continue generating' }
        : { recoverable: false, controlLabel: null };
    },
  });

  const result = await browser.waitForGenerationComplete({ id: 'idle-stuck-target' }, {
    expectedUrl: 'https://chatgpt.com/c/idle-stuck',
    generationStarted: true,
  });

  assert.equal(waits, 2);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].input.body, 'continue');
  assert.equal(result.stuckRecovery.recoveries[0].source, 'RECOVERABLE_UI_CONTROL');
  assert.equal(result.stuckRecovery.recoveries[0].observedControl, 'Continue generating');
  assert.equal(result.stuckRecovery.recoveries[0].modelChanged, false);
  assert.equal(result.stuckRecovery.inspectedAssistantOutput, false);
});

test('repeated active stalls recover up to the configured ceiling and then fail closed', async () => {
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
    inspectRecoverableControl: noRecoverableControl,
  });

  await assert.rejects(
    browser.waitForGenerationComplete({ id: 'pro-target' }, { expectedUrl: 'https://chatgpt.com/c/pro', generationStarted: true }),
    /stable complete UI state/,
  );
  assert.equal(waits, 4);
  assert.equal(submissions, 3);
});

test('repeated idle recoverable controls also stop at the configured ceiling', async () => {
  let submissions = 0;
  const browser = {
    async waitForGenerationComplete() {
      return { status: 'GENERATION_COMPLETE', completedAtObserved: '2026-09-02T17:00:00.000Z', inspectedAssistantOutput: false };
    },
    async submitExactMessage() {
      submissions += 1;
      return { generationStarted: true, startedAtObserved: `2026-09-02T17:0${submissions}:00.000Z` };
    },
  };
  installStuckRecovery(browser, {
    maxNudges: 2,
    logger: { warn() {} },
    stopStalledGeneration: async () => ({ stoppedGeneration: true }),
    inspectRecoverableControl: async () => ({ recoverable: true, controlLabel: 'Retry' }),
  });
  await assert.rejects(
    browser.waitForGenerationComplete({ id: 'retry-target' }, { expectedUrl: 'https://chatgpt.com/c/retry', generationStarted: true }),
    /persisted after 2 continue nudges/,
  );
  assert.equal(submissions, 2);
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
    inspectRecoverableControl: noRecoverableControl,
  });
  await assert.rejects(
    browser.waitForGenerationComplete({ id: 'x' }, { expectedUrl: 'https://chatgpt.com/c/x', generationStarted: true }),
    /login is required/,
  );
  assert.equal(submissions, 0);
});
