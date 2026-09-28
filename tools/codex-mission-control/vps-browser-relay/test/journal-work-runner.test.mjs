import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JournalWorkRunner, JOURNAL_WORK_PROMPT, parseDispatchRecord } from '../src/journal-work-runner.mjs';
import { createContinueRecoveryAnchor } from '../src/continue-recovery.mjs';

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

test('dispatch validation rejects extra, missing, wrongly typed, and invalid-time fields', () => {
  assert.deepEqual(parseDispatchRecord(JSON.stringify(record())).work_id, 'opaque-1');
  for (const value of [{ ...record(), secret: SENTINEL }, { ...record(), role: undefined }, { ...record(), answered: 'false' }, { ...record(), expires_at: 'never' }]) {
    assert.throws(() => parseDispatchRecord(JSON.stringify(value)), /Invalid dispatch/);
  }
});

async function makeFixture(t, { answeredAt = Infinity, pageText = null, browserOptions = {}, now: nowImpl = () => now, onContinue, memoryReader, initialState, dispatchResult, importHandler, settings = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'journal-work-test-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = join(dir, 'state.json'); const statusFile = join(dir, 'status.json');
  if (initialState) await import('node:fs/promises').then(({ writeFile }) => writeFile(stateFile, JSON.stringify(initialState)));
  const browser = new FakeBrowser({ pageText, ...browserOptions, onContinue });
  let dispatches = 0; let imports = 0;
  const commandRunner = async (command) => {
    if (command === 'dispatch') { dispatches += 1; if (dispatchResult) return dispatchResult; return { exitCode: 0, stdout: `${JSON.stringify(record({ answered: dispatches >= answeredAt }))}\n` }; }
    imports += 1; return importHandler ? importHandler() : { exitCode: 0, stdout: `npm run journal:import\n${JSON.stringify({ stage: 'complete', blocker: null, completed_units: 1, residuals: { waiting: 0 }, ignored: SENTINEL })}` };
  };
  const logs = [];
  const runner = new JournalWorkRunner({ config: { dispatchCommand: 'dispatch', importCommand: 'import', appLabel: 'InnerSignal', stateFile, statusFile, settings: { controlObservations: { 'GPT-5.6 Sol': { Pro: { modelVisibleLabel: 'GPT-5.6 Sol', thinkingControlLabel: 'Power', thinkingVisibleLabel: 'Pro' } } }, ...settings } }, browser, submit: async ({ submit }) => submit(), commandRunner, memoryReader, now: nowImpl, sleep: async () => {}, logger: { log: (value) => logs.push(value) } });
  return { runner, browser, stateFile, statusFile, logs, importRuns: () => imports, dispatchRuns: () => dispatches };
}

class FakeBrowser {
  constructor(options) { Object.assign(this, options); this.messages = []; this.approvals = []; this.controls = []; this.freshCount = 0; this.waits = 0; this.anchorCaptures = 0; this.retryInspections = 0; this.exactRetries = 0; }
  async createFreshChatTarget() { this.freshCount += 1; return { id: `target-${this.freshCount}`, automationOwned: true, automationWindowId: 1 }; }
  async ensureExactConsumerControls(_target, { controls }) { this.controls.push(controls); }
  async selectAppsForMessage() { if (this.missingApp) throw new Error('missing'); }
  async submitExactMessage(_target, input) { if (this.submitError) throw this.submitError; this.messages.push(input.body); if (input.body === 'Continue.') this.onContinue?.(); return { generationStarted: input.body === 'Continue.' ? this.continueGenerationStarted !== false : true, conversationUrl: 'https://chatgpt.com/c/fake' }; }
  async waitForGenerationComplete() { this.waits += 1; return { pageText: this.pageText }; }
  async captureContinueRecoveryAnchor() { this.anchorCaptures += 1; return createContinueRecoveryAnchor({ turns: [{ key: 'initial-user', role: 'user', retryControls: [] }, { key: 'initial-assistant', role: 'assistant', retryControls: [] }] }); }
  async inspectFailedContinueRetry() { this.retryInspections += 1; return this.retryAvailable === false ? { status: 'CONTINUE_TURN_COMPLETE_NO_RETRY' } : { status: 'RETRY_FAILED_CONTINUE', binding: { schemaVersion: 1, anchorStructuralSha256: 'a'.repeat(64), continueUserTurnKey: 'continue-user', failedAssistantTurnKey: 'continue-assistant', controlLabel: 'Retry' }, bindingSha256: 'b'.repeat(64) }; }
  async retryExactFailedContinue() { this.exactRetries += 1; return { generationStarted: true }; }
  async detectJournalWriteConfirmation() { const value = this.confirmation ?? { present: false, appName: null, toolName: null, buttons: [] }; this.confirmation = null; return value; }
  async approveJournalWriteConfirmation(_target, input) { this.approvals.push(input); }
}

async function assertContentFree(fixture, sentinel) {
  const persisted = `${await readFile(fixture.stateFile, 'utf8')}\n${await readFile(fixture.statusFile, 'utf8')}\n${JSON.stringify(fixture.logs)}`;
  assert.doesNotMatch(persisted, new RegExp(sentinel));
}
