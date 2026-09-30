import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { constants } from 'node:fs';
import {
  access,
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadJournalClaudeConfig } from '../src/config.mjs';
import {
  JournalClaudeWorker,
  buildUsageSummary,
  runClaude,
} from '../src/journal-claude-worker.mjs';
import { runJournalImport } from '../src/journal-work-runner.mjs';
import { renderStatusPage } from '../src/mc-status.mjs';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const SENTINEL = 'PRIVATE-PACKET-AND-CLAUDE-RESULT-SENTINEL';
const record = (answered = false, expiresAt = '2026-09-28T14:00:00Z') => ({
  work_id: 'hard-1',
  role: 'synthesizer',
  output_schema_id: 'answer',
  model: 'Claude',
  effort: 'max',
  tier: 'hardest',
  issued_at: '2026-09-28T10:00:00Z',
  expires_at: expiresAt,
  answered,
});

test('happy path runs fake Claude with the exact argument list and imports', async (t) => {
  const fixture = await makeFixture(t, {
    answeredAt: 2,
    result: {
      result: SENTINEL,
      session_id: SENTINEL,
      duration_ms: 7,
      num_turns: 2,
      total_cost_usd: 0.4,
      usage: {
        input_tokens: 3,
        output_tokens: 4,
        cache_creation_input_tokens: 5,
        cache_read_input_tokens: 6,
      },
      modelUsage: {
        opus: {
          inputTokens: 7,
          outputTokens: 8,
          cacheCreationInputTokens: 9,
          cacheReadInputTokens: 10,
        },
      },
    },
  });
  const result = await fixture.worker.runPass();
  assert.equal(result.status, 'ANSWERED');
  assert.equal(fixture.imports(), 1);
  const args = JSON.parse(await readFile(fixture.argsFile, 'utf8'));
  assert.deepEqual(args, [
    '-p',
    'Private InnerSignal journal work item hard-1. Call get_journal_work_packet with this work_id, follow its instruction using only its packet, then submit your JSON answer with submit_journal_work_result. If it lists schema problems, fix them and submit again. Reply only: done.',
    '--model',
    'opus',
    '--effort',
    'max',
    '--output-format',
    'json',
    '--mcp-config',
    fixture.config.mcpConfigFile,
    '--strict-mcp-config',
    '--tools',
    '',
    '--allowedTools',
    'mcp__journal__get_journal_work_packet',
    'mcp__journal__submit_journal_work_result',
    '--permission-mode',
    'dontAsk',
    '--no-session-persistence',
  ]);
  assert.equal((await stat(fixture.config.mcpConfigFile)).mode & 0o777, 0o600);
  assert.equal((await stat(fixture.config.usageFile)).mode & 0o777, 0o600);
  assert.deepEqual(fixture.commandTimeouts(), [
    ['dispatch', 60_000],
    ['dispatch', 60_000],
    ['import', 300_000],
  ]);
  const usage = JSON.parse((await readFile(fixture.config.usageFile, 'utf8')).trim());
  assert.deepEqual(usage.model_usage, {
    opus: {
      input_tokens: 7,
      output_tokens: 8,
      cache_creation_input_tokens: 9,
      cache_read_input_tokens: 10,
    },
  });
  await fixture.assertContentFree();
});

test('Claude output never counts as done without answered listing; second run becomes unanswered', async (t) => {
  const fixture = await makeFixture(t, {
    answeredAt: Infinity,
    result: { result: `done ${SENTINEL}`, session_id: SENTINEL },
  });
  assert.equal((await fixture.worker.runPass()).status, 'UNANSWERED');
  assert.equal(fixture.claudeRuns(), 2);
  assert.equal(fixture.imports(), 0);
  const lines = (await readFile(fixture.config.usageFile, 'utf8'))
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.deepEqual(lines.map((line) => line.outcome), ['unanswered', 'unanswered']);
  await fixture.assertContentFree();
});

