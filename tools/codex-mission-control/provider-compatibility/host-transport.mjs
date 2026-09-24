import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createClaudeCollector, prepareClaudeCode, validateRequest } from './compatibility.mjs';

const verifiedPreflights = new WeakMap();
const PROVIDER_OVERRIDE_KEYS = Object.freeze([
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
]);
const REQUIRED_CLI_FLAGS = Object.freeze([
  '--print', '--verbose', '--output-format', '--model', '--effort', '--permission-mode',
  '--permission-prompts', '--restricted', '--disable-slash-commands', '--no-chrome',
  '--strict-mcp-config', '--mcp-config', '--tools', '--disallowedTools', '--json-schema',
]);

export function claudeProfileForRequest(input) {
  const request = validateRequest(input);
  return Object.freeze({
    model: request.selection.model,
    effort: request.selection.effort.toUpperCase(),
    billingRoute: 'SUBSCRIPTION',
    assuranceRequirement: request.selection.assurance === 'client_reported_model'
      ? 'CLIENT_REPORTED_MODEL_REQUIRED' : 'SET_REQUEST_SUFFICIENT',
    expensiveEffortApproved: request.selection.expensiveEffortApproved,
    contractVersion: 'CLAUDE_CODE_SUBSCRIPTION_V1',
  });
}

export const CLAUDE_PROVIDER_BINDING = Object.freeze({
  provider: 'ANTHROPIC', surface: 'CLAUDE_CODE_CLI', role: 'EXECUTION',
});

export async function inspectClaudeHost({
  request: input,
  admissionInput,
  admission,
  claudeBinary = 'claude',
  environment = process.env,
  spawnImpl = spawn,
}) {
  const request = validateRequest(input);
  const plan = prepareClaudeCode(request);
  assertClaudeAdmission({ request, admissionInput, admission });
  const overrides = PROVIDER_OVERRIDE_KEYS.filter((key) => environment[key] !== undefined && environment[key] !== '');
  if (overrides.length) throw new Error(`CLAUDE_PROVIDER_OVERRIDE_PRESENT:${overrides.sort().join(',')}`);

  const version = await capture(claudeBinary, ['--version'], request.workspace, environment, 20_000, spawnImpl);
  if (version.exitCode !== 0 || !/^\d+\.\d+\.\d+\s+\(Claude Code\)/.test(version.stdout.trim())) {
    throw new Error('CLAUDE_CLI_VERSION_UNVERIFIED');
  }
  const help = await capture(claudeBinary, ['--help'], request.workspace, environment, 20_000, spawnImpl);
  if (help.exitCode !== 0 || REQUIRED_CLI_FLAGS.some((flag) => !help.stdout.includes(flag))) {
    throw new Error('CLAUDE_CLI_FLAG_CONTRACT_UNVERIFIED');
  }
  for (const arg of plan.argv) {
    if (arg === '--max-turns') throw new Error('CLAUDE_UNSUPPORTED_MAX_TURNS_FLAG');
  }
  const auth = await capture(claudeBinary, ['auth', 'status', '--json'], request.workspace, environment, 20_000, spawnImpl);
  if (auth.exitCode !== 0) throw new Error('CLAUDE_SUBSCRIPTION_AUTH_UNVERIFIED');
  let parsed;
  try { parsed = JSON.parse(auth.stdout); } catch { throw new Error('CLAUDE_AUTH_STATUS_MALFORMED'); }
  if (parsed?.loggedIn !== true || parsed?.authMethod !== 'claude.ai' || parsed?.apiProvider !== 'firstParty'
    || typeof parsed?.subscriptionType !== 'string' || !parsed.subscriptionType.trim()) {
    throw new Error('CLAUDE_SUBSCRIPTION_AUTH_UNVERIFIED');
  }

  const profile = claudeProfileForRequest(request);
  const authorizationId = admission.claudeProfileAuthorizationId;
  const planSha256 = sha256(canonicalJson({
    command: plan.command, argv: plan.argv, cwd: plan.cwd, runId: plan.runId, binding: plan.binding,
  }));
  const evidenceId = `claude-host-preflight:${sha256(canonicalJson({
    authorizationId,
    directiveId: request.binding.directiveId,
    directiveRevision: request.binding.revision,
    taskId: request.binding.taskId,
    providerBinding: CLAUDE_PROVIDER_BINDING,
    profile,
    planSha256,
    cliVersion: version.stdout.trim(),
    authMethod: 'claude.ai',
    apiProvider: 'firstParty',
  })).slice(0, 32)}`;
  const evidence = Object.freeze({
    evidenceId, planSha256, cliVersion: version.stdout.trim(), authMethod: 'claude.ai', apiProvider: 'firstParty',
    subscriptionRouteVerified: true, providerOverridesPresent: false,
    requiredFlagsVerified: true, modelSetter: request.selection.model, effortSetter: request.selection.effort,
  });
  const publicPreflight = Object.freeze({ plan, evidence, authorizationId });
  verifiedPreflights.set(publicPreflight, { request, plan, claudeBinary, environment: scrubProviderOverrides(environment), spawnImpl });
  return publicPreflight;
}

