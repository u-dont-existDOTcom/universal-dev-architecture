import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPABILITY_CHALLENGE_SUMMARY,
  CAPABILITY_VERIFIED_SUMMARY,
  MODE_CAPABILITY_VERIFIED_SUMMARY,
  RELAY_STAGE_SUMMARY,
  STAGE_LIVENESS_SUMMARY,
  SUPERVISORY_CYCLE_ROUTE_PREFIX,
  defaultState,
} from '../src/core.mjs';
import { RelayRuntime } from '../src/relay.mjs';
import { GlobalSubmissionPacer } from '../src/submission-pacing.mjs';

const normalMetrics = { totalMb: 7941, availableMb: 5400, usedMb: 2541, swapTotalMb: 2048, swapUsedMb: 2, browserRssMb: 1700, sampledAt: '2026-09-02T00:00:00.000Z' };

test('normal supervision fails closed when live tool/mode capability receipts are missing', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: [challengeEvidence()] });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });
  const result = await runtime.cycle();
  assert.equal(result.status, 'CAPABILITY_NOT_VERIFIED');
  assert.equal(browser.submitCalls, 0);
});

test('dry run becomes ready only after current tool and exact-mode receipts exist', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence() });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: false });
  const result = await runtime.cycle();
  assert.equal(result.status, 'DRY_RUN_ROUTE_READY');
  assert.equal(result.memory.policy.profile, '8GB');
  assert.equal(browser.submitCalls, 0);
});

test('escalated reader records transport COMPLETE and advances to Pro only after durable reader liveness arrives', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence() });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });

  const first = await runtime.cycle();
  assert.equal(first.status, 'EXTRA_HIGH_READER_GENERATION_STARTED');
  assert.equal(browser.submitCalls, 1);
  assert.equal(mc.recordedEvidence.filter((item) => item.summary === RELAY_STAGE_SUMMARY).length, 1);
  assert.ok(mc.recordedEvidence[0].refs.includes('generation_state:STARTED'));
  assert.ok(mc.recordedEvidence[0].refs.includes('assistant_content_observed:false'));

  const second = await runtime.cycle();
  assert.equal(second.status, 'EXTRA_HIGH_READER_COMPLETE');
  assert.equal(browser.submitCalls, 1);
  const stages = mc.recordedEvidence.filter((item) => item.summary === RELAY_STAGE_SUMMARY);
  assert.ok(stages.some((item) => item.refs.includes('generation_state:COMPLETE')));

  mc.evidence.push(stageLivenessEvidence('reader-complete', 'EXTRA_HIGH_READER', 'STAGE_COMPLETE', '2026-09-02T00:00:05.000Z'));
  const third = await runtime.cycle();
  assert.equal(third.status, 'PRO_REASONER_GENERATION_STARTED');
  assert.equal(browser.switchLabels.at(-1), 'Pro');
  assert.equal(browser.submitCalls, 2);
});

test('click without an observed generation-start transition becomes ambiguous and cannot replay', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence() });
  const browser = new FakeBrowser({ submitErrorStage: 'CLICKED' });
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });
  const first = await runtime.cycle();
  assert.equal(first.status, 'SUBMISSION_AMBIGUOUS');
  assert.equal(browser.submitCalls, 1);
  assert.equal(store.state.deliveries['request:r-1'].status, 'AMBIGUOUS_AFTER_RESTART');
  const second = await runtime.cycle();
  assert.equal(second.status, 'AMBIGUITY_REQUIRES_OPERATOR');
  assert.equal(browser.submitCalls, 1);
  assert.equal('outboundMessagePresent' in browser, false);
});

test('restart after pre-click intent marks route ambiguous without browser reconciliation', async () => {
  const state = defaultState();
  state.deliveries['request:r-1'] = { status: 'SUBMISSION_INTENT_RECORDED', chatId: 'spec', bodySha256: 'a'.repeat(64), lastAttemptAt: '2026-09-02T00:00:00Z' };
  const store = new MemoryStateStore(state);
  const mc = new FakeMissionControl({ evidence: capabilityEvidence() });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });
  const result = await runtime.cycle();
  assert.equal(result.status, 'AMBIGUITY_REQUIRES_OPERATOR');
  assert.equal(browser.submitCalls, 0);
});

