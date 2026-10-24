import { canonicalJson, sha256 } from "./canonical";
import { pendingDecisionRequests, type GitHubReceiptPolicy } from "./github-decision-receipts";
import { inBandRequestRoutePrefix } from "./in-band-request-binding";
import {
  buildOwnerAnswerContinuationContextRefreshRoute,
  WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID,
} from "./owner-question-route";
import { requestRouteEventId } from "./request-bound-supervision";
import type { AppendEnvelope, StoredEvent } from "./schema";
import type { EventStore } from "./store";
import {
  retiredUnsentRequests, supervisoryRequestRetiredUnsentSummary, validUnsentSubmissionProof,
  WORK_CONTINUATION_REQUEST_ID, WORK_QUESTION_RETIREMENT_PRODUCER_ID, type ProvenUnsentSubmissionState,
} from "./unsent-request-proof";

const REASON = "OWNER_CONTINUATION_SOURCE_BOUNDS_RECOVERED";

function rootOf(event: StoredEvent): Record<string, any> | null {
  if (event.data.type !== "worker_message_recorded" || !event.data.body.startsWith(inBandRequestRoutePrefix)) return null;
  try { return JSON.parse(event.data.body.slice(inBandRequestRoutePrefix.length)); } catch { return null; }
}

function references(value: unknown, requestId: string): boolean {
  if (typeof value === "string") return value === requestId || value === `request:${requestId}`;
  if (Array.isArray(value)) return value.some((item) => references(item, requestId));
  return Boolean(value) && typeof value === "object" && Object.values(value!).some((item) => references(item, requestId));
}

function recordedRefresh(events: StoredEvent[], worker: string, requestId: string) {
  if (retiredUnsentRequests(events).get(requestId) !== REASON) return null;
  const retirement = events.findLast((event) => event.worker === worker && event.producerKind === "VERIFIER"
    && event.producerId === WORK_QUESTION_RETIREMENT_PRODUCER_ID && event.data.type === "evidence_receipt_recorded"
    && event.data.summary === supervisoryRequestRetiredUnsentSummary && event.data.refs.includes(`request:${requestId}`)
    && event.data.refs.includes(`retirement_reason:${REASON}`));
  if (!retirement || retirement.data.type !== "evidence_receipt_recorded") return null;
  const successors = retirement.data.refs.filter((ref) => ref.startsWith("successor_request:"));
  if (successors.length !== 1) return null;
  const successor = successors[0]!.slice("successor_request:".length);
  const route = events.find((event) => event.worker === worker && event.eventId === requestRouteEventId(successor, 6)
    && event.producerId === WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID && event.producerKind === "SYSTEM");
  const root = route ? rootOf(route) : null;
  return root?.requestId === successor && root.contextRefreshOfRequestId === requestId
    ? { retirement, route: route!, requestId: successor, expiresAt: root.expiresAt as string,
      ownerContextMessageId: typeof root.ownerContextMessageId === "string" ? root.ownerContextMessageId : null } : null;
}

