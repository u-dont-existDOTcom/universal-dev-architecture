import assert from 'node:assert/strict';
import test from 'node:test';
import { installStuckRecovery, isConnectionInterrupted, isGenerationStallTimeout, isProgressHeartbeatStall, isSystemsThinkingMoreThanUsual } from '../src/stuck-recovery.mjs';
import { sha256 } from '../src/core.mjs';
import { defaultState } from '../src/core.mjs';
import { GlobalSubmissionPacer } from '../src/submission-pacing.mjs';

const noRecoverableControl = async () => ({ recoverable: false, controlLabel: null });

test('an already idle generation is revalidated before generic Continue without cooldown', async () => {
  let waits = 0;
  let submits = 0;
  const browser = { async waitForGenerationComplete() {
    if (++waits === 1) throw new Error('ChatGPT generation did not reach a stable complete UI state.');
    return { status: 'GENERATION_COMPLETE' };
  } };
  installStuckRecovery(browser, {
    submitMessage: async () => { submits += 1; },
    stopStalledGeneration: async () => ({ stoppedGeneration: false, stopReason: 'ALREADY_IDLE' }),
    inspectRecoverableControl: noRecoverableControl,
  });
  assert.equal((await browser.waitForGenerationComplete({ id: 'idle' }, { expectedUrl: 'https://chatgpt.com/c/idle', generationStarted: true })).status, 'GENERATION_COMPLETE');
  assert.equal(submits, 0);
});

test('an already idle explicit stall is revalidated before Continue without cooldown', async () => {
  let waits = 0;
  let submits = 0;
  const browser = { async waitForGenerationComplete() {
    if (++waits === 1) throw Object.assign(new Error('system stall'), { code: 'CHATGPT_SYSTEMS_THINKING_MORE_THAN_USUAL' });
    return { status: 'GENERATION_COMPLETE' };
  } };
  installStuckRecovery(browser, {
    submitMessage: async () => { submits += 1; },
    stopStalledGeneration: async () => ({ stoppedGeneration: false, stopReason: 'ALREADY_IDLE' }),
    inspectRecoverableControl: noRecoverableControl,
  });
  assert.equal((await browser.waitForGenerationComplete({ id: 'idle' }, { expectedUrl: 'https://chatgpt.com/c/idle', generationStarted: true })).status, 'GENERATION_COMPLETE');
  assert.equal(submits, 0);
});

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

