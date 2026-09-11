import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";

import { EventStore } from "../lib/store";
import { SubmissionAuthorityDisabledError, SubmissionAuthorityRuntime } from "../lib/submission-authority-runtime";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";

const origin = Date.parse("2026-09-11T12:00:00.000Z");
const producer: AuthenticatedProducer = {
  id: "collector:primary-relay",
  kind: "COLLECTOR",
  workerScopes: ["worker-a"],
  taskScopes: ["*"],
};

test("Mission Control is the persistent shared authority and emits a hash-chained pacing ledger", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mc-shared-authority-"));
  const filename = path.join(root, "mission-control.db");
  const now = { value: origin };
  try {
    const firstStore = new EventStore(filename);
    const firstRuntime = runtime(firstStore, now);
    const first = await firstRuntime.execute("admissions", request({ queueKey: "queue:first" }), producer);
    now.value += 1_000;
    await firstRuntime.execute("boundaries", {
      admissionId: first.admissionId,
      boundaryAt: new Date(now.value).toISOString(),
      boundaryKind: "CLICKED",
      conversationUrlSha256: null,
    }, producer);
    await firstRuntime.execute("outcomes", {
      admissionId: first.admissionId,
      deliveryStatus: "GENERATION_STARTED",
      recoveryStatus: "NOT_REQUIRED",
    }, producer);
    firstStore.close();

    const reopenedStore = new EventStore(filename);
    const reopenedRuntime = runtime(reopenedStore, now);
    const status = await reopenedRuntime.status();
    assert.equal(status.authority, "MISSION_CONTROL_SINGLE_WRITER");
    assert.equal(status.lastSubmissionAt, new Date(now.value).toISOString());
    assert.equal(status.ledger.valid, true);

    now.value += 60_000;
    const second = await reopenedRuntime.execute("admissions", request({
      requestId: "request:second",
      queueKey: "queue:second",
      bodySha256: "b".repeat(64),
    }), producer);
    await reopenedRuntime.execute("boundaries", {
      admissionId: second.admissionId,
      boundaryAt: new Date(now.value).toISOString(),
      boundaryKind: "CLICKED",
      conversationUrlSha256: null,
    }, producer);
    const ledger = await reopenedRuntime.ledger();
    const secondEnqueue = ledger.records.find((record: Record<string, unknown>) => (
      record.eventKind === "QUEUE_ITEM_DURABLY_ENQUEUED" && record.queueItemId === second.queueItemId
    ));
    assert.ok(secondEnqueue);
    assert.equal(secondEnqueue.authorizationReference, "task:worker-a");
    assert.equal(secondEnqueue.bodySha256, "b".repeat(64));
    const boundary = ledger.records.findLast((record: Record<string, unknown>) => record.eventKind === "BOUNDARY_RECORDED");
    assert.ok(boundary);
    assert.equal(boundary.previousGlobalSubmissionBoundaryAt, new Date(now.value - 60_000).toISOString());
    assert.equal(boundary.interSendIntervalMs, 60_000);
    assert.equal(boundary.minimumIntervalMs, 60_000);
    assert.equal(boundary.authorizationReference, "task:worker-a");
    assert.equal(boundary.queueItemId, second.queueItemId);
    assert.equal(boundary.producerId, producer.id);
    assert.equal(boundary.bodySha256, "b".repeat(64));
    assert.equal(ledger.diagnostics.minimumObservedIntervalMs, 60_000);
    assert.equal(ledger.diagnostics.violationsBelow60000Ms, 0);
    assert.throws(
      () => (reopenedStore as any).db.prepare("UPDATE provider_submission_authority_ledger SET event_kind = 'tampered'").run(),
      /provider_submission_authority_ledger_is_append_only/,
    );
    reopenedStore.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("provider rate limiting pauses the account and retries the same durable queue item once", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  try {
    const authority = runtime(store, now);
    await assert.rejects(
      authority.execute("admissions", request({ authorizationRef: "task:stale-worker" }), producer),
      (error: any) => error.code === "SUBMISSION_AUTHORIZATION_STALE_OR_MISSING",
    );
    const first = await authority.execute("admissions", request({ queueKey: "queue:rate-limit" }), producer);
    now.value += 1_000;
    await authority.execute("boundaries", {
      admissionId: first.admissionId,
      boundaryAt: new Date(now.value).toISOString(),
      boundaryKind: "CLICKED",
      conversationUrlSha256: null,
    }, producer);
    await authority.execute("provider-rate-limits", { admissionId: first.admissionId }, producer);

    await assert.rejects(
      authority.execute("admissions", request({ requestId: "request:other", queueKey: "queue:other", bodySha256: "c".repeat(64) }), producer),
      (error: any) => error.code === "ACCOUNT_RATE_LIMIT_ACTIVE",
    );
    await assert.rejects(
      authority.execute("admissions", request({ queueKey: "queue:rate-limit" }), producer),
      (error: any) => error.code === "PROVIDER_RATE_LIMIT_COOLDOWN" && error.detail.retryAfterMs === 30_000,
    );

    now.value += 60_000;
    const retry = await authority.execute("admissions", request({ queueKey: "queue:rate-limit" }), producer);
    assert.equal(retry.queueItemId, first.queueItemId);
    assert.equal(retry.providerRateLimitCount, 1);
    await authority.execute("aborts", {
      admissionId: retry.admissionId,
      relayStage: "COMPOSER_FILLED",
      failureKind: "PROVIDER_RATE_LIMIT",
    }, producer);
    await assert.rejects(
      authority.execute("admissions", request({ queueKey: "queue:rate-limit" }), producer),
      (error: any) => error.code === "SUBMISSION_SAFETY_HALT",
    );
    const ledger = await authority.ledger();
    assert.equal(ledger.integrity.valid, true);
    assert.ok(ledger.records.some((record: Record<string, unknown>) => record.rateLimitState === "RETRY_EXHAUSTED"));
  } finally {
    store.close();
  }
});

test("unconfigured Mission Control authority fails closed", async () => {
  const store = new EventStore(":memory:");
  try {
    const authority = new SubmissionAuthorityRuntime(store, {}, () => origin);
    await assert.rejects(authority.status(), SubmissionAuthorityDisabledError);
  } finally {
    store.close();
  }
});

function runtime(store: EventStore, now: { value: number }) {
  return new SubmissionAuthorityRuntime(store, {
    MISSION_CONTROL_SUPERVISOR_CHATS_JSON: JSON.stringify([configuredChat()]),
    MISSION_CONTROL_SUBMISSION_PACING_DOMAIN: "chatgpt:owner-account",
    MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON: JSON.stringify(primaryLease()),
    MISSION_CONTROL_MIN_SUBMISSION_INTERVAL_MS: "60000",
    MISSION_CONTROL_SUBMISSION_ADMISSION_TTL_MS: "120000",
  }, () => now.value);
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    requestId: "request:first",
    authorizationRef: overrides.authorizationRef ?? "task:worker-a",
    queueKey: "queue:first",
    retryRootKey: overrides.queueKey ?? "queue:first",
    sendPath: "SUPERVISOR_MESSAGE",
    hostAlias: "primary-test",
    hostRole: "PRIMARY",
    deploymentEpoch: 1,
    leaseId: "lease:primary:1",
    supervisorId: "spec",
    registrationId: "registration:spec:test",
    targetId: "automation-owned-target",
    targetKind: "REGISTERED_BOOTSTRAP",
    targetKey: "bootstrap-spec",
    expectedUrlSha256: sha256("https://chatgpt.com/c/bootstrap-spec"),
    bodySha256: "a".repeat(64),
    ...overrides,
  };
}

