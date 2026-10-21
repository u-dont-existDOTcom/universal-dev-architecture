import { canonicalJson, sha256 } from "./canonical";
import { CANONICAL_PROJECT_MANAGER_ID, loadConfiguredSupervisorChats } from "./configured-supervisor-chats";
import {
  parseGitHubReceiptPolicy,
  pendingDecisionRequests,
  providerInvalidCanonicalDecisionSummary,
  providerSessionSummary,
  reasoningReplacementProofProducerId,
  reasoningReplacementProofSha256,
  reasoningReplacementProofSummary,
  supervisoryRequestRetiredUnsentSummary,
  type ReasoningReplacementProofPayload,
  type ReasoningReplacementReasonCode,
} from "./github-decision-receipts";
import { inBandRequestRoutePrefix } from "./in-band-request-binding";
import { evaluateSupervisionAdmission } from "./supervision-admission-runtime";
import {
  OWNER_TASK_AWAITING_SUPERVISION_REASON, OWNER_TASK_HELD_BY_SUPERVISOR_REASON, workerHasOwnerTaskRegistration,
} from "./owner-task-source";
import { registeredTaskHold, TASK_CHECKPOINT_SUMMARY_PREFIX } from "./task-checkpoint";
import {
  expiredUnrunWorkDirective, isBoundWorkDirectiveExpiry, WORK_DIRECTIVE_EXPIRY_VERIFIER_ID, workDirectiveExpiryEnvelope,
  workDirectiveExpiryProducer, type ExpiredUnrunWorkDirective,
} from "./work-directive-expiry";
import type { AuthenticatedProducer } from "./ingestion-auth";
import { projectWorker } from "./projection";
import type { MissionControlEventV2, StoredEvent } from "./schema";
import type { JevShadowObservation } from "./jev-shadow";
import { EventStore, type FleetSupervisorWatchRecord, type FleetSupervisorWatchState } from "./store";
import {
  FLEET_REQUEST_RETIREMENT_PRODUCER_ID,
  validUnsentSubmissionProof,
  type ProvenUnsentSubmissionState,
} from "./unsent-request-proof";

export type { ProvenUnsentSubmissionState } from "./unsent-request-proof";

export const DEFAULT_FLEET_SUPERVISOR_CADENCE_MS = 3_600_000;
/** The projection's placeholder owner action for a worker that records none (lib/projection.ts effectiveOwnerAction). */
const OWNER_ACTION_TELEMETRY_MISSING_REASON = "OWNER.ACTION_TELEMETRY_MISSING";
export type FleetSupervisorTrigger =
  | "HEALTHY_ADVANCING" | "STALLED_OR_REGRESSING" | "REASONING_REVIEW_OVERDUE"
  | "WORKER_DIRECTIVE_CONTINUITY_GAP" | "OWNER_ACTION_REQUIRED" | "BLOCKED_EXTERNAL"
  | "TERMINAL" | "MECHANICAL_RECOVERY_ELIGIBLE" | "PROJECT_INTEGRITY_FAILURE" | "FIRST_SUPERVISION_REQUIRED"
  | "SUPERVISOR_HOLD" | "CHECKPOINT_REVIEW_REQUIRED" | "WORK_DIRECTIVE_EXPIRED_UNRUN";

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
    events: readonly StoredEvent[], chain: { valid: boolean; errors: string[] }, signal?: AbortSignal) => JevShadowObservation | null | Promise<JevShadowObservation | null>;
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

export interface FleetReasoningReplacementResult {
  event: StoredEvent;
  supersededRequestId: string;
  replacementRequestId: string;
  duplicate: boolean;
}

export interface FleetReasoningUnsentRetirementResult {
  retirementEvent: StoredEvent;
  reviewEvent: StoredEvent;
  retiredRequestId: string;
  reviewRequestId: string;
  duplicate: boolean;
}

export class FleetSupervisorRuntime {
  private progress = { stage: "selecting", projectId: null as string | null };
  get currentProgress() { return { ...this.progress }; }
  constructor(private readonly store: EventStore, private readonly hooks: FleetSupervisorHooks = {},
    private readonly clock: () => number = () => performance.now()) {}

  async tick(now = new Date().toISOString(), signal?: AbortSignal, onWatchTiming?: (timing: FleetSupervisorWatchTiming) => void,
    onWatchResults?: (results: FleetSupervisorTickResult[]) => void) {
    const results: FleetSupervisorTickResult[] = [];
    const failures: Array<{ projectId: string; error: unknown }> = [];
    if (signal?.aborted) return results;
    this.progress = { stage: "selecting", projectId: null };
    for (const watch of this.store.dueFleetSupervisorWatches(now)) {
      if (signal?.aborted) break;
      // One watch's failure must not starve the others: it stays due (its tick is not committed) and the tick still
      // fails after the remaining watches have run, so the loop reports it.
      try {
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
        const decision = synchronous(() => classifyFleetSupervisorTick(watch, events, chain, now));
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
      } catch (error) {
        if (signal?.aborted) break;
        failures.push({ projectId: watch.projectId, error });
      }
    }
    if (failures.length > 0) {
      const first = failures[0]!;
      const message = first.error instanceof Error ? first.error.message : "Unknown fleet supervisor failure";
      throw new Error(failures.length === 1 ? `${first.projectId}: ${message}`
        : `${failures.length} fleet watches failed; first ${first.projectId}: ${message}`, { cause: first.error });
    }
    return results;
  }
}

