import type { DatabaseSync } from "node:sqlite";
import type { CapabilityChallenge } from "./github-decision-receipts";

export interface DurableCapabilityChallenge extends CapabilityChallenge {
  issuedAt: string;
  bindingDigest: string;
  policyDigest: string;
}
export type PublicationPhase = "GENERATED" | "PUBLISHING" | "PUBLISHED" | "ACTIVE" | "EXPIRED";
export interface PublicationProof { commentId: number; immutableUrl: string; bodySha256: string; authorLogin: string; createdAt: string }
export interface RotationRecord { challenge: DurableCapabilityChallenge; phase: PublicationPhase; publication: PublicationProof | null }

// Uses the daemon's existing exclusively owned connection, never another SQLite writer.
export class CapabilityRotationStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS capability_rotation_candidates (
        challenge_id TEXT PRIMARY KEY, supervisor_id TEXT NOT NULL, challenge_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS capability_rotation_slots (
        supervisor_id TEXT PRIMARY KEY, current_id TEXT REFERENCES capability_rotation_candidates(challenge_id),
        pending_id TEXT REFERENCES capability_rotation_candidates(challenge_id)
      );
      CREATE TABLE IF NOT EXISTS capability_rotation_lifecycle (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, challenge_id TEXT NOT NULL REFERENCES capability_rotation_candidates(challenge_id),
        phase TEXT NOT NULL CHECK(phase IN ('GENERATED','PUBLISHING','PUBLISHED','ACTIVE','EXPIRED')),
        recorded_at TEXT NOT NULL, publication_json TEXT
      );
      CREATE TRIGGER IF NOT EXISTS capability_candidate_no_update BEFORE UPDATE ON capability_rotation_candidates BEGIN SELECT RAISE(ABORT,'immutable capability candidate'); END;
      CREATE TRIGGER IF NOT EXISTS capability_candidate_no_delete BEFORE DELETE ON capability_rotation_candidates BEGIN SELECT RAISE(ABORT,'immutable capability candidate'); END;
      CREATE TRIGGER IF NOT EXISTS capability_lifecycle_no_update BEFORE UPDATE ON capability_rotation_lifecycle BEGIN SELECT RAISE(ABORT,'immutable capability lifecycle'); END;
      CREATE TRIGGER IF NOT EXISTS capability_lifecycle_no_delete BEFORE DELETE ON capability_rotation_lifecycle BEGIN SELECT RAISE(ABORT,'immutable capability lifecycle'); END;
    `);
  }

  byId(id: string): RotationRecord | null {
    const row = this.db.prepare(`SELECT c.challenge_json, l.phase, l.publication_json FROM capability_rotation_candidates c
      JOIN capability_rotation_lifecycle l ON l.challenge_id=c.challenge_id WHERE c.challenge_id=? ORDER BY l.sequence DESC LIMIT 1`).get(id) as {challenge_json: string; phase: PublicationPhase; publication_json: string | null} | undefined;
    return row ? {challenge: JSON.parse(row.challenge_json), phase: row.phase, publication: row.publication_json ? JSON.parse(row.publication_json) : null} : null;
  }
  hasHistory(): boolean {
    return !!this.db.prepare("SELECT 1 FROM capability_rotation_candidates LIMIT 1").get();
  }
  slot(supervisor: string): { current: RotationRecord | null; pending: RotationRecord | null } {
    const row = this.db.prepare("SELECT current_id,pending_id FROM capability_rotation_slots WHERE supervisor_id=?").get(supervisor) as {current_id:string|null;pending_id:string|null} | undefined;
    return {current: row?.current_id ? this.byId(row.current_id) : null, pending: row?.pending_id ? this.byId(row.pending_id) : null};
  }
  candidate(value: DurableCapabilityChallenge): RotationRecord {
    return this.transaction(() => {
      const slot = this.slot(value.supervisorId);
      if (slot.pending) return slot.pending;
      this.db.prepare("INSERT INTO capability_rotation_candidates VALUES (?,?,?)").run(value.challengeId,value.supervisorId,JSON.stringify(value));
      this.db.prepare(`INSERT INTO capability_rotation_slots(supervisor_id,pending_id) VALUES (?,?)
        ON CONFLICT(supervisor_id) DO UPDATE SET pending_id=excluded.pending_id`).run(value.supervisorId,value.challengeId);
      this.transition(value.challengeId,"GENERATED",value.issuedAt,null);
      return this.byId(value.challengeId)!;
    });
  }
  markPublishing(id: string, at: string) {
    const record = this.byId(id);
    if (!record || record.phase !== "GENERATED") throw new Error("CAPABILITY_PUBLICATION_PHASE_INVALID");
    this.transition(id,"PUBLISHING",at,null);
  }
  expirePending(supervisor: string, at: string) {
    this.transaction(()=>{
      const pending=this.slot(supervisor).pending;
      if(!pending || Date.parse(pending.challenge.expiresAt)>Date.parse(at)) throw new Error("CAPABILITY_PENDING_NOT_EXPIRED");
      this.transition(pending.challenge.challengeId,"EXPIRED",at,pending.publication);
      this.db.prepare("UPDATE capability_rotation_slots SET pending_id=NULL WHERE supervisor_id=?").run(supervisor);
    });
  }
  markPublished(id: string, proof: PublicationProof, at: string) {
    const record = this.byId(id);
    if (!record || !["GENERATED","PUBLISHING","PUBLISHED"].includes(record.phase)) throw new Error("CAPABILITY_PUBLICATION_PHASE_INVALID");
    this.transition(id,"PUBLISHED",at,proof);
  }
  activate(id: string, at: string, materialize: () => void) {
    return this.transaction(() => {
      const record = this.byId(id);
      if (!record || record.phase !== "PUBLISHED" || !record.publication || Date.parse(record.challenge.expiresAt) <= Date.parse(at)) throw new Error("CAPABILITY_ACTIVATION_INVALID");
      if (this.slot(record.challenge.supervisorId).pending?.challenge.challengeId !== id) throw new Error("CAPABILITY_PENDING_MISMATCH");
      materialize(); // Immutable legacy-format challenge evidence and current pointer commit together.
      this.transition(id,"ACTIVE",at,record.publication);
      this.db.prepare("UPDATE capability_rotation_slots SET current_id=?,pending_id=NULL WHERE supervisor_id=?").run(id,record.challenge.supervisorId);
      return this.byId(id)!;
    });
  }
  private transition(id: string, phase: PublicationPhase, at: string, proof: PublicationProof | null) {
    this.db.prepare("INSERT INTO capability_rotation_lifecycle(challenge_id,phase,recorded_at,publication_json) VALUES (?,?,?,?)").run(id,phase,at,proof ? JSON.stringify(proof) : null);
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const value=fn(); this.db.exec("COMMIT"); return value; }
    catch(error) { this.db.exec("ROLLBACK"); throw error; }
  }
}
