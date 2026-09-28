import assert from 'node:assert/strict';
import test from 'node:test';
import { access, chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JournalClaudeWorker, buildUsageSummary, runClaude } from '../src/journal-claude-worker.mjs';
import { loadJournalClaudeConfig } from '../src/config.mjs';
import { runJournalImport } from '../src/journal-work-runner.mjs';
import { renderStatusPage } from '../src/mc-status.mjs';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const SENTINEL = 'PRIVATE-PACKET-AND-CLAUDE-RESULT-SENTINEL';
const record = (answered = false, expiresAt = '2026-09-28T14:00:00Z') => ({ work_id: 'hard-1', role: 'synthesizer', output_schema_id: 'answer', model: 'Claude', effort: 'max', tier: 'hardest', issued_at: '2026-09-28T10:00:00Z', expires_at: expiresAt, answered });

test('happy path runs fake Claude with the exact argument list and imports', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: 2, result: { result: SENTINEL, duration_ms: 7, num_turns: 2, total_cost_usd: 0.4, usage: { input_tokens: 3, output_tokens: 4 } } });
  const result = await fixture.worker.runPass();
  assert.equal(result.status, 'ANSWERED'); assert.equal(fixture.imports(), 1);
  const args = JSON.parse(await readFile(fixture.argsFile, 'utf8'));
  assert.deepEqual(args, ['-p', 'Private InnerSignal journal work item hard-1. Call get_journal_work_packet with this work_id, follow its instruction using only its packet, then submit your JSON answer with submit_journal_work_result. If it lists schema problems, fix them and submit again. Reply only: done.', '--model', 'opus', '--effort', 'max', '--output-format', 'json', '--mcp-config', fixture.config.mcpConfigFile, '--strict-mcp-config', '--tools', '', '--allowedTools', 'mcp__journal__get_journal_work_packet', 'mcp__journal__submit_journal_work_result', '--permission-mode', 'dontAsk', '--no-session-persistence']);
  assert.equal((await stat(fixture.config.mcpConfigFile)).mode & 0o777, 0o600);
  await fixture.assertContentFree();
});

test('Claude output never counts as done without answered listing; second run becomes unanswered', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: Infinity, result: { result: 'done' } });
  assert.equal((await fixture.worker.runPass()).status, 'UNANSWERED');
  assert.equal(fixture.claudeRuns(), 2); assert.equal(fixture.imports(), 0);
  const lines = (await readFile(fixture.config.usageFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines.map((line) => line.outcome), ['unanswered', 'unanswered']);
});

test('timeout kills the entire detached process group', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'claude-timeout-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const script = join(dir, 'hang.cjs'); const pidFile = join(dir, 'pid');
  await writeFile(script, `#!/usr/bin/env node\nconst {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)']);require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(c.pid));setInterval(()=>{},1000);\n`); await chmod(script, 0o700);
  const result = await runClaude(script, [], { cwd: dir, timeoutMs: 500 });
  assert.equal(result.timeout, true); const pid = Number(await readFile(pidFile, 'utf8'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const status = await readFile(`/proc/${pid}/status`, 'utf8').catch((error) => error.code === 'ENOENT' ? '' : Promise.reject(error));
  assert.ok(status === '' || /^State:\s+Z/m.test(status), `grandchild remained live: ${status.match(/^State:.*$/m)?.[0]}`);
});

test('usage limit uses an explicit reset time and suppresses later sends', async (t) => {
  const fixture = await makeFixture(t, { result: { is_error: true, result: `usage limit reached; resets 2026-09-28T14:30:00Z ${SENTINEL}` } });
  const first = await fixture.worker.runPass(); assert.equal(first.pausedUntil, '2026-09-28T14:30:00.000Z');
  const second = await fixture.worker.runPass(); assert.equal(second.status, 'LIMITED'); assert.equal(fixture.claudeRuns(), 1);
  await fixture.assertContentFree();
});

test('usage limit without a reset uses configured backoff', async (t) => {
  const fixture = await makeFixture(t, { result: { is_error: true, result: 'usage limit reached' } });
  assert.equal((await fixture.worker.runPass()).pausedUntil, '2026-09-28T13:00:00.000Z');
});

test('an answered listing imports before honoring the same run usage limit', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: 2, result: { is_error: true, result: 'usage limit reached; resets 2026-09-28T14:30:00Z' } });
  assert.equal((await fixture.worker.runPass()).status, 'ANSWERED');
  assert.equal(fixture.imports(), 1);
  assert.equal((await fixture.worker.runPass()).status, 'LIMITED');
  assert.equal(fixture.claudeRuns(), 1);
  const summary = JSON.parse(await readFile(fixture.config.summaryFile, 'utf8'));
  assert.deepEqual([summary.today_utc.items_answered, summary.today_utc.limit_events, summary.paused_until], [1, 1, '2026-09-28T14:30:00.000Z']);
});