export function routeFleetSupervisorReasoning(store: EventStore, watch: FleetSupervisorWatchRecord,
  decision: FleetSupervisorDecision, _events: readonly StoredEvent[], submissionProof?: ProvenUnsentSubmissionState) {
  let history = store.workerEvents(watch.worker);
  const queuedAt = new Date().toISOString();
  const pending = pendingDecisionRequests(history).at(-1);
  if (pending && Date.parse(pending.expiresAt) > Date.parse(queuedAt)) return routeEvent(history, pending.requestId);

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
  // An authorized Work job that expired before it ran is checked first, so nothing is recorded for a question that
  // can't be asked; its record is appended only after an expired earlier question has been retired below.
  const expiry = decision.trigger === "WORK_DIRECTIVE_EXPIRED_UNRUN" ? expiredUnrunWorkDirective(history, queuedAt) : null;
  if (decision.trigger === "WORK_DIRECTIVE_EXPIRED_UNRUN" && !expiry) {
    throw new Error("The expired Work job is no longer expired and unrun; nothing was routed.");
  }
  let boundary = reasoningBoundary(history);
  if (!boundary) throw new Error("Fleet supervision reasoning requires a durable decision boundary.");
  if (pending) {
    if (pending.routeSchemaVersion !== 6 || !/^fleet-review:[a-f0-9]{32}$/.test(pending.requestId)
      || pending.taskId !== watch.taskId || !Number.isFinite(Date.parse(pending.expiresAt))) {
      throw new Error("Expired retirement requires the exact V6 fleet reasoning request.");
    }
    if (!submissionProof || !validUnsentSubmissionProof(submissionProof, pending.requestId)) {
      throw new Error("Submission authority did not prove the expired request unsent.");
    }
    const sourceEvent = routeEvent(history, pending.requestId);
    if (!sourceEvent || history.some((event) => event.eventId !== sourceEvent.eventId
      && containsRequestReference(event.data, pending.requestId))) {
      throw new Error("The expired request has durable or ambiguous lifecycle evidence and cannot be retired unsent.");
    }
    const retirementId = `supervisory-request-retired-unsent:${sha256(`${pending.requestId}\n${submissionProof.proofSha256}`).slice(0, 32)}`;
    store.append({
      schema_version: 2, event_id: retirementId, mission_id: "mission-control-live", occurred_at: queuedAt,
      data: {
        type: "evidence_receipt_recorded", worker: watch.worker, receipt_id: retirementId,
        producer_id: FLEET_REQUEST_RETIREMENT_PRODUCER_ID, producer_role: "VERIFIER",
        evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT",
        exact_candidate_sha256: submissionProof.proofSha256, summary: supervisoryRequestRetiredUnsentSummary,
        refs: [`request:${pending.requestId}`, `source_route_event:${sourceEvent.eventId}`,
          `evidence_boundary_event:${boundary.eventId}`, `submission_authority_proof_sha256:${submissionProof.proofSha256}`,
          `submission_authority_pacing_domain:${submissionProof.pacingDomain}`, "retirement_reason:REQUEST_EXPIRED",
          "lifecycle_status:RETIRED_UNSENT", "provider_send_boundary:NOT_CROSSED",
          "submission_authority_queue_records:0", "submission_authority_admission_records:0",
          "provider_transport_evidence_records:0", "historical_request_preserved:true"],
        verified: true, changed_path_manifest: null,
      },
    }, undefined, { id: FLEET_REQUEST_RETIREMENT_PRODUCER_ID, kind: "VERIFIER",
      workerScopes: [watch.worker], taskScopes: [watch.taskId] });
    history = store.workerEvents(watch.worker);
  }
  // The expired Work job is recorded once, by Mission Control itself. That record is the boundary the supervisor is
  // asked at, so the question is a new one, not the answered question before it.
  if (expiry && !expiry.evidence) {
    store.append(workDirectiveExpiryEnvelope(expiry, queuedAt), undefined, workDirectiveExpiryProducer(watch.worker, watch.taskId));
    history = store.workerEvents(watch.worker);
    boundary = reasoningBoundary(history)!;
  }
  // Persisted retirement identity also makes a retry after a failed successor
  // append deterministic, even when the evidence boundary has not changed.
  const expiredRetirement = history.findLast((event) => event.data.type === "evidence_receipt_recorded"
    && event.data.summary === supervisoryRequestRetiredUnsentSummary
    && event.data.producer_id === FLEET_REQUEST_RETIREMENT_PRODUCER_ID
    && event.data.verified && event.data.refs.includes("retirement_reason:REQUEST_EXPIRED")
    && event.data.refs.includes(`evidence_boundary_event:${boundary.eventId}`));
  const requestId = `fleet-review:${sha256(`${watch.projectId}\n${boundary.eventId}${expiredRetirement ? `\n${expiredRetirement.eventId}` : ""}`).slice(0, 32)}`;
  const factualState = fleetReasoningFactualState(decision, history, boundary, watch.taskId);
  const evidenceSha256 = sha256(factualState);
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
      decisionRequested: decision.trigger === "FIRST_SUPERVISION_REQUIRED"
        ? FIRST_SUPERVISION_DECISION_REQUESTED
        : decision.trigger === "CHECKPOINT_REVIEW_REQUIRED"
        ? CHECKPOINT_REVIEW_DECISION_REQUESTED
        : decision.trigger === "WORK_DIRECTIVE_EXPIRED_UNRUN"
        ? WORK_DIRECTIVE_EXPIRED_UNRUN_DECISION_REQUESTED
        : "Review the exact current worker state and latest execution receipt. Decide whether the owner outcome is satisfied, whether bounded execution may resume under a new source-bound directive, or whether to stop. Do not replay completed work or weaken frozen experiment gates.",
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

export function replaceFleetSupervisorReasoningRequest(
  store: EventStore,
  watch: FleetSupervisorWatchRecord,
  input: { requestId: string; failureReceiptSha256: string; reasonCode?: ReasoningReplacementReasonCode },
  now = new Date().toISOString(),
): FleetReasoningReplacementResult {
  if (!/^fleet-review:[a-f0-9]{32}$/.test(input.requestId)) throw new Error("Replacement requires one exact fleet-review request ID.");
  if (!/^[a-f0-9]{64}$/.test(input.failureReceiptSha256)) throw new Error("Replacement requires the sealed failure-receipt SHA-256.");
  const reasonCode = input.reasonCode ?? "PROVIDER_EMPTY_COMPLETION";
  if (reasonCode !== "PROVIDER_EMPTY_COMPLETION" && reasonCode !== "PROVIDER_INVALID_CANONICAL_DECISION") {
    throw new Error("Replacement reason is not authorized.");
  }
  if (!Number.isFinite(Date.parse(now))) throw new Error("Replacement time must be an offset-aware timestamp.");
  const currentWatch = store.fleetSupervisorWatch(watch.projectId);
  if (!currentWatch || currentWatch.worker !== watch.worker || currentWatch.taskId !== watch.taskId || currentWatch.state !== "PAUSED") {
    throw new Error("Reasoning replacement requires the exact current fleet watch to remain paused.");
  }
  const history = store.workerEvents(watch.worker);
  const pending = pendingDecisionRequests(history);
  const admittedReplacement = pending.findLast((request) => request.supersedesRequestId === input.requestId);
  if (admittedReplacement) {
    if (admittedReplacement.replacementFailureReceiptSha256 !== input.failureReceiptSha256
      || admittedReplacement.replacementReasonCode !== reasonCode) {
      throw new Error("The exact request already has a replacement bound to a different failure receipt or reason.");
    }
    const priorReplacement = history.findLast((event) => inBandRouteRoot(event)?.requestId === admittedReplacement.requestId);
    if (!priorReplacement) throw new Error("The admitted replacement lacks its exact durable route event.");
    return {
      event: priorReplacement,
      supersededRequestId: input.requestId,
      replacementRequestId: admittedReplacement.requestId,
      duplicate: true,
    };
  }
  const matches = pending.filter((request) => request.requestId === input.requestId);
  if (matches.length !== 1) throw new Error(`Expected one pending request ${input.requestId}; found ${matches.length}.`);
  const prior = matches[0]!;
  if (prior.routeSchemaVersion !== 6) throw new Error("Only a V6 in-band request may use empty-completion replacement.");
  if (Date.parse(now) <= Date.parse(prior.queuedAt)) throw new Error("Replacement must be queued after the superseded request.");
  const sourceEvent = history.findLast((event) => inBandRouteRoot(event)?.requestId === input.requestId);
  if (!sourceEvent || sourceEvent.data.type !== "worker_message_recorded") throw new Error("The pending request lacks its exact durable route event.");
  const source = inBandRouteRoot(sourceEvent)!;
  const factualPacket = structuredClone(routeRecord(source.factualPacket, "factualPacket"));
  const cycle = routeRecord(factualPacket.supervisoryCycle, "factualPacket.supervisoryCycle");
  const currentOutcome = history.findLast((event) => event.data.type === "owner_outcome_recorded")?.data;
  if (!currentOutcome || currentOutcome.type !== "owner_outcome_recorded"
    || currentOutcome.owner_outcome_id !== prior.ownerOutcome.id
    || currentOutcome.epoch !== prior.ownerOutcome.epoch
    || currentOutcome.owner_outcome_sha256 !== prior.ownerOutcome.sha256) {
    throw new Error("The superseded request no longer matches the current owner outcome.");
  }
  const directory = loadConfiguredSupervisorChats();
  const manager = directory.entries.find((entry) => entry.scope === "PROJECT_MANAGER"
    && entry.supervisorId === prior.supervisorId);
  if (!manager) throw new Error("The superseded request no longer has its configured project-manager route.");
  const policy = parseGitHubReceiptPolicy();
  if (!policy?.requestBound?.enabled
    || policy.repository !== prior.repository
    || policy.decisionIssueNumber !== prior.issueNumber
    || policy.stageIssueNumber !== prior.stageIssueNumber) {
    throw new Error("The superseded request no longer matches the configured receipt policy.");
  }
  const replacementSeed = reasonCode === "PROVIDER_EMPTY_COMPLETION"
    ? `${input.requestId}\n${input.failureReceiptSha256}\nOWNER_EXPLICIT_ONE_REPLACEMENT`
    : `${input.requestId}\n${input.failureReceiptSha256}\n${reasonCode}\nOWNER_EXPLICIT_ONE_REPLACEMENT`;
  const replacementRequestId = `fleet-review:${sha256(replacementSeed).slice(0, 32)}`;
  const invalidFailure = reasonCode === "PROVIDER_INVALID_CANONICAL_DECISION"
    ? invalidCanonicalDecisionFailureSession(store, history, prior, policy, replacementRequestId, input.failureReceiptSha256, now)
    : undefined;
  const nonce = `fleet-review-nonce:${sha256(`${replacementRequestId}\n${prior.ownerOutcome.sha256}`).slice(0, 32)}`;
  const expiresAt = new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString();
  factualPacket.packetId = `packet:${replacementRequestId}`;
  cycle.nonce = nonce;
  cycle.expiresAt = expiresAt;
  const producer: AuthenticatedProducer = {
    id: `worker:${watch.worker}`, kind: "WORKER", workerScopes: [watch.worker], taskScopes: [watch.taskId],
  };
  const result = evaluateSupervisionAdmission(watch.worker, producer, {
    request: {
      requestId: replacementRequestId, action: "ROUTE_INTERNAL_SUPERVISOR", actor: "WORK", sourceReceipt: null,
      boundedExecution: true, taskRequiresExecutionOutsideChat: true, executionScope: "SUPERVISORY_REASONING",
      spend: null,
      internalRoute: {
        destination: "PROJECT_MANAGER_CHAT", destinationChatId: prior.supervisorId,
        standingOwnerAuthorization: true, ownerRelayRequested: false, actionTimeConfirmationRequested: false,
      },
      ownerPolicy: { paidModelInferenceAllowed: false, activeZeroSpendDecisionId: null },
    },
    factualPacket,
  }, now, undefined, null, "IN_BAND_REQUEST_BINDING_V1");
  if (!result.routeEnvelope || result.routeEnvelope.data.type !== "worker_message_recorded") throw new Error(result.statement);
  const envelope = structuredClone(result.routeEnvelope);
  if (envelope.data.type !== "worker_message_recorded") throw new Error("Replacement admission did not produce a worker message.");
  const replacement = inBandRouteRootFromBody(envelope.data.body);
  if (!replacement) throw new Error("Replacement admission did not produce a V6 in-band route.");
  replacement.supersedesRequestId = input.requestId;
  replacement.supersession = {
    schemaVersion: 1,
    reasonCode,
    failureReceiptSha256: input.failureReceiptSha256,
    ...(invalidFailure ? { failureProviderSessionId: invalidFailure.providerSessionId,
      failureCanonicalBodySha256: invalidFailure.canonicalBodySha256,
      proofEventId: invalidFailure.proofEventId,
      proofSha256: invalidFailure.proofSha256 } : {}),
    authorization: "OWNER_EXPLICIT_ONE_REPLACEMENT",
    replacementOrdinal: 1,
  };
  envelope.data.body = `${inBandRequestRoutePrefix}${JSON.stringify(replacement)}`;
  if (envelope.data.body.length > 20_000) throw new Error("The replacement route exceeds the durable message limit.");
  envelope.data.thread_id = `thread:fleet-supervision:${watch.worker}`;
  const event = store.append(envelope, undefined, producer);
  const active = pendingDecisionRequests(store.workerEvents(watch.worker));
  if (active.some((request) => request.requestId === input.requestId)
    || active.filter((request) => request.requestId === replacementRequestId).length !== 1) {
    throw new Error("Replacement append did not atomically fence the old request and admit the new request.");
  }
  return { event, supersededRequestId: input.requestId, replacementRequestId, duplicate: false };
}

function invalidCanonicalDecisionFailureSession(
  store: EventStore, history: StoredEvent[], prior: ReturnType<typeof pendingDecisionRequests>[number],
  policy: NonNullable<ReturnType<typeof parseGitHubReceiptPolicy>>, replacementRequestId: string,
  failureReceiptSha256: string, now: string,
): { providerSessionId: string; canonicalBodySha256: string; proofEventId: string; proofSha256: string } {
  if (history.some((event) => event.data.type === "github_decision_receipt_ingested" && event.data.request_id === prior.requestId)) {
    throw new Error("The superseded request already has an admitted canonical decision.");
  }
  const eventRef = (event: StoredEvent, prefix: string) => {
    const values = event.data.type === "evidence_receipt_recorded"
      ? event.data.refs.filter((ref) => ref.startsWith(prefix)).map((ref) => ref.slice(prefix.length)) : [];
    return values.length === 1 ? values[0]! : null;
  };
  const existing = history.filter((event) => event.data.type === "evidence_receipt_recorded"
    && event.data.verified === true
    && event.data.producer_id === reasoningReplacementProofProducerId
    && event.data.producer_role === "VERIFIER"
    && event.data.summary === reasoningReplacementProofSummary
    && eventRef(event, "request:") === prior.requestId
    && eventRef(event, "replacement_request:") === replacementRequestId
    && eventRef(event, "failure_receipt_sha256:") === failureReceiptSha256
    && eventRef(event, "reason_code:") === "PROVIDER_INVALID_CANONICAL_DECISION");
  if (existing.length > 1) throw new Error("Invalid-canonical replacement has ambiguous durable verifier proofs.");
  if (existing.length === 1) {
    const proof = existing[0]!;
    if (proof.data.type !== "evidence_receipt_recorded") throw new Error("Invalid durable replacement proof.");
    const payload: ReasoningReplacementProofPayload = {
      schemaVersion: 1,
      supersededRequestId: prior.requestId,
      replacementRequestId,
      reasonCode: "PROVIDER_INVALID_CANONICAL_DECISION",
      failureReceiptSha256,
      canonicalBodySha256: eventRef(proof, "canonical_body_sha256:") ?? "",
      providerSessionId: eventRef(proof, "provider_session:") ?? "",
      trustedRelayProducerId: eventRef(proof, "trusted_relay_producer:") ?? "",
      failureEvidenceEventId: eventRef(proof, "failure_evidence_event:") ?? "",
      completeSessionEventId: eventRef(proof, "complete_session_event:") ?? "",
    };
    const proofSha256 = reasoningReplacementProofSha256(payload);
    if (!/^[a-f0-9]{64}$/.test(payload.canonicalBodySha256)
      || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,299}$/.test(payload.providerSessionId)
      || !payload.trustedRelayProducerId || !payload.failureEvidenceEventId || !payload.completeSessionEventId
      || proof.data.exact_candidate_sha256 !== proofSha256
      || proof.data.receipt_id !== proof.eventId
      || eventRef(proof, "authorization:") !== "OWNER_EXPLICIT_ONE_REPLACEMENT"
      || eventRef(proof, "canonical_decision_admitted:") !== "false"
      || eventRef(proof, "historical_request_preserved:") !== "true") {
      throw new Error("Invalid durable replacement proof.");
    }
    return { providerSessionId: payload.providerSessionId, canonicalBodySha256: payload.canonicalBodySha256,
      proofEventId: proof.eventId, proofSha256 };
  }
  const relayIds = policy.requestBound?.enabled ? policy.requestBound.relayProducerIds : [];
  const trusted = (event: StoredEvent) => event.data.type === "evidence_receipt_recorded"
    && event.data.verified === true && event.data.producer_role === "COLLECTOR"
    && relayIds.includes(event.data.producer_id) && event.data.freshness === "CURRENT"
    && Date.parse(event.occurredAt) >= Date.parse(prior.queuedAt);
  const failures = history.filter((event) => trusted(event)
    && event.data.type === "evidence_receipt_recorded"
    && event.data.summary === providerInvalidCanonicalDecisionSummary
    && eventRef(event, "request:") === prior.requestId
    && eventRef(event, "supervisor:") === prior.supervisorId
    && eventRef(event, "failure_receipt_sha256:") === failureReceiptSha256
    && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,299}$/.test(eventRef(event, "provider_session:") ?? "")
    && /^[a-f0-9]{64}$/.test(eventRef(event, "canonical_body_sha256:") ?? "")
    && event.data.refs.includes("classification:PROVIDER_INVALID_CANONICAL_DECISION")
    && event.data.refs.includes("canonical_decision_admitted:false"));
  if (failures.length !== 1 || failures[0]!.data.type !== "evidence_receipt_recorded") {
    throw new Error("Invalid-canonical replacement requires one exact trusted sealed failure receipt.");
  }
  const failureProducerId = failures[0]!.data.producer_id;
  const sessionId = eventRef(failures[0]!, "provider_session:");
  const canonicalBodySha256 = eventRef(failures[0]!, "canonical_body_sha256:");
  if (!sessionId || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,299}$/.test(sessionId)) {
    throw new Error("Invalid-canonical failure evidence lacks one exact provider session.");
  }
  if (!canonicalBodySha256 || !/^[a-f0-9]{64}$/.test(canonicalBodySha256)) {
    throw new Error("Invalid-canonical failure evidence lacks one sealed canonical-body SHA-256.");
  }
  const complete = history.filter((event) => trusted(event)
    && event.data.type === "evidence_receipt_recorded"
    && event.data.producer_id === failureProducerId
    && event.data.summary === providerSessionSummary
    && eventRef(event, "request:") === prior.requestId
    && eventRef(event, "supervisor:") === prior.supervisorId
    && eventRef(event, "provider_session:") === sessionId
    && event.data.refs.includes("lifecycle_status:COMPLETE"));
  if (complete.length !== 1) throw new Error("Invalid-canonical replacement requires one exact trusted COMPLETE provider session for the exact request.");
  const payload: ReasoningReplacementProofPayload = {
    schemaVersion: 1,
    supersededRequestId: prior.requestId,
    replacementRequestId,
    reasonCode: "PROVIDER_INVALID_CANONICAL_DECISION",
    failureReceiptSha256,
    canonicalBodySha256,
    providerSessionId: sessionId,
    trustedRelayProducerId: failureProducerId,
    failureEvidenceEventId: failures[0]!.eventId,
    completeSessionEventId: complete[0]!.eventId,
  };
  const proofSha256 = reasoningReplacementProofSha256(payload);
  const proofEventId = `reasoning-replacement-proof:${proofSha256.slice(0, 32)}`;
  store.append({
    schema_version: 2,
    event_id: proofEventId,
    mission_id: "mission-control-live",
    occurred_at: now,
    data: {
      type: "evidence_receipt_recorded",
      worker: prior.worker,
      receipt_id: proofEventId,
      producer_id: reasoningReplacementProofProducerId,
      producer_role: "VERIFIER",
      evidence_class: "ARTIFACT",
      independence: "INDEPENDENT",
      freshness: "CURRENT",
      exact_candidate_sha256: proofSha256,
      summary: reasoningReplacementProofSummary,
      refs: [
        `request:${prior.requestId}`,
        `replacement_request:${replacementRequestId}`,
        "reason_code:PROVIDER_INVALID_CANONICAL_DECISION",
        `failure_receipt_sha256:${failureReceiptSha256}`,
        `canonical_body_sha256:${canonicalBodySha256}`,
        `provider_session:${sessionId}`,
        `trusted_relay_producer:${failureProducerId}`,
        `failure_evidence_event:${failures[0]!.eventId}`,
        `complete_session_event:${complete[0]!.eventId}`,
        "authorization:OWNER_EXPLICIT_ONE_REPLACEMENT",
        "canonical_decision_admitted:false",
        "historical_request_preserved:true",
      ],
      verified: true,
      changed_path_manifest: null,
    },
  }, undefined, {
    id: reasoningReplacementProofProducerId,
    kind: "VERIFIER",
    workerScopes: [prior.worker],
    taskScopes: [prior.taskId],
  });
  return { providerSessionId: sessionId, canonicalBodySha256, proofEventId, proofSha256 };
}

