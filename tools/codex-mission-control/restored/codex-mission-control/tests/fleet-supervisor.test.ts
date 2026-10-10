import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { snapshotFromStore, workerTransportSnapshotFromEvents } from "../lib/dashboard-data";
import {
  classifyFleetSupervisorTick,
  DEFAULT_FLEET_SUPERVISOR_CADENCE_MS,
  FleetSupervisorRuntime,
  replaceFleetSupervisorReasoningRequest,
  retireUnsentFleetSupervisorReasoningRequest,
  routeFleetSupervisorReasoning,
} from "../lib/fleet-supervisor";
import { pendingDecisionRequests, providerInvalidCanonicalDecisionSummary, reasoningReplacementProofSummary, supervisoryRequestRetiredUnsentSummary } from "../lib/github-decision-receipts";
import { inBandRequestRoutePrefix } from "../lib/in-band-request-binding";
import { seedIssue47Store, seedStore } from "../lib/seed";
import type { MissionControlEventV2, StoredEvent } from "../lib/schema";
import { EventStore, type FleetSupervisorWatchRecord } from "../lib/store";

const t0 = "2026-09-19T00:00:00.000Z";
const due = "2026-09-19T01:00:00.000Z";

test("new nontrivial project queues auto-enroll with the hourly default and allow explicit disable", () => {
  const store = issue47Store();
  try {
    const watches = store.fleetSupervisorWatches();
    assert.deepEqual(watches.map((watch) => watch.projectId), ["project:human-design", "project:mission-control"]);
    assert.ok(watches.every((watch) => watch.state === "ACTIVE" && watch.cadenceMs === DEFAULT_FLEET_SUPERVISOR_CADENCE_MS));
    assert.equal(store.configureFleetSupervisorWatch("project:human-design", { state: "DISABLED" }, t0).nextTickAt, null);
  } finally { store.close(); }
});

test("startup backfills watches for persisted nonterminal queues created before fleet supervision existed", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mc-fleet-backfill-"));
  const database = path.join(directory, "mission-control.db");
  let store = new EventStore(database);
  try {
    seedIssue47Store(store);
    store.close();
    const db = new DatabaseSync(database);
    db.exec("DELETE FROM fleet_supervisor_watches");
    db.close();
    store = new EventStore(database);
    assert.deepEqual(store.fleetSupervisorWatches().map((watch) => watch.projectId),
      ["project:human-design", "project:mission-control"]);
    assert.ok(store.fleetSupervisorWatches().every((watch) => watch.state === "ACTIVE"));
  } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test("startup does not reactivate an explicitly disabled persisted watch", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mc-fleet-disabled-"));
  const database = path.join(directory, "mission-control.db");
  let store = new EventStore(database);
  try {
    seedIssue47Store(store);
    store.configureFleetSupervisorWatch("project:mission-control", { state: "DISABLED" }, t0);
    store.close();
    store = new EventStore(database);
    assert.equal(store.fleetSupervisorWatch("project:mission-control")?.state, "DISABLED");
  } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test("healthy ticks are silent, durable, idempotent, and remain visible after restart", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mc-fleet-watch-"));
  const database = path.join(directory, "mission-control.db");
  let store = new EventStore(database);
  try {
    seedIssue47Store(store);
    store.configureFleetSupervisorWatch("project:human-design", { cadenceMs: DEFAULT_FLEET_SUPERVISOR_CADENCE_MS }, t0);
    let notifications = 0;
    const runtime = new FleetSupervisorRuntime(store, { notifyOwner: () => { notifications += 1; } });
    const first = await runtime.tick(due);
    assert.equal(first.find((item) => item.projectId === "project:human-design")?.decision.trigger, "HEALTHY_ADVANCING");
    assert.equal(first.find((item) => item.projectId === "project:human-design")?.notificationDisposition, "SUPPRESSED_NOT_ACTIONABLE");
    assert.equal(notifications, 0);
    assert.equal((await runtime.tick(due)).length, 0);
    assert.equal(store.fleetSupervisorTicks("project:human-design").length, 1);
    store.close();
    store = new EventStore(database);
    assert.equal(store.fleetSupervisorWatch("project:human-design")?.lastTrigger, "HEALTHY_ADVANCING");
    assert.equal(store.fleetSupervisorTicks("project:human-design").length, 1);
  } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Jev shadow telemetry cannot alter deterministic fleet actions", async () => {
  const store = issue47Store();
  try {
    store.configureFleetSupervisorWatch("project:human-design", { cadenceMs: DEFAULT_FLEET_SUPERVISOR_CADENCE_MS }, t0);
    let notifications = 0;
    let shadowCalls = 0;
    const runtime = new FleetSupervisorRuntime(store, {
      notifyOwner: () => { notifications += 1; },
      observeJevShadow: async (_watch, decision) => {
        shadowCalls += 1;
        return {
          status: "OK", authoritative: false, model: "typesafe/jev-1.13",
          deterministic_trigger: decision.trigger,
          answers: { next_action: { choice: { notify_owner: 1 } } },
        };
      },
    });
    const [result] = await runtime.tick(due);
    assert.equal(result.decision.trigger, "HEALTHY_ADVANCING");
    assert.equal(result.notificationDisposition, "SUPPRESSED_NOT_ACTIONABLE");
    assert.equal(notifications, 0);
    assert.equal(shadowCalls, 1);
    assert.equal(result.jevShadow?.status, "OK");
  } finally { store.close(); }
});

test("safe pre-send process recovery uses the mechanical hook and stays owner-silent", async () => {
  const store = issue47Store();
  try {
    const watch = dueWatch(store, "project:human-design");
    const events = store.workerEvents(watch.worker);
    const prior = events.findLast((event) => event.data.type === "outbound_delivery_lifecycle_recorded")!.data;
    assert.equal(prior.type, "outbound_delivery_lifecycle_recorded");
    const attempt = { ...prior, status: "DELIVERY_ATTEMPTED" as const, attempt: prior.attempt + 1, next_attempt_at: null, lease_expires_at: due, remote_receipt_id: null, error_code: null };
    appendSystem(store, watch.worker, "mechanical:attempt", attempt);
    appendSystem(store, watch.worker, "mechanical:failed", { ...attempt, status: "DELIVERY_FAILED", lease_expires_at: null, error_code: "PRE_SEND_PROCESS_INTERRUPTED" });
    let recoveries = 0;
    const result = await new FleetSupervisorRuntime(store, { continueMechanical: () => { recoveries += 1; } }).tick(due);
    assert.equal(result[0].decision.trigger, "MECHANICAL_RECOVERY_ELIGIBLE");
    assert.equal(recoveries, 1);
    assert.equal(result[0].notificationDisposition, "SUPPRESSED_NOT_ACTIONABLE");
  } finally { store.close(); }
});

test("stalled strategy routes to reasoning without fleet-authored replacement", async () => {
  const store = new EventStore(":memory:");
  try {
    seedStore(store);
    store.ensureFleetSupervisorWatch("project:billing", "task:billing", "billing", t0);
    let routed = 0;
    const result = await new FleetSupervisorRuntime(store, { routeReasoning: () => { routed += 1; } }).tick(due);
    assert.equal(result[0].decision.trigger, "STALLED_OR_REGRESSING");
    assert.equal(result[0].decision.reasoningRequired, true);
    assert.match(result[0].decision.result, /authored no replacement/);
    assert.equal(routed, 1);
  } finally { store.close(); }
});

for (const routingDelayHours of [1, 49]) {
test(`fleet reasoning routes one fresh idempotent in-band request after ${routingDelayHours} hours`, (t) => {
  const routedAt = Date.parse(t0) + routingDelayHours * 3_600_000;
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(t0) });
  const store = new EventStore(":memory:");
  const previous = process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
  const previousPolicy = process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
  try {
    seedStore(store);
    process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = JSON.stringify([configuredProjectManager()]);
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(configuredReceiptPolicy());
    store.ensureFleetSupervisorWatch("project:auth", "task:auth", "auth", t0);
    const watch = dueWatch(store, "project:auth");
    const workerEvents = store.workerEvents(watch.worker);
    assert.ok(store.allEvents().length > workerEvents.length);
    assert.equal(watch.nextTickAt, due);
    t.mock.timers.setTime(routedAt);
    const routed = routeFleetSupervisorReasoning(store, watch, {
      trigger: "REASONING_REVIEW_OVERDUE",
      result: "Current evidence was routed to the existing reasoning lane.",
      state: "ACTIVE",
      reasoningRequired: true,
      mechanicalRecoveryEligible: false,
      notifyOwner: false,
      notificationReason: null,
    }, workerEvents);
    assert.ok(routed);
    if (!routed) return;
    assert.equal(routed.data.type, "worker_message_recorded");
    assert.equal(routed.worker, watch.worker);
    assert.match(routed.eventId, /^supervision-request-v6:/);
    if (routed.data.type !== "worker_message_recorded") return;
    assert.equal(routed.data.body.startsWith(inBandRequestRoutePrefix), true);
    const body = JSON.parse(routed.data.body.slice(inBandRequestRoutePrefix.length));
    assert.equal(body.schemaVersion, 6);
    assert.equal(body.queuedAt, new Date(routedAt).toISOString());
    assert.equal(routed.occurredAt, body.queuedAt);
    assert.equal(body.expiresAt, new Date(routedAt + 86_400_000).toISOString());
    assert.equal(body.factualPacket.supervisoryCycle.expiresAt, body.expiresAt);
    assert.equal(body.requestId.startsWith("fleet-review:"), true);
    assert.equal(body.factualPacket.supervisoryCycle.bindingProtocol, "IN_BAND_REQUEST_BINDING_V1");
    assert.equal(body.githubReceipt.repository, configuredReceiptPolicy().repository);
    assert.equal(body.evidenceCapsule.sha256.length, 64);
    assert.equal(pendingDecisionRequests(store.workerEvents(watch.worker)).length, 1);

    const count = store.count();
    const replay = routeFleetSupervisorReasoning(store, watch, {
      trigger: "REASONING_REVIEW_OVERDUE",
      result: "Current evidence was routed to the existing reasoning lane.",
      state: "ACTIVE",
      reasoningRequired: true,
      mechanicalRecoveryEligible: false,
      notifyOwner: false,
      notificationReason: null,
    }, store.workerEvents(watch.worker));
    assert.equal(replay?.eventId, routed.eventId);
    assert.equal(store.count(), count);
    assert.equal(store.latestSequence(), store.allEvents().length);
  } finally {
    if (previous === undefined) delete process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
    else process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = previous;
    if (previousPolicy === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
    else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = previousPolicy;
    store.close();
  }
});
}

