import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JournalWorkRunner, JOURNAL_WORK_PROMPT, parseDispatchRecord, runCommand, withPersistedJournalWorkSettings } from '../src/journal-work-runner.mjs';
import { createContinueRecoveryAnchor } from '../src/continue-recovery.mjs';
import { journalWorkSubmissionContext } from '../src/submission-context.mjs';
import { sha256 } from '../src/core.mjs';

const SENTINEL = 'PRIVATE-JOURNAL-TEXT-SENTINEL';
const now = Date.parse('2026-09-28T12:00:00Z');
const record = (overrides = {}) => ({ work_id: 'opaque-1', role: 'extractor', output_schema_id: 'extraction-result', model: 'GPT-5.6 Sol', effort: 'Pro', tier: 'standard', issued_at: '2026-09-28T10:00:00Z', expires_at: '2026-09-28T14:00:00Z', answered: false, ...overrides });
const journalChat = { supervisorId: 'registered-journal-supervisor', registrationId: 'registration:journal:test', workerId: 'authorized-journal-worker', ownership: 'MISSION_CONTROL_ONLY' };
const authorizationRef = 'task:authorized-journal-worker';

test('journal scheduler contexts bind recovery to its conversation and distinguish every fresh attempt', () => {
  const target = { id: 'target-1', automationWindowId: 1 };
  const common = { chat: journalChat, item: record(), target, rung: 'FRESH_CHAT', providerSessionId: 'provider-session:journal:opaque-1:target-1', bodySha256: 'a'.repeat(64) };
  const first = journalWorkSubmissionContext({ ...common, freshChatAttempt: 2, expectedUrl: 'https://chatgpt.com/' });
  const second = journalWorkSubmissionContext({ ...common, target: { id: 'target-2', automationWindowId: 1 }, providerSessionId: 'provider-session:journal:opaque-1:target-2', freshChatAttempt: 3, expectedUrl: 'https://chatgpt.com/' });
  assert.notEqual(first.queueKey, second.queueKey);
  assert.notEqual(first.targetKey, second.targetKey);
  const recovery = journalWorkSubmissionContext({ ...common, rung: 'CONTINUE', freshChatAttempt: null, expectedUrl: 'https://chatgpt.com/c/fake' });
  assert.equal(recovery.targetKind, 'BOUND_PROVIDER_SESSION');
  assert.equal(recovery.targetKey, common.providerSessionId);
  assert.equal(recovery.expectedUrlSha256, sha256('https://chatgpt.com/c/fake'));
  assert.equal(first.authorizationRef, authorizationRef);
  assert.equal(first.supervisorId, journalChat.supervisorId);
  assert.equal(first.registrationId, journalChat.registrationId);
  assert.throws(() => journalWorkSubmissionContext({ ...common, chat: { ...journalChat, workerId: '' } }), /owner-registered/);
});

test('journal stuck-recovery contexts keep the registered identity and distinguish nudges', () => {
  const common = {
    chat: journalChat, item: record(), target: { id: 'target-1', automationWindowId: 1 },
    rung: 'STUCK_RECOVERY', providerSessionId: 'provider-session:journal:opaque-1:target-1',
    expectedUrl: 'https://chatgpt.com/c/fake', bodySha256: 'a'.repeat(64),
  };
  const first = journalWorkSubmissionContext({ ...common, schedulerAttemptKey: 'nudge-1' });
  const second = journalWorkSubmissionContext({ ...common, schedulerAttemptKey: 'nudge-2' });
  assert.equal(first.registrationId, journalChat.registrationId);
  assert.equal(first.authorizationRef, authorizationRef);
  assert.notEqual(first.queueKey, second.queueKey);
});

