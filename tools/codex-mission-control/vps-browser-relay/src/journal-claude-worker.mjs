import { spawn } from 'node:child_process';
import { appendFile, chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { JOURNAL_WORK_PROMPT, readJournalListing, runJournalImport, withFileLock } from './journal-work-runner.mjs';

const LANE = 'journal-hardest';
const TOKEN_FIELDS = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];

export class JournalClaudeWorker {
  constructor({ config, commandRunner, claudeRunner = runClaude, now = Date.now, logger = console }) {
    this.config = config; this.commandRunner = commandRunner; this.claudeRunner = claudeRunner; this.now = now; this.logger = logger;
  }

  async runPass() {
    if (!this.config.enabled) return { status: 'DISABLED' };
    return (await withFileLock(this.config.workerLockFile, () => this.#runLocked())) ?? { status: 'LOCKED' };
  }

  async #runLocked() {
    await this.#writeMcpConfig();
    const prior = await readSummary(this.config.summaryFile);
    if (Date.parse(prior?.paused_until ?? '') > this.now()) return { status: 'LIMITED', pausedUntil: prior.paused_until };
    const listing = await readJournalListing(this.config.dispatchCommand, this.commandRunner);
    if (!listing.ok) return { status: 'LISTING_FAILED' };
    const item = listing.records.filter((entry) => entry.tier === 'hardest' && !entry.answered && Date.parse(entry.expires_at) > this.now())
      .sort((a, b) => Date.parse(a.issued_at) - Date.parse(b.issued_at))[0];
    if (!item) return { status: 'NO_WORK' };
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await this.#invoke(item.work_id);
      const refreshed = await readJournalListing(this.config.dispatchCommand, this.commandRunner);
      const answered = refreshed.ok && refreshed.records.find((entry) => entry.work_id === item.work_id)?.answered === true;
      const outcome = answered ? 'answered' : result.limited ? 'limited' : result.timeout ? 'timeout' : result.is_error ? 'error' : 'unanswered';
      await this.#record(result, outcome);
      if (answered) {
        await runJournalImport({ command: this.config.importCommand, lockFile: this.config.importLockFile, commandRunner: this.commandRunner });
        return { status: 'ANSWERED', workId: item.work_id };
      }
      if (result.limited) return { status: 'LIMITED', pausedUntil: result.resetAt };
      if (attempt === 2) return { status: outcome.toUpperCase(), workId: item.work_id };
    }
  }

  async #invoke(workId) {
    const cwd = await mkdtemp(join(tmpdir(), 'journal-claude-'));
    const args = ['-p', JOURNAL_WORK_PROMPT(workId), '--model', this.config.model, '--effort', this.config.effort, '--output-format', 'json', '--mcp-config', this.config.mcpConfigFile, '--strict-mcp-config', '--tools', '', '--allowedTools', 'mcp__journal__get_journal_work_packet', 'mcp__journal__submit_journal_work_result', '--permission-mode', 'dontAsk', '--no-session-persistence'];
    try {
      const execution = await this.claudeRunner(this.config.claudeBin, args, { cwd, timeoutMs: this.config.timeoutMs });
      if (execution.timeout) return { timeout: true };
      let value = {}; try { value = JSON.parse(execution.stdout || '{}'); } catch { return { is_error: true }; }
      const limited = value.is_error === true && /usage\s+limit|limit\s+reached/i.test(String(value.result ?? ''));
      const resetAt = limited ? parseResetTime(String(value.result ?? ''), this.now(), this.config.limitBackoffMs) : null;
      return sanitizeClaudeResult(value, { limited, resetAt });
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }

  async #record(result, outcome) {
    const event = { at: new Date(this.now()).toISOString(), lane: LANE, outcome, duration_ms: number(result.duration_ms), num_turns: number(result.num_turns), input_tokens: number(result.input_tokens), output_tokens: number(result.output_tokens), cache_read_input_tokens: number(result.cache_read_input_tokens), cache_creation_input_tokens: number(result.cache_creation_input_tokens), cost_usd_equivalent: number(result.total_cost_usd) };
    if (result.modelUsage) event.model_usage = result.modelUsage;
    if (result.resetAt) event.resume_at = result.resetAt;
    await mkdir(dirname(this.config.usageFile), { recursive: true, mode: 0o700 });
    await appendFile(this.config.usageFile, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    const events = (await readFile(this.config.usageFile, 'utf8')).split(/\r?\n/).filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
    await atomicJson(this.config.summaryFile, buildUsageSummary(events, this.now()));
    this.logger.log({ status: outcome.toUpperCase(), at: event.at });
  }

