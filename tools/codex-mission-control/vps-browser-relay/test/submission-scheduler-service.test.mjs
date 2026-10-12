import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseChatDirectory, parseChatProvisionDirectory, sha256 } from '../src/core.mjs';
import {
  CentralSubmissionScheduler,
  defaultSchedulerState,
  normalizeSchedulerState,
  parseDeploymentLease,
} from '../src/submission-scheduler-service.mjs';

const origin = Date.parse('2026-09-10T12:00:00.000Z');

test('main authority reloads a persisted ledger containing every repair-written queue status', async () => {
  const expectedStatuses = [
    'QUEUED', 'ADMITTED', 'PRECLICK_RETRY_PENDING', 'RATE_LIMIT_RETRY_PENDING',
    'BOUNDARY_RECORDED', 'AMBIGUOUS_AFTER_RESTART', 'AMBIGUOUS_INTERVAL_VIOLATION',
    'AMBIGUOUS_EXPIRED_AT_BOUNDARY', 'AMBIGUOUS_LEASE_VIOLATION',
    'RATE_LIMIT_RETRY_EXHAUSTED', 'CANCELLED_AT_TAKEOVER',
    'CANCELLED_EXPIRED_ROUTE', 'CANCELLED_SUPERSEDED_ROUTE', 'CLOSED_AMBIGUOUS_NO_REPLAY',
  ];
  const written = new Map();
  const scenarios = [
    async ({ scheduler, admission }) => {
      await scheduler.recordBoundary({ admissionId: admission.admissionId,
        boundaryAt: new Date(origin).toISOString(), boundaryKind: 'CLICKED' }, 'collector:relay');
    },
    async ({ scheduler, admission, now, input }) => {
      await scheduler.abortBeforeBoundary({ admissionId: admission.admissionId,
        relayStage: 'COMPOSER_FILLED', failureKind: 'PROVIDER_RATE_LIMIT' }, 'collector:relay');
      now.value += 30_000;
      const retry = await scheduler.admit(input, 'collector:relay');
      await scheduler.abortBeforeBoundary({ admissionId: retry.admissionId,
        relayStage: 'COMPOSER_FILLED', failureKind: 'PROVIDER_RATE_LIMIT' }, 'collector:relay');
    },
    async ({ scheduler, admission, input }) => {
      await scheduler.abortBeforeBoundary({ admissionId: admission.admissionId,
        relayStage: 'COMPOSER_FILLED' }, 'collector:relay');
      await scheduler.cancelExpiredPreclickRetry({ queueItemId: admission.queueItemId,
        requestId: input.requestId, sourceRouteExpiresAt: new Date(origin - 1).toISOString() }, 'collector:relay');
    },
    async ({ scheduler, admission, input }) => {
      await scheduler.abortBeforeBoundary({ admissionId: admission.admissionId,
        relayStage: 'COMPOSER_FILLED' }, 'collector:relay');
      await scheduler.cancelSupersededPreclickRetry({ queueItemId: admission.queueItemId,
        requestId: input.requestId, replacementRequestId: 'replacement:ledger',
        failureReceiptSha256: 'e'.repeat(64) }, 'collector:relay');
    },
    async ({ scheduler, admission, now }) => {
      await scheduler.abortBeforeBoundary({ admissionId: admission.admissionId,
        relayStage: 'COMPOSER_FILLED' }, 'collector:relay');
      now.value = Date.parse(primaryLease().expiresAt) + 60_000;
      await scheduler.activateLease(secondaryTakeoverLease());
    },
    async ({ scheduler, now, input }) => {
      now.value += 120_001;
      await assert.rejects(scheduler.admit(input, 'collector:relay'), hasCode('SUBMISSION_RESTART_AMBIGUITY'));
    },
    async ({ scheduler, admission, now, input }) => {
      now.value = Date.parse(admission.expiresAt) + 1_000;
      await closeAfterRequest(scheduler, ambiguityClosure(admission, input, now), now);
    },
    ...[
      [-1, 'SUBMISSION_BOUNDARY_PRECEDES_ADMISSION'],
      [120_001, 'SUBMISSION_ADMISSION_EXPIRED_AT_BOUNDARY'],
    ].map(([offset, code]) => async ({ scheduler, admission, now }) => {
      now.value = Math.max(origin, origin + offset);
      await assert.rejects(scheduler.recordBoundary({ admissionId: admission.admissionId,
        boundaryAt: new Date(origin + offset).toISOString(), boundaryKind: 'CLICKED' }, 'collector:relay'), hasCode(code));
    }),
    async ({ scheduler, admission, store }) => {
      // Simulate a persisted lease losing authority while the admission is open.
      store.state.activeLease = { ...primaryLease(), expiresAt: new Date(origin).toISOString() };
      store.state.leaseHistory = [store.state.activeLease];
      await assert.rejects(scheduler.recordBoundary({ admissionId: admission.admissionId,
        boundaryAt: new Date(origin).toISOString(), boundaryKind: 'CLICKED' }, 'collector:relay'),
      hasCode('SUBMISSION_LEASE_INVALID_AT_BOUNDARY'));
    },
  ];

  for (const [index, scenario] of scenarios.entries()) {
    const now = { value: origin };
    const store = new MemoryStore();
    const originalWrite = store.write.bind(store);
    store.write = async (value) => {
      // Validate actual writer output rather than constructing status-only rows.
      const normalized = normalizeSchedulerState(JSON.parse(JSON.stringify(value)));
      for (const item of normalized.queueItems) {
        written.set(item.status, { item: structuredClone(item), admissions: normalized.admissions
          .filter((entry) => entry.queueItemId === item.queueItemId).map((entry) => structuredClone(entry)) });
      }
      return originalWrite(value);
    };
    const scheduler = makeScheduler(store, now);
    await scheduler.activateLease(primaryLease());
    const input = request({ requestId: `ledger:${index}`, queueKey: `queue:ledger:${index}` });
    const admission = await scheduler.admit(input, 'collector:relay');
    await scenario({ scheduler, admission, store, now, input });
  }
  assert.deepEqual([...written.keys()].sort(), [...expectedStatuses].sort());

  // Combine independent transition snapshots into one synthetic recovery ledger.
  // Keep immutable requests and their admission correspondence; disambiguate IDs.
  const ledger = defaultSchedulerState(new Date(origin).toISOString());
  for (const [status, { item, admissions }] of written) {
    item.queueItemId += `:${status}`;
    item.sequence = ledger.nextQueueSequence++;
    item.admissionIds = admissions.map((entry) => `${entry.admissionId}:${status}`);
    for (const entry of admissions) {
      entry.queueItemId = item.queueItemId;
      entry.admissionId += `:${status}`;
      entry.sequence = ledger.nextSequence++;
      if (entry.boundaryAt && (!ledger.lastBoundaryAt || entry.boundaryAt > ledger.lastBoundaryAt)) {
        ledger.lastBoundaryAt = entry.boundaryAt;
      }
      ledger.admissions.push(entry);
    }
    ledger.queueItems.push(item);
  }
  const root = await mkdtemp(join(tmpdir(), 'mc-repair-ledger-'));
  try {
    const filename = join(root, 'submission-ledger.json');
    await writeFile(filename, JSON.stringify(ledger));
    const loaded = normalizeSchedulerState(JSON.parse(await readFile(filename, 'utf8')));
    assert.deepEqual(loaded, ledger);
    const store = { read: async () => normalizeSchedulerState(JSON.parse(await readFile(filename, 'utf8'))),
      write: async () => assert.fail('Ledger inspection must not rewrite recovery state.') };
    const status = await makeScheduler(store, { value: origin }).status();
    assert.equal(status.queueDepth, 4);
    const superseded = loaded.queueItems.find((item) => item.status === 'CANCELLED_SUPERSEDED_ROUTE');
    assert.equal(superseded.supersededByRequestId, 'replacement:ledger');
    assert.equal(superseded.supersessionFailureReceiptSha256, 'e'.repeat(64));
    const corrupt = structuredClone(loaded);
    corrupt.queueItems[0].status = 'UNKNOWN_REPAIR_STATUS';
    assert.throws(() => normalizeSchedulerState(corrupt), /status is invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('central scheduler persists a single-use admission before the actual boundary and enforces 60 seconds globally', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());

  const admission = await scheduler.admit(request(), 'collector:relay');
  assert.equal(admission.admitted, true);
  assert.equal(admission.singleUse, true);
  assert.equal(store.state.admissions[0].status, 'ADMITTED');
  assert.equal(store.state.lastBoundaryAt, null);
  await assert.rejects(scheduler.admit(request(), 'collector:relay'), hasCode('SUBMISSION_QUEUE_BUSY'));

  now.value += 1_000;
  const boundaryAt = new Date(now.value).toISOString();
  const recorded = await scheduler.recordBoundary({
    admissionId: admission.admissionId,
    boundaryAt,
    boundaryKind: 'GENERATION_STARTED',
    conversationUrlSha256: sha256('https://chatgpt.com/c/new-session'),
  }, 'collector:relay');
  assert.equal(recorded.recorded, true);
  assert.equal(store.state.admissions[0].status, 'BOUNDARY_RECORDED');
  assert.equal(store.state.lastBoundaryAt, boundaryAt);
  await assert.rejects(
    scheduler.recordBoundary({ admissionId: admission.admissionId, boundaryAt: new Date(now.value + 1).toISOString(), boundaryKind: 'CLICKED' }, 'collector:relay'),
    hasCode('SUBMISSION_ADMISSION_ALREADY_USED'),
  );
  await assert.rejects(scheduler.admit(request({ requestId: 'r-too-fast', queueKey: 'queue:r-too-fast' }), 'collector:relay'), (error) => error.code === 'GLOBAL_SUBMISSION_COOLDOWN' && error.detail.retryAfterMs === 60_000);
  now.value += 60_000;
  assert.equal((await scheduler.admit(request({ requestId: 'r-too-fast', queueKey: 'queue:r-too-fast' }), 'collector:relay')).admitted, true);
});

test('shared scheduler status retains journal allowance usage across relay takeover', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const admission = await scheduler.admit(request({ sendPath: 'JOURNAL_WORK' }), 'collector:relay');
  await scheduler.recordBoundary({ admissionId: admission.admissionId, boundaryAt: new Date(now.value).toISOString(), boundaryKind: 'CLICKED', conversationUrlSha256: null }, 'collector:relay');
  now.value = Date.parse('2026-09-10T13:01:00.000Z');
  const successor = makeScheduler(store, now);
  await successor.activateLease(secondaryTakeoverLease({ transferredLastBoundaryAt: new Date(origin).toISOString() }));
  assert.equal((await successor.status()).journalCallsToday, 1);
  now.value += 86_400_000;
  assert.equal((await successor.status()).journalCallsToday, 0);
});

test('FIFO queue is durable before grant, exposes its head/depth, and protects queue-key identity', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const first = await scheduler.admit(request({ queueKey: 'queue:first' }), 'collector:relay');
  await assert.rejects(
    scheduler.admit(request({ requestId: 'r-2', queueKey: 'queue:second', bodySha256: 'b'.repeat(64) }), 'collector:relay'),
    hasCode('SUBMISSION_QUEUED'),
  );
  assert.equal(store.state.queueItems.length, 2);
  assert.equal(store.state.queueItems[0].status, 'ADMITTED');
  assert.equal(store.state.queueItems[1].status, 'QUEUED');
  const status = await scheduler.status();
  assert.equal(status.queueDepth, 2);
  assert.equal(status.queueHead.queueKey, 'queue:first');
  await assert.rejects(scheduler.admit(request({ queueKey: 'queue:second' }), 'collector:relay'), hasCode('SUBMISSION_QUEUE_KEY_CONFLICT'));

  await scheduler.abortBeforeBoundary({ admissionId: first.admissionId, relayStage: 'COMPOSER_FILLED' }, 'collector:relay');
  assert.equal(store.state.queueItems[0].status, 'PRECLICK_RETRY_PENDING');
  const retry = await scheduler.admit(request({ queueKey: 'queue:first' }), 'collector:relay');
  assert.equal(retry.queueItemId, first.queueItemId);
  assert.equal(store.state.queueItems[0].admissionIds.length, 2);
});

