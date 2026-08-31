import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Hermes experiment is bounded, non-authoritative, and executable without adopting Hermes", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "experiments/hermes/experiment.json"), "utf8"));
  assert.equal(manifest.status, "QUEUED_EXPERIMENT");
  assert.equal(manifest.authority.hermesIsAuthoritative, false);
  assert.equal(manifest.authority.missionControlLedgerRemainsSourceOfTruth, true);
  assert.equal(manifest.authority.symphonyRoleChanges, false);
  assert.equal(manifest.bounds.maximumCalendarDays, 7);
  assert.equal(manifest.scenarios.length, 3);
  assert.equal(manifest.adoptionGate.defaultDecision, "DO_NOT_ADOPT");
  const run = spawnSync(process.execPath, ["scripts/run-hermes-experiment.mjs", "--arm", "baseline", "--scenario", "continuity-after-restart", "--dry-run"], { cwd: appRoot, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.dryRun, true);
  assert.equal(result.authority.hermesIsAuthoritative, false);
});

test("n8n evaluation is pass-through only and parity comparison fails closed", () => {
  const evaluation = JSON.parse(fs.readFileSync(path.join(appRoot, "experiments/n8n/evaluation.json"), "utf8"));
  const workflow = JSON.parse(fs.readFileSync(path.join(appRoot, "experiments/n8n/pass-through-workflow.json"), "utf8"));
  assert.equal(evaluation.status, "QUEUED_EVALUATION");
  assert.equal(evaluation.sourceOfTruth, false);
  assert.equal(evaluation.reasoningAuthority, false);
  assert.equal(evaluation.schedulingAuthority, false);
  assert.equal(evaluation.defaultDecision, "KEEP_DIRECT_ADAPTER");
  assert.equal(workflow.active, false);
  assert.equal(workflow.meta.missionControlAuthority, false);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-n8n-eval-"));
  try {
    const direct = path.join(directory, "direct.jsonl");
    const matching = path.join(directory, "matching.jsonl");
    const changed = path.join(directory, "changed.jsonl");
    const event = { schema_version: 2, event_id: "event:1", data: { type: "worker_message_recorded", body: "same" } };
    fs.writeFileSync(direct, `${JSON.stringify(event)}\n`);
    fs.writeFileSync(matching, `${JSON.stringify({ event_id: "event:1", data: { body: "same", type: "worker_message_recorded" }, schema_version: 2 })}\n`);
    fs.writeFileSync(changed, `${JSON.stringify({ ...event, event_id: "event:2" })}\n`);
    const pass = spawnSync(process.execPath, ["scripts/evaluate-n8n-adapter.mjs", "--direct", direct, "--candidate", matching], { cwd: appRoot, encoding: "utf8" });
    assert.equal(pass.status, 0, pass.stderr);
    assert.equal(JSON.parse(pass.stdout).exactEventParity, true);
    const fail = spawnSync(process.execPath, ["scripts/evaluate-n8n-adapter.mjs", "--direct", direct, "--candidate", changed], { cwd: appRoot, encoding: "utf8" });
    assert.equal(fail.status, 1);
    assert.equal(JSON.parse(fail.stdout).decision, "KEEP_DIRECT_ADAPTER");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
