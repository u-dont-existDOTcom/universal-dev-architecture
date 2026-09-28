import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function renderStatusPage(stateDir) {
  const journal = await json(join(stateDir, 'journal-work-status.json')) ?? {};
  const claude = await json(join(stateDir, 'claude-usage-summary.json')) ?? {};
  const current = journal.current ?? {};
  const today = journal.today ?? {};
  const backoff = journal.backoff ?? {};
  const imported = journal.lastImport ?? {};
  const residual = imported.residualCounts ?? {};
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="30"><meta name="viewport" content="width=device-width"><title>Mission Control journal status</title><style>body{font:16px system-ui;max-width:64rem;margin:2rem auto;padding:0 1rem;background:#111;color:#eee}section{border:1px solid #444;border-radius:.5rem;padding:1rem;margin:1rem 0}dt{font-weight:700}dd{margin:0 0 .7rem}code{color:#9ee}</style></head><body><h1>Journal status</h1>${section('Journal runner', [['Current role', current.role], ['Ladder rung', current.rung], ['Answered today', today.answered], ['Expired today', today.expired], ['Waiting', today.waiting], ['Back-off trigger', backoff.trigger], ['Back-off until', backoff.until]])}${section('Claude lane', [['Runs today (UTC)', claude.today_utc?.runs], ['Items answered today', claude.today_utc?.items_answered], ['Tokens today', tokenTotal(claude.today_utc)], ['USD equivalent (not a subscription charge)', claude.today_utc?.cost_usd_equivalent], ['Limit events today', claude.today_utc?.limit_events], ['Runs, last seven days', claude.last_seven_days?.runs], ['Items answered, last seven days', claude.last_seven_days?.items_answered], ['Tokens, last seven days', tokenTotal(claude.last_seven_days)], ['USD equivalent, last seven days (not a subscription charge)', claude.last_seven_days?.cost_usd_equivalent], ['Limit events, last seven days', claude.last_seven_days?.limit_events], ['Sending paused until', claude.paused_until]])}${section('Last import run', [['Stage', imported.stage], ['Blocker', imported.blocker], ['Completed units', imported.completedUnits], ['Residual counts', residual], ['Hardest sent today', residual.hardest_sent_today ?? imported.hardestSentToday], ['Hardest daily limit', residual.hardest_daily_limit ?? imported.hardestDailyLimit]])}</body></html>`;
}

export function createStatusServer({ stateDir, port = 8787 }) {
  return createServer(async (request, response) => {
    if (request.method !== 'GET' || request.url !== '/') { response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); response.end('Not found\n'); return; }
    const page = await renderStatusPage(stateDir);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" }); response.end(page);
  }).listen(port, '127.0.0.1');
}

function section(title, rows) { return `<section><h2>${escape(title)}</h2><dl>${rows.map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(display(value))}</dd>`).join('')}</dl></section>`; }
function display(value) { if (value === null || value === undefined) return '—'; if (typeof value === 'object') return JSON.stringify(value); return String(value); }
function escape(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function tokenTotal(value = {}) { return ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].reduce((sum, key) => sum + (Number(value?.[key]) || 0), 0); }
async function json(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } }
