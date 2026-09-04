import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPABILITY_CHALLENGE_SUMMARY,
  CAPABILITY_VERIFIED_SUMMARY,
  MODE_CAPABILITY_VERIFIED_SUMMARY,
  PROVIDER_SESSION_CYCLE_ROUTE_PREFIX,
  PROVIDER_SESSION_MCP_SUMMARY,
  PROVIDER_SESSION_SUMMARY,
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

test('escalated route preloads the binding, then advances reader and Pro without Mission Control reselection in the same chat', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence() });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });

  const first = await runtime.cycle();
  assert.equal(first.status, 'MCP_BINDING_PRELOAD_GENERATION_STARTED');
  assert.equal(first.browserTabs.managedChatGptTabCount, 1);
  assert.equal(first.browserTabs.hardCeiling, 3);
  assert.equal(browser.submitCalls, 1);
  assert.equal(browser.freshChatCalls, 1);
  assert.match(store.state.deliveries['request:r-1'].conversationUrl, /^https:\/\/chatgpt\.com\/c\/fresh-/);
  assert.equal(mc.recordedEvidence.filter((item) => item.summary === RELAY_STAGE_SUMMARY).length, 1);
  const firstStage = mc.recordedEvidence.find((item) => item.summary === RELAY_STAGE_SUMMARY);
  assert.ok(firstStage.refs.includes('generation_state:STARTED'));
  assert.ok(firstStage.refs.includes('step:MCP_BINDING_PRELOAD'));
  assert.ok(firstStage.refs.includes('assistant_content_observed:false'));
  assert.ok(firstStage.refs.includes('semantic_authority:false'));

  const second = await runtime.cycle();
  assert.equal(second.status, 'MCP_BINDING_PRELOAD_COMPLETE');
  assert.equal(browser.submitCalls, 1);
  const stages = mc.recordedEvidence.filter((item) => item.summary === RELAY_STAGE_SUMMARY);
  assert.ok(stages.some((item) => item.refs.includes('generation_state:COMPLETE')));

  const third = await runtime.cycle();
  assert.equal(third.status, 'EXTRA_HIGH_READER_GENERATION_STARTED');
  assert.equal(browser.submitCalls, 2);
  assert.equal(browser.freshChatCalls, 1);
  assert.equal(await runtime.cycle().then((result) => result.status), 'EXTRA_HIGH_READER_COMPLETE');
  mc.evidence.push(stageLivenessEvidence('reader-complete', 'EXTRA_HIGH_READER', 'STAGE_COMPLETE', '2026-09-02T00:00:05.000Z', store.state.deliveries['request:r-1'].providerSessionId));
  const fifth = await runtime.cycle();
  assert.equal(fifth.status, 'PRO_REASONER_GENERATION_STARTED');
  assert.equal(browser.switchLabels.at(-1), 'Pro');
  assert.equal(browser.submitCalls, 3);
  assert.equal(browser.freshChatCalls, 1);
  assert.deepEqual(browser.selectAppsCalls, [
    { knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['Mission Control'], referencedLabels: [] },
  ]);
  const readerStart = mc.recordedEvidence.find((item) => item.summary === RELAY_STAGE_SUMMARY && item.refs.includes('step:EXTRA_HIGH_READER') && item.refs.includes('generation_state:STARTED'));
  assert.ok(readerStart.refs.includes('app_selection_attempted:false'));
  const proStart = mc.recordedEvidence.find((item) => item.summary === RELAY_STAGE_SUMMARY && item.refs.includes('step:PRO_REASONER') && item.refs.includes('generation_state:STARTED'));
  assert.ok(proStart.refs.includes('app_selection_attempted:false'));
});

