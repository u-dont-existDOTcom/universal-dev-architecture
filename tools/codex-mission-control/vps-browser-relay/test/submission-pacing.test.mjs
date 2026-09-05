import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultState } from '../src/core.mjs';
import { StateStore } from '../src/state.mjs';
import { GlobalSubmissionPacer, GLOBAL_SUBMISSION_COOLDOWN } from '../src/submission-pacing.mjs';

test('two routes cannot cross the global send gate inside the minimum interval', async () => {
  const store = new MemoryStateStore();
  const now = { value: Date.parse('2026-09-02T12:00:00.000Z') };
  const pacer = new GlobalSubmissionPacer({ stateStore: store, minIntervalMs: 60_000, now: () => now.value });
  const clicked = [];

  const results = await Promise.allSettled([
    pacer.submit({ submit: async () => { clicked.push('route-a'); return { generationStarted: true }; } }),
    pacer.submit({ submit: async () => { clicked.push('route-b'); return { generationStarted: true }; } }),
  ]);

  assert.deepEqual(clicked, ['route-a']);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.code, GLOBAL_SUBMISSION_COOLDOWN);
  assert.equal(results[1].reason.retryAfterMs, 60_000);
  assert.equal(store.state.submissionPacing.lastSubmissionAt, '2026-09-02T12:00:00.000Z');

  now.value += 60_000;
  await pacer.submit({ submit: async () => { clicked.push('route-b'); return { generationStarted: true }; } });
  assert.deepEqual(clicked, ['route-a', 'route-b']);
});

test('a cooldown rejection does not run pre-submit semantic state mutation', async () => {
  const state = defaultState('2026-09-02T12:00:00.000Z');
  state.deliveries['request:semantic'] = { status: 'EXTRA_HIGH_READER_COMPLETE', authority: 'UNCHANGED' };
  state.submissionPacing.lastSubmissionAt = '2026-09-02T12:00:00.000Z';
  const store = new MemoryStateStore(state);
  const pacer = new GlobalSubmissionPacer({ stateStore: store, minIntervalMs: 60_000, now: () => Date.parse('2026-09-02T12:00:30.000Z') });
  const before = structuredClone(store.state.deliveries);
  let clicked = false;

  await assert.rejects(
    pacer.submit({
      beforeSubmit: async () => { store.state.deliveries['request:semantic'].authority = 'MUTATED'; },
      submit: async () => { clicked = true; },
    }),
    (error) => error.code === GLOBAL_SUBMISSION_COOLDOWN && error.retryAfterMs === 30_000,
  );

  assert.equal(clicked, false);
  assert.deepEqual(store.state.deliveries, before);
});

test('persisted last-submission time survives a state-store and pacer restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-submission-pacing-'));
  try {
    const paths = { stateFile: join(root, 'state.json'), statusFile: join(root, 'status.json'), lockFile: join(root, 'relay.lock') };
    const now = { value: Date.parse('2026-09-02T12:00:00.000Z') };
    const firstStore = new StateStore(paths);
    const first = new GlobalSubmissionPacer({ stateStore: firstStore, minIntervalMs: 60_000, now: () => now.value });
    await first.submit({ submit: async () => ({ generationStarted: true }) });

    const restartedStore = new StateStore(paths);
    const restarted = new GlobalSubmissionPacer({ stateStore: restartedStore, minIntervalMs: 60_000, now: () => now.value + 1_000 });
    let clicked = false;
    await assert.rejects(
      restarted.submit({ submit: async () => { clicked = true; } }),
      (error) => error.code === GLOBAL_SUBMISSION_COOLDOWN && error.retryAfterMs === 59_000,
    );
    assert.equal(clicked, false);
    assert.equal((await restartedStore.read()).submissionPacing.lastSubmissionAt, '2026-09-02T12:00:00.000Z');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

class MemoryStateStore {
  constructor(initial = defaultState()) { this.state = structuredClone(initial); }
  async read() { return structuredClone(this.state); }
  async write(value) { this.state = structuredClone(value); return structuredClone(value); }
}
