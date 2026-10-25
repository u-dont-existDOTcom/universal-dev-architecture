// The owner's one correction of a Work owner-continuation whose supervisor answer was sent, came back, and was rejected.
//
// A Work owner-continuation asks the supervisor to apply the owner's answer to a Work question. Its answer must echo the
// continuation binding byte for byte. On 24 October the supervisor answered one such request once, but copied one
// binding digest with 63 hexadecimal characters instead of 64, so Mission Control's canonical decision parser rejects the
// answer and nothing was admitted. The request was sent, so the unsent context refresh can't renew it, and Mission
// Control never repairs or ingests a supervisor's authorization that someone else edited.
//
// This retires the sent request after its exact rejected answer is shown to be the one a trusted readback recorded for
// the request's own delivered session, and queues one successor to the same supervisor: the same owner answer,
// evidence capsule, owner outcome, Work thread and recovered source bounds, a fresh continuation binding with a fresh
// answer window of the same length, and the rejected answer's lineage (digests and the parser's failed fields, never
// its bytes). The supervisor answers the successor afresh; only a valid answer to it can be admitted. Nothing is sent
// here: the relay sends the successor as a new request. A repeat reports the recorded successor and appends nothing.
import { canonicalJson, sha256 } from "./canonical";
import {
  admittedCycleRequests,
  parseCanonicalDecisionComment,
  pendingDecisionRequests,
  providerSessionSummary,
  type GitHubReceiptPolicy,
  type PendingDecisionRequest,
} from "./github-decision-receipts";
import {
  inBandBrowserDomReadbackProducerId,
  inBandBrowserDomReadbackSummary,
  inBandPreSendSummary,
  inBandRequestRoutePrefix,
  inBandTransportEvidence,
} from "./in-band-request-binding";
import type { AuthenticatedProducer } from "./ingestion-auth";
import { WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID } from "./owner-question-route";
import { deriveOwnerResponseContinuation } from "./owner-response-continuation";
import { parseRouteContinuation } from "./owner-response-continuation-schema";
import { requestRouteEventId } from "./request-bound-supervision";
import type { AppendEnvelope, StoredEvent } from "./schema";
import type { EventStore } from "./store";
import {
  supervisoryRequestRetiredAfterRejectedResponseSummary,
  validSettledSendProof,
  WORK_CONTINUATION_REQUEST_ID,
  WORK_QUESTION_RETIREMENT_PRODUCER_ID,
  type SettledSendSubmissionState,
} from "./unsent-request-proof";

export const WORK_CONTINUATION_CORRECTION_AUTHORIZATION = "OWNER_EXPLICIT_ONE_CORRECTION";
export const WORK_CONTINUATION_CORRECTION_REASON = "SUPERVISOR_RESPONSE_REJECTED_BY_CANONICAL_PARSER";
const MIN_WINDOW_MS = 60_000;
const MAX_WINDOW_MS = 24 * 60 * 60_000;
const MAX_REJECTED_RESPONSE_BYTES = 200_000;

export interface WorkContinuationCorrectionInput {
  worker: string;
  requestId: string;
  /** The trusted readback evidence that recorded the rejected answer's exact bytes. */
  readbackEventId: string;
  /** The rejected answer's exact bytes; checked against the readback's digest and never stored. */
  rejectedResponseBody: string;
  authorizedBy: string;
}

export interface BuiltWorkContinuationCorrection {
  taskId: string;
  retiredRequestId: string;
  requestId: string;
  queuedAt: string;
  expiresAt: string;
  rejectedResponseSha256: string;
  rejectedFieldPaths: string[];
  retirement: AppendEnvelope;
  route: AppendEnvelope;
}

export interface WorkContinuationCorrectionResult {
  status: "WORK_CONTINUATION_CORRECTION_QUEUED" | "WORK_CONTINUATION_ALREADY_CORRECTED";
  worker: string;
  retiredRequestId: string;
  requestId: string;
  expiresAt: string | null;
  retirementEventId: string;
  routeEventId: string;
  rejectedResponseSha256: string | null;
  duplicate: boolean;
  providerSendBoundaryCrossed: boolean | null;
  historicalRequestPreserved: true;
  rejectedResponseAdmitted: false;
}