test("expired unsent fleet requests renew at the relay consumer without a new evidence boundary", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(due) });
  const store = new EventStore(":memory:");
  const previous = process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
  const previousPolicy = process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
  try {
    seedStore(store);
    process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = JSON.stringify([configuredProjectManager()]);
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(configuredReceiptPolicy());
    const watch = store.ensureFleetSupervisorWatch("project:auth", "task:auth", "auth", t0);
    const decision = { trigger: "REASONING_REVIEW_OVERDUE" as const, result: "Route the current evidence.",
      state: "ACTIVE" as const, reasoningRequired: true, mechanicalRecoveryEligible: false,
      notifyOwner: false, notificationReason: null };
    const route = () => routeFleetSupervisorReasoning(store, watch, decision, store.workerEvents(watch.worker));
    const initial = route()!;
    let request = pendingDecisionRequests(store.workerEvents(watch.worker))[0]!;
    const relayCore = await import(new URL("../../../vps-browser-relay/src/core.mjs", import.meta.url).href);
    const { RelayRuntime } = await import(new URL("../../../vps-browser-relay/src/relay.mjs", import.meta.url).href);
    const consume = async () => {
      const transport = workerTransportSnapshotFromEvents(store.allEvents(), watch.worker)!;
      let state = relayCore.defaultState();
      const runtime = new RelayRuntime({
        config: { browser: { profileDir: "/tmp/test-profile" }, memory: { profile: "AUTO", overrides: {} },
          runtime: { chats: [configuredProjectManager()], submitEnabled: false, requestBoundEnabled: true,
            maxHotTabs: 3, retryDelayMs: 300_000 } },
        missionControl: { fetchFleet: async () => ({ workers: [transport.worker] }) },
        browser: { listTargets: async () => [], doctor: async () => ({}) },
        stateStore: { read: async () => state, write: async (next: typeof state) => { state = next; return state; },
          writeStatus: async () => undefined },
        submissionPacer: { remoteStatus: async () => ({}), status: () => ({}) },
        memoryReader: async () => ({ totalMb: 8_000, availableMb: 6_000, usedMb: 2_000,
          swapTotalMb: 2_000, swapUsedMb: 0, browserRssMb: 0 }),
      });
      return runtime.cycle();
    };
    for (let renewal = 0; renewal < 2; renewal += 1) {
      t.mock.timers.setTime(Date.parse(request.expiresAt));
      const expired = await consume();
      assert.equal(expired.status, "AUTHORITATIVE_PENDING_ROUTE_UNAVAILABLE");
      assert.equal(expired.eligible.count, 0);
      const count = store.count();
      assert.throws(route, /prove the expired request unsent/);
      const proof = { schemaVersion: 1 as const, requestId: request.requestId, pacingDomain: "chatgpt:test",
        ledgerValid: true, matchingStateSections: [], queueRecordCount: 0, admissionRecordCount: 0,
        provenUnsent: true, proofSha256: "a".repeat(64) };
      for (const invalid of [{ ...proof, admissionRecordCount: 1 }, { ...proof, requestId: "fleet-review:" + "b".repeat(32) }]) {
        assert.throws(() => routeFleetSupervisorReasoning(store, watch, decision, [], invalid), /prove the expired request unsent/);
      }
      assert.equal(store.count(), count);
      const successor = routeFleetSupervisorReasoning(store, watch, decision, [], proof)!;
      const fresh = pendingDecisionRequests(store.workerEvents(watch.worker));
      assert.equal(fresh.length, 1);
      assert.notEqual(fresh[0].requestId, request.requestId);
      assert.equal(fresh[0].queuedAt, request.expiresAt);
      assert.equal(Date.parse(fresh[0].expiresAt) - Date.parse(fresh[0].queuedAt), 86_400_000);
      const ready = await consume();
      assert.equal(ready.status, "DRY_RUN_ROUTE_READY");
      assert.equal(ready.route.requestId, fresh[0].requestId);
      assert.equal(route()?.eventId, successor.eventId);
      assert.equal(store.count(), count + 2);
      assert.deepEqual(store.eventByEventId(initial.eventId), initial);
      request = fresh[0];
    }
    t.mock.timers.setTime(Date.parse(request.expiresAt));
    store.append({ schema_version: 2, event_id: "expired-request-send-evidence", mission_id: "mission-control-live",
      occurred_at: new Date().toISOString(), data: {
        type: "evidence_receipt_recorded", worker: watch.worker, receipt_id: "expired-request-send-evidence",
        producer_id: "collector:test", producer_role: "COLLECTOR", evidence_class: "ARTIFACT",
        independence: "SAME_PROVENANCE", freshness: "CURRENT", exact_candidate_sha256: null,
        summary: "MISSION_CONTROL_PROVIDER_SESSION_V1", refs: [`request:${request.requestId}`],
        verified: true, changed_path_manifest: null,
      } });
    const count = store.count();
    assert.throws(() => routeFleetSupervisorReasoning(store, watch, decision, [], {
      schemaVersion: 1, requestId: request.requestId, pacingDomain: "chatgpt:test", ledgerValid: true,
      matchingStateSections: [], queueRecordCount: 0, admissionRecordCount: 0, provenUnsent: true, proofSha256: "a".repeat(64),
    }), /durable or ambiguous lifecycle evidence/);
    assert.equal(store.count(), count);
  } finally {
    if (previous === undefined) delete process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
    else process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = previous;
    if (previousPolicy === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
    else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = previousPolicy;
    store.close();
  }
});

