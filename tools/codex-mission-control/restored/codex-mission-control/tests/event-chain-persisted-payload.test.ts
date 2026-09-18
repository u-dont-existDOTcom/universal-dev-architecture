import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { canonicalJson, sha256 } from "../lib/canonical";
import { parseEventV2 } from "../lib/schema";
import { EventStore } from "../lib/store";

const occurredAt = "2026-09-14T03:01:00.000Z";

test("event-chain verification hashes persisted payload bytes before parser defaults", () => {
  const store = historicalChain();
  try {
    const db = ownerConnection(store);
    const row = db.prepare("SELECT payload_json FROM events WHERE sequence = 1").get() as { payload_json: string };
    const persisted = JSON.parse(row.payload_json);
    const parsed = parseEventV2(persisted);
    assert.equal(Object.hasOwn(persisted, "work_profile_authorization_id"), false);
    assert.equal(Object.hasOwn(persisted, "work_profile_preflight_id"), false);
    assert.equal(parsed.type, "codex_execution_started");
    assert.equal(parsed.work_profile_authorization_id, null);
    assert.equal(parsed.work_profile_preflight_id, null);
    assert.deepEqual(store.verifyChain(), { valid: true, errors: [] });
  } finally {
    store.close();
  }
});

test("a changed persisted payload fails event-chain verification", () => {
  const store = historicalChain();
  try {
    const db = mutableOwnerConnection(store);
    const row = db.prepare("SELECT payload_json FROM events WHERE sequence = 1").get() as { payload_json: string };
    const payload = JSON.parse(row.payload_json);
    payload.declared_tactical_boundary = "Tampered after persistence.";
    db.prepare("UPDATE events SET payload_json = ? WHERE sequence = 1").run(canonicalJson(payload));
    const result = store.verifyChain();
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("Sequence 1 has an invalid event hash."));
  } finally {
    store.close();
  }
});

test("a changed stored event hash fails event-chain verification", () => {
  const store = historicalChain();
  try {
    const db = mutableOwnerConnection(store);
    db.prepare("UPDATE events SET event_hash = ? WHERE sequence = 1").run("f".repeat(64));
    const result = store.verifyChain();
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("Sequence 1 has an invalid event hash."));
    assert.ok(result.errors.includes("Sequence 2 has an invalid previous hash."));
  } finally {
    store.close();
  }
});

test("a changed previous-hash link fails event-chain verification", () => {
  const store = historicalChain();
  try {
    const db = mutableOwnerConnection(store);
    db.prepare("UPDATE events SET previous_hash = ? WHERE sequence = 2").run("e".repeat(64));
    const result = store.verifyChain();
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("Sequence 2 has an invalid previous hash."));
    assert.ok(result.errors.includes("Sequence 2 has an invalid event hash."));
  } finally {
    store.close();
  }
});

test("malformed persisted JSON fails event-chain verification closed", () => {
  const store = historicalChain();
  try {
    const db = mutableOwnerConnection(store);
    db.prepare("UPDATE events SET payload_json = ? WHERE sequence = 1").run("{not-json");
    const result = store.verifyChain();
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.startsWith("Sequence 1 has invalid persisted event data:")));
  } finally {
    store.close();
  }
});

test("an unknown persisted schema version fails event-chain verification closed", () => {
  const store = historicalChain();
  try {
    const db = mutableOwnerConnection(store);
    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare("UPDATE events SET schema_version = 3 WHERE sequence = 1").run();
    const result = store.verifyChain();
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(
      "Sequence 1 has invalid persisted event data: unsupported schema version.",
    ));
  } finally {
    store.close();
  }
});

test("events written by current code still verify from persisted payloads", () => {
  const store = new EventStore(":memory:");
  try {
    store.markViewed();
    assert.deepEqual(store.verifyChain(), { valid: true, errors: [] });
  } finally {
    store.close();
  }
});

function historicalChain() {
  const store = new EventStore(":memory:");
  const db = ownerConnection(store);
  let previousHash: string | null = null;
  for (let sequence = 1; sequence <= 2; sequence += 1) {
    const data = historicalPayload(sequence);
    const input = {
      schemaVersion: 2,
      eventId: `execution-start:historical:${sequence}`,
      missionId: "mission-control-test",
      worker: "compat-worker",
      type: data.type,
      occurredAt,
      data,
      previousHash,
    };
    const eventHash = sha256(canonicalJson(input));
    db.prepare(`
      INSERT INTO events(
        sequence, event_id, schema_version, mission_id, worker, type, payload_json,
        occurred_at, received_at, previous_hash, event_hash, producer_id, producer_kind
      ) VALUES (?, ?, 2, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sequence,
      input.eventId,
      input.missionId,
      input.worker,
      input.type,
      canonicalJson(data),
      input.occurredAt,
      input.occurredAt,
      previousHash,
      eventHash,
      "system:event-chain-test",
      "SYSTEM",
    );
    previousHash = eventHash;
  }
  return store;
}

function historicalPayload(sequence: number) {
  return {
    type: "codex_execution_started" as const,
    worker: "compat-worker",
    execution_start_id: `execution-start:historical:${sequence}`,
    worker_run_id: `run-historical-${sequence}`,
    task_id: "task:event-chain-compatibility",
    directive_id: "directive:event-chain-compatibility",
    directive_revision: 1,
    started_at: occurredAt,
    execution_mode: "BOUNDED_MECHANICAL" as const,
    declared_tactical_boundary: "Historical payload without later parser defaults.",
  };
}

function ownerConnection(store: EventStore) {
  return (store as unknown as { db: DatabaseSync }).db;
}

function mutableOwnerConnection(store: EventStore) {
  const db = ownerConnection(store);
  db.exec("DROP TRIGGER events_reject_update");
  return db;
}
