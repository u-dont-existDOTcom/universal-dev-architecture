import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BINDING_ENVELOPE_SUMMARY,
  CAPABILITY_CHALLENGE_SUMMARY,
  CAPABILITY_VERIFIED_SUMMARY,
  CURRENT_CONSUMER_CONTROLS,
  CURRENT_DECISION_SESSION_PROVENANCE,
  IN_BAND_PRE_SEND_SUMMARY,
  MODE_CAPABILITY_VERIFIED_SUMMARY,
  PROVIDER_SESSION_CYCLE_ROUTE_PREFIX,
  STAGED_PROVIDER_SESSION_CYCLE_ROUTE_PREFIX,
  PROVIDER_SESSION_MCP_SUMMARY,
  PROVIDER_SESSION_SUMMARY,
  RELAY_STAGE_SUMMARY,
  sha256,
  STAGE_LIVENESS_SUMMARY,
  SUPERVISORY_CYCLE_ROUTE_PREFIX,
  defaultState,
} from '../src/core.mjs';
import { RelayRuntime } from '../src/relay.mjs';
import { GlobalSubmissionPacer } from '../src/submission-pacing.mjs';

const normalMetrics = { totalMb: 7941, availableMb: 5400, usedMb: 2541, swapTotalMb: 2048, swapUsedMb: 2, browserRssMb: 1700, sampledAt: '2026-09-02T00:00:00.000Z' };

test('ordinary relay refuses to advance while a controller-mediated cycle is nonfinal', async () => {
  const state = defaultState();
  state.controllerCycles['controller-1'] = {
    cycleId: 'controller-1', taskId: 'task-1', requestId: 'r-1',
    step: 'WAIT_PM_ARTIFACT', controllerBindingSha256: 'a'.repeat(64),
  };
  const store = new MemoryStateStore(state);
  const mc = new FakeMissionControl({ evidence: capabilityEvidence() });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });
  const result = await runtime.cycle();
  assert.equal(result.status, 'CONTROLLER_CYCLE_REQUIRES_CONTROLLER_COMMAND');
  assert.equal(browser.submitCalls, 0);
  assert.equal(mc.fetchFleetCalls, 0);
});

test('normal supervision reaches the direct binding-preload seam without historical capability receipts', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: [challengeEvidence()] });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });
  const result = await runtime.cycle();
  assert.equal(result.status, 'MCP_BINDING_PRELOAD_GENERATION_STARTED');
  assert.equal(browser.submitCalls, 1);
  assert.equal(browser.controlChecks.at(-1).thinkingOrdinal, '4 of 5');
  assert.deepEqual(browser.selectAppsCalls, [
    { knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['Mission Control'], referencedLabels: [] },
  ]);
});

test('dry run reports missing capability evidence as diagnostic rather than a prerequisite', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: [challengeEvidence()] });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: false });
  const result = await runtime.cycle();
  assert.equal(result.status, 'DRY_RUN_ROUTE_READY');
  assert.equal(result.capability.allCurrent, false);
  assert.equal(result.capabilityReceiptPrerequisite, false);
  assert.equal(result.memory.policy.profile, '8GB');
  assert.equal(browser.submitCalls, 0);
});

test('truthfully expired controller history does not monopolize fresh relay admission', async () => {
  const state = defaultState();
  state.controllerCycles['expired-controller'] = {
    cycleId: 'expired-controller', taskId: 'old-task', requestId: 'old-request',
    step: 'EXPIRED', controllerBindingSha256: 'a'.repeat(64),
    terminalization: { reason: 'ROUTE_EXPIRED', priorStep: 'WAIT_ORIGIN_ARTIFACT' },
  };
  const store = new MemoryStateStore(state);
  const mc = new FakeMissionControl({ evidence: [challengeEvidence()] });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: false });
  const result = await runtime.cycle();
  assert.equal(result.status, 'DRY_RUN_ROUTE_READY');
  assert.equal(result.route.requestId, 'r-1');
  assert.equal(browser.submitCalls, 0);
});

test('automatic local Codex dispatch runs before browser availability is required', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence() });
  const browser = new FakeBrowser();
  let browserInspected = false;
  browser.listTargets = async () => { browserInspected = true; throw new Error('browser intentionally unavailable'); };
  const runtime = makeRuntime({
    store, mc, browser, submitEnabled: false,
    memoryReader: async () => { throw new Error('browser memory must not gate local Codex'); },
    codexExecutionDispatcher: async ({ snapshot }) => {
      assert.equal(snapshot.workers[0].id, 'worker-a');
      return { status: 'COMPLETED', route: 'CODEX_LOCAL', automaticDispatch: { taskId: 'task-local' } };
    },
  });
  const result = await runtime.cycle();
  assert.equal(result.status, 'CODEX_EXECUTION_DISPATCHED');
  assert.equal(result.codexExecution.route, 'CODEX_LOCAL');
  assert.equal(mc.fetchFleetCalls, 1);
  assert.equal(browserInspected, false);
});

test('exact legacy fallback selects the source-bound task and cannot consume an adjacent eligible task', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({
    evidence: capabilityEvidence(),
    routes: [
      routeEvent('unrelated-request', 'unrelated-route', 'EXTRA_HIGH_DIRECT', 'task-unrelated'),
      routeEvent('trigger-request', 'trigger-route', 'EXTRA_HIGH_DIRECT', 'task-trigger'),
    ],
  });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: false });
  const result = await runtime.cycle({
    skipCodexExecution: true,
    exactLegacyBinding: {
      worker: 'worker-a', taskId: 'task-trigger', decisionRequestId: 'trigger-request',
      directiveId: 'directive:trigger:1', directiveRevision: 1,
    },
  });
  assert.equal(result.status, 'DRY_RUN_ROUTE_READY');
  assert.equal(result.route.requestId, 'trigger-request');
  assert.equal(result.route.taskId, 'task-trigger');
  assert.equal(result.route.missionControlLegacyBinding.directiveId, 'directive:trigger:1');
  assert.notEqual(result.route.requestId, 'unrelated-request');
  assert.equal(browser.submitCalls, 0);
});