export async function runClaudeTransport(preflight, { signal = null, killGraceMs = 2_000 } = {}) {
  const internal = verifiedPreflights.get(preflight);
  if (!internal) throw new Error('TRUSTED_CLAUDE_HOST_PREFLIGHT_REQUIRED');
  verifiedPreflights.delete(preflight);
  const { request, plan, claudeBinary, environment, spawnImpl } = internal;
  const collector = createClaudeCollector(request);
  let child;
  try {
    child = spawnImpl(claudeBinary, plan.argv, {
      cwd: plan.cwd, env: environment, detached: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false,
    });
  } catch (error) {
    throw new Error(`CLAUDE_SPAWN_FAILED:${safeError(error)}`);
  }
  let stderrBytes = 0;
  let stderrTruncated = false;
  let timedOut = false;
  let aborted = false;
  const stderrLimit = 16_384;
  child.stdout.on('data', (chunk) => collector.write(chunk));
  child.stderr.on('data', (chunk) => {
    const length = Buffer.byteLength(chunk);
    stderrBytes += length;
    if (stderrBytes > stderrLimit) stderrTruncated = true;
  });
  child.stdin.end(plan.stdin);

  let killTimer = null;
  const terminate = (reason) => {
    if (reason === 'timeout') timedOut = true;
    if (reason === 'abort') aborted = true;
    killProcessGroup(child, 'SIGTERM');
    killTimer ??= setTimeout(() => killProcessGroup(child, 'SIGKILL'), killGraceMs);
    killTimer.unref?.();
  };
  const wallTimer = setTimeout(() => terminate('timeout'), request.limits.maxWallTimeMs);
  wallTimer.unref?.();
  const abortListener = () => terminate('abort');
  signal?.addEventListener('abort', abortListener, { once: true });
  if (signal?.aborted) terminate('abort');

  const termination = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode, childSignal) => resolve({ exitCode, signal: childSignal, timedOut }));
  }).finally(() => {
    clearTimeout(wallTimer);
    if (killTimer) clearTimeout(killTimer);
    signal?.removeEventListener('abort', abortListener);
  });
  const processTreeStopped = await ensureProcessGroupStopped(child, killGraceMs);
  if (!processTreeStopped) throw new Error('CLAUDE_PROCESS_TREE_STILL_RUNNING');
  const receipt = collector.finish(termination);
  return Object.freeze({
    ...receipt,
    hostEvidence: Object.freeze({
      evidenceId: preflight.evidence.evidenceId,
      planSha256: preflight.evidence.planSha256,
      cliVersion: preflight.evidence.cliVersion,
      subscriptionRouteVerified: true,
      providerOverridesPresent: false,
      requiredFlagsVerified: true,
      stderrBytes: Math.min(stderrBytes, Number.MAX_SAFE_INTEGER), stderrTruncated,
      processTreeStopped: true, aborted,
    }),
  });
}

