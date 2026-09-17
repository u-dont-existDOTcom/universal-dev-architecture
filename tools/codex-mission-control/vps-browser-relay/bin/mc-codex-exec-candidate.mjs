#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadCodexExecCandidateConfig } from '../src/config.mjs';
import {
  CODEX_ATTEMPT_STATUSES,
  executeMissionControlCandidate,
} from '../src/codex-exec-candidate.mjs';

async function main() {
  const [operation, directiveFlag, directiveValue] = process.argv.slice(2);
  if (operation !== 'run' || directiveFlag !== '--directive' || !directiveValue) {
    throw new Error('Usage: mc-codex-exec-candidate.mjs run --directive <directive.json>');
  }
  const directive = JSON.parse(await readFile(resolve(directiveValue), 'utf8'));
  const config = loadCodexExecCandidateConfig(process.env);
  const result = await executeMissionControlCandidate({
    directive,
    config,
    legacyBrowserHandler: async (value, routing) => ({
      schemaVersion: 1,
      route: routing.route,
      reason: routing.reason,
      status: 'DELEGATED_TO_EXISTING_LEGACY_BROWSER_HANDLER',
      jobId: value?.jobId ?? null,
      sourceDirective: value?.sourceDirective ?? null,
    }),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result?.status && result.status !== CODEX_ATTEMPT_STATUSES.COMPLETED
    && result.status !== 'DELEGATED_TO_EXISTING_LEGACY_BROWSER_HANDLER') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`candidate failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