test('ordinary direct work cannot precede preload and starts without a second Mission Control selection', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence(), routes: [routeEvent('r-1', 'route', 'EXTRA_HIGH_DIRECT')] });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });

  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_GENERATION_STARTED');
  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_COMPLETE');
  assert.equal((await runtime.cycle()).status, 'EXTRA_HIGH_DIRECT_GENERATION_STARTED');
  assert.equal(browser.submitCalls, 2);
  assert.equal(browser.freshChatCalls, 1);
  assert.deepEqual(browser.selectAppsCalls, [
    { knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['Mission Control'], referencedLabels: [] },
  ]);
  const directStart = mc.recordedEvidence.find((item) => item.summary === RELAY_STAGE_SUMMARY
    && item.refs.includes('step:EXTRA_HIGH_DIRECT') && item.refs.includes('generation_state:STARTED'));
  assert.ok(directStart.refs.includes('app_selection_attempted:false'));
  assert.ok(directStart.refs.includes('semantic_authority:false'));
  const exactSessionEvidence = mc.recordedEvidence.filter((item) => item.summary === PROVIDER_SESSION_SUMMARY
    && item.refs.includes('url_binding_status:EXACT') && item.refs.includes('lifecycle_status:ACTIVE'));
  assert.equal(exactSessionEvidence.length, 2);
  assert.equal(new Set(exactSessionEvidence.map((item) => item.receiptId)).size, 2);
  assert.ok(exactSessionEvidence.some((item) => item.refs.includes('binding_preload_receipt:PENDING')));
  assert.ok(exactSessionEvidence.some((item) => item.refs.some((ref) => ref.startsWith('binding_preload_receipt:mcp-'))));
});

test('fresh provider session is visible in Mission Control before the first send', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence(), projectionLagReads: 2 });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });

  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_GENERATION_STARTED');
  assert.ok(mc.fetchFleetCalls >= 3);
  assert.equal(browser.submitCalls, 1);
});

test('completed binding preload without its exact tool receipt fails before semantic work even after generic MCP contact', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence(), autoFirstTurnMcp: false });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });

  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_GENERATION_STARTED');
  const failedSessionId = store.state.deliveries['request:r-1'].providerSessionId;
  mc.evidence.push(genericMcpContactEvidence(failedSessionId));
  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_COMPLETE');
  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_RECEIPT_MISSING');
  assert.equal(browser.submitCalls, 1);
  assert.equal(store.state.providerSessions[failedSessionId].status, 'FAILED');
  await runtime.resolve('request:r-1', 'retry');
  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_GENERATION_STARTED');
  assert.equal(browser.submitCalls, 2);
  assert.equal(browser.freshChatCalls, 2);
  assert.notEqual(store.state.deliveries['request:r-1'].providerSessionId, failedSessionId);
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
  state.deliveries['request:r-1'] = { status: 'SUBMISSION_INTENT_RECORDED', supervisorId: 'spec', providerSessionId: 'provider-session:interrupted', bodySha256: 'a'.repeat(64), lastAttemptAt: '2026-09-02T00:00:00Z' };
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
  assert.match(browser.lastSubmittedBody, /selected Mission Control app/);
  assert.match(browser.lastSubmittedBody, /get_capability_challenge/);
  assert.match(browser.lastSubmittedBody, /github_nonce_source/);
  assert.equal(browser.lastSubmittedBody.includes('mc-secret'), false);
  assert.equal(browser.lastSubmittedBody.includes('gh-secret'), false);
  assert.deepEqual(browser.selectAppsCalls, [{ knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['Mission Control'], referencedLabels: ['GitHub'] }]);
  const second = await runtime.verifyCapabilities('spec');
  assert.equal(second.status, 'AWAITING_CAPABILITY_RECEIPT');
  assert.equal(browser.submitCalls, 1);
});

