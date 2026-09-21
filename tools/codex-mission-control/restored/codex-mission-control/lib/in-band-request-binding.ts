import { canonicalJson, sha256 } from "./canonical";
import type { GitHubDecisionCandidate, GitHubReceiptPolicy, PendingDecisionRequest } from "./github-decision-receipts";
import type { CanonicalDecisionEnvelope, StoredEvent } from "./schema";

export const inBandRequestRoutePrefix = "MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V6\n";
export const inBandRequestProtocol = "IN_BAND_REQUEST_BINDING_V1";
export const inBandRequestProvenance = "IN_BAND_REQUEST_BINDING_GITHUB_OBSERVED";
export const inBandRequestStep = "IN_BAND_REQUEST_DECISION";
export const inBandRequestRole = "IN_BAND_REQUEST_DECISION_SESSION";
export const inBandPreSendSummary = "MISSION_CONTROL_IN_BAND_REQUEST_BINDING_PRE_SEND_V1";
export const inBandAttestationSummary = "MISSION_CONTROL_IN_BAND_REQUEST_BINDING_EXECUTION_V1";
export const inBandAppReadbackSummary = "MISSION_CONTROL_PROVIDER_SESSION_APP_READBACK_V1";
export const inBandAppReadbackProducerId = "collector:chatgpt-app-readback";
const sessionSummary = "MISSION_CONTROL_PROVIDER_SESSION_V1";
const modelSummary = "MISSION_CONTROL_PROVIDER_SESSION_MODEL_UI_V1";
const stageSummary = "MISSION_CONTROL_RELAY_STAGE_V1";
const controlRefs = {
  model_visible_label: "GPT-5.6 Sol", thinking_control_label: "Thinking effort",
  thinking_visible_label: "Extra High", thinking_ordinal: "4 of 5", account_plan_label: "Pro",
  account_plan_role: "PROVENANCE_METADATA_ONLY", account_plan_is_reasoning_mode: "false",
  backend_model_identity_claimed: "false", assistant_content_observed: "false",
};

export interface InBandRequestBindingPayload {
  schema_version: 1;
  binding_schema: "MISSION_CONTROL_IN_BAND_REQUEST_BINDING_V1";
  execution_protocol: "IN_BAND_REQUEST_BINDING_V1";
  request_id: string;
  request_nonce: string;
  supervisor_id: string;
  provider_session_id: string;
  worker_id: string;
  execution_context: unknown;
  reasoning_lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED";
  queued_at: string;
  expires_at: string;
  evidence_capsule: { id: string; sha256: string };
  owner_outcome: { id: string; epoch: number; sha256: string };
  decision_receipt_target: { repository: string; issue_number: number; immutable_issue_url: string };
}

export interface InBandRequestBindingEnvelope extends InBandRequestBindingPayload {
  in_band_binding_sha256: string;
}

export interface SubmissionAuthoritySnapshot {
  admissions?: unknown[];
  queueItems?: unknown[];
}

export function inBandRequestBindingPayload(
  request: PendingDecisionRequest,
  providerSessionId: string,
  policy: GitHubReceiptPolicy,
): InBandRequestBindingPayload {
  return {
    schema_version: 1,
    binding_schema: "MISSION_CONTROL_IN_BAND_REQUEST_BINDING_V1",
    execution_protocol: inBandRequestProtocol,
    request_id: request.requestId,
    request_nonce: request.nonce,
    supervisor_id: request.supervisorId,
    provider_session_id: providerSessionId,
    worker_id: request.worker,
    execution_context: request.executionContext ?? { task_id: request.taskId },
    reasoning_lane: request.reasoningLane,
    queued_at: request.queuedAt,
    expires_at: request.expiresAt,
    evidence_capsule: request.evidenceCapsule,
    owner_outcome: request.ownerOutcome,
    decision_receipt_target: {
      repository: policy.repository,
      issue_number: policy.decisionIssueNumber,
      immutable_issue_url: `https://github.com/${policy.repository}/issues/${policy.decisionIssueNumber}`,
    },
  };
}

export function inBandRequestBindingEnvelope(
  request: PendingDecisionRequest,
  providerSessionId: string,
  policy: GitHubReceiptPolicy,
): InBandRequestBindingEnvelope {
  const payload = inBandRequestBindingPayload(request, providerSessionId, policy);
  return { ...payload, in_band_binding_sha256: sha256(canonicalJson(payload)) };
}

