import assert from "node:assert/strict";
import test from "node:test";
import { snapshotFromStore, workerSnapshotFromStore } from "../lib/dashboard-data";
import { validTaskSnapshot } from "../lib/owner-view";
import { seedIssue47Store } from "../lib/seed";
import { RECENT_TIMELINE_LIMIT, snapshotForTimeline } from "../lib/snapshot-response";
import { EventStore } from "../lib/store";

test("compact real projections retain every task field and pass unchanged dashboard validation", () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const full = snapshotFromStore(store);
    assert.ok(full.workers.length > 0);
    assert.equal(validTaskSnapshot(full), true);
    const originalBytes = JSON.stringify(full);
    const compact = snapshotForTimeline(full, "recent");
    assert.equal(validTaskSnapshot(compact), true);
    assert.deepEqual(compact, {
      ...full,
      workers: full.workers.map((worker) => ({
        ...worker,
        timeline: worker.timeline.slice(0, RECENT_TIMELINE_LIMIT),
        timelineTotal: worker.timeline.length,
        timelineTruncated: worker.timeline.length > RECENT_TIMELINE_LIMIT,
      })),
    });
    assert.equal(JSON.stringify(full), originalBytes);
    assert.equal(JSON.stringify(snapshotForTimeline(full, null)), originalBytes);
    for (const worker of full.workers) {
      const detail = workerSnapshotFromStore(store, worker.id);
      assert.ok(detail);
      assert.deepEqual(detail.worker.timeline, worker.timeline);
      assert.equal(Object.hasOwn(detail.worker, "timelineTruncated"), false);
    }
  } finally {
    store.close();
  }
});