test('journal stuck-recovery queue keys distinguish restarted provider sessions', () => {
  const common = {
    chat: journalChat, item: record(), target: { id: 'target-1', automationWindowId: 1 },
    rung: 'STUCK_RECOVERY', expectedUrl: 'https://chatgpt.com/c/fake',
    bodySha256: 'a'.repeat(64), schedulerAttemptKey: 'wait:1:nudge:1',
  };
  const first = journalWorkSubmissionContext({ ...common, providerSessionId: 'provider-session:journal:opaque-1:target-1' });
  const restarted = journalWorkSubmissionContext({ ...common, target: { ...common.target, id: 'target-2' }, providerSessionId: 'provider-session:journal:opaque-1:target-2' });
  assert.notEqual(first.queueKey, restarted.queueKey);
});

test('the command runner suppresses npm preambles so dispatch stdout is strict JSON lines', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'journal-npm-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { dispatch: `node -e "console.log(JSON.stringify({ok:true}))"` } }));
  const result = await runCommand(`cd ${JSON.stringify(dir)} && npm run dispatch`);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), '{"ok":true}');
});

test('happy path sends only the fixed prompt, records the initial rung, imports, and stays content-free', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: 2, pageText: SENTINEL });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'ANSWERED');
  assert.equal(fixture.browser.messages[0], JOURNAL_WORK_PROMPT('opaque-1'));
  assert.equal(result.state.outcomes[0].rung, 'INITIAL');
  assert.equal(fixture.importRuns(), 1);
  assert.deepEqual(result.state.lastImport, {
    at: '2026-09-28T12:00:00.000Z', exitCode: 0, stage: 'complete', blocker: null,
    completedUnits: 1, residuals: { waiting: 0 },
  });
  await assertContentFree(fixture, SENTINEL);
});

test('import summary uses the last JSON object after npm headers and filters residuals to plain counts', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: 2, importHandler: async () => ({
    exitCode: 0,
    stdout: `\n> inner-signal@1.0.0 journal:import\n> node import.mjs\n${JSON.stringify({ stage: 'ignored' })}\nnot json\n${JSON.stringify({ stage: 'complete', blocker: 'none', completed_units: 2, residuals: { waiting: 3, bad: -1, secret: SENTINEL } })}\n`,
  }) });
  const result = await fixture.runner.runPass();
  assert.equal(result.state.lastImport.stage, 'complete');
  assert.equal(result.state.lastImport.completedUnits, 2);
  assert.deepEqual(result.state.lastImport.residuals, { waiting: 3 });
  await assertContentFree(fixture, SENTINEL);
});

test('consumer-control labels come from persisted per-account calibration rather than a hardcoded thinking label', async (t) => {
  const controls = { modelVisibleLabel: 'Calibrated model button', thinkingControlLabel: 'Power', thinkingVisibleLabel: 'Pro' };
  const fixture = await makeFixture(t, { answeredAt: 2, initialState: { settings: { controlObservations: { 'GPT-5.6 Sol': { Pro: controls } } } } });
  assert.equal((await fixture.runner.runPass()).status, 'ANSWERED');
  assert.deepEqual(fixture.browser.controls[0], controls);
});

for (const [name, answeredAt, expectedRung] of [['continue', 3, 'CONTINUE'], ['retry', 4, 'RETRY'], ['fresh chat', 5, 'FRESH_CHAT']]) {
  test(`${name} ladder rung resolves an item`, async (t) => {
    const fixture = await makeFixture(t, { answeredAt });
    const result = await fixture.runner.runPass();
    assert.equal(result.status, 'ANSWERED');
    assert.equal(result.state.outcomes[0].rung, expectedRung);
    if (expectedRung === 'FRESH_CHAT') assert.equal(fixture.browser.freshCount, 2);
  });
}

test('continue and Retry use structural recovery bindings and skip waits when no generation starts', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: 5, browserOptions: { continueGenerationStarted: false, retryAvailable: false } });
  assert.equal((await fixture.runner.runPass()).status, 'ANSWERED');
  assert.equal(fixture.browser.anchorCaptures, 1);
  assert.equal(fixture.browser.retryInspections, 1);
  assert.equal(fixture.browser.exactRetries, 0);
  assert.equal(fixture.browser.waits, 2);
  assert.deepEqual(fixture.browser.messages, [JOURNAL_WORK_PROMPT('opaque-1'), 'Continue.', JOURNAL_WORK_PROMPT('opaque-1')]);
});

