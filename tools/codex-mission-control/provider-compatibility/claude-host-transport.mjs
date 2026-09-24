import { spawn } from 'node:child_process';
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { prepareClaudeCode, createClaudeCollector } from './compatibility.mjs';

const OVERRIDE_ENV_KEYS = Object.freeze([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
]);
const MAX_STDERR_BYTES = 32768;

export async function probeClaudeHost({
  claudeBinary = 'claude',
  spawnCapture = captureProcess,
  env = process.env,
  settingsPath = null,
} = {}) {
  const version = await spawnCapture(claudeBinary, ['--version'], { env });
  if (version.exitCode !== 0) throw new Error('CLAUDE_CLI_VERSION_PROBE_FAILED');
  const auth = await spawnCapture(claudeBinary, ['auth', 'status', '--json'], { env });
  if (auth.exitCode !== 0) throw new Error('CLAUDE_AUTH_STATUS_PROBE_FAILED');
  let authValue;
  try { authValue = JSON.parse(auth.stdout); }
  catch { throw new Error('CLAUDE_AUTH_STATUS_MALFORMED'); }
  const envOverrideNames = OVERRIDE_ENV_KEYS.filter((key) => {
    const value = env[key];
    return typeof value === 'string' && value.length > 0;
  });
  const candidateSettingsPaths = [
    settingsPath,
    typeof env.HOME === 'string' && env.HOME ? env.HOME + '/.claude/settings.json' : null,
    '/etc/claude-code/managed-settings.json',
  ].filter((value, index, values) => typeof value === 'string'
    && value.length > 0
    && values.indexOf(value) === index);
  const settingsOverridePaths = [];
  for (const path of candidateSettingsPaths) {
    settingsOverridePaths.push(...await settingsOverrideNames(path));
  }
  return Object.freeze({
    cliVersion: version.stdout.trim(),
    loggedIn: authValue?.loggedIn === true,
    authMethod: stringOrNull(authValue?.authMethod),
    apiProvider: stringOrNull(authValue?.apiProvider),
    subscriptionType: stringOrNull(authValue?.subscriptionType),
    subscriptionAuthenticated: authValue?.loggedIn === true
      && authValue?.authMethod === 'claude.ai'
      && authValue?.apiProvider === 'firstParty',
    envOverrideNames,
    settingsOverridePaths,
    apiOrProviderOverridesPresent: envOverrideNames.length > 0 || settingsOverridePaths.length > 0,
    inferenceInvoked: false,
  });
}

export function assertSubscriptionHostReady(host) {
  if (!host?.subscriptionAuthenticated) throw new Error('CLAUDE_SUBSCRIPTION_AUTH_REQUIRED');
  if (host.apiOrProviderOverridesPresent) throw new Error('CLAUDE_API_OR_PROVIDER_OVERRIDE_PRESENT');
  return true;
}
export async function createFileClaudeSessionRegistry({ path }) {
  if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('SESSION_REGISTRY_ABSOLUTE_PATH_REQUIRED');
  await mkdir(dirname(path), { recursive: true });
  return Object.freeze({
    async reserve({ sessionId, binding, authorizationId }) {
      const state = await readRegistry(path);
      if (state.sessions[sessionId]) return false;
      state.sessions[sessionId] = {
        binding: structuredClone(binding),
        authorizationId,
      };
      await writeRegistry(path, state);
      return true;
    },
    async lookup(sessionId) {
      const state = await readRegistry(path);
      return state.sessions[sessionId] ? structuredClone(state.sessions[sessionId]) : null;
    },
  });
}

