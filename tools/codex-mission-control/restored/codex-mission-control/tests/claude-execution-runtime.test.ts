import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, sha256 } from "../lib/canonical";
import type { ChatWorkAuthorityRequest } from "../lib/chat-work-authority-gate";
import {
  buildClaudeCliLaunchPreflightEnvelope,
  buildClaudeExecutionAuthorizationEnvelope,
  claudeProfileAuthorizationId,
  type ClaudeHostPreflightEvidence,
} from "../lib/claude-execution-runtime";
import { appendEnvelopeSchema } from "../lib/schema";

const profile = {
  model: "claude-opus-5-5", effort: "MEDIUM", billingRoute: "SUBSCRIPTION",
  assuranceRequirement: "SET_REQUEST_SUFFICIENT", expensiveEffortApproved: false,
  contractVersion: "CLAUDE_CODE_SUBSCRIPTION_V1",
} as const;
const providerBinding = { provider: "ANTHROPIC", surface: "CLAUDE_CODE_CLI", role: "EXECUTION" } as const;
const request: ChatWorkAuthorityRequest = {
  requestId: "admission:claude:test:1", action: "EXECUTE_BOUNDED_TASK", actor: "WORK",
  sourceReceipt: { messageId: "chat-message:claude:test:1", bodySha256: "a".repeat(64),
    claimedSurface: "CHATGPT_PROJECT_MANAGER", observedSurface: "CHATGPT_PROJECT_MANAGER",
    provenanceStatus: "VERIFIED", authorActor: "PROJECT_MANAGER_CHAT" },
  boundedExecution: true, taskRequiresExecutionOutsideChat: true, executionScope: "TERMINAL_OR_COMPUTER_WORK",
  spend: { kind: "MODEL_API_INFERENCE", ceilingUsd: 0, ownerApprovedNonzeroSpendManifestId: null },
  internalRoute: null, ownerPolicy: { paidModelInferenceAllowed: false, activeZeroSpendDecisionId: "owner:zero" },
  directiveSchemaVersion: 3,
  executionDirectiveBinding: { directiveId: "directive:claude:test:1", directiveRevision: 1,
    taskId: "task:claude:test", directiveArtifactSha256: "b".repeat(64) },
  workExecutionProfile: "LEGACY_MODEL_PROFILE_UNSPECIFIED",
  executionProviderBinding: providerBinding, claudeExecutionProfile: profile,
};

test("Claude profile authorization is a distinct schema-valid durable event", () => {
  const envelope = buildClaudeExecutionAuthorizationEnvelope({
    worker: "claude-test-worker", request, authorizedProfile: profile, providerBinding,
    now: "2026-09-24T01:45:00.000Z",
  });
  const parsed = appendEnvelopeSchema.parse(envelope);
  assert.equal(parsed.data.type, "claude_execution_profile_authorized");
  assert.equal(envelope.event_id, claudeProfileAuthorizationId(request.requestId));
});

test("trusted Claude host preflight evidence is content-bound to authorization/profile/plan", () => {
  const authorizationId = claudeProfileAuthorizationId(request.requestId);
  const planSha256 = "c".repeat(64);
  const cliVersion = "2.1.281 (Claude Code)";
  const evidenceId = `claude-host-preflight:${sha256(canonicalJson({
    authorizationId,
    directiveId: request.executionDirectiveBinding!.directiveId,
    directiveRevision: request.executionDirectiveBinding!.directiveRevision,
    taskId: request.executionDirectiveBinding!.taskId,
    providerBinding, profile, planSha256, cliVersion, authMethod: "claude.ai", apiProvider: "firstParty",
  })).slice(0, 32)}`;
  const evidence: ClaudeHostPreflightEvidence = {
    evidenceId, planSha256, requiredFlagsVerified: true, cliVersion,
    authMethod: "claude.ai", apiProvider: "firstParty", subscriptionRouteVerified: true,
    providerOverridesPresent: false, modelSetter: profile.model, effortSetter: "medium",
  };
  const envelope = buildClaudeCliLaunchPreflightEnvelope({
    worker: "claude-test-worker", authorizationId,
    directiveId: request.executionDirectiveBinding!.directiveId,
    directiveRevision: request.executionDirectiveBinding!.directiveRevision,
    taskId: request.executionDirectiveBinding!.taskId,
    providerBinding, authorizedProfile: profile, evidence, now: "2026-09-24T01:45:01.000Z",
  });
  const parsed = appendEnvelopeSchema.parse(envelope);
  assert.equal(parsed.data.type, "claude_cli_launch_preflight_recorded");
  assert.equal(parsed.data.plan_sha256, planSha256);
  assert.equal(parsed.data.subscription_route_verified, true);
});

