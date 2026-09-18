import { z } from "zod";
import { trustedTaskCreationEvidence, receiptHasTrustedSetterEvidence } from "./work-task-creation-evidence";

import { canonicalJson, sha256 } from "./canonical";
import type { ChatWorkAuthorityRequest, PersistedExecutionDirectiveProof } from "./chat-work-authority-gate";
import { validatedGitHubDecisionDirectiveProof } from "./github-execution-directive";
import { workProfileAuthorizationId } from "./supervision-admission-runtime";
import type { AppendEnvelope, StoredEvent } from "./schema";
import {
  CURRENT_WORK_EXECUTION_CAPABILITY,
  evaluateWorkExecutionPreflight,
  launchSelectionFor,
  workExecutionProfileSchema,
  type WorkExecutionPreflight,
  type WorkExecutionProfile,
} from "./work-execution-profile";

const stableId = z.string().min(1).max(180).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const preflightRequestSchema = z.object({
  authorizationId: stableId,
  requestedProfile: workExecutionProfileSchema,
  setterEvidenceId: stableId.nullable(),
}).strict();

export function buildWorkExecutionAuthorizationEnvelope(input: {
  worker: string;
  request: ChatWorkAuthorityRequest;
  authorizedProfile: WorkExecutionProfile;
  now: string;
}): AppendEnvelope {
  const binding = input.request.executionDirectiveBinding;
  const source = input.request.sourceReceipt;
  if (!binding || !source) throw new Error("A Work profile authorization requires an exact directive and source binding.");
  return {
    schema_version: 2,
    event_id: workProfileAuthorizationId(input.request.requestId),
    mission_id: "mission-control-live",
    occurred_at: input.now,
    data: {
      type: "work_execution_profile_authorized",
      worker: input.worker,
      authorization_id: workProfileAuthorizationId(input.request.requestId),
      request_id: input.request.requestId,
      directive_id: binding.directiveId,
      directive_revision: binding.directiveRevision,
      task_id: binding.taskId,
      directive_artifact_sha256: binding.directiveArtifactSha256,
      source_message_id: source.messageId,
      source_body_sha256: source.bodySha256,
      authorized_profile: input.authorizedProfile,
      authorized_at: input.now,
    },
  };
}

export function buildTrustedTaskCreationSelectionEnvelope(input: {
  worker: string;
  authorizationId: string;
  directiveId: string;
  directiveRevision: number;
  taskId: string;
  authorizedProfile: WorkExecutionProfile;
  now: string;
}): AppendEnvelope {
  const selection = launchSelectionFor(input.authorizedProfile);
  const evidenceId = `work-task-creation:${sha256(canonicalJson({
    worker: input.worker,
    authorizationId: input.authorizationId,
    directiveId: input.directiveId,
    directiveRevision: input.directiveRevision,
    taskId: input.taskId,
    authorizedProfile: input.authorizedProfile,
  })).slice(0, 32)}`;
  return {
    schema_version: 2,
    event_id: evidenceId,
    mission_id: "mission-control-live",
    occurred_at: input.now,
    data: {
      type: "work_task_creation_selection_applied",
      worker: input.worker,
      evidence_id: evidenceId,
      authorization_id: input.authorizationId,
      directive_id: input.directiveId,
      directive_revision: input.directiveRevision,
      task_id: input.taskId,
      authorized_profile: input.authorizedProfile,
      model_setter: selection.model,
      effort_setter: selection.thinking,
      fast_request: selection.fastModeRequest,
      fast_setter: null,
      producer_id: "system:trusted-task-creation",
      source: "TRUSTED_TASK_CREATION_BOUNDARY",
      provider_task_locator: null,
      applied_at: input.now,
    },
  };
}

export function evaluatePersistedWorkExecutionPreflight(input: {
  worker: string;
  body: unknown;
  events: StoredEvent[];
  now: string;
}): { envelope: AppendEnvelope; preflight: WorkExecutionPreflight } {
  const request = preflightRequestSchema.parse(input.body);
  const authorizationEvent = [...input.events].reverse().find((event) => event.data.type === "work_execution_profile_authorized"
    && event.data.worker === input.worker
    && event.data.authorization_id === request.authorizationId);
  const authorization = authorizationEvent?.data;
  if (!authorization || authorization.type !== "work_execution_profile_authorized") {
    throw new Error("The exact persisted Work execution profile authorization is unavailable.");
  }
  const preflight = evaluateWorkExecutionPreflight({
    requestedProfile: request.requestedProfile,
    authorizedProfile: authorization.authorized_profile,
    observedProfile: { model: null, effort: null, fastMode: null },
    appliedSelection: null,
    trustedSetterEvidence: trustedTaskCreationEvidence(input.events, {
      worker: input.worker, authorizationId: authorization.authorization_id,
      directiveId: authorization.directive_id, directiveRevision: authorization.directive_revision,
      taskId: authorization.task_id, profile: authorization.authorized_profile, evidenceId: request.setterEvidenceId,
    }),
    capability: CURRENT_WORK_EXECUTION_CAPABILITY,
  });
  if (!preflight.setterEvidenceId) {
    preflight.reasonCodes = [request.setterEvidenceId
      ? "TRUSTED_TASK_CREATION_SETTER_EVIDENCE_INVALID"
      : "WORK_TASK_CREATION_BRIDGE_UNAVAILABLE"];
  }
  const preflightId = `work-profile-preflight:${sha256(canonicalJson({
    authorizationId: authorization.authorization_id,
    requestedProfile: request.requestedProfile,
    setterEvidenceId: request.setterEvidenceId,
    now: input.now,
  })).slice(0, 32)}`;
  return {
    preflight,
    envelope: {
      schema_version: 2,
      event_id: preflightId,
      mission_id: authorizationEvent.missionId,
      occurred_at: input.now,
      data: {
        type: "work_execution_preflight_recorded",
        worker: input.worker,
        preflight_id: preflightId,
        setter_evidence_id: request.setterEvidenceId,
        authorization_id: authorization.authorization_id,
        request_id: authorization.request_id,
        directive_id: authorization.directive_id,
        directive_revision: authorization.directive_revision,
        task_id: authorization.task_id,
        requested_profile: preflight.requestedProfile,
        authorized_profile: preflight.authorizedProfile,
        observed_profile: preflight.observedProfile,
        applied_selection: preflight.appliedSelection,
        capability: preflight.capability,
        field_results: preflight.fieldResults,
        model_identity_evidence: preflight.modelIdentityEvidence,
        preflight: preflight.result,
        decision: preflight.decision,
        reason_codes: preflight.reasonCodes,
        launch_selection: preflight.launchSelection,
        substantive_execution_allowed: preflight.allowed,
        recorded_at: input.now,
      },
    },
  };
}