test('capability command verifies exact mode labels but does not send challenge while capability-test gate is disabled', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: [challengeEvidence()] });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: false, capabilityTestEnabled: false });
  const result = await runtime.verifyCapabilities('spec');
  assert.equal(result.status, 'CAPABILITY_CHALLENGE_READY');
  assert.equal(browser.modeRoundTripCalls, 1);
  assert.equal(browser.submitCalls, 0);
  assert.ok(mc.recordedEvidence.some((item) => item.summary === MODE_CAPABILITY_VERIFIED_SUMMARY));
});

test('capability challenge send is independently gated and resumes from generation-start without replay', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: [challengeEvidence()] });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: false, capabilityTestEnabled: true });
  const first = await runtime.verifyCapabilities('spec');
  assert.equal(first.status, 'AWAITING_CAPABILITY_RECEIPT');
  assert.equal(browser.submitCalls, 1);
  assert.equal(browser.waitCalls, 1);
  assert.match(browser.lastSubmittedBody, /https:\/\/mission-control\.example\/api\/capability-challenges\/challenge-spec/);
  assert.match(browser.lastSubmittedBody, /github_nonce_source/);
  assert.equal(browser.lastSubmittedBody.includes('mc-secret'), false);
  assert.equal(browser.lastSubmittedBody.includes('gh-secret'), false);
  const second = await runtime.verifyCapabilities('spec');
  assert.equal(second.status, 'AWAITING_CAPABILITY_RECEIPT');
  assert.equal(browser.submitCalls, 1);
});

test('capability challenge obeys the persisted global cooldown without creating delivery authority', async () => {
  const state = defaultState('2026-09-02T00:00:00.000Z');
  state.submissionPacing.lastSubmissionAt = '2026-09-02T00:00:00.000Z';
  const store = new MemoryStateStore(state);
  const mc = new FakeMissionControl({ evidence: [challengeEvidence()] });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({
    store,
    mc,
    browser,
    submitEnabled: false,
    capabilityTestEnabled: true,
    now: () => Date.parse('2026-09-02T00:00:30.000Z'),
  });
  const result = await runtime.verifyCapabilities('spec');
  assert.equal(result.status, 'GLOBAL_SUBMISSION_COOLDOWN');
  assert.equal(result.retryAfterMs, 30_000);
  assert.equal(browser.submitCalls, 0);
  assert.deepEqual(store.state.deliveries, {});
});

test('same-chat mode stages are globally paced and retry later without semantic mutation', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence() });
  const browser = new FakeBrowser();
  const now = { value: Date.parse('2026-09-02T00:00:01.000Z') };
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true, now: () => now.value });

  assert.equal((await runtime.cycle()).status, 'EXTRA_HIGH_READER_GENERATION_STARTED');
  assert.equal((await runtime.cycle()).status, 'EXTRA_HIGH_READER_COMPLETE');
  mc.evidence.push(stageLivenessEvidence('reader-complete-paced', 'EXTRA_HIGH_READER', 'STAGE_COMPLETE', '2026-09-02T00:00:05.000Z'));
  const before = structuredClone(store.state.deliveries['request:r-1']);
  const blocked = await runtime.cycle();
  assert.equal(blocked.status, 'GLOBAL_SUBMISSION_COOLDOWN');
  assert.equal(blocked.retryAfterMs, 60_000);
  assert.equal(browser.submitCalls, 1);
  assert.deepEqual(store.state.deliveries['request:r-1'], before);

  now.value += 60_000;
  assert.equal((await runtime.cycle()).status, 'PRO_REASONER_GENERATION_STARTED');
  assert.equal(browser.submitCalls, 2);
});

test('hard memory pressure performs no submission', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence() });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true, memoryReader: async () => ({ ...normalMetrics, availableMb: 800 }) });
  const result = await runtime.cycle();
  assert.equal(result.status, 'PAUSED_MEMORY_HARD');
  assert.equal(browser.submitCalls, 0);
});

