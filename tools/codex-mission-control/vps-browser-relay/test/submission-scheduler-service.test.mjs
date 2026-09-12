import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';

import { parseChatDirectory, parseChatProvisionDirectory, sha256 } from '../src/core.mjs';
import {
  CentralSubmissionScheduler,
  defaultSchedulerState,
  normalizeSchedulerState,
  parseDeploymentLease,
} from '../src/submission-scheduler-service.mjs';

const origin = Date.parse('2026-09-10T12:00:00.000Z');

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
  const recovery = await readFile(new URL('../src/stuck-recovery.mjs', import.meta.url), 'utf8');
  assert.equal(count(relay, 'this.submissionPacer.submit({'), 3);
  assert.equal(count(relay, 'this.browser.submitExactMessage('), 3);
  assert.equal(count(relay, 'onSubmissionBoundary'), 6);
  assert.equal(count(controller, 'this.submissionPacer.submit({'), 2);
  assert.equal(count(controller, 'this.browser.submitExactMessage('), 2);
  assert.ok(count(controller, 'onSubmissionBoundary') >= 4);
  assert.equal(count(launcher, 'submissionPacer.submit({'), 1);
  assert.equal(count(launcher, 'rawBrowser.submitExactMessage('), 1);
  assert.match(launcher, /onSubmissionBoundary/);
  assert.doesNotMatch(recovery, /browser\.submitExactMessage\(/);
  for (const source of [relay, controller, launcher, recovery]) assert.doesNotMatch(source, /clipboard|xclip|xsel/i);
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
  const relayUnit = await readFile(new URL('../systemd/system/mission-control-chatgpt-relay@.service', import.meta.url), 'utf8');
  const installer = await readFile(new URL('../scripts/install-system-services.sh', import.meta.url), 'utf8');
  assert.match(browserUnit, /^User=%i$/m);
  assert.doesNotMatch(browserUnit, /^Group=/m);
  assert.match(browserUnit, /^NoNewPrivileges=false$/m);
  assert.match(browserUnit, /^ProtectSystem=strict$/m);
  assert.match(browserUnit, /^ProtectHome=read-only$/m);
  assert.doesNotMatch(browserUnit, /--no-sandbox|--disable-setuid-sandbox/);
  assert.match(relayUnit, /^User=%i$/m);
  assert.doesNotMatch(relayUnit, /^Group=/m);
  assert.match(relayUnit, /^NoNewPrivileges=true$/m);
  assert.match(relayUnit, /Requires=mission-control-chatgpt-browser@%i\.service/);
  assert.match(installer, /target_uid.*-eq 0/);
  assert.match(installer, /systemctl daemon-reload/);
  assert.doesNotMatch(installer, /rm\s+-rf|TOKEN|clipboard|xclip|xsel/i);
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