test('freshChatThreshold limits total fresh chats before recording owner action', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: Infinity, settings: { freshChatThreshold: 4 } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'OWNER_ACTION_REQUIRED');
  assert.equal(result.state.ownerAction.code, 'ANSWER_NOT_OBSERVED');
  assert.equal(fixture.browser.freshCount, 4);
});

test('an item expiring during recovery is recorded without an import', async (t) => {
  let clock = now;
  const fixture = await makeFixture(t, { answeredAt: Infinity, now: () => clock, onContinue: () => { clock = Date.parse('2026-09-28T15:00:00Z'); } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'EXPIRED');
  assert.equal(result.state.today.expired, 1);
  assert.equal(fixture.importRuns(), 0);
});

test('an item expiring during the pacing delay is not submitted', async (t) => {
  let clock = now;
  const fixture = await makeFixture(t, {
    recordOverrides: { expires_at: '2026-09-28T12:00:01Z' },
    now: () => clock,
    sleep: async () => { clock += 2_000; },
  });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'EXPIRED');
  assert.equal(result.state.today.expired, 1);
  assert.equal(fixture.browser.freshCount, 0);
  assert.equal(fixture.importRuns(), 0);
});

test('a pacing delay crossing UTC midnight rolls the allowance before submission', async (t) => {
  let clock = Date.parse('2026-09-28T23:59:59Z');
  const fixture = await makeFixture(t, {
    answeredAt: 2,
    now: () => clock,
    sleep: async () => { clock += 2_000; },
    initialState: { today: { date: '2026-09-28', answered: 4, calls: 4, expired: 2, waiting: 7 } },
    settings: { dailyAllowance: 5 },
    recordOverrides: { expires_at: '2026-09-29T02:00:00Z' },
  });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'ANSWERED');
  assert.deepEqual(result.state.today, { date: '2026-09-29', answered: 1, calls: 1, expired: 0, waiting: 0 });
});

test('an answer landed by an earlier chat is accepted only through the refreshed listing', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: 2 });
  fixture.browser.waitForGenerationComplete = async () => ({ pageText: 'not authoritative' });
  assert.equal((await fixture.runner.runPass()).status, 'ANSWERED');
});

test('missing app fails closed with an owner action', async (t) => {
  const fixture = await makeFixture(t, { browserOptions: { missingApp: true } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'OWNER_ACTION_REQUIRED');
  assert.equal(result.state.ownerAction.code, 'JOURNAL_APP_MISSING');
});

test('approved exact confirmation uses always allow when offered', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: 2, browserOptions: { confirmation: { present: true, appName: 'InnerSignal', toolName: 'submit_journal_work_result', buttons: ['Cancel', 'Always allow'] } } });
  assert.equal((await fixture.runner.runPass()).status, 'ANSWERED');
  assert.equal(fixture.browser.approvals[0].button, 'Always allow');
});