/** The correction already recorded for this request: its retirement names the successor it queued. */
export function recordedWorkContinuationCorrection(events: readonly StoredEvent[], worker: string, requestId: string): {
  retirementEventId: string; requestId: string; rejectedResponseSha256: string | null;
} | null {
  const retirements = events.filter((event) => event.worker === worker
    && event.producerKind === "VERIFIER" && event.producerId === WORK_QUESTION_RETIREMENT_PRODUCER_ID
    && event.data.type === "evidence_receipt_recorded"
    && event.data.summary === supervisoryRequestRetiredAfterRejectedResponseSummary
    && event.data.refs.includes(`request:${requestId}`));
  const retirement = retirements.at(-1);
  if (!retirement || retirement.data.type !== "evidence_receipt_recorded") return null;
  const successor = one(retirement.data.refs, "successor_request:");
  return successor ? { retirementEventId: retirement.eventId, requestId: successor,
    rejectedResponseSha256: one(retirement.data.refs, "rejected_response_sha256:") } : null;
}

/**
 * Builds the retirement and the successor. Refuses unless: the request is one trusted, current owner-continuation route
 * with no successor, decision, or newer directive, Work dispatch or decision for the worker; the submission authority
 * shows it sent (at least one crossed admission) with no send of it still open; the relay's receipts show it sent once
 * in one session and that session completed; one trusted readback of that session, for the exact delivered prompt,
 * recorded the given bytes; and Mission Control's canonical decision parser rejects those bytes. The successor keeps
 * the source route's factual packet and evidence capsule and derives a fresh continuation binding from the current
 * events, so the owner answer, outcome and supervisor are checked again.
 */
