import { canonicalJson, sha256 } from "./canonical";
import type { GitHubReceiptPolicy } from "./github-decision-receipts";
import { inBandRequestRoutePrefix } from "./in-band-request-binding";
import type { AuthenticatedProducer } from "./ingestion-auth";
import { requestRouteEventId } from "./request-bound-supervision";
import { deriveOwnerResponseContinuation } from "./owner-response-continuation";
import { parseRouteContinuation } from "./owner-response-continuation-schema";
import { decisionRouteStates } from "./reasoning-message-state";
import type { AppendEnvelope, StoredEvent } from "./schema";

export const WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID = "system:work-supervisor-question-router";
export const WORK_SUPERVISOR_QUESTION_SUMMARY = "MISSION_CONTROL_WORK_SUPERVISOR_QUESTION_V1";
export const workSupervisorQuestionCollector: AuthenticatedProducer = {
  id: "collector:work-supervisor-question-router",
  kind: "COLLECTOR",
  workerScopes: ["*"],
  taskScopes: ["*"],
};

export interface WorkSupervisorQuestionInput {
  worker: string;
  sourceDispatchId: string;
  workThreadId: string;
  questionId: string;
  exactQuestion: string;
  exactQuestionSha256?: string;
  factualState: string;
  factualStateSha256?: string;
  evidenceRefs?: string[];
  recordedAt: string;
}

export interface WorkSupervisorQuestionContext {
  sourceDispatchId: string;
  workThreadId: string;
  questionId: string;
  exactQuestionSha256: string;
}

