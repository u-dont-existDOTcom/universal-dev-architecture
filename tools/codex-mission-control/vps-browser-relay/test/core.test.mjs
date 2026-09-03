import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPABILITY_CHALLENGE_SUMMARY,
  CAPABILITY_VERIFIED_SUMMARY,
  CONTINUE_NUDGE_DELAY_MS,
  MODE_CAPABILITY_VERIFIED_SUMMARY,
  STAGE_LIVENESS_SUMMARY,
  STAGE_RECEIPT_GRACE_MS,
  SUPERVISORY_CYCLE_ROUTE_PREFIX,
  capabilityControlPrompt,
  chatCapabilityState,
  classifyMemoryPressure,
  completedCycleStepStatus,
  continueNudgeEligible,
  cycleControlPrompt,
  defaultState,
  extractQueuedRoutes,
  nextSupervisoryCycleAction,
  normalizeConversationUrl,
  oneShotExitCode,
  parseChatDirectory,
  parseSupervisoryCycleRouteBody,
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
  assert.equal(chat.chatId, 'spec');
  assert.equal(chat.capabilityChallengeId, 'challenge-spec');
  assert.equal(Object.hasOwn(chat, 'capabilities'), false);
  assert.throws(() => parseChatDirectory([{ ...chatFixture(), workerId: null }]), /workerId/);
  assert.throws(() => parseChatDirectory([{ ...chatFixture(), url: 'https://example.com/c/x' }]), /chatgpt\.com/);
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
      'challenge:challenge-spec', 'chat:spec', 'mc_nonce:mc-secret', `github_nonce_sha256:${sha256('gh-secret')}`,
      'github_nonce_source:https://github.com/o/r/issues/2', 'receipt_target:https://github.com/o/r/issues/2', `expires_at:${future}`,
    ]),
    evidence('tool-cap', 2, CAPABILITY_VERIFIED_SUMMARY, [
      'challenge:challenge-spec', 'chat:spec', 'capability:missionControlRead', 'capability:githubRead', 'capability:githubWrite', `expires_at:${future}`,
    ]),
    evidence('mode-cap', 3, MODE_CAPABILITY_VERIFIED_SUMMARY, [
      'chat:spec', 'capability:modeSwitching', 'extra_high_label:Extra High', 'pro_label:Pro', `expires_at:${future}`,
    ]),
  ]);
  const current = chatCapabilityState(snapshot, chat, '2026-09-02T12:00:00.000Z');
  assert.equal(current.challengeAvailable, true);
  assert.equal(current.allCurrent, true);
  assert.equal(chatCapabilityState(snapshot, chat, '2026-09-04T00:00:00.000Z').allCurrent, false);
});

test('capability control prompt requires the exact Mission Control app tool and separate hash-bound GitHub read without embedding nonce values', () => {
  const prompt = capabilityControlPrompt(parseChatDirectory([chatFixture()])[0]);
  assert.match(prompt, /custom app named exactly Mission Control/);
  assert.match(prompt, /get_capability_challenge/);
  assert.match(prompt, /challenge_id challenge-spec and chat_id spec/);
  assert.match(prompt, /github_nonce_source/);
  assert.match(prompt, /Compute its SHA-256/);
  assert.match(prompt, /expires_at has passed/);
  assert.match(prompt, /exact ordered capabilities/);
  assert.doesNotMatch(prompt, /mc-secret|gh-secret/);
});

test('every substantive cycle prompt reads the exact MCP request binding before reasoning or writing', () => {
  const route = escalatedRoute();
  for (const step of ['EXTRA_HIGH_READER', 'PRO_REASONER', 'PRO_LIVENESS_CHECK', 'EXTRA_HIGH_WRITER']) {
    const prompt = cycleControlPrompt(route, step);
    assert.match(prompt, /Mission Control/);
    assert.match(prompt, /get_supervisory_request_binding/);
    assert.match(prompt, /request_id r1 and chat_id spec/);
    assert.doesNotMatch(prompt, /request_nonce n1/);
  }
  assert.match(cycleControlPrompt(route, 'PRO_LIVENESS_CHECK'), /get_stage_liveness_state/);
  assert.match(cycleControlPrompt(route, 'EXTRA_HIGH_WRITER'), /get_stage_liveness_state/);
  assert.match(cycleControlPrompt(directRouteFixture(), 'EXTRA_HIGH_DIRECT'), /get_supervisory_request_binding/);
});

