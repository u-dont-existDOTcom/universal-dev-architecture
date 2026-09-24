import { resolve } from 'node:path';

import { codexDirectiveArtifactSha256 } from '../vps-browser-relay/src/codex-exec-candidate.mjs';
import {
  createFileClaudeSessionRegistry,
  runAuthorizedClaudeCode,
} from './claude-host-transport.mjs';

export async function dispatchClaudeMissionControlExecution({
  worker,
  admissionInput,
  directive,
  missionControl,
  sessionRegistryPath,
  claudeBinary = 'claude',
  claudeSettingsPath = null,
  env = process.env,
  spawnImpl,
}) {
  if (!missionControl || typeof missionControl.requestExecutionAdmission !== 'function') {
    throw new Error('AUTHENTICATED_MISSION_CONTROL_ADMISSION_REQUIRED');
  }
  if (directive?.executionProvider !== 'ANTHROPIC'
    || !directive?.claudeExecutionProfile
    || !directive?.claudeRuntime) {
    throw new Error('SOURCE_BOUND_CLAUDE_DIRECTIVE_REQUIRED');
  }
  const request = buildClaudeRequestFromDirective(directive);
  const admission = await missionControl.requestExecutionAdmission(worker, admissionInput);
  assertClaudeAdmission(admission, admissionInput, directive, request);
  if (typeof sessionRegistryPath !== 'string' || !sessionRegistryPath.startsWith('/')) {
    throw new Error('CLAUDE_SESSION_REGISTRY_PATH_REQUIRED');
  }
  const sessionRegistry = await createFileClaudeSessionRegistry({
    path: sessionRegistryPath,
  });
  return runAuthorizedClaudeCode({
    request,
    authorize: async () => ({
      allowed: true,
      executionProvider: 'ANTHROPIC',
      authorizationId: admission.claudeProfileAuthorizationId,
      binding: structuredClone(request.binding),
      model: request.selection.model,
      effort: request.selection.effort,
    }),
    sessionRegistry,
    claudeBinary,
    settingsPath: claudeSettingsPath,
    env,
    ...(spawnImpl ? { spawnImpl } : {}),
  });
}

export function buildClaudeRequestFromDirective(directive) {
  const profile = directive.claudeExecutionProfile;
  const runtime = directive.claudeRuntime;
  const binding = {
    taskId: directive.sourceDirective.taskId,
    directiveId: directive.sourceDirective.id,
    revision: directive.sourceDirective.revision,
    directiveSha256: codexDirectiveArtifactSha256(directive),
  };
  return {
    schemaVersion: 1,
    runId: directive.jobId,
    binding,
    provider: 'anthropic',
    surface: 'claude-code-cli',
    role: 'execution',
    session: structuredClone(runtime.session),
    selection: {
      model: profile.model,
      effort: profile.effort.toLowerCase(),
      assurance: profile.assuranceRequirement === 'CLIENT_REPORTED_MODEL_REQUIRED'
        ? 'client_reported_model'
        : 'set_request',
      expensiveEffortApproved: profile.expensiveEffortApproved,
    },
    workspace: resolve(directive.workspace),
    instruction: directive.prompt,
    limits: structuredClone(runtime.limits),
    access: structuredClone(runtime.access),
    billing: 'subscription',
  };
}

function assertClaudeAdmission(admission, admissionInput, directive, request) {
  const requested = admissionInput?.request;
  if (admission?.mayExecute !== true
    || admission?.admitted !== true
    || admission?.executionProvider !== 'ANTHROPIC'
    || admission?.primaryDecision?.executionProvider !== 'ANTHROPIC') {
    throw new Error('MISSION_CONTROL_CLAUDE_EXECUTION_NOT_ADMITTED');
  }
  if (typeof admission.claudeProfileAuthorizationId !== 'string'
    || admission.claudeProfileAuthorizationId.length === 0
    || admission.profileAuthorizationId !== null) {
    throw new Error('MISSION_CONTROL_CLAUDE_AUTHORIZATION_BINDING_INVALID');
  }
  const source = directive.sourceDirective;
  const bound = requested?.executionDirectiveBinding;
  if (requested?.executionProvider !== 'ANTHROPIC'
    || JSON.stringify(requested?.claudeExecutionProfile) !== JSON.stringify(directive.claudeExecutionProfile)
    || bound?.directiveId !== source.id
    || bound?.directiveRevision !== source.revision
    || bound?.taskId !== source.taskId
    || bound?.directiveArtifactSha256 !== codexDirectiveArtifactSha256(directive)) {
    throw new Error('MISSION_CONTROL_CLAUDE_SOURCE_BINDING_MISMATCH');
  }
  if (JSON.stringify(admission.authorizedClaudeExecutionProfile)
    !== JSON.stringify(directive.claudeExecutionProfile)) {
    throw new Error('MISSION_CONTROL_CLAUDE_PROFILE_MISMATCH');
  }
  if (request.binding.directiveSha256 !== codexDirectiveArtifactSha256(directive)) {
    throw new Error('CLAUDE_REQUEST_ARTIFACT_BINDING_MISMATCH');
  }
}
