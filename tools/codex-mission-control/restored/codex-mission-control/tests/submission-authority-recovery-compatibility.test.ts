import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  CentralSubmissionScheduler,
  defaultSchedulerState,
  normalizeSchedulerState,
  PRECOMPOSITION_RECOVERED,
  recoveryPermitScopeSha256,
  recoverySha256,
} from "../lib/provider-submission-authority.mjs";

const origin = Date.parse("2026-09-18T18:00:00.000Z");
const domain = "chatgpt:compatibility-test";
const producerId = "collector:secondary";

test("durable pre-composition recovery survives canonical restart parsing", async () => {
  const fixture = await recoveredState();
  const normalized = normalizeSchedulerState(
    fixture.state,
    new Date(fixture.now).toISOString(),
  ) as any;

  assert.equal(normalized.admissions[0].status, PRECOMPOSITION_RECOVERED);
  assert.deepEqual(normalized.admissions[0].precompositionRecovery, fixture.recovery);
  assert.equal(normalized.queueItems[0].status, "PRECLICK_RETRY_PENDING");
  assert.deepEqual(
    normalizeSchedulerState(structuredClone(normalized), new Date(fixture.now).toISOString()),
    normalized,
  );
});

test("recovered admission evidence remains strict and cannot appear on another status", async () => {
  const fixture = await recoveredState();
  const tampered = structuredClone(fixture.state);
  tampered.admissions[0].precompositionRecovery.permit.failureEvidence.submitInvoked = true;
  assert.throws(
    () => normalizeSchedulerState(tampered, new Date(fixture.now).toISOString()),
    /SUBMISSION_RECOVERY_POSITIVE_EVIDENCE_REQUIRED/,
  );

  const wrongStatus = structuredClone(fixture.state);
  wrongStatus.admissions[0].status = "EXPIRED_BEFORE_BOUNDARY";
  assert.throws(
    () => normalizeSchedulerState(wrongStatus, new Date(fixture.now).toISOString()),
    /SUBMISSION_RECOVERY_RECORDED_EVIDENCE_INVALID/,
  );
});

