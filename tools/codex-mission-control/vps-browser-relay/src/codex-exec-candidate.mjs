import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import {
  access,
  chmod,
  copyFile,
  mkdtemp,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { finished } from 'node:stream/promises';
import { canonicalJson } from './core.mjs';

export const CODEX_EXECUTION_ROUTES = Object.freeze({
  LOCAL: 'CODEX_LOCAL',
  RESTRICTED_BROWSER: 'CODEX_BROWSER_RESTRICTED',
  LEGACY_BROWSER: 'LEGACY_BROWSER',
});

export const CODEX_ATTEMPT_STATUSES = Object.freeze({
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  TIMED_OUT: 'TIMED_OUT',
  PROTOCOL_ERROR: 'PROTOCOL_ERROR',
});

const RESTRICTED_BROWSER_SERVER = 'existing_chromium_bridge';
const TERMINAL_STATUSES = new Set(Object.values(CODEX_ATTEMPT_STATUSES).filter((value) => value !== 'RUNNING'));
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const VERIFIED_RUNTIME_ADMISSION = Symbol('VERIFIED_RUNTIME_ADMISSION');
export const CODEX_EXECUTION_PAYLOAD_PREFIX = 'MISSION_CONTROL_CODEX_EXECUTION_PAYLOAD_V1\n';
export const AUTOMATIC_CODEX_DISPATCH_IDLE = 'MISSION_CONTROL_CODEX_DISPATCH_IDLE';

export function discoverMissionControlExecution(snapshot) {
  if (!isPlainObject(snapshot) || !Array.isArray(snapshot.workers)) {
    throw new Error('Mission Control fleet state does not contain scoped workers.');
  }
  const discovered = [];
  for (const workerState of snapshot.workers) {
    if (!isPlainObject(workerState) || typeof workerState.id !== 'string' || !Array.isArray(workerState.timeline)) continue;
    const timeline = workerState.timeline;
    const directiveEvent = [...timeline].reverse().find((event) => event?.data?.type === 'execution_directive_recorded');
    const persisted = directiveEvent?.data;
    if (!persisted || persisted.directive_schema_version !== 3 || persisted.status !== 'ACTIVE'
      || persisted.work_execution_profile === 'LEGACY_MODEL_PROFILE_UNSPECIFIED') continue;
    const completed = timeline.some((event) => event?.data?.type === 'execution_receipt_recorded'
      && event.data.directive_id === persisted.directive_id
      && event.data.directive_revision === persisted.directive_revision
      && event.data.task_id === persisted.task_id);
    if (completed) continue;
    const sourceEvent = [...timeline].reverse().find((event) => event?.data?.type === 'reasoning_message_recorded'
      && event.data.message_id === persisted.source_message_id);
    const source = sourceEvent?.data;
    if (!source || source.provenance_status === 'UNVERIFIED' || typeof source.exact_visible_body !== 'string'
      || !source.exact_visible_body.startsWith(CODEX_EXECUTION_PAYLOAD_PREFIX)) continue;
    if (sha256(source.exact_visible_body) !== persisted.source_body_sha256
      || source.body_sha256 !== persisted.source_body_sha256) {
      throw new Error(`Durable source bytes do not match schema-v3 directive ${persisted.directive_id}.`);
    }
    const payload = parseAutomaticExecutionPayload(source.exact_visible_body);
    const selection = selectionForProfile(persisted.work_execution_profile);
    const directive = {
      schemaVersion: 2,
      jobId: payload.jobId,
      sourceDirective: {
        id: persisted.directive_id,
        revision: persisted.directive_revision,
        taskId: persisted.task_id,
        sourceMessageId: persisted.source_message_id,
        sourceBodySha256: persisted.source_body_sha256,
      },
      requestedModel: selection.model,
      reasoningEffort: selection.thinking,
      workExecutionProfile: persisted.work_execution_profile,
      deadline: payload.deadline,
      workspace: payload.workspace,
      executionCapability: payload.executionCapability,
      outputSchema: payload.outputSchema,
      prompt: payload.prompt,
      ...(payload.retryOfAttemptId ? { retryOfAttemptId: payload.retryOfAttemptId } : {}),
    };
    const artifactSha256 = codexDirectiveArtifactSha256(directive);
    if (artifactSha256 !== persisted.directive_artifact_sha256) {
      throw new Error(`Executable bytes do not match schema-v3 directive artifact ${persisted.directive_id}.`);
    }
    const sourceAuthority = sourceAuthorityFor(source);
    const requestId = `codex-auto:${sha256(`${workerState.id}:${persisted.directive_id}:${persisted.directive_revision}:${artifactSha256}`).slice(0, 32)}`;
    discovered.push({
      worker: workerState.id,
      directive,
      setterEvidenceId: null,
      admissionInput: {
        request: {
          requestId,
          action: 'EXECUTE_BOUNDED_TASK',
          actor: 'WORK',
          sourceReceipt: {
            messageId: persisted.source_message_id,
            bodySha256: persisted.source_body_sha256,
            claimedSurface: sourceAuthority.surface,
            observedSurface: sourceAuthority.surface,
            provenanceStatus: source.provenance_status,
            authorActor: sourceAuthority.actor,
          },
          boundedExecution: true,
          taskRequiresExecutionOutsideChat: true,
          executionScope: 'TERMINAL_OR_COMPUTER_WORK',
          spend: { kind: 'MODEL_API_INFERENCE', ceilingUsd: 0, ownerApprovedNonzeroSpendManifestId: null },
          internalRoute: null,
          ownerPolicy: { paidModelInferenceAllowed: false, activeZeroSpendDecisionId: 'owner:zero-spend' },
          directiveSchemaVersion: 3,
          executionDirectiveBinding: {
            directiveId: persisted.directive_id,
            directiveRevision: persisted.directive_revision,
            taskId: persisted.task_id,
            directiveArtifactSha256: artifactSha256,
          },
          workExecutionProfile: persisted.work_execution_profile,
        },
        factualPacket: null,
      },
      sourceBinding: {
        worker: workerState.id,
        taskId: persisted.task_id,
        directiveId: persisted.directive_id,
        directiveRevision: persisted.directive_revision,
        sourceMessageId: persisted.source_message_id,
        sourceBodySha256: persisted.source_body_sha256,
        decisionRequestId: source.decision_request_id ?? null,
      },
      order: Number.isInteger(directiveEvent.sequence) ? directiveEvent.sequence : Number.MAX_SAFE_INTEGER,
    });
  }
  return discovered.sort((left, right) => left.order - right.order || left.worker.localeCompare(right.worker))[0] ?? null;
}

export async function dispatchAutomaticMissionControlExecution({
  snapshot = null,
  config,
  missionControl,
  legacyBrowserHandler,
  clock = () => new Date(),
  spawnImpl = spawn,
}) {
  if (!missionControl || typeof missionControl.fetchFleet !== 'function') {
    throw new Error('Automatic Mission Control execution requires the authenticated scoped fleet client.');
  }
  const durableState = snapshot ?? await missionControl.fetchFleet();
  const current = discoverMissionControlExecution(durableState);
  if (!current) return { status: AUTOMATIC_CODEX_DISPATCH_IDLE, codexChildStarted: false };
  const result = await dispatchMissionControlExecution({
    worker: current.worker,
    admissionInput: current.admissionInput,
    setterEvidenceId: current.setterEvidenceId,
    directive: current.directive,
    config,
    missionControl,
    legacyBrowserHandler: (directive, route) => legacyBrowserHandler(directive, {
      ...route,
      missionControlBinding: current.sourceBinding,
    }),
    clock,
    spawnImpl,
  });
  return {
    ...result,
    automaticDispatch: {
      worker: current.worker,
      taskId: current.sourceBinding.taskId,
      directiveId: current.sourceBinding.directiveId,
      directiveRevision: current.sourceBinding.directiveRevision,
      sourceMessageId: current.sourceBinding.sourceMessageId,
      sourceBodySha256: current.sourceBinding.sourceBodySha256,
    },
  };
}

export function classifyCodexExecutionRoute(directive, { previewEnabled }) {
  if (!previewEnabled) return CODEX_EXECUTION_ROUTES.LEGACY_BROWSER;
  const capability = directive?.executionCapability;
  if (capability?.type === 'LOCAL_FILESYSTEM_COMMAND') return CODEX_EXECUTION_ROUTES.LOCAL;
  if (capability?.type === 'BROWSER'
    && capability?.name === 'EXAMPLE_TARGET_LIFECYCLE') {
    return CODEX_EXECUTION_ROUTES.RESTRICTED_BROWSER;
  }
  return CODEX_EXECUTION_ROUTES.LEGACY_BROWSER;
}

export function codexDirectiveArtifactSha256(directive) {
  return sha256(canonicalJson(codexDirectiveArtifact(directive)));
}

export async function dispatchMissionControlExecution({
  worker,
  admissionInput,
  setterEvidenceId,
  directive,
  config,
  missionControl,
  legacyBrowserHandler,
  clock = () => new Date(),
  spawnImpl = spawn,
}) {
  const route = classifyCodexExecutionRoute(directive, config);
  if (route === CODEX_EXECUTION_ROUTES.LEGACY_BROWSER) {
    if (typeof legacyBrowserHandler !== 'function') {
      throw new Error('The actual legacy browser handler is required for disabled or unsupported candidate routes.');
    }
    return legacyBrowserHandler(directive, {
      route,
      reason: config.previewEnabled ? 'UNSUPPORTED_OR_UNCLASSIFIED_CAPABILITY' : 'PREVIEW_DISABLED',
    });
  }

  if (!missionControl
    || typeof missionControl.requestExecutionAdmission !== 'function'
    || typeof missionControl.requestWorkExecutionPreflight !== 'function'
    || typeof missionControl.recordWorkerEvents !== 'function') {
    throw new Error('The authenticated Mission Control admission/dispatch client is required before Codex execution.');
  }
  const binding = validateMissionControlDispatchBinding({ worker, admissionInput, directive, setterEvidenceId });
  const admission = await missionControl.requestExecutionAdmission(worker, admissionInput);
  assertAuthoritativeAdmission(admission, binding);
  const effectiveSetterEvidenceId = setterEvidenceId ?? admission.setterEvidenceId ?? null;
  if (typeof effectiveSetterEvidenceId !== 'string' || effectiveSetterEvidenceId.trim() === '') {
    throw new Error('Mission Control admission did not persist trusted task-creation setter evidence.');
  }
  const preflight = await missionControl.requestWorkExecutionPreflight(worker, {
    authorizationId: admission.profileAuthorizationId,
    requestedProfile: binding.workExecutionProfile,
    setterEvidenceId: effectiveSetterEvidenceId,
  });
  assertPersistedPreflight(preflight, admission, { ...binding, setterEvidenceId: effectiveSetterEvidenceId });

  const authority = {
    [VERIFIED_RUNTIME_ADMISSION]: true,
    requestId: binding.requestId,
    authorizationId: admission.profileAuthorizationId,
    preflightId: preflight.preflightId,
    setterEvidenceId: effectiveSetterEvidenceId,
    directiveArtifactSha256: binding.directiveArtifactSha256,
    sourceMessageId: binding.sourceMessageId,
    sourceBodySha256: binding.sourceBodySha256,
    directiveId: binding.directiveId,
    directiveRevision: binding.directiveRevision,
    taskId: binding.taskId,
    workExecutionProfile: binding.workExecutionProfile,
    preflight,
  };

  let startEnvelope = null;
  const summary = await runCodexAttempt({
    directive,
    config,
    route,
    authority,
    clock,
    spawnImpl,
    onAttemptStarted: async ({ attemptId, startedAt }) => {
      startEnvelope = buildExecutionStartedEnvelope({ worker, attemptId, startedAt, authority, route });
      await missionControl.recordWorkerEvents(worker, [startEnvelope]);
    },
  });
  if (summary.status === CODEX_ATTEMPT_STATUSES.COMPLETED) {
    const receipt = buildExecutionReceiptEnvelope({ worker, summary, authority, route, startEnvelope });
    await missionControl.recordWorkerEvents(worker, [receipt]);
  }
  return {
    ...summary,
    missionControlLifecycle: {
      admissionRequestId: authority.requestId,
      authorizationId: authority.authorizationId,
      preflightId: authority.preflightId,
      executionStartRecorded: startEnvelope !== null,
      executionReceiptRecorded: summary.status === CODEX_ATTEMPT_STATUSES.COMPLETED,
    },
  };
}

function validateMissionControlDispatchBinding({ worker, admissionInput, directive, setterEvidenceId }) {
  if (typeof worker !== 'string' || worker.trim() === '') throw new Error('A Mission Control worker identity is required.');
  if (setterEvidenceId != null && (typeof setterEvidenceId !== 'string' || setterEvidenceId.trim() === '')) {
    throw new Error('Trusted task-creation setter evidence is required.');
  }
  const request = admissionInput?.request;
  const source = request?.sourceReceipt;
  const binding = request?.executionDirectiveBinding;
  const profile = request?.workExecutionProfile;
  if (!request || request.action !== 'EXECUTE_BOUNDED_TASK' || request.actor !== 'WORK'
    || request.boundedExecution !== true || request.taskRequiresExecutionOutsideChat !== true) {
    throw new Error('Mission Control dispatch requires an exact bounded Work execution admission request.');
  }
  if (!binding || !source || !isPlainObject(profile)) {
    throw new Error('Mission Control dispatch requires exact directive, source, and execution-profile bindings.');
  }
  if (directive?.schemaVersion !== 2 || !directive.sourceDirective) {
    throw new Error('Mission Control dispatch requires a version 2 source-bound candidate directive.');
  }
  const artifactSha256 = codexDirectiveArtifactSha256(directive);
  const exact = [
    [binding.directiveId, directive.sourceDirective.id, 'directive identity'],
    [binding.directiveRevision, directive.sourceDirective.revision, 'directive revision'],
    [binding.taskId, directive.sourceDirective.taskId, 'task identity'],
    [binding.directiveArtifactSha256, artifactSha256, 'directive artifact digest'],
    [source.messageId, directive.sourceDirective.sourceMessageId, 'source message identity'],
    [source.bodySha256, directive.sourceDirective.sourceBodySha256, 'source body digest'],
  ];
  for (const [actual, expected, label] of exact) {
    if (actual !== expected) throw new Error(`Mission Control ${label} does not match the executable directive.`);
  }
  if (canonicalJson(profile) !== canonicalJson(directive.workExecutionProfile)) {
    throw new Error('Mission Control execution profile does not match the executable directive.');
  }
  const selection = selectionForProfile(profile);
  if (selection.model !== directive.requestedModel || selection.thinking !== directive.reasoningEffort) {
    throw new Error('Requested Codex model/effort differs from the source-bound Mission Control profile.');
  }
  if (selection.fastModeRequest !== 'DO_NOT_ENABLE_FAST') {
    throw new Error('The candidate dispatch does not authorize Fast mode.');
  }
  return {
    requestId: requiredIdentity(request.requestId, 'request.requestId'),
    directiveId: requiredIdentity(binding.directiveId, 'directiveId'),
    directiveRevision: binding.directiveRevision,
    taskId: requiredIdentity(binding.taskId, 'taskId'),
    directiveArtifactSha256: artifactSha256,
    sourceMessageId: requiredIdentity(source.messageId, 'sourceReceipt.messageId'),
    sourceBodySha256: source.bodySha256,
    workExecutionProfile: profile,
    selection,
    setterEvidenceId,
  };
}

function assertAuthoritativeAdmission(admission, binding) {
  if (admission?.mayExecute !== true || admission?.admitted !== true) {
    throw new Error(`MISSION_CONTROL_EXECUTION_NOT_ADMITTED: ${admission?.primaryDecision?.decision ?? admission?.error ?? 'DENIED'}`);
  }
  if (admission.requestId !== binding.requestId
    || typeof admission.profileAuthorizationId !== 'string'
    || admission.profileAuthorizationId.trim() === ''
    || canonicalJson(admission.authorizedWorkExecutionProfile) !== canonicalJson(binding.workExecutionProfile)) {
    throw new Error('Mission Control admission response does not bind the exact request and execution profile.');
  }
}

function assertPersistedPreflight(preflight, admission, binding) {
  if (preflight?.allowed !== true || typeof preflight.preflightId !== 'string' || preflight.preflightId.trim() === '') {
    throw new Error(`MISSION_CONTROL_EXECUTION_PREFLIGHT_REJECTED: ${preflight?.decision ?? preflight?.error ?? 'DENIED'}`);
  }
  if (preflight.setterEvidenceId !== binding.setterEvidenceId
    || canonicalJson(preflight.requestedProfile) !== canonicalJson(binding.workExecutionProfile)
    || canonicalJson(preflight.authorizedProfile) !== canonicalJson(admission.authorizedWorkExecutionProfile)
    || canonicalJson(preflight.launchSelection) !== canonicalJson(binding.selection)) {
    throw new Error('Mission Control preflight does not bind the exact persisted authorization, profile, and setter evidence.');
  }
}

function codexDirectiveArtifact(directive) {
  return {
    schemaVersion: 2,
    jobId: directive?.jobId ?? null,
    sourceDirective: directive?.sourceDirective ?? null,
    prompt: directive?.prompt ?? null,
    workspace: typeof directive?.workspace === 'string' ? resolve(directive.workspace) : null,
    executionCapability: directive?.executionCapability ?? null,
    outputSchema: directive?.outputSchema ?? null,
    workExecutionProfile: directive?.workExecutionProfile ?? null,
    requestedModel: directive?.requestedModel ?? null,
    reasoningEffort: directive?.reasoningEffort ?? null,
    executionContract: {
      sandbox: 'workspace-write',
      approvalPolicy: 'never',
      workspaceNetworkAccess: false,
      apiKeyFallback: false,
    },
  };
}

function selectionForProfile(profile) {
  const model = profile?.model === 'GPT_5_6_SOL' ? 'gpt-5.6-sol'
    : profile?.model === 'GPT_6_ASTRA' ? 'gpt-6-astra' : null;
  const effort = typeof profile?.effort === 'string' ? profile.effort.toLowerCase() : null;
  if (!model || !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
    throw new Error('Mission Control supplied an unsupported Work execution model or effort.');
  }
  return { model, thinking: effort, fastModeRequest: profile.fastModeRequest };
}

function parseAutomaticExecutionPayload(body) {
  let value;
  try { value = JSON.parse(body.slice(CODEX_EXECUTION_PAYLOAD_PREFIX.length)); }
  catch { throw new Error('Durable Codex execution payload is not valid JSON.'); }
  if (!isPlainObject(value) || value.schemaVersion !== 1) {
    throw new Error('Durable Codex execution payload must use schemaVersion 1.');
  }
  const exactKeys = ['schemaVersion', 'jobId', 'deadline', 'workspace', 'executionCapability', 'outputSchema', 'prompt'];
  const allowedKeys = new Set([...exactKeys, 'retryOfAttemptId']);
  if (!exactKeys.every((key) => Object.hasOwn(value, key))
    || Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error('Durable Codex execution payload fields are incomplete or unexpected.');
  }
  if (typeof value.jobId !== 'string' || !SAFE_ID.test(value.jobId)) throw new Error('Durable Codex jobId is invalid.');
  if (typeof value.deadline !== 'string' || !Number.isFinite(Date.parse(value.deadline))) throw new Error('Durable Codex deadline is invalid.');
  if (typeof value.workspace !== 'string' || !isAbsolute(value.workspace)) throw new Error('Durable Codex workspace must be absolute.');
  if (!isPlainObject(value.executionCapability)) throw new Error('Durable Codex execution capability is invalid.');
  if (!isPlainObject(value.outputSchema)) throw new Error('Durable Codex output schema is invalid.');
  if (typeof value.prompt !== 'string' || value.prompt.trim() === '') throw new Error('Durable Codex prompt is required.');
  if (value.retryOfAttemptId != null && (typeof value.retryOfAttemptId !== 'string' || !SAFE_ID.test(value.retryOfAttemptId))) {
    throw new Error('Durable Codex retry identity is invalid.');
  }
  return value;
}

function sourceAuthorityFor(source) {
  if (source.author_role === 'OWNER') return { actor: 'OWNER', surface: 'OWNER_DIRECT' };
  if (source.author_role !== 'ASSISTANT') {
    throw new Error('The durable execution source was not authored by the owner or an authorized Chat assistant.');
  }
  if (source.surface_role === 'PROJECT_MANAGER') {
    return { actor: 'PROJECT_MANAGER_CHAT', surface: 'CHATGPT_PROJECT_MANAGER' };
  }
  if (source.surface_role === 'SUPERVISOR') {
    return { actor: 'SPECIALIST_SUPERVISOR_CHAT', surface: 'CHATGPT_SPECIALIST_SUPERVISOR' };
  }
  throw new Error('The durable execution source has no authorized reasoning surface.');
}

function authorityBindingSha256(authority, route) {
  return sha256(canonicalJson({
    requestId: authority.requestId,
    authorizationId: authority.authorizationId,
    preflightId: authority.preflightId,
    setterEvidenceId: authority.setterEvidenceId,
    directiveArtifactSha256: authority.directiveArtifactSha256,
    sourceMessageId: authority.sourceMessageId,
    sourceBodySha256: authority.sourceBodySha256,
    directiveId: authority.directiveId,
    directiveRevision: authority.directiveRevision,
    taskId: authority.taskId,
    workExecutionProfile: authority.workExecutionProfile,
    route,
  }));
}

function sourceBindingSha256(authority, route) {
  return sha256(canonicalJson({
    directiveArtifactSha256: authority.directiveArtifactSha256,
    sourceMessageId: authority.sourceMessageId,
    sourceBodySha256: authority.sourceBodySha256,
    directiveId: authority.directiveId,
    directiveRevision: authority.directiveRevision,
    taskId: authority.taskId,
    workExecutionProfile: authority.workExecutionProfile,
    route,
    executionContract: {
      sandbox: 'workspace-write', approvalPolicy: 'never', workspaceNetworkAccess: false, apiKeyFallback: false,
    },
  }));
}

function buildExecutionStartedEnvelope({ worker, attemptId, startedAt, authority, route }) {
  return {
    schema_version: 2,
    event_id: `codex-execution-start:${attemptId}`,
    mission_id: 'mission-control-live',
    occurred_at: startedAt,
    data: {
      type: 'codex_execution_started',
      worker,
      execution_start_id: `codex-execution-start:${attemptId}`,
      worker_run_id: attemptId,
      task_id: authority.taskId,
      directive_id: authority.directiveId,
      directive_revision: authority.directiveRevision,
      started_at: startedAt,
      execution_mode: 'BOUNDED_MECHANICAL',
      declared_tactical_boundary: `Execute the exact admitted ${route} directive without semantic or supervisory authority.`,
      work_profile_authorization_id: authority.authorizationId,
      work_profile_preflight_id: authority.preflightId,
    },
  };
}

function buildExecutionReceiptEnvelope({ worker, summary, authority, route, startEnvelope }) {
  const preflight = authority.preflight;
  if (!startEnvelope || startEnvelope.data.worker_run_id !== summary.attemptId) {
    throw new Error('Mission Control execution receipt is missing its exact recorded start.');
  }
  return {
    schema_version: 2,
    event_id: `codex-execution-receipt:${summary.attemptId}`,
    mission_id: 'mission-control-live',
    occurred_at: summary.finishedAt,
    data: {
      type: 'execution_receipt_recorded',
      worker,
      receipt_id: `codex-execution-receipt:${summary.attemptId}`,
      directive_id: authority.directiveId,
      directive_revision: authority.directiveRevision,
      task_id: authority.taskId,
      worker_run_id: summary.attemptId,
      repository_start_state: `directive-artifact:${authority.directiveArtifactSha256}`,
      repository_end_state: `directive-artifact:${authority.directiveArtifactSha256}`,
      started_at: summary.startedAt,
      stopped_at: summary.finishedAt,
      actions_taken: [`Executed exact admitted route ${route}.`],
      files_changed: [],
      artifacts_produced: [`attempt:${summary.attemptId}`],
      checks_run: [{ command: 'codex exec structured protocol validation', result: 'PASS', summary: 'Process, terminal event, route contract, and structured result passed.' }],
      measurements: [],
      evidence_refs: [`attempt:${summary.attemptId}`, `directive-artifact:${authority.directiveArtifactSha256}`],
      deviations: [],
      blockers: [],
      stop_trigger_reached: 'The bounded mechanical candidate attempt reached its admitted terminal result.',
      execution_claim: 'Bounded execution completed; all semantic, progress, and supervisory judgments remain with Chat/Mission Control.',
      strategy_change: null,
      progress_classification: null,
      supervisory_verdict: null,
      owner_escalation_decision: null,
      pro_escalation_decision: null,
      contract_to_owner_alignment: null,
      outcome_advancement: null,
      strategy_efficacy: null,
      scientific_adequacy: null,
      release_adequacy: null,
      owner_outcome_achievement: null,
      next_reasoning_review_required: true,
      receipt_schema_version: 3,
      work_execution: {
        authorization_id: authority.authorizationId,
        preflight_id: authority.preflightId,
        setter_evidence_id: authority.setterEvidenceId,
        requested_profile: preflight.requestedProfile,
        authorized_profile: preflight.authorizedProfile,
        observed_profile: preflight.observedProfile,
        applied_selection: preflight.appliedSelection,
        observability: {
          model: preflight.capability.model,
          effort: preflight.capability.effort,
          fastMode: preflight.capability.fastMode,
        },
        preflight: preflight.result,
        preflight_decision: preflight.decision,
        model_identity_evidence: preflight.modelIdentityEvidence,
        escalations: [],
        final_profile: preflight.authorizedProfile,
        fast_mode_observed: null,
        allowance_delta: null,
        routing_telemetry: { eligible: false, telemetry_index: null, exclusion_reason: 'TRIVIAL' },
      },
    },
  };
}

function requiredIdentity(value, field) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 180) throw new Error(`${field} must be a non-empty stable identity.`);
  return value;
}