  async #writeMcpConfig() {
    if (!this.config.workMcpCommand.length) throw new Error('MC_JOURNAL_WORK_MCP_COMMAND_JSON is required when the Claude lane is enabled.');
    const [command, ...args] = this.config.workMcpCommand;
    await atomicJson(this.config.mcpConfigFile, { mcpServers: { journal: { type: 'stdio', command, args } } });
    await chmod(this.config.mcpConfigFile, 0o600);
  }
}

export function buildUsageSummary(events, nowMs = Date.now()) {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const since = nowMs - (7 * 86_400_000);
  const aggregate = (selected) => selected.reduce((sum, event) => ({ runs: sum.runs + 1, items_answered: sum.items_answered + (event.outcome === 'answered' ? 1 : 0), input_tokens: sum.input_tokens + number(event.input_tokens), output_tokens: sum.output_tokens + number(event.output_tokens), cache_read_input_tokens: sum.cache_read_input_tokens + number(event.cache_read_input_tokens), cache_creation_input_tokens: sum.cache_creation_input_tokens + number(event.cache_creation_input_tokens), cost_usd_equivalent: sum.cost_usd_equivalent + number(event.cost_usd_equivalent), limit_events: sum.limit_events + (event.outcome === 'limited' || event.resume_at ? 1 : 0) }), { runs: 0, items_answered: 0, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cost_usd_equivalent: 0, limit_events: 0 });
  const valid = events.filter((event) => Number.isFinite(Date.parse(event.at)));
  const paused = valid.filter((event) => Date.parse(event.resume_at) > nowMs).at(-1)?.resume_at ?? null;
  return { generated_at: new Date(nowMs).toISOString(), today_utc: aggregate(valid.filter((event) => event.at.slice(0, 10) === today)), last_seven_days: aggregate(valid.filter((event) => Date.parse(event.at) >= since && Date.parse(event.at) <= nowMs)), paused_until: paused, cost_label: 'USD equivalent reported by Claude Code; not a subscription charge' };
}

function sanitizeClaudeResult(value, extra) {
  const result = { is_error: value.is_error === true, subtype: typeof value.subtype === 'string' ? value.subtype.slice(0, 100) : null, duration_ms: number(value.duration_ms), num_turns: number(value.num_turns), total_cost_usd: number(value.total_cost_usd), ...extra };
  for (const key of TOKEN_FIELDS) result[key] = number(value.usage?.[key]);
  if (value.modelUsage && typeof value.modelUsage === 'object' && !Array.isArray(value.modelUsage)) result.modelUsage = Object.fromEntries(Object.entries(value.modelUsage).map(([model, usage]) => [model.slice(0, 100), Object.fromEntries(TOKEN_FIELDS.map((key) => [key, number(usage?.[key] ?? usage?.[snakeToCamel(key)])]))]));
  return result;
}
function parseResetTime(text, nowMs, backoffMs) { const match = text.match(/\b(20\d\d-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d))\b/); return match && Number.isFinite(Date.parse(match[1])) ? new Date(Date.parse(match[1])).toISOString() : new Date(nowMs + backoffMs).toISOString(); }
function number(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0; }
function snakeToCamel(value) { return value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase()); }
async function readSummary(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } }
async function atomicJson(path, value) { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await rename(temp, path); }
export function runClaude(command, args, { cwd, timeoutMs }) { return new Promise((resolve, reject) => { const child = spawn(command, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'ignore'] }); let stdout = ''; let timedOut = false; child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { stdout += chunk; }); const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeoutMs); child.once('error', (error) => { clearTimeout(timer); reject(error); }); child.once('close', (code, signal) => { clearTimeout(timer); resolve({ exitCode: code, signal, stdout, timeout: timedOut }); }); }); }
