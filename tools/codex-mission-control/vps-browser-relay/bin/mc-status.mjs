#!/usr/bin/env node
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createStatusServer } from '../src/mc-status.mjs';

const home = homedir();
const stateDir = resolve(
  (process.env.MC_RELAY_STATE_DIR ?? `${home}/.local/state/mission-control-chatgpt-relay`)
    .replace(/^~(?=\/)/, home),
);
const port = Number.parseInt(process.env.MC_STATUS_PORT ?? '8787', 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('MC_STATUS_PORT must be a valid TCP port.');
}
createStatusServer({ stateDir, port });
console.log(`Mission Control status listening on http://127.0.0.1:${port}`);