function makeRuntime({ store, mc, browser, submitEnabled, capabilityTestEnabled = false, memoryReader = async () => normalMetrics, now = Date.now }) {
  const config = {
    missionControl: { url: 'https://mission-control.example' },
    browser: { profileDir: '/tmp/test-profile' },
    runtime: {
      chats: [chat()], workerIds: ['worker-a'], submitEnabled, capabilityTestEnabled, pollIntervalMs: 15_000, minSubmissionIntervalMs: 60_000, retryDelayMs: 300_000, maxHotTabs: 3,
    },
    memory: { profile: 'AUTO', overrides: {} },
  };
  const submissionPacer = new GlobalSubmissionPacer({ stateStore: store, minIntervalMs: config.runtime.minSubmissionIntervalMs, now });
  return new RelayRuntime({ config, missionControl: mc, browser, stateStore: store, submissionPacer, memoryReader, logger: { log() {}, warn() {}, error() {} } });
}

class MemoryStateStore {
  constructor(initial = defaultState()) { this.state = structuredClone(initial); this.status = null; }
  async read() { return structuredClone(this.state); }
  async write(value) { this.state = structuredClone(value); return structuredClone(value); }
  async writeStatus(value) { this.status = structuredClone(value); }
}

class FakeMissionControl {
  constructor({ evidence = [] } = {}) { this.evidence = [...evidence]; this.recordedEvidence = []; this.sequence = 50; }
  async fetchFleet() {
    const timeline = [routeEvent(), ...this.evidence, ...this.recordedEvidence.map((item) => ({
      eventId: `evidence-${item.receiptId}`, sequence: ++this.sequence, occurredAt: item.occurredAt ?? '2026-09-02T00:00:01.000Z', data: {
        type: 'evidence_receipt_recorded', receipt_id: item.receiptId, summary: item.summary, refs: item.refs, verified: true,
      },
    }))];
    return { generatedAt: '2026-09-02T00:00:00.000Z', workers: [{ id: 'worker-a', name: 'Worker A', timeline }] };
  }
  async recordEvidence(worker, input) {
    this.recordedEvidence.push({ worker, ...structuredClone(input) });
    return { eventId: `stored-${input.receiptId}` };
  }
}

class FakeBrowser {
  constructor({ submitErrorStage = null } = {}) {
    this.submitErrorStage = submitErrorStage;
    this.submitCalls = 0; this.waitCalls = 0; this.modeRoundTripCalls = 0; this.switchLabels = []; this.targets = []; this.closedTargets = []; this.lastSubmittedBody = null;
  }
  async doctor() { return { browser: 'Fake', targetCount: this.targets.length }; }
  async listTargets() { return structuredClone(this.targets); }
  async closeTarget(id) { this.closedTargets.push(id); this.targets = this.targets.filter((target) => target.id !== id); return true; }
  async findOrCreateChatTarget(url) {
    const existing = this.targets.find((target) => target.url === url);
    if (existing) return { ...existing, created: false, webSocketDebuggerUrl: 'ws://fake' };
    const target = { id: 'target-spec', type: 'page', url, created: true, webSocketDebuggerUrl: 'ws://fake' };
    this.targets.push(target); return target;
  }
  async verifyModelRoundTrip() { this.modeRoundTripCalls += 1; return { status: 'MODE_ROUND_TRIP_VERIFIED', extraHighObserved: 'Extra High', proObserved: 'Pro' }; }
  async switchModel(target, { label }) { this.switchLabels.push(label); return { selectedLabel: label, observedLabel: label, changed: true }; }
  async submitExactMessage(target, input) {
    this.submitCalls += 1; this.lastSubmittedBody = input.body;
    if (this.submitErrorStage) { const error = new Error('simulated send uncertainty'); error.relayStage = this.submitErrorStage; throw error; }
    return { status: 'GENERATION_STARTED', generationStarted: true, startSignal: 'STOP_CONTROL_VISIBLE', startedAtObserved: `2026-09-02T00:00:0${this.submitCalls}.000Z`, bodySha256: input.bodySha256 };
  }
  async waitForGenerationComplete() { this.waitCalls += 1; return { status: 'GENERATION_COMPLETE', generationStarted: true, completedAtObserved: `2026-09-02T00:00:1${this.waitCalls}.000Z`, inspectedAssistantOutput: false }; }
}