test('a confirmation for any other tool is refused and becomes an owner action', async (t) => {
  const fixture = await makeFixture(t, { browserOptions: { confirmation: { present: true, appName: 'InnerSignal', toolName: 'delete_everything', buttons: ['Allow'] } } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'OWNER_ACTION_REQUIRED');
  assert.equal(fixture.browser.approvals.length, 0);
  assert.equal(result.state.ownerAction.code, 'UNEXPECTED_APP_CONFIRMATION');
});

for (const [name, error, trigger] of [
  ['too many requests', Object.assign(new Error('too many requests'), { code: 'RATE_LIMIT' }), 'TOO_MANY_REQUESTS'],
  ['model capacity', new Error('model unavailable due to capacity'), 'MODEL_CAPACITY'],
  ['central cooldown', Object.assign(new Error('cooldown'), { code: 'GLOBAL_SUBMISSION_COOLDOWN', retryAfterMs: 420_000 }), 'GLOBAL_SUBMISSION_COOLDOWN'],
]) test(`${name} grows persistent backoff`, async (t) => {
  const fixture = await makeFixture(t, { browserOptions: { submitError: error } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'BACKING_OFF');
  assert.equal(result.state.backoff.trigger, trigger);
  assert.equal(result.state.backoff.level, 1);
  if (error.code === 'GLOBAL_SUBMISSION_COOLDOWN') assert.equal(result.state.backoff.until, '2026-09-28T12:07:00.000Z');
});

test('a central cooldown between ladder rungs remains resumable timed backoff', async (t) => {
  let attempts = 0;
  const cooldown = Object.assign(new Error('central pacing remains active'), { code: 'GLOBAL_SUBMISSION_COOLDOWN', retryAfterMs: 300_000 });
  const fixture = await makeFixture(t, { answeredAt: Infinity, submitHandler: async (entry) => {
    attempts += 1;
    if (attempts === 2) throw cooldown;
    return entry.submit();
  } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'BACKING_OFF');
  assert.equal(result.state.ownerAction, null);
  assert.equal(result.state.backoff.trigger, 'GLOBAL_SUBMISSION_COOLDOWN');
  assert.equal(result.state.backoff.until, '2026-09-28T12:05:00.000Z');
  assert.equal(result.state.current.workId, 'opaque-1');
});

test('memory pressure backs off before reading work', async (t) => {
  const fixture = await makeFixture(t, { memoryReader: async () => ({ pressure: 'SOFT' }) });
  const result = await fixture.runner.runPass();
  assert.equal(result.state.backoff.trigger, 'MEMORY_PRESSURE');
  assert.equal(fixture.dispatchRuns(), 0);
});

test('daily allowance stops before listing or browser work', async (t) => {
  const fixture = await makeFixture(t, { initialState: { today: { date: '2026-09-28', answered: 170, expired: 0, waiting: 0 } } });
  assert.equal((await fixture.runner.runPass()).status, 'DAILY_ALLOWANCE_REACHED');
  assert.equal(fixture.dispatchRuns(), 0);
});

test('failing and malformed listing commands mean no work and do not touch the browser', async (t) => {
  for (const result of [{ exitCode: 9, stdout: SENTINEL }, { exitCode: 0, stdout: '{"bad":true}\n' }]) {
    const fixture = await makeFixture(t, { dispatchResult: result });
    assert.equal((await fixture.runner.runPass()).status, 'LISTING_FAILED');
    assert.equal(fixture.browser.freshCount, 0);
  }
});

test('a failed authoritative readback backs off without advancing recovery', async (t) => {
  let clock = now;
  const fixture = await makeFixture(t, { now: () => clock, dispatchHandler: async (run) => {
    if (run === 1) return { exitCode: 0, stdout: `${JSON.stringify(record())}\n` };
    if (run === 2) return { exitCode: 9, stdout: '' };
    return { exitCode: 0, stdout: `${JSON.stringify(record({ answered: true }))}\n` };
  } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'BACKING_OFF');
  assert.equal(result.state.backoff.trigger, 'LISTING_FAILED');
  assert.equal(fixture.browser.freshCount, 1);
  assert.deepEqual(fixture.browser.messages, [JOURNAL_WORK_PROMPT('opaque-1')]);
  clock += 60_000;
  const recovered = await fixture.runner.runPass();
  assert.equal(recovered.status, 'ANSWERED');
  assert.equal(fixture.browser.freshCount, 1);
  assert.equal(fixture.importRuns(), 1);
});

test('persisted work is reconciled and imported when its answer landed before a phase update', async (t) => {
  const fixture = await makeFixture(t, {
    answeredAt: 1,
    initialState: { current: { workId: 'opaque-1', rung: 'INITIAL' } },
  });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'ANSWERED');
  assert.equal(fixture.browser.freshCount, 0);
  assert.equal(fixture.importRuns(), 1);
});

test('an unanswered persisted attempt reserves a new durable identity before a restart target', async (t) => {
  const fixture = await makeFixture(t, {
    settings: { freshChatThreshold: 1 },
    initialState: {
      today: { date: '2026-09-28', answered: 0, calls: 1, expired: 0, waiting: 1 },
      current: { workId: 'opaque-1', rung: 'INITIAL' },
    },
  });
  assert.equal((await fixture.runner.runPass()).status, 'OWNER_ACTION_REQUIRED');
  assert.deepEqual(fixture.submissions.filter((entry) => Number.isInteger(entry.freshChatAttempt)).map((entry) => entry.freshChatAttempt), [2]);
  assert.equal(JSON.parse(await readFile(fixture.stateFile, 'utf8')).nextFreshAttempt, 3);
});

test('an unresolved owner action retains its work and blocks another submission ladder', async (t) => {
  const current = { workId: 'opaque-1', rung: 'FRESH_CHAT', freshChatCount: 3 };
  const ownerAction = { code: 'ANSWER_NOT_OBSERVED', workId: 'opaque-1', at: '2026-09-28T11:00:00.000Z' };
  const fixture = await makeFixture(t, { initialState: { current, ownerAction } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'OWNER_ACTION_REQUIRED');
  assert.deepEqual(result.state.current, current);
  assert.deepEqual(result.state.ownerAction, ownerAction);
  assert.equal(fixture.browser.freshCount, 0);
});

test('an unresolved persisted attempt remains identifiable throughout active readback backoff', async (t) => {
  const current = { workId: 'opaque-1', rung: 'INITIAL', phase: 'READBACK' };
  const fixture = await makeFixture(t, { initialState: {
    current,
    backoff: { level: 1, trigger: 'LISTING_FAILED', until: '2026-09-28T12:01:00.000Z' },
  } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'BACKING_OFF');
  assert.deepEqual(result.state.current, current);
  assert.equal(fixture.browser.freshCount, 0);
  assert.equal(fixture.dispatchRuns(), 1);
});

test('each crossed provider submission is persisted and the allowance stops the active ladder', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: Infinity, settings: { dailyAllowance: 2 } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'DAILY_ALLOWANCE_REACHED');
  assert.equal(result.state.today.calls, 2);
  assert.deepEqual(fixture.browser.messages, [JOURNAL_WORK_PROMPT('opaque-1'), 'Continue.']);
  assert.equal(fixture.browser.exactRetries, 0);
  assert.equal(JSON.parse(await readFile(fixture.stateFile, 'utf8')).today.calls, 2);
});

test('scheduler replay rechecks the daily allowance before a second provider boundary', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: Infinity, settings: { dailyAllowance: 1 }, submitHandler: async (entry) => {
    await entry.submit();
    return entry.submit();
  } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'DAILY_ALLOWANCE_REACHED');
  assert.equal(result.state.today.calls, 1);
  assert.deepEqual(fixture.browser.messages, [JOURNAL_WORK_PROMPT('opaque-1')]);
  assert.equal(JSON.parse(await readFile(fixture.stateFile, 'utf8')).today.calls, 1);
});

test('persisted journal settings are available before sizing the command lock', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'journal-lock-settings-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = join(dir, 'state.json');
  await writeFile(stateFile, JSON.stringify({ settings: { paceMs: 3_600_000, freshChatThreshold: 12 } }));
  const effective = await withPersistedJournalWorkSettings({ stateFile, settings: { paceMs: 60_000, freshChatThreshold: 3, dailyAllowance: 170 } });
  assert.equal(effective.settings.paceMs, 3_600_000);
  assert.equal(effective.settings.freshChatThreshold, 12);
  assert.equal(effective.settings.dailyAllowance, 170);
});

