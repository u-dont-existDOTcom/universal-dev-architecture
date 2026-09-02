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

test('Mission Control client uses the MCP fleet tool and returns structured content', async () => {
  let request;
  const client = new MissionControlClient({
    url: 'https://mission-control.example',
    producerId: 'supervisor:relay-reader',
    token: 'x'.repeat(32),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: 'x',
        result: { structuredContent: { workers: [], generatedAt: '2026-09-02T00:00:00Z' } },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const fleet = await client.fetchFleet();
  assert.deepEqual(fleet.workers, []);
  assert.equal(request.url, 'https://mission-control.example/api/mcp');
  assert.equal(request.options.headers.authorization, `Bearer ${'x'.repeat(32)}`);
  const body = JSON.parse(request.options.body);
  assert.equal(body.params.name, 'mission_control_get_fleet');
});

test('Mission Control client fails closed on malformed structured content', async () => {
  const client = new MissionControlClient({
    url: 'https://mission-control.example',
    producerId: 'supervisor:relay-reader',
    token: 'x'.repeat(32),
    fetchImpl: async () => new Response(JSON.stringify({ result: { structuredContent: {} } }), { status: 200 }),
  });
  await assert.rejects(() => client.fetchFleet(), /missing structured fleet/);
});
