import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { JevShadowObservation, JevShadowState } from "../lib/jev-shadow";
import { initializeJevShadowTelemetry, recordJevShadowObservation } from "../lib/jev-shadow-telemetry";
import { exportJevV2Cases } from "../scripts/jev-v2-export";
import { scoreJevV2 } from "../scripts/jev-v2-score";

const healthy: JevShadowState = {
  chain_valid: true, queue_terminal: false, owner_action_kind: "NONE", open_blocker_present: false,
  blocker_actor_kind: "NONE", delivery_status: "NONE", delivery_error_family: "NONE", contract_owner_alignment: "MATCH",
  outcome_advancement: "ADVANCING", strategy_efficacy: "VIABLE", correction_owner_action_type: "NONE",
  pending_reasoning_review: false, review_freshness: "CURRENT", active_directive_present: true, execution_state: "RUNNING_WITH_DIRECTIVE",
};
const owner: JevShadowState = { ...healthy, owner_action_kind: "DECISION_REQUIRED" };
const stalled: JevShadowState = { ...healthy, outcome_advancement: "FLAT" };

function seen(state: JevShadowState, trigger: JevShadowObservation["deterministic_trigger"], answer?: string): JevShadowObservation {
  return { status: answer ? "OK" : "ERROR", authoritative: false, model: "typesafe/jev-1.13", deterministic_trigger: trigger,
    state, ...(answer ? { answers: { next_action: { choice: answer } } } : { error_code: "HTTP_ERROR" as const, http_status: 402 }) };
}