export function buildWorkContinuationCorrection(
  events: readonly StoredEvent[],
  input: WorkContinuationCorrectionInput & { recordedAt: string },
  sendProof: SettledSendSubmissionState | undefined,
  policy: GitHubReceiptPolicy | null,
): BuiltWorkContinuationCorrection {
  if (!policy?.requestBound?.enabled) {
    throw new Error("Correcting a Work continuation requires the configured in-band request-bound relay policy.");
  }
  const { worker, requestId, recordedAt } = input;
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(worker) || !WORK_CONTINUATION_REQUEST_ID.test(requestId)) {
    throw new Error("A correction requires one exact worker and work-owner-continuation request ID.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,179}$/.test(input.authorizedBy)) throw new Error("The correction needs the authorizing owner identity.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,179}$/.test(input.readbackEventId)) throw new Error("The correction needs one exact readback event ID.");
  if (typeof input.rejectedResponseBody !== "string" || !input.rejectedResponseBody.length
    || Buffer.byteLength(input.rejectedResponseBody, "utf8") > MAX_REJECTED_RESPONSE_BYTES) {
    throw new Error("The correction needs the rejected answer's exact bytes.");
  }
  if (!Number.isFinite(Date.parse(recordedAt))) throw new Error("The correction time must be an ISO timestamp.");
  const history = events.filter((event) => event.worker === worker);
  if (recordedWorkContinuationCorrection(history, worker, requestId)) throw new Error("The Work continuation was already corrected.");

  // The source route: trusted, original kind, still an owner-continuation, never answered, superseded or retired.
  const routeEventId = requestRouteEventId(requestId, 6);
  const sources = history.filter((event) => event.eventId === routeEventId);
  const source = sources.length === 1 ? sources[0]! : null;
  if (!source || source.data.type !== "worker_message_recorded" || source.producerKind !== "SYSTEM"
    || source.producerId !== WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID || !source.data.body.startsWith(inBandRequestRoutePrefix)) {
    throw new Error("The exact trusted owner-continuation route is missing.");
  }
  let root: Record<string, any>;
  try { root = JSON.parse(source.data.body.slice(inBandRequestRoutePrefix.length)); } catch { throw new Error("The owner-continuation route is unreadable."); }
  const continuation = (() => { try { return parseRouteContinuation(root); } catch { return undefined; } })();
  if (!continuation || root.schemaVersion !== 6 || root.requestId !== requestId || root.worker !== worker
    || root.producerId !== WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID || root.actionBlockedOrRouted !== "OWNER_RESPONSE_REVIEW"
    || "supersedesRequestId" in root || "supersession" in root
    || !isRecord(root.factualPacket) || !isRecord(root.factualPacket.supervisoryCycle)
    || typeof root.factualPacket.exactFactualState !== "string" || typeof root.factualPacket.decisionRequested !== "string"
    || typeof root.factualPacket.taskId !== "string") {
    throw new Error("Only a trusted Work owner-continuation route may be corrected.");
  }
  const admitted = admittedCycleRequests(history).admitted.filter((request) => request.requestId === requestId);
  if (admitted.length !== 1) throw new Error("The owner-continuation is not one admitted request.");
  const request = admitted[0]!;
  if (!pendingDecisionRequests(history).some((pending) => pending.requestId === requestId)) {
    throw new Error("The owner-continuation was answered, superseded or retired; it can't be corrected.");
  }
  if (history.some((event) => event.data.type === "github_decision_receipt_ingested" && event.data.request_id === requestId)) {
    throw new Error("The owner-continuation already has an admitted decision.");
  }
  if (history.some((event) => event.sequence > source.sequence
    && ["execution_directive_recorded", "chatgpt_work_cloud_dispatch_requested", "github_decision_receipt_ingested"].includes(event.data.type))) {
    throw new Error("A newer directive, Work dispatch or decision makes this owner continuation stale.");
  }
  const windowMs = Date.parse(root.expiresAt) - Date.parse(root.queuedAt);
  if (!Number.isFinite(windowMs) || windowMs < MIN_WINDOW_MS || windowMs > MAX_WINDOW_MS) {
    throw new Error("The owner continuation has no safe answer window to reuse.");
  }
  if (Date.parse(recordedAt) <= Date.parse(root.queuedAt)) throw new Error("The correction must follow the corrected request.");

  // Sent, and settled: the submission authority's own record, then the relay's receipts for the one delivered session.
  if (!validSettledSendProof(sendProof, requestId) || sendProof!.crossedAdmissionCount < 1) {
    throw new Error("Submission authority did not show the owner continuation sent with no send of it still open.");
  }
  const transport = inBandTransportEvidence(history, request, policy, recordedAt);
  if (!transport || transport.duplicateSend || !transport.providerSessionId || !transport.finishedAt) {
    throw new Error("The relay's receipts don't show the owner continuation sent once and finished in one session.");
  }
  const sessionId = transport.providerSessionId;
  const trustedRelay = (event: StoredEvent) => event.data.type === "evidence_receipt_recorded" && event.data.verified === true
    && event.producerKind === "COLLECTOR" && policy.requestBound!.relayProducerIds.includes(event.producerId)
    && event.data.producer_id === event.producerId && event.data.producer_role === "COLLECTOR"
    && one(event.data.refs, "request:") === requestId && one(event.data.refs, "supervisor:") === request.supervisorId
    && one(event.data.refs, "provider_session:") === sessionId;
  const completeSessions = history.filter((event) => trustedRelay(event) && event.data.type === "evidence_receipt_recorded"
    && event.data.summary === providerSessionSummary && event.data.refs.includes("lifecycle_status:COMPLETE"));
  if (completeSessions.length < 1) throw new Error("The relay recorded no COMPLETE session for the owner continuation.");
  const prompts = new Set(history.filter((event) => trustedRelay(event) && event.data.type === "evidence_receipt_recorded"
    && event.data.summary === inBandPreSendSummary).map((event) => event.data.type === "evidence_receipt_recorded"
    ? one(event.data.refs, "provider_body_sha256:") : null));
  const promptSha256 = prompts.size === 1 ? [...prompts][0] : null;
  if (!promptSha256 || !/^[a-f0-9]{64}$/.test(promptSha256)) throw new Error("The delivered prompt of the owner continuation is not one exact digest.");

  // The rejected answer: exactly the bytes one trusted readback recorded for that session and prompt.
  const rejectedResponseSha256 = sha256(input.rejectedResponseBody);
  const readbacks = history.filter((event) => event.eventId === input.readbackEventId);
  const readback = readbacks.length === 1 ? readbacks[0]! : null;
  if (!readback || readback.data.type !== "evidence_receipt_recorded" || readback.data.verified !== true
    || readback.producerKind !== "COLLECTOR" || readback.producerId !== inBandBrowserDomReadbackProducerId
    || readback.data.producer_id !== readback.producerId || readback.data.producer_role !== "COLLECTOR"
    || readback.data.summary !== inBandBrowserDomReadbackSummary
    || one(readback.data.refs, "request:") !== requestId || one(readback.data.refs, "supervisor:") !== request.supervisorId
    || one(readback.data.refs, "provider_session:") !== sessionId || one(readback.data.refs, "status:") !== "COMPLETE"
    || one(readback.data.refs, "provider_prompt_sha256:") !== promptSha256
    || one(readback.data.refs, "semantic_authority:") !== "false"
    || one(readback.data.refs, "machine_block_sha256:") !== rejectedResponseSha256
    || readback.data.exact_candidate_sha256 !== rejectedResponseSha256
    || Date.parse(readback.occurredAt) < Date.parse(transport.finishedAt)) {
    throw new Error("The rejected answer is not exactly what one trusted readback recorded for the delivered session and prompt.");
  }
  // Mission Control's own parser must refuse those bytes. An answer it parses is out of this correction's scope.
  let rejection: string | null = null;
  try { parseCanonicalDecisionComment(input.rejectedResponseBody); } catch (error) { rejection = error instanceof Error ? error.message : String(error); }
  if (rejection === null) throw new Error("Mission Control's canonical parser accepts the answer; only a parser-rejected answer may be corrected.");
  const rejectedFieldPaths = failedFieldPaths(rejection);
  const validationErrorSha256 = sha256(rejection);

  const outcome = [...history].reverse().find((event) => event.data.type === "owner_outcome_recorded")?.data;
  if (!outcome || outcome.type !== "owner_outcome_recorded" || outcome.owner_outcome_id !== request.ownerOutcome.id
    || outcome.epoch !== request.ownerOutcome.epoch || outcome.owner_outcome_sha256 !== request.ownerOutcome.sha256) {
    throw new Error("The owner continuation is stale against the current owner outcome.");
  }

  // The successor: same supervisor, owner answer, facts and capsule; fresh binding and window; the rejection's lineage.
  const expiresAt = new Date(Date.parse(recordedAt) + windowMs).toISOString();
  const fresh = deriveOwnerResponseContinuation(history, {
    worker,
    resumeDecisionRequestId: continuation.binding.decision_request_id,
    supervisorId: request.supervisorId,
    ownerOutcome: request.ownerOutcome,
    evidenceCapsule: request.evidenceCapsule,
    issuedAt: recordedAt,
    expiresAt,
  }, recordedAt);
  const retirementId = `supervisory-request-retired-after-rejected-response:${sha256(canonicalJson({
    request_id: requestId, rejected_response_sha256: rejectedResponseSha256, send_proof_sha256: sendProof!.proofSha256,
  })).slice(0, 32)}`;
  const successorId = `work-owner-continuation:${sha256(canonicalJson({
    correction_of: requestId, retirement_event_id: retirementId, continuation_id: fresh.binding.continuation_id,
  })).slice(0, 32)}`;
  const nonce = `work-owner-continuation-nonce:${sha256(`${successorId}:${request.ownerOutcome.sha256}`).slice(0, 32)}`;
  const githubReceipt = { repository: policy.repository, issueNumber: policy.decisionIssueNumber, stageIssueNumber: policy.stageIssueNumber };
  const correctionNote = [
    `Correction: your earlier answer to ${requestId} (SHA-256 ${rejectedResponseSha256}) was not admitted, because Mission Control's canonical decision parser rejected it`
      + (rejectedFieldPaths.length ? ` at ${rejectedFieldPaths.join(", ")}.` : "."),
    "That answer is preserved unchanged and is not authority; nobody has edited or repaired it, and nothing in it, including any deadline it proposed, was admitted.",
    "Answer this request afresh with one complete canonical decision that echoes this request's continuation binding and digests exactly, every SHA-256 as 64 lowercase hexadecimal characters.",
    "Any execution deadline must be set afresh and lie in the future.",
  ].join(" ");
  const successorRoot = {
    ...root,
    requestId: successorId,
    nonce,
    queuedAt: recordedAt,
    expiresAt,
    githubReceipt,
    correctionOfRequestId: requestId,
    rejectedResponse: {
      canonicalBodySha256: rejectedResponseSha256,
      validationErrorSha256,
      failedFieldPaths: rejectedFieldPaths,
      readbackEventId: readback.eventId,
      providerSessionId: sessionId,
      providerPromptSha256: promptSha256,
      admitted: false,
    },
    factualPacket: {
      ...root.factualPacket,
      packetId: `work-owner-continuation-packet:${sha256(successorId).slice(0, 32)}`,
      decisionRequested: `${root.factualPacket.decisionRequested} ${correctionNote}`,
      supervisoryCycle: { ...root.factualPacket.supervisoryCycle, nonce, expiresAt, githubReceipt, evidenceCapsule: request.evidenceCapsule },
    },
    continuationBinding: fresh.binding,
    continuationBindingSha256: fresh.digest,
    continuationOwnerResponseExactText: fresh.exactOwnerResponseText,
  };
  const body = inBandRequestRoutePrefix + canonicalJson(successorRoot);
  if (body.length > 20_000) throw new Error("The corrected owner continuation exceeds the durable message limit.");
  const successorEventId = requestRouteEventId(successorId, 6);
  const route: AppendEnvelope = {
    schema_version: 2, event_id: successorEventId, mission_id: "mission-control-live", occurred_at: recordedAt,
    data: {
      type: "worker_message_recorded", worker, message_id: `message:${successorEventId}`, thread_id: source.data.thread_id,
      message_kind: "QUESTION", body, reply_to_message_id: null, direction_id: null,
    },
  };
  const retirement: AppendEnvelope = {
    schema_version: 2, event_id: retirementId, mission_id: "mission-control-live", occurred_at: recordedAt,
    data: {
      type: "evidence_receipt_recorded", worker, receipt_id: retirementId,
      producer_id: WORK_QUESTION_RETIREMENT_PRODUCER_ID, producer_role: "VERIFIER",
      evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT",
      exact_candidate_sha256: rejectedResponseSha256, summary: supervisoryRequestRetiredAfterRejectedResponseSummary,
      refs: [
        `request:${requestId}`, `source_route_event:${source.eventId}`,
        `successor_request:${successorId}`, `successor_route_event:${successorEventId}`,
        `submission_authority_proof_sha256:${sendProof!.proofSha256}`, `submission_authority_pacing_domain:${sendProof!.pacingDomain}`,
        `submission_authority_admission_records:${sendProof!.admissions.length}`,
        `submission_authority_crossed_admissions:${sendProof!.crossedAdmissionCount}`,
        "submission_authority_open_records:0", "provider_send_boundary:CROSSED",
        `provider_session:${sessionId}`, `provider_prompt_sha256:${promptSha256}`,
        `readback_event:${readback.eventId}`, `rejected_response_sha256:${rejectedResponseSha256}`,
        `validation_error_sha256:${validationErrorSha256}`,
        ...rejectedFieldPaths.map((path) => `rejected_field:${path}`),
        `retirement_reason:${WORK_CONTINUATION_CORRECTION_REASON}`, "lifecycle_status:RETIRED_AFTER_REJECTED_RESPONSE",
        "decision_receipts_ingested:0", "canonical_decision_admitted:false",
        `authorization:${WORK_CONTINUATION_CORRECTION_AUTHORIZATION}`, `authorized_by:${input.authorizedBy}`,
        "historical_request_preserved:true", "rejected_response_preserved_unchanged:true",
      ],
      verified: true, changed_path_manifest: null,
    },
  };
  return {
    taskId: request.taskId, retiredRequestId: requestId, requestId: successorId, queuedAt: recordedAt, expiresAt,
    rejectedResponseSha256, rejectedFieldPaths, retirement, route,
  };
}