test('MCP preflight is a separately paced read-only send and never replays after generation completion', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: [challengeEvidence()] });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: false, capabilityTestEnabled: true });
  const first = await runtime.verifyMcpReadPreflight('spec');
  assert.equal(first.status, 'MCP_PREFLIGHT_GENERATION_COMPLETE');
  assert.equal(browser.submitCalls, 1);
  assert.equal(browser.waitCalls, 1);
  assert.equal(browser.switchLabels.at(-1), 'Extra High');
  assert.match(browser.lastSubmittedBody, /get_capability_challenge/);
  assert.match(browser.lastSubmittedBody, /do not use GitHub/);
  assert.match(browser.lastSubmittedBody, /do not write or mutate anything/);
  assert.equal(browser.lastSubmittedBody.includes('mc-secret'), false);
  assert.equal(browser.lastSubmittedBody.includes('gh-secret'), false);
  assert.deepEqual(browser.selectAppsCalls, [{ knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['Mission Control'], referencedLabels: [] }]);
  const second = await runtime.verifyMcpReadPreflight('spec');
  assert.equal(second.status, 'MCP_PREFLIGHT_GENERATION_COMPLETE');
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

test('fresh-session creation and every same-chat send share the global pacing gate without reselection', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence() });
  const browser = new FakeBrowser();
  const now = { value: Date.parse('2026-09-02T00:00:01.000Z') };
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true, now: () => now.value });

  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_GENERATION_STARTED');
  const completed = await runtime.cycle();
  assert.equal(completed.status, 'MCP_BINDING_PRELOAD_COMPLETE', JSON.stringify(completed));
  const before = structuredClone(store.state.deliveries['request:r-1']);
  const blocked = await runtime.cycle();
  assert.equal(blocked.status, 'GLOBAL_SUBMISSION_COOLDOWN');
  assert.equal(blocked.retryAfterMs, 60_000);
  assert.equal(browser.submitCalls, 1);
  assert.deepEqual(store.state.deliveries['request:r-1'], before);

  now.value += 60_000;
  assert.equal((await runtime.cycle()).status, 'EXTRA_HIGH_READER_GENERATION_STARTED');
  assert.equal(browser.submitCalls, 2);
  assert.deepEqual(browser.selectAppsCalls, [
    { knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['Mission Control'], referencedLabels: [] },
  ]);
  assert.equal(browser.appSelectionEvidence.length, 1);
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

test('an admitted canonical receipt completes the provider session and retains one reusable ChatGPT tab', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence() });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });
  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_GENERATION_STARTED');
  const providerSessionId = store.state.deliveries['request:r-1'].providerSessionId;
  const targetId = store.state.providerSessions[providerSessionId].targetId;
  mc.evidence.push({
    eventId: 'decision-current-session', sequence: 99, occurredAt: '2026-09-02T00:10:00.000Z', data: {
      type: 'github_decision_receipt_ingested', request_id: 'r-1', provider_session_id: providerSessionId,
      supervisor_id: 'spec', receipt_id: 'github-comment:1', reasoning_lane: 'PRO_ESCALATED',
      github_receipt: { repository: 'o/r', issue_number: 1, comment_id: 1, immutable_url: 'https://github.com/o/r/issues/1#issuecomment-1' },
    },
  });
  assert.equal((await runtime.cycle()).status, 'DECISION_RECEIPT_INGESTED');
  assert.equal(store.state.providerSessions[providerSessionId].status, 'COMPLETE');
  assert.equal(browser.closedTargets.includes(targetId), false);
  assert.equal(Object.values(store.state.tabs).some((tab) => tab?.providerSessionId === providerSessionId), false);
  assert.equal(store.state.tabs['reusable:chatgpt'].targetId, targetId);
  assert.equal(browser.targets.length, 1);
});

