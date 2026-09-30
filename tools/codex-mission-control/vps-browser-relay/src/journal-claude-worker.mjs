import { spawn } from 'node:child_process';
import {
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  JOURNAL_WORK_PROMPT,
  readJournalListing,
  runCommand,
  runJournalImport,
  withFileLock,
} from './journal-work-runner.mjs';

const LANE = 'journal-hardest';
const TOKEN_FIELDS = [
  'input_tokens',
  'output_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
];

export class JournalClaudeWorker {
  constructor({
    config,
    commandRunner = runCommand,
    claudeRunner = runClaude,
    now = Date.now,
    logger = console,
  }) {
    this.config = config;
    this.commandRunner = commandRunner;
    this.claudeRunner = claudeRunner;
    this.now = now;
    this.logger = logger;
  }

  async runPass() {
    if (!this.config.enabled) return { status: 'DISABLED' };
    await mkdir(this.config.stateDir, { recursive: true, mode: 0o700 });
    return (await withFileLock(
      this.config.workerLockFile,
      () => this.#runLocked(),
    )) ?? { status: 'LOCKED' };
  }

  async #runLocked() {
    const prior = await readJson(this.config.summaryFile);
    const pendingWorkId = typeof prior?.pending_import?.work_id === 'string'
      ? prior.pending_import.work_id
      : null;
    if (pendingWorkId) return this.#importAnswered(pendingWorkId);
    let listing;
    let resumedItem = null;
    let firstAttempt = 1;
    let newlyExhausted = null;
    const inFlightWorkId = typeof prior?.in_flight?.work_id === 'string'
      ? prior.in_flight.work_id
      : null;
    if (inFlightWorkId) {
      listing = await readJournalListing(
        this.config.dispatchCommand,
        this.config.dispatchTimeoutMs,
        this.commandRunner,
      );
      if (!listing.ok) return { status: 'LISTING_FAILED', workId: inFlightWorkId };
      const inFlightItem = listing.records.find((entry) => entry.work_id === inFlightWorkId);
      if (inFlightItem?.answered === true) {
        await this.#reconcileAnswered(inFlightWorkId, prior.in_flight.attempt);
        return this.#importAnswered(inFlightWorkId);
      }
      // A legacy marker without an attempt count cannot safely restart its budget.
      const consumed = Number.isInteger(prior.in_flight.attempt)
        && prior.in_flight.attempt >= 1 ? prior.in_flight.attempt : 2;
      if (inFlightItem?.tier === 'hardest'
        && Date.parse(inFlightItem.expires_at) > this.now()) {
        if (consumed < 2) {
          resumedItem = inFlightItem;
          firstAttempt = consumed + 1;
        } else {
          await this.#clearInFlight(inFlightWorkId, inFlightItem.expires_at);
          newlyExhausted = { work_id: inFlightWorkId, expires_at: inFlightItem.expires_at };
        }
      } else {
        await this.#clearInFlight(inFlightWorkId);
      }
    }
    if (Date.parse(prior?.paused_until ?? '') > this.now()) {
      return { status: 'LIMITED', pausedUntil: prior.paused_until };
    }

    listing ??= await readJournalListing(
      this.config.dispatchCommand,
      this.config.dispatchTimeoutMs,
      this.commandRunner,
    );
    if (!listing.ok) return { status: 'LISTING_FAILED' };
    const priorExhausted = [
      ...(Array.isArray(prior?.exhausted) ? prior.exhausted : []),
      ...(newlyExhausted ? [newlyExhausted] : []),
    ];
    const exhausted = priorExhausted.filter((entry) =>
      Date.parse(entry?.expires_at) > this.now()
      && listing.records.some((record) => record.work_id === entry.work_id));
    if (exhausted.length !== priorExhausted.length) {
      await this.#updateSummary((summary) => ({ ...summary, exhausted }));
    }
    const exhaustedIds = new Set(exhausted.map((entry) => entry.work_id));
    const item = resumedItem ?? listing.records
      .filter((entry) => entry.tier === 'hardest'
        && !entry.answered
        && !exhaustedIds.has(entry.work_id)
        && Date.parse(entry.expires_at) > this.now())
      .sort((a, b) => Date.parse(a.issued_at) - Date.parse(b.issued_at))[0];
    if (!item) return { status: 'NO_WORK' };

