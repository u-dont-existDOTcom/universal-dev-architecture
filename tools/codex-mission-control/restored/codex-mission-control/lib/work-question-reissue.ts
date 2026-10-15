// Reissuing a Work thread's question to its supervisor after it expired unsent.
//
// A native Work thread that needs supervisor reasoning stops and hands its question to Mission Control, which queues
// one V6 "work-question" request for the original supervisor with a bounded answer window. If nothing sends it inside
// that window (for example while the relay's sending is switched off), the request expires: the relay never sees it
// again and the Work thread waits for an answer that cannot come. Re-running the handoff is deliberately a no-op (the
// question id is stable), and the fleet supervisor only renews its own review requests.
//
// This retires such a request with the submission authority's proof that it never reached the provider, and queues one
// successor that carries the same question, evidence capsule, owner outcome, supervisor and Work thread binding, with a
// fresh window of the same length. The supervisor's answer to the successor continues the same Work thread.
//
// A question that was sent can expire too, when its answer never reached Mission Control inside the window (on
// 14 October the relay's check of the sent message timed out after the supervisor had started answering, and the
// answer stayed in the relay's tab). No late answer to it can be accepted, so the owner may re-send it once: the same
// retirement and successor, authorized by the owner, with the submission authority's record that no send of the
// original is still open.
import { canonicalJson, sha256 } from "./canonical";
import {
  pendingDecisionRequests,
  supervisoryRequestRetiredAfterSendSummary,
  supervisoryRequestRetiredUnsentSummary,
  type GitHubReceiptPolicy,
  type PendingDecisionRequest,
} from "./github-decision-receipts";
import { inBandRequestRoutePrefix } from "./in-band-request-binding";
import type { AuthenticatedProducer } from "./ingestion-auth";
import {
  WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID,
  WORK_SUPERVISOR_QUESTION_SUMMARY,
  workQuestionContextForRequest,
  workQuestionRequestIdForDispatch,
  workSupervisorQuestionCollector,
} from "./owner-question-route";
import { requestRouteEventId } from "./request-bound-supervision";
import type { AppendEnvelope, MissionControlEvent, StoredEvent } from "./schema";
import type { EventStore } from "./store";
import {
  WORK_QUESTION_REQUEST_ID,
  WORK_QUESTION_RETIREMENT_PRODUCER_ID,
  validSettledSendProof,
  validUnsentSubmissionProof,
  type ProvenUnsentSubmissionState,
  type SettledSendSubmissionState,
} from "./unsent-request-proof";

const MIN_WINDOW_MS = 60_000;
const MAX_WINDOW_MS = 24 * 60 * 60_000;

export interface ExpiredWorkQuestionReissue {
  taskId: string;
  retiredRequestId: string;
  requestId: string;
  queuedAt: string;
  expiresAt: string;
  retirement: AppendEnvelope;
  route: AppendEnvelope;
  provenance: AppendEnvelope;
}

/** The worker's pending Work questions whose answer window has closed, oldest first. */
export function expiredPendingWorkQuestions(events: readonly StoredEvent[], worker: string, now: string): string[] {
  const at = Date.parse(now);
  if (!Number.isFinite(at)) throw new Error("The reissue time must be an ISO timestamp.");
  return pendingDecisionRequests(events.filter((event) => event.worker === worker))
    .filter((request) => request.worker === worker && WORK_QUESTION_REQUEST_ID.test(request.requestId)
      && Date.parse(request.expiresAt) <= at)
    .map((request) => request.requestId);
}

