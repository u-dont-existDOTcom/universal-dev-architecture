import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { canonicalJson, sha256 } from "./canonical";
import { CorrectionInvariantError, validateCorrectionTransition } from "./correction-lifecycle";
import { progressInvariantErrors } from "./progress-invariants";
import { supervisionHandoffCapsuleSha256 } from "./supervision-handoff";
import { authorityStateVectorHash } from "./terminal-comparator";
import type { AuthenticatedProducer, ProducerKind } from "./ingestion-auth";
import {
  AppendEnvelope,
  MissionControlEvent,
  MissionControlEventV2,
  StoredEvent,
  eventWorker,
  parseAppendEnvelope,
  parseEventV2,
  parseLegacyEvent,
} from "./schema";

export class ContractInvariantError extends Error {}
export class IdempotencyConflictError extends Error {}
export class LedgerIntegrityError extends Error {}
export class WriterLockError extends Error {}

interface EventHashInput {
  schemaVersion: 1 | 2;
  eventId: string;
  missionId: string;
  worker: string | null;
  type: string;
  occurredAt: string;
  data: MissionControlEvent;
  previousHash: string | null;
}

export class EventStore {
  private readonly db: DatabaseSync;
  private readonly writerLockPath: string | null;
  private readonly writerLockFd: number | null;

  constructor(filename = process.env.MISSION_CONTROL_DB ?? path.join(process.cwd(), "data", "mission-control.db")) {
    if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.writerLockPath = filename === ":memory:" ? null : `${filename}.writer.lock`;
    try {
      this.writerLockFd = this.writerLockPath === null ? null : fs.openSync(this.writerLockPath, "wx", 0o600);
    } catch (error) {
      throw new WriterLockError(`Another Mission Control writer owns ${this.writerLockPath}.`);
    }
    try {
      this.db = new DatabaseSync(filename);
      this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
      this.initialize();
    } catch (error) {
      this.releaseWriterLock();
      throw error;
    }
  }

  close() {
    this.db.close();
    this.releaseWriterLock();
  }

  count(schemaVersion?: 1 | 2): number {
    const row = (schemaVersion === undefined
      ? this.db.prepare("SELECT COUNT(*) AS count FROM events").get()
      : this.db.prepare("SELECT COUNT(*) AS count FROM events WHERE schema_version = ?").get(schemaVersion)) as { count: number };
    return Number(row.count);
  }