test('journal stuck-recovery submissions consume the persisted daily allowance', async (t) => {
  const fixture = await makeFixture(t, {
    answeredAt: Infinity,
    settings: { dailyAllowance: 2 },
    browserOptions: { recoverySubmissions: 1 },
  });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'DAILY_ALLOWANCE_REACHED');
  assert.equal(result.state.today.calls, 2);
  assert.equal(JSON.parse(await readFile(fixture.stateFile, 'utf8')).today.calls, 2);
  assert.deepEqual(fixture.browser.messages, [JOURNAL_WORK_PROMPT('opaque-1')]);
});

test('a failed import remains pending and is retried before dispatching more work', async (t) => {
  let importAttempt = 0;
  const fixture = await makeFixture(t, { answeredAt: 2, importHandler: async () => {
    importAttempt += 1;
    return importAttempt === 1
      ? { exitCode: 7, stdout: JSON.stringify({ stage: 'publish', blocker: 'temporary' }) }
      : { exitCode: 0, stdout: JSON.stringify({ stage: 'complete', completed_units: 1 }) };
  } });
  const failed = await fixture.runner.runPass();
  assert.equal(failed.status, 'IMPORT_FAILED');
  assert.equal(failed.state.today.answered, 0);
  assert.equal(failed.state.current.phase, 'IMPORT');
  const recovered = await fixture.runner.runPass();
  assert.equal(recovered.status, 'ANSWERED');
  assert.equal(recovered.state.today.answered, 1);
  assert.equal(fixture.importRuns(), 2);
  assert.equal(fixture.dispatchRuns(), 2);
  assert.equal(fixture.browser.freshCount, 1);
});