test("one sealed empty completion is replaced exactly once without changing scientific or decision content", () => {
  const store = new EventStore(":memory:");
  const previous = process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
  const previousPolicy = process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
  try {
    seedStore(store);
    process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = JSON.stringify([configuredProjectManager()]);
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(configuredReceiptPolicy());
    const watch = store.ensureFleetSupervisorWatch("project:auth", "task:auth", "auth", t0);
    store.configureFleetSupervisorWatch(watch.projectId, { state: "PAUSED" }, t0);
    const oldEvent = routeFleetSupervisorReasoning(store, watch, {
      trigger: "REASONING_REVIEW_OVERDUE",
      result: "Current evidence was routed to the existing reasoning lane.",
      state: "ACTIVE",
      reasoningRequired: true,
      mechanicalRecoveryEligible: false,
      notifyOwner: false,
      notificationReason: null,
    }, store.workerEvents(watch.worker));
    assert.ok(oldEvent && oldEvent.data.type === "worker_message_recorded");
    if (!oldEvent || oldEvent.data.type !== "worker_message_recorded") return;
    const oldRoot = JSON.parse(oldEvent.data.body.slice(inBandRequestRoutePrefix.length));
    const replacementAt = new Date(Date.parse(oldRoot.queuedAt) + 1_000).toISOString();
    const before = store.count();
    const failureReceiptSha256 = "f".repeat(64);
    const replacement = replaceFleetSupervisorReasoningRequest(store, watch, {
      requestId: oldRoot.requestId,
      failureReceiptSha256,
    }, replacementAt);
    assert.equal(replacement.duplicate, false);
    assert.notEqual(replacement.replacementRequestId, oldRoot.requestId);
    assert.equal(store.count(), before + 1);
    assert.equal(replacement.event.data.type, "worker_message_recorded");
    if (replacement.event.data.type !== "worker_message_recorded") return;
    const freshRoot = JSON.parse(replacement.event.data.body.slice(inBandRequestRoutePrefix.length));
    assert.equal(freshRoot.supersedesRequestId, oldRoot.requestId);
    assert.deepEqual(freshRoot.supersession, {
      schemaVersion: 1,
      reasonCode: "PROVIDER_EMPTY_COMPLETION",
      failureReceiptSha256,
      authorization: "OWNER_EXPLICIT_ONE_REPLACEMENT",
      replacementOrdinal: 1,
    });
    assert.notEqual(freshRoot.requestId, oldRoot.requestId);
    assert.notEqual(freshRoot.nonce, oldRoot.nonce);
    assert.deepEqual(freshRoot.evidenceCapsule, oldRoot.evidenceCapsule);
    assert.deepEqual(freshRoot.ownerOutcome, oldRoot.ownerOutcome);
    assert.deepEqual(freshRoot.executionContext, oldRoot.executionContext);
    assert.equal(freshRoot.reasoningLane, oldRoot.reasoningLane);
    assert.equal(freshRoot.factualPacket.exactFactualState, oldRoot.factualPacket.exactFactualState);
    assert.deepEqual(freshRoot.factualPacket.evidenceRefs, oldRoot.factualPacket.evidenceRefs);
    assert.equal(freshRoot.factualPacket.decisionRequested, oldRoot.factualPacket.decisionRequested);
    assert.notEqual(freshRoot.factualPacket.packetId, oldRoot.factualPacket.packetId);
    assert.deepEqual(pendingDecisionRequests(store.workerEvents(watch.worker)).map((item) => item.requestId),
      [replacement.replacementRequestId]);

    const tamperedRoot = structuredClone(freshRoot);
    tamperedRoot.requestId = "fleet-review:" + "c".repeat(32);
    tamperedRoot.nonce = "fleet-review-nonce:" + "c".repeat(32);
    tamperedRoot.queuedAt = new Date(Date.parse(replacementAt) + 1_000).toISOString();
    tamperedRoot.expiresAt = new Date(Date.parse(tamperedRoot.queuedAt) + 86_400_000).toISOString();
    tamperedRoot.factualPacket.packetId = `packet:${tamperedRoot.requestId}`;
    tamperedRoot.factualPacket.decisionRequested = "changed decision";
    const tamperedEvent = {
      ...oldEvent,
      eventId: "supervision-request-v6:tampered-replacement",
      sequence: oldEvent.sequence + 1,
      occurredAt: tamperedRoot.queuedAt,
      data: { ...oldEvent.data, message_id: "tampered-replacement", body: inBandRequestRoutePrefix + JSON.stringify(tamperedRoot) },
    } as StoredEvent;
    assert.deepEqual(pendingDecisionRequests([oldEvent, tamperedEvent]).map((item) => item.requestId), [oldRoot.requestId]);

    const secondRoot = structuredClone(freshRoot);
    secondRoot.requestId = "fleet-review:" + "d".repeat(32);
    secondRoot.nonce = "fleet-review-nonce:" + "d".repeat(32);
    secondRoot.queuedAt = new Date(Date.parse(replacementAt) + 2_000).toISOString();
    secondRoot.expiresAt = new Date(Date.parse(secondRoot.queuedAt) + 86_400_000).toISOString();
    secondRoot.factualPacket.packetId = `packet:${secondRoot.requestId}`;
    const secondEvent = {
      ...replacement.event,
      eventId: "supervision-request-v6:second-replacement",
      sequence: replacement.event.sequence + 1,
      occurredAt: secondRoot.queuedAt,
      data: { ...replacement.event.data, message_id: "second-replacement", body: inBandRequestRoutePrefix + JSON.stringify(secondRoot) },
    } as StoredEvent;
    assert.deepEqual(pendingDecisionRequests([...store.workerEvents(watch.worker), secondEvent]).map((item) => item.requestId),
      [replacement.replacementRequestId]);

    const replay = replaceFleetSupervisorReasoningRequest(store, watch, {
      requestId: oldRoot.requestId,
      failureReceiptSha256,
    }, new Date(Date.parse(replacementAt) + 1_000).toISOString());
    assert.equal(replay.duplicate, true);
    assert.equal(replay.replacementRequestId, replacement.replacementRequestId);
    assert.equal(store.count(), before + 1);
    assert.throws(() => replaceFleetSupervisorReasoningRequest(store, watch, {
      requestId: oldRoot.requestId,
      failureReceiptSha256: "e".repeat(64),
    }, new Date(Date.parse(replacementAt) + 2_000).toISOString()), /different failure receipt/);
  } finally {
    if (previous === undefined) delete process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
    else process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = previous;
    if (previousPolicy === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
    else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = previousPolicy;
    store.close();
  }
});

test("one trusted COMPLETE invalid-canonical failure survives the backend-to-relay transport boundary", async () => {
  const store = new EventStore(":memory:");
  const previous = process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
  const previousPolicy = process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
  try {
    seedStore(store);
    process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = JSON.stringify([configuredProjectManager()]);
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(configuredReceiptPolicy());
    const watch = store.ensureFleetSupervisorWatch("project:auth", "task:auth", "auth", t0);
    store.configureFleetSupervisorWatch(watch.projectId, { state: "PAUSED" }, t0);
    const oldEvent = routeFleetSupervisorReasoning(store, watch, {
      trigger: "REASONING_REVIEW_OVERDUE", result: "Review required.", state: "PAUSED",
      reasoningRequired: true, mechanicalRecoveryEligible: false, notifyOwner: false, notificationReason: null,
    }, store.workerEvents(watch.worker));
    assert.ok(oldEvent && oldEvent.data.type === "worker_message_recorded");
    if (!oldEvent || oldEvent.data.type !== "worker_message_recorded") return;
    const oldRoot = JSON.parse(oldEvent.data.body.slice(inBandRequestRoutePrefix.length));
    const failureReceiptSha256 = "8".repeat(64);
    const canonicalBodySha256 = "7".repeat(64);
    const providerSessionId = "provider-session:invalid-canonical-test";
    const replaceAt = new Date(Date.parse(oldRoot.queuedAt) + 3_000).toISOString();
    assert.throws(() => replaceFleetSupervisorReasoningRequest(store, store.fleetSupervisorWatch(watch.projectId)!, {
      requestId: oldRoot.requestId, failureReceiptSha256, reasonCode: "PROVIDER_INVALID_CANONICAL_DECISION",
    }, replaceAt), /trusted sealed failure receipt/);
    const evidenceAt = new Date(Date.parse(oldRoot.queuedAt) + 1_000).toISOString();
    appendInvalidFailureEvidence(store, watch.worker, oldRoot.requestId, oldRoot.destinationSupervisorId,
      providerSessionId, failureReceiptSha256, canonicalBodySha256, evidenceAt, "collector:untrusted");
    assert.throws(() => replaceFleetSupervisorReasoningRequest(store, store.fleetSupervisorWatch(watch.projectId)!, {
      requestId: oldRoot.requestId, failureReceiptSha256, reasonCode: "PROVIDER_INVALID_CANONICAL_DECISION",
    }, replaceAt), /trusted sealed failure receipt/);
    appendInvalidFailureEvidence(store, watch.worker, oldRoot.requestId, oldRoot.destinationSupervisorId,
      providerSessionId, failureReceiptSha256, canonicalBodySha256, evidenceAt, "collector:relay",
      ["provider_session:ambiguous-duplicate"], "duplicate-ref");
    assert.throws(() => replaceFleetSupervisorReasoningRequest(store, store.fleetSupervisorWatch(watch.projectId)!, {
      requestId: oldRoot.requestId, failureReceiptSha256, reasonCode: "PROVIDER_INVALID_CANONICAL_DECISION",
    }, replaceAt), /trusted sealed failure receipt/);
    appendInvalidFailureEvidence(store, watch.worker, oldRoot.requestId, oldRoot.destinationSupervisorId,
      providerSessionId, failureReceiptSha256, canonicalBodySha256, evidenceAt);
    assert.throws(() => replaceFleetSupervisorReasoningRequest(store, store.fleetSupervisorWatch(watch.projectId)!, {
      requestId: oldRoot.requestId, failureReceiptSha256: "6".repeat(64), reasonCode: "PROVIDER_INVALID_CANONICAL_DECISION",
    }, replaceAt), /trusted sealed failure receipt/);
    assert.throws(() => replaceFleetSupervisorReasoningRequest(store, store.fleetSupervisorWatch(watch.projectId)!, {
      requestId: oldRoot.requestId, failureReceiptSha256, reasonCode: "PROVIDER_INVALID_CANONICAL_DECISION",
    }, replaceAt), /trusted COMPLETE provider session/);
    appendCompleteProviderSession(store, watch.worker, oldRoot.requestId, oldRoot.destinationSupervisorId,
      providerSessionId, evidenceAt, "collector:untrusted");
    assert.throws(() => replaceFleetSupervisorReasoningRequest(store, store.fleetSupervisorWatch(watch.projectId)!, {
      requestId: oldRoot.requestId, failureReceiptSha256, reasonCode: "PROVIDER_INVALID_CANONICAL_DECISION",
    }, replaceAt), /trusted COMPLETE provider session/);
    appendCompleteProviderSession(store, watch.worker, oldRoot.requestId, oldRoot.destinationSupervisorId,
      providerSessionId, evidenceAt);
    const before = store.count();
    const replacement = replaceFleetSupervisorReasoningRequest(store, store.fleetSupervisorWatch(watch.projectId)!, {
      requestId: oldRoot.requestId, failureReceiptSha256, reasonCode: "PROVIDER_INVALID_CANONICAL_DECISION",
    }, replaceAt);
    assert.equal(replacement.duplicate, false);
    assert.equal(store.count(), before + 2);
    assert.equal(replacement.event.data.type, "worker_message_recorded");
    if (replacement.event.data.type !== "worker_message_recorded") return;
    const freshRoot = JSON.parse(replacement.event.data.body.slice(inBandRequestRoutePrefix.length));
    const proof = store.workerEvents(watch.worker).find((event) => event.data.type === "evidence_receipt_recorded"
      && event.data.summary === reasoningReplacementProofSummary);
    assert.ok(proof && proof.data.type === "evidence_receipt_recorded");
    if (!proof || proof.data.type !== "evidence_receipt_recorded") return;
    assert.deepEqual(freshRoot.supersession, {
      schemaVersion: 1,
      reasonCode: "PROVIDER_INVALID_CANONICAL_DECISION",
      failureReceiptSha256,
      failureProviderSessionId: providerSessionId,
      failureCanonicalBodySha256: canonicalBodySha256,
      proofEventId: proof.eventId,
      proofSha256: proof.data.exact_candidate_sha256,
      authorization: "OWNER_EXPLICIT_ONE_REPLACEMENT",
      replacementOrdinal: 1,
    });
    const proofOnlyHistory = store.workerEvents(watch.worker).filter((event) => event.eventId !== replacement.event.eventId);
    assert.deepEqual(pendingDecisionRequests(proofOnlyHistory).map((item) => item.requestId), [oldRoot.requestId],
      "a verifier proof without the route is inert");
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify({
      ...configuredReceiptPolicy(), requestBound: { enabled: true, relayProducerIds: ["collector:rotated"] },
    });
    assert.deepEqual(pendingDecisionRequests(store.workerEvents(watch.worker)).map((item) => item.requestId),
      [replacement.replacementRequestId], "trust rotation cannot resurrect the superseded request");
    const relayCore = await import(new URL("../../../vps-browser-relay/src/core.mjs", import.meta.url).href);
    const chats = [{ ...configuredProjectManager(), workerId: watch.worker }];
    const transport = workerTransportSnapshotFromEvents(store.allEvents(), watch.worker);
    assert.ok(transport);
    if (!transport) return;
    const routes = relayCore.extractQueuedRoutes({ workers: [transport.worker] }, chats, relayCore.defaultState());
    assert.deepEqual(routes.map((route: { requestId: string }) => route.requestId), [replacement.replacementRequestId]);

    const withoutProof = workerTransportSnapshotFromEvents(store.allEvents().filter((event) => event.eventId !== proof.eventId), watch.worker);
    assert.ok(withoutProof);
    if (!withoutProof) return;
    const withoutProofRoutes = relayCore.extractQueuedRoutes({ workers: [withoutProof.worker] }, chats, relayCore.defaultState());
    assert.equal(withoutProofRoutes.some((route: { requestId: string }) => route.requestId === replacement.replacementRequestId), false,
      "removing the proof summary from the dashboard transport allowlist must make this positive round trip fail");

    const crossWorkerEvents = store.allEvents().map((event) => {
      if (event.eventId !== proof.eventId || event.data.type !== "evidence_receipt_recorded") return event;
      return { ...structuredClone(event), worker: "other-worker", data: { ...structuredClone(event.data), worker: "other-worker" } };
    });
    const targetTransport = workerTransportSnapshotFromEvents(crossWorkerEvents, watch.worker);
    const misplacedProof = crossWorkerEvents.find((event) => event.eventId === proof.eventId);
    assert.ok(targetTransport && misplacedProof);
    if (!targetTransport || !misplacedProof) return;
    assert.equal(targetTransport.worker.timeline.some((event) => event.eventId === proof.eventId), false);
    const crossWorkerRoutes = relayCore.extractQueuedRoutes({ workers: [targetTransport.worker,
      { id: "other-worker", name: "Other worker", timeline: [misplacedProof], authoritativePendingRequestIds: [] }] }, chats, relayCore.defaultState());
    assert.equal(crossWorkerRoutes.some((route: { requestId: string }) => route.requestId === replacement.replacementRequestId), false,
      "a proof transported under another worker cannot authorize this replacement");
    const replay = replaceFleetSupervisorReasoningRequest(store, store.fleetSupervisorWatch(watch.projectId)!, {
      requestId: oldRoot.requestId, failureReceiptSha256, reasonCode: "PROVIDER_INVALID_CANONICAL_DECISION",
    }, new Date(Date.parse(replaceAt) + 1_000).toISOString());
    assert.equal(replay.duplicate, true);
    assert.equal(replay.replacementRequestId, replacement.replacementRequestId);
    assert.equal(store.count(), before + 2);
    assert.throws(() => replaceFleetSupervisorReasoningRequest(store, store.fleetSupervisorWatch(watch.projectId)!, {
      requestId: oldRoot.requestId, failureReceiptSha256, reasonCode: "PROVIDER_EMPTY_COMPLETION",
    }, new Date(Date.parse(replaceAt) + 2_000).toISOString()), /different failure receipt or reason/);
  } finally {
    if (previous === undefined) delete process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
    else process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = previous;
    if (previousPolicy === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
    else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = previousPolicy;
    store.close();
  }
});

test("one proven-unsent stale request is retired append-only and exactly one current evidence review is queued", () => {
  const store = new EventStore(":memory:");
  const previous = process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
  const previousPolicy = process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
  try {
    seedStore(store);
    process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = JSON.stringify([configuredProjectManager()]);
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(configuredReceiptPolicy());
    const watch = store.ensureFleetSupervisorWatch("project:auth", "task:auth", "auth", t0);
    store.configureFleetSupervisorWatch(watch.projectId, { state: "PAUSED" }, t0);
    const stale = routeFleetSupervisorReasoning(store, watch, {
      trigger: "REASONING_REVIEW_OVERDUE",
      result: "Current evidence was routed to the existing reasoning lane.",
      state: "PAUSED",
      reasoningRequired: true,
      mechanicalRecoveryEligible: false,
      notifyOwner: false,
      notificationReason: null,
    }, store.workerEvents(watch.worker));
    assert.ok(stale && stale.data.type === "worker_message_recorded");
    if (!stale || stale.data.type !== "worker_message_recorded") return;
    const staleRoot = JSON.parse(stale.data.body.slice(inBandRequestRoutePrefix.length));
    const evidenceEvent = store.append({
      schema_version: 2,
      event_id: "sealed-current-execution-evidence",
      mission_id: "mission-control-live",
      occurred_at: "2026-09-19T02:00:00.000Z",
      data: {
        type: "evidence_receipt_recorded",
        worker: watch.worker,
        receipt_id: "sealed-current-execution-evidence",
        producer_id: "collector:test",
        producer_role: "COLLECTOR",
        evidence_class: "ARTIFACT",
        independence: "SAME_PROVENANCE",
        freshness: "CURRENT",
        exact_candidate_sha256: "a".repeat(64),
        summary: "SEALED_TEST_EXECUTION_RESULT_V1",
        refs: ["status:STAGE_COMPLETE", "next_reasoning_review_required:true", "material_miss:false"],
        verified: true,
        changed_path_manifest: null,
      },
    });
    const proof = {
      schemaVersion: 1 as const,
      requestId: staleRoot.requestId,
      pacingDomain: "provider-account:test",
      ledgerValid: true,
      matchingStateSections: [],
      queueRecordCount: 0,
      admissionRecordCount: 0,
      provenUnsent: true,
      proofSha256: "b".repeat(64),
    };
    const before = store.count();
    const result = retireUnsentFleetSupervisorReasoningRequest(store, store.fleetSupervisorWatch(watch.projectId)!, {
      requestId: staleRoot.requestId,
      evidenceEventId: evidenceEvent.eventId,
    }, proof, "2026-09-19T02:00:01.000Z");
    assert.equal(result.duplicate, false);
    assert.equal(store.count(), before + 2);
    assert.equal(result.retirementEvent.data.type, "evidence_receipt_recorded");
    if (result.retirementEvent.data.type !== "evidence_receipt_recorded") return;
    assert.equal(result.retirementEvent.data.summary, supervisoryRequestRetiredUnsentSummary);
    assert.ok(result.retirementEvent.data.refs.includes(`request:${staleRoot.requestId}`));
    assert.ok(result.retirementEvent.data.refs.includes("lifecycle_status:RETIRED_UNSENT"));
    assert.deepEqual(pendingDecisionRequests(store.workerEvents(watch.worker)).map((item) => item.requestId),
      [result.reviewRequestId]);
    assert.notEqual(result.reviewRequestId, staleRoot.requestId);
    assert.equal(store.fleetSupervisorWatch(watch.projectId)?.state, "PAUSED");
    assert.equal(result.reviewEvent.data.type, "worker_message_recorded");
    if (result.reviewEvent.data.type !== "worker_message_recorded") return;
    const currentRoot = JSON.parse(result.reviewEvent.data.body.slice(inBandRequestRoutePrefix.length));
    const facts = JSON.parse(currentRoot.factualPacket.exactFactualState);
    assert.equal(facts.decision_boundary.event_id, evidenceEvent.eventId);
    assert.equal(facts.execution.latest_verified_sealed_evidence.event_id, evidenceEvent.eventId);
    assert.equal(facts.execution.latest_verified_sealed_evidence.exact_candidate_sha256, "a".repeat(64));

    const replayCount = store.count();
    const replay = retireUnsentFleetSupervisorReasoningRequest(store, store.fleetSupervisorWatch(watch.projectId)!, {
      requestId: staleRoot.requestId,
      evidenceEventId: evidenceEvent.eventId,
    }, proof, "2026-09-19T02:00:02.000Z");
    assert.equal(replay.duplicate, true);
    assert.equal(replay.reviewRequestId, result.reviewRequestId);
    assert.equal(store.count(), replayCount);
  } finally {
    if (previous === undefined) delete process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
    else process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = previous;
    if (previousPolicy === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
    else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = previousPolicy;
    store.close();
  }
});

test("unsent retirement fails closed on any durable request-bound provider evidence", () => {
  const store = new EventStore(":memory:");
  const previous = process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
  const previousPolicy = process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
  try {
    seedStore(store);
    process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = JSON.stringify([configuredProjectManager()]);
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(configuredReceiptPolicy());
    const watch = store.ensureFleetSupervisorWatch("project:auth", "task:auth", "auth", t0);
    store.configureFleetSupervisorWatch(watch.projectId, { state: "PAUSED" }, t0);
    const stale = routeFleetSupervisorReasoning(store, watch, {
      trigger: "REASONING_REVIEW_OVERDUE", result: "Review required.", state: "PAUSED",
      reasoningRequired: true, mechanicalRecoveryEligible: false, notifyOwner: false, notificationReason: null,
    }, store.workerEvents(watch.worker));
    assert.ok(stale && stale.data.type === "worker_message_recorded");
    if (!stale || stale.data.type !== "worker_message_recorded") return;
    const staleRoot = JSON.parse(stale.data.body.slice(inBandRequestRoutePrefix.length));
    const evidenceEvent = store.append({
      schema_version: 2, event_id: "sealed-current-evidence-with-send", mission_id: "mission-control-live",
      occurred_at: "2026-09-19T02:00:00.000Z",
      data: {
        type: "evidence_receipt_recorded", worker: watch.worker, receipt_id: "sealed-current-evidence-with-send",
        producer_id: "collector:test", producer_role: "COLLECTOR", evidence_class: "ARTIFACT",
        independence: "SAME_PROVENANCE", freshness: "CURRENT", exact_candidate_sha256: "c".repeat(64),
        summary: "SEALED_TEST_EXECUTION_RESULT_V1",
        refs: ["status:STAGE_COMPLETE", "next_reasoning_review_required:true"], verified: true, changed_path_manifest: null,
      },
    });
    store.append({
      schema_version: 2, event_id: "provider-send-evidence", mission_id: "mission-control-live",
      occurred_at: "2026-09-19T02:00:00.500Z",
      data: {
        type: "evidence_receipt_recorded", worker: watch.worker, receipt_id: "provider-send-evidence",
        producer_id: "collector:test", producer_role: "COLLECTOR", evidence_class: "ARTIFACT",
        independence: "SAME_PROVENANCE", freshness: "CURRENT", exact_candidate_sha256: null,
        summary: "MISSION_CONTROL_RELAY_STAGE_V1",
        refs: [`request:${staleRoot.requestId}`, "generation_state:STARTED"], verified: true, changed_path_manifest: null,
      },
    });
    assert.throws(() => retireUnsentFleetSupervisorReasoningRequest(store, store.fleetSupervisorWatch(watch.projectId)!, {
      requestId: staleRoot.requestId,
      evidenceEventId: evidenceEvent.eventId,
    }, {
      schemaVersion: 1, requestId: staleRoot.requestId, pacingDomain: "provider-account:test", ledgerValid: true,
      matchingStateSections: [], queueRecordCount: 0, admissionRecordCount: 0, provenUnsent: true,
      proofSha256: "d".repeat(64),
    }, "2026-09-19T02:00:01.000Z"), /durable send, delivery, response, decision, or ambiguous lifecycle evidence/);
  } finally {
    if (previous === undefined) delete process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
    else process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = previous;
    if (previousPolicy === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
    else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = previousPolicy;
    store.close();
  }
});

test("overdue reasoning review and directive continuity gaps are decision-changing reasoning triggers", () => {
  const store = new EventStore(":memory:");
  try {
    seedStore(store);
    const watch = store.ensureFleetSupervisorWatch("project:auth", "task:auth", "auth", t0);
    const events = store.workerEvents("auth");
    const reasoningIndex = events.findLastIndex((event) => event.data.type === "reasoning_supervision_recorded");
    const overdue = structuredClone(events) as StoredEvent[];
    const reasoning = overdue[reasoningIndex].data;
    assert.equal(reasoning.type, "reasoning_supervision_recorded");
    overdue[reasoningIndex] = { ...overdue[reasoningIndex], data: { ...reasoning, review_freshness: "OVERDUE" } } as StoredEvent;
    assert.equal(classifyFleetSupervisorTick(watch, overdue, { valid: true, errors: [] }).trigger, "REASONING_REVIEW_OVERDUE");
    const noDirective = events.filter((event) => event.data.type !== "execution_directive_recorded");
    assert.equal(classifyFleetSupervisorTick(watch, noDirective, { valid: true, errors: [] }).trigger, "WORKER_DIRECTIVE_CONTINUITY_GAP");
  } finally { store.close(); }
});

test("one owner condition notifies once and duplicate ticks are deduplicated", async () => {
  const store = issue47Store();
  try {
    const watch = dueWatch(store, "project:human-design");
    const queue = store.workerEvents(watch.worker).findLast((event) => event.data.type === "work_queue_published")!.data;
    assert.equal(queue.type, "work_queue_published");
    appendWorker(store, watch, "owner-blocker", {
      type: "structured_blocker_recorded", worker: watch.worker, blocker_id: "blocker:owner-auth", task_id: watch.taskId,
      direction_id: queue.direction_id, queue_item_id: queue.items[0].item_id, status: "OPEN", severity: "BLOCKING",
      title: "Owner authentication required", description: "Complete the unavoidable human authentication gesture.",
      impact: "Execution cannot continue.", blocking_scope: [watch.taskId], workaround_available: false, workaround: null,
      required_actor: { kind: "OWNER", id: "owner:primary" }, evidence_refs: [], reported_by: `worker:${watch.worker}`,
      needs_owner: true, reported_at: t0,
    });
    let notifications = 0;
    const runtime = new FleetSupervisorRuntime(store, { notifyOwner: () => { notifications += 1; } });
    const first = await runtime.tick(due);
    assert.equal(first[0].notificationDisposition, "OWNER_NOTIFIED");
    store.configureFleetSupervisorWatch(watch.projectId, { cadenceMs: DEFAULT_FLEET_SUPERVISOR_CADENCE_MS }, due);
    const duplicate = await runtime.tick("2026-09-19T02:00:00.000Z");
    assert.equal(duplicate[0].notificationDisposition, "SUPPRESSED_DUPLICATE");
    assert.equal(notifications, 1);
  } finally { store.close(); }
});

test("terminal queue notifies once, deactivates, and dashboard explains the notification", async () => {
  const store = issue47Store();
  try {
    const watch = dueWatch(store, "project:human-design");
    const queue = store.workerEvents(watch.worker).findLast((event) => event.data.type === "work_queue_published")!.data;
    assert.equal(queue.type, "work_queue_published");
    appendWorker(store, watch, "terminal-queue", {
      ...queue, queue_revision_id: "queue:human-design:terminal", revision: queue.revision + 1,
      previous_queue_revision_id: queue.queue_revision_id, published_at: t0,
      items: queue.items.map((item) => ({ ...item, status: "DONE" as const, updated_at: t0 })),
    });
    let notifications = 0;
    await new FleetSupervisorRuntime(store, { notifyOwner: () => { notifications += 1; } }).tick(due);
    const current = store.fleetSupervisorWatch(watch.projectId)!;
    assert.equal(current.state, "TERMINAL");
    assert.equal(current.nextTickAt, null);
    assert.equal(notifications, 1);
    const snapshot = snapshotFromStore(store);
    const projected = snapshot.fleetSupervisor.watches.find((item) => item.projectId === watch.projectId)!;
    assert.equal(projected.lastTrigger, "TERMINAL");
    assert.equal(projected.notificationReason, "Terminal result is ready.");
  } finally { store.close(); }
});

test("external and integrity hard gates prevent automatic continuation", () => {
  const store = issue47Store();
  try {
    const watch = store.fleetSupervisorWatch("project:human-design")!;
    const queue = store.workerEvents(watch.worker).findLast((event) => event.data.type === "work_queue_published")!.data;
    assert.equal(queue.type, "work_queue_published");
    appendWorker(store, watch, "external-blocker", {
      type: "structured_blocker_recorded", worker: watch.worker, blocker_id: "blocker:external", task_id: watch.taskId,
      direction_id: queue.direction_id, queue_item_id: null, status: "OPEN", severity: "BLOCKING", title: "External dependency",
      description: "Wait for the external authority.", impact: "Blocked.", blocking_scope: [watch.taskId],
      workaround_available: false, workaround: null, required_actor: { kind: "EXTERNAL", id: "external:authority" },
      evidence_refs: [], reported_by: `worker:${watch.worker}`, needs_owner: false, reported_at: t0,
    });
    const external = classifyFleetSupervisorTick(watch, store.workerEvents(watch.worker), { valid: true, errors: [] });
    assert.equal(external.trigger, "BLOCKED_EXTERNAL");
    assert.equal(external.mechanicalRecoveryEligible, false);
    const invalid = classifyFleetSupervisorTick(watch, store.workerEvents(watch.worker), { valid: false, errors: ["broken chain"] });
    assert.equal(invalid.trigger, "PROJECT_INTEGRITY_FAILURE");
    assert.equal(invalid.notifyOwner, true);
  } finally { store.close(); }
});

function issue47Store() { const store = new EventStore(":memory:"); seedIssue47Store(store); return store; }
function dueWatch(store: EventStore, projectId: string) {
  store.configureFleetSupervisorWatch(projectId, { cadenceMs: DEFAULT_FLEET_SUPERVISOR_CADENCE_MS }, t0);
  return store.fleetSupervisorWatch(projectId)!;
}
function appendSystem(store: EventStore, worker: string, id: string, data: MissionControlEventV2) {
  store.append({ schema_version: 2, event_id: `fleet-test:${id}`, mission_id: "mission-control-live", occurred_at: t0, data }, undefined,
    { id: "system:fleet-supervisor", kind: "SYSTEM", workerScopes: [worker], taskScopes: ["*"] });
}
function appendWorker(store: EventStore, watch: FleetSupervisorWatchRecord, id: string, data: MissionControlEventV2) {
  store.append({ schema_version: 2, event_id: `fleet-test:${id}`, mission_id: "mission-control-live", occurred_at: t0, data }, undefined,
    { id: `worker:${watch.worker}`, kind: "WORKER", workerScopes: [watch.worker], taskScopes: [watch.taskId] });
}

function configuredProjectManager() {
  return {
    scope: "PROJECT_MANAGER",
    supervisorId: "mc-project-manager",
    label: "MC project manager",
    workerId: null,
    requiredApp: "Mission Control",
    registrationId: "registration:test:mc-project-manager",
    ownership: "MISSION_CONTROL_ONLY",
    purpose: "Dedicated Mission Control reasoning supervisor",
    accountAlias: "owner-account",
    workspaceAlias: "personal",
    privateLocatorRef: "owner-config:test:mc-project-manager",
    registrationProvenance: {
      registeredBy: "OWNER",
      registeredAt: "2026-09-20T00:00:00.000Z",
      sourceRef: "owner:test",
    },
    consumerControls: {
      modelSelectionPolicy: "TOP_VISIBLE_SELECTABLE_MODEL",
      thinkingControlLabel: "Thinking effort",
      thinkingVisibleLabel: "Extra High",
      thinkingOrdinal: "4 of 5",
      accountPlanLabel: "Pro",
      accountPlanRole: "PROVENANCE_METADATA_ONLY",
      accountPlanIsReasoningMode: false,
    },
    bootstrapCapability: {
      chatId: "bootstrap:pm",
      url: "https://chatgpt.com/c/test-project-manager",
      challengeId: "challenge:pm",
    },
  };
}

function configuredReceiptPolicy() {
  return {
    repository: "owner/private-receipts",
    decisionIssueNumber: 4,
    capabilityIssueNumber: 4,
    stageIssueNumber: 4,
    authorizedWriterLogins: ["owner"],
    capabilityChallenges: [],
    requestBound: { enabled: true, relayProducerIds: ["collector:relay"] },
  };
}

function appendInvalidFailureEvidence(
  store: EventStore, worker: string, requestId: string, supervisorId: string,
  providerSessionId: string, failureReceiptSha256: string, canonicalBodySha256: string, occurredAt: string,
  producerId = "collector:relay", extraRefs: string[] = [], tag?: string,
) {
  const common = {
    schema_version: 2 as const, mission_id: "mission-control-live", occurred_at: occurredAt,
  };
  const data = (receiptId: string, summary: string, refs: string[]) => ({
    type: "evidence_receipt_recorded" as const, worker, receipt_id: receiptId,
    producer_id: producerId, producer_role: "COLLECTOR" as const, evidence_class: "ARTIFACT" as const,
    independence: "SAME_PROVENANCE" as const, freshness: "CURRENT" as const, exact_candidate_sha256: null,
    summary, refs, verified: true, changed_path_manifest: null,
  });
  const suffix = tag ?? (producerId === "collector:relay" ? "trusted" : "untrusted");
  store.append({ ...common, event_id: `invalid-canonical-failure-test-${suffix}`, data: data(`invalid-canonical-failure-test-${suffix}`,
    providerInvalidCanonicalDecisionSummary, [`request:${requestId}`, `supervisor:${supervisorId}`,
      `provider_session:${providerSessionId}`, `failure_receipt_sha256:${failureReceiptSha256}`,
      `canonical_body_sha256:${canonicalBodySha256}`,
      "classification:PROVIDER_INVALID_CANONICAL_DECISION", "canonical_decision_admitted:false", ...extraRefs]) });
}

function appendCompleteProviderSession(
  store: EventStore, worker: string, requestId: string, supervisorId: string,
  providerSessionId: string, occurredAt: string, producerId = "collector:relay",
) {
  const suffix = producerId === "collector:relay" ? "trusted" : "untrusted";
  store.append({
    schema_version: 2, event_id: `provider-session-invalid-canonical-test-${suffix}`,
    mission_id: "mission-control-live", occurred_at: occurredAt,
    data: {
      type: "evidence_receipt_recorded", worker, receipt_id: `provider-session-invalid-canonical-test-${suffix}`,
      producer_id: producerId, producer_role: "COLLECTOR", evidence_class: "ARTIFACT",
      independence: "SAME_PROVENANCE", freshness: "CURRENT", exact_candidate_sha256: null,
      summary: "MISSION_CONTROL_PROVIDER_SESSION_V1", refs: [`request:${requestId}`, `supervisor:${supervisorId}`,
        `provider_session:${providerSessionId}`, "lifecycle_status:COMPLETE"], verified: true, changed_path_manifest: null,
    },
  });
}
