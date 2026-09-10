import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseChatDirectory, sha256 } from '../src/core.mjs';
import {
  CentralSubmissionScheduler,
  SchedulerStateStore,
  defaultSchedulerState,
  normalizeSchedulerState,
  parseDeploymentLease,
  startSubmissionSchedulerService,
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

test('scheduler lock recovers only a provably dead same-host PID', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-scheduler-lock-'));
  try {
    const stateFile = join(root, 'scheduler.json');
    const lockFile = `${stateFile}.lock`;
    await writeFile(lockFile, JSON.stringify({ pid: 99999999 }));
    const recovered = new SchedulerStateStore({ stateFile, lockFile });
    await recovered.acquireLock();
    await recovered.releaseLock();
    await writeFile(lockFile, JSON.stringify({ pid: process.pid }));
    const live = new SchedulerStateStore({ stateFile, lockFile });
    await assert.rejects(live.acquireLock(), /Another submission scheduler/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test('scheduler daemon source binds only to loopback addresses', async () => {
  const daemon = await readFile(new URL('../bin/mc-submission-scheduler.mjs', import.meta.url), 'utf8');
  assert.match(daemon, /\['127\.0\.0\.1', 'localhost', '::1'\]/);
  assert.match(daemon, /MC_SCHEDULER_HOST must remain loopback-only/);
});

test('HTTP health is coarse while status and mutation routes require the scheduler credential', async () => {
  const now = { value: origin };
  const store = new LockingMemoryStore();
  const scheduler = makeScheduler(store, now);
  const token = 'test-scheduler-token-at-least-32-characters';
  const server = await startSubmissionSchedulerService({
    config: { host: '127.0.0.1', port: 0, token, lease: primaryLease() }, scheduler, stateStore: store,
    logger: { error() {} },
  });
  try {
    const address = server.address();
    assert.equal(typeof address, 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.equal((await fetch(`${base}/status`)).status, 401);
    const status = await fetch(`${base}/status`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.equal(statusBody.activeLease.epoch, 1);
    assert.equal(statusBody.activeLease.activeHostAlias, 'primary');
    assert.equal(Object.hasOwn(statusBody.activeLease, 'leaseId'), false);
    const mutation = await fetch(`${base}/admissions`, { method: 'POST', body: JSON.stringify(request()) });
    assert.equal(mutation.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await store.releaseLock();
  }
  assert.equal(store.locked, false);
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
  assert.match(unit, /EnvironmentFile=%h\/.config\/mission-control-chatgpt-relay\/browser-env/);
  assert.doesNotMatch(browserEnv, /TOKEN|PRODUCER_ID|MISSION_CONTROL_URL/);
  assert.match(relayEnv, /MC_RELAY_SCHEDULER_TOKEN=/);
  assert.match(launcher, /unset MC_RELAY_TOKEN MC_RELAY_SCHEDULER_TOKEN MC_RELAY_PRODUCER_ID MC_RELAY_MISSION_CONTROL_URL/);
  for (const source of [browserEnv, launcher]) assert.doesNotMatch(source, /clipboard|xclip|xsel/i);
});

test('standby, wrong alias, wrong epoch, wrong lease, stale lease, and missing lease all fail closed', async () => {
  const cases = [
    [request({ hostRole: 'SECONDARY', hostAlias: 'standby' }), 'STANDBY_SEND_FORBIDDEN'],
    [request({ hostAlias: 'wrong-primary' }), 'DEPLOYMENT_LEASE_MISMATCH'],
    [request({ deploymentEpoch: 2 }), 'DEPLOYMENT_LEASE_MISMATCH'],
    [request({ leaseId: 'wrong-lease' }), 'DEPLOYMENT_LEASE_MISMATCH'],
  ];
  for (const [candidate, code] of cases) {
    const scheduler = makeScheduler(new MemoryStore(), { value: origin });
    await scheduler.activateLease(primaryLease());
    await assert.rejects(scheduler.admit(candidate, 'collector:relay'), hasCode(code));
  }

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
  }), 'collector:relay');
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
    queueKey: 'queue:takeover', targetId: 'standby-owned-target', hostAlias: 'standby', hostRole: 'SECONDARY', deploymentEpoch: 2, leaseId: 'lease-secondary-2',
  }), 'collector:relay');
  assert.equal(rebound.hostAlias, 'standby');
  await scheduler.abortBeforeBoundary({ admissionId: rebound.admissionId, relayStage: 'COMPOSER_FILLED' }, 'collector:relay');
  await assert.rejects(scheduler.admit(request({
    requestId: 'changed-request', queueKey: 'queue:takeover', targetId: 'standby-owned-target', hostAlias: 'standby', hostRole: 'SECONDARY', deploymentEpoch: 2, leaseId: 'lease-secondary-2',
  }), 'collector:relay'), hasCode('SUBMISSION_QUEUE_KEY_CONFLICT'));
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
  await assert.rejects(scheduler.admit(request({ queueKey: 'queue:rate' }), 'collector:relay'), hasCode('CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED'));
});

test('crossed provider rate limit resumes at its durable retry key after restart', async () => {
  const now = { value: origin };
  const store = new MemoryStore();
  const scheduler = makeScheduler(store, now);
  await scheduler.activateLease(primaryLease());
  const first = await scheduler.admit(request({ queueKey: 'queue:crossed-rate' }), 'collector:relay');
  now.value += 1_000;
  await scheduler.recordBoundary({ admissionId: first.admissionId, boundaryAt: new Date(now.value).toISOString(), boundaryKind: 'CLICKED', conversationUrlSha256: null }, 'collector:relay');
  await scheduler.recordRateLimit({ admissionId: first.admissionId }, 'collector:relay');
  now.value += 60_000;
  const resumed = await scheduler.admit(request({ queueKey: 'queue:crossed-rate' }), 'collector:relay');
  assert.equal(store.state.queueItems.find((item) => item.queueItemId === resumed.queueItemId).queueKey, 'queue:crossed-rate:provider-rate-limit-retry:1');
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
});

function makeScheduler(store, now, overrides = {}) {
  return new CentralSubmissionScheduler({ stateStore: store, chats: parseChatDirectory([chat()]), minIntervalMs: 60_000, now: () => now.value, ...overrides });
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
    requestId: 'r-1', queueKey: 'queue:r-1', sendPath: 'CAPABILITY', hostAlias: 'primary', hostRole: 'PRIMARY', deploymentEpoch: 1,
    leaseId: 'lease-primary-1', supervisorId: 'spec', registrationId: 'registration:spec:test', targetId: 'owned-target-test',
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

class LockingMemoryStore extends MemoryStore {
  constructor(state) { super(state); this.locked = false; }
  async acquireLock() { if (this.locked) throw new Error('already locked'); this.locked = true; }
  async releaseLock() { this.locked = false; }
}
