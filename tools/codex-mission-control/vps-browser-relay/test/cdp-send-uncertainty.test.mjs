import assert from 'node:assert/strict';
import test from 'node:test';

import { ChromeDevtoolsBrowser, GITHUB_APP_MENTION } from '../src/cdp.mjs';
import { defaultState, parseChatDirectory, sha256 } from '../src/core.mjs';
import { CentralSubmissionScheduler as RelaySubmissionScheduler } from '../src/submission-pacing.mjs';
import {
  CentralSubmissionScheduler as MissionControlSubmissionScheduler,
  defaultSchedulerState,
} from '../src/submission-scheduler-service.mjs';

for (const code of ['UNEXPECTED_APP_CONFIRMATION', 'APP_CONFIRMATION_CONTROL_MISSING', 'APP_CONFIRMATION_REVALIDATION_FAILED']) {
  test(`generation polling propagates ${code} without waiting for the generation timeout`, async () => {
    const transport = passiveGenerationTransport();
    const browser = new ChromeDevtoolsBrowser({
      WebSocketImpl: transport.WebSocketImpl,
      generationTimeoutMs: 1_000,
    });
    let polls = 0;
    await assert.rejects(
      browser.waitForGenerationComplete({
        id: 'confirmation-policy-target',
        webSocketDebuggerUrl: 'ws://controlled/page',
      }, {
        expectedUrl: 'https://chatgpt.com/c/confirmation-policy',
        generationStarted: true,
        onGenerationPoll: async () => {
          polls += 1;
          throw Object.assign(new Error(code), { code });
        },
      }),
      (error) => error?.code === code,
    );
    assert.equal(polls, 1);
  });
}

test('generation polling reports a canonicalized conversation URL before journal callbacks run', async () => {
  const canonical = 'https://chatgpt.com/c/stable-journal';
  const transport = canonicalizingGenerationTransport(canonical);
  const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: transport.WebSocketImpl, generationTimeoutMs: 3_000 });
  const observedUrls = [];
  const completed = await browser.waitForGenerationComplete({
    id: 'canonicalizing-target', webSocketDebuggerUrl: 'ws://controlled/page',
  }, {
    expectedUrl: 'https://chatgpt.com/c/WEB:provisional-journal',
    generationStarted: true,
    onGenerationPoll: async (expectedUrl) => { observedUrls.push(expectedUrl); },
  });
  assert.equal(completed.conversationUrl, canonical);
  assert.equal(completed.conversationUrlCanonicalized, true);
  assert.deepEqual(observedUrls, [canonical, canonical, canonical, canonical]);
});

test('generation recovery signals preserve a newly canonicalized conversation URL', async () => {
  const canonical = 'https://chatgpt.com/c/stalled-journal';
  const transport = canonicalizingGenerationTransport(canonical, {
    systemsThinkingMoreThanUsual: true,
  });
  const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: transport.WebSocketImpl, generationTimeoutMs: 3_000 });

  await assert.rejects(
    browser.waitForGenerationComplete({
      id: 'canonicalizing-stalled-target', webSocketDebuggerUrl: 'ws://controlled/page',
    }, {
      expectedUrl: 'https://chatgpt.com/c/WEB:provisional-stalled-journal',
      generationStarted: true,
    }),
    (error) => error?.code === 'CHATGPT_SYSTEMS_THINKING_MORE_THAN_USUAL'
      && error?.conversationUrl === canonical,
  );
});

test('journal confirmation approval types a changed binding as a revalidation failure', async () => {
  const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: approvalRevalidationTransport() });
  await assert.rejects(
    browser.approveJournalWriteConfirmation({ id: 'approval-target', webSocketDebuggerUrl: 'ws://controlled/page' }, {
      expectedUrl: 'https://chatgpt.com/c/confirmation-policy', appName: 'InnerSignal', toolName: 'submit_journal_work_result', button: 'Always allow',
    }),
    (error) => error?.code === 'APP_CONFIRMATION_REVALIDATION_FAILED' && /BINDING_CHANGED/.test(error.message),
  );
});