test('escalated route uses distinct fresh first-message Mission Control, reader, and Pro sessions', async () => {
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
  assert.equal(browser.freshChatCalls, 2);
  assert.equal(await runtime.cycle().then((result) => result.status), 'EXTRA_HIGH_READER_COMPLETE');
  const readerSessionId = store.state.deliveries['request:r-1'].providerSessionId;
  const bindingSessionId = store.state.deliveries['request:r-1'].bindingProviderSessionId;
  mc.evidence.push(stageLivenessEvidence('reader-complete', 'EXTRA_HIGH_READER', 'STAGE_COMPLETE', '2026-09-02T00:00:05.000Z', bindingSessionId, readerSessionId));
  const fifth = await runtime.cycle();
  assert.equal(fifth.status, 'PRO_REASONER_GENERATION_STARTED');
  assert.equal(browser.controlChecks.at(-1).thinkingOrdinal, '4 of 5');
  assert.equal(browser.submitCalls, 3);
  assert.equal(browser.freshChatCalls, 3);
  assert.deepEqual(browser.selectAppsCalls, [
    { knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['Mission Control'], referencedLabels: [] },
    { knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['GitHub'], referencedLabels: [] },
    { knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['GitHub'], referencedLabels: [] },
  ]);
  const readerStart = mc.recordedEvidence.find((item) => item.summary === RELAY_STAGE_SUMMARY && item.refs.includes('step:EXTRA_HIGH_READER') && item.refs.includes('generation_state:STARTED'));
  assert.ok(readerStart.refs.includes('app_selection_attempted:true'));
  assert.ok(readerStart.refs.includes('selected_app:GitHub'));
  assert.ok(readerStart.refs.includes('first_message:true'));
  const proStart = mc.recordedEvidence.find((item) => item.summary === RELAY_STAGE_SUMMARY && item.refs.includes('step:PRO_REASONER') && item.refs.includes('generation_state:STARTED'));
  assert.ok(proStart.refs.includes('app_selection_attempted:true'));
  assert.ok(proStart.refs.includes('selected_app:GitHub'));
  assert.notEqual(readerSessionId, store.state.deliveries['request:r-1'].providerSessionId);
});

test('ordinary direct work starts only after preload in a distinct GitHub-first-message session', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence(), routes: [routeEvent('r-1', 'route', 'EXTRA_HIGH_DIRECT')] });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });

  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_GENERATION_STARTED');
  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_COMPLETE');
  assert.equal((await runtime.cycle()).status, 'EXTRA_HIGH_DIRECT_GENERATION_STARTED');
  assert.equal(browser.submitCalls, 2);
  assert.equal(browser.freshChatCalls, 2);
  assert.deepEqual(browser.selectAppsCalls, [
    { knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['Mission Control'], referencedLabels: [] },
    { knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['GitHub'], referencedLabels: [] },
  ]);
  const directStart = mc.recordedEvidence.find((item) => item.summary === RELAY_STAGE_SUMMARY
    && item.refs.includes('step:EXTRA_HIGH_DIRECT') && item.refs.includes('generation_state:STARTED'));
  assert.ok(directStart.refs.includes('app_selection_attempted:true'));
  assert.ok(directStart.refs.includes('selected_app:GitHub'));
  assert.ok(directStart.refs.includes('message_ordinal:1'));
  assert.ok(directStart.refs.includes('semantic_authority:false'));
  const exactSessionEvidence = mc.recordedEvidence.filter((item) => item.summary === PROVIDER_SESSION_SUMMARY
    && item.refs.includes('url_binding_status:EXACT') && item.refs.includes('lifecycle_status:ACTIVE'));
  assert.equal(exactSessionEvidence.length, 2);
  assert.equal(new Set(exactSessionEvidence.map((item) => item.receiptId)).size, 2);
  assert.ok(exactSessionEvidence.some((item) => item.refs.includes('binding_preload_receipt:PENDING')));
  assert.ok(mc.recordedEvidence.some((item) => item.summary === PROVIDER_SESSION_SUMMARY
    && item.refs.includes('session_role:MC_BINDING_PRELOAD_SESSION') && item.refs.includes('lifecycle_status:COMPLETE')
    && item.refs.some((ref) => ref.startsWith('binding_preload_receipt:mcp-'))));
});

test('new direct Pro route uses only preload then one fresh first-message Pro decision session', async () => {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence(), routes: [directRouteEvent('r-1', 'route', 'PRO_ESCALATED')] });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });

  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_GENERATION_STARTED');
  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_COMPLETE');
  assert.equal((await runtime.cycle()).status, 'PRO_DECISION_GENERATION_STARTED');
  assert.equal(browser.controlChecks.at(-1).modelVisibleLabel, 'GPT-5.6 Sol');
  assert.equal(browser.submitCalls, 2);
  assert.equal(browser.freshChatCalls, 2);
  assert.deepEqual(browser.selectAppsCalls, [
    { knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['Mission Control'], referencedLabels: [] },
  ]);
  const directStart = mc.recordedEvidence.find((item) => item.summary === RELAY_STAGE_SUMMARY
    && item.refs.includes('step:PRO_DECISION') && item.refs.includes('generation_state:STARTED'));
  assert.ok(directStart.refs.includes('decision_provider_session:' + store.state.deliveries['request:r-1'].providerSessionId));
  assert.ok(directStart.refs.includes('app_selection_attempted:false'));
  assert.equal(directStart.refs.includes('selected_app:Mission Control'), false);
  assert.match(browser.lastSubmittedBody, new RegExp(CURRENT_DECISION_SESSION_PROVENANCE));
  assert.match(browser.lastSubmittedBody, /No later writer, reader, liveness, continue, or follow-up tool turn is permitted/);
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

