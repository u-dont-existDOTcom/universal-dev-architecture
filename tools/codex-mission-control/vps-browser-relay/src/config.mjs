import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseChatDirectory, parseChatProvisionDirectory } from './core.mjs';

export async function loadConfig(env = process.env) {
  const home = homedir();
  const configDir = resolve(expandHome(env.MC_RELAY_CONFIG_DIR ?? `${home}/.config/mission-control-chatgpt-relay`, home));
  const stateDir = resolve(expandHome(env.MC_RELAY_STATE_DIR ?? `${home}/.local/state/mission-control-chatgpt-relay`, home));
  const profileDir = resolve(expandHome(env.MC_RELAY_BROWSER_PROFILE_DIR ?? `${home}/.local/share/mission-control-chatgpt-profile`, home));
  const chatsFile = resolve(expandHome(env.MC_RELAY_CHATS_FILE ?? `${configDir}/chats.json`, home));
  const provisionsFile = resolve(expandHome(env.MC_RELAY_PROVISIONS_FILE ?? `${configDir}/provisions.json`, home));
  const provisionResultsFile = resolve(expandHome(env.MC_RELAY_PROVISION_RESULTS_FILE ?? `${configDir}/provisioned-chats.json`, home));
  const chatRaw = await readFile(chatsFile, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  const provisionRaw = await readFile(provisionsFile, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  const chatValue = chatRaw === null ? [] : JSON.parse(chatRaw);
  const provisionValue = provisionRaw === null ? [] : JSON.parse(provisionRaw);
  const chats = Array.isArray(chatValue) && chatValue.length === 0 ? [] : parseChatDirectory(chatValue);
  const provisions = Array.isArray(provisionValue) && provisionValue.length === 0 ? [] : parseChatProvisionDirectory(provisionValue);
  if (chats.length + provisions.length === 0) {
    throw new Error(`No active or owner-authorized provisioning chat directory is configured (${chatsFile}, ${provisionsFile}).`);
  }
  assertCombinedSupervisorDirectory(chats, provisions);
  const workerIds = [...new Set([...chats, ...provisions].map((chat) => chat.workerId).filter(Boolean))];

  const missionControlUrl = normalizeBaseUrl(required(env.MC_RELAY_MISSION_CONTROL_URL, 'MC_RELAY_MISSION_CONTROL_URL'));
  const producerId = required(env.MC_RELAY_PRODUCER_ID, 'MC_RELAY_PRODUCER_ID');
  const token = required(env.MC_RELAY_TOKEN, 'MC_RELAY_TOKEN');
  if (token.length < 32) throw new Error('MC_RELAY_TOKEN must contain at least 32 characters.');
  const submissionAuthorityUrl = normalizeBaseUrl(
    env.MC_RELAY_SUBMISSION_AUTHORITY_URL ?? `${missionControlUrl}/api/submission-authority`,
  );
  const targetBindingAttestorKey = required(env.MC_RELAY_TARGET_BINDING_ATTESTOR_KEY, 'MC_RELAY_TARGET_BINDING_ATTESTOR_KEY');
  if (targetBindingAttestorKey.length < 32) throw new Error('MC_RELAY_TARGET_BINDING_ATTESTOR_KEY must contain at least 32 characters.');
  if (targetBindingAttestorKey === token) throw new Error('MC_RELAY_TARGET_BINDING_ATTESTOR_KEY must differ from MC_RELAY_TOKEN.');
  const missionControlOrigin = new URL(missionControlUrl).origin;
  const missionControl = new URL(missionControlUrl);
  if (missionControl.protocol !== 'https:' && !['127.0.0.1', 'localhost', '::1'].includes(missionControl.hostname)) {
    throw new Error('Mission Control must use HTTPS unless it is reached through an authenticated loopback tunnel.');
  }
  const authority = new URL(submissionAuthorityUrl);
  if (authority.origin !== missionControlOrigin || authority.pathname !== '/api/submission-authority') {
    throw new Error('Submission authority must be the /api/submission-authority route on the configured Mission Control origin.');
  }
  const memoryProfile = env.MC_RELAY_MEMORY_PROFILE ?? 'AUTO';
  if (!['AUTO', '8GB', '16GB'].includes(memoryProfile)) throw new Error('MC_RELAY_MEMORY_PROFILE must be AUTO, 8GB, or 16GB.');
  const hostRole = required(env.MC_RELAY_HOST_ROLE, 'MC_RELAY_HOST_ROLE');
  if (!['PRIMARY', 'SECONDARY'].includes(hostRole)) throw new Error('MC_RELAY_HOST_ROLE must be PRIMARY or SECONDARY.');

  return {
    missionControl: {
      url: missionControlUrl,
      producerId,
      token,
      workerIds,
      requestTimeoutMs: integer(env.MC_RELAY_HTTP_TIMEOUT_MS, 30_000, 1_000, 120_000),
    },
    submissionScheduler: {
      url: submissionAuthorityUrl,
      token,
      producerId,
      attestorKey: targetBindingAttestorKey,
      pacingDomain: required(env.MC_RELAY_SUBMISSION_PACING_DOMAIN, 'MC_RELAY_SUBMISSION_PACING_DOMAIN'),
      requestTimeoutMs: integer(env.MC_RELAY_SUBMISSION_AUTHORITY_TIMEOUT_MS, 10_000, 1_000, 120_000),
    },
    browser: {
      cdpHost: env.MC_RELAY_CDP_HOST ?? '127.0.0.1',
      cdpPort: integer(env.MC_RELAY_CDP_PORT, 9222, 1, 65_535),
      profileDir,
      accountEmail: optionalAccountEmail(env.MC_RELAY_CHATGPT_ACCOUNT_EMAIL),
      pageReadyTimeoutMs: integer(env.MC_RELAY_PAGE_READY_TIMEOUT_MS, 90_000, 5_000, 300_000),
      submitTimeoutMs: integer(env.MC_RELAY_SUBMIT_TIMEOUT_MS, 30_000, 5_000, 120_000),
      generationTimeoutMs: integer(env.MC_RELAY_GENERATION_TIMEOUT_MS, 900_000, 30_000, 3_600_000),
      progressStallMs: integer(env.MC_RELAY_PROGRESS_STALL_MS, 120_000, 30_000, 900_000),
    },
    runtime: {
      chats,
      provisions,
      workerIds,
      chatsFile,
      provisionsFile,
      provisionResultsFile,
      submitEnabled: env.MC_RELAY_SUBMIT_ENABLED === '1',
      requestBoundEnabled: env.MC_RELAY_REQUEST_BOUND_ENABLED === '1',
      capabilityTestEnabled: env.MC_RELAY_CAPABILITY_TEST_ENABLED === '1',
      pollIntervalMs: integer(env.MC_RELAY_POLL_INTERVAL_MS, 15_000, 2_000, 300_000),
      minSubmissionIntervalMs: integer(env.MC_RELAY_MIN_SUBMISSION_INTERVAL_MS, 60_000, 60_000, 600_000),
      submissionHost: {
        alias: required(env.MC_RELAY_HOST_ALIAS, 'MC_RELAY_HOST_ALIAS'),
        role: hostRole,
        deploymentEpoch: integer(required(env.MC_RELAY_DEPLOYMENT_EPOCH, 'MC_RELAY_DEPLOYMENT_EPOCH'), null, 1, Number.MAX_SAFE_INTEGER),
        leaseId: required(env.MC_RELAY_DEPLOYMENT_LEASE_ID, 'MC_RELAY_DEPLOYMENT_LEASE_ID'),
      },
      retryDelayMs: integer(env.MC_RELAY_RETRY_DELAY_MS, 300_000, 30_000, 86_400_000),
      maxHotTabs: integer(env.MC_RELAY_MAX_HOT_TABS, 3, 1, 3),
      stuckRecoveryMaxNudges: integer(env.MC_RELAY_STUCK_RECOVERY_MAX_NUDGES, 3, 1, 20),
      stateFile: resolve(expandHome(env.MC_RELAY_STATE_FILE ?? `${stateDir}/state.json`, home)),
      statusFile: resolve(expandHome(env.MC_RELAY_STATUS_FILE ?? `${stateDir}/status.json`, home)),
      lockFile: resolve(expandHome(env.MC_RELAY_LOCK_FILE ?? `${stateDir}/relay.lock`, home)),
    },
    memory: {
      profile: memoryProfile,
      overrides: {
        softAvailableMb: optionalInteger(env.MC_RELAY_MEMORY_SOFT_AVAILABLE_MB, 256, 65_536),
        hardAvailableMb: optionalInteger(env.MC_RELAY_MEMORY_HARD_AVAILABLE_MB, 256, 65_536),
        softBrowserRssMb: optionalInteger(env.MC_RELAY_BROWSER_SOFT_RSS_MB, 512, 65_536),
        hardBrowserRssMb: optionalInteger(env.MC_RELAY_BROWSER_HARD_RSS_MB, 512, 65_536),
        softSwapUsedMb: optionalInteger(env.MC_RELAY_SWAP_SOFT_USED_MB, 0, 65_536),
        hardSwapUsedMb: optionalInteger(env.MC_RELAY_SWAP_HARD_USED_MB, 0, 65_536),
      },
    },
  };
}

export function loadCodexExecCandidateConfig(env = process.env) {
  const home = homedir();
  const stateDir = resolve(expandHome(
    env.MC_CODEX_EXEC_STATE_DIR ?? `${home}/.local/state/mission-control-chatgpt-relay/codex-exec-preview`,
    home,
  ));
  const runtimeBase = env.MC_CODEX_EXEC_RUNTIME_DIR
    ?? join(env.XDG_RUNTIME_DIR || tmpdir(), 'mission-control-codex-exec');
  return {
    previewEnabled: env.MC_CODEX_EXEC_PREVIEW_ENABLED === '1',
    stateDir,
    runtimeDir: resolve(expandHome(runtimeBase, home)),
    codexBinary: expandHome(env.MC_CODEX_EXEC_BINARY ?? `${home}/.local/bin/codex`, home),
    sourceCodexHome: resolve(expandHome(env.MC_CODEX_EXEC_SOURCE_HOME ?? env.CODEX_HOME ?? `${home}/.codex`, home)),
    nodeBinary: expandHome(env.MC_CODEX_EXEC_NODE_BINARY ?? '/usr/bin/node', home),
    restrictedBrowserAdapterPath: env.MC_CODEX_RESTRICTED_BROWSER_ADAPTER_PATH
      ? resolve(expandHome(env.MC_CODEX_RESTRICTED_BROWSER_ADAPTER_PATH, home))
      : null,
    restrictedBrowserAdapterSha256: env.MC_CODEX_RESTRICTED_BROWSER_ADAPTER_SHA256?.toLowerCase() ?? null,
    maxTimeoutMs: integer(env.MC_CODEX_EXEC_MAX_TIMEOUT_MS, 900_000, 1_000, 3_600_000),
    mcpStartupTimeoutSeconds: integer(env.MC_CODEX_MCP_STARTUP_TIMEOUT_SECONDS, 20, 1, 120),
    mcpToolTimeoutSeconds: integer(env.MC_CODEX_MCP_TOOL_TIMEOUT_SECONDS, 60, 1, 300),
  };
}

export function loadCodexExecMissionControlConfig(env = process.env) {
  const url = normalizeBaseUrl(required(
    env.MC_CODEX_EXEC_MISSION_CONTROL_URL ?? env.MC_RELAY_MISSION_CONTROL_URL,
    'MC_CODEX_EXEC_MISSION_CONTROL_URL',
  ));
  const workerId = required(env.MC_CODEX_EXEC_WORKER_ID, 'MC_CODEX_EXEC_WORKER_ID');
  const producerId = env.MC_CODEX_EXEC_PRODUCER_ID ?? `worker:${workerId}`;
  const token = required(
    env.MC_CODEX_EXEC_WORKER_TOKEN ?? env.MISSION_CONTROL_WORKER_TOKEN,
    'MC_CODEX_EXEC_WORKER_TOKEN',
  );
  if (token.length < 32) throw new Error('MC_CODEX_EXEC_WORKER_TOKEN must contain at least 32 characters.');
  return {
    url,
    workerId,
    producerId,
    token,
    requestTimeoutMs: integer(env.MC_CODEX_EXEC_MISSION_CONTROL_TIMEOUT_MS, 30_000, 1_000, 120_000),
  };
}

export function publicConfig(config) {
  return {
    missionControlUrl: config.missionControl.url,
    submissionAuthorityUrl: config.submissionScheduler.url,
    producerId: config.missionControl.producerId,
    cdpEndpoint: `http://${config.browser.cdpHost}:${config.browser.cdpPort}`,
    profileDir: config.browser.profileDir,
    chatsFile: config.runtime.chatsFile,
    chatCount: config.runtime.chats.length,
    provisionCount: config.runtime.provisions.length,
    workerIds: config.runtime.workerIds,
    submitEnabled: config.runtime.submitEnabled,
    capabilityTestEnabled: config.runtime.capabilityTestEnabled,
    pollIntervalMs: config.runtime.pollIntervalMs,
    minSubmissionIntervalMs: config.runtime.minSubmissionIntervalMs,
    progressStallMs: config.browser.progressStallMs,
    submissionHost: {
      alias: config.runtime.submissionHost.alias,
      role: config.runtime.submissionHost.role,
      deploymentEpoch: config.runtime.submissionHost.deploymentEpoch,
    },
    maxHotTabs: config.runtime.maxHotTabs,
    stuckRecoveryMaxNudges: config.runtime.stuckRecoveryMaxNudges,
    memory: config.memory,
    stateFile: config.runtime.stateFile,
    statusFile: config.runtime.statusFile,
  };
}

function assertCombinedSupervisorDirectory(chats, provisions) {
  const combined = [...chats, ...provisions];
  for (const [label, values] of [
    ['supervisor IDs', combined.map((chat) => chat.supervisorId)],
    ['registration IDs', combined.map((chat) => chat.registrationId)],
  ]) {
    if (new Set(values).size !== values.length) throw new Error(`Active and provisioning ${label} must be unique across the combined directory.`);
  }
  const projectManagers = combined.filter((chat) => chat.scope === 'PROJECT_MANAGER');
  if (projectManagers.length > 1) throw new Error('Only one overall Project Manager may exist across active and provisioning registrations.');
  if (new Set(combined.map((chat) => chat.accountAlias)).size !== 1) {
    throw new Error('Active and provisioning registrations must identify one exact provider account alias.');
  }
}

function required(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required.`);
  return value;
}

function integer(value, fallback, minimum, maximum) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Invalid integer ${value}; expected ${minimum}-${maximum}.`);
  return parsed;
}

function optionalAccountEmail(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('MC_RELAY_CHATGPT_ACCOUNT_EMAIL must be a string when provided.');
  const normalized = value.trim();
  if (normalized.length < 3 || normalized.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(normalized)) {
    throw new Error('MC_RELAY_CHATGPT_ACCOUNT_EMAIL must be a plausible email address no longer than 320 characters.');
  }
  return normalized;
}

function optionalInteger(value, minimum, maximum) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Invalid integer ${value}; expected ${minimum}-${maximum}.`);
  return parsed;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error('Mission Control URL must use HTTPS except for localhost testing.');
  }
  url.pathname = url.pathname.replace(/\/$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function expandHome(value, home) {
  return value === '~' ? home : value.startsWith('~/') ? `${home}/${value.slice(2)}` : value;
}