function approvalRevalidationTransport() {
  return class ApprovalRevalidationWebSocket {
    constructor() { this.listeners = new Map(); queueMicrotask(() => this.emit('open', {})); }
    addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
    send(raw) {
      const message = JSON.parse(raw);
      const result = message.method === 'Runtime.evaluate'
        ? { result: { objectId: 'global-object' } }
        : { result: { value: { approved: false, reason: 'BINDING_CHANGED' } } };
      queueMicrotask(() => this.emit('message', { data: JSON.stringify({ id: message.id, result }) }));
    }
    close() {}
    emit(type, event) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  };
}

function passiveGenerationTransport() {
  class PassiveGenerationWebSocket {
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
      queueMicrotask(() => this.emit('message', { data: JSON.stringify({
        id: message.id,
        result: message.method === 'Runtime.evaluate'
          ? { result: { objectId: 'global-object' } }
          : { result: { value: { generating: true, idleReady: false } } },
      }) }));
    }

    close() {}

    emit(type, event) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
  }

  return { WebSocketImpl: PassiveGenerationWebSocket };
}

function canonicalizingGenerationTransport(canonicalUrl, postCanonicalState = null) {
  class CanonicalizingGenerationWebSocket {
    constructor() { this.listeners = new Map(); this.polls = 0; queueMicrotask(() => this.emit('open', {})); }
    addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
    send(raw) {
      const message = JSON.parse(raw);
      let result;
      if (message.method === 'Runtime.evaluate') result = { result: { objectId: 'global-object' } };
      else {
        this.polls += 1;
        result = { result: { value: this.polls === 1
          ? { urlMismatch: true, currentUrl: canonicalUrl, conversationUrl: canonicalUrl }
          : (postCanonicalState ?? { urlMismatch: false, idleReady: true, generating: false, generationProgress: { outputBegun: true, counter: 1 } }) } };
      }
      queueMicrotask(() => this.emit('message', { data: JSON.stringify({ id: message.id, result }) }));
    }
    close() {}
    emit(type, event) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  }
  return { WebSocketImpl: CanonicalizingGenerationWebSocket };
}

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
      bodySha256: sha256(body),
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
  assert.equal(transport.callFunctionCount, 5);
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
        if (state.callFunctionCount === 5) {
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
          { ok: true, targetBound: false, assistantContentObserved: false },
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

const emptyAppMention = {
  composerFound: true, composerAmbiguous: false, mentionCount: 0, exactMentionCount: 0, composerEmpty: true,
};
const boundAppMention = {
  composerFound: true, composerAmbiguous: false, mentionCount: 1, exactMentionCount: 1, mentionExactBodyEmpty: true,
};
const noSelectedApp = { composerFormFound: true, toolsControlCount: 1, chipMatchCount: 0 };
const controlRect = { x: 1, y: 1, width: 10, height: 10 };

function appSelectionTransport(observations, { failInput = false, failObservation = false } = {}) {
  const inputMethods = [];
  let reads = 0;
  class SelectionWebSocket {
    constructor() { this.listeners = new Map(); queueMicrotask(() => this.emit('open', {})); }
    addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
    send(raw) {
      const message = JSON.parse(raw);
      const isInput = message.method.startsWith('Input.');
      if (isInput) inputMethods.push(message.method);
      let response = { id: message.id, result: {} };
      if ((isInput && failInput) || (message.method === 'Runtime.callFunctionOn' && failObservation)) {
        response = { id: message.id, error: { code: -32000, message: 'synthetic transport failure' } };
      } else if (message.method === 'Runtime.evaluate') {
        response.result = { result: { objectId: 'global-object' } };
      } else if (message.method === 'Runtime.callFunctionOn') {
        response.result = { result: { value: observations[Math.min(reads++, observations.length - 1)] } };
      }
      queueMicrotask(() => this.emit('message', { data: JSON.stringify(response) }));
    }
    close() {}
    emit(type, event) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  }
  return { WebSocketImpl: SelectionWebSocket, inputMethods };
}

const selectionTarget = { id: 'owned-target-test', webSocketDebuggerUrl: 'ws://controlled/page' };
const githubSelection = { knownLabels: [GITHUB_APP_MENTION.label], requiredLabels: [GITHUB_APP_MENTION.label] };

for (const failure of ['contaminated-mention', 'inspection-transport']) {
  test(`app selection marks ${failure} before any input as PREPARING`, async () => {
    const transport = appSelectionTransport([{ ...boundAppMention, mentionExactBodyEmpty: false }], {
      failObservation: failure === 'inspection-transport',
    });
    const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: transport.WebSocketImpl });
    await assert.rejects(browser.selectAppsForMessage(selectionTarget, githubSelection),
      (error) => error?.relayStage === 'PREPARING');
    assert.deepEqual(transport.inputMethods, []);
  });
}