test('explicit retry of a proven-unsent direct decision reuses its verified binding without another preload', async () => {
  for (const [lane, step] of [['EXTRA_HIGH_DIRECT', 'EXTRA_HIGH_DECISION'], ['PRO_ESCALATED', 'PRO_DECISION']]) {
    const { runtime, store, mc, browser } = await unsentDirectDecision(lane);
    const failed = structuredClone(store.state.deliveries['request:r-1']);
    const failedSession = structuredClone(store.state.providerSessions[failed.providerSessionId]);
    const pacing = structuredClone(store.state.submissionPacing);
    runtime.config.runtime.retryDelayMs = 0;
    assert.equal((await runtime.cycle()).status, 'AWAITING_GITHUB_RECEIPT');
    assert.equal(browser.submitCalls, 2); // Binding send plus failed preparation call.
    const evidenceCount = mc.recordedEvidence.length;

    assert.equal((await runtime.resolve('request:r-1', 'retry')).status, 'AMBIGUITY_RESOLVED');
    const restored = store.state.deliveries['request:r-1'];
    assert.equal(restored.status, 'MCP_BINDING_PRELOAD_COMPLETE');
    assert.equal(restored.providerSessionId, failed.bindingProviderSessionId);
    assert.equal(restored.decisionProviderSessionId, null);
    assert.deepEqual(restored.bindingCapsule, failed.bindingCapsule);
    assert.deepEqual(restored.stageAttempts, failed.stageAttempts);
    assert.equal(restored.operatorRetryHistory[0].providerSessionId, failed.providerSessionId);
    assert.equal(restored.operatorRetryHistory[0].promptSha256, failed.promptSha256);
    assert.equal(Object.hasOwn(restored, 'generationStart'), false);
    assert.equal(Object.hasOwn(restored, 'generationStarted'), false);
    assert.equal(Object.hasOwn(restored, 'promptSha256'), false);
    assert.deepEqual(store.state.providerSessions[failed.providerSessionId], failedSession);
    assert.deepEqual(store.state.submissionPacing, pacing);
    assert.equal(mc.recordedEvidence.length, evidenceCount);
    assert.equal(browser.submitCalls, 2);

    browser.submitErrorStage = null;
    assert.equal((await runtime.cycle()).status, `${step}_GENERATION_STARTED`);
    const resumed = store.state.deliveries['request:r-1'];
    assert.notEqual(resumed.providerSessionId, failed.providerSessionId);
    assert.equal(resumed.bindingProviderSessionId, failed.bindingProviderSessionId);
    assert.deepEqual(resumed.bindingCapsule, failed.bindingCapsule);
    assert.equal(browser.submitCalls, 3);
    assert.equal(browser.freshChatCalls, 3);
    const starts = [...new Map(mc.recordedEvidence.filter((item) => item.summary === RELAY_STAGE_SUMMARY
      && item.refs.includes('generation_state:STARTED')).map((item) => [item.receiptId, item])).values()];
    assert.equal(starts.filter((item) => item.refs.includes('step:MCP_BINDING_PRELOAD')).length, 1);
    assert.equal(starts.filter((item) => item.refs.includes(`step:${step}`)).length, 1);
  }
});

