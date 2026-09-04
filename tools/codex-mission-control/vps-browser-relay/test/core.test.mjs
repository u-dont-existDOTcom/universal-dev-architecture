import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPABILITY_CHALLENGE_SUMMARY,
  CAPABILITY_VERIFIED_SUMMARY,
  CONTINUE_NUDGE_DELAY_MS,
  MANAGED_CHATGPT_HARD_CEILING_TABS,
  MCP_BINDING_PRELOAD_STEP,
  MODE_CAPABILITY_VERIFIED_SUMMARY,
  PROVIDER_SESSION_CYCLE_ROUTE_PREFIX,
  STAGED_PROVIDER_SESSION_CYCLE_ROUTE_PREFIX,
  STAGE_LIVENESS_SUMMARY,
  STAGE_RECEIPT_GRACE_MS,
  SUPERVISORY_CYCLE_ROUTE_PREFIX,
  appSelectionForMessage,
  capabilityControlPrompt,
  chatCapabilityState,
  classifyMemoryPressure,
  completedCycleStepStatus,
  continueNudgeEligible,
  cycleControlPrompt,
  deriveBindingCapsule,
  defaultState,
  extractQueuedRoutes,
  freshChatTargetPlan,
  managedChatGptTabTelemetry,
  mcpReadPreflightPrompt,
  newProviderSessionId,
  nextSupervisoryCycleAction,
  normalizeConversationUrl,
  oneShotExitCode,
  parseChatDirectory,
  parseSupervisoryCycleRouteBody,
  replaceUnusableManagedChatGptTarget,
  resolveMemoryPolicy,
  selectManagedTabClosures,
  sha256,
  stageReceiptGraceElapsed,
  startedCycleStepStatus,
} from '../src/core.mjs';

test('one-shot command fails only explicit cycle errors', () => {
  assert.equal(oneShotExitCode({ status: 'ERROR' }), 1);
  assert.equal(oneShotExitCode({ status: 'CAPABILITY_NOT_VERIFIED' }), 0);
  assert.equal(oneShotExitCode({ status: 'IDLE' }), 0);
});

test('chat directory is registration-only and ignores attempted capability self-attestation', () => {
  const [chat] = parseChatDirectory([{ ...chatFixture(), capabilities: { githubWrite: { testStatus: 'PASSED' } } }]);
  assert.equal(chat.supervisorId, 'spec');
  assert.equal(chat.bootstrapCapability.chatId, 'spec-bootstrap');
  assert.equal(chat.bootstrapCapability.challengeId, 'challenge-spec');
  assert.equal(Object.hasOwn(chat, 'capabilities'), false);
  assert.throws(() => parseChatDirectory([{ ...chatFixture(), workerId: null }]), /workerId/);
  assert.throws(() => parseChatDirectory([{ ...chatFixture(), bootstrapCapability: { ...chatFixture().bootstrapCapability, url: 'https://example.com/c/x' } }]), /chatgpt\.com/);
  assert.throws(() => parseChatDirectory([{ ...chatFixture(), requiredApps: null }]), /requiredApps/);
});

test('message app requirements are exact and step-specific', () => {
  const chat = parseChatDirectory([chatFixture()])[0];
  assert.deepEqual(appSelectionForMessage(chat, 'CAPABILITY'), {
    knownLabels: ['Mission Control', 'GitHub'],
    requiredLabels: ['Mission Control'],
    referencedLabels: ['GitHub'],
  });
  assert.deepEqual(appSelectionForMessage(chat, 'MCP_PREFLIGHT').requiredLabels, ['Mission Control']);
  assert.deepEqual(appSelectionForMessage(chat, MCP_BINDING_PRELOAD_STEP).requiredLabels, ['Mission Control']);
  for (const step of ['EXTRA_HIGH_DIRECT', 'EXTRA_HIGH_READER', 'PRO_REASONER', 'EXTRA_HIGH_WRITER']) {
    assert.deepEqual(appSelectionForMessage(chat, step).requiredLabels, ['GitHub']);
    assert.deepEqual(appSelectionForMessage(chat, step).referencedLabels, []);
  }
  for (const step of ['EXTRA_HIGH_DECISION', 'PRO_DECISION']) {
    assert.deepEqual(appSelectionForMessage(chat, step).requiredLabels, []);
    assert.deepEqual(appSelectionForMessage(chat, step).referencedLabels, ['GitHub']);
  }
});

test('provider sessions are new transport identities and never reuse the stable supervisor ID', () => {
  const first = newProviderSessionId('cycle-one');
  const second = newProviderSessionId('cycle-two');
  assert.equal(first, 'provider-session:cycle-one');
  assert.equal(second, 'provider-session:cycle-two');
  assert.notEqual(first, second);
  assert.notEqual(first, 'spec');
});

