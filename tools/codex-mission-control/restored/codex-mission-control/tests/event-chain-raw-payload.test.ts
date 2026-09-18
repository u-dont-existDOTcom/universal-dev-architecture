import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { canonicalJson, sha256 } from "../lib/canonical";
import { seedStore } from "../lib/seed";
import { EventStore } from "../lib/store";

const historicalDefaults = new Map<number, { type: string; fields: string[] }>([
  [7, { type: "execution_directive_recorded", fields: ["directive_schema_version", "directive_artifact_sha256", "source_message_id", "source_body_sha256", "work_execution_profile"] }],
  [8, { type: "codex_execution_started", fields: ["work_profile_authorization_id", "work_profile_preflight_id"] }],
  [21, { type: "execution_directive_recorded", fields: ["directive_schema_version", "directive_artifact_sha256", "source_message_id", "source_body_sha256", "work_execution_profile"] }],
  [22, { type: "codex_execution_started", fields: ["work_profile_authorization_id", "work_profile_preflight_id"] }],
  [28, { type: "execution_receipt_recorded", fields: ["receipt_schema_version", "work_execution"] }],
  [39, { type: "execution_directive_recorded", fields: ["directive_schema_version", "directive_artifact_sha256", "source_message_id", "source_body_sha256", "work_execution_profile"] }],
  [40, { type: "codex_execution_started", fields: ["work_profile_authorization_id", "work_profile_preflight_id"] }],
  [56, { type: "execution_directive_recorded", fields: ["directive_schema_version", "directive_artifact_sha256", "source_message_id", "source_body_sha256", "work_execution_profile"] }],
  [57, { type: "codex_execution_started", fields: ["work_profile_authorization_id", "work_profile_preflight_id"] }],
]);

test("historical chain verification hashes exact persisted payloads before parser defaults", () => {
  const fixture = historicalFixture({ stripHistoricalDefaults: true });
  const store = new EventStore(fixture.filename);
  try {
    assert.deepEqual(store.verifyChain(), { valid: true, errors: [] });
    const events = store.allEvents();
    assert.equal(Object.hasOwn((events.find((event) => event.sequence === 7)?.data as any), "directive_schema_version"), true);
    assert.equal(Object.hasOwn((events.find((event) => event.sequence === 8)?.data as any), "work_profile_authorization_id"), true);
    assert.equal(Object.hasOwn((events.find((event) => event.sequence === 28)?.data as any), "receipt_schema_version"), true);
  } finally {
    store.close();
    fixture.cleanup();
  }
});

test("current-format records retain exact chain validity", () => {
  const store = new EventStore(":memory:");
  try {
    seedStore(store);
    assert.deepEqual(store.verifyChain(), { valid: true, errors: [] });
  } finally {
    store.close();
  }
});

test("semantically equivalent raw-byte changes fail closed", () => {
  const fixture = historicalFixture({ mutation: { sequence: 1, kind: "whitespace" } });
  const store = new EventStore(fixture.filename);
  try {
    assert.deepEqual(store.verifyChain(), {
      valid: false,
      errors: ["Sequence 1 has an invalid event hash."],
    });
  } finally {
    store.close();
    fixture.cleanup();
  }
});

test("malformed persisted payload fails closed even when its rebuilt hash matches", () => {
  const fixture = historicalFixture({ mutation: { sequence: 2, kind: "malformed-rehashed" } });
  const store = new EventStore(fixture.filename);
  try {
    assert.deepEqual(store.verifyChain(), {
      valid: false,
      errors: ["Sequence 2 has an invalid persisted payload."],
    });
  } finally {
    store.close();
    fixture.cleanup();
  }
});

type FixtureOptions = {
  stripHistoricalDefaults?: boolean;
  mutation?: { sequence: number; kind: "whitespace" | "malformed-rehashed" };
};

function historicalFixture(options: FixtureOptions = {}) {
  const source = new EventStore(":memory:");
  seedStore(source);
  const currentRows = ((source as any).db as DatabaseSync).prepare(
    "SELECT * FROM events ORDER BY sequence",
  ).all() as Array<Record<string, unknown>>;
  source.close();
  const rows = options.stripHistoricalDefaults
    ? historicalRows(currentRows)
    : currentRows.filter((row) => Number(row.sequence) <= 57);

  const directory = mkdtempSync(path.join(tmpdir(), "mc-raw-chain-"));
  const filename = path.join(directory, "mission-control.db");
  const database = new DatabaseSync(filename);
  database.exec(`
    CREATE TABLE events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      schema_version INTEGER NOT NULL CHECK (schema_version IN (1, 2)),
      mission_id TEXT NOT NULL,
      worker TEXT,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      previous_hash TEXT,
      event_hash TEXT NOT NULL UNIQUE,
      producer_id TEXT NOT NULL,
      producer_kind TEXT NOT NULL
    )
  `);
  const insert = database.prepare(`
    INSERT INTO events(
      sequence, event_id, schema_version, mission_id, worker, type, payload_json,
      occurred_at, received_at, previous_hash, event_hash, producer_id, producer_kind
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let previousHash: string | null = null;
  for (const row of rows) {
    const sequence = Number(row.sequence);
    const payload = JSON.parse(String(row.payload_json));
    const historical = options.stripHistoricalDefaults ? historicalDefaults.get(sequence) : undefined;
    if (historical) {
      for (const field of historical.fields) {
        assert.equal(Object.hasOwn(payload, field), true, `seed event ${sequence} must exercise ${field}`);
        delete payload[field];
      }
    }
    let payloadJson = canonicalJson(payload);
    let rehashPayloadJson = payloadJson;
    if (options.mutation?.sequence === sequence) {
      if (options.mutation.kind === "whitespace") {
        payloadJson = payloadJson.replace("{", "{ ");
      } else {
        payloadJson = '{"type":';
        rehashPayloadJson = payloadJson;
      }
    }
    const eventHash = persistedEventHash(row, rehashPayloadJson, previousHash);
    insert.run(
      sequence,
      String(row.event_id),
      Number(row.schema_version),
      String(row.mission_id),
      row.worker === null ? null : String(row.worker),
      String(row.type),
      payloadJson,
      String(row.occurred_at),
      String(row.received_at),
      previousHash,
      eventHash,
      String(row.producer_id),
      String(row.producer_kind),
    );
    previousHash = eventHash;
  }
  database.close();
  return { filename, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

function historicalRows(currentRows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const offsets = new Map<string, number>();
  return [...historicalDefaults.entries()].map(([sequence, historical]) => {
    const candidates = currentRows.filter((row) => row.type === historical.type);
    const offset = offsets.get(historical.type) ?? 0;
    const row = candidates[offset];
    assert.ok(row, `seed data must contain representative ${historical.type} event ${offset + 1}`);
    offsets.set(historical.type, offset + 1);
    return { ...row, sequence } as Record<string, unknown>;
  });
}

function persistedEventHash(row: Record<string, unknown>, payloadJson: string, previousHash: string | null) {
  const canonicalEnvelope = [
    `"data":${payloadJson}`,
    `"eventId":${canonicalJson(String(row.event_id))}`,
    `"missionId":${canonicalJson(String(row.mission_id))}`,
    `"occurredAt":${canonicalJson(String(row.occurred_at))}`,
    `"previousHash":${canonicalJson(previousHash)}`,
    `"schemaVersion":${canonicalJson(Number(row.schema_version))}`,
    `"type":${canonicalJson(String(row.type))}`,
    `"worker":${canonicalJson(row.worker === null ? null : String(row.worker))}`,
  ].join(",");
  return sha256(`{${canonicalEnvelope}}`);
}