export function buildClaudeExecutionReceiptEnvelope({ worker, request: input, preflight, receipt, now = new Date().toISOString() }) {
  const request = validateRequest(input);
  if (!receipt?.hostEvidence || receipt.hostEvidence.evidenceId !== preflight?.evidence?.evidenceId
    || receipt.hostEvidence.processTreeStopped !== true) throw new Error('CLAUDE_RECEIPT_HOST_EVIDENCE_MISMATCH');
  if (receipt.effortEvidence?.evidence !== 'SET_REQUEST_ONLY') throw new Error('CLAUDE_RECEIPT_EFFORT_EVIDENCE_INVALID');
  const profile = claudeProfileForRequest(request);
  const receiptId = `claude-execution-receipt:${sha256(canonicalJson({
    authorizationId: preflight.authorizationId, evidenceId: preflight.evidence.evidenceId,
    directiveId: request.binding.directiveId, directiveRevision: request.binding.revision, taskId: request.binding.taskId,
    runId: request.runId, sessionId: request.session.id, status: receipt.status, reasonCodes: receipt.reasonCodes,
  })).slice(0, 32)}`;
  return Object.freeze({
    schema_version: 2, event_id: receiptId, mission_id: 'mission-control-live', occurred_at: now,
    data: Object.freeze({
      type: 'claude_execution_receipt_recorded', worker, receipt_id: receiptId,
      authorization_id: preflight.authorizationId, preflight_evidence_id: preflight.evidence.evidenceId,
      directive_id: request.binding.directiveId, directive_revision: request.binding.revision, task_id: request.binding.taskId,
      provider_binding: CLAUDE_PROVIDER_BINDING, authorized_profile: profile, run_id: request.runId,
      session_id: request.session.id, status: receipt.status, reason_codes: [...receipt.reasonCodes],
      observed_primary_models: [...(receipt.modelEvidence?.observed ?? [])], effort_evidence: 'SET_REQUEST_ONLY',
      process_tree_stopped: true, report_present: receipt.report !== null, recorded_at: now,
    }),
  });
}

function assertClaudeAdmission({ request, admissionInput, admission }) {
  const source = admissionInput?.request;
  if (!source || source.action !== 'EXECUTE_BOUNDED_TASK' || source.actor !== 'WORK') {
    throw new Error('CLAUDE_ADMISSION_REQUEST_REQUIRED');
  }
  const binding = source.executionDirectiveBinding;
  if (!binding || binding.directiveId !== request.binding.directiveId
    || binding.directiveRevision !== request.binding.revision
    || binding.taskId !== request.binding.taskId
    || binding.directiveArtifactSha256 !== request.binding.directiveSha256) {
    throw new Error('CLAUDE_ADMISSION_BINDING_MISMATCH');
  }
  if (canonicalJson(source.executionProviderBinding) !== canonicalJson(CLAUDE_PROVIDER_BINDING)) {
    throw new Error('CLAUDE_PROVIDER_BINDING_MISMATCH');
  }
  const profile = claudeProfileForRequest(request);
  if (canonicalJson(source.claudeExecutionProfile) !== canonicalJson(profile)) {
    throw new Error('CLAUDE_PROFILE_BINDING_MISMATCH');
  }
  if (source.workExecutionProfile !== undefined && source.workExecutionProfile !== null
    && source.workExecutionProfile !== 'LEGACY_MODEL_PROFILE_UNSPECIFIED') {
    throw new Error('CLAUDE_MUST_NOT_REUSE_WORK_PROFILE');
  }
  if (admission?.admitted !== true || admission?.mayExecute !== true
    || admission?.requestId !== source.requestId
    || canonicalJson(admission.authorizedClaudeExecutionProfile) !== canonicalJson(profile)
    || canonicalJson(admission.executionProviderBinding) !== canonicalJson(CLAUDE_PROVIDER_BINDING)
    || typeof admission.claudeProfileAuthorizationId !== 'string' || !admission.claudeProfileAuthorizationId.trim()) {
    throw new Error('CLAUDE_EXECUTION_NOT_ADMITTED');
  }
}

