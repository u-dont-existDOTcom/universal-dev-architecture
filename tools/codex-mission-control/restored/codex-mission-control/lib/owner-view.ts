import type { WorkerState } from "./projection";
import type { OwnerActionObligation } from "./schema";
import type { WorkQueueItemProjection } from "./worker-channel";
import { SUPERVISOR_REQUEST_ORIGINS, SUPERVISOR_REQUEST_STATES } from "./supervisor-activity";

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
// Alarms Mission Control raises by itself when it can't tell whether the owner is needed (effectiveOwnerAction and
// the legacy projection in lib/projection.ts). They keep the projection's fail-closed MANUAL_INTERVENTION_REQUIRED
// state, but the owner view shows them as alarms in plain words, not as decisions: there is nothing to choose, only
// something to look into, usually by asking the task's supervisor.
const OWNER_ALARMS: Record<string, { title: string; explain: (action: OwnerActionObligation, now: Date) => string }> = {
  "OWNER.ACTION_TELEMETRY_MISSING": {
    title: "Not reporting whether it needs you",
    explain: () => "Its worker hasn't reported its next step or whether anything waits on you, so Mission Control can't tell. If this task should be moving, ask its supervisor for a status.",
  },
  "OWNER.ACTION_TELEMETRY_LEGACY": {
    title: "Recorded in an older format",
    explain: () => "This task was recorded before Mission Control tracked what waits on you, so it can't tell. If it matters, ask its supervisor for a status.",
  },
  "OWNER.NONE_NEXT_ACTION_OVERDUE": {
    title: "A worker's step is overdue",
    explain: (action, now) => {
      const step = action.exact_text.replace(/^The non-owner next action is overdue:\s*/, "").replace(/[.\s]+$/, "");
      const due = action.due_at ? ` (due ${timeAgo(action.due_at, now)})` : "";
      return `The next step isn't yours: ${step}${due}. If the delay matters, ask its supervisor why.`;
    },
  },
  "OWNER.NONE_NEXT_ACTOR_NOT_CURRENT": {
    title: "Nobody is on the next step",
    explain: () => "The worker named for the next step is missing, no longer assigned or not reporting. Ask its supervisor to reassign it.",
  },
  "OWNER.ACTIVE_DIRECTIVE_CONFLICT": {
    title: "Conflicting instructions",
    explain: () => "Two active instructions to this worker conflict, so its correction waits until one is withdrawn. Ask its supervisor to settle it.",
  },
  "OWNER.DIRECTIVE_DELIVERY_FAILED_NO_RETRY": {
    title: "An instruction didn't get through",
    explain: () => "Mission Control couldn't deliver an instruction to this task's worker, and nothing is set to try again. Ask its supervisor to resend it or change course.",
  },
};
// Reason codes the projection makes up itself that really are the owner's to act on: they stay decisions.
export const ownerActionReasonCodesForTheOwner = ["OWNER.CORRECTION_BLOCKED_BY_OWNER"];
export const ownerAlarmReasonCodes = Object.keys(OWNER_ALARMS);

export type OwnerAttention = { kind: "decision" } | { kind: "alarm"; title: string; explanation: string } | null;

/** What a task asks of the owner: a real decision or action, an alarm Mission Control raised itself, or nothing. */
export function ownerAttention(worker: WorkerState, now = new Date()): OwnerAttention {
  const action = worker.correction.ownerAction;
  if (worker.correction.ownerActionType === "NONE" || !action || action.status !== "OPEN") return null;
  const alarm = OWNER_ALARMS[action.reason_code];
  return alarm ? { kind: "alarm", title: alarm.title, explanation: alarm.explain(action, now) } : { kind: "decision" };
}

