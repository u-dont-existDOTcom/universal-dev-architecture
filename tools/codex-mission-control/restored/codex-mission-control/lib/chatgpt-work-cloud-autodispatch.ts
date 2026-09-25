import { canonicalJson, sha256 } from "./canonical";
import { executionDirectiveArtifactCanonicalJson } from "./github-execution-directive";
import { launchSelectionFor } from "./work-execution-profile";
import type { StoredEvent } from "./schema";
import { ruleGraphPromptBlock, workHandoffRuleGraphProjection } from "./rule-graph-contract";

export const WORK_CLOUD_EXECUTION_RECEIPT_PREFIX = "MISSION_CONTROL_WORK_CLOUD_EXECUTION_RECEIPT_V1\n";
export const WORK_CLOUD_AUTODISPATCH_PRODUCER_ID = "system:chatgpt-work-cloud-dispatch";

export interface WorkCloudSourceChat {
  supervisorId: string;
  sourceChatTitle: string;
  sourceChatUrl: string;
  sourceChatBrowserUrl: string | null;
  chatgptProjectId: string | null;
}

export interface PreparedDirectWorkCloudDispatch {
  worker: string;
  dispatchId: string;
  directiveArtifactText: string;
  workPrompt: string;
  workPromptSha256: string;
  sourceSupervisorId: string;
  sourceChat: WorkCloudSourceChat;
  controllerRequest: {
    dispatchId: string;
    mode: "CREATE";
    binding: {
      worker: string;
      directiveId: string;
      directiveRevision: number;
      taskId: string;
      directiveArtifactSha256: string;
      sourceMessageId: string;
      sourceBodySha256: string;
    };
    directiveArtifactPath: string;
    sourceChatTitle: string;
    sourceChatUrl: string;
    requestedWorkTitle: string;
    chatgptProjectId: string | null;
    existingWorkThreadId: null;
    prompt: string;
    requestedAt: string;
  };
  recoveryState: "NEW" | "REQUEST_ONLY_PROVEN_UNSENT" | "PENDING_SETUP_READ_ONLY";
  order: number;
}

export interface WorkCloudReceiptTarget {
  repository: string;
  stageIssueNumber: number;
}

