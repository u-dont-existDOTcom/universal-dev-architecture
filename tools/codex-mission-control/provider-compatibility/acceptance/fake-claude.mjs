#!/usr/bin/env node
// Offline stand-in for the Claude Code CLI used only by the acceptance-harness self-test.
// It never performs inference. It mimics the stream-json event shapes the adapter consumes.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FLAGS = ['--print', '--verbose', '--output-format', '--model', '--effort', '--permission-mode',
  '--permission-prompts', '--restricted', '--disable-slash-commands', '--no-chrome', '--strict-mcp-config',
  '--mcp-config', '--tools', '--disallowedTools', '--json-schema', '--settings'];
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('2.1.281 (Claude Code)'); process.exit(0); }
if (args[0] === '--help') { console.log(FLAGS.join(' ')); process.exit(0); }
if (args[0] === 'mcp' && args[1] === 'list') {
  console.log('Checking MCP server health…\n\nclaude.ai Railway: https://mcp.example.invalid/railway - ✔ Connected\n'
    + 'claude.ai Gmail: https://mcp.example.invalid/gmail - ✔ Connected\n'
    + 'claude.ai Google Calendar: https://mcp.example.invalid/gcal - ! Needs authentication');
  process.exit(0);
}
if (args[0] === 'auth' && args[1] === 'status') {
  console.log(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max' }));
  process.exit(0);
}
for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) {
  if (process.env[key]) process.exit(72);
}
const value = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const resume = args.includes('--resume');
const sid = value('--session-id') ?? value('--resume');
const model = value('--model');
const tools = (value('--tools') ?? '').split(',').filter(Boolean);
const allowIndex = args.indexOf('--allowedTools');
const allowed = allowIndex === -1 ? [] : args.slice(allowIndex + 1).filter((a) => !a.startsWith('--'));
const disallowed = (value('--disallowedTools') ?? '').split(',');
const stateDir = process.env.FAKE_CLAUDE_STATE_DIR;
// Mirrors live 2.1.281 behavior: --strict-mcp-config hides the account's claude.ai connectors;
// --settings deniedMcpServers keeps the named servers out of the session.
const CONNECTOR_TOOLS = { 'claude.ai Railway': ['mcp__claude_ai_Railway__whoami', 'mcp__claude_ai_Railway__list-projects'],
  'claude.ai Gmail': ['mcp__claude_ai_Gmail__search_threads'] };
const deniedServers = new Set((JSON.parse(value('--settings') ?? '{}').deniedMcpServers ?? []).map((entry) => entry.serverName));
const mcpVisible = disallowed.includes('mcp__*') || args.includes('--strict-mcp-config') ? []
  : Object.entries(CONNECTOR_TOOLS).filter(([server]) => !deniedServers.has(server)).flatMap(([, tools]) => tools);
const out = (event) => process.stdout.write(`${JSON.stringify({ session_id: sid, ...event })}\n`);

let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', run);

function run() {
  if (resume && !existsSync(join(stateDir, sid))) {
    out({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 0 });
    process.exit(1);
  }
  // Live 2.1.281 traps SIGTERM and exits 143 rather than dying by signal. Installed before init so the
  // harness's abort (sent after it sees init) always exercises that path.
  if (prompt.includes('ACCEPTANCE_RUN_C')) process.on('SIGTERM', () => process.exit(143));
  out({ type: 'system', subtype: 'init', model, tools: [...tools, ...mcpVisible],
    mcp_servers: mcpVisible.length ? Object.keys(CONNECTOR_TOOLS).filter((name) => !deniedServers.has(name)).map((name) => ({ name, status: 'connected' })) : [],
    permissionMode: value('--permission-mode') });
  const binding = JSON.parse(prompt.match(/binding (\{.*?\})\. Report/)[1]);
  const runId = JSON.parse(prompt.match(/runId ("[^"]+")/)[1]);
  if (prompt.includes('ACCEPTANCE_RUN_C')) {
    spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    out({ type: 'assistant', message: { model, content: [{ type: 'text', text: 'PRIVATE_ASSISTANT_TEXT' }] } });
    setInterval(() => {}, 1000);
    return;
  }
  const denials = []; const artifacts = []; const blockers = [];
  let n = 0;
  const use = (name, ok, input) => {
    const id = `toolu_${++n}`;
    out({ type: 'assistant', message: { model, content: [{ type: 'tool_use', id, name, input }] } });
    out({ type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: !ok,
      content: ok ? 'SECRET_TOOL_RESULT' : 'Permission denied' }] } });
    return id;
  };
  if (prompt.includes('ACCEPTANCE_RUN_A')) {
    const readOk = tools.includes('Read') && allowed.includes('Read');
    const content = readFileSync(join(process.cwd(), 'fixture.txt'), 'utf8').trim();
    use('Read', readOk, { file_path: 'fixture.txt' });
    if (readOk) artifacts.push(content);
    const writeAllowed = tools.includes('Write') && allowed.includes('Write');
    const writeId = use('Write', writeAllowed, { file_path: 'denied-write.txt', content: 'x' });
    if (writeAllowed) writeFileSync(join(process.cwd(), 'denied-write.txt'), 'x');
    else { denials.push({ tool_name: 'Write', tool_use_id: writeId, tool_input: { file_path: 'denied-write.txt' } }); blockers.push('WRITE_DENIED_AS_EXPECTED'); }
    const m = prompt.match(/Call the MCP tool (mcp__\S+) exactly once/);
    if (m) {
      if (mcpVisible.includes(m[1]) && allowed.includes(m[1])) use(m[1], true, {});
      else blockers.push('MCP_TOOL_NOT_AVAILABLE');
    }
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, sid), content);
  }
  if (prompt.includes('ACCEPTANCE_RUN_B')) artifacts.push(readFileSync(join(stateDir, sid), 'utf8'));
  // The real CLI delivers --json-schema output through a synthetic StructuredOutput tool call.
  use('StructuredOutput', true, { structured: true });
  out({ type: 'assistant', message: { model, content: [{ type: 'thinking', thinking: 'SECRET_THINKING' },
    { type: 'text', text: 'PRIVATE_ASSISTANT_TEXT' }] } });
  out({ type: 'result', subtype: 'success', is_error: false, num_turns: n + 1, total_cost_usd: 0, permission_denials: denials,
    structured_output: { runId, binding, status: 'completed', summary: 'PRIVATE_REPORT_SUMMARY', artifacts, tests: [], blockers } });
}