/** Fixed maintenance action: recover evidence for one current, unexpired, provably unsent owner continuation. */
export async function refreshUnsentWorkContinuation(
  store: Pick<EventStore, "workerEvents" | "appendMany">,
  input: { worker: string; requestId: string; ownerContextMessageId?: string },
  proveRequestUnsent: (requestId: string) => Promise<ProvenUnsentSubmissionState>,
  policy: GitHubReceiptPolicy | null,
  now: () => string = () => new Date().toISOString(),
) {
  const { worker, requestId } = input;
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(worker) || !WORK_CONTINUATION_REQUEST_ID.test(requestId)) {
    throw new Error("Context refresh requires one exact worker and work-owner-continuation request ID.");
  }
  if (input.ownerContextMessageId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,179}$/.test(input.ownerContextMessageId)) {
    throw new Error("Owner objective context requires one exact stored message ID.");
  }
  const result = (recorded: NonNullable<ReturnType<typeof recordedRefresh>>, duplicate: boolean) => ({
    status: duplicate ? "WORK_CONTINUATION_ALREADY_REFRESHED" : "WORK_CONTINUATION_CONTEXT_REFRESHED",
    worker, retiredRequestId: requestId, requestId: recorded.requestId, expiresAt: recorded.expiresAt,
    retirementEventId: recorded.retirement.eventId, routeEventId: recorded.route.eventId,
    duplicate, providerSendBoundaryCrossed: false as const, historicalRequestPreserved: true as const,
  });
  const sameContext = (recorded: NonNullable<ReturnType<typeof recordedRefresh>>) => {
    if (recorded.ownerContextMessageId !== (input.ownerContextMessageId ?? null)) {
      throw new Error("A different owner objective context is already bound to this recorded refresh.");
    }
    return recorded;
  };
  const prior = recordedRefresh(store.workerEvents(worker), worker, requestId);
  if (prior) return result(sameContext(prior), true);
  const proof = await proveRequestUnsent(requestId);
  // The runtime holds its known-continuation admission lane across this proof and the append transaction.
  const events = store.workerEvents(worker);
  const raced = recordedRefresh(events, worker, requestId);
  if (raced) return result(sameContext(raced), true);
  if (!validUnsentSubmissionProof(proof, requestId)) throw new Error("Submission authority did not prove the exact owner continuation unsent.");
  const recordedAt = now();
  const pending = pendingDecisionRequests(events).find((item) => item.requestId === requestId && item.worker === worker);
  if (!pending || !Number.isFinite(Date.parse(recordedAt)) || Date.parse(pending.expiresAt) <= Date.parse(recordedAt)) {
    throw new Error("Context refresh requires the exact current unexpired pending owner continuation.");
  }
  const sources = events.filter((event) => event.eventId === requestRouteEventId(requestId, 6));
  const source = sources.length === 1 ? sources[0]! : null;
  if (!source || source.worker !== worker || source.producerKind !== "SYSTEM"
    || source.producerId !== WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID) throw new Error("The exact trusted owner-continuation route is missing.");
  if (events.some((event) => event.sequence > source.sequence
    && ["execution_directive_recorded", "chatgpt_work_cloud_dispatch_requested", "github_decision_receipt_ingested"].includes(event.data.type))) {
    throw new Error("A newer directive, Work dispatch or decision makes this owner continuation stale.");
  }
  if (events.some((event) => event.eventId !== source.eventId && (references(event.data, requestId)
    || source.data.type === "worker_message_recorded" && references(event.data, source.data.message_id)))) {
    throw new Error("The owner continuation has transport, response, decision or retirement evidence and cannot be refreshed.");
  }
  const route = buildOwnerAnswerContinuationContextRefreshRoute(events, { worker, requestId, recordedAt,
    ownerContextMessageId: input.ownerContextMessageId }, policy);
  if (route.data.type !== "worker_message_recorded") throw new Error("Context refresh did not construct a route.");
  const root = JSON.parse(route.data.body.slice(inBandRequestRoutePrefix.length));
  const retirementId = `supervisory-request-retired-unsent:${sha256(canonicalJson({ requestId, proof: proof.proofSha256, successor: root.requestId })).slice(0, 32)}`;
  const retirement: AppendEnvelope = {
    schema_version: 2, event_id: retirementId, mission_id: "mission-control-live", occurred_at: recordedAt,
    data: {
      type: "evidence_receipt_recorded", worker, receipt_id: retirementId,
      producer_id: WORK_QUESTION_RETIREMENT_PRODUCER_ID, producer_role: "VERIFIER",
      evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT",
      exact_candidate_sha256: proof.proofSha256, summary: supervisoryRequestRetiredUnsentSummary,
      refs: [`request:${requestId}`, `source_route_event:${source.eventId}`, `successor_request:${root.requestId}`,
        `successor_route_event:${route.event_id}`, `submission_authority_proof_sha256:${proof.proofSha256}`,
        `submission_authority_pacing_domain:${proof.pacingDomain}`, `retirement_reason:${REASON}`,
        "lifecycle_status:RETIRED_UNSENT", "provider_send_boundary:NOT_CROSSED", "submission_authority_queue_records:0",
        "submission_authority_admission_records:0", "provider_transport_evidence_records:0", "historical_request_preserved:true"],
      verified: true, changed_path_manifest: null,
    },
  };
  const scopes = { workerScopes: [worker], taskScopes: [pending.taskId, `task:${worker}`] };
  const [retired, successor] = store.appendMany([
    { event: retirement, receivedAt: recordedAt, producer: { id: WORK_QUESTION_RETIREMENT_PRODUCER_ID, kind: "VERIFIER", ...scopes } },
    { event: route, receivedAt: recordedAt, producer: { id: WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, kind: "SYSTEM", ...scopes } },
  ]);
  return result({ retirement: retired!, route: successor!, requestId: root.requestId, expiresAt: root.expiresAt,
    ownerContextMessageId: input.ownerContextMessageId ?? null }, false);
}
