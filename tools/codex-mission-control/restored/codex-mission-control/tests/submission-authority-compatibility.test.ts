import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  CentralSubmissionScheduler,
  PRECOMPOSITION_RECOVERED,
  defaultSchedulerState,
  normalizeSchedulerState,
  recoverySha256,
} from "../lib/provider-submission-authority.mjs";

const origin = Date.parse("2026-09-18T12:00:00.000Z");
const producerId = "collector:compat-relay";
const pacingDomain = "chatgpt:compat-account";

test("historical PRECOMPOSITION_RECOVERED evidence stays exact and permits only a fresh admission", async () => {
  const now = { value: origin };
  let state: any = defaultSchedulerState(new Date(now.value).toISOString());
  const stateStore = {
    read: async () => structuredClone(state),
    write: async (value: unknown) => {
      state = structuredClone(value);
      return structuredClone(state);
    },
  };
  const scheduler = new CentralSubmissionScheduler({
    stateStore,
    chats: [configuredChat()],
    producerBindings: { [producerId]: relayBinding() },
    producerAttestors: { [producerId]: "compat-attestor-" + "a".repeat(40) },
    pacingDomain,
    minIntervalMs: 60_000,
    admissionTtlMs: 120_000,
    now: () => now.value,
  });
  await scheduler.activateLease(lease());
  const first = await scheduler.admit(request(), producerId);

  now.value += 120_001;
  await assert.rejects(
    scheduler.admit(request(), producerId),
    (error: any) => error.code === "SUBMISSION_RESTART_AMBIGUITY",
  );
  const originalAdmission = structuredClone(state.admissions[0]);
  const queue = state.queueItems[0];
  assert.equal(originalAdmission.status, "AMBIGUOUS_AFTER_RESTART");
  assert.equal(queue.status, "AMBIGUOUS_AFTER_RESTART");

  const failureEvidence = {
    kind: "APP_SELECTION_FAILED_BEFORE_COMPOSITION",
    admissionId: originalAdmission.admissionId,
    queueItemId: queue.queueItemId,
    requestId: originalAdmission.requestId,
    bodySha256: originalAdmission.bodySha256,
    observedAt: new Date(origin + 30_000).toISOString(),
    failureCode: "APP_SELECTION_TIMEOUT",
    compositionStarted: false,
    submitInvoked: false,
    boundaryObserved: false,
    sourceRef: "evidence:compatibility-fixture",
    sourceSha256: "1".repeat(64),
    retainedArtifactSha256s: ["2".repeat(64)],
  };
  const permit: any = {
    schemaVersion: 1,
    permitId: "operator-recovery:compatibility",
    pacingDomain,
    issuedAt: new Date(now.value).toISOString(),
    expiresAt: new Date(now.value + 30 * 60_000).toISOString(),
    admissionId: originalAdmission.admissionId,
    queueItemId: queue.queueItemId,
    requestId: originalAdmission.requestId,
    producerId,
    sendPath: "MCP_PREFLIGHT",
    bodySha256: originalAdmission.bodySha256,
    expectedAdmissionStatus: "AMBIGUOUS_AFTER_RESTART",
    expectedQueueStatus: "AMBIGUOUS_AFTER_RESTART",
    expectedStateSha256: recoverySha256(state),
    expectedLedgerHead: { sequence: 1, eventHash: "3".repeat(64) },
    expectedAdmissionSha256: recoverySha256(originalAdmission),
    expectedQueueItemSha256: recoverySha256(queue),
    requestFingerprint: queue.requestFingerprint,
    logicalFingerprint: queue.logicalFingerprint,
    expectedLeaseSha256: recoverySha256(state.activeLease),
    expectedRelayBindingSha256: recoverySha256(state.relayBindings[producerId]),
    failureEvidence,
    failureEvidenceSha256: recoverySha256(failureEvidence),
    ownerAuthorization: {
      authorizedBy: "OWNER",
      action: PRECOMPOSITION_RECOVERED,
      sourceRef: "owner:compatibility-fixture",
      sourceSha256: "4".repeat(64),
      scopeSha256: "",
    },
    ownerAuthorizationSha256: "",
  };
  const { ownerAuthorization: _authorization, ownerAuthorizationSha256: _authorizationSha, ...scope } = permit;
  permit.ownerAuthorization.scopeSha256 = recoverySha256(scope);
  permit.ownerAuthorizationSha256 = recoverySha256(permit.ownerAuthorization);

  state.admissions[0] = {
    ...originalAdmission,
    status: PRECOMPOSITION_RECOVERED,
    precompositionRecovery: {
      permit,
      permitSha256: recoverySha256(permit),
      recoveredAt: new Date(now.value + 1).toISOString(),
    },
  };
  state.queueItems[0].status = "PRECLICK_RETRY_PENDING";
  state.queueItems[0].terminalAt = null;

  state = normalizeSchedulerState(state, new Date(now.value).toISOString());
  assert.equal(state.admissions[0].status, PRECOMPOSITION_RECOVERED);
  assert.deepEqual(state.admissions[0].precompositionRecovery.permit, permit);
  assert.equal(state.queueItems[0].status, "PRECLICK_RETRY_PENDING");

  const fresh = await scheduler.admit(request(), producerId);
  assert.notEqual(fresh.admissionId, first.admissionId);
  assert.equal(fresh.queueItemId, first.queueItemId);
  assert.equal(state.admissions[0].status, PRECOMPOSITION_RECOVERED);

  await assert.rejects(
    scheduler.recordBoundary({
      admissionId: first.admissionId,
      boundaryAt: new Date(now.value + 2).toISOString(),
      boundaryKind: "CLICKED",
      conversationUrlSha256: null,
    }, producerId),
    (error: any) => error.code === "SUBMISSION_ADMISSION_NOT_OPEN",
  );

  const corrupted = structuredClone(state);
  corrupted.admissions[0].precompositionRecovery.permitSha256 = "0".repeat(64);
  assert.throws(() => normalizeSchedulerState(corrupted), /RECORDED_EVIDENCE_INVALID|recovery evidence/i);
});

