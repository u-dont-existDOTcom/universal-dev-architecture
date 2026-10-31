import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash, createHmac } from "node:crypto";

import { EventStore } from "../lib/store";
import { defaultSchedulerState } from "../lib/provider-submission-authority.mjs";
import { leaseAutoRenewalDays, pacingDiagnostics, SubmissionAuthorityDisabledError, SubmissionAuthorityRuntime } from "../lib/submission-authority-runtime";
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

test("fleet-wide Project Manager admission follows the route task scopes instead of its stale registration worker", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  const askrigorProducer: AuthenticatedProducer = {
    ...producer,
    workerScopes: ["askrigor-system-alignment"],
    taskScopes: ["task:askrigor-system-alignment"],
  };
  const projectManager = {
    ...configuredChat(),
    scope: "PROJECT_MANAGER",
    supervisorId: "mc-project-manager",
    workerId: "mission-control-development",
    registrationId: "registration:pm:active",
    bootstrapCapability: {
      chatId: "pm-active",
      url: "https://chatgpt.com/c/pm-active",
      challengeId: "pm-active",
    },
  };
  try {
    const authority = runtime(store, now, {
      MISSION_CONTROL_SUPERVISOR_CHATS_JSON: JSON.stringify([projectManager]),
      MISSION_CONTROL_INGEST_CREDENTIALS: JSON.stringify({
        [producer.id]: {
          kind: "COLLECTOR",
          token: "ordinary-relay-test-" + "b".repeat(32),
          workers: ["askrigor-system-alignment"],
          tasks: ["task:askrigor-system-alignment"],
        },
      }),
    });
    const admitted = await authority.execute("admissions", request({
      requestId: "request:askrigor",
      queueKey: "queue:askrigor",
      authorizationRef: "task:askrigor-system-alignment",
      supervisorId: "mc-project-manager",
      registrationId: "registration:pm:active",
      targetKind: "FRESH_PROVIDER_SESSION",
      targetKey: "provider-session:askrigor",
      expectedUrlSha256: sha256("https://chatgpt.com/"),
      bodySha256: "d".repeat(64),
    }), askrigorProducer);
    assert.match(admitted.admissionId, /^send-admission:/);

    await assert.rejects(
      authority.execute("admissions", request({
        requestId: "request:wrong-worker",
        queueKey: "queue:wrong-worker",
        authorizationRef: "task:another-worker",
        supervisorId: "mc-project-manager",
        registrationId: "registration:pm:active",
        targetKind: "FRESH_PROVIDER_SESSION",
        targetKey: "provider-session:wrong-worker",
        expectedUrlSha256: sha256("https://chatgpt.com/"),
        bodySha256: "e".repeat(64),
      }), askrigorProducer),
      (error: any) => error.code === "SUBMISSION_AUTHORIZATION_SCOPE_MISMATCH",
    );

    await assert.rejects(
      authority.execute("admissions", request({
        requestId: "request:missing-task",
        queueKey: "queue:missing-task",
        authorizationRef: "task:askrigor-system-alignment",
        supervisorId: "mc-project-manager",
        registrationId: "registration:pm:active",
        targetKind: "FRESH_PROVIDER_SESSION",
        targetKey: "provider-session:missing-task",
        expectedUrlSha256: sha256("https://chatgpt.com/"),
        bodySha256: "f".repeat(64),
      }), { ...askrigorProducer, taskScopes: ["task:other"] }),
      (error: any) => error.code === "SUBMISSION_AUTHORIZATION_STALE_OR_MISSING",
    );
  } finally {
    store.close();
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

test("expired same-owner lease stays fail-closed after a fresh healthy heartbeat", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  try {
    const initial = runtime(store, now);
    assert.equal((await initial.status(producer)).schedulerState, "ACTIVE_LEASE");

    now.value = Date.parse(primaryLease().expiresAt) + 1;
    const restarted = runtime(store, now);
    const stale = await restarted.status(producer);
    assert.equal(stale.schedulerState, "LEASE_STALE");
    assert.equal(stale.activeLease.leaseId, primaryLease().leaseId);
    assert.equal(stale.activeLease.epoch, primaryLease().epoch);

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
    const accepted = await restarted.execute("relay-health", report, producer);
    assert.equal(accepted.accepted, true);
    assert.equal(Object.hasOwn(accepted, "leaseRenewal"), false);

    const stillStale = await restarted.status(producer);
    assert.equal(stillStale.schedulerState, "LEASE_STALE");
    assert.equal(stillStale.activeLease.leaseId, primaryLease().leaseId);
    assert.equal(stillStale.activeLease.epoch, primaryLease().epoch);
    assert.equal(stillStale.activeLease.activeHostAlias, "primary-test");

    now.value += 1_000;
    const replay = await restarted.execute("relay-health", { ...report, observedAt: new Date(now.value).toISOString() }, producer);
    assert.equal(replay.accepted, true);
    assert.equal((await restarted.status(producer)).schedulerState, "LEASE_STALE");
  } finally {
    store.close();
  }
});

test("the configured lease renews itself while valid, and a restart keeps the renewal", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  try {
    const live = runtime(store, now);
    assert.equal(live.leaseAutoRenewDays, 14);
    // Three hours remain of a 14-day window, so renewal is due and extends only expiresAt.
    const renewed = await live.renewLeaseIfDue();
    assert.equal(renewed.renewed, true);
    assert.equal(renewed.expiresAt, new Date(origin + 14 * 86_400_000).toISOString());
    const status = await live.status(producer);
    assert.equal(status.schedulerState, "ACTIVE_LEASE");
    assert.equal(status.activeLease.expiresAt, renewed.expiresAt);
    assert.equal(status.activeLease.leaseId, primaryLease().leaseId);
    assert.equal(status.activeLease.epoch, primaryLease().epoch);
    assert.equal((await live.renewLeaseIfDue()).reason, "NOT_DUE");

    // A restart reads the older lease from its settings but keeps the renewed one, past the old expiry.
    now.value = Date.parse(primaryLease().expiresAt) + 60_000;
    const restarted = runtime(store, now);
    const after = await restarted.status(producer);
    assert.equal(after.schedulerState, "ACTIVE_LEASE");
    assert.equal(after.activeLease.expiresAt, renewed.expiresAt);
  } finally {
    store.close();
  }
});

