import assert from "node:assert/strict";
import test from "node:test";
import { FleetSupervisorLoop, fleetSupervisorSlowTickMs, fleetSupervisorStallMs } from "../lib/fleet-supervisor-loop";
import { FleetSupervisorRuntime } from "../lib/fleet-supervisor";
import { daemonReadiness } from "../lib/daemon-health";
import { boundedJevShadowHook } from "../lib/jev-shadow-hook";
import type { JevShadowObservation } from "../lib/jev-shadow";
import { EventStore, type FleetSupervisorWatchRecord } from "../lib/store";
import { seedStore } from "../lib/seed";

const observed: JevShadowObservation = { status: "OK", authoritative: false, model: "typesafe/jev-1.13", deterministic_trigger: "PROJECT_INTEGRITY_FAILURE" };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
};
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

function runtimeStore(watches = 1) {
  let commits = 0, reads = 0;
  const store = {
    dueFleetSupervisorWatches: () => Array.from({ length: watches }, (_, i) => ({
      projectId: `project:fixture-${i}`, taskId: "task:fixture", worker: "fixture", nextTickAt: "1970-01-01T00:00:00.000Z",
      notificationFingerprint: null,
    } as FleetSupervisorWatchRecord)),
    workerEvents: () => { reads += 1; return []; },
    verifyChain: () => ({ valid: false, errors: ["invalid fixture chain"] }),
    completeFleetSupervisorTick: () => { commits += 1; return true; },
  } as unknown as EventStore;
  return { store, commits: () => commits, reads: () => reads };
}

for (const laterOutcome of ["throws", "stalls", "completes"] as const) {
  test(`each completed watch is logged and stored before a later watch ${laterOutcome}`, async () => {
    const store = new EventStore(":memory:"), later = deferred<JevShadowObservation>();
    store.verifyChain = () => ({ valid: false, errors: ["fixture integrity failure"] });
    let now = Date.parse("2026-10-03T01:00:00.000Z");
    const logged: string[] = [], errors: unknown[] = [];
    for (const projectId of ["project:first", "project:second"]) {
      store.ensureFleetSupervisorWatch(projectId, "task:fixture", "fixture", "2026-10-03T00:00:00.000Z");
    }
    const runtime = new FleetSupervisorRuntime(store, {
      notifyOwner: (watch) => {
        if (watch.projectId === "project:second" && laterOutcome === "throws") throw new Error("later watch failure");
      },
      observeJevShadow: (watch) => watch.projectId === "project:first" ? observed : later.promise,
    });
    const loop = new FleetSupervisorLoop(runtime, {
      now: () => now, pollMs: 1000, stallMs: 5000,
      onResults: (results) => {
        for (const item of results) {
          if (item.jevShadow && item.jevShadow.status !== "DISABLED") {
            logged.push(item.projectId);
            store.recordJevShadowObservation({ source: "LIVE", projectId: item.projectId, observation: item.jevShadow });
          }
        }
      },
      onFailure: (error) => errors.push(error),
    });
    try {
      loop.advance(); await flush();
      assert.equal(store.fleetSupervisorTicks("project:first").length, 1);
      assert.ok(Date.parse(store.fleetSupervisorWatch("project:first")!.nextTickAt!) > now);
      assert.deepEqual(logged, ["project:first"]);
      assert.equal(store.jevShadowSummary().counts.bySource.LIVE, 1);
      if (laterOutcome === "throws") {
        assert.equal(loop.status().consecutiveFailures, 1);
        assert.equal(loop.status().lastErrorMessage, "later watch failure");
        assert.equal(errors.length, 1);
      } else {
        assert.equal(loop.status().lastTickCompletedAt, null);
        if (laterOutcome === "stalls") {
          now += 6001; loop.advance(); await flush();
          assert.equal(loop.status().stalledTickCount, 1);
        }
        later.resolve(observed); await flush();
        const expected = laterOutcome === "stalls" ? ["project:first"] : ["project:first", "project:second"];
        assert.deepEqual(logged, expected);
        assert.equal(store.jevShadowSummary().counts.bySource.LIVE, expected.length);
        assert.equal(loop.status().lastTickCompletedAt, new Date(now).toISOString());
        assert.deepEqual(errors, []);
      }
    } finally { loop.stop(); later.resolve(observed); await flush(); store.close(); }
  });
}