export function retireUnsentFleetSupervisorReasoningRequest(
  store: EventStore,
  watch: FleetSupervisorWatchRecord,
  input: { requestId: string; evidenceEventId: string },
  submissionProof: ProvenUnsentSubmissionState,
  now = new Date().toISOString(),
): FleetReasoningUnsentRetirementResult {
  if (!/^fleet-review:[a-f0-9]{32}$/.test(input.requestId)) {
    throw new Error("Unsent retirement requires one exact fleet-review request ID.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,179}$/.test(input.evidenceEventId)) {
    throw new Error("Unsent retirement requires one exact evidence event ID.");
  }
  if (!Number.isFinite(Date.parse(now))) throw new Error("Unsent retirement time must be an offset-aware timestamp.");
  if (watch.state !== "PAUSED") throw new Error("Unsent retirement requires the exact fleet watch to remain paused.");
  if (!validUnsentSubmissionProof(submissionProof, input.requestId)) {
    throw new Error("Submission authority did not prove the exact request unsent.");
  }

  const history = store.workerEvents(watch.worker);
  const sourceEvent = routeEvent(history, input.requestId);
  if (!sourceEvent || sourceEvent.data.type !== "worker_message_recorded") {
    throw new Error("The exact stale request route is missing.");
  }
  const sourceRoot = inBandRouteRoot(sourceEvent);
  if (!sourceRoot || sourceRoot.schemaVersion !== 6 || sourceRoot.requestId !== input.requestId) {
    throw new Error("Only one exact V6 fleet reasoning request may be retired unsent.");
  }
  const evidenceEvent = store.eventByEventId(input.evidenceEventId);
  if (!evidenceEvent || evidenceEvent.worker !== watch.worker || evidenceEvent.sequence <= sourceEvent.sequence
    || evidenceEvent.data.type !== "evidence_receipt_recorded" || evidenceEvent.data.verified !== true
    || !evidenceEvent.data.refs.includes("status:STAGE_COMPLETE")
    || !evidenceEvent.data.refs.includes("next_reasoning_review_required:true")
    || !evidenceEvent.data.exact_candidate_sha256
    || !/^[a-f0-9]{64}$/.test(evidenceEvent.data.exact_candidate_sha256)) {
    throw new Error("The requested current evidence boundary is not a later verified completed stage requiring reasoning review.");
  }
  const currentBoundary = reasoningBoundary(history);
  if (!currentBoundary || currentBoundary.eventId !== evidenceEvent.eventId) {
    throw new Error("The requested evidence event is not the exact current reasoning boundary.");
  }

  const existingRetirement = history.findLast((event) => event.data.type === "evidence_receipt_recorded"
    && event.data.summary === supervisoryRequestRetiredUnsentSummary
    && event.data.producer_id === FLEET_REQUEST_RETIREMENT_PRODUCER_ID
    && event.data.producer_role === "VERIFIER"
    && event.data.refs.includes(`request:${input.requestId}`));
  const otherRequestEvidence = history.filter((event) => event.eventId !== sourceEvent.eventId
    && event.eventId !== existingRetirement?.eventId
    && containsRequestReference(event.data, input.requestId));
  if (otherRequestEvidence.length > 0) {
    throw new Error("The request has durable send, delivery, response, decision, or ambiguous lifecycle evidence and cannot be retired unsent.");
  }

  const retirementHash = sha256(`${input.requestId}\n${input.evidenceEventId}\n${submissionProof.proofSha256}`);
  const retirementEvent = existingRetirement ?? store.append({
    schema_version: 2,
    event_id: `supervisory-request-retired-unsent:${retirementHash.slice(0, 32)}`,
    mission_id: "mission-control-live",
    occurred_at: now,
    data: {
      type: "evidence_receipt_recorded",
      worker: watch.worker,
      receipt_id: `supervisory-request-retired-unsent:${retirementHash.slice(0, 32)}`,
      producer_id: FLEET_REQUEST_RETIREMENT_PRODUCER_ID,
      producer_role: "VERIFIER",
      evidence_class: "ARTIFACT",
      independence: "INDEPENDENT",
      freshness: "CURRENT",
      exact_candidate_sha256: submissionProof.proofSha256,
      summary: supervisoryRequestRetiredUnsentSummary,
      refs: [
        `request:${input.requestId}`,
        `source_route_event:${sourceEvent.eventId}`,
        `evidence_boundary_event:${evidenceEvent.eventId}`,
        `evidence_boundary_sequence:${evidenceEvent.sequence}`,
        `submission_authority_proof_sha256:${submissionProof.proofSha256}`,
        `submission_authority_pacing_domain:${submissionProof.pacingDomain}`,
        "lifecycle_status:RETIRED_UNSENT",
        "provider_send_boundary:NOT_CROSSED",
        "submission_authority_queue_records:0",
        "submission_authority_admission_records:0",
        "provider_transport_evidence_records:0",
        "historical_request_preserved:true",
      ],
      verified: true,
      changed_path_manifest: null,
    },
  }, undefined, {
    id: FLEET_REQUEST_RETIREMENT_PRODUCER_ID,
    kind: "VERIFIER",
    workerScopes: [watch.worker],
    taskScopes: [watch.taskId],
  });

  const pendingAfterRetirement = pendingDecisionRequests(store.workerEvents(watch.worker));
  const unrelatedPending = pendingAfterRetirement.filter((request) => request.requestId !== input.requestId);
  if (pendingAfterRetirement.some((request) => request.requestId === input.requestId) || unrelatedPending.length > 1) {
    throw new Error("Unsent retirement did not leave one unambiguous reasoning queue position.");
  }
  const reviewEvent = unrelatedPending.length === 1
    ? routeEvent(store.workerEvents(watch.worker), unrelatedPending[0]!.requestId)
    : routeFleetSupervisorReasoning(store, watch, {
      trigger: "REASONING_REVIEW_OVERDUE",
      result: "Current sealed execution evidence was routed to the existing reasoning lane after proven-unsent retirement.",
      state: "PAUSED",
      reasoningRequired: true,
      mechanicalRecoveryEligible: false,
      notifyOwner: false,
      notificationReason: null,
    }, store.workerEvents(watch.worker));
  if (!reviewEvent || reviewEvent.data.type !== "worker_message_recorded") {
    throw new Error("Unsent retirement did not produce one current reasoning review route.");
  }
  const reviewRoot = inBandRouteRoot(reviewEvent);
  const expectedReviewRequestId = `fleet-review:${sha256(`${watch.projectId}\n${evidenceEvent.eventId}`).slice(0, 32)}`;
  if (!reviewRoot || reviewRoot.requestId !== expectedReviewRequestId) {
    throw new Error("The new reasoning review is not bound to the exact current evidence boundary.");
  }
  const active = pendingDecisionRequests(store.workerEvents(watch.worker));
  if (active.length !== 1 || active[0]!.requestId !== expectedReviewRequestId) {
    throw new Error("Unsent retirement did not leave exactly one current reasoning review.");
  }
  return {
    retirementEvent,
    reviewEvent,
    retiredRequestId: input.requestId,
    reviewRequestId: expectedReviewRequestId,
    duplicate: Boolean(existingRetirement),
  };
}

function inBandRouteRoot(event: StoredEvent): Record<string, unknown> | null {
  return event.data.type === "worker_message_recorded" ? inBandRouteRootFromBody(event.data.body) : null;
}

function inBandRouteRootFromBody(body: string): Record<string, unknown> | null {
  if (!body.startsWith(inBandRequestRoutePrefix)) return null;
  try {
    const value: unknown = JSON.parse(body.slice(inBandRequestRoutePrefix.length));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function routeRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

function containsExactString(value: unknown, expected: string): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((item) => containsExactString(item, expected));
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((item) => containsExactString(item, expected));
}

function containsRequestReference(value: unknown, requestId: string): boolean {
  if (containsExactString(value, requestId)) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const refs = (value as Record<string, unknown>).refs;
  return Array.isArray(refs) && refs.includes(`request:${requestId}`);
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
  // A task the owner registered has none of those before its first supervisor decision; its registered contract is
  // the boundary the first question is asked at (PR #394's registration; the store keeps that contract unchanged).
  return events.findLast((event) => boundaryTypes.has(event.data.type) || isReviewBoundaryEvidence(event)
    || isBoundWorkDirectiveExpiry(events, event))
    ?? (workerHasOwnerTaskRegistration(events) ? events.findLast((event) => event.data.type === "task_contract_recorded") ?? null : null);
}

/** What the first question to a registered task's supervisor asks: the first bounded step within the owner's contract.
 * Native ChatGPT Work is requested only for collection Chat can't complete reliably, and only where the contract allows
 * it (#385: Extra High chats reason and plan; Work and Codex are bounded executors). */
export const FIRST_SUPERVISION_DECISION_REQUESTED = "This task was registered by its owner and no work has started. The owner's "
  + "exact goal, allowed scope, must-never limits and finish line are the task contract in the factual state. Decide the "
  + "first bounded step toward the owner outcome within that allowed scope and those limits, or say what blocks starting. "
  + "If the step needs browser navigation, collection or extraction that Chat cannot complete reliably, and the contract's "
  + "allowed scope includes ChatGPT Work, the bounded request requires native ChatGPT Work: set execution_surface to "
  + "CHATGPT_WORK_CLOUD. A task registered on the form may have no Codex executor, so don't choose CODEX unless the "
  + "contract names it. Do not weaken the contract, spend money, or publish anything.";

/** What the question after a hold asks, once Mission Control has verified a checkpoint (lib/task-checkpoint.ts): review it
 * against the decision that held the task, then hold again with what is missing or decide the first bounded step. */
export const CHECKPOINT_REVIEW_DECISION_REQUESTED = "Your latest decision for this task held it until a checkpoint existed; "
  + "that decision is held_by_decision in the factual state. A checkpoint has since been recorded: it is "
  + "latest_verified_sealed_evidence. Mission Control read it from the task's private repository at the exact commit "
  + "named and checked the SHA-256 of the checkpoint and of every file it lists; it did not check what the checkpoint "
  + "says. Review it against what your decision asked for. If anything is still missing or wrong, say exactly what, and "
  + "hold again. Otherwise decide the first bounded step toward the owner outcome within the contract's allowed scope "
  + "and must-never limits. If that step needs browser navigation, collection or extraction that Chat cannot complete "
  + "reliably, and the contract's allowed scope includes ChatGPT Work, set execution_surface to CHATGPT_WORK_CLOUD. "
  + "Do not weaken the contract, spend money, or publish anything.";

/** What the question after an authorized Work job expired unrun asks (lib/work-directive-expiry.ts): authorize it again
 * with a new deadline, change it, or stop. Mission Control's record of the expiry is expired_work_job in the state. */
export const WORK_DIRECTIVE_EXPIRED_UNRUN_DECISION_REQUESTED = "This task's latest supervisor decision authorized one bounded "
  + "native ChatGPT Work job. Its deadline passed before the job ran: Mission Control's own record of that is "
  + "expired_work_job in the factual state, and the job as it was authorized is expired_work_job.authorized_job."
  + "bounded_execution. Nothing was sent to ChatGPT Work for it, and Mission Control will not start that job now. Decide "
  + "whether to authorize the same bounded job again with a new deadline, change it, or stop or hold the task; say what "
  + "blocks it if anything does. Keep every limit of the authorized job unless you say why it changes. If "
  + "authorized_job.provenance.prompt_clipped is true, the prompt shown was cut to fit this question: write the prompt "
  + "of any job you authorize out in full. Every field listed in clipped_to_fit was also cut to fit this question (a field "
  + "outside authorized_job only in what is shown here): write out in full every field of a job you authorize. Do not "
  + "weaken the contract, spend money, or publish anything.";

function isReviewBoundaryEvidence(event: StoredEvent) {
  return event.data.type === "evidence_receipt_recorded"
    && event.data.verified === true
    && Boolean(event.data.exact_candidate_sha256)
    && event.data.refs.includes("status:STAGE_COMPLETE")
    && event.data.refs.includes("next_reasoning_review_required:true");
}

/** The longest factual state Mission Control's supervision admission accepts (`factualPacket.exactFactualState`). */
export const FLEET_FACTUAL_STATE_LIMIT = 12_000;
/** At most this many of the task's recorded supervisor decisions travel in each question's hand-off. */
export const FLEET_SUPERVISION_HISTORY_DECISIONS = 3;

/**
 * The exact factual state of a fleet supervisor question: the task's current state, plus what its supervisor decided
 * the last few times it was asked under the current owner outcome. Every question opens a fresh ChatGPT chat, so this
 * history is the context the supervisor keeps from one question to the next. Decisions made under an earlier owner
 * outcome are only counted: the owner replaced that outcome, so they are not current direction. Older decisions are
 * left out first, and long fields are clipped, so the state stays within the admission's limit; when the current
 * state leaves no room for a history at all, it goes without one, exactly as before.
 */
export function fleetReasoningFactualState(
  decision: FleetSupervisorDecision,
  events: readonly StoredEvent[],
  boundary: StoredEvent,
  taskId: string,
  limit = FLEET_FACTUAL_STATE_LIMIT,
): string {
  const facts = fleetReasoningFacts(decision, events, boundary);
  const { decisions, supersededOutcomeDecisions } = supervisionHistory(events, taskId);
  for (let listed = Math.min(FLEET_SUPERVISION_HISTORY_DECISIONS, decisions.length); listed >= 0; listed -= 1) {
    const state = canonicalJson({
      ...facts,
      supervision_history: {
        about: "This task's supervisor decisions under the current owner outcome, newest first. Earlier ones are counted, not listed; long fields are clipped. Decisions made under an earlier owner outcome are only counted, because the owner replaced that outcome.",
        recorded_decisions: decisions.length,
        superseded_outcome_decisions: supersededOutcomeDecisions,
        decisions: decisions.slice(0, listed),
      },
    });
    if (state.length <= limit) return state;
  }
  const expiredJob = facts.expired_work_job?.authorized_job;
  if (expiredJob) {
    // An expired job that doesn't fit, even without a history: its prompt is shortened first, to no less than 500
    // characters.
    const full = expiredJob.provenance.prompt_length;
    for (let promptLimit = Math.max(500, full - 500); ; promptLimit = Math.max(500, promptLimit - 500)) {
      const state = canonicalJson(fleetReasoningFacts(decision, events, boundary, promptLimit));
      if (state.length <= limit) return state;
      if (promptLimit === 500) break;
    }
    // A supervisor's job has many long fields besides its prompt (21 Oct 2026: the Atlas task's job didn't fit with its
    // prompt shortened, so its supervisor wasn't asked). Then all the job's long text, its prompt included, is shortened
    // evenly, and only then any other long text in the state; every shortened field is named in clipped_to_fit.
    return shortenedToFit(facts, limit, EXPIRED_JOB_PATH, (state, names) => {
      if (!names.includes([...EXPIRED_JOB_PATH, "prompt"].join("."))) return;
      const job = (state.expired_work_job as { authorized_job: { provenance: { prompt_clipped: boolean } } }).authorized_job;
      job.provenance.prompt_clipped = true;
    });
  }
  return fittedCheckpointReview(facts, limit) ?? canonicalJson(facts);
}

/** Text the expiry question may shorten is never cut below these lengths: a prompt to 500 characters, anything else to
 * 300. Identifiers, digests, times, references, paths, commands, schemas and the job's and contract's limits (its
 * allowed and forbidden lists) are never shortened: the supervisor keeps every limit of the job. */
const SHORTENED_PROMPT_FLOOR = 500;
const SHORTENED_TEXT_FLOOR = 300;
const UNSHORTENED_KEYS = new RegExp("^(trigger|trigger_result|workspace|output_schema|depends_on|policyRef|routingPolicyBaseCommit)$"
  + "|(^|_)(id|ids|ref|refs|sha256|at|deadline|schema_version|surface|status|kind|type|path|paths|commands)$"
  + "|^(allowed|forbidden)_");
const EXPIRED_JOB_PATH = ["expired_work_job", "authorized_job", "bounded_execution"] as const;

function shortenedFloor(path: readonly (string | number)[]): number {
  return path.at(-1) === "prompt" ? SHORTENED_PROMPT_FLOOR : SHORTENED_TEXT_FLOOR;
}

/** The state, shortened until it fits: first the text within `first` (a path into the state), then any text. Within each
 * scope every text longer than one common cap is cut to that cap (never below its floor), and the cap is the largest
 * that fits, so long fields are shortened evenly rather than one at a time. The state then names the shortened fields
 * in clipped_to_fit (a list's items under the list's name); a field is cut only when that saves more than naming it
 * costs, so a lower cap never makes the state longer. `marked` records a cut in the state itself (prompt_clipped). If
 * the floors don't fit, the state is returned too long, and the caller tells the owner instead of asking. */
function shortenedToFit(facts: object, limit: number, first: readonly string[],
  marked: (state: Record<string, unknown>, names: readonly string[]) => void): string {
  type Leaf = { path: (string | number)[]; length: number };
  const leaves = (value: unknown, path: (string | number)[], out: Leaf[]): Leaf[] => {
    if (typeof value === "string") {
      if (value.length > shortenedFloor(path)) out.push({ path, length: value.length });
    } else if (Array.isArray(value)) {
      if (!UNSHORTENED_KEYS.test(String(path.at(-1) ?? ""))) value.forEach((item, index) => leaves(item, [...path, index], out));
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) if (!UNSHORTENED_KEYS.test(key)) leaves(child, [...path, key], out);
    }
    return out;
  };
  // A field's name: its path, or for a list's items the list's path.
  const nameOf = (path: readonly (string | number)[]) => {
    const index = path.findIndex((key) => typeof key === "number");
    return (index < 0 ? path : path.slice(0, index)).join(".");
  };
  const render = (state: Record<string, unknown>, clipped: readonly string[]) =>
    canonicalJson(clipped.length > 0 ? { ...state, clipped_to_fit: clipped } : state);
  let state = JSON.parse(canonicalJson(facts)) as Record<string, unknown>;
  let clipped: string[] = [];
  let rendered = render(state, clipped);
  if (rendered.length <= limit) return rendered;
  const scopes: (readonly string[])[] = [first, []];
  for (const scope of scopes) {
    const groups = new Map<string, Leaf[]>();
    for (const leaf of leaves(state, [], [])) {
      if (!scope.every((key, index) => leaf.path[index] === key)) continue;
      const name = nameOf(leaf.path);
      groups.set(name, [...(groups.get(name) ?? []), leaf]);
    }
    if (groups.size === 0) continue;
    const attempt = (cap: number) => {
      const copy = JSON.parse(canonicalJson(state)) as Record<string, unknown>;
      const names = [...clipped];
      for (const [name, group] of groups) {
        const saved = group.reduce((sum, leaf) => sum + Math.max(0, leaf.length - Math.max(shortenedFloor(leaf.path), cap)), 0);
        // A new name costs its quoted length and a comma in the state.
        if (saved === 0 || (!names.includes(name) && saved <= name.length + 3)) continue;
        for (const leaf of group) {
          const target = Math.max(shortenedFloor(leaf.path), cap);
          if (leaf.length <= target) continue;
          const parent = leaf.path.slice(0, -1).reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], copy) as Record<string | number, unknown>;
          const key = leaf.path.at(-1)!;
          parent[key] = clip(parent[key] as string, target);
        }
        if (!names.includes(name)) names.push(name);
      }
      if (names.length > clipped.length) marked(copy, names);
      return { copy, names, text: render(copy, names) };
    };
    let low = SHORTENED_TEXT_FLOOR;
    let high = Math.max(...[...groups.values()].flat().map((leaf) => leaf.length));
    let best = attempt(low);
    if (best.text.length > limit) {
      // Even at the floors this scope doesn't fit: keep it there and shorten the next scope too.
      ({ copy: state, names: clipped, text: rendered } = best);
      continue;
    }
    while (low < high) {
      const cap = Math.ceil((low + high) / 2);
      const tried = attempt(cap);
      if (tried.text.length <= limit) { low = cap; best = tried; } else high = cap - 1;
    }
    return best.text;
  }
  return rendered;
}