test('normalizes only concrete chatgpt conversation URLs', () => {
  assert.equal(normalizeConversationUrl('https://chatgpt.com/c/abc_123/?x=1'), 'https://chatgpt.com/c/abc_123');
  assert.throws(() => normalizeConversationUrl('https://chatgpt.com/'), /concrete/);
});

test('AUTO memory profile selects conservative 8 GB or 16 GB bounds from runtime RAM', () => {
  const eight = resolveMemoryPolicy(7941, { profile: 'AUTO', overrides: {} });
  assert.equal(eight.profile, '8GB');
  assert.equal(eight.hardAvailableMb, 1024);
  assert.equal(eight.hardBrowserRssMb, 5120);
  const sixteen = resolveMemoryPolicy(16384, { profile: 'AUTO', overrides: {} });
  assert.equal(sixteen.profile, '16GB');
  assert.equal(sixteen.hardAvailableMb, 2048);
  const override = resolveMemoryPolicy(7941, { profile: 'AUTO', overrides: { hardAvailableMb: 1400 } });
  assert.equal(override.hardAvailableMb, 1400);
});

test('memory pressure uses resolved hard limits before soft limits', () => {
  const policy = resolveMemoryPolicy(7941, { profile: 'AUTO', overrides: {} });
  assert.equal(classifyMemoryPressure({ availableMb: 5000, browserRssMb: 1700, swapUsedMb: 2 }, policy).pressure, 'NORMAL');
  assert.equal(classifyMemoryPressure({ availableMb: 1800, browserRssMb: 1700, swapUsedMb: 2 }, policy).pressure, 'SOFT');
  assert.equal(classifyMemoryPressure({ availableMb: 900, browserRssMb: 1700, swapUsedMb: 2 }, policy).pressure, 'HARD');
});

test('capability truth comes only from current Mission Control evidence receipts', () => {
  const chat = parseChatDirectory([chatFixture()])[0];
  const future = '2026-09-03T00:00:00.000Z';
  const snapshot = snapshotWithEvidence([
    evidence('challenge', 1, CAPABILITY_CHALLENGE_SUMMARY, [
      'challenge:challenge-spec', 'chat:spec-bootstrap', 'mc_nonce:mc-secret', `github_nonce_sha256:${sha256('gh-secret')}`,
      'github_nonce_source:https://github.com/o/r/issues/2', 'receipt_target:https://github.com/o/r/issues/2', `expires_at:${future}`,
    ]),
    evidence('tool-cap', 2, CAPABILITY_VERIFIED_SUMMARY, [
      'challenge:challenge-spec', 'chat:spec-bootstrap', 'capability:missionControlRead', 'capability:githubRead', 'capability:githubWrite', `expires_at:${future}`,
    ]),
    evidence('mode-cap', 3, MODE_CAPABILITY_VERIFIED_SUMMARY, [
      'chat:spec-bootstrap', 'capability:modeSwitching', 'extra_high_label:Extra High', 'pro_label:Pro', `expires_at:${future}`,
    ]),
  ]);
  const current = chatCapabilityState(snapshot, chat, '2026-09-02T12:00:00.000Z');
  assert.equal(current.challengeAvailable, true);
  assert.equal(current.allCurrent, true);
  assert.equal(chatCapabilityState(snapshot, chat, '2026-09-04T00:00:00.000Z').allCurrent, false);
});

test('capability control prompt preserves the owner-approved fresh-chat intent without embedding nonce values', () => {
  const prompt = capabilityControlPrompt(parseChatDirectory([chatFixture()])[0]);
  assert.match(prompt, /Use the selected Mission Control app/);
  assert.match(prompt, /get_capability_challenge/);
  assert.match(prompt, /challenge challenge-spec and chat spec-bootstrap/);
  assert.match(prompt, /github_nonce_source/);
  assert.match(prompt, /verify its SHA-256 equals the live github_nonce_sha256/);
  assert.match(prompt, /exact ordered capabilities/);
  assert.doesNotMatch(prompt, /mc-secret|gh-secret/);
});

test('MCP preflight prompt is exact-bound and cannot authorize GitHub or Mission Control writes', () => {
  const prompt = mcpReadPreflightPrompt(parseChatDirectory([chatFixture()])[0]);
  assert.match(prompt, /selected Mission Control app/);
  assert.match(prompt, /get_capability_challenge/);
  assert.match(prompt, /challenge_id challenge-spec and chat_id spec-bootstrap/);
  assert.match(prompt, /do not use GitHub/);
  assert.match(prompt, /do not write or mutate anything/);
  assert.doesNotMatch(prompt, /mc-secret|gh-secret/);
});

