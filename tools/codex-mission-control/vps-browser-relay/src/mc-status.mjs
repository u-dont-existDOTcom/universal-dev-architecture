import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildUsageSummary } from './journal-claude-worker.mjs';

export async function renderStatusPage(stateDir, now = Date.now) {
  const journal = await readJson(join(stateDir, 'journal-work-status.json')) ?? {};
  const storedClaude = await readJson(join(stateDir, 'claude-usage-summary.json')) ?? {};
  const usageEvents = await readUsageEvents(join(stateDir, 'claude-usage.jsonl'));
  const claude = usageEvents === null
    ? storedClaude
    : { ...storedClaude, ...buildUsageSummary(usageEvents, now()) };
  const current = isRecord(journal.current) ? journal.current : {};
  const today = isRecord(journal.today) ? journal.today : {};
  const backoff = isRecord(journal.backoff) ? journal.backoff : {};
  const imported = latestImport(journal.lastImport, claude.last_import);
  const residuals = plainCounts(imported.residuals);
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta http-equiv="refresh" content="30">',
    '<meta name="viewport" content="width=device-width">',
    '<title>Mission Control journal status</title>',
    '<style>body{font:16px system-ui;max-width:64rem;margin:2rem auto;padding:0 1rem;background:#111;color:#eee}section{border:1px solid #444;border-radius:.5rem;padding:1rem;margin:1rem 0}dt{font-weight:700}dd{margin:0 0 .7rem}code{color:#9ee}</style>',
    '</head><body><h1>Journal status</h1>',
    section('Journal runner', [
      ['Current role', current.role],
      ['Ladder rung', current.rung],
      ['Answered today', today.answered],
      ['Expired today', today.expired],
      ['Waiting', today.waiting],
      ['Back-off trigger', backoff.trigger],
      ['Back-off until', backoff.until],
    ]),
    section('Claude lane', [
      ['Runs today (UTC)', claude.today_utc?.runs],
      ['Items answered today', claude.today_utc?.items_answered],
      ['Tokens today', tokenTotal(claude.today_utc)],
      ['USD equivalent (not a subscription charge)', claude.today_utc?.cost_usd_equivalent],
      ['Limit events today', claude.today_utc?.limit_events],
      ['Runs, last seven days', claude.last_seven_days?.runs],
      ['Items answered, last seven days', claude.last_seven_days?.items_answered],
      ['Tokens, last seven days', tokenTotal(claude.last_seven_days)],
      ['USD equivalent, last seven days (not a subscription charge)', claude.last_seven_days?.cost_usd_equivalent],
      ['Limit events, last seven days', claude.last_seven_days?.limit_events],
      ['Sending paused until', claude.paused_until],
    ]),
    section('Last import run', [
      ['Stage', imported.stage],
      ['Blocker', imported.blocker],
      ['Completed units', imported.completedUnits],
      ['Residual counts', residuals],
      ['Hardest sent today', residuals.hardest_sent_today],
      ['Hardest daily limit', residuals.hardest_daily_limit],
    ]),
    '</body></html>',
  ].join('');
}

export function createStatusServer({ stateDir, port = 8787 }) {
  return createServer(async (request, response) => {
    if (request.method !== 'GET' || request.url !== '/') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found\n');
      return;
    }
    const page = await renderStatusPage(stateDir);
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    });
    response.end(page);
  }).listen(port, '127.0.0.1');
}

function section(title, rows) {
  const body = rows
    .map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(display(value))}</dd>`)
    .join('');
  return `<section><h2>${escape(title)}</h2><dl>${body}</dl></section>`;
}

function display(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function tokenTotal(value = {}) {
  return [
    'input_tokens',
    'output_tokens',
    'cache_read_input_tokens',
    'cache_creation_input_tokens',
  ].reduce((sum, key) => sum + (Number(value?.[key]) || 0), 0);
}

function plainCounts(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, count]) => (
    /^[a-zA-Z0-9_-]{1,50}$/.test(key) && Number.isInteger(count) && count >= 0
  )));
}

function latestImport(...values) {
  return values
    .filter(isRecord)
    .sort((left, right) => importTime(right) - importTime(left))[0] ?? {};
}

function importTime(value) {
  const parsed = Date.parse(value.at);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

async function readUsageEvents(path) {
  let content;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    return error?.code === 'ENOENT' ? [] : null;
  }
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const event = JSON.parse(line);
        return isRecord(event) ? [event] : [];
      } catch {
        return [];
      }
    });
}
