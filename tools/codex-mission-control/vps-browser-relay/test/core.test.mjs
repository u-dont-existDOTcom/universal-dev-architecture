import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INTERNAL_ROUTE_PREFIX,
  classifyMemoryPressure,
  defaultState,
  extractQueuedRoutes,
  normalizeConversationUrl,
  oneShotExitCode,
  parseChatDirectory,
  parseInternalSupervisorRouteBody,
  selectManagedTabClosures,
  shouldAttemptRoute,
  sha256,
} from '../src/core.mjs';

test('one-shot command fails the process when the cycle reports an error', () => {
  assert.equal(oneShotExitCode({ status: 'ERROR' }), 1);
  assert.equal(oneShotExitCode({ status: 'IDLE' }), 0);
  assert.equal(oneShotExitCode({ status: 'DRY_RUN_ROUTE_READY' }), 0);
});

test('normalizes only concrete chatgpt conversation URLs', () => {
  assert.equal(normalizeConversationUrl('https://chatgpt.com/c/abc_123/?x=1#y'), 'https://chatgpt.com/c/abc_123');
  assert.throws(() => normalizeConversationUrl('https://example.com/c/abc'), /chatgpt\.com/);
  assert.throws(() => normalizeConversationUrl('https://chatgpt.com/'), /concrete/);
});

test('chat directory pins project manager and rejects duplicate IDs', () => {
  const chats = parseChatDirectory([
    { scope: 'PROJECT_MANAGER', chatId: 'pm', label: 'PM', url: 'https://chatgpt.com/c/pm-chat', workerId: null },
    { scope: 'SPECIALIST', chatId: 'spec', label: 'Specialist', url: 'https://chatgpt.com/c/spec-chat', workerId: 'worker-a' },
  ]);
  assert.equal(chats[0].pinned, true);
  assert.equal(chats[1].pinned, false);
  assert.throws(() => parseChatDirectory([
    { scope: 'SPECIALIST', chatId: 'same', label: 'A', url: 'https://chatgpt.com/c/a' },
    { scope: 'SPECIALIST', chatId: 'same', label: 'B', url: 'https://chatgpt.com/c/b' },
  ]), /unique/);
});

test('extracts only canonical queued route packets bound to configured chats', () => {
  const body = routeBody({ requestId: 'r-1', destinationChatId: 'spec' });
  assert.equal(parseInternalSupervisorRouteBody(body).requestId, 'r-1');
  assert.equal(parseInternalSupervisorRouteBody('not a route'), null);
  const chats = parseChatDirectory([
    { scope: 'SPECIALIST', chatId: 'spec', label: 'Specialist', url: 'https://chatgpt.com/c/spec-chat', workerId: 'worker-a' },
  ]);
  const snapshot = {
    workers: [{
      id: 'worker-a',
      name: 'Worker A',
      timeline: [
        { eventId: 'event-1', data: { type: 'worker_message_recorded', message_id: 'message-1', body } },
        { eventId: 'event-2', data: { type: 'worker_message_recorded', message_id: 'message-2', body: routeBody({ requestId: 'r-2', destinationChatId: 'missing' }) } },
      ],
    }],
  };
  const routes = extractQueuedRoutes(snapshot, chats, defaultState());
  assert.equal(routes.length, 1);
  assert.equal(routes[0].routeKey, 'request:r-1');
  assert.equal(routes[0].body, body);
  assert.equal(routes[0].bodySha256, sha256(body));
});

test('completed and discarded routes do not re-enter the local queue', () => {
  const chats = parseChatDirectory([{ scope: 'SPECIALIST', chatId: 'spec', label: 'Specialist', url: 'https://chatgpt.com/c/spec-chat' }]);
  const body = routeBody({ requestId: 'r-1', destinationChatId: 'spec' });
  const snapshot = { workers: [{ id: 'w', name: 'W', timeline: [{ eventId: 'e', data: { type: 'worker_message_recorded', body } }] }] };
  const state = defaultState();
  state.deliveries['request:r-1'] = { status: 'SUBMITTED_CONFIRMED' };
  assert.equal(extractQueuedRoutes(snapshot, chats, state).length, 0);
  state.deliveries['request:r-1'] = { status: 'DISCARDED' };
  assert.equal(extractQueuedRoutes(snapshot, chats, state).length, 0);
});