test('exhausted work IDs stay suppressed until they disappear or expire', async (t) => {
  let current = NOW;
  let records = [
    record(),
    { ...record(), work_id: 'hard-2', issued_at: '2026-09-28T10:01:00Z' },
  ];
  const fixture = await makeFixture(t, {
    now: () => current,
    dispatchRecords: () => records,
  });

  assert.deepEqual(await fixture.worker.runPass(), { status: 'UNANSWERED', workId: 'hard-1' });
  assert.deepEqual(await fixture.worker.runPass(), { status: 'UNANSWERED', workId: 'hard-2' });
  assert.deepEqual(await fixture.worker.runPass(), { status: 'NO_WORK' });
  assert.equal(fixture.claudeRuns(), 4);
  assert.deepEqual(
    JSON.parse(await readFile(fixture.config.summaryFile, 'utf8')).exhausted,
    [
      { work_id: 'hard-1', expires_at: '2026-09-28T14:00:00Z' },
      { work_id: 'hard-2', expires_at: '2026-09-28T14:00:00Z' },
    ],
  );

  records = [record()];
  assert.deepEqual(await fixture.worker.runPass(), { status: 'NO_WORK' });
  assert.deepEqual(
    JSON.parse(await readFile(fixture.config.summaryFile, 'utf8')).exhausted,
    [{ work_id: 'hard-1', expires_at: '2026-09-28T14:00:00Z' }],
  );

  current = Date.parse('2026-09-28T14:00:00Z');
  records = [record(false, '2026-09-28T16:00:00Z')];
  assert.deepEqual(await fixture.worker.runPass(), { status: 'UNANSWERED', workId: 'hard-1' });
  assert.equal(fixture.claudeRuns(), 6);
  await fixture.assertContentFree();
});