test('each admitted route gets a different fresh provider session and conversation', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence() });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });
  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_GENERATION_STARTED');
  const firstSession = store.state.deliveries['request:r-1'].providerSessionId;
  const firstUrl = store.state.deliveries['request:r-1'].conversationUrl;
  const firstTarget = store.state.providerSessions[firstSession].targetId;
  mc.evidence.push({ eventId: 'decision-r1', sequence: 90, occurredAt: '2026-09-02T00:10:00.000Z', data: { type: 'github_decision_receipt_ingested', request_id: 'r-1', provider_session_id: firstSession, supervisor_id: 'spec', receipt_id: 'github-comment:r1', reasoning_lane: 'PRO_ESCALATED', github_receipt: {} } });
  assert.equal((await runtime.cycle()).status, 'DECISION_RECEIPT_INGESTED');
  mc.routes.push(routeEvent('r-2', 'route-2'));
  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_GENERATION_STARTED');
  const secondSession = store.state.deliveries['request:r-2'].providerSessionId;
  const secondUrl = store.state.deliveries['request:r-2'].conversationUrl;
  assert.notEqual(secondSession, firstSession);
  assert.notEqual(secondUrl, firstUrl);
  assert.equal(store.state.providerSessions[secondSession].targetId, firstTarget);
  assert.equal(browser.freshChatCalls, 2);
  assert.equal(browser.createdTargetCalls, 1);
  assert.equal(browser.targets.length, 1);
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
  constructor({ evidence = [], routes = [routeEvent()], autoFirstTurnMcp = true, projectionLagReads = 0 } = {}) {
    this.evidence = [...evidence]; this.routes = [...routes]; this.recordedEvidence = []; this.sequence = 50;
    this.autoFirstTurnMcp = autoFirstTurnMcp; this.projectionLagReads = projectionLagReads; this.fetchFleetCalls = 0;
  }
  async fetchFleet() {
    this.fetchFleetCalls += 1;
    const visibleRecordedEvidence = this.fetchFleetCalls <= this.projectionLagReads ? [] : this.recordedEvidence;
    const timeline = [...this.routes, ...this.evidence, ...visibleRecordedEvidence.map((item) => ({
      eventId: `evidence-${item.receiptId}`, sequence: ++this.sequence, occurredAt: item.occurredAt ?? '2026-09-02T00:00:01.000Z', data: {
        type: 'evidence_receipt_recorded', receipt_id: item.receiptId, summary: item.summary, refs: item.refs, verified: true,
      },
    }))];
    return { generatedAt: '2026-09-02T00:00:00.000Z', workers: [{ id: 'worker-a', name: 'Worker A', timeline }] };
  }
  async recordEvidence(worker, input) {
    this.recordedEvidence.push({ worker, ...structuredClone(input) });
    if (this.autoFirstTurnMcp && input.summary === RELAY_STAGE_SUMMARY && input.refs.includes('generation_state:STARTED')
      && input.refs.includes('step:MCP_BINDING_PRELOAD')) {
      const request = input.refs.find((ref) => ref.startsWith('request:'));
      const supervisor = input.refs.find((ref) => ref.startsWith('supervisor:'));
      const providerSession = input.refs.find((ref) => ref.startsWith('provider_session:'));
      this.evidence.push({ eventId: `mcp-${request}`, sequence: ++this.sequence, occurredAt: input.occurredAt, data: {
        type: 'evidence_receipt_recorded', receipt_id: `mcp-${request}`, summary: PROVIDER_SESSION_MCP_SUMMARY,
        refs: [request, supervisor, providerSession, 'tool:get_supervisory_request_binding', 'status:OK', 'server_observed:true'], verified: true,
      } });
    }
    return { eventId: `stored-${input.receiptId}` };
  }
}

