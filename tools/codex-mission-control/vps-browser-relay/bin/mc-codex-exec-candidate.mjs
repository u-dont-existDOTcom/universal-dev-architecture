#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadCodexExecCandidateConfig } from '../src/config.mjs';
import {
  classifyCodexExecutionRoute,
  codexDirectiveArtifactSha256,
} from '../src/codex-exec-candidate.mjs';

const args = process.argv.slice(2);
const operation = args.shift();
const index = args.indexOf('--directive');
const directivePath = index === -1 ? null : args[index + 1] ?? null;
if (operation !== 'diagnose' || !directivePath) {
  throw new Error('Usage: mc-codex-exec-candidate.mjs diagnose --directive <directive.json>');
}
const directive = JSON.parse(await readFile(resolve(directivePath), 'utf8'));
const config = loadCodexExecCandidateConfig(process.env);
process.stdout.write(`${JSON.stringify({
  diagnosticOnly: true,
  route: classifyCodexExecutionRoute(directive, config),
  directiveArtifactSha256: codexDirectiveArtifactSha256(directive),
  executionAttempted: false,
}, null, 2)}\n`);
