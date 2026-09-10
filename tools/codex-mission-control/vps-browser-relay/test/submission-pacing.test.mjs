import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultState } from '../src/core.mjs';
import { StateStore } from '../src/state.mjs';
import {
  CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED,
  ChatGptRateLimitRetryError,
  CentralSubmissionScheduler,
  GlobalSubmissionPacer,
  GLOBAL_SUBMISSION_COOLDOWN,
} from '../src/submission-pacing.mjs';
import { sha256 } from '../src/core.mjs';

test('central admission is durable before every browser mutation and actual boundary is recorded once', async () => {
  const events = [];
  const store = new MemoryStateStore();
  const client = {
    async status() { return centralStatus(); },
    async admit(input) { events.push(['admit', input]); return admissionAuthority({ admitted: true, singleUse: true }); },
    async validateAdmission(input) { events.push(['validate', input]); return admissionAuthority({ valid: true }); },
    async recordBoundary(input) { events.push(['boundary', input]); return { recorded: true }; },
    async bindTarget(input) { events.push(['bind', input]); return { bound: true }; },
    async recordRateLimit(input) { events.push(['rate-limit', input]); return { recorded: true, providerRateLimitCount: 1 }; },
    async abortBeforeBoundary(input) { events.push(['abort', input]); return { aborted: true }; },
  };
  const scheduler = new CentralSubmissionScheduler({ schedulerClient: client, stateStore: store, host: host(), minIntervalMs: 60_000, now: () => Date.parse('2026-09-10T12:00:00.000Z') });
  await scheduler.submit({
    context: context(),
    beforeSubmit: async () => { events.push(['browser-model-mutation']); },
    submit: async (onBoundary, _admission, validateBeforeClick) => {
      events.push(['browser-composer-mutation']);
      await validateBeforeClick();
      events.push(['browser-click']);
      const result = { clickedAtObserved: '2026-09-10T12:00:01.000Z', startedAtObserved: '2026-09-10T12:00:02.000Z', conversationUrl: 'https://chatgpt.com/c/generated' };
      await onBoundary(result);
      return result;
    },
  });
  assert.deepEqual(events.map(([name]) => name), ['admit', 'browser-model-mutation', 'browser-composer-mutation', 'validate', 'browser-click', 'boundary']);
  assert.equal(events[0][1].hostAlias, 'primary');
  assert.equal(events[0][1].hostRole, 'PRIMARY');
  assert.equal(events[5][1].admissionId, 'admission:test');
  assert.equal(events[5][1].boundaryKind, 'GENERATION_STARTED');
  assert.equal(store.state.submissionPacing.lastAdmissionId, 'admission:test');
});

test('central scheduler rejection or outage prevents browser mutation', async () => {
  const store = new MemoryStateStore();
  for (const error of [Object.assign(new Error('standby'), { code: 'STANDBY_SEND_FORBIDDEN' }), Object.assign(new Error('offline'), { code: 'CENTRAL_SCHEDULER_UNREACHABLE' })]) {
    let mutated = false;
    const client = {
      async status() { return centralStatus(); },
      async admit() { throw error; },
      async validateAdmission() {},
      async recordBoundary() {},
      async bindTarget() {},
      async recordRateLimit() {},
      async abortBeforeBoundary() {},
    };
    const scheduler = new CentralSubmissionScheduler({ schedulerClient: client, stateStore: store, host: host(), minIntervalMs: 60_000 });
    await assert.rejects(scheduler.submit({ context: context(), beforeSubmit: async () => { mutated = true; }, submit: async () => {} }), (caught) => caught.code === error.code);
    assert.equal(mutated, false);
  }
});

test('mismatched admission authority blocks before any browser mutation', async () => {
  for (const mismatch of [
    { minimumIntervalMs: 90_000 },
    { leaseEpoch: 2 },
    { hostAlias: 'standby' },
    { hostRole: 'SECONDARY' },
  ]) {
    let mutated = false;
    const client = {
      async status() { return centralStatus(); },
      async admit() { return admissionAuthority({ admitted: true, singleUse: true, ...mismatch }); },
      async validateAdmission() {}, async recordBoundary() {}, async bindTarget() {}, async recordRateLimit() {}, async abortBeforeBoundary() {},
    };
    const scheduler = new CentralSubmissionScheduler({ schedulerClient: client, stateStore: new MemoryStateStore(), host: host(), minIntervalMs: 60_000 });
    await assert.rejects(
      scheduler.submit({ context: context(), beforeSubmit: async () => { mutated = true; }, submit: async () => {} }),
      (error) => error.code === 'CENTRAL_SCHEDULER_AUTHORITY_MISMATCH',
    );
    assert.equal(mutated, false);
  }
});