test('expired source route cancels only the same-producer proven pre-click retry', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const first = await scheduler.admit(request({ requestId: 'expired-route', queueKey: 'queue:expired-route' }), 'collector:relay');
  await scheduler.abortBeforeBoundary({ admissionId: first.admissionId, relayStage: 'COMPOSER_FILLED' }, 'collector:relay');
  const expiredAt = new Date(now.value - 1).toISOString();
  await assert.rejects(
    scheduler.cancelExpiredPreclickRetry({ queueItemId: first.queueItemId, requestId: 'wrong', sourceRouteExpiresAt: expiredAt }, 'collector:relay'),
    hasCode('SUBMISSION_QUEUE_REQUEST_MISMATCH'),
  );
  await assert.rejects(
    scheduler.cancelExpiredPreclickRetry({ queueItemId: first.queueItemId, requestId: 'expired-route', sourceRouteExpiresAt: new Date(now.value + 1).toISOString() }, 'collector:relay'),
    hasCode('SOURCE_ROUTE_NOT_EXPIRED'),
  );
  await assert.rejects(
    scheduler.cancelExpiredPreclickRetry({ queueItemId: first.queueItemId, requestId: 'expired-route', sourceRouteExpiresAt: expiredAt }, 'collector:standby'),
    hasCode('SUBMISSION_ADMISSION_PRODUCER_MISMATCH'),
  );
  const cancelled = await scheduler.cancelExpiredPreclickRetry({
    queueItemId: first.queueItemId, requestId: 'expired-route', sourceRouteExpiresAt: expiredAt,
  }, 'collector:relay');
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.duplicate, false);
  assert.equal(store.state.queueItems[0].status, 'CANCELLED_EXPIRED_ROUTE');
  assert.equal((await scheduler.status()).queueDepth, 0);
  const duplicate = await scheduler.cancelExpiredPreclickRetry({
    queueItemId: first.queueItemId, requestId: 'expired-route', sourceRouteExpiresAt: expiredAt,
  }, 'collector:relay');
  assert.equal(duplicate.duplicate, true);
  assert.equal((await scheduler.admit(request({ requestId: 'fresh-route', queueKey: 'queue:fresh-route', bodySha256: 'f'.repeat(64) }), 'collector:relay')).admitted, true);
});

test('expired-route cancellation cannot erase crossed submission history', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const admitted = await scheduler.admit(request({ requestId: 'crossed-route', queueKey: 'queue:crossed-route' }), 'collector:relay');
  await scheduler.recordBoundary({
    admissionId: admitted.admissionId, boundaryAt: new Date(now.value).toISOString(), boundaryKind: 'CLICKED',
    conversationUrlSha256: sha256('https://chatgpt.com/c/crossed'),
  }, 'collector:relay');
  await assert.rejects(
    scheduler.cancelExpiredPreclickRetry({ queueItemId: admitted.queueItemId, requestId: 'crossed-route', sourceRouteExpiresAt: new Date(now.value - 1).toISOString() }, 'collector:relay'),
    hasCode('SUBMISSION_QUEUE_CANCEL_STAGE_INVALID'),
  );
});

test('exact replacement cancels only the same-producer proven pre-click retry', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const first = await scheduler.admit(request({ requestId: 'superseded-route', queueKey: 'queue:superseded-route' }), 'collector:relay');
  await scheduler.abortBeforeBoundary({ admissionId: first.admissionId, relayStage: 'COMPOSER_FILLED' }, 'collector:relay');
  const binding = {
    queueItemId: first.queueItemId,
    requestId: 'superseded-route',
    replacementRequestId: 'replacement-route',
    failureReceiptSha256: 'e'.repeat(64),
  };
  await assert.rejects(
    scheduler.cancelSupersededPreclickRetry({ ...binding, requestId: 'wrong' }, 'collector:relay'),
    hasCode('SUBMISSION_QUEUE_REQUEST_MISMATCH'),
  );
  await assert.rejects(
    scheduler.cancelSupersededPreclickRetry(binding, 'collector:standby'),
    hasCode('SUBMISSION_ADMISSION_PRODUCER_MISMATCH'),
  );
  const cancelled = await scheduler.cancelSupersededPreclickRetry(binding, 'collector:relay');
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.duplicate, false);
  assert.equal(store.state.queueItems[0].status, 'CANCELLED_SUPERSEDED_ROUTE');
  assert.equal(store.state.queueItems[0].supersededByRequestId, 'replacement-route');
  assert.equal(store.state.queueItems[0].supersessionFailureReceiptSha256, 'e'.repeat(64));
  assert.equal((await scheduler.status()).queueDepth, 0);
  assert.equal((await scheduler.cancelSupersededPreclickRetry(binding, 'collector:relay')).duplicate, true);
  await assert.rejects(
    scheduler.cancelSupersededPreclickRetry({ ...binding, replacementRequestId: 'other-replacement' }, 'collector:relay'),
    hasCode('SUBMISSION_QUEUE_REPLACEMENT_MISMATCH'),
  );
});

test('concurrent host requests share one serialization point and only one receives an admission', async () => {
  const now = { value: origin };
  const scheduler = makeScheduler(new MemoryStore(), now);
  await scheduler.activateLease(primaryLease());
  const results = await Promise.allSettled([
    scheduler.admit(request({ requestId: 'race-a', queueKey: 'queue:race-a' }), 'collector:relay'),
    scheduler.admit(request({ requestId: 'race-b', queueKey: 'queue:race-b', bodySha256: 'b'.repeat(64), hostAlias: 'standby', hostRole: 'SECONDARY', automationWindowId: 202, targetId: 'standby-owned-target' }), 'collector:standby'),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason.code === 'STANDBY_SEND_FORBIDDEN').length, 1);
});

test('two-phase target-set transition is separately attested, durable, admission-fencing, and exact-delta bound', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const begin = targetTransition('BEGIN', {
    operation: 'ADD', transitionId: 'transition:add:1', priorOwnedTargetIds: ['owned-target-test'],
    anchorTargetId: 'owned-target-test', targetId: null,
  });
  await assert.rejects(
    scheduler.beginRelayTargetTransition({ ...begin, proof: '0'.repeat(64) }, 'collector:relay'),
    hasCode('RELAY_TARGET_ATTESTATION_INVALID'),
  );
  assert.equal((await scheduler.beginRelayTargetTransition(signTransition(begin), 'collector:relay')).begun, true);
  assert.equal((await scheduler.status()).ready, false);
  await assert.rejects(scheduler.admit(request(), 'collector:relay'), hasCode('RELAY_TARGET_TRANSITION_OPEN'));
  const persisted = structuredClone(store.state);
  assert.equal(persisted.relayTargetTransition.transitionId, 'transition:add:1');

  const restarted = makeScheduler(store, now);
  await restarted.activateLease(primaryLease());
  assert.equal((await restarted.status()).relayTargetTransition.state, 'OPEN');
  const commit = targetTransition('COMMIT', {
    ...begin,
    postOwnedTargetIds: ['owned-target-test', 'pm-target-test'],
    transitionedTargetId: 'pm-target-test',
  });
  const committed = await restarted.commitRelayTargetTransition(signTransition(commit), 'collector:relay');
  assert.equal(committed.binding.bindingRevision, 2);
  assert.equal(committed.binding.ownedTargetCount, 2);
  assert.equal(Object.hasOwn(committed.binding, 'ownedTargetIds'), false);
  assert.equal((await restarted.status()).ready, true);
  assert.deepEqual((await restarted.producerBinding('collector:relay')).ownedTargetIds, ['owned-target-test', 'pm-target-test']);
  assert.equal((await restarted.commitRelayTargetTransition(signTransition(commit), 'collector:relay')).duplicate, true);
});

test('target-set removal requires an exact signed delta, rejects in-use targets, and fences removed IDs', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const addBegin = targetTransition('BEGIN', {
    operation: 'ADD', transitionId: 'transition:add:2', priorOwnedTargetIds: ['owned-target-test'],
    anchorTargetId: 'owned-target-test', targetId: null,
  });
  await scheduler.beginRelayTargetTransition(signTransition(addBegin), 'collector:relay');
  await scheduler.commitRelayTargetTransition(signTransition(targetTransition('COMMIT', {
    ...addBegin, postOwnedTargetIds: ['owned-target-test', 'pm-target-test'], transitionedTargetId: 'pm-target-test',
  })), 'collector:relay');

  const granted = await scheduler.admit(request({ targetId: 'pm-target-test' }), 'collector:relay');
  await scheduler.abortBeforeBoundary({ admissionId: granted.admissionId, relayStage: 'COMPOSER_FILLED' }, 'collector:relay');
  const removeBegin = targetTransition('BEGIN', {
    operation: 'REMOVE', transitionId: 'transition:remove:1', priorBindingRevision: 2,
    priorOwnedTargetIds: ['owned-target-test', 'pm-target-test'], anchorTargetId: null, targetId: 'pm-target-test',
  });
  await assert.rejects(scheduler.beginRelayTargetTransition(signTransition(removeBegin), 'collector:relay'), hasCode('RELAY_TARGET_TRANSITION_TARGET_IN_USE'));

  store.state.queueItems[0].status = 'CANCELLED_AT_TAKEOVER';
  store.state.queueItems[0].terminalAt = new Date(now.value).toISOString();
  await scheduler.beginRelayTargetTransition(signTransition(removeBegin), 'collector:relay');
  await assert.rejects(scheduler.commitRelayTargetTransition(signTransition(targetTransition('COMMIT', {
    ...removeBegin, postOwnedTargetIds: ['pm-target-test'], transitionedTargetId: 'owned-target-test',
  })), 'collector:relay'), hasCode('RELAY_TARGET_TRANSITION_DELTA_INVALID'));
  await scheduler.commitRelayTargetTransition(signTransition(targetTransition('COMMIT', {
    ...removeBegin, postOwnedTargetIds: ['owned-target-test'], transitionedTargetId: 'pm-target-test',
  })), 'collector:relay');
  await assert.rejects(
    scheduler.admit(request({ requestId: 'removed', queueKey: 'queue:removed', targetId: 'pm-target-test' }), 'collector:relay'),
    hasCode('SUBMISSION_TARGET_OWNERSHIP_UNATTESTED'),
  );
});

test('target transition rejects cross-producer and stale revisions, serializes begin, and blocks takeover', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const first = targetTransition('BEGIN', {
    operation: 'ADD', transitionId: 'transition:serialized:first', priorOwnedTargetIds: ['owned-target-test'],
    anchorTargetId: 'owned-target-test', targetId: null,
  });
  await assert.rejects(scheduler.beginRelayTargetTransition(signTransition(first), 'collector:standby'), hasCode('RELAY_TARGET_TRANSITION_SCOPE_MISMATCH'));
  const stale = targetTransition('BEGIN', { ...first, transitionId: 'transition:stale', priorBindingRevision: 2 });
  await assert.rejects(scheduler.beginRelayTargetTransition(signTransition(stale), 'collector:relay'), hasCode('RELAY_TARGET_TRANSITION_REVISION_MISMATCH'));
  const second = targetTransition('BEGIN', { ...first, transitionId: 'transition:serialized:second' });
  const results = await Promise.allSettled([
    scheduler.beginRelayTargetTransition(signTransition(first), 'collector:relay'),
    scheduler.beginRelayTargetTransition(signTransition(second), 'collector:relay'),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason.code === 'RELAY_TARGET_TRANSITION_BUSY').length, 1);
  now.value = Date.parse('2026-09-10T13:01:00.000Z');
  await assert.rejects(scheduler.activateLease(secondaryTakeoverLease()), hasCode('TAKEOVER_TARGET_TRANSITION_OPEN'));
});

