// The owner's retry of a native ChatGPT Work start that failed at the ChatGPT app (#385, 22 Oct 2026).
//
// On 22 Oct the Atlas pilot's supervisor authorized a Work job, and the dispatcher's call to start it ended UNAVAILABLE
// (WORK_CLOUD_PRODUCT_TOOL_EXECUTION_UNAVAILABLE): the ChatGPT app refused every request from the dispatcher's
// executor thread, which belonged to an earlier app. A result after the app boundary is ambiguous (the call may have
// reached Work), so nothing starts the job again by itself: the dispatcher never re-creates under a recorded result, and
// the expiry question (lib/work-directive-expiry.ts) never counts such a job as unrun.
//
// Once the cause is repaired, the owner may authorize one retry of that failed start, while the supervisor's
// authorization is still open. The retry is a new dispatch of the same directive with its own id, derived from the
// failed one alone. Before its Work call the dispatcher reads the app (never writes) for a Work thread whose first
// message is the failed start's exact prompt, and holds the retry unless it read every thread updated since that start
// and found none (scripts/dispatch-chatgpt-work-cloud.ts). A start that was retried and failed again may be retried
// again only by another authorization of the owner, naming that retry.
import { canonicalJson, sha256 } from "./canonical";
import type { AuthenticatedProducer } from "./ingestion-auth";
import type { AppendEnvelope, StoredEvent } from "./schema";
import { workDirectiveOpenAt } from "./work-directive-expiry";

type DirectiveData = Extract<StoredEvent["data"], { type: "execution_directive_recorded" }>;
type RequestData = Extract<StoredEvent["data"], { type: "chatgpt_work_cloud_dispatch_requested" }>;
type ResultData = Extract<StoredEvent["data"], { type: "chatgpt_work_cloud_dispatch_recorded" }>;
type RetryData = Extract<StoredEvent["data"], { type: "chatgpt_work_cloud_dispatch_retry_authorized" }>;

/** The results after which the owner may retry a start: the start ended without a Work thread. */
export const WORK_CLOUD_RETRYABLE_STATUSES: ReadonlySet<string> = new Set(["UNAVAILABLE", "FAILED"]);

/** The one retry a failed dispatch allows: its id comes from the failed dispatch's id alone, so the owner's route that
 * authorizes it and the dispatcher that starts it agree without sharing any other state. */
export function workCloudRetryDispatchId(failedDispatchId: string): string {
  return `work-cloud:${sha256(canonicalJson({ retryOf: failedDispatchId })).slice(0, 32)}`;
}

/** The id of the owner's authorization to retry one failed dispatch: one authorization per failed dispatch. */
export function workCloudRetryAuthorizationId(failedDispatchId: string): string {
  return `work-cloud-retry:${sha256(canonicalJson({ failedDispatchId })).slice(0, 32)}`;
}

export interface RetryableWorkCloudDispatch {
  directiveEvent: StoredEvent;
  failedDispatchId: string;
  failedStatus: "UNAVAILABLE" | "FAILED";
  failedErrorCode: string | null;
  retryDispatchId: string;
}

/**
 * The failed start of the worker's current native Work job that the owner may retry at `at`, or why there is none.
 * Retryable: the latest directive is an ACTIVE version 3 native Work directive whose authorization is still open; its
 * latest CREATE dispatch has a result, UNAVAILABLE or FAILED; no dispatch of the directive is READY or waiting
 * (PENDING_*), none crossed the app boundary without a result, and nothing ran it (a Work execution receipt, a Codex
 * start or receipt); and the owner hasn't already authorized a retry of that dispatch.
 */
