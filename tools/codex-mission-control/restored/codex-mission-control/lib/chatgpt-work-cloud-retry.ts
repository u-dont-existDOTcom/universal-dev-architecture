// The owner's retry of a native ChatGPT Work start that failed at the ChatGPT app (#385, 22 Oct 2026).
//
// On 22 Oct the Atlas pilot's supervisor authorized a Work job, and the dispatcher's call to start it ended UNAVAILABLE
// (WORK_CLOUD_PRODUCT_TOOL_EXECUTION_UNAVAILABLE): the ChatGPT app refused every request from the dispatcher's
// executor thread, which belonged to an earlier app. A result after the app boundary is ambiguous (the call may have
// reached Work), so nothing starts the job again by itself: the dispatcher never re-creates under a recorded result, and
// the expiry question (lib/work-directive-expiry.ts) never counts such a job as unrun.
//
// Once the cause is repaired, the owner may authorize one retry of that failed start, while the supervisor's
// authorization is still open and only once the failed start has settled (WORK_CLOUD_RETRY_SETTLE_MS after its result
// was recorded). The retry is a new dispatch of the same directive with its own id, derived from the failed one alone.
// Before the retry's request is recorded and its Work call made, the dispatcher reads the app (never writes) for a
// thread on any surface whose first message is the failed start's exact prompt, and holds the retry unless it read every
// thread made since that start and found none (scripts/dispatch-chatgpt-work-cloud.ts). A start that was retried and
// failed again may be retried again only by another authorization of the owner, naming that retry.
import { canonicalJson, sha256 } from "./canonical";
import type { AuthenticatedProducer } from "./ingestion-auth";
import type { AppendEnvelope, StoredEvent } from "./schema";
import { workDirectiveOpenAt } from "./work-directive-expiry";

type DirectiveData = Extract<StoredEvent["data"], { type: "execution_directive_recorded" }>;
type RequestData = Extract<StoredEvent["data"], { type: "chatgpt_work_cloud_dispatch_requested" }>;
type ResultData = Extract<StoredEvent["data"], { type: "chatgpt_work_cloud_dispatch_recorded" }>;
type RetryData = Extract<StoredEvent["data"], { type: "chatgpt_work_cloud_dispatch_retry_authorized" }>;

/** The results that end a start without a Work thread (UNAVAILABLE or FAILED): after one, the job starts again only as
 * the owner's authorized retry (the store's check). */
export const WORK_CLOUD_RETRYABLE_STATUSES: ReadonlySet<string> = new Set(["UNAVAILABLE", "FAILED"]);

/**
 * Whether the owner may retry a start that ended with this result: UNAVAILABLE (any code), or FAILED only when the app
 * executor itself failed. A FAILED result whose code shows that a thread holding the prompt exists (a wrong surface, a
 * mismatched or ambiguous thread) is never retried (independent review of e508a5f9).
 */
export function retryableWorkCloudResult(result: { status: string; error_code: string | null }): boolean {
  return result.status === "UNAVAILABLE" || (result.status === "FAILED" && result.error_code === "WORK_CLOUD_APP_EXECUTOR_FAILED");
}

/** The records that show a directive's job ran or runs (a Work execution receipt, a Codex start or receipt). */
export const WORK_RUN_RECORD_TYPES: ReadonlySet<string> = new Set([
  "chatgpt_work_cloud_execution_receipt_recorded", "codex_execution_started", "execution_receipt_recorded",
]);

/** Whether a run of this directive is on record: its job is then never started again by a retry, checked when the owner
 * authorizes it, when the dispatcher discovers it and when the store records its request (Codex review of 7f7deeee). */
export function workDirectiveHasRun(
  events: readonly StoredEvent[],
  directive: { directive_id: string; directive_revision: number },
): boolean {
  return events.some((event) => WORK_RUN_RECORD_TYPES.has(event.data.type)
    && (event.data as { directive_id?: string }).directive_id === directive.directive_id
    && (event.data as { directive_revision?: number }).directive_revision === directive.directive_revision);
}

/** Whether a Work start may cross the app boundary (the store's check before its handoff intent, right before the app
 * call): a retry the owner authorized never does once a run of its job is on record, recorded at any time before
 * (Codex review of de5312bf). Null when it may. */