test('binding preload and every mandatory GitHub write use distinct fresh first-message sessions', () => {
  const route = escalatedRoute();
  const preload = cycleControlPrompt({ ...route, providerSessionId: route.bindingProviderSessionId }, MCP_BINDING_PRELOAD_STEP);
  assert.match(preload, /^Mission Control binding preload only\./);
  assert.match(preload, /get_supervisory_request_binding exactly once/);
  assert.match(preload, /request_id r1, supervisor_id spec, and provider_session_id provider-session:binding/);
  assert.match(preload, /Do not reason, use GitHub, make a decision, write a receipt/);
  assert.match(preload, /After the tool result is loaded into this conversation, stop\.$/);
  assert.doesNotMatch(preload, /MISSION_CONTROL_CANONICAL_DECISION|MISSION_CONTROL_CHAT_STAGE_RECEIPT|delegate to Work/);
  const reader = cycleControlPrompt(route, 'EXTRA_HIGH_READER');
  assert.match(reader, /fresh-first-message stage EXTRA_HIGH_READER/);
  assert.match(reader, /first and only message/);
  assert.match(reader, /binding_provider_session_id/);
  assert.match(reader, /binding_capsule_sha256/);
  assert.match(reader, /connected GitHub tool/);
  for (const step of ['EXTRA_HIGH_READER', 'PRO_REASONER', 'EXTRA_HIGH_WRITER']) {
    const prompt = cycleControlPrompt(route, step);
    assert.doesNotMatch(prompt, /get_supervisory_request_binding|get_stage_liveness_state/);
    assert.match(prompt, /do not use Mission Control or prior-chat memory/i);
    assert.match(prompt, /first and only message/);
  }
  const direct = cycleControlPrompt(directRouteFixture(), 'EXTRA_HIGH_DIRECT');
  assert.match(direct, /fresh-first-message stage EXTRA_HIGH_DIRECT/);
  assert.match(direct, /write MISSION_CONTROL_CANONICAL_DECISION_V1/);
  assert.doesNotMatch(direct, /get_supervisory_request_binding|get_stage_liveness_state/);
  assert.throws(() => cycleControlPrompt({ ...directRouteFixture(), providerSessionId: 'provider-session:binding' }, 'EXTRA_HIGH_DIRECT'), /distinct/);
});

test('route extraction binds durable stage-liveness receipts to the exact worker/request', () => {
  const chat = parseChatDirectory([chatFixture()])[0];
  const body = supervisoryBody('PRO_ESCALATED');
  const timeline = [
    { eventId: 'e1', sequence: 1, occurredAt: '2026-09-02T12:00:00.000Z', data: { type: 'worker_message_recorded', message_id: 'm1', body } },
    evidence('reader-more', 2, STAGE_LIVENESS_SUMMARY, ['request:r1', 'supervisor:spec', 'binding_provider_session:provider-session:binding', 'stage_provider_session:provider-session:reader-1', 'stage:EXTRA_HIGH_READER', 'status:CONTINUE_REQUIRED'], '2026-09-02T12:02:00.000Z'),
    evidence('reader-done', 3, STAGE_LIVENESS_SUMMARY, ['request:r1', 'supervisor:spec', 'binding_provider_session:provider-session:binding', 'stage_provider_session:provider-session:reader-2', 'stage:EXTRA_HIGH_READER', 'status:STAGE_COMPLETE'], '2026-09-02T12:03:00.000Z'),
    evidence('other-request', 4, STAGE_LIVENESS_SUMMARY, ['request:other', 'supervisor:spec', 'binding_provider_session:provider-session:binding', 'stage_provider_session:provider-session:pro', 'stage:PRO_DECISION_STAGE', 'status:CONTINUE_REQUIRED'], '2026-09-02T12:04:00.000Z'),
  ];
  const state = defaultState();
  state.deliveries['request:r1'] = { status: 'EXTRA_HIGH_READER_COMPLETE', providerSessionId: 'provider-session:reader-2', bindingProviderSessionId: 'provider-session:binding' };
  const routes = extractQueuedRoutes({ workers: [{ id: 'worker-a', name: 'Worker A', timeline }] }, [chat], state);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].routeKind, 'SUPERVISORY_CYCLE');
  assert.equal(routes[0].stageLiveness.EXTRA_HIGH_READER.latest.status, 'STAGE_COMPLETE');
  assert.equal(routes[0].stageLiveness.EXTRA_HIGH_READER.continueRequiredCount, 1);
  assert.equal(routes[0].stageLiveness.PRO_DECISION_STAGE, undefined);
});