test('timeout kills the entire detached process group', { skip: process.platform === 'win32' }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'claude-timeout-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const script = join(dir, 'hang.cjs');
  const pidFile = join(dir, 'pid');
  await writeFile(script, `#!/usr/bin/env node
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
setInterval(() => {}, 1000);
`);
  await chmod(script, 0o700);
  const result = await runClaude(script, [], { cwd: dir, timeoutMs: 500 });
  assert.equal(result.timeout, true);
  const pid = Number(await readFile(pidFile, 'utf8'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const status = await processStatusOrGone(pid);
  assert.ok(
    status === '' || /^State:\s+Z/m.test(status),
    `grandchild remained live: ${status.match(/^State:.*$/m)?.[0]}`,
  );
});

for (const signal of ['SIGTERM', 'SIGHUP', 'SIGUSR2']) {
  test(`worker ${signal} shutdown kills detached Claude before releasing the lock`, {
    skip: process.platform === 'win32',
  }, (t) => assertShutdownKillsClaude(t, signal));
}

async function assertShutdownKillsClaude(t, signal) {
  const dir = await mkdtemp(join(tmpdir(), 'claude-shutdown-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const pidFile = join(dir, 'pid');
  const descendantPidFile = join(dir, 'descendant-pid');
  const claude = join(dir, 'claude.cjs');
  await writeFile(claude, `const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
writeFileSync(${JSON.stringify(descendantPidFile)}, String(descendant.pid));
setInterval(() => {}, 1000);
`);
  const runner = join(dir, 'worker.mjs');
  await writeFile(runner, `import { runClaude } from ${JSON.stringify(new URL('../src/journal-claude-worker.mjs', import.meta.url).href)};
import { withFileLock } from ${JSON.stringify(new URL('../src/journal-work-runner.mjs', import.meta.url).href)};
process.once('SIGUSR2', () => process.exit(70));
await withFileLock(${JSON.stringify(join(dir, 'worker.lock'))}, () =>
  runClaude(process.execPath, [${JSON.stringify(claude)}], {
    cwd: ${JSON.stringify(dir)}, timeoutMs: 60_000,
  }));
`);
  const worker = spawn(process.execPath, [runner], { stdio: 'ignore' });
  let claudePid;
  let descendantPid;
  t.after(() => {
    if (worker.exitCode === null) worker.kill('SIGKILL');
    if (claudePid) {
      try { process.kill(-claudePid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  });
  for (let attempt = 0; attempt < 100 && (!claudePid || !descendantPid); attempt += 1) {
    claudePid = Number(await readFile(pidFile, 'utf8').catch(() => '')) || null;
    descendantPid = Number(await readFile(descendantPidFile, 'utf8').catch(() => '')) || null;
    if (!claudePid || !descendantPid) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(claudePid && descendantPid, 'Claude process group did not start');
  worker.kill(signal);
  await once(worker, 'exit');
  for (const pid of [claudePid, descendantPid]) {
    let status;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      status = await processStatusOrGone(pid);
      if (status === '' || /^State:\s+Z/m.test(status)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(
      status === '' || /^State:\s+Z/m.test(status),
      `Claude process group member ${pid} remained live: ${status.match(/^State:.*$/m)?.[0]}`,
    );
  }
}

async function processStatusOrGone(pid) {
  try {
    return await readFile(`/proc/${pid}/status`, 'utf8');
  } catch (error) {
    // procfs can return ESRCH when a process exits after open but before read.
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return '';
    throw error;
  }
}

test('usage limit uses an explicit reset time and suppresses later sends', async (t) => {
  const fixture = await makeFixture(t, {
    result: {
      is_error: true,
      result: `usage limit reached; resets 2026-09-28T14:30:00Z ${SENTINEL}`,
    },
  });
  const first = await fixture.worker.runPass();
  assert.equal(first.pausedUntil, '2026-09-28T14:30:00.000Z');
  const second = await fixture.worker.runPass();
  assert.equal(second.status, 'LIMITED');
  assert.equal(fixture.claudeRuns(), 1);
  await fixture.assertContentFree();
});

test('Claude hit-limit wording pauses the queue until its local reset time', async (t) => {
  const fixture = await makeFixture(t, {
    dispatchRecords: () => [
      record(),
      { ...record(), work_id: 'hard-2', issued_at: '2026-09-28T10:01:00Z' },
    ],
    result: { is_error: true, result: `You've hit your limit · resets 3pm ${SENTINEL}` },
  });
  const reset = new Date(NOW);
  reset.setHours(15, 0, 0, 0);
  if (reset.getTime() <= NOW) reset.setDate(reset.getDate() + 1);

  assert.deepEqual(await fixture.worker.runPass(), {
    status: 'LIMITED', pausedUntil: reset.toISOString(),
  });
  assert.deepEqual(await fixture.worker.runPass(), {
    status: 'LIMITED', pausedUntil: reset.toISOString(),
  });
  assert.equal(fixture.claudeRuns(), 1);
  const summary = JSON.parse(await readFile(fixture.config.summaryFile, 'utf8'));
  assert.equal(summary.today_utc.limit_events, 1);
  await fixture.assertContentFree();
});

test('usage limit without a reset uses configured backoff', async (t) => {
  const fixture = await makeFixture(t, {
    result: { is_error: true, result: 'usage limit reached' },
  });
  assert.equal(
    (await fixture.worker.runPass()).pausedUntil,
    '2026-09-28T13:00:00.000Z',
  );
});

test('an answered listing imports before honoring the same-run usage limit', async (t) => {
  const fixture = await makeFixture(t, {
    answeredAt: 2,
    result: {
      is_error: true,
      result: 'usage limit reached; resets 2026-09-28T14:30:00Z',
    },
  });
  assert.equal((await fixture.worker.runPass()).status, 'ANSWERED');
  assert.equal(fixture.imports(), 1);
  assert.equal((await fixture.worker.runPass()).status, 'LIMITED');
  assert.equal(fixture.claudeRuns(), 1);
  const summary = JSON.parse(await readFile(fixture.config.summaryFile, 'utf8'));
  assert.deepEqual(
    [summary.today_utc.items_answered, summary.today_utc.limit_events, summary.paused_until],
    [1, 1, '2026-09-28T14:30:00.000Z'],
  );
});

test('an answered in-flight item is reconciled after a transient listing failure', async (t) => {
  const fixture = await makeFixture(t, {
    dispatchResponses: [
      { exitCode: 0, stdout: `${JSON.stringify(record(false))}\n` },
      { exitCode: 1, stdout: '' },
      { exitCode: 0, stdout: `${JSON.stringify(record(true))}\n` },
    ],
  });

  assert.deepEqual(
    await fixture.worker.runPass(),
    { status: 'LISTING_FAILED', workId: 'hard-1' },
  );
  assert.deepEqual(
    JSON.parse(await readFile(fixture.config.summaryFile, 'utf8')).in_flight,
    { work_id: 'hard-1', attempt: 1 },
  );
  const paused = JSON.parse(await readFile(fixture.config.summaryFile, 'utf8'));
  paused.paused_until = '2026-09-28T13:00:00.000Z';
  await writeFile(fixture.config.summaryFile, JSON.stringify(paused));

  assert.deepEqual(
    await fixture.worker.runPass(),
    { status: 'ANSWERED', workId: 'hard-1' },
  );
  assert.equal(fixture.dispatches(), 3);
  assert.equal(fixture.claudeRuns(), 1);
  assert.equal(fixture.imports(), 1);
  const summary = JSON.parse(await readFile(fixture.config.summaryFile, 'utf8'));
  assert.equal(summary.in_flight, undefined);
  assert.equal(summary.pending_import, undefined);
  assert.equal(summary.today_utc.runs, 1);
  assert.equal(summary.today_utc.items_answered, 1);
  assert.equal(summary.last_seven_days.items_answered, 1);
  assert.equal(summary.paused_until, paused.paused_until);
});

test('an unreadable durable Claude summary stops before a second invocation', async (t) => {
  const fixture = await makeFixture(t);
  await writeFile(fixture.config.summaryFile, '{broken');
  await assert.rejects(() => fixture.worker.runPass(), /Invalid Claude usage summary/);
  assert.equal(fixture.claudeRuns(), 0);
  assert.equal(fixture.imports(), 0);
});

test('listing failures cannot reset the two-invocation budget for one work ID', async (t) => {
  const listed = { exitCode: 0, stdout: `${JSON.stringify(record())}\n` };
  const failed = { exitCode: 1, stdout: '' };
  const fixture = await makeFixture(t, {
    dispatchResponses: [listed, failed, listed, failed, listed, listed],
  });

  assert.deepEqual(await fixture.worker.runPass(), { status: 'LISTING_FAILED', workId: 'hard-1' });
  assert.deepEqual(
    JSON.parse(await readFile(fixture.config.summaryFile, 'utf8')).in_flight,
    { work_id: 'hard-1', attempt: 1 },
  );
  assert.deepEqual(await fixture.worker.runPass(), { status: 'LISTING_FAILED', workId: 'hard-1' });
  assert.deepEqual(
    JSON.parse(await readFile(fixture.config.summaryFile, 'utf8')).in_flight,
    { work_id: 'hard-1', attempt: 2 },
  );
  assert.deepEqual(await fixture.worker.runPass(), { status: 'NO_WORK' });
  assert.deepEqual(await fixture.worker.runPass(), { status: 'NO_WORK' });
  assert.equal(fixture.claudeRuns(), 2);
  assert.deepEqual(
    JSON.parse(await readFile(fixture.config.summaryFile, 'utf8')).exhausted,
    [{ work_id: 'hard-1', expires_at: '2026-09-28T14:00:00Z' }],
  );
  await fixture.assertContentFree();
});

test('Claude-triggered import uses independently owned state that survives later runner status writes', async (t) => {
  const fixture = await makeFixture(t, {
    answeredAt: 2,
    importResult: {
      stage: 'resumed',
      blocker: null,
      completed_units: 4,
      residuals: { hardest_sent_today: 2, hardest_daily_limit: 5 },
    },
  });
  const runnerStatus = {
    current: { role: 'writer', rung: 'RETRY' },
    today: { answered: 3 },
  };
  await writeFile(fixture.config.statusFile, JSON.stringify(runnerStatus));
  assert.equal((await fixture.worker.runPass()).status, 'ANSWERED');
  const status = JSON.parse(await readFile(fixture.config.statusFile, 'utf8'));
  assert.deepEqual(status, runnerStatus);
  const summary = JSON.parse(await readFile(fixture.config.summaryFile, 'utf8'));
  assert.deepEqual(summary.last_import, {
    at: '2026-09-28T12:00:00.000Z',
    exitCode: 0,
    stage: 'resumed',
    blocker: null,
    completedUnits: 4,
    residuals: { hardest_sent_today: 2, hardest_daily_limit: 5 },
  });

  await writeFile(fixture.config.statusFile, JSON.stringify({
    current: { role: 'reviewer', rung: 'CONTINUE' },
    today: { answered: 4 },
  }));
  const page = await renderStatusPage(fixture.config.stateDir);
  assert.match(page, /resumed/);
  assert.match(page, /Hardest sent today<\/dt><dd>2/);
});

test('failed Claude imports remain pending and retry before listing new work', async (t) => {
  const fixture = await makeFixture(t, {
    answeredAt: 2,
    result: {
      is_error: true,
      result: 'usage limit reached; resets 2026-09-28T14:30:00Z',
    },
    importResponses: [
      { exitCode: 1, stdout: JSON.stringify({ stage: 'blocked', blocker: 'temporary' }) },
      { exitCode: 0, stdout: JSON.stringify({ stage: 'complete', completed_units: 1 }) },
    ],
  });

  assert.equal((await fixture.worker.runPass()).status, 'IMPORT_FAILED');
  assert.deepEqual(
    JSON.parse(await readFile(fixture.config.summaryFile, 'utf8')).pending_import,
    { work_id: 'hard-1' },
  );
  assert.equal(
    JSON.parse(await readFile(fixture.config.summaryFile, 'utf8')).paused_until,
    '2026-09-28T14:30:00.000Z',
  );
  assert.equal((await fixture.worker.runPass()).status, 'ANSWERED');
  assert.equal(fixture.imports(), 2);
  assert.equal(fixture.dispatches(), 2);
  assert.equal(fixture.claudeRuns(), 1);
  assert.equal(
    JSON.parse(await readFile(fixture.config.summaryFile, 'utf8')).pending_import,
    undefined,
  );
});

test('enabled Claude lane requires dispatch, import, and MCP commands at config load', () => {
  const complete = {
    MC_JOURNAL_CLAUDE_ENABLED: '1',
    MC_JOURNAL_DISPATCH_COMMAND: 'dispatch',
    MC_JOURNAL_IMPORT_COMMAND: 'import',
    MC_JOURNAL_WORK_MCP_COMMAND_JSON: '["node","work-server.mjs"]',
  };
  assert.throws(
    () => loadJournalClaudeConfig({ ...complete, MC_JOURNAL_DISPATCH_COMMAND: '' }),
    /MC_JOURNAL_DISPATCH_COMMAND is required/,
  );
  assert.throws(
    () => loadJournalClaudeConfig({ ...complete, MC_JOURNAL_IMPORT_COMMAND: '' }),
    /MC_JOURNAL_IMPORT_COMMAND is required/,
  );
  assert.throws(
    () => loadJournalClaudeConfig({ ...complete, MC_JOURNAL_WORK_MCP_COMMAND_JSON: '' }),
    /MC_JOURNAL_WORK_MCP_COMMAND_JSON is required/,
  );
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
  const dir = await mkdtemp(join(tmpdir(), 'import-lock-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let active = 0;
  let maximum = 0;
  const runner = async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 30));
    active -= 1;
    return { exitCode: 0, stdout: '{}' };
  };
  const options = {
    command: 'import',
    timeoutMs: 1_000,
    lockFile: join(dir, 'import.lock'),
    commandRunner: runner,
  };
  await Promise.all([runJournalImport(options), runJournalImport(options)]);
  assert.equal(maximum, 1);
});

test('usage summary observes UTC day and rolling seven-day boundaries', () => {
  const events = [
    {
      at: '2026-09-28T00:01:00Z',
      outcome: 'answered',
      input_tokens: 2,
      cost_usd_equivalent: 0.2,
    },
    {
      at: '2026-09-27T23:59:00Z',
      outcome: 'limited',
      output_tokens: 3,
      cost_usd_equivalent: 0.3,
    },
    { at: '2026-09-21T11:59:59Z', outcome: 'answered', input_tokens: 99 },
  ];
  const summary = buildUsageSummary(events, NOW);
  assert.deepEqual(
    [
      summary.today_utc.runs,
      summary.today_utc.items_answered,
      summary.last_seven_days.runs,
      summary.last_seven_days.limit_events,
    ],
    [1, 1, 2, 1],
  );
});

test('status page renders only the listed fields', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'mc-status-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'journal-work-status.json'), JSON.stringify({
    current: { role: 'writer', rung: 'RETRY', secret: SENTINEL },
    today: { answered: 1, expired: 2, waiting: 3, secret: SENTINEL },
    backoff: { trigger: 'RATE', until: 'later', secret: SENTINEL },
    lastImport: {
      stage: 'done',
      blocker: null,
      completedUnits: 4,
      residuals: {
        hardest_sent_today: 2,
        hardest_daily_limit: 5,
        secret: SENTINEL,
      },
      secret: SENTINEL,
    },
    secret: SENTINEL,
  }));
  await writeFile(join(dir, 'claude-usage-summary.json'), JSON.stringify({
    today_utc: { runs: 1, items_answered: 1 },
    last_seven_days: { runs: 2 },
    paused_until: null,
    secret: SENTINEL,
  }));
  const page = await renderStatusPage(dir);
  assert.match(page, /writer/);
  assert.match(page, /Hardest sent today/);
  assert.doesNotMatch(page, new RegExp(SENTINEL));
});

test('status page rebuilds time-windowed Claude metrics from the usage log', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'mc-status-window-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'claude-usage.jsonl'), [
    JSON.stringify({
      at: '2026-09-28T11:59:59Z',
      outcome: 'limited',
      resume_at: '2026-09-28T14:30:00Z',
    }),
    JSON.stringify({
      at: '2026-10-04T11:00:00Z',
      outcome: 'unanswered',
      input_tokens: 3,
    }),
    '',
  ].join('\n'));
  await writeFile(join(dir, 'claude-usage-summary.json'), JSON.stringify({
    today_utc: { runs: 7 },
    last_seven_days: { runs: 8 },
    paused_until: '2026-09-28T14:30:00.000Z',
  }));

  const page = await renderStatusPage(
    dir,
    () => Date.parse('2026-10-05T12:00:00Z'),
  );
  assert.match(page, /Runs today \(UTC\)<\/dt><dd>0/);
  assert.match(page, /Runs, last seven days<\/dt><dd>1/);
  assert.match(page, /Tokens, last seven days<\/dt><dd>3/);
  assert.match(page, /Sending paused until<\/dt><dd>—/);
  assert.doesNotMatch(page, /2026-09-28T14:30:00\.000Z/);
});