export async function executeMissionControlCandidate({
  directive,
  config,
  legacyBrowserHandler,
  clock = () => new Date(),
  spawnImpl = spawn,
}) {
  const route = classifyCodexExecutionRoute(directive, config);
  if (route === CODEX_EXECUTION_ROUTES.LEGACY_BROWSER) {
    if (typeof legacyBrowserHandler !== 'function') {
      throw new Error('The legacy browser handler is required for disabled or unsupported candidate routes.');
    }
    return legacyBrowserHandler(directive, {
      route,
      reason: config.previewEnabled ? 'UNSUPPORTED_OR_UNCLASSIFIED_CAPABILITY' : 'PREVIEW_DISABLED',
    });
  }
  throw new Error('VERIFIED_RUNTIME_ADMISSION_REQUIRED: use dispatchMissionControlExecution for Codex routes.');
}

async function runCodexAttempt({
  directive,
  config,
  route,
  authority,
  onAttemptStarted,
  clock = () => new Date(),
  spawnImpl = spawn,
}) {
  if (authority?.[VERIFIED_RUNTIME_ADMISSION] !== true) {
    throw new Error('VERIFIED_RUNTIME_ADMISSION_REQUIRED: no Codex process may start from caller-supplied receipt text.');
  }
  const normalized = await validateDirective(directive, config, route, clock, authority);
  const jobDir = join(resolve(config.stateDir), 'jobs', normalized.jobId);
  await mkdir(jobDir, { recursive: true, mode: 0o700 });
  const lockPath = join(jobDir, '.candidate.lock');
  const lock = await acquireJobLock(lockPath);
  try {
    const existing = await readAttemptSummaries(jobDir);
    enforceRetryIdentity(normalized, existing);

    const attemptId = `${compactTimestamp(clock())}-${randomUUID()}`;
    const attemptDir = join(jobDir, attemptId);
    await mkdir(attemptDir, { recursive: false, mode: 0o700 });
    const startedAt = clock().toISOString();
    const eventsPath = join(attemptDir, 'events.jsonl');
    const stderrPath = join(attemptDir, 'stderr.log');
    const resultPath = join(attemptDir, 'result.json');
    const schemaPath = join(attemptDir, 'result-schema.json');
    const statusPath = join(attemptDir, 'status');
    const summaryPath = join(attemptDir, 'summary.json');
    const directivePath = join(attemptDir, 'directive.json');

    const identity = {
      schemaVersion: 1,
      jobId: normalized.jobId,
      attemptId,
      retryOfAttemptId: normalized.retryOfAttemptId,
      sourceDirective: normalized.sourceDirective,
      directiveArtifactSha256: authority.directiveArtifactSha256,
      authorityBindingSha256: authorityBindingSha256(authority, route),
      sourceBindingSha256: sourceBindingSha256(authority, route),
      requestedModel: normalized.requestedModel,
      reasoningEffort: normalized.reasoningEffort,
      route,
      startedAt,
      deadline: normalized.deadline,
      workspace: normalized.workspace,
      sandbox: 'workspace-write',
      approvalPolicy: 'never',
      workspaceNetworkAccess: false,
      apiKeyFallback: false,
    };
    await Promise.all([
      writeJson(directivePath, identity),
      writeJson(schemaPath, normalized.outputSchema),
      writeFile(eventsPath, '', { mode: 0o600 }),
      writeFile(stderrPath, '', { mode: 0o600 }),
      writeFile(statusPath, `${CODEX_ATTEMPT_STATUSES.RUNNING}\n`, { mode: 0o600 }),
    ]);

    if (typeof onAttemptStarted !== 'function') throw new Error('Mission Control lifecycle start recorder is required.');
    await onAttemptStarted({ attemptId, startedAt, identity });

    let processState = { exitCode: null, signal: null, started: false };
    let timedOut = false;
    let runnerError = null;
    let mcpPreflight = null;
    let authenticationPreflight = null;
    let isolatedCodexHome = null;
    let runtimeCredentialCopyRemoved = false;
    try {
      const childEnv = withoutApiKeys(config.environment ?? process.env);
      isolatedCodexHome = await createIsolatedCodexHome({
        sourceCodexHome: config.sourceCodexHome,
        runtimeDir: config.runtimeDir ?? join(tmpdir(), 'mission-control-codex-exec'),
        durableStateDir: config.stateDir,
        workspace: normalized.workspace,
      });
      childEnv.CODEX_HOME = isolatedCodexHome;
      authenticationPreflight = await verifySubscriptionAuthentication({
        config,
        workspace: normalized.workspace,
        environment: childEnv,
        spawnImpl,
      });
      const mcp = await prepareMcpConfiguration({
        config,
        route,
        workspace: normalized.workspace,
        environment: childEnv,
        spawnImpl,
      });
      mcpPreflight = mcp.receipt;
      await writeJson(join(attemptDir, 'mcp-preflight.json'), mcpPreflight);
      const args = buildCodexExecArgs({
        directive: normalized,
        route,
        schemaPath,
        resultPath,
        mcpOverrides: mcp.overrides,
      });
      await writeJson(join(attemptDir, 'command-contract.json'), sanitizeCommandContract(args, route, mcpPreflight));
      const timeoutMs = Math.min(config.maxTimeoutMs, Date.parse(normalized.deadline) - clock().getTime());
      if (timeoutMs <= 0) throw new Error('Directive deadline expired before Codex execution started.');
      const outcome = await spawnCodex({
        command: config.codexBinary,
        args,
        cwd: normalized.workspace,
        environment: childEnv,
        prompt: normalized.prompt,
        eventsPath,
        stderrPath,
        timeoutMs,
        spawnImpl,
      });
      processState = outcome.processState;
      timedOut = outcome.timedOut;
    } catch (error) {
      runnerError = safeError(error);
    } finally {
      if (isolatedCodexHome) {
        await rm(isolatedCodexHome, { recursive: true, force: true });
        runtimeCredentialCopyRemoved = true;
      }
    }

    const protocol = await inspectProtocol(eventsPath, resultPath, route);
    const terminalStatus = deriveTerminalStatus({ processState, timedOut, runnerError, protocol });
    const finishedAt = clock().toISOString();
    const summary = {
      ...identity,
      status: terminalStatus,
      finishedAt,
      processExitState: processState,
      runnerError,
      authenticationPreflight,
      runtimeCredentialCopyRemoved,
      mcpPreflight,
      protocol,
      structuredFinalResult: protocol.result,
      evidence: {
        attemptDir,
        eventsPath,
        stderrPath,
        resultPath,
      },
    };
    await Promise.all([
      writeFile(statusPath, `${terminalStatus}\n`, { mode: 0o600 }),
      writeFile(join(attemptDir, 'finished-at'), `${finishedAt}\n`, { mode: 0o600 }),
      writeJson(join(attemptDir, 'process-exit-state.json'), processState),
      writeJson(summaryPath, summary),
    ]);
    return summary;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

async function createIsolatedCodexHome({ sourceCodexHome, runtimeDir, durableStateDir, workspace }) {
  if (typeof sourceCodexHome !== 'string' || sourceCodexHome.trim() === '') {
    throw new Error('A source Codex home is required for ChatGPT subscription authentication.');
  }
  const sourceAuth = join(resolve(sourceCodexHome), 'auth.json');
  await access(sourceAuth);
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  const runtimeRoot = await realpath(resolve(runtimeDir));
  const durableRoot = await realpath(resolve(durableStateDir));
  if (pathIsWithin(durableRoot, runtimeRoot)) {
    throw new Error('The ephemeral Codex runtime directory must be outside the durable Mission Control state tree.');
  }
  await chmod(runtimeRoot, 0o700);
  let runtimeHome = null;
  try {
    runtimeHome = await mkdtemp(join(runtimeRoot, 'attempt-'));
    await chmod(runtimeHome, 0o700);
    const runtimeAuth = join(runtimeHome, 'auth.json');
    await copyFile(sourceAuth, runtimeAuth);
    await chmod(runtimeAuth, 0o600);
    await writeFile(
      join(runtimeHome, 'config.toml'),
      `[projects.${tomlString(workspace)}]\ntrust_level = "trusted"\n`,
      { mode: 0o600 },
    );
    return runtimeHome;
  } catch (error) {
    if (runtimeHome) await rm(runtimeHome, { recursive: true, force: true });
    throw error;
  }
}

async function verifySubscriptionAuthentication({ config, workspace, environment, spawnImpl }) {
  const value = await spawnCapture({
    command: config.codexBinary,
    args: ['login', 'status'],
    cwd: workspace,
    environment,
    timeoutMs: 30_000,
    spawnImpl,
  });
  const output = `${value.stdout}\n${value.stderr}`;
  if (value.exitCode !== 0 || !/chatgpt/i.test(output)) {
    throw new Error('Codex is not authenticated through a ChatGPT subscription in the isolated runtime home.');
  }
  return {
    authenticated: true,
    authenticationType: 'ChatGPT subscription',
    apiKeyVariablesPresent: false,
  };
}

export function buildCodexExecArgs({ directive, route, schemaPath, resultPath, mcpOverrides }) {
  const overrides = [
    `model_reasoning_effort=${tomlString(directive.reasoningEffort)}`,
    'approval_policy="never"',
    'sandbox_workspace_write.network_access=false',
    'features.plugins=false',
    ...mcpOverrides,
  ];
  const args = [
    'exec',
    '--ignore-rules',
    '--ephemeral',
    '--skip-git-repo-check',
    '--model', directive.requestedModel,
  ];
  for (const override of overrides) args.push('-c', override);
  args.push(
    '--sandbox', 'workspace-write',
    '--cd', directive.workspace,
    '--json',
    '--output-schema', schemaPath,
    '--output-last-message', resultPath,
    '-',
  );
  if (route === CODEX_EXECUTION_ROUTES.RESTRICTED_BROWSER
    && args.some((value) => value.includes('127.0.0.1:9222'))) {
    throw new Error('Raw CDP must not appear in the Codex job configuration.');
  }
  return args;
}

async function validateDirective(directive, config, route, clock, authority) {
  if (!directive || directive.schemaVersion !== 2) throw new Error('Candidate directive schemaVersion must be 2.');
  if (typeof directive.jobId !== 'string' || !SAFE_ID.test(directive.jobId)) {
    throw new Error('jobId must be a safe non-empty identity.');
  }
  for (const [name, value] of [
    ['sourceDirective.id', directive.sourceDirective?.id],
    ['sourceDirective.taskId', directive.sourceDirective?.taskId],
    ['sourceDirective.sourceMessageId', directive.sourceDirective?.sourceMessageId],
  ]) {
    if (typeof value !== 'string' || value.trim() === '' || value.length > 512) {
      throw new Error(`${name} must preserve a non-empty identity of at most 512 characters.`);
    }
  }
  if (!Number.isInteger(directive.sourceDirective?.revision) || directive.sourceDirective.revision < 1) {
    throw new Error('sourceDirective.revision must be a positive integer.');
  }
  if (directive.retryOfAttemptId != null
    && (typeof directive.retryOfAttemptId !== 'string' || !SAFE_ID.test(directive.retryOfAttemptId))) {
    throw new Error('retryOfAttemptId must be a safe attempt identity.');
  }
  if (!SHA256.test(directive.sourceDirective?.sourceBodySha256 ?? '')) {
    throw new Error('sourceDirective.sourceBodySha256 must be a lowercase SHA-256 digest.');
  }
  if (typeof directive.prompt !== 'string' || directive.prompt.trim() === '') throw new Error('Candidate directive prompt is required.');
  if (typeof directive.requestedModel !== 'string' || directive.requestedModel.trim() === '') throw new Error('requestedModel is required.');
  if (!['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(directive.reasoningEffort)) throw new Error('Unsupported reasoningEffort.');
  if (!isPlainObject(directive.outputSchema)) throw new Error('outputSchema must be a JSON object.');
  if (typeof directive.workspace !== 'string' || !isAbsolute(directive.workspace)) throw new Error('workspace must be an absolute path.');
  const workspace = resolve(directive.workspace);
  const workspaceStat = await stat(workspace).catch(() => null);
  if (!workspaceStat?.isDirectory()) throw new Error('workspace must identify an existing directory.');
  const deadlineMs = Date.parse(directive.deadline);
  if (!Number.isFinite(deadlineMs) || deadlineMs <= clock().getTime()) throw new Error('deadline must be a future ISO timestamp.');
  if (deadlineMs - clock().getTime() > config.maxTimeoutMs) throw new Error('deadline exceeds the configured maximum attempt timeout.');
  if (route === CODEX_EXECUTION_ROUTES.RESTRICTED_BROWSER) {
    if (!config.restrictedBrowserAdapterPath || !config.restrictedBrowserAdapterSha256) {
      throw new Error('Restricted browser route requires an adapter path and exact SHA-256.');
    }
    if (!SHA256.test(config.restrictedBrowserAdapterSha256)) throw new Error('Restricted browser adapter SHA-256 is invalid.');
  }
  if (codexDirectiveArtifactSha256(directive) !== authority.directiveArtifactSha256) {
    throw new Error('The executable candidate bytes do not match the exact Mission Control directive artifact digest.');
  }
  if (authorityBindingSha256(authority, route) !== authorityBindingSha256({
    ...authority,
    directiveId: directive.sourceDirective.id,
    directiveRevision: directive.sourceDirective.revision,
    taskId: directive.sourceDirective.taskId,
    sourceMessageId: directive.sourceDirective.sourceMessageId,
    sourceBodySha256: directive.sourceDirective.sourceBodySha256,
  }, route)) {
    throw new Error('The executable candidate source identity differs from the verified Mission Control authority binding.');
  }
  return {
    ...directive,
    workspace,
    retryOfAttemptId: directive.retryOfAttemptId ?? null,
    directiveArtifactSha256: authority.directiveArtifactSha256,
    sourceBindingSha256: sourceBindingSha256(authority, route),
  };
}

async function prepareMcpConfiguration({ config, route, workspace, environment, spawnImpl }) {
  const baseOverrides = ['features.plugins=false'];
  const discovered = await listMcpServers({ config, workspace, environment, overrides: baseOverrides, spawnImpl });
  const disableOverrides = discovered.map((server) => `mcp_servers.${tomlKey(server.name)}.enabled=false`);
  let adapter = null;
  let routeOverrides = [];
  if (route === CODEX_EXECUTION_ROUTES.RESTRICTED_BROWSER) {
    const bytes = await readFile(config.restrictedBrowserAdapterPath);
    const actualSha256 = createHash('sha256').update(bytes).digest('hex');
    if (actualSha256 !== config.restrictedBrowserAdapterSha256) {
      throw new Error(`Restricted browser adapter digest mismatch: expected ${config.restrictedBrowserAdapterSha256}, got ${actualSha256}.`);
    }
    adapter = {
      serverName: RESTRICTED_BROWSER_SERVER,
      path: config.restrictedBrowserAdapterPath,
      sha256: actualSha256,
    };
    routeOverrides = [
      `mcp_servers.${RESTRICTED_BROWSER_SERVER}.command=${tomlString(config.nodeBinary)}`,
      `mcp_servers.${RESTRICTED_BROWSER_SERVER}.args=[${tomlString(config.restrictedBrowserAdapterPath)}]`,
      `mcp_servers.${RESTRICTED_BROWSER_SERVER}.cwd=${tomlString(dirname(config.restrictedBrowserAdapterPath))}`,
      `mcp_servers.${RESTRICTED_BROWSER_SERVER}.startup_timeout_sec=${config.mcpStartupTimeoutSeconds}`,
      `mcp_servers.${RESTRICTED_BROWSER_SERVER}.tool_timeout_sec=${config.mcpToolTimeoutSeconds}`,
      `mcp_servers.${RESTRICTED_BROWSER_SERVER}.tools.example_target_lifecycle.approval_mode="approve"`,
      `mcp_servers.${RESTRICTED_BROWSER_SERVER}.enabled=true`,
    ];
  }
  const overrides = [...baseOverrides, ...disableOverrides, ...routeOverrides];
  const effective = await listMcpServers({ config, workspace, environment, overrides, spawnImpl });
  const enabled = effective.filter((server) => server.enabled).map((server) => server.name).sort();
  const expected = route === CODEX_EXECUTION_ROUTES.RESTRICTED_BROWSER ? [RESTRICTED_BROWSER_SERVER] : [];
  if (JSON.stringify(enabled) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected enabled MCP servers: ${enabled.join(',') || '(none)'}.`);
  }
  return {
    overrides,
    receipt: {
      discoveredServerNames: discovered.map((server) => server.name).sort(),
      effectiveEnabledServerNames: enabled,
      restrictedAdapter: adapter,
      rawCdpEndpointExposed: overrides.some((value) => value.includes('127.0.0.1:9222')),
    },
  };
}

async function listMcpServers({ config, workspace, environment, overrides, spawnImpl }) {
  const args = ['mcp', 'list', '--json'];
  for (const override of overrides) args.push('-c', override);
  const value = await spawnCapture({
    command: config.codexBinary,
    args,
    cwd: workspace,
    environment,
    timeoutMs: 30_000,
    spawnImpl,
  });
  if (value.exitCode !== 0) throw new Error(`Codex MCP preflight failed with exit ${value.exitCode}: ${value.stderr.slice(0, 1000)}`);
  let parsed;
  try { parsed = JSON.parse(value.stdout); }
  catch { throw new Error('Codex MCP preflight returned malformed JSON.'); }
  if (!Array.isArray(parsed)) throw new Error('Codex MCP preflight did not return a server list.');
  return parsed.map((server) => ({ name: String(server.name), enabled: server.enabled === true }));
}

async function spawnCodex({ command, args, cwd, environment, prompt, eventsPath, stderrPath, timeoutMs, spawnImpl }) {
  const stdout = createWriteStream(eventsPath, { flags: 'a', mode: 0o600 });
  const stderr = createWriteStream(stderrPath, { flags: 'a', mode: 0o600 });
  let child;
  try {
    child = spawnImpl(command, args, {
      cwd,
      env: environment,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    stdout.end();
    stderr.end();
    await Promise.allSettled([finished(stdout), finished(stderr)]);
    throw error;
  }
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  child.stdin.end(prompt);
  let timedOut = false;
  let killTimer = null;
  const timer = setTimeout(() => {
    timedOut = true;
    killAttemptProcessGroup(child, 'SIGTERM');
    killTimer = setTimeout(() => killAttemptProcessGroup(child, 'SIGKILL'), 5_000);
    killTimer.unref?.();
  }, timeoutMs);
  timer.unref?.();
  const processState = await new Promise((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolvePromise({ exitCode, signal, started: true }));
  }).finally(() => {
    clearTimeout(timer);
    if (killTimer) clearTimeout(killTimer);
  });
  await Promise.all([finished(stdout), finished(stderr)]);
  return { processState, timedOut };
}

async function spawnCapture({ command, args, cwd, environment, timeoutMs, spawnImpl }) {
  const child = spawnImpl(command, args, { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);
  timer.unref?.();
  const state = await new Promise((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolvePromise({ exitCode, signal }));
  }).finally(() => clearTimeout(timer));
  if (timedOut) throw new Error('Codex MCP preflight timed out.');
  return { ...state, stdout, stderr };
}

async function inspectProtocol(eventsPath, resultPath, route) {
  const rawEvents = await readFile(eventsPath, 'utf8').catch(() => '');
  let malformedEventLines = 0;
  let terminalTurnCompletedCount = 0;
  const terminalMcpCalls = [];
  let commandExecutionCount = 0;
  let approvalEventCount = 0;
  for (const line of rawEvents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event?.type === 'turn.completed') terminalTurnCompletedCount += 1;
      const item = event?.item ?? {};
      if (event?.type === 'item.completed' && item.type === 'mcp_tool_call') terminalMcpCalls.push(item);
      if (event?.type === 'item.completed' && item.type === 'command_execution') commandExecutionCount += 1;
      if (String(event?.type ?? '').toLowerCase().includes('approval')
        || String(item?.type ?? '').toLowerCase().includes('approval')) approvalEventCount += 1;
    } catch {
      malformedEventLines += 1;
    }
  }
  let result = null;
  let resultError = null;
  try {
    result = JSON.parse(await readFile(resultPath, 'utf8'));
    if (!isPlainObject(result)) throw new Error('Structured result must be a JSON object.');
  } catch (error) {
    result = null;
    resultError = safeError(error);
  }
  const restrictedCalls = terminalMcpCalls.filter((item) => item.server === RESTRICTED_BROWSER_SERVER
    && item.tool === 'example_target_lifecycle'
    && item.status === 'completed'
    && item.error == null
    && item.result?.structured_content?.success === true);
  const routeContractSatisfied = route === CODEX_EXECUTION_ROUTES.RESTRICTED_BROWSER
    ? terminalMcpCalls.length === 1
      && restrictedCalls.length === 1
      && commandExecutionCount === 0
      && approvalEventCount === 0
    : terminalMcpCalls.length === 0 && approvalEventCount === 0;
  return {
    terminalTurnCompletedCount,
    malformedEventLines,
    terminalMcpToolCallCount: terminalMcpCalls.length,
    completedRestrictedBrowserToolCallCount: restrictedCalls.length,
    commandExecutionCount,
    approvalEventCount,
    routeContractSatisfied,
    structuredResultParsed: result !== null,
    resultReportsSuccess: result?.success === true,
    resultError,
    result,
  };
}

function deriveTerminalStatus({ processState, timedOut, runnerError, protocol }) {
  if (timedOut) return CODEX_ATTEMPT_STATUSES.TIMED_OUT;
  if (runnerError || processState.exitCode !== 0) return CODEX_ATTEMPT_STATUSES.FAILED;
  if (protocol.malformedEventLines !== 0
    || protocol.terminalTurnCompletedCount !== 1
    || !protocol.structuredResultParsed
    || !protocol.routeContractSatisfied) {
    return CODEX_ATTEMPT_STATUSES.PROTOCOL_ERROR;
  }
  if (!protocol.resultReportsSuccess) return CODEX_ATTEMPT_STATUSES.FAILED;
  return CODEX_ATTEMPT_STATUSES.COMPLETED;
}

async function readAttemptSummaries(jobDir) {
  const entries = await readdir(jobDir, { withFileTypes: true }).catch(() => []);
  const summaries = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      summaries.push(JSON.parse(await readFile(join(jobDir, entry.name, 'summary.json'), 'utf8')));
    } catch {
      // A partial attempt remains evidence but cannot be mistaken for completion.
    }
  }
  return summaries;
}

function enforceRetryIdentity(directive, summaries) {
  if (directive.retryOfAttemptId) {
    const prior = summaries.find((item) => item.attemptId === directive.retryOfAttemptId);
    if (!prior || !TERMINAL_STATUSES.has(prior.status)) throw new Error('retryOfAttemptId must identify a prior terminal attempt for this job.');
    if (prior.status === CODEX_ATTEMPT_STATUSES.COMPLETED) {
      throw new Error('COMPLETED_ATTEMPT_EXISTS: completed work cannot be retried silently.');
    }
    if (prior.directiveArtifactSha256 !== directive.directiveArtifactSha256
      || prior.sourceBindingSha256 !== directive.sourceBindingSha256) {
      throw new Error('RETRY_SOURCE_BINDING_MISMATCH: retry semantics differ from the admitted source directive or execution profile.');
    }
    return;
  }
  if (summaries.length > 0) {
    throw new Error('EXPLICIT_RETRY_IDENTITY_REQUIRED: this job already has attempt evidence.');
  }
}

async function acquireJobLock(path) {
  try { return await open(path, 'wx', 0o600); }
  catch (error) {
    if (error?.code === 'EEXIST') throw new Error('JOB_ATTEMPT_IN_PROGRESS: another candidate attempt owns this job.');
    throw error;
  }
}

function killAttemptProcessGroup(child, signal) {
  if (!child?.pid) return;
  try { process.kill(-child.pid, signal); }
  catch {
    try { child.kill(signal); }
    catch { /* Process already exited. */ }
  }
}

function sanitizeCommandContract(args, route, mcpPreflight) {
  return {
    executable: 'codex',
    route,
    args,
    subscriptionAuthenticationRequired: true,
    apiKeyVariablesRemoved: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
    sandbox: 'workspace-write',
    approvalPolicy: 'never',
    workspaceNetworkAccess: false,
    enabledMcpServers: mcpPreflight.effectiveEnabledServerNames,
    rawCdpEndpointExposed: args.some((value) => value.includes('127.0.0.1:9222')),
  };
}

function withoutApiKeys(environment) {
  const child = { ...environment };
  delete child.OPENAI_API_KEY;
  delete child.CODEX_API_KEY;
  return child;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function tomlKey(value) {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : tomlString(value);
}

function compactTimestamp(value) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pathIsWithin(parent, candidate) {
  const relation = relative(parent, candidate);
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

function safeError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
