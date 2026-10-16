import assert from "node:assert/strict";
import test from "node:test";

import { isRelayTransportEvent, snapshotFromStore, workerSnapshotFromEvents, workerSnapshotFromStore, workerTransportSnapshotFromStore } from "../lib/dashboard-data";
import { pendingDecisionRequests } from "../lib/github-decision-receipts";
import { projectWorkerById, projectWorkers } from "../lib/projection";
import { seedIssue47Store } from "../lib/seed";
import { EventStore } from "../lib/store";

test("production snapshots suppress fixture-only workers and admit authenticated live connection evidence", () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const fixtures = snapshotFromStore(store);
    assert.ok(fixtures.workers.length > 0);
    assert.ok(fixtures.connectionSummary.fixtureOnly > 0);

    const hidden = snapshotFromStore(store, { includeFixtureOnly: false });
    assert.equal(hidden.workers.length, 0);
    assert.equal(hidden.connectionSummary.suppressedFixtureOnly, fixtures.workers.length);
    assert.equal(workerSnapshotFromStore(store, "mission-control-live-slice", { includeFixtureOnly: false }), null);

    const now = new Date();
    store.append({
      schema_version: 2,
      event_id: "live-connection:test",
      mission_id: "mission-control-live",
      occurred_at: now.toISOString(),
      data: {
        type: "worker_connection_observed",
        worker: "mission-control-live-slice",
        connection_id: "connection:live:test",
        state: "CONNECTED",
        runtime_kind: "POLLING_SIDECAR",
        endpoint_id: "worker:mission-control-live-slice:poll",
        observed_at: now.toISOString(),
        lease_expires_at: new Date(now.getTime() + 300_000).toISOString(),
        source: {
          repository: "/srv/universal-dev-architecture",
          branch: "task/live",
          head: "a".repeat(40),
          state_path: "/var/lib/mission-control-worker/CURRENT-STATE.md",
        },
        detail: "Authenticated VPS worker sidecar is current.",
      },
    }, undefined, {
      id: "worker:mission-control-live-slice",
      kind: "WORKER",
      workerScopes: ["mission-control-live-slice"],
      taskScopes: ["task:mission-control-live-slice"],
    });

    const live = snapshotFromStore(store, { includeFixtureOnly: false });
    assert.deepEqual(live.workers.map((worker) => worker.id), ["mission-control-live-slice"]);
    assert.equal(live.workers[0].connection.state, "CONNECTED");
    assert.ok(workerSnapshotFromStore(store, "mission-control-live-slice", { includeFixtureOnly: false }));
  } finally {
    store.close();
  }
});

test("relay transport projection preserves route evidence and omits unrelated worker history", () => {
  assert.equal(isRelayTransportEvent({ data: { type: "execution_directive_recorded" } } as never), true);
  assert.equal(isRelayTransportEvent({ data: { type: "execution_receipt_recorded" } } as never), true);
  assert.equal(isRelayTransportEvent({ data: { type: "evidence_receipt_recorded",
    summary: "MISSION_CONTROL_REASONING_REPLACEMENT_PROOF_V1" } } as never), true);
  assert.equal(isRelayTransportEvent({ data: { type: "task_progress_reported" } } as never), false);
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    store.append({
      schema_version: 2,
      event_id: "relay-transport:test",
      mission_id: "mission-control-live",
      occurred_at: "2026-09-18T00:00:00.000Z",
      data: {
        type: "evidence_receipt_recorded",
        worker: "mission-control-live-slice",
        receipt_id: "relay-transport:test",
        producer_id: "collector:test",
        producer_role: "COLLECTOR",
        evidence_class: "ARTIFACT",
        independence: "SAME_PROVENANCE",
        freshness: "CURRENT",
        exact_candidate_sha256: null,
        summary: "MISSION_CONTROL_PROVIDER_SESSION_V1",
        refs: ["request:test", "provider_session:test", "semantic_authority:false"],
        verified: true,
        changed_path_manifest: null,
      },
    }, undefined, { id: "collector:test", kind: "COLLECTOR", workerScopes: ["mission-control-live-slice"], taskScopes: ["*"] });
    const all = store.workerEvents("mission-control-live-slice");
    const transportEvidence = all.find(isRelayTransportEvent);
    assert.ok(transportEvidence);
    const transport = workerTransportSnapshotFromStore(store, "mission-control-live-slice");
    assert.ok(transport);
    assert.equal(transport.worker.id, "mission-control-live-slice");
    assert.equal(transport.worker.timeline.every(isRelayTransportEvent), true);
    assert.equal(transport.worker.timeline.some((event) => event.eventId === transportEvidence.eventId), true);
    assert.deepEqual(
      transport.worker.authoritativePendingRequestIds,
      pendingDecisionRequests(all)
        .filter((request) => request.worker === "mission-control-live-slice"
          && Number.isFinite(Date.parse(request.expiresAt))
          && Date.parse(request.expiresAt) > Date.now())
        .map((request) => request.requestId),
    );
    assert.ok(transport.worker.timeline.length < all.length);
    assert.equal(JSON.stringify(transport).length < JSON.stringify(workerSnapshotFromStore(store, "mission-control-live-slice")).length, true);
  } finally {
    store.close();
  }
});

test("one task's page projects only that task and equals its entry in the fleet projection", () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const events = store.allEvents();
    const now = new Date("2026-10-16T12:00:00.000Z");
    const fleet = projectWorkers(events, now);
    assert.ok(fleet.length > 1);
    for (const worker of fleet) assert.deepEqual(projectWorkerById(events, worker.id, now), worker);
    const listed = new Set(fleet.map((worker) => worker.id));
    for (const worker of new Set(events.map((event) => event.worker).filter((id): id is string => typeof id === "string"))) {
      if (!listed.has(worker)) assert.equal(projectWorkerById(events, worker, now), null);
    }
    assert.equal(projectWorkerById(events, "no-such-task", now), null);
    assert.equal(workerSnapshotFromEvents(events, fleet[0]!.id)?.worker.id, fleet[0]!.id);
    assert.equal(workerSnapshotFromEvents(events, "no-such-task"), null);
  } finally {
    store.close();
  }
});
