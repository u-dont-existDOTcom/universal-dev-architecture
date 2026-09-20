import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ControllerCycleWatchdog,
  activeControllerCycles,
} from '../src/controller-watchdog.mjs';

class MemoryStore {
  constructor(state) { this.state = structuredClone(state); }
  async read() { return structuredClone(this.state); }
}

function controllerCycle(cycleId, step = 'WAIT_ORIGIN_ARTIFACT') {
  return { cycleId, requestId: `request:${cycleId}`, step };
}

test('active controller cycles exclude terminal cycles and sort deterministically', () => {
  const state = {
    controllerCycles: {
      z: controllerCycle('z'),
      done: controllerCycle('done', 'COMPLETE'),
      a: controllerCycle('a'),
      expired: controllerCycle('expired', 'EXPIRED'),
    },
  };
  assert.deepEqual(activeControllerCycles(state).map((cycle) => cycle.cycleId), ['a', 'z']);
});
test('watchdog rotates active controller cycles instead of pinning one chat', async () => {
  const store = new MemoryStore({ controllerCycles: {
    b: controllerCycle('b'),
    a: controllerCycle('a'),
  } });
  const calls = [];
  const watchdog = new ControllerCycleWatchdog({
    stateStore: store,
    controller: { cycle: async (cycleId) => { calls.push(cycleId); return { status: `advanced:${cycleId}` }; } },
    logger: { error() {} },
  });

  assert.equal((await watchdog.tick()).cycleId, 'a');
  assert.equal((await watchdog.tick()).cycleId, 'b');
  assert.equal((await watchdog.tick()).cycleId, 'a');
  assert.deepEqual(calls, ['a', 'b', 'a']);
});

test('one controller failure does not kill the watchdog or starve the next cycle', async () => {
  const store = new MemoryStore({ controllerCycles: {
    a: controllerCycle('a'),
    b: controllerCycle('b'),
  } });
  const watchdog = new ControllerCycleWatchdog({
    stateStore: store,
    controller: { cycle: async (cycleId) => {
      if (cycleId === 'a') throw new Error('simulated controller failure');
      return { status: 'WAIT_PM_ARTIFACT' };
    } },
    logger: { error() {} },
  });

  const failed = await watchdog.tick();
  assert.equal(failed.status, 'CONTROLLER_WATCHDOG_CYCLE_FAILED');
  assert.equal(failed.cycleId, 'a');
  const recovered = await watchdog.tick();
  assert.equal(recovered.status, 'CONTROLLER_WATCHDOG_ADVANCED');
  assert.equal(recovered.cycleId, 'b');
});
test('watchdog stays silent when no controller cycle needs supervision', async () => {
  const store = new MemoryStore({ controllerCycles: {
    done: controllerCycle('done', 'COMPLETE'),
  } });
  const watchdog = new ControllerCycleWatchdog({
    stateStore: store,
    controller: { cycle: async () => { throw new Error('must not run'); } },
    logger: { error() {} },
  });
  assert.deepEqual(await watchdog.tick(), {
    status: 'NO_ACTIVE_CONTROLLER_CYCLES',
    activeCycleCount: 0,
    cycleId: null,
    result: null,
  });
});

test('the always-on relay run loop advances the controller watchdog before normal relay polling', async () => {
  const source = await readFile(new URL('../bin/mc-chatgpt-relay.mjs', import.meta.url), 'utf8');
  assert.match(source, /const controllerResult = await controllerWatchdog\.tick\(\);[\s\S]*const result = await runtime\.cycle\(\);/);
  assert.match(source, /command === 'run'/);
});
