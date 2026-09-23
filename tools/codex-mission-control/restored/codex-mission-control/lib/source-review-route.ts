import { canonicalJson, sha256 } from "./canonical";
import type { GitHubReceiptPolicy } from "./github-decision-receipts";
import { inBandRequestRoutePrefix } from "./in-band-request-binding";
import { requestRouteEventId } from "./request-bound-supervision";
import type { AppendEnvelope, StoredEvent } from "./schema";

export const SOURCE_REVIEW_ROUTER_PRODUCER_ID = "system:source-review-router";

export interface SourceReviewRouteEvidence {
  repository: string;
  issueNumber: number;
  commentId: number;
  immutableUrl: string;
  sha256: string;
  candidateHead: string;
  additionalRefs?: string[];
}

export interface SourceReviewRouteInput {
  events: StoredEvent[];
  policy: GitHubReceiptPolicy;
  worker: string;
  taskId: string;
  priorRequestId: string;
  evidence: SourceReviewRouteEvidence;
  exactFactualState: string;
  decisionRequested: string;
  recordedAt: string;
  reviewAttemptId: string;
}

export function sourceReviewRequestId(input: Pick<SourceReviewRouteInput,
  "worker" | "taskId" | "priorRequestId" | "evidence" | "reviewAttemptId">): string {
  return "source-review:" + sha256(canonicalJson({
    worker: boundedId(input.worker, "worker"),
    task_id: boundedId(input.taskId, "taskId"),
    prior_request_id: boundedId(input.priorRequestId, "priorRequestId"),
    evidence_repository: repositoryName(input.evidence.repository),
    evidence_issue_number: positiveInteger(input.evidence.issueNumber, "evidence.issueNumber"),
    evidence_comment_id: positiveInteger(input.evidence.commentId, "evidence.commentId"),
    evidence_sha256: digest(input.evidence.sha256, "evidence.sha256"),
    candidate_head: commitSha(input.evidence.candidateHead),
    review_attempt_id: boundedId(input.reviewAttemptId, "reviewAttemptId"),
  })).slice(0, 32);
}