test('unsent direct decision retry fails before mutation for unknown, started, mismatched, or expired evidence', async () => {
  const mutants = [
    ['unknown preparation stage', ({ current }) => { current.failureStage = 'UNKNOWN'; }],
    ['missing failed session', ({ store, current }) => { delete store.state.providerSessions[current.providerSessionId]; }],
    ['ambiguous failed session', ({ failed }) => { failed.status = 'AMBIGUOUS'; }],
    ['assigned provider URL', ({ failed }) => { failed.conversationUrl = 'https://chatgpt.com/c/already-sent'; }],
    ['unknown pacing', ({ store }) => { store.state.submissionPacing.lastSubmissionAt = null; }],
    ['submission after intent', ({ store, current }) => { store.state.submissionPacing.lastSubmissionAt = current.intentRecordedAt; }],
    ['wrong failed worker', ({ failed }) => { failed.workerId = 'other-worker'; }],
    ['wrong binding supervisor', ({ binding }) => { binding.supervisorId = 'other-supervisor'; }],
    ['incomplete binding', ({ binding }) => { binding.status = 'ACTIVE'; }],
    ['altered capsule digest', ({ current }) => { current.bindingCapsule.sha256 = '0'.repeat(64); }],
    ['missing current MCP receipt', ({ mc }) => { mc.evidence = mc.evidence.filter((event) => event.data.summary !== PROVIDER_SESSION_MCP_SUMMARY); }],
    ['wrong MCP supervisor', ({ mc }) => {
      for (const receipt of mc.evidence.filter((event) => event.data.summary === PROVIDER_SESSION_MCP_SUMMARY)) {
        receipt.data.refs = receipt.data.refs.map((ref) => ref.startsWith('supervisor:') ? 'supervisor:other' : ref);
      }
    }],
    ['missing failed-session server receipt', ({ mc, failed }) => {
      mc.recordedEvidence = mc.recordedEvidence.filter((item) => !(item.summary === PROVIDER_SESSION_SUMMARY
        && item.refs.includes(`provider_session:${failed.providerSessionId}`) && item.refs.includes('lifecycle_status:FAILED')));
    }],
    ['server-observed decision start', ({ mc, failed }) => {
      mc.evidence.push({ eventId: 'unexpected-start', sequence: 1000, data: { type: 'evidence_receipt_recorded',
        summary: RELAY_STAGE_SUMMARY, verified: true, refs: [`provider_session:${failed.providerSessionId}`, 'generation_state:STARTED'] } });
    }],
    ['server-observed decision completion', ({ mc, failed }) => {
      mc.evidence.push({ eventId: 'unexpected-complete', sequence: 1000, data: { type: 'evidence_receipt_recorded',
        summary: RELAY_STAGE_SUMMARY, verified: true, refs: [`provider_session:${failed.providerSessionId}`, 'generation_state:COMPLETE'] } });
    }],
    ['missing recorded envelope', ({ mc }) => { mc.recordedEvidence = mc.recordedEvidence.filter((item) => item.summary !== BINDING_ENVELOPE_SUMMARY); }],
    ['expired current route', ({ mc }) => {
      const packet = JSON.parse(mc.routes[0].data.body.slice(PROVIDER_SESSION_CYCLE_ROUTE_PREFIX.length));
      packet.expiresAt = '2026-09-03T00:00:00.000Z';
      mc.routes[0].data.body = PROVIDER_SESSION_CYCLE_ROUTE_PREFIX + JSON.stringify(packet);
    }],
    ['ambiguous current route', ({ mc }) => { mc.routes.push(structuredClone(mc.routes[0])); }],
    ['canonical decision already admitted', ({ mc }) => {
      mc.evidence.push({ eventId: 'already-admitted', sequence: 1000, data: { type: 'github_decision_receipt_ingested', request_id: 'r-1' } });
    }],
  ];
  for (const [name, mutate] of mutants) {
    const fixture = await unsentDirectDecision('EXTRA_HIGH_DIRECT');
    const { store, runtime, mc, browser } = fixture;
    const current = store.state.deliveries['request:r-1'];
    mutate({ ...fixture, current, failed: store.state.providerSessions[current.providerSessionId],
      binding: store.state.providerSessions[current.bindingProviderSessionId] });
    const unchangedState = structuredClone(store.state);
    const unchangedEvidence = structuredClone(mc.recordedEvidence);
    await assert.rejects(runtime.resolve('request:r-1', 'retry'), /Unsent decision retry is not verified/, name);
    assert.deepEqual(store.state, unchangedState, name);
    assert.deepEqual(mc.recordedEvidence, unchangedEvidence, name);
    assert.equal(browser.submitCalls, 2, name);
  }
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
  assert.equal(browser.controlChecks.length, 1);
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
  assert.equal(browser.controlChecks.at(-1).thinkingVisibleLabel, 'Extra High');
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

test('every fresh stage shares the global pacing gate before allocating a provider session', async () => {
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
  assert.equal(store.state.deliveries['request:r-1'].providerSessionId, before.providerSessionId);
  assert.deepEqual(store.state.deliveries['request:r-1'].stageAttempts, before.stageAttempts);
  assert.ok(store.state.deliveries['request:r-1'].bindingCapsule);
  assert.equal(browser.freshChatCalls, 1);

  now.value += 60_000;
  assert.equal((await runtime.cycle()).status, 'EXTRA_HIGH_READER_GENERATION_STARTED');
  assert.equal(browser.submitCalls, 2);
  assert.deepEqual(browser.selectAppsCalls, [
    { knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['Mission Control'], referencedLabels: [] },
    { knownLabels: ['Mission Control', 'GitHub'], requiredLabels: ['GitHub'], referencedLabels: [] },
  ]);
  assert.equal(browser.appSelectionEvidence.length, 2);
  assert.equal(browser.freshChatCalls, 2);
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
      type: 'github_decision_receipt_ingested', request_id: 'r-1', stage_provider_session_id: providerSessionId,
      binding_provider_session_id: providerSessionId,
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
  mc.evidence.push({ eventId: 'decision-r1', sequence: 90, occurredAt: '2026-09-02T00:10:00.000Z', data: { type: 'github_decision_receipt_ingested', request_id: 'r-1', stage_provider_session_id: firstSession, binding_provider_session_id: firstSession, supervisor_id: 'spec', receipt_id: 'github-comment:r1', reasoning_lane: 'PRO_ESCALATED', github_receipt: {} } });
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

test('doctor reports a healthy secondary as standby-ready while the primary lease is active', async () => {
  const store = new MemoryStateStore();
  const runtime = makeRuntime({
    store,
    mc: new FakeMissionControl({ evidence: capabilityEvidence() }),
    browser: new FakeBrowser(),
    submitEnabled: false,
    submissionHost: { alias: 'standby-test', role: 'SECONDARY', deploymentEpoch: 1, leaseId: 'standby-disabled' },
  });
  assert.equal((await runtime.doctor()).status, 'STANDBY_READY');
});

test('doctor never reports ready when the central authority is halted or not ready', async () => {
  const store = new MemoryStateStore();
  const runtime = makeRuntime({
    store,
    mc: new FakeMissionControl({ evidence: capabilityEvidence() }),
    browser: new FakeBrowser(),
    submitEnabled: true,
  });
  runtime.submissionPacer.remoteStatus = async () => ({
    authority: 'MISSION_CONTROL_SINGLE_WRITER', schedulerState: 'ACTIVE_LEASE', ready: false, minimumIntervalMs: 60_000,
    retryAfterMs: 0, safetyHalt: { code: 'TEST_HALT' }, ledger: { valid: true },
    authenticatedRelayBinding: { hostAlias: 'primary-test', hostRole: 'PRIMARY', automationWindowId: 101, ownedTargetCount: 1, ownedTargetIdsSha256: sha256(JSON.stringify(['automation-owned-target'])) },
    activeLease: { epoch: 1, activeHostAlias: 'primary-test', activeHostRole: 'PRIMARY' },
  });
  assert.equal((await runtime.doctor()).status, 'CENTRAL_AUTHORITY_NOT_READY');
});

test('doctor fails closed when the live browser window differs from the authenticated central binding', async () => {
  const runtime = makeRuntime({
    store: new MemoryStateStore(),
    mc: new FakeMissionControl({ evidence: capabilityEvidence() }),
    browser: new FakeBrowser({ automationWindowId: 999 }),
    submitEnabled: false,
  });
  assert.equal((await runtime.doctor()).status, 'AUTOMATION_WINDOW_BINDING_MISMATCH');
});

test('doctor fails closed when the live browser target set differs inside the correct window', async () => {
  const runtime = makeRuntime({
    store: new MemoryStateStore(),
    mc: new FakeMissionControl({ evidence: capabilityEvidence() }),
    browser: new FakeBrowser({ automationOwnedTargetIdsSha256: sha256(JSON.stringify(['different-target'])) }),
    submitEnabled: false,
  });
  assert.equal((await runtime.doctor()).status, 'AUTOMATION_WINDOW_BINDING_MISMATCH');
});

function makeRuntime({ store, mc, browser, submitEnabled, capabilityTestEnabled = false, codexExecutionDispatcher = null, memoryReader = async () => normalMetrics, now = Date.now,
  submissionHost = { alias: 'primary-test', role: 'PRIMARY', deploymentEpoch: 1, leaseId: 'lease-primary-1' }, submissionPacer: suppliedSubmissionPacer = null }) {
  const config = {
    missionControl: { url: 'https://mission-control.example' },
    browser: { profileDir: '/tmp/test-profile' },
    runtime: {
      chats: [chat()], workerIds: ['worker-a'], submitEnabled, capabilityTestEnabled, pollIntervalMs: 15_000, minSubmissionIntervalMs: 60_000, retryDelayMs: 300_000, maxHotTabs: 3,
      submissionHost,
    },
    memory: { profile: 'AUTO', overrides: {} },
  };
  const submissionPacer = suppliedSubmissionPacer ?? new GlobalSubmissionPacer({ stateStore: store, minIntervalMs: config.runtime.minSubmissionIntervalMs, now });
  submissionPacer.remoteStatus = async () => ({
    ...submissionPacer.status(await store.read()), authority: 'MISSION_CONTROL_SINGLE_WRITER', schedulerState: 'ACTIVE_LEASE', safetyHalt: null,
    ledger: { valid: true }, authenticatedRelayBinding: { hostAlias: submissionHost.alias, hostRole: submissionHost.role, automationWindowId: 101, ownedTargetCount: 1, ownedTargetIdsSha256: sha256(JSON.stringify(['automation-owned-target'])) },
    activeLease: { epoch: 1, activeHostAlias: 'primary-test', activeHostRole: 'PRIMARY' },
  });
  return new RelayRuntime({ config, missionControl: mc, browser, stateStore: store, submissionPacer, codexExecutionDispatcher, memoryReader, logger: { log() {}, warn() {}, error() {} } });
}

async function unsentDirectDecision(lane) {
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: capabilityEvidence(), routes: [directRouteEvent('r-1', 'route', lane)] });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });
  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_GENERATION_STARTED');
  assert.equal((await runtime.cycle()).status, 'MCP_BINDING_PRELOAD_COMPLETE');
  browser.submitErrorStage = 'PREPARING';
  assert.equal((await runtime.cycle()).status, 'SUBMISSION_FAILED_RETRYABLE');
  return { store, mc, browser, runtime };
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
    this.producerId = 'collector:fixture-relay';
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
  constructor({ submitErrorStage = null, automationWindowId = 101, automationOwnedTargetIdsSha256 = sha256(JSON.stringify(['automation-owned-target'])) } = {}) {
    this.submitErrorStage = submitErrorStage;
    this.automationWindowId = automationWindowId;
    this.automationOwnedTargetIdsSha256 = automationOwnedTargetIdsSha256;
    this.submitCalls = 0; this.waitCalls = 0; this.freshChatCalls = 0; this.createdTargetCalls = 0; this.controlChecks = []; this.targets = []; this.closedTargets = []; this.lastSubmittedBody = null;
    this.selectAppsCalls = []; this.appSelectionEvidence = []; this.selectedApps = [];
  }
  async doctor() { return { browser: 'Fake', automationWindowId: this.automationWindowId, automationOwnedTabCount: 1, automationOwnedTargetIdsSha256: this.automationOwnedTargetIdsSha256, targetCount: this.targets.length, managedChatGptTabCount: this.targets.filter((target) => target.url.startsWith('https://chatgpt.com/')).length }; }
  async listTargets() { return structuredClone(this.targets); }
  async closeTarget(id) { this.closedTargets.push(id); this.targets = this.targets.filter((target) => target.id !== id); return true; }
  async activateTarget() { return true; }
  async createFreshChatTarget({ reusableTargetId = null } = {}) {
    this.freshChatCalls += 1;
    const reusable = this.targets.find((target) => target.id === reusableTargetId) ?? this.targets.find((target) => target.url.startsWith('https://chatgpt.com/'));
    if (reusable) {
      reusable.url = 'https://chatgpt.com/';
      return { ...reusable, automationOwned: true, automationWindowId: 101, created: false, reused: true, webSocketDebuggerUrl: 'ws://fake' };
    }
    this.createdTargetCalls += 1;
    const target = { id: `target-fresh-${this.freshChatCalls}`, type: 'page', url: 'https://chatgpt.com/', automationOwned: true, automationWindowId: 101, created: true, webSocketDebuggerUrl: 'ws://fake' };
    this.targets.push(target);
    return target;
  }
  async findOrCreateChatTarget(url) {
    const existing = this.targets.find((target) => target.url === url);
    if (existing) return { ...existing, automationOwned: true, automationWindowId: 101, created: false, webSocketDebuggerUrl: 'ws://fake' };
    const target = { id: 'target-spec', type: 'page', url, automationOwned: true, automationWindowId: 101, created: true, webSocketDebuggerUrl: 'ws://fake' };
    this.targets.push(target); return target;
  }
  async ensureExactConsumerControls(target, { controls }) { this.controlChecks.push(structuredClone(controls)); return { status: 'FIXED_CONSUMER_CONTROLS_VERIFIED', ...controls }; }
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
  return { scope: 'SPECIALIST', supervisorId: 'spec', label: 'Specialist', workerId: 'worker-a', pinned: false,
    registrationId: 'registration:spec:test', ownership: 'MISSION_CONTROL_ONLY', purpose: 'Dedicated test supervisor.',
    accountAlias: 'account:test', workspaceAlias: 'workspace:test', privateLocatorRef: 'private-config:supervisors/spec',
    registrationProvenance: { registeredBy: 'OWNER', registeredAt: '2026-09-10T12:00:00.000Z', sourceRef: 'owner-requirement:test' },
    bootstrapCapability: { chatId: 'spec-bootstrap', url: 'https://chatgpt.com/c/spec-chat', challengeId: 'challenge-spec' }, consumerControls: { ...CURRENT_CONSUMER_CONTROLS }, requiredApps: { missionControl: 'Mission Control', github: 'GitHub' } };
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
    { eventId: 'mode-cap', sequence: 3, occurredAt: '2026-09-02T00:00:00.000Z', data: { type: 'evidence_receipt_recorded', receipt_id: 'mode-cap', summary: MODE_CAPABILITY_VERIFIED_SUMMARY, verified: true, refs: ['chat:spec-bootstrap', 'capability:modeSwitching', 'model_visible_label:GPT-5.6 Sol', 'thinking_control_label:Thinking effort', 'thinking_visible_label:Extra High', 'thinking_ordinal:4 of 5', 'account_plan_label:Pro', 'account_plan_role:PROVENANCE_METADATA_ONLY', 'account_plan_is_reasoning_mode:false', 'expires_at:2099-09-03T00:00:00.000Z'] } },
  ];
}