test("completed tick status and health expose each watch's stages, slowest stage and total duration", async () => {
  let now = 0;
  const fixture = runtimeStore(2), jev = deferred<JevShadowObservation>();
  const read = fixture.store.workerEvents.bind(fixture.store);
  fixture.store.workerEvents = (worker) => { now += 6000; return read(worker); };
  fixture.store.verifyChain = () => { now += 20; return { valid: false, errors: ["PRIVATE_EVENT_CONTENT"] }; };
  fixture.store.completeFleetSupervisorTick = () => { now += 30; return true; };
  let jevCalls = 0;
  const runtime = new FleetSupervisorRuntime(fixture.store, {
    notifyOwner: () => { now += 40; },
    observeJevShadow: () => ++jevCalls === 1 ? jev.promise : observed,
  }, () => now);
  const loop = new FleetSupervisorLoop(runtime, { now: () => now });
  loop.advance(); await flush();
  assert.equal(loop.status().lastTickDurationMs, null);
  assert.deepEqual(loop.status().lastTickWatchTimings, []);
  now += 200; jev.resolve(observed); await flush();
  const status = loop.status();
  assert.equal(status.lastTickDurationMs, 12380);
  assert.deepEqual(status.lastTickWatchTimings, [0, 1].map((i) => ({ projectId: `project:fixture-${i}`,
    stageMs: { reading_worker_events: 6000, verifying_chain: 20, classifying: 0, routing_reasoning: 0,
      notifying: 40, committing: 30, calling_jev: i === 0 ? 200 : 0 },
    synchronousMs: 6090, slowestStage: "reading_worker_events" })));
  const readiness = await daemonReadiness({ latestSequence: () => 1, verifyChain: () => ({ valid: true, errors: [] }) }, {
    health: async () => ({ configured: false, schedulerState: "UNCONFIGURED", ledger: { valid: true } }),
  }, status);
  assert.equal(readiness.fleetSupervisorLoop?.lastTickDurationMs, 12380);
  assert.deepEqual(readiness.fleetSupervisorLoop?.lastTickWatchTimings, status.lastTickWatchTimings);
  // An unfinished replacement does not overwrite the last completed tick's timing.
  fixture.store.workerEvents = () => { throw new Error("fixture failure"); };
  loop.advance(); await flush();
  assert.deepEqual(loop.status().lastTickWatchTimings, status.lastTickWatchTimings);
  assert.equal(loop.status().lastTickDurationMs, 12380);
  loop.stop();
});

test("slow synchronous ticks log one structured line per ten minutes without event content", async () => {
  let now = 0;
  const fixture = runtimeStore(2), lines: unknown[] = [];
  fixture.store.workerEvents = () => { now += 3000; return []; };
  fixture.store.verifyChain = () => ({ valid: false, errors: ["PRIVATE_EVENT_CONTENT"] });
  const runtime = new FleetSupervisorRuntime(fixture.store, {}, () => now);
  const loop = new FleetSupervisorLoop(runtime, { now: () => now, onSlowTick: (line) => lines.push(line) });
  loop.advance(); await flush();
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0], { event: "fleet_supervisor_tick_slow", tick_started_at: "1970-01-01T00:00:00.000Z",
    duration_ms: 6000, synchronous_ms: 6000, project_id: "project:fixture-0", watch_timings: loop.status().lastTickWatchTimings });
  assert.doesNotMatch(JSON.stringify(lines), /PRIVATE_EVENT_CONTENT|invalid fixture chain/);
  now = 60000; loop.advance(); await flush(); assert.equal(lines.length, 1);
  now = 600000; loop.advance(); await flush(); assert.equal(lines.length, 2);
  loop.stop();
});