export function assertInBandRequestExecution(
  events: StoredEvent[], request: PendingDecisionRequest, policy: GitHubReceiptPolicy,
  decision: Extract<CanonicalDecisionEnvelope, { schema_version: 5 }>, candidate: GitHubDecisionCandidate,
  ingestedAt: string, submissionAuthorityState: unknown,
): { preSendReceiptId: string; admissionId: string; promptSha256: string } {
  const fail = (reason: string): never => { throw new Error(`In-band request execution rejected: ${reason}.`); };
  const requestBoundPolicy = policy.requestBound;
  if (!requestBoundPolicy?.enabled || request.routeSchemaVersion !== 6) fail("protocol not enabled for this route");
  const expected = inBandRequestBindingEnvelope(request, decision.provider_session_id, policy);
  if (decision.supervisor_id !== request.supervisorId
    || decision.in_band_binding_sha256 !== expected.in_band_binding_sha256) fail("exact in-band request/session/context binding mismatch");
  const expectedLocator = `${expected.decision_receipt_target.immutable_issue_url}#issuecomment-${candidate.commentId}`;
  if (candidate.immutableUrl !== expectedLocator) fail("GitHub comment locator mismatch");
  if (candidate.repository.toLowerCase() !== expected.decision_receipt_target.repository.toLowerCase()
    || candidate.issueNumber !== expected.decision_receipt_target.issue_number) fail("GitHub decision target mismatch");

  const relayIds = requestBoundPolicy!.relayProducerIds;
  const scoped = events.filter((event) => boundTo(event, request, decision.provider_session_id)
    && inWindow(event, request.queuedAt, ingestedAt));

  const authority = asRecord(submissionAuthorityState);
  const admissions = Array.isArray(authority?.admissions) ? authority.admissions.map(asRecord).filter(Boolean) : [];
  const requestAdmissions = admissions.filter((item) => item!.requestId === request.requestId);
  if (requestAdmissions.length === 0) fail("at least one central single-use admission is required");
  const crossedAdmissions = requestAdmissions.filter((item) => item!.status === "BOUNDARY_RECORDED");
  if (crossedAdmissions.length !== 1) fail("exactly one central admission may cross the provider boundary");
  const admission = crossedAdmissions[0]!;
  const safePriorStatuses = new Set(["ABORTED_BEFORE_BOUNDARY", "EXPIRED_BEFORE_BOUNDARY", "RECOVERED_BEFORE_COMPOSITION"]);
  const priorAdmissions = requestAdmissions.filter((item) => item !== admission);
  if (priorAdmissions.some((item) => item!.queueItemId !== admission.queueItemId
    || item!.producerId !== admission.producerId || item!.supervisorId !== request.supervisorId
    || item!.targetKind !== "FRESH_PROVIDER_SESSION" || item!.targetKey !== decision.provider_session_id
    || item!.bodySha256 !== admission.bodySha256
    || item!.queueKey !== `request:${request.requestId}:${inBandRequestStep}`
    || item!.retryRootKey !== `request:${request.requestId}:${inBandRequestStep}`
    || item!.sendPath !== `SUPERVISORY_CYCLE_${inBandRequestStep}`
    || !safePriorStatuses.has(String(item!.status)) || item!.boundaryAt !== null)) {
    fail("prior retry admissions are not all centrally proven pre-boundary safe");
  }

  const preSend = scoped.filter((event) => isTrustedEvidence(event, inBandPreSendSummary, relayIds));
  const finalPreSend = preSend.filter((event) => exactRef(event, "submission_admission") === admission.admissionId);
  if (finalPreSend.length !== 1) fail("exactly one trusted pre-send binding receipt is required for the crossed admission");
  const pre = finalPreSend[0]!;
  const promptSha256 = exactRef(pre, "provider_body_sha256");
  const admissionId = exactRef(pre, "submission_admission");
  if (!promptSha256 || !/^[a-f0-9]{64}$/.test(promptSha256)
    || !admissionId || exactRef(pre, "binding_protocol") !== inBandRequestProtocol
    || exactRef(pre, "binding_schema") !== expected.binding_schema
    || exactRef(pre, "in_band_binding_sha256") !== expected.in_band_binding_sha256
    || exactRef(pre, "decision_receipt_target") !== expected.decision_receipt_target.immutable_issue_url
    || exactRef(pre, "trusted_relay_producer") !== pre.producerId
    || exactRef(pre, "semantic_authority") !== "false") fail("trusted pre-send binding receipt does not match the exact envelope/body");
  const admissionsById = new Map(requestAdmissions.map((item) => [String(item!.admissionId), item!]));
  for (const receipt of preSend) {
    const receiptAdmissionId = exactRef(receipt, "submission_admission");
    const linked = receiptAdmissionId ? admissionsById.get(receiptAdmissionId) : null;
    if (!linked || linked.producerId !== receipt.producerId
      || exactRef(receipt, "binding_protocol") !== inBandRequestProtocol
      || exactRef(receipt, "binding_schema") !== expected.binding_schema
      || exactRef(receipt, "in_band_binding_sha256") !== expected.in_band_binding_sha256
      || exactRef(receipt, "provider_body_sha256") !== promptSha256
      || exactRef(receipt, "decision_receipt_target") !== expected.decision_receipt_target.immutable_issue_url
      || exactRef(receipt, "trusted_relay_producer") !== receipt.producerId
      || exactRef(receipt, "semantic_authority") !== "false"
      || (linked !== admission && (!safePriorStatuses.has(String(linked.status)) || linked.boundaryAt !== null))) {
      fail("retry pre-send history is not bound to the exact safe admission chain");
    }
  }

  const sessionRecords = scoped.filter((event) => isTrustedEvidence(event, sessionSummary, relayIds));
  if (sessionRecords.some((event) => exactRef(event, "session_role") !== inBandRequestRole)) fail("provider session role mismatch");
  const exactSessions = sessionRecords.filter((event) => exactRef(event, "message_ordinal") === "1"
    && exactRef(event, "url_binding_status") === "EXACT"
    && /^https:\/\/chatgpt\.com\/c\/(?:WEB:)?[A-Za-z0-9_-]+$/.test(exactRef(event, "conversation_url") ?? ""));
  const exactSession = exactSessions.sort((a, b) => a.sequence - b.sequence).at(-1);
  if (!exactSession) fail("exact provider session binding missing");
  const conversationUrl = exactRef(exactSession!, "conversation_url") ?? fail("exact conversation binding missing");
  const relayComplete = exactSessions.find((event) => exactRef(event, "lifecycle_status") === "COMPLETE");
  const machineBlockSha256 = sha256(candidate.body);
  const appReadbacks = events.filter((event) => event.worker === request.worker
    && inWindow(event, request.queuedAt, ingestedAt) && isTrustedAppReadback(event)
    && hasRefs(event, {
      request: request.requestId, supervisor: request.supervisorId, provider_session: decision.provider_session_id,
      status: "COMPLETE", machine_block_sha256: machineBlockSha256, provider_prompt_sha256: promptSha256!,
      conversation_url: conversationUrl, thread_surface: "chatgpt", semantic_authority: "false",
      readback_method: "APP_OWNED_THREAD_EXACT_MACHINE_BLOCK",
    }));
  if (appReadbacks.length > 1) fail("app-owned provider completion evidence is ambiguous");
  const appReadback = appReadbacks[0] ?? null;
  if (!relayComplete && !appReadback) fail("provider completion evidence missing; reconcile unchanged app-owned artifact");
  const model = scoped.find((event) => isTrustedEvidence(event, modelSummary, relayIds)
    && exactRef(event, "session_role") === inBandRequestRole && hasRefs(event, controlRefs));
  if (!model) fail("fixed visible model/control observation missing");
  const stages = scoped.filter((event) => isTrustedEvidence(event, stageSummary, relayIds)
    && exactRef(event, "step") === inBandRequestStep && exactRef(event, "conversation_url") === conversationUrl
    && exactRef(event, "message_ordinal") === "1" && exactRef(event, "first_message") === "true"
    && exactRef(event, "selected_app") === "GitHub" && exactRef(event, "semantic_authority") === "false"
    && hasRefs(event, controlRefs));
  const starts = stages.filter((event) => exactRef(event, "generation_state") === "STARTED");
  const completes = stages.filter((event) => exactRef(event, "generation_state") === "COMPLETE");
  const start = starts.sort((a, b) => a.sequence - b.sequence)[0];
  const complete = completes.sort((a, b) => a.sequence - b.sequence).at(-1);
  if (!start || (!complete && !appReadback)) fail("provider generation evidence incomplete; reconcile unchanged artifact");
  if (stages.some((event) => exactRef(event, "prompt_sha256") !== promptSha256
    || event.data.type === "evidence_receipt_recorded" && event.data.refs.some((ref) => ref === "selected_app:Mission Control"))) {
    fail("provider prompt identity or selected app changed");
  }
  if (scoped.some((event) => event.data.type === "evidence_receipt_recorded"
    && (event.data.summary === "MISSION_CONTROL_PROVIDER_SESSION_MCP_READ_V1"
      || event.data.refs.some((ref) => ref.startsWith("tool:get_supervisory_request_binding"))))) {
    fail("V6 must not carry an MCP receipt");
  }
  const sentSessions = new Set(events.filter((event) => isTrustedEvidence(event, stageSummary, relayIds)
    && event.worker === request.worker && exactRef(event, "request") === request.requestId
    && exactRef(event, "generation_state") === "STARTED" && inWindow(event, request.queuedAt, ingestedAt))
    .map((event) => exactRef(event, "provider_session")));
  if (starts.length !== 1 || sentSessions.size !== 1 || !sentSessions.has(decision.provider_session_id)) {
    fail("more than one provider generation/send session observed");
  }

  if (admission.admissionId !== admissionId || admission.producerId !== pre.producerId
    || admission.supervisorId !== request.supervisorId || admission.targetKind !== "FRESH_PROVIDER_SESSION"
    || admission.targetKey !== decision.provider_session_id || admission.bodySha256 !== promptSha256
    || admission.queueKey !== `request:${request.requestId}:${inBandRequestStep}`
    || admission.retryRootKey !== `request:${request.requestId}:${inBandRequestStep}`
    || admission.sendPath !== `SUPERVISORY_CYCLE_${inBandRequestStep}`
    || admission.status !== "BOUNDARY_RECORDED" || admission.boundaryKind !== "GENERATION_STARTED") {
    fail("central admission does not authorize the exact relay/session/provider body");
  }
  const queueItems = Array.isArray(authority?.queueItems) ? authority.queueItems.map(asRecord).filter(Boolean) : [];
  const queue = queueItems.filter((item) => item!.queueItemId === admission.queueItemId);
  const queueAdmissionIds = queue.length === 1 && Array.isArray(queue[0]!.admissionIds) ? queue[0]!.admissionIds.map(String) : [];
  const requestAdmissionIds = requestAdmissions.map((item) => String(item!.admissionId));
  if (queue.length !== 1 || queue[0]!.status !== "BOUNDARY_RECORDED"
    || queueAdmissionIds.length !== requestAdmissionIds.length
    || queueAdmissionIds.some((id) => !requestAdmissionIds.includes(id))
    || requestAdmissionIds.some((id) => !queueAdmissionIds.includes(id))
    || queueAdmissionIds.at(-1) !== admissionId) {
    fail("central admission chain is not single-use with only proven pre-boundary retries");
  }

  const created = Date.parse(candidate.createdAt);
  const createdUpper = created + (/T\d\d:\d\d:\d\dZ$/.test(candidate.createdAt) ? 999 : 0);
  const admitted = Date.parse(String(admission.admittedAt));
  const boundary = Date.parse(String(admission.boundaryAt));
  const startAt = Date.parse(start!.occurredAt);
  const appReadbackAt = appReadback ? Date.parse(appReadback.occurredAt) : null;
  const relayCompleteAt = complete ? Date.parse(complete.occurredAt) : null;
  const commonTimingInvalid = !Number.isFinite(created) || !Number.isFinite(admitted) || !Number.isFinite(boundary)
    || admitted > Date.parse(pre.occurredAt) || Date.parse(pre.occurredAt) > boundary
    || boundary > startAt || startAt > createdUpper
    || Date.parse(model!.occurredAt) > Date.parse(pre.occurredAt)
    || Date.parse(request.expiresAt) <= Date.parse(pre.occurredAt);
  const copiedAfterRequestExpiry = created > Date.parse(request.expiresAt);
  const completionTimingInvalid = appReadback
    ? (!Number.isFinite(appReadbackAt) || startAt > appReadbackAt! || appReadbackAt! > createdUpper || created > Date.parse(ingestedAt)
      || appReadbackAt! > Date.parse(request.expiresAt))
    : (!Number.isFinite(relayCompleteAt) || relayCompleteAt! < created || relayCompleteAt! > Date.parse(ingestedAt)
      || startAt > relayCompleteAt!);
  if (copiedAfterRequestExpiry && !appReadback) fail("post-expiry transport copy requires current app-owned completion evidence");
  if (commonTimingInvalid || completionTimingInvalid) fail("binding/admission/generation/artifact timing is invalid or stale");
  return {
    preSendReceiptId: pre.data.type === "evidence_receipt_recorded" ? pre.data.receipt_id : fail("invalid pre-send receipt"),
    admissionId: admissionId!,
    promptSha256: promptSha256!,
  };
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
function isTrustedAppReadback(event: StoredEvent): boolean {
  return event.data.type === "evidence_receipt_recorded" && event.data.summary === inBandAppReadbackSummary && event.data.verified
    && event.producerKind === "COLLECTOR" && event.producerId === inBandAppReadbackProducerId
    && event.data.producer_id === event.producerId && event.data.producer_role === "COLLECTOR";
}
function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}