test('route extraction binds durable stage-liveness receipts to the exact worker/request', () => {
  const chat = parseChatDirectory([chatFixture()])[0];
  const body = supervisoryBody('PRO_ESCALATED');
  const timeline = [
    { eventId: 'e1', sequence: 1, occurredAt: '2026-09-02T12:00:00.000Z', data: { type: 'worker_message_recorded', message_id: 'm1', body } },
    evidence('reader-more', 2, STAGE_LIVENESS_SUMMARY, ['request:r1', 'chat:spec', 'stage:EXTRA_HIGH_READER', 'status:CONTINUE_REQUIRED'], '2026-09-02T12:02:00.000Z'),
    evidence('reader-done', 3, STAGE_LIVENESS_SUMMARY, ['request:r1', 'chat:spec', 'stage:EXTRA_HIGH_READER', 'status:STAGE_COMPLETE'], '2026-09-02T12:03:00.000Z'),
    evidence('other-request', 4, STAGE_LIVENESS_SUMMARY, ['request:other', 'chat:spec', 'stage:PRO_REASONER', 'status:CONTINUE_REQUIRED'], '2026-09-02T12:04:00.000Z'),
  ];
  const routes = extractQueuedRoutes({ workers: [{ id: 'worker-a', name: 'Worker A', timeline }] }, [chat], defaultState());
  assert.equal(routes.length, 1);
  assert.equal(routes[0].routeKind, 'SUPERVISORY_CYCLE');
  assert.equal(routes[0].stageLiveness.EXTRA_HIGH_READER.latest.status, 'STAGE_COMPLETE');
  assert.equal(routes[0].stageLiveness.EXTRA_HIGH_READER.continueRequiredCount, 1);
  assert.equal(routes[0].stageLiveness.PRO_REASONER, undefined);
});