test('Claude-triggered import persists its content-free status without replacing runner status', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: 2, importResult: { stage: 'resumed', blocker: null, completed_units: 4, residual_counts: { hardest_sent_today: 2, hardest_daily_limit: 5 } } });
  await writeFile(fixture.config.statusFile, JSON.stringify({ current: { role: 'writer', rung: 'RETRY' }, today: { answered: 3 } }));
  assert.equal((await fixture.worker.runPass()).status, 'ANSWERED');
  const status = JSON.parse(await readFile(fixture.config.statusFile, 'utf8'));
  assert.deepEqual(status.current, { role: 'writer', rung: 'RETRY' });
  assert.equal(status.today.answered, 3);
  assert.deepEqual(status.lastImport, { at: '2026-09-28T12:00:00.000Z', exitCode: 0, stage: 'resumed', blocker: null, completedUnits: 4, residualCounts: { hardest_sent_today: 2, hardest_daily_limit: 5 }, hardestSentToday: 0, hardestDailyLimit: 0 });
});

test('enabled Claude lane requires dispatch, import, and MCP commands at config load', () => {
  const complete = { MC_JOURNAL_CLAUDE_ENABLED: '1', MC_JOURNAL_DISPATCH_COMMAND: 'dispatch', MC_JOURNAL_IMPORT_COMMAND: 'import', MC_JOURNAL_WORK_MCP_COMMAND_JSON: '["node","work-server.mjs"]' };
  assert.throws(() => loadJournalClaudeConfig({ ...complete, MC_JOURNAL_DISPATCH_COMMAND: '' }), /MC_JOURNAL_DISPATCH_COMMAND is required/);
  assert.throws(() => loadJournalClaudeConfig({ ...complete, MC_JOURNAL_IMPORT_COMMAND: '' }), /MC_JOURNAL_IMPORT_COMMAND is required/);
  assert.throws(() => loadJournalClaudeConfig({ ...complete, MC_JOURNAL_WORK_MCP_COMMAND_JSON: '' }), /MC_JOURNAL_WORK_MCP_COMMAND_JSON is required/);
  assert.deepEqual(loadJournalClaudeConfig({}).workMcpCommand, []);
});

test('worker creates a new configured state directory before acquiring its lock', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: 2, stateDirReady: false });
  assert.equal((await fixture.worker.runPass()).status, 'ANSWERED');
  assert.equal((await stat(fixture.config.stateDir)).isDirectory(), true);
});

test('worker does not invoke Claude again after the selected item expires', async (t) => {
  let current = NOW;
  const fixture = await makeFixture(t, {
    now: () => current,
    onClaudeRun: () => { current = Date.parse('2026-09-28T14:00:00Z'); },
  });
  assert.equal((await fixture.worker.runPass()).status, 'EXPIRED');
  assert.equal(fixture.claudeRuns(), 1);
  assert.equal(fixture.dispatches(), 2);
  assert.equal(fixture.imports(), 0);
});

test('journal imports share one import-run lock', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'import-lock-')); t.after(() => rm(dir, { recursive: true, force: true }));
  let active = 0; let maximum = 0;
  const runner = async () => { active += 1; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 30)); active -= 1; return { exitCode: 0, stdout: '{}' }; };
  await Promise.all([runJournalImport({ command: 'import', lockFile: join(dir, 'import.lock'), commandRunner: runner }), runJournalImport({ command: 'import', lockFile: join(dir, 'import.lock'), commandRunner: runner })]);
  assert.equal(maximum, 1);
});

test('usage summary observes UTC day and rolling seven-day boundaries', () => {
  const events = [
    { at: '2026-09-28T00:01:00Z', outcome: 'answered', input_tokens: 2, cost_usd_equivalent: 0.2 },
    { at: '2026-09-27T23:59:00Z', outcome: 'limited', output_tokens: 3, cost_usd_equivalent: 0.3 },
    { at: '2026-09-21T11:59:59Z', outcome: 'answered', input_tokens: 99 },
  ];
  const summary = buildUsageSummary(events, NOW);
  assert.deepEqual([summary.today_utc.runs, summary.today_utc.items_answered, summary.last_seven_days.runs, summary.last_seven_days.limit_events], [1, 1, 2, 1]);
});

