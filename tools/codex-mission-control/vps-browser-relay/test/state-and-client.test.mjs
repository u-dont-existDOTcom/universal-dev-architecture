import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionControlClient } from '../src/mission-control.mjs';
import { StateStore } from '../src/state.mjs';

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
    await first.write(state);
    const raw = await readFile(paths.stateFile, 'utf8');
    assert.match(raw, /SUBMITTED_CONFIRMED/);
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
        result: { structuredContent: { id: worker, timeline: [] } },
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
      result: { structuredContent: { id: 'different-worker', timeline: [] } },
    }), { status: 200 }),
  });
  await assert.rejects(() => client.fetchWorkers(['worker-a']), /invalid scoped worker snapshot/);
  await assert.rejects(() => client.fetchWorkers([]), /At least one scoped/);
});