test("renewal never revives an expired lease, and can be switched off", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  try {
    const first = runtime(store, now, { MISSION_CONTROL_SUBMISSION_LEASE_AUTO_RENEW: "off" });
    assert.equal((await first.status(producer)).schedulerState, "ACTIVE_LEASE");
    assert.equal(first.leaseAutoRenewDays, null);
    assert.equal((await first.renewLeaseIfDue()).reason, "AUTO_RENEWAL_OFF");

    now.value = Date.parse(primaryLease().expiresAt) + 1;
    const restarted = runtime(store, now);
    const result = await restarted.renewLeaseIfDue();
    assert.equal(result.renewed, false);
    assert.equal(result.reason, "LEASE_NOT_CURRENTLY_VALID");
    assert.equal((await restarted.status(producer)).schedulerState, "LEASE_STALE");
  } finally {
    store.close();
  }
});

test("renewal checks the lease inside the scheduler transaction, so time passing while it waits cannot revive it", async () => {
  const store = new EventStore(":memory:");
  const racedStore = new EventStore(":memory:");
  try {
    // Ten seconds before expiry the renewal is due, and it succeeds at once.
    const now = { value: origin };
    const live = runtime(store, now);
    assert.equal((await live.status(producer)).schedulerState, "ACTIVE_LEASE");
    now.value = Date.parse(primaryLease().expiresAt) - 10_000;
    assert.equal((await live.renewLeaseIfDue()).renewed, true);

    // The renewal is queued behind another scheduler transaction, and the lease runs out while it waits: the check
    // inside its own transaction sees the later time and refuses.
    const raced = { value: origin };
    const racedRuntime = runtime(racedStore, raced);
    assert.equal((await racedRuntime.status(producer)).schedulerState, "ACTIVE_LEASE");
    raced.value = Date.parse(primaryLease().expiresAt) - 1_000;
    const stateStore = (racedRuntime as any).stateStore;
    const read = stateStore.read.bind(stateStore);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let gated = true;
    stateStore.read = async () => {
      if (gated) { gated = false; await gate; }
      return read();
    };
    const blocker = (racedRuntime as any).scheduler.activateLease(primaryLease()).catch(() => null);
    const pending = racedRuntime.renewLeaseIfDue();
    await new Promise((resolve) => setImmediate(resolve));
    raced.value = Date.parse(primaryLease().expiresAt) + 1;
    release();
    await blocker;
    const refused = await pending;
    assert.equal(refused.renewed, false);
    assert.equal(refused.reason, "LEASE_NOT_CURRENTLY_VALID");
    stateStore.read = read;
    assert.equal((await racedRuntime.status(producer)).schedulerState, "LEASE_STALE");
  } finally {
    store.close();
    racedStore.close();
  }
});

