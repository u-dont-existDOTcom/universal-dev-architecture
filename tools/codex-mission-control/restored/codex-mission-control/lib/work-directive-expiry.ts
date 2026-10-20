// A native ChatGPT Work job that its supervisor authorized, whose deadline passed before Mission Control could start it
// (#385, 20 Oct 2026: the Atlas task's one authorized job expired while the ChatGPT app on its host was down).
//
// A supervisor's bounded execution names a deadline. Mission Control never starts a native Work job at or after that
// deadline (the dispatcher skips it and the store refuses its request and its provider-bound intent). When the latest
// directive's job expired without ever reaching the provider boundary, the fleet watch records that fact once, as
// verified evidence from Mission Control itself, and asks the project-manager supervisor whether to authorize it again.
// A second authorized job in a row that also expires unrun is the owner's to know about: nothing asks a third time. The
// question is asked only for a task the owner registered on the dashboard form (the Atlas pilot's kind), whose Work the
// owner set up; other workers' expired directives are left to their own supervision.
import { canonicalJson, sha256 } from "./canonical";
import type { AuthenticatedProducer } from "./ingestion-auth";
import type { AppendEnvelope, StoredEvent } from "./schema";

export const WORK_DIRECTIVE_EXPIRY_VERIFIER_ID = "verifier:work-directive-expiry";
/** The first line of every expired-unrun evidence summary. */
export const WORK_DIRECTIVE_EXPIRED_UNRUN_SUMMARY_PREFIX = "MISSION_CONTROL_WORK_DIRECTIVE_EXPIRED_UNRUN_V1";

type DirectiveData = Extract<StoredEvent["data"], { type: "execution_directive_recorded" }>;

/** The bounded-execution deadline of a native Work directive, from the validated supervisor decision it was made from,
 * or null when the directive isn't a native Work directive bound to such a decision (no deadline is known then). */
export function workDirectiveDeadline(events: readonly StoredEvent[], directive: DirectiveData): string | null {
  if (directive.execution_surface !== "CHATGPT_WORK_CLOUD") return null;
  const receiptEventId = directive.validated_decision_proof?.receipt_event_id;
  if (!receiptEventId) return null;
  const receipt = events.find((event) => event.eventId === receiptEventId)?.data;
  if (receipt?.type !== "github_decision_receipt_ingested" || !receipt.bounded_execution) return null;
  const deadline = receipt.bounded_execution.deadline;
  return Number.isFinite(Date.parse(deadline)) ? deadline : null;
}

/** Whether a native Work job may still start at `at` under its directive: false once its deadline has been reached. */
export function workDirectiveOpenAt(events: readonly StoredEvent[], directive: DirectiveData, at: string): boolean {
  const deadline = workDirectiveDeadline(events, directive);
  return deadline === null || Date.parse(at) < Date.parse(deadline);
}

export interface ExpiredUnrunWorkDirective {
  directive: StoredEvent;
  deadline: string;
  /** Dispatch requests recorded for the directive (each proven to have stopped before the provider). */
  dispatchRequests: number;
  /** Dispatch results recorded for it: only UNAVAILABLE ones recorded before any Work call (see PRE_SEND_UNAVAILABLE_CODES). */
  unavailableResults: number;
  /** Mission Control's record of this expiry, once the fleet watch has made it. */
  evidence: StoredEvent | null;
  /** Earlier directives of this worker whose jobs also expired unrun, with no Work job run since. */
  priorUnrunExpiries: number;
}

/**
 * The UNAVAILABLE reason codes the dispatcher records before it makes any Work call, so nothing can have reached Work:
 * no native surface verification, no app executor, the Codex driver busy (its lock is held before any message is
 * queued), or the directive's deadline reached by the time of the call. Every other UNAVAILABLE code (a timeout, a missing or invalid tool receipt, a rejected extra mutation, an
 * execution error) can follow a call that reached Work, so the job stays ambiguous, never unrun.
 */
export const PRE_SEND_UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  "WORK_CLOUD_SURFACE_VERIFICATION_UNAVAILABLE", "WORK_CLOUD_DISPATCH_UNAVAILABLE", "WORK_CLOUD_DRIVER_BUSY",
  // The deadline was reached by the time of the call (chatgpt-work-cloud-dispatch.ts and the controller check it right
  // before the Work call).
  "WORK_CLOUD_DEADLINE_PASSED",
]);

function provenUnsent(event: StoredEvent): boolean {
  return event.data.type === "chatgpt_work_cloud_dispatch_recorded" && event.data.status === "UNAVAILABLE"
    && PRE_SEND_UNAVAILABLE_CODES.has(event.data.error_code ?? "");
}