test('final pre-click validation is exact-bound to the live granted admission', async () => {
  for (const malformed of [
    { valid: false },
    { valid: true, admissionId: 'admission:different' },
    { valid: true, expiresAt: '2031-01-01T00:00:00.000Z' },
    { valid: true, expiresAt: '2026-09-10T11:59:59.000Z' },
  ]) {
    let clicked = false;
    const client = {
      async status() { return centralStatus(); },
      async admit() { return admissionAuthority({ admitted: true, singleUse: true }); },
      async validateAdmission() { return admissionAuthority(malformed); },
      async recordBoundary() {}, async bindTarget() {}, async recordRateLimit() {},
      async abortBeforeBoundary() { return { aborted: true }; },
    };
    const scheduler = new CentralSubmissionScheduler({
      schedulerClient: client,
      stateStore: new MemoryStateStore(),
      host: host(),
      minIntervalMs: 60_000,
      now: () => Date.parse('2026-09-10T12:00:00.000Z'),
    });
    await assert.rejects(scheduler.submit({
      context: context(),
      submit: async (_onBoundary, _admission, validateBeforeClick) => {
        await validateBeforeClick();
        clicked = true;
      },
    }), /CENTRAL_SCHEDULER_INVALID_ADMISSION/);
    assert.equal(clicked, false);
  }
});

test('two routes cannot cross the global send gate inside the minimum interval', async () => {
  const store = new MemoryStateStore();
  const now = { value: Date.parse('2026-09-02T12:00:00.000Z') };
  const pacer = new GlobalSubmissionPacer({ stateStore: store, minIntervalMs: 60_000, now: () => now.value });
  const clicked = [];

  const results = await Promise.allSettled([
    pacer.submit({ submit: async () => { clicked.push('route-a'); return { generationStarted: true }; } }),
    pacer.submit({ submit: async () => { clicked.push('route-b'); return { generationStarted: true }; } }),
  ]);

  assert.deepEqual(clicked, ['route-a']);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.code, GLOBAL_SUBMISSION_COOLDOWN);
  assert.equal(results[1].reason.retryAfterMs, 60_000);
  assert.equal(store.state.submissionPacing.lastSubmissionAt, '2026-09-02T12:00:00.000Z');

  now.value += 60_000;
  await pacer.submit({ submit: async () => { clicked.push('route-b'); return { generationStarted: true }; } });
  assert.deepEqual(clicked, ['route-a', 'route-b']);
});

test('a cooldown rejection does not run pre-submit semantic state mutation', async () => {
  const state = defaultState('2026-09-02T12:00:00.000Z');
  state.deliveries['request:semantic'] = { status: 'EXTRA_HIGH_READER_COMPLETE', authority: 'UNCHANGED' };
  state.submissionPacing.lastSubmissionAt = '2026-09-02T12:00:00.000Z';
  const store = new MemoryStateStore(state);
  const pacer = new GlobalSubmissionPacer({ stateStore: store, minIntervalMs: 60_000, now: () => Date.parse('2026-09-02T12:00:30.000Z') });
  const before = structuredClone(store.state.deliveries);
  let clicked = false;

  await assert.rejects(
    pacer.submit({
      beforeSubmit: async () => { store.state.deliveries['request:semantic'].authority = 'MUTATED'; },
      submit: async () => { clicked = true; },
    }),
    (error) => error.code === GLOBAL_SUBMISSION_COOLDOWN && error.retryAfterMs === 30_000,
  );

  assert.equal(clicked, false);
  assert.deepEqual(store.state.deliveries, before);
});

test('the global pacing boundary and caller recovery record commit in one state write', async () => {
  const store = new MemoryStateStore();
  const pacer = new GlobalSubmissionPacer({
    stateStore: store,
    minIntervalMs: 60_000,
    now: () => Date.parse('2026-09-09T12:00:00.000Z'),
  });
  await pacer.submit({
    submit: async () => ({
      generationStarted: true,
      clickedAtObserved: '2026-09-09T12:00:01.000Z',
      conversationUrl: 'https://chatgpt.com/c/exact',
    }),
    recordBoundary: (state, { boundaryAt, result }) => {
      state.controllerCycles['cycle-atomic'] = {
        status: 'BOUNDARY_VERIFIED',
        boundaryAt,
        conversationUrl: result.conversationUrl,
      };
    },
  });
  assert.deepEqual(store.state.controllerCycles['cycle-atomic'], {
    status: 'BOUNDARY_VERIFIED',
    boundaryAt: '2026-09-09T12:00:01.000Z',
    conversationUrl: 'https://chatgpt.com/c/exact',
  });
  assert.equal(store.state.submissionPacing.lastSubmissionAt, '2026-09-09T12:00:01.000Z');
  assert.equal(store.writes, 1);
});

