import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalJson } from "../lib/canonical";
import { routeFleetSupervisorReasoning } from "../lib/fleet-supervisor";
import { pendingDecisionRequests } from "../lib/github-decision-receipts";
import { seedStore } from "../lib/seed";
import { EventStore } from "../lib/store";
import { SubmissionAuthorityRuntime } from "../lib/submission-authority-runtime";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";

const origin = Date.parse("2026-10-07T04:00:00.000Z");
const relay: AuthenticatedProducer = {
  id: "collector:proof-relay", kind: "COLLECTOR", workerScopes: ["auth"], taskScopes: ["task:auth"],
};

test("daemon-owned proof preserves exact admission/source identities and complete ledger across abort", async () => {
  const store = new EventStore(":memory:");
  const priorChats = process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
  const priorPolicy = process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
  const now = { value: origin };
  try {
    seedStore(store);
    process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = JSON.stringify([projectManager()]);
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(receiptPolicy());
    const watch = store.ensureFleetSupervisorWatch("project:proof", "task:auth", "auth", new Date(now.value).toISOString());
    const route = routeFleetSupervisorReasoning(store, watch, {
      trigger: "REASONING_REVIEW_OVERDUE", result: "Route exact proof fixture.", state: "ACTIVE",
      reasoningRequired: true, mechanicalRecoveryEligible: false, notifyOwner: false, notificationReason: null,
    }, store.workerEvents(watch.worker));
    assert.ok(route && route.data.type === "worker_message_recorded");
    const source = pendingDecisionRequests(store.allEvents()).find((item) => item.worker === watch.worker)!;
    assert.ok(source);
    const authority = proofRuntime(store, now);
    const admitted = await authority.execute("admissions", admissionRequest(source.requestId, source.taskId), relay);
    const readSnapshot = store.submissionAuthorityProofSnapshot.bind(store);
    (store as any).submissionAuthorityProofSnapshot = (domain: string) => {
      const snapshot = readSnapshot(domain);
      snapshot.records = snapshot.records.map((record) => record.queueItemId === admitted.queueItemId
        ? withoutRepairFields(record) : record);
      return snapshot;
    };
    const writesBeforeProof = store.submissionAuthorityProofSnapshot("chatgpt:proof").records.length;
    const before = await authority.exactAdmissionProof(admitted.admissionId, relay);
    assert.equal(store.submissionAuthorityProofSnapshot("chatgpt:proof").records.length, writesBeforeProof);
    assert.equal(before.kind, "MISSION_CONTROL_EXACT_ADMISSION_PROOF_V1");
    assert.equal(before.phase, "BEFORE_ABORT");
    assert.equal(before.admission.admissionId, admitted.admissionId);
    assert.equal(before.admission.requestId, source.requestId);
    assert.equal(before.admission.boundaryAt, null);
    assert.equal(before.admission.deliveryStatus, null);
    assert.equal(before.queueItem.request.bodySha256, "a".repeat(64));
    assert.equal(before.source.queuedEventId, route.eventId);
    assert.equal(before.source.queuedSourceSha256, createHash("sha256").update(route.data.body).digest("hex"));
    assert.equal(before.relayBinding.producerId, relay.id);
    assert.equal(before.relayBinding.deploymentEpoch, before.admission.deploymentEpoch);
    assert.equal(before.exactLedgerRecords.length, 2);
    assert.deepEqual(before.targetLedgerCompleteness, {
      complete: true, matchingRecordCount: 2, firstSequence: before.exactLedgerRecords[0].sequence,
      lastSequence: before.exactLedgerRecords[1].sequence, scannedHeadSequence: before.ledger.headSequence, chainValidated: true,
    });
    assert.equal(before.exactLedgerRecords[0].admissionId, null, "legacy enqueue rows preserve absent admission IDs as null");
    assert.equal(before.exactLedgerRecords[1].admissionId, null, "legacy admission rows preserve absent admission IDs as null");
    assert.ok(before.exactLedgerRecords.every((record: Record<string, unknown>) => Object.hasOwn(record, "admissionId")));
    assert.equal(before.proofSha256, createHash("sha256").update(canonicalJson(stripProof(before))).digest("hex"));

    const beforeHead = Number(before.ledger.headSequence);
    now.value += 1_000;
    await authority.execute("aborts", { admissionId: admitted.admissionId, relayStage: "PREPARING" }, relay);
    const after = await authority.exactAdmissionProof(admitted.admissionId, relay);
    assert.equal(after.admission.status, "ABORTED_BEFORE_BOUNDARY");
    assert.equal(after.phase, "AFTER_ABORT");
    assert.equal(after.admission.abortStage, "PREPARING");
    assert.equal(after.admission.boundaryAt, null);
    assert.equal(after.queueItem.status, "PRECLICK_RETRY_PENDING");
    assert.equal(after.ledger.headSequence, beforeHead + 1);
    assert.equal(after.exactLedgerRecords.length, 3);
    assert.equal(after.exactLedgerRecords.at(-1)?.eventKind, "ADMISSION_STATE_CHANGED");
    assert.equal(after.exactLedgerRecords.at(-1)?.previousHash, before.ledger.headEventHash);

    now.value += 1_000;
    const retry = await authority.execute("admissions", admissionRequest(source.requestId, source.taskId), relay);
    const retryProof = await authority.exactAdmissionProof(retry.admissionId, relay);
    assert.equal(retryProof.exactLedgerRecords.length, 4, "complete queue history must retain the prior admission and abort");
    assert.equal(retryProof.exactLedgerRecords.filter((record: Record<string, unknown>) => record.eventKind === "SINGLE_USE_ADMISSION_GRANTED").length, 2);
    assert.equal(retryProof.targetLedgerCompleteness.matchingRecordCount, 4);

    const persisted = store.submissionAuthorityState("chatgpt:proof");
    for (let index = 0; index < 1_005; index += 1) {
      store.commitSubmissionAuthorityState("chatgpt:proof", persisted, { eventKind: "STATE_COMMITTED", fixtureRevision: index });
    }
    const complete = await authority.exactAdmissionProof(retry.admissionId, relay);
    assert.equal(complete.exactLedgerRecords.length, 4, "target history must survive more than 1000 unrelated tail records");
    assert.equal(complete.ledger.headSequence, retryProof.ledger.headSequence + 1_005);
  } finally {
    if (priorChats === undefined) delete process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON; else process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = priorChats;
    if (priorPolicy === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON; else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = priorPolicy;
    store.close();
  }
});

test("exact proof rejects wrong producer, scope, missing source, and ledger contradiction without writing", async () => {
  const store = new EventStore(":memory:");
  const priorChats = process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
  const priorPolicy = process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
  const now = { value: origin };
  try {
    seedStore(store);
    process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = JSON.stringify([projectManager()]);
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(receiptPolicy());
    const watch = store.ensureFleetSupervisorWatch("project:proof-negative", "task:auth", "auth", new Date(now.value).toISOString());
    routeFleetSupervisorReasoning(store, watch, {
      trigger: "REASONING_REVIEW_OVERDUE", result: "Route exact proof fixture.", state: "ACTIVE",
      reasoningRequired: true, mechanicalRecoveryEligible: false, notifyOwner: false, notificationReason: null,
    }, store.workerEvents(watch.worker));
    const source = pendingDecisionRequests(store.allEvents()).find((item) => item.worker === watch.worker)!;
    const authority = proofRuntime(store, now);
    const admitted = await authority.execute("admissions", admissionRequest(source.requestId, source.taskId), relay);
    const count = store.submissionAuthorityProofSnapshot("chatgpt:proof").records.length;
    await assert.rejects(authority.exactAdmissionProof(admitted.admissionId, { ...relay, id: "collector:other" }), hasCode("SUBMISSION_RELAY_READ_FORBIDDEN"));
    await assert.rejects(authority.exactAdmissionProof(admitted.admissionId, { ...relay, workerScopes: ["other"] }), hasCode("SUBMISSION_ADMISSION_PROOF_SCOPE_MISMATCH"));
    await assert.rejects(authority.exactAdmissionProof("send-admission:missing", relay), hasCode("SUBMISSION_ADMISSION_UNKNOWN"));
    const original = store.submissionAuthorityProofSnapshot.bind(store);
    (store as any).submissionAuthorityProofSnapshot = (domain: string) => {
      const snapshot = original(domain);
      snapshot.records = snapshot.records.filter((record) => record.eventKind !== "SINGLE_USE_ADMISSION_GRANTED");
      return snapshot;
    };
    await assert.rejects(authority.exactAdmissionProof(admitted.admissionId, relay), hasCode("SUBMISSION_ADMISSION_PROOF_LEDGER_CARDINALITY_INVALID"));
    assert.equal(original("chatgpt:proof").records.length, count);
  } finally {
    if (priorChats === undefined) delete process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON; else process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = priorChats;
    if (priorPolicy === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON; else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = priorPolicy;
    store.close();
  }
});

function proofRuntime(store: EventStore, now: { value: number }) {
  return new SubmissionAuthorityRuntime(store, {
    NODE_ENV: "test",
    MISSION_CONTROL_SUPERVISOR_CHATS_JSON: JSON.stringify([projectManager()]),
    MISSION_CONTROL_SUBMISSION_PACING_DOMAIN: "chatgpt:proof",
    MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON: JSON.stringify(lease()),
    MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON: JSON.stringify({
      [relay.id]: { hostAlias: "proof-host", hostRole: "PRIMARY", automationWindowId: 41, ownedTargetIds: ["proof-target"] },
    }),
    MISSION_CONTROL_SUBMISSION_RELAY_ATTESTORS_JSON: JSON.stringify({ [relay.id]: "proof-attestor-" + "a".repeat(40) }),
    MISSION_CONTROL_INGEST_CREDENTIALS: JSON.stringify({
      [relay.id]: { kind: "COLLECTOR", token: "proof-bearer-" + "b".repeat(40), workers: ["auth"], tasks: ["task:auth"] },
    }),
    MISSION_CONTROL_MIN_SUBMISSION_INTERVAL_MS: "60000",
    MISSION_CONTROL_SUBMISSION_ADMISSION_TTL_MS: "120000",
  }, () => now.value);
}

function admissionRequest(requestId: string, taskId: string) {
  return {
    requestId, authorizationRef: taskId, queueKey: `request:${requestId}:IN_BAND_REQUEST_DECISION`,
    retryRootKey: `request:${requestId}:IN_BAND_REQUEST_DECISION`, sendPath: "SUPERVISORY_CYCLE_IN_BAND_REQUEST_DECISION",
    hostAlias: "proof-host", hostRole: "PRIMARY", deploymentEpoch: 1, leaseId: "lease:proof:1",
    supervisorId: "mc-project-manager", registrationId: "registration:test:mc-project-manager",
    targetId: "proof-target", automationWindowId: 41, targetKind: "REGISTERED_BOOTSTRAP",
    targetKey: "bootstrap:pm", expectedUrlSha256: createHash("sha256").update("https://chatgpt.com/c/test-project-manager").digest("hex"),
    bodySha256: "a".repeat(64),
  };
}

function lease() {
  return { schemaVersion: 1, leaseId: "lease:proof:1", deploymentId: "deployment:proof", epoch: 1,
    activeHostAlias: "proof-host", activeHostRole: "PRIMARY", issuedAt: new Date(origin - 60_000).toISOString(),
    expiresAt: new Date(origin + 3_600_000).toISOString(), splitBrainStatus: "SINGLE_ACTIVE_CONFIRMED" };
}

function projectManager() {
  return { scope: "PROJECT_MANAGER", supervisorId: "mc-project-manager", label: "MC project manager", workerId: null,
    requiredApp: "Mission Control", registrationId: "registration:test:mc-project-manager", ownership: "MISSION_CONTROL_ONLY",
    purpose: "Dedicated Mission Control reasoning supervisor", accountAlias: "owner-account", workspaceAlias: "personal",
    privateLocatorRef: "owner-config:test:mc-project-manager",
    registrationProvenance: { registeredBy: "OWNER", registeredAt: "2026-09-20T00:00:00.000Z", sourceRef: "owner:test" },
    consumerControls: { modelSelectionPolicy: "TOP_VISIBLE_SELECTABLE_MODEL", thinkingControlLabel: "Thinking effort",
      thinkingVisibleLabel: "Extra High", thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro",
      accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false },
    bootstrapCapability: { chatId: "bootstrap:pm", url: "https://chatgpt.com/c/test-project-manager", challengeId: "challenge:pm" } };
}

function receiptPolicy() {
  return { repository: "owner/private-receipts", decisionIssueNumber: 4, capabilityIssueNumber: 4, stageIssueNumber: 4,
    authorizedWriterLogins: ["owner"], capabilityChallenges: [], requestBound: { enabled: true, relayProducerIds: [relay.id] } };
}

function stripProof(value: Record<string, unknown>) { const { proofSha256: _proof, ...envelope } = value; return envelope; }
function withoutRepairFields(record: Record<string, unknown>) {
  const { admissionId: _admissionId, requestId: _requestId, leaseId: _leaseId, ...legacy } = record;
  return legacy;
}
function hasCode(code: string) { return (error: any) => error?.code === code; }
