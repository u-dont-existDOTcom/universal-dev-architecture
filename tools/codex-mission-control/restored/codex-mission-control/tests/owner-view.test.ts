import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardNotice, OwnerTaskCard, ProjectWatchSummary } from "../components/Dashboard";
import { FleetQueue, QueueDependencies } from "../components/WorkerChannel";
import { readDashboardData, validTaskSnapshot, validOperatorSnapshot, snapshotFailure, orderedOpenQueue, resolvePrerequisites, workerDisposition } from "../lib/owner-view";
import type { WorkQueueItemProjection } from "../lib/worker-channel";
import { snapshotFromStore } from "../lib/dashboard-data";
import { EventStore } from "../lib/store";
import { seedIssue47Store } from "../lib/seed";
const valid = (value: unknown) => Boolean(value && typeof value === "object" && "workers" in value);
const queueItem = (patch: Partial<WorkQueueItemProjection> = {}): WorkQueueItemProjection => ({ worker: "worker-a", projectId: "project-a", taskId: "task-a", directionId: "direction-a", queueRevisionId: "queue-a", revision: 1, itemId: "item-a", title: "Review the candidate", detail: "Recorded work detail", status: "BLOCKED", priority: "P1", ordinal: 0, dependsOn: [], createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z", ...patch });
test("initial API rejection renders actionable error; partial notice is explicit; retry accepts real snapshot", async () => {
  let requestCount = 0;
  const request = (async () => ++requestCount === 1 ? new Response("unavailable", { status: 503 }) : Response.json({ workers: [] })) as typeof fetch;
  let failure;
  try { await readDashboardData("/api/workers", valid, request); assert.fail("should reject"); } catch (error) { failure = snapshotFailure(error); }
  const html = renderToStaticMarkup(createElement(DashboardNotice, { failures: { Tasks: failure! }, hasSnapshot: false, loading: false, onRetry() {} }));
  assert.match(html, /role="alert"/); assert.match(html, /HTTP 503/); assert.match(html, />Retry</); assert.doesNotMatch(html, /Loading/);
  const partial = renderToStaticMarkup(createElement(DashboardNotice, { failures: { Infrastructure: failure! }, hasSnapshot: true, loading: false, onRetry() {} }));
  assert.match(partial, /Partial \/ last-known view/);
  assert.deepEqual(await readDashboardData("/api/workers", valid, request), { workers: [] });
});
test("session, network and malformed data failures remain distinct", async () => {
  for (const status of [401, 403]) await assert.rejects(readDashboardData("/api/workers", valid, (async () => new Response(null, { status })) as typeof fetch), error => snapshotFailure(error).kind === "session");
  await assert.rejects(readDashboardData("/api/workers", valid, (async () => { throw new Error("offline"); }) as typeof fetch), error => snapshotFailure(error).kind === "network");
  await assert.rejects(readDashboardData("/api/workers", valid, (async () => Response.json({ nope: true })) as typeof fetch), error => snapshotFailure(error).kind === "server");
});
test("blocked task resolves prerequisite only in exact worker/project/task/revision scope", () => {
  const blocked = queueItem({ dependsOn: ["prerequisite", "missing"] });
  const prerequisite = queueItem({ itemId: "prerequisite", title: "Owner reviews evidence", status: "WAITING_REVIEW" });
  const collision = { ...prerequisite, projectId: "other-project", title: "Unrelated task" };
  const queue = [blocked, prerequisite, collision];
  assert.equal(resolvePrerequisites(blocked, queue)[0].item?.title, prerequisite.title);
  assert.equal(resolvePrerequisites(blocked, [blocked, collision])[0].item, null);
  assert.equal(resolvePrerequisites(blocked, [blocked, prerequisite, prerequisite])[0].reason, "Ambiguous reference");
  assert.equal(resolvePrerequisites(blocked, [blocked, { ...prerequisite, taskId: "other-task" }])[0].item, null);
  const html = renderToStaticMarkup(createElement(QueueDependencies, { item: blocked, queue }));
  assert.match(html, /Owner reviews evidence/); assert.match(html, /Unresolved reference.*missing/); assert.match(html, /unblock condition: Not recorded/); assert.doesNotMatch(html, /Unrelated task/);
});
test("recommended ordering preserves recorded priority and ordinal, without treating readiness as approval", () => {
  const items = [queueItem({ priority: "P2" }), queueItem({ itemId: "b", priority: "P0", ordinal: 2, status: "READY" }), queueItem({ itemId: "c", priority: "P0", ordinal: 1 }), queueItem({ itemId: "done", priority: "P0", status: "DONE" })];
  assert.deepEqual(orderedOpenQueue(items).map(item => item.itemId), ["c", "b", "item-a"]);
  const html = renderToStaticMarkup(createElement(FleetQueue, { queue: items }));
  for (const field of ["Goal", "Where we are", "Next needed", "Your action"]) assert.ok(html.includes(field));
  assert.match(html, /authorization not established/);
});
test("known unfinished task survives expired reporting and health cannot establish readiness", () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const validSnapshot = snapshotFromStore(store);
    assert.equal(validTaskSnapshot(validSnapshot), true);
    assert.equal(validTaskSnapshot({ ...validSnapshot, connectionSummary: null }), false);
    assert.equal(validTaskSnapshot({ ...validSnapshot, fleetSupervisor: null }), false);
    assert.equal(validTaskSnapshot({ ...validSnapshot, workers: [{}] }), false);
    assert.equal(validOperatorSnapshot({ overallState: "HEALTHY" }), false);
    store.append({ schema_version: 2, event_id: "offline-retention-test", mission_id: "mission-control-live", occurred_at: "2026-09-16T00:00:00Z", data: { type: "worker_connection_observed", worker: "mission-control-live-slice", connection_id: "offline-test", state: "CONNECTED", runtime_kind: "POLLING_SIDECAR", endpoint_id: "worker:mission-control-live-slice:poll", observed_at: "2026-09-16T00:00:00Z", lease_expires_at: "2026-09-16T00:01:00Z", source: null, detail: "Old authenticated report" } }, undefined, { id: "worker:mission-control-live-slice", kind: "WORKER", workerScopes: ["mission-control-live-slice"], taskScopes: ["task:mission-control-live-slice"] });
    const snapshot = snapshotFromStore(store, { includeFixtureOnly: false });
    const worker = snapshot.workers.find(worker => worker.id === "mission-control-live-slice")!;
    assert.ok(worker); assert.equal(worker.connection.state, "OFFLINE_CONFIGURED"); assert.ok(snapshot.fleetQueue.length);
    const html = renderToStaticMarkup(createElement(OwnerTaskCard, { worker }));
    for (const field of ["Goal", "Where we are", "Next needed", "Your action"]) assert.ok(html.includes(field));
    assert.match(html, /offline configured/);
    worker.overallTraffic = "GREEN";
    assert.doesNotMatch(workerDisposition(worker), /READY TO CONTINUE|complete|approved/i);
  } finally { store.close(); }
});