function configuredChat() {
  return {
    scope: "SPECIALIST",
    supervisorId: "spec",
    label: "Compatibility supervisor",
    workerId: "worker-test",
    requiredApp: "Mission Control",
    registrationId: "registration:compat",
    ownership: "MISSION_CONTROL_ONLY",
    purpose: "Historical compatibility test.",
    accountAlias: "compat-account",
    workspaceAlias: "compat",
    privateLocatorRef: "private-config:compat",
    registrationProvenance: { registeredBy: "OWNER", registeredAt: new Date(origin - 60_000).toISOString(), sourceRef: "owner:compat" },
    bootstrapCapability: { chatId: "bootstrap-compat", url: "https://chatgpt.com/c/bootstrap-compat", challengeId: "challenge-compat" },
    consumerControls: { modelVisibleLabel: "GPT-5.6 Sol", thinkingControlLabel: "Thinking effort", thinkingVisibleLabel: "Extra High", thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro", accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false },
  };
}

function relayBinding() {
  return { hostAlias: "secondary-test", hostRole: "SECONDARY", automationWindowId: 202, ownedTargetIds: ["owned-target"] };
}

function lease() {
  return {
    schemaVersion: 1,
    leaseId: "lease:secondary:1",
    epoch: 1,
    activeHostAlias: "secondary-test",
    activeHostRole: "SECONDARY",
    issuedAt: new Date(origin - 60_000).toISOString(),
    expiresAt: new Date(origin + 60 * 60_000).toISOString(),
    splitBrainStatus: "SINGLE_ACTIVE_CONFIRMED",
    takeover: null,
  };
}

function request() {
  return {
    requestId: "request:compat",
    authorizationRef: "task:worker-test",
    queueKey: "queue:compat",
    retryRootKey: "queue:compat",
    sendPath: "MCP_PREFLIGHT",
    hostAlias: "secondary-test",
    hostRole: "SECONDARY",
    deploymentEpoch: 1,
    leaseId: "lease:secondary:1",
    supervisorId: "spec",
    registrationId: "registration:compat",
    targetId: "owned-target",
    automationWindowId: 202,
    targetKind: "REGISTERED_BOOTSTRAP",
    targetKey: "bootstrap-compat",
    expectedUrlSha256: sha256("https://chatgpt.com/c/bootstrap-compat"),
    bodySha256: "a".repeat(64),
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
