#!/usr/bin/env node
import { loadJournalClaudeConfig } from '../src/config.mjs';
import { JournalClaudeWorker } from '../src/journal-claude-worker.mjs';

try {
  const worker = new JournalClaudeWorker({ config: loadJournalClaudeConfig() });
  console.log(JSON.stringify(await worker.runPass()));
} catch {
  console.error(JSON.stringify({ status: 'JOURNAL_CLAUDE_FAILED' }));
  process.exitCode = 1;
}
