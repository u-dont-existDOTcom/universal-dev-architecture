import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { routeFleetSupervisorReasoning } from "../lib/fleet-supervisor";
import { pendingDecisionRequests } from "../lib/github-decision-receipts";
import { seedStore } from "../lib/seed";
import { EventStore } from "../lib/store";
import { SubmissionAuthorityRuntime } from "../lib/submission-authority-runtime";

const token = "daemon-proof-token-" + "x".repeat(40);
const relayId = "collector:daemon-proof-relay";

test("daemon serves one authenticated producer-scoped exact admission proof from its owning store", async () => {
  const port = await availablePort();
  const directory = mkdtempSync(join(tmpdir(), "mc-daemon-admission-proof-"));
  const filename = join(directory, "events.db");
  const now = Date.now();
  const environment = authorityEnvironment(now);
  let child: ReturnType<typeof spawn> | null = null;
  try {
    const store = new EventStore(filename);
    seedStore(store);
    const previousChats = process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
    const previousPolicy = process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
    process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = environment.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(receiptPolicy());
    let admissionId: string;
    try {
      const watch = store.ensureFleetSupervisorWatch("project:daemon-proof", "task:auth", "auth", new Date(now).toISOString());
      routeFleetSupervisorReasoning(store, watch, {
        trigger: "REASONING_REVIEW_OVERDUE", result: "Route daemon proof fixture.", state: "ACTIVE",
        reasoningRequired: true, mechanicalRecoveryEligible: false, notifyOwner: false, notificationReason: null,
      }, store.workerEvents(watch.worker));
      const source = pendingDecisionRequests(store.allEvents()).find((item) => item.worker === watch.worker)!;
      const authority = new SubmissionAuthorityRuntime(store, environment, () => now);
      const admitted = await authority.execute("admissions", admissionRequest(source.requestId, source.taskId), producer("auth"));
      admissionId = admitted.admissionId;
    } finally {
      if (previousChats === undefined) delete process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON; else process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = previousChats;
      if (previousPolicy === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON; else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = previousPolicy;
      store.close();
    }

    child = spawn(process.execPath, ["--import", "tsx", "daemon/server.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, ...environment, MISSION_CONTROL_DAEMON_HOST: "127.0.0.1",
        MISSION_CONTROL_DAEMON_PORT: String(port), MISSION_CONTROL_INTERNAL_TOKEN: token,
        MISSION_CONTROL_DB: filename, MISSION_CONTROL_SKIP_SEED: "1", MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON: "",
        MISSION_CONTROL_FLEET_SUPERVISOR_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (chunk) => { stderr += chunk; });
    await waitForListening(child, () => stderr);
    const origin = `http://127.0.0.1:${port}`;
    const exact = await fetch(`${origin}/submission-authority/admissions/proof?admission_id=${encodeURIComponent(admissionId)}`, {
      headers: headers(relayId, "auth", "task:auth"),
    });
    const exactText = await exact.text();
    assert.equal(exact.status, 200, exactText);
    const proof = JSON.parse(exactText);
    assert.equal(proof.kind, "MISSION_CONTROL_EXACT_ADMISSION_PROOF_V1");
    assert.equal(proof.admission.admissionId, admissionId);
    assert.equal(proof.targetLedgerCompleteness.complete, true);
    assert.equal(proof.targetLedgerCompleteness.chainValidated, true);

    const wrongProducer = await fetch(`${origin}/submission-authority/admissions/proof?admission_id=${encodeURIComponent(admissionId)}`, {
      headers: headers("collector:other", "auth", "task:auth"),
    });
    assert.equal(wrongProducer.status, 403);
    const wrongScope = await fetch(`${origin}/submission-authority/admissions/proof?admission_id=${encodeURIComponent(admissionId)}`, {
      headers: headers(relayId, "other", "task:auth"),
    });
    assert.equal(wrongScope.status, 403);
    const extra = await fetch(`${origin}/submission-authority/admissions/proof?admission_id=${encodeURIComponent(admissionId)}&extra=1`, {
      headers: headers(relayId, "auth", "task:auth"),
    });
    assert.equal(extra.status, 400);
  } finally {
    if (child) { child.kill("SIGTERM"); if (child.exitCode === null) await once(child, "exit"); }
    rmSync(directory, { recursive: true, force: true });
  }
});

function authorityEnvironment(now: number): Record<string, string> {
  return {
    NODE_ENV: "test", MISSION_CONTROL_SUPERVISOR_CHATS_JSON: JSON.stringify([projectManager()]),
    MISSION_CONTROL_SUBMISSION_PACING_DOMAIN: "chatgpt:daemon-proof",
    MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON: JSON.stringify({ schemaVersion: 1, leaseId: "lease:daemon-proof:1",
      deploymentId: "deployment:daemon-proof", epoch: 1, activeHostAlias: "proof-host", activeHostRole: "PRIMARY",
      issuedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(), splitBrainStatus: "SINGLE_ACTIVE_CONFIRMED" }),
    MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON: JSON.stringify({
      [relayId]: { hostAlias: "proof-host", hostRole: "PRIMARY", automationWindowId: 41, ownedTargetIds: ["proof-target"] },
    }),
    MISSION_CONTROL_SUBMISSION_RELAY_ATTESTORS_JSON: JSON.stringify({ [relayId]: "proof-attestor-" + "a".repeat(40) }),
    MISSION_CONTROL_INGEST_CREDENTIALS: JSON.stringify({
      [relayId]: { kind: "COLLECTOR", token: "proof-bearer-" + "b".repeat(40), workers: ["auth"], tasks: ["task:auth"] },
    }),
    MISSION_CONTROL_MIN_SUBMISSION_INTERVAL_MS: "60000", MISSION_CONTROL_SUBMISSION_ADMISSION_TTL_MS: "120000",
  };
}

function producer(worker: string) { return { id: relayId, kind: "COLLECTOR" as const, workerScopes: [worker], taskScopes: ["task:auth"] }; }
function headers(id: string, worker: string, task: string): HeadersInit {
  return { authorization: `Bearer ${token}`, "x-mission-control-producer-id": id, "x-mission-control-producer-kind": "COLLECTOR",
    "x-mission-control-worker-scopes": worker, "x-mission-control-task-scopes": task };
}
function admissionRequest(requestId: string, taskId: string) {
  return { requestId, authorizationRef: taskId, queueKey: `request:${requestId}:IN_BAND_REQUEST_DECISION`,
    retryRootKey: `request:${requestId}:IN_BAND_REQUEST_DECISION`, sendPath: "SUPERVISORY_CYCLE_IN_BAND_REQUEST_DECISION",
    hostAlias: "proof-host", hostRole: "PRIMARY", deploymentEpoch: 1, leaseId: "lease:daemon-proof:1",
    supervisorId: "mc-project-manager", registrationId: "registration:test:mc-project-manager", targetId: "proof-target",
    automationWindowId: 41, targetKind: "REGISTERED_BOOTSTRAP", targetKey: "bootstrap:pm",
    expectedUrlSha256: createHash("sha256").update("https://chatgpt.com/c/test-project-manager").digest("hex"), bodySha256: "a".repeat(64) };
}
function projectManager() {
  return { scope: "PROJECT_MANAGER", supervisorId: "mc-project-manager", label: "MC project manager", workerId: null,
    requiredApp: "Mission Control", registrationId: "registration:test:mc-project-manager", ownership: "MISSION_CONTROL_ONLY",
    purpose: "Dedicated Mission Control reasoning supervisor", accountAlias: "owner-account", workspaceAlias: "personal",
    privateLocatorRef: "owner-config:test:mc-project-manager", registrationProvenance: { registeredBy: "OWNER",
      registeredAt: "2026-09-20T00:00:00.000Z", sourceRef: "owner:test" }, consumerControls: {
      modelSelectionPolicy: "TOP_VISIBLE_SELECTABLE_MODEL", thinkingControlLabel: "Thinking effort", thinkingVisibleLabel: "Extra High",
      thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro", accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false },
    bootstrapCapability: { chatId: "bootstrap:pm", url: "https://chatgpt.com/c/test-project-manager", challengeId: "challenge:pm" } };
}
function receiptPolicy() { return { repository: "owner/private-receipts", decisionIssueNumber: 4, capabilityIssueNumber: 4,
  stageIssueNumber: 4, authorizedWriterLogins: ["owner"], capabilityChallenges: [], requestBound: { enabled: true, relayProducerIds: [relayId] } }; }
async function availablePort() { const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object"); server.close(); await once(server, "close"); return address.port; }
async function waitForListening(child: ReturnType<typeof spawn>, stderr: () => string) { let output = ""; child.stdout!.setEncoding("utf8");
  child.stdout!.on("data", (chunk) => { output += chunk; }); for (let attempt = 0; attempt < 400; attempt += 1) {
    if (output.includes("Mission Control daemon listening")) return; if (child.exitCode !== null) throw new Error(`Daemon exited: ${stderr()}`); await delay(25); }
  throw new Error(`Timed out waiting for daemon: ${stderr()}`); }