const dispatchTypes = new Set([
  "chatgpt_work_cloud_dispatch_requested", "chatgpt_work_cloud_handoff_intent_recorded",
  "chatgpt_work_cloud_dispatch_recorded", "chatgpt_work_cloud_execution_receipt_recorded",
  // Codex records bound to the same directive mean it may have run another way.
  "codex_execution_started", "execution_receipt_recorded",
]);

function forDirective(event: StoredEvent, directive: DirectiveData): boolean {
  const data = event.data as { directive_id?: string; directive_revision?: number };
  return dispatchTypes.has(event.data.type) && data.directive_id === directive.directive_id
    && data.directive_revision === directive.directive_revision;
}

/**
 * The worker's latest directive, when it is an active native Work directive whose job never ran and whose deadline has
 * passed at `now`. "Never ran": nothing crossed the provider boundary for it (no handoff intent), or the only results
 * are UNAVAILABLE ones recorded before any Work call (PRE_SEND_UNAVAILABLE_CODES), and no Work execution receipt
 * exists. A job that may have started (an intent without a result, a READY, PENDING_SETUP, PENDING_APPROVAL or FAILED
 * result, or an UNAVAILABLE one with any other code, such as a timeout or a missing tool receipt) is not unrun.
 */
export function expiredUnrunWorkDirective(events: readonly StoredEvent[], now: string): ExpiredUnrunWorkDirective | null {
  const directiveEvent = events.findLast((event) => event.data.type === "execution_directive_recorded");
  if (!directiveEvent || directiveEvent.data.type !== "execution_directive_recorded") return null;
  const directive = directiveEvent.data;
  if (directive.status !== "ACTIVE" || directive.directive_schema_version !== 3 || directive.execution_surface !== "CHATGPT_WORK_CLOUD") return null;
  const deadline = workDirectiveDeadline(events, directive);
  if (deadline === null || Date.parse(now) < Date.parse(deadline)) return null;
  const related = events.filter((event) => forDirective(event, directive));
  if (related.some((event) => ["chatgpt_work_cloud_execution_receipt_recorded", "codex_execution_started",
    "execution_receipt_recorded"].includes(event.data.type))) return null;
  const results = related.filter((event) => event.data.type === "chatgpt_work_cloud_dispatch_recorded");
  if (results.some((event) => !provenUnsent(event))) return null;
  const intents = related.filter((event) => event.data.type === "chatgpt_work_cloud_handoff_intent_recorded");
  const resultIds = new Set(results.map((event) => (event.data as { dispatch_id: string }).dispatch_id));
  if (intents.some((event) => !resultIds.has((event.data as { dispatch_id: string }).dispatch_id))) return null;
  return {
    directive: directiveEvent,
    deadline,
    dispatchRequests: related.filter((event) => event.data.type === "chatgpt_work_cloud_dispatch_requested").length,
    unavailableResults: results.length,
    evidence: events.findLast((event) => isBoundWorkDirectiveExpiry(events, event)
      && (event.data as { receipt_id: string }).receipt_id === workDirectiveExpiryEventId(directiveEvent)) ?? null,
    priorUnrunExpiries: priorUnrunExpiries(events, directiveEvent),
  };
}

/** Expiry records for earlier directives of the worker made after its last job that may have started, i.e. the unbroken
 * run of expired authorizations before this one. "May have started" is the same test as for the directive itself: a
 * Work or Codex execution receipt, a Codex start, any dispatch result other than a pre-send UNAVAILABLE one (READY,
 * PENDING_*, FAILED, or an UNAVAILABLE after a Work call), or a handoff intent without a result (Codex review of ea4356dd). */
function priorUnrunExpiries(events: readonly StoredEvent[], current: StoredEvent): number {
  const resultIds = new Set(events.filter((event) => event.data.type === "chatgpt_work_cloud_dispatch_recorded")
    .map((event) => (event.data as { dispatch_id: string }).dispatch_id));
  const lastRun = events.findLast((event) => event.data.type === "chatgpt_work_cloud_execution_receipt_recorded"
    || event.data.type === "execution_receipt_recorded" || event.data.type === "codex_execution_started"
    || (event.data.type === "chatgpt_work_cloud_dispatch_recorded" && !provenUnsent(event))
    || (event.data.type === "chatgpt_work_cloud_handoff_intent_recorded"
      && !resultIds.has((event.data as { dispatch_id: string }).dispatch_id)));
  const ownId = workDirectiveExpiryEventId(current);
  return events.filter((event) => isBoundWorkDirectiveExpiry(events, event)
    && (!lastRun || event.sequence > lastRun.sequence)
    && (event.data as { receipt_id: string }).receipt_id !== ownId).length;
}

/** An expiry record Mission Control made for a directive event that exists, recorded at or after that directive's
 * deadline (by the store's receive time): a record naming no directive, or made before its deadline, counts for nothing. */