test('status service uses the supported installed relay paths', async () => {
  const unit = await readFile(
    new URL('../systemd/user/mission-control-status.service', import.meta.url),
    'utf8',
  );
  assert.match(unit, /^EnvironmentFile=%h\/\.config\/mission-control-chatgpt-relay\/env$/m);
  assert.match(
    unit,
    /^ExecStart=%h\/\.local\/share\/mission-control-chatgpt-relay\/app\/bin\/mc-status\.mjs$/m,
  );
});

test('worker does nothing unless explicitly enabled', async (t) => {
  const fixture = await makeFixture(t, { enabled: false });
  assert.deepEqual(await fixture.worker.runPass(), { status: 'DISABLED' });
  assert.equal(fixture.dispatches(), 0);
  assert.equal(fixture.claudeRuns(), 0);
  await assert.rejects(access(fixture.config.usageFile, constants.F_OK));
  await assert.rejects(access(fixture.config.workerLockFile, constants.F_OK));
});

async function makeFixture(t, {
  answeredAt = Infinity,
  dispatchResponses = null,
  dispatchRecords = null,
  result = {},
  importResult = {},
  importResponses = null,
  enabled = true,
  stateDirReady = true,
  expiresAt = '2026-09-28T14:00:00Z',
  now = () => NOW,
  onClaudeRun = () => {},
} = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'journal-claude-test-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const dir = stateDirReady ? rootDir : join(rootDir, 'custom', 'state');
  const argsFile = join(rootDir, 'args.json');
  const fake = join(rootDir, 'claude');
  const resultFile = join(rootDir, 'result.json');
  await writeFile(resultFile, JSON.stringify(result));
  await writeFile(fake, `#!/usr/bin/env node
require('node:fs').writeFileSync(
  ${JSON.stringify(argsFile)},
  JSON.stringify(process.argv.slice(2)),
);
process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(resultFile)}, 'utf8'));
`);
  await chmod(fake, 0o700);
  const config = {
    enabled,
    dispatchCommand: 'dispatch',
    importCommand: 'import',
    workMcpCommand: ['node', '/private/work-server.mjs'],
    claudeBin: fake,
    model: 'opus',
    effort: 'max',
    dispatchTimeoutMs: 60_000,
    importTimeoutMs: 300_000,
    timeoutMs: 2_000,
    limitBackoffMs: 3_600_000,
    stateDir: dir,
    statusFile: join(dir, 'journal-work-status.json'),
    importLockFile: join(dir, 'import.lock'),
    workerLockFile: join(dir, 'worker.lock'),
    usageFile: join(dir, 'claude-usage.jsonl'),
    summaryFile: join(dir, 'claude-usage-summary.json'),
    mcpConfigFile: join(dir, 'mcp.json'),
  };
  let dispatches = 0;
  let imports = 0;
  let claudeRuns = 0;
  const commandTimeouts = [];
  const commandRunner = async (command, timeoutMs) => {
    commandTimeouts.push([command, timeoutMs]);
    if (command === 'dispatch') {
      dispatches += 1;
      if (dispatchResponses) return dispatchResponses[dispatches - 1];
      return {
        exitCode: 0,
        stdout: `${(dispatchRecords?.() ?? [record(dispatches >= answeredAt, expiresAt)])
          .map((entry) => JSON.stringify(entry)).join('\n')}\n`,
      };
    }
    imports += 1;
    if (importResponses) return importResponses[imports - 1];
    return { exitCode: 0, stdout: JSON.stringify(importResult) };
  };
  const logs = [];
  const worker = new JournalClaudeWorker({
    config,
    commandRunner,
    claudeRunner: async (...args) => {
      claudeRuns += 1;
      const execution = await runClaude(...args);
      onClaudeRun();
      return execution.stdout
        ? execution
        : { ...execution, stdout: await readFile(resultFile, 'utf8') };
    },
    now,
    logger: { log: (value) => logs.push(value) },
  });
  return {
    worker,
    config,
    argsFile,
    imports: () => imports,
    dispatches: () => dispatches,
    claudeRuns: () => claudeRuns,
    commandTimeouts: () => commandTimeouts,
    assertContentFree: async () => {
      const content = await Promise.all([
        config.usageFile,
        config.summaryFile,
        config.statusFile,
      ].map((path) => readFile(path, 'utf8').catch(() => '')));
      assert.doesNotMatch(
        `${content.join('\n')}\n${JSON.stringify(logs)}`,
        new RegExp(SENTINEL),
      );
    },
  };
}
