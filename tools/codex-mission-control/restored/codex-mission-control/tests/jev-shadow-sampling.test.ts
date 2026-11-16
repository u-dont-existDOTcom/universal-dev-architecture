import assert from "node:assert/strict";
import test from "node:test";
import { classifyFleetSupervisorTick } from "../lib/fleet-supervisor";
import { boundedJevShadowHook, sampleJevShadowOnStateChange } from "../lib/jev-shadow-hook";
import { seedIssue47Store } from "../lib/seed";
import { EventStore } from "../lib/store";

test("unchanged Jev state is sampled at most once per resample window", async () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const watch = store.fleetSupervisorWatch("project:human-design")!;
    const events = store.workerEvents(watch.worker);
    const chain = { valid: true, errors: [] as string[] };
    const decision = classifyFleetSupervisorTick(watch, events, chain);
    let current = 0;
    let calls = 0;
    const hook = sampleJevShadowOnStateChange(async (_watch, observedDecision) => {
      calls += 1;
      return {
        status: "OK",
        authoritative: false,
        model: "typesafe/jev-1.13",
        deterministic_trigger: observedDecision.trigger,
      };
    }, { env: { MISSION_CONTROL_JEV_SHADOW_ENABLED: "1" }, now: () => current, resampleMs: 3_600_000 });

    assert.equal((await hook(watch, decision, events, chain))?.status, "OK");
    assert.equal(calls, 1);

    current = 60_000;
    assert.equal(await hook(watch, decision, events, chain), null);
    assert.equal(calls, 1);

    current = 120_000;
    const integrityDecision = { ...decision, trigger: "PROJECT_INTEGRITY_FAILURE" as const };
    assert.equal((await hook(watch, integrityDecision, events, { valid: false, errors: ["fixture"] }))?.status, "OK");
    assert.equal(calls, 2);

    current = 3_600_000;
    assert.equal((await hook(watch, decision, events, chain))?.status, "OK");
    assert.equal(calls, 3);
  } finally {
    store.close();
  }
});

test("disabled Jev shadow bypasses state sampling and preserves disabled semantics", async () => {
  let calls = 0;
  const hook = sampleJevShadowOnStateChange(async () => {
    calls += 1;
    return { status: "DISABLED", authoritative: false, model: "typesafe/jev-1.13", deterministic_trigger: "HEALTHY_ADVANCING" };
  }, { env: { MISSION_CONTROL_JEV_SHADOW_ENABLED: "0" } });
  const result = await hook({ projectId: "project:disabled" } as never, { trigger: "HEALTHY_ADVANCING" } as never, [] as never, { valid: true, errors: [] });
  assert.equal(result?.status, "DISABLED");
  assert.equal(calls, 1);
});

test("bounded Jev hook preserves an intentional skipped sample", async () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const watch = store.fleetSupervisorWatch("project:human-design")!;
    const events = store.workerEvents(watch.worker);
    const chain = { valid: true, errors: [] as string[] };
    const decision = classifyFleetSupervisorTick(watch, events, chain);
    const hook = boundedJevShadowHook(async () => null, { now: () => 100 });
    assert.equal(await hook(watch, decision, events, chain), null);
  } finally {
    store.close();
  }
});

test("Jev same-state sampling rejects accidental unbounded or too-fast intervals", () => {
  assert.throws(() => sampleJevShadowOnStateChange(async () => null, { resampleMs: 59_999 }));
  assert.throws(() => sampleJevShadowOnStateChange(async () => null, { resampleMs: 86_400_001 }));
});


test("three repeated provider errors open a day-long shadow-only circuit breaker", async () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const watch = store.fleetSupervisorWatch("project:human-design")!;
    const events = store.workerEvents(watch.worker);
    const chain = { valid: true, errors: [] as string[] };
    const decision = classifyFleetSupervisorTick(watch, events, chain);
    let now = 0;
    let calls = 0;
    const wrapped = sampleJevShadowOnStateChange(async (_watch, observedDecision) => {
      calls++;
      return { status: calls <= 3 ? "ERROR" as const : "OK" as const,
        authoritative: false as const, model: "typesafe/jev-1.13",
        deterministic_trigger: observedDecision.trigger,
        ...(calls <= 3 ? { error_code: "HTTP_ERROR" as const } : {}) };
    }, {
      env: { MISSION_CONTROL_JEV_SHADOW_ENABLED: "1" }, now: () => now,
      resampleMs: 60_000, providerFailureThreshold: 3,
      providerFailureCooldownMs: 86_400_000,
    });
    for (let i = 0; i < 3; i++) {
      now = i * 60_000;
      assert.equal((await wrapped(watch, decision, events, chain))?.status, "ERROR");
    }
    now += 61_000;
    // New state cannot defeat provider-level suppression.
    const different = { ...decision, trigger: "PROJECT_INTEGRITY_FAILURE" as const };
    assert.equal(await wrapped(watch, different, events, { valid: false, errors: [] }), null);
    assert.equal(calls, 3);
    now = 2 * 60_000 + 86_400_000;
    assert.equal((await wrapped(watch, decision, events, chain))?.status, "OK");
    assert.equal(calls, 4);
    now += 60_000;
    assert.equal((await wrapped(watch, different, events, { valid: false, errors: [] }))?.status, "OK");
    assert.equal(calls, 5);
  } finally { store.close(); }
});

test("provider backoff rejects invalid thresholds and leaves missing credentials uncounted", async () => {
  assert.throws(() => sampleJevShadowOnStateChange(async () => null,
    { providerFailureThreshold: 1 }), /backoff/);
  assert.throws(() => sampleJevShadowOnStateChange(async () => null,
    { providerFailureCooldownMs: 700_000_000 }), /backoff/);
  let calls = 0;
  const wrapped = sampleJevShadowOnStateChange(async (_watch, decision) => {
    calls++;
    return { status: "MISSING_API_KEY" as const, authoritative: false as const,
      model: "typesafe/jev-1.13", deterministic_trigger: decision.trigger };
  }, { env: { MISSION_CONTROL_JEV_SHADOW_ENABLED: "1" }, now: () => 1_000_000 });
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const watch = store.fleetSupervisorWatch("project:human-design")!;
    const events = store.workerEvents(watch.worker);
    const chain = { valid: true, errors: [] as string[] };
    const decision = classifyFleetSupervisorTick(watch, events, chain);
    assert.equal((await wrapped(watch, decision, events, chain))?.status, "MISSING_API_KEY");
    assert.equal((await wrapped(watch, decision, events, chain))?.status, "MISSING_API_KEY");
    assert.equal(calls, 2);
  } finally { store.close(); }
});
