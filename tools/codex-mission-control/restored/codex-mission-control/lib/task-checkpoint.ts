// A checkpoint that a registered task's supervisor holds the task for (#385), verified by Mission Control itself.
//
// When a supervisor's decision starts no bounded step ("hold until a checkpoint exists"), whoever executes the task
// writes that checkpoint into the task's private repository. The owner then names it to Mission Control by exact
// commit, path and SHA-256 (owner:action checkpoint-verify). Mission Control fetches the file from GitHub at that
// commit, checks its SHA-256, and checks the SHA-256 of every file the checkpoint lists at the base commit it names.
// Only then does it record verified review evidence, which the fleet watch takes to the supervisor for review.
// Mission Control checks these hashes, not what the checkpoint says: the supervisor reviews that.
import { createHash } from "node:crypto";
import { canonicalJson, sha256 } from "./canonical";
import type { AuthenticatedProducer } from "./ingestion-auth";
import { workerHasOwnerTaskRegistration } from "./owner-task-source";
import type { AppendEnvelope, StoredEvent } from "./schema";
import { isBoundWorkDirectiveExpiry, workDirectiveExpiryEventId } from "./work-directive-expiry";

export const TASK_CHECKPOINT_VERIFIER_ID = "verifier:task-checkpoint";
/** The first line of every verified checkpoint's evidence summary. */
export const TASK_CHECKPOINT_SUMMARY_PREFIX = "MISSION_CONTROL_TASK_CHECKPOINT_VERIFIED_V1";
/** The checkpoint file itself: a small JSON document. */
export const TASK_CHECKPOINT_MAX_BYTES = 64 * 1024;
/** The files a checkpoint lists, each fetched at its base commit and held in memory only while it is hashed. A file in
 * Git LFS is read as its pointer text, so the checkpoint lists the pointer's SHA-256 for it. */
export const TASK_CHECKPOINT_MAX_FILES = 32;
export const TASK_CHECKPOINT_MAX_FILE_BYTES = 32 * 1024 * 1024;
export const TASK_CHECKPOINT_MAX_TOTAL_BYTES = 128 * 1024 * 1024;
/** How much of the checkpoint the evidence carries to the supervisor (its file list is replaced by the count checked). */
export const TASK_CHECKPOINT_EXCERPT_LIMIT = 4_000;

export interface TaskCheckpointRequest {
  worker: string;
  repository: string;
  path: string;
  commit: string;
  sha256: string;
}

/** Reads one file of a repository at an exact commit; refuses a file larger than maxBytes. */
export type RepositoryFileReader = (repository: string, path: string, commit: string, maxBytes: number) => Promise<Uint8Array>;

export interface TaskCheckpointVerification {
  request: TaskCheckpointRequest;
  checkpoint: Record<string, unknown>;
  baseCommit: string;
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

/** The checkpoint or a file it lists doesn't match, or the checkpoint isn't one Mission Control can check. */
export class TaskCheckpointRejectedError extends Error {
  constructor(message: string) { super(message); this.name = "TaskCheckpointRejectedError"; }
}

/** GitHub could not be read; nothing is known about the checkpoint. */
export class TaskCheckpointReadError extends Error {
  constructor(message: string) { super(message); this.name = "TaskCheckpointReadError"; }
}

/** Which private repository each registered task's checkpoints live in: MISSION_CONTROL_TASK_CHECKPOINT_REPOSITORIES_JSON,
 * an object from worker id to owner/repository. Only a repository named here is ever read. */
export function parseTaskCheckpointRepositories(raw: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  if (!raw?.trim()) return result;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("MISSION_CONTROL_TASK_CHECKPOINT_REPOSITORIES_JSON is not valid JSON."); }
  if (!isRecord(parsed)) throw new Error("MISSION_CONTROL_TASK_CHECKPOINT_REPOSITORIES_JSON must map worker ids to owner/repository.");
  for (const [worker, repository] of Object.entries(parsed)) {
    if (!WORKER_ID.test(worker) || typeof repository !== "string" || !REPOSITORY.test(repository)) {
      throw new Error("MISSION_CONTROL_TASK_CHECKPOINT_REPOSITORIES_JSON must map worker ids to owner/repository.");
    }
    result.set(worker, repository);
  }
  return result;
}

/** The checks on what the owner names, before anything is fetched. */
export function validatedCheckpointRequest(request: TaskCheckpointRequest): TaskCheckpointRequest {
  if (!WORKER_ID.test(request.worker)) throw new TaskCheckpointRejectedError("The worker is not a Mission Control worker id.");
  if (!REPOSITORY.test(request.repository)) throw new TaskCheckpointRejectedError("The repository must be owner/repository.");
  if (!COMMIT.test(request.commit)) throw new TaskCheckpointRejectedError("The commit must be one full 40-character commit SHA.");
  if (!SHA256.test(request.sha256)) throw new TaskCheckpointRejectedError("The SHA-256 must be 64 lowercase hex characters.");
  return { ...request, path: repositoryPath(request.path) };
}