export function isBoundWorkDirectiveExpiry(events: readonly StoredEvent[], event: StoredEvent): boolean {
  if (!isWorkDirectiveExpiryEvidence(event) || event.data.type !== "evidence_receipt_recorded") return false;
  const ref = event.data.refs.find((item) => item.startsWith("directive_event:"));
  const directiveEvent = ref ? events.find((item) => item.eventId === ref.slice("directive_event:".length)) : undefined;
  if (!directiveEvent || directiveEvent.data.type !== "execution_directive_recorded"
    || event.data.receipt_id !== workDirectiveExpiryEventId(directiveEvent)) return false;
  const deadline = workDirectiveDeadline(events, directiveEvent.data);
  // The store's own receive time, not the time the record claims.
  return deadline !== null && Date.parse(event.receivedAt) >= Date.parse(deadline);
}

/** The event id of one directive's expiry record: the same directive expires once. */
export function workDirectiveExpiryEventId(directiveEvent: StoredEvent): string {
  const directive = directiveEvent.data as DirectiveData;
  return "work-directive-expired-unrun:" + sha256(canonicalJson({
    worker: directive.worker, directiveId: directive.directive_id, directiveRevision: directive.directive_revision,
    directiveEventId: directiveEvent.eventId,
  })).slice(0, 32);
}

export function workDirectiveExpiryProducer(worker: string, taskId: string): AuthenticatedProducer {
  return { id: WORK_DIRECTIVE_EXPIRY_VERIFIER_ID, kind: "VERIFIER", workerScopes: [worker], taskScopes: [taskId] };
}

/** Mission Control's own verified record that an authorized native Work job expired before it ran. */
export function workDirectiveExpiryEnvelope(expiry: ExpiredUnrunWorkDirective, recordedAt: string): AppendEnvelope {
  const directive = expiry.directive.data as DirectiveData;
  const eventId = workDirectiveExpiryEventId(expiry.directive);
  const attempts = expiry.dispatchRequests === 0
    ? "Mission Control never started it: no dispatch was requested before the deadline."
    : `Mission Control requested it ${expiry.dispatchRequests} time${expiry.dispatchRequests === 1 ? "" : "s"}; `
      + (expiry.unavailableResults > 0
        ? `${expiry.unavailableResults} attempt${expiry.unavailableResults === 1 ? "" : "s"} stopped before any Work call (no usable ChatGPT Work surface)`
        : "none reached the ChatGPT Work provider")
      + ", so nothing was sent to ChatGPT Work for it.";
  const summary = [
    WORK_DIRECTIVE_EXPIRED_UNRUN_SUMMARY_PREFIX,
    `The native ChatGPT Work job authorized by directive ${directive.directive_id} (revision ${directive.directive_revision}) `
      + `had a deadline of ${expiry.deadline}. The deadline passed before the job ran. ${attempts} No Work execution `
      + "receipt exists for it, and Mission Control will not start it now. Mission Control does not know from its own "
      + "records why the Work surface was unavailable.",
  ].join("\n");
  return {
    schema_version: 2,
    event_id: eventId,
    mission_id: "mission-control-live",
    occurred_at: recordedAt,
    data: {
      type: "evidence_receipt_recorded",
      worker: directive.worker,
      receipt_id: eventId,
      producer_id: WORK_DIRECTIVE_EXPIRY_VERIFIER_ID,
      producer_role: "VERIFIER",
      evidence_class: "ARTIFACT",
      independence: "INDEPENDENT",
      freshness: "CURRENT",
      exact_candidate_sha256: directive.directive_artifact_sha256 ?? sha256(eventId),
      summary,
      refs: [
        `directive:${directive.directive_id}`,
        `directive_revision:${directive.directive_revision}`,
        `directive_event:${expiry.directive.eventId}`,
        `deadline:${expiry.deadline}`,
        `dispatch_requests:${expiry.dispatchRequests}`,
        `unavailable_results:${expiry.unavailableResults}`,
        "provider_handoffs_without_result:0",
        "work_execution_receipts:0",
        "lifecycle_status:EXPIRED_UNRUN",
        "semantic_authority:false",
      ],
      verified: true,
      changed_path_manifest: null,
    },
  };
}

/** Whether an event is an expired-unrun record Mission Control itself made. */
export function isWorkDirectiveExpiryEvidence(event: StoredEvent): boolean {
  return event.data.type === "evidence_receipt_recorded"
    && event.producerKind === "VERIFIER" && event.producerId === WORK_DIRECTIVE_EXPIRY_VERIFIER_ID
    && event.data.producer_id === WORK_DIRECTIVE_EXPIRY_VERIFIER_ID && event.data.verified === true
    && event.data.summary.startsWith(`${WORK_DIRECTIVE_EXPIRED_UNRUN_SUMMARY_PREFIX}\n`)
    && event.data.refs.includes("lifecycle_status:EXPIRED_UNRUN");
}