test('window replacement is quiescent, crash-durable, exact-window bound, replay-safe, and restart-safe', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const queued = await scheduler.admit(request(), 'collector:relay');
  await scheduler.abortBeforeBoundary({ admissionId: queued.admissionId, relayStage: 'COMPOSER_FILLED' }, 'collector:relay');
  const begin = targetTransition('BEGIN', {
    operation: 'WINDOW_REPLACE', transitionId: 'transition:window:1',
    priorOwnedTargetIds: ['owned-target-test'], anchorTargetId: null, targetId: null,
  });
  await assert.rejects(scheduler.beginRelayTargetTransition(signTransition(begin), 'collector:relay'), hasCode('RELAY_TARGET_TRANSITION_QUEUE_NOT_QUIESCENT'));
  store.state.queueItems[0].status = 'CANCELLED_AT_TAKEOVER';
  store.state.queueItems[0].terminalAt = new Date(now.value).toISOString();
  await scheduler.beginRelayTargetTransition(signTransition(begin), 'collector:relay');
  now.value = Date.parse('2026-09-10T13:01:00.000Z');
  await assert.rejects(scheduler.activateLease(secondaryTakeoverLease()), hasCode('TAKEOVER_TARGET_TRANSITION_OPEN'));
  now.value = origin;

  const restarted = makeScheduler(store, now);
  await restarted.activateLease(primaryLease());
  const commit = targetTransition('COMMIT', {
    ...begin, postAutomationWindowId: 303, postOwnedTargetIds: ['replacement-target'],
    transitionedTargetId: 'replacement-target',
  });
  const result = await restarted.commitRelayTargetTransition(signTransition(commit), 'collector:relay');
  assert.equal(result.binding.automationWindowId, 303);
  assert.equal(result.binding.bindingRevision, 2);
  assert.equal(result.binding.ownedTargetCount, 1);
  assert.equal((await restarted.commitRelayTargetTransition(signTransition(commit), 'collector:relay')).duplicate, true);

  const afterCommitRestart = makeScheduler(store, now);
  await afterCommitRestart.activateLease(primaryLease());
  assert.equal((await afterCommitRestart.producerBinding('collector:relay')).automationWindowId, 303);
});

test('unexpected target disappearance removes exactly one target and aborts if the exact prior set reappears', async () => {
  const now = { value: origin };
  const bindings = {
    'collector:relay': { hostAlias: 'primary', hostRole: 'PRIMARY', automationWindowId: 101, ownedTargetIds: ['anchor', 'vanished'] },
    'collector:standby': { hostAlias: 'standby', hostRole: 'SECONDARY', automationWindowId: 202, ownedTargetIds: ['standby-owned-target'] },
  };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now, { producerBindings: bindings });
  await scheduler.activateLease(primaryLease());
  const begin = targetTransition('BEGIN', {
    operation: 'RECONCILE_REMOVE', transitionId: 'transition:reconcile:1',
    priorOwnedTargetIds: ['anchor', 'vanished'], targetId: 'vanished', anchorTargetId: null,
  });
  await scheduler.beginRelayTargetTransition(signTransition(begin), 'collector:relay');
  await scheduler.abortRelayTargetTransition(signTransition(targetTransition('ABORT', {
    ...begin, observedOwnedTargetIds: ['anchor', 'vanished'], observedAutomationWindowId: 101,
  })), 'collector:relay');
  assert.equal((await scheduler.status()).relayTargetTransition.state, 'CLEAR');

  const second = targetTransition('BEGIN', { ...begin, transitionId: 'transition:reconcile:2' });
  await scheduler.beginRelayTargetTransition(signTransition(second), 'collector:relay');
  await assert.rejects(scheduler.commitRelayTargetTransition(signTransition(targetTransition('COMMIT', {
    ...second, postOwnedTargetIds: ['vanished'], transitionedTargetId: 'anchor',
  })), 'collector:relay'), hasCode('RELAY_TARGET_TRANSITION_DELTA_INVALID'));
  const committed = await scheduler.commitRelayTargetTransition(signTransition(targetTransition('COMMIT', {
    ...second, postOwnedTargetIds: ['anchor'], transitionedTargetId: 'vanished',
  })), 'collector:relay');
  assert.equal(committed.binding.ownedTargetCount, 1);
  assert.deepEqual((await scheduler.producerBinding('collector:relay')).ownedTargetIds, ['anchor']);
});

test('passive relay may replace only its own attested window while send authority remains primary', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const standby = {
    producerId: 'collector:standby', hostAlias: 'standby', hostRole: 'SECONDARY',
    automationWindowId: 202, deploymentEpoch: 1, leaseId: 'lease-primary-1',
  };
  const add = targetTransition('BEGIN', {
    ...standby, operation: 'ADD', transitionId: 'transition:standby:add',
    priorOwnedTargetIds: ['standby-owned-target'], anchorTargetId: 'standby-owned-target',
  });
  await assert.rejects(
    scheduler.beginRelayTargetTransition(signTransition(add, 'standby-attestor-test-' + 'b'.repeat(32)), 'collector:standby'),
    hasCode('STANDBY_TARGET_MUTATION_FORBIDDEN'),
  );
  const begin = targetTransition('BEGIN', {
    ...standby, operation: 'WINDOW_REPLACE', transitionId: 'transition:standby:window',
    priorOwnedTargetIds: ['standby-owned-target'], anchorTargetId: null, targetId: null,
  });
  const standbySecret = 'standby-attestor-test-' + 'b'.repeat(32);
  await scheduler.beginRelayTargetTransition(signTransition(begin, standbySecret), 'collector:standby');
  const committed = await scheduler.commitRelayTargetTransition(signTransition(targetTransition('COMMIT', {
    ...begin, postAutomationWindowId: 404, postOwnedTargetIds: ['standby-replacement'], transitionedTargetId: 'standby-replacement',
  }), standbySecret), 'collector:standby');
  assert.equal(committed.binding.automationWindowId, 404);
  assert.equal((await scheduler.status()).activeLease.activeHostRole, 'PRIMARY');
  await assert.rejects(scheduler.admit(request({
    producerId: 'collector:standby', hostAlias: 'standby', hostRole: 'SECONDARY', deploymentEpoch: 1,
    leaseId: 'lease-primary-1', automationWindowId: 404, targetId: 'standby-replacement',
  }), 'collector:standby'), hasCode('STANDBY_SEND_FORBIDDEN'));
});

test('same-lease renewal may only extend expiry without changing authority', async () => {
  const now = { value: origin };
  const scheduler = makeScheduler(new MemoryStore(), now);
  const lease = primaryLease();
  await scheduler.activateLease(lease);
  const renewed = { ...lease, expiresAt: '2026-09-10T14:00:00.000Z' };
  await scheduler.activateLease(renewed);
  assert.equal((await scheduler.status()).activeLease.expiresAt, renewed.expiresAt);
  await assert.rejects(scheduler.activateLease({ ...renewed, issuedAt: '2026-09-10T11:59:01.000Z' }), hasCode('LEASE_RENEWAL_INVALID'));
  await assert.rejects(scheduler.activateLease({ ...renewed, expiresAt: lease.expiresAt }), hasCode('LEASE_RENEWAL_INVALID'));
});

test('regressing or pre-admission boundary timestamps create a durable safety halt', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  store.state.lastBoundaryAt = '2026-09-10T11:59:30.000Z';
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  now.value += 30_000;
  const admission = await scheduler.admit(request(), 'collector:relay');
  await assert.rejects(scheduler.recordBoundary({
    admissionId: admission.admissionId,
    boundaryAt: '2026-09-10T12:00:00.000Z',
    boundaryKind: 'CLICKED',
    conversationUrlSha256: null,
  }, 'collector:relay'), hasCode('SUBMISSION_BOUNDARY_PRECEDES_ADMISSION'));
  assert.equal(store.state.admissions[0].status, 'AMBIGUOUS_INTERVAL_VIOLATION');
  assert.equal(store.state.safetyHalt.code, 'SUBMISSION_BOUNDARY_PRECEDES_ADMISSION');
  await assert.rejects(scheduler.admit(request({ requestId: 'r-after-halt', queueKey: 'queue:halt' }), 'collector:relay'), hasCode('SUBMISSION_SAFETY_HALT'));
});

test('corrupt or downgraded persisted state fails closed instead of resetting the pacing boundary', () => {
  assert.throws(() => normalizeSchedulerState({ schemaVersion: 2 }), /refusing to reset pacing state/);
  assert.throws(() => normalizeSchedulerState({ ...defaultSchedulerState(), lastBoundaryAt: 'not-a-time' }), /lastBoundaryAt is invalid/);
  assert.throws(() => normalizeSchedulerState({ ...defaultSchedulerState(), admissions: {} }), /durable histories must be arrays/);
});

test('crossed and terminal durable records cannot erase or contradict the pacing boundary', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const granted = await scheduler.admit(request(), 'collector:relay');
  now.value += 1_000;
  const boundaryAt = new Date(now.value).toISOString();
  await scheduler.recordBoundary({ admissionId: granted.admissionId, boundaryAt, boundaryKind: 'CLICKED', conversationUrlSha256: null }, 'collector:relay');

  for (const mutate of [
    (state) => { state.lastBoundaryAt = null; },
    (state) => { state.queueItems[0].status = 'AMBIGUOUS_INTERVAL_VIOLATION'; },
    (state) => { state.admissions[0].status = 'ABORTED_BEFORE_BOUNDARY'; },
  ]) {
    const corrupt = structuredClone(store.state);
    mutate(corrupt);
    assert.throws(() => normalizeSchedulerState(corrupt), /pacing state|inconsistent|requires exact/);
  }
});

test('every persisted queue, admission, and binding row is schema and referentially validated', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  await scheduler.admit(request(), 'collector:relay');
  assert.equal(normalizeSchedulerState(store.state).admissions[0].status, 'ADMITTED');
  for (const mutation of [
    (state) => { state.admissions[0].status = 'UNKNOWN'; },
    (state) => { state.queueItems[0].requestFingerprint = '0'.repeat(64); },
    (state) => { state.queueItems[0].admissionIds = []; },
    (state) => { state.queueItems[0].status = 'BOUNDARY_RECORDED'; state.queueItems[0].terminalAt = new Date(origin).toISOString(); },
  ]) {
    const corrupt = structuredClone(store.state);
    mutation(corrupt);
    assert.throws(() => normalizeSchedulerState(corrupt), /invalid|inconsistent|exact open admission/);
  }
});

test('the VPS package contains no host-local scheduler authority', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const installer = await readFile(new URL('../scripts/install-user-service.sh', import.meta.url), 'utf8');
  const relayUnit = await readFile(new URL('../systemd/user/mission-control-chatgpt-relay.service', import.meta.url), 'utf8');
  assert.equal(Object.hasOwn(manifest.scripts, 'scheduler'), false);
  assert.doesNotMatch(relayUnit, /mission-control-submission-scheduler/);
  assert.match(installer, /disable --now mission-control-submission-scheduler\.service/);
  assert.doesNotMatch(installer, /enable --now mission-control-submission-scheduler\.service/);
  assert.match(installer, /staging_root\/src\/submission-scheduler-service\.mjs/);
  assert.match(installer, /staging_root\/test\/submission-scheduler-service\.test\.mjs/);
});

