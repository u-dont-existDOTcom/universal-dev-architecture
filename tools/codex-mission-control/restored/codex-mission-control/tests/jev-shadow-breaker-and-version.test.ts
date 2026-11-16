import assert from "node:assert/strict";
import test from "node:test";
import { classifyFleetSupervisorTick } from "../lib/fleet-supervisor";
import {
  createJevShadowModelSelector, JEV_FALLBACK_SHADOW_MODEL, JEV_MODEL_REFRESH_MS, JEV_MODEL_RETRY_MS,
  selectLatestEligibleJevModel,
} from "../lib/jev-model-selection";
import { DEFAULT_JEV_SHADOW_MODEL, observeFleetSupervisorWithJev, type JevShadowObservation } from "../lib/jev-shadow";
import { JEV_PROVIDER_FAILURE_CODES, sampleJevShadowOnStateChange } from "../lib/jev-shadow-hook";
import { seedIssue47Store } from "../lib/seed";
import { EventStore } from "../lib/store";

function fixture() {
  const store = new EventStore(":memory:");
  seedIssue47Store(store);
  const watch = store.fleetSupervisorWatch("project:human-design")!;
  const events = store.workerEvents(watch.worker);
  const chain = { valid: true, errors: [] as string[] };
  const decision = classifyFleetSupervisorTick(watch, events, chain);
  return { store, watch, events, chain, decision };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

const catalogRow = (id: string, prompt = "0.000000042", extra: Record<string, unknown> = {}) => ({
  id, endpoints: ["/api/alpha/decisions"], pricing: { prompt, completion: "0", ...extra },
});

test("the owner's version switch: the shadow default is Jev 1.14", () => {
  assert.equal(DEFAULT_JEV_SHADOW_MODEL, "typesafe/jev-1.14");
  assert.equal(JEV_FALLBACK_SHADOW_MODEL, DEFAULT_JEV_SHADOW_MODEL);
});

test("unusable replies and unsettled calls count toward the breaker; Mission Control's own faults don't", async () => {
  assert.deepEqual([...JEV_PROVIDER_FAILURE_CODES].sort(),
    ["HOOK_TIMEOUT", "HTTP_ERROR", "INVALID_RESPONSE", "TIMEOUT", "TRANSPORT_ERROR"]);
  const { store, watch, events, chain, decision } = fixture();
  try {
    const codes: JevShadowObservation["error_code"][] = ["INVALID_RESPONSE", "STATE_BUILD_ERROR", "HOOK_ERROR",
      "HOOK_TIMEOUT", "HTTP_ERROR"];
    const logged: Record<string, unknown>[] = [];
    let now = 0;
    let calls = 0;
    const wrapped = sampleJevShadowOnStateChange(async (_watch, observed) => {
      const code = codes[calls++];
      if (!code) return { status: "OK", authoritative: false, model: "typesafe/jev-1.14", deterministic_trigger: observed.trigger };
      return { status: "ERROR", authoritative: false, model: "typesafe/jev-1.14", deterministic_trigger: observed.trigger,
        error_code: code, ...(code === "HTTP_ERROR" ? { http_status: 402 } : {}) };
    }, { env: { MISSION_CONTROL_JEV_SHADOW_ENABLED: "1" }, now: () => now, resampleMs: 60_000,
      log: (event) => { logged.push(event); } });
    // INVALID_RESPONSE (1), STATE_BUILD_ERROR and HOOK_ERROR (not counted), HOOK_TIMEOUT (2), HTTP_ERROR (3): open.
    for (let i = 0; i < 5; i++) {
      now = i * 61_000;
      assert.equal((await wrapped(watch, decision, events, chain))?.status, "ERROR");
    }
    assert.equal(logged.length, 1);
    assert.equal(logged[0].event, "jev_shadow_provider_paused");
    assert.equal(logged[0].consecutive_failures, 3);
    assert.equal(logged[0].error_code, "HTTP_ERROR");
    assert.equal(logged[0].http_status, 402);
    assert.equal(logged[0].paused_until, new Date(4 * 61_000 + 86_400_000).toISOString());
    assert.deepEqual(Object.keys(logged[0]).sort(),
      ["consecutive_failures", "error_code", "event", "http_status", "model", "paused_until"]);
    now += 61_000;
    assert.equal(await wrapped(watch, decision, events, chain), null);
    assert.equal(calls, 5);
    now = 4 * 61_000 + 86_400_000;
    assert.equal((await wrapped(watch, decision, events, chain))?.status, "OK");
    assert.equal(logged.at(-1)?.event, "jev_shadow_provider_resumed");
    assert.equal(logged.at(-1)?.after_consecutive_failures, 3);
  } finally { store.close(); }
});

test("a half-open retry that fails again pauses for another full cooldown", async () => {
  const { store, watch, events, chain, decision } = fixture();
  try {
    let now = 0;
    let calls = 0;
    const wrapped = sampleJevShadowOnStateChange(async (_watch, observed) => {
      calls++;
      return { status: "ERROR", authoritative: false, model: "m", deterministic_trigger: observed.trigger, error_code: "TIMEOUT" };
    }, { env: { MISSION_CONTROL_JEV_SHADOW_ENABLED: "1" }, now: () => now, resampleMs: 60_000, log: () => undefined });
    for (let i = 0; i < 3; i++) { now = i * 61_000; await wrapped(watch, decision, events, chain); }
    now = 2 * 61_000 + 86_400_000;
    assert.equal((await wrapped(watch, decision, events, chain))?.status, "ERROR");
    assert.equal(calls, 4);
    now += 61_000;
    assert.equal(await wrapped(watch, decision, events, chain), null);
    assert.equal(calls, 4);
  } finally { store.close(); }
});

test("no call is made while no version passes the price guard, and a new version is sampled afresh", async () => {
  const { store, watch, events, chain, decision } = fixture();
  try {
    let model: string | null = null;
    let refreshes = 0;
    let calls = 0;
    const seen: string[] = [];
    const wrapped = sampleJevShadowOnStateChange(async (_watch, observed) => {
      calls++;
      seen.push(model!);
      return { status: "OK", authoritative: false, model: model!, deterministic_trigger: observed.trigger };
    }, { env: { MISSION_CONTROL_JEV_SHADOW_ENABLED: "1" }, now: () => 0, model: () => model,
      refreshModel: () => { refreshes++; } });
    assert.equal(await wrapped(watch, decision, events, chain), null);
    assert.equal(calls, 0);
    assert.equal(refreshes, 1);
    model = "typesafe/jev-1.14";
    assert.equal((await wrapped(watch, decision, events, chain))?.model, "typesafe/jev-1.14");
    assert.equal(await wrapped(watch, decision, events, chain), null);
    model = "typesafe/jev-1.15";
    assert.equal((await wrapped(watch, decision, events, chain))?.model, "typesafe/jev-1.15");
    assert.deepEqual(seen, ["typesafe/jev-1.14", "typesafe/jev-1.15"]);
    assert.equal(refreshes, 4);
  } finally { store.close(); }
});

test("catalog selection takes the newest pinned version within the price guard and nothing else", () => {
  const live = { data: [catalogRow("typesafe/jev-1.14"), catalogRow("~typesafe/jev-latest"), catalogRow("typesafe/jev-1.13"),
    { id: "openai/gpt-5", endpoints: ["/api/v1/chat/completions"], pricing: { prompt: "0.000001" } }] };
  assert.deepEqual(selectLatestEligibleJevModel(live),
    { outcome: "SELECTED", choice: { id: "typesafe/jev-1.14", major: 1, minor: 14, promptUsdPerToken: 0.000000042 } });
  // Numeric, not lexical, ordering; a dearer newer version, a per-request fee or an output price is refused.
  assert.equal((selectLatestEligibleJevModel({ data: [catalogRow("typesafe/jev-1.9"), catalogRow("typesafe/jev-1.10")] }) as never as
    { choice: { id: string } }).choice.id, "typesafe/jev-1.10");
  const guarded = { data: [catalogRow("typesafe/jev-1.13"), catalogRow("typesafe/jev-1.16", "0.00000005"),
    catalogRow("typesafe/jev-1.15", "0.000000042", { request: "0.0001" }),
    { id: "typesafe/jev-1.17", endpoints: ["/api/alpha/decisions"], pricing: { prompt: "0.00000004", completion: "0.0000001" } },
    { id: "typesafe/jev-1.18", endpoints: ["/api/v1/chat/completions"], pricing: { prompt: "0.00000004", completion: "0" } },
    catalogRow("typesafe/jev-1.19", "0"), catalogRow("typesafe/jev-1.20", "free")] };
  assert.equal((selectLatestEligibleJevModel(guarded) as never as { choice: { id: string } }).choice.id, "typesafe/jev-1.13");
  assert.deepEqual(selectLatestEligibleJevModel({ data: [catalogRow("typesafe/jev-2.0", "0.0001")] }), { outcome: "NO_ELIGIBLE_MODEL" });
  assert.deepEqual(selectLatestEligibleJevModel({ models: [] }), { outcome: "MALFORMED_CATALOG" });
  assert.deepEqual(selectLatestEligibleJevModel(null), { outcome: "MALFORMED_CATALOG" });
});

test("the version selector respects a pin, starts on the fallback, checks daily and never blocks", async () => {
  const logs: Record<string, unknown>[] = [];
  let fetches = 0;
  const pinnedSelector = createJevShadowModelSelector({ env: { MISSION_CONTROL_JEV_SHADOW_MODEL: "typesafe/jev-1.13" },
    fetchCatalog: async () => { fetches++; return { data: [] }; }, log: (event) => { logs.push(event); } });
  pinnedSelector.refreshIfDue();
  await tick();
  assert.equal(pinnedSelector.current(), "typesafe/jev-1.13");
  assert.equal(pinnedSelector.pinned, true);
  assert.equal(fetches, 0);
  assert.deepEqual(logs[0], { event: "jev_shadow_model", model: "typesafe/jev-1.13", selection: "PINNED" });

  let now = 0;
  let respond: (value: unknown) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const automatic = createJevShadowModelSelector({ env: { MISSION_CONTROL_JEV_SHADOW_MODEL: "auto" }, now: () => now,
    fetchCatalog: () => { fetches++; return new Promise((resolve, reject) => { respond = resolve; fail = reject; }); },
    log: (event) => { logs.push(event); } });
  assert.equal(automatic.pinned, false);
  assert.equal(automatic.current(), JEV_FALLBACK_SHADOW_MODEL);
  automatic.refreshIfDue();
  automatic.refreshIfDue();
  await tick();
  assert.equal(fetches, 1, "one catalog read at a time");
  assert.equal(automatic.current(), JEV_FALLBACK_SHADOW_MODEL, "the caller is never held up by the read");
  respond({ data: [catalogRow("typesafe/jev-1.13"), catalogRow("typesafe/jev-1.15")] });
  await tick();
  assert.equal(automatic.current(), "typesafe/jev-1.15");
  assert.deepEqual(logs.at(-1), { event: "jev_shadow_model_selected", from: "typesafe/jev-1.14", to: "typesafe/jev-1.15",
    reason: "NEWEST_ELIGIBLE_VERSION" });
  now = JEV_MODEL_REFRESH_MS - 1;
  automatic.refreshIfDue();
  await tick();
  assert.equal(fetches, 1, "at most one read a day");
  now = JEV_MODEL_REFRESH_MS;
  automatic.refreshIfDue();
  await tick();
  assert.equal(fetches, 2);
  fail(new Error("offline"));
  await tick();
  assert.equal(automatic.current(), "typesafe/jev-1.15", "an unreadable catalog keeps the current version");
  assert.equal(logs.at(-1)?.outcome, "CATALOG_UNAVAILABLE");
  now += JEV_MODEL_RETRY_MS;
  automatic.refreshIfDue();
  await tick();
  assert.equal(fetches, 3, "retried after an hour");
  respond({ data: [catalogRow("typesafe/jev-1.15", "0.0000001")] });
  await tick();
  assert.equal(automatic.current(), null, "a price rise with no eligible version stops the calls");
  assert.equal(logs.at(-1)?.reason, "NO_ELIGIBLE_MODEL_WITHIN_PRICE_GUARD");
});

test("the observer sends the selected version and records it", async () => {
  let sentModel: unknown;
  const { store, events } = fixture();
  try {
    const observation = await observeFleetSupervisorWithJev("HEALTHY_ADVANCING", events, { valid: true }, {
      env: { MISSION_CONTROL_JEV_SHADOW_ENABLED: "1", OPENROUTER_API_KEY: "test-key", MISSION_CONTROL_JEV_SHADOW_MODEL: "auto" },
      model: "typesafe/jev-1.15",
      transport: async ({ body }) => { sentModel = body.model; return { id: "r1", answers: {} }; },
    });
    assert.equal(sentModel, "typesafe/jev-1.15");
    assert.equal(observation.model, "typesafe/jev-1.15");
    const fallback = await observeFleetSupervisorWithJev("HEALTHY_ADVANCING", events, { valid: true }, {
      env: { MISSION_CONTROL_JEV_SHADOW_ENABLED: "1", OPENROUTER_API_KEY: "test-key", MISSION_CONTROL_JEV_SHADOW_MODEL: "auto" },
      transport: async ({ body }) => { sentModel = body.model; return { id: "r2", answers: {} }; },
    });
    assert.equal(sentModel, DEFAULT_JEV_SHADOW_MODEL, "\"auto\" is never sent as a model name");
    assert.equal(fallback.model, DEFAULT_JEV_SHADOW_MODEL);
  } finally { store.close(); }
});
