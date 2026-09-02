import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseChatDirectory } from './core.mjs';

export async function loadConfig(env = process.env) {
  const home = homedir();
  const configDir = resolve(expandHome(env.MC_RELAY_CONFIG_DIR ?? `${home}/.config/mission-control-chatgpt-relay`, home));
  const stateDir = resolve(expandHome(env.MC_RELAY_STATE_DIR ?? `${home}/.local/state/mission-control-chatgpt-relay`, home));
  const profileDir = resolve(expandHome(env.MC_RELAY_BROWSER_PROFILE_DIR ?? `${home}/.local/share/mission-control-chatgpt-profile`, home));
  const chatsFile = resolve(expandHome(env.MC_RELAY_CHATS_FILE ?? `${configDir}/chats.json`, home));
  const chatRaw = await readFile(chatsFile, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') throw new Error(`Chat directory is missing: ${chatsFile}`);
    throw error;
  });
  const chats = parseChatDirectory(JSON.parse(chatRaw));

  const missionControlUrl = normalizeBaseUrl(required(env.MC_RELAY_MISSION_CONTROL_URL, 'MC_RELAY_MISSION_CONTROL_URL'));
  const producerId = required(env.MC_RELAY_PRODUCER_ID, 'MC_RELAY_PRODUCER_ID');
  const token = required(env.MC_RELAY_TOKEN, 'MC_RELAY_TOKEN');
  if (token.length < 32) throw new Error('MC_RELAY_TOKEN must contain at least 32 characters.');

  return {
    missionControl: {
      url: missionControlUrl,
      producerId,
      token,
      requestTimeoutMs: integer(env.MC_RELAY_HTTP_TIMEOUT_MS, 30_000, 1_000, 120_000),
    },
    browser: {
      cdpHost: env.MC_RELAY_CDP_HOST ?? '127.0.0.1',
      cdpPort: integer(env.MC_RELAY_CDP_PORT, 9222, 1, 65_535),
      profileDir,
      pageReadyTimeoutMs: integer(env.MC_RELAY_PAGE_READY_TIMEOUT_MS, 90_000, 5_000, 300_000),
      submitTimeoutMs: integer(env.MC_RELAY_SUBMIT_TIMEOUT_MS, 30_000, 5_000, 120_000),
    },
    runtime: {
      chats,
      chatsFile,
      submitEnabled: env.MC_RELAY_SUBMIT_ENABLED === '1',
      pollIntervalMs: integer(env.MC_RELAY_POLL_INTERVAL_MS, 15_000, 2_000, 300_000),
      retryDelayMs: integer(env.MC_RELAY_RETRY_DELAY_MS, 300_000, 30_000, 86_400_000),
      maxHotTabs: integer(env.MC_RELAY_MAX_HOT_TABS, 3, 1, 12),
      stateFile: resolve(expandHome(env.MC_RELAY_STATE_FILE ?? `${stateDir}/state.json`, home)),
      statusFile: resolve(expandHome(env.MC_RELAY_STATUS_FILE ?? `${stateDir}/status.json`, home)),
      lockFile: resolve(expandHome(env.MC_RELAY_LOCK_FILE ?? `${stateDir}/relay.lock`, home)),
    },
    memory: {
      softAvailableMb: integer(env.MC_RELAY_MEMORY_SOFT_AVAILABLE_MB, 4096, 512, 65_536),
      hardAvailableMb: integer(env.MC_RELAY_MEMORY_HARD_AVAILABLE_MB, 2048, 256, 65_536),
      softBrowserRssMb: integer(env.MC_RELAY_BROWSER_SOFT_RSS_MB, 7168, 512, 65_536),
      hardBrowserRssMb: integer(env.MC_RELAY_BROWSER_HARD_RSS_MB, 9216, 1024, 65_536),
      softSwapUsedMb: integer(env.MC_RELAY_SWAP_SOFT_USED_MB, 512, 0, 65_536),
      hardSwapUsedMb: integer(env.MC_RELAY_SWAP_HARD_USED_MB, 1536, 0, 65_536),
    },
  };
}

export function publicConfig(config) {
  return {
    missionControlUrl: config.missionControl.url,
    producerId: config.missionControl.producerId,
    cdpEndpoint: `http://${config.browser.cdpHost}:${config.browser.cdpPort}`,
    profileDir: config.browser.profileDir,
    chatsFile: config.runtime.chatsFile,
    chatCount: config.runtime.chats.length,
    submitEnabled: config.runtime.submitEnabled,
    pollIntervalMs: config.runtime.pollIntervalMs,
    maxHotTabs: config.runtime.maxHotTabs,
    memory: config.memory,
    stateFile: config.runtime.stateFile,
    statusFile: config.runtime.statusFile,
  };
}

function required(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required.`);
  return value;
}

function integer(value, fallback, minimum, maximum) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Invalid integer ${value}; expected ${minimum}-${maximum}.`);
  }
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