/**
 * A checkpoint review that doesn't fit even without a history: its two long texts, the verified checkpoint's summary
 * and the decision that held the task, are shortened (each to no less than 500 characters) until the state fits.
 * Nothing else is ever shortened here; a state that still doesn't fit is returned as it is, and admission refuses it.
 */
function fittedCheckpointReview(facts: ReturnType<typeof fleetReasoningFacts>, limit: number): string | null {
  const evidence = facts.execution.latest_verified_sealed_evidence;
  const checkpoint = evidence?.summary.startsWith(`${TASK_CHECKPOINT_SUMMARY_PREFIX}\n`) ? evidence : null;
  const held = facts.held_by_decision;
  if (!checkpoint && !held) return null;
  let summary = checkpoint?.summary ?? null;
  let heldText = held?.exact_text ?? null;
  const render = () => canonicalJson({
    ...facts,
    execution: { ...facts.execution, latest_verified_sealed_evidence: checkpoint ? { ...checkpoint, summary } : evidence },
    ...(held ? { held_by_decision: { ...held, exact_text: heldText } } : {}),
  });
  let state = render();
  for (let round = 0; state.length > limit && round < 20; round += 1) {
    const over = state.length - limit + 20;
    if (summary !== null && summary.length > 500) summary = clip(summary, Math.max(500, summary.length - over));
    else if (heldText !== null && heldText.length > 500) heldText = clip(heldText, Math.max(500, heldText.length - over));
    else break;
    state = render();
  }
  return state;
}