export function retryHandoffProblem(
  events: readonly StoredEvent[],
  dispatch: { dispatch_id: string; directive_id: string; directive_revision: number },
): string | null {
  const retry = events.some((event) => event.data.type === "chatgpt_work_cloud_dispatch_retry_authorized"
    && event.data.retry_dispatch_id === dispatch.dispatch_id);
  return retry && workDirectiveHasRun(events, dispatch)
    ? "A retry of a native Work start isn't sent to the app once a run of its job is on record."
    : null;
}

/** Whether Codex may start a directive's job (the store's check): never once the owner authorized a retry of its native
 * Work start, so the retry and a Codex run can't both start it (Codex review of de5312bf). Null when it may. */
export function codexStartReservedProblem(
  events: readonly StoredEvent[],
  start: { directive_id: string; directive_revision: number },
): string | null {
  return events.some((event) => event.data.type === "chatgpt_work_cloud_dispatch_retry_authorized"
    && event.data.directive_id === start.directive_id && event.data.directive_revision === start.directive_revision)
    ? "A native Work job the owner retried is reserved for that retry, so Codex can't start it."
    : null;
}

/**
 * How long a failed start must have settled before it may be retried (Codex review of e508a5f9, P1): a create call
 * that timed out or lost its answer may still complete late, and a new thread may show in the app's listing late. A
 * retry is authorized only this long after Mission Control recorded the failed result (by the store's own time), so the
 * dispatcher's read-only search before the retry's Work call sees any Work thread the failed start made.
 */
export const WORK_CLOUD_RETRY_SETTLE_MS = 30 * 60_000;

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
 * start or receipt); the failed result was recorded at least WORK_CLOUD_RETRY_SETTLE_MS before `at`; and the owner
 * hasn't already authorized a retry of that dispatch.
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
  if (workDirectiveHasRun(events, directive)) return { refusal: "This Work job has a run on record, so it isn't retried." };
  const results = related.filter((event) => event.data.type === "chatgpt_work_cloud_dispatch_recorded")
    .map((event) => event.data as ResultData);
  // Each start's latest result: a start that waited for setup and then failed counts as failed.
  const latestByDispatch = new Map(results.map((result) => [result.dispatch_id, result]));
  if ([...latestByDispatch.values()].some((result) => !WORK_CLOUD_RETRYABLE_STATUSES.has(result.status))) {
    return { refusal: "A start of this Work job is ready or still waiting, so it isn't retried." };
  }
  // A start that made a thread (it waited for setup, or found one) may be running there, whatever its latest result
  // (independent review of b72e68bd).
  if (results.some((result) => Boolean(result.client_thread_id || result.work_thread_id))) {
    return { refusal: "A start of this Work job made a thread in the app, so it isn't retried." };
  }
  const resultIds = new Set(results.map((result) => result.dispatch_id));
  if (related.some((event) => event.data.type === "chatgpt_work_cloud_handoff_intent_recorded"
    && !resultIds.has((event.data as { dispatch_id: string }).dispatch_id))) {
    return { refusal: "A start of this Work job crossed the app boundary without a result yet, so it isn't retried." };
  }
  const latestRequest = related.findLast((event) => event.data.type === "chatgpt_work_cloud_dispatch_requested")?.data as RequestData | undefined;
  if (!latestRequest) return { refusal: "No start of this Work job is on record." };
  if (latestRequest.mode !== "CREATE") return { refusal: "Only a failed start of a new Work thread is retried." };
  const latestResultEvent = related.findLast((event) => event.data.type === "chatgpt_work_cloud_dispatch_recorded"
    && event.data.dispatch_id === latestRequest.dispatch_id);
  const latestResult = latestResultEvent?.data as ResultData | undefined;
  if (!latestResultEvent || !latestResult) return { refusal: "The latest start of this Work job has no result yet, so it isn't retried." };
  if (!retryableWorkCloudResult(latestResult)) {
    return { refusal: `The latest start ended ${latestResult.status} (${latestResult.error_code ?? "no code"}), which can mean a thread holding its prompt exists, so it isn't retried.` };
  }
  const settledAt = Date.parse(latestResultEvent.receivedAt) + WORK_CLOUD_RETRY_SETTLE_MS;
  if (!Number.isFinite(settledAt) || Date.parse(at) < settledAt) {
    return { refusal: `The failed start was recorded less than ${WORK_CLOUD_RETRY_SETTLE_MS / 60_000} minutes ago, and a Work thread it made late could still appear; it can be retried from ${Number.isFinite(settledAt) ? new Date(settledAt).toISOString() : "a known time"}.` };
  }
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
): { dispatchId: string; prior: { dispatchId: string; request: RequestData; resultReceivedAt: string | null } | null } {
  const retries = events.filter((event) => event.data.type === "chatgpt_work_cloud_dispatch_retry_authorized"
    && event.data.worker === worker && event.data.directive_id === directive.directive_id
    && event.data.directive_revision === directive.directive_revision)
    .map((event) => event.data as RetryData);
  // The chain starts at the failed start the owner first retried, as the ledger names it (its id may differ from the one
  // computed now, if the source Chat changed since; independent review of e508a5f9), else at the computed first id.
  const retried = new Set(retries.map((retry) => retry.retry_dispatch_id));
  let dispatchId = retries.find((retry) => !retried.has(retry.failed_dispatch_id))?.failed_dispatch_id ?? firstDispatchId;
  let prior: { dispatchId: string; request: RequestData; resultReceivedAt: string | null } | null = null;
  // The chain is short (each link needs the owner); the bound only guards a malformed ledger.
  for (let hop = 0; hop < 20; hop += 1) {
    const current = dispatchId;
    const retry = retries.find((item) => item.failed_dispatch_id === current);
    if (!retry) break;
    const request = events.find((event) => event.data.type === "chatgpt_work_cloud_dispatch_requested"
      && event.data.worker === worker && event.data.dispatch_id === current)?.data;
    if (request?.type !== "chatgpt_work_cloud_dispatch_requested") break;
    const resultEvent = events.findLast((event) => event.data.type === "chatgpt_work_cloud_dispatch_recorded"
      && event.data.worker === worker && event.data.dispatch_id === current);
    prior = { dispatchId: current, request, resultReceivedAt: resultEvent?.receivedAt ?? null };
    dispatchId = retry.retry_dispatch_id;
  }
  return { dispatchId, prior };
}

