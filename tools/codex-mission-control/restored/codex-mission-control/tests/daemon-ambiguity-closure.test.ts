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

import { EventStore } from "../lib/store";
import { SubmissionAuthorityRuntime } from "../lib/submission-authority-runtime";

const token = "daemon-closure-token-" + "x".repeat(40);
const relayId = "collector:daemon-closure-relay";

test("daemon closes one expired admission on the admitting relay's owner decision and reopens its authority", async () => {
  const port = await availablePort();
  const directory = mkdtempSync(join(tmpdir(), "mc-daemon-ambiguity-closure-"));
  const filename = join(directory, "events.db");
  const now = Date.now();
  const environment = authorityEnvironment(now);
  let child: ReturnType<typeof spawn> | null = null;
  try {
    // The relay was admitted ten minutes ago and stopped before any boundary was recorded.
    const store = new EventStore(filename);
    let admissionId: string;
    let expiresAt: string;
    try {
      const authority = new SubmissionAuthorityRuntime(store, environment, () => now - 600_000);
      const admitted = await authority.execute("admissions", admissionRequest(), producer());
      admissionId = admitted.admissionId;
      expiresAt = admitted.expiresAt;
    } finally {
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

    const before = await (await fetch(`${origin}/submission-authority/status`, { headers: headers(relayId) })).json();
    assert.equal(before.unresolvedAdmission.admissionId, admissionId);
    assert.equal(before.ready, false);

    const closure = { admissionId, requestId: "request:daemon-closure", bodySha256: "a".repeat(64),
      decision: "OWNER_DISCARDED_NO_REPLAY", decidedAt: new Date(Date.parse(expiresAt) + 1_000).toISOString() };
    const wrongProducer = await fetch(`${origin}/submission-authority/admissions/close-ambiguous`, {
      method: "POST", headers: { ...headers("collector:other"), "content-type": "application/json" }, body: JSON.stringify(closure),
    });
    assert.equal(wrongProducer.status, 403, await wrongProducer.text());
    const closed = await fetch(`${origin}/submission-authority/admissions/close-ambiguous`, {
      method: "POST", headers: { ...headers(relayId), "content-type": "application/json" }, body: JSON.stringify(closure),
    });
    const closedText = await closed.text();
    assert.equal(closed.status, 200, closedText);
    const result = JSON.parse(closedText);
    assert.equal(result.closed, true);
    assert.equal(result.duplicate, false);

    const after = await (await fetch(`${origin}/submission-authority/status`, { headers: headers(relayId) })).json();
    assert.equal(after.unresolvedAdmission, null);
    assert.equal(after.queueDepth, 0);
    assert.equal(after.ready, true);
    const unknown = await fetch(`${origin}/submission-authority/admissions/close-ambiguous/extra`, {
      method: "POST", headers: { ...headers(relayId), "content-type": "application/json" }, body: JSON.stringify(closure),
    });
    assert.equal(unknown.status, 404);
  } finally {
    if (child) { child.kill("SIGTERM"); if (child.exitCode === null) await once(child, "exit"); }
    rmSync(directory, { recursive: true, force: true });
  }
});

function authorityEnvironment(now: number): Record<string, string> {
  return {
    NODE_ENV: "test", MISSION_CONTROL_SUPERVISOR_CHATS_JSON: JSON.stringify([specialist()]),
    MISSION_CONTROL_SUBMISSION_PACING_DOMAIN: "chatgpt:daemon-closure",
    MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON: JSON.stringify({ schemaVersion: 1, leaseId: "lease:daemon-closure:1",
      epoch: 1, activeHostAlias: "closure-host", activeHostRole: "PRIMARY",
      issuedAt: new Date(now - 3_600_000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(), splitBrainStatus: "SINGLE_ACTIVE_CONFIRMED" }),
    MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON: JSON.stringify({
      [relayId]: { hostAlias: "closure-host", hostRole: "PRIMARY", automationWindowId: 41, ownedTargetIds: ["closure-target"] },
    }),
    MISSION_CONTROL_SUBMISSION_RELAY_ATTESTORS_JSON: JSON.stringify({ [relayId]: "closure-attestor-" + "a".repeat(40) }),
    MISSION_CONTROL_INGEST_CREDENTIALS: JSON.stringify({
      [relayId]: { kind: "COLLECTOR", token: "closure-bearer-" + "b".repeat(40), workers: ["worker-a"], tasks: ["*"] },
    }),
    MISSION_CONTROL_MIN_SUBMISSION_INTERVAL_MS: "60000", MISSION_CONTROL_SUBMISSION_ADMISSION_TTL_MS: "120000",
  };
}

function producer() { return { id: relayId, kind: "COLLECTOR" as const, workerScopes: ["worker-a"], taskScopes: ["*"] }; }
function headers(id: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, "x-mission-control-producer-id": id, "x-mission-control-producer-kind": "COLLECTOR",
    "x-mission-control-worker-scopes": "worker-a", "x-mission-control-task-scopes": "*" };
}
function admissionRequest() {
  return { requestId: "request:daemon-closure", authorizationRef: "task:worker-a", queueKey: "queue:daemon-closure",
    retryRootKey: "queue:daemon-closure", sendPath: "SUPERVISOR_MESSAGE", hostAlias: "closure-host", hostRole: "PRIMARY",
    deploymentEpoch: 1, leaseId: "lease:daemon-closure:1", supervisorId: "spec", registrationId: "registration:spec:closure",
    targetId: "closure-target", automationWindowId: 41, targetKind: "REGISTERED_BOOTSTRAP", targetKey: "bootstrap-closure",
    expectedUrlSha256: createHash("sha256").update("https://chatgpt.com/c/bootstrap-closure").digest("hex"), bodySha256: "a".repeat(64) };
}
function specialist() {
  return { scope: "SPECIALIST", supervisorId: "spec", label: "Dedicated supervisor", workerId: "worker-a",
    requiredApp: "Mission Control", registrationId: "registration:spec:closure", ownership: "MISSION_CONTROL_ONLY",
    purpose: "Dedicated Mission Control supervision only.", accountAlias: "owner-account", workspaceAlias: "mission-control",
    privateLocatorRef: "private-config:supervisors/spec", registrationProvenance: { registeredBy: "OWNER",
      registeredAt: "2026-09-11T11:00:00.000Z", sourceRef: "owner-requirement:90" },
    bootstrapCapability: { chatId: "bootstrap-closure", url: "https://chatgpt.com/c/bootstrap-closure", challengeId: "challenge-closure" },
    consumerControls: { modelVisibleLabel: "GPT-5.6 Sol", thinkingControlLabel: "Thinking effort", thinkingVisibleLabel: "Extra High",
      thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro", accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false } };
}
async function availablePort() { const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object"); server.close(); await once(server, "close"); return address.port; }
async function waitForListening(child: ReturnType<typeof spawn>, stderr: () => string) { let output = ""; child.stdout!.setEncoding("utf8");
  child.stdout!.on("data", (chunk) => { output += chunk; }); for (let attempt = 0; attempt < 400; attempt += 1) {
    if (output.includes("Mission Control daemon listening")) return; if (child.exitCode !== null) throw new Error(`Daemon exited: ${stderr()}`); await delay(25); }
  throw new Error(`Timed out waiting for daemon: ${stderr()}`); }