test('a successful item clears a stale owner action', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: 2, initialState: {
    ownerAction: { code: 'ANSWER_NOT_OBSERVED', workId: 'opaque-1', at: '2026-09-28T11:00:00.000Z' },
  } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.state.ownerAction, null);
  assert.equal(JSON.parse(await readFile(fixture.statusFile, 'utf8')).ownerAction, null);
});

test('concurrent answered passes serialize import runs', async (t) => {
  let active = 0; let maximum = 0;
  const fixture = await makeFixture(t, { answeredAt: 2, importHandler: async () => { active += 1; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 10)); active -= 1; return { exitCode: 0, stdout: '{}' }; } });
  await Promise.all([fixture.runner.runPass(), fixture.runner.runPass()]);
  assert.equal(maximum, 1);
  assert.equal(fixture.importRuns(), 1);
});

test('dispatch validation rejects extra, missing, wrongly typed, and invalid-time fields', () => {
  assert.deepEqual(parseDispatchRecord(JSON.stringify(record())).work_id, 'opaque-1');
  for (const value of [{ ...record(), secret: SENTINEL }, { ...record(), role: undefined }, { ...record(), answered: 'false' }, { ...record(), expires_at: 'never' }]) {
    assert.throws(() => parseDispatchRecord(JSON.stringify(value)), /Invalid dispatch/);
  }
});