test("an asynchronous Jev wait alone does not trigger a synchronous slow-tick warning", async () => {
  let now = 0;
  const fixture = runtimeStore(), jev = deferred<JevShadowObservation>(), lines: unknown[] = [];
  const runtime = new FleetSupervisorRuntime(fixture.store, { observeJevShadow: () => jev.promise }, () => now);
  const loop = new FleetSupervisorLoop(runtime, { now: () => now, onSlowTick: (line) => lines.push(line) });
  loop.advance(); await flush(); now = 6000; jev.resolve(observed); await flush();
  assert.equal(loop.status().lastTickDurationMs, 6000);
  assert.equal(loop.status().lastTickWatchTimings[0].stageMs.calling_jev, 6000);
  assert.deepEqual(lines, []);
  loop.stop();
});

test("slow-tick threshold defaults to five seconds and validates like other loop settings", () => {
  assert.equal(fleetSupervisorSlowTickMs(undefined), 5000);
  assert.equal(fleetSupervisorSlowTickMs("1000"), 1000);
  assert.equal(fleetSupervisorSlowTickMs("3600000"), 3600000);
  for (const raw of ["", "NaN", "999", "3600001", "1234.5"]) assert.throws(() => fleetSupervisorSlowTickMs(raw));
});

test("a nonsettling Jev hook reaches its hard deadline and the runtime tick completes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let now = 0;
  const fixture = runtimeStore();
  const runtime = new FleetSupervisorRuntime(fixture.store, {
    observeJevShadow: boundedJevShadowHook(() => new Promise(() => {}), {
      env: { MISSION_CONTROL_JEV_SHADOW_TIMEOUT_MS: "100" }, now: () => now,
    }),
  });
  let settled = false;
  const tick = runtime.tick().then((value) => { settled = true; return value; });
  await flush();
  now = 199; t.mock.timers.tick(199); await flush();
  assert.equal(settled, false);
  now = 200; t.mock.timers.tick(1);
  const results = await tick;
  assert.equal(results[0].jevShadow?.error_code, "HOOK_TIMEOUT");
  assert.equal(results[0].jevShadow?.status, "ERROR");
  assert.equal(results[0].jevShadow?.latency_ms, 200);
  assert.equal(fixture.commits(), 1);
});

test("a thrown Jev hook produces HOOK_ERROR with latency instead of disappearing", async () => {
  const fixture = runtimeStore();
  let now = 10;
  const runtime = new FleetSupervisorRuntime(fixture.store, {
    observeJevShadow: boundedJevShadowHook(() => { now = 17; throw new Error("untrusted exception text"); }, { now: () => now }),
  });
  const results = await runtime.tick();
  assert.equal(results[0].jevShadow?.error_code, "HOOK_ERROR");
  assert.equal(results[0].jevShadow?.latency_ms, 7);
  assert.doesNotMatch(JSON.stringify(results[0].jevShadow), /untrusted exception/);
});

test("disabled hook observations do not gain latency", async () => {
  const fixture = runtimeStore();
  const runtime = new FleetSupervisorRuntime(fixture.store, {
    observeJevShadow: boundedJevShadowHook(() => ({ ...observed, status: "DISABLED" })),
  });
  assert.equal((await runtime.tick())[0].jevShadow?.latency_ms, undefined);
});

test("watchdog logs one stall per abandoned tick, replaces it and exposes stale completion", async () => {
  let now = 0;
  const signals: AbortSignal[] = [];
  const replacement = deferred<string[]>();
  const lines: unknown[] = [];
  const runtime = {
    currentProgress: { stage: "observing Jev", projectId: "project:fixture" },
    tick: (_now: string, signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? new Promise<string[]>(() => {}) : replacement.promise;
    },
  };
  const loop = new FleetSupervisorLoop(runtime, { now: () => now, pollMs: 1000, stallMs: 5000, onStall: (line) => lines.push(line) });
  loop.advance();
  now = 5000; loop.advance();
  assert.equal(signals.length, 1);
  now = 6001; loop.advance(); loop.advance();
  assert.equal(signals.length, 2);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  assert.deepEqual(lines, [{ event: "fleet_supervisor_tick_stalled", tick_started_at: "1970-01-01T00:00:00.000Z", age_ms: 6001,
    stage: "observing Jev", project_id: "project:fixture" }]);
  assert.equal(loop.status().stalled, true);
  assert.equal(loop.status().stalledTickCount, 1);
  replacement.resolve([]); await flush();
  assert.equal(loop.status().stalled, false);
  assert.equal(loop.status().lastTickCompletedAt, "1970-01-01T00:00:06.001Z");
  loop.stop();
});

