import path from "node:path";
import { canonicalJson, sha256 } from "./canonical";
import type { AppendEnvelope, BoundedExecutionResidue, MissionControlEventV2, StoredEvent } from "./schema";
import { LEGACY_MODEL_PROFILE_UNSPECIFIED, launchSelectionFor } from "./work-execution-profile";
import { launchSelectionForClaude } from "./claude-execution-profile";

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
  const reasoningSessionId = receipt.decision_provider_session_id ?? receipt.provider_session_id;
  if (!reasoningSessionId || !receipt.supervisor_id) {
    throw new Error("Bounded execution requires a validated canonical decision provider session.");
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
  const executionProvider = bounded.execution_provider ?? "OPENAI";
  const openAiSelection = executionProvider === "OPENAI"
    && bounded.work_execution_profile !== LEGACY_MODEL_PROFILE_UNSPECIFIED
    ? launchSelectionFor(bounded.work_execution_profile)
    : null;
  const claudeSelection = executionProvider === "ANTHROPIC"
    ? launchSelectionForClaude(bounded.claude_execution_profile!)
    : null;
  const requestedModel = openAiSelection?.model ?? claudeSelection!.model;
  const reasoningEffort = openAiSelection?.thinking ?? claudeSelection!.effort;
  const sourceDirective = {
    id: directiveId,
    revision: directiveRevision,
    taskId: receipt.task_id,
    sourceMessageId,
    sourceBodySha256,
  };
  const directiveArtifactSha256 = sha256(executionDirectiveArtifactCanonicalJson({
    bounded, sourceDirective, requestedModel, reasoningEffort,
  }));

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
      reasoning_supervisor_session_id: reasoningSessionId,
      reasoning_chat_epoch: reasoningSessionId,
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
      ...(bounded.execution_provider ? { execution_provider: bounded.execution_provider } : {}),
      work_execution_profile: bounded.work_execution_profile,
      ...(bounded.claude_execution_profile ? { claude_execution_profile: bounded.claude_execution_profile } : {}),
      ...(bounded.claude_runtime ? { claude_runtime: bounded.claude_runtime } : {}),
      execution_surface: bounded.execution_surface
        ?? (executionProvider === "ANTHROPIC" ? "CLAUDE_CODE_CLI" : "CODEX"),
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
    ...(bounded.execution_provider === "ANTHROPIC" ? {
      executionProvider: bounded.execution_provider,
      executionSurface: bounded.execution_surface,
      claudeExecutionProfile: bounded.claude_execution_profile,
      claudeRuntime: bounded.claude_runtime,
    } : {}),
    ...(bounded.retry_of_attempt_id ? { retryOfAttemptId: bounded.retry_of_attempt_id } : {}),
  };
  return `${CODEX_EXECUTION_PAYLOAD_PREFIX}${canonicalJson(payload)}`;
}

export function executionDirectiveArtifactCanonicalJson(input: {
  bounded: BoundedExecutionResidue;
  sourceDirective: { id: string; revision: number; taskId: string; sourceMessageId: string; sourceBodySha256: string };
  requestedModel: string;
  reasoningEffort: string;
}): string {
  if (input.bounded.execution_provider === "ANTHROPIC") {
    return canonicalJson({
      schemaVersion: 2,
      jobId: input.bounded.job_id,
      sourceDirective: input.sourceDirective,
      prompt: input.bounded.prompt,
      workspace: path.resolve(input.bounded.workspace),
      executionCapability: input.bounded.execution_capability,
      outputSchema: input.bounded.output_schema,
      executionProvider: "ANTHROPIC",
      executionSurface: input.bounded.execution_surface,
      claudeExecutionProfile: input.bounded.claude_execution_profile,
      claudeRuntime: input.bounded.claude_runtime,
      requestedModel: input.requestedModel,
      reasoningEffort: input.reasoningEffort,
      executionContract: {
        restricted: true,
        permissionPrompts: "none",
        automaticRetries: 0,
        apiKeyFallback: false,
      },
    });
  }
  return canonicalJson({
    schemaVersion: 2,
    jobId: input.bounded.job_id,
    sourceDirective: input.sourceDirective,
    prompt: input.bounded.prompt,
    workspace: path.resolve(input.bounded.workspace),
    executionCapability: input.bounded.execution_capability,
    outputSchema: input.bounded.output_schema,
    workExecutionProfile: input.bounded.work_execution_profile,
    ...(input.bounded.execution_surface ? { executionSurface: input.bounded.execution_surface } : {}),
    requestedModel: input.requestedModel,
    reasoningEffort: input.reasoningEffort,
    executionContract: {
      sandbox: "workspace-write",
      approvalPolicy: "never",
      workspaceNetworkAccess: false,
      apiKeyFallback: false,
    },
  });
}