test('escalated route waits for durable reader liveness before entering Pro', () => {
  const route = escalatedRoute();
  assert.deepEqual(nextSupervisoryCycleAction(route, null), { type: 'SEND_CONTROL', step: 'EXTRA_HIGH_READER', model: 'EXTRA_HIGH' });
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

test('missing reader liveness after grace gets one same-chat reader continue, then waits fail-closed', () => {
  const route = escalatedRoute();
  const completedAt = '2026-09-02T12:04:00.000Z';
  const prior = completedPrior('EXTRA_HIGH_READER', '2026-09-02T12:00:00.000Z', completedAt);
  const before = Date.parse(completedAt) + STAGE_RECEIPT_GRACE_MS - 1;
  const after = Date.parse(completedAt) + STAGE_RECEIPT_GRACE_MS;
  assert.equal(stageReceiptGraceElapsed(prior, before), false);
  assert.equal(nextSupervisoryCycleAction(route, prior, before).recovery, 'AWAITING_STAGE_RECEIPT');
  assert.deepEqual(nextSupervisoryCycleAction(route, prior, after), {
    type: 'SEND_CONTROL', step: 'EXTRA_HIGH_READER_CONTINUE', model: 'EXTRA_HIGH', recovery: 'MISSING_STAGE_RECEIPT',
  });
  assert.equal(cycleControlPrompt(route, 'EXTRA_HIGH_READER_CONTINUE'), 'continue');
  const afterNudge = completedPrior('EXTRA_HIGH_READER_CONTINUE', '2026-09-02T12:11:00.000Z', '2026-09-02T12:12:00.000Z');
  const exhausted = nextSupervisoryCycleAction(route, afterNudge, Date.parse('2026-09-02T12:20:00.000Z'));
  assert.equal(exhausted.type, 'WAIT_GITHUB_RECEIPT');
  assert.equal(exhausted.recovery, 'MISSING_STAGE_RECEIPT_AFTER_NUDGE');
});

test('Pro is followed by an Extra High liveness checker before writer admission', () => {
  const route = escalatedRoute();
  const proComplete = completedPrior('PRO_REASONER', '2026-09-02T12:10:00.000Z', '2026-09-02T12:15:00.000Z');
  assert.deepEqual(nextSupervisoryCycleAction(route, proComplete), { type: 'SEND_CONTROL', step: 'PRO_LIVENESS_CHECK', model: 'EXTRA_HIGH' });
  const prompt = cycleControlPrompt(route, 'PRO_LIVENESS_CHECK');
  assert.match(prompt, /Do not reinterpret/);
  assert.match(prompt, /PRO_REASONER/);

  const checkerPrior = completedPrior('PRO_LIVENESS_CHECK', '2026-09-02T12:16:00.000Z', '2026-09-02T12:17:00.000Z');
  const doneRoute = withStage(route, 'PRO_REASONER', 'STAGE_COMPLETE', 'pro-complete', '2026-09-02T12:16:30.000Z');
  assert.deepEqual(nextSupervisoryCycleAction(doneRoute, checkerPrior), {
    type: 'SEND_CONTROL', step: 'EXTRA_HIGH_WRITER', model: 'EXTRA_HIGH', stageReceiptId: 'pro-complete', livenessStatus: 'STAGE_COMPLETE',
  });
});

test('CONTINUE_REQUIRED from Pro checker routes back to Pro continue and can repeat until complete', () => {
  const checkerPrior = completedPrior('PRO_LIVENESS_CHECK', '2026-09-02T12:16:00.000Z', '2026-09-02T12:17:00.000Z');
  let route = withStage(escalatedRoute(), 'PRO_REASONER', 'CONTINUE_REQUIRED', 'pro-more-1', '2026-09-02T12:16:30.000Z', 1);
  assert.deepEqual(nextSupervisoryCycleAction(route, checkerPrior), {
    type: 'SEND_CONTROL', step: 'PRO_REASONER_CONTINUE', model: 'PRO', recovery: 'SEMANTIC_CONTINUE_REQUIRED', stageReceiptId: 'pro-more-1',
  });
  assert.equal(cycleControlPrompt(route, 'PRO_REASONER_CONTINUE'), 'continue');

  const proContinued = completedPrior('PRO_REASONER_CONTINUE', '2026-09-02T12:18:00.000Z', '2026-09-02T12:20:00.000Z');
  assert.deepEqual(nextSupervisoryCycleAction(route, proContinued), { type: 'SEND_CONTROL', step: 'PRO_LIVENESS_CHECK', model: 'EXTRA_HIGH' });

  const checkerAgain = completedPrior('PRO_LIVENESS_CHECK', '2026-09-02T12:21:00.000Z', '2026-09-02T12:22:00.000Z');
  route = withStage(route, 'PRO_REASONER', 'STAGE_COMPLETE', 'pro-done', '2026-09-02T12:21:30.000Z', 1);
  assert.equal(nextSupervisoryCycleAction(route, checkerAgain).step, 'EXTRA_HIGH_WRITER');
});

test('semantic CONTINUE_REQUIRED recovery permits the configured count then stops on the next request', () => {
  const checkerPrior = completedPrior('PRO_LIVENESS_CHECK', '2026-09-02T12:16:00.000Z', '2026-09-02T12:17:00.000Z');
  const third = withStage(escalatedRoute(), 'PRO_REASONER', 'CONTINUE_REQUIRED', 'pro-more-3', '2026-09-02T12:16:30.000Z', 3);
  assert.equal(nextSupervisoryCycleAction(third, checkerPrior, Date.now(), CONTINUE_NUDGE_DELAY_MS, 3).step, 'PRO_REASONER_CONTINUE');
  const fourth = withStage(escalatedRoute(), 'PRO_REASONER', 'CONTINUE_REQUIRED', 'pro-more-4', '2026-09-02T12:16:30.000Z', 4);
  const held = nextSupervisoryCycleAction(fourth, checkerPrior, Date.now(), CONTINUE_NUDGE_DELAY_MS, 3);
  assert.equal(held.type, 'WAIT_GITHUB_RECEIPT');
  assert.equal(held.recovery, 'SEMANTIC_CONTINUE_LIMIT_REACHED');
});

test('final Extra High receipt-writing steps retain delayed decision-receipt recovery', () => {
  const completedAt = '2026-09-02T12:00:00.000Z';
  const before = Date.parse(completedAt) + CONTINUE_NUDGE_DELAY_MS - 1;
  const after = Date.parse(completedAt) + CONTINUE_NUDGE_DELAY_MS;
  const directRoute = directRouteFixture();
  const directComplete = completedPrior('EXTRA_HIGH_DIRECT', '2026-09-02T11:59:00.000Z', completedAt);
  assert.equal(continueNudgeEligible(directComplete, before), false);
  assert.equal(nextSupervisoryCycleAction(directRoute, directComplete, before).type, 'WAIT_GITHUB_RECEIPT');
  assert.deepEqual(nextSupervisoryCycleAction(directRoute, directComplete, after), {
    type: 'SEND_CONTROL', step: 'EXTRA_HIGH_DIRECT_CONTINUE', model: 'EXTRA_HIGH', recovery: 'MISSING_FINAL_RECEIPT',
  });
  assert.equal(cycleControlPrompt(directRoute, 'EXTRA_HIGH_DIRECT_CONTINUE'), 'continue');

  const writerComplete = completedPrior('EXTRA_HIGH_WRITER', '2026-09-02T12:30:00.000Z', '2026-09-02T12:31:00.000Z');
  const writerAfter = Date.parse(writerComplete.generationCompletedAt) + CONTINUE_NUDGE_DELAY_MS;
  assert.deepEqual(nextSupervisoryCycleAction(escalatedRoute(), writerComplete, writerAfter), {
    type: 'SEND_CONTROL', step: 'EXTRA_HIGH_WRITER_CONTINUE', model: 'EXTRA_HIGH', recovery: 'MISSING_FINAL_RECEIPT',
  });
});

test('ambiguous routes never receive automatic recovery', () => {
  assert.equal(nextSupervisoryCycleAction(escalatedRoute(), { status: 'AMBIGUOUS_AFTER_RESTART' }), null);
});

test('tab plan preserves active target then pinned PM and closes LRU', () => {
  const chats = parseChatDirectory([
    { ...chatFixture(), scope: 'PROJECT_MANAGER', chatId: 'pm', url: 'https://chatgpt.com/c/pm', capabilityChallengeId: 'c-pm', pinned: true },
    chatFixture(),
    { ...chatFixture(), chatId: 'b', url: 'https://chatgpt.com/c/b', capabilityChallengeId: 'c-b' },
    { ...chatFixture(), chatId: 'c', url: 'https://chatgpt.com/c/c', capabilityChallengeId: 'c-c' },
  ]);
  const targets = chats.map((chat) => ({ id: chat.chatId, type: 'page', url: chat.url }));
  const state = defaultState();
  state.tabs = {
    pm: { targetId: 'pm', lastUsedAt: '2026-01-01T00:00:00Z' },
    spec: { targetId: 'spec', lastUsedAt: '2026-01-02T00:00:00Z' },
    b: { targetId: 'b', lastUsedAt: '2026-01-03T00:00:00Z' },
    c: { targetId: 'c', lastUsedAt: '2026-01-04T00:00:00Z' },
  };
  assert.deepEqual(selectManagedTabClosures({ targets, chats, state, activeTargetId: 'b', pressure: 'NORMAL', maxHotTabs: 3 }), ['spec']);
});

function escalatedRoute() {
  return {
    routeKind: 'SUPERVISORY_CYCLE', requestId: 'r1', decisionReceipt: null, stageLiveness: {}, chat: { chatId: 'spec' },
    packet: { reasoningLane: 'PRO_ESCALATED', githubReceipt: { repository: 'o/r', issueNumber: 1 } },
  };
}

function directRouteFixture() {
  return {
    routeKind: 'SUPERVISORY_CYCLE', requestId: 'r-direct', decisionReceipt: null, stageLiveness: {}, chat: { chatId: 'spec' },
    packet: { reasoningLane: 'EXTRA_HIGH_DIRECT', githubReceipt: { repository: 'o/r', issueNumber: 1 } },
  };
}

function withStage(route, stage, status, receiptId, occurredAt, continueRequiredCount = status === 'CONTINUE_REQUIRED' ? 1 : 0) {
  return {
    ...route,
    stageLiveness: {
      ...(route.stageLiveness ?? {}),
      [stage]: { latest: { receiptId, requestId: route.requestId, stage, status, occurredAt, sequence: 100 + continueRequiredCount }, continueRequiredCount },
    },
  };
}

function completedPrior(step, generationStartedAt, generationCompletedAt) {
  return { status: completedCycleStepStatus(step), cycleStep: step, generationStartedAt, generationCompletedAt };
}

function chatFixture() {
  return {
    scope: 'SPECIALIST', chatId: 'spec', label: 'Specialist', url: 'https://chatgpt.com/c/spec-chat', workerId: 'worker-a', pinned: false,
    capabilityChallengeId: 'challenge-spec', modelLabels: { extraHigh: 'Extra High', pro: 'Pro' },
  };
}

function evidence(id, sequence, summary, refs, occurredAt = '2026-09-02T00:00:00.000Z') {
  return { eventId: id, sequence, occurredAt, data: { type: 'evidence_receipt_recorded', receipt_id: id, summary, refs, verified: true } };
}

function snapshotWithEvidence(timeline) {
  return { workers: [{ id: 'worker-a', timeline }] };
}

function supervisoryBody(lane) {
  return SUPERVISORY_CYCLE_ROUTE_PREFIX + JSON.stringify({
    schemaVersion: 2, packetKind: 'SAME_CHAT_SUPERVISORY_CYCLE', requestId: 'r1', nonce: 'n1', reasoningLane: lane,
    destination: 'SPECIALIST_SUPERVISOR_CHAT', destinationChatId: 'spec', providerDeliveryState: 'QUEUED_FOR_PROVIDER_RELAY',
    evidenceCapsule: { id: 'cap1', sha256: 'a'.repeat(64) }, ownerOutcome: { id: 'out1', epoch: 1, sha256: 'b'.repeat(64) },
    githubReceipt: { repository: 'o/r', issueNumber: 1 }, factualPacket: { packetId: 'p1', taskId: 't1', exactFactualState: 'x', evidenceRefs: [], decisionRequested: 'decide' },
    queuedAt: '2026-09-02T00:00:00.000Z', expiresAt: '2026-09-03T00:00:00.000Z',
  });
}