export function buildWorkSupervisorQuestionRoute(
  events: readonly StoredEvent[],
  input: WorkSupervisorQuestionInput,
  policy: GitHubReceiptPolicy | null,
): { route: AppendEnvelope; provenance: AppendEnvelope; context: WorkSupervisorQuestionContext } {
  if (!policy?.requestBound?.enabled) {
    throw new Error("Work supervisor-question routing requires the configured in-band request-bound relay policy.");
  }
  const worker = stableId(input.worker, "worker");
  const sourceDispatchId = stableId(input.sourceDispatchId, "sourceDispatchId");
  const workThreadId = stableId(input.workThreadId, "workThreadId", 300);
  const questionId = stableId(input.questionId, "questionId");
  const exactQuestion = boundedText(input.exactQuestion, "exactQuestion", 12_000);
  const exactQuestionSha256 = sha256(exactQuestion);
  if (input.exactQuestionSha256 !== undefined && input.exactQuestionSha256 !== exactQuestionSha256) {
    throw new Error("Work supervisor-question exactQuestion digest mismatch.");
  }
  const workFactualState = boundedText(input.factualState, "factualState", 12_000);
  const factualStateSha256 = sha256(workFactualState);
  if (input.factualStateSha256 !== undefined && input.factualStateSha256 !== factualStateSha256) {
    throw new Error("Work supervisor-question factualState digest mismatch.");
  }
  const evidenceRefs = input.evidenceRefs ?? [];
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length > 50
    || evidenceRefs.some((value) => typeof value !== "string" || !value.trim() || value.length > 2_000)) {
    throw new Error("Work supervisor-question evidenceRefs are invalid.");
  }
  const recordedAt = timestamp(input.recordedAt, "recordedAt");

  const request = [...events].reverse().find((event) => event.worker === worker
    && event.data.type === "chatgpt_work_cloud_dispatch_requested"
    && event.data.dispatch_id === sourceDispatchId)?.data;
  const result = [...events].reverse().find((event) => event.worker === worker
    && event.data.type === "chatgpt_work_cloud_dispatch_recorded"
    && event.data.dispatch_id === sourceDispatchId)?.data;
  if (!request || request.type !== "chatgpt_work_cloud_dispatch_requested"
    || !result || result.type !== "chatgpt_work_cloud_dispatch_recorded"
    || result.status !== "READY"
    || result.surface_verification !== "VERIFIED_NATIVE_WORK"
    || result.work_thread_id !== workThreadId) {
    throw new Error("Work supervisor-question routing requires the exact READY native Work dispatch/thread binding.");
  }
  const directiveEvent = [...events].reverse().find((event) => event.worker === worker
    && event.data.type === "execution_directive_recorded"
    && event.data.directive_id === request.directive_id
    && event.data.directive_revision === request.directive_revision);
  if (!directiveEvent || directiveEvent.data.type !== "execution_directive_recorded"
    || directiveEvent.data.task_id !== request.task_id
    || directiveEvent.data.execution_surface !== "CHATGPT_WORK_CLOUD"
    || directiveEvent.data.validated_decision_proof?.authority_path !== "VALIDATED_GITHUB_SUPERVISORY_DECISION") {
    throw new Error("Work supervisor-question routing requires the exact source-bound Work directive.");
  }
  const directiveProof = directiveEvent.data.validated_decision_proof!;
  const originDecisionEvent = events.find((event) =>
    event.eventId === directiveProof.receipt_event_id);
  const originDecision = originDecisionEvent?.data;
  if (!originDecision || originDecision.type !== "github_decision_receipt_ingested"
    || originDecision.worker !== worker
    || originDecision.task_id !== request.task_id
    || !originDecision.supervisor_id) {
    throw new Error("Work supervisor-question routing cannot recover the original stable supervisor.");
  }
  const originRoute = findOriginRoute(events, worker, originDecision.request_id);
  if (!originRoute || originRoute.destinationSupervisorId !== originDecision.supervisor_id
    || originRoute.taskId !== request.task_id) {
    throw new Error("Work supervisor-question routing cannot recover the exact original supervisor route.");
  }
  const currentOutcome = [...events].reverse().find((event) =>
    event.worker === worker && event.data.type === "owner_outcome_recorded")?.data;
  if (!currentOutcome || currentOutcome.type !== "owner_outcome_recorded"
    || currentOutcome.owner_outcome_id !== originDecision.owner_outcome_id
    || currentOutcome.epoch !== originDecision.owner_outcome_epoch
    || currentOutcome.owner_outcome_sha256 !== originDecision.owner_outcome_sha256) {
    throw new Error("Work supervisor-question routing is stale against the current owner outcome.");
  }
  const windowMs = Date.parse(originRoute.expiresAt) - Date.parse(originRoute.queuedAt);
  if (!Number.isFinite(windowMs) || windowMs < 60_000 || windowMs > 24 * 60 * 60_000) {
    throw new Error("Work supervisor-question routing cannot derive a safe review window.");
  }
  const expiresAt = new Date(Date.parse(recordedAt) + windowMs).toISOString();
  const requestId = `work-question:${sha256(canonicalJson({
    worker,
    source_dispatch_id: sourceDispatchId,
    question_id: questionId,
    question_sha256: exactQuestionSha256,
    owner_outcome_sha256: currentOutcome.owner_outcome_sha256,
  })).slice(0, 32)}`;
  const nonce = `work-question-nonce:${sha256(`${requestId}:${currentOutcome.owner_outcome_sha256}`).slice(0, 32)}`;
  const factualState = canonicalJson({
    review_kind: "WORK_SUPERVISOR_QUESTION",
    source_work_dispatch_id: sourceDispatchId,
    question_id: questionId,
    exact_question: exactQuestion,
    exact_question_sha256: exactQuestionSha256,
    work_factual_state: workFactualState,
    work_factual_state_sha256: factualStateSha256,
    work_evidence_refs: evidenceRefs,
    semantic_authority: false,
    worker_may_decide_owner_need: false,
  });
  const evidenceCapsule = {
    id: `work-private-question:${sha256(sourceDispatchId + ":" + questionId).slice(0, 32)}`,
    sha256: sha256(factualState),
  };
  const ownerOutcome = {
    id: currentOutcome.owner_outcome_id,
    epoch: currentOutcome.epoch,
    sha256: currentOutcome.owner_outcome_sha256,
  };
  const decisionRequested = [
    "Resolve the Work reasoning question using the current owner outcome and existing authority.",
    "Classify owner_action explicitly.",
    "If existing authority determines the answer, set owner_action.kind=NONE and return one bounded_execution with execution_surface CHATGPT_WORK_CLOUD so Mission Control continues the exact existing Work thread.",
    "Only if a genuine irreducible owner tradeoff remains, set owner_action.kind=DECISION_REQUIRED, provide the complete decision packet, and omit bounded_execution so Mission Control surfaces it on the owner dashboard.",
    "Work itself has no authority to decide that owner input is required.",
  ].join(" ");
  const body = inBandRequestRoutePrefix + canonicalJson({
    schemaVersion: 6,
    executionContext: { task_id: request.task_id },
    packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE",
    requestId,
    actionBlockedOrRouted: "WORK_REASONING_REVIEW",
    worker,
    producerId: WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID,
    destination: originRoute.destination,
    destinationSupervisorId: originDecision.supervisor_id,
    standingOwnerAuthorization: true,
    ownerRelayRequired: false,
    actionTimeConfirmationRequired: false,
    providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY",
    primaryDecision: "WORK_SUPERVISOR_QUESTION_REQUIRED",
    routeDecision: "MISSION_CONTROL_INTERNAL_ROUTE",
    factualPacket: {
      packetId: `work-question-packet:${sha256(requestId).slice(0, 32)}`,
      taskId: request.task_id,
      exactFactualState: factualState,
      evidenceRefs: [],
      decisionRequested,
      supervisoryCycle: {
        bindingProtocol: "IN_BAND_REQUEST_BINDING_V1",
        executionContext: { task_id: request.task_id },
        nonce,
        evidenceCapsule,
        ownerOutcome,
        reasoningLane: originDecision.reasoning_lane,
        githubReceipt: {
          repository: policy.repository,
          issueNumber: policy.decisionIssueNumber,
          stageIssueNumber: policy.stageIssueNumber,
        },
        expiresAt,
      },
    },
    queuedAt: recordedAt,
    nonce,
    reasoningLane: originDecision.reasoning_lane,
    evidenceCapsule,
    ownerOutcome,
    githubReceipt: {
      repository: policy.repository,
      issueNumber: policy.decisionIssueNumber,
      stageIssueNumber: policy.stageIssueNumber,
    },
    expiresAt,
    writerContract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretationAllowed: false },
  });
  if (body.length > 20_000) throw new Error("Work supervisor-question V6 route exceeds the durable message limit.");
  const eventId = requestRouteEventId(requestId, 6);
  const route: AppendEnvelope = {
    schema_version: 2,
    event_id: eventId,
    mission_id: "mission-control-live",
    occurred_at: recordedAt,
    data: {
      type: "worker_message_recorded",
      worker,
      message_id: `message:${eventId}`,
      thread_id: `thread:work-question:${worker}`,
      message_kind: "QUESTION",
      body,
      reply_to_message_id: null,
      direction_id: null,
    },
  };
  const provenance: AppendEnvelope = {
    schema_version: 2,
    event_id: `work-question-proof:${sha256(eventId).slice(0, 32)}`,
    mission_id: "mission-control-live",
    occurred_at: recordedAt,
    data: {
      type: "evidence_receipt_recorded",
      worker,
      receipt_id: `work-question-proof:${sha256(eventId).slice(0, 32)}`,
      producer_id: workSupervisorQuestionCollector.id,
      producer_role: "COLLECTOR",
      evidence_class: "ARTIFACT",
      independence: "SAME_PROVENANCE",
      freshness: "CURRENT",
      exact_candidate_sha256: null,
      summary: WORK_SUPERVISOR_QUESTION_SUMMARY,
      refs: [
        `source_work_dispatch:${sourceDispatchId}`,
        `work_thread_sha256:${sha256(workThreadId)}`,
        `question:${questionId}`,
        `question_sha256:${exactQuestionSha256}`,
        `route_event:${eventId}`,
        `owner_outcome:${ownerOutcome.id}`,
        `owner_outcome_epoch:${ownerOutcome.epoch}`,
        `owner_outcome_sha256:${ownerOutcome.sha256}`,
        `destination_supervisor:${originDecision.supervisor_id}`,
        "semantic_authority:false",
        "owner_relay_required:false",
      ],
      verified: true,
      changed_path_manifest: null,
    },
  };
  return {
    route,
    provenance,
    context: { sourceDispatchId, workThreadId, questionId, exactQuestionSha256 },
  };
}

