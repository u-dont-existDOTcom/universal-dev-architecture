import { canonicalJson, sha256 } from "./canonical";
import { requestBoundRoutePrefix } from "./request-bound-supervision";
import type { AppendEnvelope, StoredEvent } from "./schema";

export const POST_EXECUTION_REASONING_ROUTER_PRODUCER_ID = "system:post-execution-reasoning-router";
export const POST_EXECUTION_REASONING_ROUTE_SOURCE = "MISSION_CONTROL_POST_EXECUTION_REASONING_ROUTER" as const;

interface ReceiptPolicy {
  repository: string;
  decisionIssueNumber: number;
  stageIssueNumber: number;
}

export function buildPostWorkReasoningRouteEnvelope(input: {
  events: StoredEvent[];
  executionReceipt: AppendEnvelope & {
    data: Extract<AppendEnvelope["data"], { type: "chatgpt_work_cloud_execution_receipt_recorded" }>;
  };
  policy: ReceiptPolicy;
  recordedAt: string;
}): AppendEnvelope {
  const receipt = input.executionReceipt.data;
  const requestEvent = [...input.events].reverse().find((event) =>
    event.worker === receipt.worker
    && event.data.type === "chatgpt_work_cloud_dispatch_requested"
    && event.data.dispatch_id === receipt.dispatch_id);
  const request = requestEvent?.data;
  if (!request || request.type !== "chatgpt_work_cloud_dispatch_requested") {
    throw new Error("Post-Work reasoning route requires the exact native Work dispatch request.");
  }

  const directiveEvent = [...input.events].reverse().find((event) =>
    event.worker === receipt.worker
    && event.data.type === "execution_directive_recorded"
    && event.data.directive_id === receipt.directive_id
    && event.data.directive_revision === receipt.directive_revision);
  const directive = directiveEvent?.data;
  if (!directive || directive.type !== "execution_directive_recorded"
    || directive.status !== "ACTIVE"
    || directive.execution_surface !== "CHATGPT_WORK_CLOUD"
    || directive.task_id !== receipt.task_id
    || directive.validated_decision_proof?.authority_path !== "VALIDATED_GITHUB_SUPERVISORY_DECISION") {
    throw new Error("Post-Work reasoning route requires the current active source-bound native Work directive.");
  }

  const originDecisionEvent = input.events.find((event) =>
    event.eventId === directive.validated_decision_proof!.receipt_event_id);
  const originDecision = originDecisionEvent?.data;
  if (!originDecision || originDecision.type !== "github_decision_receipt_ingested"
    || !originDecision.supervisor_id
    || originDecision.worker !== receipt.worker
    || originDecision.task_id !== receipt.task_id) {
    throw new Error("Post-Work reasoning route cannot recover the original stable reasoning supervisor.");
  }

  const originRoute = findOriginRoute(input.events, receipt.worker, originDecision.request_id);
  if (!originRoute
    || originRoute.destinationSupervisorId !== originDecision.supervisor_id
    || originRoute.taskId !== receipt.task_id) {
    throw new Error("Post-Work reasoning route cannot recover the exact original supervisor destination.");
  }

  const currentOutcomeEvent = [...input.events].reverse().find((event) =>
    event.worker === receipt.worker && event.data.type === "owner_outcome_recorded");
  const currentOutcome = currentOutcomeEvent?.data;
  if (!currentOutcome || currentOutcome.type !== "owner_outcome_recorded") {
    throw new Error("Post-Work reasoning route requires the current owner outcome.");
  }

  const recordedMs = Date.parse(input.recordedAt);
  const originalWindowMs = Date.parse(originRoute.expiresAt) - Date.parse(originRoute.queuedAt);
  if (!Number.isFinite(recordedMs) || !Number.isFinite(originalWindowMs) || originalWindowMs <= 0) {
    throw new Error("Post-Work reasoning route cannot derive a valid request window.");
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
    artifact_count: receipt.artifact_count,
    github_comment_sha256: receipt.github_comment_sha256,
  };
  const evidenceSha256 = sha256(canonicalJson(evidencePayload));
  const requestId = `post-work-review:${sha256(`${receipt.dispatch_id}:${input.executionReceipt.event_id}`).slice(0, 32)}`;
  const routeBody = requestBoundRoutePrefix + canonicalJson({
    schemaVersion: 5,
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
        artifact_count: receipt.artifact_count,
        semantic_authority: false,
      }),
      evidenceRefs: [
        `work_dispatch:${receipt.dispatch_id}`,
        `work_execution_receipt_event:${input.executionReceipt.event_id}`,
        `work_execution_receipt_sha256:${evidenceSha256}`,
      ],
      decisionRequested: "Review the native Work execution receipt against the current owner outcome and issue the next exact source-bound decision or execution directive if additional work remains.",
      supervisoryCycle: {
        executionContext: { task_id: receipt.task_id },
        nonce: `post-work-nonce:${sha256(`${input.executionReceipt.event_id}:${currentOutcome.owner_outcome_sha256}`).slice(0, 32)}`,
        evidenceCapsule: {
          id: `work-execution:${sha256(input.executionReceipt.event_id).slice(0, 32)}`,
          sha256: evidenceSha256,
        },
        ownerOutcome: {
          id: currentOutcome.owner_outcome_id,
          epoch: currentOutcome.epoch,
          sha256: currentOutcome.owner_outcome_sha256,
        },
        reasoningLane: originDecision.reasoning_lane,
        githubReceipt: {
          repository: input.policy.repository,
          issueNumber: input.policy.decisionIssueNumber,
          stageIssueNumber: input.policy.stageIssueNumber,
        },
        expiresAt,
      },
    },
    queuedAt: input.recordedAt,
    nonce: `post-work-nonce:${sha256(`${input.executionReceipt.event_id}:${currentOutcome.owner_outcome_sha256}`).slice(0, 32)}`,
    reasoningLane: originDecision.reasoning_lane,
    evidenceCapsule: {
      id: `work-execution:${sha256(input.executionReceipt.event_id).slice(0, 32)}`,
      sha256: evidenceSha256,
    },
    ownerOutcome: {
      id: currentOutcome.owner_outcome_id,
      epoch: currentOutcome.epoch,
      sha256: currentOutcome.owner_outcome_sha256,
    },
    githubReceipt: {
      repository: input.policy.repository,
      issueNumber: input.policy.decisionIssueNumber,
      stageIssueNumber: input.policy.stageIssueNumber,
    },
    expiresAt,
    writerContract: {
      mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY",
      reinterpretationAllowed: false,
    },
  });
  if (routeBody.length > 20_000) throw new Error("Post-Work reasoning route exceeds the durable route-body limit.");

  return {
    schema_version: 2,
    event_id: `post-work-reasoning-route:${sha256(requestId).slice(0, 32)}`,
    mission_id: "mission-control-live",
    occurred_at: input.recordedAt,
    data: {
      type: "reasoning_review_route_recorded",
      worker: receipt.worker,
      request_id: requestId,
      message_id: `message:${sha256(requestId).slice(0, 32)}`,
      thread_id: `thread:post-work-review:${receipt.worker}`,
      source_execution_receipt_event_id: input.executionReceipt.event_id,
      source_dispatch_id: receipt.dispatch_id,
      destination_supervisor_id: originDecision.supervisor_id,
      body: routeBody,
      body_sha256: sha256(routeBody),
      recorded_at: input.recordedAt,
      producer_id: POST_EXECUTION_REASONING_ROUTER_PRODUCER_ID,
      source: POST_EXECUTION_REASONING_ROUTE_SOURCE,
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
    const body = event.data.body;
    const newline = body.indexOf("\n");
    if (newline < 0) continue;
    let root: unknown;
    try { root = JSON.parse(body.slice(newline + 1)); } catch { continue; }
    if (!root || typeof root !== "object" || Array.isArray(root)) continue;
    const record = root as Record<string, unknown>;
    if (record.requestId !== requestId) continue;
    const factual = record.factualPacket;
    if (!factual || typeof factual !== "object" || Array.isArray(factual)) continue;
    const factualRecord = factual as Record<string, unknown>;
    const destination = record.destination;
    const destinationSupervisorId = record.destinationSupervisorId;
    const queuedAt = record.queuedAt;
    const expiresAt = record.expiresAt;
    if ((destination !== "PROJECT_MANAGER_CHAT" && destination !== "SPECIALIST_SUPERVISOR_CHAT")
      || typeof destinationSupervisorId !== "string"
      || typeof factualRecord.taskId !== "string"
      || typeof queuedAt !== "string"
      || typeof expiresAt !== "string") continue;
    return { destination, destinationSupervisorId, taskId: factualRecord.taskId, queuedAt, expiresAt };
  }
  return null;
}