for (const [kind, observations, labels, expectedMethod] of [
  ['chip click', [boundAppMention, { ...noSelectedApp, chipMatchCount: 1, chipRect: controlRect }], githubSelection,
    'Input.dispatchMouseEvent'],
  ['text insertion', [emptyAppMention, noSelectedApp, { ok: true, alreadyExact: true }], githubSelection,
    'Input.insertText'],
  ['wheel event', [emptyAppMention, noSelectedApp, {
    ...noSelectedApp, listOpen: true, listAtTop: true, listAtEnd: false, listScrollRect: controlRect,
  }], { knownLabels: ['Other App'], requiredLabels: ['Other App'] }, 'Input.dispatchMouseEvent'],
  ['key event', [emptyAppMention, noSelectedApp, { ...noSelectedApp, renderedAppMatchCount: 1 }, {
    focused: true, matchCount: 1,
  }], { knownLabels: ['Other App'], requiredLabels: ['Other App'] }, 'Input.dispatchKeyEvent'],
]) {
  test(`app selection leaves a failed ${kind} dispatch unmarked`, async () => {
    const transport = appSelectionTransport(observations, { failInput: true });
    const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: transport.WebSocketImpl });
    await assert.rejects(browser.selectAppsForMessage(selectionTarget, labels),
      (error) => error?.relayStage === undefined && /synthetic transport failure/.test(error.message));
    assert.deepEqual(transport.inputMethods, [expectedMethod]);
  });
}

test('app selection leaves an observation failure after successful input unmarked', async () => {
  const transport = appSelectionTransport([boundAppMention,
    { ...noSelectedApp, chipMatchCount: 1, chipRect: controlRect },
    { ...noSelectedApp, toolsControlCount: 0 },
  ]);
  const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: transport.WebSocketImpl, pageReadyTimeoutMs: 1 });
  await assert.rejects(browser.selectAppsForMessage(selectionTarget, githubSelection),
    (error) => error?.relayStage === undefined && /Tools control/.test(error.message));
  assert.equal(transport.inputMethods.length, 3);
});

test('a pre-input app-selection rejection closes its central admission before allowing retry', async () => {
  const now = { value: Date.parse('2026-09-18T12:00:00.000Z') };
  const centralStore = new MemoryStore(defaultSchedulerState('2026-09-18T11:00:00.000Z'));
  const central = centralScheduler(centralStore, now);
  await central.activateLease(primaryLease());
  const transport = appSelectionTransport([{ ...boundAppMention, mentionExactBodyEmpty: false }]);
  const browser = new ChromeDevtoolsBrowser({ WebSocketImpl: transport.WebSocketImpl });
  let abortCalls = 0;
  const scheduler = new RelaySubmissionScheduler({
    schedulerClient: relayClient(central, () => { abortCalls += 1; }),
    stateStore: new MemoryStore(defaultState()), host: relayHost(), minIntervalMs: 60_000, now: () => now.value,
  });
  await assert.rejects(scheduler.submit({
    context: requestBoundSubmissionContext(),
    submit: () => browser.selectAppsForMessage(selectionTarget, githubSelection),
  }), (error) => error?.relayStage === 'PREPARING' && error.preBoundaryAbortConfirmed === true);
  assert.equal(abortCalls, 1);
  assert.deepEqual(transport.inputMethods, []);
  const status = await central.status();
  assert.equal(status.unresolvedAdmission, null);
  assert.equal(status.queueHead.status, 'PRECLICK_RETRY_PENDING');
  assert.equal(status.ready, true);
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
