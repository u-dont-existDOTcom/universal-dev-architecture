import type { StoredEvent } from "./schema";

// The submission authority's proof that a supervisory request never reached the provider, shared by the known kinds of
// request that may be retired unsent: an hourly fleet review and a Work thread's question to its supervisor. Also its
// account of a Work question that was (or may have been) sent and has no send still open, for the owner's re-send.

/** Request ids the submission authority may prove unsent. */
export const UNSENT_PROVABLE_REQUEST_ID = /^(?:fleet-review|work-question|work-owner-continuation):[a-f0-9]{32}$/;
export const WORK_QUESTION_REQUEST_ID = /^work-question:[a-f0-9]{32}$/;
export const WORK_CONTINUATION_REQUEST_ID = /^work-owner-continuation:[a-f0-9]{32}$/;
export const FLEET_REVIEW_REQUEST_ID = /^fleet-review:[a-f0-9]{32}$/;
export const supervisoryRequestRetiredUnsentSummary = "MISSION_CONTROL_SUPERVISORY_REQUEST_RETIRED_UNSENT_V1";
/** A sent Work owner-continuation whose one answer Mission Control's parser rejected, retired by the owner's correction. */
export const supervisoryRequestRetiredAfterRejectedResponseSummary = "MISSION_CONTROL_SUPERVISORY_REQUEST_RETIRED_AFTER_REJECTED_RESPONSE_V1";

/** Verifier identities that may retire a request unsent, one per request kind. */
export const FLEET_REQUEST_RETIREMENT_PRODUCER_ID = "verifier:fleet-supervisor-request-retirement";
export const WORK_QUESTION_RETIREMENT_PRODUCER_ID = "verifier:work-question-request-retirement";

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

export function validUnsentSubmissionProof(proof: ProvenUnsentSubmissionState | undefined, requestId: string): boolean {
  return Boolean(proof) && proof!.schemaVersion === 1 && proof!.requestId === requestId && proof!.provenUnsent === true
    && proof!.ledgerValid === true && proof!.matchingStateSections.length === 0
    && proof!.queueRecordCount === 0 && proof!.admissionRecordCount === 0 && /^[a-f0-9]{64}$/.test(proof!.proofSha256);
}

/**
 * The submission authority's account of a Work question that has send records: each admission of it, and whether any
 * send of it is still open. The owner may re-send such a question only when it has at least one admission (a question
 * with none is provably unsent and takes the unsent reissue instead) and no queued, admitted or unresolved send of it
 * remains, so the re-send can never run alongside the original.
 */
export interface SettledSendSubmissionState {
  schemaVersion: 1;
  requestId: string;
  pacingDomain: string;
  ledgerValid: boolean;
  admissions: Array<{ admissionId: string; status: string; boundaryKind: string | null }>;
  openAdmissionCount: number;
  openQueueRecordCount: number;
  crossedAdmissionCount: number;
  settled: boolean;
  proofSha256: string;
}

export function validSettledSendProof(proof: SettledSendSubmissionState | undefined, requestId: string): boolean {
  return Boolean(proof) && proof!.schemaVersion === 1 && proof!.requestId === requestId && proof!.settled === true
    && proof!.ledgerValid === true && Array.isArray(proof!.admissions) && proof!.admissions.length > 0
    && proof!.openAdmissionCount === 0 && proof!.openQueueRecordCount === 0
    && Number.isInteger(proof!.crossedAdmissionCount) && proof!.crossedAdmissionCount >= 0
    && proof!.crossedAdmissionCount <= proof!.admissions.length && /^[a-f0-9]{64}$/.test(proof!.proofSha256);
}

/** The verifier allowed to retire this request id unsent, or null for an id no retirement may cover. */
export function retirementProducerFor(requestId: string): string | null {
  if (FLEET_REVIEW_REQUEST_ID.test(requestId)) return FLEET_REQUEST_RETIREMENT_PRODUCER_ID;
  if (WORK_QUESTION_REQUEST_ID.test(requestId)) return WORK_QUESTION_RETIREMENT_PRODUCER_ID;
  if (WORK_CONTINUATION_REQUEST_ID.test(requestId)) return WORK_QUESTION_RETIREMENT_PRODUCER_ID;
  return null;
}

/** Shared projection used by admission and owner-answer replay; verifier/proof requirements stay identical. */
export function retiredUnsentRequests(events: readonly StoredEvent[]): Map<string, string | null> {
  const newest = new Map<string, { reason: string | null; sequence: number }>();
  const one = (refs: string[], prefix: string) => {
    const values = refs.filter((ref) => ref.startsWith(prefix)).map((ref) => ref.slice(prefix.length));
    return values.length === 1 ? values[0]! : null;
  };
  for (const event of events) {
    const data = event.data;
    if (data.type !== "evidence_receipt_recorded" || data.summary !== supervisoryRequestRetiredUnsentSummary
      || data.verified !== true || data.producer_role !== "VERIFIER"
      || !data.refs.includes("lifecycle_status:RETIRED_UNSENT") || !data.refs.includes("provider_send_boundary:NOT_CROSSED")
      || !data.refs.includes("submission_authority_queue_records:0") || !data.refs.includes("submission_authority_admission_records:0")
      || !data.refs.includes("provider_transport_evidence_records:0")) continue;
    const requestId = one(data.refs, "request:");
    if (!requestId || retirementProducerFor(requestId) !== data.producer_id) continue;
    const prior = newest.get(requestId);
    if (!prior || event.sequence > prior.sequence) newest.set(requestId, { reason: one(data.refs, "retirement_reason:"), sequence: event.sequence });
  }
  return new Map([...newest].map(([requestId, { reason }]) => [requestId, reason]));
}

/**
 * The Work owner-continuations the owner's correction retired after their one answer was rejected
 * (`lib/work-continuation-correction.ts`): a verified retirement from the Work-question retirement verifier carrying the
 * explicit one-time authorization, the send's settled record and the rejected answer's digest. Such a request stops
 * being pending, so no late answer to it can be accepted; its successor asks the same supervisor afresh.
 */
export function retiredAfterRejectedResponseRequests(events: readonly StoredEvent[]): Set<string> {
  const retired = new Set<string>();
  for (const event of events) {
    const data = event.data;
    if (data.type !== "evidence_receipt_recorded" || data.summary !== supervisoryRequestRetiredAfterRejectedResponseSummary
      || data.verified !== true || data.producer_role !== "VERIFIER" || data.producer_id !== WORK_QUESTION_RETIREMENT_PRODUCER_ID
      || event.producerKind !== "VERIFIER" || event.producerId !== WORK_QUESTION_RETIREMENT_PRODUCER_ID
      || !data.refs.includes("lifecycle_status:RETIRED_AFTER_REJECTED_RESPONSE")
      || !data.refs.includes("authorization:OWNER_EXPLICIT_ONE_CORRECTION")
      || !data.refs.includes("submission_authority_open_records:0")
      || !data.refs.includes("decision_receipts_ingested:0")
      || !data.refs.includes("canonical_decision_admitted:false")) continue;
    const requests = data.refs.filter((ref) => ref.startsWith("request:")).map((ref) => ref.slice("request:".length));
    if (requests.length === 1 && WORK_CONTINUATION_REQUEST_ID.test(requests[0]!)) retired.add(requests[0]!);
  }
  return retired;
}