function stageLivenessEvidence(id, stage, status, occurredAt, bindingProviderSessionId, stageProviderSessionId) {
  return {
    eventId: id, sequence: 40, occurredAt, data: {
      type: 'evidence_receipt_recorded', receipt_id: id, summary: STAGE_LIVENESS_SUMMARY, verified: true,
      refs: ['request:r-1', 'supervisor:spec', `binding_provider_session:${bindingProviderSessionId}`, `stage_provider_session:${stageProviderSessionId}`, `stage:${stage}`, `status:${status}`, 'semantic_authority:false'],
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

function routeEvent(requestId = 'r-1', eventId = 'route', reasoningLane = 'PRO_ESCALATED', taskId = 'task-1') {
  const body = STAGED_PROVIDER_SESSION_CYCLE_ROUTE_PREFIX + JSON.stringify({
    schemaVersion: 3, packetKind: 'PROVIDER_SESSION_SUPERVISORY_CYCLE', requestId, nonce: `nonce-${requestId}`, reasoningLane,
    destination: 'SPECIALIST_SUPERVISOR_CHAT', destinationSupervisorId: 'spec', providerDeliveryState: 'QUEUED_FOR_PROVIDER_RELAY',
    evidenceCapsule: { id: 'capsule-1', sha256: 'a'.repeat(64) }, ownerOutcome: { id: 'outcome-1', epoch: 1, sha256: 'b'.repeat(64) },
    githubReceipt: { repository: 'o/r', issueNumber: 1, stageIssueNumber: 2 }, factualPacket: { packetId: 'packet-1', taskId, exactFactualState: 'state', evidenceRefs: [], decisionRequested: 'decide' },
    queuedAt: '2026-09-02T00:00:00.000Z', expiresAt: '2099-09-03T00:00:00.000Z',
  });
  return { eventId, sequence: requestId === 'r-1' ? 10 : 11, occurredAt: '2026-09-02T00:00:00.000Z', data: { type: 'worker_message_recorded', message_id: `message-${requestId}`, body } };
}

function directRouteEvent(requestId = 'r-1', eventId = 'route', reasoningLane = 'PRO_ESCALATED') {
  const body = PROVIDER_SESSION_CYCLE_ROUTE_PREFIX + JSON.stringify({
    schemaVersion: 4, packetKind: 'PROVIDER_SESSION_SUPERVISORY_CYCLE', requestId, nonce: `nonce-${requestId}`, reasoningLane,
    destination: 'SPECIALIST_SUPERVISOR_CHAT', destinationSupervisorId: 'spec', providerDeliveryState: 'QUEUED_FOR_PROVIDER_RELAY',
    evidenceCapsule: { id: 'capsule-1', sha256: 'a'.repeat(64) }, ownerOutcome: { id: 'outcome-1', epoch: 1, sha256: 'b'.repeat(64) },
    githubReceipt: { repository: 'o/r', issueNumber: 1, stageIssueNumber: 2 }, factualPacket: { packetId: 'packet-1', taskId: 'task-1', exactFactualState: 'state', evidenceRefs: [], decisionRequested: 'decide' },
    queuedAt: '2026-09-02T00:00:00.000Z', expiresAt: '2099-09-03T00:00:00.000Z',
  });
  return { eventId, sequence: requestId === 'r-1' ? 10 : 11, occurredAt: '2026-09-02T00:00:00.000Z', data: { type: 'worker_message_recorded', message_id: `message-${requestId}`, body } };
}

function requestBoundFixture({ enabled = true, submitErrorStage = null } = {}) {
  const event = directRouteEvent('r-1', 'v5-route', 'EXTRA_HIGH_DIRECT');
  const packet = JSON.parse(event.data.body.slice(PROVIDER_SESSION_CYCLE_ROUTE_PREFIX.length));
  packet.schemaVersion = 5;
  packet.executionContext = { task_id: 'task-1' };
  event.data.body = 'MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V5\n' + JSON.stringify(packet);
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: [], routes: [event], autoFirstTurnMcp: false });
  const browser = new FakeBrowser({ submitErrorStage });
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true });
  runtime.config.runtime.requestBoundEnabled = enabled;
  return { store, mc, browser, runtime };
}