test('every concrete ChatGPT send path is wired through central admission and boundary recording', async () => {
  const relay = await readFile(new URL('../src/relay.mjs', import.meta.url), 'utf8');
  const controller = await readFile(new URL('../src/controller-mediated-pm.mjs', import.meta.url), 'utf8');
  const launcher = await readFile(new URL('../bin/mc-chatgpt-relay.mjs', import.meta.url), 'utf8');
  const journal = await readFile(new URL('../src/journal-work-runner.mjs', import.meta.url), 'utf8');
  const recovery = await readFile(new URL('../src/stuck-recovery.mjs', import.meta.url), 'utf8');
  assert.equal(count(relay, 'this.submissionPacer.submit({'), 3);
  assert.equal(count(relay, 'this.browser.submitExactMessage('), 3);
  assert.equal(count(relay, 'onSubmissionBoundary'), 6);
  assert.equal(count(controller, 'this.submissionPacer.submit({'), 4);
  assert.equal(count(controller, 'this.browser.submitExactMessage('), 3);
  assert.equal(count(controller, 'this.browser.retryExactFailedContinue('), 1);
  assert.ok(count(controller, 'onSubmissionBoundary') >= 8);
  assert.equal(count(launcher, 'submissionPacer.submit({'), 2);
  assert.equal(count(launcher, 'rawBrowser.submitExactMessage('), 1);
  assert.match(launcher, /onSubmissionBoundary/);
  assert.match(launcher, /await onJournalSubmissionBoundary\?\.\(\.\.\.args\)/);
  assert.match(launcher, /onBeforeSubmissionBoundary: async \(\.\.\.args\) => \{\s*await input\.beforeRecoverySend\?\.\(\.\.\.args\);\s*return onBeforeSubmissionBoundary\(\.\.\.args\);/);
  assert.match(launcher, /journalRecoverySessions\.set\(target\.id, identity\)/);
  assert.match(launcher, /recoverySubmissionContext\(config, stateStore, target, input, journalRecoverySessions\)/);
  assert.equal(count(journal, 'this.submit({'), 3);
  assert.equal(count(journal, 'this.browser.submitExactMessage('), 2);
  assert.equal(count(journal, 'this.browser.retryExactFailedContinue('), 1);
  assert.doesNotMatch(recovery, /browser\.submitExactMessage\(/);
  for (const source of [relay, controller, launcher, journal, recovery]) assert.doesNotMatch(source, /clipboard|xclip|xsel/i);
});

test('browser service cannot inherit relay or scheduler credentials and send code has no clipboard path', async () => {
  const unit = await readFile(new URL('../systemd/user/mission-control-chatgpt-browser.service', import.meta.url), 'utf8');
  const browserEnv = await readFile(new URL('../.browser.env.example', import.meta.url), 'utf8');
  const relayEnv = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  const launcher = await readFile(new URL('../scripts/launch-browser.sh', import.meta.url), 'utf8');
  const installer = await readFile(new URL('../scripts/install-user-service.sh', import.meta.url), 'utf8');
  assert.match(unit, /EnvironmentFile=%h\/.config\/mission-control-chatgpt-relay\/browser-env/);
  assert.doesNotMatch(browserEnv, /TOKEN|PRODUCER_ID|MISSION_CONTROL_URL/);
  assert.doesNotMatch(relayEnv, /MC_RELAY_SCHEDULER_TOKEN=|MC_SCHEDULER_HOST=/);
  assert.match(relayEnv, /\/api\/submission-authority/);
  assert.match(launcher, /unset MC_RELAY_TOKEN MC_RELAY_TARGET_BINDING_ATTESTOR_KEY MC_RELAY_SUBMISSION_PACING_DOMAIN/);
  assert.match(launcher, /MC_RELAY_PRODUCER_ID MC_RELAY_MISSION_CONTROL_URL MC_RELAY_SUBMISSION_AUTHORITY_URL/);
  assert.match(launcher, /XDG_CONFIG_HOME="\$browser_config_dir"/);
  assert.match(launcher, /--disable-setuid-sandbox/);
  assert.doesNotMatch(launcher, /["']--no-sandbox["']/);
  assert.match(installer, /browser_profile_root/);
  assert.match(installer, /"\$HOME\/\.cache"/);
  assert.doesNotMatch(installer, /rm\s+-rf/);
  assert.doesNotMatch(installer, /MC_RELAY_INSTALL_ROOT/);
  assert.match(installer, /canonical_install_parent="\$\(realpath -e -- "\$install_parent"\)"/);
  assert.match(installer, /staging_root="\$\(mktemp -d "\$install_parent\/\.install-new\.XXXXXX"\)"/);
  assert.match(installer, /mv -T -- "\$install_root" "\$rollback_root"/);
  assert.match(installer, /mv -T -- "\$staging_root" "\$install_root"/);
  for (const source of [browserEnv, launcher]) assert.doesNotMatch(source, /clipboard|xclip|xsel/i);
});

test('system-manager compatibility mode keeps browser and relay unprivileged while preserving Chromium sandboxing', async () => {
  const browserUnit = await readFile(new URL('../systemd/system/mission-control-chatgpt-browser@.service', import.meta.url), 'utf8');
  const userBrowserUnit = await readFile(new URL('../systemd/user/mission-control-chatgpt-browser.service', import.meta.url), 'utf8');
  const relayUnit = await readFile(new URL('../systemd/system/mission-control-chatgpt-relay@.service', import.meta.url), 'utf8');
  const healthUnit = await readFile(new URL('../systemd/system/mission-control-chatgpt-health@.service', import.meta.url), 'utf8');
  const healthTimer = await readFile(new URL('../systemd/system/mission-control-chatgpt-health@.timer', import.meta.url), 'utf8');
  const fenceHelper = await readFile(new URL('../scripts/browser-fence.sh', import.meta.url), 'utf8');
  const browserLauncher = await readFile(new URL('../scripts/launch-browser.sh', import.meta.url), 'utf8');
  const installer = await readFile(new URL('../scripts/install-system-services.sh', import.meta.url), 'utf8');
  assert.match(browserUnit, /^User=%i$/m);
  assert.doesNotMatch(browserUnit, /^Group=/m);
  assert.match(browserUnit, /^NoNewPrivileges=false$/m);
  assert.match(browserUnit, /^ProtectSystem=strict$/m);
  assert.match(browserUnit, /^ProtectHome=read-only$/m);
  assert.match(browserUnit, /^ExecCondition=\/usr\/local\/libexec\/mission-control-chatgpt-browser-fence assert-unfenced %i$/m);
  assert.match(browserUnit, /^RestartPreventExitStatus=78$/m);
  assert.doesNotMatch(browserUnit, /--no-sandbox|--disable-setuid-sandbox/);
  assert.match(browserLauncher, /HOST_BROWSER_FENCED/);
  assert.match(browserLauncher, /MC_RELAY_BROWSER_FENCE_FILE/);
  assert.match(userBrowserUnit, /^Environment=MC_RELAY_BROWSER_FENCE_FILE=\/var\/lib\/mission-control-chatgpt\/browser-fences\/%u\.fenced$/m);
  assert.match(fenceHelper, /controlled_takeover_complete_and_browser_explicitly_released/);
  assert.match(fenceHelper, /mask "\$browser_unit"/);
  assert.match(fenceHelper, /unmask "\$browser_unit"/);
  assert.match(relayUnit, /^User=%i$/m);
  assert.doesNotMatch(relayUnit, /^Group=/m);
  assert.match(relayUnit, /^NoNewPrivileges=true$/m);
  assert.match(relayUnit, /Requires=mission-control-chatgpt-browser@%i\.service/);
  assert.match(installer, /target_uid.*-eq 0/);
  assert.match(installer, /target_home.*\*\[!a-zA-Z0-9_\.\/-\]\*/);
  assert.match(installer, /mission-control-chatgpt-browser@\$\{target_user\}\.service\.d/);
  assert.match(installer, /EnvironmentFile=\$target_home\/\.config\/mission-control-chatgpt-relay\/browser-env/);
  assert.match(installer, /MC_RELAY_BROWSER_FENCE_FILE=\$fence_file/);
  assert.match(installer, /mission-control-chatgpt-browser-fence/);
  assert.match(installer, /ExecStart=\$target_home\/\.local\/share\/mission-control-chatgpt-relay\/app\/scripts\/launch-browser\.sh/);
  assert.match(installer, /mission-control-chatgpt-relay@\$\{target_user\}\.service\.d/);
  assert.match(installer, /EnvironmentFile=\$target_home\/\.config\/mission-control-chatgpt-relay\/env/);
  assert.match(installer, /MC_RELAY_NODE_BIN/);
  assert.match(installer, /runuser -u "\$target_user" -- "\$node_bin"/);
  assert.match(installer, /node_major.*-lt 22/);
  assert.match(installer, /grep -E '\^MC_RELAY_BROWSER_PROFILE_DIR='/);
  assert.match(installer, /canonical_browser_profile.*realpath -e/);
  assert.match(installer, /browser_profile.*!= "\$target_home\/"\*/);
  assert.match(installer, /ReadWritePaths=\$browser_profile \$target_home\/\.cache/);
  assert.match(installer, /ExecStart=\$node_bin \$target_home\/\.local\/share\/mission-control-chatgpt-relay\/app\/bin\/mc-chatgpt-relay\.mjs run/);
  assert.match(installer, /mission-control-chatgpt-health@\.service/);
  assert.match(installer, /mission-control-chatgpt-health@\.timer/);
  assert.match(installer, /ExecStart=\$node_bin \$target_home\/\.local\/share\/mission-control-chatgpt-relay\/app\/bin\/mc-chatgpt-relay\.mjs health-report/);
  assert.match(healthUnit, /^Type=oneshot$/m);
  assert.match(healthUnit, /^User=%i$/m);
  assert.match(healthUnit, /^NoNewPrivileges=true$/m);
  assert.doesNotMatch(healthUnit, /(?:Requires|Wants)=mission-control-chatgpt-browser/);
  assert.doesNotMatch(healthUnit, /After=.*mission-control-chatgpt-browser/);
  assert.match(healthUnit, /health-report/);
  assert.match(healthTimer, /^OnUnitActiveSec=60s$/m);
  assert.match(healthTimer, /^Persistent=true$/m);
  assert.match(installer, /systemctl daemon-reload/);
  assert.doesNotMatch(installer, /rm\s+-rf|TOKEN|clipboard|xclip|xsel|EnvironmentFile=\/root|ExecStart=\/root/i);
});

test('standby, wrong alias, wrong epoch, wrong lease, stale lease, and missing lease all fail closed', async () => {
  const cases = [
    [request({ hostRole: 'SECONDARY', hostAlias: 'standby' }), 'SUBMISSION_RELAY_HOST_IMPERSONATION'],
    [request({ hostAlias: 'wrong-primary' }), 'SUBMISSION_RELAY_HOST_IMPERSONATION'],
    [request({ deploymentEpoch: 2 }), 'DEPLOYMENT_LEASE_MISMATCH'],
    [request({ leaseId: 'wrong-lease' }), 'DEPLOYMENT_LEASE_MISMATCH'],
  ];
  for (const [candidate, code] of cases) {
    const scheduler = makeScheduler(new MemoryStore(), { value: origin });
    await scheduler.activateLease(primaryLease());
    await assert.rejects(scheduler.admit(candidate, 'collector:relay'), hasCode(code));
  }

  const standby = makeScheduler(new MemoryStore(), { value: origin });
  await standby.activateLease(primaryLease());
  await assert.rejects(standby.admit(request({
    hostAlias: 'standby', hostRole: 'SECONDARY', targetId: 'standby-owned-target', automationWindowId: 202,
  }), 'collector:standby'), hasCode('STANDBY_SEND_FORBIDDEN'));
  await assert.rejects(standby.admit(request({ targetId: 'unowned-target' }), 'collector:relay'), hasCode('SUBMISSION_TARGET_OWNERSHIP_UNATTESTED'));

  const missing = makeScheduler(new MemoryStore(), { value: origin });
  await assert.rejects(missing.admit(request(), 'collector:relay'), hasCode('DEPLOYMENT_LEASE_MISSING'));

  const staleNow = { value: origin + 3_600_001 };
  const stale = makeScheduler(new MemoryStore(), staleNow);
  await assert.rejects(stale.activateLease(primaryLease()), hasCode('DEPLOYMENT_LEASE_STALE'));
  assert.throws(() => parseDeploymentLease({ ...primaryLease(), splitBrainStatus: 'UNCERTAIN' }), /SINGLE_ACTIVE_CONFIRMED/);
});

test('expired unconsumed admission becomes durable restart ambiguity and blocks replay', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const first = makeScheduler(store, now, { admissionTtlMs: 30_000 });
  await first.activateLease(primaryLease());
  await first.admit(request(), 'collector:relay');
  now.value += 30_001;
  const restarted = makeScheduler(store, now, { admissionTtlMs: 30_000 });
  await assert.rejects(restarted.admit(request({ requestId: 'r-replay' }), 'collector:relay'), hasCode('SUBMISSION_RESTART_AMBIGUITY'));
  assert.equal(store.state.admissions[0].status, 'AMBIGUOUS_AFTER_RESTART');
  const takeover = secondaryTakeoverLease({ transferredLastBoundaryAt: null, provenAt: '2026-09-10T12:00:20.000Z' });
  takeover.issuedAt = '2026-09-10T12:00:30.000Z';
  await assert.rejects(restarted.activateLease(takeover), hasCode('TAKEOVER_SEND_AMBIGUITY'));
});

test('pre-click validation expires safely while a raced expired boundary halts the scheduler', async () => {
  const now = { value: origin };
  const safeStore = new MemoryStore();
  const safe = makeScheduler(safeStore, now, { admissionTtlMs: 30_000 });
  await safe.activateLease(primaryLease());
  const safeAdmission = await safe.admit(request(), 'collector:relay');
  now.value += 30_000;
  await assert.rejects(safe.validateAdmission({ admissionId: safeAdmission.admissionId }, 'collector:relay'), hasCode('SUBMISSION_ADMISSION_EXPIRED'));
  assert.equal(safeStore.state.queueItems[0].status, 'PRECLICK_RETRY_PENDING');

  now.value = origin;
  const racedStore = new MemoryStore();
  const raced = makeScheduler(racedStore, now, { admissionTtlMs: 30_000 });
  await raced.activateLease(primaryLease());
  const racedAdmission = await raced.admit(request(), 'collector:relay');
  now.value += 30_001;
  await assert.rejects(raced.recordBoundary({
    admissionId: racedAdmission.admissionId,
    boundaryAt: new Date(now.value).toISOString(),
    boundaryKind: 'CLICKED',
    conversationUrlSha256: null,
  }, 'collector:relay'), hasCode('SUBMISSION_ADMISSION_EXPIRED_AT_BOUNDARY'));
  assert.equal(racedStore.state.safetyHalt.code, 'SUBMISSION_ADMISSION_EXPIRED_AT_BOUNDARY');
});

test('secondary takeover requires exact prior lease, proven quiescence, and pacing transfer or full interval', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const admission = await scheduler.admit(request(), 'collector:relay');
  now.value += 1_000;
  const lastBoundaryAt = new Date(now.value).toISOString();
  await scheduler.recordBoundary({ admissionId: admission.admissionId, boundaryAt: lastBoundaryAt, boundaryKind: 'CLICKED', conversationUrlSha256: null }, 'collector:relay');

  now.value = Date.parse('2026-09-10T12:01:00.000Z');
  const beforeExpiry = secondaryTakeoverLease({ transferredLastBoundaryAt: lastBoundaryAt });
  beforeExpiry.issuedAt = '2026-09-10T12:01:00.000Z';
  await assert.rejects(scheduler.activateLease(beforeExpiry), hasCode('PRIOR_LEASE_NOT_EXPIRED'));
  now.value = Date.parse(primaryLease().expiresAt) + 60_000;
  await assert.rejects(scheduler.activateLease(secondaryTakeoverLease({ previousLeaseId: 'wrong', transferredLastBoundaryAt: lastBoundaryAt })), hasCode('LEASE_EPOCH_INVALID'));
  await assert.rejects(scheduler.activateLease(secondaryTakeoverLease({ transferredLastBoundaryAt: '2026-09-10T00:00:00.000Z' })), hasCode('PACING_TRANSFER_MISMATCH'));
  await scheduler.activateLease(secondaryTakeoverLease({ transferredLastBoundaryAt: lastBoundaryAt }));
  await assert.rejects(scheduler.admit(request({ requestId: 'old-primary', queueKey: 'queue:old-primary' }), 'collector:relay'), hasCode('DEPLOYMENT_LEASE_MISMATCH'));
  const failover = await scheduler.admit(request({
    requestId: 'failover-send', queueKey: 'queue:failover-send', hostAlias: 'standby', hostRole: 'SECONDARY', deploymentEpoch: 2, leaseId: 'lease-secondary-2',
    targetId: 'standby-owned-target', automationWindowId: 202,
  }), 'collector:standby');
  assert.equal(failover.hostAlias, 'standby');
  assert.equal(failover.leaseEpoch, 2);
});

test('takeover cancels unadmitted queue state and rebinds only the same logical send', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const first = await scheduler.admit(request({ queueKey: 'queue:takeover' }), 'collector:relay');
  await scheduler.abortBeforeBoundary({ admissionId: first.admissionId, relayStage: 'COMPOSER_FILLED' }, 'collector:relay');
  now.value = Date.parse(primaryLease().expiresAt) + 60_000;
  const lease = secondaryTakeoverLease({ provenAt: '2026-09-10T12:00:30.000Z', transferredLastBoundaryAt: null });
  await scheduler.activateLease(lease);
  assert.equal(store.state.queueItems[0].status, 'CANCELLED_AT_TAKEOVER');
  const rebound = await scheduler.admit(request({
    queueKey: 'queue:takeover', targetId: 'standby-owned-target', automationWindowId: 202, hostAlias: 'standby', hostRole: 'SECONDARY', deploymentEpoch: 2, leaseId: 'lease-secondary-2',
  }), 'collector:standby');
  assert.equal(rebound.hostAlias, 'standby');
  await scheduler.abortBeforeBoundary({ admissionId: rebound.admissionId, relayStage: 'COMPOSER_FILLED' }, 'collector:standby');
  await assert.rejects(scheduler.admit(request({
    requestId: 'changed-request', queueKey: 'queue:takeover', targetId: 'standby-owned-target', automationWindowId: 202, hostAlias: 'standby', hostRole: 'SECONDARY', deploymentEpoch: 2, leaseId: 'lease-secondary-2',
  }), 'collector:standby'), hasCode('SUBMISSION_QUEUE_KEY_CONFLICT'));
});

test('takeover rebinds a rate-limit retry to the same durable queue item and successor-owned target', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const first = await scheduler.admit(request({ queueKey: 'queue:rate-takeover' }), 'collector:relay');
  await scheduler.abortBeforeBoundary({ admissionId: first.admissionId, relayStage: 'COMPOSER_FILLED', failureKind: 'PROVIDER_RATE_LIMIT' }, 'collector:relay');
  now.value = Date.parse(primaryLease().expiresAt) + 60_000;
  await scheduler.activateLease(secondaryTakeoverLease({ provenAt: '2026-09-10T12:00:30.000Z', transferredLastBoundaryAt: null }));
  const retry = await scheduler.admit(request({
    queueKey: 'queue:rate-takeover', hostAlias: 'standby', hostRole: 'SECONDARY', deploymentEpoch: 2,
    leaseId: 'lease-secondary-2', targetId: 'standby-owned-target', automationWindowId: 202,
  }), 'collector:standby');
  assert.equal(retry.queueItemId, first.queueItemId);
  assert.equal(retry.providerRateLimitCount, 1);
  assert.equal(store.state.queueItems[0].takeoverRebindings.length, 1);
});

