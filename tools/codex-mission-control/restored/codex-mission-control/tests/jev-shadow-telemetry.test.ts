import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { canonicalJson, sha256 } from "../lib/canonical";
import type { JevShadowObservation, JevShadowState } from "../lib/jev-shadow";
import { importJevShadowLog, parseJevShadowLogLine } from "../lib/jev-shadow-log-import";
import { EventStore } from "../lib/store";

const state: JevShadowState = {
  chain_valid: true, queue_terminal: false, owner_action_kind: "NONE", open_blocker_present: false,
  blocker_actor_kind: "NONE", delivery_status: "NONE", delivery_error_family: "NONE", contract_owner_alignment: "MATCH",
  outcome_advancement: "ADVANCING", strategy_efficacy: "VIABLE", correction_owner_action_type: "NONE",
  pending_reasoning_review: false, review_freshness: "CURRENT", active_directive_present: true, execution_state: "RUNNING_WITH_DIRECTIVE",
};
function observation(overrides: Partial<JevShadowObservation> = {}): JevShadowObservation {
  return { status: "OK", authoritative: false, model: "typesafe/jev-1.13", deterministic_trigger: "HEALTHY_ADVANCING", state,
    answers: { next_action: { choice: { no_action_healthy: 0.9, route_reasoning: 0.1 } }, owner_decision_required: { noul: 0.02 }, consequence_level: { score: 0 } },
    usage: { input_tokens: 100, output_tokens: 2, cost: 0.1 }, ...overrides };
}
const at = (n: number) => new Date(Date.UTC(2026, 9, 3) + n * 1000).toISOString();
const rows = (store: EventStore) => (store as unknown as { db: DatabaseSync }).db.prepare("SELECT * FROM jev_shadow_observations ORDER BY sequence").all();
const action = (choice: string, owner: number | boolean) => ({ next_action: { choice: { [choice]: 1 } }, owner_decision_required: { noul: owner } });

test("recording persists columns, canonical fingerprints and allowlisted JSON only", () => {
  const store = new EventStore(":memory:");
  try {
    const raw = observation({ response_id: "response:one", provider: "TypeSafe", latency_ms: 12,
      state: { ...state, description: "PRIVATE_TEXT" } as JevShadowState,
      answers: { ...observation().answers, transcript: "PRIVATE_TEXT", next_action: { choice: { no_action_healthy: 1, arbitrary_action: 0.5 }, explanation: "PRIVATE_TEXT" } } });
    assert.equal(store.recordJevShadowObservation({ source: "LIVE", projectId: "project:fixture", observedAt: at(0), observation: raw }), true);
    const row = rows(store)[0];
    assert.equal(row.project_id, "project:fixture"); assert.equal(row.source, "LIVE");
    assert.equal(row.observed_at, at(0)); assert.equal(row.latency_ms, 12);
    assert.equal(row.expected_next_action, "no_action_healthy"); assert.equal(row.jev_next_action, "no_action_healthy");
    assert.equal(row.agrees, 1); assert.equal(row.jev_owner_decision_required, 0); assert.equal(row.expected_owner_decision_required, 0);
    assert.equal(row.input_tokens, 100); assert.equal(row.output_tokens, 2); assert.equal(row.cost_usd, 0.1);
    assert.equal(row.provider, "TypeSafe"); assert.equal(row.response_id, "response:one"); assert.equal(row.model, "typesafe/jev-1.13");
    assert.equal(row.state_json, canonicalJson(state)); assert.equal(row.state_fingerprint, sha256(canonicalJson(state)));
    assert.doesNotMatch(String(row.answers_json), /PRIVATE_TEXT|arbitrary_action|transcript|explanation/);
  } finally { store.close(); }
});

test("response IDs dedupe across source/time; ID-less rows dedupe on all four fallback fields", () => {
  const store = new EventStore(":memory:");
  try {
    const record = (item: JevShadowObservation, time = at(0)) => store.recordJevShadowObservation({ source: "LIVE", observedAt: time, observation: item });
    assert.equal(record(observation({ response_id: "response:one" })), true);
    assert.equal(store.recordJevShadowObservation({ source: "LOG_IMPORT", observedAt: at(9), observation: observation({ response_id: "response:one" }) }), false);
    assert.equal(record(observation()), true); assert.equal(record(observation()), false);
    assert.equal(record(observation(), at(1)), true);
    assert.equal(record(observation({ deterministic_trigger: "TERMINAL" })), true);
    assert.equal(record(observation({ status: "ERROR", error_code: "TIMEOUT" })), true);
    assert.equal(record(observation({ status: "ERROR", error_code: "HTTP_ERROR" })), true);
    assert.equal(record(observation({ status: "DISABLED" })), false);
    assert.equal(rows(store).length, 6);
    assert.equal(rows(store).find((row) => row.status === "ERROR")?.agrees, null);
  } finally { store.close(); }
});