/** "5 minutes ago", "3 hours ago", "2 days ago"; a future time counts as now. */
export function timeAgo(value: string, now: Date = new Date()): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "at an unrecorded time";
  const minutes = Math.max(0, Math.round((now.getTime() - time) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export function workerDisposition(worker: WorkerState): string {
  const attention = ownerAttention(worker);
  if (attention?.kind === "decision") return "Waiting for your decision";
  if (attention?.kind === "alarm") return `Needs a look: ${attention.title.toLowerCase()}`;
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
function fleetSupervisorValid(value: unknown) {
  if (!record(value) || typeof value.activeCount !== "number" || typeof value.defaultCadenceMs !== "number" || !Array.isArray(value.watches)) return false;
  return value.watches.every(watch => strings(watch, ["projectId", "taskId", "worker", "state", "notificationDisposition"])
    && typeof at(watch, "cadenceMs") === "number"
    && ["nextTickAt", "lastTickAt"].every(key => at(watch, key) === null || date(at(watch, key))));
}
// The task cards and the first screen read the supervisor activity; a missing or malformed one is not a usable refresh.
// Missing means unknown, not "never asked", so a snapshot without it (another build's) keeps the last good one.
function supervisorActivityValid(value: unknown): boolean {
  if (!record(value) || typeof value.total !== "number" || typeof value.answered !== "number") return false;
  if (!nullableString(value.lastAnsweredAt) || !nullableString(value.latestConversationUrl) || !nullableString(value.lastSentAt)) return false;
  if (!record(value.states) || !Object.values(value.states).every((state) => (SUPERVISOR_REQUEST_STATES as readonly unknown[]).includes(state))) return false;
  return Array.isArray(value.requests) && value.requests.every((request) => record(request)
    && strings(request, ["requestId", "queuedAt"])
    && (SUPERVISOR_REQUEST_STATES as readonly unknown[]).includes(request.state)
    && (SUPERVISOR_REQUEST_ORIGINS as readonly unknown[]).includes(request.origin)
    && ["supervisorId", "question", "expiresAt", "sentAt", "finishedAt", "answeredAt", "answer", "conversationUrl"].every((key) => nullableString(request[key])));
}
function nullableString(value: unknown): boolean { return value === null || typeof value === "string"; }

function workerValid(value: unknown) {
  if (!strings(value, ["id", "name", "status", "objective.goal", "currentStep", "connection.state", "operatorState.traffic", "operatorState.label", "operatorState.reason", "workerToContractAlignment", "contractToOwnerAlignment", "overallTraffic", "channel.freshness", "correction.ownerActionType", "correction.ownerActionText", "correction.statusLabel", "correction.nextReviewTrigger", "correction.ownerAction.kind", "progress.outcomeAdvancement", "progress.strategyEfficacy", "progress.latestEvidence", "progress.previousEvidence", "progress.bestEvidence", "progress.baselineEvidence", "progress.targetEvidence", "progress.requiredIntervention", "executionSupervision.surface", "executionSupervision.proEscalationState", "executionSupervision.codexExecutionState"])) return false;
  if (!["channel.queue", "channel.blockers", "channel.proposals"].every(path => Array.isArray(at(value, path))) || !stringArray(at(value, "nextSteps")) || !date(at(value, "lastCheckpointAt"))) return false;
  if (!supervisorActivityValid(at(value, "supervisorActivity"))) return false;
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
  if (!fleetSupervisorValid(value.fleetSupervisor)) return false;
  return value.liveSource === null || strings(value.liveSource, ["worker", "summary", "branch", "head", "phase", "observed_at"]);
}
export function validOperatorSnapshot(value: unknown): boolean {
  if (!strings(value, ["overallState", "providerRelayState", "authority.state", "authority.writer", "authority.ledgerIntegrity", "pacing.rateLimitState"])) return false;
  if (!["HEALTHY", "DEGRADED", "UNAVAILABLE"].includes(String(at(value, "overallState")))) return false;
  if (!["configuredMinimumIntervalMs", "minimumObservedIntervalMs", "violationsBelowConfiguredMinimum", "cooldownRemainingMs"].every(key => at(value, `pacing.${key}`) === null || typeof at(value, `pacing.${key}`) === "number")) return false;
  const lastSend = at(value, "pacing.lastProviderSendBoundaryAt");
  if (lastSend !== null && typeof lastSend !== "string") return false;
  const intervals = at(value, "pacing.recentIntervalsMs"); const hosts = at(value, "hosts"); const supervisors = at(value, "supervisors");
  return Array.isArray(intervals) && intervals.every(item => typeof item === "number")
    && Array.isArray(hosts) && hosts.every(host => strings(host, ["role", "label", "relayWorkerState", "browserState", "authorityBindingState"])
      && typeof at(host, "ownedTargetCount") === "number" && typeof at(host, "reportFresh") === "boolean"
      && (at(host, "observedAt") === null || typeof at(host, "observedAt") === "string"))
    // The first screen's supervision line reads the supervisors; a response without them is not a usable refresh.
    && Array.isArray(supervisors) && supervisors.every(supervisor => strings(supervisor, ["supervisorId", "scope", "registrationState", "latestRouteState"])
      && typeof at(supervisor, "registered") === "boolean" && typeof at(supervisor, "reachable") === "boolean");
}