test('rate-limit takeover cannot change the durable queue item logical destination', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const first = await scheduler.admit(request({ queueKey: 'queue:rate-logical-target' }), 'collector:relay');
  await scheduler.abortBeforeBoundary({ admissionId: first.admissionId, relayStage: 'COMPOSER_FILLED', failureKind: 'PROVIDER_RATE_LIMIT' }, 'collector:relay');
  now.value = Date.parse(primaryLease().expiresAt) + 60_000;
  await scheduler.activateLease(secondaryTakeoverLease({ provenAt: '2026-09-10T12:00:30.000Z', transferredLastBoundaryAt: null }));
  await assert.rejects(scheduler.admit(request({
    queueKey: 'queue:rate-logical-target', hostAlias: 'standby', hostRole: 'SECONDARY', deploymentEpoch: 2,
    leaseId: 'lease-secondary-2', targetId: 'standby-owned-target', automationWindowId: 202,
    targetKind: 'FRESH_PROVIDER_SESSION', targetKey: 'provider-session:changed', expectedUrlSha256: sha256('https://chatgpt.com/'),
  }), 'collector:standby'), hasCode('SUBMISSION_QUEUE_KEY_CONFLICT'));
  assert.equal(store.state.queueItems[0].takeoverRebindings.length, 0);
});

test('provider rate-limit retry count survives scheduler invocations and process-level retry loops', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const first = await scheduler.admit(request({ queueKey: 'queue:rate' }), 'collector:relay');
  const firstFailure = await scheduler.abortBeforeBoundary({ admissionId: first.admissionId, relayStage: 'COMPOSER_FILLED', failureKind: 'PROVIDER_RATE_LIMIT' }, 'collector:relay');
  assert.equal(firstFailure.providerRateLimitCount, 1);
  now.value += 30_000;
  const retry = await scheduler.admit(request({ queueKey: 'queue:rate' }), 'collector:relay');
  const exhausted = await scheduler.abortBeforeBoundary({ admissionId: retry.admissionId, relayStage: 'COMPOSER_FILLED', failureKind: 'PROVIDER_RATE_LIMIT' }, 'collector:relay');
  assert.equal(exhausted.retryExhausted, true);
  assert.equal(store.state.queueItems[0].status, 'RATE_LIMIT_RETRY_EXHAUSTED');
  assert.equal(store.state.safetyHalt.code, 'CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED');
  await assert.rejects(scheduler.admit(request({ queueKey: 'queue:rate' }), 'collector:relay'), hasCode('SUBMISSION_SAFETY_HALT'));
  await assert.rejects(scheduler.admit(request({ requestId: 'unrelated-after-exhaustion', queueKey: 'queue:unrelated-after-exhaustion' }), 'collector:relay'), hasCode('SUBMISSION_SAFETY_HALT'));
});

test('crossed provider rate limit resumes the same durable queue item after restart', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const first = await scheduler.admit(request({ queueKey: 'queue:crossed-rate' }), 'collector:relay');
  now.value += 1_000;
  await scheduler.recordBoundary({ admissionId: first.admissionId, boundaryAt: new Date(now.value).toISOString(), boundaryKind: 'CLICKED', conversationUrlSha256: null }, 'collector:relay');
  await scheduler.recordRateLimit({ admissionId: first.admissionId }, 'collector:relay');
  await assert.rejects(scheduler.admit(request({
    requestId: 'other-during-account-pause', queueKey: 'queue:other-during-account-pause', bodySha256: 'c'.repeat(64),
  }), 'collector:relay'), hasCode('ACCOUNT_RATE_LIMIT_ACTIVE'));
  await assert.rejects(scheduler.admit(request({ queueKey: 'queue:crossed-rate' }), 'collector:relay'), hasCode('PROVIDER_RATE_LIMIT_COOLDOWN'));
  now.value += 60_000;
  const resumed = await scheduler.admit(request({ queueKey: 'queue:crossed-rate' }), 'collector:relay');
  assert.equal(resumed.queueItemId, first.queueItemId);
  assert.equal(store.state.queueItems.find((item) => item.queueItemId === resumed.queueItemId).queueKey, 'queue:crossed-rate');
});