export function retryableWorkCloudDispatch(events: readonly StoredEvent[], at: string): RetryableWorkCloudDispatch | { refusal: string } {
  const directiveEvent = events.findLast((event) => event.data.type === "execution_directive_recorded");
  const directive = directiveEvent?.data;
  if (!directiveEvent || directive?.type !== "execution_directive_recorded" || directive.status !== "ACTIVE"
    || directive.directive_schema_version !== 3 || directive.execution_surface !== "CHATGPT_WORK_CLOUD") {
    return { refusal: "The worker's current directive isn't an active native ChatGPT Work job." };
  }
  if (!workDirectiveOpenAt(events, directive, at)) {
    return { refusal: "The supervisor's authorization of this Work job has ended (its deadline passed), so it can't be started again." };
  }
  const forDirective = (data: StoredEvent["data"]) => (data as { directive_id?: string }).directive_id === directive.directive_id
    && (data as { directive_revision?: number }).directive_revision === directive.directive_revision;
  const related = events.filter((event) => forDirective(event.data));
  if (related.some((event) => ["chatgpt_work_cloud_execution_receipt_recorded", "codex_execution_started", "execution_receipt_recorded"]
    .includes(event.data.type))) {
    return { refusal: "This Work job has a run on record, so it isn't retried." };
  }
  const results = related.filter((event) => event.data.type === "chatgpt_work_cloud_dispatch_recorded")
    .map((event) => event.data as ResultData);
  if (results.some((result) => !WORK_CLOUD_RETRYABLE_STATUSES.has(result.status))) {
    return { refusal: "A start of this Work job is ready or still waiting, so it isn't retried." };
  }
  const resultIds = new Set(results.map((result) => result.dispatch_id));
  if (related.some((event) => event.data.type === "chatgpt_work_cloud_handoff_intent_recorded"
    && !resultIds.has((event.data as { dispatch_id: string }).dispatch_id))) {
    return { refusal: "A start of this Work job crossed the app boundary without a result yet, so it isn't retried." };
  }
  const latestRequest = related.findLast((event) => event.data.type === "chatgpt_work_cloud_dispatch_requested")?.data as RequestData | undefined;
  if (!latestRequest) return { refusal: "No start of this Work job is on record." };
  if (latestRequest.mode !== "CREATE") return { refusal: "Only a failed start of a new Work thread is retried." };
  const latestResult = results.findLast((result) => result.dispatch_id === latestRequest.dispatch_id);
  if (!latestResult) return { refusal: "The latest start of this Work job has no result yet, so it isn't retried." };
  if (events.some((event) => event.data.type === "chatgpt_work_cloud_dispatch_retry_authorized"
    && event.data.failed_dispatch_id === latestRequest.dispatch_id)) {
    return { refusal: "A retry of this failed start is already authorized." };
  }
  return {
    directiveEvent,
    failedDispatchId: latestRequest.dispatch_id,
    failedStatus: latestResult.status as "UNAVAILABLE" | "FAILED",
    failedErrorCode: latestResult.error_code,
    retryDispatchId: workCloudRetryDispatchId(latestRequest.dispatch_id),
  };
}

/** The owner's authorization record for one retry. */
export function workCloudRetryEnvelope(retryable: RetryableWorkCloudDispatch, authorizedBy: string, authorizedAt: string): AppendEnvelope {
  const directive = retryable.directiveEvent.data as DirectiveData;
  const id = workCloudRetryAuthorizationId(retryable.failedDispatchId);
  return {
    schema_version: 2,
    event_id: id,
    mission_id: "mission-control-live",
    occurred_at: authorizedAt,
    data: {
      type: "chatgpt_work_cloud_dispatch_retry_authorized",
      worker: directive.worker,
      task_id: directive.task_id,
      directive_id: directive.directive_id,
      directive_revision: directive.directive_revision,
      retry_authorization_id: id,
      failed_dispatch_id: retryable.failedDispatchId,
      failed_status: retryable.failedStatus,
      failed_error_code: retryable.failedErrorCode,
      retry_dispatch_id: retryable.retryDispatchId,
      authorized_by: authorizedBy,
      authorized_at: authorizedAt,
    },
  };
}

/** Whether a retry authorization matches what the ledger allows at its time (the store's check before appending it). */
export function retryAuthorizationProblem(events: readonly StoredEvent[], data: RetryData): string | null {
  const retryable = retryableWorkCloudDispatch(events, data.authorized_at);
  if ("refusal" in retryable) return retryable.refusal;
  const directive = retryable.directiveEvent.data as DirectiveData;
  if (data.failed_dispatch_id !== retryable.failedDispatchId || data.failed_status !== retryable.failedStatus
    || data.failed_error_code !== retryable.failedErrorCode || data.retry_dispatch_id !== retryable.retryDispatchId
    || data.retry_authorization_id !== workCloudRetryAuthorizationId(retryable.failedDispatchId)
    || data.directive_id !== directive.directive_id || data.directive_revision !== directive.directive_revision
    || data.task_id !== directive.task_id) {
    return "A Work start retry must name the current directive's latest failed start, its exact result, and the one retry it allows.";
  }
  return null;
}

/**
 * The retry chain of a directive's first dispatch: each failed dispatch the owner authorized a retry of, followed to the
 * dispatch the dispatcher works on now. `prior` is the last failed dispatch before it (null without a retry).
 */
export function currentWorkCloudDispatch(
  events: readonly StoredEvent[],
  worker: string,
  directive: { directive_id: string; directive_revision: number },
  firstDispatchId: string,
): { dispatchId: string; prior: { dispatchId: string; request: RequestData } | null } {
  let dispatchId = firstDispatchId;
  let prior: { dispatchId: string; request: RequestData } | null = null;
  // The chain is short (each link needs the owner); the bound only guards a malformed ledger.
  for (let hop = 0; hop < 20; hop += 1) {
    const retry = events.find((event) => event.data.type === "chatgpt_work_cloud_dispatch_retry_authorized"
      && event.data.worker === worker && event.data.failed_dispatch_id === dispatchId
      && event.data.directive_id === directive.directive_id && event.data.directive_revision === directive.directive_revision)?.data;
    if (retry?.type !== "chatgpt_work_cloud_dispatch_retry_authorized") break;
    const request = events.find((event) => event.data.type === "chatgpt_work_cloud_dispatch_requested"
      && event.data.worker === worker && event.data.dispatch_id === dispatchId)?.data;
    if (request?.type !== "chatgpt_work_cloud_dispatch_requested") break;
    prior = { dispatchId, request };
    dispatchId = retry.retry_dispatch_id;
  }
  return { dispatchId, prior };
}

export interface WorkCloudRetryResult {
  status: "WORK_START_RETRY_AUTHORIZED" | "WORK_START_RETRY_ALREADY_AUTHORIZED";
  worker: string;
  failedDispatchId: string;
  failedStatus: string;
  failedErrorCode: string | null;
  retryDispatchId: string;
  authorizationEventId: string;
  duplicate: boolean;
}

/**
 * The owner's route: authorizes one retry of the worker's latest failed native Work start. Nothing is sent here; the
 * dispatcher starts the retry on its next cycle, after its read-only search for a Work thread of the failed start. A
 * repeat reports the recorded authorization while its retry hasn't run; anything else not retryable is refused.
 */
export function authorizeWorkCloudDispatchRetry(
  store: { workerEvents(worker: string): StoredEvent[]; append(input: unknown, receivedAt?: string, producer?: AuthenticatedProducer): StoredEvent },
  input: { worker: string; producer: AuthenticatedProducer },
  now: () => string = () => new Date().toISOString(),
): WorkCloudRetryResult {
  if (input.producer.kind !== "OWNER_AUTHORITY") throw new Error("Only the owner may authorize a retry of a failed Work start.");
  const events = store.workerEvents(input.worker);
  const at = now();
  const retryable = retryableWorkCloudDispatch(events, at);
  if ("refusal" in retryable) {
    const recorded = events.findLast((event) => event.data.type === "chatgpt_work_cloud_dispatch_retry_authorized");
    const data = recorded?.data;
    // A repeat while the authorized retry hasn't started yet reports it.
    if (data?.type === "chatgpt_work_cloud_dispatch_retry_authorized"
      && !events.some((event) => event.data.type === "chatgpt_work_cloud_dispatch_requested" && event.data.dispatch_id === data.retry_dispatch_id)) {
      return {
        status: "WORK_START_RETRY_ALREADY_AUTHORIZED", worker: input.worker, failedDispatchId: data.failed_dispatch_id,
        failedStatus: data.failed_status, failedErrorCode: data.failed_error_code, retryDispatchId: data.retry_dispatch_id,
        authorizationEventId: recorded!.eventId, duplicate: true,
      };
    }
    throw new Error(retryable.refusal);
  }
  const appended = store.append(workCloudRetryEnvelope(retryable, input.producer.id, at), at, input.producer);
  return {
    status: "WORK_START_RETRY_AUTHORIZED", worker: input.worker, failedDispatchId: retryable.failedDispatchId,
    failedStatus: retryable.failedStatus, failedErrorCode: retryable.failedErrorCode, retryDispatchId: retryable.retryDispatchId,
    authorizationEventId: appended.eventId, duplicate: false,
  };
}
