import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash, createHmac } from "node:crypto";

import { EventStore } from "../lib/store";
import { pacingDiagnostics, SubmissionAuthorityDisabledError, SubmissionAuthorityRuntime } from "../lib/submission-authority-runtime";
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
    const status = await reopenedRuntime.status(producer);
    assert.equal(status.authority, "MISSION_CONTROL_SINGLE_WRITER");
    assert.equal(status.lastSubmissionAt, new Date(now.value).toISOString());
    assert.equal(status.ledger.valid, true);
    assert.equal(status.authenticatedRelayBinding.ownedTargetCount, 1);
    assert.match(status.authenticatedRelayBinding.ownedTargetIdsSha256, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(status.authenticatedRelayBinding), /automation-owned-target/);
    assert.deepEqual(await reopenedRuntime.health(), {
      configured: true,
      schedulerState: "ACTIVE_LEASE",
      ledger: { valid: true, errors: [] },
    });

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
    const ledger = await reopenedRuntime.ledger(producer);
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
    assert.doesNotMatch(JSON.stringify(ledger), /automation-owned-target|bootstrap-spec/);
    assert.ok(ledger.records.every((record: Record<string, unknown>) => (
      !Object.hasOwn(record, "targetId") && !Object.hasOwn(record, "targetKey")
    )));
    assert.throws(
      () => (reopenedStore as any).db.prepare("UPDATE provider_submission_authority_ledger SET event_kind = 'tampered'").run(),
      /provider_submission_authority_ledger_is_append_only/,
    );
    reopenedStore.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Mission Control durably fences and commits an attested browser target-set transition without projecting target IDs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mc-target-transition-"));
  const filename = path.join(root, "mission-control.db");
  const now = { value: origin };
  const begin = relayTransition("BEGIN", {
    operation: "ADD",
    transitionId: "transition:runtime:add",
    priorOwnedTargetIds: ["automation-owned-target"],
    anchorTargetId: "automation-owned-target",
    targetId: null,
  });
  try {
    const firstStore = new EventStore(filename);
    const firstRuntime = runtime(firstStore, now);
    await assert.rejects(
      firstRuntime.execute("relay-target-transitions/begin", { ...begin, proof: "0".repeat(64) }, producer),
      (error: any) => error.code === "RELAY_TARGET_ATTESTATION_INVALID",
    );
    await firstRuntime.execute("relay-target-transitions/begin", signRelayTransition(begin), producer);
    assert.equal((await firstRuntime.status(producer)).relayTargetTransition.state, "OPEN");
    firstStore.close();

    const reopenedStore = new EventStore(filename);
    const reopenedRuntime = runtime(reopenedStore, now);
    const openStatus = await reopenedRuntime.status(producer);
    assert.equal(openStatus.ready, false);
    assert.equal(openStatus.authenticatedRelayBinding.bindingRevision, 1);
    assert.doesNotMatch(JSON.stringify(openStatus), /automation-owned-target|runtime-added-target/);
    const commit = relayTransition("COMMIT", {
      ...begin,
      postOwnedTargetIds: ["automation-owned-target", "runtime-added-target"],
      transitionedTargetId: "runtime-added-target",
    });
    const result = await reopenedRuntime.execute("relay-target-transitions/commit", signRelayTransition(commit), producer);
    assert.equal(result.binding.bindingRevision, 2);
    assert.equal(result.binding.ownedTargetCount, 2);
    const ledger = await reopenedRuntime.ledger(producer);
    assert.ok(ledger.records.some((record: Record<string, unknown>) => record.eventKind === "RELAY_TARGET_TRANSITION_BEGUN"));
    assert.ok(ledger.records.some((record: Record<string, unknown>) => record.eventKind === "RELAY_TARGET_TRANSITION_COMMITTED"));
    assert.doesNotMatch(JSON.stringify(ledger), /automation-owned-target|runtime-added-target/);
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
    const ledger = await authority.ledger(producer);
    assert.equal(ledger.integrity.valid, true);
    assert.ok(ledger.records.some((record: Record<string, unknown>) => record.rateLimitState === "RETRY_EXHAUSTED"));
  } finally {
    store.close();
  }
});