test('escalated route waits for durable reader liveness before entering Pro', () => {
  const route = escalatedRoute();
  assert.deepEqual(nextSupervisoryCycleAction(route, null), { type: 'SEND_CONTROL', step: MCP_BINDING_PRELOAD_STEP, model: 'EXTRA_HIGH' });
  assert.equal(nextSupervisoryCycleAction(route, { status: completedCycleStepStatus(MCP_BINDING_PRELOAD_STEP), cycleStep: MCP_BINDING_PRELOAD_STEP }).type, 'WAIT_MCP_BINDING_RECEIPT');
  const boundRoute = { ...route, firstTurnMcpReceipt: { receiptId: 'binding-current' } };
  assert.deepEqual(nextSupervisoryCycleAction(boundRoute, { status: completedCycleStepStatus(MCP_BINDING_PRELOAD_STEP), cycleStep: MCP_BINDING_PRELOAD_STEP }), { type: 'SEND_CONTROL', step: 'EXTRA_HIGH_READER', model: 'EXTRA_HIGH' });
  assert.equal(nextSupervisoryCycleAction(route, { status: startedCycleStepStatus('EXTRA_HIGH_READER'), cycleStep: 'EXTRA_HIGH_READER' }).type, 'WAIT_GENERATION');

  const readerPrior = completedPrior('EXTRA_HIGH_READER', '2026-09-02T12:00:00.000Z', '2026-09-02T12:04:00.000Z');
  const waiting = nextSupervisoryCycleAction(route, readerPrior, Date.parse('2026-09-02T12:05:00.000Z'));
  assert.equal(waiting.type, 'WAIT_GITHUB_RECEIPT');
  assert.equal(waiting.waitFor, 'STAGE_LIVENESS');
  assert.equal(waiting.stage, 'EXTRA_HIGH_READER');

  const completeRoute = withStage(route, 'EXTRA_HIGH_READER', 'STAGE_COMPLETE', 'reader-complete', '2026-09-02T12:02:00.000Z');
  assert.deepEqual(nextSupervisoryCycleAction(completeRoute, readerPrior), {
    type: 'SEND_CONTROL', step: 'PRO_REASONER', model: 'PRO', stageReceiptId: 'reader-complete', livenessStatus: 'STAGE_COMPLETE',
  });
});

test('missing reader receipt replays only as a fresh first-message GitHub stage', () => {
  const route = escalatedRoute();
  const completedAt = '2026-09-02T12:04:00.000Z';
  const prior = completedPrior('EXTRA_HIGH_READER', '2026-09-02T12:00:00.000Z', completedAt);
  const before = Date.parse(completedAt) + STAGE_RECEIPT_GRACE_MS - 1;
  const after = Date.parse(completedAt) + STAGE_RECEIPT_GRACE_MS;
  assert.equal(stageReceiptGraceElapsed(prior, before), false);
  assert.equal(nextSupervisoryCycleAction(route, prior, before).recovery, 'AWAITING_STAGE_RECEIPT');
  assert.deepEqual(nextSupervisoryCycleAction(route, prior, after), {
    type: 'SEND_CONTROL', step: 'EXTRA_HIGH_READER', model: 'EXTRA_HIGH', recovery: 'MISSING_STAGE_RECEIPT_FRESH_REPLAY',
  });
  const exhaustedPrior = { ...prior, stageAttempts: { EXTRA_HIGH_READER: 3 } };
  const exhausted = nextSupervisoryCycleAction(route, exhaustedPrior, after, CONTINUE_NUDGE_DELAY_MS, 3);
  assert.equal(exhausted.type, 'WAIT_GITHUB_RECEIPT');
  assert.equal(exhausted.recovery, 'FRESH_STAGE_REPLAY_LIMIT_REACHED');
});

test('durable Pro decision receipt admits a fresh Extra High final writer directly', () => {
  const route = escalatedRoute();
  const proComplete = completedPrior('PRO_REASONER', '2026-09-02T12:10:00.000Z', '2026-09-02T12:15:00.000Z');
  assert.equal(nextSupervisoryCycleAction(route, proComplete, Date.parse('2026-09-02T12:15:30.000Z')).recovery, 'AWAITING_STAGE_RECEIPT');
  const doneRoute = withStage(route, 'PRO_DECISION_STAGE', 'STAGE_COMPLETE', 'pro-complete', '2026-09-02T12:16:30.000Z');
  assert.deepEqual(nextSupervisoryCycleAction(doneRoute, proComplete), {
    type: 'SEND_CONTROL', step: 'EXTRA_HIGH_WRITER', model: 'EXTRA_HIGH', stageReceiptId: 'pro-complete', livenessStatus: 'STAGE_COMPLETE',
  });
  const prompt = cycleControlPrompt(route, 'EXTRA_HIGH_WRITER');
  assert.match(prompt, /DURABLE_STAGE_RECEIPT_ATTESTED/);
  assert.match(prompt, /without reinterpreting the Pro decision/);
});

