import { canonicalJson, sha256 } from "./canonical";
import type { AppendEnvelope } from "./schema";

export const CHATGPT_WORK_CLOUD_SURFACE = "CHATGPT_WORK_CLOUD" as const;
export const CHATGPT_WORK_CLOUD_TARGET = "chatgptWorkCloud" as const;

export type WorkCloudDispatchMode = "CREATE" | "CONTINUE";
export type WorkCloudApprovalState = "NOT_REQUIRED" | "PENDING_OWNER_ACCEPT" | "ACCEPTED" | "DECLINED";
export type WorkCloudDispatchStatus = "PENDING_APPROVAL" | "PENDING_SETUP" | "READY" | "FAILED" | "UNAVAILABLE";

export interface WorkCloudDirectiveBinding {
  worker: string;
  directiveId: string;
  directiveRevision: number;
  taskId: string;
  directiveArtifactSha256: string;
  sourceMessageId: string;
  sourceBodySha256: string;
}

export interface WorkCloudCapabilityEvidence {
  observedAt: string;
  appVersion: string;
  createThreadTargetAvailable: boolean;
  sendMessageToThreadAvailable: boolean;
  nativeSurfaceVerificationAvailable: boolean;
}

export interface WorkCloudDispatchInput {
  dispatchId: string;
  mode: WorkCloudDispatchMode;
  binding: WorkCloudDirectiveBinding;
  sourceChatTitle: string;
  sourceChatUrl: string;
  requestedWorkTitle: string;
  chatgptProjectId: string | null;
  existingWorkThreadId: string | null;
  prompt: string;
  capabilityEvidence: WorkCloudCapabilityEvidence;
  requestedAt: string;
  producerId: string;
}

export type WorkCloudExecutorOutcome =
  | { kind: "READY"; surface: typeof CHATGPT_WORK_CLOUD_SURFACE | "CODEX" | "ORDINARY_CHAT" | "UNKNOWN"; threadId: string; hostId: string | null }
  | { kind: "WRONG_SURFACE"; observedSurface: "CODEX" | "ORDINARY_CHAT" | "UNKNOWN" }
  | { kind: "PENDING_SETUP"; clientThreadId: string }
  | { kind: "PENDING_APPROVAL" }
  | { kind: "UNAVAILABLE"; reasonCode: string }
  | { kind: "FAILED"; reasonCode: string };

export interface WorkCloudAppExecutor {
  createThread(input: {
    title: string;
    prompt: string;
    requestedAt: string;
    target: { type: typeof CHATGPT_WORK_CLOUD_TARGET; projectId?: string };
  }): Promise<WorkCloudExecutorOutcome>;
  sendMessageToThread(input: { threadId: string; prompt: string }): Promise<WorkCloudExecutorOutcome>;
  resolveCreatedThread?(input: {
    clientThreadId: string;
    prompt: string;
    requestedAt: string;
    projectId: string | null;
  }): Promise<WorkCloudExecutorOutcome>;
}

export interface WorkCloudDispatchState {
  request: AppendEnvelope;
  handoffIntent?: AppendEnvelope | null;
  result: AppendEnvelope | null;
}

export interface WorkCloudEventSink {
  getWorkCloudDispatch(worker: string, dispatchId: string): Promise<WorkCloudDispatchState | null>;
  recordWorkerEvents(worker: string, events: AppendEnvelope[]): Promise<unknown>;
}

export class WorkCloudDispatchAmbiguityError extends Error {}

export async function dispatchChatGptWorkCloud(
  input: WorkCloudDispatchInput,
  executor: WorkCloudAppExecutor | null,
  recordedAt = input.requestedAt,
): Promise<{ request: AppendEnvelope; result: AppendEnvelope }> {
  validateInput(input);
  const request = buildWorkCloudDispatchRequestedEnvelope(input);
  const outcome = normalizeExecutorOutcome(await executeWorkCloudAppCall(input, executor));
  return { request, result: buildWorkCloudDispatchRecordedEnvelope(input, outcome, recordedAt) };
}