async function makeFixture(t, { answeredAt = Infinity, pageText = null, browserOptions = {}, now: nowImpl = () => now, sleep = async () => {}, onContinue, memoryReader, initialState, dispatchResult, dispatchHandler, importHandler, submitHandler, recordOverrides = {}, settings = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'journal-work-test-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = join(dir, 'state.json'); const statusFile = join(dir, 'status.json');
  if (initialState) await import('node:fs/promises').then(({ writeFile }) => writeFile(stateFile, JSON.stringify(initialState)));
  const browser = new FakeBrowser({ pageText, ...browserOptions, onContinue });
  let dispatches = 0; let imports = 0;
  const commandRunner = async (command) => {
    if (command === 'dispatch') { dispatches += 1; if (dispatchHandler) return dispatchHandler(dispatches); if (dispatchResult) return dispatchResult; return { exitCode: 0, stdout: `${JSON.stringify(record({ ...recordOverrides, answered: dispatches >= answeredAt }))}\n` }; }
    imports += 1; return importHandler ? importHandler() : { exitCode: 0, stdout: `npm run journal:import\n${JSON.stringify({ stage: 'complete', blocker: null, completed_units: 1, residuals: { waiting: 0 }, ignored: SENTINEL })}` };
  };
  const logs = []; const submissions = [];
  const runner = new JournalWorkRunner({ config: { dispatchCommand: 'dispatch', importCommand: 'import', appLabel: 'InnerSignal', stateFile, statusFile, settings: { controlObservations: { 'GPT-5.6 Sol': { Pro: { modelVisibleLabel: 'GPT-5.6 Sol', thinkingControlLabel: 'Power', thinkingVisibleLabel: 'Pro' } } }, ...settings } }, browser, submit: async (entry) => { submissions.push(entry); return submitHandler ? submitHandler(entry, submissions.length) : entry.submit(); }, commandRunner, memoryReader, now: nowImpl, sleep, logger: { log: (value) => logs.push(value) } });
  return { runner, browser, stateFile, statusFile, logs, submissions, importRuns: () => imports, dispatchRuns: () => dispatches };
}

class FakeBrowser {
  constructor(options) { Object.assign(this, options); this.messages = []; this.approvals = []; this.controls = []; this.freshCount = 0; this.waits = 0; this.anchorCaptures = 0; this.retryInspections = 0; this.exactRetries = 0; }
  async createFreshChatTarget() { this.freshCount += 1; return { id: `target-${this.freshCount}`, automationOwned: true, automationWindowId: 1 }; }
  async ensureExactConsumerControls(_target, { controls }) { this.controls.push(controls); }
  async selectAppsForMessage() { if (this.missingApp) throw new Error('missing'); }
  async submitExactMessage(_target, input) { if (this.submitError) throw this.submitError; await input.onBeforeSubmissionBoundary?.(); await input.onSubmissionBoundary?.(); this.messages.push(input.body); if (input.body === 'Continue.') this.onContinue?.(); return { generationStarted: input.body === 'Continue.' ? this.continueGenerationStarted !== false : true, conversationUrl: 'https://chatgpt.com/c/fake' }; }
  async waitForGenerationComplete(_target, options) {
    this.waits += 1;
    if ((this.recoverySubmissions ?? 0) > 0) {
      this.recoverySubmissions -= 1;
      await options.beforeRecoverySend();
      await options.onRecoverySubmissionBoundary();
    }
    return { pageText: this.pageText };
  }
  async captureContinueRecoveryAnchor() { this.anchorCaptures += 1; return createContinueRecoveryAnchor({ turns: [{ key: 'initial-user', role: 'user', retryControls: [] }, { key: 'initial-assistant', role: 'assistant', retryControls: [] }] }); }
  async inspectFailedContinueRetry() { this.retryInspections += 1; return this.retryAvailable === false ? { status: 'CONTINUE_TURN_COMPLETE_NO_RETRY' } : { status: 'RETRY_FAILED_CONTINUE', binding: { schemaVersion: 1, anchorStructuralSha256: 'a'.repeat(64), continueUserTurnKey: 'continue-user', failedAssistantTurnKey: 'continue-assistant', controlLabel: 'Retry' }, bindingSha256: 'b'.repeat(64) }; }
  async retryExactFailedContinue(_target, input) { await input.onBeforeSubmissionBoundary?.(); await input.onSubmissionBoundary?.(); this.exactRetries += 1; return { generationStarted: true }; }
  async detectJournalWriteConfirmation() { const value = this.confirmation ?? { present: false, appName: null, toolName: null, buttons: [] }; this.confirmation = null; return value; }
  async approveJournalWriteConfirmation(_target, input) { this.approvals.push(input); }
}

async function assertContentFree(fixture, sentinel) {
  const persisted = `${await readFile(fixture.stateFile, 'utf8')}\n${await readFile(fixture.statusFile, 'utf8')}\n${JSON.stringify(fixture.logs)}`;
  assert.doesNotMatch(persisted, new RegExp(sentinel));
}