test("a Claude execution receipt requires a later reasoning review before the next directive", async () => {
  const { seedStore } = await import("../lib/seed");
  const { EventStore } = await import("../lib/store");
  const store = new EventStore(":memory:");
  seedStore(store);
  const worker = "auth";
  const at = (s: number) => `2026-09-24T03:00:${String(s).padStart(2, "0")}.000Z`;
  const prior = store.workerEvents(worker);
  const priorReasoning = prior.findLast((e) => e.data.type === "reasoning_supervision_recorded")!.data as Record<string, unknown>;
  const priorDirective = prior.findLast((e) => e.data.type === "execution_directive_recorded")!.data as Record<string, unknown>;
  const sourceMessageId = "owner-message:claude-review-rule";
  store.append({ schema_version: 2, event_id: "source:claude-review-rule", mission_id: "mission-control-demo", occurred_at: at(0),
    data: { type: "reasoning_message_recorded", worker, stable_supervisor_id: "supervisor:auth", message_id: sourceMessageId,
      thread_id: "thread:owner", surface_role: "PROJECT_MANAGER", provider_surface: "UNKNOWN", model_mode: "OWNER_AUTHORED",
      account_workspace: "OWNER_WORKSPACE", author_role: "OWNER", sent_at_source: null, received_at_mission_control: at(0),
      body_sha256: "d".repeat(64), exact_visible_body: null, immutable_provider_locator: "https://example.com/owner-message",
      parent_message_id: null, owner_direction_id: null, decision_request_id: null, acquisition_method: "OWNER_ATTESTED",
      provenance_status: "OWNER_ATTESTED", limitations: [], recorded_by: "test:claude-review-rule" } });
  const review = (n: number, directiveId: string) => store.append({ schema_version: 2, event_id: `reasoning:claude-review-rule:${n}`,
    mission_id: "mission-control-demo", occurred_at: at(n),
    data: { ...priorReasoning, decision_id: `decision:claude-review-rule:${n}`, active_execution_directive_id: directiveId, last_reasoning_review_at: at(n) } });
  const directive = (n: number, directiveId: string, revision: number, decision: number) => ({ schema_version: 2, event_id: `directive:claude-review-rule:${revision}`,
    mission_id: "mission-control-demo", occurred_at: at(n),
    data: { ...priorDirective, directive_id: directiveId, directive_revision: revision, chat_decision_id: `decision:claude-review-rule:${decision}`,
      directive_schema_version: 3, directive_artifact_sha256: String(revision).repeat(64).slice(0, 64), source_message_id: sourceMessageId,
      source_body_sha256: "d".repeat(64), validated_decision_proof: null, work_execution_profile: "LEGACY_MODEL_PROFILE_UNSPECIFIED",
      claude_execution_profile: profile, execution_provider_binding: providerBinding, execution_surface: "CLAUDE_CODE_CLI", status: "ACTIVE" } });
  review(1, "directive:claude-review-rule:r1");
  store.append(directive(2, "directive:claude-review-rule:r1", 1, 1));
  store.append({ schema_version: 2, event_id: "claude-execution-receipt:review-rule", mission_id: "mission-control-live", occurred_at: at(3),
    data: { type: "claude_execution_receipt_recorded", worker, receipt_id: "claude-execution-receipt:review-rule",
      authorization_id: "claude-profile-authorization:review-rule", preflight_evidence_id: "claude-host-preflight:review-rule",
      directive_id: "directive:claude-review-rule:r1", directive_revision: 1, task_id: priorDirective.task_id as string,
      provider_binding: providerBinding, authorized_profile: profile, run_id: "run-review-rule", session_id: "550e8400-e29b-41d4-a716-446655440000",
      status: "EXECUTION_REPORTED_COMPLETE", reason_codes: [], observed_primary_models: [profile.model], effort_evidence: "SET_REQUEST_ONLY",
      process_tree_stopped: true, report_present: true, recorded_at: at(3) } });
  assert.throws(() => store.append(directive(5, "directive:claude-review-rule:r2", 2, 1)),
    /later independent reasoning review after the prior execution receipt/);
  review(4, "directive:claude-review-rule:r2");
  store.append(directive(5, "directive:claude-review-rule:r2", 2, 4));
});