test("the V2 export is read-only, blind, private-field-free and frozen", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "jev-v2-"));
  try {
    const file = path.join(dir, "mc.db");
    const writer = new DatabaseSync(file);
    initializeJevShadowTelemetry(writer);
    const record = (observation: JevShadowObservation, n: number) => recordJevShadowObservation(writer,
      { source: "LIVE", projectId: "project:private-name", observedAt: new Date(Date.UTC(2026, 10, 1) + n * 1000).toISOString(), observation });
    record(seen(healthy, "HEALTHY_ADVANCING", "no_action_healthy"), 1);
    record(seen(healthy, "HEALTHY_ADVANCING", "no_action_healthy"), 2);
    record(seen(owner, "OWNER_ACTION_REQUIRED", "notify_owner"), 3);
    // One stored state, two triggers with different deterministic actions: no single baseline.
    record(seen(stalled, "STALLED_OR_REGRESSING"), 4);
    record(seen(stalled, "SUPERVISOR_HOLD"), 5);
    writer.close();
    const readOnly = new DatabaseSync(file, { readOnly: true });
    const lines = exportJevV2Cases(readOnly);
    readOnly.close();
    const text = JSON.stringify(lines);
    assert.doesNotMatch(text, /private-name|project_id|observed_at|2026-11-01/);
    const blind = lines.filter((line) => line.kind === "blind");
    const packets = lines.filter((line) => line.kind === "packet");
    const reconciliation = lines.filter((line) => line.kind === "reconciliation");
    assert.equal(blind.length, 3);
    assert.equal(packets.length, 3);
    assert.ok(blind.every((line) => line.cohort === "CONFIRMATION" && line.prompt_version === "jev-independent-v2-20261115"));
    assert.ok(blind.every((line) => !("deterministic_triggers" in line) && !("historical_v1" in line)));
    const request = packets[0].jev_request as { model: string; questions: Record<string, { instructions: string }> };
    assert.equal(request.model, "typesafe/jev-1.14");
    assert.doesNotMatch(JSON.stringify(request), /ordered control policy|deterministic_trigger|HEALTHY_ADVANCING/);
    const ambiguous = reconciliation.find((line) => (line.deterministic_actions as string[]).length === 2)!;
    assert.deepEqual(ambiguous.deterministic_actions, ["notify_owner", "route_reasoning"]);
    assert.deepEqual(lines.at(-1), { kind: "summary", distinct_states: 3, observations_with_state: 5,
      states_with_more_than_one_deterministic_action: 1, prompt_version: "jev-independent-v2-20261115", provider_calls: 0 });

    // Score: gold labels (frozen first), the runner's ledger for two versions, and a blinded stronger model.
    const id = (state: JevShadowState) => blind.find((line) => JSON.stringify(line.state) === JSON.stringify(state))!;
    const gold = [
      { case_id: id(healthy).case_id, state_fingerprint: id(healthy).state_fingerprint, gold_action: "no_action_healthy", evidence_ref: "adjudication:1", cohort: "CONFIRMATION" },
      // The deterministic table interrupts the owner here; the adjudicator says the supervisor should review first.
      { case_id: id(owner).case_id, state_fingerprint: id(owner).state_fingerprint, gold_action: "route_reasoning", evidence_ref: "adjudication:2", cohort: "CONFIRMATION" },
      { case_id: id(stalled).case_id, state_fingerprint: id(stalled).state_fingerprint, gold_action: "route_reasoning", evidence_ref: "adjudication:3", cohort: "CONFIRMATION" },
    ];
    const entry = (caseId: unknown, model: string, choice: string | null, n: number) => ({ case_id: caseId, model,
      call_identity: "call-" + n, status: choice ? "OK" : "HTTP_ERROR", response_id: choice ? "gen-" + n : null,
      typed_answers: choice ? { next_action: { choice } } : undefined, final_usd: choice ? "0.00004" : null, reserved_usd: "0.002",
      latency_ms: 100 + n });
    const ledger = { entries: [
      entry(id(healthy).case_id, "typesafe/jev-1.14", "no_action_healthy", 1),
      entry(id(owner).case_id, "typesafe/jev-1.14", "route_reasoning", 2),
      entry(id(healthy).case_id, "typesafe/jev-1.13", "route_reasoning", 3),
      entry(id(owner).case_id, "typesafe/jev-1.13", null, 4),
      entry("dmso-askrigor-case", "typesafe/jev-1.14", "x", 5),
    ] };
    const stronger = [{ case_id: id(owner).case_id, action: "route_reasoning" }];
    const result = scoreJevV2({ gold, reconciliation: lines, ledger, stronger });
    assert.deepEqual(result.cases_without_single_baseline, [id(stalled).case_id]);
    assert.equal(result.scored_cases, 2);
    assert.deepEqual(Object.keys(result.by_model), ["typesafe/jev-1.13", "typesafe/jev-1.14"]);
    const latest = result.by_model["typesafe/jev-1.14"];
    assert.equal(latest.distinct_comparable_states, 2);
    assert.equal(latest.baseline_correct, 1);
    assert.equal(latest.jev_correct, 2);
    assert.equal(latest.incremental_catches, 1);
    assert.equal(latest.introduced_errors, 0);
    assert.equal(latest.missed_owner_actions, 0);
    assert.equal(latest.baseline_false_owner_interruptions, 1);
    assert.equal(latest.baseline_missed_owner_actions, 0);
    assert.equal(latest.stronger_comparable, 1);
    assert.equal(latest.stronger_correct, 1);
    const legacy = result.by_model["typesafe/jev-1.13"];
    assert.equal(legacy.distinct_comparable_states, 1);
    assert.equal(legacy.states_without_successful_jev, 1);
    assert.equal(legacy.introduced_errors, 1);
    assert.equal(legacy.provider_failures, 1);
    assert.throws(() => scoreJevV2({ gold: [...gold, gold[0]], reconciliation: lines, ledger }), /two gold labels/);
    assert.throws(() => scoreJevV2({ gold: [{ ...gold[0], evidence_ref: "" }], reconciliation: lines, ledger }), /evidence/);
    const { state_fingerprint: _dropped, ...unfingerprinted } = gold[0];
    assert.throws(() => scoreJevV2({ gold: [unfingerprinted], reconciliation: lines, ledger }), /fingerprint/);
    assert.throws(() => scoreJevV2({ gold: [{ ...gold[0], state_fingerprint: gold[1].state_fingerprint }], reconciliation: lines, ledger }),
      /fingerprint/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
