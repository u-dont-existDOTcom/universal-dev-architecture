import { sha256 } from "./canonical";
import { routeFleetReasoning } from "./fleet-reasoning-route";
import { projectWorker } from "./projection";
import type { StoredEvent } from "./schema";
import type { JevShadowObservation } from "./jev-shadow";
import { EventStore, type FleetSupervisorWatchRecord, type FleetSupervisorWatchState } from "./store";

export const DEFAULT_FLEET_SUPERVISOR_CADENCE_MS = 3_600_000;
export type FleetSupervisorTrigger =
  | "HEALTHY_ADVANCING" | "STALLED_OR_REGRESSING" | "REASONING_REVIEW_OVERDUE"
  | "WORKER_DIRECTIVE_CONTINUITY_GAP" | "OWNER_ACTION_REQUIRED" | "BLOCKED_EXTERNAL"
  | "TERMINAL" | "MECHANICAL_RECOVERY_ELIGIBLE" | "PROJECT_INTEGRITY_FAILURE"
  | "EXECUTION_BLOCKED" | "PROGRESS_OBSERVABILITY_GAP";

export interface FleetSupervisorDecision {
  trigger: FleetSupervisorTrigger;
  result: string;
  state: FleetSupervisorWatchState;
  reasoningRequired: boolean;
  mechanicalRecoveryEligible: boolean;
  notifyOwner: boolean;
  notificationReason: string | null;
}

export interface FleetSupervisorHooks {
  routeReasoning?: (watch: FleetSupervisorWatchRecord, decision: FleetSupervisorDecision, events: readonly StoredEvent[]) => unknown | Promise<unknown>;
  continueMechanical?: (watch: FleetSupervisorWatchRecord, decision: FleetSupervisorDecision, events: readonly StoredEvent[]) => unknown | Promise<unknown>;
  notifyOwner?: (watch: FleetSupervisorWatchRecord, decision: FleetSupervisorDecision) => unknown | Promise<unknown>;
  observeJevShadow?: (watch: FleetSupervisorWatchRecord, decision: FleetSupervisorDecision,
    events: readonly StoredEvent[], chain: { valid: boolean; errors: string[] }) => JevShadowObservation | Promise<JevShadowObservation>;
}

export class FleetSupervisorRuntime {
  constructor(private readonly store: EventStore, private readonly hooks: FleetSupervisorHooks = {}) {}

  async tick(now = new Date().toISOString()) {
    const results: Array<{ projectId: string; decision: FleetSupervisorDecision; committed: boolean;
      notificationDisposition: string; jevShadow: JevShadowObservation | null }> = [];
    for (const watch of this.store.dueFleetSupervisorWatches(now)) {
      const events = this.store.workerEvents(watch.worker);
      const chain = this.store.verifyChain();
      let decision = classifyFleetSupervisorTick(watch, events, chain);
      if (decision.mechanicalRecoveryEligible) await this.hooks.continueMechanical?.(watch, decision, events);
      if (decision.reasoningRequired) {
        try {
          const route = await this.hooks.routeReasoning?.(watch, decision, events);
          const status = route && typeof route === "object" && "status" in route ? String(route.status) : "DELIVERY_UNVERIFIED";
          decision = { ...decision, result: `${decision.result} Routing: ${status}.` };
        } catch {
          // One unavailable route must not abort supervision of independent projects.
          decision = { ...decision, result: "REASONING_ROUTE_UNAVAILABLE: execution remains held; no request delivery or resume is claimed." };
        }
      }
      const fingerprint = decision.notifyOwner ? sha256(`${decision.trigger}\n${decision.notificationReason ?? ""}`) : null;
      const duplicate = Boolean(fingerprint && fingerprint === watch.notificationFingerprint);
      const notificationDisposition = decision.notifyOwner
        ? duplicate ? "SUPPRESSED_DUPLICATE" : "OWNER_NOTIFIED"
        : "SUPPRESSED_NOT_ACTIONABLE";
      if (decision.notifyOwner && !duplicate) await this.hooks.notifyOwner?.(watch, decision);
      const committed = this.store.completeFleetSupervisorTick({
        projectId: watch.projectId,
        dueAt: watch.nextTickAt!,
        tickAt: now,
        trigger: decision.trigger,
        result: decision.result,
        state: decision.state,
        notificationDisposition,
        notificationReason: decision.notificationReason,
        notificationFingerprint: fingerprint,
        notifiedAt: notificationDisposition === "OWNER_NOTIFIED" ? now : null,
      });
      let jevShadow: JevShadowObservation | null = null;
      try {
        jevShadow = await this.hooks.observeJevShadow?.(watch, decision, events, chain) ?? null;
      } catch {
        // Shadow evaluation is intentionally non-authoritative and may never fail the fleet tick.
      }
      results.push({ projectId: watch.projectId, decision, committed, notificationDisposition, jevShadow });
    }
    return results;
  }
}

export function routeFleetSupervisorReasoning(store: EventStore, watch: FleetSupervisorWatchRecord,
  decision: FleetSupervisorDecision, events: readonly StoredEvent[]) {
  return routeFleetReasoning(store, watch, decision, events, watch.nextTickAt ?? new Date().toISOString());
}