test('CONTINUE_REQUIRED starts a new Pro first-message GitHub stage and never a follow-up turn', () => {
  const proPrior = completedPrior('PRO_REASONER', '2026-09-02T12:10:00.000Z', '2026-09-02T12:15:00.000Z');
  const route = withStage(escalatedRoute(), 'PRO_DECISION_STAGE', 'CONTINUE_REQUIRED', 'pro-more-1', '2026-09-02T12:16:30.000Z', 1);
  assert.deepEqual(nextSupervisoryCycleAction(route, proPrior), {
    type: 'SEND_CONTROL', step: 'PRO_REASONER', model: 'PRO', recovery: 'FRESH_STAGE_CONTINUATION_REQUIRED', stageReceiptId: 'pro-more-1',
  });
  assert.match(cycleControlPrompt(route, 'PRO_REASONER'), /first and only message/);
  assert.throws(() => cycleControlPrompt(route, 'PRO_REASONER_CONTINUE'), /Unknown supervisory-cycle step/);
});

test('stale or cross-stage receipts cannot advance a fresh stage attempt', () => {
  const prior = completedPrior('EXTRA_HIGH_READER', '2026-09-02T12:00:00.000Z', '2026-09-02T12:04:00.000Z');
  const beforeGrace = Date.parse('2026-09-02T12:05:00.000Z');
  const wrongBinding = withStage(escalatedRoute(), 'EXTRA_HIGH_READER', 'STAGE_COMPLETE', 'wrong-binding', '2026-09-02T12:02:00.000Z');
  wrongBinding.stageLiveness.EXTRA_HIGH_READER.latest.bindingProviderSessionId = 'provider-session:old-binding';
  assert.equal(nextSupervisoryCycleAction(wrongBinding, prior, beforeGrace).recovery, 'AWAITING_STAGE_RECEIPT');

  const wrongStageSession = withStage(escalatedRoute(), 'EXTRA_HIGH_READER', 'STAGE_COMPLETE', 'wrong-stage', '2026-09-02T12:02:00.000Z');
  wrongStageSession.stageLiveness.EXTRA_HIGH_READER.latest.stageProviderSessionId = 'provider-session:old-reader';
  assert.equal(nextSupervisoryCycleAction(wrongStageSession, prior, beforeGrace).recovery, 'AWAITING_STAGE_RECEIPT');
});

test('fresh semantic replay stops at the configured bounded attempt count', () => {
  const proPrior = { ...completedPrior('PRO_REASONER', '2026-09-02T12:10:00.000Z', '2026-09-02T12:15:00.000Z'), stageAttempts: { PRO_REASONER: 3 } };
  const route = withStage(escalatedRoute(), 'PRO_DECISION_STAGE', 'CONTINUE_REQUIRED', 'pro-more-3', '2026-09-02T12:16:30.000Z', 3);
  const held = nextSupervisoryCycleAction(route, proPrior, Date.now(), CONTINUE_NUDGE_DELAY_MS, 3);
  assert.equal(held.type, 'WAIT_GITHUB_RECEIPT');
  assert.equal(held.recovery, 'FRESH_STAGE_REPLAY_LIMIT_REACHED');
});

test('missing final receipts replay the same immutable stage in a fresh first message', () => {
  const completedAt = '2026-09-02T12:00:00.000Z';
  const before = Date.parse(completedAt) + CONTINUE_NUDGE_DELAY_MS - 1;
  const after = Date.parse(completedAt) + CONTINUE_NUDGE_DELAY_MS;
  const directRoute = directRouteFixture();
  const directComplete = completedPrior('EXTRA_HIGH_DIRECT', '2026-09-02T11:59:00.000Z', completedAt);
  assert.equal(continueNudgeEligible(directComplete, before), false);
  assert.equal(nextSupervisoryCycleAction(directRoute, directComplete, before).type, 'WAIT_GITHUB_RECEIPT');
  assert.deepEqual(nextSupervisoryCycleAction(directRoute, directComplete, after), {
    type: 'SEND_CONTROL', step: 'EXTRA_HIGH_DIRECT', model: 'EXTRA_HIGH', recovery: 'MISSING_FINAL_RECEIPT_FRESH_REPLAY',
  });

  const writerComplete = completedPrior('EXTRA_HIGH_WRITER', '2026-09-02T12:30:00.000Z', '2026-09-02T12:31:00.000Z');
  const writerAfter = Date.parse(writerComplete.generationCompletedAt) + CONTINUE_NUDGE_DELAY_MS;
  assert.deepEqual(nextSupervisoryCycleAction(escalatedRoute(), writerComplete, writerAfter), {
    type: 'SEND_CONTROL', step: 'EXTRA_HIGH_WRITER', model: 'EXTRA_HIGH', recovery: 'MISSING_FINAL_RECEIPT_FRESH_REPLAY',
  });
});

