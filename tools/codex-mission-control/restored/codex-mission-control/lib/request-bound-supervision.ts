import { canonicalJson, sha256 } from "./canonical";
import type { GitHubDecisionCandidate, GitHubReceiptPolicy, PendingDecisionRequest } from "./github-decision-receipts";
import type { AppendEnvelope, CanonicalDecisionEnvelope, StoredEvent } from "./schema";
import { inBandRequestRoutePrefix } from "./in-band-request-binding";

export const requestBoundRoutePrefix = "MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V5\n";
export const requestBoundStep = "REQUEST_BOUND_DECISION";
export const requestBoundRole = "REQUEST_BOUND_DECISION_SESSION";
export const requestBoundAttestationSummary = "MISSION_CONTROL_REQUEST_BOUND_EXECUTION_V1";
export const requestBoundProvenance = "REQUEST_BOUND_MCP_GITHUB_OBSERVED";
const sessionSummary = "MISSION_CONTROL_PROVIDER_SESSION_V1";
const modelSummary = "MISSION_CONTROL_PROVIDER_SESSION_MODEL_UI_V1";
const stageSummary = "MISSION_CONTROL_RELAY_STAGE_V1";
const mcpSummary = "MISSION_CONTROL_PROVIDER_SESSION_MCP_READ_V1";
const mcpCollector = "collector:public-mcp-access";
const legacyControlRefs = {
  model_visible_label: "GPT-5.6 Sol", thinking_control_label: "Thinking effort",
  thinking_visible_label: "Extra High", thinking_ordinal: "4 of 5", account_plan_label: "Pro",
  account_plan_role: "PROVENANCE_METADATA_ONLY", account_plan_is_reasoning_mode: "false",
  backend_model_identity_claimed: "false", assistant_content_observed: "false",
};
const currentControlRefs = {
  model_selection_policy: "TOP_VISIBLE_SELECTABLE_MODEL", model_selector_index: "0",
  thinking_control_label: "Thinking effort", thinking_visible_label: "Extra High", thinking_ordinal: "4 of 5",
  account_plan_label: "Pro", account_plan_role: "PROVENANCE_METADATA_ONLY",
  account_plan_is_reasoning_mode: "false", backend_model_identity_claimed: "false", assistant_content_observed: "false",
};

export interface RequestExecutionContext {
  task_id: string;
  run_id?: string;
  family_id?: string;
  round?: number;
}

export interface RequestBoundRouteAcknowledgement {
  acknowledgedOriginal: true;
  eventId: string;
  messageId: string;
  queuedAt: string;
  expiresAt: string;
  expiredAtAcknowledgement: boolean;
  sendEligible: boolean;
  binding: {
    requestId: string;
    worker: string;
    producerId: string;
    destination: string;
    destinationSupervisorId: string;
    executionContext: unknown;
    nonce: string;
    reasoningLane: string;
    evidenceCapsule: unknown;
    ownerOutcome: unknown;
    githubReceipt: unknown;
    continuationSource: unknown;
  };
}

/** A context is bound only when supplied. Do not manufacture a scientific run/family/round. */
export function requestExecutionContext(value: unknown, taskId: string): RequestExecutionContext {
  if (value === undefined) return { task_id: taskId };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid execution context.");
  const item = value as Record<string, unknown>;
  const allowed = ["task_id", "run_id", "family_id", "round"];
  if (Object.keys(item).some((key) => !allowed.includes(key)) || item.task_id !== taskId) throw new Error("Execution context task mismatch.");
  const hasRun = ["run_id", "family_id", "round"].some((key) => Object.hasOwn(item, key));
  if (hasRun && (typeof item.run_id !== "string" || !item.run_id.trim() || item.run_id.length > 180
    || typeof item.family_id !== "string" || !item.family_id.trim() || item.family_id.length > 180
    || !Number.isSafeInteger(item.round) || Number(item.round) < 0)) throw new Error("Run context requires exact run, family and round.");
  return hasRun ? { task_id: taskId, run_id: item.run_id as string, family_id: item.family_id as string, round: item.round as number } : { task_id: taskId };
}

