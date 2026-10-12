import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RECENT_TIMELINE_LIMIT, snapshotForTimeline } from "../lib/snapshot-response";

function fixture(timelineLengths: number[], payloadBytes = 0) {
  return {
    workers: timelineLengths.map((length, index) => ({
      id: `worker-${index}`,
      name: `Worker ${index}`,
      connection: { state: "CONNECTED", detail: "Recorded runtime evidence" },
      ownerOutcome: { id: `outcome-${index}`, state: "OPEN", currentGap: "Review candidate" },
      health: "GREEN",
      channel: { messages: [], queue: [], blockers: [], proposals: [], freshness: "CURRENT" },
      correction: { ownerActionType: "NONE", ownerActionText: "" },
      timeline: Array.from({ length }, (_, ordinal) => ({
        sequence: length - ordinal,
        eventId: `event-${index}-${length - ordinal}`,
        // Equal source times still retain ledger order; no timestamp sorting.
        occurredAt: "2026-10-09T00:00:00Z",
        worker: `worker-${index}`,
        data: { type: "evidence_receipt_recorded", summary: "x".repeat(payloadBytes) },
      })),
    })),
    fleetQueue: [{ itemId: "queued-task", worker: "worker-0", status: "READY" }],
    channelSummary: { staleDirections: 0, openBlockers: 0 },
    connectionSummary: { connected: timelineLengths.length, offlineConfigured: 0 },
    fleetSupervisor: { defaultCadenceMs: 3_600_000, watches: [], activeCount: 0 },
    liveSource: null,
    summary: "Full-history change summary stays intact",
    lastViewedEventId: 12,
    latestEventId: 100,
    generatedAt: "2026-10-09T00:00:00Z",
  };
}

test("compact timelines keep the newest events in their existing order and true totals", () => {
  assert.ok(RECENT_TIMELINE_LIMIT > 0 && RECENT_TIMELINE_LIMIT <= 50);
  const full = fixture([0, 1, RECENT_TIMELINE_LIMIT, RECENT_TIMELINE_LIMIT + 1, 200]);
  const originalBytes = JSON.stringify(full);
  const compact = snapshotForTimeline(full, "recent");
  assert.deepEqual(compact, {
    ...full,
    workers: full.workers.map((worker) => ({
      ...worker,
      timeline: worker.timeline.slice(0, RECENT_TIMELINE_LIMIT),
      timelineTotal: worker.timeline.length,
      timelineTruncated: worker.timeline.length > RECENT_TIMELINE_LIMIT,
    })),
  });
  assert.equal(JSON.stringify(full), originalBytes, "compaction must not mutate full history");
  for (const [index, worker] of compact.workers.entries()) {
    assert.ok(worker.timeline.length <= RECENT_TIMELINE_LIMIT);
    assert.deepEqual(worker.timeline, full.workers[index].timeline.slice(0, RECENT_TIMELINE_LIMIT));
  }
});

test("default and unrecognized forms preserve the full response byte for byte", () => {
  const full = fixture([100, 0]);
  const bytes = Buffer.from(JSON.stringify(full));
  for (const timeline of [null, "", "full", "all", "unknown", "RECENT"]) {
    const response = snapshotForTimeline(full, timeline);
    assert.strictEqual(response, full);
    assert.deepEqual(Buffer.from(JSON.stringify(response)), bytes);
    for (const worker of response.workers) {
      assert.equal(Object.hasOwn(worker, "timelineTotal"), false);
      assert.equal(Object.hasOwn(worker, "timelineTruncated"), false);
    }
  }
});

test("a snapshot with a 24 MB worker timeline compacts to well under 1 MB", (context) => {
  const full = fixture([6_000, 10, 10, 10], 4_096);
  const fullBytes = Buffer.byteLength(JSON.stringify(full));
  const timelineBytes = Buffer.byteLength(JSON.stringify(full.workers[0].timeline));
  const compactBytes = Buffer.byteLength(JSON.stringify(snapshotForTimeline(full, "recent")));
  assert.ok(timelineBytes > 24_000_000);
  assert.ok(fullBytes > 24_000_000);
  assert.ok(compactBytes < 1_000_000, `compact snapshot was ${compactBytes} bytes`);
  assert.ok(compactBytes < fullBytes / 50);
  context.diagnostic(`full=${fullBytes} bytes; largeTimeline=${timelineBytes} bytes; compact=${compactBytes} bytes; limit=${RECENT_TIMELINE_LIMIT}`);
});

test("the daemon applies compaction only at the aggregate snapshot response boundary", () => {
  const source = readFileSync(new URL("../daemon/server.ts", import.meta.url), "utf8");
  assert.match(source, /snapshotForTimeline\(snapshot, url\.searchParams\.get\("timeline"\)\)/);
  assert.equal((source.match(/snapshotForTimeline\(/g) ?? []).length, 1);
});

test("the dashboard opts in while retaining its existing task validation", () => {
  const source = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /readDashboardData<Snapshot>\("\/api\/workers\?timeline=recent", validTaskSnapshot\)/);
  assert.match(source, /readDashboardData<OperatorStatusProjection>\("\/api\/operator-status", validOperatorSnapshot\)/);
});