export function buildOwnerAnswerContinuationRoute(
  events: StoredEvent[],
  input: { worker: string; resumeDecisionRequestId: string; recordedAt: string },
  policy: GitHubReceiptPolicy | null,
): AppendEnvelope {
  const existing = ownerAnswerContinuationRoute(events, input.worker, input.resumeDecisionRequestId);
  if (existing?.data.type === "worker_message_recorded") return {
    schema_version: 2, event_id: existing.eventId, mission_id: existing.missionId,
    occurred_at: existing.occurredAt, data: existing.data,
  };
  if (!policy?.requestBound?.enabled) throw new Error("Owner-answer continuation requires in-band routing.");
  const worker = stableId(input.worker, "worker");
  const resumeDecisionRequestId = stableId(input.resumeDecisionRequestId, "resumeDecisionRequestId");
  const recordedAt = timestamp(input.recordedAt, "recordedAt");
  const origin = findWorkQuestionRoute(events, worker, resumeDecisionRequestId);
  if (!origin) throw new Error("Owner-answer continuation requires the exact originating Work question route.");
  const windowMs = Date.parse(origin.root.expiresAt) - Date.parse(origin.root.queuedAt);
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error("Owner-answer continuation has no valid route window.");
  const expiresAt = new Date(Date.parse(recordedAt) + windowMs).toISOString();
  const continuation = deriveOwnerResponseContinuation(events, {
    worker,
    resumeDecisionRequestId,
    supervisorId: origin.root.destinationSupervisorId,
    ownerOutcome: origin.root.ownerOutcome,
    evidenceCapsule: origin.root.evidenceCapsule,
    issuedAt: recordedAt,
    expiresAt,
  }, recordedAt);
  // Causal identity stays stable even when concurrent attempts allocate different validity windows.
  const requestId = `work-owner-continuation:${continuation.binding.continuation_id.slice(0, 32)}`;
  const nonce = `work-owner-continuation-nonce:${sha256(requestId + ":" + origin.root.ownerOutcome.sha256).slice(0, 32)}`;
  const decisionRequested = "Apply the exact owner answer to the prior Work question. Return owner_action {kind:NONE} and one CHATGPT_WORK_CLOUD bounded_execution that continues the exact existing Work thread. Do not request another owner decision unless the owner answer itself introduces a genuinely new tradeoff.";
  const root = {
    ...origin.root,
    requestId,
    nonce,
    actionBlockedOrRouted: "OWNER_RESPONSE_REVIEW",
    primaryDecision: "OWNER_RESPONSE_SUPERVISOR_RESOLUTION_REQUIRED",
    queuedAt: recordedAt,
    expiresAt,
    ownerRelayRequired: false,
    factualPacket: {
      ...origin.root.factualPacket,
      packetId: `work-owner-continuation-packet:${sha256(requestId).slice(0, 32)}`,
      decisionRequested,
      supervisoryCycle: {
        ...origin.root.factualPacket.supervisoryCycle,
        nonce,
        expiresAt,
      },
    },
    continuationBinding: continuation.binding,
    continuationBindingSha256: continuation.digest,
    continuationOwnerResponseExactText: continuation.exactOwnerResponseText,
  };
  const body = inBandRequestRoutePrefix + canonicalJson(root);
  if (body.length > 20_000) throw new Error("Owner-answer continuation V6 route exceeds the durable message limit.");
  const eventId = requestRouteEventId(requestId, 6);
  return {
    schema_version: 2,
    event_id: eventId,
    mission_id: "mission-control-live",
    occurred_at: recordedAt,
    data: {
      type: "worker_message_recorded",
      worker,
      message_id: `message:${eventId}`,
      thread_id: `thread:work-owner-continuation:${worker}`,
      message_kind: "QUESTION",
      body,
      reply_to_message_id: null,
      direction_id: null,
    },
  };
}

