import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline self-test of the one-command live acceptance harness. No inference: a fake CLI
// stands in for Claude Code. Skips when the Mission Control app dependencies are absent.
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../../restored/codex-mission-control');
const TSX = join(APP, 'node_modules/.bin/tsx');
const HARNESS = resolve(HERE, '../acceptance/live-acceptance.ts');
const FAKE = resolve(HERE, '../acceptance/fake-claude.mjs');
const skip = existsSync(TSX) ? false : 'Mission Control app dependencies are not installed';

async function runHarness(extraEnv = {}, extraArgs = []) {
  const scratch = await mkdtemp(join(tmpdir(), 'claude-acceptance-selftest-'));
  const out = join(scratch, 'out');
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? scratch,
    FAKE_CLAUDE_STATE_DIR: join(scratch, 'state'), ...extraEnv };
  const run = spawnSync(TSX, [HARNESS, '--claude-binary', FAKE, '--out', out, ...extraArgs],
    { cwd: APP, env, encoding: 'utf8', timeout: 120_000 });
  const receiptText = existsSync(join(out, 'acceptance-receipt.json')) ? await readFile(join(out, 'acceptance-receipt.json'), 'utf8') : null;
  const eventsText = existsSync(join(out, 'mission-control-events.json')) ? await readFile(join(out, 'mission-control-events.json'), 'utf8') : null;
  return { run, receipt: receiptText && JSON.parse(receiptText), receiptText, eventsText };
}

test('harness accepts a well-behaved CLI through the real admission, preflight and receipt path', { skip }, async () => {
  const { run, receipt, receiptText, eventsText } = await runHarness();
  assert.equal(run.status, 0, run.stderr);
  assert.equal(receipt.verdict, 'ACCEPTED');
  for (const [name, check] of Object.entries(receipt.checks)) assert.equal(check.status, 'PASS', name);
  assert.equal(receipt.runs.A.providerSessionId, receipt.runs.B.providerSessionId);
  assert.equal(receipt.runs.B.directive.revision, 2);
  assert.equal(receipt.runs.C.status, 'INTERRUPTED');
  for (const secret of ['PRIVATE_ASSISTANT_TEXT', 'PRIVATE_REPORT_SUMMARY', 'SECRET_TOOL_RESULT', 'SECRET_THINKING', 'nonce-', 'ACCEPTANCE_RUN']) {
    assert.ok(!receiptText.includes(secret), `receipt leaked ${secret}`);
    assert.ok(!eventsText.includes(secret), `events leaked ${secret}`);
  }
});

test('harness classifies a provider-override host as a preflight failure, not a model result', { skip }, async () => {
  const { run, receipt } = await runHarness({ ANTHROPIC_BASE_URL: 'https://example.invalid' });
  assert.equal(run.status, 1);
  assert.equal(receipt.verdict, 'NOT_ACCEPTED');
  assert.equal(receipt.checks.hostAndBinding.classification, 'HOST_PREFLIGHT');
  assert.match(receipt.checks.hostAndBinding.detail, /CLAUDE_PROVIDER_OVERRIDE_PRESENT/);
  assert.equal(receipt.checks.resume.status, 'NOT_EXERCISED');
  assert.equal(receipt.runs.C.failure.stage, 'HOST_PREFLIGHT');
});

test('a missing exact MCP tool is classified as connector/auth, not model quality', { skip }, async () => {
  const { receipt } = await runHarness({}, ['--mcp-tool', 'mcp__claude_ai_Absent__tool']);
  assert.equal(receipt.checks.mcpExactTool.status, 'FAIL');
  assert.equal(receipt.checks.mcpExactTool.classification, 'CONNECTOR_OR_AUTH_NOT_MODEL');
  assert.ok(receipt.runs.A.visibleMcpToolNames.includes('mcp__claude_ai_Railway__whoami'));
  assert.equal(receipt.checks.approvedRead.status, 'PASS');
});
