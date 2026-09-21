import path from "node:path";
import { canonicalJson, sha256 } from "./canonical";
import type { AppendEnvelope, BoundedExecutionResidue, MissionControlEventV2, StoredEvent } from "./schema";
import { launchSelectionFor } from "./work-execution-profile";

export const CODEX_EXECUTION_PAYLOAD_PREFIX = "MISSION_CONTROL_CODEX_EXECUTION_PAYLOAD_V1\n";

type GitHubDecisionReceipt = Extract<MissionControlEventV2, { type: "github_decision_receipt_ingested" }>;
type ExecutionDirective = Extract<MissionControlEventV2, { type: "execution_directive_recorded" }>;

export interface AcceptedGitHubDecisionReceipt {
  eventId: string;
  occurredAt: string;
  data: GitHubDecisionReceipt;
}

export function buildExecutionDirectiveFromGitHubDecision(
  receiptEvent: AcceptedGitHubDecisionReceipt,
  priorEvents: StoredEvent[],
  occurredAt = receiptEvent.data.ingested_at,
): AppendEnvelope | null {
  const receipt = receiptEvent.data;
  const bounded = receipt.bounded_execution;
  if (!bounded) return null;
  if (!receipt.bounded_execution_sha256
    || sha256(canonicalJson(bounded)) !== receipt.bounded_execution_sha256) {
    throw new Error("Accepted GitHub decision bounded-execution digest is invalid.");
  }
  if (!receipt.decision_provider_session_id || !receipt.supervisor_id) {
    throw new Error("Bounded execution requires the current validated split-session canonical decision path.");
  }
  if (bounded.task_id !== receipt.task_id) {
    throw new Error("Bounded execution task identity does not match the admitted supervisory request.");
  }

  const directiveId = `github-execution:${sha256(`${receipt.task_id}:${receipt.decision_block.decision_id}`).slice(0, 32)}`;
  const priorRevisions = priorEvents.flatMap((event) => event.data.type === "execution_directive_recorded"
    && event.data.worker === receipt.worker
    && event.data.task_id === receipt.task_id
    ? [event.data.directive_revision] : []);
  const directiveRevision = Math.max(0, ...priorRevisions) + 1;
  const sourceMessageId = `github-decision-source:${sha256(receiptEvent.eventId).slice(0, 32)}`;
  const exactExecutionPayload = executionPayloadFor(bounded);
  const sourceBodySha256 = sha256(exactExecutionPayload);
  const selection = launchSelectionFor(bounded.work_execution_profile);
  const sourceDirective = {
    id: directiveId,
    revision: directiveRevision,
    taskId: receipt.task_id,
    sourceMessageId,
    sourceBodySha256,
  };
  const directiveArtifactSha256 = codexDirectiveArtifactSha256({
    schemaVersion: 2,
    jobId: bounded.job_id,
    sourceDirective,
    prompt: bounded.prompt,
    workspace: bounded.workspace,
    executionCapability: bounded.execution_capability,
    outputSchema: bounded.output_schema,
    workExecutionProfile: bounded.work_execution_profile,
    requestedModel: selection.model,
    reasoningEffort: selection.thinking,
  });

  return {
    schema_version: 2,
    event_id: `github-execution-directive:${sha256(`${receiptEvent.eventId}:${receipt.bounded_execution_sha256}`).slice(0, 32)}`,
    mission_id: "mission-control-live",
    occurred_at: occurredAt,
    data: {
      type: "execution_directive_recorded",
      worker: receipt.worker,
      directive_id: directiveId,
      directive_revision: directiveRevision,
      task_id: receipt.task_id,
      owner_outcome_id: receipt.owner_outcome_id,
      owner_outcome_epoch: receipt.owner_outcome_epoch,
      owner_outcome_sha256: receipt.owner_outcome_sha256,
      reasoning_supervisor_session_id: receipt.decision_provider_session_id,
      reasoning_chat_epoch: receipt.decision_provider_session_id,
      chat_decision_id: receipt.decision_block.decision_id,
      capsule_id: receipt.evidence_capsule.id,
      strategy_id: bounded.strategy_id,
      strategy_causal_hypothesis: bounded.strategy_causal_hypothesis,
      predicted_outcome_change: bounded.predicted_outcome_change,
      success_threshold: bounded.success_threshold,
      failure_threshold: bounded.failure_threshold,
      next_decision_changing_evidence: bounded.next_decision_changing_evidence,
      reviewed_evidence_boundary: bounded.reviewed_evidence_boundary,
      execution_objective: bounded.execution_objective,
      reasoning_summary: bounded.reasoning_summary,
      inputs: bounded.inputs,
      allowed_actions: bounded.allowed_actions,
      allowed_paths: bounded.allowed_paths,
      allowed_commands: bounded.allowed_commands,
      forbidden_actions: bounded.forbidden_actions,
      forbidden_paths: bounded.forbidden_paths,
      forbidden_decisions: bounded.forbidden_decisions,
      required_evidence: bounded.required_evidence,
      required_tests_or_checks: bounded.required_tests_or_checks,
      stop_and_return_triggers: bounded.stop_and_return_triggers,
      maximum_execution_cycles: bounded.maximum_execution_cycles,
      maximum_execution_horizon_type: "MEANINGFUL_EXECUTION_CYCLE",
      ambiguity_behavior: "STOP_AND_REPORT_DECISION_REQUIRED",
      owner_decision_authority: "NONE",
      pro_escalation_authority: "NONE",
      strategy_authority: "NONE",
      supervisory_verdict_authority: "NONE",
      substantive_prose_authorship_authority: "NONE",
      directive_schema_version: 3,
      directive_artifact_sha256: directiveArtifactSha256,
      source_message_id: sourceMessageId,
      source_body_sha256: sourceBodySha256,
      validated_decision_proof: {
        authority_path: "VALIDATED_GITHUB_SUPERVISORY_DECISION",
        receipt_event_id: receiptEvent.eventId,
        receipt_id: receipt.receipt_id,
        request_id: receipt.request_id,
        canonical_envelope_sha256: receipt.canonical_envelope_sha256,
        bounded_execution_sha256: receipt.bounded_execution_sha256,
        exact_execution_payload: exactExecutionPayload,
      },
      work_execution_profile: bounded.work_execution_profile,
      ...(bounded.execution_surface ? { execution_surface: bounded.execution_surface } : {}),
      status: "ACTIVE",
    },
  };
}

