import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { sha256 } from './core.mjs';

const exec = promisify(execCallback);
const ROOT_URL = 'https://chatgpt.com/';
const CONTINUE_BODY = 'Continue.';
const MAX_OUTCOMES = 200;
const FIELDS = ['work_id', 'role', 'output_schema_id', 'model', 'effort', 'tier', 'issued_at', 'expires_at', 'answered'];
export const JOURNAL_WORK_PROMPT = (workId) => `Private InnerSignal journal work item ${workId}. Call get_journal_work_packet with this work_id, follow its instruction using only its packet, then submit your JSON answer with submit_journal_work_result. If it lists schema problems, fix them and submit again. Reply only: done.`;

export class JournalWorkRunner {
  constructor({ config, browser, submit, commandRunner = runCommand, memoryReader = async () => ({ pressure: 'NORMAL' }), now = Date.now, sleep = delay, logger = console }) {
    if (!config?.dispatchCommand || !config?.importCommand || !config?.appLabel) throw new Error('Journal work requires dispatch/import commands and an app label.');
    if (!browser || typeof submit !== 'function') throw new Error('Journal work requires the automation-owned browser and central submission scheduler.');
    this.config = config; this.browser = browser; this.submit = submit; this.commandRunner = commandRunner;
    this.memoryReader = memoryReader; this.now = now; this.sleep = sleep; this.logger = logger; this.importTail = Promise.resolve(); this.passTail = Promise.resolve();
  }

