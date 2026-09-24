import assert from 'node:assert/strict';
import test from 'node:test';
import { installStuckRecovery, isConnectionInterrupted, isGenerationStallTimeout, isProgressHeartbeatStall, isSystemsThinkingMoreThanUsual } from '../src/stuck-recovery.mjs';
import { sha256 } from '../src/core.mjs';
import { defaultState } from '../src/core.mjs';
import { GlobalSubmissionPacer, GLOBAL_SUBMISSION_COOLDOWN } from '../src/submission-pacing.mjs';

const noRecoverableControl = async () => ({ recoverable: false, controlLabel: null });

test('recognizes only the stable-generation timeout as recoverable', () => {
  assert.equal(isGenerationStallTimeout(new Error('ChatGPT generation did not reach a stable complete UI state.')), true);
  assert.equal(isGenerationStallTimeout(new Error('ChatGPT login is required')), false);
});

test('mandatory external-tool stages disable generic same-chat recovery without the exact systems-thinking signal', async () => {
  let submits = 0;
  const browser = {
    async waitForGenerationComplete() {
      throw new Error('ChatGPT generation did not reach a stable complete UI state.');
    },
    async submitExactMessage() { submits += 1; },
  };
  installStuckRecovery(browser, {
    submitMessage: (target, input) => browser.submitExactMessage(target, input),
    stopStalledGeneration: async () => ({ stoppedGeneration: true, inspectedAssistantOutput: false }),
    inspectRecoverableControl: noRecoverableControl,
  });
  await assert.rejects(
    () => browser.waitForGenerationComplete({ id: 'mandatory-tool-stage' }, {
      expectedUrl: 'https://chatgpt.com/c/mandatory-tool-stage', generationStarted: true, allowSameChatRecovery: false,
    }),
    /stable complete UI state/,
  );
  assert.equal(submits, 0);
});

test('mandatory external-tool stages suppress structural progress-stall recovery', async () => {
  let submits = 0;
  const error = Object.assign(new Error('CHATGPT_PROGRESS_HEARTBEAT_STALLED: no progress'), {
    code: 'CHATGPT_PROGRESS_HEARTBEAT_STALLED',
  });
  const browser = {
    async waitForGenerationComplete() { throw error; },
    async submitExactMessage() { submits += 1; },
  };
  installStuckRecovery(browser, {
    submitMessage: (target, input) => browser.submitExactMessage(target, input),
    stopStalledGeneration: async () => ({ stoppedGeneration: true, inspectedAssistantOutput: false }),
    inspectRecoverableControl: noRecoverableControl,
  });
  await assert.rejects(
    () => browser.waitForGenerationComplete({ id: 'mandatory-progress-stage' }, {
      expectedUrl: 'https://chatgpt.com/c/mandatory-progress-stage',
      generationStarted: true,
      allowSameChatRecovery: false,
    }),
    /CHATGPT_PROGRESS_HEARTBEAT_STALLED/,
  );
  assert.equal(isProgressHeartbeatStall(error), true);
  assert.equal(submits, 0);
});

test('exact systems-thinking banner overrides V6 generic recovery ban with Stop then idle-send-control then continue', async () => {
  let waits = 0;
  const steps = [];
  const browser = {
    async waitForGenerationComplete() {
      waits += 1;
      if (waits === 1) {
        const error = new Error('CHATGPT_SYSTEMS_THINKING_MORE_THAN_USUAL: visible system thinking stall detected.');
        error.code = 'CHATGPT_SYSTEMS_THINKING_MORE_THAN_USUAL';
        throw error;
      }
      steps.push('wait-complete');
      return { status: 'GENERATION_COMPLETE', completedAtObserved: '2026-09-21T16:40:00.000Z', inspectedAssistantOutput: false };
    },
    async submitExactMessage(_target, input) {
      steps.push(`submit:${input.body}`);
      return { generationStarted: true, startedAtObserved: '2026-09-21T16:39:30.000Z' };
    },
  };
  installStuckRecovery(browser, {
    submitMessage: (target, input) => browser.submitExactMessage(target, input),
    beforeRecoverySend: async () => { steps.push('authority-ready'); },
    maxNudges: 3,
    logger: { warn() {} },
    stopStalledGeneration: async (_target, _expectedUrl, recoveryOptions) => {
      steps.push('stop-and-wait-send-control');
      assert.deepEqual(recoveryOptions, { requireSendControl: true });
      return { stoppedGeneration: true, sendControlObserved: true, inspectedAssistantOutput: false };
    },
    inspectRecoverableControl: noRecoverableControl,
  });

  const result = await browser.waitForGenerationComplete({ id: 'v6-systems-stall' }, {
    expectedUrl: 'https://chatgpt.com/c/WEB:systems-stall', generationStarted: true, allowSameChatRecovery: false,
  });

  assert.equal(isSystemsThinkingMoreThanUsual(Object.assign(new Error('x'), { code: 'CHATGPT_SYSTEMS_THINKING_MORE_THAN_USUAL' })), true);
  assert.deepEqual(steps, ['stop-and-wait-send-control', 'authority-ready', 'submit:continue', 'wait-complete']);
  assert.equal(result.stuckRecovery.nudgesSent, 1);
  assert.equal(result.stuckRecovery.recoveries[0].source, 'SYSTEMS_THINKING_MORE_THAN_USUAL');
  assert.equal(result.stuckRecovery.recoveries[0].observedControl, 'Our systems are thinking more than usual');
  assert.equal(result.stuckRecovery.recoveries[0].interruption.sendControlObserved, true);
});