export function requestBindingDigest(request: PendingDecisionRequest, providerSessionId: string, policy: GitHubReceiptPolicy): string {
  return sha256(canonicalJson({
    protocol: "PER_REQUEST_V1", request_id: request.requestId, request_nonce: request.nonce,
    supervisor_id: request.supervisorId, provider_session_id: providerSessionId, worker_id: request.worker,
    execution_context: request.executionContext ?? { task_id: request.taskId }, reasoning_lane: request.reasoningLane,
    queued_at: request.queuedAt, expires_at: request.expiresAt,
    evidence_capsule: request.evidenceCapsule, owner_outcome: request.ownerOutcome,
    receipt_targets: { repository: policy.repository, decision_issue_number: policy.decisionIssueNumber, stage_issue_number: policy.stageIssueNumber },
  }));
}

/** The session ID is correlation, NOT provider authentication or a reusable capability. */
export function requestBoundSession(
  events: StoredEvent[], request: PendingDecisionRequest, policy: GitHubReceiptPolicy,
  providerSessionId: string, at: string, allowedLifecycles: string[],
): StoredEvent | null {
  if (request.routeSchemaVersion !== 5 || !policy.requestBound?.enabled || !Number.isFinite(Date.parse(at))) return null;
  const records = events.filter((event) => isTrustedEvidence(event, sessionSummary, policy.requestBound!.relayProducerIds)
    && exactRef(event, "provider_session") === providerSessionId && inWindow(event, request.queuedAt, at));
  // A trusted sender must never reuse a session identity across requests or supervisors.
  if (records.some((event) => !boundTo(event, request, providerSessionId))) return null;
  const latest = records.sort((a, b) => a.sequence - b.sequence).at(-1);
  return latest && exactRef(latest, "session_role") === requestBoundRole
    && exactRef(latest, "message_ordinal") === "1"
    && allowedLifecycles.includes(exactRef(latest, "lifecycle_status") ?? "") ? latest : null;
}

export function assertRequestBoundExecution(
  events: StoredEvent[], request: PendingDecisionRequest, policy: GitHubReceiptPolicy,
  decision: Extract<CanonicalDecisionEnvelope, { schema_version: 4 }>, candidate: GitHubDecisionCandidate, ingestedAt: string,
): string {
  const fail = (reason: string): never => { throw new Error(`Request-bound execution rejected: ${reason}.`); };
  if (!policy.requestBound?.enabled || request.routeSchemaVersion !== 5) fail("protocol not enabled for this route");
  if (decision.supervisor_id !== request.supervisorId
    || decision.request_binding_sha256 !== requestBindingDigest(request, decision.provider_session_id, policy)) fail("exact request/session/context binding mismatch");
  const expectedLocator = `https://github.com/${candidate.repository}/issues/${candidate.issueNumber}#issuecomment-${candidate.commentId}`;
  if (candidate.immutableUrl !== expectedLocator) fail("GitHub comment locator mismatch");
  const session = requestBoundSession(events, request, policy, decision.provider_session_id, ingestedAt, ["COMPLETE"]);
  if (!session || exactRef(session, "url_binding_status") !== "EXACT") fail("completed exact provider session missing");
  const url = exactRef(session!, "conversation_url");
  if (!url || !/^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/.test(url)) fail("exact conversation binding missing");
  const relayIds = policy.requestBound!.relayProducerIds;
  const scoped = events.filter((event) => boundTo(event, request, decision.provider_session_id)
    && inWindow(event, request.queuedAt, ingestedAt));
  const model = scoped.find((event) => isTrustedEvidence(event, modelSummary, relayIds)
    && exactRef(event, "session_role") === requestBoundRole && controlEvidence(event) !== null);
  if (!model) fail("visible model/control observation missing");
  const modelControls = controlEvidence(model) ?? fail("model/control observation is invalid");
  const stages = scoped.filter((event) => isTrustedEvidence(event, stageSummary, relayIds)
    && exactRef(event, "step") === requestBoundStep && exactRef(event, "conversation_url") === url
    && exactRef(event, "message_ordinal") === "1" && exactRef(event, "first_message") === "true"
    && controlEvidence(event) !== null);
  const starts = stages.filter((event) => exactRef(event, "generation_state") === "STARTED");
  const completes = stages.filter((event) => exactRef(event, "generation_state") === "COMPLETE");
  const start = starts.sort((a, b) => a.sequence - b.sequence)[0];
  const complete = completes.sort((a, b) => a.sequence - b.sequence).at(-1);
  if (!start || !complete) fail("provider generation evidence incomplete; reconcile unchanged artifact");
  const promptHash = exactRef(start!, "prompt_sha256");
  if (!promptHash || !/^[a-f0-9]{64}$/.test(promptHash)
    || stages.some((event) => {
      const controls = controlEvidence(event);
      return !controls || controls.kind !== modelControls.kind || controls.modelLabel !== modelControls.modelLabel
        || exactRef(event, "prompt_sha256") !== promptHash;
    })) fail("prompt identity or model/control evidence changed within one request");
  const sentSessions = new Set(events.filter((event) => isTrustedEvidence(event, stageSummary, relayIds)
    && event.worker === request.worker && exactRef(event, "request") === request.requestId
    && exactRef(event, "generation_state") === "STARTED" && inWindow(event, request.queuedAt, ingestedAt))
    .map((event) => exactRef(event, "provider_session")));
  if (sentSessions.size !== 1 || !sentSessions.has(decision.provider_session_id)) fail("more than one provider send session observed");
  // GitHub created_at has second precision. Treat it as a precision interval, not clock skew permission.
  const created = Date.parse(candidate.createdAt);
  const createdUpper = created + (/T\d\d:\d\d:\d\dZ$/.test(candidate.createdAt) ? 999 : 0);
  if (!Number.isFinite(created) || Date.parse(start!.occurredAt) > createdUpper
    || Date.parse(complete!.occurredAt) < created || Date.parse(complete!.occurredAt) > Date.parse(ingestedAt)
    || Date.parse(start!.occurredAt) > Date.parse(complete!.occurredAt)
    || Date.parse(model!.occurredAt) > Date.parse(start!.occurredAt)) fail("artifact outside observed generation window");
  const access = scoped.find((event) => isTrustedEvidence(event, mcpSummary, [mcpCollector])
    && hasRefs(event, { tool: "get_supervisory_request_binding", status: "OK", server_observed: "true" })
    && Date.parse(event.occurredAt) <= createdUpper && Date.parse(event.receivedAt) <= Date.parse(ingestedAt));
  if (!access || access.data.type !== "evidence_receipt_recorded") fail("no server-observed request-bound MCP call");
  // Composer chips are telemetry only. They cannot replace either authenticated collector evidence.
  return access!.data.type === "evidence_receipt_recorded" ? access!.data.receipt_id : fail("invalid access receipt");
}