export function buildExpiredWorkQuestionReissue(
  events: readonly StoredEvent[],
  input: { worker: string; requestId: string; recordedAt: string },
  submissionProof: ProvenUnsentSubmissionState | undefined,
  policy: GitHubReceiptPolicy | null,
): ExpiredWorkQuestionReissue {
  const basis = reissueBasis(events, input, policy, "UNSENT");
  if (!validUnsentSubmissionProof(submissionProof, input.requestId)) {
    throw new Error("Submission authority did not prove the expired Work question unsent.");
  }
  const proof = submissionProof!;
  const { worker, requestId, recordedAt } = input;
  const retirementId = `supervisory-request-retired-unsent:${sha256(`${requestId}\n${proof.proofSha256}`).slice(0, 32)}`;
  const successor = successorEvents(basis, input, retirementId, policy!);
  const retirement: AppendEnvelope = {
    schema_version: 2,
    event_id: retirementId,
    mission_id: "mission-control-live",
    occurred_at: recordedAt,
    data: {
      type: "evidence_receipt_recorded",
      worker,
      receipt_id: retirementId,
      producer_id: WORK_QUESTION_RETIREMENT_PRODUCER_ID,
      producer_role: "VERIFIER",
      evidence_class: "ARTIFACT",
      independence: "INDEPENDENT",
      freshness: "CURRENT",
      exact_candidate_sha256: proof.proofSha256,
      summary: supervisoryRequestRetiredUnsentSummary,
      refs: [
        `request:${requestId}`,
        `source_route_event:${basis.sourceEventId}`,
        `successor_request:${successor.requestId}`,
        `successor_route_event:${successor.routeEventId}`,
        `submission_authority_proof_sha256:${proof.proofSha256}`,
        `submission_authority_pacing_domain:${proof.pacingDomain}`,
        "retirement_reason:REQUEST_EXPIRED",
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
  };
  return {
    taskId: basis.pending.taskId, retiredRequestId: requestId, requestId: successor.requestId,
    queuedAt: recordedAt, expiresAt: successor.expiresAt, retirement, route: successor.route, provenance: successor.provenance,
  };
}

/**
 * The owner's one re-send of a Work question that was sent (or may have been) and whose answer window closed without
 * an accepted answer. Mission Control accepts a late answer only from the ChatGPT app's own readback of a reply the
 * relay saw finish inside the window, so an answer stranded in the relay's tab past the window can never be accepted,
 * and the Work thread would wait for good. This retires the question, so no late answer to it can be accepted, and
 * queues one successor exactly as the unsent reissue does: the same question, evidence capsule, owner outcome,
 * supervisor and Work thread, a fresh window of the same length, and today's decision channel. The successor is a
 * second provider send of the same question, so it needs the owner's explicit authorization, and the submission
 * authority's record that the question has send records and that none of its sends is still open.
 */
export function buildSentWorkQuestionResend(
  events: readonly StoredEvent[],
  input: { worker: string; requestId: string; recordedAt: string; authorizedBy: string },
  sendProof: SettledSendSubmissionState | undefined,
  policy: GitHubReceiptPolicy | null,
): ExpiredWorkQuestionReissue {
  const basis = reissueBasis(events, input, policy, "SENT");
  if (!validSettledSendProof(sendProof, input.requestId)) {
    throw new Error("Submission authority did not show the Work question sent with no send of it still open.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(input.authorizedBy)) {
    throw new Error("The re-send needs the authorizing owner identity.");
  }
  const proof = sendProof!;
  const { worker, requestId, recordedAt } = input;
  const retirementId = `supervisory-request-retired-after-send:${sha256(`${requestId}\n${proof.proofSha256}`).slice(0, 32)}`;
  const successor = successorEvents(basis, input, retirementId, policy!);
  const retirement: AppendEnvelope = {
    schema_version: 2,
    event_id: retirementId,
    mission_id: "mission-control-live",
    occurred_at: recordedAt,
    data: {
      type: "evidence_receipt_recorded",
      worker,
      receipt_id: retirementId,
      producer_id: WORK_QUESTION_RETIREMENT_PRODUCER_ID,
      producer_role: "VERIFIER",
      evidence_class: "ARTIFACT",
      independence: "INDEPENDENT",
      freshness: "CURRENT",
      exact_candidate_sha256: proof.proofSha256,
      summary: supervisoryRequestRetiredAfterSendSummary,
      refs: [
        `request:${requestId}`,
        `source_route_event:${basis.sourceEventId}`,
        `successor_request:${successor.requestId}`,
        `successor_route_event:${successor.routeEventId}`,
        `submission_authority_proof_sha256:${proof.proofSha256}`,
        `submission_authority_pacing_domain:${proof.pacingDomain}`,
        "retirement_reason:REQUEST_EXPIRED_WITHOUT_ACCEPTED_ANSWER",
        "lifecycle_status:RETIRED_AFTER_SEND",
        `provider_send_boundary:${proof.crossedAdmissionCount > 0 ? "CROSSED" : "NOT_PROVEN_UNSENT"}`,
        `submission_authority_admission_records:${proof.admissions.length}`,
        `submission_authority_crossed_admissions:${proof.crossedAdmissionCount}`,
        "submission_authority_open_records:0",
        "decision_receipts_ingested:0",
        "authorization:OWNER_EXPLICIT_ONE_RESEND",
        `authorized_by:${input.authorizedBy}`,
        "historical_request_preserved:true",
      ],
      verified: true,
      changed_path_manifest: null,
    },
  };
  return {
    taskId: basis.pending.taskId, retiredRequestId: requestId, requestId: successor.requestId,
    queuedAt: recordedAt, expiresAt: successor.expiresAt, retirement, route: successor.route, provenance: successor.provenance,
  };
}

interface ReissueBasis {
  pending: PendingDecisionRequest;
  sourceEventId: string;
  threadId: string;
  provenanceData: Extract<MissionControlEvent, { type: "evidence_receipt_recorded" }>;
  root: Record<string, any>;
  windowMs: number;
}

/**
 * What both reissues require of the question: one expired, pending, original Work question route with its routing
 * provenance, still the current question of a READY native Work thread, with no newer directive, Work dispatch or
 * supervisor decision for the worker, current against the owner outcome, and with a safe answer window to reuse. The
 * unsent reissue also refuses any send, delivery, response, decision or retirement evidence for it; the owner's re-send
 * expects send evidence and relies on the submission authority's record instead.
 */
function reissueBasis(
  events: readonly StoredEvent[],
  input: { worker: string; requestId: string; recordedAt: string },
  policy: GitHubReceiptPolicy | null,
  kind: "UNSENT" | "SENT",
): ReissueBasis {
  if (!policy?.requestBound?.enabled) {
    throw new Error("Reissuing a Work question requires the configured in-band request-bound relay policy.");
  }
  const { worker, requestId, recordedAt } = input;
  if (!WORK_QUESTION_REQUEST_ID.test(requestId)) throw new Error("Reissue requires one exact work-question request ID.");
  if (!Number.isFinite(Date.parse(recordedAt))) throw new Error("The reissue time must be an ISO timestamp.");
  const history = events.filter((event) => event.worker === worker);

  const pending = pendingDecisionRequests(history).find((request) => request.requestId === requestId);
  if (!pending) throw new Error("The Work question is not pending: it was answered, superseded or already retired.");
  if (Date.parse(pending.expiresAt) > Date.parse(recordedAt)) {
    throw new Error("The Work question has not expired; the relay can still send it.");
  }

  const routeEventId = requestRouteEventId(requestId, 6);
  const source = history.find((event) => event.eventId === routeEventId);
  if (!source || source.data.type !== "worker_message_recorded" || source.producerKind !== "SYSTEM"
    || source.producerId !== WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID) {
    throw new Error("The exact Work question route is missing.");
  }
  const root = routeRoot(source.data.body);
  if (!root || root.schemaVersion !== 6 || root.requestId !== requestId
    || root.producerId !== WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID
    || root.actionBlockedOrRouted !== "WORK_REASONING_REVIEW"
    || root.primaryDecision !== "WORK_SUPERVISOR_QUESTION_REQUIRED"
    || "continuationBinding" in root || "supersedesRequestId" in root
    || !isRecord(root.factualPacket) || !isRecord(root.factualPacket.supervisoryCycle)
    || typeof root.factualPacket.taskId !== "string" || root.factualPacket.taskId !== pending.taskId
    || !isRecord(root.ownerOutcome) || typeof root.queuedAt !== "string" || typeof root.expiresAt !== "string") {
    throw new Error("Only an original Work question route may be reissued.");
  }

  const provenanceId = `work-question-proof:${sha256(source.eventId).slice(0, 32)}`;
  const provenance = history.find((event) => event.eventId === provenanceId);
  if (!provenance || provenance.data.type !== "evidence_receipt_recorded"
    || provenance.data.summary !== WORK_SUPERVISOR_QUESTION_SUMMARY
    || provenance.data.producer_id !== workSupervisorQuestionCollector.id
    || !provenance.data.refs.includes(`route_event:${source.eventId}`)) {
    throw new Error("The Work question's routing provenance is missing.");
  }
  if (kind === "UNSENT") {
    const lifecycle = history.filter((event) => event.eventId !== source.eventId && event.eventId !== provenance.eventId
      && containsRequestReference(event.data, requestId));
    if (lifecycle.length > 0) {
      throw new Error("The Work question has send, delivery, response, decision or retirement evidence and cannot be reissued.");
    }
  }

  const newerWork = history.filter((event) => event.sequence > source.sequence
    && ["execution_directive_recorded", "chatgpt_work_cloud_dispatch_requested", "github_decision_receipt_ingested"].includes(event.data.type));
  if (newerWork.length > 0) {
    throw new Error("The worker has a newer directive, Work dispatch or supervisor decision than this question; it is no longer current.");
  }
  const context = workQuestionContextForRequest(history, worker, requestId);
  if (!context) throw new Error("The Work question no longer binds to one READY native Work thread.");
  if (workQuestionRequestIdForDispatch(history, worker, context.sourceDispatchId) !== requestId) {
    throw new Error("A newer question exists for the same Work thread.");
  }
  const outcome = [...history].reverse().find((event) => event.data.type === "owner_outcome_recorded")?.data;
  const ownerOutcome = root.ownerOutcome;
  if (!outcome || outcome.type !== "owner_outcome_recorded" || outcome.owner_outcome_id !== ownerOutcome.id
    || outcome.epoch !== ownerOutcome.epoch || outcome.owner_outcome_sha256 !== ownerOutcome.sha256) {
    throw new Error("The Work question is stale against the current owner outcome.");
  }
  const windowMs = Date.parse(root.expiresAt) - Date.parse(root.queuedAt);
  if (!Number.isFinite(windowMs) || windowMs < MIN_WINDOW_MS || windowMs > MAX_WINDOW_MS) {
    throw new Error("The Work question has no safe answer window to reuse.");
  }
  return {
    pending, sourceEventId: source.eventId, threadId: source.data.thread_id, provenanceData: provenance.data, root, windowMs,
  };
}

/** The successor route and its provenance, named after the retirement that queues them. */
function successorEvents(
  basis: ReissueBasis,
  input: { worker: string; recordedAt: string; requestId: string },
  retirementId: string,
  policy: GitHubReceiptPolicy,
): { requestId: string; expiresAt: string; routeEventId: string; route: AppendEnvelope; provenance: AppendEnvelope } {
  const { worker, recordedAt, requestId } = input;
  const { root, sourceEventId, threadId, provenanceData } = basis;
  const successorId = `work-question:${sha256(canonicalJson({ reissue_of: requestId, retirement_event_id: retirementId })).slice(0, 32)}`;
  const nonce = `work-question-nonce:${sha256(`${successorId}:${root.ownerOutcome.sha256}`).slice(0, 32)}`;
  const expiresAt = new Date(Date.parse(recordedAt) + basis.windowMs).toISOString();
  // The answer must reach today's decision channel, which may have moved since the question was first queued.
  const githubReceipt = {
    repository: policy.repository,
    issueNumber: policy.decisionIssueNumber,
    stageIssueNumber: policy.stageIssueNumber,
  };
  const successorRoot = {
    ...root,
    requestId: successorId,
    nonce,
    queuedAt: recordedAt,
    expiresAt,
    githubReceipt,
    factualPacket: {
      ...root.factualPacket,
      packetId: `work-question-packet:${sha256(successorId).slice(0, 32)}`,
      supervisoryCycle: { ...root.factualPacket.supervisoryCycle, nonce, expiresAt, githubReceipt },
    },
  };
  const body = inBandRequestRoutePrefix + canonicalJson(successorRoot);
  if (body.length > 20_000) throw new Error("The reissued Work question exceeds the durable message limit.");
  const successorEventId = requestRouteEventId(successorId, 6);
  const route: AppendEnvelope = {
    schema_version: 2,
    event_id: successorEventId,
    mission_id: "mission-control-live",
    occurred_at: recordedAt,
    data: {
      type: "worker_message_recorded",
      worker,
      message_id: `message:${successorEventId}`,
      thread_id: threadId,
      message_kind: "QUESTION",
      body,
      reply_to_message_id: null,
      direction_id: null,
    },
  };
  const successorProvenanceId = `work-question-proof:${sha256(successorEventId).slice(0, 32)}`;
  const successorProvenance: AppendEnvelope = {
    schema_version: 2,
    event_id: successorProvenanceId,
    mission_id: "mission-control-live",
    occurred_at: recordedAt,
    data: {
      ...provenanceData,
      receipt_id: successorProvenanceId,
      refs: [
        ...provenanceData.refs.filter((ref) => !ref.startsWith("route_event:")
          && !ref.startsWith("reissue_of_request_route:") && !ref.startsWith("retirement_event:")),
        `route_event:${successorEventId}`,
        `reissue_of_request_route:${sourceEventId}`,
        `retirement_event:${retirementId}`,
      ],
    },
  };
  return { requestId: successorId, expiresAt, routeEventId: successorEventId, route, provenance: successorProvenance };
}

/** Producers that append the three reissue events, scoped to the exact worker and task. */
export function workQuestionReissueProducers(worker: string, taskId: string): {
  retirement: AuthenticatedProducer; route: AuthenticatedProducer; provenance: AuthenticatedProducer;
} {
  const scopes = { workerScopes: [worker], taskScopes: [taskId, `task:${worker}`] };
  return {
    retirement: { id: WORK_QUESTION_RETIREMENT_PRODUCER_ID, kind: "VERIFIER", ...scopes },
    route: { id: WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, kind: "SYSTEM", ...scopes },
    provenance: { ...workSupervisorQuestionCollector, ...scopes },
  };
}

/**
 * The reissue already recorded for this request, unsent or the owner's re-send: its retirement names the successor it
 * queued. Either one ends the question, so neither kind is recorded twice.
 */
export function recordedWorkQuestionReissue(events: readonly StoredEvent[], worker: string, requestId: string): {
  retirementEventId: string; requestId: string;
} | null {
  const retirement = [...events].reverse().find((event) => event.worker === worker
    && event.data.type === "evidence_receipt_recorded"
    && (event.data.summary === supervisoryRequestRetiredUnsentSummary
      || event.data.summary === supervisoryRequestRetiredAfterSendSummary)
    && event.data.producer_id === WORK_QUESTION_RETIREMENT_PRODUCER_ID
    && event.data.refs.includes(`request:${requestId}`));
  if (!retirement || retirement.data.type !== "evidence_receipt_recorded") return null;
  const successor = retirement.data.refs.find((ref) => ref.startsWith("successor_request:"))?.slice("successor_request:".length);
  return successor ? { retirementEventId: retirement.eventId, requestId: successor } : null;
}

export interface WorkQuestionReissueResult {
  status: "WORK_QUESTION_REISSUED" | "WORK_QUESTION_ALREADY_REISSUED";
  worker: string;
  retiredRequestId: string;
  requestId: string;
  expiresAt: string | null;
  retirementEventId: string;
  routeEventId: string;
  duplicate: boolean;
  providerSendBoundaryCrossed: false;
}

/**
 * Reissues one expired, never-sent Work question: the named one, or the worker's only one when none is named. The
 * proof is read after the request is chosen, the events are rebuilt from the store after it, and the retirement, the
 * successor route and its provenance are appended in one transaction. A repeated call for a request already reissued
 * reports the recorded successor and appends nothing.
 */
export async function reissueExpiredWorkQuestion(
  store: Pick<EventStore, "workerEvents" | "appendMany">,
  input: { worker: string; requestId?: string },
  proveRequestUnsent: (requestId: string) => Promise<ProvenUnsentSubmissionState>,
  policy: GitHubReceiptPolicy | null,
  now: () => string = () => new Date().toISOString(),
): Promise<WorkQuestionReissueResult> {
  const worker = input.worker;
  let requestId = input.requestId;
  if (requestId !== undefined && !WORK_QUESTION_REQUEST_ID.test(requestId)) {
    throw new Error("Reissue requires one exact work-question request ID.");
  }
  if (requestId === undefined) {
    const expired = expiredPendingWorkQuestions(store.workerEvents(worker), worker, now());
    if (expired.length !== 1) {
      throw new Error(`The worker has ${expired.length} expired pending Work questions; reissue needs exactly one, or one named request.`);
    }
    requestId = expired[0]!;
  }
  const recorded = recordedWorkQuestionReissue(store.workerEvents(worker), worker, requestId);
  if (recorded) {
    return {
      status: "WORK_QUESTION_ALREADY_REISSUED", worker, retiredRequestId: requestId, requestId: recorded.requestId,
      expiresAt: null, retirementEventId: recorded.retirementEventId, routeEventId: requestRouteEventId(recorded.requestId, 6),
      duplicate: true, providerSendBoundaryCrossed: false,
    };
  }
  const proof = await proveRequestUnsent(requestId);
  // Another call may have reissued it while the proof was read.
  const raced = recordedWorkQuestionReissue(store.workerEvents(worker), worker, requestId);
  if (raced) {
    return {
      status: "WORK_QUESTION_ALREADY_REISSUED", worker, retiredRequestId: requestId, requestId: raced.requestId,
      expiresAt: null, retirementEventId: raced.retirementEventId, routeEventId: requestRouteEventId(raced.requestId, 6),
      duplicate: true, providerSendBoundaryCrossed: false,
    };
  }
  const built = buildExpiredWorkQuestionReissue(store.workerEvents(worker), { worker, requestId, recordedAt: now() }, proof, policy);
  const producers = workQuestionReissueProducers(worker, built.taskId);
  const [retirement, route] = store.appendMany([
    { event: built.retirement, producer: producers.retirement },
    { event: built.route, producer: producers.route },
    { event: built.provenance, producer: producers.provenance },
  ]);
  return {
    status: "WORK_QUESTION_REISSUED", worker, retiredRequestId: requestId, requestId: built.requestId,
    expiresAt: built.expiresAt, retirementEventId: retirement!.eventId, routeEventId: route!.eventId,
    duplicate: false, providerSendBoundaryCrossed: false,
  };
}

export interface WorkQuestionResendResult {
  status: "WORK_QUESTION_RESENT" | "WORK_QUESTION_ALREADY_REISSUED";
  worker: string;
  retiredRequestId: string;
  requestId: string;
  expiresAt: string | null;
  retirementEventId: string;
  routeEventId: string;
  duplicate: boolean;
  /** What the submission authority recorded of the original's send; null when the call only reports an earlier one. */
  originalSendBoundary: "CROSSED" | "NOT_PROVEN_UNSENT" | null;
}

/**
 * The owner's one re-send of one named Work question whose answer window closed without an accepted answer (see
 * {@link buildSentWorkQuestionResend}). The proof is read after the request is named, the events are rebuilt from the
 * store after it, and the retirement, the successor route and its provenance are appended in one transaction. Nothing
 * is sent here: the relay sends the successor as a new question. A repeat, or a question already reissued unsent,
 * reports the recorded successor and appends nothing.
 */
export async function resendSentWorkQuestion(
  store: Pick<EventStore, "workerEvents" | "appendMany">,
  input: { worker: string; requestId: string; authorizedBy: string },
  proveRequestSendSettled: (requestId: string) => Promise<SettledSendSubmissionState>,
  policy: GitHubReceiptPolicy | null,
  now: () => string = () => new Date().toISOString(),
): Promise<WorkQuestionResendResult> {
  const { worker, requestId, authorizedBy } = input;
  if (!WORK_QUESTION_REQUEST_ID.test(requestId)) throw new Error("A re-send requires one exact work-question request ID.");
  const already = (recorded: { retirementEventId: string; requestId: string }): WorkQuestionResendResult => ({
    status: "WORK_QUESTION_ALREADY_REISSUED", worker, retiredRequestId: requestId, requestId: recorded.requestId,
    expiresAt: null, retirementEventId: recorded.retirementEventId, routeEventId: requestRouteEventId(recorded.requestId, 6),
    duplicate: true, originalSendBoundary: null,
  });
  const recorded = recordedWorkQuestionReissue(store.workerEvents(worker), worker, requestId);
  if (recorded) return already(recorded);
  const proof = await proveRequestSendSettled(requestId);
  // Another call may have reissued it while the proof was read.
  const raced = recordedWorkQuestionReissue(store.workerEvents(worker), worker, requestId);
  if (raced) return already(raced);
  const built = buildSentWorkQuestionResend(store.workerEvents(worker), { worker, requestId, recordedAt: now(), authorizedBy }, proof, policy);
  const producers = workQuestionReissueProducers(worker, built.taskId);
  const [retirement, route] = store.appendMany([
    { event: built.retirement, producer: producers.retirement },
    { event: built.route, producer: producers.route },
    { event: built.provenance, producer: producers.provenance },
  ]);
  return {
    status: "WORK_QUESTION_RESENT", worker, retiredRequestId: requestId, requestId: built.requestId,
    expiresAt: built.expiresAt, retirementEventId: retirement!.eventId, routeEventId: route!.eventId,
    duplicate: false, originalSendBoundary: proof.crossedAdmissionCount > 0 ? "CROSSED" : "NOT_PROVEN_UNSENT",
  };
}

function routeRoot(body: string): Record<string, any> | null {
  if (!body.startsWith(inBandRequestRoutePrefix)) return null;
  try {
    const value: unknown = JSON.parse(body.slice(inBandRequestRoutePrefix.length));
    return isRecord(value) ? value : null;
  } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsExactString(value: unknown, expected: string): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((item) => containsExactString(item, expected));
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((item) => containsExactString(item, expected));
}

function containsRequestReference(value: unknown, requestId: string): boolean {
  if (containsExactString(value, requestId)) return true;
  if (!isRecord(value)) return false;
  return Array.isArray(value.refs) && value.refs.includes(`request:${requestId}`);
}