test("summary covers per-trigger agreement, disagreement pairs, owner signals, live percentiles, cost and tokens", () => {
  const store = new EventStore(":memory:");
  try {
    const fixtures = [
      observation({ latency_ms: 10 }),
      observation({ latency_ms: 20, answers: action("route_reasoning", 0.8) }),
      observation({ deterministic_trigger: "OWNER_ACTION_REQUIRED", latency_ms: 30, state: { ...state, owner_action_kind: "DECISION_REQUIRED" }, answers: action("notify_owner", true) }),
      observation({ deterministic_trigger: "OWNER_ACTION_REQUIRED", latency_ms: 40, state: { ...state, owner_action_kind: "DECISION_REQUIRED" }, answers: action("route_reasoning", false) }),
    ];
    fixtures.forEach((item, i) => store.recordJevShadowObservation({ source: "LIVE", observedAt: at(i + 1), observation: item }));
    store.recordJevShadowObservation({ source: "LOG_IMPORT", observedAt: at(0), projectId: "ignored", observation: observation({
      deterministic_trigger: "PROJECT_INTEGRITY_FAILURE", state: { ...state, chain_valid: false }, answers: action("hold_integrity", 0.1),
      latency_ms: 9999, usage: { input_tokens: 50, output_tokens: 3, cost: 0.2 },
    }) });
    for (const [i, error_code] of (["TIMEOUT", "HTTP_ERROR"] as const).entries()) {
      store.recordJevShadowObservation({ source: "LIVE", observedAt: at(i + 5), observation: observation({ status: "ERROR", error_code, usage: undefined, latency_ms: 1500 }) });
    }
    const summary = store.jevShadowSummary();
    assert.equal(summary.firstObservedAt, at(0)); assert.equal(summary.lastObservedAt, at(6));
    assert.deepEqual(summary.counts.bySource, { LIVE: 6, LOG_IMPORT: 1 });
    assert.deepEqual(summary.counts.byStatus, { OK: 5, ERROR: 2, MISSING_API_KEY: 0 });
    assert.deepEqual(summary.counts.byErrorCode, { NONE: 5, TIMEOUT: 1, HTTP_ERROR: 1 });
    assert.equal(summary.okComparisons, 5); assert.equal(summary.distinctStateFingerprints, 3);
    assert.equal(summary.agreement.n, 5); assert.equal(summary.agreement.agreeing, 3); assert.equal(summary.agreement.rate, 0.6);
    assert.deepEqual(summary.agreement.byTrigger.HEALTHY_ADVANCING, { n: 2, agreeing: 1, rate: 0.5 });
    assert.deepEqual(summary.agreement.byTrigger.OWNER_ACTION_REQUIRED, { n: 2, agreeing: 1, rate: 0.5 });
    assert.deepEqual(summary.agreement.byTrigger.PROJECT_INTEGRITY_FAILURE, { n: 1, agreeing: 1, rate: 1 });
    assert.deepEqual(summary.agreement.disagreeingPairs, [
      { trigger: "HEALTHY_ADVANCING", jevAction: "route_reasoning", count: 1 }, { trigger: "OWNER_ACTION_REQUIRED", jevAction: "route_reasoning", count: 1 },
    ]);
    assert.deepEqual(summary.ownerSignals, { comparisons: 5, expectedTrue: 2, falsePositives: 1, misses: 1 });
    assert.deepEqual(summary.latency, { count: 4, p50: 20, p90: 40, p99: 40, max: 40, timeoutCount: 1, providerErrorCount: 1 });
    assert.ok(Math.abs(summary.cost.totalUsd - 0.6) < 1e-12);
    assert.ok(Math.abs(summary.cost.per1000CallsUsd! - 0.6 / 7 * 1000) < 1e-12);
    assert.equal(summary.cost.inputTokens, 450); assert.equal(summary.cost.outputTokens, 11);
    const imported = rows(store).find((row) => row.source === "LOG_IMPORT")!;
    assert.equal(imported.project_id, null); assert.equal(imported.latency_ms, null);
    assert.ok(summary.checkpoints.every((item) => item.okComparisonsReachedAt === null && item.distinctStatesReachedAt === null));
  } finally { store.close(); }
});

