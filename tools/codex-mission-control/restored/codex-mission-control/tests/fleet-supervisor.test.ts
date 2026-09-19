import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { snapshotFromStore } from "../lib/dashboard-data";
import { classifyFleetSupervisorTick, DEFAULT_FLEET_SUPERVISOR_CADENCE_MS, FleetSupervisorRuntime } from "../lib/fleet-supervisor";
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