test('explicit recovery uses the canonical conversation URL carried by the stall error', async () => {
  const provisional = 'https://chatgpt.com/c/WEB:canonical-stall';
  const canonical = 'https://chatgpt.com/c/canonical-stall';
  let waits = 0;
  const stoppedUrls = [];
  const submittedUrls = [];
  const browser = {
    async waitForGenerationComplete() {
      waits += 1;
      if (waits === 1) {
        throw Object.assign(new Error('systems-thinking stall'), {
          code: 'CHATGPT_SYSTEMS_THINKING_MORE_THAN_USUAL', conversationUrl: canonical,
        });
      }
      return { status: 'GENERATION_COMPLETE', conversationUrl: canonical };
    },
  };
  installStuckRecovery(browser, {
    submitMessage: async (_target, input) => {
      submittedUrls.push(input.expectedUrl);
      return { generationStarted: true };
    },
    stopStalledGeneration: async (_target, expectedUrl) => {
      stoppedUrls.push(expectedUrl);
      return { stoppedGeneration: true, sendControlObserved: true };
    },
    inspectRecoverableControl: noRecoverableControl,
    logger: { warn() {} },
  });

  await browser.waitForGenerationComplete({ id: 'canonical-stall-target' }, {
    expectedUrl: provisional, generationStarted: true, allowSameChatRecovery: false,
  });
  assert.deepEqual(stoppedUrls, [canonical]);
  assert.deepEqual(submittedUrls, [canonical]);
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

test('separate generation waits receive distinct durable nudge keys', async () => {
  const keys = [];
  const browser = { waitForGenerationComplete: async () => { throw new Error('ChatGPT generation did not reach a stable complete UI state.'); } };
  installStuckRecovery(browser, {
    maxNudges: 1,
    submitMessage: async (_target, input) => { keys.push(input.schedulerAttemptKey); return { startedAtObserved: '2026-09-28T12:00:00Z' }; },
    stopStalledGeneration: async () => ({ stoppedGeneration: true, inspectedAssistantOutput: false }),
    logger: { warn() {} },
  });
  for (let index = 0; index < 2; index += 1) {
    await assert.rejects(() => browser.waitForGenerationComplete({ id: 'target-1' }, { expectedUrl: 'https://chatgpt.com/c/fake' }));
  }
  assert.deepEqual(keys, ['wait:1:nudge:1', 'wait:2:nudge:1']);
});

test('a journal recovery logger can keep conversation URLs out of recovery events', async () => {
  const genericLogs = [];
  const journalLogs = [];
  let attempts = 0;
  const browser = { waitForGenerationComplete: async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('ChatGPT generation did not reach a stable complete UI state.');
    return { status: 'complete' };
  } };
  installStuckRecovery(browser, {
    submitMessage: async () => ({ startedAtObserved: '2026-09-28T12:00:00Z' }),
    stopStalledGeneration: async () => ({ stoppedGeneration: true, inspectedAssistantOutput: false }),
    inspectRecoverableControl: noRecoverableControl,
    logger: { warn: (value) => genericLogs.push(value) },
  });
  await browser.waitForGenerationComplete({ id: 'target-1' }, {
    expectedUrl: 'https://chatgpt.com/c/private-journal',
    recoveryLogger: { warn: (value) => journalLogs.push(value) },
    recoveryLogConversationUrl: false,
  });
  assert.equal(genericLogs.length, 0);
  assert.equal(journalLogs.length, 1);
  assert.doesNotMatch(journalLogs[0], /conversationUrl|private-journal/);
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

test('canonical conversation URLs returned by a completed wait bind recoverable-control inspection and its nudge', async () => {
  const provisional = 'https://chatgpt.com/c/WEB:provisional';
  const canonical = 'https://chatgpt.com/c/canonical';
  const inspectedUrls = [];
  const submittedUrls = [];
  let waits = 0;
  const browser = {
    async waitForGenerationComplete() {
      waits += 1;
      return { status: 'GENERATION_COMPLETE', conversationUrl: canonical, inspectedAssistantOutput: false };
    },
  };
  installStuckRecovery(browser, {
    submitMessage: async (_target, input) => {
      submittedUrls.push(input.expectedUrl);
      return { generationStarted: true, startedAtObserved: '2026-09-28T12:00:00.000Z' };
    },
    inspectRecoverableControl: async (_target, expectedUrl) => {
      inspectedUrls.push(expectedUrl);
      return inspectedUrls.length === 1
        ? { recoverable: true, controlLabel: 'Continue' }
        : { recoverable: false, controlLabel: null };
    },
    logger: { warn() {} },
  });

  const result = await browser.waitForGenerationComplete({ id: 'canonical-target' }, {
    expectedUrl: provisional,
    generationStarted: true,
  });

  assert.equal(waits, 2);
  assert.deepEqual(inspectedUrls, [canonical, canonical]);
  assert.deepEqual(submittedUrls, [canonical]);
  assert.equal(result.conversationUrl, canonical);
  assert.equal(result.stuckRecovery.nudgesSent, 1);
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
  let waits = 0;
  let clock = Date.parse('2026-09-02T12:00:30.000Z');
  const sleeps = [];
  const state = defaultState('2026-09-02T12:00:00.000Z');
  state.submissionPacing.lastSubmissionAt = '2026-09-02T12:00:00.000Z';
  const store = {
    state,
    async read() { return structuredClone(this.state); },
    async write(value) { this.state = structuredClone(value); return structuredClone(value); },
  };
  const browser = {
    async waitForGenerationComplete() {
      waits += 1;
      if (waits <= 2) throw new Error('ChatGPT generation did not reach a stable complete UI state.');
      return { completed: true };
    },
    async submitExactMessage() { submissions += 1; return { generationStarted: true }; },
  };
  const pacer = new GlobalSubmissionPacer({
    stateStore: store,
    minIntervalMs: 60_000,
    now: () => clock,
  });
  installStuckRecovery(browser, {
    maxNudges: 3,
    logger: { warn() {} },
    submitMessage: (target, input) => pacer.submit({ submit: () => browser.submitExactMessage(target, input) }),
    beforeRecoverySend: () => pacer.assertReady(),
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    stopStalledGeneration: async () => ({ stoppedGeneration: true, inspectedAssistantOutput: false }),
    inspectRecoverableControl: noRecoverableControl,
  });

  const result = await browser.waitForGenerationComplete(
    { id: 'paced-target' },
    { expectedUrl: 'https://chatgpt.com/c/paced', generationStarted: true },
  );
  assert.deepEqual(sleeps, [30_000]);
  assert.equal(submissions, 1);
  assert.equal(result.stuckRecovery.nudgesSent, 1);
});

test('generic recovery skips Continue when generation completes during the global cooldown', async () => {
  let waits = 0;
  let admissionChecks = 0;
  let stops = 0;
  let submissions = 0;
  const sleeps = [];
  const browser = {
    async waitForGenerationComplete() {
      waits += 1;
      if (waits === 1) throw new Error('ChatGPT generation did not reach a stable complete UI state.');
      return { status: 'GENERATION_COMPLETE', completedAtObserved: '2026-09-28T11:00:30.000Z' };
    },
  };
  installStuckRecovery(browser, {
    submitMessage: async () => { submissions += 1; return { generationStarted: true }; },
    beforeRecoverySend: async () => {
      admissionChecks += 1;
      if (admissionChecks === 1) {
        throw Object.assign(new Error('cooldown'), { code: 'GLOBAL_SUBMISSION_COOLDOWN', retryAfterMs: 30_000 });
      }
    },
    sleep: async (ms) => { sleeps.push(ms); },
    stopStalledGeneration: async () => { stops += 1; return { stoppedGeneration: false, stopReason: 'ALREADY_IDLE' }; },
    inspectRecoverableControl: noRecoverableControl,
    logger: { warn() {} },
  });

  const result = await browser.waitForGenerationComplete({ id: 'resolved-during-cooldown' }, {
    expectedUrl: 'https://chatgpt.com/c/resolved-during-cooldown',
    generationStarted: true,
  });

  assert.deepEqual(sleeps, [30_000]);
  assert.equal(waits, 2);
  assert.equal(stops, 0);
  assert.equal(submissions, 0);
  assert.equal(result.status, 'GENERATION_COMPLETE');
  assert.equal(result.stuckRecovery, undefined);
});

test('resolved explicit stall skips Continue after a global cooldown', async () => {
  let waits = 0;
  let admissionChecks = 0;
  let submissions = 0;
  const sleeps = [];
  const browser = {
    async waitForGenerationComplete() {
      waits += 1;
      if (waits === 1) {
        throw Object.assign(new Error('connection interrupted'), {
          code: 'CHATGPT_CONNECTION_INTERRUPTED',
        });
      }
      return { status: 'GENERATION_COMPLETE', completedAtObserved: '2026-09-28T14:00:30.000Z' };
    },
  };
  installStuckRecovery(browser, {
    submitMessage: async () => { submissions += 1; return { generationStarted: true }; },
    beforeRecoverySend: async () => {
      admissionChecks += 1;
      if (admissionChecks === 1) {
        throw Object.assign(new Error('cooldown'), { code: 'GLOBAL_SUBMISSION_COOLDOWN', retryAfterMs: 30_000 });
      }
    },
    sleep: async (ms) => { sleeps.push(ms); },
    stopStalledGeneration: async () => ({ stoppedGeneration: false, stopReason: 'ALREADY_IDLE' }),
    inspectRecoverableControl: noRecoverableControl,
    logger: { warn() {} },
  });

  const result = await browser.waitForGenerationComplete({ id: 'resolved-explicit-stall' }, {
    expectedUrl: 'https://chatgpt.com/c/resolved-explicit-stall',
    generationStarted: true,
    allowSameChatRecovery: false,
  });
  assert.deepEqual(sleeps, [30_000]);
  assert.equal(waits, 2);
  assert.equal(submissions, 0);
  assert.equal(result.status, 'GENERATION_COMPLETE');
  assert.equal(result.stuckRecovery, undefined);
});

test('recoverable-control recovery revalidates after cooldown and skips a vanished control', async () => {
  let waits = 0;
  let inspections = 0;
  let admissionChecks = 0;
  let submissions = 0;
  const browser = {
    async waitForGenerationComplete() {
      waits += 1;
      return { status: 'GENERATION_COMPLETE', completedAtObserved: `2026-09-28T11:00:${waits === 1 ? '00' : '30'}.000Z` };
    },
  };
  installStuckRecovery(browser, {
    submitMessage: async () => { submissions += 1; return { generationStarted: true }; },
    beforeRecoverySend: async () => {
      admissionChecks += 1;
      if (admissionChecks === 1) throw Object.assign(new Error('cooldown'), { code: 'GLOBAL_SUBMISSION_COOLDOWN', retryAfterMs: 30_000 });
    },
    sleep: async () => {},
    inspectRecoverableControl: async () => {
      inspections += 1;
      return inspections === 1
        ? { recoverable: true, controlLabel: 'Continue' }
        : { recoverable: false, controlLabel: null };
    },
    logger: { warn() {} },
  });

  const result = await browser.waitForGenerationComplete({ id: 'recoverable-resolved' }, {
    expectedUrl: 'https://chatgpt.com/c/recoverable-resolved', generationStarted: true,
  });
  assert.equal(result.status, 'GENERATION_COMPLETE');
  assert.equal(waits, 2);
  assert.equal(inspections, 2);
  assert.equal(submissions, 0);
  assert.equal(result.stuckRecovery, undefined);
});

test('automatic continue passes item admission into scheduler replays', async () => {
  let waits = 0;
  let admissionChecks = 0;
  const browser = {
    async waitForGenerationComplete() {
      waits += 1;
      if (waits === 1) throw new Error('ChatGPT generation did not reach a stable complete UI state.');
      return { completed: true };
    },
  };
  installStuckRecovery(browser, {
    submitMessage: async (_target, input) => {
      assert.equal(typeof input.beforeRecoverySend, 'function');
      await input.beforeRecoverySend();
      return { generationStarted: true };
    },
    logger: { warn() {} },
    stopStalledGeneration: async () => ({ stoppedGeneration: true, inspectedAssistantOutput: false }),
    inspectRecoverableControl: noRecoverableControl,
  });

  await browser.waitForGenerationComplete({ id: 'allowance-bound-recovery' }, {
    expectedUrl: 'https://chatgpt.com/c/allowance-bound-recovery',
    generationStarted: true,
    beforeRecoverySend: async () => { admissionChecks += 1; },
  });
  assert.equal(admissionChecks, 2);
});