export function ownerAnswerContinuationRoute(
  events: StoredEvent[], worker: string, decisionRequestId: string,
): StoredEvent | null {
  const state = decisionRouteStates(events).find((route) => route.decisionRequestId === decisionRequestId
    && route.request.worker === worker);
  const delivery = state?.supervisorResponse;
  const owner = state?.projectManagerResponse ?? delivery;
  if (!state || !delivery || !owner || state.status === "INVALID_BINDING") return null;
  for (const event of events) {
    if (event.worker !== worker || event.producerKind !== "SYSTEM"
      || event.producerId !== WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID
      || event.data.type !== "worker_message_recorded" || !event.data.body.startsWith(inBandRequestRoutePrefix)) continue;
    try {
      const root = JSON.parse(event.data.body.slice(inBandRequestRoutePrefix.length));
      const continuation = parseRouteContinuation(root);
      const binding = continuation?.binding;
      if (!binding || root.worker !== worker || root.producerId !== WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID
        || root.actionBlockedOrRouted !== "OWNER_RESPONSE_REVIEW"
        || binding.worker !== worker || binding.decision_request_id !== decisionRequestId
        || binding.supervisor_id !== state.request.data.stable_supervisor_id
        || binding.supervisor_id !== delivery.data.stable_supervisor_id) continue;
      const matches = [
        [binding.originating_supervisor_message, state.request],
        [binding.owner_input, owner],
        [binding.supervisor_delivery, delivery],
      ] as const;
      if (matches.every(([ref, message]) => ref.event_id === message.eventId
        && ref.message_id === message.data.message_id && ref.body_sha256 === message.data.body_sha256)) return event;
    } catch { /* Malformed or unrelated routes cannot complete an owner obligation. */ }
  }
  return null;
}