export function buildSourceReviewRouteEnvelope(input: SourceReviewRouteInput): AppendEnvelope {
  const worker = boundedId(input.worker, "worker");
  const taskId = boundedId(input.taskId, "taskId");
  const priorRequestId = boundedId(input.priorRequestId, "priorRequestId");
  const reviewAttemptId = boundedId(input.reviewAttemptId, "reviewAttemptId");
  const recordedMs = Date.parse(input.recordedAt);
  if (!Number.isFinite(recordedMs)) throw new Error("Source review recordedAt is invalid.");
  if (!input.policy.requestBound?.enabled) {
    throw new Error("Source review routing requires the trusted in-band request-bound relay policy.");
  }

  const priorDecision = [...input.events].reverse().find((event) =>
    event.worker === worker
    && event.data.type === "github_decision_receipt_ingested"
    && event.data.task_id === taskId
    && event.data.request_id === priorRequestId)?.data;
  if (!priorDecision || priorDecision.type !== "github_decision_receipt_ingested"
    || !priorDecision.supervisor_id
    || (priorDecision.reasoning_lane !== "EXTRA_HIGH_DIRECT" && priorDecision.reasoning_lane !== "PRO_ESCALATED")) {
    throw new Error("Source re-review requires the exact prior source-bound reviewer decision.");
  }

  const currentOutcome = [...input.events].reverse().find((event) =>
    event.worker === worker && event.data.type === "owner_outcome_recorded")?.data;
  if (!currentOutcome || currentOutcome.type !== "owner_outcome_recorded"
    || currentOutcome.gap_status !== "OPEN") {
    throw new Error("Source re-review requires the current open owner outcome.");
  }
  if (priorDecision.owner_outcome_id !== currentOutcome.owner_outcome_id
    || priorDecision.owner_outcome_epoch !== currentOutcome.epoch
    || priorDecision.owner_outcome_sha256 !== currentOutcome.owner_outcome_sha256) {
    throw new Error("Prior source review is stale against the current owner-outcome identity.");
  }

  const priorRoute = findPriorRoute(input.events, worker, taskId, priorRequestId);
  if (!priorRoute || priorRoute.destinationSupervisorId !== priorDecision.supervisor_id) {
    throw new Error("Source re-review cannot recover the exact prior supervisor route.");
  }
  const windowMs = Date.parse(priorRoute.expiresAt) - Date.parse(priorRoute.queuedAt);
  if (!Number.isFinite(windowMs) || windowMs < 60_000 || windowMs > 24 * 60 * 60 * 1000) {
    throw new Error("Source re-review cannot derive a safe fresh review window.");
  }

  const evidence = validatedEvidence(input.evidence);
  const exactFactualState = boundedText(input.exactFactualState, "exactFactualState", 12_000);
  const decisionRequested = boundedText(input.decisionRequested, "decisionRequested", 6_000);
  const requestId = sourceReviewRequestId({ worker, taskId, priorRequestId, evidence, reviewAttemptId });
  const nonce = "source-review-nonce:" + sha256(requestId + ":" + currentOutcome.owner_outcome_sha256).slice(0, 32);
  const evidenceCapsule = {
    id: "github-source-review-receipt:" + evidence.commentId,
    sha256: evidence.sha256,
  };
  const ownerOutcome = {
    id: currentOutcome.owner_outcome_id,
    epoch: currentOutcome.epoch,
    sha256: currentOutcome.owner_outcome_sha256,
  };
  const expiresAt = new Date(recordedMs + windowMs).toISOString();
  const refs = [...new Set([
    evidence.immutableUrl,
    "source_review_receipt_sha256:" + evidence.sha256,
    "commit:" + evidence.candidateHead,
    ...(evidence.additionalRefs ?? []),
  ])];

  const body = inBandRequestRoutePrefix + canonicalJson({
    schemaVersion: 6,
    executionContext: { task_id: taskId },
    packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE",
    requestId,
    actionBlockedOrRouted: "AUTHOR_REVIEW",
    worker,
    producerId: SOURCE_REVIEW_ROUTER_PRODUCER_ID,
    destination: priorRoute.destination,
    destinationSupervisorId: priorDecision.supervisor_id,
    standingOwnerAuthorization: true,
    ownerRelayRequired: false,
    actionTimeConfirmationRequired: false,
    providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY",
    primaryDecision: "SOURCE_REVIEW_REQUIRED",
    routeDecision: "MISSION_CONTROL_INTERNAL_ROUTE",
    factualPacket: {
      packetId: "source-review-packet:" + sha256(requestId).slice(0, 32),
      taskId,
      exactFactualState: canonicalJson({
        review_kind: "SOURCE_REVIEW",
        candidate_head: evidence.candidateHead,
        immutable_source_receipt: {
          repository: evidence.repository,
          issue_number: evidence.issueNumber,
          comment_id: evidence.commentId,
          immutable_url: evidence.immutableUrl,
          sha256: evidence.sha256,
        },
        prior_request_id: priorRequestId,
        review_attempt_id: reviewAttemptId,
        owner_authenticated_factual_state: exactFactualState,
        semantic_authority: "OWNER_AUTHENTICATED_CHAT_REQUEST",
      }),
      evidenceRefs: refs,
      decisionRequested,
      supervisoryCycle: {
        bindingProtocol: "IN_BAND_REQUEST_BINDING_V1",
        executionContext: { task_id: taskId },
        nonce,
        evidenceCapsule,
        ownerOutcome,
        reasoningLane: priorDecision.reasoning_lane,
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
    reasoningLane: priorDecision.reasoning_lane,
    evidenceCapsule,
    ownerOutcome,
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
  if (body.length > 20_000) throw new Error("Source-review V6 route exceeds the durable message limit.");

  const eventId = requestRouteEventId(requestId, 6);
  return {
    schema_version: 2,
    event_id: eventId,
    mission_id: "mission-control-live",
    occurred_at: input.recordedAt,
    data: {
      type: "worker_message_recorded",
      worker,
      message_id: "message:" + eventId,
      thread_id: "thread:source-review:" + worker,
      message_kind: "QUESTION",
      body,
      reply_to_message_id: null,
      direction_id: null,
    },
  };
}

function findPriorRoute(events: StoredEvent[], worker: string, taskId: string, requestId: string): {
  destination: "PROJECT_MANAGER_CHAT" | "SPECIALIST_SUPERVISOR_CHAT";
  destinationSupervisorId: string;
  queuedAt: string;
  expiresAt: string;
} | null {
  for (const event of events) {
    if (event.worker !== worker || event.data.type !== "worker_message_recorded"
      || !event.data.body.startsWith(inBandRequestRoutePrefix)) continue;
    let root: unknown;
    try { root = JSON.parse(event.data.body.slice(inBandRequestRoutePrefix.length)); } catch { continue; }
    if (!isRecord(root) || root.requestId !== requestId || root.worker !== worker) continue;
    const factual = isRecord(root.factualPacket) ? root.factualPacket : null;
    if (!factual || factual.taskId !== taskId) continue;
    if ((root.destination !== "PROJECT_MANAGER_CHAT" && root.destination !== "SPECIALIST_SUPERVISOR_CHAT")
      || typeof root.destinationSupervisorId !== "string"
      || typeof root.queuedAt !== "string"
      || typeof root.expiresAt !== "string") continue;
    return {
      destination: root.destination,
      destinationSupervisorId: root.destinationSupervisorId,
      queuedAt: root.queuedAt,
      expiresAt: root.expiresAt,
    };
  }
  return null;
}

function validatedEvidence(value: SourceReviewRouteEvidence): SourceReviewRouteEvidence {
  const repository = repositoryName(value.repository);
  const issueNumber = positiveInteger(value.issueNumber, "evidence.issueNumber");
  const commentId = positiveInteger(value.commentId, "evidence.commentId");
  const immutableUrl = "https://github.com/" + repository + "/issues/" + issueNumber + "#issuecomment-" + commentId;
  if (value.immutableUrl !== immutableUrl) {
    throw new Error("Source review evidence URL must be the exact immutable GitHub issue-comment URL.");
  }
  const additionalRefs = value.additionalRefs ?? [];
  if (!Array.isArray(additionalRefs) || additionalRefs.length > 20
    || additionalRefs.some((ref) => typeof ref !== "string" || !ref.trim() || ref.length > 1_000)) {
    throw new Error("Source review additional evidence refs are invalid.");
  }
  return {
    repository,
    issueNumber,
    commentId,
    immutableUrl,
    sha256: digest(value.sha256, "evidence.sha256"),
    candidateHead: commitSha(value.candidateHead),
    additionalRefs: [...additionalRefs],
  };
}

function repositoryName(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error("evidence.repository must be owner/repository.");
  }
  return value;
}

function boundedId(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,179}$/.test(value)) {
    throw new Error(field + " is invalid.");
  }
  return value;
}

function boundedText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(field + " is invalid.");
  return value;
}

function digest(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(field + " must be a SHA-256 digest.");
  return value;
}

function commitSha(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) throw new Error("evidence.candidateHead must be a 40-character Git commit SHA.");
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(field + " must be a positive integer.");
  return Number(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
