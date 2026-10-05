import { canonicalJson, sha256 } from "./canonical";
import { CANONICAL_PROJECT_MANAGER_ID, loadConfiguredSupervisorChats } from "./configured-supervisor-chats";
import { parseGitHubReceiptPolicy, pendingDecisionRequests } from "./github-decision-receipts";
import { evaluateSupervisionAdmission } from "./supervision-admission-runtime";
import type { AuthenticatedProducer } from "./ingestion-auth";
import { projectWorker } from "./projection";
import type { StoredEvent } from "./schema";
import type { JevShadowObservation } from "./jev-shadow";
import { EventStore, type FleetSupervisorWatchRecord, type FleetSupervisorWatchState } from "./store";

export const DEFAULT_FLEET_SUPERVISOR_CADENCE_MS = 3_600_000;
export type FleetSupervisorTrigger =
  | "HEALTHY_ADVANCING" | "STALLED_OR_REGRESSING" | "REASONING_REVIEW_OVERDUE"
  | "WORKER_DIRECTIVE_CONTINUITY_GAP" | "OWNER_ACTION_REQUIRED" | "BLOCKED_EXTERNAL"
  | "TERMINAL" | "MECHANICAL_RECOVERY_ELIGIBLE" | "PROJECT_INTEGRITY_FAILURE";

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
    events: readonly StoredEvent[], chain: { valid: boolean; errors: string[] }, signal?: AbortSignal) => JevShadowObservation | Promise<JevShadowObservation>;
}

export interface FleetSupervisorWatchTiming {
  projectId: string;
  stageMs: { reading_worker_events: number; verifying_chain: number; classifying: number;
    routing_reasoning: number; notifying: number; committing: number; calling_jev: number };
  synchronousMs: number;
  slowestStage: keyof FleetSupervisorWatchTiming["stageMs"];
}

export interface FleetSupervisorTickResult {
  projectId: string;
  decision: FleetSupervisorDecision;
  committed: boolean;
  notificationDisposition: string;
  jevShadow: JevShadowObservation | null;
}

export class FleetSupervisorRuntime {
  private progress = { stage: "selecting", projectId: null as string | null };
  get currentProgress() { return { ...this.progress }; }
  constructor(private readonly store: EventStore, private readonly hooks: FleetSupervisorHooks = {},
    private readonly clock: () => number = () => performance.now()) {}