  async runPass() {
    const operation = this.passTail.then(() => this.#runPass());
    this.passTail = operation.catch(() => {});
    return operation;
  }

  async #runPass() {
    const state = await this.#readState();
    this.#rollDay(state);
    if (state.current?.phase === 'IMPORT') return this.#completeImport(state);
    if (state.current) {
      const listing = await this.#listing();
      if (!listing.ok) return this.#finish(state, 'LISTING_FAILED');
      const persisted = listing.records.find((entry) => entry.work_id === state.current.workId);
      if (persisted?.answered) return this.#answered(persisted, state, state.current.rung);
      if (persisted && this.now() >= Date.parse(persisted.expires_at)) {
        state.today.expired += 1;
        state.today.waiting = Math.max(0, state.today.waiting - 1);
        state.current = null;
        if (state.ownerAction?.workId === persisted.work_id) state.ownerAction = null;
        return this.#finish(state, 'EXPIRED');
      }
      // A fresh authoritative read may resolve paused work, but unresolved
      // operator action or backoff must not start a second delivery ladder.
      if (state.ownerAction) return this.#finish(state, 'OWNER_ACTION_REQUIRED');
      if (Date.parse(state.backoff.until ?? '') > this.now()) return this.#finish(state, 'BACKING_OFF');
    }
    const memory = await this.memoryReader();
    if (memory?.pressure === 'SOFT' || memory?.pressure === 'HARD') return this.#backOff(state, 'MEMORY_PRESSURE');
    if (state.today.calls >= state.settings.dailyAllowance) return this.#finish(state, 'DAILY_ALLOWANCE_REACHED');
    if (Date.parse(state.backoff.until ?? '') > this.now()) return this.#finish(state, 'BACKING_OFF');
    // Keep an unresolved delivery identifiable until every pre-delivery gate has
    // passed. A later authoritative read can still reconcile its answer.
    state.current = null;

    const listing = await this.#listing();
    if (!listing.ok) return this.#finish(state, 'LISTING_FAILED');
    const eligible = listing.records.filter((item) => !item.answered && item.tier === 'standard'
      && Date.parse(item.expires_at) > this.now() && state.settings.models[item.model]?.includes(item.effort))
      .sort((a, b) => Date.parse(a.issued_at) - Date.parse(b.issued_at));
    state.today.waiting = eligible.length;
    let item = eligible[0];
    if (!item) return this.#finish(state, 'NO_WORK');
    const allowanceRatio = state.today.calls / state.settings.dailyAllowance;
    const paceMultiplier = allowanceRatio >= 0.9 ? 4 : (allowanceRatio >= 0.8 ? 2 : 1);
    await this.sleep(state.settings.paceMs * paceMultiplier);
    this.#rollDay(state);
    if (state.today.calls >= state.settings.dailyAllowance) return this.#finish(state, 'DAILY_ALLOWANCE_REACHED');
    const refreshed = await this.#listing();
    if (!refreshed.ok) return this.#finish(state, 'LISTING_FAILED');
    const pacedItem = refreshed.records.find((entry) => entry.work_id === item.work_id);
    if (pacedItem?.answered) return this.#answered(pacedItem, state, 'INITIAL');
    if (pacedItem && this.now() >= Date.parse(pacedItem.expires_at)) {
      state.today.expired += 1; state.today.waiting = Math.max(0, state.today.waiting - 1);
      return this.#finish(state, 'EXPIRED');
    }
    const refreshedEligible = refreshed.records.filter((candidate) => !candidate.answered && candidate.tier === 'standard'
      && Date.parse(candidate.expires_at) > this.now() && state.settings.models[candidate.model]?.includes(candidate.effort))
      .sort((a, b) => Date.parse(a.issued_at) - Date.parse(b.issued_at));
    state.today.waiting = refreshedEligible.length;
    item = refreshedEligible[0];
    if (!item) return this.#finish(state, 'NO_WORK');
    if (this.now() >= Date.parse(item.expires_at)) {
      state.today.expired += 1; state.today.waiting = Math.max(0, state.today.waiting - 1);
      return this.#finish(state, 'EXPIRED');
    }
    state.current = { workId: item.work_id, rung: 'INITIAL' };
    await this.#persist(state);
    try {
      return await this.#attemptItem(item, state);
    } catch (error) {
      if (error?.code === 'JOURNAL_DAILY_ALLOWANCE_REACHED') return this.#finish(state, 'DAILY_ALLOWANCE_REACHED');
      if (error?.code === 'JOURNAL_ITEM_EXPIRED') {
        state.today.expired += 1; state.today.waiting = Math.max(0, state.today.waiting - 1); state.current = null;
        return this.#finish(state, 'EXPIRED');
      }
      const trigger = classifyBackoff(error);
      if (trigger) return this.#backOff(state, trigger, error?.code === 'GLOBAL_SUBMISSION_COOLDOWN' ? error.retryAfterMs : null);
      state.ownerAction = { code: error?.code ?? 'JOURNAL_WORK_STOPPED', workId: item.work_id, at: this.#iso() };
      return this.#finish(state, 'OWNER_ACTION_REQUIRED');
    }
  }

  async #attemptItem(item, state) {
    let session = await this.#fresh(item, state, 'INITIAL', await this.#reserveFreshAttempt(state));
    let continueAnchor = null;
    const rungs = ['INITIAL', 'CONTINUE', 'RETRY'];
    for (const rung of rungs) {
      state.current.rung = rung;
      await this.#persist(state);
      if (rung === 'CONTINUE') continueAnchor = await this.#continue(item, session, state);
      if (rung === 'RETRY') await this.#retry(item, session, continueAnchor, state);
      const listed = await this.#listing();
      if (!listed.ok) { state.current.phase = 'READBACK'; return this.#backOff(state, 'LISTING_FAILED'); }
      const current = listed.records.find((entry) => entry.work_id === item.work_id);
      if (current?.answered) return this.#answered(item, state, rung);
      if (this.now() >= Date.parse(item.expires_at)) {
        state.today.expired += 1; state.today.waiting = Math.max(0, state.today.waiting - 1); state.current = null;
        return this.#finish(state, 'EXPIRED');
      }
    }
    for (let freshChatCount = 1; freshChatCount < state.settings.freshChatThreshold; freshChatCount += 1) {
      state.current.rung = 'FRESH_CHAT';
      state.current.freshChatCount = freshChatCount + 1;
      await this.#persist(state);
      session = await this.#fresh(item, state, 'FRESH_CHAT', await this.#reserveFreshAttempt(state));
      const listed = await this.#listing();
      if (!listed.ok) { state.current.phase = 'READBACK'; return this.#backOff(state, 'LISTING_FAILED'); }
      const current = listed.records.find((entry) => entry.work_id === item.work_id);
      if (current?.answered) return this.#answered(item, state, 'FRESH_CHAT');
      if (this.now() >= Date.parse(item.expires_at)) {
        state.today.expired += 1; state.today.waiting = Math.max(0, state.today.waiting - 1); state.current = null;
        return this.#finish(state, 'EXPIRED');
      }
    }
    state.ownerAction = { code: 'ANSWER_NOT_OBSERVED', workId: item.work_id, at: this.#iso() };
    return this.#finish(state, 'OWNER_ACTION_REQUIRED');
  }

  async #fresh(item, state, rung, freshChatAttempt) {
    this.#assertSubmissionAllowance(state);
    const target = await this.browser.createFreshChatTarget({ hardCeiling: 3 });
    const controls = state.settings.controlObservations?.[item.model]?.[item.effort];
    if (!controls) { const error = new Error('No calibrated consumer controls exist for the requested model and effort.'); error.code = 'JOURNAL_CONTROLS_UNCALIBRATED'; throw error; }
    await this.browser.ensureExactConsumerControls(target, { expectedUrl: ROOT_URL, controls });
    try { await this.browser.selectAppsForMessage(target, { knownLabels: [this.config.appLabel], requiredLabels: [this.config.appLabel] }); }
    catch (cause) { const error = new Error('Configured InnerSignal app is unavailable.', { cause }); error.code = 'JOURNAL_APP_MISSING'; throw error; }
    const body = JOURNAL_WORK_PROMPT(item.work_id);
    // A fresh-chat target may reuse the same automation-owned tab. Bind the
    // provider session to the durably reserved conversation attempt as well as
    // the tab so navigating that tab to a new chat cannot overwrite an older
    // conversation's scheduler binding.
    const providerSessionId = `provider-session:journal:${item.work_id}:${freshChatAttempt}:${target.id}`;
    const started = await this.#submitAfterCooldown(item, state, () => this.submit({ item, target, rung, freshChatAttempt, providerSessionId, expectedUrl: ROOT_URL, bodySha256: sha256(body), submit: (callbacks = {}) => this.browser.submitExactMessage(target, { expectedUrl: ROOT_URL, body, bodySha256: sha256(body), ...this.#countedCallbacks(state, callbacks) }) }));
    await this.#handleConfirmation(target, item);
    await this.browser.waitForGenerationComplete(target, this.#journalWaitOptions(state, target, started.conversationUrl ?? ROOT_URL, started.generationStarted, item));
    return { target, providerSessionId, expectedUrl: started.conversationUrl ?? ROOT_URL };
  }

  async #continue(item, session, state) {
    this.#assertSubmissionAllowance(state);
    const anchor = await this.browser.captureContinueRecoveryAnchor(session.target, { expectedUrl: session.expectedUrl });
    const started = await this.#submitAfterCooldown(item, state, () => this.submit({ item, target: session.target, rung: 'CONTINUE', providerSessionId: session.providerSessionId, expectedUrl: session.expectedUrl, bodySha256: sha256(CONTINUE_BODY), submit: (callbacks = {}) => this.browser.submitExactMessage(session.target, { expectedUrl: session.expectedUrl, body: CONTINUE_BODY, bodySha256: sha256(CONTINUE_BODY), ...this.#countedCallbacks(state, callbacks) }) }));
    await this.#handleConfirmation(session.target, item);
    if (started?.generationStarted === true) await this.browser.waitForGenerationComplete(session.target, this.#journalWaitOptions(state, session.target, session.expectedUrl, true, item));
    return anchor;
  }

  async #retry(item, session, anchor, state) {
    const classified = await this.browser.inspectFailedContinueRetry(session.target, { expectedUrl: session.expectedUrl, anchor });
    if (classified.status !== 'RETRY_FAILED_CONTINUE') return false;
    this.#assertSubmissionAllowance(state);
    const started = await this.#submitAfterCooldown(item, state, () => this.submit({ item, target: session.target, rung: 'RETRY', providerSessionId: session.providerSessionId, expectedUrl: session.expectedUrl, bodySha256: classified.bindingSha256, submit: (callbacks = {}) => this.browser.retryExactFailedContinue(session.target, { expectedUrl: session.expectedUrl, anchor, binding: classified.binding, ...this.#countedCallbacks(state, callbacks) }) }));
    await this.#handleConfirmation(session.target, item);
    if (started?.generationStarted === true) await this.browser.waitForGenerationComplete(session.target, this.#journalWaitOptions(state, session.target, session.expectedUrl, true, item));
    return true;
  }

  async #submitAfterCooldown(item, state, operation) {
    for (;;) {
      try { return await operation(); }
      catch (error) {
        if (error?.code !== 'GLOBAL_SUBMISSION_COOLDOWN') throw error;
        const retryAfterMs = Number(error.retryAfterMs);
        if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0) throw error;
        await this.sleep(retryAfterMs);
        if (this.now() >= Date.parse(item.expires_at)) {
          const expired = new Error('Journal work item expired during the global submission cooldown.');
          expired.code = 'JOURNAL_ITEM_EXPIRED';
          throw expired;
        }
        this.#assertSubmissionAllowance(state);
      }
    }
  }

  #countedCallbacks(state, callbacks) {
    return {
      ...callbacks,
      onBeforeSubmissionBoundary: async (...args) => {
        this.#assertSubmissionAllowance(state);
        return callbacks.onBeforeSubmissionBoundary?.(...args);
      },
      onSubmissionBoundary: async (...args) => {
        state.today.calls += 1;
        await this.#persist(state);
        return callbacks.onSubmissionBoundary?.(...args);
      },
    };
  }

