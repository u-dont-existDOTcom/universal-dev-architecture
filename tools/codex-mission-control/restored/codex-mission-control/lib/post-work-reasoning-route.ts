import { canonicalJson, sha256 } from "./canonical";
import type { GitHubReceiptPolicy } from "./github-decision-receipts";
import { inBandRequestRoutePrefix } from "./in-band-request-binding";
import { requestRouteEventId } from "./request-bound-supervision";
import type { AppendEnvelope, StoredEvent } from "./schema";

export const POST_EXECUTION_REASONING_ROUTER_PRODUCER_ID = "system:post-execution-reasoning-router";

export function buildPostWorkReasoningRouteEnvelope(input: {
  events: StoredEvent[];
  executionReceipt: AppendEnvelope & {
    data: Extract<AppendEnvelope["data"], { type: "chatgpt_work_cloud_execution_receipt_recorded" }>;
  };
  policy: GitHubReceiptPolicy;
  recordedAt: string;
  reviewAttemptId?: string;
}): AppendEnvelope {
  const receipt = input.executionReceipt.data;
  const directiveEvent = [...input.events].reverse().find((event) => event.worker === receipt.worker
    && event.data.type === "execution_directive_recorded"
    && event.data.directive_id === receipt.directive_id
    && event.data.directive_revision === receipt.directive_revision);
  const directive = directiveEvent?.data;
  if (!directive || directive.type !== "execution_directive_recorded"
    || directive.execution_surface !== "CHATGPT_WORK_CLOUD"
    || directive.task_id !== receipt.task_id
    || directive.validated_decision_proof?.authority_path !== "VALIDATED_GITHUB_SUPERVISORY_DECISION") {
    throw new Error("Post-Work reasoning return requires the exact source-bound native Work directive.");
  }
  const originDecisionEvent = input.events.find((event) => event.eventId === directive.validated_decision_proof!.receipt_event_id);
  const originDecision = originDecisionEvent?.data;
  if (!originDecision || originDecision.type !== "github_decision_receipt_ingested" || !originDecision.supervisor_id
    || originDecision.worker !== receipt.worker || originDecision.task_id !== receipt.task_id) {
    throw new Error("Post-Work reasoning return cannot recover the original stable supervisor.");
  }
  const originRoute = findOriginRoute(input.events, receipt.worker, originDecision.request_id);
  if (!originRoute || originRoute.destinationSupervisorId !== originDecision.supervisor_id
    || originRoute.taskId !== receipt.task_id) {
    throw new Error("Post-Work reasoning return cannot recover the exact original supervisor route.");
  }
  const currentOutcome = [...input.events].reverse().find((event) => event.worker === receipt.worker
    && event.data.type === "owner_outcome_recorded")?.data;
  if (!currentOutcome || currentOutcome.type !== "owner_outcome_recorded") {
    throw new Error("Post-Work reasoning return requires the current owner outcome.");
  }
  const recordedMs = Date.parse(input.recordedAt);
  const originalWindowMs = Date.parse(originRoute.expiresAt) - Date.parse(originRoute.queuedAt);
  if (!Number.isFinite(recordedMs) || !Number.isFinite(originalWindowMs) || originalWindowMs <= 0) {
    throw new Error("Post-Work reasoning return cannot derive a valid fresh review window.");
  }
  const expiresAt = new Date(recordedMs + originalWindowMs).toISOString();
  const evidencePayload = {
    dispatch_id: receipt.dispatch_id,
    directive_id: receipt.directive_id,
    directive_revision: receipt.directive_revision,
    task_id: receipt.task_id,
    status: receipt.status,
    terminal_state: receipt.terminal_state,
    check_summary: receipt.check_summary,
    blocker_codes: receipt.blocker_codes,
    artifact_sha256s: receipt.artifact_sha256s,
    github_comment_sha256: receipt.github_comment_sha256,
    github_receipt: receipt.github_receipt,
  };
  // The reasoning supervisor is intentionally GitHub-read-only. Bind its evidence
  // capsule to the exact immutable Work receipt bytes it can independently read,
  // not to a Mission-Control-only event projection or a private Work thread id.
  const evidenceSha256 = receipt.github_comment_sha256;
  if (input.reviewAttemptId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(input.reviewAttemptId)) {
    throw new Error("Post-Work review attempt id is invalid.");
  }
  const attemptBinding = input.reviewAttemptId === undefined ? "" : `:${input.reviewAttemptId}`;
  const requestId = `post-work-review:${sha256(`${receipt.dispatch_id}:${input.executionReceipt.event_id}${attemptBinding}`).slice(0, 32)}`;
  const nonce = `post-work-nonce:${sha256(`${input.executionReceipt.event_id}:${currentOutcome.owner_outcome_sha256}${attemptBinding}`).slice(0, 32)}`;
  const evidenceCapsule = { id: `github-work-receipt:${receipt.github_receipt.comment_id}`, sha256: evidenceSha256 };
  const ownerOutcome = { id: currentOutcome.owner_outcome_id, epoch: currentOutcome.epoch, sha256: currentOutcome.owner_outcome_sha256 };
  const body = inBandRequestRoutePrefix + canonicalJson({
    schemaVersion: 6,
    executionContext: { task_id: receipt.task_id },
    packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE",
    requestId,
    actionBlockedOrRouted: "AUTHOR_REVIEW",
    worker: receipt.worker,
    producerId: POST_EXECUTION_REASONING_ROUTER_PRODUCER_ID,
    destination: originRoute.destination,
    destinationSupervisorId: originDecision.supervisor_id,
    standingOwnerAuthorization: true,
    ownerRelayRequired: false,
    actionTimeConfirmationRequired: false,
    providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY",
    primaryDecision: "POST_EXECUTION_REASONING_REVIEW_REQUIRED",
    routeDecision: "MISSION_CONTROL_INTERNAL_ROUTE",
    factualPacket: {
      packetId: `post-work-packet:${sha256(input.executionReceipt.event_id).slice(0, 32)}`,
      taskId: receipt.task_id,
      exactFactualState: canonicalJson({
        executor: "CHATGPT_WORK_CLOUD",
        dispatch_id: receipt.dispatch_id,
        status: receipt.status,
        terminal_state: receipt.terminal_state,
        check_summary: receipt.check_summary,
        blocker_codes: receipt.blocker_codes,
        artifact_sha256s: receipt.artifact_sha256s,
        github_receipt: receipt.github_receipt,
        github_comment_sha256: receipt.github_comment_sha256,
        semantic_authority: false,
      }),
      evidenceRefs: [
        receipt.github_receipt.immutable_url,
        `work_execution_receipt_sha256:${receipt.github_comment_sha256}`,
      ],
      decisionRequested: "Review the native Work execution facts against the current owner outcome. Decide whether the owner outcome is satisfied or issue the next exact source-bound execution directive. Work has no semantic authority.",
      supervisoryCycle: {
        bindingProtocol: "IN_BAND_REQUEST_BINDING_V1",
        executionContext: { task_id: receipt.task_id },
        nonce, evidenceCapsule, ownerOutcome, reasoningLane: originDecision.reasoning_lane,
        githubReceipt: {
          repository: input.policy.repository,
          issueNumber: input.policy.decisionIssueNumber,
          stageIssueNumber: input.policy.stageIssueNumber,
        },
        expiresAt,
      },
    },
    queuedAt: input.recordedAt,
    nonce,
    reasoningLane: originDecision.reasoning_lane,
    evidenceCapsule,
    ownerOutcome,
    githubReceipt: {
      repository: input.policy.repository,
      issueNumber: input.policy.decisionIssueNumber,
      stageIssueNumber: input.policy.stageIssueNumber,
    },
    expiresAt,
    writerContract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretationAllowed: false },
  });
  if (body.length > 20_000) throw new Error("Post-Work V6 reasoning route exceeds the durable message limit.");
  const eventId = requestRouteEventId(requestId, 6);
  return {
    schema_version: 2,
    event_id: eventId,
    mission_id: "mission-control-live",
    occurred_at: input.recordedAt,
    data: {
      type: "worker_message_recorded",
      worker: receipt.worker,
      message_id: `message:${eventId}`,
      thread_id: `thread:post-work-review:${receipt.worker}`,
      message_kind: "QUESTION",
      body,
      reply_to_message_id: null,
      direction_id: null,
    },
  };
}

