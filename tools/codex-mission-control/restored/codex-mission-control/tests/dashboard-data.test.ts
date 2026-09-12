import assert from "node:assert/strict";
import test from "node:test";

import { snapshotFromStore, workerSnapshotFromStore } from "../lib/dashboard-data";
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