export async function dispatchAndRecordChatGptWorkCloud(
  input: WorkCloudDispatchInput,
  executor: WorkCloudAppExecutor | null,
  sink: WorkCloudEventSink,
  recordedAt = input.requestedAt,
): Promise<{ request: AppendEnvelope; result: AppendEnvelope }> {
  validateInput(input);
  const request = buildWorkCloudDispatchRequestedEnvelope(input);
  const existing = await sink.getWorkCloudDispatch(input.binding.worker, input.dispatchId);
  if (existing && canonicalJson(dispatchIntent(existing.request)) !== canonicalJson(dispatchIntent(request))) {
    throw new WorkCloudDispatchAmbiguityError(
      `Native Work dispatch ${input.dispatchId} already exists with different source-bound request content.`,
    );
  }
  if (existing?.result) {
    if (existing.result.data.type !== "chatgpt_work_cloud_dispatch_recorded"
      || existing.result.data.status !== "PENDING_SETUP") {
      return { request: existing.request, result: existing.result };
    }
    if (input.mode !== "CREATE" || !existing.result.data.client_thread_id || !executor?.resolveCreatedThread) {
      return { request: existing.request, result: existing.result };
    }
    const outcome = normalizeExecutorOutcome(await executor.resolveCreatedThread({
      clientThreadId: existing.result.data.client_thread_id,
      prompt: input.prompt,
      requestedAt: requestedAtFrom(existing.request),
      projectId: input.chatgptProjectId,
    }));
    const result = buildWorkCloudDispatchRecordedEnvelope(input, outcome, recordedAt);
    await sink.recordWorkerEvents(input.binding.worker, [result]);
    return { request: existing.request, result };
  }
  const durableRequest = existing?.request ?? request;
  if (existing?.handoffIntent) {
    throw new WorkCloudDispatchAmbiguityError(
      `Native Work dispatch ${input.dispatchId} has durable app-boundary intent but no result; automatic replay is prohibited.`,
    );
  }
  if (!existing?.request) await sink.recordWorkerEvents(input.binding.worker, [request]);
  const handoffIntent = buildWorkCloudHandoffIntentEnvelope(input, recordedAt);
  await sink.recordWorkerEvents(input.binding.worker, [handoffIntent]);
  const outcome = normalizeExecutorOutcome(await executeWorkCloudAppCall(input, executor));
  const result = buildWorkCloudDispatchRecordedEnvelope(input, outcome, recordedAt);
  await sink.recordWorkerEvents(input.binding.worker, [result]);
  return { request: durableRequest, result };
}

async function executeWorkCloudAppCall(
  input: WorkCloudDispatchInput,
  executor: WorkCloudAppExecutor | null,
): Promise<WorkCloudExecutorOutcome> {
  const capabilityAvailable = input.mode === "CREATE"
    ? input.capabilityEvidence.createThreadTargetAvailable
    : input.capabilityEvidence.sendMessageToThreadAvailable;
  if (!input.capabilityEvidence.nativeSurfaceVerificationAvailable || !executor) {
    return { kind: "UNAVAILABLE", reasonCode: !input.capabilityEvidence.nativeSurfaceVerificationAvailable
      ? "WORK_CLOUD_SURFACE_VERIFICATION_UNAVAILABLE" : "WORK_CLOUD_DISPATCH_UNAVAILABLE" };
  }
  if (!capabilityAvailable) return { kind: "PENDING_APPROVAL" };
  try {
    return input.mode === "CREATE"
      ? await executor.createThread({
        title: input.requestedWorkTitle,
        prompt: input.prompt,
        requestedAt: input.requestedAt,
        target: {
          type: CHATGPT_WORK_CLOUD_TARGET,
          ...(input.chatgptProjectId ? { projectId: input.chatgptProjectId } : {}),
        },
      })
      : await executor.sendMessageToThread({ threadId: input.existingWorkThreadId!, prompt: input.prompt });
  } catch {
    return { kind: "FAILED", reasonCode: "WORK_CLOUD_APP_EXECUTOR_FAILED" };
  }
}

function normalizeExecutorOutcome(outcome: WorkCloudExecutorOutcome): WorkCloudExecutorOutcome {
  if (outcome.kind === "READY" && outcome.surface !== CHATGPT_WORK_CLOUD_SURFACE) {
    return { kind: "WRONG_SURFACE", observedSurface: outcome.surface === "CODEX" ? "CODEX" : "UNKNOWN" };
  }
  return outcome;
}