test('status page renders only allowed fields', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'mc-status-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'journal-work-status.json'), JSON.stringify({ current: { role: 'writer', rung: 'RETRY', secret: SENTINEL }, today: { answered: 1, expired: 2, waiting: 3, secret: SENTINEL }, backoff: { trigger: 'RATE', until: 'later', secret: SENTINEL }, lastImport: { stage: 'done', blocker: null, completedUnits: 4, residualCounts: { hardest_sent_today: 2, hardest_daily_limit: 5 }, secret: SENTINEL } }));
  await writeFile(join(dir, 'claude-usage-summary.json'), JSON.stringify({ today_utc: { runs: 1, items_answered: 1 }, last_seven_days: { runs: 2 }, paused_until: null, secret: SENTINEL }));
  const page = await renderStatusPage(dir); assert.match(page, /writer/); assert.match(page, /Hardest sent today/); assert.doesNotMatch(page, new RegExp(SENTINEL));
});

test('status service uses the supported installed relay paths', async () => {
  const unit = await readFile(new URL('../systemd/user/mission-control-status.service', import.meta.url), 'utf8');
  assert.match(unit, /^EnvironmentFile=%h\/\.config\/mission-control-chatgpt-relay\/env$/m);
  assert.match(unit, /^ExecStart=%h\/\.local\/share\/mission-control-chatgpt-relay\/app\/bin\/mc-status\.mjs$/m);
});

test('worker does nothing unless explicitly enabled', async (t) => {
  const fixture = await makeFixture(t, { enabled: false });
  assert.deepEqual(await fixture.worker.runPass(), { status: 'DISABLED' }); assert.equal(fixture.dispatches(), 0); assert.equal(fixture.claudeRuns(), 0);
  await assert.rejects(access(fixture.config.usageFile, constants.F_OK));
});

async function makeFixture(t, { answeredAt = Infinity, result = {}, importResult = {}, enabled = true, stateDirReady = true, expiresAt = '2026-09-28T14:00:00Z', now = () => NOW, onClaudeRun = () => {} } = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'journal-claude-test-')); t.after(() => rm(rootDir, { recursive: true, force: true }));
  const dir = stateDirReady ? rootDir : join(rootDir, 'custom', 'state');
  const argsFile = join(rootDir, 'args.json'); const fake = join(rootDir, 'claude'); const resultFile = join(rootDir, 'result.json');
  await writeFile(resultFile, JSON.stringify(result));
  await writeFile(fake, `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(argsFile)},JSON.stringify(process.argv.slice(2)));process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(resultFile)},'utf8'));\n`); await chmod(fake, 0o700);
  const config = { enabled, dispatchCommand: 'dispatch', importCommand: 'import', workMcpCommand: ['node', '/private/work-server.mjs'], claudeBin: fake, model: 'opus', effort: 'max', timeoutMs: 2_000, limitBackoffMs: 3_600_000, stateDir: dir, statusFile: join(dir, 'journal-work-status.json'), importLockFile: join(dir, 'import.lock'), workerLockFile: join(dir, 'worker.lock'), usageFile: join(dir, 'claude-usage.jsonl'), summaryFile: join(dir, 'claude-usage-summary.json'), mcpConfigFile: join(dir, 'mcp.json') };
  let dispatches = 0; let imports = 0; let claudeRuns = 0;
  const commandRunner = async (command) => { if (command === 'dispatch') { dispatches += 1; return { exitCode: 0, stdout: `${JSON.stringify(record(dispatches >= answeredAt, expiresAt))}\n` }; } imports += 1; return { exitCode: 0, stdout: JSON.stringify(importResult) }; };
  const worker = new JournalClaudeWorker({ config, commandRunner, claudeRunner: async (...args) => {
    claudeRuns += 1;
    const execution = await runClaude(...args);
    onClaudeRun();
    return execution.stdout ? execution : { ...execution, stdout: await readFile(resultFile, 'utf8') };
  }, now, logger: { log() {} } });
  return { worker, config, argsFile, imports: () => imports, dispatches: () => dispatches, claudeRuns: () => claudeRuns, assertContentFree: async () => { const content = await Promise.all([config.usageFile, config.summaryFile, config.statusFile].map((path) => readFile(path, 'utf8').catch(() => ''))); assert.doesNotMatch(content.join('\n'), new RegExp(SENTINEL)); } };
}