function controlEvidence(event: StoredEvent): { kind: "CURRENT" | "LEGACY"; modelLabel: string } | null {
  if (hasRefs(event, currentControlRefs)) {
    const modelLabel = exactRef(event, "model_ui_label");
    return modelLabel ? { kind: "CURRENT", modelLabel } : null;
  }
  if (hasRefs(event, legacyControlRefs)) {
    return { kind: "LEGACY", modelLabel: exactRef(event, "model_ui_label") ?? "GPT-5.6 Sol" };
  }
  return null;
}

function exactRef(event: StoredEvent, key: string): string | null {
  if (event.data.type !== "evidence_receipt_recorded") return null;
  const values = event.data.refs.filter((ref) => ref.startsWith(`${key}:`));
  return values.length === 1 ? values[0]!.slice(key.length + 1) : null;
}
function hasRefs(event: StoredEvent, refs: Record<string, string>): boolean {
  return Object.entries(refs).every(([key, value]) => exactRef(event, key) === value);
}
function boundTo(event: StoredEvent, request: PendingDecisionRequest, sessionId: string): boolean {
  return event.worker === request.worker && hasRefs(event, { request: request.requestId, supervisor: request.supervisorId, provider_session: sessionId });
}
function inWindow(event: StoredEvent, from: string, to: string): boolean {
  const time = Date.parse(event.occurredAt);
  return Number.isFinite(time) && time >= Date.parse(from) && time <= Date.parse(to);
}
function isTrustedEvidence(event: StoredEvent, summary: string, producers: string[]): boolean {
  return event.data.type === "evidence_receipt_recorded" && event.data.summary === summary && event.data.verified
    && event.producerKind === "COLLECTOR" && producers.includes(event.producerId)
    && event.data.producer_id === event.producerId && event.data.producer_role === "COLLECTOR";
}

/** Stable enqueue identity; retries acknowledge the original durable queue event. */
export function requestRouteEventId(requestId: string, schemaVersion: 5 | 6 = 5): string {
  return `supervision-request-v${schemaVersion}:${sha256(requestId)}`;
}