export async function runAuthorizedClaudeCode({
  request,
  authorize,
  sessionRegistry,
  hostProbe = probeClaudeHost,
  claudeBinary = 'claude',
  spawnImpl = spawn,
  env = process.env,
  settingsPath = null,
  abortSignal = null,
  cancellationGraceMs = 3000,
}) {
  if (typeof authorize !== 'function') throw new Error('TRUSTED_CONTROLLER_AUTHORIZATION_REQUIRED');
  if (!sessionRegistry?.reserve || !sessionRegistry?.lookup) {
    throw new Error('PERSISTED_SESSION_REGISTRY_REQUIRED');
  }
  const plan = prepareClaudeCode(request);
  const host = await hostProbe({ claudeBinary, env, settingsPath });
  assertSubscriptionHostReady(host);
  const authorization = await authorize({ request, plan, host });
  assertAuthorization(authorization, request, plan);

  if (request.session.mode === 'new') {
    const reserved = await sessionRegistry.reserve({
      sessionId: request.session.id,
      binding: request.binding,
      authorizationId: authorization.authorizationId,
    });
    if (!reserved) throw new Error('CLAUDE_SESSION_ID_ALREADY_RESERVED');
  } else {
    const prior = await sessionRegistry.lookup(request.session.id);
    if (!prior || !sameBinding(prior.binding, request.binding)) {
      throw new Error('CLAUDE_RESUME_PERSISTED_BINDING_MISMATCH');
    }
  }

  const collector = createClaudeCollector(request);
  const child = spawnImpl(claudeBinary, plan.argv, {
    cwd: plan.cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    shell: false,
  });
  let stderrBytes = 0;
  let stderrTruncated = false;
  let timedOut = false;
  let abortRequested = false;
  let timeoutHandle;
  let abortHandler;

  child.stdout?.on('data', (chunk) => collector.write(chunk));
  child.stderr?.on('data', (chunk) => {
    const bytes = Buffer.byteLength(chunk);
    stderrBytes += bytes;
    if (stderrBytes > MAX_STDERR_BYTES) stderrTruncated = true;
  });
  child.stdin?.end(plan.stdin);

  const terminate = async (reason) => {
    if (reason === 'timeout') timedOut = true;
    if (reason === 'abort') abortRequested = true;
    signalTree(child, 'SIGTERM');
    await delay(cancellationGraceMs);
    if (treeAlive(child)) signalTree(child, 'SIGKILL');
  };
  timeoutHandle = setTimeout(() => { void terminate('timeout'); }, plan.limits.maxWallTimeMs);
  if (abortSignal) {
    abortHandler = () => { void terminate('abort'); };
    if (abortSignal.aborted) abortHandler();
    else abortSignal.addEventListener('abort', abortHandler, { once: true });
  }

  const ending = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  clearTimeout(timeoutHandle);
  if (abortSignal && abortHandler) abortSignal.removeEventListener('abort', abortHandler);
  const receipt = collector.finish({
    exitCode: ending.exitCode,
    signal: ending.signal,
    timedOut,
  });
  return Object.freeze({
    authorizationId: authorization.authorizationId,
    provider: 'anthropic',
    surface: 'claude-code-cli',
    hostEvidence: host,
    receipt,
    stderr: {
      bytes: stderrBytes,
      truncated: stderrTruncated,
      contentRetained: false,
    },
    cancellation: {
      abortRequested,
      timedOut,
      processTreeStopped: !treeAlive(child),
    },
    automaticRetries: 0,
    automaticFallback: false,
  });
}

function assertAuthorization(value, request, plan) {
  if (!value || value.allowed !== true || value.executionProvider !== 'ANTHROPIC') {
    throw new Error('CLAUDE_EXECUTION_NOT_AUTHORIZED');
  }
  if (typeof value.authorizationId !== 'string' || value.authorizationId.length === 0) {
    throw new Error('CLAUDE_AUTHORIZATION_ID_REQUIRED');
  }
  if (!sameBinding(value.binding, request.binding)) throw new Error('CLAUDE_AUTHORIZATION_BINDING_MISMATCH');
  if (value.model !== request.selection.model || value.effort !== request.selection.effort) {
    throw new Error('CLAUDE_AUTHORIZATION_SELECTION_MISMATCH');
  }
  if (plan.launchAuthorized !== false) throw new Error('UNEXPECTED_PLAN_AUTHORITY');
}

function sameBinding(left, right) {
  return ['taskId', 'directiveId', 'revision', 'directiveSha256']
    .every((key) => left?.[key] === right?.[key]);
}

async function captureProcess(command, args, { env }) {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  return { exitCode, stdout, stderrBytes: Buffer.byteLength(stderr) };
}
async function settingsOverrideNames(path) {
  let value;
  try { value = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new Error('CLAUDE_SETTINGS_STATUS_UNREADABLE');
  }
  const hits = [];
  walkSettings(value, '', hits);
  return [...new Set(hits)].sort();
}

function walkSettings(value, path, hits) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? path + '.' + key : key;
    const normalized = key.toLowerCase();
    if (normalized === 'apikeyhelper'
      || normalized === 'anthropic_api_key'
      || normalized === 'anthropic_auth_token'
      || normalized === 'anthropic_base_url'
      || normalized === 'claude_code_use_bedrock'
      || normalized === 'claude_code_use_vertex'
      || normalized === 'claude_code_use_foundry') hits.push(next);
    walkSettings(child, next, hits);
  }
}

async function readRegistry(path) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    return value?.schemaVersion === 1 && value?.sessions && typeof value.sessions === 'object'
      ? value
      : { schemaVersion: 1, sessions: {} };
  } catch (error) {
    if (error?.code === 'ENOENT') return { schemaVersion: 1, sessions: {} };
    throw error;
  }
}
async function writeRegistry(path, value) {
  const tmp = path + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  const handle = await open(tmp, 'r+');
  try { await handle.sync(); } finally { await handle.close(); }
  await rename(tmp, path);
}

function signalTree(child, signal) {
  if (!child?.pid) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function treeAlive(child) {
  if (!child?.pid) return false;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 0);
    else process.kill(child.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    return true;
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stringOrNull = (value) => typeof value === 'string' && value.length > 0 ? value : null;
