import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { canonicalJson, sha256 } from "../lib/canonical";
import { executionDirectiveArtifactCanonicalJson } from "../lib/github-execution-directive";
import { WORK_MODEL_ROUTING_POLICY_BASE_COMMIT, WORK_MODEL_ROUTING_POLICY_REF } from "../lib/work-execution-profile";

const now = "2026-09-21T01:50:00.000Z";
const worker = "mission-control-development";
const supervisorId = "mc-project-manager";

function profile() {
  return {
    model: "GPT_5_6_SOL" as const, effort: "MEDIUM" as const, routingTier: "SOL_MEDIUM" as const,
    routingTriggers: [], fastModeRequest: "DO_NOT_ENABLE_FAST" as const,
    assuranceRequirement: "SET_REQUEST_SUFFICIENT" as const,
    policyRef: WORK_MODEL_ROUTING_POLICY_REF, routingPolicyBaseCommit: WORK_MODEL_ROUTING_POLICY_BASE_COMMIT,
    contractVersion: "TRUSTED_SETTER_V1" as const,
  };
}

async function runWatcherOnce(allowedWorkersJson: string | undefined) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mc-work-autodispatcher-"));
  const privateRoot = path.join(root, "private");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(privateRoot, { mode: 0o700 }));
  await chmod(privateRoot, 0o700);
  const capturePath = path.join(root, "controller-request.json");
  const fakeController = path.join(root, "fake-controller.mjs");
  await writeFile(fakeController, `#!/usr/bin/env node\nimport fs from "node:fs";\nconst i=process.argv.indexOf("--request");\nconst p=process.argv[i+1];\nconst value=JSON.parse(fs.readFileSync(p,"utf8"));\nfs.writeFileSync(process.env.FAKE_CAPTURE_PATH,JSON.stringify(value));\nprocess.stdout.write(JSON.stringify({result:{data:{status:"READY"}}}));\n`, { mode: 0o700 });
  await chmod(fakeController, 0o700);

  const bounded = {
    schema_version: 1 as const, task_id: "task:mission-control-development", job_id: "job-mc-selfdev-canary",
    execution_objective: "Create one harmless isolated child branch receipt.", reasoning_summary: "Chat already selected the bounded canary.",
    strategy_id: "strategy:mc-selfdev-canary", strategy_causal_hypothesis: "Automatic native Work dispatch removes owner clipboard transport.",
    predicted_outcome_change: "Work launches without an owner-authored request file.", success_threshold: "Watcher invokes direct controller exactly once.",
    failure_threshold: "Watcher remains idle or routes to Codex.", next_decision_changing_evidence: "Direct controller request and execution receipt.",
    reviewed_evidence_boundary: "Current canonical Mission Control state.",
    inputs: [{ type: "GITHUB", ref: "current-main", sha256: "1".repeat(64) }],
    allowed_actions: ["create isolated child branch"], allowed_paths: ["."], allowed_commands: ["focused tests"],
    forbidden_actions: ["production deployment"], forbidden_paths: [], forbidden_decisions: ["methodology"],
    required_evidence: ["execution receipt"], required_tests_or_checks: ["focused canary"], stop_and_return_triggers: ["completion"],
    maximum_execution_cycles: 1, execution_capability: { type: "LOCAL_FILESYSTEM_COMMAND" as const }, workspace: "/tmp/mc-selfdev",
    output_schema: { status: "string" }, prompt: "EXACT SELF-DEVELOPMENT CANARY DIRECTIVE", deadline: "2099-09-22T00:00:00.000Z",
    work_execution_profile: profile(), execution_surface: "CHATGPT_WORK_CLOUD" as const,
  };
  const sourceDirective = { id: "directive:mc-selfdev", revision: 1, taskId: bounded.task_id,
    sourceMessageId: "message:mc-selfdev", sourceBodySha256: "2".repeat(64) };
  const artifact = executionDirectiveArtifactCanonicalJson({ bounded, sourceDirective, requestedModel: "gpt-5.6-sol", reasoningEffort: "medium" });
  const events = [
    { eventId: "receipt:mc-selfdev", worker, sequence: 1, data: { type: "github_decision_receipt_ingested", worker,
      request_id: "request:mc-selfdev", task_id: bounded.task_id, supervisor_id: supervisorId, reasoning_lane: "EXTRA_HIGH_DIRECT",
      bounded_execution: bounded, bounded_execution_sha256: sha256(canonicalJson(bounded)) } },
    { eventId: "directive-event:mc-selfdev", worker, sequence: 2, data: { type: "execution_directive_recorded", worker,
      directive_id: sourceDirective.id, directive_revision: 1, task_id: bounded.task_id, directive_schema_version: 3,
      source_message_id: sourceDirective.sourceMessageId, source_body_sha256: sourceDirective.sourceBodySha256,
      directive_artifact_sha256: sha256(artifact), execution_surface: "CHATGPT_WORK_CLOUD", work_execution_profile: profile(), status: "ACTIVE",
      validated_decision_proof: { authority_path: "VALIDATED_GITHUB_SUPERVISORY_DECISION", receipt_event_id: "receipt:mc-selfdev",
        bounded_execution_sha256: sha256(canonicalJson(bounded)) } } },
  ];
  const server = http.createServer((request, response) => {
    if (request.url === "/events") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ events }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const inherited = { ...process.env };
  delete inherited.MISSION_CONTROL_CHATGPT_WORK_AUTODISPATCH_WORKERS_JSON;
  try {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/run-chatgpt-work-cloud-autodispatcher.ts", "--once"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...inherited,
        ...(allowedWorkersJson === undefined ? {} : { MISSION_CONTROL_CHATGPT_WORK_AUTODISPATCH_WORKERS_JSON: allowedWorkersJson }),
        MISSION_CONTROL_DAEMON_URL: `http://127.0.0.1:${address.port}`,
        MISSION_CONTROL_INTERNAL_TOKEN: "fixture-secret",
        MISSION_CONTROL_CHATGPT_WORK_AUTODISPATCH_DIR: privateRoot,
        MISSION_CONTROL_CHATGPT_WORK_CONTROLLER_COMMAND: fakeController,
        MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON: JSON.stringify({ repository: "u-dont-existDOTcom/universal-dev-architecture", decisionIssueNumber: 59, capabilityIssueNumber: 60, stageIssueNumber: 61, authorizedWriterLogins: ["u-dont-existDOTcom"], capabilityChallenges: [] }),
        MISSION_CONTROL_CHATGPT_WORK_SOURCE_CHATS_JSON: JSON.stringify([{ supervisorId, sourceChatTitle: "Mission Control Fleet Watch", sourceChatUrl: "chatgpt-conversation://abc-123", sourceChatBrowserUrl: "https://chatgpt.com/c/abc-123", chatgptProjectId: null }]),
        FAKE_CAPTURE_PATH: capturePath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("autodispatcher fixture timed out")); }, 15_000);
      child.once("error", reject);
      child.once("exit", (code) => { clearTimeout(timer); resolve(code); });
    });
    const controllerCalled = await stat(capturePath).then(() => true, () => false);
    return { exitCode, stdout, stderr, capturePath, privateRoot, controllerCalled, bounded };
  } finally {
    server.close();
  }
}

