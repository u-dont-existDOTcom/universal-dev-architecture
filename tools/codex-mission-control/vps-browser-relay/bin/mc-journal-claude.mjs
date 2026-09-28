#!/usr/bin/env node
import { loadJournalClaudeConfig } from '../src/config.mjs';
import { JournalClaudeWorker } from '../src/journal-claude-worker.mjs';

const config = loadJournalClaudeConfig();
const worker = new JournalClaudeWorker({ config, commandRunner: shellCommand });
const result = await worker.runPass();
console.log(JSON.stringify(result));

async function shellCommand(command) {
  const { exec } = await import('node:child_process');
  return new Promise((resolve) => exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout = '') => resolve({ exitCode: Number.isInteger(error?.code) ? error.code : 0, stdout })));
}