  append(input: unknown, receivedAt = new Date().toISOString(), producer?: AuthenticatedProducer): StoredEvent {
    const envelope = parseAppendEnvelope(input);
    const authenticatedProducer = producer ?? internalProducerFor(envelope.data);
    const worker = eventWorker(envelope.data);
    const existing = this.eventByEventId(envelope.event_id);
    if (existing) {
      if (sameLogicalEvent(existing, envelope)
        && existing.producerId === authenticatedProducer.id && existing.producerKind === authenticatedProducer.kind) return existing;
      throw new IdempotencyConflictError(`Event ID ${envelope.event_id} already exists with different content.`);
    }

    this.validateAuthorityInvariants(envelope);
    this.validateWorkerChannel(envelope, authenticatedProducer);
    this.validateCorrection(envelope);
    const previousHash = this.latestEventHash();
    const eventHash = calculateEventHash({
      schemaVersion: 2,
      eventId: envelope.event_id,
      missionId: envelope.mission_id,
      worker,
      type: envelope.data.type,
      occurredAt: envelope.occurred_at,
      data: envelope.data,
      previousHash,
    });
    const result = this.db.prepare(`
      INSERT INTO events(
        event_id, schema_version, mission_id, worker, type, payload_json,
        occurred_at, received_at, previous_hash, event_hash, producer_id, producer_kind
      ) VALUES (?, 2, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      envelope.event_id,
      envelope.mission_id,
      worker,
      envelope.data.type,
      canonicalJson(envelope.data),
      envelope.occurred_at,
      receivedAt,
      previousHash,
      eventHash,
      authenticatedProducer.id,
      authenticatedProducer.kind,
    );
    return this.eventBySequence(Number(result.lastInsertRowid))!;
  }

  appendMany(items: Array<{ event: unknown; receivedAt?: string; producer?: AuthenticatedProducer }>): StoredEvent[] {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = items.map(({ event, receivedAt, producer }) => this.append(event, receivedAt, producer));
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  eventByEventId(eventId: string): StoredEvent | null {
    const row = this.db.prepare("SELECT * FROM events WHERE event_id = ?").get(eventId) as Record<string, unknown> | undefined;
    return row ? toStoredEvent(row) : null;
  }

  allEvents(maxSequence?: number): StoredEvent[] {
    const rows = (maxSequence === undefined
      ? this.db.prepare("SELECT * FROM events ORDER BY sequence").all()
      : this.db.prepare("SELECT * FROM events WHERE sequence <= ? ORDER BY sequence").all(maxSequence)) as Array<Record<string, unknown>>;
    return rows.map(toStoredEvent);
  }

  workerEvents(worker: string): StoredEvent[] {
    const rows = this.db.prepare("SELECT * FROM events WHERE worker = ? ORDER BY sequence").all(worker) as Array<Record<string, unknown>>;
    return rows.map(toStoredEvent);
  }

  eventsAfter(sequence: number): StoredEvent[] {
    const rows = this.db.prepare("SELECT * FROM events WHERE sequence > ? ORDER BY sequence").all(sequence) as Array<Record<string, unknown>>;
    return rows.map(toStoredEvent);
  }

  latestEventId(): number {
    return this.latestSequence();
  }

  latestSequence(): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM events").get() as { sequence: number };
    return Number(row.sequence);
  }

  lastViewedEventId(): number {
    return this.lastViewedSequence();
  }

  lastViewedSequence(): number {
    const row = this.db.prepare("SELECT payload_json FROM events WHERE type = 'review_marked' ORDER BY sequence DESC LIMIT 1").get() as { payload_json: string } | undefined;
    if (!row) return 0;
    const data = parseEventV2(JSON.parse(row.payload_json));
    return data.type === "review_marked" ? data.reviewed_through_sequence : 0;
  }

  markViewed(producer: AuthenticatedProducer = internalUiProducer(), missionId = "mission-control"): { lastViewedEventId: number; viewedAt: string } {
    const latest = this.latestSequence();
    const viewedAt = new Date().toISOString();
    this.append({
      schema_version: 2,
      event_id: `review:${randomUUID()}`,
      mission_id: missionId,
      occurred_at: viewedAt,
      data: { type: "review_marked", worker: null, reviewed_through_sequence: latest },
    }, viewedAt, producer);
    return { lastViewedEventId: latest, viewedAt };
  }

  getObjective(worker: string) {
    const event = this.workerEvents(worker).find((candidate) => candidate.data.type === "objective_created");
    return event?.data.type === "objective_created" ? event.data : null;
  }

  verifyChain(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    let previousHash: string | null = null;
    for (const event of this.allEvents()) {
      if (event.previousHash !== previousHash) errors.push(`Sequence ${event.sequence} has an invalid previous hash.`);
      const calculated = calculateEventHash({
        schemaVersion: event.schemaVersion,
        eventId: event.eventId,
        missionId: event.missionId,
        worker: event.worker,
        type: event.type,
        occurredAt: event.occurredAt,
        data: event.data,
        previousHash: event.previousHash,
      });
      if (calculated !== event.eventHash) errors.push(`Sequence ${event.sequence} has an invalid event hash.`);
      previousHash = event.eventHash;
    }
    return { valid: errors.length === 0, errors };
  }

  private initialize() {
    const exists = this.db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'events'").get();
    if (!exists) {
      this.createV2Schema();
      return;
    }
    const columns = this.db.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "event_id")) {
      this.migrateLegacyV1();
      return;
    }
    this.createV2Schema();
  }

  private createV2Schema(withTriggers = true) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
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
      );
      CREATE INDEX IF NOT EXISTS events_worker_sequence ON events(worker, sequence);
      CREATE INDEX IF NOT EXISTS events_mission_sequence ON events(mission_id, sequence);
      CREATE INDEX IF NOT EXISTS events_type_sequence ON events(type, sequence);
      PRAGMA user_version = 2;
    `);
    const columns = this.db.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "producer_id")) {
      this.db.exec("ALTER TABLE events ADD COLUMN producer_id TEXT NOT NULL DEFAULT 'legacy:unattributed';");
    }
    if (!columns.some((column) => column.name === "producer_kind")) {
      this.db.exec("ALTER TABLE events ADD COLUMN producer_kind TEXT NOT NULL DEFAULT 'SYSTEM';");
    }
    if (withTriggers) this.createAppendOnlyTriggers();
  }

  private createAppendOnlyTriggers() {
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS events_reject_update
      BEFORE UPDATE ON events
      BEGIN
        SELECT RAISE(ABORT, 'mission_control_events_are_append_only');
      END;
      CREATE TRIGGER IF NOT EXISTS events_reject_delete
      BEFORE DELETE ON events
      BEGIN
        SELECT RAISE(ABORT, 'mission_control_events_are_append_only');
      END;
    `);
  }

  private migrateLegacyV1() {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const oldEvents = this.db.prepare("SELECT id, worker, type, data, occurred_at FROM events ORDER BY id").all() as Array<Record<string, unknown>>;
      const reviewTable = this.db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'review_state'").get();
      const review = reviewTable
        ? this.db.prepare("SELECT last_viewed_event_id, viewed_at FROM review_state WHERE id = 1").get() as { last_viewed_event_id: number; viewed_at: string } | undefined
        : undefined;
      this.db.exec("DROP INDEX IF EXISTS events_worker_id; ALTER TABLE events RENAME TO events_legacy_v1;");
      if (reviewTable) this.db.exec("ALTER TABLE review_state RENAME TO review_state_legacy_v1;");
      this.createV2Schema(false);

      let previousHash: string | null = null;
      for (const row of oldEvents) {
        const data = parseLegacyEvent(JSON.parse(String(row.data)));
        const eventId = `legacy-v1:${Number(row.id)}`;
        const occurredAt = String(row.occurred_at);
        const eventHash = calculateEventHash({
          schemaVersion: 1,
          eventId,
          missionId: "legacy-default",
          worker: String(row.worker),
          type: data.type,
          occurredAt,
          data,
          previousHash,
        });
        this.insertMigrated({
          eventId, schemaVersion: 1, missionId: "legacy-default", worker: String(row.worker),
          type: data.type, data, occurredAt, receivedAt: occurredAt, previousHash, eventHash,
        });
        previousHash = eventHash;
      }

      if (review && Number(review.last_viewed_event_id) > 0) {
        const data: MissionControlEventV2 = {
          type: "review_marked",
          worker: null,
          reviewed_through_sequence: Math.min(Number(review.last_viewed_event_id), oldEvents.length),
        };
        const eventId = `migration-review-v1:${Number(review.last_viewed_event_id)}`;
        const occurredAt = String(review.viewed_at);
        const eventHash = calculateEventHash({
          schemaVersion: 2, eventId, missionId: "legacy-default", worker: null,
          type: data.type, occurredAt, data, previousHash,
        });
        this.insertMigrated({
          eventId, schemaVersion: 2, missionId: "legacy-default", worker: null,
          type: data.type, data, occurredAt, receivedAt: occurredAt, previousHash, eventHash,
        });
      }
      this.createAppendOnlyTriggers();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private insertMigrated(input: {
    eventId: string;
    schemaVersion: 1 | 2;
    missionId: string;
    worker: string | null;
    type: string;
    data: MissionControlEvent;
    occurredAt: string;
    receivedAt: string;
    previousHash: string | null;
    eventHash: string;
  }) {
    this.db.prepare(`
      INSERT INTO events(event_id, schema_version, mission_id, worker, type, payload_json, occurred_at, received_at, previous_hash, event_hash, producer_id, producer_kind)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'legacy:migration', 'SYSTEM')
    `).run(
      input.eventId, input.schemaVersion, input.missionId, input.worker, input.type,
      canonicalJson(input.data), input.occurredAt, input.receivedAt, input.previousHash, input.eventHash,
    );
  }

  private validateAuthorityInvariants(envelope: AppendEnvelope) {
    const data = envelope.data;
    const worker = eventWorker(data);
    if (data.type === "review_marked") return;
    if (!worker) throw new ContractInvariantError("Worker-scoped events require a worker identity.");

    const events = this.workerEvents(worker).filter((event) => event.schemaVersion === 2);
    const sources = events.filter((event) => event.data.type === "owner_source_recorded");
    const outcomes = events.filter((event) => event.data.type === "owner_outcome_recorded");
    const contracts = events.filter((event) => event.data.type === "task_contract_recorded");

    if (data.type === "reasoning_message_recorded") {
      if (data.exact_visible_body && sha256(data.exact_visible_body) !== data.body_sha256) {
        throw new ContractInvariantError("Reasoning-message body SHA-256 does not match the exact visible body.");
      }
      if (data.provenance_status === "VERIFIED" && !data.sent_at_source) {
        throw new ContractInvariantError("Verified reasoning messages require source send time.");
      }
    }

    if (data.type === "owner_outcome_recorded") {
      const source = sources.find((event) => event.data.type === "owner_source_recorded" && event.data.receipt_id === data.source_receipt_id);
      if (!source) throw new ContractInvariantError("Record the referenced owner-source receipt before the owner outcome.");
      if (source.data.type !== "owner_source_recorded"
        || source.data.owner_request_id !== data.owner_request_id
        || source.data.source_sha256 !== data.owner_source_sha256) {
        throw new ContractInvariantError("Owner outcomes must bind the exact referenced owner-source request and source hash.");
      }
      const sameEpoch = outcomes.some((event) => event.data.type === "owner_outcome_recorded" && event.data.owner_outcome_id === data.owner_outcome_id && event.data.epoch === data.epoch);
      if (sameEpoch) throw new ContractInvariantError("Owner-outcome epochs are append-only and unique.");
      const previous = outcomes.filter((event) => event.data.type === "owner_outcome_recorded" && event.data.owner_outcome_id === data.owner_outcome_id).at(-1)?.data;
      if (previous?.type === "owner_outcome_recorded"
        && (data.epoch !== previous.epoch + 1 || data.supersedes !== previous.owner_outcome_id
          || data.supersedes_outcome_sha256 !== previous.owner_outcome_sha256)) {
        throw new ContractInvariantError("Owner-outcome corrections must advance one epoch and name the exact prior outcome identity.");
      }
    }
    if (data.type === "owner_decision_recorded") {
      const source = sources.find((event) => event.data.type === "owner_source_recorded" && event.data.receipt_id === data.source_receipt_id);
      const outcome = outcomes.find((event) => event.data.type === "owner_outcome_recorded"
        && event.data.owner_outcome_id === data.owner_outcome_id
        && event.data.epoch === data.owner_outcome_epoch
        && event.data.owner_outcome_sha256 === data.owner_outcome_sha256);
      if (!source || !outcome) throw new ContractInvariantError("Owner decisions must bind current source authority and an exact owner-outcome epoch.");
      if (data.decision_sha256 !== sha256(data.exact_text)) throw new ContractInvariantError("Owner decision digest must bind the exact decision text.");
    }
    if (data.type === "task_contract_recorded") {
      const outcome = outcomes.find((event) => event.data.type === "owner_outcome_recorded"
        && event.data.owner_outcome_id === data.owner_outcome_id
        && event.data.epoch === data.owner_outcome_epoch
        && event.data.owner_outcome_sha256 === data.owner_outcome_sha256);
      if (!outcome) throw new ContractInvariantError("Task contracts must bind an existing exact owner-outcome epoch and hash.");
    }
    if (data.type === "objective_reconciliation_recorded") {
      const contract = contracts.find((event) => event.data.type === "task_contract_recorded" && event.data.task_contract_sha256 === data.task_contract_sha256);
      const outcome = outcomes.find((event) => event.data.type === "owner_outcome_recorded"
        && event.data.owner_outcome_id === data.owner_outcome_id
        && event.data.epoch === data.owner_outcome_epoch
        && event.data.owner_outcome_sha256 === data.owner_outcome_sha256);
      if (!contract || !outcome) throw new ContractInvariantError("Reconciliation must bind existing exact contract and owner-outcome records.");
      for (const row of data.matrix.filter((item) => item.status === "OWNER_REMOVED" || item.status === "OWNER_AMENDED")) {
        const decision = events.find((event) => event.data.type === "owner_decision_recorded"
          && event.data.owner_decision_id === row.authorized_change)?.data;
        const requiredKind = row.status === "OWNER_REMOVED" ? "REMOVE_REQUIREMENT" : "AMEND_OUTCOME";
        if (decision?.type !== "owner_decision_recorded" || decision.decision_kind !== requiredKind
          || decision.owner_outcome_id !== data.owner_outcome_id
          || decision.owner_outcome_epoch !== data.owner_outcome_epoch
          || decision.owner_outcome_sha256 !== data.owner_outcome_sha256) {
          throw new ContractInvariantError(`${row.status} reconciliation requires a matching durable owner decision.`);
        }
      }
    }
    if (data.type === "verification_validity_recorded") {
      const currentContract = contracts.at(-1)?.data;
      const currentOutcome = outcomes.at(-1)?.data;
      const currentCheckpoint = [...events].reverse().find((event) => event.data.type === "worker_checkpoint_recorded")?.data;
      if (currentContract?.type !== "task_contract_recorded" || currentContract.task_contract_sha256 !== data.contract_sha256
        || currentOutcome?.type !== "owner_outcome_recorded" || currentOutcome.owner_outcome_id !== data.owner_outcome_id
        || currentOutcome.epoch !== data.owner_outcome_epoch || currentOutcome.owner_outcome_sha256 !== data.owner_outcome_sha256
        || currentCheckpoint?.type !== "worker_checkpoint_recorded" || currentCheckpoint.worker_run_id !== data.worker_run_id) {
        throw new ContractInvariantError("Verification validity must bind the current contract, owner outcome, and worker run.");
      }
      const priorContexts = events.filter((event) => event.data.type === "verification_validity_recorded");
      const prior = priorContexts.at(-1)?.data;
      if (data.supersedes_context_id === null && priorContexts.length > 0) {
        throw new ContractInvariantError("A later verification validity context must name the context it supersedes.");
      }
      if (data.supersedes_context_id !== null
        && (prior?.type !== "verification_validity_recorded" || prior.context_id !== data.supersedes_context_id || data.changed_dimensions.length === 0)) {
        throw new ContractInvariantError("A superseding verification context must bind the exact predecessor and changed validity dimensions.");
      }
    }
    if (data.type === "reasoning_supervision_recorded") {
      const currentOutcome = outcomes.at(-1)?.data;
      if (currentOutcome?.type !== "owner_outcome_recorded"
        || currentOutcome.owner_outcome_id !== data.owner_outcome_id
        || currentOutcome.epoch !== data.owner_outcome_epoch
        || currentOutcome.owner_outcome_sha256 !== data.owner_outcome_sha256) {
        throw new ContractInvariantError("New reasoning supervision must bind the current exact owner-outcome ID, epoch, and hash.");
      }
    }
    if (data.type === "execution_directive_recorded") {
      const currentOutcome = outcomes.at(-1)?.data;
      const reasoningEvent = [...events].reverse().find((event) => event.data.type === "reasoning_supervision_recorded");
      const reasoning = reasoningEvent?.data;
      if (currentOutcome?.type !== "owner_outcome_recorded"
        || currentOutcome.owner_outcome_id !== data.owner_outcome_id
        || currentOutcome.epoch !== data.owner_outcome_epoch
        || currentOutcome.owner_outcome_sha256 !== data.owner_outcome_sha256) {
        throw new ContractInvariantError("Execution directives must bind the current exact owner-outcome epoch.");
      }
      if (reasoning?.type !== "reasoning_supervision_recorded"
        || reasoning.owner_outcome_id !== data.owner_outcome_id
        || reasoning.owner_outcome_epoch !== data.owner_outcome_epoch
        || reasoning.owner_outcome_sha256 !== data.owner_outcome_sha256
        || reasoning.reasoning_supervisor_session_id !== data.reasoning_supervisor_session_id
        || reasoning.reasoning_supervisor_chat_epoch !== data.reasoning_chat_epoch
        || reasoning.decision_id !== data.chat_decision_id
        || reasoning.capsule_id !== data.capsule_id
        || reasoning.current_strategy_id !== data.strategy_id
        || reasoning.reviewed_evidence_boundary !== data.reviewed_evidence_boundary) {
        throw new ContractInvariantError("Execution directives must bind the exact current chat decision, capsule, strategy, and reviewed evidence boundary.");
      }
      const priorDirective = [...events].reverse().find((event) => event.data.type === "execution_directive_recorded")?.data;
      const priorReceiptEvent = priorDirective?.type === "execution_directive_recorded"
        ? [...events].reverse().find((event) => event.data.type === "execution_receipt_recorded"
          && event.data.directive_id === priorDirective.directive_id
          && event.data.directive_revision === priorDirective.directive_revision)
        : undefined;
      if (priorReceiptEvent && (!reasoningEvent || reasoningEvent.sequence <= priorReceiptEvent.sequence)) {
        throw new ContractInvariantError("A new directive requires a later independent reasoning review after the prior execution receipt.");
      }
    }
    if (data.type === "execution_receipt_recorded") {
      const directive = [...events].reverse().find((event) => event.data.type === "execution_directive_recorded")?.data;
      const start = [...events].reverse().find((event) => event.data.type === "codex_execution_started")?.data;
      if (directive?.type !== "execution_directive_recorded" || directive.status !== "ACTIVE"
        || directive.directive_id !== data.directive_id || directive.directive_revision !== data.directive_revision
        || directive.task_id !== data.task_id
        || start?.type !== "codex_execution_started" || start.directive_id !== data.directive_id
        || start.directive_revision !== data.directive_revision || start.task_id !== data.task_id
        || start.worker_run_id !== data.worker_run_id) {
        throw new ContractInvariantError("Execution receipts require the current active exact directive.");
      }
    }
    if (data.type === "codex_execution_started") {
      const directive = [...events].reverse().find((event) => event.data.type === "execution_directive_recorded")?.data;
      const priorReceipt = [...events].reverse().find((event) => event.data.type === "execution_receipt_recorded"
        && event.data.directive_id === data.directive_id)?.data;
      if (directive?.type !== "execution_directive_recorded" || directive.status !== "ACTIVE"
        || directive.directive_id !== data.directive_id || directive.directive_revision !== data.directive_revision
        || directive.task_id !== data.task_id) {
        throw new ContractInvariantError("Substantive Codex execution cannot start without the current active exact chat-authored directive.");
      }
      if (priorReceipt?.type === "execution_receipt_recorded") {
        throw new ContractInvariantError("Codex cannot continue after a directive stop receipt; a new independent chat review and directive are required.");
      }
    }
    const currentOutcomeForExecution = outcomes.at(-1)?.data;
    if (data.type === "worker_checkpoint_recorded" && currentOutcomeForExecution?.type === "owner_outcome_recorded"
      && currentOutcomeForExecution.epoch >= 4) {
      const start = [...events].reverse().find((event) => event.data.type === "codex_execution_started")?.data;
      const receiptAfterStart = [...events].reverse().find((event) => event.data.type === "execution_receipt_recorded")?.data;
      if (start?.type !== "codex_execution_started" || start.worker_run_id !== data.worker_run_id
        || receiptAfterStart?.type === "execution_receipt_recorded" && receiptAfterStart.directive_id === start.directive_id) {
        throw new ContractInvariantError("Current-epoch substantive worker checkpoints require an unclosed directive-bound Codex execution start.");
      }
    }
    if (data.type === "completion_claim_recorded" && currentOutcomeForExecution?.type === "owner_outcome_recorded"
      && currentOutcomeForExecution.epoch >= 4) {
      const start = [...events].reverse().find((event) => event.data.type === "codex_execution_started")?.data;
      const receipt = [...events].reverse().find((event) => event.data.type === "execution_receipt_recorded")?.data;
      if (start?.type !== "codex_execution_started"
        || receipt?.type === "execution_receipt_recorded" && receipt.directive_id === start.directive_id) {
        throw new ContractInvariantError("Current-epoch completion claims require an unclosed directive-bound Codex execution start.");
      }
    }
    if (data.type === "outcome_progress_recorded") {
      const currentOutcome = outcomes.at(-1)?.data;
      const reasoning = [...events].reverse().find((event) => event.data.type === "reasoning_supervision_recorded")?.data;
      if (currentOutcome?.type !== "owner_outcome_recorded"
        || currentOutcome.owner_outcome_id !== data.owner_outcome_id
        || currentOutcome.epoch !== data.owner_outcome_epoch
        || currentOutcome.owner_outcome_sha256 !== data.owner_outcome_sha256
        || reasoning?.type !== "reasoning_supervision_recorded"
        || reasoning.owner_outcome_id !== data.owner_outcome_id
        || reasoning.owner_outcome_epoch !== data.owner_outcome_epoch
        || reasoning.owner_outcome_sha256 !== data.owner_outcome_sha256
        || reasoning.reasoning_supervisor_session_id !== data.reviewed_by_session_id
        || reasoning.reasoning_supervisor_chat_epoch !== data.reviewed_chat_epoch
        || reasoning.current_strategy_id !== data.strategy_id) {
        throw new ContractInvariantError("Outcome progress must be assigned by the current reasoning supervisor against the exact current outcome and strategy.");
      }
      const progressErrors = progressInvariantErrors(data);
      if (progressErrors.length) throw new ContractInvariantError(`Invalid outcome progress receipt: ${progressErrors.join("; ")}.`);
      if (data.outcome_advancement === "ADVANCING"
        && (data.previous_evidence.numeric_value === null || data.current_evidence.numeric_value === null)) {
        this.validateQualitativeAdvancementEvidence(data.worker, "current", data.current_evidence);
        this.validateQualitativeAdvancementEvidence(data.worker, "best", data.best_evidence);
      }
    }
    if (data.type === "supervision_route_recorded") {
      const prior = [...events].reverse().find((event) => event.data.type === "supervision_route_recorded")?.data;
      if (data.authority_high_water_sequence > this.latestSequence()) throw new ContractInvariantError("Supervision route high-water cannot exceed the durable ledger.");
      if (prior?.type === "supervision_route_recorded") {
        if (data.authority_high_water_sequence < prior.authority_high_water_sequence) throw new ContractInvariantError("Supervision route high-water must be monotonic.");
        if (data.session_id === prior.session_id && data.substantive_response_count < prior.substantive_response_count) {
          throw new ContractInvariantError("Supervision turn accounting must be monotonic within a session.");
        }
        if (data.session_id !== prior.session_id && data.predecessor_session_id !== prior.session_id) {
          throw new ContractInvariantError("A supervision handoff must name the immediately preceding session.");
        }
      }
      if (data.handoff_capsule_id && data.handoff_capsule_sha256 && data.accepted_state_vector_sha256) {
        const acceptedEvents = this.workerEvents(data.worker)
          .filter((event) => event.sequence <= data.authority_high_water_sequence);
        const acceptedStateVectorSha256 = authorityStateVectorHash(acceptedEvents);
        if (data.accepted_state_vector_sha256 !== acceptedStateVectorSha256) {
          throw new ContractInvariantError("A supervision handoff must bind the exact durable authority vector at its declared high-water sequence.");
        }
        const expectedCapsuleSha256 = supervisionHandoffCapsuleSha256({
          capsuleId: data.handoff_capsule_id,
          worker: data.worker,
          sourceSessionId: data.predecessor_session_id ?? data.session_id,
          acceptedStateVectorSha256,
          authorityHighWaterSequence: data.authority_high_water_sequence,
        });
        if (data.handoff_capsule_sha256 !== expectedCapsuleSha256) {
          throw new ContractInvariantError("A supervision handoff capsule digest must bind its worker, source session, accepted authority vector, and high-water sequence.");
        }
      }
    }
    const contractRequiredTypes = new Set([
      "worker_checkpoint_recorded", "supervisor_assessment_recorded", "evidence_receipt_recorded",
      "finding_recorded", "finding_status_changed", "correction_lifecycle_recorded", "completion_claim_recorded",
      "supervision_route_recorded", "research_verdict_recorded", "supervision_design_feedback_recorded",
      "verification_validity_recorded", "owner_decision_recorded", "symphony_runtime_observed", "live_worker_evidence_observed",
      "reasoning_supervision_recorded", "execution_directive_recorded",
      "codex_execution_started", "execution_receipt_recorded", "outcome_progress_recorded", "supervision_alert_recorded",
    ]);
    if (contractRequiredTypes.has(data.type) && contracts.length === 0) {
      throw new ContractInvariantError(`Record a task contract before ${data.type}.`);
    }
  }

  private validateCorrection(envelope: AppendEnvelope) {
    const data = envelope.data;
    if ("owner_action" in data) {
      const continuationPolicy = "continuation_policy" in data ? data.continuation_policy : undefined;
      this.validateObligationReferences(
        data.worker,
        data.owner_action.source_event_ids,
        continuationPolicy?.basis_finding_ids ?? [],
        continuationPolicy?.basis_evidence_ids ?? [],
        data.type === "finding_recorded" ? data.finding_id : undefined,
      );
    }
    if (data.type === "owner_source_recorded") this.assertUniqueDomainId(data.worker, "owner_source_recorded", "receipt_id", data.receipt_id);
    if (data.type === "objective_reconciliation_recorded") this.assertUniqueDomainId(data.worker, data.type, "reconciliation_id", data.reconciliation_id);
    if (data.type === "evidence_receipt_recorded") {
      this.assertUniqueDomainId(data.worker, data.type, "receipt_id", data.receipt_id);
      const manifest = data.changed_path_manifest;
      if (manifest) {
        const expected = sha256(canonicalJson({
          baseCandidateSha256: manifest.base_candidate_sha256,
          currentCandidateSha256: manifest.current_candidate_sha256,
          paths: manifest.paths,
        }));
        if (manifest.manifest_sha256 !== expected) throw new CorrectionInvariantError("Changed-path manifest digest must bind the complete base-to-candidate path list.");
      }
    }
    if (data.type === "verification_validity_recorded") this.assertUniqueDomainId(data.worker, data.type, "context_id", data.context_id);
    if (data.type === "owner_decision_recorded") this.assertUniqueDomainId(data.worker, data.type, "owner_decision_id", data.owner_decision_id);
    if (data.type === "completion_claim_recorded") this.assertUniqueDomainId(data.worker, data.type, "claim_id", data.claim_id);
    if (data.type === "reasoning_supervision_recorded") this.assertUniqueDomainId(data.worker, data.type, "decision_id", data.decision_id);
    if (data.type === "execution_directive_recorded") this.assertUniqueDomainId(data.worker, data.type, "directive_id", data.directive_id);
    if (data.type === "codex_execution_started") this.assertUniqueDomainId(data.worker, data.type, "execution_start_id", data.execution_start_id);
    if (data.type === "execution_receipt_recorded") this.assertUniqueDomainId(data.worker, data.type, "receipt_id", data.receipt_id);
    if (data.type === "outcome_progress_recorded") this.assertUniqueDomainId(data.worker, data.type, "progress_receipt_id", data.progress_receipt_id);
    if (data.type === "supervision_alert_recorded") this.assertUniqueDomainId(data.worker, data.type, "alert_id", data.alert_id);
    if (data.type === "finding_recorded") {
      const duplicate = this.workerEvents(data.worker)
        .some((event) => event.data.type === "finding_recorded" && event.data.finding_id === data.finding_id);
      if (duplicate) throw new CorrectionInvariantError("Finding records are immutable; change current status with a finding-status event.");
      const events = this.workerEvents(data.worker);
      const receipts = new Set(events.flatMap((event) => event.data.type === "evidence_receipt_recorded" ? [event.data.receipt_id] : []));
      if (data.evidence_receipt_ids.some((receiptId) => !receipts.has(receiptId))) {
        throw new CorrectionInvariantError("Findings must bind existing durable evidence receipts, not free-form evidence assertions.");
      }
      return;
    }
    if (data.type === "finding_status_changed") {
      const events = this.workerEvents(data.worker);
      const finding = events.find((event) => event.data.type === "finding_recorded" && event.data.finding_id === data.finding_id);
      if (!finding) throw new CorrectionInvariantError("Finding status changes must bind an existing immutable finding.");
      let currentStatus = "OPEN";
      for (const event of events) if (event.data.type === "finding_status_changed" && event.data.finding_id === data.finding_id) currentStatus = event.data.status;
      if (data.from_status !== currentStatus) throw new CorrectionInvariantError(`Finding status transition expected ${currentStatus}, not ${data.from_status}.`);
      const allowedTransitions: Record<string, string[]> = {
        OPEN: ["MITIGATED", "RESOLVED", "INVALIDATED"],
        MITIGATED: ["RESOLVED", "INVALIDATED", "REOPENED"],
        RESOLVED: ["REOPENED"],
        INVALIDATED: ["REOPENED"],
        REOPENED: ["MITIGATED", "RESOLVED", "INVALIDATED"],
      };
      if (!allowedTransitions[currentStatus]?.includes(data.status)) {
        throw new CorrectionInvariantError(`Invalid finding status transition ${currentStatus} -> ${data.status}.`);
      }
      const basisEvents = data.basis_event_ids.map((eventId) => this.eventByEventId(eventId));
      if (basisEvents.some((event) => !event || event.worker !== data.worker)) {
        throw new CorrectionInvariantError("Finding status basis events must exist in the same worker ledger.");
      }
      const contract = [...events].reverse().find((event) => event.data.type === "task_contract_recorded")?.data;
      const outcome = [...events].reverse().find((event) => event.data.type === "owner_outcome_recorded")?.data;
      if (contract?.type !== "task_contract_recorded" || contract.task_contract_sha256 !== data.contract_sha256
        || outcome?.type !== "owner_outcome_recorded" || outcome.owner_outcome_id !== data.owner_outcome_id
        || outcome.epoch !== data.owner_outcome_epoch || outcome.owner_outcome_sha256 !== data.owner_outcome_sha256) {
        throw new CorrectionInvariantError("Finding status changes must bind the current contract and owner outcome.");
      }
      if (data.status === "RESOLVED") {
        const verification = this.eventByEventId(data.verification_event_id);
        if (!verification || verification.data.type !== "correction_lifecycle_recorded"
          || verification.data.status !== "CORRECTION_VERIFIED"
          || !verification.data.finding_ids.includes(data.finding_id)
          || verification.data.verified_candidate_sha256 !== data.exact_candidate_sha256
          || verification.data.contract_sha256 !== data.contract_sha256
          || verification.data.owner_outcome_sha256 !== data.owner_outcome_sha256
          || verification.data.evidence_requirement_schema_sha256 !== data.evidence_requirement_schema_sha256
          || verification.data.verification_policy_sha256 !== data.verification_policy_sha256
          || !this.verificationStillCurrent(events, verification.data)) {
          throw new CorrectionInvariantError("RESOLVED findings require a current exact correction verification bound to the finding and authority vector.");
        }
      }
      if (data.status === "INVALIDATED") {
        const receipts = data.invalidation_evidence_receipt_ids.map((receiptId) => events.find((event) => event.data.type === "evidence_receipt_recorded" && event.data.receipt_id === receiptId)?.data);
        if (receipts.some((receipt) => receipt?.type !== "evidence_receipt_recorded" || !receipt.verified
          || receipt.freshness !== "CURRENT" || receipt.independence !== "INDEPENDENT"
          || receipt.claim_kind !== "FINDING_INVALIDATION" || receipt.supports_finding_id !== data.finding_id
          || receipt.proposition_sha256 !== data.invalidation_proposition_sha256
          || data.exact_candidate_sha256 !== null && receipt.exact_candidate_sha256 !== data.exact_candidate_sha256)) {
          throw new CorrectionInvariantError("Finding invalidation requires current independent verified evidence bound to the exact finding proposition and any declared candidate.");
        }
        const activeDirective = [...events].reverse().find((event) => event.data.type === "correction_lifecycle_recorded" && event.data.finding_ids.includes(data.finding_id))?.data;
        if (activeDirective?.type === "correction_lifecycle_recorded"
          && !["DIRECTIVE_WITHDRAWN", "DIRECTIVE_SUPERSEDED", "CORRECTION_RESOLVED"].includes(activeDirective.status)
          && data.affected_directive_event_ids.length === 0) {
          throw new CorrectionInvariantError("Invalidating a finding with an active directive must bind its withdrawal or supersession event.");
        }
        const directiveEffects = data.affected_directive_event_ids.map((eventId) => this.eventByEventId(eventId));
        if (directiveEffects.some((event) => event?.data.type !== "correction_lifecycle_recorded"
          || !event.data.finding_ids.includes(data.finding_id)
          || !["DIRECTIVE_WITHDRAWN", "DIRECTIVE_SUPERSEDED", "CORRECTION_RESOLVED"].includes(event.data.status))) {
          throw new CorrectionInvariantError("Affected directive events must durably withdraw, supersede, or close the directive bound to the invalidated finding.");
        }
      }
      if (data.status === "MITIGATED") {
        const receipts = data.mitigation_evidence_receipt_ids.map((receiptId) => events.find((event) => event.data.type === "evidence_receipt_recorded" && event.data.receipt_id === receiptId)?.data);
        if (receipts.some((receipt) => receipt?.type !== "evidence_receipt_recorded" || !receipt.verified
          || receipt.freshness !== "CURRENT" || receipt.independence !== "INDEPENDENT"
          || data.exact_candidate_sha256 !== null && receipt.exact_candidate_sha256 !== data.exact_candidate_sha256)) {
          throw new CorrectionInvariantError("Finding mitigation requires current independent verified evidence bound to any declared candidate.");
        }
      }
      if (data.status === "REOPENED") {
        const invalidating = this.eventByEventId(data.invalidating_event_id);
        const closure = this.eventByEventId(data.invalidated_closure_event_id);
        if (!invalidating || invalidating.worker !== data.worker
          || closure?.data.type !== "finding_status_changed" || closure.worker !== data.worker
          || closure.data.finding_id !== data.finding_id || !["RESOLVED", "INVALIDATED"].includes(closure.data.status)
          || invalidating.sequence <= closure.sequence) {
          throw new CorrectionInvariantError("Reopening must bind a later same-worker invalidating event and the exact prior finding closure.");
        }
      }
      return;
    }
    if (data.type !== "correction_lifecycle_recorded") return;
    const findingIds = new Set(
      this.workerEvents(data.worker)
        .filter((event) => event.data.type === "finding_recorded")
        .map((event) => event.data.type === "finding_recorded" ? event.data.finding_id : ""),
    );
    if (data.finding_ids.some((findingId) => !findingIds.has(findingId))) {
      throw new CorrectionInvariantError("Correction directives must bind existing finding IDs.");
    }
    const reusedDirective = this.workerEvents(data.worker).find((event) => event.data.type === "correction_lifecycle_recorded"
      && event.data.directive_id === data.directive_id && event.data.correction_attempt_id !== data.correction_attempt_id);
    if (reusedDirective) throw new CorrectionInvariantError("A directive ID cannot be reused across correction attempts.");
    const priorEvent = this.workerEvents(data.worker)
      .filter((event) => event.data.type === "correction_lifecycle_recorded" && event.data.correction_attempt_id === data.correction_attempt_id)
      .at(-1);
    const prior = priorEvent?.data;
    if (!priorEvent) {
      const currentStatuses = new Map<string, string>();
      for (const event of this.workerEvents(data.worker)) {
        if (event.data.type === "finding_recorded") currentStatuses.set(event.data.finding_id, "OPEN");
        if (event.data.type === "finding_status_changed") currentStatuses.set(event.data.finding_id, event.data.status);
      }
      if (data.status !== "CORRECTION_REOPENED"
        && data.finding_ids.some((findingId) => ["RESOLVED", "INVALIDATED"].includes(currentStatuses.get(findingId) ?? "OPEN"))) {
        throw new CorrectionInvariantError("A closed finding cannot receive a new correction attempt without an explicit finding reopen event.");
      }
    }
    validateCorrectionTransition(data, prior?.type === "correction_lifecycle_recorded" ? prior : undefined, priorEvent?.eventId);
    const workerEvents = this.workerEvents(data.worker);
    const currentContract = [...workerEvents].reverse().find((event) => event.data.type === "task_contract_recorded")?.data;
    const currentOutcome = [...workerEvents].reverse().find((event) => event.data.type === "owner_outcome_recorded")?.data;
    if (data.status !== "CORRECTION_REOPENED") {
      if (currentContract?.type !== "task_contract_recorded" || currentContract.contract_id !== data.contract_id
        || currentContract.task_contract_sha256 !== data.contract_sha256) {
        throw new CorrectionInvariantError("Correction event is stale against the current task-contract identity.");
      }
      if (currentOutcome?.type !== "owner_outcome_recorded" || currentOutcome.owner_outcome_id !== data.owner_outcome_id
        || currentOutcome.epoch !== data.owner_outcome_epoch || currentOutcome.owner_outcome_sha256 !== data.owner_outcome_sha256) {
        throw new CorrectionInvariantError("Correction event is stale against the current owner-outcome identity.");
      }
    }
    if (data.status === "CORRECTION_EVIDENCE_SUBMITTED" || data.status === "CORRECTION_VERIFIED") {
      const receipts = data.evidence_receipt_ids.map((receiptId) => workerEvents
        .find((event) => event.data.type === "evidence_receipt_recorded" && event.data.receipt_id === receiptId)?.data);
      if (receipts.some((receipt) => receipt?.type !== "evidence_receipt_recorded"
        || receipt.freshness !== "CURRENT" || receipt.exact_candidate_sha256 !== data.verified_candidate_sha256)) {
        throw new CorrectionInvariantError("Correction evidence must be a current atomic set bound to one exact candidate.");
      }
      if (data.status === "CORRECTION_VERIFIED" && receipts.some((receipt) => receipt?.type !== "evidence_receipt_recorded"
        || !receipt.verified || receipt.independence === "UNKNOWN")) {
        throw new CorrectionInvariantError("Correction verification requires verified evidence from declared provenance.");
      }
    }
    if (data.status === "CORRECTION_VERIFIED") {
      const validity = [...workerEvents].reverse().find((event) => event.data.type === "verification_validity_recorded")?.data;
      if (validity?.type !== "verification_validity_recorded" || !data.verification_validity_scope
        || canonicalJson(data.verification_validity_scope) !== canonicalJson({
          context_id: validity.context_id,
          exact_candidate_sha256: validity.exact_candidate_sha256,
          contract_sha256: validity.contract_sha256,
          owner_outcome_id: validity.owner_outcome_id,
          owner_outcome_epoch: validity.owner_outcome_epoch,
          owner_outcome_sha256: validity.owner_outcome_sha256,
          verification_policy_id: validity.verification_policy_id,
          verification_policy_sha256: validity.verification_policy_sha256,
          evidence_requirement_schema_sha256: validity.evidence_requirement_schema_sha256,
          worker_run_id: validity.worker_run_id,
          assignment_epoch: validity.assignment_epoch,
          target_kind: validity.target_kind,
          target_id: validity.target_id,
          target_epoch: validity.target_epoch,
          environment_bindings: validity.environment_bindings,
          source_snapshot_bindings: validity.source_snapshot_bindings,
          verifier_method_version: validity.verifier_method_version,
          invalidate_on: data.verification_validity_scope.invalidate_on,
        })) {
        throw new CorrectionInvariantError("Correction verification must bind the latest complete durable verification-validity context.");
      }
    }
    if (data.status === "CORRECTION_RESOLVED") {
      const currentStatuses = new Map<string, string>();
      for (const event of this.workerEvents(data.worker)) {
        if (event.data.type === "finding_recorded") currentStatuses.set(event.data.finding_id, "OPEN");
        if (event.data.type === "finding_status_changed") currentStatuses.set(event.data.finding_id, event.data.status);
      }
      if (data.finding_ids.some((findingId) => !["RESOLVED", "INVALIDATED"].includes(currentStatuses.get(findingId) ?? "OPEN"))) {
        throw new CorrectionInvariantError("Correction resolution requires every bound finding to be independently resolved or invalidated.");
      }
      const statuses = data.finding_ids.map((findingId) => currentStatuses.get(findingId));
      const expectedBasis = statuses.every((status) => status === "RESOLVED") ? "CORRECTED_AND_VERIFIED"
        : statuses.every((status) => status === "INVALIDATED") ? "FINDING_INVALIDATED" : "MIXED_RESOLUTION";
      if (data.closure_basis !== expectedBasis) throw new CorrectionInvariantError(`Correction closure basis must be ${expectedBasis}.`);
      if (expectedBasis !== "FINDING_INVALIDATED") {
        const verification = [...workerEvents].reverse().find((event) => event.data.type === "correction_lifecycle_recorded"
          && event.data.correction_attempt_id === data.correction_attempt_id && event.data.status === "CORRECTION_VERIFIED")?.data;
        if (verification?.type !== "correction_lifecycle_recorded" || !this.verificationStillCurrent(workerEvents, verification)) {
          throw new CorrectionInvariantError("Corrected or mixed closure requires a current valid correction verification in the same attempt.");
        }
      }
    }
  }

  private validateWorkerChannel(envelope: AppendEnvelope, producer: AuthenticatedProducer) {
    const data = envelope.data;
    if (!["owner_message_recorded", "outbound_delivery_lifecycle_recorded", "outbound_message_acknowledged",
      "worker_message_recorded", "direction_acknowledged", "work_queue_published", "direction_reconciled",
      "structured_blocker_recorded", "change_proposal_recorded"].includes(data.type)) return;
    if (!data.worker) throw new ContractInvariantError("Worker-channel events require a worker identity.");
    const events = this.workerEvents(data.worker);
    const ownerMessages = events.filter((event) => event.data.type === "owner_message_recorded");
    const directionMessage = (directionId: string) => ownerMessages.find((event) => event.data.type === "owner_message_recorded"
      && event.data.direction_id === directionId);

    if (data.type === "owner_message_recorded") {
      if (events.some((event) => event.data.type === data.type && event.data.message_id === data.message_id)) {
        throw new ContractInvariantError("owner_message_recorded.message_id must be unique within the worker ledger.");
      }
      if (data.reply_to_message_id && !events.some((event) => (event.data.type === "owner_message_recorded" || event.data.type === "worker_message_recorded")
        && event.data.message_id === data.reply_to_message_id)) {
        throw new ContractInvariantError("Owner replies must bind an existing same-worker channel message.");
      }
      if (data.supersedes_direction_id && !directionMessage(data.supersedes_direction_id)) {
        throw new ContractInvariantError("A superseding owner direction must bind an existing same-worker direction.");
      }
      if (data.created_by !== producer.id) throw new ContractInvariantError("Owner message source identity must match the authenticated producer.");
      if (data.message_kind === "DIRECTION") {
        const latest = ownerMessages.findLast((event) => event.data.type === "owner_message_recorded" && event.data.message_kind === "DIRECTION")?.data;
        const expectedEpoch = latest?.type === "owner_message_recorded" ? (latest.authority_epoch ?? 0) + 1 : 1;
        if (data.authority_epoch !== expectedEpoch) throw new ContractInvariantError("Owner direction authority epochs must increase exactly once per worker.");
        if ((latest?.type === "owner_message_recorded" ? latest.direction_id : null) !== data.supersedes_direction_id) {
          throw new ContractInvariantError("A new owner direction must explicitly supersede the latest same-worker direction.");
        }
        if (data.scope?.kind === "WORKER" && data.scope.id !== data.worker) {
          throw new ContractInvariantError("Worker-scoped owner directions must name the exact worker.");
        }
      }
      return;
    }

    if (data.type === "outbound_delivery_lifecycle_recorded") {
      const source = this.eventByEventId(data.source_message_event_id);
      if (source?.worker !== data.worker || source.data.type !== "owner_message_recorded" || source.data.message_id !== data.message_id) {
        throw new ContractInvariantError("Outbound delivery must bind the exact durable owner message event.");
      }
      const prior = events.filter((event) => event.data.type === data.type && event.data.delivery_id === data.delivery_id).at(-1)?.data;
      if (!prior) {
        if (data.status !== "QUEUED" || data.attempt !== 0) throw new ContractInvariantError("A delivery lifecycle must begin at QUEUED attempt 0.");
        return;
      }
      if (prior.type !== data.type || prior.message_id !== data.message_id || prior.source_message_event_id !== data.source_message_event_id
        || prior.transport !== data.transport || prior.endpoint_id !== data.endpoint_id) {
        throw new ContractInvariantError("Delivery lifecycle identity and routing are immutable.");
      }
      const allowed: Record<string, string[]> = {
        QUEUED: ["DELIVERY_ATTEMPTED", "EXPIRED", "SUPERSEDED"],
        DELIVERY_ATTEMPTED: ["DELIVERED", "DELIVERY_FAILED", "EXPIRED"],
        DELIVERED: ["DELIVERY_ATTEMPTED", "EXPIRED", "SUPERSEDED"],
        DELIVERY_FAILED: ["DELIVERY_ATTEMPTED", "EXPIRED", "SUPERSEDED"],
        EXPIRED: [], SUPERSEDED: [],
      };
      if (!allowed[prior.status]?.includes(data.status)) throw new ContractInvariantError(`Invalid delivery transition ${prior.status} -> ${data.status}.`);
      if (data.status === "DELIVERY_ATTEMPTED" && data.attempt !== prior.attempt + 1
        || data.status !== "DELIVERY_ATTEMPTED" && data.attempt !== prior.attempt) {
        throw new ContractInvariantError("Delivery attempts must advance exactly once at DELIVERY_ATTEMPTED and remain stable for its result.");
      }
      return;
    }

    if (data.type === "outbound_message_acknowledged") {
      const message = ownerMessages.find((event) => event.data.type === "owner_message_recorded" && event.data.message_id === data.message_id);
      const delivered = events.findLast((event) => event.data.type === "outbound_delivery_lifecycle_recorded"
        && event.data.delivery_id === data.delivery_id && event.data.message_id === data.message_id)?.data;
      if (!message || delivered?.type !== "outbound_delivery_lifecycle_recorded" || delivered.status !== "DELIVERED") {
        throw new ContractInvariantError("A message acknowledgement requires the exact delivered same-worker message.");
      }
      this.assertUniqueDomainId(data.worker, data.type, "acknowledgement_id", data.acknowledgement_id);
      return;
    }

    if (data.type === "worker_message_recorded") {
      this.assertUniqueDomainId(data.worker, data.type, "message_id", data.message_id);
      if (data.reply_to_message_id && !events.some((event) => (event.data.type === "owner_message_recorded" || event.data.type === "worker_message_recorded")
        && event.data.message_id === data.reply_to_message_id)) {
        throw new ContractInvariantError("Worker replies must bind an existing same-worker channel message.");
      }
      if (data.direction_id && !directionMessage(data.direction_id)) throw new ContractInvariantError("Worker messages cannot bind an unknown direction.");
      return;
    }

    if (data.type === "direction_acknowledged") {
      const message = directionMessage(data.direction_id);
      if (message?.data.type !== "owner_message_recorded" || message.data.message_id !== data.message_id) {
        throw new ContractInvariantError("Direction acknowledgement must bind the exact owner direction message.");
      }
      if (!events.some((event) => event.data.type === "outbound_message_acknowledged" && event.data.message_id === data.message_id)) {
        throw new ContractInvariantError("Direction interpretation cannot precede transport acknowledgement.");
      }
      this.assertUniqueDomainId(data.worker, data.type, "acknowledgement_id", data.acknowledgement_id);
      return;
    }

    if (data.type === "work_queue_published") {
      if (!directionMessage(data.direction_id)) throw new ContractInvariantError("Work queues must bind an existing owner direction.");
      if (!events.some((event) => event.data.type === "direction_acknowledged" && event.data.direction_id === data.direction_id)) {
        throw new ContractInvariantError("A worker must acknowledge a direction before publishing its direction-bound queue.");
      }
      this.assertUniqueDomainId(data.worker, data.type, "queue_revision_id", data.queue_revision_id);
      const priorQueue = events.findLast((event) => event.data.type === "work_queue_published" && event.data.direction_id === data.direction_id)?.data;
      const expectedRevision = priorQueue?.type === "work_queue_published" ? priorQueue.revision + 1 : 1;
      const expectedPrevious = priorQueue?.type === "work_queue_published" ? priorQueue.queue_revision_id : null;
      if (data.revision !== expectedRevision || data.previous_queue_revision_id !== expectedPrevious) {
        throw new ContractInvariantError("Queue revisions must advance exactly once and bind the prior direction queue publication.");
      }
      const itemIds = new Set(data.items.map((item) => item.item_id));
      if (itemIds.size !== data.items.length || data.items.some((item) => item.depends_on.some((dependency) => !itemIds.has(dependency)))) {
        throw new ContractInvariantError("Queue item identities must be unique and dependencies must resolve within the same revision.");
      }
      return;
    }

    if (data.type === "direction_reconciled") {
      const queue = events.find((event) => event.data.type === "work_queue_published" && event.data.queue_revision_id === data.queue_revision_id)?.data;
      if (queue?.type !== "work_queue_published" || queue.direction_id !== data.direction_id) {
        throw new ContractInvariantError("Direction reconciliation must bind an exact queue revision for the same direction.");
      }
      this.assertUniqueDomainId(data.worker, data.type, "reconciliation_id", data.reconciliation_id);
      return;
    }

    if (data.type === "structured_blocker_recorded" || data.type === "change_proposal_recorded") {
      if (!directionMessage(data.direction_id)) throw new ContractInvariantError("Structured worker issues must bind an existing owner direction.");
      const queueItemId = data.queue_item_id;
      if (queueItemId && !events.some((event) => event.data.type === "work_queue_published"
        && event.data.direction_id === data.direction_id && event.data.items.some((item) => item.item_id === queueItemId))) {
        throw new ContractInvariantError("Structured worker issues must bind a queue item from the same direction when one is named.");
      }
      if (data.type === "structured_blocker_recorded" && data.reported_by !== producer.id) {
        throw new ContractInvariantError("Blocker reporter must match the authenticated producer.");
      }
      if (data.type === "change_proposal_recorded") {
        if (data.proposer_id !== producer.id) throw new ContractInvariantError("Proposal author must match the authenticated producer.");
        if (data.authority_effect !== "NON_OPERATIVE" || data.reasoning_authority !== "WORKER_CLAIM") {
          throw new ContractInvariantError("Worker change proposals are non-operative claims and cannot assert decision authority.");
        }
      }
      return;
    }
  }

  private assertUniqueDomainId(worker: string, type: MissionControlEventV2["type"], field: string, value: string) {
    const duplicate = this.workerEvents(worker).some((event) => event.data.type === type
      && (event.data as unknown as Record<string, unknown>)[field] === value);
    if (duplicate) throw new CorrectionInvariantError(`${type}.${field} must be unique within the worker ledger.`);
  }

  private validateQualitativeAdvancementEvidence(
    worker: string,
    boundary: "current" | "best",
    evidence: Extract<MissionControlEventV2, { type: "outcome_progress_recorded" }>["current_evidence"],
  ) {
    const directClasses = new Set(["TEST", "ARTIFACT", "SEMANTIC_REVIEW", "OWNER_OBSERVATION", "RESEARCH_VERDICT"]);
    for (const receiptId of evidence.evidence_receipt_ids) {
      const matching = this.allEvents().filter((event) => event.data.type === "evidence_receipt_recorded"
        && event.data.receipt_id === receiptId);
      const receiptEvent = matching.find((event) => event.worker === worker);
      const receipt = receiptEvent?.data;
      if (receipt?.type !== "evidence_receipt_recorded") {
        const location = matching.length ? "belongs to another worker" : "does not exist";
        throw new ContractInvariantError(`Qualitative ${boundary} ADVANCING evidence receipt ${receiptId} ${location}; same-worker durable evidence is required.`);
      }
      if (!receipt.verified || receipt.freshness !== "CURRENT" || receipt.independence !== "INDEPENDENT") {
        throw new ContractInvariantError(`Qualitative ${boundary} ADVANCING evidence receipt ${receiptId} must be verified, CURRENT, and INDEPENDENT.`);
      }
      if (receipt.producer_role === "WORKER" || !directClasses.has(receipt.evidence_class)) {
        throw new ContractInvariantError(`Qualitative ${boundary} ADVANCING evidence receipt ${receiptId} records worker activity or supporting change evidence, not an independently checked outcome indicator.`);
      }
    }
  }

  private validateObligationReferences(
    worker: string,
    sourceEventIds: string[],
    findingIds: string[],
    evidenceIds: string[],
    pendingFindingId?: string,
  ) {
    if (sourceEventIds.some((eventId) => {
      const source = this.eventByEventId(eventId);
      return !source || source.worker !== worker;
    })) throw new CorrectionInvariantError("Owner-action source_event_ids must exist in the same worker ledger.");
    const events = this.workerEvents(worker);
    const findings = new Set(events.flatMap((event) => event.data.type === "finding_recorded" ? [event.data.finding_id] : []));
    const evidence = new Set(events.flatMap((event) => event.data.type === "evidence_receipt_recorded" ? [event.data.receipt_id] : []));
    if (findingIds.some((findingId) => findingId !== pendingFindingId && !findings.has(findingId))) throw new CorrectionInvariantError("Continuation-policy finding bases must exist.");
    if (evidenceIds.some((evidenceId) => !evidence.has(evidenceId))) throw new CorrectionInvariantError("Continuation-policy evidence bases must exist.");
  }

  private verificationStillCurrent(events: StoredEvent[], verification: Extract<MissionControlEventV2, { type: "correction_lifecycle_recorded" }>): boolean {
    const scope = verification.verification_validity_scope;
    const context = [...events].reverse().find((event) => event.data.type === "verification_validity_recorded")?.data;
    const checkpoint = [...events].reverse().find((event) => event.data.type === "worker_checkpoint_recorded")?.data;
    return Boolean(scope && context?.type === "verification_validity_recorded"
      && context.context_id === scope.context_id
      && context.exact_candidate_sha256 === scope.exact_candidate_sha256
      && context.contract_sha256 === scope.contract_sha256
      && context.owner_outcome_id === scope.owner_outcome_id
      && context.owner_outcome_epoch === scope.owner_outcome_epoch
      && context.owner_outcome_sha256 === scope.owner_outcome_sha256
      && context.verification_policy_id === scope.verification_policy_id
      && context.verification_policy_sha256 === scope.verification_policy_sha256
      && context.evidence_requirement_schema_sha256 === scope.evidence_requirement_schema_sha256
      && context.assignment_epoch === scope.assignment_epoch
      && context.target_kind === scope.target_kind
      && context.target_id === scope.target_id
      && context.target_epoch === scope.target_epoch
      && canonicalJson(context.environment_bindings) === canonicalJson(scope.environment_bindings)
      && canonicalJson(context.source_snapshot_bindings) === canonicalJson(scope.source_snapshot_bindings)
      && context.verifier_method_version === scope.verifier_method_version
      && checkpoint?.type === "worker_checkpoint_recorded" && checkpoint.worker_run_id === scope.worker_run_id);
  }

  private latestEventHash(): string | null {
    const row = this.db.prepare("SELECT event_hash FROM events ORDER BY sequence DESC LIMIT 1").get() as { event_hash: string } | undefined;
    return row?.event_hash ?? null;
  }

  private eventBySequence(sequence: number): StoredEvent | null {
    const row = this.db.prepare("SELECT * FROM events WHERE sequence = ?").get(sequence) as Record<string, unknown> | undefined;
    return row ? toStoredEvent(row) : null;
  }

  private releaseWriterLock() {
    if (this.writerLockFd !== null) {
      try { fs.closeSync(this.writerLockFd); } catch {}
    }
    if (this.writerLockPath !== null) {
      try { fs.unlinkSync(this.writerLockPath); } catch {}
    }
  }
}

function sameLogicalEvent(existing: StoredEvent, envelope: AppendEnvelope): boolean {
  return canonicalJson({
    schemaVersion: existing.schemaVersion,
    eventId: existing.eventId,
    missionId: existing.missionId,
    worker: existing.worker,
    type: existing.type,
    occurredAt: existing.occurredAt,
    data: existing.data,
  }) === canonicalJson({
    schemaVersion: envelope.schema_version,
    eventId: envelope.event_id,
    missionId: envelope.mission_id,
    worker: eventWorker(envelope.data),
    type: envelope.data.type,
    occurredAt: envelope.occurred_at,
    data: envelope.data,
  });
}

function calculateEventHash(input: EventHashInput): string {
  return sha256(canonicalJson(input));
}

function toStoredEvent(row: Record<string, unknown>): StoredEvent {
  const schemaVersion = Number(row.schema_version) as 1 | 2;
  const raw = JSON.parse(String(row.payload_json));
  const data = schemaVersion === 1 ? parseLegacyEvent(raw) : parseEventV2(raw);
  const sequence = Number(row.sequence);
  return {
    id: sequence,
    sequence,
    eventId: String(row.event_id),
    schemaVersion,
    missionId: String(row.mission_id),
    worker: row.worker === null ? null : String(row.worker),
    type: data.type,
    occurredAt: String(row.occurred_at),
    receivedAt: String(row.received_at),
    previousHash: row.previous_hash === null ? null : String(row.previous_hash),
    eventHash: String(row.event_hash),
    producerId: String(row.producer_id),
    producerKind: String(row.producer_kind),
    data,
  };
}

function internalProducerFor(data: MissionControlEventV2): AuthenticatedProducer {
  const worker = data.worker ?? "mission-control";
  if (data.type === "evidence_receipt_recorded") return {
    id: data.producer_id,
    kind: data.producer_role as ProducerKind,
    workerScopes: [worker], taskScopes: [`task:${worker}`],
  };
  return { id: `bootstrap:${worker}`, kind: "SYSTEM", workerScopes: [worker], taskScopes: [`task:${worker}`] };
}

function internalUiProducer(): AuthenticatedProducer {
  return { id: "mission-control-ui", kind: "UI", workerScopes: ["*"], taskScopes: ["*"] };
}