test('new direct routes contain only fresh preload and first-message decision stages', () => {
  for (const [lane, step, model, provenance] of [
    ['EXTRA_HIGH_DIRECT', 'EXTRA_HIGH_DECISION', 'EXTRA_HIGH', 'VISIBLE_EXTRA_HIGH_SESSION_GITHUB_ATTESTED'],
    ['PRO_ESCALATED', 'PRO_DECISION', 'PRO', 'VISIBLE_PRO_SESSION_GITHUB_ATTESTED'],
  ]) {
    const route = directV4Route(lane);
    assert.deepEqual(nextSupervisoryCycleAction(route, null), { type: 'SEND_CONTROL', step: MCP_BINDING_PRELOAD_STEP, model: 'EXTRA_HIGH' });
    const bound = { ...route, firstTurnMcpReceipt: { receiptId: 'binding-current' } };
    assert.deepEqual(nextSupervisoryCycleAction(bound, { status: completedCycleStepStatus(MCP_BINDING_PRELOAD_STEP), cycleStep: MCP_BINDING_PRELOAD_STEP }), {
      type: 'SEND_CONTROL', step, model,
    });
    const prompt = cycleControlPrompt(route, step);
    assert.match(prompt, /schema_version 3/);
    assert.match(prompt, /decision_provider_session_id/);
    assert.match(prompt, /binding envelope/);
    assert.match(prompt, new RegExp(provenance));
    assert.match(prompt, /first and only message/);
    assert.match(prompt, /selectable composer chip is not required/);
    assert.doesNotMatch(prompt, /MISSION_CONTROL_CHAT_STAGE_RECEIPT|EXTRA_HIGH_READER|EXTRA_HIGH_WRITER|get_stage_liveness_state/);
    assert.match(prompt, /Do not use or call Mission Control/);
  }
});

test('new direct decision stage fails closed after one clean attempt without continue or automatic retry', () => {
  const route = directV4Route('PRO_ESCALATED');
  const completedAt = '2026-09-02T12:00:00.000Z';
  const prior = {
    status: completedCycleStepStatus('PRO_DECISION'), cycleStep: 'PRO_DECISION', providerSessionId: 'provider-session:decision',
    generationStartedAt: '2026-09-02T11:59:00.000Z', generationCompletedAt: completedAt, stageAttempts: { PRO_DECISION: 1 },
  };
  assert.equal(nextSupervisoryCycleAction(route, prior, Date.parse(completedAt) + CONTINUE_NUDGE_DELAY_MS - 1).recovery, 'AWAITING_MANDATORY_DECISION_RECEIPT');
  assert.deepEqual(nextSupervisoryCycleAction(route, prior, Date.parse(completedAt) + CONTINUE_NUDGE_DELAY_MS), {
    type: 'WAIT_GITHUB_RECEIPT', recovery: 'MANDATORY_DECISION_RECEIPT_MISSING_NO_AUTOMATIC_RETRY',
  });
  assert.deepEqual(nextSupervisoryCycleAction(route, { ...prior, status: 'FAILED_RETRYABLE' }), {
    type: 'WAIT_GITHUB_RECEIPT', recovery: 'MANDATORY_DECISION_STAGE_FAILED_NO_AUTOMATIC_RETRY',
  });
});

test('new schema v4 parses and extracts without changing staged schema v3 compatibility', () => {
  assert.equal(parseSupervisoryCycleRouteBody(directSupervisoryBody('PRO_ESCALATED')).routeSchemaVersion, 4);
  assert.equal(parseSupervisoryCycleRouteBody(supervisoryBody('PRO_ESCALATED')).routeSchemaVersion, 3);
  const chat = parseChatDirectory([chatFixture()])[0];
  const routes = extractQueuedRoutes({ workers: [{
    id: 'worker-a', name: 'Worker A', timeline: [
      { eventId: 'direct-route', sequence: 1, occurredAt: '2026-09-02T12:00:00.000Z', data: { type: 'worker_message_recorded', message_id: 'm1', body: directSupervisoryBody('PRO_ESCALATED') } },
    ],
  }] }, [chat], defaultState());
  assert.equal(routes.length, 1);
  assert.equal(routes[0].packet.routeSchemaVersion, 4);
});

test('ambiguous routes never receive automatic recovery', () => {
  assert.equal(nextSupervisoryCycleAction(escalatedRoute(), { status: 'AMBIGUOUS_AFTER_RESTART' }), null);
});