  async tick(now = new Date().toISOString(), signal?: AbortSignal, onWatchTiming?: (timing: FleetSupervisorWatchTiming) => void,
    onWatchResults?: (results: FleetSupervisorTickResult[]) => void) {
    const results: FleetSupervisorTickResult[] = [];
    if (signal?.aborted) return results;
    this.progress = { stage: "selecting", projectId: null };
    for (const watch of this.store.dueFleetSupervisorWatches(now)) {
      if (signal?.aborted) break;
      const timing: FleetSupervisorWatchTiming = { projectId: watch.projectId,
        stageMs: { reading_worker_events: 0, verifying_chain: 0, classifying: 0, routing_reasoning: 0,
          notifying: 0, committing: 0, calling_jev: 0 }, synchronousMs: 0, slowestStage: "reading_worker_events" };
      let stage: keyof FleetSupervisorWatchTiming["stageMs"] = "reading_worker_events", stageStarted = this.clock();
      const nextStage = (next: typeof stage) => {
        const ended = this.clock(); timing.stageMs[stage] += Math.max(0, ended - stageStarted);
        stage = next; stageStarted = ended;
      };
      const synchronous = <T>(work: () => T): T => {
        const started = this.clock();
        try { return work(); } finally { timing.synchronousMs += Math.max(0, this.clock() - started); }
      };
      this.progress = { stage: "reading worker events", projectId: watch.projectId };
      const events = synchronous(() => this.store.workerEvents(watch.worker));
      nextStage("verifying_chain"); this.progress.stage = "verifying chain";
      const chain = synchronous(() => this.store.verifyChain());
      nextStage("classifying"); this.progress.stage = "classifying";
      const decision = synchronous(() => classifyFleetSupervisorTick(watch, events, chain));
      if (signal?.aborted) break;
      nextStage("routing_reasoning");
      this.progress.stage = "routing reasoning";
      if (decision.mechanicalRecoveryEligible) await synchronous(() => this.hooks.continueMechanical?.(watch, decision, events));
      if (signal?.aborted) break;
      if (decision.reasoningRequired) await synchronous(() => this.hooks.routeReasoning?.(watch, decision, events));
      if (signal?.aborted) break;
      const fingerprint = decision.notifyOwner ? sha256(`${decision.trigger}\n${decision.notificationReason ?? ""}`) : null;
      const duplicate = Boolean(fingerprint && fingerprint === watch.notificationFingerprint);
      const notificationDisposition = decision.notifyOwner
        ? duplicate ? "SUPPRESSED_DUPLICATE" : "OWNER_NOTIFIED"
        : "SUPPRESSED_NOT_ACTIONABLE";
      nextStage("notifying"); this.progress.stage = "notifying";
      if (decision.notifyOwner && !duplicate) await synchronous(() => this.hooks.notifyOwner?.(watch, decision));
      if (signal?.aborted) break;
      nextStage("committing"); this.progress.stage = "committing";
      const committed = synchronous(() => this.store.completeFleetSupervisorTick({
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
      }));
      nextStage("calling_jev");
      let jevShadow: JevShadowObservation | null = null;
      try {
        if (!signal?.aborted) {
          this.progress.stage = "observing Jev";
          jevShadow = await synchronous(() => this.hooks.observeJevShadow?.(watch, decision, events, chain, signal)) ?? null;
        }
      } catch {
        // Shadow evaluation is intentionally non-authoritative and may never fail the fleet tick.
      }
      nextStage("calling_jev");
      timing.slowestStage = (Object.keys(timing.stageMs) as Array<typeof stage>)
        .reduce((slowest, candidate) => timing.stageMs[candidate] > timing.stageMs[slowest] ? candidate : slowest, timing.slowestStage);
      onWatchTiming?.(timing);
      const result = { projectId: watch.projectId, decision, committed, notificationDisposition, jevShadow };
      results.push(result);
      // Publish synchronously before another watch can throw or await a hook.
      onWatchResults?.([result]);
    }
    return results;
  }
}