test("a configured successor that cannot activate stops renewal of the old lease", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  try {
    await runtime(store, now).status(producer);
    // A takeover lease is configured before the old lease has run out: activation fails closed, and nothing renews.
    const successor = {
      ...primaryLease(), leaseId: "lease:secondary:2", epoch: 2, activeHostAlias: "secondary-test", activeHostRole: "SECONDARY",
      issuedAt: new Date(origin).toISOString(), expiresAt: new Date(origin + 86_400_000).toISOString(),
      takeover: {
        previousLeaseId: primaryLease().leaseId, previousEpoch: 1, previousHostAlias: "primary-test",
        previousLeaseExpiresAt: primaryLease().expiresAt, priorHostQuiescence: "PROVEN",
        provenAt: new Date(origin).toISOString(), pacingState: "FULL_INTERVAL_ELAPSED",
        safetyIntervalCompletedAt: new Date(origin).toISOString(),
      },
    };
    const pending = runtime(store, now, { MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON: JSON.stringify(successor) });
    await assert.rejects(() => pending.renewLeaseIfDue(), /expiry|expired/i);
  } finally {
    store.close();
  }
});

test("lease renewal settings are bounded", () => {
  assert.equal(leaseAutoRenewalDays({}), 14);
  assert.equal(leaseAutoRenewalDays({ MISSION_CONTROL_SUBMISSION_LEASE_AUTO_RENEW: "on", MISSION_CONTROL_SUBMISSION_LEASE_AUTO_RENEW_DAYS: "30" }), 30);
  assert.equal(leaseAutoRenewalDays({ MISSION_CONTROL_SUBMISSION_LEASE_AUTO_RENEW: "off", MISSION_CONTROL_SUBMISSION_LEASE_AUTO_RENEW_DAYS: "999" }), null);
  assert.throws(() => leaseAutoRenewalDays({ MISSION_CONTROL_SUBMISSION_LEASE_AUTO_RENEW: "maybe" }), /on or off/);
  assert.throws(() => leaseAutoRenewalDays({ MISSION_CONTROL_SUBMISSION_LEASE_AUTO_RENEW_DAYS: "1" }), /2-60/);
  assert.throws(() => leaseAutoRenewalDays({ MISSION_CONTROL_SUBMISSION_LEASE_AUTO_RENEW_DAYS: "61" }), /2-60/);
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

test("operator status uses the supplied parsed event history without reloading EventStore", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  let eventHistoryReads = 0;
  try {
    const authority = runtime(store, now, {}, () => {
      eventHistoryReads += 1;
      return [];
    });
    const status = await authority.operatorStatus();
    assert.equal(status.authority.ledgerIntegrity, "VALID");
    assert.equal(eventHistoryReads, 1);
  } finally {
    store.close();
  }
});

test("scheduler status verifies a large authority ledger once at startup and only checks durable suffixes afterward", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  try {
    const state = defaultSchedulerState(new Date(now.value).toISOString());
    let latestSequence = 0;
    for (let revision = 1; revision <= 12_000; revision += 1) {
      const record = store.commitSubmissionAuthorityState(
        "chatgpt:owner-account",
        state,
        { eventKind: "STATE_COMMITTED", revision },
      );
      latestSequence = Number(record.sequence);
    }
    const starts = observeAuthorityVerificationStarts(store);
    const authority = runtime(store, now);
    await authority.status(producer);
    await authority.status(producer);

    assert.equal(starts[0], 0);
    assert.ok(starts.slice(1).every((sequence) => sequence >= latestSequence));
    assert.equal(starts.filter((sequence) => sequence === 0).length, 1);
  } finally {
    store.close();
  }
});

