import assert from "node:assert/strict";
import test from "node:test";
import { buildJevShadowState, MISSION_CONTROL_JEV_QUESTIONS, observeFleetSupervisorWithJev } from "../lib/jev-shadow";
import { seedIssue47Store } from "../lib/seed";
import { EventStore } from "../lib/store";

function issue47Events() {
  const store = new EventStore(":memory:");
  seedIssue47Store(store);
  const worker = store.fleetSupervisorWatch("project:human-design")!.worker;
  const events = store.workerEvents(worker);
  store.close();
  return events;
}

test("Jev shadow is disabled by default and performs no transport call", async () => {
  let calls = 0;
  const result = await observeFleetSupervisorWithJev("HEALTHY_ADVANCING", issue47Events(), { valid: true }, {
    env: {},
    transport: async () => { calls += 1; return {}; },
  });
  assert.equal(result.status, "DISABLED");
  assert.equal(result.authoritative, false);
  assert.equal(calls, 0);
});

test("enabled shadow without an OpenRouter key fails closed on spend but not on Mission Control", async () => {
  const result = await observeFleetSupervisorWithJev("HEALTHY_ADVANCING", issue47Events(), { valid: true }, {
    env: { MISSION_CONTROL_JEV_SHADOW_ENABLED: "1" },
  });
  assert.equal(result.status, "MISSING_API_KEY");
  assert.equal(result.authoritative, false);
});
test("Jev receives only allowlisted control-plane state and returns typed telemetry", async () => {
  const events = issue47Events();
  let captured: unknown;
  const result = await observeFleetSupervisorWithJev("HEALTHY_ADVANCING", events, { valid: true }, {
    env: {
      MISSION_CONTROL_JEV_SHADOW_ENABLED: "1",
      OPENROUTER_API_KEY: "test-only-key",
    },
    transport: async ({ body }) => {
      captured = body;
      return {
        id: "decision:test",
        provider: "TypeSafe",
        answers: {
          owner_decision_required: { noul: 0.02 },
          engineering_blocker: { noul: 0.05 },
          stalled_or_regressing: { noul: 0.01 },
          next_action: { choice: { no_action_healthy: 0.94, route_reasoning: 0.06 } },
          consequence_level: { score: 0 },
        },
        usage: { input_tokens: 123, output_tokens: 0, cost: 0.000005166 },
      };
    },
  });

  assert.equal(result.status, "OK");
  assert.equal(result.provider, "TypeSafe");
  assert.equal(result.response_id, "decision:test");
  assert.equal(result.usage?.input_tokens, 123);
  const request = captured as { state: Record<string, unknown>; questions: Record<string, unknown> };
  assert.deepEqual(Object.keys(request.state).sort(), Object.keys(buildJevShadowState(events, { valid: true })).sort());
  assert.deepEqual(Object.keys(request.questions).sort(), Object.keys(MISSION_CONTROL_JEV_QUESTIONS).sort());
  const serialized = JSON.stringify(captured);
  assert.doesNotMatch(serialized, /project:human-design|task:|supervisor_chat|description|exact_text|goal|message/i);
});

test("state-build and timeout failures stay non-authoritative", async () => {
  const env = {
    MISSION_CONTROL_JEV_SHADOW_ENABLED: "1",
    OPENROUTER_API_KEY: "test-only-key",
    MISSION_CONTROL_JEV_SHADOW_TIMEOUT_MS: "100",
  };
  const stateFailure = await observeFleetSupervisorWithJev("PROJECT_INTEGRITY_FAILURE", [], { valid: false }, { env });
  assert.equal(stateFailure.status, "ERROR");
  assert.equal(stateFailure.error_code, "STATE_BUILD_ERROR");

  const timeout = await observeFleetSupervisorWithJev("HEALTHY_ADVANCING", issue47Events(), { valid: true }, {
    env,
    transport: ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
  });
  assert.equal(timeout.status, "ERROR");
  assert.equal(timeout.error_code, "TIMEOUT");
  assert.equal(timeout.authoritative, false);
});

test("transport and response failures stay inside shadow telemetry", async () => {
  const events = issue47Events();
  const transportFailure = await observeFleetSupervisorWithJev("STALLED_OR_REGRESSING", events, { valid: true }, {
    env: { MISSION_CONTROL_JEV_SHADOW_ENABLED: "1", OPENROUTER_API_KEY: "test-only-key" },
    transport: async () => { throw new Error("provider unavailable"); },
  });
  assert.equal(transportFailure.status, "ERROR");
  assert.equal(transportFailure.error_code, "TRANSPORT_ERROR");

  const invalidResponse = await observeFleetSupervisorWithJev("STALLED_OR_REGRESSING", events, { valid: true }, {
    env: { MISSION_CONTROL_JEV_SHADOW_ENABLED: "1", OPENROUTER_API_KEY: "test-only-key" },
    transport: async () => ({ model: "typesafe/jev-1.13" }),
  });
  assert.equal(invalidResponse.status, "ERROR");
  assert.equal(invalidResponse.error_code, "INVALID_RESPONSE");
});
