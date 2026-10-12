import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardNotice, ownerActionForCard, OwnerTaskCard, ProjectWatchSummary } from "../components/Dashboard";
import { FleetQueue, QueueDependencies } from "../components/WorkerChannel";
import { readDashboardData, validTaskSnapshot, validOperatorSnapshot, snapshotFailure, orderedOpenQueue, ownerActionReasonCodesForTheOwner, ownerAlarmReasonCodes, ownerAttention, resolvePrerequisites, workerDisposition } from "../lib/owner-view";
import { readFileSync } from "node:fs";
import type { WorkQueueItemProjection } from "../lib/worker-channel";
import { snapshotFromStore } from "../lib/dashboard-data";
import { EventStore } from "../lib/store";
import { seedIssue47Store } from "../lib/seed";
const valid = (value: unknown) => Boolean(value && typeof value === "object" && "workers" in value);
const queueItem = (patch: Partial<WorkQueueItemProjection> = {}): WorkQueueItemProjection => ({ worker: "worker-a", projectId: "project-a", taskId: "task-a", directionId: "direction-a", queueRevisionId: "queue-a", revision: 1, itemId: "item-a", title: "Review the candidate", detail: "Recorded work detail", status: "BLOCKED", priority: "P1", ordinal: 0, dependsOn: [], createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z", ...patch });

function liveSliceWorker() {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    return snapshotFromStore(store).workers.find(worker => worker.id === "mission-control-live-slice")!;
  } finally { store.close(); }
}

function withOwnerAction(worker: ReturnType<typeof liveSliceWorker>, patch: Record<string, unknown>) {
  const ownerAction = { ...worker.correction.ownerAction, status: "OPEN", ...patch } as typeof worker.correction.ownerAction;
  return { ...worker, correction: { ...worker.correction, ownerActionType: ownerAction.kind, ownerActionText: ownerAction.exact_text, ownerAction } };
}

test("the first screen separates real owner decisions from alarms Mission Control raised itself", () => {
  const base = liveSliceWorker();
  const now = new Date("2026-10-11T01:00:00Z");
  const missing = withOwnerAction(base, { kind: "MANUAL_INTERVENTION_REQUIRED", reason_code: "OWNER.ACTION_TELEMETRY_MISSING",
    exact_text: "Owner-action telemetry is missing; repair observability before assuming no action is required." });
  const missingAttention = ownerAttention(missing, now);
  assert.equal(missingAttention?.kind, "alarm");
  assert.match(missingAttention?.kind === "alarm" ? missingAttention.title : "", /Not reporting whether it needs you/);
  assert.match(workerDisposition(missing), /^Needs a look: not reporting/);
  const overdue = withOwnerAction(base, { kind: "MANUAL_INTERVENTION_REQUIRED", reason_code: "OWNER.NONE_NEXT_ACTION_OVERDUE",
    exact_text: "The non-owner next action is overdue: Execute the v8b gate and record exact artifacts.", due_at: "2026-10-04T01:00:00Z" });
  const overdueAttention = ownerAttention(overdue, now);
  assert.equal(overdueAttention?.kind, "alarm");
  assert.equal(overdueAttention?.kind === "alarm" ? overdueAttention.explanation : "",
    "The next step isn't yours: Execute the v8b gate and record exact artifacts (due 7 days ago). If the delay matters, ask its supervisor why.");
  const decision = withOwnerAction(base, { kind: "MANUAL_INTERVENTION_REQUIRED", reason_code: "SUPERVISOR.CREDENTIAL_ROTATION",
    exact_text: "Rotate the relay credential on the primary host." });
  assert.deepEqual(ownerAttention(decision, now), { kind: "decision" });
  assert.equal(workerDisposition(decision), "Waiting for your decision");
  assert.equal(ownerAttention(withOwnerAction(base, { kind: "MANUAL_INTERVENTION_REQUIRED", reason_code: "OWNER.ACTION_TELEMETRY_MISSING", status: "COMPLETED" }), now), null);
  const none = { ...base, correction: { ...base.correction, ownerActionType: "NONE" as const } };
  assert.equal(ownerAttention(none, now), null);
});

test("a task card's Your action shows the owner's own action, and says an alarm has nothing to decide", () => {
  const base = liveSliceWorker();
  const now = new Date("2026-10-11T01:00:00Z");
  const telemetry = "Owner-action telemetry is missing; repair observability before assuming no action is required.";
  const missing = withOwnerAction(base, { kind: "MANUAL_INTERVENTION_REQUIRED", reason_code: "OWNER.ACTION_TELEMETRY_MISSING", exact_text: telemetry });
  assert.match(ownerActionForCard(missing, now), /^Nothing to decide\. Its worker hasn't reported its next step/);
  const card = renderToStaticMarkup(createElement(OwnerTaskCard, { worker: missing }));
  assert.match(card, /<dt>Your action<\/dt><dd>Nothing to decide\./);
  assert.doesNotMatch(card, /Owner-action telemetry is missing/, "the alarm's internal text is not presented as the owner's action");
  const overdue = withOwnerAction(base, { kind: "MANUAL_INTERVENTION_REQUIRED", reason_code: "OWNER.NONE_NEXT_ACTION_OVERDUE",
    exact_text: "The non-owner next action is overdue: Execute the v8b gate.", due_at: "2026-10-10T01:00:00Z" });
  assert.equal(ownerActionForCard(overdue, now), "Nothing to decide. The next step isn't yours: Execute the v8b gate (due 24 hours ago). If the delay matters, ask its supervisor why.");
  const decision = withOwnerAction(base, { kind: "DECISION_REQUIRED", reason_code: "SUPERVISOR.SCOPE_CHOICE", exact_text: "Choose whether the import keeps old rows." });
  assert.equal(ownerActionForCard(decision, now), "Choose whether the import keeps old rows.");
  assert.match(renderToStaticMarkup(createElement(OwnerTaskCard, { worker: decision })), /<dt>Your action<\/dt><dd>Choose whether the import keeps old rows\.<\/dd>/);
  assert.equal(ownerActionForCard(withOwnerAction(base, { kind: "DECISION_REQUIRED", reason_code: "SUPERVISOR.SCOPE_CHOICE", exact_text: "" }), now), "Action details not recorded");
  assert.equal(ownerActionForCard(withOwnerAction(base, { kind: "MANUAL_INTERVENTION_REQUIRED", reason_code: "OWNER.ACTION_TELEMETRY_MISSING", status: "COMPLETED" }), now), "None recorded");
  assert.equal(ownerActionForCard({ ...base, correction: { ...base.correction, ownerActionType: "NONE" as const } }, now), "None recorded");
});

test("every owner action the projection makes up itself is classified as an alarm or as the owner's", () => {
  const source = readFileSync(new URL("../lib/projection.ts", import.meta.url), "utf8");
  const made = [...source.matchAll(/reason_code: "(OWNER\.[A-Z_]+)"/g)].map(match => match[1]);
  assert.ok(made.length >= 7, "the projection still makes up owner actions");
  for (const code of made) {
    assert.ok(ownerAlarmReasonCodes.includes(code) || ownerActionReasonCodesForTheOwner.includes(code),
      `${code} needs a place on the first screen: an alarm with plain words, or the owner's own action`);
  }
  const blocked = withOwnerAction(liveSliceWorker(), { kind: "MANUAL_INTERVENTION_REQUIRED", reason_code: "OWNER.CORRECTION_BLOCKED_BY_OWNER",
    exact_text: "Correction is blocked on owner intervention: approve the data deletion." });
  assert.deepEqual(ownerAttention(blocked), { kind: "decision" });
  const undelivered = withOwnerAction(liveSliceWorker(), { kind: "MANUAL_INTERVENTION_REQUIRED", reason_code: "OWNER.DIRECTIVE_DELIVERY_FAILED_NO_RETRY",
    exact_text: "Directive delivery failed and no working automated retry owns the next transition." });
  assert.equal(ownerAttention(undelivered)?.kind, "alarm");
});

for (const supervisor of [
  { state: "recorded", url: "https://chatgpt.com/c/real-supervisor-chat", placeholder: false },
  { state: "missing", url: "", placeholder: true },
  { state: "demo", url: "https://chatgpt.com/c/replace-demo-supervisor", placeholder: true },
]) {
  test(`current-task dashboard card exposes honest supervisor access: ${supervisor.state}`, () => {
    const store = new EventStore(":memory:");
    try {
      seedIssue47Store(store);
      const worker = snapshotFromStore(store).workers.find(worker => worker.id === "mission-control-live-slice")!;
      assert.ok(worker);
      const html = renderToStaticMarkup(createElement(OwnerTaskCard, { worker: {
        ...worker, supervisorChatUrl: supervisor.url, supervisorChatLabel: "Open specialist supervisor",
        supervisorChatIsPlaceholder: supervisor.placeholder,
      } }));
      if (supervisor.placeholder) {
        assert.match(html, /Checking for a supervisor chat/, "it looks up the configured chat before saying there is none");
        assert.doesNotMatch(html, /No supervisor chat yet/);
        assert.match(html, /href="\/supervision"/);
        assert.doesNotMatch(html, /href="https:\/\/chatgpt\.com/);
      } else {
        assert.match(html, /href="https:\/\/chatgpt\.com\/c\/real-supervisor-chat"/);
        assert.match(html, /Open specialist supervisor/);
        assert.doesNotMatch(html, /No supervisor chat yet/);
      }
    } finally { store.close(); }
  });
}

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