export function validatedGitHubDecisionDirectiveProof(
  events: StoredEvent[],
  directiveEvent: StoredEvent,
): ExecutionDirective["validated_decision_proof"] | null {
  if (directiveEvent.data.type !== "execution_directive_recorded") return null;
  const proof = directiveEvent.data.validated_decision_proof;
  if (!proof) return null;
  const receiptEvent = events.find((event) => event.eventId === proof.receipt_event_id);
  if (!receiptEvent || receiptEvent.sequence >= directiveEvent.sequence
    || receiptEvent.producerId !== "system:github-decision-receipts"
    || receiptEvent.producerKind !== "SYSTEM"
    || receiptEvent.data.type !== "github_decision_receipt_ingested") return null;
  const directiveIndex = events.findIndex((event) => event.sequence === directiveEvent.sequence);
  if (directiveIndex < 0) return null;
  const expected = buildExecutionDirectiveFromGitHubDecision({
    eventId: receiptEvent.eventId,
    occurredAt: receiptEvent.occurredAt,
    data: receiptEvent.data,
  }, events.slice(0, directiveIndex), directiveEvent.occurredAt);
  if (!expected || canonicalJson(expected.data) !== canonicalJson(directiveEvent.data)) return null;
  return proof;
}

export function executionPayloadFor(bounded: BoundedExecutionResidue): string {
  const payload = {
    schemaVersion: 1,
    jobId: bounded.job_id,
    deadline: bounded.deadline,
    workspace: bounded.workspace,
    executionCapability: bounded.execution_capability,
    outputSchema: bounded.output_schema,
    prompt: bounded.prompt,
    ...(bounded.retry_of_attempt_id ? { retryOfAttemptId: bounded.retry_of_attempt_id } : {}),
  };
  return `${CODEX_EXECUTION_PAYLOAD_PREFIX}${canonicalJson(payload)}`;
}

function codexDirectiveArtifactSha256(directive: Record<string, unknown>): string {
  const source = directive as {
    jobId?: unknown; sourceDirective?: unknown; prompt?: unknown; workspace?: unknown;
    executionCapability?: unknown; outputSchema?: unknown; workExecutionProfile?: unknown;
    requestedModel?: unknown; reasoningEffort?: unknown;
  };
  return sha256(canonicalJson({
    schemaVersion: 2,
    jobId: source.jobId ?? null,
    sourceDirective: source.sourceDirective ?? null,
    prompt: source.prompt ?? null,
    workspace: typeof source.workspace === "string" ? path.resolve(source.workspace) : null,
    executionCapability: source.executionCapability ?? null,
    outputSchema: source.outputSchema ?? null,
    workExecutionProfile: source.workExecutionProfile ?? null,
    requestedModel: source.requestedModel ?? null,
    reasoningEffort: source.reasoningEffort ?? null,
    executionContract: {
      sandbox: "workspace-write",
      approvalPolicy: "never",
      workspaceNetworkAccess: false,
      apiKeyFallback: false,
    },
  }));
}