export function buildWorkCloudDispatchRequestedEnvelope(input: WorkCloudDispatchInput): AppendEnvelope {
  validateInput(input);
  return {
    schema_version: 2,
    event_id: `work-cloud-dispatch-request:${input.dispatchId}`,
    mission_id: "mission-control-live",
    occurred_at: input.requestedAt,
    data: {
      type: "chatgpt_work_cloud_dispatch_requested",
      worker: input.binding.worker,
      dispatch_id: input.dispatchId,
      mode: input.mode,
      requested_surface: CHATGPT_WORK_CLOUD_SURFACE,
      directive_id: input.binding.directiveId,
      directive_revision: input.binding.directiveRevision,
      task_id: input.binding.taskId,
      directive_artifact_sha256: input.binding.directiveArtifactSha256,
      source_message_id: input.binding.sourceMessageId,
      source_body_sha256: input.binding.sourceBodySha256,
      source_chat_title: input.sourceChatTitle,
      source_chat_url: input.sourceChatUrl,
      requested_work_title: input.requestedWorkTitle,
      chatgpt_project_id: input.chatgptProjectId,
      existing_work_thread_id: input.existingWorkThreadId,
      prompt_sha256: sha256(input.prompt),
      approval_state: "PENDING_OWNER_ACCEPT",
      capability_evidence: {
        observed_at: input.capabilityEvidence.observedAt,
        app_version: input.capabilityEvidence.appVersion,
        create_thread_target_available: input.capabilityEvidence.createThreadTargetAvailable,
        send_message_to_thread_available: input.capabilityEvidence.sendMessageToThreadAvailable,
        native_surface_verification_available: input.capabilityEvidence.nativeSurfaceVerificationAvailable,
      },
      requested_at: input.requestedAt,
      producer_id: input.producerId,
      source: "TRUSTED_CHATGPT_APP_EXECUTOR_BOUNDARY",
    },
  };
}

export function buildWorkCloudHandoffIntentEnvelope(
  input: WorkCloudDispatchInput,
  intentAt = input.requestedAt,
): AppendEnvelope {
  validateInput(input);
  return {
    schema_version: 2,
    event_id: `work-cloud-handoff-intent:${input.dispatchId}`,
    mission_id: "mission-control-live",
    occurred_at: intentAt,
    data: {
      type: "chatgpt_work_cloud_handoff_intent_recorded",
      worker: input.binding.worker,
      dispatch_id: input.dispatchId,
      directive_id: input.binding.directiveId,
      directive_revision: input.binding.directiveRevision,
      task_id: input.binding.taskId,
      app_tool: input.mode === "CREATE" ? "create_thread" : "send_message_to_thread",
      intent_at: intentAt,
      producer_id: input.producerId,
      source: "TRUSTED_CHATGPT_APP_EXECUTOR_BOUNDARY",
    },
  };
}