/**
 * The task's recorded supervisor decisions under the current owner outcome (the latest recorded outcome's id, epoch
 * and hash), newest first: what was decided and why, in clipped form; and how many were made under an earlier one.
 */
function supervisionHistory(events: readonly StoredEvent[], taskId: string) {
  const outcome = events.findLast((event) => event.data.type === "owner_outcome_recorded")?.data;
  const taskDecisions = [...events].sort((left, right) => right.sequence - left.sequence)
    .flatMap((event) => event.data.type === "github_decision_receipt_ingested" && event.data.task_id === taskId
      ? [{ event, data: event.data }] : []);
  const current = taskDecisions.filter(({ data }) => outcome?.type === "owner_outcome_recorded"
    && data.owner_outcome_id === outcome.owner_outcome_id && data.owner_outcome_epoch === outcome.epoch
    && data.owner_outcome_sha256 === outcome.owner_outcome_sha256);
  const decisions = current.map(({ event, data }) => {
    const execution = data.bounded_execution;
    const ownerAction = data.owner_action;
    return {
      request_id: data.request_id,
      recorded_at: event.occurredAt,
      reasoning_lane: data.reasoning_lane,
      strategy_id: execution?.strategy_id ?? null,
      execution_objective: clip(execution?.execution_objective, 400),
      reasoning_summary: clip(execution?.reasoning_summary, 800),
      next_decision_changing_evidence: clip(execution?.next_decision_changing_evidence, 300),
      owner_question: ownerAction?.kind === "DECISION_REQUIRED" ? clip(ownerAction.question, 300) : null,
      decision_excerpt: execution ? null : clip(data.decision_block.exact_text, 600),
    };
  });
  return { decisions, supersededOutcomeDecisions: taskDecisions.length - current.length };
}