test("ordered deterministic triggers map to all expected actions", () => {
  const store = new EventStore(":memory:");
  try {
    const mapping = { PROJECT_INTEGRITY_FAILURE: "hold_integrity", TERMINAL: "stop_terminal", OWNER_ACTION_REQUIRED: "notify_owner",
      BLOCKED_EXTERNAL: "wait_external", MECHANICAL_RECOVERY_ELIGIBLE: "continue_mechanical", REASONING_REVIEW_OVERDUE: "route_reasoning",
      STALLED_OR_REGRESSING: "route_reasoning", WORKER_DIRECTIVE_CONTINUITY_GAP: "route_reasoning", HEALTHY_ADVANCING: "no_action_healthy" };
    Object.entries(mapping).forEach(([trigger, expected], i) => {
      store.recordJevShadowObservation({ source: "LIVE", observedAt: at(i), observation: observation({ deterministic_trigger: trigger, answers: action(expected, 0) }) });
    });
    assert.deepEqual(rows(store).map((row) => [row.deterministic_trigger, row.expected_next_action, row.agrees]),
      Object.entries(mapping).map(([trigger, expected]) => [trigger, expected, 1]));
  } finally { store.close(); }
});

test("owner criteria include manual action, open owner blocker and correction; absent state stays unknown", () => {
  const store = new EventStore(":memory:");
  try {
    const variants = [undefined, state, { ...state, owner_action_kind: "MANUAL_INTERVENTION_REQUIRED" },
      { ...state, open_blocker_present: true, blocker_actor_kind: "OWNER" }, { ...state, correction_owner_action_type: "DECISION_REQUIRED" },
      { ...state, open_blocker_present: false, blocker_actor_kind: "OWNER", owner_action_kind: "VERIFY_RESULT" }];
    variants.forEach((variant, i) => store.recordJevShadowObservation({ source: "LIVE", observedAt: at(i), observation: observation({ state: variant }) }));
    assert.deepEqual(rows(store).map((row) => row.expected_owner_decision_required), [null, 0, 1, 1, 1, 0]);
    assert.equal(rows(store)[0].state_fingerprint, null);
    assert.equal(store.jevShadowSummary().ownerSignals.misses, 3);
    assert.equal(store.jevShadowSummary().ownerSignals.comparisons, 5);
    store.recordJevShadowObservation({ source: "LIVE", observedAt: at(6), observation: observation({ status: "ERROR", error_code: "HOOK_ERROR",
      state: { ...state, owner_action_kind: "DECISION_REQUIRED" } }) });
    assert.equal(store.jevShadowSummary().ownerSignals.expectedTrue, 4);
    assert.equal(store.jevShadowSummary().ownerSignals.misses, 3);
  } finally { store.close(); }
});

test("OK and distinct-state 25/100/500 checkpoints use chronological observations and exclude errors", () => {
  const store = new EventStore(":memory:");
  try {
    // Reverse insertion order also represents a historical import after live calls.
    for (let i = 500; i >= 0; i--) {
      const n = Math.max(0, i - 1); // One repeated state at the beginning.
      const distinctState = { ...state, chain_valid: Boolean(n & 1), queue_terminal: Boolean(n & 2),
        open_blocker_present: Boolean(n & 4), pending_reasoning_review: Boolean(n & 8), active_directive_present: Boolean(n & 16),
        owner_action_kind: ["NONE", "DECISION_REQUIRED", "MANUAL_INTERVENTION_REQUIRED", "VERIFY_RESULT"][Math.floor(n / 32) % 4],
        outcome_advancement: ["ADVANCING", "FLAT", "REGRESSING", "UNKNOWN"][Math.floor(n / 128) % 4] };
      store.recordJevShadowObservation({ source: "LIVE", observedAt: at(i), observation: observation({ state: distinctState }) });
    }
    store.recordJevShadowObservation({ source: "LIVE", observedAt: at(-1), observation: observation({ status: "ERROR", error_code: "HOOK_TIMEOUT" }) });
    const summary = store.jevShadowSummary();
    assert.equal(summary.okComparisons, 501); assert.equal(summary.distinctStateFingerprints, 500);
    assert.deepEqual(summary.checkpoints, [25, 100, 500].map((n) => ({ n, okComparisonsReachedAt: at(n - 1), distinctStatesReachedAt: at(n) })));
    assert.equal(summary.latency.timeoutCount, 1);
  } finally { store.close(); }
});