test("an owner-closed expired admission is ledgered with its decision, survives restart, and reopens the authority without replay", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mc-ambiguity-closure-"));
  const filename = path.join(root, "mission-control.db");
  const now = { value: origin };
  try {
    const firstStore = new EventStore(filename);
    const firstRuntime = runtime(firstStore, now);
    const admitted = await firstRuntime.execute("admissions", request(), producer);
    const closure = {
      admissionId: admitted.admissionId,
      requestId: "request:first",
      bodySha256: "a".repeat(64),
      decision: "OWNER_DISCARDED_NO_REPLAY",
      decidedAt: "",
    };
    // The owner discarded the send as its admission expired. Mission Control records its own receipt of the
    // request, then completes the closure a full interval later.
    closure.decidedAt = admitted.expiresAt;
    now.value = Date.parse(admitted.expiresAt) + 30_000;
    await assert.rejects(
      firstRuntime.execute("admissions/close-ambiguous", closure, producer),
      (error: any) => error.code === "SUBMISSION_AMBIGUITY_CLOSURE_TOO_EARLY"
        && error.detail.closableAt === new Date(now.value + 60_000).toISOString(),
    );
    const requestedAt = new Date(now.value).toISOString();
    await assert.rejects(
      firstRuntime.execute("admissions/close-ambiguous", closure, { ...producer, kind: "OWNER_AUTHORITY" } as AuthenticatedProducer),
      (error: any) => error.code === "SUBMISSION_PRODUCER_KIND_FORBIDDEN",
    );
    now.value += 60_000;
    const closed = await firstRuntime.execute("admissions/close-ambiguous", closure, producer);
    assert.equal(closed.closed, true);
    assert.equal(closed.duplicate, false);
    firstStore.close();

    const reopenedStore = new EventStore(filename);
    const reopenedRuntime = runtime(reopenedStore, now);
    const status = await reopenedRuntime.status(producer);
    assert.equal(status.unresolvedAdmission, null);
    assert.equal(status.queueDepth, 0);
    assert.equal(status.ready, true);
    assert.equal(status.ledger.valid, true);
    assert.equal((await reopenedRuntime.execute("admissions/close-ambiguous", closure, producer)).duplicate, true);
    const ledger = await reopenedRuntime.ledger(producer);
    const closures = ledger.records.filter((record: Record<string, unknown>) => record.eventKind === "AMBIGUOUS_ADMISSION_CLOSED_NO_REPLAY");
    assert.equal(closures.length, 1);
    assert.equal(closures[0].admissionId, admitted.admissionId);
    assert.equal(closures[0].admissionStatus, "AMBIGUOUS_CLOSED_NO_REPLAY");
    assert.equal(closures[0].queueStatus, "CLOSED_AMBIGUOUS_NO_REPLAY");
    assert.equal(closures[0].actualSubmissionBoundaryAt, null);
    assert.deepEqual(closures[0].ambiguityClosure, {
      decision: "OWNER_DISCARDED_NO_REPLAY",
      priorStatus: "ADMITTED",
      decidedAt: admitted.expiresAt,
      requestedAt,
      closedAt: closed.closedAt,
    });
    const requests = ledger.records.filter((record: Record<string, unknown>) => record.eventKind === "AMBIGUOUS_ADMISSION_CLOSURE_REQUESTED");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].admissionId, admitted.admissionId);
    assert.deepEqual(requests[0].ambiguityClosureRequest, { decision: "OWNER_DISCARDED_NO_REPLAY", decidedAt: admitted.expiresAt, requestedAt });
    assert.ok(ledger.records.filter((record: Record<string, unknown>) => record.eventKind !== "AMBIGUOUS_ADMISSION_CLOSED_NO_REPLAY")
      .every((record: Record<string, unknown>) => !Object.hasOwn(record, "ambiguityClosure")));
    assert.equal((await reopenedRuntime.operatorStatus()).authority.queueDepth, 0);
    await assert.rejects(
      reopenedRuntime.execute("admissions", request(), producer),
      (error: any) => error.code === "SUBMISSION_QUEUE_ITEM_TERMINAL",
    );
    const fresh = await reopenedRuntime.execute("admissions", request({
      requestId: "request:second",
      queueKey: "queue:second",
    }), producer);
    assert.equal(fresh.admitted, true);
    reopenedStore.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exact unsent proof fails closed after any submission-authority record names the request", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  const requestId = `fleet-review:${"5".repeat(32)}`;
  try {
    const authority = runtime(store, now);
    const unsent = await authority.proveRequestUnsent(requestId);
    assert.equal(unsent.provenUnsent, true);
    assert.equal(unsent.ledgerValid, true);
    assert.deepEqual(unsent.matchingStateSections, []);
    assert.equal(unsent.queueRecordCount, 0);
    assert.equal(unsent.admissionRecordCount, 0);
    assert.match(unsent.proofSha256, /^[a-f0-9]{64}$/);

    await authority.execute("admissions", request({ requestId, queueKey: "queue:stale-review" }), producer);
    const recorded = await authority.proveRequestUnsent(requestId);
    assert.equal(recorded.provenUnsent, false);
    assert.ok(recorded.matchingStateSections.includes("queueItems"));
    assert.ok(recorded.matchingStateSections.includes("admissions"));
    assert.equal(recorded.queueRecordCount, 1);
    assert.equal(recorded.admissionRecordCount, 1);
  } finally {
    store.close();
  }
});