    await this.#writeMcpConfig();
    for (let attempt = firstAttempt; attempt <= 2; attempt += 1) {
      if (this.now() >= Date.parse(item.expires_at)) {
        return { status: 'EXPIRED', workId: item.work_id };
      }

      let result;
      await this.#updateSummary((summary) => ({
        ...summary,
        in_flight: { work_id: item.work_id, attempt },
      }));
      try {
        result = await this.#invoke(item.work_id);
      } catch {
        result = { is_error: true };
      }
      const refreshed = await readJournalListing(
        this.config.dispatchCommand,
        this.config.dispatchTimeoutMs,
        this.commandRunner,
      );
      const answered = refreshed.ok
        && refreshed.records.find((entry) => entry.work_id === item.work_id)?.answered === true;
      const outcome = answered
        ? 'answered'
        : result.limited
          ? 'limited'
          : result.timeout
            ? 'timeout'
            : result.is_error
              ? 'error'
              : 'unanswered';
      if (refreshed.ok && !answered && attempt === 2) {
        await this.#clearInFlight(item.work_id, item.expires_at);
      }
      await this.#record(result, outcome, item.work_id, attempt);

      if (answered) return this.#importAnswered(item.work_id);
      if (!refreshed.ok) return { status: 'LISTING_FAILED', workId: item.work_id };
      if (result.limited) return { status: 'LIMITED', pausedUntil: result.resetAt };
      if (attempt === 2) return { status: outcome.toUpperCase(), workId: item.work_id };
    }
    throw new Error('Unreachable Claude worker attempt state.');
  }

  async #invoke(workId) {
    const cwd = await mkdtemp(join(tmpdir(), 'journal-claude-'));
    const args = [
      '-p',
      JOURNAL_WORK_PROMPT(workId),
      '--model',
      this.config.model,
      '--effort',
      this.config.effort,
      '--output-format',
      'json',
      '--mcp-config',
      this.config.mcpConfigFile,
      '--strict-mcp-config',
      '--tools',
      '',
      '--allowedTools',
      'mcp__journal__get_journal_work_packet',
      'mcp__journal__submit_journal_work_result',
      '--permission-mode',
      'dontAsk',
      '--no-session-persistence',
    ];
    try {
      const execution = await this.claudeRunner(this.config.claudeBin, args, {
        cwd,
        timeoutMs: this.config.timeoutMs,
      });
      if (execution.timeout) return { timeout: true };
      let value;
      try {
        value = JSON.parse(execution.stdout || '{}');
      } catch {
        return { is_error: true };
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { is_error: true };
      }
      const isError = value.is_error === true || execution.exitCode !== 0;
      const errorResult = isError ? String(value.result ?? '') : '';
      const limited = isError
        && /usage\s+limit|limit\s+reached|hit\s+your\s+limit/i.test(errorResult);
      const resetAt = limited
        ? parseResetTime(errorResult, this.now(), this.config.limitBackoffMs)
        : null;
      return sanitizeClaudeResult(value, { isError, limited, resetAt });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }

  async #importAnswered(workId) {
    await this.#updateSummary((summary) => {
      const next = { ...summary, pending_import: { work_id: workId } };
      delete next.in_flight;
      return next;
    });
    const summary = await runJournalImport({
      command: this.config.importCommand,
      timeoutMs: this.config.importTimeoutMs,
      lockFile: this.config.importLockFile,
      commandRunner: this.commandRunner,
    });
    await this.#updateSummary((stored) => {
      const next = {
        ...stored,
        last_import: {
          at: new Date(this.now()).toISOString(),
          exitCode: summary.exitCode,
          stage: summary.stage,
          blocker: summary.blocker,
          completedUnits: summary.completedUnits,
          residuals: summary.residuals,
        },
      };
      if (summary.exitCode === 0) delete next.pending_import;
      return next;
    });
    return {
      status: summary.exitCode === 0 ? 'ANSWERED' : 'IMPORT_FAILED',
      workId,
    };
  }

  async #record(result, outcome, workId, attempt) {
    const event = {
      at: new Date(this.now()).toISOString(),
      lane: LANE,
      outcome,
      work_id: workId,
      attempt,
      duration_ms: number(result.duration_ms),
      num_turns: number(result.num_turns),
      input_tokens: number(result.input_tokens),
      output_tokens: number(result.output_tokens),
      cache_read_input_tokens: number(result.cache_read_input_tokens),
      cache_creation_input_tokens: number(result.cache_creation_input_tokens),
      cost_usd_equivalent: number(result.total_cost_usd),
    };
    if (result.modelUsage) event.model_usage = result.modelUsage;
    if (result.resetAt) event.resume_at = result.resetAt;
    await mkdir(dirname(this.config.usageFile), { recursive: true, mode: 0o700 });
    await appendFile(this.config.usageFile, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    await chmod(this.config.usageFile, 0o600);
    const events = (await readFile(this.config.usageFile, 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
    const prior = await readJson(this.config.summaryFile);
    const summary = buildUsageSummary(events, this.now());
    if (isRecord(prior?.last_import)) summary.last_import = prior.last_import;
    if (isRecord(prior?.pending_import)) summary.pending_import = prior.pending_import;
    if (isRecord(prior?.in_flight)) summary.in_flight = prior.in_flight;
    if (Array.isArray(prior?.exhausted)) summary.exhausted = prior.exhausted;
    await atomicJson(this.config.summaryFile, summary);
    this.logger.log({ status: outcome.toUpperCase(), at: event.at });
  }

  async #reconcileAnswered(workId, attempt) {
    const raw = await readFile(this.config.usageFile, 'utf8').catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (raw === null) return;
    const events = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    if (events.length === 0) return;
    const matching = events.filter((event) => event.work_id === workId && event.attempt === attempt);
    if (matching.some((event) => event.outcome === 'answered' && event.reconciliation !== true)) return;
    if (matching.length === 0 && events.at(-1)?.outcome === 'answered') return;
    if (!matching.some((event) => event.reconciliation === true && event.outcome === 'answered')) {
      const correction = { at: new Date(this.now()).toISOString(), lane: LANE, outcome: 'answered', work_id: workId, attempt, reconciliation: true };
      await appendFile(this.config.usageFile, `${JSON.stringify(correction)}\n`, { mode: 0o600 });
      events.push(correction);
    }
    const summary = buildUsageSummary(events, this.now());
    const prior = await readJson(this.config.summaryFile);
    const priorPause = Date.parse(prior?.paused_until ?? '');
    if (priorPause > this.now() && priorPause > (Date.parse(summary.paused_until ?? '') || 0)) summary.paused_until = prior.paused_until;
    for (const key of ['last_import', 'pending_import', 'in_flight', 'exhausted']) {
      if (prior?.[key] !== undefined) summary[key] = prior[key];
    }
    await atomicJson(this.config.summaryFile, summary);
  }

  async #clearInFlight(workId, exhaustedUntil = null) {
    await this.#updateSummary((summary) => {
      const next = { ...summary };
      if (next.in_flight?.work_id === workId) delete next.in_flight;
      if (exhaustedUntil) {
        next.exhausted = [
          ...(Array.isArray(next.exhausted) ? next.exhausted : []),
          { work_id: workId, expires_at: exhaustedUntil },
        ];
      }
      return next;
    });
  }

  async #updateSummary(update) {
    const stored = await readJson(this.config.summaryFile);
    await atomicJson(
      this.config.summaryFile,
      update(isRecord(stored) ? stored : buildUsageSummary([], this.now())),
    );
  }

  async #writeMcpConfig() {
    if (!this.config.workMcpCommand.length) {
      throw new Error('MC_JOURNAL_WORK_MCP_COMMAND_JSON is required when the Claude lane is enabled.');
    }
    const [command, ...args] = this.config.workMcpCommand;
    await atomicJson(this.config.mcpConfigFile, {
      mcpServers: { journal: { type: 'stdio', command, args } },
    });
    await chmod(this.config.mcpConfigFile, 0o600);
  }
}