export function buildWorkCloudDispatchRecordedEnvelope(
  input: WorkCloudDispatchInput,
  outcome: WorkCloudExecutorOutcome,
  recordedAt: string,
): AppendEnvelope {
  validateInput(input);
  const base = {
    type: "chatgpt_work_cloud_dispatch_recorded" as const,
    worker: input.binding.worker,
    dispatch_id: input.dispatchId,
    mode: input.mode,
    requested_surface: CHATGPT_WORK_CLOUD_SURFACE,
    directive_id: input.binding.directiveId,
    directive_revision: input.binding.directiveRevision,
    task_id: input.binding.taskId,
    app_tool: input.mode === "CREATE" ? "create_thread" as const : "send_message_to_thread" as const,
    work_thread_id: null as string | null,
    client_thread_id: null as string | null,
    approval_state: "PENDING_OWNER_ACCEPT" as WorkCloudApprovalState,
    surface_verification: "NOT_VERIFIED" as "NOT_VERIFIED" | "VERIFIED_NATIVE_WORK" | "REJECTED_WRONG_SURFACE",
    native_surface_evidence: null as null | "TRUSTED_APP_EXECUTOR_CHATGPT_WORK_CLOUD_TARGET" | "TRUSTED_APP_EXECUTOR_EXISTING_WORK_THREAD",
    host_id: null as string | null,
    error_code: null as string | null,
    recorded_at: recordedAt,
    producer_id: input.producerId,
    source: "TRUSTED_CHATGPT_APP_EXECUTOR_BOUNDARY" as const,
  };
  if (outcome.kind === "READY") {
    base.work_thread_id = outcome.threadId;
    base.host_id = outcome.hostId;
    base.approval_state = "ACCEPTED";
    base.surface_verification = "VERIFIED_NATIVE_WORK";
    base.native_surface_evidence = input.mode === "CREATE"
      ? "TRUSTED_APP_EXECUTOR_CHATGPT_WORK_CLOUD_TARGET"
      : "TRUSTED_APP_EXECUTOR_EXISTING_WORK_THREAD";
  } else if (outcome.kind === "WRONG_SURFACE") {
    base.surface_verification = "REJECTED_WRONG_SURFACE";
    base.error_code = `WORK_CLOUD_WRONG_SURFACE_${outcome.observedSurface}`;
  } else if (outcome.kind === "PENDING_SETUP") {
    base.client_thread_id = outcome.clientThreadId;
  } else if (outcome.kind === "PENDING_APPROVAL") {
    base.approval_state = "PENDING_OWNER_ACCEPT";
  } else {
    base.error_code = sanitizeReasonCode(outcome.reasonCode);
  }
  return {
    schema_version: 2,
    event_id: `work-cloud-dispatch-result:${input.dispatchId}:${sha256(canonicalJson({ outcome, recordedAt })).slice(0, 16)}`,
    mission_id: "mission-control-live",
    occurred_at: recordedAt,
    data: { ...base, status: outcome.kind === "WRONG_SURFACE" ? "FAILED" : outcome.kind },
  };
}

function validateInput(input: WorkCloudDispatchInput): void {
  if (!input.requestedWorkTitle.startsWith("Work — ")) throw new Error("Native Work titles must preserve the deterministic Work — lineage prefix.");
  if (!input.prompt.trim()) throw new Error("Native Work dispatch requires a non-empty source-bound prompt.");
  if (!/^chatgpt-conversation:\/\/[A-Za-z0-9-]+$/.test(input.sourceChatUrl)) throw new Error("Native Work dispatch requires the exact originating Chat conversation URL.");
  if (input.mode === "CREATE" && input.existingWorkThreadId !== null) throw new Error("CREATE must not carry an existing Work thread id.");
  if (input.mode === "CONTINUE" && !input.existingWorkThreadId) throw new Error("CONTINUE requires a persisted native Work thread id.");
}

function sanitizeReasonCode(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9_:./-]+/g, "_").slice(0, 120);
  return normalized || "WORK_CLOUD_DISPATCH_FAILED";
}

function requestedAtFrom(request: AppendEnvelope): string {
  if (request.data.type !== "chatgpt_work_cloud_dispatch_requested") {
    throw new WorkCloudDispatchAmbiguityError("Durable Work-cloud dispatch request has the wrong event type.");
  }
  return request.data.requested_at;
}

/**
 * Same-dispatch replay is bound to immutable source intent. Observation and
 * recording clocks are evidence about an attempt, not part of its identity.
 */
function dispatchIntent(request: AppendEnvelope): unknown {
  if (request.data.type !== "chatgpt_work_cloud_dispatch_requested") {
    throw new WorkCloudDispatchAmbiguityError("Durable Work-cloud dispatch request has the wrong event type.");
  }
  const data = request.data;
  return {
    worker: data.worker,
    dispatch_id: data.dispatch_id,
    mode: data.mode,
    requested_surface: data.requested_surface,
    directive_id: data.directive_id,
    directive_revision: data.directive_revision,
    task_id: data.task_id,
    directive_artifact_sha256: data.directive_artifact_sha256,
    source_message_id: data.source_message_id,
    source_body_sha256: data.source_body_sha256,
    source_chat_title: data.source_chat_title,
    source_chat_url: data.source_chat_url,
    requested_work_title: data.requested_work_title,
    chatgpt_project_id: data.chatgpt_project_id,
    existing_work_thread_id: data.existing_work_thread_id,
    prompt_sha256: data.prompt_sha256,
    producer_id: data.producer_id,
    source: data.source,
  };
}