test('provider rate-limit before the send boundary waits exactly 30 seconds then retries once', async () => {
  const store = new MemoryStateStore();
  const now = { value: Date.parse('2026-09-08T12:00:00.000Z') };
  const sleeps = [];
  const pacer = new GlobalSubmissionPacer({
    stateStore: store,
    minIntervalMs: 60_000,
    now: () => now.value,
    sleepImpl: async (ms) => { sleeps.push(ms); now.value += ms; },
  });
  let attempts = 0;

  const result = await pacer.submit({
    submit: async () => {
      attempts += 1;
      if (attempts === 1) throw new ChatGptRateLimitRetryError({ retryAfterMs: 30_000, relayStage: 'COMPOSER_FILLED' });
      return { generationStarted: true, clickedAtObserved: new Date(now.value).toISOString() };
    },
  });

  assert.equal(result.generationStarted, true);
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [30_000]);
  assert.equal(store.state.submissionPacing.lastSubmissionAt, '2026-09-08T12:00:30.000Z');
});

test('provider rate-limit after click preserves the 60 second global submission gate before retry', async () => {
  const store = new MemoryStateStore();
  const now = { value: Date.parse('2026-09-08T12:00:00.000Z') };
  const sleeps = [];
  const pacer = new GlobalSubmissionPacer({
    stateStore: store,
    minIntervalMs: 60_000,
    now: () => now.value,
    sleepImpl: async (ms) => { sleeps.push(ms); now.value += ms; },
  });
  let attempts = 0;

  await pacer.submit({
    submit: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new ChatGptRateLimitRetryError({
          retryAfterMs: 30_000,
          relayStage: 'CLICKED',
          clickedAtObserved: '2026-09-08T12:00:00.000Z',
        });
      }
      return { generationStarted: true, clickedAtObserved: new Date(now.value).toISOString() };
    },
  });

  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [60_000]);
  assert.equal(store.state.submissionPacing.lastSubmissionAt, '2026-09-08T12:01:00.000Z');
});

test('a second provider rate-limit fails closed instead of looping', async () => {
  const store = new MemoryStateStore();
  const now = { value: Date.parse('2026-09-08T12:00:00.000Z') };
  const sleeps = [];
  const pacer = new GlobalSubmissionPacer({
    stateStore: store,
    minIntervalMs: 60_000,
    now: () => now.value,
    sleepImpl: async (ms) => { sleeps.push(ms); now.value += ms; },
  });
  let attempts = 0;

  await assert.rejects(
    pacer.submit({
      submit: async () => {
        attempts += 1;
        throw new ChatGptRateLimitRetryError({ retryAfterMs: 30_000, relayStage: 'COMPOSER_FILLED' });
      },
    }),
    (error) => error.code === CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED,
  );

  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [30_000]);
});

test('persisted last-submission time survives a state-store and pacer restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-submission-pacing-'));
  try {
    const paths = { stateFile: join(root, 'state.json'), statusFile: join(root, 'status.json'), lockFile: join(root, 'relay.lock') };
    const now = { value: Date.parse('2026-09-02T12:00:00.000Z') };
    const firstStore = new StateStore(paths);
    const first = new GlobalSubmissionPacer({ stateStore: firstStore, minIntervalMs: 60_000, now: () => now.value });
    await first.submit({ submit: async () => ({ generationStarted: true }) });

    const restartedStore = new StateStore(paths);
    const restarted = new GlobalSubmissionPacer({ stateStore: restartedStore, minIntervalMs: 60_000, now: () => now.value + 1_000 });
    let clicked = false;
    await assert.rejects(
      restarted.submit({ submit: async () => { clicked = true; } }),
      (error) => error.code === GLOBAL_SUBMISSION_COOLDOWN && error.retryAfterMs === 59_000,
    );
    assert.equal(clicked, false);
    assert.equal((await restartedStore.read()).submissionPacing.lastSubmissionAt, '2026-09-02T12:00:00.000Z');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

class MemoryStateStore {
  constructor(initial = defaultState()) { this.state = structuredClone(initial); this.writes = 0; }
  async read() { return structuredClone(this.state); }
  async write(value) { this.writes += 1; this.state = structuredClone(value); return structuredClone(value); }
}

function host() { return { alias: 'primary', role: 'PRIMARY', deploymentEpoch: 1, leaseId: 'lease-primary-1' }; }

function context() {
  return {
    requestId: 'r-1', queueKey: 'queue:r-1:step:1', sendPath: 'CAPABILITY', supervisorId: 'spec', registrationId: 'registration:spec:test',
    targetId: 'target-test', targetKind: 'REGISTERED_BOOTSTRAP', targetKey: 'bootstrap-test', expectedUrlSha256: sha256('https://chatgpt.com/c/bootstrap-test'),
    bodySha256: 'a'.repeat(64), hash: sha256,
  };
}

function centralStatus() {
  return { ready: true, minimumIntervalMs: 60_000, retryAfterMs: 0, activeLease: { epoch: 1, activeHostAlias: 'primary', activeHostRole: 'PRIMARY' } };
}

function admissionAuthority(overrides = {}) {
  return { admissionId: 'admission:test', expiresAt: '2030-01-01T00:00:00.000Z', minimumIntervalMs: 60_000, leaseEpoch: 1, hostAlias: 'primary', hostRole: 'PRIMARY', ...overrides };
}
