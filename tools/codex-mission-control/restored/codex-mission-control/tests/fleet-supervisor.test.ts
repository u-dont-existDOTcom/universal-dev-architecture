import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { snapshotFromStore } from "../lib/dashboard-data";
import {
  classifyFleetSupervisorTick,
  DEFAULT_FLEET_SUPERVISOR_CADENCE_MS,
  FleetSupervisorRuntime,
  replaceFleetSupervisorReasoningRequest,
  retireUnsentFleetSupervisorReasoningRequest,
  routeFleetSupervisorReasoning,
} from "../lib/fleet-supervisor";
import { pendingDecisionRequests, supervisoryRequestRetiredUnsentSummary } from "../lib/github-decision-receipts";
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

test("fleet reasoning routes one idempotent in-band request against the complete durable ledger", () => {
  const store = new EventStore(":memory:");
  const previous = process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
  const previousPolicy = process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
  try {
    seedStore(store);
    process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = JSON.stringify([configuredProjectManager()]);
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(configuredReceiptPolicy());
    const watch = store.ensureFleetSupervisorWatch("project:auth", "task:auth", "auth", t0);
    const workerEvents = store.workerEvents(watch.worker);
    assert.ok(store.allEvents().length > workerEvents.length);
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