test("authenticated relay health drives owner status and expires fail closed", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  try {
    const authority = runtime(store, now, {
      MISSION_CONTROL_PRIMARY_HOST_LABEL: "Primary VPS",
      MISSION_CONTROL_SECONDARY_HOST_LABEL: "Secondary VPS",
      MISSION_CONTROL_RELAY_HEALTH_MAX_AGE_MS: "120000",
    });
    const report = {
      schemaVersion: 1,
      hostAlias: "primary-test",
      hostRole: "PRIMARY",
      deploymentEpoch: 1,
      observedAt: new Date(now.value).toISOString(),
      relayWorkerState: "HEALTHY",
      browserState: "HEALTHY",
      authorityBindingState: "BOUND",
      detail: "READY",
    };
    const accepted = await authority.execute("relay-health", report, producer);
    assert.equal(accepted.accepted, true);

    const current = await authority.operatorStatus();
    assert.equal(current.overallState, "HEALTHY");
    assert.equal(current.providerRelayState, "HEALTHY");
    assert.equal(current.activeHostLabel, "Primary VPS");
    assert.equal(current.authority.writer, "MISSION_CONTROL_SINGLE_WRITER");
    assert.equal(current.authority.ledgerIntegrity, "VALID");
    assert.equal(current.hosts[0].ownedTargetCount, 1);
    assert.equal(current.hosts[0].reportFresh, true);
    assert.doesNotMatch(JSON.stringify(current), /automation-owned-target|primary-test|lease:primary/);

    await assert.rejects(
      authority.execute("relay-health", { ...report, hostAlias: "secondary-test" }, producer),
      (error: any) => error.code === "RELAY_HEALTH_HOST_IMPERSONATION",
    );
    await assert.rejects(
      authority.execute("relay-health", { ...report, deploymentEpoch: 2 }, producer),
      (error: any) => error.code === "RELAY_HEALTH_EPOCH_MISMATCH",
    );

    now.value += 120_001;
    const stale = await authority.operatorStatus();
    assert.equal(stale.providerRelayState, "UNAVAILABLE");
    assert.equal(stale.hosts[0].reportFresh, false);
    assert.equal(stale.hosts[0].browserState, "UNAVAILABLE");
  } finally {
    store.close();
  }
});

test("unconfigured Mission Control authority fails closed", async () => {
  const store = new EventStore(":memory:");
  try {
    const authority = new SubmissionAuthorityRuntime(store, {}, () => origin);
    await assert.rejects(authority.status(producer), SubmissionAuthorityDisabledError);
    assert.deepEqual(await authority.health(), { configured: false, schedulerState: "DISABLED", ledger: null });
  } finally {
    store.close();
  }
});

test("partial submission-authority configuration cannot silently disable the gate", () => {
  const store = new EventStore(":memory:");
  try {
    assert.throws(() => new SubmissionAuthorityRuntime(store, {
      MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON: JSON.stringify({
        [producer.id]: { hostAlias: "primary-test", hostRole: "PRIMARY", automationWindowId: 101, ownedTargetIds: ["automation-owned-target"] },
      }),
    }, () => origin), /requires both MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON and MISSION_CONTROL_SUBMISSION_PACING_DOMAIN/);
  } finally {
    store.close();
  }
});

test("provisioning-only authority admits exactly one owner-authorized MC-only provider-root send", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  try {
    const authority = runtime(store, now, {
      MISSION_CONTROL_SUPERVISOR_CHATS_JSON: undefined,
      MISSION_CONTROL_SUPERVISOR_CHAT_PROVISIONS_JSON: JSON.stringify([configuredProvision()]),
    });
    const exact = provisioningRequest();
    for (const mutation of [
      { sendPath: "SUPERVISOR_MESSAGE" },
      { targetKind: "REGISTERED_BOOTSTRAP" },
      { targetKey: "provider-session:provisioning:wrong" },
      { expectedUrlSha256: sha256("https://chatgpt.com/c/not-root") },
    ]) {
      await assert.rejects(
        authority.execute("admissions", { ...exact, ...mutation }, producer),
        (error: any) => error.code === "SUPERVISOR_PROVISIONING_SCOPE_MISMATCH",
      );
    }
    const admission = await authority.execute("admissions", exact, producer);
    now.value += 1_000;
    await authority.execute("boundaries", {
      admissionId: admission.admissionId,
      boundaryAt: new Date(now.value).toISOString(),
      boundaryKind: "GENERATION_STARTED",
      conversationUrlSha256: sha256("https://chatgpt.com/c/provisioned-private"),
    }, producer);
    await assert.rejects(
      authority.execute("admissions", { ...exact, requestId: "provision:second", queueKey: "provision:second" }, producer),
      (error: any) => error.code === "SUPERVISOR_PROVISIONING_ALREADY_CONSUMED",
    );
  } finally {
    store.close();
  }
});

