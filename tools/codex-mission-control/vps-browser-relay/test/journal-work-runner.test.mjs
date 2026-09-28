import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JournalWorkRunner, JOURNAL_WORK_PROMPT, parseDispatchRecord, runJournalImport } from '../src/journal-work-runner.mjs';

const SENTINEL = 'PRIVATE-JOURNAL-TEXT-SENTINEL';
const now = Date.parse('2026-09-28T12:00:00Z');
const record = (overrides = {}) => ({ work_id: 'opaque-1', role: 'extractor', output_schema_id: 'extraction-result', model: 'GPT-5.6 Sol', effort: 'Pro', tier: 'standard', issued_at: '2026-09-28T10:00:00Z', expires_at: '2026-09-28T14:00:00Z', answered: false, ...overrides });

test('happy path sends only the fixed prompt, records the initial rung, imports, and stays content-free', async (t) => {
  const fixture = await makeFixture(t, { answeredAt: 2, pageText: SENTINEL });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'ANSWERED');
  assert.equal(fixture.browser.messages[0], JOURNAL_WORK_PROMPT('opaque-1'));
  assert.equal(result.state.outcomes[0].rung, 'INITIAL');
  assert.equal(fixture.importRuns(), 1);
  await assertContentFree(fixture, SENTINEL);
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

test('an item expiring during recovery is recorded without an import', async (t) => {
  let clock = now;
  const fixture = await makeFixture(t, { answeredAt: Infinity, now: () => clock, onContinue: () => { clock = Date.parse('2026-09-28T15:00:00Z'); } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'EXPIRED');
  assert.equal(result.state.today.expired, 1);
  assert.equal(fixture.importRuns(), 0);
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
]) test(`${name} grows persistent backoff`, async (t) => {
  const fixture = await makeFixture(t, { browserOptions: { submitError: error } });
  const result = await fixture.runner.runPass();
  assert.equal(result.status, 'BACKING_OFF');
  assert.equal(result.state.backoff.trigger, trigger);
  assert.equal(result.state.backoff.level, 1);
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

test('concurrent answered passes serialize import runs', async (t) => {
  let active = 0; let maximum = 0;
  const fixture = await makeFixture(t, { answeredAt: 2, importHandler: async () => { active += 1; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 10)); active -= 1; return { exitCode: 0, stdout: '{}' }; } });
  await Promise.all([fixture.runner.runPass(), fixture.runner.runPass()]);
  assert.equal(maximum, 1);
  assert.equal(fixture.importRuns(), 1);
});

test('a stale legacy lock file cannot strand later imports', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'stale-import-lock-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const lockFile = join(dir, 'import.lock');
  await writeFile(lockFile, '99999999\n');
  let rescued = false;
  const rescue = setTimeout(() => { rescued = true; void rm(lockFile, { force: true }); }, 500);
  try {
    const result = await runJournalImport({ command: 'import', lockFile, commandRunner: async () => ({ exitCode: 0, stdout: '{}' }) });
    assert.equal(result.exitCode, 0);
    assert.equal(rescued, false);
  } finally { clearTimeout(rescue); }
});

test('dispatch validation rejects extra, missing, wrongly typed, and invalid-time fields', () => {
  assert.deepEqual(parseDispatchRecord(JSON.stringify(record())).work_id, 'opaque-1');
  for (const value of [{ ...record(), secret: SENTINEL }, { ...record(), role: undefined }, { ...record(), answered: 'false' }, { ...record(), expires_at: 'never' }]) {
    assert.throws(() => parseDispatchRecord(JSON.stringify(value)), /Invalid dispatch/);
  }
});

async function makeFixture(t, { answeredAt = Infinity, pageText = null, browserOptions = {}, now: nowImpl = () => now, onContinue, memoryReader, initialState, dispatchResult, importHandler } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'journal-work-test-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = join(dir, 'state.json'); const statusFile = join(dir, 'status.json');
  if (initialState) await writeFile(stateFile, JSON.stringify(initialState));
  const browser = new FakeBrowser({ pageText, ...browserOptions, onContinue });
  let dispatches = 0; let imports = 0;
  const commandRunner = async (command) => {
    if (command === 'dispatch') { dispatches += 1; if (dispatchResult) return dispatchResult; return { exitCode: 0, stdout: `${JSON.stringify(record({ answered: dispatches >= answeredAt }))}\n` }; }
    imports += 1; return importHandler ? importHandler() : { exitCode: 0, stdout: JSON.stringify({ stage: 'complete', blocker: null, completed_units: 1, residual_counts: { waiting: 0 }, ignored: SENTINEL }) };
  };
  const logs = [];
  const runner = new JournalWorkRunner({ config: { dispatchCommand: 'dispatch', importCommand: 'import', appLabel: 'InnerSignal', stateFile, statusFile }, browser, submit: async ({ submit }) => submit(), commandRunner, memoryReader, now: nowImpl, sleep: async () => {}, logger: { log: (value) => logs.push(value) } });
  return { runner, browser, stateFile, statusFile, logs, importRuns: () => imports, dispatchRuns: () => dispatches };
}

class FakeBrowser {
  constructor(options) { Object.assign(this, options); this.messages = []; this.approvals = []; this.freshCount = 0; }
  async createFreshChatTarget() { this.freshCount += 1; return { id: `target-${this.freshCount}`, automationOwned: true, automationWindowId: 1 }; }
  async ensureExactConsumerControls() {}
  async selectAppsForMessage() { if (this.missingApp) throw new Error('missing'); }
  async submitExactMessage(_target, input) { if (this.submitError) throw this.submitError; this.messages.push(input.body); return { generationStarted: true, conversationUrl: 'https://chatgpt.com/c/fake' }; }
  async waitForGenerationComplete() { return { pageText: this.pageText }; }
  async continueJournalWork() { this.onContinue?.(); return { generationStarted: true }; }
  async retryJournalWork() { return { generationStarted: true }; }
  async detectJournalWriteConfirmation() { const value = this.confirmation ?? { present: false, appName: null, toolName: null, buttons: [] }; this.confirmation = null; return value; }
  async approveJournalWriteConfirmation(_target, input) { this.approvals.push(input); }
}

async function assertContentFree(fixture, sentinel) {
  const persisted = `${await readFile(fixture.stateFile, 'utf8')}\n${await readFile(fixture.statusFile, 'utf8')}\n${JSON.stringify(fixture.logs)}`;
  assert.doesNotMatch(persisted, new RegExp(sentinel));
}
