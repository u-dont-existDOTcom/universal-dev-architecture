import assert from 'node:assert/strict';
import test from 'node:test';

import { ChromeDevtoolsBrowser } from '../src/cdp.mjs';
import { defaultState, parseChatDirectory, sha256 } from '../src/core.mjs';
import { CentralSubmissionScheduler as RelaySubmissionScheduler } from '../src/submission-pacing.mjs';
import {
  CentralSubmissionScheduler as MissionControlSubmissionScheduler,
  defaultSchedulerState,
} from '../src/submission-scheduler-service.mjs';

test('CDP disconnect after click dispatch is reported as crossed uncertainty', async () => {
  const transport = controlledClickDisconnectTransport();
  const browser = new ChromeDevtoolsBrowser({
    WebSocketImpl: transport.WebSocketImpl,
    pageReadyTimeoutMs: 100,
    submitTimeoutMs: 100,
  });
  const body = 'bounded synthetic request';
  let caught = null;
  try {
    await browser.submitExactMessage({
      id: 'target-controlled',
      webSocketDebuggerUrl: 'ws://controlled/page',
    }, {
      expectedUrl: 'https://chatgpt.com/',
      body,
      bodySha256: 'a'.repeat(64),
      onBeforeSubmissionBoundary: async () => {},
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.match(caught.message, /WebSocket closed/);
  assert.equal(caught.relayStage, 'CLICK_DISPATCHED');
  assert.equal(caught.preBoundaryAbortConfirmed, undefined);
  assert.equal(transport.clickDispatches, 1);
  assert.equal(transport.callFunctionCount, 4);
});

function controlledClickDisconnectTransport() {
  const state = { clickDispatches: 0, callFunctionCount: 0 };
  class ControlledWebSocket {
    constructor() {
      this.listeners = new Map();
      queueMicrotask(() => this.emit('open', {}));
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    send(raw) {
      const message = JSON.parse(raw);
      if (message.method === 'Runtime.callFunctionOn') {
        state.callFunctionCount += 1;
        if (state.callFunctionCount === 4) {
          state.clickDispatches += 1;
          queueMicrotask(() => this.emit('close', {}));
          return;
        }
      }
      queueMicrotask(() => this.respond(message));
    }

    close() {}

    respond(message) {
      if (message.method === 'Runtime.evaluate') {
        this.emit('message', { data: JSON.stringify({
          id: message.id,
          result: { result: { objectId: 'global-object' } },
        }) });
        return;
      }
      if (message.method === 'Runtime.callFunctionOn') {
        const values = [
          { currentUrl: 'https://chatgpt.com/', urlMismatch: false, composerFound: true, loginRequired: false },
          { ok: true, alreadyExact: true },
          { exact: true, length: 'bounded synthetic request'.length },
        ];
        this.emit('message', { data: JSON.stringify({
          id: message.id,
          result: { result: { value: values[state.callFunctionCount - 1] } },
        }) });
        return;
      }
      this.emit('message', { data: JSON.stringify({ id: message.id, result: {} }) });
    }

    emit(type, event) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
  }

  return {
    WebSocketImpl: ControlledWebSocket,
    get clickDispatches() { return state.clickDispatches; },
    get callFunctionCount() { return state.callFunctionCount; },
  };
}

test('central authority rejects a CDP crossed-boundary abort and restart cannot resend', async () => {
  const now = { value: Date.parse('2026-09-18T12:00:00.000Z') };
  const centralStore = new MemoryStore(defaultSchedulerState('2026-09-18T11:00:00.000Z'));
  let central = centralScheduler(centralStore, now);
  await central.activateLease(primaryLease());
  const transport = controlledClickDisconnectTransport();
  const browser = new ChromeDevtoolsBrowser({
    WebSocketImpl: transport.WebSocketImpl,
    pageReadyTimeoutMs: 100,
    submitTimeoutMs: 100,
  });
  const localStore = new MemoryStore(defaultState());
  let abortCalls = 0;
  const context = requestBoundSubmissionContext();
  const submit = async (scheduler) => scheduler.submit({
    context,
    submit: (onBoundary, _admission, validateBeforeClick) => browser.submitExactMessage({
      id: 'owned-target-test',
      webSocketDebuggerUrl: 'ws://controlled/page',
    }, {
      expectedUrl: 'https://chatgpt.com/',
      body: 'bounded synthetic request',
      bodySha256: context.bodySha256,
      onBeforeSubmissionBoundary: validateBeforeClick,
      onSubmissionBoundary: onBoundary,
    }),
  });
  const first = new RelaySubmissionScheduler({
    schedulerClient: relayClient(central, () => { abortCalls += 1; }),
    stateStore: localStore,
    host: relayHost(),
    minIntervalMs: 60_000,
    now: () => now.value,
  });
  await assert.rejects(submit(first), (error) => error?.relayStage === 'CLICK_DISPATCHED');
  assert.equal(abortCalls, 0);
  assert.equal(transport.clickDispatches, 1);
  assert.equal(centralStore.state.admissions[0].status, 'ADMITTED');

  now.value += 30_001;
  central = centralScheduler(centralStore, now);
  await central.activateLease(primaryLease());
  const restarted = new RelaySubmissionScheduler({
    schedulerClient: relayClient(central, () => { abortCalls += 1; }),
    stateStore: localStore,
    host: relayHost(),
    minIntervalMs: 60_000,
    now: () => now.value,
  });
  await assert.rejects(submit(restarted), (error) => error?.code === 'SUBMISSION_RESTART_AMBIGUITY');
  assert.equal(abortCalls, 0);
  assert.equal(transport.clickDispatches, 1);
  assert.equal(centralStore.state.admissions[0].status, 'AMBIGUOUS_AFTER_RESTART');
});

function centralScheduler(store, now) {
  return new MissionControlSubmissionScheduler({
    stateStore: store,
    chats: parseChatDirectory([supervisorChat()]),
    producerBindings: {
      'collector:relay': {
        hostAlias: 'primary',
        hostRole: 'PRIMARY',
        automationWindowId: 101,
        ownedTargetIds: ['owned-target-test'],
      },
    },
    producerAttestors: {
      'collector:relay': 'primary-attestor-test-' + 'a'.repeat(32),
    },
    pacingDomain: 'account:test',
    minIntervalMs: 60_000,
    admissionTtlMs: 30_000,
    now: () => now.value,
  });
}

function relayClient(central, onAbort) {
  const producerId = 'collector:relay';
  return {
    async status() {
      const [status, binding] = await Promise.all([
        central.status(),
        central.producerBinding(producerId),
      ]);
      return {
        ...status,
        authenticatedRelayBinding: {
          ...binding,
          ownedTargetCount: binding.ownedTargetIds.length,
          ownedTargetIdsSha256: sha256(JSON.stringify(binding.ownedTargetIds)),
        },
      };
    },
    admit: (input) => central.admit(input, producerId),
    validateAdmission: (input) => central.validateAdmission(input, producerId),
    recordBoundary: (input) => central.recordBoundary(input, producerId),
    bindTarget: (input) => central.bindTarget(input, producerId),
    recordRateLimit: (input) => central.recordRateLimit(input, producerId),
    recordOutcome: (input) => central.recordOutcome(input, producerId),
    async abortBeforeBoundary(input) {
      onAbort();
      return central.abortBeforeBoundary(input, producerId);
    },
  };
}

function requestBoundSubmissionContext() {
  return {
    requestId: 'request:cdp-crossed',
    authorizationRef: 'request:cdp-crossed',
    queueKey: 'request:cdp-crossed:REQUEST_BOUND_DECISION',
    sendPath: 'SUPERVISORY_CYCLE_REQUEST_BOUND_DECISION',
    supervisorId: 'spec',
    registrationId: 'registration:spec:test',
    targetId: 'owned-target-test',
    automationWindowId: 101,
    targetKind: 'FRESH_PROVIDER_SESSION',
    targetKey: 'provider-session:request:cdp-crossed',
    expectedUrlSha256: sha256('https://chatgpt.com/'),
    bodySha256: sha256('bounded synthetic request'),
    hash: sha256,
  };
}

function relayHost() {
  return {
    alias: 'primary',
    role: 'PRIMARY',
    deploymentEpoch: 1,
    leaseId: 'lease-primary-1',
  };
}

function primaryLease() {
  return {
    schemaVersion: 1,
    leaseId: 'lease-primary-1',
    epoch: 1,
    activeHostAlias: 'primary',
    activeHostRole: 'PRIMARY',
    issuedAt: '2026-09-18T11:59:00.000Z',
    expiresAt: '2026-09-18T13:00:00.000Z',
    splitBrainStatus: 'SINGLE_ACTIVE_CONFIRMED',
    takeover: null,
  };
}
function supervisorChat() {
  return {
    scope: 'SPECIALIST',
    supervisorId: 'spec',
    label: 'Dedicated supervisor',
    workerId: 'worker-a',
    pinned: false,
    registrationId: 'registration:spec:test',
    ownership: 'MISSION_CONTROL_ONLY',
    purpose: 'Dedicated Mission Control test supervision only.',
    accountAlias: 'account:test',
    workspaceAlias: 'workspace:test',
    privateLocatorRef: 'private-config:supervisors/spec',
    registrationProvenance: {
      registeredBy: 'OWNER',
      registeredAt: '2026-09-18T11:00:00.000Z',
      sourceRef: 'owner-requirement:test',
    },
    bootstrapCapability: {
      chatId: 'bootstrap-test',
      url: 'https://chatgpt.com/c/bootstrap-test',
      challengeId: 'challenge-test',
    },
    consumerControls: {
      modelVisibleLabel: 'GPT-5.6 Sol',
      thinkingControlLabel: 'Thinking effort',
      thinkingVisibleLabel: 'Extra High',
      thinkingOrdinal: '4 of 5',
      accountPlanLabel: 'Pro',
      accountPlanRole: 'PROVENANCE_METADATA_ONLY',
      accountPlanIsReasoningMode: false,
    },
    requiredApps: {
      missionControl: 'Mission Control',
      github: 'GitHub',
    },
  };
}

class MemoryStore {
  constructor(state) {
    this.state = structuredClone(state);
  }

  async read() {
    return structuredClone(this.state);
  }

  async write(value) {
    this.state = structuredClone(value);
    return structuredClone(value);
  }
}

test('confirmed pre-click retry preserves one fresh-session queue identity', async () => {
  const now = { value: Date.parse('2026-09-18T12:00:00.000Z') };
  const store = new MemoryStore(defaultSchedulerState('2026-09-18T11:00:00.000Z'));
  const central = centralScheduler(store, now);
  await central.activateLease(primaryLease());
  const { hash: _hash, ...request } = requestBoundSubmissionContext();
  const first = await central.admit({
    ...request,
    hostAlias: 'primary',
    hostRole: 'PRIMARY',
    deploymentEpoch: 1,
    leaseId: 'lease-primary-1',
    retryRootKey: request.queueKey,
  }, 'collector:relay');
  const aborted = await central.abortBeforeBoundary({
    admissionId: first.admissionId,
    relayStage: 'PREPARING',
    failureKind: 'PRECLICK_FAILURE',
  }, 'collector:relay');
  assert.equal(aborted.aborted, true);
  const retry = await central.admit({
    ...request,
    hostAlias: 'primary',
    hostRole: 'PRIMARY',
    deploymentEpoch: 1,
    leaseId: 'lease-primary-1',
    retryRootKey: request.queueKey,
  }, 'collector:relay');
  assert.equal(retry.queueItemId, first.queueItemId);
  assert.equal(store.state.queueItems.length, 1);
  assert.equal(store.state.queueItems[0].admissionIds.length, 2);
  assert.equal(store.state.queueItems[0].request.targetKey, request.targetKey);
  await assert.rejects(central.admit({
    ...request,
    hostAlias: 'primary',
    hostRole: 'PRIMARY',
    deploymentEpoch: 1,
    leaseId: 'lease-primary-1',
    retryRootKey: request.queueKey,
    targetKey: request.targetKey + ':changed',
  }, 'collector:relay'), (error) => error?.code === 'SUBMISSION_QUEUE_KEY_CONFLICT');
});