test('terminal delivery and recovery outcome is durable and immutable', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const admission = await scheduler.admit(request({ queueKey: 'queue:outcome' }), 'collector:relay');
  now.value += 1_000;
  await scheduler.recordBoundary({ admissionId: admission.admissionId, boundaryAt: new Date(now.value).toISOString(), boundaryKind: 'GENERATION_STARTED', conversationUrlSha256: null }, 'collector:relay');
  await scheduler.recordOutcome({ admissionId: admission.admissionId, deliveryStatus: 'GENERATION_STARTED', recoveryStatus: 'NOT_REQUIRED' }, 'collector:relay');
  assert.equal(normalizeSchedulerState(store.state).admissions.at(-1).deliveryStatus, 'GENERATION_STARTED');
  await assert.rejects(scheduler.recordOutcome({ admissionId: admission.admissionId, deliveryStatus: 'FAILED_CLOSED', recoveryStatus: 'FAILED_CLOSED' }, 'collector:relay'), hasCode('SUBMISSION_OUTCOME_CONFLICT'));
});

test('fresh session binding is separately persisted before a bound-session admission', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const freshRequest = request({
    requestId: 'fresh', queueKey: 'queue:fresh', targetKind: 'FRESH_PROVIDER_SESSION', targetKey: 'provider-session:fresh', expectedUrlSha256: sha256('https://chatgpt.com/'),
  });
  const fresh = await scheduler.admit(freshRequest, 'collector:relay');
  now.value += 1_000;
  const boundaryAt = new Date(now.value).toISOString();
  await scheduler.recordBoundary({ admissionId: fresh.admissionId, boundaryAt, boundaryKind: 'CLICKED', conversationUrlSha256: null }, 'collector:relay');
  const conversationHash = sha256('https://chatgpt.com/c/fresh-session');
  await scheduler.bindTarget({ admissionId: fresh.admissionId, conversationUrlSha256: conversationHash }, 'collector:relay');
  assert.equal(normalizeSchedulerState(store.state).targetBindings['provider-session:fresh'].conversationUrlSha256, conversationHash);
  now.value += 60_000;
  const bound = await scheduler.admit(request({
    requestId: 'bound', queueKey: 'queue:bound', targetKind: 'BOUND_PROVIDER_SESSION', targetKey: 'provider-session:fresh', expectedUrlSha256: conversationHash,
  }), 'collector:relay');
  assert.equal(bound.admitted, true);
});

test('MC-only registry and exact target binding reject legacy, personal, unregistered, and wrong-target sends', async () => {
  const valid = chat();
  for (const mutation of [
    { ownership: undefined },
    { ownership: 'PERSONAL' },
    { ownership: 'AMBIGUOUS' },
    { ownership: 'LEGACY_UNCLASSIFIED' },
    { purpose: '' },
    { registrationProvenance: { registeredBy: 'RELAY', registeredAt: '2026-09-10T11:00:00.000Z', sourceRef: 'test' } },
  ]) {
    assert.throws(() => parseChatDirectory([{ ...valid, ...mutation }]), /MISSION_CONTROL_ONLY|purpose|registeredBy/);
  }

  for (const [mutation, code] of [
    [{ supervisorId: 'unknown' }, 'SUPERVISOR_NOT_REGISTERED'],
    [{ registrationId: 'wrong-registration' }, 'SUPERVISOR_OWNERSHIP_MISMATCH'],
    [{ targetKey: 'wrong-bootstrap' }, 'SUPERVISOR_TARGET_MISMATCH'],
    [{ expectedUrlSha256: sha256('https://chatgpt.com/c/wrong') }, 'SUPERVISOR_TARGET_MISMATCH'],
    [{ targetKind: 'BOUND_PROVIDER_SESSION', targetKey: 'provider-session:unknown' }, 'SUPERVISOR_TARGET_MISMATCH'],
  ]) {
    const scheduler = makeScheduler(new MemoryStore(), { value: origin });
    await scheduler.activateLease(primaryLease());
    await assert.rejects(scheduler.admit(request(mutation), 'collector:relay'), hasCode(code));
  }
  const missingAuthorization = makeScheduler(new MemoryStore(), { value: origin });
  await missingAuthorization.activateLease(primaryLease());
  await assert.rejects(missingAuthorization.admit(request({ authorizationRef: null }), 'collector:relay'), /authorizationRef/);
});

test('owner-authorized provisioning is one-time and cannot authorize normal, bootstrap, or bound sends', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const provision = provisionChat();
  const scheduler = makeScheduler(store, now, { chats: parseChatProvisionDirectory([provision]) });
  await scheduler.activateLease(primaryLease());
  const exact = request({
    requestId: 'provision:spec', authorizationRef: 'task:worker-a', queueKey: 'provision:spec',
    sendPath: 'MC_ONLY_PROVISIONING', supervisorId: provision.supervisorId,
    registrationId: provision.registrationId, targetKind: 'FRESH_PROVIDER_SESSION',
    targetKey: provision.provisioningKey, expectedUrlSha256: sha256('https://chatgpt.com/'),
  });
  for (const mutation of [
    { sendPath: 'SUPERVISOR_MESSAGE' },
    { targetKind: 'REGISTERED_BOOTSTRAP' },
    { targetKind: 'BOUND_PROVIDER_SESSION' },
    { targetKey: 'provider-session:provisioning:wrong' },
    { expectedUrlSha256: sha256('https://chatgpt.com/c/not-root') },
  ]) {
    await assert.rejects(scheduler.admit({ ...exact, ...mutation }, 'collector:relay'), hasCode('SUPERVISOR_PROVISIONING_SCOPE_MISMATCH'));
  }
  const admission = await scheduler.admit(exact, 'collector:relay');
  now.value += 1_000;
  await scheduler.recordBoundary({
    admissionId: admission.admissionId,
    boundaryAt: new Date(now.value).toISOString(),
    boundaryKind: 'GENERATION_STARTED',
    conversationUrlSha256: sha256('https://chatgpt.com/c/private-provisioned-chat'),
  }, 'collector:relay');
  now.value += 60_000;
  await assert.rejects(
    scheduler.admit({ ...exact, requestId: 'provision:again', queueKey: 'provision:again' }, 'collector:relay'),
    hasCode('SUPERVISOR_PROVISIONING_ALREADY_CONSUMED'),
  );
});

function makeScheduler(store, now, overrides = {}) {
  return new CentralSubmissionScheduler({
    stateStore: store,
    chats: parseChatDirectory([chat()]),
    producerBindings: {
      'collector:relay': { hostAlias: 'primary', hostRole: 'PRIMARY', automationWindowId: 101, ownedTargetIds: ['owned-target-test'] },
      'collector:standby': { hostAlias: 'standby', hostRole: 'SECONDARY', automationWindowId: 202, ownedTargetIds: ['standby-owned-target'] },
    },
    producerAttestors: {
      'collector:relay': 'primary-attestor-test-' + 'a'.repeat(32),
      'collector:standby': 'standby-attestor-test-' + 'b'.repeat(32),
    },
    pacingDomain: 'account:test',
    minIntervalMs: 60_000,
    now: () => now.value,
    ...overrides,
  });
}

const primaryAttestor = 'primary-attestor-test-' + 'a'.repeat(32);

function targetTransition(phase, overrides = {}) {
  const operation = overrides.operation ?? 'ADD';
  return {
    phase,
    pacingDomain: 'account:test',
    producerId: overrides.producerId ?? 'collector:relay',
    transitionId: overrides.transitionId ?? 'transition:test',
    operation,
    reason: {
      ADD: 'AUTOMATION_OWNED_TARGET_CREATE',
      REMOVE: 'AUTOMATION_OWNED_TARGET_CLOSE',
      RECONCILE_REMOVE: 'AUTOMATION_OWNED_TARGET_DISAPPEARED',
      WINDOW_REPLACE: 'AUTOMATION_OWNED_WINDOW_REPLACE',
    }[operation],
    hostAlias: overrides.hostAlias ?? 'primary',
    hostRole: overrides.hostRole ?? 'PRIMARY',
    deploymentEpoch: overrides.deploymentEpoch ?? 1,
    leaseId: overrides.leaseId ?? 'lease-primary-1',
    automationWindowId: overrides.automationWindowId ?? 101,
    priorBindingRevision: overrides.priorBindingRevision ?? 1,
    priorOwnedTargetIds: [...(overrides.priorOwnedTargetIds ?? ['owned-target-test'])].sort(),
    anchorTargetId: operation === 'ADD' ? overrides.anchorTargetId ?? 'owned-target-test' : null,
    targetId: ['REMOVE', 'RECONCILE_REMOVE'].includes(operation) ? overrides.targetId ?? 'pm-target-test' : null,
    ...(phase === 'COMMIT' ? {
      postAutomationWindowId: overrides.postAutomationWindowId ?? overrides.automationWindowId ?? 101,
      postOwnedTargetIds: [...overrides.postOwnedTargetIds].sort(),
      transitionedTargetId: overrides.transitionedTargetId,
    } : {}),
    ...(phase === 'ABORT' ? {
      observedAutomationWindowId: overrides.observedAutomationWindowId ?? overrides.automationWindowId ?? 101,
      observedOwnedTargetIds: [...overrides.observedOwnedTargetIds].sort(),
    } : {}),
  };
}

