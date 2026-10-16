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
import {
  inBandAppReadbackSummary,
  inBandBrowserDomReadbackSummary,
  inBandMachineTransformSummary,
  inBandRequestRoutePrefix,
} from "./in-band-request-binding";
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
  const basis = reissueBasis(events, input, policy, "UNSENT", () => {
    if (!validUnsentSubmissionProof(submissionProof, input.requestId)) {
      throw new Error("Submission authority did not prove the expired Work question unsent.");
    }
  });
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
 *
 * A reply the relay saw finish refuses the re-send, because the app-owned readback could still carry it in. When no
 * readback route can reach it, the owner may discard it explicitly (`discardFinishedReply`): the retirement records
 * `finished_reply:DISCARDED_BY_OWNER`, and the reply can then never be taken in. A readback or digest-only transform of
 * the reply always refuses the re-send. Before a discard, {@link resendSentWorkQuestion} awaits the daemon's GitHub
 * reconciliation ({@link reconcileBeforeDiscard}), so a reply already posted is taken in rather than discarded.
 */
export function buildSentWorkQuestionResend(
  events: readonly StoredEvent[],
  input: { worker: string; requestId: string; recordedAt: string; authorizedBy: string; discardFinishedReply?: boolean },
  sendProof: SettledSendSubmissionState | undefined,
  policy: GitHubReceiptPolicy | null,
): ExpiredWorkQuestionReissue & { finishedReplyDiscarded: boolean } {
  const basis = reissueBasis(events, input, policy, "SENT", () => {
    if (!validSettledSendProof(sendProof, input.requestId)) {
      throw new Error("Submission authority did not show the Work question sent with no send of it still open.");
    }
  }, { discardFinishedReply: input.discardFinishedReply });
  // The daemon's producer-identity pattern.
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,179}$/.test(input.authorizedBy)) {
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
        ...(basis.finishedReplyDiscarded ? ["finished_reply:DISCARDED_BY_OWNER", "finished_reply_readback:NONE"] : []),
      ],
      verified: true,
      changed_path_manifest: null,
    },
  };
  return {
    taskId: basis.pending.taskId, retiredRequestId: requestId, requestId: successor.requestId,
    queuedAt: recordedAt, expiresAt: successor.expiresAt, retirement, route: successor.route, provenance: successor.provenance,
    finishedReplyDiscarded: basis.finishedReplyDiscarded,
  };
}