export function workQuestionRequestIdForDispatch(
  events: readonly StoredEvent[],
  worker: string,
  dispatchId: string,
): string | null {
  for (const event of [...events].reverse()) {
    if (event.worker !== worker || event.data.type !== "worker_message_recorded"
      || !event.data.body.startsWith(inBandRequestRoutePrefix)) continue;
    let root: unknown;
    try { root = JSON.parse(event.data.body.slice(inBandRequestRoutePrefix.length)); } catch { continue; }
    if (!isRecord(root) || root.producerId !== WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID
      || typeof root.requestId !== "string" || !isRecord(root.factualPacket)
      || typeof root.factualPacket.exactFactualState !== "string") continue;
    let factual: unknown;
    try { factual = JSON.parse(root.factualPacket.exactFactualState); } catch { continue; }
    if (isRecord(factual) && factual.review_kind === "WORK_SUPERVISOR_QUESTION"
      && factual.source_work_dispatch_id === dispatchId) return root.requestId;
  }
  return null;
}

export function workQuestionContextForRequest(
  events: readonly StoredEvent[],
  worker: string,
  requestId: string,
): WorkSupervisorQuestionContext | null {
  for (const event of [...events].reverse()) {
    if (event.worker !== worker || event.data.type !== "worker_message_recorded"
      || !event.data.body.startsWith(inBandRequestRoutePrefix)) continue;
    let root: unknown;
    try { root = JSON.parse(event.data.body.slice(inBandRequestRoutePrefix.length)); } catch { continue; }
    if (!isRecord(root) || root.requestId !== requestId
      || root.producerId !== WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID
      || !isRecord(root.factualPacket) || typeof root.factualPacket.exactFactualState !== "string") continue;
    let factual: unknown;
    try { factual = JSON.parse(root.factualPacket.exactFactualState); } catch { continue; }
    if (!isRecord(factual) || factual.review_kind !== "WORK_SUPERVISOR_QUESTION"
      || typeof factual.source_work_dispatch_id !== "string"
      || typeof factual.question_id !== "string"
      || typeof factual.exact_question_sha256 !== "string") continue;
    const result = [...events].reverse().find((candidate) => candidate.worker === worker
      && candidate.data.type === "chatgpt_work_cloud_dispatch_recorded"
      && candidate.data.dispatch_id === factual.source_work_dispatch_id)?.data;
    if (!result || result.type !== "chatgpt_work_cloud_dispatch_recorded"
      || result.status !== "READY" || result.surface_verification !== "VERIFIED_NATIVE_WORK"
      || !result.work_thread_id) return null;
    return {
      sourceDispatchId: factual.source_work_dispatch_id,
      workThreadId: result.work_thread_id,
      questionId: factual.question_id,
      exactQuestionSha256: factual.exact_question_sha256,
    };
  }
  return null;
}

