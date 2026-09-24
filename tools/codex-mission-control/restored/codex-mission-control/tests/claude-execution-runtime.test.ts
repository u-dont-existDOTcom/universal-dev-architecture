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
