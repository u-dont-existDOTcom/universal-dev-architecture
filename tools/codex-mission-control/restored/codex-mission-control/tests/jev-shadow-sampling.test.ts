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
    }, { now: () => current, resampleMs: 3_600_000 });

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