test("active and provisioning registrations cannot collide or create two global Project Managers", () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  try {
    assert.throws(() => runtime(store, now, {
      MISSION_CONTROL_SUPERVISOR_CHAT_PROVISIONS_JSON: JSON.stringify([
        configuredProvision({ scope: "SPECIALIST", supervisorId: "spec" }),
      ]),
    }), /supervisor IDs must be unique across the combined registry/);
    assert.throws(() => runtime(store, now, {
      MISSION_CONTROL_SUPERVISOR_CHATS_JSON: JSON.stringify([
        configuredChat(),
        { ...configuredChat(), scope: "PROJECT_MANAGER", supervisorId: "mc-project-manager", registrationId: "registration:pm:active", bootstrapCapability: { chatId: "pm-active", url: "https://chatgpt.com/c/pm-active", challengeId: "pm-active" } },
      ]),
      MISSION_CONTROL_SUPERVISOR_CHAT_PROVISIONS_JSON: JSON.stringify([configuredProvision()]),
    }), /unique across the combined registry|Only one overall Project Manager/);
  } finally {
    store.close();
  }
});

test("relay bearer and target attestor credentials are pairwise distinct across hosts", () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  const secondaryId = "collector:secondary-relay";
  const bindings = {
    [producer.id]: { hostAlias: "primary-test", hostRole: "PRIMARY", automationWindowId: 101, ownedTargetIds: ["automation-owned-target"] },
    [secondaryId]: { hostAlias: "secondary-test", hostRole: "SECONDARY", automationWindowId: 202, ownedTargetIds: ["secondary-owned-target"] },
  };
  const primaryBearer = "primary-bearer-test-" + "p".repeat(32);
  const secondaryBearer = "secondary-bearer-test-" + "s".repeat(32);
  try {
    for (const [attestors, credentials] of [
      [
        { [producer.id]: "duplicate-attestor-" + "a".repeat(32), [secondaryId]: "duplicate-attestor-" + "a".repeat(32) },
        { [producer.id]: { kind: "COLLECTOR", token: primaryBearer }, [secondaryId]: { kind: "COLLECTOR", token: secondaryBearer } },
      ],
      [
        { [producer.id]: secondaryBearer, [secondaryId]: "secondary-attestor-" + "b".repeat(32) },
        { [producer.id]: { kind: "COLLECTOR", token: primaryBearer }, [secondaryId]: { kind: "COLLECTOR", token: secondaryBearer } },
      ],
      [
        { [producer.id]: "primary-attestor-" + "a".repeat(32), [secondaryId]: "secondary-attestor-" + "b".repeat(32) },
        { [producer.id]: { kind: "COLLECTOR", token: primaryBearer }, [secondaryId]: { kind: "COLLECTOR", token: primaryBearer } },
      ],
    ] as const) {
      assert.throws(() => runtime(store, now, {
        MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON: JSON.stringify(bindings),
        MISSION_CONTROL_SUBMISSION_RELAY_ATTESTORS_JSON: JSON.stringify(attestors),
        MISSION_CONTROL_INGEST_CREDENTIALS: JSON.stringify(credentials),
      }), /pairwise distinct/);
    }
  } finally {
    store.close();
  }
});

test("pacing diagnostics evaluate the configured minimum as well as the immutable 60-second floor", () => {
  const diagnostics = pacingDiagnostics([
    { eventKind: "BOUNDARY_RECORDED", interSendIntervalMs: 90_000 },
    { eventKind: "BOUNDARY_RECORDED", interSendIntervalMs: 120_000 },
  ], 120_000);
  assert.equal(diagnostics.configuredMinimumIntervalMs, 120_000);
  assert.equal(diagnostics.violationsBelowConfiguredMinimum, 1);
  assert.equal(diagnostics.violationsBelow60000Ms, 0);
});

test("submission-authority reads reject unbound collectors and non-relay producers", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  try {
    const authority = runtime(store, now);
    const unbound: AuthenticatedProducer = { ...producer, id: "collector:unbound" };
    const worker: AuthenticatedProducer = { ...producer, id: "worker:test", kind: "WORKER" };
    await assert.rejects(authority.status(unbound), (error: any) => error.code === "SUBMISSION_RELAY_READ_FORBIDDEN");
    await assert.rejects(authority.ledger(worker), (error: any) => error.code === "SUBMISSION_RELAY_READ_FORBIDDEN");
  } finally {
    store.close();
  }
});