test("exact unsent proof covers Work questions and known owner continuations, refusing other request kinds", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  try {
    const authority = runtime(store, now);
    const workQuestion = `work-question:${"6".repeat(32)}`;
    const unsent = await authority.proveRequestUnsent(workQuestion);
    assert.equal(unsent.requestId, workQuestion);
    assert.equal(unsent.provenUnsent, true);
    const continuation = `work-owner-continuation:${"9".repeat(32)}`;
    assert.equal((await authority.proveRequestUnsent(continuation)).provenUnsent, true);
    await authority.execute("admissions", request({ requestId: workQuestion, queueKey: "queue:work-question" }), producer);
    assert.equal((await authority.proveRequestUnsent(workQuestion)).provenUnsent, false);
    for (const other of [`post-work-review:${"7".repeat(32)}`, `work-question:${"7".repeat(31)}`, "work-question:"]) {
      await assert.rejects(authority.proveRequestUnsent(other), /fleet-review, work-question or work-owner-continuation request ID/);
    }
  } finally {
    store.close();
  }
});

test("a settled-send proof needs an admission of the Work question or owner continuation and no send of it still open", async () => {
  const store = new EventStore(":memory:");
  const now = { value: origin };
  try {
    const authority = runtime(store, now);
    const workQuestion = `work-question:${"8".repeat(32)}`;
    const none = await authority.proveRequestSendSettled(workQuestion);
    assert.equal(none.settled, false);
    assert.deepEqual(none.admissions, []);

    const admitted = await authority.execute("admissions", request({ requestId: workQuestion, queueKey: "queue:sent-question" }), producer);
    const open = await authority.proveRequestSendSettled(workQuestion);
    assert.equal(open.settled, false);
    assert.equal(open.openAdmissionCount, 1);
    assert.equal(open.openQueueRecordCount, 1);
    assert.deepEqual(open.admissions, [{ admissionId: admitted.admissionId, status: "ADMITTED", boundaryKind: null }]);

    now.value += 1_000;
    await authority.execute("boundaries", {
      admissionId: admitted.admissionId, boundaryAt: new Date(now.value).toISOString(), boundaryKind: "CLICKED", conversationUrlSha256: null,
    }, producer);
    const crossed = await authority.proveRequestSendSettled(workQuestion);
    assert.equal(crossed.settled, true);
    assert.equal(crossed.ledgerValid, true);
    assert.equal(crossed.openAdmissionCount, 0);
    assert.equal(crossed.openQueueRecordCount, 0);
    assert.equal(crossed.crossedAdmissionCount, 1);
    assert.deepEqual(crossed.admissions, [{ admissionId: admitted.admissionId, status: "BOUNDARY_RECORDED", boundaryKind: "CLICKED" }]);
    assert.match(crossed.proofSha256, /^[a-f0-9]{64}$/);
    assert.notEqual(crossed.proofSha256, open.proofSha256);

    // A Work owner-continuation has the same settled-send proof, for the owner's correction of a rejected answer.
    const continuation = `work-owner-continuation:${"9".repeat(32)}`;
    const unsentContinuation = await authority.proveRequestSendSettled(continuation);
    assert.equal(unsentContinuation.requestId, continuation);
    assert.equal(unsentContinuation.settled, false);
    assert.deepEqual(unsentContinuation.admissions, []);

    for (const other of [`fleet-review:${"8".repeat(32)}`, `work-question:${"8".repeat(31)}`, `work-owner-continuation:${"9".repeat(31)}`]) {
      await assert.rejects(authority.proveRequestSendSettled(other), /exact work-question or work-owner-continuation request ID/);
    }
  } finally {
    store.close();
  }
});

function runtime(
  store: EventStore,
  now: { value: number },
  overrides: Record<string, string | undefined> = {},
  eventHistory?: ConstructorParameters<typeof SubmissionAuthorityRuntime>[3],
) {
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
  }, () => now.value, eventHistory);
}

function observeAuthorityVerificationStarts(store: EventStore): number[] {
  const target = store as any;
  const original = target.submissionAuthorityLedgerRowsAfter.bind(store);
  const starts: number[] = [];
  target.submissionAuthorityLedgerRowsAfter = (pacingDomain: string, sequence: number) => {
    starts.push(sequence);
    return original(pacingDomain, sequence);
  };
  return starts;
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
