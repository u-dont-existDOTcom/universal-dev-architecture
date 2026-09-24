/**
 * Experimental, side-effect-free provider boundary. No process, network, credential,
 * admission, scheduler or deployment operations occur in this module.
 * An existing trusted controller must authorize and execute any prepared plan.
 */
import { isAbsolute } from 'node:path';
import { TextDecoder } from 'node:util';

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const BUILT_INS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,179}$/;
const SHA = /^[a-f0-9]{64}$/;
const exact = (pattern, value) => typeof value === 'string' && value === value.trim() && pattern.test(value);
const MODEL = /^claude-[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/;
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const check = (ok, code) => { if (!ok) throw new CompatibilityError(code); };
const nonempty = (v, max = 8000) => typeof v === 'string' && v.trim().length > 0
  && v.length <= max && !v.includes('\0');
const boundedInt = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const strings = (v, max = 100) => Array.isArray(v) && v.length <= max
  && v.every((s) => nonempty(s, 8000));
const keys = (value, required, optional = []) => {
  check(plain(value), 'OBJECT_REQUIRED');
  check(required.every((k) => Object.hasOwn(value, k)), 'REQUIRED_FIELD_MISSING');
  check(Object.keys(value).every((k) => [...required, ...optional].includes(k)), 'UNKNOWN_FIELD');
};
const freeze = (value) => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export class CompatibilityError extends Error {
  constructor(code) { super(code); this.name = 'CompatibilityError'; this.code = code; }
}

/** Capability declarations are not permission or live-verification receipts. */
export const CAPABILITIES = freeze({
  schemaVersion: 1,
  claudeCode: {
    provider: 'anthropic', surface: 'claude-code-cli', implementation: 'OFFLINE_CANDIDATE',
    rolesRepresentable: ['reasoning', 'execution', 'review'], rolesImplemented: ['execution'],
    session: { start: 'planned', resume: 'planned', fork: 'not_implemented' },
    model: { setter: true, observation: 'CLIENT_REPORTED_NOT_INDEPENDENT_ATTESTATION' },
    effort: { setter: true, observation: 'UNAVAILABLE' },
    remoteMcpConfiguration: true, mcpAuthentication: 'EXTERNAL_EXISTING_OAUTH',
    permissionEnforcement: 'HOST_AND_PROVIDER_NOT_THIS_MODULE',
    cancellation: 'HOST_REQUIRED_NOT_IMPLEMENTED',
    liveLaunch: false, grantsAuthority: false,
  },
  existingOpenAI: {
    provider: 'openai', implementation: 'DELEGATION_ONLY',
    preservesExistingAdmission: true, grantsAuthority: false,
    capabilities: 'DEFER_TO_EXISTING_EXACT_SURFACE_AND_PROFILE',
  },
});

const bindingSchema = {
  type: 'object', additionalProperties: false,
  required: ['taskId', 'directiveId', 'revision', 'directiveSha256'],
  properties: {
    taskId: { type: 'string', pattern: TOKEN.source },
    directiveId: { type: 'string', pattern: TOKEN.source },
    revision: { type: 'integer', minimum: 1 },
    directiveSha256: { type: 'string', pattern: SHA.source },
  },
};

/** Deliberately an execution report, not an approval or an owner-outcome verdict. */
export const WORKER_REPORT_SCHEMA = freeze({
  type: 'object', additionalProperties: false,
  required: ['runId', 'binding', 'status', 'summary', 'artifacts', 'tests', 'blockers'],
  properties: {
    runId: { type: 'string', pattern: TOKEN.source }, binding: bindingSchema,
    status: { type: 'string', enum: ['completed', 'blocked', 'failed'] },
    summary: { type: 'string', minLength: 1, maxLength: 8000 },
    artifacts: { type: 'array', maxItems: 100,
      items: { type: 'string', minLength: 1, maxLength: 8000 } },
    tests: { type: 'array', maxItems: 100, items: {
      type: 'object', additionalProperties: false, required: ['command', 'status'],
      properties: { command: { type: 'string', minLength: 1, maxLength: 8000 },
        status: { type: 'string', enum: ['passed', 'failed', 'not_run'] } },
    } },
    blockers: { type: 'array', maxItems: 100,
      items: { type: 'string', minLength: 1, maxLength: 8000 } },
  },
});

function validateBinding(b) {
  keys(b, ['taskId', 'directiveId', 'revision', 'directiveSha256']);
  check(exact(TOKEN, b.taskId)
    && exact(TOKEN, b.directiveId)
    && boundedInt(b.revision, 1, Number.MAX_SAFE_INTEGER)
    && exact(SHA, b.directiveSha256), 'INVALID_BINDING');
}
function sameBinding(a, b) {
  return ['taskId', 'directiveId', 'revision', 'directiveSha256'].every((k) => a[k] === b[k]);
}
/**
 * A resume request is its own authorized artifact: its digest covers the session block,
 * including the exact previous binding, so it can never equal the previous digest.
 * Lineage therefore means same task, strictly newer revision, and the exact previous
 * binding (digest included) carried inside the newly authorized bytes. The directive id
 * may change: Mission Control records each directive id once per worker, so a later
 * revision is normally a new directive record.
 */
function resumesLineage(current, previous) {
  return current.taskId === previous.taskId
    && previous.revision < current.revision && previous.directiveSha256 !== current.directiveSha256;
}

export function validateRequest(input) {
  keys(input, ['schemaVersion', 'runId', 'binding', 'provider', 'surface', 'role',
    'session', 'selection', 'workspace', 'instruction', 'limits', 'access', 'billing']);
  const r = structuredClone(input);
  check(r.schemaVersion === 1, 'UNSUPPORTED_SCHEMA');
  check(r.provider === 'anthropic' && r.surface === 'claude-code-cli', 'UNSUPPORTED_SURFACE');
  check(r.role === 'execution', 'ROLE_REQUIRES_SEPARATE_IMPLEMENTATION');
  check(exact(TOKEN, r.runId), 'INVALID_RUN_ID');
  validateBinding(r.binding);
  keys(r.session, ['id', 'mode'], ['previousBinding']);
  check(exact(UUID, r.session.id), 'INVALID_SESSION_ID');
  check(['new', 'resume'].includes(r.session.mode), 'INVALID_SESSION_MODE');
  if (r.session.mode === 'resume') {
    validateBinding(r.session.previousBinding);
    check(resumesLineage(r.binding, r.session.previousBinding), 'RESUME_BINDING_MISMATCH');
  } else check(r.session.previousBinding === undefined, 'UNEXPECTED_PREVIOUS_BINDING');
  keys(r.selection, ['model', 'effort', 'assurance', 'expensiveEffortApproved']);
  check(exact(MODEL, r.selection.model), 'PINNED_MODEL_REQUIRED');
  check(EFFORTS.includes(r.selection.effort), 'UNSUPPORTED_EFFORT');
  check(typeof r.selection.expensiveEffortApproved === 'boolean', 'INVALID_EFFORT_APPROVAL');
  check(!['xhigh', 'max'].includes(r.selection.effort) || r.selection.expensiveEffortApproved,
    'EXPENSIVE_EFFORT_NOT_APPROVED');
  check(['set_request', 'client_reported_model', 'independent_model_and_effort'].includes(r.selection.assurance),
    'INVALID_ASSURANCE');
  check(r.selection.assurance !== 'independent_model_and_effort', 'ASSURANCE_UNAVAILABLE');
  check(nonempty(r.workspace, 4096) && isAbsolute(r.workspace), 'ABSOLUTE_WORKSPACE_REQUIRED');
  check(nonempty(r.instruction, 250000), 'INVALID_INSTRUCTION');
  keys(r.limits, ['maxTurns', 'maxWallTimeMs', 'maxStreamBytes']);
  check(boundedInt(r.limits.maxTurns, 1, 1000), 'INVALID_TURN_LIMIT');
  check(boundedInt(r.limits.maxWallTimeMs, 1000, 86400000), 'INVALID_WALL_LIMIT');
  check(boundedInt(r.limits.maxStreamBytes, 1024, 67108864), 'INVALID_STREAM_LIMIT');
  check(r.billing === 'subscription', 'BILLING_ROUTE_NOT_IMPLEMENTED');
  keys(r.access, ['builtInTools', 'autoApprove', 'mcpServers']);
  check(Array.isArray(r.access.builtInTools) && r.access.builtInTools.every((t) => BUILT_INS.includes(t))
    && new Set(r.access.builtInTools).size === r.access.builtInTools.length, 'INVALID_BUILTIN_TOOLS');
  check(strings(r.access.autoApprove) && r.access.autoApprove.every((rule) =>
    /^[A-Za-z][^\r\n\0]{0,399}$/.test(rule)), 'INVALID_PERMISSION_RULE');
  check(plain(r.access.mcpServers) && Object.keys(r.access.mcpServers).length <= 30, 'INVALID_MCP_CONFIG');
  for (const [name, server] of Object.entries(r.access.mcpServers)) {
    check(/^[a-z][a-z0-9_-]{0,29}$/.test(name), 'INVALID_MCP_NAME');
    keys(server, ['type', 'url']);
    check(server.type === 'http' && typeof server.url === 'string', 'REMOTE_HTTP_ONLY');
    let url;
    try { url = new URL(server.url); } catch { throw new CompatibilityError('INVALID_MCP_URL'); }
    check(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash,
      'MCP_URL_MUST_NOT_CONTAIN_CREDENTIALS');
  }
  return freeze(r);
}

export function validateWorkerReport(value, request) {
  const r = validateRequest(request);
  keys(value, ['runId', 'binding', 'status', 'summary', 'artifacts', 'tests', 'blockers']);
  validateBinding(value.binding);
  check(value.runId === r.runId && sameBinding(value.binding, r.binding), 'REPORT_BINDING_MISMATCH');
  check(['completed', 'blocked', 'failed'].includes(value.status), 'INVALID_REPORT_STATUS');
  check(nonempty(value.summary) && strings(value.artifacts) && strings(value.blockers), 'INVALID_REPORT_TEXT');
  check(Array.isArray(value.tests) && value.tests.length <= 100, 'INVALID_TEST_REPORTS');
  for (const t of value.tests) {
    keys(t, ['command', 'status']);
    check(nonempty(t.command) && ['passed', 'failed', 'not_run'].includes(t.status), 'INVALID_TEST_REPORT');
  }
  check(value.status !== 'blocked' || value.blockers.length > 0, 'BLOCKED_REASON_REQUIRED');
  return freeze(structuredClone(value));
}

/** Tool-name prefix Claude Code gives a server's tools, e.g. "claude.ai Railway" -> "mcp__claude_ai_Railway__". */
export function mcpServerToolPrefix(serverName) {
  return `mcp__${String(serverName).replace(/[^A-Za-z0-9_-]/g, '_')}__`;
}
export function approvedMcpRules(request) {
  return validateRequest(request).access.autoApprove.filter((rule) => rule.startsWith('mcp__'));
}
/** True when an approval rule targets the given server (whole-server rule or one of its tools). */
export function mcpRuleTargetsServer(rule, serverName) {
  const prefix = mcpServerToolPrefix(serverName);
  return rule === prefix.slice(0, -2) || rule.startsWith(prefix);
}

/**
 * Produces argv, never a shell string. The prompt stays in stdin, not process argv.
 * hostContext.deniedMcpServerNames comes from the trusted host preflight: every configured MCP
 * server except the ones an exact approval needs, so unrelated connectors never enter the session.
 */
export function prepareClaudeCode(request, hostContext = {}) {
  const r = validateRequest(request);
  keys(hostContext, [], ['deniedMcpServerNames']);
  const deniedServers = hostContext.deniedMcpServerNames ?? [];
  check(Array.isArray(deniedServers) && deniedServers.length <= 200
    && deniedServers.every((name) => typeof name === 'string' && name === name.trim()
      && /^[^\r\n\0]{1,200}$/.test(name))
    && new Set(deniedServers).size === deniedServers.length, 'INVALID_MCP_DENY_LIST');
  const deny = ['Agent', 'Task', 'Skill'];
  const explicitMcpApproval = r.access.autoApprove.some((rule) => rule.startsWith('mcp__'));
  if (Object.keys(r.access.mcpServers).length === 0 && !explicitMcpApproval) deny.push('mcp__*');
  // Live evidence (Claude Code 2.1.281, 2026-09-24): --strict-mcp-config removes the account's
  // claude.ai connectors from the session. Keep strict isolation by default; drop it only when the
  // source-bound request approves an exact MCP tool. Under dontAsk every other tool stays denied.
  const mcpIsolation = explicitMcpApproval ? [] : ['--strict-mcp-config'];
  // Lifting strict isolation exposed all 168 connector tools and raised a run's usage ~16x in live
  // acceptance. deniedMcpServers (honoured from --settings, matches claude.ai connectors by display
  // name) keeps every server except the approved one out of the session.
  const connectorNarrowing = explicitMcpApproval && deniedServers.length
    ? ['--settings', JSON.stringify({ deniedMcpServers: [...deniedServers].sort().map((serverName) => ({ serverName })) })]
    : [];
  const argv = ['--print', '--verbose', '--output-format', 'stream-json',
    '--model', r.selection.model, '--effort', r.selection.effort,
    r.session.mode === 'new' ? '--session-id' : '--resume', r.session.id,
    '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none', '--restricted', '--disable-slash-commands', '--no-chrome',
    ...mcpIsolation, '--mcp-config', JSON.stringify({ mcpServers: r.access.mcpServers }),
    '--tools', r.access.builtInTools.join(','), '--disallowedTools', deny.join(','),
    ...connectorNarrowing,
    '--json-schema', JSON.stringify(WORKER_REPORT_SCHEMA)];
  if (r.access.autoApprove.length) argv.push('--allowedTools', ...r.access.autoApprove);
  return freeze({
    schemaVersion: 1, provider: r.provider, surface: r.surface,
    runId: r.runId, binding: r.binding, command: 'claude', argv, cwd: r.workspace,
    stdin: `${r.instruction}\n\nReturn the structured execution report with runId ${JSON.stringify(r.runId)} and binding ${JSON.stringify(r.binding)}. Report only work actually performed; do not claim supervisory approval or owner-outcome completion.\n`,
    limits: r.limits, billing: r.billing, launchAuthorized: false,
    automaticRetries: 0, automaticFallback: false, subagentsRequested: false,
    requiredHostChecks: [
      'EXISTING_AUTHENTICATED_ADMISSION_AND_SOURCE_BINDING',
      'CURRENT_CLI_VERSION_AND_FLAG_COMPATIBILITY',
      'SUBSCRIPTION_AUTH_AND_NO_API_OR_PROVIDER_OVERRIDES',
      'EFFECTIVE_SETTINGS_HOOKS_AND_TOOL_PERMISSION_SCOPE',
      'MCP_OAUTH_AND_SERVER_SIDE_AUTHORIZATION',
      'SESSION_ID_RESERVATION_OR_TRUSTED_RESUME_BINDING',
      'WALL_CLOCK_CANCELLATION_AND_PROCESS_TREE_CLEANUP',
      'TURN_LIMIT_RECEIPT_ENFORCEMENT',
    ],
  });
}

/**
 * Bounded NDJSON collector. It never preserves thinking, tool inputs, raw logs,
 * assistant prose, or the whole event stream. The validated final worker report
 * is PRIVATE task data and still needs destination-specific disclosure checks.
 */
export function createClaudeCollector(request) {
  const r = validateRequest(request);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const problems = new Set();
  const models = new Set();
  let buffer = '', bytes = 0, eventCount = 0, initialized = false;
  let result = null, closed = false, denials = 0, subagentsSeen = false;
  const MAX_LINE_BYTES = Math.min(r.limits.maxStreamBytes, 1048576);

  function consume(line) {
    if (!line.trim()) return;
    if (++eventCount > 50000) { problems.add('EVENT_LIMIT'); return; }
    let e;
    try { e = JSON.parse(line); } catch { problems.add('MALFORMED_JSON'); return; }
    if (!plain(e) || typeof e.type !== 'string') { problems.add('INVALID_EVENT'); return; }
    if (e.parent_tool_use_id != null) { subagentsSeen = true; return; }
    if (['system', 'assistant', 'result'].includes(e.type) && e.session_id !== undefined
      && e.session_id !== r.session.id) { problems.add('SESSION_MISMATCH'); return; }
    if (e.type === 'system' && e.subtype === 'init') {
      if (initialized) problems.add('DUPLICATE_INIT');
      if (e.session_id !== r.session.id) problems.add('SESSION_MISMATCH');
      initialized = true;
      if (e.model !== undefined) {
        if (exact(MODEL, e.model)) models.add(e.model);
        else problems.add('INVALID_MODEL_FIELD');
      }
    }
    if (e.type === 'assistant' && plain(e.message) && typeof e.message.model === 'string') {
      if (exact(MODEL, e.message.model)) models.add(e.message.model);
      else problems.add('INVALID_MODEL_FIELD');
    }
    if (e.type === 'permission_denied') denials += 1;
    if (e.type === 'result') {
      if (result !== null) { problems.add('DUPLICATE_RESULT'); return; }
      if (e.session_id !== r.session.id) problems.add('SESSION_MISMATCH');
      // Do not retain unknown fields; provider errors can contain prompts/secrets.
      result = {
        subtype: typeof e.subtype === 'string' ? e.subtype : null,
        isError: e.is_error, report: e.structured_output,
        denialCount: Array.isArray(e.permission_denials) ? e.permission_denials.length : 0,
        estimatedCost: Number.isFinite(e.total_cost_usd) && e.total_cost_usd >= 0 ? e.total_cost_usd : null,
        turns: boundedInt(e.num_turns, 0, Number.MAX_SAFE_INTEGER) ? e.num_turns : null,
      };
    }
  }

  function drain() {
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) problems.add('LINE_LIMIT');
      else consume(line);
    }
    if (Buffer.byteLength(buffer) > MAX_LINE_BYTES) { problems.add('LINE_LIMIT'); buffer = ''; }
  }

  return Object.freeze({
    write(chunk) {
      check(!closed, 'COLLECTOR_CLOSED');
      check(typeof chunk === 'string' || chunk instanceof Uint8Array, 'INVALID_CHUNK');
      const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      bytes += data.byteLength;
      if (bytes > r.limits.maxStreamBytes) { problems.add('STREAM_LIMIT'); buffer = ''; return; }
      if (problems.has('STREAM_LIMIT') || problems.has('INVALID_UTF8')) return;
      try { buffer += decoder.decode(data, { stream: true }); drain(); }
      catch { problems.add('INVALID_UTF8'); buffer = ''; }
    },
    finish(termination) {
      check(!closed, 'COLLECTOR_CLOSED');
      // aborted: the trusted transport stopped this run on request. The CLI may trap SIGTERM and exit with
      // a code (live 2.1.281 exits 143) instead of dying by signal; both are the same operator interruption.
      keys(termination, ['exitCode', 'signal', 'timedOut'], ['aborted']);
      check(termination.exitCode === null || boundedInt(termination.exitCode, 0, 255), 'INVALID_EXIT_CODE');
      check(termination.signal === null || ['SIGINT', 'SIGTERM', 'SIGKILL'].includes(termination.signal),
        'INVALID_SIGNAL');
      check(typeof termination.timedOut === 'boolean', 'INVALID_TIMEOUT');
      check(termination.aborted === undefined || typeof termination.aborted === 'boolean', 'INVALID_ABORT');
      closed = true;
      if (!problems.has('STREAM_LIMIT') && !problems.has('INVALID_UTF8')) {
        try { buffer += decoder.decode(); drain(); if (buffer.trim()) consume(buffer); }
        catch { problems.add('INVALID_UTF8'); }
      }
      buffer = '';
      if (!initialized) problems.add('INIT_MISSING');
      if (!result) problems.add('RESULT_MISSING');
      if (subagentsSeen) problems.add('UNREQUESTED_SUBAGENT_ACTIVITY');
      const observedModels = [...models].sort();
      if (observedModels.some((m) => m !== r.selection.model)) problems.add('MODEL_MISMATCH');
      if (r.selection.assurance === 'client_reported_model' && observedModels.length === 0)
        problems.add('MODEL_OBSERVATION_MISSING');
      let report = null;
      if (result?.subtype === 'success' && result.isError === false) {
        try { report = validateWorkerReport(result.report, r); }
        catch (error) { problems.add(error instanceof CompatibilityError ? error.code : 'INVALID_REPORT'); }
      }
      if (result?.turns !== null && result?.turns !== undefined && result.turns > r.limits.maxTurns)
        problems.add('TURN_LIMIT');
      const permissionDenials = Math.max(denials, result?.denialCount ?? 0);
      let status;
      if (termination.timedOut) status = 'TIMED_OUT';
      else if (termination.signal !== null || termination.aborted === true) status = 'INTERRUPTED';
      else if (problems.size === 1 && problems.has('TURN_LIMIT')) status = 'LIMIT_REACHED';
      else if (problems.size) status = 'RESULT_INVALID';
      else if (['error_max_turns', 'error_max_budget_usd'].includes(result.subtype)
        && result.isError === true) status = 'LIMIT_REACHED';
      else if (termination.exitCode !== 0) status = 'TRANSPORT_FAILED';
      else if (result.subtype !== 'success' || result.isError !== false) status = 'PROVIDER_FAILED';
      else if (report?.status === 'completed') status = 'EXECUTION_REPORTED_COMPLETE';
      else if (report?.status === 'blocked') status = permissionDenials ? 'PERMISSION_BLOCKED' : 'EXECUTION_REPORTED_BLOCKED';
      else status = 'EXECUTION_REPORTED_FAILED';
      const receipt = {
        schemaVersion: 1, runId: r.runId, binding: r.binding,
        provider: r.provider, surface: r.surface, providerSessionId: r.session.id,
        status, reasonCodes: [...problems].sort(),
        termination: structuredClone(termination), permissionDenials,
        modelEvidence: { requested: r.selection.model, observed: observedModels,
          evidence: observedModels.length ? 'CLIENT_REPORTED' : 'UNOBSERVED', independentAttestation: false },
        effortEvidence: { requested: r.selection.effort, observed: null, evidence: 'SET_REQUEST_ONLY' },
        usage: { billingRouteRequested: r.billing, cliEstimatedCostUsd: result?.estimatedCost ?? null,
          estimateScope: 'PROVIDER_SESSION_ESTIMATE_NOT_INVOICE_OR_RUN_DELTA',
          weeklyAllowancePercent: null, numTurns: result?.turns ?? null },
        report, verification: 'WORKER_REPORT_ONLY',
        grantsAuthorization: false, ownerOutcomeSatisfied: null,
      };
      // Remove potentially private final content from closure after producing receipt.
      result = null;
      return freeze(receipt);
    },
  });
}

/** Exact old arguments/result remain owned by the existing OpenAI dispatcher. */
export function delegateExistingOpenAI(existingDispatcher, originalArguments) {
  check(typeof existingDispatcher === 'function', 'EXISTING_DISPATCHER_REQUIRED');
  return existingDispatcher(originalArguments);
}

/** Read-only projection: never substitutes for the existing Zod/admission validation. */
export function describeExistingOpenAIProfile(profile) {
  check(plain(profile), 'PROFILE_REQUIRED');
  const names = { GPT_5_6_SOL: 'gpt-5.6-sol', GPT_6_ASTRA: 'gpt-6-astra' };
  check(Object.hasOwn(names, profile.model) && ['LOW', 'MEDIUM', 'HIGH', 'XHIGH', 'MAX'].includes(profile.effort),
    'UNRECOGNIZED_EXISTING_PROFILE');
  return freeze({ provider: 'openai', modelRequested: names[profile.model],
    effortRequested: profile.effort.toLowerCase(), existingProfile: structuredClone(profile),
    validation: 'DEFER_TO_EXISTING_PROFILE_VALIDATOR', grantsAuthorization: false });
}