function runtime(store: EventStore, now: { value: number }, overrides: Record<string, string | undefined> = {}) {
  return new SubmissionAuthorityRuntime(store, {
    NODE_ENV: "test",
    MISSION_CONTROL_SUPERVISOR_CHATS_JSON: JSON.stringify([configuredChat()]),
    MISSION_CONTROL_SUBMISSION_PACING_DOMAIN: "chatgpt:owner-account",
    MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON: JSON.stringify(primaryLease()),
    MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON: JSON.stringify({
      [producer.id]: {
        hostAlias: "primary-test",
        hostRole: "PRIMARY",
        automationWindowId: 101,
        ownedTargetIds: ["automation-owned-target"],
      },
    }),
    MISSION_CONTROL_SUBMISSION_RELAY_ATTESTORS_JSON: JSON.stringify({
      [producer.id]: "binding-attestor-test-" + "a".repeat(32),
    }),
    MISSION_CONTROL_INGEST_CREDENTIALS: JSON.stringify({
      [producer.id]: { kind: "COLLECTOR", token: "ordinary-relay-test-" + "b".repeat(32), workers: ["worker-a"], tasks: ["*"] },
    }),
    MISSION_CONTROL_MIN_SUBMISSION_INTERVAL_MS: "60000",
    MISSION_CONTROL_SUBMISSION_ADMISSION_TTL_MS: "120000",
    ...overrides,
  }, () => now.value);
}

function relayTransition(phase: "BEGIN" | "COMMIT" | "ABORT", overrides: Record<string, any>) {
  const operation = overrides.operation as "ADD" | "REMOVE";
  return {
    phase,
    pacingDomain: "chatgpt:owner-account",
    producerId: producer.id,
    transitionId: overrides.transitionId,
    operation,
    reason: operation === "ADD" ? "AUTOMATION_OWNED_TARGET_CREATE" : "AUTOMATION_OWNED_TARGET_CLOSE",
    hostAlias: "primary-test",
    hostRole: "PRIMARY",
    deploymentEpoch: 1,
    leaseId: "lease:primary:1",
    automationWindowId: 101,
    priorBindingRevision: overrides.priorBindingRevision ?? 1,
    priorOwnedTargetIds: [...overrides.priorOwnedTargetIds].sort(),
    anchorTargetId: operation === "ADD" ? overrides.anchorTargetId : null,
    targetId: operation === "REMOVE" ? overrides.targetId : null,
    ...(phase === "COMMIT" ? {
      postAutomationWindowId: overrides.postAutomationWindowId ?? 101,
      postOwnedTargetIds: [...overrides.postOwnedTargetIds].sort(),
      transitionedTargetId: overrides.transitionedTargetId,
    } : {}),
    ...(phase === "ABORT" ? {
      observedAutomationWindowId: overrides.observedAutomationWindowId ?? 101,
      observedOwnedTargetIds: [...overrides.observedOwnedTargetIds].sort(),
    } : {}),
  };
}

function signRelayTransition(payload: Record<string, unknown>) {
  return {
    ...payload,
    proof: createHmac("sha256", "binding-attestor-test-" + "a".repeat(32)).update(canonicalJson(payload)).digest("hex"),
  };
}

function canonicalJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
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
    automationWindowId: 101,
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

function configuredProvision(overrides: Record<string, unknown> = {}) {
  return {
    registrationState: "PROVISIONING",
    scope: "PROJECT_MANAGER",
    supervisorId: "mc-project-manager",
    label: "Mission Control Project Manager",
    workerId: "worker-a",
    requiredApp: "Mission Control",
    registrationId: "registration:pm:provisioning:test",
    provisioningKey: "provider-session:provisioning:pm-test",
    ownership: "MISSION_CONTROL_ONLY",
    purpose: "Dedicated Mission Control project supervision only.",
    accountAlias: "owner-account",
    workspaceAlias: "mission-control",
    privateLocatorRef: "private-config:supervisors/pm",
    provisioningProvenance: { authorizedBy: "OWNER", authorizedAt: "2026-09-12T12:00:00.000Z", sourceRef: "owner-requirement:90" },
    consumerControls: { modelVisibleLabel: "GPT-5.6 Sol", thinkingControlLabel: "Thinking effort", thinkingVisibleLabel: "Extra High", thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro", accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false },
    ...overrides,
  };
}

function provisioningRequest(overrides: Record<string, unknown> = {}) {
  return request({
    requestId: "provision:pm",
    authorizationRef: "task:worker-a",
    queueKey: "provision:pm",
    retryRootKey: "provision:pm",
    sendPath: "MC_ONLY_PROVISIONING",
    supervisorId: "mc-project-manager",
    registrationId: "registration:pm:provisioning:test",
    targetKind: "FRESH_PROVIDER_SESSION",
    targetKey: "provider-session:provisioning:pm-test",
    expectedUrlSha256: sha256("https://chatgpt.com/"),
    ...overrides,
  });
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