interface ReissueBasis {
  pending: PendingDecisionRequest;
  sourceEventId: string;
  threadId: string;
  provenanceData: Extract<MissionControlEvent, { type: "evidence_receipt_recorded" }>;
  root: Record<string, any>;
  windowMs: number;
  /** The relay saw a reply finish, nothing read it back, and the owner chose to discard it with this re-send. */
  finishedReplyDiscarded: boolean;
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
  checkSubmissionProof: () => void,
  options: { discardFinishedReply?: boolean } = {},
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
  checkSubmissionProof();

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
  // A reply the relay saw finish, or one already read back, can still be accepted after the window; retiring the
  // question would throw that answer away. The owner may discard a finished reply that nothing read back (for example
  // when no readback route can reach it); a readback, which can still carry the answer in, always stops the re-send.
  const finished = kind === "SENT" ? history.filter((event) => answerMayStillBeAccepted(event, requestId)) : [];
  if (finished.length > 0 && (options.discardFinishedReply !== true || finished.some(isReadback))) {
    throw new Error(options.discardFinishedReply === true
      ? "A reply to the Work question was read back; it may still be accepted, so it is not discarded or re-sent."
      : "A reply to the Work question finished or was read back; it may still be accepted, so it is not re-sent.");
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
    finishedReplyDiscarded: finished.length > 0,
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
 * The reissue already recorded for this request (by default the unsent one; the owner's re-send also looks for its own
 * kind): its retirement names the successor it queued.
 */
export function recordedWorkQuestionReissue(events: readonly StoredEvent[], worker: string, requestId: string,
  kinds: readonly ("UNSENT" | "AFTER_SEND")[] = ["UNSENT"]): {
  retirementEventId: string; requestId: string;
} | null {
  const summaries: string[] = kinds.map((kind) => kind === "UNSENT"
    ? supervisoryRequestRetiredUnsentSummary : supervisoryRequestRetiredAfterSendSummary);
  const retirement = [...events].reverse().find((event) => event.worker === worker
    && event.data.type === "evidence_receipt_recorded"
    && summaries.includes(event.data.summary)
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
  /** True when this call discarded a finished reply that nothing read back, at the owner's explicit choice; null when the
   * call only reports an earlier re-send. */
  finishedReplyDiscarded: boolean | null;
}

/**
 * The owner's one re-send of one named Work question whose answer window closed without an accepted answer (see
 * {@link buildSentWorkQuestionResend}). The proof is read after the request is named, the events are rebuilt from the
 * store after it, and the retirement, the successor route and its provenance are appended in one transaction. Nothing
 * is sent here: the relay sends the successor as a new question. A repeat, or a question already reissued unsent,
 * reports the recorded successor and appends nothing. It refuses a question whose reply finished or was read back,
 * since that answer can still be accepted, unless the owner discards a finished reply that nothing read back.
 */
export async function resendSentWorkQuestion(
  store: Pick<EventStore, "workerEvents" | "appendMany">,
  input: { worker: string; requestId: string; authorizedBy: string; discardFinishedReply?: boolean },
  proveRequestSendSettled: (requestId: string) => Promise<SettledSendSubmissionState>,
  policy: GitHubReceiptPolicy | null,
  now: () => string = () => new Date().toISOString(),
  beforeDiscard: (() => Promise<void>) | null = null,
): Promise<WorkQuestionResendResult> {
  const { worker, requestId, authorizedBy } = input;
  if (!WORK_QUESTION_REQUEST_ID.test(requestId)) throw new Error("A re-send requires one exact work-question request ID.");
  const already = (recorded: { retirementEventId: string; requestId: string }): WorkQuestionResendResult => ({
    status: "WORK_QUESTION_ALREADY_REISSUED", worker, retiredRequestId: requestId, requestId: recorded.requestId,
    expiresAt: null, retirementEventId: recorded.retirementEventId, routeEventId: requestRouteEventId(recorded.requestId, 6),
    duplicate: true, originalSendBoundary: null, finishedReplyDiscarded: null,
  });
  const kinds = ["UNSENT", "AFTER_SEND"] as const;
  const recorded = recordedWorkQuestionReissue(store.workerEvents(worker), worker, requestId, kinds);
  if (recorded) return already(recorded);
  if (input.discardFinishedReply === true && !beforeDiscard) {
    throw new DiscardReconciliationError("A discard needs a GitHub reconciliation first, and none was given.");
  }
  const proof = await proveRequestSendSettled(requestId);
  // Before a discard, one GitHub reconciliation takes in a reply already posted (the build below then finds the
  // question answered). It is the last await before the retirement, which is built and appended synchronously after it;
  // a repeat of a recorded re-send was answered above without waiting for it.
  if (input.discardFinishedReply === true) await beforeDiscard!();
  // Another call may have reissued it while the proof or the reconciliation was read.
  const raced = recordedWorkQuestionReissue(store.workerEvents(worker), worker, requestId, kinds);
  if (raced) return already(raced);
  const built = buildSentWorkQuestionResend(store.workerEvents(worker),
    { worker, requestId, recordedAt: now(), authorizedBy, discardFinishedReply: input.discardFinishedReply === true }, proof, policy);
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
    finishedReplyDiscarded: built.finishedReplyDiscarded,
  };
}

export class DiscardReconciliationError extends Error {}

/**
 * Before the owner's discard: one completed GitHub reconciliation pass, so a reply another writer already posted is
 * taken in rather than thrown away (the discard then finds the question answered, not pending). A pass already running
 * may have started before that reply was posted, so it waits for one of its own. No reconciliation, a failed pass or one
 * that stays busy stops the discard; nothing is retired.
 */
export async function reconcileBeforeDiscard(
  coordinator: { run: (trigger: "OWNER_RECOVERY") => Promise<{ status: "COMPLETED" | "ALREADY_RUNNING" }> } | null,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 20,
): Promise<void> {
  if (!coordinator) throw new DiscardReconciliationError("A discard needs a GitHub reconciliation first, and reconciliation is not configured.");
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let result: { status: "COMPLETED" | "ALREADY_RUNNING" };
    try {
      result = await coordinator.run("OWNER_RECOVERY");
    } catch {
      throw new DiscardReconciliationError("The GitHub reconciliation before the discard failed, so nothing was discarded.");
    }
    if (result.status === "COMPLETED") return;
    await wait(3_000);
  }
  throw new DiscardReconciliationError("GitHub reconciliation stayed busy, so nothing was discarded; try again in a minute.");
}

/**
 * The discard's last step before the retirement: read the decision issue itself and refuse when any comment there names
 * the question. Reconciliation may have read the issue before a reply was posted, and once the question is retired no
 * reply to it can be taken in, so a reply already on GitHub always stops the discard (reconciliation takes it in).
 */
export async function assertNoDecisionCommentFor(options: {
  repository: string;
  decisionIssueNumber: number;
  requestId: string;
  since: string | null;
  tokenProvider: (() => Promise<string | undefined>) | null;
  fetchImpl?: typeof fetch;
  maxPages?: number;
}): Promise<void> {
  const token = options.tokenProvider ? await options.tokenProvider() : undefined;
  if (!token) throw new DiscardReconciliationError("A discard needs to read the decision issue on GitHub first, and no GitHub reader is configured.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const since = options.since && Number.isFinite(Date.parse(options.since)) ? `&since=${encodeURIComponent(options.since)}` : "";
  const headers = {
    accept: "application/vnd.github+json", authorization: `Bearer ${token}`,
    "user-agent": "mission-control-discard-check", "x-github-api-version": "2022-11-28",
  };
  for (let page = 1; page <= (options.maxPages ?? 50); page += 1) {
    const response = await fetchImpl(`https://api.github.com/repos/${options.repository}/issues/${options.decisionIssueNumber}/comments?per_page=100${since}&page=${page}`,
      { headers, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!response?.ok) throw new DiscardReconciliationError("The decision issue could not be read on GitHub, so nothing was discarded.");
    const comments = await response.json().catch(() => null) as unknown;
    if (!Array.isArray(comments)) throw new DiscardReconciliationError("The decision issue could not be read on GitHub, so nothing was discarded.");
    if (comments.some((comment) => typeof (comment as { body?: unknown })?.body === "string"
      && ((comment as { body: string }).body).includes(options.requestId))) {
      throw new DiscardReconciliationError("A comment on the decision issue names this question, so its reply is not discarded; reconciliation can take it in.");
    }
    if (comments.length < 100) return;
  }
  throw new DiscardReconciliationError("The decision issue has too many comments to check, so nothing was discarded.");
}

/** The readbacks and the digest-only transform of a reply: evidence that can still carry the answer in. */
const READBACK_SUMMARIES: readonly string[] = [inBandAppReadbackSummary, inBandBrowserDomReadbackSummary, inBandMachineTransformSummary];

function isReadback(event: StoredEvent): boolean {
  return event.data.type === "evidence_receipt_recorded" && READBACK_SUMMARIES.includes(event.data.summary);
}

/** Any record that the reply to this question finished or was read back: the relay's completion, or a readback. */
function answerMayStillBeAccepted(event: StoredEvent, requestId: string): boolean {
  const data = event.data;
  if (data.type !== "evidence_receipt_recorded" || !data.refs.includes(`request:${requestId}`)) return false;
  return isReadback(event) || data.refs.includes("generation_state:COMPLETE") || data.refs.includes("lifecycle_status:COMPLETE");
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
