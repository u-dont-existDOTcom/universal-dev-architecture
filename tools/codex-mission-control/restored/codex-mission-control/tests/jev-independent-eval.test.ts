import assert from "node:assert/strict";
import test from "node:test";
import {
  JEV_INDEPENDENT_EVAL_VERSION, buildIndependentJevRequest, scoreJevIndependentValue,
  type JevJudgedObservation,
} from "../lib/jev-independent-eval";
import type { JevShadowState } from "../lib/jev-shadow";

const state: JevShadowState = {
  chain_valid: true, queue_terminal: false, owner_action_kind: "NONE",
  open_blocker_present: false, blocker_actor_kind: "NONE",
  delivery_status: "NONE", delivery_error_family: "NONE",
  contract_owner_alignment: "MATCH", outcome_advancement: "FLAT",
  strategy_efficacy: "FAILED", correction_owner_action_type: "NONE",
  pending_reasoning_review: true, review_freshness: "OVERDUE",
  active_directive_present: true, execution_state: "STOPPED_FOR_REASONING_REVIEW",
};

test("independent V2 questions do not embed V1 deterministic answer key or trigger", () => {
  const contaminated = { ...state, project_id: "PRIVATE-ID", deterministic_trigger: "OWNER_ACTION_REQUIRED",
    gold_action: "notify_owner", private_text: "PRIVATE-TEXT" };
  const request = buildIndependentJevRequest(contaminated);
  const encoded = JSON.stringify(request);
  assert.equal(JEV_INDEPENDENT_EVAL_VERSION, "jev-independent-v2-20261115");
  assert.equal(Object.keys(request.state).length, 15);
  assert.ok(encoded.includes("owner_decision_required"));
  for (const secret of ["PRIVATE-ID", "PRIVATE-TEXT", "deterministic_trigger", "gold_action", "First choose", "Otherwise choose"]) {
    assert.ok(!encoded.includes(secret), "must not send " + secret);
  }
  assert.equal(request.provider.allow_fallbacks, false);
  assert.equal(request.state.outcome_advancement, "FLAT");
});

const observed = (overrides: Partial<JevJudgedObservation> = {}): JevJudgedObservation => ({
  case_id: "case-a", state_fingerprint: "real-fingerprint-a", cohort: "DEVELOPMENT",
  evidence_ref: "adjudication:case-a", gold_action: "route_reasoning",
  deterministic_action: "route_reasoning", provider_status: "OK",
  jev_action: "notify_owner", response_id: "response-a", cost_usd: 0.002, latency_ms: 730,
  ...overrides,
});

test("repeated responses on one state do not advance 25/100/500 checkpoints", () => {
  const observations = Array.from({ length: 100 }, (_, i) => observed({
    response_id: "provider-" + i, latency_ms: 600 + i,
  }));
  const result = scoreJevIndependentValue(observations);
  assert.equal(result.raw_unique_observations, 100);
  assert.equal(result.distinct_state_fingerprints, 1);
  assert.equal(result.distinct_comparable_states, 1);
  assert.equal(result.checkpoint_25, false);
  assert.equal(result.false_owner_interruptions, 1);
  assert.equal(result.jev_correct, 0);
  assert.equal(result.cumulative_cost_usd.toFixed(3), "0.200");
});

test("provider ID and fallback identity deduplicate before cost and latency", () => {
  const result = scoreJevIndependentValue([
    observed(), observed({ cost_usd: 999, latency_ms: 9999 }),
    observed({ response_id: undefined, fallback_identity: "error-1", provider_status: "ERROR",
      jev_action: undefined, cost_usd: undefined }),
    observed({ response_id: undefined, fallback_identity: "error-1", provider_status: "ERROR",
      jev_action: undefined }),
  ]);
  assert.equal(result.raw_unique_observations, 2);
  assert.equal(result.distinct_state_fingerprints, 1);
  assert.equal(result.provider_failures, 1);
  assert.equal(result.cumulative_cost_usd, 0.002);
});

test("scoring measures genuinely incremental catches and introduced errors separately", () => {
  const result = scoreJevIndependentValue([
    observed({ jev_action: "route_reasoning", deterministic_action: "notify_owner", response_id: "a" }),
    observed({ case_id: "b", state_fingerprint: "b", evidence_ref: "review:b",
      gold_action: "notify_owner", deterministic_action: "notify_owner",
      jev_action: "route_reasoning", response_id: "b" }),
    observed({ case_id: "c", state_fingerprint: "c", evidence_ref: "review:c",
      gold_action: "no_action_healthy", deterministic_action: "no_action_healthy",
      jev_action: "notify_owner", response_id: "c" }),
    observed({ case_id: "d", state_fingerprint: "d", evidence_ref: "review:d",
      gold_action: "route_reasoning", deterministic_action: "route_reasoning",
      jev_action: "route_reasoning", stronger_action: "route_reasoning", response_id: "d" }),
  ]);
  assert.equal(result.distinct_state_fingerprints, 4);
  assert.equal(result.baseline_correct, 3);
  assert.equal(result.jev_correct, 2);
  assert.equal(result.incremental_catches, 1);
  assert.equal(result.introduced_errors, 2);
  assert.equal(result.false_owner_interruptions, 1);
  assert.equal(result.missed_owner_actions, 1);
  assert.equal(result.stronger_comparable, 1);
  assert.equal(result.stronger_correct, 1);
  assert.deepEqual(result.by_type.notify_owner, { n: 1, jev_correct: 0, baseline_correct: 1 });
});

test("failed provider cases do not count as successes or label owner-required misses", () => {
  const r = scoreJevIndependentValue([observed({
    provider_status: "ERROR", jev_action: undefined, gold_action: "notify_owner",
  })]);
  assert.equal(r.distinct_state_fingerprints, 1);
  assert.equal(r.distinct_comparable_states, 0);
  assert.equal(r.states_without_successful_jev, 1);
  assert.equal(r.missed_owner_actions, 0);
});

test("state-specific contradictory evidence labels fail closed", () => {
  assert.throws(() => scoreJevIndependentValue([
    observed(), observed({ response_id: "new", gold_action: "notify_owner" }),
  ]), /Conflicting adjudication/);
});

test("repeated changes in Jev action count as instability, never extra independent states", () => {
  const r = scoreJevIndependentValue([
    observed({ jev_action: "route_reasoning" }),
    observed({ response_id: "new", jev_action: "notify_owner" }),
  ]);
  assert.equal(r.distinct_comparable_states, 1);
  assert.equal(r.unstable_states, 1);
});

test("checkpoint is based on distinct fingerprint, not provider output count", () => {
  const rows = Array.from({ length: 25 }, (_, i) => observed({
    case_id: "case-" + i, evidence_ref: "adjudication:" + i,
    state_fingerprint: "fingerprint-" + i, response_id: "response-" + i,
    jev_action: "route_reasoning",
  }));
  const r = scoreJevIndependentValue(rows);
  assert.equal(r.checkpoint_25, true);
  assert.equal(r.checkpoint_100, false);
  assert.equal(r.distinct_comparable_states, 25);
});


test("adjudicated but unrun states count toward state frontier, never raw provider calls", () => {
  const r = scoreJevIndependentValue([
    observed({ provider_status: "NOT_RUN", jev_action: undefined,
      response_id: undefined, cost_usd: undefined }),
  ]);
  assert.equal(r.raw_unique_observations, 0);
  assert.equal(r.distinct_state_fingerprints, 1);
  assert.equal(r.states_without_successful_jev, 1);
  assert.equal(r.distinct_comparable_states, 0);
});
