import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { sha256 } from './core.mjs';
import { RelayLock } from './relay-lock.mjs';

const exec = promisify(execCallback);
const ROOT_URL = 'https://chatgpt.com/';
const FIELDS = ['work_id', 'role', 'output_schema_id', 'model', 'effort', 'tier', 'issued_at', 'expires_at', 'answered'];
const importTails = new Map();
export const JOURNAL_WORK_PROMPT = (workId) => `Private InnerSignal journal work item ${workId}. Call get_journal_work_packet with this work_id, follow its instruction using only its packet, then submit your JSON answer with submit_journal_work_result. If it lists schema problems, fix them and submit again. Reply only: done.`;

export class JournalWorkRunner {
  constructor({ config, browser, submit, commandRunner = runCommand, memoryReader = async () => ({ pressure: 'NORMAL' }), now = Date.now, sleep = delay, logger = console }) {
    if (!config?.dispatchCommand || !config?.importCommand || !config?.appLabel) throw new Error('Journal work requires dispatch/import commands and an app label.');
    if (!browser || typeof submit !== 'function') throw new Error('Journal work requires the automation-owned browser and central submission scheduler.');
    this.config = config; this.browser = browser; this.submit = submit; this.commandRunner = commandRunner;
    this.memoryReader = memoryReader; this.now = now; this.sleep = sleep; this.logger = logger; this.passTail = Promise.resolve();
  }

  async runPass() {
    const operation = this.passTail.then(() => this.#runPass());
    this.passTail = operation.catch(() => {});
    return operation;
  }

  async #runPass() {
    const state = await this.#readState();
    this.#rollDay(state);
    const memory = await this.memoryReader();
    if (memory?.pressure === 'SOFT' || memory?.pressure === 'HARD') return this.#backOff(state, 'MEMORY_PRESSURE');
    if (state.today.answered >= state.settings.dailyAllowance) return this.#finish(state, 'DAILY_ALLOWANCE_REACHED');
    if (Date.parse(state.backoff.until ?? '') > this.now()) return this.#finish(state, 'BACKING_OFF');

    const listing = await this.#listing();
    if (!listing.ok) return this.#finish(state, 'LISTING_FAILED');
    const eligible = listing.records.filter((item) => !item.answered && item.tier === 'standard'
      && Date.parse(item.expires_at) > this.now() && state.settings.models[item.model]?.includes(item.effort))
      .sort((a, b) => Date.parse(a.issued_at) - Date.parse(b.issued_at));
    state.today.waiting = eligible.length;
    const item = eligible[0];
    if (!item) return this.#finish(state, 'NO_WORK');
    const allowanceRatio = state.today.answered / state.settings.dailyAllowance;
    const paceMultiplier = allowanceRatio >= 0.9 ? 4 : (allowanceRatio >= 0.8 ? 2 : 1);
    await this.sleep(state.settings.paceMs * paceMultiplier);
    state.current = { workId: item.work_id, role: item.role, rung: 'INITIAL' };
    await this.#persist(state);
    try {
      return await this.#attemptItem(item, state);
    } catch (error) {
      const trigger = classifyBackoff(error);
      if (trigger) return this.#backOff(state, trigger);
      state.ownerAction = { code: error?.code ?? 'JOURNAL_WORK_STOPPED', workId: item.work_id, at: this.#iso() };
      return this.#finish(state, 'OWNER_ACTION_REQUIRED');
    }
  }

  async #attemptItem(item, state) {
    let session = await this.#fresh(item, state, 'INITIAL');
    const rungs = ['INITIAL', 'CONTINUE', 'RETRY', 'FRESH_CHAT'];
    for (const rung of rungs) {
      state.current.rung = rung;
      await this.#persist(state);
      if (rung === 'CONTINUE') await this.#scheduledRecovery(item, session, 'CONTINUE');
      if (rung === 'RETRY') await this.#scheduledRecovery(item, session, 'RETRY');
      if (rung === 'FRESH_CHAT') session = await this.#fresh(item, state, rung);
      const listed = await this.#listing();
      const current = listed.ok && listed.records.find((entry) => entry.work_id === item.work_id);
      if (current?.answered) return this.#answered(item, state, rung);
      if (this.now() >= Date.parse(item.expires_at)) {
        state.today.expired += 1; state.current = null;
        return this.#finish(state, 'EXPIRED');
      }
    }
    state.ownerAction = { code: 'ANSWER_NOT_OBSERVED', workId: item.work_id, at: this.#iso() };
    return this.#finish(state, 'OWNER_ACTION_REQUIRED');
  }

  async #fresh(item, state, rung) {
    const target = await this.browser.createFreshChatTarget({ hardCeiling: 3 });
    await this.browser.ensureExactConsumerControls(target, { expectedUrl: ROOT_URL, controls: { modelVisibleLabel: item.model, thinkingControlLabel: 'Thinking effort', thinkingVisibleLabel: item.effort } });
    try { await this.browser.selectAppsForMessage(target, { knownLabels: [this.config.appLabel], requiredLabels: [this.config.appLabel] }); }
    catch (cause) { const error = new Error('Configured InnerSignal app is unavailable.', { cause }); error.code = 'JOURNAL_APP_MISSING'; throw error; }
    const body = JOURNAL_WORK_PROMPT(item.work_id);
    const started = await this.submit({ item, target, rung, bodySha256: sha256(body), submit: (callbacks = {}) => this.browser.submitExactMessage(target, { expectedUrl: ROOT_URL, body, bodySha256: sha256(body), ...callbacks }) });
    await this.#handleConfirmation(target, item);
    await this.browser.waitForGenerationComplete(target, { expectedUrl: started.conversationUrl ?? ROOT_URL, generationStarted: started.generationStarted });
    return { target, expectedUrl: started.conversationUrl ?? ROOT_URL };
  }