export function buildUsageSummary(events, nowMs = Date.now()) {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const since = nowMs - (7 * 86_400_000);
  const empty = {
    runs: 0,
    items_answered: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    cost_usd_equivalent: 0,
    limit_events: 0,
  };
  const aggregate = (selected) => selected.reduce((sum, event) => ({
    runs: sum.runs + (event.reconciliation === true ? 0 : 1),
    items_answered: sum.items_answered + (event.outcome === 'answered' ? 1 : 0),
    input_tokens: sum.input_tokens + number(event.input_tokens),
    output_tokens: sum.output_tokens + number(event.output_tokens),
    cache_read_input_tokens: sum.cache_read_input_tokens + number(event.cache_read_input_tokens),
    cache_creation_input_tokens: sum.cache_creation_input_tokens
      + number(event.cache_creation_input_tokens),
    cost_usd_equivalent: sum.cost_usd_equivalent + number(event.cost_usd_equivalent),
    limit_events: sum.limit_events
      + (event.outcome === 'limited' || event.resume_at ? 1 : 0),
  }), empty);
  const valid = events.filter((event) => Number.isFinite(Date.parse(event.at)));
  const pausedUntil = valid
    .filter((event) => Date.parse(event.resume_at) > nowMs)
    .at(-1)?.resume_at ?? null;
  return {
    generated_at: new Date(nowMs).toISOString(),
    today_utc: aggregate(valid.filter((event) => event.at.slice(0, 10) === today)),
    last_seven_days: aggregate(valid.filter((event) => (
      Date.parse(event.at) >= since && Date.parse(event.at) <= nowMs
    ))),
    paused_until: pausedUntil,
    cost_label: 'USD equivalent reported by Claude Code; not a subscription charge',
  };
}