class FakeBrowser {
  constructor({ submitErrorStage = null } = {}) {
    this.submitErrorStage = submitErrorStage;
    this.submitCalls = 0; this.waitCalls = 0; this.modeRoundTripCalls = 0; this.freshChatCalls = 0; this.createdTargetCalls = 0; this.switchLabels = []; this.targets = []; this.closedTargets = []; this.lastSubmittedBody = null;
    this.selectAppsCalls = []; this.appSelectionEvidence = []; this.selectedApps = [];
  }
  async doctor() { return { browser: 'Fake', targetCount: this.targets.length, managedChatGptTabCount: this.targets.filter((target) => target.url.startsWith('https://chatgpt.com/')).length }; }
  async listTargets() { return structuredClone(this.targets); }
  async closeTarget(id) { this.closedTargets.push(id); this.targets = this.targets.filter((target) => target.id !== id); return true; }
  async activateTarget() { return true; }
  async createFreshChatTarget({ reusableTargetId = null } = {}) {
    this.freshChatCalls += 1;
    const reusable = this.targets.find((target) => target.id === reusableTargetId) ?? this.targets.find((target) => target.url.startsWith('https://chatgpt.com/'));
    if (reusable) {
      reusable.url = 'https://chatgpt.com/';
      return { ...reusable, created: false, reused: true, webSocketDebuggerUrl: 'ws://fake' };
    }
    this.createdTargetCalls += 1;
    const target = { id: `target-fresh-${this.freshChatCalls}`, type: 'page', url: 'https://chatgpt.com/', created: true, webSocketDebuggerUrl: 'ws://fake' };
    this.targets.push(target);
    return target;
  }
  async findOrCreateChatTarget(url) {
    const existing = this.targets.find((target) => target.url === url);
    if (existing) return { ...existing, created: false, webSocketDebuggerUrl: 'ws://fake' };
    const target = { id: 'target-spec', type: 'page', url, created: true, webSocketDebuggerUrl: 'ws://fake' };
    this.targets.push(target); return target;
  }
  async verifyModelRoundTrip() { this.modeRoundTripCalls += 1; return { status: 'MODE_ROUND_TRIP_VERIFIED', extraHighObserved: 'Extra High', proObserved: 'Pro' }; }
  async switchModel(target, { label }) { this.switchLabels.push(label); return { selectedLabel: label, observedLabel: label, changed: true }; }
  async selectAppsForMessage(target, input) {
    this.selectAppsCalls.push(structuredClone(input));
    const evidence = {
      status: 'MESSAGE_APPS_SELECTED', requiredLabels: [...input.requiredLabels], selectedLabels: [...input.requiredLabels],
      clearedPriorLabels: [...this.selectedApps], verifiedChipCounts: Object.fromEntries(input.knownLabels.map((label) => [label, input.requiredLabels.includes(label) ? 1 : 0])), inspectedAssistantOutput: false,
    };
    this.selectedApps = [...input.requiredLabels];
    this.appSelectionEvidence.push(evidence);
    return evidence;
  }
  async submitExactMessage(target, input) {
    this.submitCalls += 1; this.lastSubmittedBody = input.body;
    if (this.submitErrorStage) { const error = new Error('simulated send uncertainty'); error.relayStage = this.submitErrorStage; throw error; }
    if (target.url === 'https://chatgpt.com/') target.url = `https://chatgpt.com/c/fresh-${this.freshChatCalls}`;
    return { status: 'GENERATION_STARTED', generationStarted: true, startSignal: 'STOP_CONTROL_VISIBLE', startedAtObserved: `2026-09-02T00:00:0${this.submitCalls}.000Z`, bodySha256: input.bodySha256, conversationUrl: target.url };
  }
  async waitForGenerationComplete() { this.waitCalls += 1; return { status: 'GENERATION_COMPLETE', generationStarted: true, completedAtObserved: `2026-09-02T00:00:1${this.waitCalls}.000Z`, inspectedAssistantOutput: false }; }
}

function chat() {
  return { scope: 'SPECIALIST', supervisorId: 'spec', label: 'Specialist', workerId: 'worker-a', pinned: false, bootstrapCapability: { chatId: 'spec-bootstrap', url: 'https://chatgpt.com/c/spec-chat', challengeId: 'challenge-spec' }, modelLabels: { extraHigh: 'Extra High', pro: 'Pro' }, requiredApps: { missionControl: 'Mission Control', github: 'GitHub' } };
}