function findOriginRoute(events: StoredEvent[], worker: string, requestId: string): {
  destination: "PROJECT_MANAGER_CHAT" | "SPECIALIST_SUPERVISOR_CHAT";
  destinationSupervisorId: string;
  taskId: string;
  queuedAt: string;
  expiresAt: string;
} | null {
  for (const event of events) {
    if (event.worker !== worker || event.data.type !== "worker_message_recorded") continue;
    const newline = event.data.body.indexOf("\n");
    if (newline < 0) continue;
    let root: unknown;
    try { root = JSON.parse(event.data.body.slice(newline + 1)); } catch { continue; }
    if (!root || typeof root !== "object" || Array.isArray(root)) continue;
    const record = root as Record<string, unknown>;
    if (record.requestId !== requestId) continue;
    const factual = record.factualPacket;
    if (!factual || typeof factual !== "object" || Array.isArray(factual)) continue;
    const destination = record.destination;
    const destinationSupervisorId = record.destinationSupervisorId;
    const queuedAt = record.queuedAt;
    const expiresAt = record.expiresAt;
    const taskId = (factual as Record<string, unknown>).taskId;
    if ((destination !== "PROJECT_MANAGER_CHAT" && destination !== "SPECIALIST_SUPERVISOR_CHAT")
      || typeof destinationSupervisorId !== "string" || typeof taskId !== "string"
      || typeof queuedAt !== "string" || typeof expiresAt !== "string") continue;
    return { destination, destinationSupervisorId, taskId, queuedAt, expiresAt };
  }
  return null;
}