  async #scheduledRecovery(item, session, rung) {
    const method = rung === 'CONTINUE' ? 'continueJournalWork' : 'retryJournalWork';
    if (typeof this.browser[method] !== 'function') { const error = new Error(`${rung} recovery is unavailable.`); error.code = 'RECOVERY_UNAVAILABLE'; throw error; }
    const started = await this.submit({ item, target: session.target, rung, bodySha256: sha256(`${rung}:${item.work_id}`), submit: (callbacks = {}) => this.browser[method](session.target, { expectedUrl: session.expectedUrl, ...callbacks }) });
    await this.#handleConfirmation(session.target, item);
    await this.browser.waitForGenerationComplete(session.target, { expectedUrl: session.expectedUrl, generationStarted: started.generationStarted });
  }

  async #handleConfirmation(target, item) {
    if (typeof this.browser.detectJournalWriteConfirmation !== 'function') return;
    const dialog = await this.browser.detectJournalWriteConfirmation(target);
    if (!dialog?.present) return;
    if (dialog.appName !== this.config.appLabel || dialog.toolName !== 'submit_journal_work_result') {
      const error = new Error('Unexpected app write confirmation.'); error.code = 'UNEXPECTED_APP_CONFIRMATION'; throw error;
    }
    const always = dialog.buttons.find((button) => /always allow/i.test(button));
    const choice = always ?? dialog.buttons.find((button) => /^(allow|approve|confirm)$/i.test(button));
    if (!choice) { const error = new Error('Approved app confirmation has no exact approval control.'); error.code = 'APP_CONFIRMATION_CONTROL_MISSING'; throw error; }
    await this.browser.approveJournalWriteConfirmation(target, { appName: this.config.appLabel, toolName: 'submit_journal_work_result', button: choice, workId: item.work_id });
  }

  async #answered(item, state, rung) {
    state.today.answered += 1; state.today.waiting = Math.max(0, state.today.waiting - 1);
    state.outcomes.push({ workId: item.work_id, outcome: 'ANSWERED', rung, at: this.#iso() });
    state.outcomes = state.outcomes.slice(-200); state.current = null; state.backoff = { level: 0, until: null, trigger: null };
    const summary = await this.#runImport();
    state.lastImport = { at: this.#iso(), exitCode: summary.exitCode, stage: summary.stage, blocker: summary.blocker, completedUnits: summary.completedUnits, residualCounts: summary.residualCounts, hardestSentToday: summary.hardestSentToday, hardestDailyLimit: summary.hardestDailyLimit };
    return this.#finish(state, 'ANSWERED');
  }

  async #runImport() {
    return runJournalImport({ command: this.config.importCommand, lockFile: this.config.importLockFile, commandRunner: this.commandRunner });
  }

  async #listing() {
    return readJournalListing(this.config.dispatchCommand, this.commandRunner);
  }

  async #backOff(state, trigger) {
    const level = Math.min((state.backoff.level ?? 0) + 1, 10);
    const delayMs = Math.min(state.settings.backoffBaseMs * (2 ** (level - 1)), state.settings.backoffMaxMs);
    state.backoff = { level, trigger, until: new Date(this.now() + delayMs).toISOString() };
    state.outcomes.push({ outcome: 'BACKOFF', trigger, at: this.#iso() });
    return this.#finish(state, 'BACKING_OFF');
  }

  async #readState() {
    let stored = {};
    try { stored = JSON.parse(await readFile(this.config.stateFile, 'utf8')); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    return {
      schemaVersion: 1,
      settings: { paceMs: 60_000, backoffBaseMs: 60_000, backoffMaxMs: 3_600_000, freshChatThreshold: 3, dailyAllowance: 170, models: { 'GPT-5.6 Sol': ['Pro'] }, ...(stored.settings ?? {}), ...(this.config.settings ?? {}) },
      today: stored.today ?? { date: this.#day(), answered: 0, expired: 0, waiting: 0 },
      current: stored.current ?? null, backoff: stored.backoff ?? { level: 0, until: null, trigger: null },
      lastImport: stored.lastImport ?? null, ownerAction: stored.ownerAction ?? null, outcomes: Array.isArray(stored.outcomes) ? stored.outcomes : [],
    };
  }
  #rollDay(state) { if (state.today.date !== this.#day()) state.today = { date: this.#day(), answered: 0, expired: 0, waiting: 0 }; }
  #day() { return new Date(this.now()).toISOString().slice(0, 10); }
  #iso() { return new Date(this.now()).toISOString(); }
  async #finish(state, status) { await this.#persist(state); this.logger.log({ status, workId: state.current?.workId ?? null }); return { status, state }; }
  async #persist(state) { await atomicJson(this.config.stateFile, state); await atomicJson(this.config.statusFile, { current: state.current, today: state.today, backoff: state.backoff, lastImport: state.lastImport, ownerAction: state.ownerAction }); }
}

export function parseDispatchRecord(line) {
  const value = JSON.parse(line);
  if (!value || Object.keys(value).some((key) => !FIELDS.includes(key)) || FIELDS.some((key) => !(key in value))) throw new Error('Invalid dispatch record shape.');
  for (const field of FIELDS.slice(0, 6)) if (typeof value[field] !== 'string' || !value[field] || value[field].length > 256) throw new Error(`Invalid dispatch ${field}.`);
  if (typeof value.answered !== 'boolean' || !Number.isFinite(Date.parse(value.issued_at)) || !Number.isFinite(Date.parse(value.expires_at))) throw new Error('Invalid dispatch times or answered flag.');
  return value;
}

function classifyBackoff(error) {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (text.includes('too many requests') || text.includes('rate_limit')) return 'TOO_MANY_REQUESTS';
  if (text.includes('model unavailable') || text.includes('capacity')) return 'MODEL_CAPACITY';
  return null;
}
export async function readJournalListing(command, commandRunner = runCommand) {
  let result;
  try { result = await commandRunner(command); } catch { return { ok: false, records: [] }; }
  if (result.exitCode !== 0) return { ok: false, records: [] };
  try { return { ok: true, records: result.stdout.split(/\r?\n/).filter(Boolean).map(parseDispatchRecord) }; }
  catch { return { ok: false, records: [] }; }
}

export async function runJournalImport({ command, lockFile, commandRunner = runCommand }) {
  const key = lockFile ?? command;
  const prior = importTails.get(key) ?? Promise.resolve();
  const operation = prior.then(async () => withFileLock(lockFile, async () => sanitizeImportResult(await commandRunner(command)), { wait: true }));
  importTails.set(key, operation.catch(() => {}));
  return operation;
}

export async function withFileLock(lockFile, operation, { wait = false } = {}) {
  if (!lockFile) return operation();
  let lock;
  for (;;) {
    const candidate = new RelayLock(lockFile);
    try {
      await candidate.acquire({ taskId: 'journal:shared-operation', persistent: true });
      lock = candidate;
      break;
    } catch (error) {
      if (error?.code !== 'RELAY_LOCK_BUSY') throw error;
      if (!wait) return null;
      await delay(50);
    }
  }
  try { return await operation(); }
  finally { lock.release(); }
}

function sanitizeImportResult(result) {
  let parsed = {};
  try { parsed = JSON.parse(result.stdout || '{}'); } catch { /* content is deliberately discarded */ }
  return { exitCode: Number.isInteger(result.exitCode) ? result.exitCode : 1, stage: stringOrNull(parsed.stage), blocker: stringOrNull(parsed.blocker), completedUnits: integerOrZero(parsed.completed_units ?? parsed.completedUnits), residualCounts: plainCounts(parsed.residual_counts ?? parsed.residualCounts), hardestSentToday: integerOrZero(parsed.hardest_sent_today ?? parsed.hardestSentToday), hardestDailyLimit: integerOrZero(parsed.hardest_daily_limit ?? parsed.hardestDailyLimit) };
}
function stringOrNull(value) { return typeof value === 'string' && value.length <= 100 ? value : null; }
function integerOrZero(value) { return Number.isInteger(value) && value >= 0 ? value : 0; }
function plainCounts(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return {}; return Object.fromEntries(Object.entries(value).filter(([key, count]) => /^[a-zA-Z0-9_-]{1,50}$/.test(key) && Number.isInteger(count) && count >= 0)); }
async function runCommand(command) { try { const { stdout = '' } = await exec(command, { maxBuffer: 1024 * 1024 }); return { exitCode: 0, stdout }; } catch (error) { return { exitCode: Number.isInteger(error?.code) ? error.code : 1, stdout: '' }; } }
async function atomicJson(path, value) { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await rename(temp, path); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