test('tab plan returns every surplus managed ChatGPT tab toward one-tab steady state without pinning history', () => {
  const chats = parseChatDirectory([chatFixture('pm', 'PROJECT_MANAGER'), chatFixture(), chatFixture('b'), chatFixture('c')]);
  const targets = chats.map((chat) => ({ id: chat.supervisorId, type: 'page', url: chat.bootstrapCapability.url }));
  const state = defaultState();
  state.tabs = {
    pm: { targetId: 'pm', lastUsedAt: '2026-01-01T00:00:00Z' },
    spec: { targetId: 'spec', lastUsedAt: '2026-01-02T00:00:00Z' },
    b: { targetId: 'b', lastUsedAt: '2026-01-03T00:00:00Z' },
    c: { targetId: 'c', lastUsedAt: '2026-01-04T00:00:00Z' },
  };
  assert.deepEqual(selectManagedTabClosures({ targets, chats, state, activeTargetId: 'b', pressure: 'NORMAL', maxHotTabs: 3 }), ['pm', 'spec', 'c']);
});

test('fresh chat reuses the current managed target and fails closed before opening a fourth tab', () => {
  const targets = [
    { id: 'current', type: 'page', url: 'https://chatgpt.com/c/current' },
    { id: 'transition', type: 'page', url: 'https://chatgpt.com/c/transition' },
    { id: 'recovery', type: 'page', url: 'https://chatgpt.com/auth/recovery' },
    { id: 'unmanaged', type: 'page', url: 'https://example.com/' },
  ];
  assert.deepEqual(freshChatTargetPlan(targets, { reusableTargetId: 'current' }), {
    type: 'REUSE_CURRENT', targetId: 'current', managedChatGptTabCount: 3,
  });
  assert.throws(() => freshChatTargetPlan(targets, {
    reusableTargetId: 'current', reuseFailed: true, hardCeiling: MANAGED_CHATGPT_HARD_CEILING_TABS,
  }), /refusing to open managed tab 4/);
  assert.deepEqual(managedChatGptTabTelemetry(targets), {
    managedChatGptTabCount: 3, steadyStateTarget: 1, transitionMax: 2, hardCeiling: 3, hardCeilingExceeded: false,
  });
});

test('replacement recovery verifies the replacement before closing the superseded target', async () => {
  assert.deepEqual(freshChatTargetPlan([
    { id: 'broken', type: 'page', url: 'https://chatgpt.com/c/broken' },
  ], { reusableTargetId: 'broken', reuseFailed: true }), {
    type: 'OPEN_REPLACEMENT', supersededTargetId: 'broken', managedChatGptTabCount: 1,
  });
  const operations = [];
  const replacement = await replaceUnusableManagedChatGptTarget({
    targets: [{ id: 'broken', type: 'page', url: 'https://chatgpt.com/c/broken' }],
    reusableTargetId: 'broken',
    openReplacement: async () => { operations.push('open:replacement'); return { id: 'replacement' }; },
    verifyReplacement: async () => { operations.push('verify:replacement'); },
    closeTarget: async (targetId) => { operations.push(`close:${targetId}`); },
  });
  assert.equal(replacement.replacedTargetId, 'broken');
  assert.deepEqual(operations, ['open:replacement', 'verify:replacement', 'close:broken']);
});

function escalatedRoute() {
  return routeFixture('r1', 'PRO_ESCALATED', 'provider-session:reader');
}

function directRouteFixture() {
  return routeFixture('r-direct', 'EXTRA_HIGH_DIRECT', 'provider-session:direct');
}

function directV4Route(reasoningLane) {
  return routeFixture('r1', reasoningLane, 'provider-session:decision', 4);
}

function routeFixture(requestId, reasoningLane, providerSessionId, routeSchemaVersion = 3) {
  const base = {
    routeKind: 'SUPERVISORY_CYCLE', requestId, supervisorId: 'spec', workerId: 'worker-a', providerSessionId,
    bindingProviderSessionId: 'provider-session:binding', decisionReceipt: null, stageLiveness: {},
    chat: { supervisorId: 'spec', requiredApps: { missionControl: 'Mission Control', github: 'GitHub' } },
    packet: {
      routeSchemaVersion,
      nonce: 'n1', reasoningLane, queuedAt: '2026-09-02T00:00:00.000Z', expiresAt: '2026-09-03T00:00:00.000Z',
      evidenceCapsule: { id: 'cap1', sha256: 'a'.repeat(64) }, ownerOutcome: { id: 'out1', epoch: 1, sha256: 'b'.repeat(64) },
      githubReceipt: { repository: 'o/r', issueNumber: 1, stageIssueNumber: 2 },
      factualPacket: { evidenceRefs: ['https://github.com/o/r/issues/3'], decisionRequested: 'decide' },
    },
  };
  return { ...base, bindingCapsule: deriveBindingCapsule(base, 'provider-session:binding', 'binding-receipt') };
}