/** The text cut to at most `limit` characters (whole code points), with an ellipsis when cut. */
function clip(text: string | null | undefined, limit: number): string | null {
  if (typeof text !== "string") return null;
  if (text.length <= limit) return text;
  let cut = "";
  for (const character of text) {
    if (cut.length + character.length > limit - 1) break;
    cut += character;
  }
  return `${cut}…`;
}

/** The Work job an expiry record names, as its supervisor authorized it: its bounded execution in full, and where it came
 * from. The prompt travels whole unless the question can't fit; then it is cut (to no less than 500 characters) and
 * marked so. Every question opens a fresh chat, so this is the only place the supervisor sees the job. */
function authorizedJob(events: readonly StoredEvent[], expiryEvidence: StoredEvent, promptLimit: number) {
  if (expiryEvidence.data.type !== "evidence_receipt_recorded") return null;
  const ref = expiryEvidence.data.refs.find((item) => item.startsWith("directive_event:"));
  const directive = ref ? events.find((event) => event.eventId === ref.slice("directive_event:".length))?.data : undefined;
  if (directive?.type !== "execution_directive_recorded") return null;
  const receipt = events.find((event) => event.eventId === directive.validated_decision_proof?.receipt_event_id)?.data;
  if (receipt?.type !== "github_decision_receipt_ingested" || !receipt.bounded_execution) return null;
  const prompt = receipt.bounded_execution.prompt;
  const clipped = prompt.length > promptLimit;
  return {
    // The job exactly as authorized, in the bounded-execution shape, so it can be authorized again as it stands.
    bounded_execution: { ...receipt.bounded_execution, prompt: clipped ? clip(prompt, promptLimit) : prompt },
    provenance: {
      decision_request_id: receipt.request_id,
      decision_id: receipt.decision_block.decision_id,
      bounded_execution_sha256: receipt.bounded_execution_sha256 ?? null,
      prompt_sha256: sha256(prompt),
      prompt_length: prompt.length,
      prompt_clipped: clipped,
    },
  };
}