function challengeEvidence() {
  return {
    eventId: 'challenge', sequence: 1, occurredAt: '2026-09-02T00:00:00.000Z', data: {
      type: 'evidence_receipt_recorded', receipt_id: 'challenge', summary: CAPABILITY_CHALLENGE_SUMMARY, verified: true,
      refs: ['challenge:challenge-spec', 'chat:spec-bootstrap', 'mc_nonce:mc-secret', 'github_nonce_sha256:deadbeef', 'github_nonce_source:https://github.com/o/r/issues/2', 'receipt_target:https://github.com/o/r/issues/2', 'stage_receipt_target:https://github.com/o/r/issues/3', 'expires_at:2099-09-03T00:00:00.000Z'],
    },
  };
}

function capabilityEvidence() {
  return [
    challengeEvidence(),
    { eventId: 'tool-cap', sequence: 2, occurredAt: '2026-09-02T00:00:00.000Z', data: { type: 'evidence_receipt_recorded', receipt_id: 'tool-cap', summary: CAPABILITY_VERIFIED_SUMMARY, verified: true, refs: ['challenge:challenge-spec', 'chat:spec-bootstrap', 'capability:missionControlRead', 'capability:githubRead', 'capability:githubWrite', 'expires_at:2099-09-03T00:00:00.000Z'] } },
    { eventId: 'mode-cap', sequence: 3, occurredAt: '2026-09-02T00:00:00.000Z', data: { type: 'evidence_receipt_recorded', receipt_id: 'mode-cap', summary: MODE_CAPABILITY_VERIFIED_SUMMARY, verified: true, refs: ['chat:spec-bootstrap', 'capability:modeSwitching', 'extra_high_label:Extra High', 'pro_label:Pro', 'expires_at:2099-09-03T00:00:00.000Z'] } },
  ];
}

function stageLivenessEvidence(id, stage, status, occurredAt, providerSessionId) {
  return {
    eventId: id, sequence: 40, occurredAt, data: {
      type: 'evidence_receipt_recorded', receipt_id: id, summary: STAGE_LIVENESS_SUMMARY, verified: true,
      refs: ['request:r-1', 'supervisor:spec', `provider_session:${providerSessionId}`, `stage:${stage}`, `status:${status}`, 'semantic_authority:false'],
    },
  };
}

function genericMcpContactEvidence(providerSessionId) {
  return {
    eventId: 'generic-mcp-contact', sequence: 41, occurredAt: '2026-09-02T00:00:05.000Z', data: {
      type: 'evidence_receipt_recorded', receipt_id: 'generic-mcp-contact', summary: 'MISSION_CONTROL_PUBLIC_MCP_TRANSPORT_V1', verified: true,
      refs: ['request:r-1', 'supervisor:spec', `provider_session:${providerSessionId}`, 'jsonrpc_method:initialize', 'server_observed:true', 'semantic_authority:false'],
    },
  };
}

function routeEvent(requestId = 'r-1', eventId = 'route', reasoningLane = 'PRO_ESCALATED') {
  const body = PROVIDER_SESSION_CYCLE_ROUTE_PREFIX + JSON.stringify({
    schemaVersion: 3, packetKind: 'PROVIDER_SESSION_SUPERVISORY_CYCLE', requestId, nonce: `nonce-${requestId}`, reasoningLane,
    destination: 'SPECIALIST_SUPERVISOR_CHAT', destinationSupervisorId: 'spec', providerDeliveryState: 'QUEUED_FOR_PROVIDER_RELAY',
    evidenceCapsule: { id: 'capsule-1', sha256: 'a'.repeat(64) }, ownerOutcome: { id: 'outcome-1', epoch: 1, sha256: 'b'.repeat(64) },
    githubReceipt: { repository: 'o/r', issueNumber: 1 }, factualPacket: { packetId: 'packet-1', taskId: 'task-1', exactFactualState: 'state', evidenceRefs: [], decisionRequested: 'decide' },
    queuedAt: '2026-09-02T00:00:00.000Z', expiresAt: '2099-09-03T00:00:00.000Z',
  });
  return { eventId, sequence: requestId === 'r-1' ? 10 : 11, occurredAt: '2026-09-02T00:00:00.000Z', data: { type: 'worker_message_recorded', message_id: `message-${requestId}`, body } };
}