test("an abandoned tick settling late cannot publish results or clear the replacement guard", async () => {
  let now = 0, calls = 0;
  const first = deferred<string[]>(), second = deferred<string[]>();
  const delivered: string[][] = [];
  const loop = new FleetSupervisorLoop({ tick: () => ++calls === 1 ? first.promise : second.promise }, {
    now: () => now, pollMs: 1000, stallMs: 5000, onResults: (results) => delivered.push(results),
  });
  loop.advance(); now = 6001; loop.advance();
  first.resolve(["late evidence"]); await flush();
  assert.equal(loop.status().lastTickCompletedAt, null);
  now = 6002; loop.advance();
  assert.equal(calls, 2);
  assert.deepEqual(delivered, []);
  second.resolve(["new evidence"]); await flush();
  assert.deepEqual(delivered, [["new evidence"]]);
  assert.equal(loop.status().lastTickCompletedAt, "1970-01-01T00:00:06.002Z");
  loop.advance(); assert.equal(calls, 3);
  loop.stop(); await flush();
});

test("an abandoned tick rejecting late cannot publish failure or change replacement status", async () => {
  let now = 0, calls = 0;
  let reject!: (error: Error) => void;
  const first = new Promise<string[]>((_resolve, fail) => { reject = fail; });
  const replacement = deferred<string[]>(), errors: unknown[] = [];
  const loop = new FleetSupervisorLoop({ tick: () => ++calls === 1 ? first : replacement.promise }, {
    now: () => now, pollMs: 1000, stallMs: 5000, onFailure: (error) => errors.push(error),
  });
  loop.advance(); now = 6001; loop.advance();
  reject(new Error("abandoned failure")); await flush();
  assert.deepEqual(errors, []);
  assert.equal(loop.status().lastTickFailedAt, null);
  assert.equal(loop.status().lastErrorMessage, null);
  assert.equal(loop.status().consecutiveFailures, 0);
  loop.advance(); assert.equal(calls, 2);
  replacement.resolve([]); await flush();
  loop.stop();
});

test("failure status records errors and consecutive failures; a completion resets the count", async () => {
  let now = 1, fail = true;
  const errors: unknown[] = [];
  const loop = new FleetSupervisorLoop({ tick: async () => { if (fail) throw new Error("fixture failure"); return []; } }, {
    now: () => now, onFailure: (error) => errors.push(error),
  });
  loop.advance(); await flush(); now = 2; loop.advance(); await flush();
  assert.equal(loop.status().consecutiveFailures, 2);
  assert.equal(loop.status().lastErrorMessage, "fixture failure");
  assert.equal(loop.status().lastTickFailedAt, "1970-01-01T00:00:00.002Z");
  fail = false; now = 3; loop.advance(); await flush();
  assert.equal(loop.status().consecutiveFailures, 0);
  assert.equal(errors.length, 2);
  loop.stop();
});

test("interval starts immediately, skips running work, and stops with cancellation", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let now = 0, calls = 0;
  let signal!: AbortSignal;
  const loop = new FleetSupervisorLoop({ tick: async (_now, inputSignal) => {
    calls += 1; signal = inputSignal; return new Promise<never>(() => {});
  } }, { now: () => now, pollMs: 1000, stallMs: 5000 }).start();
  assert.equal(calls, 1);
  now = 1000; t.mock.timers.tick(1000); assert.equal(calls, 1);
  loop.stop(); assert.equal(signal.aborted, true);
  now = 10000; t.mock.timers.tick(9000); assert.equal(calls, 1);
  assert.equal(loop.status().enabled, false);
  assert.equal(loop.status().stalled, false);
});

