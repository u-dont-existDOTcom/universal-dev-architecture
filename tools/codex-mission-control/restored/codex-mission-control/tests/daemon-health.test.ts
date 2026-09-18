import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { daemonLiveness, daemonReadiness } from "../lib/daemon-health";
import { EventStore } from "../lib/store";

test("cheap daemon liveness performs no chain or authority verification", () => {
  let chainChecks = 0;
  let authorityChecks = 0;
  const store = { latestSequence: () => 9, verifyChain: () => { chainChecks += 1; return { valid: true }; } };
  const authority = { health: async () => { authorityChecks += 1; return { configured: true, schedulerState: "ACTIVE_LEASE", ledger: { valid: true } }; } };

  assert.deepEqual(daemonLiveness(), { status: "ok", kind: "liveness" });
  assert.equal(chainChecks, 0);
  assert.equal(authorityChecks, 0);
  void store;
  void authority;
});

test("deep daemon readiness verifies event chain and submission authority", async () => {
  let sequenceReads = 0;
  let chainChecks = 0;
  let authorityChecks = 0;
  const readiness = await daemonReadiness({
    latestSequence: () => { sequenceReads += 1; return 12_345; },
    verifyChain: () => { chainChecks += 1; return { valid: true, errors: [] }; },
  }, {
    health: async () => {
      authorityChecks += 1;
      return { configured: true, schedulerState: "ACTIVE_LEASE", ledger: { valid: true, errors: [] } };
    },
  });

  assert.equal(readiness.kind, "readiness");
  assert.equal(readiness.latestSequence, 12_345);
  assert.deepEqual(readiness.chain, { valid: true, errors: [] });
  assert.deepEqual(readiness.submissionAuthorityLedger, { valid: true, errors: [] });
  assert.equal(sequenceReads, 1);
  assert.equal(chainChecks, 1);
  assert.equal(authorityChecks, 1);
});

const occurredAt = "2026-09-18T22:00:00.000Z";

function appendReview(store: EventStore, id: string) {
  store.append({
    schema_version: 2,
    event_id: id,
    mission_id: "daemon-health-test",
    occurred_at: occurredAt,
    data: {
      type: "review_marked",
      worker: null,
      reviewed_through_sequence: store.latestSequence(),
    },
  }, occurredAt);
}

test("chain readiness verifies only the immutable suffix after the first pass", () => {
  const store = new EventStore(":memory:");
  try {
    appendReview(store, "review-one");
    const originalEventsAfter = store.eventsAfter.bind(store);
    const lowerBounds: number[] = [];
    store.eventsAfter = ((sequence: number) => {
      lowerBounds.push(sequence);
      return originalEventsAfter(sequence);
    }) as EventStore["eventsAfter"];

    const first = store.verifyChain();
    assert.equal(first.valid, true);
    assert.equal(first.errors.length, 0);
    first.errors.push("caller mutation must not change the cache");
    assert.deepEqual(store.verifyChain(), { valid: true, errors: [] });

    appendReview(store, "review-two");
    assert.deepEqual(store.verifyChain(), { valid: true, errors: [] });
    assert.deepEqual(lowerBounds, [0, 1, 1]);
  } finally {
    store.close();
  }
});

test("a reopened store revalidates its durable prefix once, then continues incrementally", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "mc-chain-readiness-"));
  const filename = path.join(directory, "events.db");
  let store = new EventStore(filename);
  try {
    appendReview(store, "review-one");
    appendReview(store, "review-two");
    assert.equal(store.verifyChain().valid, true);
    store.close();

    store = new EventStore(filename);
    const originalEventsAfter = store.eventsAfter.bind(store);
    const lowerBounds: number[] = [];
    store.eventsAfter = ((sequence: number) => {
      lowerBounds.push(sequence);
      return originalEventsAfter(sequence);
    }) as EventStore["eventsAfter"];

    assert.equal(store.verifyChain().valid, true);
    appendReview(store, "review-three");
    assert.equal(store.verifyChain().valid, true);
    assert.deepEqual(lowerBounds, [0, 2]);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
