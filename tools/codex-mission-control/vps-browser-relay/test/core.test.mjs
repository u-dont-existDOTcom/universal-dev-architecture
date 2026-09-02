import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPABILITY_CHALLENGE_SUMMARY,
  CAPABILITY_VERIFIED_SUMMARY,
  CONTINUE_NUDGE_DELAY_MS,
  MODE_CAPABILITY_VERIFIED_SUMMARY,
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
    evidence('challenge', CAPABILITY_CHALLENGE_SUMMARY, [
      'challenge:challenge-spec', 'chat:spec', 'mc_nonce:mc-secret', `github_nonce_sha256:${sha256('gh-secret')}`,
      'github_nonce_source:https://github.com/o/r/issues/2', 'receipt_target:https://github.com/o/r/issues/2', `expires_at:${future}`,
    ]),
    evidence('tool-cap', CAPABILITY_VERIFIED_SUMMARY, [
      'challenge:challenge-spec', 'chat:spec', 'capability:missionControlRead', 'capability:githubRead', 'capability:githubWrite', `expires_at:${future}`,
    ]),
    evidence('mode-cap', MODE_CAPABILITY_VERIFIED_SUMMARY, [
      'chat:spec', 'capability:modeSwitching', 'extra_high_label:Extra High', 'pro_label:Pro', `expires_at:${future}`,
    ]),
  ]);
  const current = chatCapabilityState(snapshot, chat, '2026-09-02T12:00:00.000Z');
  assert.equal(current.challengeAvailable, true);
  assert.equal(current.allCurrent, true);
  const expired = chatCapabilityState(snapshot, chat, '2026-09-04T00:00:00.000Z');
  assert.equal(expired.allCurrent, false);
});

test('capability control prompt requires separate MC and GitHub reads without embedding nonce values', () => {
  const chat = parseChatDirectory([chatFixture()])[0];
  const prompt = capabilityControlPrompt(chat);
  assert.match(prompt, /github_nonce_source/);
  assert.match(prompt, /Mission Control exposes only its hash/);
  assert.doesNotMatch(prompt, /mc-secret|gh-secret/);
});

test('parses and extracts a same-chat supervisory route bound to registered worker/chat', () => {
  const chat = parseChatDirectory([chatFixture()])[0];
  const body = supervisoryBody('PRO_ESCALATED');
  assert.equal(parseSupervisoryCycleRouteBody(body).reasoningLane, 'PRO_ESCALATED');
  const snapshot = {
    workers: [{ id: 'worker-a', name: 'Worker A', timeline: [{ eventId: 'e1', data: { type: 'worker_message_recorded', message_id: 'm1', body } }] }],
  };
  const routes = extractQueuedRoutes(snapshot, [chat], defaultState());
  assert.equal(routes.length, 1);
  assert.equal(routes[0].routeKind, 'SUPERVISORY_CYCLE');
  assert.equal(routes[0].chat.chatId, 'spec');
});

test('same-chat escalated state machine orders Extra High reader, Pro, Extra High writer, then GitHub receipt', () => {
  const route = { routeKind: 'SUPERVISORY_CYCLE', decisionReceipt: null, packet: { reasoningLane: 'PRO_ESCALATED' } };
  assert.deepEqual(nextSupervisoryCycleAction(route, null), { type: 'SEND_CONTROL', step: 'EXTRA_HIGH_READER', model: 'EXTRA_HIGH' });
  assert.equal(nextSupervisoryCycleAction(route, { status: startedCycleStepStatus('EXTRA_HIGH_READER') }).type, 'WAIT_GENERATION');
  assert.deepEqual(nextSupervisoryCycleAction(route, { status: completedCycleStepStatus('EXTRA_HIGH_READER') }), { type: 'SEND_CONTROL', step: 'PRO_REASONER', model: 'PRO' });
  assert.deepEqual(nextSupervisoryCycleAction(route, { status: completedCycleStepStatus('PRO_REASONER') }), { type: 'SEND_CONTROL', step: 'EXTRA_HIGH_WRITER', model: 'EXTRA_HIGH' });
  assert.equal(nextSupervisoryCycleAction(route, { status: completedCycleStepStatus('EXTRA_HIGH_WRITER') }).type, 'WAIT_GITHUB_RECEIPT');
  assert.equal(nextSupervisoryCycleAction(route, { status: 'AMBIGUOUS_AFTER_RESTART' }), null);
});