async function recoveredState() {
  const now = { value: origin };
  const store = {
    state: defaultSchedulerState(new Date(origin).toISOString()),
    async read() { return structuredClone(this.state); },
    async write(value: Record<string, unknown>) {
      this.state = structuredClone(value) as typeof this.state;
      return structuredClone(this.state);
    },
  };
  const lease = {
    schemaVersion: 1,
    leaseId: "lease:secondary:1",
    epoch: 1,
    activeHostAlias: "secondary-test",
    activeHostRole: "SECONDARY",
    issuedAt: new Date(origin - 60_000).toISOString(),
    expiresAt: new Date(origin + 3 * 60 * 60_000).toISOString(),
    splitBrainStatus: "SINGLE_ACTIVE_CONFIRMED",
    takeover: null,
  };
  const binding = {
    hostAlias: "secondary-test",
    hostRole: "SECONDARY",
    automationWindowId: 17,
    ownedTargetIds: ["owned-target"],
  };
  const scheduler = new CentralSubmissionScheduler({
    stateStore: store,
    chats: [{
      scope: "SPECIALIST",
      supervisorId: "spec",
      label: "Compatibility test",
      workerId: "worker-test",
      requiredApp: "Mission Control",
      registrationId: "registration:test",
      ownership: "MISSION_CONTROL_ONLY",
      purpose: "Compatibility test",
      accountAlias: "test-account",
      workspaceAlias: "test",
      privateLocatorRef: "private-config:test",
      registrationProvenance: {
        registeredBy: "OWNER",
        registeredAt: new Date(origin - 120_000).toISOString(),
        sourceRef: "owner:test",
      },
      bootstrapCapability: {
        chatId: "bootstrap-test",
        url: "https://chatgpt.com/c/bootstrap-test",
        challengeId: "challenge-test",
      },
      consumerControls: {
        modelVisibleLabel: "GPT-5.6 Sol",
        thinkingControlLabel: "Thinking effort",
        thinkingVisibleLabel: "Extra High",
        thinkingOrdinal: "4 of 5",
        accountPlanLabel: "Pro",
        accountPlanRole: "PROVENANCE_METADATA_ONLY",
        accountPlanIsReasoningMode: false,
      },
    }],
    producerBindings: { [producerId]: binding },
    producerAttestors: { [producerId]: `test-attestor-${"a".repeat(40)}` },
    pacingDomain: domain,
    now: () => now.value,
  });
  await scheduler.activateLease(lease);
  const request = {
    requestId: "request:test",
    authorizationRef: "task:worker-test",
    queueKey: "queue:test",
    retryRootKey: "queue:test",
    sendPath: "MCP_PREFLIGHT",
    hostAlias: "secondary-test",
    hostRole: "SECONDARY",
    deploymentEpoch: 1,
    leaseId: lease.leaseId,
    supervisorId: "spec",
    registrationId: "registration:test",
    targetId: "owned-target",
    automationWindowId: 17,
    targetKind: "REGISTERED_BOOTSTRAP",
    targetKey: "bootstrap-test",
    expectedUrlSha256: sha256("https://chatgpt.com/c/bootstrap-test"),
    bodySha256: "b".repeat(64),
  };
  await scheduler.admit(request, producerId);
  now.value += 120_001;
  await assert.rejects(
    scheduler.admit(request, producerId),
    (error: any) => error?.code === "SUBMISSION_RESTART_AMBIGUITY",
  );

  const state = normalizeSchedulerState(
    structuredClone(store.state),
    new Date(now.value).toISOString(),
  ) as any;
  const admission = state.admissions[0];
  const queueItem = state.queueItems[0];
  const permit: any = {
    schemaVersion: 1,
    permitId: "operator-recovery:compatibility",
    pacingDomain: domain,
    issuedAt: new Date(now.value).toISOString(),
    expiresAt: new Date(now.value + 30 * 60_000).toISOString(),
    admissionId: admission.admissionId,
    queueItemId: queueItem.queueItemId,
    requestId: admission.requestId,
    producerId,
    sendPath: "MCP_PREFLIGHT",
    bodySha256: admission.bodySha256,
    expectedAdmissionStatus: "AMBIGUOUS_AFTER_RESTART",
    expectedQueueStatus: "AMBIGUOUS_AFTER_RESTART",
    expectedStateSha256: recoverySha256(state),
    expectedLedgerHead: { sequence: 17, eventHash: "c".repeat(64) },
    expectedAdmissionSha256: recoverySha256(admission),
    expectedQueueItemSha256: recoverySha256(queueItem),
    requestFingerprint: queueItem.requestFingerprint,
    logicalFingerprint: queueItem.logicalFingerprint,
    expectedLeaseSha256: recoverySha256(state.activeLease),
    expectedRelayBindingSha256: recoverySha256(state.relayBindings[producerId]),
    failureEvidence: {
      kind: "APP_SELECTION_FAILED_BEFORE_COMPOSITION",
      admissionId: admission.admissionId,
      queueItemId: queueItem.queueItemId,
      requestId: admission.requestId,
      bodySha256: admission.bodySha256,
      observedAt: new Date(origin + 30_000).toISOString(),
      failureCode: "APP_SELECTION_TIMEOUT",
      compositionStarted: false,
      submitInvoked: false,
      boundaryObserved: false,
      sourceRef: "evidence:compatibility-test",
      sourceSha256: "d".repeat(64),
      retainedArtifactSha256s: ["e".repeat(64)],
    },
    ownerAuthorization: {
      authorizedBy: "OWNER",
      action: PRECOMPOSITION_RECOVERED,
      sourceRef: "owner:compatibility-test",
      sourceSha256: "f".repeat(64),
    },
  };
  permit.failureEvidenceSha256 = recoverySha256(permit.failureEvidence);
  permit.ownerAuthorization.scopeSha256 = recoveryPermitScopeSha256(permit);
  permit.ownerAuthorizationSha256 = recoverySha256(permit.ownerAuthorization);

  const recoveredAt = new Date(now.value + 1).toISOString();
  const recovery = { permit, permitSha256: recoverySha256(permit), recoveredAt };
  admission.status = PRECOMPOSITION_RECOVERED;
  admission.precompositionRecovery = recovery;
  queueItem.status = "PRECLICK_RETRY_PENDING";
  queueItem.terminalAt = null;
  return { state, recovery, now: now.value + 1 };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
