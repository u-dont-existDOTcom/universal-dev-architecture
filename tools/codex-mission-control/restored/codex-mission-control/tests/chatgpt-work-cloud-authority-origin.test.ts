import assert from "node:assert/strict";
import test from "node:test";

import { sha256 } from "../lib/canonical";
import { discoverDirectWorkCloudDispatches } from "../lib/chatgpt-work-cloud-autodispatch";
import { executionDirectiveArtifactCanonicalJson } from "../lib/github-execution-directive";
import type { StoredEvent } from "../lib/schema";

const profile = {
  model: "GPT_5_6_SOL" as const,
  effort: "MEDIUM" as const,
  routingTier: "SOL_MEDIUM" as const,
  routingTriggers: [],
  fastModeRequest: "DO_NOT_ENABLE_FAST" as const,
  assuranceRequirement: "SET_REQUEST_SUFFICIENT" as const,
  policyRef: "patterns/work-model-and-effort-routing.md",
  routingPolicyBaseCommit: "fc3d0d7592a4fa69e94ff8ae31d9a4e5433b73cb",
  contractVersion: "TRUSTED_SETTER_V1" as const,
};

function fixture(deadline: string): StoredEvent[] {
  const bounded = {
    schema_version: 1 as const,
    task_id: "task:askrigor-system-alignment",
    job_id: "askrigor-a19-a20",
    execution_objective: "Execute the existing bounded continuation.",
    reasoning_summary: "Reasoning is already complete.",
    strategy_id: "askrigor-a19-a20",
    strategy_causal_hypothesis: "Bounded execution advances the authorized task.",
    predicted_outcome_change: "A19 and A20 reach their existing acceptance boundary.",
    success_threshold: "Existing checks pass.",
    failure_threshold: "A stop trigger is reached.",
    next_decision_changing_evidence: "Execution receipt.",
    reviewed_evidence_boundary: "Current source-bound decision.",
    inputs: [],
    allowed_actions: ["bounded local execution"],
    allowed_paths: ["/workspace"],
    allowed_commands: ["focused checks"],
    forbidden_actions: ["production deployment"],
    forbidden_paths: [],
    forbidden_decisions: ["methodology"],
    required_evidence: ["execution receipt"],
    required_tests_or_checks: ["focused checks"],
    stop_and_return_triggers: ["completion or blocker"],
    maximum_execution_cycles: 1,
    execution_capability: { type: "LOCAL_FILESYSTEM_COMMAND" as const },
    workspace: "/workspace",
    output_schema: { status: "string" },
    prompt: "EXACT ASKRIGOR A19 A20 DIRECTIVE",
    deadline,
    work_execution_profile: profile,
    execution_surface: "CHATGPT_WORK_CLOUD" as const,
  };
  const sourceDirective = {
    id: "github-execution:askrigor",
    revision: 1,
    taskId: bounded.task_id,
    sourceMessageId: "github-decision-source:askrigor",
    sourceBodySha256: "2".repeat(64),
  };
  const artifact = executionDirectiveArtifactCanonicalJson({
    bounded,
    sourceDirective,
    requestedModel: "gpt-5.6-sol",
    reasoningEffort: "medium",
  });
  const common = {
    missionId: "mission-control-live",
    worker: "askrigor-system-alignment",
    occurredAt: "2026-09-25T12:00:00.000Z",
    receivedAt: "2026-09-25T12:00:00.000Z",
    producerId: "fixture",
    producerKind: "SYSTEM",
    previousHash: null,
    eventHash: "a".repeat(64),
    schemaVersion: 2 as const,
  };
  return [
    {
      ...common,
      id: 1,
      sequence: 1,
      eventId: "receipt:askrigor",
      type: "github_decision_receipt_ingested",
      data: {
        type: "github_decision_receipt_ingested",
        worker: "askrigor-system-alignment",
        request_id: "source-review:askrigor",
        task_id: bounded.task_id,
        supervisor_id: "mc-project-manager",
        reasoning_lane: "EXTRA_HIGH_DIRECT",
        bounded_execution: bounded,
      },
    },
    {
      ...common,
      id: 2,
      sequence: 2,
      eventId: "directive:askrigor",
      type: "execution_directive_recorded",
      data: {
        type: "execution_directive_recorded",
        worker: "askrigor-system-alignment",
        directive_id: sourceDirective.id,
        directive_revision: 1,
        task_id: bounded.task_id,
        directive_schema_version: 3,
        source_message_id: sourceDirective.sourceMessageId,
        source_body_sha256: sourceDirective.sourceBodySha256,
        directive_artifact_sha256: sha256(artifact),
        execution_surface: "CHATGPT_WORK_CLOUD",
        work_execution_profile: profile,
        status: "ACTIVE",
        validated_decision_proof: {
          authority_path: "VALIDATED_GITHUB_SUPERVISORY_DECISION",
          receipt_event_id: "receipt:askrigor",
        },
      },
    },
  ] as unknown as StoredEvent[];
}

const sourceChats = [{
  supervisorId: "mc-project-manager",
  sourceChatTitle: "MC · project manager · supervision",
  sourceChatUrl: "chatgpt-conversation://mc-supervisor",
  sourceChatBrowserUrl: "https://chatgpt.com/c/mc-supervisor",
  chatgptProjectId: null,
}];

test("expired source-bound native Work directives are not redispatched", () => {
  const candidates = discoverDirectWorkCloudDispatches({
    events: fixture("2026-09-24T21:18:29.700Z"),
    sourceChats,
    receiptTarget: { repository: "u-dont-existDOTcom/universal-dev-architecture", stageIssueNumber: 61 },
    requestedAt: "2026-09-25T12:00:00.000Z",
    artifactPathFor: () => "/private/directive.json",
  });
  assert.deepEqual(candidates, []);
});

test("task-specific Work origin preserves the owner source Chat while reasoning stays with the supervisor", () => {
  const candidates = discoverDirectWorkCloudDispatches({
    events: fixture("2099-09-25T12:00:00.000Z"),
    sourceChats,
    originChats: [{
      taskId: "task:askrigor-system-alignment",
      sourceChatTitle: "Treating Lymph Pooling",
      sourceChatUrl: "chatgpt-conversation://source-chat",
      sourceChatBrowserUrl: "https://chatgpt.com/c/source-chat",
      chatgptProjectId: null,
    }],
    receiptTarget: { repository: "u-dont-existDOTcom/universal-dev-architecture", stageIssueNumber: 61 },
    requestedAt: "2026-09-25T12:00:00.000Z",
    artifactPathFor: () => "/private/directive.json",
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]!.sourceSupervisorId, "mc-project-manager");
  assert.equal(candidates[0]!.controllerRequest.requestedWorkTitle, "Work — Treating Lymph Pooling");
  assert.equal(candidates[0]!.controllerRequest.sourceChatUrl, "chatgpt-conversation://source-chat");
  assert.equal(candidates[0]!.deadline, "2099-09-25T12:00:00.000Z");
  assert.equal(candidates[0]!.controllerRequest.deadline, "2099-09-25T12:00:00.000Z");
});
