import { canonicalJson, sha256 } from "./canonical";
import type { ChatWorkAuthorityRequest } from "./chat-work-authority-gate";
import {
  claudeExecutionProfileSchema,
  claudeExecutionProviderBindingSchema,
  claudeLaunchSelectionFor,
  type ClaudeExecutionProfile,
  type ClaudeExecutionProviderBinding,
} from "./claude-execution-profile";
import type { AppendEnvelope } from "./schema";

export interface ClaudeHostPreflightEvidence {
  evidenceId: string;
  cliVersion: string;
  planSha256: string;
  requiredFlagsVerified: true;
  authMethod: "claude.ai";
  apiProvider: "firstParty";
  subscriptionRouteVerified: true;
  providerOverridesPresent: false;
  modelSetter: string;
  effortSetter: "low" | "medium" | "high" | "xhigh" | "max";
}

export function claudeProfileAuthorizationId(requestId: string): string {
  return `claude-profile-authorization:${sha256(requestId).slice(0, 32)}`;
}

export function buildClaudeExecutionAuthorizationEnvelope(input: {
  worker: string;
  request: ChatWorkAuthorityRequest;
  authorizedProfile: ClaudeExecutionProfile;
  providerBinding: ClaudeExecutionProviderBinding;
  now: string;
}): AppendEnvelope {
  const binding = input.request.executionDirectiveBinding;
  const source = input.request.sourceReceipt;
  if (!binding || !source) throw new Error("A Claude profile authorization requires an exact directive and source binding.");
  const parsedProfile = claudeExecutionProfileSchema.parse(input.authorizedProfile);
  const parsedProvider = claudeExecutionProviderBindingSchema.parse(input.providerBinding);
  const authorizationId = claudeProfileAuthorizationId(input.request.requestId);
  return {
    schema_version: 2,
    event_id: authorizationId,
    mission_id: "mission-control-live",
    occurred_at: input.now,
    data: {
      type: "claude_execution_profile_authorized",
      worker: input.worker,
      authorization_id: authorizationId,
      request_id: input.request.requestId,
      directive_id: binding.directiveId,
      directive_revision: binding.directiveRevision,
      task_id: binding.taskId,
      directive_artifact_sha256: binding.directiveArtifactSha256,
      source_message_id: source.messageId,
      source_body_sha256: source.bodySha256,
      provider_binding: parsedProvider,
      authorized_profile: parsedProfile,
      authorized_at: input.now,
    },
  };
}

export function buildClaudeCliLaunchPreflightEnvelope(input: {
  worker: string;
  authorizationId: string;
  directiveId: string;
  directiveRevision: number;
  taskId: string;
  providerBinding: ClaudeExecutionProviderBinding;
  authorizedProfile: ClaudeExecutionProfile;
  evidence: ClaudeHostPreflightEvidence;
  now: string;
}): AppendEnvelope {
  const profile = claudeExecutionProfileSchema.parse(input.authorizedProfile);
  const providerBinding = claudeExecutionProviderBindingSchema.parse(input.providerBinding);
  const selection = claudeLaunchSelectionFor(profile);
  if (input.evidence.modelSetter !== selection.model || input.evidence.effortSetter !== selection.effort
    || input.evidence.subscriptionRouteVerified !== true || input.evidence.providerOverridesPresent !== false) {
    throw new Error("Claude host preflight evidence does not match the authorized launch selection and subscription route.");
  }
  const expectedEvidenceId = `claude-host-preflight:${sha256(canonicalJson({
    authorizationId: input.authorizationId,
    directiveId: input.directiveId,
    directiveRevision: input.directiveRevision,
    taskId: input.taskId,
    providerBinding,
    profile,
    planSha256: input.evidence.planSha256,
    cliVersion: input.evidence.cliVersion,
    authMethod: input.evidence.authMethod,
    apiProvider: input.evidence.apiProvider,
  })).slice(0, 32)}`;
  if (input.evidence.evidenceId !== expectedEvidenceId) throw new Error("Claude host preflight evidence identity is invalid.");
  return {
    schema_version: 2,
    event_id: input.evidence.evidenceId,
    mission_id: "mission-control-live",
    occurred_at: input.now,
    data: {
      type: "claude_cli_launch_preflight_recorded",
      worker: input.worker,
      evidence_id: input.evidence.evidenceId,
      authorization_id: input.authorizationId,
      directive_id: input.directiveId,
      directive_revision: input.directiveRevision,
      task_id: input.taskId,
      provider_binding: providerBinding,
      authorized_profile: profile,
      model_setter: selection.model,
      effort_setter: selection.effort,
      cli_version: input.evidence.cliVersion,
      plan_sha256: input.evidence.planSha256,
      required_flags_verified: input.evidence.requiredFlagsVerified,
      auth_method: input.evidence.authMethod,
      api_provider: input.evidence.apiProvider,
      subscription_route_verified: true,
      provider_overrides_present: false,
      source: "TRUSTED_CLAUDE_HOST_PREFLIGHT",
      recorded_at: input.now,
    },
  };
}