test('memory pressure uses hard limits before soft limits', () => {
  const policy = {
    softAvailableMb: 4096,
    hardAvailableMb: 2048,
    softBrowserRssMb: 7168,
    hardBrowserRssMb: 9216,
    softSwapUsedMb: 512,
    hardSwapUsedMb: 1536,
  };
  assert.equal(classifyMemoryPressure({ availableMb: 8000, browserRssMb: 2000, swapUsedMb: 0 }, policy).pressure, 'NORMAL');
  assert.equal(classifyMemoryPressure({ availableMb: 3500, browserRssMb: 2000, swapUsedMb: 0 }, policy).pressure, 'SOFT');
  assert.equal(classifyMemoryPressure({ availableMb: 1800, browserRssMb: 2000, swapUsedMb: 0 }, policy).pressure, 'HARD');
  assert.equal(classifyMemoryPressure({ availableMb: 8000, browserRssMb: 9500, swapUsedMb: 0 }, policy).pressure, 'HARD');
});

test('tab plan preserves active target, then pinned PM, and closes LRU', () => {
  const chats = parseChatDirectory([
    { scope: 'PROJECT_MANAGER', chatId: 'pm', label: 'PM', url: 'https://chatgpt.com/c/pm' },
    { scope: 'SPECIALIST', chatId: 'a', label: 'A', url: 'https://chatgpt.com/c/a' },
    { scope: 'SPECIALIST', chatId: 'b', label: 'B', url: 'https://chatgpt.com/c/b' },
    { scope: 'SPECIALIST', chatId: 'c', label: 'C', url: 'https://chatgpt.com/c/c' },
  ]);
  const targets = chats.map((chat) => ({ id: chat.chatId, type: 'page', url: chat.url }));
  const state = defaultState();
  state.tabs = {
    pm: { targetId: 'pm', lastUsedAt: '2026-01-01T00:00:00Z' },
    a: { targetId: 'a', lastUsedAt: '2026-01-02T00:00:00Z' },
    b: { targetId: 'b', lastUsedAt: '2026-01-03T00:00:00Z' },
    c: { targetId: 'c', lastUsedAt: '2026-01-04T00:00:00Z' },
  };
  assert.deepEqual(selectManagedTabClosures({ targets, chats, state, activeTargetId: 'b', pressure: 'NORMAL', maxHotTabs: 3 }), ['a']);
  assert.deepEqual(selectManagedTabClosures({ targets, chats, state, activeTargetId: 'b', pressure: 'HARD', maxHotTabs: 3 }).sort(), ['a', 'c', 'pm'].sort());
});

test('route retry policy blocks ambiguous replay and honors explicit retry', () => {
  const now = Date.now();
  assert.equal(shouldAttemptRoute(null, now, 1000), true);
  assert.equal(shouldAttemptRoute({ status: 'AMBIGUOUS_AFTER_RESTART' }, now, 1000), false);
  assert.equal(shouldAttemptRoute({ status: 'RETRY_AUTHORIZED' }, now, 1000), true);
  assert.equal(shouldAttemptRoute({ status: 'FAILED_RETRYABLE', lastAttemptAt: new Date(now - 2000).toISOString() }, now, 1000), true);
  assert.equal(shouldAttemptRoute({ status: 'FAILED_RETRYABLE', lastAttemptAt: new Date(now - 100).toISOString() }, now, 1000), false);
});

function routeBody({ requestId, destinationChatId }) {
  return INTERNAL_ROUTE_PREFIX + JSON.stringify({
    schemaVersion: 1,
    packetKind: 'FACTUAL_STATE_ONLY',
    requestId,
    actionBlockedOrRouted: 'AUTHOR_PROPOSAL',
    worker: 'worker-a',
    producerId: 'worker:worker-a',
    destination: 'SPECIALIST_SUPERVISOR_CHAT',
    destinationChatId,
    standingOwnerAuthorization: true,
    ownerRelayRequired: false,
    actionTimeConfirmationRequired: false,
    providerDeliveryState: 'QUEUED_FOR_PROVIDER_RELAY',
    primaryDecision: 'REJECT_WORKER_REASONING',
    routeDecision: 'ALLOW_INTERNAL_SUPERVISOR_ROUTE',
    factualPacket: {
      packetId: `packet-${requestId}`,
      taskId: 'task-a',
      exactFactualState: 'Exact factual state.',
      evidenceRefs: ['evidence-1'],
      decisionRequested: 'Issue one bounded decision.',
    },
    queuedAt: '2026-09-02T00:00:00.000Z',
  });
}