function inBandRequestFixture() {
  const event = directRouteEvent('r-1', 'v6-route', 'EXTRA_HIGH_DIRECT');
  const packet = JSON.parse(event.data.body.slice(PROVIDER_SESSION_CYCLE_ROUTE_PREFIX.length));
  packet.schemaVersion = 6;
  packet.executionContext = { task_id: 'task-1' };
  event.data.body = 'MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V6\n' + JSON.stringify(packet);
  const store = new MemoryStateStore();
  const mc = new FakeMissionControl({ evidence: [], routes: [event], autoFirstTurnMcp: false });
  const browser = new FakeBrowser();
  const admission = {
    admitted: true, admissionId: 'send-admission:v6', queueItemId: 'send-queue-item:v6',
    admittedAt: '2026-09-02T00:00:00.500Z', expiresAt: '2026-09-02T00:02:00.000Z',
  };
  const pacer = {
    status: () => ({ ready: true, minimumIntervalMs: 60_000, retryAfterMs: 0 }),
    remoteStatus: async () => ({ ready: true }),
    assertReady: async () => ({ ready: true }),
    submit: async ({ beforeSubmit, submit }) => {
      await beforeSubmit(admission);
      return submit(async () => {}, admission, async () => ({ valid: true }));
    },
  };
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: true, submissionPacer: pacer });
  runtime.config.runtime.requestBoundEnabled = true;
  return { store, mc, browser, runtime, admission };
}