test('connection-interrupted banner also overrides V6 generic recovery ban with Stop then send-control then continue', async () => {
  let waits = 0;
  const steps = [];
  const browser = {
    async waitForGenerationComplete() {
      waits += 1;
      if (waits === 1) {
        const error = new Error('CHATGPT_CONNECTION_INTERRUPTED: visible connection-interrupted system notice detected.');
        error.code = 'CHATGPT_CONNECTION_INTERRUPTED';
        throw error;
      }
      steps.push('wait-complete');
      return { status: 'GENERATION_COMPLETE', completedAtObserved: '2026-09-21T19:45:00.000Z', inspectedAssistantOutput: false };
    },
    async submitExactMessage(_target, input) {
      steps.push(`submit:${input.body}`);
      return { generationStarted: true, startedAtObserved: '2026-09-21T19:44:30.000Z' };
    },
  };
  installStuckRecovery(browser, {
    submitMessage: (target, input) => browser.submitExactMessage(target, input),
    beforeRecoverySend: async () => { steps.push('authority-ready'); },
    maxNudges: 3,
    logger: { warn() {} },
    stopStalledGeneration: async (_target, _expectedUrl, recoveryOptions) => {
      steps.push('stop-and-wait-send-control');
      assert.deepEqual(recoveryOptions, { requireSendControl: true });
      return { stoppedGeneration: true, sendControlObserved: true, inspectedAssistantOutput: false };
    },
    inspectRecoverableControl: noRecoverableControl,
  });

  const result = await browser.waitForGenerationComplete({ id: 'v6-connection-interrupted' }, {
    expectedUrl: 'https://chatgpt.com/c/WEB:connection-interrupted', generationStarted: true, allowSameChatRecovery: false,
  });

  assert.equal(isConnectionInterrupted(Object.assign(new Error('x'), { code: 'CHATGPT_CONNECTION_INTERRUPTED' })), true);
  assert.deepEqual(steps, ['stop-and-wait-send-control', 'authority-ready', 'submit:continue', 'wait-complete']);
  assert.equal(result.stuckRecovery.nudgesSent, 1);
  assert.equal(result.stuckRecovery.recoveries[0].source, 'CONNECTION_INTERRUPTED');
  assert.equal(result.stuckRecovery.recoveries[0].observedControl, 'Connection interrupted');
  assert.equal(result.stuckRecovery.recoveries[0].interruption.sendControlObserved, true);
});