function fleetReasoningFacts(
  decision: FleetSupervisorDecision,
  events: readonly StoredEvent[],
  boundary: StoredEvent,
  promptLimit = Number.POSITIVE_INFINITY,
) {
  const worker = projectWorker([...events]);
  const queue = events.findLast((event) => event.data.type === "work_queue_published")?.data;
  const outcome = events.findLast((event) => event.data.type === "owner_outcome_recorded")?.data;
  const receipt = events.findLast((event) => event.data.type === "execution_receipt_recorded")?.data;
  const sealedExecutionEvidence = events.findLast((event) => isReviewBoundaryEvidence(event));
  const directivePaths = events.flatMap((event) => event.data.type === "execution_directive_recorded"
    ? event.data.allowed_paths
    : []);
  const hold = decision.trigger === "CHECKPOINT_REVIEW_REQUIRED" ? registeredTaskHold(events) : null;
  const heldBy = hold?.decision.data.type === "github_decision_receipt_ingested" ? hold.decision.data : null;
  const expiryEvidence = decision.trigger === "WORK_DIRECTIVE_EXPIRED_UNRUN"
    ? events.findLast((event) => isBoundWorkDirectiveExpiry(events, event)) : undefined;
  return {
    trigger: decision.trigger,
    trigger_result: decision.result,
    // Mission Control's record that the latest authorized Work job expired before it ran.
    ...(expiryEvidence?.data.type === "evidence_receipt_recorded" ? { expired_work_job: {
      receipt_id: expiryEvidence.data.receipt_id,
      recorded_at: expiryEvidence.occurredAt,
      refs: expiryEvidence.data.refs,
      authorized_job: authorizedJob(events, expiryEvidence, promptLimit),
    } } : {}),
    // The decision a checkpoint review answers, in full up to 2,500 characters (the history below clips it to 600).
    ...(heldBy ? { held_by_decision: {
      request_id: heldBy.request_id,
      decision_id: heldBy.decision_block.decision_id,
      recorded_at: hold!.decision.occurredAt,
      exact_text: clip(heldBy.decision_block.exact_text, 2_500),
    } } : {}),
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
      latest_verified_sealed_evidence: sealedExecutionEvidence?.data.type === "evidence_receipt_recorded" ? {
        event_id: sealedExecutionEvidence.eventId,
        sequence: sealedExecutionEvidence.sequence,
        receipt_id: sealedExecutionEvidence.data.receipt_id,
        summary: sealedExecutionEvidence.data.summary,
        exact_candidate_sha256: sealedExecutionEvidence.data.exact_candidate_sha256,
        refs: sealedExecutionEvidence.data.refs,
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
  now: string = new Date().toISOString(),
): FleetSupervisorDecision {
  if (!chain.valid) return decision("PROJECT_INTEGRITY_FAILURE", "Ledger integrity is invalid; automatic continuation stopped.", "ACTIVE", false, false, true, chain.errors.join("; "));
  const queue = events.findLast((event) => event.data.type === "work_queue_published" && event.data.project_id === watch.projectId)?.data;
  if (queue?.type === "work_queue_published" && queue.items.length > 0
    && queue.items.every((item) => ["DONE", "SUPERSEDED", "CANCELED"].includes(item.status))) {
    return decision("TERMINAL", "Project queue reached a terminal state and left hourly supervision.", "TERMINAL", false, false, true, "Terminal result is ready.");
  }
  const worker = projectWorker([...events]);
  const ownerAction = worker.correction.ownerAction;
  // Each blocker's latest record decides whether it is open, as the worker channel projects it: one resolved later is
  // not open.
  const latestBlockers = new Map<string, { data: Extract<MissionControlEventV2, { type: "structured_blocker_recorded" }>; index: number }>();
  events.forEach((event, index) => {
    if (event.data.type === "structured_blocker_recorded") latestBlockers.set(event.data.blocker_id, { data: event.data, index });
  });
  const openBlockers = [...latestBlockers.values()].filter((item) => item.data.status === "OPEN")
    .sort((left, right) => left.index - right.index).map((item) => item.data);
  const blocker = openBlockers.at(-1);
  const ownerBlocker = openBlockers.findLast((item) => item.required_actor.kind === "OWNER" || item.needs_owner);
  // A task the owner just registered waits for its supervisor's first question, not for the owner: route it, quietly,
  // unless a blocker waits on the owner. (When its first question went unanswered, the projection reports that to the
  // owner instead, under another reason, and the owner-action rule below applies: nothing is routed again.)
  if (ownerAction.status === "OPEN" && ownerAction.reason_code === OWNER_TASK_AWAITING_SUPERVISION_REASON) {
    if (ownerBlocker) return decision("OWNER_ACTION_REQUIRED", "An unavoidable owner action is required.", "ACTIVE", false, false, true, ownerBlocker.description);
    return decision("FIRST_SUPERVISION_REQUIRED", "The owner-registered task's first question was routed to its supervisor.", "ACTIVE", true, false, false, null);
  }
  // A registered task its supervisor held (its latest decision started no step) waits for a checkpoint, not for the
  // owner. Once Mission Control has verified one after that decision, the supervisor is asked to review it, quietly; one
  // review that was sent but went unanswered is the owner's to know about, and nothing asks again.
  if (ownerAction.status === "OPEN" && ownerAction.reason_code === OWNER_TASK_HELD_BY_SUPERVISOR_REASON) {
    if (ownerBlocker) return decision("OWNER_ACTION_REQUIRED", "An unavoidable owner action is required.", "ACTIVE", false, false, true, ownerBlocker.description);
    const hold = registeredTaskHold(events);
    const checkpoint = hold?.checkpointAfter;
    if (checkpoint) {
      const review = worker.supervisorActivity.requests.find((request) => request.origin === "ROUTINE_CHECK"
        && Date.parse(request.queuedAt) >= Date.parse(checkpoint.occurredAt));
      if (review && (review.state === "NO_ANSWER" || review.state === "NO_ANSWER_DUPLICATE_SEND")) {
        return decision("OWNER_ACTION_REQUIRED", "The supervisor's checkpoint review went unanswered; nothing was routed again.", "ACTIVE", false, false, true,
          "Its supervisor didn't answer the checkpoint review before the question expired, so the task stays held. Only a newly verified checkpoint asks again.");
      }
      const reviewDecision = decision("CHECKPOINT_REVIEW_REQUIRED", "A checkpoint verified after the supervisor's hold was routed to the supervisor for review.", "ACTIVE", true, false, false, null);
      // A review whose state can't fit one question even shortened would fail admission on every poll: tell the owner
      // once instead, and route nothing.
      const boundary = reasoningBoundary(events);
      if (boundary && fleetReasoningFactualState(reviewDecision, events, boundary, watch.taskId).length > FLEET_FACTUAL_STATE_LIMIT) {
        return decision("OWNER_ACTION_REQUIRED", "The checkpoint review is too long for one supervisor question; nothing was routed.", "ACTIVE", false, false, true,
          "The task's contract, its held decision and its checkpoint together are too long for one supervisor question, even shortened, so the checkpoint wasn't sent for review.");
      }
      return reviewDecision;
    }
    return decision("SUPERVISOR_HOLD", "Held by its supervisor; no checkpoint has been verified since its decision, so nothing was routed.", "ACTIVE", false, false, true,
      "Held by its supervisor: its latest decision started no work, and no checkpoint of what it asked for has been verified since.");
  }
  // The latest authorized Work job of a task the owner registered expired before it ran (lib/work-directive-expiry.ts).
  // Once the supervisor has answered after the expiry was recorded, the expiry has had its one question.
  const expiry = expiredWorkJobForSupervision(events, now);
  const answeredAfterExpiry = Boolean(expiry?.evidence && events.some((event) => event.data.type === "github_decision_receipt_ingested"
    && event.sequence > expiry.evidence!.sequence));
  const openExpiry = expiry && !answeredAfterExpiry ? expiry : null;
  // Every recorded owner obligation and every blocker on the owner or an outside actor still comes first. The one owner
  // action the expiry question replaces is the projection's own placeholder for a task that records none.
  if (ownerAction.status === "OPEN"
    && ["DECISION_REQUIRED", "MANUAL_INTERVENTION_REQUIRED"].includes(ownerAction.kind)
    && !(openExpiry && expiryQuestionReplaces(ownerAction))) {
    return decision("OWNER_ACTION_REQUIRED", "Existing owner-action obligation remains authoritative.", "ACTIVE", false, false, true, ownerAction.exact_text);
  }
  if (blocker) {
    if (blocker.required_actor.kind === "OWNER") return decision("OWNER_ACTION_REQUIRED", "An unavoidable owner action is required.", "ACTIVE", false, false, true, blocker.description);
    if (blocker.required_actor.kind === "EXTERNAL") return decision("BLOCKED_EXTERNAL", "Project remains blocked on an external actor; no unauthorized retry occurred.", "ACTIVE", false, false, false, null);
  }
  // Any open blocker on the owner or on an outside actor, not only the latest blocker, holds the expiry question back.
  if (openExpiry && ownerBlocker) return decision("OWNER_ACTION_REQUIRED", "An unavoidable owner action is required.", "ACTIVE", false, false, true, ownerBlocker.description);
  if (openExpiry && openBlockers.some((item) => item.required_actor.kind === "EXTERNAL")) {
    return decision("BLOCKED_EXTERNAL", "Project remains blocked on an external actor; no unauthorized retry occurred.", "ACTIVE", false, false, false, null);
  }
  const integrityFailure = decision("PROJECT_INTEGRITY_FAILURE", "Project validity is indeterminate; automatic continuation stopped.", "ACTIVE", false, false, true, "Project validity or owner-outcome evidence is INDETERMINATE.");
  // A task whose contract source is missing stops here. A registered task records no outcome progress yet (its progress
  // producer is a later pull request), so unknown advancement doesn't hold back the expiry question, as it doesn't hold
  // back its first question or a checkpoint review.
  if (worker.contractToOwnerAlignment === "SOURCE_MISSING") return integrityFailure;
  // The supervisor is asked once, quietly, whether to authorize the expired job again. A second such expiry in a row,
  // or a question to it that was sent and went unanswered, is the owner's to know about, and nothing asks again.
  if (openExpiry) {
    if (openExpiry.priorUnrunExpiries > 0) {
      return decision("OWNER_ACTION_REQUIRED", "A second authorized Work job in a row expired before it ran; nothing was routed again.", "ACTIVE", false, false, true,
        "Two authorized ChatGPT Work jobs in a row expired before Mission Control could start them, so its supervisor isn't asked a third time. The Work surface needs a look.");
    }
    if (openExpiry.evidence) {
      const evidenceAt = Date.parse(openExpiry.evidence.occurredAt);
      const review = worker.supervisorActivity.requests.find((request) => request.origin === "ROUTINE_CHECK"
        && Date.parse(request.queuedAt) >= evidenceAt);
      if (review && (review.state === "NO_ANSWER" || review.state === "NO_ANSWER_DUPLICATE_SEND")) {
        return decision("OWNER_ACTION_REQUIRED", "The supervisor's review of the expired Work job went unanswered; nothing was routed again.", "ACTIVE", false, false, true,
          "Its authorized ChatGPT Work job expired before it ran, and its supervisor didn't answer the question about that before it expired. Nothing asks again.");
      }
    }
    const pending = pendingDecisionRequests([...events]).at(-1);
    const pendingState = pending ? worker.supervisorActivity.requests.find((request) => request.requestId === pending.requestId)?.state : undefined;
    if (pending && Date.parse(pending.expiresAt) <= Date.parse(now) && pendingState !== "EXPIRED_UNSENT" && pendingState !== "EXPIRED") {
      return decision("OWNER_ACTION_REQUIRED", "An earlier supervisor question was sent and expired unanswered; the expired Work job wasn't routed.", "ACTIVE", false, false, true,
        "Its authorized ChatGPT Work job expired before it ran, and an earlier question to its supervisor was sent but expired without an answer, so nothing is asked now.");
    }
    const routed = decision("WORK_DIRECTIVE_EXPIRED_UNRUN", "An authorized Work job expired before it ran; its supervisor was asked whether to authorize it again.", "ACTIVE", true, false, false, null);
    // A question that can't fit even with every long field shortened would fail admission on every poll: tell the owner
    // once instead, and route nothing. The state is measured with the record routing would make.
    const withRecord = openExpiry.evidence ? events : [...events, expiryRecordAsEvent(openExpiry, events, now)];
    const boundary = reasoningBoundary(withRecord);
    if (boundary && fleetReasoningFactualState(routed, withRecord, boundary, watch.taskId).length > FLEET_FACTUAL_STATE_LIMIT) {
      return decision("OWNER_ACTION_REQUIRED", "The question about the expired Work job is too long for one supervisor question; nothing was routed.", "ACTIVE", false, false, true,
        "Its authorized ChatGPT Work job expired before it ran, but the job and the task's state together are too long for one supervisor question, even shortened, so the supervisor wasn't asked.");
    }
    return routed;
  }
  if (worker.progress.outcomeAdvancement === "UNKNOWN") return integrityFailure;
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

/** Whether the question about an expired Work job takes the place of this open owner action: only the projection's
 * placeholder for a task that records no owner action does; every recorded obligation stays first. */
export function expiryQuestionReplaces(ownerAction: { reason_code?: string | null }): boolean {
  return ownerAction.reason_code === OWNER_ACTION_TELEMETRY_MISSING_REASON;
}

/** The expired, unrun Work job the fleet check asks about: only for a task the owner registered on the dashboard form,
 * whose Work the owner set up; other workers' expired directives are left to their own supervision. */
export function expiredWorkJobForSupervision(events: readonly StoredEvent[], now: string): ExpiredUnrunWorkDirective | null {
  return workerHasOwnerTaskRegistration(events) ? expiredUnrunWorkDirective(events, now) : null;
}

/** The expiry record routing would append, as a stored event, to measure the question before it is asked. */
function expiryRecordAsEvent(expiry: ExpiredUnrunWorkDirective, events: readonly StoredEvent[], now: string): StoredEvent {
  const envelope = workDirectiveExpiryEnvelope(expiry, now);
  const last = events.at(-1);
  return {
    id: (last?.id ?? 0) + 1, sequence: (last?.sequence ?? 0) + 1, eventId: envelope.event_id, schemaVersion: 2,
    missionId: envelope.mission_id, worker: expiry.directive.worker, type: envelope.data.type, occurredAt: now,
    receivedAt: now, previousHash: last?.eventHash ?? null, eventHash: "", producerId: WORK_DIRECTIVE_EXPIRY_VERIFIER_ID,
    producerKind: "VERIFIER", data: envelope.data as StoredEvent["data"],
  };
}

function decision(trigger: FleetSupervisorTrigger, result: string, state: FleetSupervisorWatchState,
  reasoningRequired: boolean, mechanicalRecoveryEligible: boolean, notifyOwner: boolean,
  notificationReason: string | null): FleetSupervisorDecision {
  return { trigger, result, state, reasoningRequired, mechanicalRecoveryEligible, notifyOwner, notificationReason };
}
