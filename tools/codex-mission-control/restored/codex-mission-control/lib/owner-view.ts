import type { WorkerState } from "./projection";
import type { WorkQueueItemProjection } from "./worker-channel";

export type SnapshotFailure = { kind: "session" | "network" | "server"; message: string };
export class SnapshotError extends Error {
  constructor(public failure: SnapshotFailure) { super(failure.message); }
}

export async function readDashboardData<T>(url: string, valid: (value: unknown) => boolean, request: typeof fetch = fetch): Promise<T> {
  let response: Response;
  try { response = await request(url, { cache: "no-store", signal: AbortSignal.timeout(45000) }); }
  catch { throw new SnapshotError({ kind: "network", message: "Network request failed or timed out. Check the private connection, then retry." }); }
  if (response.status === 401 || response.status === 403 || response.redirected && new URL(response.url).pathname === "/login") {
    throw new SnapshotError({ kind: "session", message: "Your owner session is unavailable or expired. Reopen Mission Control from the desktop icon to reconnect automatically, then retry." });
  }
  if (!response.ok) throw new SnapshotError({ kind: "server", message: `Server data is unavailable (HTTP ${response.status}). Retry to refresh.` });
  try {
    const value: unknown = await response.json();
    if (!valid(value)) throw new Error("Invalid snapshot");
    return value as T;
  } catch { throw new SnapshotError({ kind: "server", message: "The server did not return usable dashboard data. Retry to refresh." }); }
}
export function snapshotFailure(reason: unknown): SnapshotFailure {
  return reason instanceof SnapshotError ? reason.failure : { kind: "server", message: "Dashboard data is unavailable. Retry to refresh." };
}
export function orderedOpenQueue(queue: WorkQueueItemProjection[]) {
  return queue.filter(item => !["DONE", "CANCELED", "SUPERSEDED"].includes(item.status))
    .sort((a, b) => a.priority.localeCompare(b.priority) || a.ordinal - b.ordinal);
}
export function resolvePrerequisites(item: WorkQueueItemProjection, queue: WorkQueueItemProjection[]) {
  return item.dependsOn.map(id => {
    // IDs are local to a worker's task queue. Never guess a cross-project edge.
    const matches = queue.filter(candidate => candidate.worker === item.worker && candidate.projectId === item.projectId && candidate.taskId === item.taskId && candidate.queueRevisionId === item.queueRevisionId && candidate.itemId === id);
    return { id, item: matches.length === 1 ? matches[0] : null, reason: matches.length > 1 ? "Ambiguous reference" : "Unresolved reference" };
  });
}
export function workerDisposition(worker: WorkerState): string {
  if (worker.correction.ownerActionType !== "NONE") return "Waiting for your action";
  if (worker.executionSupervision.pendingReasoningReview) return "Waiting for review";
  if (worker.blocker || worker.channel.blockers.length || worker.executionSupervision.codexExecutionState === "PARKED") return "Blocked or parked";
  if (worker.connection.state !== "CONNECTED") return "Status needs checking · reporting offline";
  const state = worker.executionSupervision.codexExecutionState;
  return ["RUNNING", "RUNNING_WITH_DIRECTIVE"].includes(state) ? "In progress" : `Recorded execution: ${state.replaceAll("_", " ").toLowerCase()}`;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function at(value: unknown, path: string): unknown { return path.split(".").reduce<unknown>((part, key) => record(part) ? part[key] : undefined, value); }
function strings(value: unknown, paths: string[]) { return paths.every(path => typeof at(value, path) === "string"); }
function stringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === "string"); }
function date(value: unknown) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function queueValid(value: unknown) {
  return strings(value, ["worker", "projectId", "taskId", "queueRevisionId", "directionId", "itemId", "title", "detail", "status"])
    && ["P0", "P1", "P2", "P3"].includes(String(at(value, "priority"))) && typeof at(value, "ordinal") === "number"
    && stringArray(at(value, "dependsOn")) && date(at(value, "updatedAt"));
}
function workerValid(value: unknown) {
  if (!strings(value, ["id", "name", "status", "objective.goal", "currentStep", "connection.state", "operatorState.traffic", "operatorState.label", "operatorState.reason", "workerToContractAlignment", "contractToOwnerAlignment", "overallTraffic", "channel.freshness", "correction.ownerActionType", "correction.ownerActionText", "correction.statusLabel", "correction.nextReviewTrigger", "correction.ownerAction.kind", "progress.outcomeAdvancement", "progress.strategyEfficacy", "progress.latestEvidence", "progress.previousEvidence", "progress.bestEvidence", "progress.baselineEvidence", "progress.targetEvidence", "progress.requiredIntervention", "executionSupervision.surface", "executionSupervision.proEscalationState", "executionSupervision.codexExecutionState"])) return false;
  if (!["channel.queue", "channel.blockers", "channel.proposals"].every(path => Array.isArray(at(value, path))) || !stringArray(at(value, "nextSteps")) || !date(at(value, "lastCheckpointAt"))) return false;
  for (const path of ["primaryProblemSummary", "blocker", "correction.directive", "channel.latestDirectionBody", "executionSupervision.activeDirectiveId"]) { const part = at(value, path); if (part !== null && typeof part !== "string") return false; }
  if (at(value, "correction.ownerAction.kind") === "DECISION_REQUIRED") {
    const action = at(value, "correction.ownerAction");
    if (!strings(action, ["decision_context", "decision_question", "recommendation_option_id", "recommendation_reasoning", "default_if_no_decision", "pro_analysis_ref"])) return false;
    const options = at(action, "options");
    if (!Array.isArray(options) || !options.every(option => strings(option, ["option_id", "label"]) && ["benefits", "drawbacks", "downstream_consequences"].every(path => stringArray(at(option, path))))) return false;
  }
  return true;
}
// Validate the fields consumed by this view before accepting a refresh. An invalid
// response retains the previous snapshot and receives the same actionable error.
export function validTaskSnapshot(value: unknown): boolean {
  if (!record(value) || !date(value.generatedAt) || typeof value.summary !== "string") return false;
  if (!Array.isArray(value.workers) || !value.workers.every(workerValid) || !Array.isArray(value.fleetQueue) || !value.fleetQueue.every(queueValid)) return false;
  if (!["connected", "offlineConfigured", "suppressedFixtureOnly"].every(key => typeof at(value, `connectionSummary.${key}`) === "number")) return false;
  return value.liveSource === null || strings(value.liveSource, ["worker", "summary", "branch", "head", "phase", "observed_at"]);
}
export function validOperatorSnapshot(value: unknown): boolean {
  if (!strings(value, ["overallState", "providerRelayState", "authority.state", "authority.writer", "authority.ledgerIntegrity", "pacing.rateLimitState"])) return false;
  if (!["HEALTHY", "DEGRADED", "UNAVAILABLE"].includes(String(at(value, "overallState")))) return false;
  if (!["configuredMinimumIntervalMs", "minimumObservedIntervalMs", "violationsBelowConfiguredMinimum", "cooldownRemainingMs"].every(key => at(value, `pacing.${key}`) === null || typeof at(value, `pacing.${key}`) === "number")) return false;
  const intervals = at(value, "pacing.recentIntervalsMs"); const hosts = at(value, "hosts");
  return Array.isArray(intervals) && intervals.every(item => typeof item === "number") && Array.isArray(hosts) && hosts.every(host => strings(host, ["role", "label", "relayWorkerState", "browserState", "authorityBindingState"]) && typeof at(host, "ownedTargetCount") === "number");
}