test('expired historical supervisory route cannot starve a later valid route', async () => {
  const expired = directRouteEvent('expired-old', 'v5-route', 'EXTRA_HIGH_DIRECT');
  const expiredPacket = JSON.parse(expired.data.body.slice(PROVIDER_SESSION_CYCLE_ROUTE_PREFIX.length));
  expiredPacket.schemaVersion = 5;
  expiredPacket.executionContext = { task_id: 'task-old' };
  expiredPacket.queuedAt = '2026-09-01T00:00:00.000Z';
  expiredPacket.expiresAt = '2026-09-01T01:00:00.000Z';
  expired.data.body = 'MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V5\n' + JSON.stringify(expiredPacket);

  const current = directRouteEvent('current-new', 'v6-route', 'EXTRA_HIGH_DIRECT');
  const currentPacket = JSON.parse(current.data.body.slice(PROVIDER_SESSION_CYCLE_ROUTE_PREFIX.length));
  currentPacket.schemaVersion = 6;
  currentPacket.executionContext = { task_id: 'task-new' };
  currentPacket.factualPacket.taskId = 'task-new';
  currentPacket.queuedAt = '2026-09-21T00:00:00.000Z';
  currentPacket.expiresAt = '2099-09-21T01:00:00.000Z';
  current.data.body = 'MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V6\n' + JSON.stringify(currentPacket);

  const store = new MemoryStateStore();
  store.state.deliveries['request:expired-old'] = {
    status: 'REQUEST_BOUND_DECISION_COMPLETE', requestId: 'expired-old', workerId: 'worker-1',
    supervisorId: 'spec', providerSessionId: 'provider-session:expired-old',
  };
  const mc = new FakeMissionControl({ evidence: [], routes: [expired, current], autoFirstTurnMcp: false });
  const browser = new FakeBrowser();
  const runtime = makeRuntime({ store, mc, browser, submitEnabled: false });
  runtime.config.runtime.requestBoundEnabled = true;
  const result = await runtime.cycle();
  assert.equal(result.status, 'DRY_RUN_ROUTE_READY', JSON.stringify(result));
  assert.equal(result.route.requestId, 'current-new');
  assert.equal(result.route.taskId, 'task-new');
  assert.equal(browser.submitCalls, 0);
});

test('V6 operator-authorized proven-unsent retry re-enters the same one-send control step', async () => {
  const { store, runtime } = inBandRequestFixture();
  store.state.deliveries['request:r-1'] = {
    status: 'AMBIGUOUS_AFTER_RESTART', requestId: 'r-1', workerId: 'worker-1', supervisorId: 'spec',
    providerSessionId: 'provider-session:v6-unsent', decisionProviderSessionId: 'provider-session:v6-unsent',
    bindingProviderSessionId: 'provider-session:v6-unsent', failureStage: 'UNKNOWN', preBoundaryAbortConfirmed: false,
  };
  store.state.providerSessions['provider-session:v6-unsent'] = {
    providerSessionId: 'provider-session:v6-unsent', bindingProviderSessionId: 'provider-session:v6-unsent',
    supervisorId: 'spec', requestId: 'r-1', workerId: 'worker-1', sessionRole: 'IN_BAND_REQUEST_DECISION_SESSION',
    cycleStep: 'IN_BAND_REQUEST_DECISION', messageOrdinal: 1, conversationUrl: null, openedAt: '2026-09-02T00:00:00.000Z',
    status: 'AMBIGUOUS', failureStage: 'UNKNOWN', targetId: null,
  };
  const resolved = await runtime.resolve('request:r-1', 'retry');
  assert.equal(resolved.status, 'AMBIGUITY_RESOLVED');
  assert.equal(store.state.deliveries['request:r-1'].status, 'RETRY_AUTHORIZED');
  const retry = await runtime.cycle();
  assert.equal(retry.status, 'IN_BAND_REQUEST_DECISION_GENERATION_STARTED', JSON.stringify(retry));
  assert.equal(store.state.deliveries['request:r-1'].providerSessionId, 'provider-session:v6-unsent');
});