test("project supervision view exposes recorded project/watch relationships without inventing coverage", () => {
  const queue = [
    queueItem({ projectId: "project-a", taskId: "task-a", itemId: "blocked", dependsOn: ["prerequisite"] }),
    queueItem({ projectId: "project-a", taskId: "task-a", itemId: "prerequisite", status: "READY", dependsOn: [] }),
    queueItem({ projectId: "project-b", taskId: "task-b", itemId: "other", status: "IN_PROGRESS", dependsOn: [] }),
  ];
  const supervisor = { defaultCadenceMs: 60_000, activeCount: 1, watches: [
    { projectId: "project-a", taskId: "task-a", worker: "worker-a", state: "ACTIVE" as const, cadenceMs: 60_000,
      nextTickAt: "2026-09-22T01:01:00Z", lastTickAt: "2026-09-22T01:00:00Z", lastTrigger: "cadence",
      lastResult: "healthy", notificationDisposition: "NONE", notificationReason: null },
  ] };
  const html = renderToStaticMarkup(createElement(ProjectWatchSummary, { supervisor, queue }));
  assert.match(html, /Projects and supervision/);
  assert.match(html, /project-a/);
  assert.match(html, /project-b/);
  assert.match(html, /Dependency links/);
  assert.match(html, /Queue evidence exists for this project, but no fleet-supervisor watch is recorded/);
});