function sanitizeClaudeResult(value, { isError, ...extra }) {
  const result = {
    is_error: isError,
    subtype: typeof value.subtype === 'string' ? value.subtype.slice(0, 100) : null,
    duration_ms: number(value.duration_ms),
    num_turns: number(value.num_turns),
    total_cost_usd: number(value.total_cost_usd),
    ...extra,
  };
  for (const key of TOKEN_FIELDS) result[key] = number(value.usage?.[key]);
  if (isRecord(value.modelUsage)) {
    result.modelUsage = Object.fromEntries(
      Object.entries(value.modelUsage).map(([model, usage]) => [
        model.slice(0, 100),
        Object.fromEntries(TOKEN_FIELDS.map((key) => [
          key,
          number(usage?.[key] ?? usage?.[snakeToCamel(key)]),
        ])),
      ]),
    );
  }
  return result;
}

function parseResetTime(text, nowMs, backoffMs) {
  const match = text.match(
    /\b(20\d\d-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d))\b/,
  );
  if (match && Number.isFinite(Date.parse(match[1]))) {
    return new Date(Date.parse(match[1])).toISOString();
  }
  const local = text.match(/\bresets?\s+(?:at\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);
  if (local) {
    const reset = new Date(nowMs);
    reset.setHours(Number(local[1]) % 12 + (local[3].toLowerCase() === 'pm' ? 12 : 0),
      Number(local[2] ?? 0), 0, 0);
    if (reset.getTime() <= nowMs) reset.setDate(reset.getDate() + 1);
    return reset.toISOString();
  }
  return new Date(nowMs + backoffMs).toISOString();
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function snakeToCamel(value) {
  return value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(path) {
  let raw;
  try { raw = await readFile(path, 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  let value;
  try { value = JSON.parse(raw); }
  catch (error) { throw new Error('Invalid Claude usage summary JSON.', { cause: error }); }
  if (!isRecord(value)) throw new Error('Invalid Claude usage summary shape.');
  return value;
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
}

export function runClaude(command, args, { cwd, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const onExit = () => terminateProcessGroup(child);
    // The worker lock also exits on signals. Kill Claude before its exit
    // handler releases the lock, including when another path calls process.exit().
    process.prependListener('exit', onExit);
    const signalHandlers = [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]
      .map(([signal, code]) => [signal, () => process.exit(code)]);
    for (const [signal, handler] of signalHandlers) {
      process.prependOnceListener(signal, handler);
    }
    const cleanup = () => {
      clearTimeout(timer);
      process.removeListener('exit', onExit);
      for (const [signal, handler] of signalHandlers) {
        process.removeListener(signal, handler);
      }
    };
    let stdout = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessGroup(child);
    }, timeoutMs);
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('close', (code, signal) => {
      cleanup();
      resolve({ exitCode: code, signal, stdout, timeout: timedOut });
    });
  });
}

function terminateProcessGroup(child) {
  if (!Number.isInteger(child.pid) || child.pid <= 0) return;
  try {
    if (process.platform === 'win32') child.kill('SIGKILL');
    else process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}
