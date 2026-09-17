import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import {
  access,
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { finished } from 'node:stream/promises';

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
  return runCodexAttempt({ directive, config, route, clock, spawnImpl });
}

export async function runCodexAttempt({
  directive,
  config,
  route,
  clock = () => new Date(),
  spawnImpl = spawn,
}) {
  const normalized = await validateDirective(directive, config, route, clock);
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
      admissionReceiptId: normalized.admissionReceiptId,
      sourceDirective: normalized.sourceDirective,
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
        attemptDir,
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

async function createIsolatedCodexHome({ sourceCodexHome, attemptDir, workspace }) {
  if (typeof sourceCodexHome !== 'string' || sourceCodexHome.trim() === '') {
    throw new Error('A source Codex home is required for ChatGPT subscription authentication.');
  }
  const sourceAuth = join(resolve(sourceCodexHome), 'auth.json');
  await access(sourceAuth);
  const runtimeHome = join(attemptDir, '.codex-runtime');
  await mkdir(runtimeHome, { mode: 0o700 });
  const runtimeAuth = join(runtimeHome, 'auth.json');
  await copyFile(sourceAuth, runtimeAuth);
  await chmod(runtimeAuth, 0o600);
  await writeFile(
    join(runtimeHome, 'config.toml'),
    `[projects.${tomlString(workspace)}]\ntrust_level = "trusted"\n`,
    { mode: 0o600 },
  );
  return runtimeHome;
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

async function validateDirective(directive, config, route, clock) {
  if (!directive || directive.schemaVersion !== 1) throw new Error('Candidate directive schemaVersion must be 1.');
  if (typeof directive.jobId !== 'string' || !SAFE_ID.test(directive.jobId)) {
    throw new Error('jobId must be a safe non-empty identity.');
  }
  for (const [name, value] of [
    ['admissionReceiptId', directive.admissionReceiptId],
    ['sourceDirective.id', directive.sourceDirective?.id],
  ]) {
    if (typeof value !== 'string' || value.trim() === '' || value.length > 512) {
      throw new Error(`${name} must preserve a non-empty identity of at most 512 characters.`);
    }
  }
  if (directive.retryOfAttemptId != null
    && (typeof directive.retryOfAttemptId !== 'string' || !SAFE_ID.test(directive.retryOfAttemptId))) {
    throw new Error('retryOfAttemptId must be a safe attempt identity.');
  }
  if (!SHA256.test(directive.sourceDirective?.sha256 ?? '')) throw new Error('sourceDirective.sha256 must be a lowercase SHA-256 digest.');
  if (typeof directive.prompt !== 'string' || directive.prompt.trim() === '') throw new Error('Candidate directive prompt is required.');
  if (sha256(directive.prompt) !== directive.sourceDirective.sha256) throw new Error('Source directive digest does not match the exact prompt bytes.');
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
  return {
    ...directive,
    workspace,
    retryOfAttemptId: directive.retryOfAttemptId ?? null,
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
    return;
  }
  if (summaries.some((item) => item.status === CODEX_ATTEMPT_STATUSES.COMPLETED)) {
    throw new Error('COMPLETED_ATTEMPT_EXISTS: an explicit retry identity is required.');
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

function safeError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
