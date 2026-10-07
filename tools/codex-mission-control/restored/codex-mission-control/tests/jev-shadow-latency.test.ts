import assert from "node:assert/strict";
import test from "node:test";
import { buildJevShadowState, observeFleetSupervisorWithJev } from "../lib/jev-shadow";
import { seedIssue47Store } from "../lib/seed";
import { EventStore } from "../lib/store";

test("live provider wall time is measured on OK and failed calls and real sanitized state persists", async () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const events = store.workerEvents(store.fleetSupervisorWatch("project:human-design")!.worker);
    const env = { MISSION_CONTROL_JEV_SHADOW_ENABLED: "1", OPENROUTER_API_KEY: "test-only-key" };
    let now = 100;
    const ok = await observeFleetSupervisorWithJev("HEALTHY_ADVANCING", events, { valid: true }, {
      env, now: () => now, transport: async () => { now = 125; return { answers: { next_action: { choice: { no_action_healthy: 1 } } } }; },
    });
    assert.equal(ok.latency_ms, 25);
    assert.deepEqual(ok.state, buildJevShadowState(events, { valid: true }));
    assert.equal(store.recordJevShadowObservation({ source: "LIVE", observedAt: "2026-10-03T00:00:00Z", observation: ok }), true);
    now = 200;
    const error = await observeFleetSupervisorWithJev("HEALTHY_ADVANCING", events, { valid: true }, {
      env, now: () => now, transport: async () => { now = 260; throw new Error("fixture failure"); },
    });
    assert.equal(error.latency_ms, 60); assert.equal(error.error_code, "TRANSPORT_ERROR");
    assert.equal(store.recordJevShadowObservation({ source: "LIVE", observedAt: "2026-10-03T00:00:01Z", observation: error }), true);
    assert.deepEqual(store.jevShadowSummary().latency, { count: 1, p50: 25, p90: 25, p99: 25, max: 25, timeoutCount: 0, providerErrorCount: 1 });
  } finally { store.close(); }
});