/**
 * Fetches the checkpoint at its commit and checks its SHA-256, then fetches every file it lists at its base commit and
 * checks each SHA-256. The checkpoint is a JSON object naming its task (`task`, the worker id), its `base_commit` and
 * `files_sha256_at_base_commit` (path to SHA-256, 1 to 32 files). Any mismatch or unreadable part rejects it whole.
 */
export async function verifyTaskCheckpoint(request: TaskCheckpointRequest, read: RepositoryFileReader): Promise<TaskCheckpointVerification> {
  const exact = validatedCheckpointRequest(request);
  const bytes = await read(exact.repository, exact.path, exact.commit, TASK_CHECKPOINT_MAX_BYTES);
  if (sha256Bytes(bytes) !== exact.sha256) {
    throw new TaskCheckpointRejectedError(`The checkpoint at ${exact.path} in commit ${exact.commit.slice(0, 12)} does not have the SHA-256 given.`);
  }
  let checkpoint: unknown;
  try { checkpoint = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch {
    throw new TaskCheckpointRejectedError("The checkpoint is not a UTF-8 JSON document.");
  }
  if (!isRecord(checkpoint)) throw new TaskCheckpointRejectedError("The checkpoint must be a JSON object.");
  if (checkpoint.task !== exact.worker) throw new TaskCheckpointRejectedError(`The checkpoint names another task than ${exact.worker}.`);
  const baseCommit = checkpoint.base_commit;
  if (typeof baseCommit !== "string" || !COMMIT.test(baseCommit)) {
    throw new TaskCheckpointRejectedError("The checkpoint's base_commit must be one full 40-character commit SHA.");
  }
  const listed = checkpoint.files_sha256_at_base_commit;
  if (!isRecord(listed)) throw new TaskCheckpointRejectedError("The checkpoint must list files_sha256_at_base_commit.");
  const entries = Object.entries(listed);
  if (entries.length < 1 || entries.length > TASK_CHECKPOINT_MAX_FILES) {
    throw new TaskCheckpointRejectedError(`The checkpoint must list 1 to ${TASK_CHECKPOINT_MAX_FILES} files.`);
  }
  const files: TaskCheckpointVerification["files"] = [];
  let total = bytes.length;
  for (const [rawPath, expected] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    let path: string;
    try { path = repositoryPath(rawPath); } catch { throw new TaskCheckpointRejectedError("The checkpoint lists a file path Mission Control can't read."); }
    if (typeof expected !== "string" || !SHA256.test(expected)) {
      throw new TaskCheckpointRejectedError(`The checkpoint's SHA-256 for ${path} is not 64 lowercase hex characters.`);
    }
    const content = await read(exact.repository, path, baseCommit, Math.min(TASK_CHECKPOINT_MAX_FILE_BYTES, TASK_CHECKPOINT_MAX_TOTAL_BYTES - total));
    total += content.length;
    if (sha256Bytes(content) !== expected) {
      throw new TaskCheckpointRejectedError(`${path} at commit ${baseCommit.slice(0, 12)} does not have the SHA-256 the checkpoint lists.`);
    }
    files.push({ path, sha256: expected, bytes: content.length });
  }
  return { request: exact, checkpoint, baseCommit, files };
}

/** The event id of one exact checkpoint's verification: the same checkpoint verified twice is one record. */
export function taskCheckpointEventId(request: TaskCheckpointRequest): string {
  const exact = validatedCheckpointRequest(request);
  return "task-checkpoint-verified:" + sha256(canonicalJson({
    worker: exact.worker, repository: exact.repository, path: exact.path, commit: exact.commit, sha256: exact.sha256,
  })).slice(0, 32);
}

export function taskCheckpointVerifierProducer(worker: string): AuthenticatedProducer {
  return { id: TASK_CHECKPOINT_VERIFIER_ID, kind: "VERIFIER", workerScopes: [worker], taskScopes: [`task:${worker}`] };
}

/** The verified review evidence for one checked checkpoint: the fleet watch's boundary for the supervisor's review. */
export function taskCheckpointEvidenceEnvelope(verification: TaskCheckpointVerification, recordedAt: string): AppendEnvelope {
  const { request, checkpoint, baseCommit, files } = verification;
  const eventId = taskCheckpointEventId(request);
  const { files_sha256_at_base_commit: _listed, ...statements } = checkpoint;
  const full = canonicalJson(statements);
  const clipped = full.length > TASK_CHECKPOINT_EXCERPT_LIMIT;
  const excerpt = clipped ? `${full.slice(0, TASK_CHECKPOINT_EXCERPT_LIMIT - 1)}…` : full;
  const summary = [
    TASK_CHECKPOINT_SUMMARY_PREFIX,
    `Mission Control read this checkpoint from ${request.repository} at commit ${request.commit}, path ${request.path}, and its `
      + `SHA-256 matched. It also read the ${files.length} file${files.length === 1 ? "" : "s"} the checkpoint lists at base commit `
      + `${baseCommit}, and every SHA-256 matched. It checked these hashes only, not what the checkpoint says. The checkpoint, `
      + `without its file list${clipped ? ", cut at " + TASK_CHECKPOINT_EXCERPT_LIMIT + " characters" : ""}:`,
    excerpt,
  ].join("\n");
  return {
    schema_version: 2,
    event_id: eventId,
    mission_id: "mission-control-live",
    occurred_at: recordedAt,
    data: {
      type: "evidence_receipt_recorded",
      worker: request.worker,
      receipt_id: eventId,
      producer_id: TASK_CHECKPOINT_VERIFIER_ID,
      producer_role: "VERIFIER",
      evidence_class: "ARTIFACT",
      independence: "INDEPENDENT",
      freshness: "CURRENT",
      exact_candidate_sha256: request.sha256,
      summary,
      refs: [
        "status:STAGE_COMPLETE",
        "next_reasoning_review_required:true",
        `checkpoint_repository:${request.repository}`,
        `checkpoint_path:${request.path}`,
        `checkpoint_commit:${request.commit}`,
        `checkpoint_sha256:${request.sha256}`,
        `checkpoint_base_commit:${baseCommit}`,
        `checkpoint_files_verified:${files.length}`,
      ],
      verified: true,
      changed_path_manifest: null,
    },
  };
}

/** Whether an event is a checkpoint verification Mission Control itself recorded. */
export function isVerifiedTaskCheckpoint(event: StoredEvent): boolean {
  return event.data.type === "evidence_receipt_recorded"
    && event.producerKind === "VERIFIER" && event.producerId === TASK_CHECKPOINT_VERIFIER_ID
    && event.data.producer_id === TASK_CHECKPOINT_VERIFIER_ID && event.data.verified === true
    && event.data.summary.startsWith(`${TASK_CHECKPOINT_SUMMARY_PREFIX}\n`)
    && event.data.refs.includes("status:STAGE_COMPLETE") && event.data.refs.includes("next_reasoning_review_required:true");
}

export interface RegisteredTaskHold {
  /** The supervisor's latest decision for the task, which started no bounded step. */
  decision: StoredEvent;
  /** A checkpoint Mission Control verified after that decision, if one exists (the newest). */
  checkpointAfter: StoredEvent | null;
}

/**
 * A registered task held by its supervisor: the latest supervisor decision for it started no bounded execution and
 * asks the owner nothing, and the task has never had a directive. The task waits for what the decision asked for; a
 * checkpoint verified after the decision is what the fleet watch takes back to the supervisor. A decision that asks the
 * owner to decide is the owner's, not a hold; a task that has had a directive is not treated as held here (a decision
 * may continue a directive without new bounded execution), and keeps the projection's other owner-action rules, unless
 * that directive's Work job expired unrun and the decision answered Mission Control's record of that.
 */
export function registeredTaskHold(events: readonly StoredEvent[]): RegisteredTaskHold | null {
  if (!workerHasOwnerTaskRegistration(events)) return null;
  const decision = events.findLast((event) => event.data.type === "github_decision_receipt_ingested");
  if (!decision || decision.data.type !== "github_decision_receipt_ingested" || decision.data.bounded_execution) return null;
  if (decision.data.owner_action?.kind === "DECISION_REQUIRED") return null;
  // A task that has had a directive is held again only when its latest directive's job expired unrun, Mission Control
  // recorded that, and the supervisor's answer after the record started no new step (lib/work-directive-expiry.ts).
  const latestDirective = events.findLast((event) => event.data.type === "execution_directive_recorded");
  if (latestDirective) {
    const expiryRecord = events.find((event) => isBoundWorkDirectiveExpiry(events, event)
      && (event.data as { receipt_id: string }).receipt_id === workDirectiveExpiryEventId(latestDirective));
    if (!expiryRecord || decision.sequence < expiryRecord.sequence) return null;
  }
  const checkpointAfter = events.findLast((event) => event.sequence > decision.sequence && isVerifiedTaskCheckpoint(event)) ?? null;
  return { decision, checkpointAfter };
}

/** A path inside a repository: relative, with no empty, "." or ".." segment. */
function repositoryPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500 || value.startsWith("/") || value.includes("\\")
    || value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
    || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TaskCheckpointRejectedError("The path must be a relative file path inside the repository.");
  }
  return value;
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const WORKER_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