function configuredChat() {
  return {
    scope: "SPECIALIST",
    supervisorId: "spec",
    label: "Dedicated supervisor",
    workerId: "worker-a",
    requiredApp: "Mission Control",
    registrationId: "registration:spec:test",
    ownership: "MISSION_CONTROL_ONLY",
    purpose: "Dedicated Mission Control supervision only.",
    accountAlias: "owner-account",
    workspaceAlias: "mission-control",
    privateLocatorRef: "private-config:supervisors/spec",
    registrationProvenance: { registeredBy: "OWNER", registeredAt: "2026-09-11T11:00:00.000Z", sourceRef: "owner-requirement:90" },
    bootstrapCapability: { chatId: "bootstrap-spec", url: "https://chatgpt.com/c/bootstrap-spec", challengeId: "challenge-spec" },
    consumerControls: { modelVisibleLabel: "GPT-5.6 Sol", thinkingControlLabel: "Thinking effort", thinkingVisibleLabel: "Extra High", thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro", accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false },
  };
}

function primaryLease() {
  return {
    schemaVersion: 1,
    leaseId: "lease:primary:1",
    epoch: 1,
    activeHostAlias: "primary-test",
    activeHostRole: "PRIMARY",
    issuedAt: "2026-09-11T11:59:00.000Z",
    expiresAt: "2026-09-11T15:00:00.000Z",
    splitBrainStatus: "SINGLE_ACTIVE_CONFIRMED",
    takeover: null,
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