export function routeFleetSupervisorReasoning(store: EventStore, watch: FleetSupervisorWatchRecord,
  decision: FleetSupervisorDecision, _events: readonly StoredEvent[]) {
  const history = store.workerEvents(watch.worker);
  const pending = pendingDecisionRequests(history).at(-1);
  if (pending) return routeEvent(history, pending.requestId);

  const directory = loadConfiguredSupervisorChats();
  const manager = directory.entries.find((entry) => entry.scope === "PROJECT_MANAGER"
    && entry.supervisorId === CANONICAL_PROJECT_MANAGER_ID);
  if (!manager) throw new Error("Fleet supervision requires the configured Mission Control project-manager route.");
  const policy = parseGitHubReceiptPolicy();
  if (!policy?.requestBound?.enabled) {
    throw new Error("Fleet supervision reasoning requires the configured trusted in-band request-bound receipt policy.");
  }
  const ownerOutcome = history.findLast((event) => event.data.type === "owner_outcome_recorded")?.data;
  if (!ownerOutcome || ownerOutcome.type !== "owner_outcome_recorded") {
    throw new Error("Fleet supervision reasoning requires the current owner-outcome identity.");
  }
  const boundary = reasoningBoundary(history);
  if (!boundary) throw new Error("Fleet supervision reasoning requires a durable decision boundary.");
  const requestId = `fleet-review:${sha256(`${watch.projectId}\n${boundary.eventId}`).slice(0, 32)}`;
  const factualState = canonicalJson(fleetReasoningFacts(decision, history, boundary));
  const evidenceSha256 = sha256(factualState);
  const queuedAt = watch.nextTickAt ?? new Date().toISOString();
  const expiresAt = new Date(Date.parse(queuedAt) + 24 * 60 * 60 * 1000).toISOString();
  const priorDecision = history.findLast((event) => event.data.type === "github_decision_receipt_ingested")?.data;
  const reasoningLane = priorDecision?.type === "github_decision_receipt_ingested"
    ? priorDecision.reasoning_lane
    : "EXTRA_HIGH_DIRECT";
  const evidenceCapsule = { id: `fleet-state:${evidenceSha256.slice(0, 32)}`, sha256: evidenceSha256 };
  const cycle = {
    bindingProtocol: "IN_BAND_REQUEST_BINDING_V1" as const,
    executionContext: { task_id: watch.taskId },
    nonce: `fleet-review-nonce:${sha256(`${requestId}\n${ownerOutcome.owner_outcome_sha256}`).slice(0, 32)}`,
    evidenceCapsule,
    ownerOutcome: {
      id: ownerOutcome.owner_outcome_id,
      epoch: ownerOutcome.epoch,
      sha256: ownerOutcome.owner_outcome_sha256,
    },
    reasoningLane,
    githubReceipt: {
      repository: policy.repository,
      issueNumber: policy.decisionIssueNumber,
      stageIssueNumber: policy.stageIssueNumber,
    },
    expiresAt,
  };
  const producer: AuthenticatedProducer = {
    id: `worker:${watch.worker}`, kind: "WORKER", workerScopes: [watch.worker], taskScopes: [watch.taskId],
  };
  const result = evaluateSupervisionAdmission(watch.worker, producer, {
    request: {
      requestId, action: "ROUTE_INTERNAL_SUPERVISOR", actor: "WORK", sourceReceipt: null,
      boundedExecution: true, taskRequiresExecutionOutsideChat: true, executionScope: "SUPERVISORY_REASONING",
      spend: null,
      internalRoute: {
        destination: "PROJECT_MANAGER_CHAT", destinationChatId: manager.supervisorId,
        standingOwnerAuthorization: true, ownerRelayRequested: false, actionTimeConfirmationRequested: false,
      },
      ownerPolicy: { paidModelInferenceAllowed: false, activeZeroSpendDecisionId: null },
    },
    factualPacket: {
      packetId: `packet:${requestId}`, taskId: watch.taskId,
      exactFactualState: factualState,
      evidenceRefs: [],
      decisionRequested: "Review the exact current worker state and latest execution receipt. Decide whether the owner outcome is satisfied, whether bounded execution may resume under a new source-bound directive, or whether to stop. Do not replay completed work or weaken frozen experiment gates.",
      supervisoryCycle: cycle,
    },
  }, queuedAt, undefined, null, "IN_BAND_REQUEST_BINDING_V1");
  if (!result.routeEnvelope) throw new Error(result.statement);
  const envelope = structuredClone(result.routeEnvelope);
  if (envelope.data.type === "worker_message_recorded") {
    envelope.data.thread_id = `thread:fleet-supervision:${watch.worker}`;
  }
  // The runtime hook argument is intentionally worker-scoped and therefore is
  // never append-validation history. The route above rereads current worker
  // state, while EventStore validates the append against the complete ledger.
  return store.append(envelope, undefined, producer);
}

function routeEvent(events: readonly StoredEvent[], requestId: string): StoredEvent | null {
  return events.findLast((event) => {
    if (event.data.type !== "worker_message_recorded") return false;
    const split = event.data.body.indexOf("\n");
    if (split < 0) return false;
    try {
      const body = JSON.parse(event.data.body.slice(split + 1)) as { requestId?: unknown };
      return body.requestId === requestId;
    } catch { return false; }
  }) ?? null;
}

function reasoningBoundary(events: readonly StoredEvent[]): StoredEvent | null {
  const boundaryTypes = new Set([
    "execution_receipt_recorded", "chatgpt_work_cloud_execution_receipt_recorded",
    "outcome_progress_recorded", "worker_checkpoint_recorded", "execution_directive_recorded",
    "structured_blocker_recorded", "work_queue_published",
  ]);
  return events.findLast((event) => boundaryTypes.has(event.data.type)) ?? null;
}