function withStage(route, stage, status, receiptId, occurredAt, continueRequiredCount = status === 'CONTINUE_REQUIRED' ? 1 : 0) {
  const stageProviderSessionId = stage === 'PRO_DECISION_STAGE' ? 'provider-session:pro' : 'provider-session:reader';
  return {
    ...route,
    providerSessionId: stageProviderSessionId,
    stageLiveness: {
      ...(route.stageLiveness ?? {}),
      [stage]: { latest: {
        receiptId, requestId: route.requestId, bindingProviderSessionId: route.bindingProviderSessionId,
        stageProviderSessionId, stage, status, occurredAt, sequence: 100 + continueRequiredCount,
      }, continueRequiredCount },
    },
  };
}

function completedPrior(step, generationStartedAt, generationCompletedAt) {
  const providerSessionId = step === 'EXTRA_HIGH_READER' ? 'provider-session:reader'
    : step === 'PRO_REASONER' ? 'provider-session:pro'
      : step === 'EXTRA_HIGH_WRITER' ? 'provider-session:writer'
        : step === 'EXTRA_HIGH_DIRECT' ? 'provider-session:direct'
          : 'provider-session:binding';
  return { status: completedCycleStepStatus(step), cycleStep: step, providerSessionId, generationStartedAt, generationCompletedAt };
}

function chatFixture(supervisorId = 'spec', scope = 'SPECIALIST') {
  return {
    scope, supervisorId, label: 'Specialist', workerId: 'worker-a', pinned: scope === 'PROJECT_MANAGER',
    bootstrapCapability: { chatId: `${supervisorId}-bootstrap`, url: `https://chatgpt.com/c/${supervisorId}-chat`, challengeId: `challenge-${supervisorId}` },
    modelLabels: { extraHigh: 'Extra High', pro: 'Pro' },
    requiredApps: { missionControl: 'Mission Control', github: 'GitHub' },
  };
}

function evidence(id, sequence, summary, refs, occurredAt = '2026-09-02T00:00:00.000Z') {
  return { eventId: id, sequence, occurredAt, data: { type: 'evidence_receipt_recorded', receipt_id: id, summary, refs, verified: true } };
}

function snapshotWithEvidence(timeline) {
  return { workers: [{ id: 'worker-a', timeline }] };
}

function supervisoryBody(lane) {
  return STAGED_PROVIDER_SESSION_CYCLE_ROUTE_PREFIX + JSON.stringify({
    schemaVersion: 3, packetKind: 'PROVIDER_SESSION_SUPERVISORY_CYCLE', requestId: 'r1', nonce: 'n1', reasoningLane: lane,
    destination: 'SPECIALIST_SUPERVISOR_CHAT', destinationSupervisorId: 'spec', providerDeliveryState: 'QUEUED_FOR_PROVIDER_RELAY',
    evidenceCapsule: { id: 'cap1', sha256: 'a'.repeat(64) }, ownerOutcome: { id: 'out1', epoch: 1, sha256: 'b'.repeat(64) },
    githubReceipt: { repository: 'o/r', issueNumber: 1, stageIssueNumber: 2 }, factualPacket: { packetId: 'p1', taskId: 't1', exactFactualState: 'x', evidenceRefs: [], decisionRequested: 'decide' },
    queuedAt: '2026-09-02T00:00:00.000Z', expiresAt: '2026-09-03T00:00:00.000Z',
  });
}

function directSupervisoryBody(lane) {
  return PROVIDER_SESSION_CYCLE_ROUTE_PREFIX + JSON.stringify({
    schemaVersion: 4, packetKind: 'PROVIDER_SESSION_SUPERVISORY_CYCLE', requestId: 'r1', nonce: 'n1', reasoningLane: lane,
    destination: 'SPECIALIST_SUPERVISOR_CHAT', destinationSupervisorId: 'spec', providerDeliveryState: 'QUEUED_FOR_PROVIDER_RELAY',
    evidenceCapsule: { id: 'cap1', sha256: 'a'.repeat(64) }, ownerOutcome: { id: 'out1', epoch: 1, sha256: 'b'.repeat(64) },
    githubReceipt: { repository: 'o/r', issueNumber: 1, stageIssueNumber: 2 }, factualPacket: { packetId: 'p1', taskId: 't1', exactFactualState: 'x', evidenceRefs: [], decisionRequested: 'decide' },
    queuedAt: '2026-09-02T00:00:00.000Z', expiresAt: '2026-09-03T00:00:00.000Z',
  });
}