/** The failed start a retry follows, as the ledger records it. */
export interface WorkCloudRetryPrior {
  dispatchId: string;
  requestedAt: string;
  /** When Mission Control recorded the failed start's latest result (the store's time), or null if none is on record. */
  resultRecordedAt: string | null;
  promptSha256: string;
}

/**
 * The failed start a dispatch retries, from the ledger alone (Codex review of 10885e69): the owner's authorization naming
 * the dispatch as its retry, the failed start's own request and its latest result. Null when no authorization names the
 * dispatch (it isn't a retry); "UNKNOWN" when one does but the failed start's request isn't on record. The controller
 * takes the retry's search from this, never from its request file, which only carries the prompt text.
 */
export function workCloudRetryPrior(events: readonly StoredEvent[], worker: string, dispatchId: string): WorkCloudRetryPrior | null | "UNKNOWN" {
  const authorization = events.find((event) => event.data.type === "chatgpt_work_cloud_dispatch_retry_authorized"
    && event.data.worker === worker && event.data.retry_dispatch_id === dispatchId)?.data;
  if (authorization?.type !== "chatgpt_work_cloud_dispatch_retry_authorized") return null;
  const failedId = authorization.failed_dispatch_id;
  const request = events.find((event) => event.data.type === "chatgpt_work_cloud_dispatch_requested"
    && event.data.worker === worker && event.data.dispatch_id === failedId)?.data;
  if (request?.type !== "chatgpt_work_cloud_dispatch_requested") return "UNKNOWN";
  const result = events.findLast((event) => event.data.type === "chatgpt_work_cloud_dispatch_recorded"
    && event.data.worker === worker && event.data.dispatch_id === failedId);
  return { dispatchId: failedId, requestedAt: request.requested_at, resultRecordedAt: result?.receivedAt ?? null, promptSha256: request.prompt_sha256 };
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
    // Only an authorization for the worker's current directive counts as a repeat.
    const directive = events.findLast((event) => event.data.type === "execution_directive_recorded")?.data;
    const recorded = events.findLast((event) => event.data.type === "chatgpt_work_cloud_dispatch_retry_authorized"
      && directive?.type === "execution_directive_recorded" && event.data.directive_id === directive.directive_id
      && event.data.directive_revision === directive.directive_revision);
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