test("unattended watcher derives and invokes current direct Work controller from durable state", async () => {
  const { exitCode, stdout, stderr, capturePath, privateRoot, bounded } = await runWatcherOnce(JSON.stringify(["another-task", worker]));
  assert.equal(exitCode, 0, stderr);
  const output = JSON.parse(stdout.trim());
  assert.equal(output.status, "DISPATCH_CYCLE");
  assert.equal(output.worker, worker);
  assert.equal(output.controllerStatus, "READY");
  const request = JSON.parse(await readFile(capturePath, "utf8"));
  assert.equal(request.requestedWorkTitle, "Work — Mission Control Fleet Watch");
  assert.equal(request.sourceChatUrl, "chatgpt-conversation://abc-123");
  assert.equal(request.binding.directiveArtifactSha256, sha256(await readFile(request.directiveArtifactPath, "utf8")));
  assert.match(request.prompt, /EXACT SELF-DEVELOPMENT CANARY DIRECTIVE/);
  assert.deepEqual(JSON.parse(request.prompt.split("EXACT_BOUNDED_DIRECTIVE_BEGIN\n")[1]
    .split("\nEXACT_BOUNDED_DIRECTIVE_END")[0]), bounded);
  assert.equal((await stat(request.directiveArtifactPath)).mode & 0o077, 0);
  assert.equal(path.dirname(request.directiveArtifactPath), privateRoot);
});

test("the watcher leaves a worker that isn't on its worker list alone", async () => {
  const { exitCode, stdout, stderr, controllerCalled } = await runWatcherOnce(JSON.stringify(["another-task"]));
  assert.equal(exitCode, 0, stderr);
  assert.equal(JSON.parse(stdout.trim()).status, "IDLE");
  assert.equal(controllerCalled, false);
});

test("the watcher refuses to start without its worker list", async () => {
  for (const workersJson of [undefined, "", "[]", "\"mission-control-development\"", "[\"Mission Control\"]"]) {
    const { exitCode, stdout, stderr, controllerCalled } = await runWatcherOnce(workersJson);
    assert.notEqual(exitCode, 0, `${workersJson}: ${stdout}`);
    assert.match(stderr, /worker list/);
    assert.equal(controllerCalled, false);
  }
});
