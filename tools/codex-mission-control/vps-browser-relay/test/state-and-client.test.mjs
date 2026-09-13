import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MissionControlClient } from '../src/mission-control.mjs';
import { StateStore } from '../src/state.mjs';
import { loadConfig, publicConfig } from '../src/config.mjs';
import { SubmissionSchedulerClient } from '../src/submission-scheduler-client.mjs';
import { buildRelayHealthReport } from '../src/health-report.mjs';

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
  assert.equal(requests[0].requestBody.params.name, 'mission_control_get_worker');
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

test('submission interval config defaults to 60000 and exposes the public value', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-relay-config-'));
  try {
    const chatsFile = join(root, 'chats.json');
    await writeFile(chatsFile, JSON.stringify([configuredChat()]));
    const config = await loadConfig(configEnv(chatsFile));
    assert.equal(config.runtime.minSubmissionIntervalMs, 60_000);
    assert.equal(publicConfig(config).minSubmissionIntervalMs, 60_000);
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