export function evaluatePersistedClaudeExecutionPreflight(input: {
  worker: string;
  body: unknown;
  events: Array<{ data: Record<string, unknown> }>;
  now: string;
}): { envelope: AppendEnvelope; preflight: { allowed: true; preflightId: string; evidence: ClaudeHostPreflightEvidence } } {
  if (!input.body || typeof input.body !== "object" || Array.isArray(input.body)) {
    throw new Error("Claude execution preflight body must be an object.");
  }
  const body = input.body as Record<string, unknown>;
  const authorizationId = String(body.authorizationId ?? "");
  const directiveId = String(body.directiveId ?? "");
  const directiveRevision = body.directiveRevision;
  const taskId = String(body.taskId ?? "");
  if (!authorizationId || !directiveId || !Number.isInteger(directiveRevision) || (directiveRevision as number) < 1 || !taskId) {
    throw new Error("Claude execution preflight identity is invalid.");
  }
  const providerBinding = claudeExecutionProviderBindingSchema.parse(body.providerBinding);
  const authorizedProfile = claudeExecutionProfileSchema.parse(body.authorizedProfile);
  const evidenceBody = body.evidence;
  if (!evidenceBody || typeof evidenceBody !== "object" || Array.isArray(evidenceBody)) {
    throw new Error("Claude execution preflight evidence is required.");
  }
  const evidenceRecord = evidenceBody as Record<string, unknown>;
  if (evidenceRecord.requiredFlagsVerified !== true) throw new Error("Claude CLI required flags were not verified.");
  if (evidenceRecord.subscriptionRouteVerified !== true) throw new Error("Claude subscription route was not verified.");
  const evidence: ClaudeHostPreflightEvidence = {
    evidenceId: String(evidenceRecord.evidenceId ?? ""),
    cliVersion: String(evidenceRecord.cliVersion ?? ""),
    planSha256: String(evidenceRecord.planSha256 ?? ""),
    requiredFlagsVerified: true,
    authMethod: evidenceRecord.authMethod === "claude.ai" ? "claude.ai" : (() => { throw new Error("Claude auth method must be claude.ai."); })(),
    apiProvider: evidenceRecord.apiProvider === "firstParty" ? "firstParty" : (() => { throw new Error("Claude API provider must be firstParty."); })(),
    subscriptionRouteVerified: true,
    providerOverridesPresent: evidenceRecord.providerOverridesPresent === false ? false : (() => { throw new Error("Claude provider overrides must be absent."); })(),
    modelSetter: String(evidenceRecord.modelSetter ?? ""),
    effortSetter: (["low", "medium", "high", "xhigh", "max"] as const).includes(evidenceRecord.effortSetter as never)
      ? evidenceRecord.effortSetter as ClaudeHostPreflightEvidence["effortSetter"]
      : (() => { throw new Error("Claude effort setter is invalid."); })(),
  };
  if (!/^[a-f0-9]{64}$/.test(evidence.planSha256) || !evidence.cliVersion.trim() || !evidence.requiredFlagsVerified
    || !evidence.subscriptionRouteVerified || evidence.providerOverridesPresent) {
    throw new Error("Claude host preflight evidence is incomplete.");
  }
  const authorization = [...input.events].reverse().map((event) => event.data).find((data) =>
    data.type === "claude_execution_profile_authorized"
      && data.worker === input.worker
      && data.authorization_id === authorizationId);
  if (!authorization) throw new Error("The exact persisted Claude execution profile authorization is unavailable.");
  if (authorization.directive_id !== directiveId || authorization.directive_revision !== directiveRevision
    || authorization.task_id !== taskId
    || canonicalJson(authorization.provider_binding) !== canonicalJson(providerBinding)
    || canonicalJson(authorization.authorized_profile) !== canonicalJson(authorizedProfile)) {
    throw new Error("Claude preflight does not match the persisted provider/profile authorization.");
  }
  const envelope = buildClaudeCliLaunchPreflightEnvelope({
    worker: input.worker,
    authorizationId,
    directiveId,
    directiveRevision: directiveRevision as number,
    taskId,
    providerBinding,
    authorizedProfile,
    evidence,
    now: input.now,
  });
  if (envelope.data.type !== "claude_cli_launch_preflight_recorded") throw new Error("Claude preflight event construction failed.");
  return { envelope, preflight: { allowed: true, preflightId: envelope.data.evidence_id, evidence } };
}