function signTransition(payload, secret = primaryAttestor) {
  return { ...payload, proof: createHmac('sha256', secret).update(canonicalJson(payload)).digest('hex') };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function chat() {
  return {
    scope: 'SPECIALIST', supervisorId: 'spec', label: 'Dedicated supervisor', workerId: 'worker-a', pinned: false,
    registrationId: 'registration:spec:test', ownership: 'MISSION_CONTROL_ONLY', purpose: 'Dedicated Mission Control test supervision only.',
    accountAlias: 'account:test', workspaceAlias: 'workspace:test', privateLocatorRef: 'private-config:supervisors/spec',
    registrationProvenance: { registeredBy: 'OWNER', registeredAt: '2026-09-10T11:00:00.000Z', sourceRef: 'owner-requirement:test' },
    bootstrapCapability: { chatId: 'bootstrap-test', url: 'https://chatgpt.com/c/bootstrap-test', challengeId: 'challenge-test' },
    consumerControls: { modelVisibleLabel: 'GPT-5.6 Sol', thinkingControlLabel: 'Thinking effort', thinkingVisibleLabel: 'Extra High', thinkingOrdinal: '4 of 5', accountPlanLabel: 'Pro', accountPlanRole: 'PROVENANCE_METADATA_ONLY', accountPlanIsReasoningMode: false },
    requiredApps: { missionControl: 'Mission Control', github: 'GitHub' },
  };
}

function provisionChat() {
  return {
    registrationState: 'PROVISIONING', scope: 'SPECIALIST', supervisorId: 'spec-provisioning',
    label: 'Provisioned specialist', workerId: 'worker-a', pinned: false,
    registrationId: 'registration:spec:provisioning:test',
    provisioningKey: 'provider-session:provisioning:spec-test', ownership: 'MISSION_CONTROL_ONLY',
    purpose: 'Owner-authorized Mission Control-only chat provisioning.', accountAlias: 'account:test',
    workspaceAlias: 'workspace:test', privateLocatorRef: 'private-config:supervisors/spec-provisioning',
    provisioningProvenance: { authorizedBy: 'OWNER', authorizedAt: '2026-09-12T12:00:00.000Z', sourceRef: 'owner-requirement:test' },
    consumerControls: { modelVisibleLabel: 'GPT-5.6 Sol', thinkingControlLabel: 'Thinking effort', thinkingVisibleLabel: 'Extra High', thinkingOrdinal: '4 of 5', accountPlanLabel: 'Pro', accountPlanRole: 'PROVENANCE_METADATA_ONLY', accountPlanIsReasoningMode: false },
    requiredApps: { missionControl: 'Mission Control', github: 'GitHub' },
  };
}

function primaryLease() {
  return {
    schemaVersion: 1, leaseId: 'lease-primary-1', epoch: 1, activeHostAlias: 'primary', activeHostRole: 'PRIMARY',
    issuedAt: '2026-09-10T11:59:00.000Z', expiresAt: '2026-09-10T13:00:00.000Z', splitBrainStatus: 'SINGLE_ACTIVE_CONFIRMED', takeover: null,
  };
}

function secondaryTakeoverLease(overrides = {}) {
  return {
    schemaVersion: 1, leaseId: 'lease-secondary-2', epoch: 2, activeHostAlias: 'standby', activeHostRole: 'SECONDARY',
    issuedAt: '2026-09-10T13:01:00.000Z', expiresAt: '2026-09-10T14:00:00.000Z', splitBrainStatus: 'SINGLE_ACTIVE_CONFIRMED',
    takeover: {
      previousLeaseId: 'lease-primary-1', previousEpoch: 1, previousHostAlias: 'primary', priorHostQuiescence: 'PROVEN',
      previousLeaseExpiresAt: '2026-09-10T13:00:00.000Z', provenAt: '2026-09-10T12:00:30.000Z', pacingState: 'TRANSFERRED', transferredLastBoundaryAt: null, safetyIntervalCompletedAt: null,
      ...overrides,
    },
  };
}

function request(overrides = {}) {
  return {
    requestId: 'r-1', authorizationRef: overrides.authorizationRef ?? overrides.requestId ?? 'r-1', queueKey: 'queue:r-1', sendPath: 'CAPABILITY', hostAlias: 'primary', hostRole: 'PRIMARY', deploymentEpoch: 1,
    leaseId: 'lease-primary-1', supervisorId: 'spec', registrationId: 'registration:spec:test', targetId: 'owned-target-test', automationWindowId: 101,
    targetKind: 'REGISTERED_BOOTSTRAP', targetKey: 'bootstrap-test', expectedUrlSha256: sha256('https://chatgpt.com/c/bootstrap-test'), bodySha256: 'a'.repeat(64),
    ...overrides,
  };
}

function hasCode(code) {
  return (error) => error?.code === code;
}

function count(value, needle) {
  return value.split(needle).length - 1;
}

class MemoryStore {
  constructor(state = defaultSchedulerState('2026-09-10T11:00:00.000Z')) { this.state = structuredClone(state); }
  async read() { return structuredClone(this.state); }
  async write(value) { this.state = structuredClone(value); return structuredClone(value); }
}

for (const stage of ['CLICK_DISPATCHED', 'CLICKED', 'GENERATION_STARTED', 'UNKNOWN', 'INVENTED_SAFE_STAGE']) {
  test(`single-writer authority rejects ${stage} as proof of no send`, async () => {
    const now = { value: origin }, store = new MemoryStore(), scheduler = makeScheduler(store, now);
    await scheduler.activateLease(primaryLease());
    const admitted = await scheduler.admit(request(), 'collector:relay');
    await assert.rejects(scheduler.abortBeforeBoundary({ admissionId: admitted.admissionId, relayStage: stage }, 'collector:relay'), hasCode('SUBMISSION_ABORT_BOUNDARY_UNPROVEN'));
    assert.equal(store.state.admissions[0].status, 'ADMITTED');
    assert.equal(store.state.lastBoundaryAt, null);
    await assert.rejects(scheduler.admit(request(), 'collector:relay'), hasCode('SUBMISSION_QUEUE_BUSY'));
  });
}

test('owner discard closes an expired admission once, never replays it, and reopens sends and window replacement', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const input = request();
  const admission = await scheduler.admit(input, 'collector:relay');
  const relay = 'collector:relay';
  const decidedAt = new Date(origin).toISOString();
  const close = (overrides = {}, producer = relay) => scheduler.closeAmbiguousAdmission(ambiguityClosure(admission, input, now, { decidedAt, ...overrides }), producer);

  // Refusals that record nothing: another relay, another request or body, a future-dated or invalid decision.
  await assert.rejects(close({}, 'collector:standby'), hasCode('SUBMISSION_ADMISSION_PRODUCER_MISMATCH'));
  await assert.rejects(close({ requestId: 'r-other' }), hasCode('SUBMISSION_AMBIGUITY_CLOSURE_MISMATCH'));
  await assert.rejects(close({ bodySha256: 'b'.repeat(64) }), hasCode('SUBMISSION_AMBIGUITY_CLOSURE_MISMATCH'));
  await assert.rejects(close({ decidedAt: new Date(now.value + 30_001).toISOString() }), hasCode('SUBMISSION_AMBIGUITY_CLOSURE_DECISION_TIME_INVALID'));
  for (const invalid of [{ decision: 'OWNER_SAID_SO' }, { bodySha256: 'not-a-digest' }, { decidedAt: 'yesterday' }]) {
    const error = await close(invalid).catch((caught) => caught);
    assert.equal(error.code, 'SUBMISSION_AMBIGUITY_CLOSURE_INVALID');
    assert.equal(error.statusCode, 400);
  }
  await assert.rejects(scheduler.closeAmbiguousAdmission({ ...ambiguityClosure(admission, input, now, { decidedAt }), queueItemId: admission.queueItemId }, relay), hasCode('SUBMISSION_AMBIGUITY_CLOSURE_INVALID'));
  await assert.rejects(scheduler.closeAmbiguousAdmission(ambiguityClosure({ admissionId: 'send-admission:unknown' }, input, now), relay), hasCode('SUBMISSION_ADMISSION_UNKNOWN'));
  assert.equal(store.state.ambiguityClosureRequests, undefined);

  // The first request is recorded on Mission Control's clock, even while the admission is still open; from then
  // on the admission cannot authorize a click, and closure waits a full interval after the expiry.
  const early = await close().catch((error) => error);
  assert.equal(early.code, 'SUBMISSION_AMBIGUITY_CLOSURE_TOO_EARLY');
  assert.equal(early.detail.closableAt, new Date(Date.parse(admission.expiresAt) + 60_000).toISOString());
  assert.deepEqual(store.state.ambiguityClosureRequests, {
    [admission.admissionId]: { decision: 'OWNER_DISCARDED_NO_REPLAY', decidedAt, requestedAt: new Date(origin).toISOString() },
  });
  normalizeSchedulerState(JSON.parse(JSON.stringify(store.state)));
  await assert.rejects(scheduler.validateAdmission({ admissionId: admission.admissionId }, relay), hasCode('SUBMISSION_ADMISSION_CLOSURE_REQUESTED'));
  await assert.rejects(close({ decision: 'OWNER_ATTESTED_SUBMITTED_NO_REPLAY' }), hasCode('SUBMISSION_AMBIGUITY_CLOSURE_REQUEST_CONFLICT'));
  now.value = Date.parse(early.detail.closableAt) - 1;
  await assert.rejects(close(), hasCode('SUBMISSION_AMBIGUITY_CLOSURE_TOO_EARLY'));
  assert.equal(store.state.admissions[0].status, 'ADMITTED');
  now.value = Date.parse(early.detail.closableAt);

  const closed = await close();
  assert.equal(closed.closed, true);
  assert.equal(closed.duplicate, false);
  assert.equal(store.state.admissions[0].status, 'AMBIGUOUS_CLOSED_NO_REPLAY');
  assert.deepEqual(store.state.admissions[0].ambiguityClosure, {
    decision: 'OWNER_DISCARDED_NO_REPLAY', priorStatus: 'ADMITTED', decidedAt,
    requestedAt: new Date(origin).toISOString(), closedAt: closed.closedAt,
  });
  assert.equal(store.state.ambiguityClosureRequests, undefined);
  assert.equal(store.state.queueItems[0].status, 'CLOSED_AMBIGUOUS_NO_REPLAY');
  assert.equal(store.state.queueItems[0].terminalAt, closed.closedAt);
  assert.equal(store.state.lastBoundaryAt, null);
  const reloaded = normalizeSchedulerState(JSON.parse(JSON.stringify(store.state)));
  assert.deepEqual(reloaded.admissions[0].ambiguityClosure, store.state.admissions[0].ambiguityClosure);
  assert.deepEqual(normalizeSchedulerState(JSON.parse(JSON.stringify(reloaded))), reloaded);
  assert.equal((await close()).duplicate, true);
  await assert.rejects(close({ decidedAt: new Date(now.value - 1).toISOString() }), hasCode('SUBMISSION_AMBIGUITY_ALREADY_CLOSED'));
  await assert.rejects(close({ decision: 'OWNER_ATTESTED_SUBMITTED_NO_REPLAY' }), hasCode('SUBMISSION_AMBIGUITY_ALREADY_CLOSED'));

  const status = await scheduler.status();
  assert.equal(status.unresolvedAdmission, null);
  assert.equal(status.queueDepth, 0);
  assert.equal(status.ready, true);
  // The closed send's queue key can never be admitted again.
  await assert.rejects(scheduler.admit(input, relay), hasCode('SUBMISSION_QUEUE_ITEM_TERMINAL'));

  // The relay may now replace its lost window, then send a new request from it.
  const begin = targetTransition('BEGIN', { operation: 'WINDOW_REPLACE', transitionId: 'transition:after-closure' });
  await scheduler.beginRelayTargetTransition(signTransition(begin), relay);
  await scheduler.commitRelayTargetTransition(signTransition(targetTransition('COMMIT', {
    operation: 'WINDOW_REPLACE', transitionId: 'transition:after-closure', postAutomationWindowId: 303,
    postOwnedTargetIds: ['replacement-target'], transitionedTargetId: 'replacement-target',
  })), relay);
  const fresh = await scheduler.admit(request({ requestId: 'r-2', queueKey: 'queue:r-2', automationWindowId: 303, targetId: 'replacement-target' }), relay);
  assert.equal(fresh.admitted, true);
});

test('closure timing uses Mission Control\'s receipt of the request, not the relay\'s clock', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const input = request();
  const admission = await scheduler.admit(input, 'collector:relay');
  // A relay clock far behind Mission Control stamps a decision hours old; it cannot shorten the wait.
  now.value = Date.parse(admission.expiresAt) + 600_000;
  const decidedAt = new Date(origin - 3 * 3_600_000).toISOString();
  const early = await scheduler.closeAmbiguousAdmission(ambiguityClosure(admission, input, now, { decidedAt }), 'collector:relay').catch((error) => error);
  assert.equal(early.code, 'SUBMISSION_AMBIGUITY_CLOSURE_TOO_EARLY');
  assert.equal(early.detail.closableAt, new Date(now.value + 60_000).toISOString());
  now.value += 60_000;
  const closed = await scheduler.closeAmbiguousAdmission(ambiguityClosure(admission, input, now, { decidedAt }), 'collector:relay');
  assert.equal(closed.duplicate, false);
  assert.equal(store.state.admissions[0].ambiguityClosure.requestedAt, new Date(now.value - 60_000).toISOString());
  assert.equal(store.state.admissions[0].ambiguityClosure.decidedAt, decidedAt);
});