function findWorkQuestionRoute(events: readonly StoredEvent[], worker: string, requestId: string): { root: any } | null {
  for (const event of events) {
    if (event.worker !== worker || event.data.type !== "worker_message_recorded"
      || !event.data.body.startsWith(inBandRequestRoutePrefix)) continue;
    let root: any;
    try { root = JSON.parse(event.data.body.slice(inBandRequestRoutePrefix.length)); } catch { continue; }
    if (!isRecord(root) || root.requestId !== requestId
      || root.producerId !== WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID
      || typeof root.destinationSupervisorId !== "string"
      || !isRecord(root.ownerOutcome) || !isRecord(root.evidenceCapsule)
      || typeof root.queuedAt !== "string" || typeof root.expiresAt !== "string"
      || !isRecord(root.factualPacket) || !isRecord(root.factualPacket.supervisoryCycle)) continue;
    return { root };
  }
  return null;
}

function findOriginRoute(events: readonly StoredEvent[], worker: string, requestId: string): {
  destination: "PROJECT_MANAGER_CHAT" | "SPECIALIST_SUPERVISOR_CHAT";
  destinationSupervisorId: string;
  taskId: string;
  queuedAt: string;
  expiresAt: string;
} | null {
  for (const event of events) {
    if (event.worker !== worker || event.data.type !== "worker_message_recorded"
      || !event.data.body.startsWith(inBandRequestRoutePrefix)) continue;
    let root: unknown;
    try { root = JSON.parse(event.data.body.slice(inBandRequestRoutePrefix.length)); } catch { continue; }
    if (!isRecord(root) || root.requestId !== requestId
      || (root.destination !== "PROJECT_MANAGER_CHAT" && root.destination !== "SPECIALIST_SUPERVISOR_CHAT")
      || typeof root.destinationSupervisorId !== "string"
      || typeof root.queuedAt !== "string"
      || typeof root.expiresAt !== "string"
      || !isRecord(root.factualPacket)
      || typeof root.factualPacket.taskId !== "string") continue;
    return {
      destination: root.destination,
      destinationSupervisorId: root.destinationSupervisorId,
      taskId: root.factualPacket.taskId,
      queuedAt: root.queuedAt,
      expiresAt: root.expiresAt,
    };
  }
  return null;
}

function stableId(value: unknown, field: string, maximum = 180): string {
  if (typeof value !== "string" || value.length > maximum
    || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) throw new Error(`${field} must be a stable Mission Control identifier.`);
  return value;
}
function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`${field} is invalid.`);
  return value;
}
function timestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${field} must be an ISO timestamp.`);
  return value;
}
function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