export function parseWorkCloudSourceChats(raw: string | undefined): WorkCloudSourceChat[] {
  if (!raw?.trim()) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Native Work source-chat registry must be valid JSON."); }
  if (!Array.isArray(value)) throw new Error("Native Work source-chat registry must be an array.");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Native Work source-chat entry ${index} must be an object.`);
    const record = item as Record<string, unknown>;
    const supervisorId = requiredString(record.supervisorId, `sourceChats[${index}].supervisorId`);
    const sourceChatTitle = requiredString(record.sourceChatTitle ?? record.title ?? record.label, `sourceChats[${index}].sourceChatTitle`);
    const bootstrap = record.bootstrapCapability && typeof record.bootstrapCapability === "object" && !Array.isArray(record.bootstrapCapability)
      ? record.bootstrapCapability as Record<string, unknown> : null;
    const browserUrl = nullableString(record.sourceChatBrowserUrl ?? record.browserUrl ?? bootstrap?.url, `sourceChats[${index}].sourceChatBrowserUrl`);
    const explicitUri = nullableString(record.sourceChatUrl, `sourceChats[${index}].sourceChatUrl`);
    const sourceChatUrl = explicitUri ?? conversationUriFromBrowserUrl(browserUrl);
    if (!sourceChatUrl || !/^chatgpt-conversation:\/\/[A-Za-z0-9-]+$/.test(sourceChatUrl)) {
      throw new Error(`Native Work source-chat entry ${index} requires an exact ChatGPT conversation locator.`);
    }
    const chatgptProjectId = nullableString(record.chatgptProjectId, `sourceChats[${index}].chatgptProjectId`);
    return { supervisorId, sourceChatTitle, sourceChatUrl, sourceChatBrowserUrl: browserUrl, chatgptProjectId };
  });
}

export function discoverDirectWorkCloudDispatches(input: {
  events: StoredEvent[];
  sourceChats: WorkCloudSourceChat[];
  receiptTarget: WorkCloudReceiptTarget;
  requestedAt: string;
  artifactPathFor: (dispatchId: string) => string;
}): PreparedDirectWorkCloudDispatch[] {
  const sourceBySupervisor = new Map(input.sourceChats.map((item) => [item.supervisorId, item]));
  const latestDirectiveByWorker = new Map<string, StoredEvent>();
  for (const event of input.events) {
    if (event.data.type === "execution_directive_recorded") latestDirectiveByWorker.set(event.data.worker, event);
  }
  const candidates: PreparedDirectWorkCloudDispatch[] = [];
  for (const directiveEvent of latestDirectiveByWorker.values()) {
    const directive = directiveEvent.data;
    if (directive.type !== "execution_directive_recorded" || directive.status !== "ACTIVE"
      || directive.directive_schema_version !== 3 || directive.execution_surface !== "CHATGPT_WORK_CLOUD"
      || !directive.directive_artifact_sha256 || !directive.source_message_id || !directive.source_body_sha256
      || directive.work_execution_profile === "LEGACY_MODEL_PROFILE_UNSPECIFIED") continue;
    const proof = directive.validated_decision_proof;
    if (!proof?.receipt_event_id) continue;
    const receiptEvent = input.events.find((event) => event.eventId === proof.receipt_event_id);
    const receipt = receiptEvent?.data;
    if (!receipt || receipt.type !== "github_decision_receipt_ingested" || !receipt.supervisor_id
      || !receipt.bounded_execution || receipt.bounded_execution.execution_surface !== "CHATGPT_WORK_CLOUD") continue;
    const sourceChat = sourceBySupervisor.get(receipt.supervisor_id);
    if (!sourceChat) continue;
    const bounded = receipt.bounded_execution;
    const sourceDirective = {
      id: directive.directive_id,
      revision: directive.directive_revision,
      taskId: directive.task_id,
      sourceMessageId: directive.source_message_id,
      sourceBodySha256: directive.source_body_sha256,
    };
    const selection = launchSelectionFor(bounded.work_execution_profile);
    const directiveArtifactText = executionDirectiveArtifactCanonicalJson({
      bounded, sourceDirective, requestedModel: selection.model, reasoningEffort: selection.thinking,
    });
    if (sha256(directiveArtifactText) !== directive.directive_artifact_sha256) {
      throw new Error(`Native Work directive artifact ${directive.directive_id} does not reconstruct to its durable digest.`);
    }
    const dispatchId = `work-cloud:${sha256(canonicalJson({
      worker: directive.worker,
      directiveId: directive.directive_id,
      directiveRevision: directive.directive_revision,
      taskId: directive.task_id,
      directiveArtifactSha256: directive.directive_artifact_sha256,
      sourceMessageId: directive.source_message_id,
      sourceBodySha256: directive.source_body_sha256,
      sourceChatUrl: sourceChat.sourceChatUrl,
      boundedPromptSha256: sha256(bounded.prompt),
    })).slice(0, 32)}`;
    const workPrompt = buildDirectWorkPrompt({
      dispatchId,
      worker: directive.worker,
      directiveId: directive.directive_id,
      directiveRevision: directive.directive_revision,
      taskId: directive.task_id,
      sourceChat,
      receiptTarget: input.receiptTarget,
      exactDirective: bounded.prompt,
    });
    const request = [...input.events].reverse().find((event) => event.worker === directive.worker
      && event.data.type === "chatgpt_work_cloud_dispatch_requested" && event.data.dispatch_id === dispatchId)?.data;
    const intent = [...input.events].reverse().find((event) => event.worker === directive.worker
      && event.data.type === "chatgpt_work_cloud_handoff_intent_recorded" && event.data.dispatch_id === dispatchId)?.data;
    const result = [...input.events].reverse().find((event) => event.worker === directive.worker
      && event.data.type === "chatgpt_work_cloud_dispatch_recorded" && event.data.dispatch_id === dispatchId)?.data;
    const executionReceipt = [...input.events].reverse().find((event) => event.worker === directive.worker
      && event.data.type === "chatgpt_work_cloud_execution_receipt_recorded" && event.data.dispatch_id === dispatchId)?.data;
    if (executionReceipt) continue;
    let recoveryState: PreparedDirectWorkCloudDispatch["recoveryState"];
    if (result?.type === "chatgpt_work_cloud_dispatch_recorded") {
      if (result.status !== "PENDING_SETUP") continue;
      recoveryState = "PENDING_SETUP_READ_ONLY";
    } else if (!request) recoveryState = "NEW";
    else if (!intent) recoveryState = "REQUEST_ONLY_PROVEN_UNSENT";
    else continue; // provider-bound intent without outcome is ambiguous and never blocks another eligible worker.
    candidates.push({
      worker: directive.worker,
      dispatchId,
      directiveArtifactText,
      workPrompt,
      workPromptSha256: sha256(workPrompt),
      sourceSupervisorId: receipt.supervisor_id,
      sourceChat,
      controllerRequest: {
        dispatchId,
        mode: "CREATE",
        binding: {
          worker: directive.worker,
          directiveId: directive.directive_id,
          directiveRevision: directive.directive_revision,
          taskId: directive.task_id,
          directiveArtifactSha256: directive.directive_artifact_sha256,
          sourceMessageId: directive.source_message_id,
          sourceBodySha256: directive.source_body_sha256,
        },
        directiveArtifactPath: input.artifactPathFor(dispatchId),
        sourceChatTitle: sourceChat.sourceChatTitle,
        sourceChatUrl: sourceChat.sourceChatUrl,
        requestedWorkTitle: `Work — ${sourceChat.sourceChatTitle}`,
        chatgptProjectId: sourceChat.chatgptProjectId,
        existingWorkThreadId: null,
        prompt: workPrompt,
        requestedAt: request?.type === "chatgpt_work_cloud_dispatch_requested" ? request.requested_at : input.requestedAt,
      },
      recoveryState,
      order: directiveEvent.sequence,
    });
  }
  return candidates.sort((left, right) => left.order - right.order || left.worker.localeCompare(right.worker));
}

export function buildDirectWorkPrompt(input: {
  dispatchId: string;
  worker: string;
  directiveId: string;
  directiveRevision: number;
  taskId: string;
  sourceChat: WorkCloudSourceChat;
  receiptTarget: WorkCloudReceiptTarget;
  exactDirective: string;
}): string {
  const receiptTarget = `https://github.com/${input.receiptTarget.repository}/issues/${input.receiptTarget.stageIssueNumber}`;
  const ruleGraph = workHandoffRuleGraphProjection();
  const receiptTemplate = canonicalJson({
    schemaVersion: 1,
    dispatchId: input.dispatchId,
    worker: input.worker,
    taskId: input.taskId,
    directiveId: input.directiveId,
    directiveRevision: input.directiveRevision,
    status: "COMPLETED|PARTIAL|BLOCKED|FAILED",
    terminalState: "PRIVACY_SAFE_TERMINAL_CODE",
    checksPassed: 0,
    checksFailed: 0,
    checksNotRun: 0,
    blockerCodes: [],
    artifactSha256s: [],
  });
  return [
    "MISSION_CONTROL_NATIVE_WORK_EXECUTION_V2",
    `Originating Chat title: ${input.sourceChat.sourceChatTitle}`,
    `Originating Chat URL: ${input.sourceChat.sourceChatBrowserUrl ?? input.sourceChat.sourceChatUrl}`,
    "Receipt backlink to the originating Chat is required in any owner-facing Work receipt.",
    "Execute only the exact bounded directive below. Work has execution-facts authority only; it may not author methodology, strategy, adequacy, owner decisions, or the next consequential directive.",
    `On COMPLETED, PARTIAL, BLOCKED, or FAILED, return exactly one machine receipt block in the final Work assistant message. Do not write the receipt to GitHub yourself; a deterministic Mission Control copier will publish the exact machine bytes to ${receiptTarget}.`,
    `Prefix the machine block with ${WORK_CLOUD_EXECUTION_RECEIPT_PREFIX.trimEnd()} followed immediately by one strict JSON object. The block must be the final content in the response; a mandatory visible timestamp may precede it, but nothing may follow the JSON.`,
    "The machine receipt may contain only control-plane facts: IDs already shown in the template, status/code fields, check counts, blocker codes, and artifact SHA-256 values.",
    "Do not put prompts, private source text, credentials, absolute private filesystem paths, raw logs, free-form model reasoning, or artifact paths in the machine receipt.",
    `Receipt JSON shape: ${receiptTemplate}`,
    ...ruleGraphPromptBlock(ruleGraph),
    "EXACT_BOUNDED_DIRECTIVE_BEGIN",
    input.exactDirective,
    "EXACT_BOUNDED_DIRECTIVE_END",
  ].join("\n");
}

function conversationUriFromBrowserUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "chatgpt.com") return null;
    const match = url.pathname.match(/^\/c\/([A-Za-z0-9-]+)\/?$/);
    return match ? `chatgpt-conversation://${match[1]}` : null;
  } catch { return null; }
}
function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  return value;
}
function nullableString(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a string or null.`);
  return value;
}

// Picks the next dispatch for one watcher cycle. A PENDING_SETUP dispatch is only a read-only
// re-resolution; retrying it every cycle hammered the app bridge, so it is retried at most once
// per retryMs. New and proven-unsent dispatches are never delayed.
export function selectWorkCloudDispatchCandidate(
  candidates: PreparedDirectWorkCloudDispatch[],
  lastPendingAttemptMs: ReadonlyMap<string, number>,
  nowMs: number,
  retryMs: number,
): PreparedDirectWorkCloudDispatch | null {
  for (const candidate of candidates) {
    if (candidate.recoveryState !== "PENDING_SETUP_READ_ONLY") return candidate;
    const last = lastPendingAttemptMs.get(candidate.dispatchId);
    if (last === undefined || nowMs - last >= retryMs) return candidate;
  }
  return null;
}
