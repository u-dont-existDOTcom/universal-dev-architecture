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

export interface ProvenUnsentSubmissionState {
  schemaVersion: 1;
  requestId: string;
  pacingDomain: string;
  ledgerValid: boolean;
  matchingStateSections: string[];
  queueRecordCount: number;
  admissionRecordCount: number;
  provenUnsent: boolean;
  proofSha256: string;
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
  if (submissionProof.schemaVersion !== 1
    || submissionProof.requestId !== input.requestId
    || submissionProof.provenUnsent !== true
    || submissionProof.ledgerValid !== true
    || submissionProof.matchingStateSections.length !== 0
    || submissionProof.queueRecordCount !== 0
    || submissionProof.admissionRecordCount !== 0
    || !/^[a-f0-9]{64}$/.test(submissionProof.proofSha256)) {
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
    && event.data.producer_id === "verifier:fleet-supervisor-request-retirement"
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
      producer_id: "verifier:fleet-supervisor-request-retirement",
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
    id: "verifier:fleet-supervisor-request-retirement",
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
  return events.findLast((event) => boundaryTypes.has(event.data.type) || isReviewBoundaryEvidence(event)) ?? null;
}

function isReviewBoundaryEvidence(event: StoredEvent) {
  return event.data.type === "evidence_receipt_recorded"
    && event.data.verified === true
    && Boolean(event.data.exact_candidate_sha256)
    && event.data.refs.includes("status:STAGE_COMPLETE")
    && event.data.refs.includes("next_reasoning_review_required:true");
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
  const sealedExecutionEvidence = events.findLast((event) => isReviewBoundaryEvidence(event));
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