export function classifyFleetSupervisorTick(
  watch: FleetSupervisorWatchRecord,
  events: readonly StoredEvent[],
  chain: { valid: boolean; errors: string[] },
): FleetSupervisorDecision {
  if (!chain.valid) return decision("PROJECT_INTEGRITY_FAILURE", "Ledger integrity is invalid; automatic continuation stopped.", "ACTIVE", false, false, true, chain.errors.join("; "));
  const queue = events.findLast((event) => event.data.type === "work_queue_published" && event.data.project_id === watch.projectId)?.data;
  if (queue?.type === "work_queue_published" && queue.items.length > 0
    && queue.items.every((item) => ["DONE", "SUPERSEDED", "CANCELED"].includes(item.status))) {
    return decision("TERMINAL", "Project queue reached a terminal state and left hourly supervision.", "TERMINAL", false, false, true, "Terminal result is ready.");
  }
  const ownerAction = [...events].reverse().find((event) => "owner_action" in event.data && event.data.owner_action.status === "OPEN")?.data;
  if (ownerAction && "owner_action" in ownerAction
    && ["DECISION_REQUIRED", "MANUAL_INTERVENTION_REQUIRED"].includes(ownerAction.owner_action.kind)) {
    return decision("OWNER_ACTION_REQUIRED", "Existing owner-action obligation remains authoritative.", "ACTIVE", false, false, true, ownerAction.owner_action.exact_text);
  }
  const blockers = new Map<string, StoredEvent>();
  for (const event of events) {
    if (event.data.type === "structured_blocker_recorded" && event.worker === watch.worker
      && event.data.task_id === watch.taskId) blockers.set(event.data.blocker_id, event);
  }
  const open = [...blockers.values()].filter(event => event.data.type === "structured_blocker_recorded"
    && event.data.status === "OPEN");
  for (const event of open) {
    const blocker = event.data;
    if (blocker.type !== "structured_blocker_recorded") continue;
    if (blocker.required_actor.kind === "OWNER") return decision("OWNER_ACTION_REQUIRED", "An unavoidable owner action is required.", "ACTIVE", false, false, true, blocker.description);
    if (blocker.required_actor.kind === "EXTERNAL") return decision("BLOCKED_EXTERNAL", "Project remains blocked on an external actor; no unauthorized retry occurred.", "ACTIVE", false, false, false, null);
  }
  const observed = events.findLast(event => event.worker === watch.worker
    && event.data.type === "live_worker_evidence_observed" && event.data.task_id === watch.taskId)?.data;
  if (observed?.type === "live_worker_evidence_observed" && observed.phase === "BLOCKED") {
    return decision("EXECUTION_BLOCKED", "A source-bound runtime blocker requires Chat review; preserve exact-submission recovery fences.", "ACTIVE", true, false, false, null);
  }
  const checkpoint = events.findLast(event => event.worker === watch.worker
    && event.data.type === "worker_checkpoint_recorded")?.data;
  if (open.length || checkpoint?.type === "worker_checkpoint_recorded" && checkpoint.status === "blocked") {
    return decision("EXECUTION_BLOCKED", "Execution is held for source-bound Chat review; no replay or strategy change is authorized.", "ACTIVE", true, false, false, null);
  }
  const worker = projectWorker([...events]);
  if (worker.contractToOwnerAlignment === "SOURCE_MISSING") {
    return decision("PROJECT_INTEGRITY_FAILURE", "Project validity is indeterminate; automatic continuation stopped.", "ACTIVE", false, false, true, "Project validity or owner-outcome evidence is INDETERMINATE.");
  }
  if (worker.progress.outcomeAdvancement === "UNKNOWN") {
    return decision("PROGRESS_OBSERVABILITY_GAP", "Progress evidence is missing; Chat must select a bounded evidence or recovery directive.", "ACTIVE", true, false, false, null);
  }
  const latestDelivery = events.findLast((event) => event.data.type === "outbound_delivery_lifecycle_recorded")?.data;
  if (latestDelivery?.type === "outbound_delivery_lifecycle_recorded" && latestDelivery.status === "DELIVERY_FAILED"
    && /^(PRE_SEND|PROCESS)_/.test(latestDelivery.error_code ?? "")) {
    return decision("MECHANICAL_RECOVERY_ELIGIBLE", "Authorized pre-send/process recovery was resumed through the existing worker channel.", "ACTIVE", false, true, false, null);
  }
  if (worker.executionSupervision.pendingReasoningReview || worker.executionSupervision.reviewFreshness === "OVERDUE") {
    return decision("REASONING_REVIEW_OVERDUE", "Current evidence was routed to the existing reasoning lane.", "ACTIVE", true, false, false, null);
  }
  if (["REGRESSING", "FLAT"].includes(worker.progress.outcomeAdvancement)
    || ["FAILED", "REPLACEMENT_REQUIRED", "EXHAUSTED"].includes(worker.progress.strategyEfficacy)) {
    const ownerRequired = worker.correction.ownerActionType === "DECISION_REQUIRED";
    return decision("STALLED_OR_REGRESSING", "Strategy selection was routed to reasoning; the fleet supervisor authored no replacement.", "ACTIVE", true, false, ownerRequired, ownerRequired ? worker.correction.ownerActionText : null);
  }
  if (!worker.executionSupervision.activeDirectiveId && worker.executionSupervision.codexExecutionState !== "PARKED") {
    return decision("WORKER_DIRECTIVE_CONTINUITY_GAP", "The missing directive/worker continuity was routed to reasoning.", "ACTIVE", true, false, false, null);
  }
  return decision("HEALTHY_ADVANCING", "Healthy project tick completed silently.", "ACTIVE", false, false, false, null);
}

function decision(trigger: FleetSupervisorTrigger, result: string, state: FleetSupervisorWatchState,
  reasoningRequired: boolean, mechanicalRecoveryEligible: boolean, notifyOwner: boolean,
  notificationReason: string | null): FleetSupervisorDecision {
  return { trigger, result, state, reasoningRequired, mechanicalRecoveryEligible, notifyOwner, notificationReason };
}