test('stuck Extra High receipt-writing steps get one delayed same-chat continue nudge and never an automatic loop', () => {
  const completedAt = '2026-09-02T12:00:00.000Z';
  const before = Date.parse(completedAt) + CONTINUE_NUDGE_DELAY_MS - 1;
  const after = Date.parse(completedAt) + CONTINUE_NUDGE_DELAY_MS;
  const directRoute = {
    routeKind: 'SUPERVISORY_CYCLE',
    requestId: 'r1',
    decisionReceipt: null,
    packet: { reasoningLane: 'EXTRA_HIGH_DIRECT', githubReceipt: { repository: 'o/r', issueNumber: 1 } },
  };
  const directComplete = { status: completedCycleStepStatus('EXTRA_HIGH_DIRECT'), generationCompletedAt: completedAt };
  assert.equal(continueNudgeEligible(directComplete, before), false);
  assert.equal(nextSupervisoryCycleAction(directRoute, directComplete, before).type, 'WAIT_GITHUB_RECEIPT');
  assert.deepEqual(nextSupervisoryCycleAction(directRoute, directComplete, after), {
    type: 'SEND_CONTROL', step: 'EXTRA_HIGH_DIRECT_CONTINUE', model: 'EXTRA_HIGH', recovery: 'CONTINUE_NUDGE',
  });
  assert.equal(cycleControlPrompt(directRoute, 'EXTRA_HIGH_DIRECT_CONTINUE'), 'continue');
  assert.equal(nextSupervisoryCycleAction(directRoute, { status: startedCycleStepStatus('EXTRA_HIGH_DIRECT_CONTINUE') }, after).type, 'WAIT_GENERATION');
  assert.deepEqual(nextSupervisoryCycleAction(directRoute, { status: completedCycleStepStatus('EXTRA_HIGH_DIRECT_CONTINUE') }, after), {
    type: 'WAIT_GITHUB_RECEIPT', recovery: 'CONTINUE_NUDGE_EXHAUSTED',
  });
  assert.deepEqual(nextSupervisoryCycleAction(directRoute, { status: 'FAILED_RETRYABLE', cycleStep: 'EXTRA_HIGH_DIRECT_CONTINUE' }, after), {
    type: 'WAIT_GITHUB_RECEIPT', recovery: 'CONTINUE_NUDGE_EXHAUSTED',
  });

  const escalatedRoute = {
    routeKind: 'SUPERVISORY_CYCLE',
    requestId: 'r2',
    decisionReceipt: null,
    packet: { reasoningLane: 'PRO_ESCALATED', githubReceipt: { repository: 'o/r', issueNumber: 1 } },
  };
  assert.deepEqual(nextSupervisoryCycleAction(escalatedRoute, { status: completedCycleStepStatus('PRO_REASONER'), generationCompletedAt: completedAt }, after), {
    type: 'SEND_CONTROL', step: 'EXTRA_HIGH_WRITER', model: 'EXTRA_HIGH',
  });
  assert.deepEqual(nextSupervisoryCycleAction(escalatedRoute, { status: completedCycleStepStatus('EXTRA_HIGH_WRITER'), generationCompletedAt: completedAt }, after), {
    type: 'SEND_CONTROL', step: 'EXTRA_HIGH_WRITER_CONTINUE', model: 'EXTRA_HIGH', recovery: 'CONTINUE_NUDGE',
  });
  assert.equal(cycleControlPrompt(escalatedRoute, 'EXTRA_HIGH_WRITER_CONTINUE'), 'continue');
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

function chatFixture() {
  return {
    scope: 'SPECIALIST', chatId: 'spec', label: 'Specialist', url: 'https://chatgpt.com/c/spec-chat', workerId: 'worker-a', pinned: false,
    capabilityChallengeId: 'challenge-spec', modelLabels: { extraHigh: 'Extra High', pro: 'Pro' },
  };
}

function evidence(id, summary, refs) {
  return { eventId: id, sequence: id === 'challenge' ? 1 : id === 'tool-cap' ? 2 : 3, occurredAt: '2026-09-02T00:00:00.000Z', data: { type: 'evidence_receipt_recorded', receipt_id: id, summary, refs, verified: true } };
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
