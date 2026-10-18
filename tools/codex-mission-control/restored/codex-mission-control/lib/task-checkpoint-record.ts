// The owner's checkpoint-verify action (daemon POST /workers/<worker>/task-checkpoints/verify): Mission Control reads the
// named checkpoint from the task's configured private repository, checks it (lib/task-checkpoint.ts) and records it.
import { workerHasOwnerTaskRegistration } from "./owner-task-source";
import type { StoredEvent } from "./schema";
import type { EventStore } from "./store";
import {
  registeredTaskHold,
  taskCheckpointEventId,
  taskCheckpointEvidenceEnvelope,
  taskCheckpointVerifierProducer,
  TaskCheckpointReadError,
  TaskCheckpointRejectedError,
  validatedCheckpointRequest,
  verifyTaskCheckpoint,
  type RepositoryFileReader,
} from "./task-checkpoint";

export interface TaskCheckpointInput {
  worker: string;
  path: string;
  commit: string;
  sha256: string;
}

export interface TaskCheckpointRecordResult {
  status: number;
  body: Record<string, unknown>;
  event?: StoredEvent;
}

export async function recordTaskCheckpoint(store: EventStore, input: TaskCheckpointInput, options: {
  repositories: ReadonlyMap<string, string>;
  readerFor: (repository: string) => RepositoryFileReader | null;
  now?: () => string;
}): Promise<TaskCheckpointRecordResult> {
  const repository = options.repositories.get(input.worker);
  if (!repository) {
    return { status: 409, body: { error: "No checkpoint repository is configured for this task (MISSION_CONTROL_TASK_CHECKPOINT_REPOSITORIES_JSON)." } };
  }
  let request;
  try {
    request = validatedCheckpointRequest({ worker: input.worker, repository, path: input.path, commit: input.commit, sha256: input.sha256 });
  } catch (error) {
    return { status: 400, body: { error: error instanceof Error ? error.message : "The checkpoint request is invalid." } };
  }
  const events = store.workerEvents(input.worker);
  if (!workerHasOwnerTaskRegistration(events)) {
    return { status: 409, body: { error: "Checkpoints are checked only for a task the owner registered." } };
  }
  const eventId = taskCheckpointEventId(request);
  const existing = store.eventByEventId(eventId);
  if (existing) {
    return { status: 200, body: { status: "TASK_CHECKPOINT_ALREADY_VERIFIED", worker: input.worker, eventId, duplicate: true,
      reviewPending: registeredTaskHold(events)?.checkpointAfter?.eventId === eventId } };
  }
  if (!registeredTaskHold(events)) {
    return { status: 409, body: { error: "Mission Control checks a checkpoint only while the task's supervisor holds it (its latest decision started no step)." } };
  }
  const reader = options.readerFor(repository);
  if (!reader) return { status: 503, body: { error: "No GitHub reader is configured for the checkpoint repository." } };
  let verification;
  try {
    verification = await verifyTaskCheckpoint(request, reader);
  } catch (error) {
    if (error instanceof TaskCheckpointRejectedError) return { status: 409, body: { status: "TASK_CHECKPOINT_REJECTED", error: error.message } };
    if (error instanceof TaskCheckpointReadError) return { status: 502, body: { error: error.message } };
    return { status: 502, body: { error: error instanceof Error ? `GitHub could not be read: ${error.message}` : "GitHub could not be read." } };
  }
  const recordedAt = options.now?.() ?? new Date().toISOString();
  const event = store.append(taskCheckpointEvidenceEnvelope(verification, recordedAt), undefined, taskCheckpointVerifierProducer(input.worker));
  const held = registeredTaskHold(store.workerEvents(input.worker));
  const reviewPending = held?.checkpointAfter?.eventId === event.eventId;
  // A held task's watch checks at once, so its supervisor is asked within a poll, not at its next daily check.
  const watchesDue = reviewPending ? store.bringFleetSupervisorWatchesDue(input.worker, recordedAt) : 0;
  return {
    status: 201,
    event,
    body: {
      status: "TASK_CHECKPOINT_VERIFIED",
      worker: input.worker,
      eventId: event.eventId,
      checkpointSha256: request.sha256,
      commit: request.commit,
      baseCommit: verification.baseCommit,
      filesVerified: verification.files.length,
      duplicate: false,
      // Whether the task is held by its supervisor, so the next fleet check takes this checkpoint to it for review.
      reviewPending,
      watchesDue,
    },
  };
}
