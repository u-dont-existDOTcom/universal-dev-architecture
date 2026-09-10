#!/usr/bin/env node
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

import { parseChatDirectory } from '../src/core.mjs';
import { CentralSubmissionScheduler, SchedulerStateStore, startSubmissionSchedulerService } from '../src/submission-scheduler-service.mjs';

try {
  const home = homedir();
  const configDir = resolve(expandHome(process.env.MC_RELAY_CONFIG_DIR ?? `${home}/.config/mission-control-chatgpt-relay`, home));
  const stateDir = resolve(expandHome(process.env.MC_RELAY_STATE_DIR ?? `${home}/.local/state/mission-control-chatgpt-relay`, home));
  const chatsFile = resolve(expandHome(process.env.MC_RELAY_CHATS_FILE ?? `${configDir}/chats.json`, home));
  const leaseFile = resolve(expandHome(required(process.env.MC_SCHEDULER_ACTIVE_LEASE_FILE, 'MC_SCHEDULER_ACTIVE_LEASE_FILE'), home));
  const stateFile = resolve(expandHome(process.env.MC_SCHEDULER_STATE_FILE ?? `${stateDir}/submission-scheduler.json`, home));
  const token = required(process.env.MC_RELAY_SCHEDULER_TOKEN, 'MC_RELAY_SCHEDULER_TOKEN');
  if (token.length < 32) throw new Error('MC_RELAY_SCHEDULER_TOKEN must contain at least 32 characters.');
  const stateStore = new SchedulerStateStore({ stateFile });
  const scheduler = new CentralSubmissionScheduler({
    stateStore,
    chats: parseChatDirectory(JSON.parse(await readFile(chatsFile, 'utf8'))),
    minIntervalMs: integer(process.env.MC_SCHEDULER_MIN_SUBMISSION_INTERVAL_MS, 60_000, 60_000, 600_000),
    admissionTtlMs: integer(process.env.MC_SCHEDULER_ADMISSION_TTL_MS, 120_000, 30_000, 600_000),
  });
  const schedulerHost = process.env.MC_SCHEDULER_HOST ?? '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(schedulerHost)) {
    throw new Error('MC_SCHEDULER_HOST must remain loopback-only.');
  }
  const config = {
    host: schedulerHost,
    port: integer(process.env.MC_SCHEDULER_PORT, 4300, 1, 65_535),
    token,
    lease: JSON.parse(await readFile(leaseFile, 'utf8')),
  };
  const server = await startSubmissionSchedulerService({ config, scheduler, stateStore });
  console.log(JSON.stringify({ status: 'SUBMISSION_SCHEDULER_LISTENING', host: config.host, port: config.port }));
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      server.close(async () => {
        await stateStore.releaseLock();
        process.exit(0);
      });
      server.closeAllConnections();
    });
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'FATAL', time: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
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

function expandHome(value, home) {
  return value === '~' ? home : value.startsWith('~/') ? `${home}/${value.slice(2)}` : value;
}