async function capture(command, args, cwd, environment, timeoutMs, spawnImpl) {
  const child = spawnImpl(command, args, { cwd, env: scrubProviderOverrides(environment), stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > 1_000_000) stdout = stdout.slice(-1_000_000); });
  child.stderr.on('data', (chunk) => { stderr += chunk; if (stderr.length > 32_768) stderr = stderr.slice(-32_768); });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs); timer.unref?.();
  const state = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', (exitCode, childSignal) => resolve({ exitCode, signal: childSignal }));
  }).finally(() => clearTimeout(timer));
  if (timedOut) throw new Error('CLAUDE_PREFLIGHT_TIMEOUT');
  return { ...state, stdout, stderr };
}

function scrubProviderOverrides(environment) {
  const child = { ...environment };
  for (const key of PROVIDER_OVERRIDE_KEYS) delete child[key];
  return child;
}

async function ensureProcessGroupStopped(child, graceMs) {
  if (!child?.pid || process.platform === 'win32') return true;
  if (!processGroupAlive(child.pid)) return true;
  killProcessGroup(child, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (!processGroupAlive(child.pid)) return true;
  }
  killProcessGroup(child, 'SIGKILL');
  await new Promise((resolve) => setTimeout(resolve, 25));
  return !processGroupAlive(child.pid);
}

function processGroupAlive(pid) {
  try { process.kill(-pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}
function killProcessGroup(child, signal) {
  if (!child?.pid) return;
  try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch { /* already stopped */ } }
}
function canonicalJson(value) { return JSON.stringify(sortValue(value)); }
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, child]) => [k, sortValue(child)]));
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Canonical JSON cannot encode non-finite number.');
  return value;
}
function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function safeError(error) { return error instanceof Error ? `${error.name}:${error.message}` : String(error); }

export async function dispatchClaudeMissionControlExecution({
  worker,
  admissionInput,
  request,
  missionControl,
  claudeBinary = 'claude',
  environment = process.env,
  spawnImpl = spawn,
  signal = null,
  killGraceMs = 2_000,
}) {
  if (!missionControl
    || typeof missionControl.requestExecutionAdmission !== 'function'
    || typeof missionControl.requestClaudeExecutionPreflight !== 'function'
    || typeof missionControl.recordWorkerEvents !== 'function') {
    throw new Error('CLAUDE_MISSION_CONTROL_CLIENT_REQUIRED');
  }
  const admission = await missionControl.requestExecutionAdmission(worker, admissionInput);
  const preflight = await inspectClaudeHost({ request, admissionInput, admission, claudeBinary, environment, spawnImpl });
  const profile = claudeProfileForRequest(request);
  const persisted = await missionControl.requestClaudeExecutionPreflight(worker, {
    authorizationId: preflight.authorizationId,
    directiveId: request.binding.directiveId,
    directiveRevision: request.binding.revision,
    taskId: request.binding.taskId,
    providerBinding: CLAUDE_PROVIDER_BINDING,
    authorizedProfile: profile,
    evidence: preflight.evidence,
  });
  if (persisted?.allowed !== true || persisted?.preflightId !== preflight.evidence.evidenceId) {
    throw new Error(`CLAUDE_EXECUTION_PREFLIGHT_REJECTED:${persisted?.error ?? persisted?.preflightId ?? 'DENIED'}`);
  }
  const receipt = await runClaudeTransport(preflight, { signal, killGraceMs });
  const receiptEnvelope = buildClaudeExecutionReceiptEnvelope({ worker, request, preflight, receipt });
  await missionControl.recordWorkerEvents(worker, [receiptEnvelope]);
  return Object.freeze({
    ...receipt,
    missionControlLifecycle: Object.freeze({
      admissionRequestId: admissionInput?.request?.requestId ?? null,
      claudeProfileAuthorizationId: preflight.authorizationId,
      claudePreflightId: persisted.preflightId,
      preflightPersisted: true,
      executionReceiptRecorded: true,
      executionReceiptId: receiptEnvelope.data.receipt_id,
    }),
  });
}