test("stall defaults use five polls or five minutes, and overrides use poll validation", () => {
  assert.equal(fleetSupervisorStallMs(undefined, 1000), 300000);
  assert.equal(fleetSupervisorStallMs(undefined, 60000), 300000);
  assert.equal(fleetSupervisorStallMs(undefined, 3600000), 18000000);
  assert.equal(fleetSupervisorStallMs("1000", 60000), 1000);
  assert.equal(fleetSupervisorStallMs("3600000", 60000), 3600000);
  for (const raw of ["", "NaN", "999", "3600001", "1234.5"]) assert.throws(() => fleetSupervisorStallMs(raw, 60000));
  const loop = new FleetSupervisorLoop(null, { enabled: false, now: () => 1e9 });
  loop.advance(); assert.equal(loop.status().stalled, false);
});

test("aborting during an awaited owner hook prevents the commit, Jev and the next watch", async () => {
  const fixture = runtimeStore(2), notification = deferred<void>(), controller = new AbortController();
  let hookCalls = 0;
  const runtime = new FleetSupervisorRuntime(fixture.store, {
    notifyOwner: () => notification.promise,
    observeJevShadow: () => { hookCalls += 1; return observed; },
  });
  const tick = runtime.tick(undefined, controller.signal);
  assert.deepEqual(runtime.currentProgress, { stage: "notifying", projectId: "project:fixture-0" });
  controller.abort(); notification.resolve();
  assert.deepEqual(await tick, []);
  assert.equal(fixture.commits(), 0); assert.equal(hookCalls, 0); assert.equal(fixture.reads(), 1);
});

test("aborting an in-flight Jev hook records its late result and makes no more side effects", async () => {
  const fixture = runtimeStore(2), observation = deferred<JevShadowObservation>(), controller = new AbortController();
  let hookCalls = 0;
  const runtime = new FleetSupervisorRuntime(fixture.store, {
    observeJevShadow: () => { hookCalls += 1; return observation.promise; },
  });
  const tick = runtime.tick(undefined, controller.signal);
  await flush();
  assert.deepEqual(runtime.currentProgress, { stage: "observing Jev", projectId: "project:fixture-0" });
  controller.abort(); observation.resolve(observed);
  const results = await tick;
  assert.equal(results.length, 1); assert.deepEqual(results[0].jevShadow, observed);
  assert.equal(fixture.commits(), 1); assert.equal(hookCalls, 1); assert.equal(fixture.reads(), 1);
});

test("a pre-aborted tick cannot select a watch or call a hook", async () => {
  const fixture = runtimeStore(2), controller = new AbortController();
  controller.abort();
  const runtime = new FleetSupervisorRuntime(fixture.store, { notifyOwner: () => assert.fail("hook called") });
  assert.deepEqual(await runtime.tick(undefined, controller.signal), []);
  assert.equal(fixture.reads(), 0); assert.equal(fixture.commits(), 0);
});

test("aborting awaited reasoning prevents every subsequent hook and commit", async () => {
  const store = new EventStore(":memory:"), reasoning = deferred<void>(), controller = new AbortController();
  try {
    seedStore(store);
    store.ensureFleetSupervisorWatch("project:billing", "task:billing", "billing", "2026-09-19T00:00:00.000Z");
    const runtime = new FleetSupervisorRuntime(store, {
      routeReasoning: () => reasoning.promise,
      notifyOwner: () => assert.fail("owner hook after abort"), observeJevShadow: () => assert.fail("Jev hook after abort"),
    });
    const tick = runtime.tick("2026-09-19T01:00:00.000Z", controller.signal);
    assert.deepEqual(runtime.currentProgress, { stage: "routing reasoning", projectId: "project:billing" });
    controller.abort(); reasoning.resolve();
    assert.deepEqual(await tick, []);
    assert.equal(store.fleetSupervisorTicks().length, 0);
  } finally { store.close(); }
});