export function buildWorkRoutingCheckpointEnvelopes(events: StoredEvent[]): AppendEnvelope[] {
  const eligible = events.filter((event) => event.data.type === "execution_receipt_recorded"
    && event.data.receipt_schema_version === 3
    && event.data.work_execution !== "LEGACY_MODEL_PROFILE_UNSPECIFIED"
    && event.data.work_execution.routing_telemetry.eligible
    && receiptHasTrustedSetterEvidence(event, events))
    .sort((left, right) => left.sequence - right.sequence);
  const existing = new Set(events.flatMap((event) => event.data.type === "work_model_routing_checkpoint_recorded"
    ? [event.data.checkpoint_count]
    : []));
  return ([5, 10] as const).flatMap((count) => {
    if (eligible.length < count || existing.has(count)) return [];
    const window = eligible.slice(0, count);
    const trigger = window.at(-1)!;
    return [{
      schema_version: 2 as const,
      event_id: `work-model-routing-checkpoint:${count}`,
      mission_id: trigger.missionId,
      occurred_at: trigger.occurredAt,
      data: {
        type: "work_model_routing_checkpoint_recorded" as const,
        worker: null,
        checkpoint_count: count,
        checkpoint_kind: count === 5 ? "LOCAL_SUMMARY" as const : "CHAT_POLICY_REVIEW" as const,
        eligible_execution_count: count,
        outcome_counts: countValues(window.map((event) => eligibleTelemetry(event)!.direct_consumer_seam_result)),
        failure_counts: countValues(window.map((event) => eligibleTelemetry(event)!.failure_classification)),
        tier_counts: countValues(window.map((event) => eligibleWorkExecution(event)!.final_profile?.routingTier
          ?? eligibleWorkExecution(event)!.authorized_profile.routingTier)),
        identity_evidence_counts: countValues(window.map((event) => eligibleTelemetry(event)!.model_identity_evidence)),
        policy_mutated: false as const,
        review_required: count === 10,
        recorded_at: trigger.occurredAt,
      },
    }];
  });
}

export function currentExecutionDirectiveProof(
  worker: string,
  events: StoredEvent[],
): PersistedExecutionDirectiveProof | null {
  const directiveEvent = [...events].reverse().find((event) => event.data.type === "execution_directive_recorded"
    && event.data.worker === worker
    && event.data.status === "ACTIVE");
  const directive = directiveEvent?.data;
  if (!directive || directive.type !== "execution_directive_recorded"
    || directive.directive_schema_version !== 3
    || directive.directive_artifact_sha256 === null
    || directive.source_message_id === null
    || directive.source_body_sha256 === null
    || directive.work_execution_profile === "LEGACY_MODEL_PROFILE_UNSPECIFIED") return null;
  const validatedDecision = directiveEvent
    ? validatedGitHubDecisionDirectiveProof(events, directiveEvent)
    : null;
  if (directive.validated_decision_proof && !validatedDecision) return null;
  return {
    directiveId: directive.directive_id,
    directiveRevision: directive.directive_revision,
    taskId: directive.task_id,
    directiveArtifactSha256: directive.directive_artifact_sha256,
    sourceMessageId: directive.source_message_id,
    sourceBodySha256: directive.source_body_sha256,
    status: "ACTIVE",
    workExecutionProfile: directive.work_execution_profile,
    authoritySource: validatedDecision ? {
      kind: "VALIDATED_GITHUB_DECISION",
      receiptEventId: validatedDecision.receipt_event_id,
      receiptId: validatedDecision.receipt_id,
      requestId: validatedDecision.request_id,
      canonicalEnvelopeSha256: validatedDecision.canonical_envelope_sha256,
      boundedExecutionSha256: validatedDecision.bounded_execution_sha256,
    } : { kind: "DIRECT_REASONING_MESSAGE" },
  };
}

export function completedWorkRoutingTelemetryCount(events: StoredEvent[]): number {
  return Math.min(10, events.filter((event) => eligibleTelemetry(event) !== null
    && receiptHasTrustedSetterEvidence(event, events)).length);
}

function eligibleWorkExecution(event: StoredEvent) {
  if (event.data.type !== "execution_receipt_recorded" || event.data.receipt_schema_version !== 3
    || event.data.work_execution === "LEGACY_MODEL_PROFILE_UNSPECIFIED") return null;
  return event.data.work_execution;
}

function eligibleTelemetry(event: StoredEvent) {
  const workExecution = eligibleWorkExecution(event);
  return workExecution?.routing_telemetry.eligible ? workExecution.routing_telemetry : null;
}

function countValues<const T extends string>(values: T[]): Array<{ key: T; count: number }> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => ({ key, count }));
}