/**
 * The owner's one correction (see {@link buildWorkContinuationCorrection}). The send proof is read after the request is
 * named; the events are reread after it; the retirement and the successor are appended in one transaction. A repeat,
 * also one racing this call, reports the recorded successor and appends nothing; a repeat naming different rejected
 * bytes is refused.
 */
export async function correctRejectedWorkContinuation(
  store: Pick<EventStore, "workerEvents" | "appendMany">,
  input: WorkContinuationCorrectionInput,
  proveRequestSendSettled: (requestId: string) => Promise<SettledSendSubmissionState>,
  policy: GitHubReceiptPolicy | null,
  now: () => string = () => new Date().toISOString(),
): Promise<WorkContinuationCorrectionResult> {
  const { worker, requestId } = input;
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(worker) || !WORK_CONTINUATION_REQUEST_ID.test(requestId)) {
    throw new Error("A correction requires one exact worker and work-owner-continuation request ID.");
  }
  const already = (recorded: NonNullable<ReturnType<typeof recordedWorkContinuationCorrection>>): WorkContinuationCorrectionResult => {
    if (recorded.rejectedResponseSha256 !== sha256(input.rejectedResponseBody ?? "")) {
      throw new Error("This Work continuation was already corrected for a different rejected answer.");
    }
    return {
      status: "WORK_CONTINUATION_ALREADY_CORRECTED", worker, retiredRequestId: requestId, requestId: recorded.requestId,
      expiresAt: null, retirementEventId: recorded.retirementEventId, routeEventId: requestRouteEventId(recorded.requestId, 6),
      rejectedResponseSha256: recorded.rejectedResponseSha256, duplicate: true, providerSendBoundaryCrossed: null,
      historicalRequestPreserved: true, rejectedResponseAdmitted: false,
    };
  };
  const recorded = recordedWorkContinuationCorrection(store.workerEvents(worker), worker, requestId);
  if (recorded) return already(recorded);
  const proof = await proveRequestSendSettled(requestId);
  const raced = recordedWorkContinuationCorrection(store.workerEvents(worker), worker, requestId);
  if (raced) return already(raced);
  const built = buildWorkContinuationCorrection(store.workerEvents(worker), { ...input, recordedAt: now() }, proof, policy);
  const scopes = { workerScopes: [worker], taskScopes: [built.taskId, `task:${worker}`] };
  const producers: { retirement: AuthenticatedProducer; route: AuthenticatedProducer } = {
    retirement: { id: WORK_QUESTION_RETIREMENT_PRODUCER_ID, kind: "VERIFIER", ...scopes },
    route: { id: WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, kind: "SYSTEM", ...scopes },
  };
  const [retirement, route] = store.appendMany([
    { event: built.retirement, receivedAt: built.queuedAt, producer: producers.retirement },
    { event: built.route, receivedAt: built.queuedAt, producer: producers.route },
  ]);
  const active = pendingDecisionRequests(store.workerEvents(worker));
  if (active.some((item) => item.requestId === requestId) || active.filter((item) => item.requestId === built.requestId).length !== 1) {
    throw new Error("The correction did not atomically retire the sent request and admit exactly one successor.");
  }
  return {
    status: "WORK_CONTINUATION_CORRECTION_QUEUED", worker, retiredRequestId: requestId, requestId: built.requestId,
    expiresAt: built.expiresAt, retirementEventId: retirement!.eventId, routeEventId: route!.eventId,
    rejectedResponseSha256: built.rejectedResponseSha256, duplicate: false, providerSendBoundaryCrossed: true,
    historicalRequestPreserved: true, rejectedResponseAdmitted: false,
  };
}

/** The structural field paths a schema refusal names (never values), at most five. */
function failedFieldPaths(message: string): string[] {
  try {
    const issues = JSON.parse(message);
    if (!Array.isArray(issues)) return [];
    const paths = issues.flatMap((issue) => Array.isArray(issue?.path) && issue.path.length
      && issue.path.every((part: unknown) => typeof part === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(part)
        || Number.isInteger(part))
      ? [issue.path.join(".")] : []);
    return [...new Set(paths)].slice(0, 5);
  } catch { return []; }
}

function one(refs: readonly string[], prefix: string): string | null {
  const values = refs.filter((ref) => ref.startsWith(prefix)).map((ref) => ref.slice(prefix.length));
  return values.length === 1 ? values[0]! : null;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export type { PendingDecisionRequest };
