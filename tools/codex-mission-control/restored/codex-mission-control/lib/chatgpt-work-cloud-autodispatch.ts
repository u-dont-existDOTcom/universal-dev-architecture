import { canonicalJson, sha256 } from "./canonical";
import {
  buildWorkCloudDispatchRequestedEnvelope,
  type WorkCloudCapabilityEvidence,
  type WorkCloudDispatchInput,
} from "./chatgpt-work-cloud-dispatch";
import type { AppendEnvelope, StoredEvent } from "./schema";

export const WORK_CLOUD_DISPATCH_RECEIPT_PREFIX = "MISSION_CONTROL_WORK_CLOUD_DISPATCH_RECEIPT_V1\n";
export const WORK_CLOUD_EXECUTION_RECEIPT_PREFIX = "MISSION_CONTROL_WORK_CLOUD_EXECUTION_RECEIPT_V1\n";

export interface PrepareWorkCloudAutoDispatchInput {
  worker: string;
  sourceChatTitle: string;
  sourceChatUrl: string;
  sourceChatBrowserUrl: string | null;
  chatgptProjectId: string | null;
  capabilityEvidence: WorkCloudCapabilityEvidence;
  receiptTarget: string;
  requestedAt: string;
  producerId: string;
}

export interface PreparedWorkCloudAutoDispatch {
  dispatchId: string;
  requestEnvelope: AppendEnvelope;
  workPrompt: string;
  workPromptSha256: string;
  handoffPrompt: string;
  receiptTarget: string;
  existingResult: Extract<StoredEvent["data"], { type: "chatgpt_work_cloud_dispatch_recorded" }> | null;
  existingExecutionReceipt: Extract<StoredEvent["data"], { type: "chatgpt_work_cloud_execution_receipt_recorded" }> | null;
}

export function prepareWorkCloudAutoDispatch(
  events: StoredEvent[],
  input: PrepareWorkCloudAutoDispatchInput,
): PreparedWorkCloudAutoDispatch {
  const directiveEvent = [...events].reverse().find((event) => event.worker === input.worker
    && event.data.type === "execution_directive_recorded" && event.data.status === "ACTIVE");
  const directive = directiveEvent?.data;
  if (!directive || directive.type !== "execution_directive_recorded"
    || directive.directive_schema_version !== 3
    || directive.execution_surface !== "CHATGPT_WORK_CLOUD"
    || !directive.directive_artifact_sha256 || !directive.source_message_id || !directive.source_body_sha256) {
    throw new Error("No current source-bound CHATGPT_WORK_CLOUD execution directive is available.");
  }
  const proof = directive.validated_decision_proof;
  if (!proof?.receipt_event_id) throw new Error("Native Work auto-dispatch requires a validated canonical GitHub decision.");
  const receiptEvent = events.find((event) => event.eventId === proof.receipt_event_id);
  const receipt = receiptEvent?.data;
  if (!receipt || receipt.type !== "github_decision_receipt_ingested"
    || !receipt.bounded_execution || receipt.bounded_execution.execution_surface !== "CHATGPT_WORK_CLOUD") {
    throw new Error("The current native Work directive is not backed by a CHATGPT_WORK_CLOUD bounded execution residue.");
  }
  if (receipt.bounded_execution.prompt.length === 0) throw new Error("Native Work bounded prompt is empty.");

  const dispatchId = `work-cloud:${sha256(canonicalJson({
    worker: input.worker,
    directiveId: directive.directive_id,
    directiveRevision: directive.directive_revision,
    taskId: directive.task_id,
    prompt: receipt.bounded_execution.prompt,
  })).slice(0, 32)}`;
  const requestedWorkTitle = `Work — ${input.sourceChatTitle}`;
  const workPrompt = buildWorkPrompt({
    dispatchId,
    worker: input.worker,
    directiveId: directive.directive_id,
    directiveRevision: directive.directive_revision,
    taskId: directive.task_id,
    sourceChatTitle: input.sourceChatTitle,
    sourceChatBrowserUrl: input.sourceChatBrowserUrl,
    receiptTarget: input.receiptTarget,
    exactDirective: receipt.bounded_execution.prompt,
  });
  const workPromptSha256 = sha256(workPrompt);
  const requestInput: WorkCloudDispatchInput = {
    dispatchId,
    mode: "CREATE",
    binding: {
      worker: input.worker,
      directiveId: directive.directive_id,
      directiveRevision: directive.directive_revision,
      taskId: directive.task_id,
      directiveArtifactSha256: directive.directive_artifact_sha256,
      sourceMessageId: directive.source_message_id,
      sourceBodySha256: directive.source_body_sha256,
    },
    sourceChatTitle: input.sourceChatTitle,
    sourceChatUrl: input.sourceChatUrl,
    sourceChatBrowserUrl: input.sourceChatBrowserUrl,
    requestedWorkTitle,
    chatgptProjectId: input.chatgptProjectId,
    existingWorkThreadId: null,
    prompt: workPrompt,
    approvalState: "NOT_REQUIRED",
    capabilityEvidence: input.capabilityEvidence,
    requestedAt: input.requestedAt,
    producerId: input.producerId,
  };
  const directRequest = buildWorkCloudDispatchRequestedEnvelope(requestInput);
  const requestEnvelope: AppendEnvelope = {
    ...directRequest,
    data: directRequest.data.type === "chatgpt_work_cloud_dispatch_requested"
      ? { ...directRequest.data, source: "MISSION_CONTROL_SUPERVISOR_WORK_DISPATCH" }
      : directRequest.data,
  };
  const existingResult = [...events].reverse().find((event) => event.worker === input.worker
    && event.data.type === "chatgpt_work_cloud_dispatch_recorded"
    && event.data.dispatch_id === dispatchId)?.data ?? null;
  const existingExecutionReceipt = [...events].reverse().find((event) => event.worker === input.worker
    && event.data.type === "chatgpt_work_cloud_execution_receipt_recorded"
    && event.data.dispatch_id === dispatchId)?.data ?? null;

  return {
    dispatchId,
    requestEnvelope,
    workPrompt,
    workPromptSha256,
    handoffPrompt: buildSupervisorHandoffPrompt({
      dispatchId,
      requestedWorkTitle,
      workPrompt,
      workPromptSha256,
      receiptTarget: input.receiptTarget,
      worker: input.worker,
      taskId: directive.task_id,
      directiveId: directive.directive_id,
      directiveRevision: directive.directive_revision,
    }),
    receiptTarget: input.receiptTarget,
    existingResult: existingResult?.type === "chatgpt_work_cloud_dispatch_recorded" ? existingResult : null,
    existingExecutionReceipt: existingExecutionReceipt?.type === "chatgpt_work_cloud_execution_receipt_recorded"
      ? existingExecutionReceipt : null,
  };
}

