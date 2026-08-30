import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MissionControlEvent, parseEvent, StoredEvent } from "./schema";

export class ContractInvariantError extends Error {}

export class EventStore {
  private readonly db: DatabaseSync;

  constructor(filename = process.env.MISSION_CONTROL_DB ?? path.join(process.cwd(), "data", "mission-control.db")) {
    if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_worker_id ON events(worker, id);
      CREATE TABLE IF NOT EXISTS review_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_viewed_event_id INTEGER NOT NULL DEFAULT 0,
        viewed_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO review_state(id, last_viewed_event_id, viewed_at)
      VALUES (1, 0, '1970-01-01T00:00:00.000Z');
    `);
  }

  close() {
    this.db.close();
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM events").get() as { count: number };
    return Number(row.count);
  }

  append(input: unknown, occurredAt = new Date().toISOString()): StoredEvent {
    const event = parseEvent(input);
    const objective = this.getObjective(event.worker);

    if (event.type === "objective_created" && objective) {
      throw new ContractInvariantError(`Objective contract for ${event.worker} already exists and is immutable.`);
    }
    if (event.type !== "objective_created" && !objective) {
      throw new ContractInvariantError(`Create an objective contract for ${event.worker} before appending ${event.type}.`);
    }
    if (event.type === "worker_heartbeat" && event.objective && objective && event.objective !== objective.goal) {
      throw new ContractInvariantError("Heartbeat objective does not match the immutable objective contract.");
    }

    const result = this.db.prepare(
      "INSERT INTO events(worker, type, data, occurred_at) VALUES (?, ?, ?, ?)",
    ).run(event.worker, event.type, JSON.stringify(event), occurredAt);
    return {
      id: Number(result.lastInsertRowid),
      worker: event.worker,
      type: event.type,
      occurredAt,
      data: event,
    };
  }

  appendMany(items: Array<{ event: unknown; occurredAt?: string }>): StoredEvent[] {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = items.map(({ event, occurredAt }) => this.append(event, occurredAt));
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getObjective(worker: string) {
    const row = this.db.prepare(
      "SELECT data FROM events WHERE worker = ? AND type = 'objective_created' ORDER BY id LIMIT 1",
    ).get(worker) as { data: string } | undefined;
    if (!row) return null;
    const parsed = parseEvent(JSON.parse(row.data));
    return parsed.type === "objective_created" ? parsed : null;
  }

  allEvents(maxId?: number): StoredEvent[] {
    const rows = (maxId === undefined
      ? this.db.prepare("SELECT * FROM events ORDER BY id").all()
      : this.db.prepare("SELECT * FROM events WHERE id <= ? ORDER BY id").all(maxId)) as Array<Record<string, unknown>>;
    return rows.map(toStoredEvent);
  }

  workerEvents(worker: string): StoredEvent[] {
    const rows = this.db.prepare("SELECT * FROM events WHERE worker = ? ORDER BY id").all(worker) as Array<Record<string, unknown>>;
    return rows.map(toStoredEvent);
  }

  eventsAfter(id: number): StoredEvent[] {
    const rows = this.db.prepare("SELECT * FROM events WHERE id > ? ORDER BY id").all(id) as Array<Record<string, unknown>>;
    return rows.map(toStoredEvent);
  }

  latestEventId(): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM events").get() as { id: number };
    return Number(row.id);
  }

  lastViewedEventId(): number {
    const row = this.db.prepare("SELECT last_viewed_event_id FROM review_state WHERE id = 1").get() as { last_viewed_event_id: number };
    return Number(row.last_viewed_event_id);
  }

  markViewed(): { lastViewedEventId: number; viewedAt: string } {
    const latest = this.latestEventId();
    const viewedAt = new Date().toISOString();
    this.db.prepare("UPDATE review_state SET last_viewed_event_id = ?, viewed_at = ? WHERE id = 1").run(latest, viewedAt);
    return { lastViewedEventId: latest, viewedAt };
  }
}

function toStoredEvent(row: Record<string, unknown>): StoredEvent {
  const data = parseEvent(JSON.parse(String(row.data)));
  return {
    id: Number(row.id),
    worker: String(row.worker),
    type: data.type,
    occurredAt: String(row.occurred_at),
    data,
  };
}

let singleton: EventStore | undefined;

export function getStore(): EventStore {
  if (!singleton) singleton = new EventStore();
  return singleton;
}