test('V6 records one trusted binding/body/admission receipt before one GitHub-only provider message', async () => {
  const { store, mc, browser, runtime, admission } = inBandRequestFixture();
  const first = await runtime.cycle();
  assert.equal(first.status, 'IN_BAND_REQUEST_DECISION_GENERATION_STARTED', JSON.stringify(first));
  assert.equal(browser.submitCalls, 1);
  assert.deepEqual(browser.selectAppsCalls.at(-1).requiredLabels, ['GitHub']);
  assert.match(browser.lastSubmittedBody, /IN_BAND_REQUEST_BINDING_V1/);
  assert.match(browser.lastSubmittedBody, /IN_BAND_REQUEST_BINDING_GITHUB_OBSERVED/);
  assert.doesNotMatch(browser.lastSubmittedBody, /get_supervisory_request_binding|REQUEST_BOUND_MCP_GITHUB_OBSERVED/);
  const preSend = mc.recordedEvidence.filter((item) => item.summary === IN_BAND_PRE_SEND_SUMMARY);
  assert.equal(preSend.length, 1);
  assert.ok(preSend[0].refs.includes(`submission_admission:${admission.admissionId}`));
  assert.ok(preSend[0].refs.includes(`provider_body_sha256:${sha256(browser.lastSubmittedBody)}`));
  assert.ok(preSend[0].refs.includes('semantic_authority:false'));
  assert.equal(mc.recordedEvidence.some((item) => item.summary === PROVIDER_SESSION_MCP_SUMMARY), false);
  assert.equal(store.state.providerSessions[store.state.deliveries['request:r-1'].providerSessionId].sessionRole, 'IN_BAND_REQUEST_DECISION_SESSION');
  assert.equal((await runtime.cycle()).status, 'IN_BAND_REQUEST_DECISION_COMPLETE');
  assert.equal((await runtime.cycle()).status, 'AWAITING_GITHUB_RECEIPT');
  assert.equal(browser.submitCalls, 1);
});

test('V5 actual relay cycle sends one real request with MC and GitHub, never a preload', async () => {
  const { store, mc, browser, runtime } = requestBoundFixture();
  const first = await runtime.cycle();
  assert.equal(first.status, 'REQUEST_BOUND_DECISION_GENERATION_STARTED', JSON.stringify(first));
  assert.equal(browser.submitCalls, 1);
  assert.match(browser.lastSubmittedBody, /get_supervisory_request_binding/);
  assert.match(browser.lastSubmittedBody, /schema_version 4/);
  assert.match(browser.lastSubmittedBody, /ONE final/);
  assert.doesNotMatch(browser.lastSubmittedBody, /binding preload only|capability test for challenge/i);
  assert.equal(mc.recordedEvidence.some(e => e.refs.includes('step:MCP_BINDING_PRELOAD')), false);
  assert.equal((await runtime.cycle()).status, 'REQUEST_BOUND_DECISION_COMPLETE');
  assert.equal((await runtime.cycle()).status, 'AWAITING_GITHUB_RECEIPT');
  assert.equal(browser.submitCalls, 1);
  const providerId = store.state.deliveries['request:r-1'].providerSessionId;
  assert.equal(store.state.providerSessions[providerId].sessionRole, 'REQUEST_BOUND_DECISION_SESSION');
  mc.evidence.push({ eventId: 'accepted-v5', sequence: 100, data: {
    type: 'github_decision_receipt_ingested', request_id: 'r-1', supervisor_id: 'spec', provider_session_id: providerId,
    execution_provenance: 'REQUEST_BOUND_MCP_GITHUB_OBSERVED', receipt_id: 'receipt-v5', github_receipt: { immutable_url: 'https://github.com/o/r/issues/1#issuecomment-1' },
  } });
  store.state.providerSessions = {}; // Lost local acknowledgement, not lost daemon evidence.
  assert.equal((await runtime.cycle()).status, 'DECISION_RECEIPT_INGESTED');
  assert.equal(store.state.deliveries['request:r-1'].recoveredFrom, 'DURABLE_GITHUB_ADMISSION');
  assert.equal(browser.submitCalls, 1);
});

test('V5 is disabled by default and never sends on its opt-out path', async () => {
  const { browser, runtime } = requestBoundFixture({ enabled: false });
  assert.equal((await runtime.cycle()).status, 'REQUEST_BOUND_PROTOCOL_DISABLED');
  assert.equal(browser.submitCalls, 0);
});

for (const stage of ['CLICK_DISPATCHED', 'CLICKED', 'GENERATION_STARTED', 'UNKNOWN']) {
  test(`V5 ${stage} interruption is not automatically resent`, async () => {
    const { browser, runtime, store } = requestBoundFixture({ submitErrorStage: stage });
    const first = await runtime.cycle();
    assert.equal(first.status, 'SUBMISSION_AMBIGUOUS', JSON.stringify(first));
    browser.submitErrorStage = null;
    assert.equal((await runtime.cycle()).status, 'AMBIGUITY_REQUIRES_OPERATOR');
    assert.equal(browser.submitCalls, 1);
    assert.equal(store.state.deliveries['request:r-1'].preBoundaryAbortConfirmed, false);
  });
}

test('V5 centrally confirmed pre-click abort reuses the same provider session and managed target', async () => {
  const { browser, runtime, store } = requestBoundFixture({ submitErrorStage: 'PREPARING' });
  assert.equal((await runtime.cycle()).status, 'SUBMISSION_AMBIGUOUS');
  const first = structuredClone(store.state.deliveries['request:r-1']);
  const targetCount = browser.targets.length;
  store.state.deliveries['request:r-1'] = {
    ...first,
    status: 'FAILED_RETRYABLE',
    preBoundaryAbortConfirmed: true,
    lastAttemptAt: '2026-09-01T00:00:00.000Z',
  };
  store.state.providerSessions[first.providerSessionId] = {
    ...store.state.providerSessions[first.providerSessionId],
    status: 'FAILED',
    failureStage: 'PREPARING',
  };
  browser.submitErrorStage = null;
  const retry = await runtime.cycle();
  assert.equal(retry.status, 'REQUEST_BOUND_DECISION_GENERATION_STARTED', JSON.stringify(retry));
  assert.equal(store.state.deliveries['request:r-1'].providerSessionId, first.providerSessionId);
  assert.equal(store.state.deliveries['request:r-1'].targetId, first.targetId);
  assert.equal(browser.targets.length, targetCount);
  assert.equal(browser.submitCalls, 2);
});

test('V5 missing app chip is telemetry, not capability authorization', async () => {
  const { browser, runtime } = requestBoundFixture();
  browser.selectAppsForMessage = async () => { throw new Error('Chip missing'); };
  const result = await runtime.cycle();
  assert.equal(result.status, 'REQUEST_BOUND_DECISION_GENERATION_STARTED', JSON.stringify(result));
  assert.equal(browser.submitCalls, 1);
});