function fleetReasoningFacts(
  decision: FleetSupervisorDecision,
  events: readonly StoredEvent[],
  boundary: StoredEvent,
) {
  const worker = projectWorker([...events]);
  const queue = events.findLast((event) => event.data.type === "work_queue_published")?.data;
  const outcome = events.findLast((event) => event.data.type === "owner_outcome_recorded")?.data;
  const receipt = events.findLast((event) => event.data.type === "execution_receipt_recorded")?.data;
  const directivePaths = events.flatMap((event) => event.data.type === "execution_directive_recorded"
    ? event.data.allowed_paths
    : []);
  return {
    trigger: decision.trigger,
    trigger_result: decision.result,
    decision_boundary: {
      event_id: boundary.eventId,
      event_type: boundary.data.type,
      occurred_at: boundary.occurredAt,
    },
    task_contract: {
      goal: worker.objective.goal,
      effective_finish_line: worker.objective.effectiveFinishLine,
      source: {
        sha256: worker.objective.taskContractSha256,
        acceptance_criteria: worker.objective.acceptance_criteria,
        allowed_scope: worker.objective.allowed_scope,
        forbidden_scope: worker.objective.forbidden_scope,
      },
    },
    owner_outcome: {
      id: worker.ownerOutcome.id,
      epoch: worker.ownerOutcome.epoch,
      gap_status: outcome?.type === "owner_outcome_recorded" ? outcome.gap_status : "OPEN",
      current_gap: worker.ownerOutcome.currentGap,
      required_outcomes: worker.ownerOutcome.requiredOutcomes,
    },
    queue: queue?.type === "work_queue_published" ? queue.items.map((item) => ({
      item_id: item.item_id,
      title: item.title,
      status: item.status,
      priority: item.priority,
      depends_on: item.depends_on,
    })) : [],
    execution: {
      active_directive_id: worker.executionSupervision.activeDirectiveId,
      codex_execution_state: worker.executionSupervision.codexExecutionState,
      latest_receipt_id: worker.executionSupervision.latestReceiptId,
      receipt_claim: worker.executionSupervision.receiptClaim,
      pending_reasoning_review: worker.executionSupervision.pendingReasoningReview,
      latest_receipt: receipt?.type === "execution_receipt_recorded" ? {
        receipt_id: receipt.receipt_id,
        directive_id: receipt.directive_id,
        stop_trigger_reached: receipt.stop_trigger_reached,
        checks_run: receipt.checks_run,
        measurements: receipt.measurements,
        artifacts_produced: receipt.artifacts_produced,
        deviations: receipt.deviations,
        blockers: receipt.blockers,
        next_reasoning_review_required: receipt.next_reasoning_review_required,
      } : null,
      current_step: worker.currentStep,
      completed_steps: worker.completedSteps,
      next_steps: worker.nextSteps,
      blocker: worker.blocker,
      tests: worker.tests,
      prior_directive_paths: [...new Set(directivePaths)],
    },
    progress: {
      outcome_advancement: worker.progress.outcomeAdvancement,
      strategy_id: worker.progress.strategyId,
      strategy_efficacy: worker.progress.strategyEfficacy,
      latest_evidence: worker.progress.latestEvidence,
      best_evidence: worker.progress.bestEvidence,
      next_decision_trigger: worker.progress.nextDecisionTrigger,
      required_intervention: worker.progress.requiredIntervention,
      same_strategy_continuation_allowed: worker.progress.sameStrategyContinuationAllowed,
    },
  };
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
  const blocker = events.findLast((event) => event.data.type === "structured_blocker_recorded" && event.data.status === "OPEN")?.data;
  if (blocker?.type === "structured_blocker_recorded") {
    if (blocker.required_actor.kind === "OWNER") return decision("OWNER_ACTION_REQUIRED", "An unavoidable owner action is required.", "ACTIVE", false, false, true, blocker.description);
    if (blocker.required_actor.kind === "EXTERNAL") return decision("BLOCKED_EXTERNAL", "Project remains blocked on an external actor; no unauthorized retry occurred.", "ACTIVE", false, false, false, null);
  }
  const worker = projectWorker([...events]);
  if (worker.contractToOwnerAlignment === "SOURCE_MISSING" || worker.progress.outcomeAdvancement === "UNKNOWN") {
    return decision("PROJECT_INTEGRITY_FAILURE", "Project validity is indeterminate; automatic continuation stopped.", "ACTIVE", false, false, true, "Project validity or owner-outcome evidence is INDETERMINATE.");
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
