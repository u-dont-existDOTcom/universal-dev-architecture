#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { loadConfig, publicConfig } from '../src/config.mjs';
import { ChromeDevtoolsBrowser } from '../src/cdp.mjs';
import { installAutomationOwnedBrowser } from '../src/automation-owned-browser.mjs';
import { installStuckRecovery } from '../src/stuck-recovery.mjs';
import { MissionControlClient } from '../src/mission-control.mjs';
import { RelayRuntime } from '../src/relay.mjs';
import { StateStore } from '../src/state.mjs';
import { oneShotExitCode } from '../src/core.mjs';
import { GlobalSubmissionPacer } from '../src/submission-pacing.mjs';
import { ControllerMediatedPmRuntime } from '../src/controller-mediated-pm.mjs';

const command = process.argv[2] ?? 'run';

try {
  const config = await loadConfig();
  const stateStore = new StateStore({ stateFile: config.runtime.stateFile, statusFile: config.runtime.statusFile, lockFile: config.runtime.lockFile });

  if (command === 'status') {
    const raw = await readFile(config.runtime.statusFile, 'utf8').catch((error) => {
      if (error?.code === 'ENOENT') return JSON.stringify({ status: 'NO_STATUS', config: publicConfig(config) });
      throw error;
    });
    process.stdout.write(raw.endsWith('\n') ? raw : `${raw}\n`);
    process.exit(0);
  }

  const missionControl = new MissionControlClient(config.missionControl);
  const cdpBrowser = new ChromeDevtoolsBrowser(config.browser);
  const rawBrowser = installAutomationOwnedBrowser(cdpBrowser, {
    ownershipFile: `${config.runtime.stateFile}.browser-ownership.json`,
    cdpHost: config.browser.cdpHost,
    cdpPort: config.browser.cdpPort,
  });
  const submissionPacer = new GlobalSubmissionPacer({
    stateStore,
    minIntervalMs: config.runtime.minSubmissionIntervalMs,
  });
  const browser = installStuckRecovery(rawBrowser, {
    maxNudges: config.runtime.stuckRecoveryMaxNudges,
    submitMessage: (target, input) => submissionPacer.submit({ submit: () => rawBrowser.submitExactMessage(target, input) }),
    beforeRecoverySend: () => submissionPacer.assertReady(),
  });
  const runtime = new RelayRuntime({ config, missionControl, browser, stateStore, submissionPacer });
  const controller = new ControllerMediatedPmRuntime({ config, missionControl, browser, stateStore, submissionPacer });
  await stateStore.acquireLock();
  installSignalHandlers(stateStore);

  if (command === 'doctor') {
    print({ config: publicConfig(config), ...(await runtime.doctor()) });
  } else if (command === 'mcp-preflight') {
    const chatId = process.argv[3];
    if (!chatId) throw new Error('Usage: mc-chatgpt-relay mcp-preflight <registered-chat-id>');
    const result = await runtime.verifyMcpReadPreflight(chatId);
    print(result);
    process.exitCode = oneShotExitCode(result);
  } else if (command === 'capabilities') {
    const chatId = process.argv[3];
    if (!chatId) throw new Error('Usage: mc-chatgpt-relay capabilities <registered-chat-id>');
    const result = await runtime.verifyCapabilities(chatId);
    print(result);
    process.exitCode = oneShotExitCode(result);
  } else if (command === 'once') {
    const result = await runtime.cycle();
    print(result);
    process.exitCode = oneShotExitCode(result);
  } else if (command === 'run') {
    for (;;) {
      const result = await runtime.cycle();
      print(result);
      await sleep(config.runtime.pollIntervalMs);
    }
  } else if (command === 'controller-init') {
    const specFile = process.argv[3];
    if (!specFile) throw new Error('Usage: mc-chatgpt-relay controller-init <exact-cycle-spec.json>');
    const spec = JSON.parse(await readFile(specFile, 'utf8'));
    print(await controller.initialize(spec));
  } else if (command === 'controller-once') {
    const cycleId = process.argv[3];
    if (!cycleId) throw new Error('Usage: mc-chatgpt-relay controller-once <cycle-id>');
    const result = await controller.cycle(cycleId);
    print(result);
    process.exitCode = result.status === 'CONTROLLER_CYCLE_ERROR' || result.status.endsWith('_AMBIGUOUS_NO_REPLAY') ? 1 : oneShotExitCode(result);
  } else if (command === 'controller-run') {
    const cycleId = process.argv[3];
    if (!cycleId) throw new Error('Usage: mc-chatgpt-relay controller-run <cycle-id>');
    for (;;) {
      const result = await controller.cycle(cycleId);
      print(result);
      if (result.status === 'CONTROLLER_CYCLE_COMPLETE') break;
      if (result.status === 'CONTROLLER_CYCLE_ERROR' || result.status.endsWith('_AMBIGUOUS_NO_REPLAY')
        || result.status === 'CONTROLLER_SEND_DISABLED') {
        process.exitCode = result.status === 'CONTROLLER_SEND_DISABLED' ? 0 : 1;
        break;
      }
      await sleep(config.runtime.pollIntervalMs);
    }
  } else if (command === 'resolve') {
    const routeKey = process.argv[3];
    const outcome = process.argv[4];
    if (!routeKey || !outcome) throw new Error('Usage: mc-chatgpt-relay resolve <route-key> <retry|submitted|discard>');
    print(await runtime.resolve(routeKey, outcome));
  } else {
    throw new Error('Usage: mc-chatgpt-relay <doctor|mcp-preflight|capabilities|once|run|controller-init|controller-once|controller-run|status|resolve>');
  }

  await stateStore.releaseLock();
} catch (error) {
  console.error(JSON.stringify({ status: 'FATAL', time: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}

function installSignalHandlers(stateStore) {
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      await stateStore.releaseLock();
      process.exit(0);
    });
  }
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