  #journalWaitOptions(state, target, expectedUrl, generationStarted, item) {
    return {
      expectedUrl,
      generationStarted,
      onGenerationPoll: () => this.#handleConfirmation(target, item),
      beforeRecoverySend: () => this.#assertSubmissionAllowance(state),
      onRecoverySubmissionBoundary: async () => {
        state.today.calls += 1;
        await this.#persist(state);
      },
      recoveryLogger: this.#journalRecoveryLogger(),
      recoveryLogConversationUrl: false,
    };
  }

  #journalRecoveryLogger() {
    return {
      warn: (value) => {
        let event;
        try { event = JSON.parse(value); } catch { return; }
        if (!event || typeof event !== 'object' || Array.isArray(event)) return;
        const { targetId: _targetId, conversationUrl: _conversationUrl, ...contentFreeEvent } = event;
        this.logger.warn?.(JSON.stringify(contentFreeEvent));
      },
    };
  }

  #assertSubmissionAllowance(state) {
    this.#rollDay(state);
    if (state.today.calls < state.settings.dailyAllowance) return;
    const error = new Error('Journal provider-call daily allowance reached.');
    error.code = 'JOURNAL_DAILY_ALLOWANCE_REACHED';
    throw error;
  }

  async #reserveFreshAttempt(state) {
    const attempt = state.nextFreshAttempt;
    state.nextFreshAttempt += 1;
    state.current.freshAttempt = attempt;
    await this.#persist(state);
    return attempt;
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
    state.current = { workId: item.work_id, rung, phase: 'IMPORT' };
    await this.#persist(state);
    return this.#completeImport(state);
  }

  async #completeImport(state) {
    const summary = await this.#runImport();
    state.lastImport = { at: this.#iso(), exitCode: summary.exitCode, stage: summary.stage, blocker: summary.blocker, completedUnits: summary.completedUnits, residuals: summary.residuals };
    if (summary.exitCode !== 0) return this.#finish(state, 'IMPORT_FAILED');
    const { workId, rung } = state.current;
    state.today.answered += 1; state.today.waiting = Math.max(0, state.today.waiting - 1);
    state.outcomes.push({ workId, outcome: 'ANSWERED', rung, at: this.#iso() });
    state.outcomes = state.outcomes.slice(-MAX_OUTCOMES); state.current = null; state.backoff = { level: 0, until: null, trigger: null }; state.ownerAction = null;
    return this.#finish(state, 'ANSWERED');
  }

  async #runImport() {
    const operation = this.importTail.then(async () => sanitizeImportResult(await this.commandRunner(this.config.importCommand)));
    this.importTail = operation.catch(() => {});
    return operation;
  }

  async #listing() {
    let result;
    try { result = await this.commandRunner(this.config.dispatchCommand); } catch { return { ok: false, records: [] }; }
    if (result.exitCode !== 0) return { ok: false, records: [] };
    try { return { ok: true, records: result.stdout.split(/\r?\n/).filter(Boolean).map(parseDispatchRecord) }; }
    catch { return { ok: false, records: [] }; }
  }

  async #backOff(state, trigger, retryAfterMs = null) {
    const level = Math.min((state.backoff.level ?? 0) + 1, 10);
    const schedulerDelay = Number.isSafeInteger(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : null;
    const delayMs = schedulerDelay ?? Math.min(state.settings.backoffBaseMs * (2 ** (level - 1)), state.settings.backoffMaxMs);
    state.backoff = { level, trigger, until: new Date(this.now() + delayMs).toISOString() };
    state.outcomes.push({ outcome: 'BACKOFF', trigger, at: this.#iso() });
    state.outcomes = state.outcomes.slice(-MAX_OUTCOMES);
    return this.#finish(state, 'BACKING_OFF');
  }

  async #readState() {
    let stored = {};
    try { stored = JSON.parse(await readFile(this.config.stateFile, 'utf8')); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    const legacyAttemptFloor = (stored.today?.calls ?? stored.today?.answered ?? 0) + 1;
    return {
      schemaVersion: 1,
      settings: { paceMs: 60_000, backoffBaseMs: 60_000, backoffMaxMs: 3_600_000, freshChatThreshold: 3, dailyAllowance: 170, models: { 'GPT-5.6 Sol': ['Pro'] }, controlObservations: {}, ...(this.config.settings ?? {}), ...(stored.settings ?? {}) },
      today: {
        date: stored.today?.date ?? this.#day(),
        answered: stored.today?.answered ?? 0,
        calls: stored.today?.calls ?? stored.today?.answered ?? 0,
        expired: stored.today?.expired ?? 0,
        waiting: stored.today?.waiting ?? 0,
      },
      current: stored.current ?? null,
      nextFreshAttempt: Number.isInteger(stored.nextFreshAttempt) && stored.nextFreshAttempt > 0 ? stored.nextFreshAttempt : legacyAttemptFloor,
      backoff: stored.backoff ?? { level: 0, until: null, trigger: null },
      lastImport: stored.lastImport ?? null, ownerAction: stored.ownerAction ?? null, outcomes: Array.isArray(stored.outcomes) ? stored.outcomes : [],
    };
  }
  #rollDay(state) {
    if (state.today.date !== this.#day()) state.today = { date: this.#day(), answered: 0, calls: 0, expired: 0, waiting: 0 };
    else if (!Number.isInteger(state.today.calls)) state.today.calls = state.today.answered;
  }
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
  if (error?.code === 'GLOBAL_SUBMISSION_COOLDOWN') return 'GLOBAL_SUBMISSION_COOLDOWN';
  if (text.includes('too many requests') || text.includes('rate_limit')) return 'TOO_MANY_REQUESTS';
  if (text.includes('model unavailable') || text.includes('capacity')) return 'MODEL_CAPACITY';
  return null;
}

export async function withPersistedJournalWorkSettings(config) {
  let stored = {};
  try { stored = JSON.parse(await readFile(config.stateFile, 'utf8')); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  return { ...config, settings: { ...(config.settings ?? {}), ...(stored.settings ?? {}) } };
}
function sanitizeImportResult(result) {
  let parsed = {};
  for (const line of String(result.stdout ?? '').split(/\r?\n/)) {
    try { const candidate = JSON.parse(line); if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) parsed = candidate; } catch { /* npm headers and non-JSON output are deliberately discarded */ }
  }
  return { exitCode: Number.isInteger(result.exitCode) ? result.exitCode : 1, stage: stringOrNull(parsed.stage), blocker: stringOrNull(parsed.blocker), completedUnits: integerOrZero(parsed.completed_units), residuals: plainCounts(parsed.residuals) };
}
function stringOrNull(value) { return typeof value === 'string' && value.length <= 100 ? value : null; }
function integerOrZero(value) { return Number.isInteger(value) && value >= 0 ? value : 0; }
function plainCounts(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return {}; return Object.fromEntries(Object.entries(value).filter(([key, count]) => /^[a-zA-Z0-9_-]{1,50}$/.test(key) && Number.isInteger(count) && count >= 0)); }
export async function runCommand(command) { try { const { stdout = '' } = await exec(command, { maxBuffer: 1024 * 1024, env: { ...process.env, NPM_CONFIG_LOGLEVEL: 'silent' } }); return { exitCode: 0, stdout }; } catch (error) { return { exitCode: Number.isInteger(error?.code) ? error.code : 1, stdout: '' }; } }
async function atomicJson(path, value) { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await rename(temp, path); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
