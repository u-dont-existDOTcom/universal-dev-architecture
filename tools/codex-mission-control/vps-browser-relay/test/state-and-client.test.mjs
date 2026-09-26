import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MissionControlClient } from '../src/mission-control.mjs';
import { StateStore } from '../src/state.mjs';
import { loadCodexExecCandidateConfig, loadConfig, publicConfig } from '../src/config.mjs';
import {
  HELPER_DEFAULT_LIFETIME_MS,
  ONE_SHOT_LOCK_CEILING_MS,
  ONE_SHOT_LOCK_MARGIN_MS,
  oneShotLockLifetimeMs,
  relayCommandLockOptions,
} from '../src/relay-lock.mjs';
import { SubmissionSchedulerClient } from '../src/submission-scheduler-client.mjs';
import { buildRelayHealthReport, observeRelayHealth } from '../src/health-report.mjs';

test('state store is atomic, owner-only, and rejects a concurrent relay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-relay-state-'));
  try {
    const paths = {
      stateFile: join(root, 'state.json'),
      statusFile: join(root, 'status.json'),
      lockFile: join(root, 'relay.lock'),
    };
    const first = new StateStore(paths);
    const second = new StateStore(paths);
    await first.acquireLock();
    await assert.rejects(() => second.acquireLock(), /Another relay process/);
    const state = await first.read();
    state.deliveries['request:r-1'] = { status: 'SUBMITTED_CONFIRMED', bodySha256: 'a'.repeat(64) };
    state.controllerCycles['cycle:r-1'] = { cycleId: 'cycle:r-1', step: 'WAIT_PM_ARTIFACT' };
    state.submissionPacing.lastSubmissionAt = '2026-09-02T12:00:00.000Z';
    await first.write(state);
    const staleWriter = { ...state, submissionPacing: { lastSubmissionAt: null } };
    await first.write(staleWriter);
    assert.equal((await first.read()).submissionPacing.lastSubmissionAt, '2026-09-02T12:00:00.000Z');
    const raw = await readFile(paths.stateFile, 'utf8');
    assert.match(raw, /SUBMITTED_CONFIRMED/);
    assert.match(raw, /WAIT_PM_ARTIFACT/);
    assert.doesNotMatch(raw, /MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1/);
    await first.releaseLock();
    await second.acquireLock();
    await second.releaseLock();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stale lock is recovered without deleting a live lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-relay-lock-'));
  try {
    const paths = {
      stateFile: join(root, 'state.json'),
      statusFile: join(root, 'status.json'),
      lockFile: join(root, 'relay.lock'),
    };
    await writeFile(paths.lockFile, JSON.stringify({ pid: 99999999 }));
    const store = new StateStore(paths);
    await store.acquireLock();
    await store.releaseLock();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('health report CLI does not contend with the long-running relay singleton lock', async () => {
  const cli = await readFile(new URL('../bin/mc-chatgpt-relay.mjs', import.meta.url), 'utf8');
  assert.match(cli, /const exclusiveLockRequired = command !== 'health-report'/);
  assert.match(cli, /if \(exclusiveLockRequired\) \{\n(?:    \/\/.*\n)*    await stateStore\.acquireLock\(relayCommandLockOptions\(command, \{ config, codexExecutionConfig \}\)\);/);
  assert.match(cli, /doctor: \(\) => runtime\.doctor\(\{ readOnly: true \}\)/);
  // Release runs in `finally`; it is a no-op for a store that never acquired ownership.
  assert.match(cli, /\} finally \{\n  try \{\n    await stateStore\?\.releaseLock\(\);/);
});

test('CLI errors release ownership; lock-status diagnoses a live owner without acquiring or sending', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-relay-cli-lock-'));
  const paths = { stateFile: join(root, 'state.json'), statusFile: join(root, 'status.json'), lockFile: join(root, 'relay.lock') };
  const store = new StateStore(paths);
  try {
    const chatsFile = join(root, 'chats.json');
    await writeFile(chatsFile, JSON.stringify([configuredChat()]));
    const env = { ...configEnv(chatsFile), MC_RELAY_STATE_DIR: root };
    const cli = fileURLToPath(new URL('../bin/mc-chatgpt-relay.mjs', import.meta.url));
    const failed = spawnSync(process.execPath, [cli, 'controller-init'], { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /Usage.*controller-init/);
    assert.equal(store.lockStatus().status, 'FREE');
    await store.acquireLock({ taskId: 'test:cli-diagnostic' });
    const diagnostic = spawnSync(process.execPath, [cli, 'lock-status'], { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(diagnostic.status, 0);
    const status = JSON.parse(diagnostic.stdout);
    assert.equal(status.relayLock.status, 'HELD');
    assert.equal(status.relayLock.owner.taskId, 'test:cli-diagnostic');
  } finally {
    await store.releaseLock();
    await rm(root, { recursive: true, force: true });
  }
});

test('one-shot lock lifetime derives from the configured operation ceilings it guards', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-relay-lock-budget-'));
  try {
    const chatsFile = join(root, 'chats.json');
    await writeFile(chatsFile, JSON.stringify([configuredChat()]));
    const base = configEnv(chatsFile);
    const defaults = await loadConfig(base);
    const codexOff = loadCodexExecCandidateConfig({});
    const codexOn = loadCodexExecCandidateConfig({ MC_CODEX_EXEC_PREVIEW_ENABLED: '1' });
    // Defaults: (3 nudges + 1) x (90 s page ready + 30 s submit + 15 min generation) + 10 min margin.
    const browserTurn = 4 * (90_000 + 30_000 + 900_000);
    assert.equal(ONE_SHOT_LOCK_MARGIN_MS, 600_000);
    assert.deepEqual(relayCommandLockOptions('once-exact', { config: defaults, codexExecutionConfig: codexOn, env: {} }),
      { taskId: 'relay:once-exact', persistent: false, maxLifetimeMs: browserTurn + 600_000 });
    assert.equal(relayCommandLockOptions('once', { config: defaults, codexExecutionConfig: codexOff, env: {} }).maxLifetimeMs, browserTurn + 600_000);
    // `once` runs Codex only when that route is enabled; then its ceiling is budgeted too.
    assert.equal(relayCommandLockOptions('once', { config: defaults, codexExecutionConfig: codexOn, env: {} }).maxLifetimeMs, 900_000 + browserTurn + 600_000);
    for (const command of ['controller-once', 'provision', 'mcp-preflight', 'capabilities']) {
      assert.equal(relayCommandLockOptions(command, { config: defaults, codexExecutionConfig: codexOn, env: {} }).maxLifetimeMs, browserTurn + 600_000);
    }

    // The review case: 60-minute Codex execution and 60-minute generation ceilings.
    const long = await loadConfig({ ...base, MC_RELAY_GENERATION_TIMEOUT_MS: '3600000' });
    const longCodex = loadCodexExecCandidateConfig({ MC_CODEX_EXEC_PREVIEW_ENABLED: '1', MC_CODEX_EXEC_MAX_TIMEOUT_MS: '3600000' });
    const longOnce = relayCommandLockOptions('once', { config: long, codexExecutionConfig: longCodex, env: {} }).maxLifetimeMs;
    assert.equal(longOnce, 3_600_000 + 4 * (90_000 + 30_000 + 3_600_000) + 600_000);
    assert.ok(longOnce > HELPER_DEFAULT_LIFETIME_MS);
    assert.ok(longOnce > 3_600_000 + 3_600_000 * (long.runtime.stuckRecoveryMaxNudges + 1));

    // Every timeout at its configured maximum with the default nudge cap still fits under the ceiling.
    const maximal = await loadConfig({
      ...base, MC_RELAY_GENERATION_TIMEOUT_MS: '3600000', MC_RELAY_PAGE_READY_TIMEOUT_MS: '300000', MC_RELAY_SUBMIT_TIMEOUT_MS: '120000',
    });
    const maximalOnce = relayCommandLockOptions('once', { config: maximal, codexExecutionConfig: longCodex, env: {} }).maxLifetimeMs;
    assert.equal(maximalOnce, 3_600_000 + 4 * (300_000 + 120_000 + 3_600_000) + 600_000);
    assert.ok(maximalOnce < ONE_SHOT_LOCK_CEILING_MS);
    // A larger nudge cap clamps at the ceiling instead of becoming effectively unbounded.
    const manyNudges = await loadConfig({ ...base, MC_RELAY_GENERATION_TIMEOUT_MS: '3600000', MC_RELAY_STUCK_RECOVERY_MAX_NUDGES: '20' });
    assert.equal(relayCommandLockOptions('once', { config: manyNudges, codexExecutionConfig: longCodex, env: {} }).maxLifetimeMs, ONE_SHOT_LOCK_CEILING_MS);
    assert.equal(ONE_SHOT_LOCK_CEILING_MS, 6 * 60 * 60_000);

    // MC_RELAY_LOCK_MAX_MS stays an explicit override in either direction, within 1..86400000.
    assert.equal(oneShotLockLifetimeMs({ browser: long.browser, runtime: long.runtime, codexExecMaxTimeoutMs: 3_600_000, env: { MC_RELAY_LOCK_MAX_MS: '120000' } }), 120_000);
    assert.equal(relayCommandLockOptions('once', { config: manyNudges, codexExecutionConfig: longCodex, env: { MC_RELAY_LOCK_MAX_MS: '43200000' } }).maxLifetimeMs, 43_200_000);
    for (const invalid of ['0', '86400001', '1.5', 'thirty-minutes']) {
      assert.throws(() => relayCommandLockOptions('once', { config: defaults, codexExecutionConfig: codexOff, env: { MC_RELAY_LOCK_MAX_MS: invalid } }), /MC_RELAY_LOCK_MAX_MS must be an integer from 1 to 86400000/);
    }
    // Service loops stay persistent and never depend on the one-shot override.
    for (const command of ['run', 'controller-run']) {
      assert.deepEqual(relayCommandLockOptions(command, { config: defaults, codexExecutionConfig: codexOn, env: { MC_RELAY_LOCK_MAX_MS: 'invalid' } }), { taskId: `relay:${command}`, persistent: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI once holds a derived lifetime covering 60-minute operations, honors the override, and exits 143 on SIGTERM', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-relay-cli-lifetime-'));
  const paths = { stateFile: join(root, 'state.json'), statusFile: join(root, 'status.json'), lockFile: join(root, 'relay.lock') };
  const store = new StateStore(paths);
  // A loopback Mission Control that never answers keeps `once` inside its guarded cycle.
  let arrived = null;
  const hung = [];
  const server = createServer((request) => { hung.push(request); arrived?.(); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const cli = fileURLToPath(new URL('../bin/mc-chatgpt-relay.mjs', import.meta.url));
  try {
    const chatsFile = join(root, 'chats.json');
    await writeFile(chatsFile, JSON.stringify([configuredChat()]));
    const env = {
      ...configEnv(chatsFile),
      MC_RELAY_STATE_DIR: root,
      MC_RELAY_MISSION_CONTROL_URL: origin,
      MC_RELAY_HTTP_TIMEOUT_MS: '120000',
      MC_RELAY_GENERATION_TIMEOUT_MS: '3600000',
      MC_CODEX_EXEC_PREVIEW_ENABLED: '1',
      MC_CODEX_EXEC_MAX_TIMEOUT_MS: '3600000',
      MC_CODEX_EXEC_WORKER_ID: 'worker-a',
      MC_CODEX_EXEC_WORKER_TOKEN: 'w'.repeat(32),
      MC_CODEX_EXEC_MISSION_CONTROL_URL: origin,
    };
    const runOnce = async (extraEnv) => {
      const reached = new Promise((resolve) => { arrived = resolve; });
      const child = spawn(process.execPath, [cli, 'once'], { env: { ...env, ...extraEnv }, stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (data) => { stderr += data; });
      const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
      await Promise.race([reached, exited.then(() => { throw new Error(`CLI exited before its guarded request: ${stderr}`); })]);
      const status = store.lockStatus();
      child.kill('SIGTERM');
      return { status, exit: await exited };
    };

    const derived = await runOnce({});
    assert.equal(derived.status.status, 'HELD');
    assert.equal(derived.status.owner.taskId, 'relay:once');
    assert.equal(derived.status.owner.mode, 'BOUNDED_HELPER');
    const lifetime = Date.parse(derived.status.owner.deadlineAt) - Date.parse(derived.status.owner.acquiredAt);
    const expected = 3_600_000 + 4 * (90_000 + 30_000 + 3_600_000) + 600_000;
    assert.ok(Math.abs(lifetime - expected) < 1_000, `lifetime ${lifetime} != ${expected}`);
    // The watchdog cannot fire before a 60-minute Codex run plus a 60-minute generation wait.
    assert.ok(lifetime > 2 * 3_600_000);
    // Graceful service stop: the lifecycle handler exits 143 (SuccessExitStatus=143) and releases ownership.
    assert.deepEqual(derived.exit, { code: 143, signal: null });
    assert.equal(store.lockStatus().status, 'FREE');

    const overridden = await runOnce({ MC_RELAY_LOCK_MAX_MS: '120000' });
    const overrideLifetime = Date.parse(overridden.status.owner.deadlineAt) - Date.parse(overridden.status.owner.acquiredAt);
    assert.ok(Math.abs(overrideLifetime - 120_000) < 1_000, `override lifetime ${overrideLifetime}`);
    assert.deepEqual(overridden.exit, { code: 143, signal: null });
    assert.equal(store.lockStatus().status, 'FREE');
  } finally {
    for (const request of hung) request.socket.destroy();
    server.close();
    await store.releaseLock();
    await rm(root, { recursive: true, force: true });
  }
});

test('Mission Control client reads only explicitly scoped worker snapshots', async () => {
  const requests = [];
  const client = new MissionControlClient({
    url: 'https://mission-control.example',
    producerId: 'system:chatgpt-relay-reader',
    token: 'x'.repeat(32),
    workerIds: ['worker-a', 'worker-a', 'worker-b'],
    fetchImpl: async (url, options) => {
      const requestBody = JSON.parse(options.body);
      requests.push({ url, options, requestBody });
      const worker = requestBody.params.arguments.worker;
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: requestBody.id,
        result: {
          structuredContent: worker === 'worker-a'
            ? { worker: { id: worker, timeline: [] }, generatedAt: '2026-09-03T00:00:00.000Z' }
            : { id: worker, timeline: [] },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const snapshot = await client.fetchFleet();
  assert.deepEqual(snapshot.workers.map((worker) => worker.id), ['worker-a', 'worker-b']);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://mission-control.example/api/mcp');
  assert.equal(requests[0].options.headers.authorization, `Bearer ${'x'.repeat(32)}`);
  assert.equal(requests[0].requestBody.params.name, 'mission_control_get_worker_transport');
  assert.equal(requests[0].requestBody.params.arguments.worker, 'worker-a');
});

test('Mission Control client fails closed on an unscoped or mismatched worker response', async () => {
  const client = new MissionControlClient({
    url: 'https://mission-control.example',
    producerId: 'system:chatgpt-relay-reader',
    token: 'x'.repeat(32),
    fetchImpl: async () => new Response(JSON.stringify({
      result: { structuredContent: { worker: { id: 'different-worker', timeline: [] } } },
    }), { status: 200 }),
  });
  await assert.rejects(() => client.fetchWorkers(['worker-a']), /invalid scoped worker snapshot/);
  await assert.rejects(() => client.fetchWorkers([]), /At least one scoped/);
});

test('Mission Control client uses authenticated worker admission, preflight, and lifecycle routes', async () => {
  const requests = [];
  const token = 'w'.repeat(32);
  const producerId = 'worker:worker-a';
  const responses = [
    { status: 409, body: { admitted: false, mayExecute: false, reason: 'EXECUTION_NOT_AUTHORIZED' } },
    { status: 200, body: { allowed: true, preflightId: 'preflight:worker-a:1' } },
    { status: 200, body: { events: [{ eventId: 'codex-start:1' }, { eventId: 'codex-receipt:1' }] } },
  ];
  const client = new MissionControlClient({
    url: 'https://mission-control.example',
    producerId,
    token,
    workerIds: ['worker-a'],
    fetchImpl: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      const response = responses.shift();
      return Response.json(response.body, { status: response.status });
    },
  });

  const admission = await client.requestExecutionAdmission('worker-a', { request: { requestId: 'admission:1' } });
  assert.equal(admission.mayExecute, false);
  const preflight = await client.requestWorkExecutionPreflight('worker-a', { profileAuthorizationId: 'authorization:1' });
  assert.equal(preflight.allowed, true);
  const lifecycle = [{ schema_version: 2, event_id: 'codex-start:1' }, { schema_version: 2, event_id: 'codex-receipt:1' }];
  await client.recordWorkerEvents('worker-a', lifecycle);

  assert.deepEqual(requests.map((request) => request.url), [
    'https://mission-control.example/api/worker-channel/worker-a/admission',
    'https://mission-control.example/api/worker-channel/worker-a/preflight',
    'https://mission-control.example/api/worker-channel/worker-a/events',
  ]);
  for (const request of requests) {
    assert.equal(request.options.headers.authorization, `Bearer ${token}`);
    assert.equal(request.options.headers['x-mission-control-producer-id'], producerId);
  }
  assert.deepEqual(requests[2].body, { events: lifecycle });
});

test('submission interval config defaults to 60000 and exposes the public value', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-relay-config-'));
  try {
    const chatsFile = join(root, 'chats.json');
    await writeFile(chatsFile, JSON.stringify([configuredChat()]));
    const config = await loadConfig(configEnv(chatsFile));
    assert.equal(config.runtime.minSubmissionIntervalMs, 60_000);
    assert.equal(publicConfig(config).minSubmissionIntervalMs, 60_000);
    assert.equal(config.browser.generationTimeoutMs, 900_000);
    assert.equal(config.browser.progressStallMs, 120_000);
    assert.equal(publicConfig(config).progressStallMs, 120_000);
    assert.equal(config.submissionScheduler.url, 'https://mission-control.example/api/submission-authority');
    assert.equal(publicConfig(config).submissionAuthorityUrl, 'https://mission-control.example/api/submission-authority');
    assert.equal(publicConfig(config).submissionHost.role, 'PRIMARY');
    assert.equal(Object.hasOwn(publicConfig(config).submissionHost, 'leaseId'), false);
    assert.doesNotMatch(JSON.stringify(publicConfig(config)), /aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
    await assert.rejects(() => loadConfig({
      ...configEnv(chatsFile),
      MC_RELAY_TARGET_BINDING_ATTESTOR_KEY: 'x'.repeat(32),
    }), /must differ from MC_RELAY_TOKEN/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('progress-stall interval is independently bounded below the unchanged hard generation ceiling', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-relay-progress-stall-config-'));
  try {
    const chatsFile = join(root, 'chats.json');
    await writeFile(chatsFile, JSON.stringify([configuredChat()]));
    assert.equal((await loadConfig({
      ...configEnv(chatsFile), MC_RELAY_PROGRESS_STALL_MS: '30000',
    })).browser.progressStallMs, 30_000);
    assert.equal((await loadConfig({
      ...configEnv(chatsFile), MC_RELAY_PROGRESS_STALL_MS: '900000',
    })).browser.progressStallMs, 900_000);
    await assert.rejects(() => loadConfig({
      ...configEnv(chatsFile), MC_RELAY_PROGRESS_STALL_MS: '29999',
    }), /30000-900000/);
    await assert.rejects(() => loadConfig({
      ...configEnv(chatsFile), MC_RELAY_PROGRESS_STALL_MS: '900001',
    }), /30000-900000/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ChatGPT account email is private config and never exposed publicly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-relay-email-config-'));
  try {
    const chatsFile = join(root, 'chats.json');
    await writeFile(chatsFile, JSON.stringify([configuredChat()]));
    const address = 'owner-login@example.test';
    const config = await loadConfig({ ...configEnv(chatsFile), MC_RELAY_CHATGPT_ACCOUNT_EMAIL: address });
    assert.equal(config.browser.accountEmail, address);
    assert.doesNotMatch(JSON.stringify(publicConfig(config)), /owner-login@example\.test/);
    await assert.rejects(() => loadConfig({ ...configEnv(chatsFile), MC_RELAY_CHATGPT_ACCOUNT_EMAIL: 'not-an-email' }), /plausible email address/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('relay config requires deployment identity and rejects a separate host-local authority', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-relay-legacy-config-'));
  try {
    const chatsFile = join(root, 'chats.json');
    await writeFile(chatsFile, JSON.stringify([configuredChat()]));
    const complete = configEnv(chatsFile);
    for (const field of ['MC_RELAY_HOST_ALIAS', 'MC_RELAY_HOST_ROLE', 'MC_RELAY_DEPLOYMENT_EPOCH', 'MC_RELAY_DEPLOYMENT_LEASE_ID']) {
      const candidate = { ...complete };
      delete candidate[field];
      await assert.rejects(() => loadConfig(candidate), new RegExp(field));
    }
    await assert.rejects(() => loadConfig({
      ...complete,
      MC_RELAY_SUBMISSION_AUTHORITY_URL: 'http://127.0.0.1:4300',
    }), /configured Mission Control origin/);
    await assert.rejects(() => loadConfig({
      ...complete,
      MC_RELAY_MISSION_CONTROL_URL: 'http://mission-control.example',
      MC_RELAY_SUBMISSION_AUTHORITY_URL: 'http://mission-control.example/api/submission-authority',
    }), /must use HTTPS/);
    const tunnel = await loadConfig({
      ...complete,
      MC_RELAY_MISSION_CONTROL_URL: 'http://127.0.0.1:3000',
      MC_RELAY_SUBMISSION_AUTHORITY_URL: 'http://127.0.0.1:3000/api/submission-authority',
    });
    assert.equal(tunnel.missionControl.url, 'http://127.0.0.1:3000');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('relay fails closed when the Mission Control submission authority is unreachable', async () => {
  const client = new SubmissionSchedulerClient({
    url: 'http://127.0.0.1:4300', token: 's'.repeat(32), producerId: 'collector:test-relay',
    attestorKey: 'a'.repeat(32), pacingDomain: 'account:test',
    fetchImpl: async () => { throw new Error('unreachable'); },
  });
  await assert.rejects(client.admit({}), (error) => error.code === 'CENTRAL_SCHEDULER_UNREACHABLE');
});

test('relay health reports use the authenticated authority route and expose no target identity', async () => {
  const requests = [];
  const client = new SubmissionSchedulerClient({
    url: 'https://mission-control.example/api/submission-authority',
    token: 's'.repeat(32),
    producerId: 'collector:test-relay',
    attestorKey: 'a'.repeat(32),
    pacingDomain: 'account:test',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return Response.json({ accepted: true, expiresAt: '2026-09-12T12:02:00.000Z' });
    },
  });
  const config = {
    runtime: { submissionHost: { alias: 'primary-test', role: 'PRIMARY', deploymentEpoch: 3 } },
  };
  const doctor = {
    status: 'READY',
    checkedAt: '2026-09-12T12:00:00.000Z',
    centralScheduler: {
      authenticatedRelayBinding: {
        automationWindowId: 101,
        ownedTargetCount: 1,
        ownedTargetIdsSha256: 'a'.repeat(64),
      },
    },
    browser: {
      webSocketDebuggerUrlPresent: true,
      automationWindowOwnershipEnforced: true,
      automationWindowId: 101,
      automationOwnedTabCount: 1,
      automationOwnedTargetIdsSha256: 'a'.repeat(64),
    },
  };
  const report = buildRelayHealthReport(config, doctor);
  assert.equal(report.relayWorkerState, 'HEALTHY');
  assert.equal(report.browserState, 'HEALTHY');
  assert.equal(report.authorityBindingState, 'BOUND');
  assert.doesNotMatch(JSON.stringify(report), /targetId|ownedTargetIdsSha256|automationWindowId/);

  await client.reportHealth(report);
  assert.equal(requests[0].url, 'https://mission-control.example/api/submission-authority/relay-health');
  assert.equal(requests[0].options.headers.authorization, `Bearer ${'s'.repeat(32)}`);
  assert.deepEqual(JSON.parse(requests[0].options.body), report);
});

test('health observation reports a stopped or fenced browser without starting it', async () => {
  const calls = [];
  const snapshot = await observeRelayHealth({
    doctor: async () => {
      calls.push('doctor');
      throw new Error('Chrome DevTools endpoint is unavailable.');
    },
    browserDoctor: async () => {
      calls.push('browser-doctor');
      throw new Error('connect ECONNREFUSED 127.0.0.1:9222');
    },
    schedulerStatus: async () => {
      calls.push('scheduler-status');
      return {
        authority: 'MISSION_CONTROL_SINGLE_WRITER',
        authenticatedRelayBinding: null,
        ledger: { valid: true, errors: [] },
      };
    },
    now: () => new Date('2026-09-17T12:00:00.000Z'),
  });

  assert.deepEqual(calls, ['doctor', 'browser-doctor', 'scheduler-status']);
  assert.equal(snapshot.status, 'HOST_BROWSER_UNAVAILABLE');
  assert.equal(snapshot.browser.webSocketDebuggerUrlPresent, false);
  const report = buildRelayHealthReport({
    runtime: { submissionHost: { alias: 'outgoing', role: 'PRIMARY', deploymentEpoch: 3 } },
  }, snapshot);
  assert.equal(report.browserState, 'UNAVAILABLE');
  assert.equal(report.relayWorkerState, 'DEGRADED');
  assert.equal(report.detail, 'HOST_BROWSER_UNAVAILABLE');
});

test('submission interval config accepts only 60000 through 600000', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-relay-config-range-'));
  try {
    const chatsFile = join(root, 'chats.json');
    await writeFile(chatsFile, JSON.stringify([configuredChat()]));
    assert.equal((await loadConfig({ ...configEnv(chatsFile), MC_RELAY_MIN_SUBMISSION_INTERVAL_MS: '60000' })).runtime.minSubmissionIntervalMs, 60_000);
    assert.equal((await loadConfig({ ...configEnv(chatsFile), MC_RELAY_MIN_SUBMISSION_INTERVAL_MS: '600000' })).runtime.minSubmissionIntervalMs, 600_000);
    await assert.rejects(() => loadConfig({ ...configEnv(chatsFile), MC_RELAY_MIN_SUBMISSION_INTERVAL_MS: '59999' }), /60000-600000/);
    await assert.rejects(() => loadConfig({ ...configEnv(chatsFile), MC_RELAY_MIN_SUBMISSION_INTERVAL_MS: '600001' }), /60000-600000/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function configEnv(chatsFile) {
  return {
    MC_RELAY_CHATS_FILE: chatsFile,
    MC_RELAY_PROVISIONS_FILE: join(dirname(chatsFile), 'provisions.json'),
    MC_RELAY_MISSION_CONTROL_URL: 'https://mission-control.example',
    MC_RELAY_PRODUCER_ID: 'collector:test-relay',
    MC_RELAY_TOKEN: 'x'.repeat(32),
    MC_RELAY_TARGET_BINDING_ATTESTOR_KEY: 'a'.repeat(32),
    MC_RELAY_SUBMISSION_PACING_DOMAIN: 'account:test',
    MC_RELAY_HOST_ALIAS: 'primary-test',
    MC_RELAY_HOST_ROLE: 'PRIMARY',
    MC_RELAY_DEPLOYMENT_EPOCH: '1',
    MC_RELAY_DEPLOYMENT_LEASE_ID: 'lease-test-1',
  };
}

function configuredChat() {
  return {
    scope: 'SPECIALIST',
    supervisorId: 'spec',
    label: 'Specialist',
    workerId: 'worker-a',
    registrationId: 'registration:spec:test', ownership: 'MISSION_CONTROL_ONLY', purpose: 'Dedicated test supervisor.',
    accountAlias: 'account:test', workspaceAlias: 'workspace:test', privateLocatorRef: 'private-config:supervisors/spec',
    registrationProvenance: { registeredBy: 'OWNER', registeredAt: '2026-09-10T12:00:00.000Z', sourceRef: 'owner-requirement:test' },
    bootstrapCapability: { chatId: 'spec-bootstrap', url: 'https://chatgpt.com/c/spec-chat', challengeId: 'challenge-spec' },
    consumerControls: { modelVisibleLabel: 'GPT-5.6 Sol', thinkingControlLabel: 'Thinking effort', thinkingVisibleLabel: 'Extra High', thinkingOrdinal: '4 of 5', accountPlanLabel: 'Pro', accountPlanRole: 'PROVENANCE_METADATA_ONLY', accountPlanIsReasoningMode: false },
    requiredApps: { missionControl: 'Mission Control', github: 'GitHub' },
  };
}