export function requestBoundRouteQueuedAt(
  event: StoredEvent,
  expected: { eventId: string; requestId: string; worker: string; producerId: string; producerKind: string },
): string {
  const body = requestBoundRouteBody(event.data);
  if (event.eventId !== expected.eventId || event.worker !== expected.worker
    || event.producerId !== expected.producerId || event.producerKind !== expected.producerKind
    || body.requestId !== expected.requestId || body.worker !== expected.worker
    || body.producerId !== expected.producerId) {
    throw new Error("Existing request-bound route does not match the authenticated request, worker, or producer.");
  }
  const queuedAt = requiredRouteString(body, "queuedAt");
  const expiresAt = requiredRouteString(body, "expiresAt");
  if (!Number.isFinite(Date.parse(queuedAt)) || !Number.isFinite(Date.parse(expiresAt))
    || Date.parse(expiresAt) <= Date.parse(queuedAt) || event.occurredAt !== queuedAt) {
    throw new Error("Existing request-bound route has an invalid durable queue window.");
  }
  return queuedAt;
}

export function acknowledgeRequestBoundRoute(
  existing: StoredEvent,
  intended: AppendEnvelope,
  observedAt: string,
): RequestBoundRouteAcknowledgement {
  if (existing.eventId !== intended.event_id || existing.missionId !== intended.mission_id
    || existing.occurredAt !== intended.occurred_at
    || canonicalJson(existing.data) !== canonicalJson(intended.data)) {
    throw new Error("Request-bound admission replay conflicts with the original durable request intent.");
  }
  const body = requestBoundRouteBody(existing.data);
  const intendedBody = requestBoundRouteBody(intended.data);
  if (canonicalJson(body) !== canonicalJson(intendedBody)) {
    throw new Error("Request-bound admission replay changed the durable request binding.");
  }
  const expiresAt = requiredRouteString(body, "expiresAt");
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) throw new Error("Request-bound acknowledgement time is invalid.");
  const continuation = body.continuationBinding;
  const continuationRecord = isRouteRecord(continuation) ? continuation : null;
  const delivery = continuationRecord && isRouteRecord(continuationRecord.supervisor_delivery)
    ? continuationRecord.supervisor_delivery : null;
  return {
    acknowledgedOriginal: true,
    eventId: existing.eventId,
    messageId: existing.data.type === "worker_message_recorded" ? existing.data.message_id : "",
    queuedAt: requiredRouteString(body, "queuedAt"),
    expiresAt,
    expiredAtAcknowledgement: Date.parse(expiresAt) <= observed,
    sendEligible: Date.parse(expiresAt) > observed,
    binding: {
      requestId: requiredRouteString(body, "requestId"),
      worker: requiredRouteString(body, "worker"),
      producerId: requiredRouteString(body, "producerId"),
      destination: requiredRouteString(body, "destination"),
      destinationSupervisorId: requiredRouteString(body, "destinationSupervisorId"),
      executionContext: body.executionContext,
      nonce: requiredRouteString(body, "nonce"),
      reasoningLane: requiredRouteString(body, "reasoningLane"),
      evidenceCapsule: body.evidenceCapsule,
      ownerOutcome: body.ownerOutcome,
      githubReceipt: body.githubReceipt,
      continuationSource: continuationRecord ? {
        continuationId: continuationRecord.continuation_id,
        decisionRequestId: continuationRecord.decision_request_id,
        path: continuationRecord.path,
        sourceMessageId: delivery?.message_id,
        sourceBodySha256: delivery?.body_sha256,
        digest: body.continuationBindingSha256,
      } : null,
    },
  };
}

function requestBoundRouteBody(data: AppendEnvelope["data"] | StoredEvent["data"]): Record<string, unknown> {
  if (data.type !== "worker_message_recorded"
    || !data.body.startsWith(requestBoundRoutePrefix) && !data.body.startsWith(inBandRequestRoutePrefix)) {
    throw new Error("Existing event is not a request-bound supervisory route.");
  }
  const prefix = data.body.startsWith(inBandRequestRoutePrefix) ? inBandRequestRoutePrefix : requestBoundRoutePrefix;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.body.slice(prefix.length));
  } catch {
    throw new Error("Existing request-bound route body is invalid JSON.");
  }
  if (!isRouteRecord(parsed) || parsed.schemaVersion !== (prefix === inBandRequestRoutePrefix ? 6 : 5)) {
    throw new Error("Existing request-bound route body has the wrong schema.");
  }
  return parsed;
}

function requiredRouteString(value: Record<string, unknown>, key: string): string {
  const item = value[key];
  if (typeof item !== "string" || item.length === 0) {
    throw new Error(`Existing request-bound route is missing ${key}.`);
  }
  return item;
}

function isRouteRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