test('an owner attestation that the send went out closes it the same way', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const input = request();
  const admission = await scheduler.admit(input, 'collector:relay');
  now.value = Date.parse(admission.expiresAt) + 1_000;
  await closeAfterRequest(scheduler, ambiguityClosure(admission, input, now, { decision: 'OWNER_ATTESTED_SUBMITTED_NO_REPLAY' }), now);
  assert.equal(store.state.admissions[0].ambiguityClosure.decision, 'OWNER_ATTESTED_SUBMITTED_NO_REPLAY');
  assert.equal(store.state.queueItems[0].status, 'CLOSED_AMBIGUOUS_NO_REPLAY');
  await assert.rejects(scheduler.admit(input, 'collector:relay'), hasCode('SUBMISSION_QUEUE_ITEM_TERMINAL'));
});

test('a restart-ambiguous admission closed on the owner decision no longer blocks takeover', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const first = makeScheduler(store, now, { admissionTtlMs: 30_000 });
  await first.activateLease(primaryLease());
  const input = request();
  const admission = await first.admit(input, 'collector:relay');
  now.value += 30_001;
  const restarted = makeScheduler(store, now, { admissionTtlMs: 30_000 });
  await assert.rejects(restarted.admit(request({ requestId: 'r-replay', queueKey: 'queue:r-replay' }), 'collector:relay'), hasCode('SUBMISSION_RESTART_AMBIGUITY'));
  assert.equal(store.state.admissions[0].status, 'AMBIGUOUS_AFTER_RESTART');

  now.value = Date.parse('2026-09-10T13:01:00.000Z');
  await assert.rejects(restarted.activateLease(secondaryTakeoverLease()), hasCode('TAKEOVER_SEND_AMBIGUITY'));
  const closed = await closeAfterRequest(restarted, ambiguityClosure(admission, input, now), now);
  assert.equal(store.state.admissions[0].ambiguityClosure.priorStatus, 'AMBIGUOUS_AFTER_RESTART');
  assert.equal(store.state.queueItems[0].terminalAt, closed.closedAt);
  const takeover = await restarted.activateLease(secondaryTakeoverLease());
  assert.equal(takeover.epoch, 2);
  assert.equal(store.state.admissions[0].status, 'AMBIGUOUS_CLOSED_NO_REPLAY');
});

test('closure refuses crossed and aborted admissions, and a late boundary is recorded and halts fail closed', async () => {
  const relay = 'collector:relay';
  for (const [settle, settledStatus] of [
    [async ({ scheduler, admission }) => scheduler.recordBoundary({ admissionId: admission.admissionId,
      boundaryAt: new Date(origin).toISOString(), boundaryKind: 'CLICKED', conversationUrlSha256: null }, relay), 'BOUNDARY_RECORDED'],
    [async ({ scheduler, admission }) => scheduler.abortBeforeBoundary({ admissionId: admission.admissionId, relayStage: 'COMPOSER_FILLED' }, relay), 'ABORTED_BEFORE_BOUNDARY'],
  ]) {
    const now = { value: origin };
    const store = new MemoryStore();
    const scheduler = makeScheduler(store, now);
    await scheduler.activateLease(primaryLease());
    const input = request();
    const admission = await scheduler.admit(input, relay);
    await settle({ scheduler, admission });
    now.value = Date.parse(admission.expiresAt) + 120_000;
    const refused = await scheduler.closeAmbiguousAdmission(ambiguityClosure(admission, input, now), relay).catch((error) => error);
    assert.equal(refused.code, 'SUBMISSION_AMBIGUITY_CLOSURE_STAGE_INVALID');
    assert.equal(refused.detail.admissionStatus, settledStatus);
    assert.equal(store.state.ambiguityClosureRequests, undefined);
  }

  for (const priorHalt of [null, { code: 'EARLIER_HALT', admissionId: 'send-admission:earlier', queueItemId: 'send-queue-item:earlier', boundaryAt: new Date(origin).toISOString() }]) {
    const now = { value: origin };
    const store = new MemoryStore();
    const scheduler = makeScheduler(store, now);
    await scheduler.activateLease(primaryLease());
    const input = request();
    const admission = await scheduler.admit(input, relay);
    now.value = Date.parse(admission.expiresAt) + 1_000;
    await closeAfterRequest(scheduler, ambiguityClosure(admission, input, now), now);
    if (priorHalt) store.state.safetyHalt = priorHalt;
    const lateBoundaryAt = new Date(now.value - 1_000).toISOString();
    await assert.rejects(scheduler.recordBoundary({ admissionId: admission.admissionId, boundaryAt: lateBoundaryAt,
      boundaryKind: 'CLICKED', conversationUrlSha256: null }, relay), hasCode('SUBMISSION_BOUNDARY_AFTER_AMBIGUITY_CLOSURE'));
    assert.deepEqual(store.state.safetyHalt, priorHalt ?? {
      code: 'SUBMISSION_BOUNDARY_AFTER_AMBIGUITY_CLOSURE', admissionId: admission.admissionId,
      queueItemId: admission.queueItemId, boundaryAt: lateBoundaryAt,
    });
    assert.equal(store.state.lastBoundaryAt, lateBoundaryAt);
    assert.equal(store.state.admissions[0].status, 'AMBIGUOUS_EXPIRED_AT_BOUNDARY');
    assert.equal(store.state.admissions[0].boundaryAt, lateBoundaryAt);
    assert.equal(Object.hasOwn(store.state.admissions[0], 'ambiguityClosure'), false);
    assert.equal(store.state.queueItems[0].status, 'AMBIGUOUS_EXPIRED_AT_BOUNDARY');
    normalizeSchedulerState(JSON.parse(JSON.stringify(store.state)));
    assert.equal((await scheduler.status()).ready, false);
    await assert.rejects(scheduler.admit(request({ requestId: 'r-2', queueKey: 'queue:r-2' }), relay), hasCode('SUBMISSION_SAFETY_HALT'));
    await assert.rejects(scheduler.admit(input, relay), hasCode('SUBMISSION_SAFETY_HALT'));
  }
});

test('persisted closures and pending requests are schema-checked and cannot be forged onto other history', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const input = request();
  const admission = await scheduler.admit(input, 'collector:relay');
  now.value = Date.parse(admission.expiresAt) + 1_000;
  const closure = ambiguityClosure(admission, input, now);
  const early = await scheduler.closeAmbiguousAdmission(closure, 'collector:relay').catch((error) => error);
  assert.equal(early.code, 'SUBMISSION_AMBIGUITY_CLOSURE_TOO_EARLY');
  const pending = JSON.parse(JSON.stringify(normalizeSchedulerState(JSON.parse(JSON.stringify(store.state)))));
  assert.ok(pending.ambiguityClosureRequests[admission.admissionId]);
  const pendingForgeries = [
    (state) => { state.ambiguityClosureRequests[admission.admissionId].extra = true; },
    (state) => { state.ambiguityClosureRequests[admission.admissionId].decision = 'OWNER_SAID_SO'; },
    (state) => { state.ambiguityClosureRequests['send-admission:unknown'] = state.ambiguityClosureRequests[admission.admissionId]; },
    (state) => { state.ambiguityClosureRequests[admission.admissionId].requestedAt = new Date(origin - 1).toISOString(); },
    (state) => { state.ambiguityClosureRequests[admission.admissionId].decidedAt = new Date(now.value + 30_001).toISOString(); },
  ];
  for (const [index, forge] of pendingForgeries.entries()) {
    const state = structuredClone(pending);
    forge(state);
    assert.throws(() => normalizeSchedulerState(state), Error, `pending forgery ${index} must fail closed`);
  }

  now.value = Date.parse(early.detail.closableAt);
  await scheduler.closeAmbiguousAdmission(closure, 'collector:relay');
  const normalized = normalizeSchedulerState(JSON.parse(JSON.stringify(store.state)));
  assert.equal(normalized.admissions[0].status, 'AMBIGUOUS_CLOSED_NO_REPLAY');
  const closed = JSON.parse(JSON.stringify(normalized));
  assert.deepEqual(normalizeSchedulerState(structuredClone(closed)), normalized);

  const forged = [
    (state) => { delete state.admissions[0].ambiguityClosure; },
    (state) => { state.admissions[0].ambiguityClosure.extra = true; },
    (state) => { delete state.admissions[0].ambiguityClosure.requestedAt; },
    (state) => { state.admissions[0].ambiguityClosure.decision = 'OWNER_SAID_SO'; },
    (state) => { state.admissions[0].ambiguityClosure.priorStatus = 'BOUNDARY_RECORDED'; },
    (state) => { state.admissions[0].ambiguityClosure.requestedAt = state.admissions[0].ambiguityClosure.closedAt; },
    (state) => { state.admissions[0].boundaryAt = state.admissions[0].ambiguityClosure.closedAt; },
    (state) => { state.queueItems[0].terminalAt = new Date(now.value - 1).toISOString(); },
    (state) => { state.queueItems[0].status = 'CANCELLED_EXPIRED_ROUTE'; },
    (state) => { state.admissions[0].status = 'AMBIGUOUS_AFTER_RESTART'; state.queueItems[0].status = 'AMBIGUOUS_AFTER_RESTART'; },
    (state) => {
      state.admissions[0].status = 'ADMITTED'; state.queueItems[0].status = 'ADMITTED'; state.queueItems[0].terminalAt = null;
    },
    (state) => { state.ambiguityClosureRequests = { [admission.admissionId]: pending.ambiguityClosureRequests[admission.admissionId] }; },
  ];
  for (const [index, forge] of forged.entries()) {
    const state = structuredClone(closed);
    forge(state);
    assert.throws(() => normalizeSchedulerState(state), Error, `forgery ${index} must fail closed`);
  }
});

test('a closed ambiguous journal send still counts toward that day\'s journal allowance', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const input = request({ sendPath: 'JOURNAL_WORK' });
  const admission = await scheduler.admit(input, 'collector:relay');
  now.value = Date.parse(admission.expiresAt) + 1_000;
  assert.equal((await scheduler.status()).journalCallsToday, 0);
  await closeAfterRequest(scheduler, ambiguityClosure(admission, input, now), now);
  assert.equal((await scheduler.status()).journalCallsToday, 1);
  now.value += 86_400_000;
  assert.equal((await scheduler.status()).journalCallsToday, 0);
});

test('a closed ambiguous journal send admitted just before midnight counts on both days its window touches', async () => {
  const now = { value: Date.parse('2026-09-10T23:59:30.000Z') };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease({ ...primaryLease(), issuedAt: '2026-09-10T23:00:00.000Z', expiresAt: '2026-09-11T02:00:00.000Z' });
  const input = request({ sendPath: 'JOURNAL_WORK' });
  const admission = await scheduler.admit(input, 'collector:relay');
  assert.equal(admission.expiresAt.slice(0, 10), '2026-09-11');
  now.value = Date.parse(admission.expiresAt) + 1_000;
  await closeAfterRequest(scheduler, ambiguityClosure(admission, input, now), now);
  assert.equal((await scheduler.status()).journalCallsToday, 1);
  now.value = Date.parse('2026-09-10T23:59:59.000Z');
  assert.equal((await scheduler.status()).journalCallsToday, 1);
  now.value = Date.parse('2026-09-12T00:00:01.000Z');
  assert.equal((await scheduler.status()).journalCallsToday, 0);
});

// The first closure call records the request and reports when it can complete; the second completes it.
async function closeAfterRequest(scheduler, closure, now, producerId = 'collector:relay') {
  const early = await scheduler.closeAmbiguousAdmission(closure, producerId).catch((error) => error);
  assert.equal(early.code, 'SUBMISSION_AMBIGUITY_CLOSURE_TOO_EARLY');
  now.value = Date.parse(early.detail.closableAt);
  return scheduler.closeAmbiguousAdmission(closure, producerId);
}

function ambiguityClosure(admission, input, now, overrides = {}) {
  return {
    admissionId: admission.admissionId,
    requestId: input.requestId,
    bodySha256: input.bodySha256,
    decision: 'OWNER_DISCARDED_NO_REPLAY',
    decidedAt: new Date(now.value).toISOString(),
    ...overrides,
  };
}