function chat() {
  return { scope: 'SPECIALIST', chatId: 'spec', label: 'Specialist', url: 'https://chatgpt.com/c/spec-chat', workerId: 'worker-a', pinned: false, capabilityChallengeId: 'challenge-spec', modelLabels: { extraHigh: 'Extra High', pro: 'Pro' } };
}

function challengeEvidence() {
  return {
    eventId: 'challenge', sequence: 1, occurredAt: '2026-09-02T00:00:00.000Z', data: {
      type: 'evidence_receipt_recorded', receipt_id: 'challenge', summary: CAPABILITY_CHALLENGE_SUMMARY, verified: true,
      refs: ['challenge:challenge-spec', 'chat:spec', 'mc_nonce:mc-secret', 'github_nonce_sha256:deadbeef', 'github_nonce_source:https://github.com/o/r/issues/2', 'receipt_target:https://github.com/o/r/issues/2', 'stage_receipt_target:https://github.com/o/r/issues/3', 'expires_at:2099-09-03T00:00:00.000Z'],
    },
  };
}

function capabilityEvidence() {
  return [
    challengeEvidence(),
    { eventId: 'tool-cap', sequence: 2, occurredAt: '2026-09-02T00:00:00.000Z', data: { type: 'evidence_receipt_recorded', receipt_id: 'tool-cap', summary: CAPABILITY_VERIFIED_SUMMARY, verified: true, refs: ['challenge:challenge-spec', 'chat:spec', 'capability:missionControlRead', 'capability:githubRead', 'capability:githubWrite', 'expires_at:2099-09-03T00:00:00.000Z'] } },
    { eventId: 'mode-cap', sequence: 3, occurredAt: '2026-09-02T00:00:00.000Z', data: { type: 'evidence_receipt_recorded', receipt_id: 'mode-cap', summary: MODE_CAPABILITY_VERIFIED_SUMMARY, verified: true, refs: ['chat:spec', 'capability:modeSwitching', 'extra_high_label:Extra High', 'pro_label:Pro', 'expires_at:2099-09-03T00:00:00.000Z'] } },
  ];
}

function stageLivenessEvidence(id, stage, status, occurredAt) {
  return {
    eventId: id, sequence: 40, occurredAt, data: {
      type: 'evidence_receipt_recorded', receipt_id: id, summary: STAGE_LIVENESS_SUMMARY, verified: true,
      refs: ['request:r-1', 'chat:spec', `stage:${stage}`, `status:${status}`, 'semantic_authority:false'],
    },
  };
}

function routeEvent() {
  const body = SUPERVISORY_CYCLE_ROUTE_PREFIX + JSON.stringify({
    schemaVersion: 2, packetKind: 'SAME_CHAT_SUPERVISORY_CYCLE', requestId: 'r-1', nonce: 'nonce-1', reasoningLane: 'PRO_ESCALATED',
    destination: 'SPECIALIST_SUPERVISOR_CHAT', destinationChatId: 'spec', providerDeliveryState: 'QUEUED_FOR_PROVIDER_RELAY',
    evidenceCapsule: { id: 'capsule-1', sha256: 'a'.repeat(64) }, ownerOutcome: { id: 'outcome-1', epoch: 1, sha256: 'b'.repeat(64) },
    githubReceipt: { repository: 'o/r', issueNumber: 1 }, factualPacket: { packetId: 'packet-1', taskId: 'task-1', exactFactualState: 'state', evidenceRefs: [], decisionRequested: 'decide' },
    queuedAt: '2026-09-02T00:00:00.000Z', expiresAt: '2099-09-03T00:00:00.000Z',
  });
  return { eventId: 'route', sequence: 10, occurredAt: '2026-09-02T00:00:00.000Z', data: { type: 'worker_message_recorded', message_id: 'message-1', body } };
}
