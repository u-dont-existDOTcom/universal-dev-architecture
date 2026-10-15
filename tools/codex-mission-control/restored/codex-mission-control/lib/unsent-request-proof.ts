// The submission authority's proof that a supervisory request never reached the provider, shared by the two kinds of
// request that may be retired unsent: an hourly fleet review and a Work thread's question to its supervisor. Also its
// account of a Work question that was (or may have been) sent and has no send still open, for the owner's re-send.

/** Request ids the submission authority may prove unsent. */
export const UNSENT_PROVABLE_REQUEST_ID = /^(?:fleet-review|work-question):[a-f0-9]{32}$/;
export const WORK_QUESTION_REQUEST_ID = /^work-question:[a-f0-9]{32}$/;
export const FLEET_REVIEW_REQUEST_ID = /^fleet-review:[a-f0-9]{32}$/;

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
  return null;
}