test("empty summary has null rates and percentiles, and unknown or text state cannot be persisted", () => {
  const store = new EventStore(":memory:");
  try {
    const summary = store.jevShadowSummary();
    assert.equal(summary.counts.total, 0); assert.equal(summary.agreement.rate, null);
    assert.equal(summary.firstObservedAt, null); assert.equal(summary.latency.p50, null); assert.equal(summary.cost.per1000CallsUsd, null);
    assert.throws(() => store.recordJevShadowObservation({ source: "LIVE", observation: observation({ state: { ...state, owner_action_kind: "PRIVATE_TEXT" } }) }));
    assert.equal(rows(store).length, 0);
  } finally { store.close(); }
});

test("store startup creates telemetry for an existing database and observations survive reopen", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "mc-jev-store-")), filename = path.join(directory, "events.db");
  let store = new EventStore(filename);
  try {
    store.close();
    const db = new DatabaseSync(filename); db.exec("DROP TABLE jev_shadow_observations"); db.close();
    store = new EventStore(filename);
    store.recordJevShadowObservation({ source: "LIVE", observedAt: at(0), observation: observation() });
    store.close(); store = new EventStore(filename);
    assert.equal(store.jevShadowSummary().okComparisons, 1);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("Docker import parses only observation JSON, counts malformed lines and dedupes reruns", async () => {
  const store = new EventStore(":memory:");
  const logLine = (time: string, value: unknown) => `${time} ${JSON.stringify({ event: "jev_shadow_observation", ...value as object })}`;
  const lines = [
    "ordinary daemon output", `${at(0)} {\"event\":\"other\"}`,
    logLine("2026-09-30T14:34:08.123456789Z", observation({ response_id: "response:log" })),
    logLine(at(1), observation({ status: "ERROR", error_code: "TIMEOUT", state: undefined, answers: undefined })),
    logLine(at(2), observation({ status: "DISABLED" })),
    "bad-timestamp {\"event\":\"jev_shadow_observation\"}",
    logLine("2026-02-30T00:00:00Z", observation()),
    `${at(3)} {"event":"jev_shadow_observation",`,
    logLine(at(4), { status: "OK", authoritative: false }),
    logLine(at(5), observation({ state: { ...state, delivery_status: "PRIVATE_TEXT" } })),
  ];
  try {
    assert.deepEqual(await importJevShadowLog(lines, store), { read: 10, imported: 2, skipped: 3, malformed: 5 });
    assert.deepEqual(await importJevShadowLog(lines, store), { read: 10, imported: 0, skipped: 5, malformed: 5 });
    assert.equal(rows(store).length, 2);
    assert.equal(rows(store)[0].observed_at, "2026-09-30T14:34:08.123456789Z");
    assert.equal(rows(store)[0].source, "LOG_IMPORT");
    assert.equal(rows(store)[1].state_fingerprint, null);
    assert.equal(parseJevShadowLogLine("unrelated invalid JSON {").kind, "skipped");
  } finally { store.close(); }
});

test("import CLI reads file or stdin through the normal store and prints counts only", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "mc-jev-import-"));
  const filename = path.join(directory, "input.log"), database = path.join(directory, "events.db");
  const input = `${at(0)} ${JSON.stringify({ event: "jev_shadow_observation", ...observation({ response_id: "response:cli" }) })}\n`;
  writeFileSync(filename, input);
  try {
    const run = (args: string[], stdin?: string) => spawnSync(process.execPath, ["--import", "tsx", "scripts/import-jev-shadow-log.ts", ...args], {
      env: { ...process.env, MISSION_CONTROL_DB: database }, input: stdin, encoding: "utf8",
    });
    const first = run([filename]); assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(JSON.parse(first.stdout), { read: 1, imported: 1, skipped: 0, malformed: 0 });
    const second = run([], input); assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(JSON.parse(second.stdout), { read: 1, imported: 0, skipped: 1, malformed: 0 });
    assert.doesNotMatch(first.stdout + second.stdout, /response:cli|next_action|typesafe/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
