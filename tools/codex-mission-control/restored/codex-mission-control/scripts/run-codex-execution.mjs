#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  loadCodexExecCandidateConfig,
  loadCodexExecMissionControlConfig,
} from '../../../vps-browser-relay/src/config.mjs';
import { MissionControlClient } from '../../../vps-browser-relay/src/mission-control.mjs';
import {
  CODEX_ATTEMPT_STATUSES,
  CODEX_EXECUTION_ROUTES,
  classifyCodexExecutionRoute,
  dispatchMissionControlExecution,
} from '../../../vps-browser-relay/src/codex-exec-candidate.mjs';

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
};
const directivePath = value('--directive');
if (!directivePath) {
  throw new Error('Usage: run-codex-execution.mjs --directive <directive.json> [--admission <admission.json> --worker <worker> --setter-evidence-id <id>]');
}
const directive = JSON.parse(await readFile(resolve(directivePath), 'utf8'));
const config = loadCodexExecCandidateConfig(process.env);
const route = classifyCodexExecutionRoute(directive, config);
let missionControl = null;
let admissionInput = null;
let worker = value('--worker');
const setterEvidenceId = value('--setter-evidence-id');
if (route !== CODEX_EXECUTION_ROUTES.LEGACY_BROWSER) {
  const admissionPath = value('--admission');
  if (!admissionPath || !setterEvidenceId) {
    throw new Error('Codex dispatch requires --admission and --setter-evidence-id for live Mission Control authorization.');
  }
  const missionControlConfig = loadCodexExecMissionControlConfig({
    ...process.env,
    ...(worker ? { MC_CODEX_EXEC_WORKER_ID: worker } : {}),
  });
  worker = missionControlConfig.workerId;
  admissionInput = JSON.parse(await readFile(resolve(admissionPath), 'utf8'));
  missionControl = new MissionControlClient({
    url: missionControlConfig.url,
    producerId: missionControlConfig.producerId,
    token: missionControlConfig.token,
    workerIds: [worker],
    requestTimeoutMs: missionControlConfig.requestTimeoutMs,
  });
}

const result = await dispatchMissionControlExecution({
  worker,
  admissionInput,
  setterEvidenceId,
  directive,
  config,
  missionControl,
  legacyBrowserHandler: runActualLegacyBrowserDispatch,
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result?.status && result.status !== CODEX_ATTEMPT_STATUSES.COMPLETED) process.exitCode = 1;

async function runActualLegacyBrowserDispatch() {
  const relayCli = fileURLToPath(new URL('../../../vps-browser-relay/bin/mc-chatgpt-relay.mjs', import.meta.url));
  const outcome = await capture(process.execPath, [relayCli, 'once']);
  if (outcome.exitCode !== 0) {
    throw new Error(`Existing Mission Control browser dispatch failed with exit ${outcome.exitCode}: ${outcome.stderr.slice(0, 1000)}`);
  }
  try { return JSON.parse(outcome.stdout); }
  catch { throw new Error('Existing Mission Control browser dispatch returned malformed JSON.'); }
}

async function capture(command, commandArgs) {
  const child = spawn(command, commandArgs, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('close', resolvePromise);
  });
  return { exitCode, stdout, stderr };
}
