import assert from 'node:assert/strict';
import test from 'node:test';
import { INTERNAL_ROUTE_PREFIX, defaultState } from '../src/core.mjs';
import { RelayRuntime } from '../src/relay.mjs';

const normalMetrics = {
  totalMb: 16_000,
  availableMb: 8_000,
  usedMb: 8_000,
  swapTotalMb: 2_000,
  swapUsedMb: 0,
  browserRssMb: 2_000,
  sampledAt: '2026-09-02T00:00:00.000Z',
};

test('dry-run reports the exact queued route without touching the browser conversation', async () => {
  const store = new MemoryStateStore();
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, browser, submitEnabled: false });
  const result = await runtime.cycle();
  assert.equal(result.status, 'DRY_RUN_ROUTE_READY');
  assert.equal(result.route.bodySha256.length, 64);
  assert.equal(browser.findCalls, 0);
  assert.equal(browser.submitCalls, 0);
});

test('enabled cycle persists intent before the browser click and confirms once', async () => {
  const store = new MemoryStateStore();
  const browser = new FakeBrowser({
    onSubmit: () => {
      assert.equal(store.state.deliveries['request:r-1'].status, 'SUBMISSION_INTENT_RECORDED');
      return {
        status: 'SUBMITTED_CONFIRMED',
        targetId: 'target-spec',
        bodySha256: store.state.deliveries['request:r-1'].bodySha256,
        submittedAtObserved: '2026-09-02T00:00:01.000Z',
      };
    },
  });
  const runtime = makeRuntime({ store, browser, submitEnabled: true });
  const result = await runtime.cycle();
  assert.equal(result.status, 'SUBMITTED_CONFIRMED');
  assert.equal(store.state.deliveries['request:r-1'].status, 'SUBMITTED_CONFIRMED');
  assert.equal(browser.submitCalls, 1);

  const second = await runtime.cycle();
  assert.equal(second.status, 'IDLE');
  assert.equal(browser.submitCalls, 1);
});

test('error after click becomes ambiguous and is never automatically replayed', async () => {
  const store = new MemoryStateStore();
  const browser = new FakeBrowser({
    onSubmit: () => {
      const error = new Error('confirmation timed out');
      error.relayStage = 'CLICKED';
      throw error;
    },
    outboundPresent: false,
  });
  const runtime = makeRuntime({ store, browser, submitEnabled: true });
  const result = await runtime.cycle();
  assert.equal(result.status, 'SUBMISSION_AMBIGUOUS');
  assert.equal(store.state.deliveries['request:r-1'].status, 'AMBIGUOUS_AFTER_RESTART');
  assert.equal(browser.submitCalls, 1);

  const second = await runtime.cycle();
  assert.equal(second.status, 'AMBIGUITY_REQUIRES_OPERATOR');
  assert.equal(browser.submitCalls, 1);
  assert.equal(browser.outboundChecks, 1);
});

test('error before click is retryable only after the configured delay', async () => {
  const store = new MemoryStateStore();
  const browser = new FakeBrowser({
    onSubmit: () => {
      const error = new Error('send button unavailable');
      error.relayStage = 'READY_TO_CLICK';
      throw error;
    },
  });
  const runtime = makeRuntime({ store, browser, submitEnabled: true, retryDelayMs: 86_400_000 });
  const result = await runtime.cycle();
  assert.equal(result.status, 'SUBMISSION_FAILED_RETRYABLE');
  assert.equal(store.state.deliveries['request:r-1'].status, 'FAILED_RETRYABLE');
  const second = await runtime.cycle();
  assert.equal(second.status, 'IDLE');
  assert.equal(browser.submitCalls, 1);
});

test('ambiguous intent is reconciled from the exact outbound user message without another click', async () => {
  const state = defaultState();
  state.deliveries['request:r-1'] = {
    status: 'SUBMISSION_INTENT_RECORDED',
    chatId: 'spec',
    bodySha256: 'x'.repeat(64),
    lastAttemptAt: '2026-09-02T00:00:00.000Z',
  };
  const store = new MemoryStateStore(state);
  const browser = new FakeBrowser({ outboundPresent: true });
  const runtime = makeRuntime({ store, browser, submitEnabled: true });
  const result = await runtime.cycle();
  assert.equal(result.status, 'AMBIGUITY_RECONCILED_AS_SUBMITTED');
  assert.equal(store.state.deliveries['request:r-1'].status, 'SUBMITTED_CONFIRMED');
  assert.equal(browser.submitCalls, 0);
  assert.equal(browser.outboundChecks, 1);
});