test('structural progress stall uses bounded same-chat Stop then continue when generic recovery is allowed', async () => {
  let waits = 0;
  const steps = [];
  const browser = {
    async waitForGenerationComplete() {
      waits += 1;
      if (waits === 1) {
        const error = new Error('CHATGPT_PROGRESS_HEARTBEAT_STALLED: assistant output stopped changing.');
        error.code = 'CHATGPT_PROGRESS_HEARTBEAT_STALLED';
        throw error;
      }
      return { status: 'GENERATION_COMPLETE', completedAtObserved: '2026-09-24T15:40:00.000Z', inspectedAssistantOutput: false };
    },
    async submitExactMessage(_target, input) {
      steps.push('submit:' + input.body);
      return { generationStarted: true, startedAtObserved: '2026-09-24T15:39:30.000Z' };
    },
  };
  installStuckRecovery(browser, {
    submitMessage: (target, input) => browser.submitExactMessage(target, input),
    maxNudges: 3,
    logger: { warn() {} },
    stopStalledGeneration: async (_target, _expectedUrl, recoveryOptions) => {
      assert.deepEqual(recoveryOptions, { requireSendControl: false });
      steps.push('stop');
      return { stoppedGeneration: true, inspectedAssistantOutput: false };
    },
    inspectRecoverableControl: noRecoverableControl,
  });

  const result = await browser.waitForGenerationComplete({ id: 'progress-stall' }, {
    expectedUrl: 'https://chatgpt.com/c/progress-stall',
    generationStarted: true,
  });
  assert.deepEqual(steps, ['stop', 'submit:continue']);
  assert.equal(result.stuckRecovery.recoveries[0].source, 'PROGRESS_HEARTBEAT_STALLED');
  assert.equal(result.stuckRecovery.inspectedAssistantOutput, false);
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
    submitMessage: (target, input) => browser.submitExactMessage(target, input),
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

test('idle Continue controls are treated as unfinished without reading assistant output', async () => {
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
    submitMessage: (target, input) => browser.submitExactMessage(target, input),
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
    submitMessage: (target, input) => browser.submitExactMessage(target, input),
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
    submitMessage: (target, input) => browser.submitExactMessage(target, input),
    maxNudges: 2,
    logger: { warn() {} },
    stopStalledGeneration: async () => ({ stoppedGeneration: true }),
    inspectRecoverableControl: async () => ({ recoverable: true, controlLabel: 'Continue' }),
  });
  await assert.rejects(
    browser.waitForGenerationComplete({ id: 'retry-target' }, { expectedUrl: 'https://chatgpt.com/c/retry', generationStarted: true }),
    /persisted after 2 continue nudges/,
  );
  assert.equal(submissions, 2);
});

test('generic unbound Retry is not converted into another continue nudge', async () => {
  let submissions = 0;
  const browser = {
    async waitForGenerationComplete() {
      return { status: 'GENERATION_COMPLETE', completedAtObserved: '2026-09-02T17:00:00.000Z', inspectedAssistantOutput: false };
    },
    async submitExactMessage() { submissions += 1; },
  };
  installStuckRecovery(browser, {
    submitMessage: (target, input) => browser.submitExactMessage(target, input),
    inspectRecoverableControl: async () => ({ recoverable: false, controlLabel: null, ignoredUnboundRetry: true }),
  });
  const result = await browser.waitForGenerationComplete({ id: 'retry-target' }, {
    expectedUrl: 'https://chatgpt.com/c/retry', generationStarted: true,
  });
  assert.equal(result.status, 'GENERATION_COMPLETE');
  assert.equal(submissions, 0);
});

test('non-stall failures are never converted into continue messages', async () => {
  let submissions = 0;
  const browser = {
    async waitForGenerationComplete() { throw new Error('ChatGPT login is required in the VPS browser profile.'); },
    async submitExactMessage() { submissions += 1; },
  };
  installStuckRecovery(browser, {
    submitMessage: (target, input) => browser.submitExactMessage(target, input),
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

test('automatic continue recovery uses the persisted global cooldown', async () => {
  let submissions = 0;
  const state = defaultState('2026-09-02T12:00:00.000Z');
  state.submissionPacing.lastSubmissionAt = '2026-09-02T12:00:00.000Z';
  const store = {
    state,
    async read() { return structuredClone(this.state); },
    async write(value) { this.state = structuredClone(value); return structuredClone(value); },
  };
  const browser = {
    async waitForGenerationComplete() { throw new Error('ChatGPT generation did not reach a stable complete UI state.'); },
    async submitExactMessage() { submissions += 1; return { generationStarted: true }; },
  };
  const pacer = new GlobalSubmissionPacer({
    stateStore: store,
    minIntervalMs: 60_000,
    now: () => Date.parse('2026-09-02T12:00:30.000Z'),
  });
  installStuckRecovery(browser, {
    maxNudges: 3,
    logger: { warn() {} },
    submitMessage: (target, input) => pacer.submit({ submit: () => browser.submitExactMessage(target, input) }),
    beforeRecoverySend: () => pacer.assertReady(),
    stopStalledGeneration: async () => ({ stoppedGeneration: true, inspectedAssistantOutput: false }),
    inspectRecoverableControl: noRecoverableControl,
  });

  await assert.rejects(
    browser.waitForGenerationComplete({ id: 'paced-target' }, { expectedUrl: 'https://chatgpt.com/c/paced', generationStarted: true }),
    (error) => error.code === GLOBAL_SUBMISSION_COOLDOWN && error.retryAfterMs === 30_000,
  );
  assert.equal(submissions, 0);
});
