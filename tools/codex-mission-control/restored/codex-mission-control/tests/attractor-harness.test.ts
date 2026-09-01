import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function invoke(script: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { cwd: appRoot, encoding: "utf8" });
}

test("diagnosis-control harness keeps only matched direct/n8n arms and rejects contaminated state", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-attractor-"));
  try {
    const planPath = path.join(directory, "plan.json");
    const runsPath = path.join(directory, "runs.jsonl");
    const evaluationsPath = path.join(directory, "evaluations.jsonl");
    const candidatePath = path.join(directory, "candidate.txt");
    const prepare = invoke("scripts/prepare-attractor-experiment.mjs", [
      "--output", planPath,
      "--seed", "fixed-test-seed-20260901",
    ]);
    assert.equal(prepare.status, 0, prepare.stderr);
    const prepared = JSON.parse(prepare.stdout) as {
      status: string;
      stage: string;
      runs: number;
      arms: string[];
      deferredArms: string[];
      diagnosisAccuracyCountsAsProgress: boolean;
      paidExecutionAuthorized: boolean;
    };
    assert.equal(prepared.status, "RUN_PLAN_PREPARED_NOT_EXECUTED");
    assert.equal(prepared.stage, "BOUNDED_EXECUTION_STATE_ISOLATION_DIAGNOSTIC");
    assert.equal(prepared.runs, 16);
    assert.deepEqual(prepared.arms.sort(), ["DIRECT_FRESH_PROCESS", "N8N_ISOLATED_EXECUTION"]);
    assert.deepEqual(prepared.deferredArms, ["HERMES_ISOLATED_PROFILE_MEMORY_DISABLED"]);
    assert.equal(prepared.diagnosisAccuracyCountsAsProgress, false);
    assert.equal(prepared.paidExecutionAuthorized, false);

    const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as {
      schemaVersion: number;
      runPlanSha256: string;
      causalModel: {
        diagnosisAvailable: boolean;
        generativeControlAvailableThroughOrdinarySelfCritique: boolean;
        diagnosisAccuracyCountsAsProgress: boolean;
      };
      controls: {
        sameExactModelAcrossArms: boolean;
        selfDiagnosisReturnedToWriter: boolean;
        modelDebate: boolean;
      };
      deferredArms: Array<{ id: string; disposition: string }>;
      decisionRules: { sharedFailureNextStage: string[]; noMoreDiagnosisLoop: string };
      runs: Array<{ runId: string; arm: string; behaviorCellId: string; exactWriterInputSha256: string }>;
    };
    assert.equal(plan.schemaVersion, 2);
    assert.match(plan.runPlanSha256, /^[a-f0-9]{64}$/);
    assert.equal(plan.causalModel.diagnosisAvailable, true);
    assert.equal(plan.causalModel.generativeControlAvailableThroughOrdinarySelfCritique, false);
    assert.equal(plan.causalModel.diagnosisAccuracyCountsAsProgress, false);
    assert.equal(plan.controls.sameExactModelAcrossArms, true);
    assert.equal(plan.controls.selfDiagnosisReturnedToWriter, false);
    assert.equal(plan.controls.modelDebate, false);
    assert.equal(plan.deferredArms[0]?.disposition, "DEFER_NO_DISTINCT_CONTROL_MECHANISM");
    assert.ok(plan.decisionRules.sharedFailureNextStage.includes("ACTIVATION_OR_REPRESENTATION_STEERING_ON_AN_OPEN_MODEL"));
    assert.match(plan.decisionRules.noMoreDiagnosisLoop, /another critic/i);

    const arms = [...new Set(plan.runs.map((run) => run.arm))];
    assert.deepEqual(arms.sort(), ["DIRECT_FRESH_PROCESS", "N8N_ISOLATED_EXECUTION"]);
    assert.equal(plan.runs.some((run) => run.arm.includes("HERMES")), false);
    for (const arm of arms) assert.equal(plan.runs.filter((run) => run.arm === arm).length, 8);
    const cellSets = arms.map((arm) => [...new Set(plan.runs.filter((run) => run.arm === arm).map((run) => run.behaviorCellId))].sort());
    assert.deepEqual(cellSets[1], cellSets[0]);
    assert.equal(new Set(plan.runs.map((run) => run.exactWriterInputSha256)).size, 8, "matched arms must reuse the same eight exact writer inputs");

    fs.writeFileSync(candidatePath, `${Array.from({ length: 55 }, (_, index) => `word${index + 1}`).join(" ")}.\n`);
    const run = plan.runs[0];
    const generationConfigSha256 = "b".repeat(64);
    const common = [
      "--plan", planPath,
      "--run-id", run.runId,
      "--candidate", candidatePath,
      "--output", runsPath,
      "--provider-surface", "CHATGPT_CONSUMER",
      "--model-family", "GPT-5.6",
      "--exact-model-identifier", "gpt-5.6-pro-test",
      "--model-mode", "PRO",
      "--generation-config-sha256", generationConfigSha256,
      "--orchestrator-version", "test-direct-v2",
      "--started-at", "2026-09-01T13:00:00.000Z",
      "--completed-at", "2026-09-01T13:00:10.000Z",
      "--memory-state", "DISABLED",
      "--session-search-state", "DISABLED",
      "--inherited-state-flags", "NONE",
      "--runtime-identity-status", "VERIFIED",
    ];
    const dryRun = invoke("scripts/record-attractor-run.mjs", [...common, "--dry-run"]);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    const dryRecord = JSON.parse(dryRun.stdout) as {
      status: string;
      exactModelIdentifier: string;
      generationConfigSha256: string;
    };
    assert.equal(dryRecord.status, "CANDIDATE_PROVENANCE_VALID_DRY_RUN");
    assert.equal(dryRecord.exactModelIdentifier, "gpt-5.6-pro-test");
    assert.equal(dryRecord.generationConfigSha256, generationConfigSha256);

    const unknownModel = invoke("scripts/record-attractor-run.mjs", [
      ...common.map((item, index, list) => list[index - 1] === "--exact-model-identifier" ? "UNKNOWN" : item),
      "--dry-run",
    ]);
    assert.notEqual(unknownModel.status, 0);
    assert.match(unknownModel.stderr, /exact non-UNKNOWN model identifier/);

    const contaminated = invoke("scripts/record-attractor-run.mjs", [
      ...common.map((item, index, list) => list[index - 1] === "--memory-state" ? "ENABLED" : item),
      "--dry-run",
    ]);
    assert.notEqual(contaminated.status, 0);
    assert.match(contaminated.stderr, /Persistent memory must be DISABLED/);

    const recorded = invoke("scripts/record-attractor-run.mjs", common);
    assert.equal(recorded.status, 0, recorded.stderr);
    assert.equal(JSON.parse(recorded.stdout).status, "CANDIDATE_PROVENANCE_RECORDED");

    const duplicateRun = plan.runs.find((item) => item.runId !== run.runId)!;
    const duplicate = invoke("scripts/record-attractor-run.mjs", common.map((item, index, list) => list[index - 1] === "--run-id" ? duplicateRun.runId : item));
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /exact candidate already exists/i);

    const evaluation = invoke("scripts/record-attractor-evaluation.mjs", [
      "--plan", planPath,
      "--runs", runsPath,
      "--output", evaluationsPath,
      "--run-id", run.runId,
      "--verdict", "PASS",
      "--evaluator-message-receipt-id", "chat-message:test-evaluator:1",
      "--evaluator-sent-at-source", "2026-09-01T13:01:00.000Z",
      "--evaluator-provenance-status", "OWNER_ATTESTED",
      "--runtime-identity-visible", "false",
      "--verdict-frozen-before-state-read", "true",
    ]);
    assert.equal(evaluation.status, 0, evaluation.stderr);
    assert.equal(JSON.parse(evaluation.stdout).status, "BLIND_EDITORIAL_VERDICT_RECORDED");

    const report = invoke("scripts/report-attractor-experiment.mjs", [
      "--plan", planPath,
      "--runs", runsPath,
      "--evaluations", evaluationsPath,
    ]);
    assert.equal(report.status, 0, report.stderr);
    const summary = JSON.parse(report.stdout) as {
      complete: boolean;
      decision: string;
      diagnosisAccuracyCountedAsProgress: boolean;
      automaticAdoptionPerformed: boolean;
    };
    assert.equal(summary.complete, false);
    assert.equal(summary.decision, "INCOMPLETE_OR_INVALID_NO_COMPARATIVE_CLAIM");
    assert.equal(summary.diagnosisAccuracyCountedAsProgress, false);
    assert.equal(summary.automaticAdoptionPerformed, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
