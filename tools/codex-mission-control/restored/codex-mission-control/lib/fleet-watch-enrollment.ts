import { ContractInvariantError, type EventStore, type FleetSupervisorWatchRecord } from "./store";

// Owner-authorized enrollment of a project in the daemon-owned fleet supervisor.
// Watches are normally created when a project publishes a nonterminal work queue. A project that
// never published one centrally (AskRigor, 2026-09-24) had no way in. Enrollment only binds an
// owner-chosen project id to a worker and task that already exist in the ledger: it cannot invent
// a worker or task, fabricate a worker producer, or publish a queue.
export const FLEET_ENROLL_PROJECT_ID = /^project:[a-z0-9][a-z0-9._-]{0,119}$/;
const WORKER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,179}$/;
const DEFAULT_CADENCE_MS = 3_600_000;
const MIN_CADENCE_MS = 60_000;
const MAX_CADENCE_MS = 604_800_000;

export interface FleetWatchEnrollment {
  worker: string;
  taskId: string;
  cadenceMs: number;
}

export function parseFleetWatchEnrollment(value: unknown): FleetWatchEnrollment | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Enrollment must be a JSON object.";
  const keys = Object.keys(value);
  if (keys.some((key) => !["worker", "taskId", "cadenceMs"].includes(key))) {
    return "Enrollment accepts only worker, taskId and cadenceMs.";
  }
  const { worker, taskId, cadenceMs } = value as Record<string, unknown>;
  if (typeof worker !== "string" || !WORKER_ID.test(worker)) return "Enrollment requires a valid worker id.";
  if (typeof taskId !== "string" || !TASK_ID.test(taskId)) return "Enrollment requires a valid taskId.";
  const cadence = cadenceMs === undefined ? DEFAULT_CADENCE_MS : cadenceMs;
  if (!Number.isInteger(cadence) || (cadence as number) < MIN_CADENCE_MS || (cadence as number) > MAX_CADENCE_MS) {
    return `Enrollment cadenceMs must be an integer from ${MIN_CADENCE_MS} to ${MAX_CADENCE_MS}.`;
  }
  return { worker, taskId, cadenceMs: cadence as number };
}

export function enrollFleetSupervisorWatch(store: EventStore, projectId: string, input: FleetWatchEnrollment,
  now = new Date().toISOString()): { watch: FleetSupervisorWatchRecord; created: boolean } {
  if (!FLEET_ENROLL_PROJECT_ID.test(projectId)) {
    throw new ContractInvariantError("Enrollment project id must look like project:<lowercase-name>.");
  }
  const history = store.workerEvents(input.worker);
  if (history.length === 0) {
    throw new ContractInvariantError(`Worker ${input.worker} has no Mission Control history; enrollment cannot invent a worker.`);
  }
  const knownTasks = new Set(history.map((event) => (event.data as { task_id?: unknown }).task_id)
    .filter((taskId): taskId is string => typeof taskId === "string"));
  if (!knownTasks.has(input.taskId)) {
    throw new ContractInvariantError(`Task ${input.taskId} does not appear in worker ${input.worker}'s history.`);
  }
  const existing = store.fleetSupervisorWatch(projectId);
  if (existing) {
    if (existing.worker === input.worker && existing.taskId === input.taskId) return { watch: existing, created: false };
    throw new ContractInvariantError(`Project ${projectId} is already watched for worker ${existing.worker}.`);
  }
  const other = store.fleetSupervisorWatches().find((watch) => watch.worker === input.worker
    && watch.state !== "TERMINAL" && watch.state !== "DISABLED");
  if (other) {
    throw new ContractInvariantError(`Worker ${input.worker} is already supervised under ${other.projectId}.`);
  }
  return { watch: store.ensureFleetSupervisorWatch(projectId, input.taskId, input.worker, now, input.cadenceMs), created: true };
}