function buildSupervisorHandoffPrompt(input: {
  dispatchId: string;
  requestedWorkTitle: string;
  workPrompt: string;
  workPromptSha256: string;
  receiptTarget: string;
  worker: string;
  taskId: string;
  directiveId: string;
  directiveRevision: number;
}): string {
  const receiptTemplate = canonicalJson({
    schemaVersion: 1,
    dispatchId: input.dispatchId,
    worker: input.worker,
    taskId: input.taskId,
    directiveId: input.directiveId,
    directiveRevision: input.directiveRevision,
    promptSha256: input.workPromptSha256,
    status: "READY|PENDING_APPROVAL|PENDING_SETUP|FAILED|UNAVAILABLE",
    surface: "CHATGPT_WORK_CLOUD|UNKNOWN",
    workThreadId: null,
    clientThreadId: null,
    errorCode: null,
  });
  return [
    "MISSION_CONTROL_NATIVE_WORK_HANDOFF_V1",
    "This is transport-only. Do not reinterpret, redesign, or execute the bounded task in this supervisor chat.",
    `Create a native ChatGPT Work cloud task with the exact title: ${input.requestedWorkTitle}`,
    "Use the native Work creation/handoff capability available in ChatGPT. Do not substitute Codex.",
    "Preserve any product-level Accept/approval gate; do not bypass it.",
    `The exact Work prompt SHA-256 is ${input.workPromptSha256}.`,
    "Pass the exact Work prompt between WORK_PROMPT_BEGIN/END unchanged to the Work task.",
    `After the native Work tool returns, write exactly one GitHub issue comment to ${input.receiptTarget}.`,
    `Prefix the comment with ${WORK_CLOUD_DISPATCH_RECEIPT_PREFIX.trimEnd()} followed immediately by one JSON object.`,
    "Report only the actual tool result. If no native Work thread locator is returned, do not invent one.",
    `Receipt JSON shape: ${receiptTemplate}`,
    "WORK_PROMPT_BEGIN",
    input.workPrompt,
    "WORK_PROMPT_END",
  ].join("\n");
}

function buildWorkPrompt(input: {
  dispatchId: string;
  worker: string;
  directiveId: string;
  directiveRevision: number;
  taskId: string;
  sourceChatTitle: string;
  sourceChatBrowserUrl: string | null;
  receiptTarget: string;
  exactDirective: string;
}): string {
  const receiptTemplate = canonicalJson({
    schemaVersion: 1,
    dispatchId: input.dispatchId,
    worker: input.worker,
    taskId: input.taskId,
    directiveId: input.directiveId,
    directiveRevision: input.directiveRevision,
    status: "COMPLETED|PARTIAL|BLOCKED|FAILED",
    terminalState: "REPLACE_WITH_BOUNDED_TERMINAL_STATE",
    checksPassed: 0,
    checksFailed: 0,
    checksNotRun: 0,
    blockerCodes: [],
    artifactCount: 0,
  });
  return [
    "MISSION_CONTROL_NATIVE_WORK_EXECUTION_V1",
    `Originating Chat title: ${input.sourceChatTitle}`,
    `Originating Chat URL: ${input.sourceChatBrowserUrl ?? "UNAVAILABLE"}`,
    "Receipt backlink: REQUIRED in every owner-facing receipt.",
    "Execute only the exact bounded directive below. It remains the semantic authority.",
    "Do not broaden authority from this transport wrapper.",
    "At completion/partial/block/failure, publish one privacy-safe machine receipt to Mission Control.",
    `Write exactly one GitHub issue comment to ${input.receiptTarget}.`,
    `Prefix it with ${WORK_CLOUD_EXECUTION_RECEIPT_PREFIX.trimEnd()} followed immediately by one JSON object.`,
    "Do not include prompts, private source content, credentials, absolute local paths, raw logs, or model reasoning in that GitHub receipt.",
    `Receipt JSON shape: ${receiptTemplate}`,
    "EXACT_BOUNDED_DIRECTIVE_BEGIN",
    input.exactDirective,
    "EXACT_BOUNDED_DIRECTIVE_END",
  ].join("\n");
}