test('hard memory pressure closes inactive managed tabs and performs no queue submission', async () => {
  const store = new MemoryStateStore();
  store.state.tabs = {
    pm: { targetId: 'target-pm', lastUsedAt: '2026-09-02T00:00:00Z' },
    spec: { targetId: 'target-spec', lastUsedAt: '2026-09-01T00:00:00Z' },
  };
  const browser = new FakeBrowser({
    targets: [
      { id: 'target-pm', type: 'page', url: 'https://chatgpt.com/c/pm-chat' },
      { id: 'target-spec', type: 'page', url: 'https://chatgpt.com/c/spec-chat' },
    ],
  });
  const runtime = makeRuntime({
    store,
    browser,
    submitEnabled: true,
    memoryReader: async () => ({ ...normalMetrics, availableMb: 1500 }),
  });
  const result = await runtime.cycle();
  assert.equal(result.status, 'PAUSED_MEMORY_HARD');
  assert.equal(browser.submitCalls, 0);
  assert.deepEqual(browser.closedTargets, ['target-spec']);
});

function makeRuntime({ store, browser, submitEnabled, retryDelayMs = 300_000, memoryReader = async () => normalMetrics }) {
  const config = {
    missionControl: {},
    browser: { profileDir: '/tmp/test-profile' },
    runtime: {
      chats: [
        { scope: 'PROJECT_MANAGER', chatId: 'pm', label: 'PM', url: 'https://chatgpt.com/c/pm-chat', workerId: null, pinned: true },
        { scope: 'SPECIALIST', chatId: 'spec', label: 'Specialist', url: 'https://chatgpt.com/c/spec-chat', workerId: 'worker-a', pinned: false },
      ],
      submitEnabled,
      retryDelayMs,
      maxHotTabs: 3,
    },
    memory: {
      softAvailableMb: 4096,
      hardAvailableMb: 2048,
      softBrowserRssMb: 7168,
      hardBrowserRssMb: 9216,
      softSwapUsedMb: 512,
      hardSwapUsedMb: 1536,
    },
  };
  return new RelayRuntime({
    config,
    missionControl: { fetchFleet: async () => fleetSnapshot() },
    browser,
    stateStore: store,
    memoryReader,
    logger: { log() {}, warn() {}, error() {} },
  });
}

class MemoryStateStore {
  constructor(initial = defaultState()) {
    this.state = structuredClone(initial);
    this.status = null;
    this.history = [];
  }
  async read() { return structuredClone(this.state); }
  async write(value) {
    this.state = structuredClone(value);
    this.history.push(structuredClone(value));
    return structuredClone(value);
  }
  async writeStatus(value) { this.status = structuredClone(value); }
}

class FakeBrowser {
  constructor({ onSubmit = null, outboundPresent = false, targets = [] } = {}) {
    this.onSubmit = onSubmit;
    this.outboundPresent = outboundPresent;
    this.targets = targets;
    this.findCalls = 0;
    this.submitCalls = 0;
    this.outboundChecks = 0;
    this.closedTargets = [];
  }
  async doctor() { return { browser: 'Fake', targetCount: this.targets.length }; }
  async listTargets() { return structuredClone(this.targets); }
  async closeTarget(id) {
    this.closedTargets.push(id);
    this.targets = this.targets.filter((target) => target.id !== id);
    return true;
  }
  async findOrCreateChatTarget(url) {
    this.findCalls += 1;
    const existing = this.targets.find((target) => target.url === url);
    if (existing) return { ...existing, created: false, webSocketDebuggerUrl: 'ws://fake' };
    const id = url.includes('spec') ? 'target-spec' : 'target-pm';
    const target = { id, type: 'page', url, created: true, webSocketDebuggerUrl: 'ws://fake' };
    this.targets.push(target);
    return target;
  }
  async submitExactMessage(target, input) {
    this.submitCalls += 1;
    return this.onSubmit ? this.onSubmit(target, input) : { status: 'SUBMITTED_CONFIRMED', targetId: target.id, bodySha256: input.bodySha256 };
  }
  async outboundMessagePresent() {
    this.outboundChecks += 1;
    return this.outboundPresent;
  }
}

function fleetSnapshot() {
  return {
    generatedAt: '2026-09-02T00:00:00.000Z',
    workers: [{
      id: 'worker-a',
      name: 'Worker A',
      timeline: [{
        eventId: 'event-r-1',
        occurredAt: '2026-09-02T00:00:00.000Z',
        data: {
          type: 'worker_message_recorded',
          message_id: 'message-r-1',
          body: routeBody(),
        },
      }],
    }],
  };
}

function routeBody() {
  return INTERNAL_ROUTE_PREFIX + JSON.stringify({
    schemaVersion: 1,
    packetKind: 'FACTUAL_STATE_ONLY',
    requestId: 'r-1',
    actionBlockedOrRouted: 'AUTHOR_PROPOSAL',
    destination: 'SPECIALIST_SUPERVISOR_CHAT',
    destinationChatId: 'spec',
    providerDeliveryState: 'QUEUED_FOR_PROVIDER_RELAY',
    queuedAt: '2026-09-02T00:00:00.000Z',
    factualPacket: {
      packetId: 'packet-r-1',
      taskId: 'task-a',
      exactFactualState: 'Exact factual state.',
      evidenceRefs: [],
      decisionRequested: 'Return a bounded decision.',
    },
  });
}
