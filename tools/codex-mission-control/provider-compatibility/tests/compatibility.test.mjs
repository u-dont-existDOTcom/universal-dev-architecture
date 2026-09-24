import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CAPABILITIES, WORKER_REPORT_SCHEMA, validateRequest, validateWorkerReport,
  prepareClaudeCode, createClaudeCollector, delegateExistingOpenAI,
  describeExistingOpenAIProfile,
} from '../compatibility.mjs';

function request() {
  return {
    schemaVersion: 1, runId: 'synthetic-run-1',
    binding: { taskId: 'synthetic-task', directiveId: 'synthetic-directive', revision: 1,
      directiveSha256: 'a'.repeat(64) },
    provider: 'anthropic', surface: 'claude-code-cli', role: 'execution',
    session: { mode: 'new', id: '550e8400-e29b-41d4-a716-446655440000' },
    selection: { model: 'claude-synthetic-test', effort: 'medium', assurance: 'set_request',
      expensiveEffortApproved: false },
    workspace: '/tmp/synthetic-workspace', instruction: 'Inspect this synthetic fixture only.',
    limits: { maxTurns: 3, maxWallTimeMs: 60000, maxStreamBytes: 1048576 },
    access: { builtInTools: ['Read'], autoApprove: [], mcpServers: {} }, billing: 'subscription',
  };
}
function report(r = request()) {
  return { runId: r.runId, binding: structuredClone(r.binding), status: 'completed',
    summary: 'Synthetic test completed.', artifacts: ['example.txt'],
    tests: [{ command: 'node --test synthetic.test.mjs', status: 'passed' }], blockers: [] };
}
function events(r = request()) {
  return [
    { type: 'system', subtype: 'init', session_id: r.session.id, model: r.selection.model },
    { type: 'assistant', session_id: r.session.id, message: { model: r.selection.model,
      content: [{ type: 'thinking', thinking: 'SECRET_THINKING_SENTINEL' },
        { type: 'text', text: 'PRIVATE_ASSISTANT_SENTINEL' }] } },
    { type: 'result', subtype: 'success', is_error: false, session_id: r.session.id,
      structured_output: report(r), num_turns: 2, total_cost_usd: 1.25,
      modelUsage: { 'background-unrelated-model': { costUSD: 0.01 } }, permission_denials: [] },
  ];
}
function receipt(es = events(), r = request(), end = {}) {
  const collector = createClaudeCollector(r);
  collector.write(es.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return collector.finish({ exitCode: 0, signal: null, timedOut: false, ...end });
}
function rejects(change, code) {
  const r = request(); change(r);
  assert.throws(() => prepareClaudeCode(r), { code });
}

test('plan preserves exact IDs, explicit effort, prompt privacy and no launch authority', () => {
  const r = request(); const p = prepareClaudeCode(r);
  assert.deepEqual(p.binding, r.binding);
  assert.equal(p.launchAuthorized, false);
  assert.ok(p.argv.includes('--session-id')); assert.ok(p.argv.includes('--restricted'));
  assert.equal(p.argv[p.argv.indexOf('--model') + 1], r.selection.model);
  assert.equal(p.argv[p.argv.indexOf('--effort') + 1], 'medium');
  assert.ok(p.stdin.includes(r.instruction)); assert.ok(!p.argv.includes(r.instruction));
  assert.equal(p.automaticRetries, 0); assert.equal(p.automaticFallback, false);
  assert.ok(!p.argv.includes('--bare')); assert.ok(!p.argv.includes('--fallback-model'));
  assert.ok(!p.argv.includes('--dangerously-skip-permissions'));
  assert.ok(!p.argv.includes('--max-budget-usd'));
  assert.ok(!p.argv.includes('--max-turns'));
  assert.ok(p.requiredHostChecks.includes('TURN_LIMIT_RECEIPT_ENFORCEMENT'));
  assert.ok(p.requiredHostChecks.includes('SUBSCRIPTION_AUTH_AND_NO_API_OR_PROVIDER_OVERRIDES'));
  assert.ok(Object.isFrozen(p.argv));
});
test('prepared plan is independent of later caller mutation', () => {
  const r = request(); const p = prepareClaudeCode(r); r.binding.revision = 999;
  assert.equal(p.binding.revision, 1);
});
test('new session cannot silently resume the latest session', () => {
  const p = prepareClaudeCode(request());
  assert.ok(!p.argv.includes('--continue')); assert.ok(!p.argv.includes('--resume'));
});
test('resume continues the same task lineage at a strictly newer revision', () => {
  const resume = () => {
    const r = request(); r.session.mode = 'resume';
    r.session.previousBinding = structuredClone(r.binding);
    r.binding.revision = 2; r.binding.directiveSha256 = 'b'.repeat(64);
    return r;
  };
  const p = prepareClaudeCode(resume());
  assert.ok(p.argv.includes('--resume')); assert.ok(!p.argv.includes('--session-id'));
  assert.equal(p.argv[p.argv.indexOf('--resume') + 1], request().session.id);
  // Mission Control records each directive id once, so a newer revision may carry a new id.
  const renamed = resume(); renamed.binding.directiveId = 'synthetic-directive-r2';
  assert.ok(prepareClaudeCode(renamed).argv.includes('--resume'));
  const mismatches = [
    (r) => { r.session.previousBinding = structuredClone(r.binding); },
    (r) => { r.binding.revision = 1; },
    (r) => { r.session.previousBinding.revision = 3; },
    (r) => { r.session.previousBinding.taskId = 'other-task'; },
    (r) => { r.session.previousBinding.directiveSha256 = r.binding.directiveSha256; },
  ];
  for (const mutate of mismatches) {
    const r = resume(); mutate(r);
    assert.throws(() => prepareClaudeCode(r), { code: 'RESUME_BINDING_MISMATCH' });
  }
  const missing = resume(); delete missing.session.previousBinding;
  assert.throws(() => prepareClaudeCode(missing), { code: 'OBJECT_REQUIRED' });
  const stray = request(); stray.session.previousBinding = structuredClone(stray.binding);
  assert.throws(() => prepareClaudeCode(stray), { code: 'UNEXPECTED_PREVIOUS_BINDING' });
});
test('schema rejects unknown instructions and unimplemented surfaces', () => {
  rejects((r) => { r.fallback = 'opus'; }, 'UNKNOWN_FIELD');
  rejects((r) => { r.surface = 'cowork'; }, 'UNSUPPORTED_SURFACE');
  rejects((r) => { r.role = 'review'; }, 'ROLE_REQUIRES_SEPARATE_IMPLEMENTATION');
});
test('invalid run, session and directive identities are rejected', () => {
  rejects((r) => { r.runId = ''; }, 'INVALID_RUN_ID');
  rejects((r) => { r.session.id = 'latest'; }, 'INVALID_SESSION_ID');
  rejects((r) => { r.binding.revision = 0; }, 'INVALID_BINDING');
  rejects((r) => { r.binding.directiveSha256 = 'missing'; }, 'INVALID_BINDING');
});
test('model aliases and metered billing cannot slip into the subscription plan', () => {
  rejects((r) => { r.selection.model = 'opus'; }, 'PINNED_MODEL_REQUIRED');
  rejects((r) => { r.billing = 'api'; }, 'BILLING_ROUTE_NOT_IMPLEMENTED');
});
test('expensive effort requires a separate explicit input; no bundled ultracode', () => {
  rejects((r) => { r.selection.effort = 'xhigh'; }, 'EXPENSIVE_EFFORT_NOT_APPROVED');
  rejects((r) => { r.selection.effort = 'max'; }, 'EXPENSIVE_EFFORT_NOT_APPROVED');
  rejects((r) => { r.selection.effort = 'ultracode'; }, 'UNSUPPORTED_EFFORT');
  const r = request(); r.selection.effort = 'xhigh'; r.selection.expensiveEffortApproved = true;
  assert.ok(prepareClaudeCode(r).argv.includes('xhigh'));
});
test('unobservable effort does not become a false independent-readback claim', () => {
  rejects((r) => { r.selection.assurance = 'independent_model_and_effort'; }, 'ASSURANCE_UNAVAILABLE');
  const s = receipt(); assert.equal(s.effortEvidence.observed, null);
  assert.equal(s.effortEvidence.evidence, 'SET_REQUEST_ONLY');
  assert.equal(s.modelEvidence.independentAttestation, false);
});
test('budgets and working directory must be explicit and bounded', () => {
  rejects((r) => { r.workspace = '.'; }, 'ABSOLUTE_WORKSPACE_REQUIRED');
  rejects((r) => { r.limits.maxTurns = Infinity; }, 'INVALID_TURN_LIMIT');
  rejects((r) => { r.limits.maxWallTimeMs = 0; }, 'INVALID_WALL_LIMIT');
  rejects((r) => { r.limits.maxStreamBytes = -1; }, 'INVALID_STREAM_LIMIT');
});
test('builtin list is restricted, agents and empty-config MCP denied', () => {
  rejects((r) => { r.access.builtInTools = ['Agent']; }, 'INVALID_BUILTIN_TOOLS');
  const p = prepareClaudeCode(request());
  assert.ok(p.argv.includes('Agent,Task,Skill,mcp__*'));
  assert.equal(p.argv[p.argv.indexOf('--tools') + 1], 'Read');
  assert.equal(p.argv[p.argv.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.equal(p.argv[p.argv.indexOf('--permission-prompts') + 1], 'none');
});
test('existing Claude.ai connectors stay denied by default but can be source-bound to an exact approved MCP tool', () => {
  const r = request();
  let p = prepareClaudeCode(r);
  assert.ok(p.argv.includes('Agent,Task,Skill,mcp__*'));
  assert.ok(p.argv.includes('--strict-mcp-config'));
  r.access.autoApprove = ['mcp__google_drive__synthetic_read'];
  p = prepareClaudeCode(r);
  assert.ok(!p.argv.includes('Agent,Task,Skill,mcp__*'));
  assert.ok(p.argv.includes('mcp__google_drive__synthetic_read'));
  // Strict MCP config hides claude.ai connectors (live 2.1.281 evidence), so an exact approval lifts it.
  assert.ok(!p.argv.includes('--strict-mcp-config'));
  assert.equal(p.argv[p.argv.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.deepEqual(JSON.parse(p.argv[p.argv.indexOf('--mcp-config') + 1]), { mcpServers: {} });
  assert.ok(!p.argv.includes('--settings'));
  p = prepareClaudeCode(r, { deniedMcpServerNames: ['claude.ai Gmail', 'claude.ai Desktop Commander'] });
  assert.deepEqual(JSON.parse(p.argv[p.argv.indexOf('--settings') + 1]),
    { deniedMcpServers: [{ serverName: 'claude.ai Desktop Commander' }, { serverName: 'claude.ai Gmail' }] });
  assert.equal(p.argv.at(-2), '--allowedTools');
  const unapproved = prepareClaudeCode(request(), { deniedMcpServerNames: ['claude.ai Gmail'] });
  assert.ok(!unapproved.argv.includes('--settings')); assert.ok(unapproved.argv.includes('--strict-mcp-config'));
  for (const bad of [[''], [' padded '], ['a\nb'], ['dup', 'dup'], 'not-an-array']) {
    assert.throws(() => prepareClaudeCode(r, { deniedMcpServerNames: bad }), { code: 'INVALID_MCP_DENY_LIST' });
  }
  assert.throws(() => prepareClaudeCode(r, { other: true }), { code: 'UNKNOWN_FIELD' });
});

test('remote MCP config remains standard HTTP with explicit OAuth, no embedded secrets', () => {
  const r = request(); r.access.mcpServers = { research: { type: 'http', url: 'https://example.org/mcp' } };
  const p = prepareClaudeCode(r);
  assert.deepEqual(JSON.parse(p.argv[p.argv.indexOf('--mcp-config') + 1]), { mcpServers: r.access.mcpServers });
  assert.ok(p.argv.includes('--strict-mcp-config')); assert.ok(!p.argv.includes('Agent,Task,Skill,mcp__*'));
  r.access.mcpServers.research.headers = { Authorization: 'DO_NOT_LOG' };
  assert.throws(() => prepareClaudeCode(r), { code: 'UNKNOWN_FIELD' });
});
test('credential-bearing, insecure and local-process MCP configurations rejected', () => {
  for (const url of ['http://example.org/mcp', 'https://user:pass@example.org/mcp', 'https://example.org/mcp?token=secret']) {
    rejects((r) => { r.access.mcpServers = { test: { type: 'http', url } }; }, 'MCP_URL_MUST_NOT_CONTAIN_CREDENTIALS');
  }
  rejects((r) => { r.access.mcpServers = { test: { type: 'stdio', url: 'https://example.org/mcp' } }; }, 'REMOTE_HTTP_ONLY');
});
test('permission rule strings stay separate argv values, never a shell command', () => {
  const r = request(); r.access.builtInTools = ['Bash']; r.access.autoApprove = ['Bash(git status *)'];
  const p = prepareClaudeCode(r);
  assert.ok(p.argv.includes('Bash(git status *)')); assert.equal(p.command, 'claude');
  rejects((x) => { x.access.autoApprove = ['Read\n--bare']; }, 'INVALID_PERMISSION_RULE');
});
test('schema and local validation require identical execution-report keys', () => {
  assert.deepEqual(Object.keys(report()).sort(), [...WORKER_REPORT_SCHEMA.required].sort());
  assert.deepEqual(validateWorkerReport(report(), request()), report());
  const bad = report(); bad.approval = true;
  assert.throws(() => validateWorkerReport(bad, request()), { code: 'UNKNOWN_FIELD' });
});
test('correct report is never owner completion or authority', () => {
  const s = receipt(); assert.equal(s.status, 'EXECUTION_REPORTED_COMPLETE');
  assert.equal(s.grantsAuthorization, false); assert.equal(s.ownerOutcomeSatisfied, null);
  assert.equal(s.verification, 'WORKER_REPORT_ONLY');
});
test('a different run or directive in the report is rejected', () => {
  const es = events(); es[2].structured_output.binding.revision = 2;
  const s = receipt(es); assert.equal(s.status, 'RESULT_INVALID');
  assert.ok(s.reasonCodes.includes('REPORT_BINDING_MISMATCH')); assert.equal(s.report, null);
});
test('exit zero with no result is not successful execution', () => {
  const s = receipt(events().slice(0, 2));
  assert.equal(s.status, 'RESULT_INVALID'); assert.ok(s.reasonCodes.includes('RESULT_MISSING'));
});
test('foreign-session result cannot be ingested', () => {
  const es = events(); es[2].session_id = 'foreign-session';
  const s = receipt(es); assert.equal(s.status, 'RESULT_INVALID'); assert.ok(s.reasonCodes.includes('SESSION_MISMATCH'));
});
test('duplicate terminal result is rejected rather than selecting the convenient one', () => {
  const es = events(); es.push(structuredClone(es[2]));
  assert.ok(receipt(es).reasonCodes.includes('DUPLICATE_RESULT'));
});
test('failure, timeout and signal remain separate from worker success claims', () => {
  assert.equal(receipt(events(), request(), { exitCode: 1 }).status, 'TRANSPORT_FAILED');
  assert.equal(receipt(events(), request(), { exitCode: null, signal: 'SIGTERM' }).status, 'INTERRUPTED');
  assert.equal(receipt(events(), request(), { exitCode: null, signal: 'SIGKILL', timedOut: true }).status, 'TIMED_OUT');
});
test('provider error is not a semantic negative verdict', () => {
  const es = events(); es[2].subtype = 'error_during_execution'; es[2].is_error = true;
  delete es[2].structured_output;
  const s = receipt(es); assert.equal(s.status, 'PROVIDER_FAILED'); assert.equal(s.report, null);
});
test('a turn-limit result is represented explicitly', () => {
  const es = events(); es[2].subtype = 'error_max_turns'; es[2].is_error = true;
  delete es[2].structured_output;
  assert.equal(receipt(es).status, 'LIMIT_REACHED');
});
test('silent primary-model switch fails even though result says success', () => {
  const es = events(); es[1].message.model = 'claude-unapproved-model';
  const s = receipt(es); assert.equal(s.status, 'RESULT_INVALID'); assert.ok(s.reasonCodes.includes('MODEL_MISMATCH'));
});
test('modelUsage auxiliary entries are not primary-model evidence', () => {
  const s = receipt(); assert.deepEqual(s.modelEvidence.observed, ['claude-synthetic-test']);
});
test('request-only evidence does not pretend an absent model was observed', () => {
  const es = events(); delete es[0].model; delete es[1].message.model;
  assert.equal(receipt(es).modelEvidence.evidence, 'UNOBSERVED');
  const r = request(); r.selection.assurance = 'client_reported_model';
  assert.ok(receipt(es, r).reasonCodes.includes('MODEL_OBSERVATION_MISSING'));
});
test('subagent events do not overwrite primary session/model, but violate this no-subagent candidate', () => {
  const es = events(); es.splice(1, 0, { type: 'assistant', parent_tool_use_id: 'child',
    session_id: 'child-session', message: { model: 'claude-other', content: [] } });
  const s = receipt(es); assert.deepEqual(s.modelEvidence.observed, ['claude-synthetic-test']);
  assert.ok(s.reasonCodes.includes('UNREQUESTED_SUBAGENT_ACTIVITY'));
});
test('denials are retained without automatically discarding a successfully used alternative', () => {
  const es = events(); es[2].permission_denials = [{ tool_name: 'Bash', input: 'PRIVATE_INPUT_SENTINEL' }];
  const s = receipt(es); assert.equal(s.permissionDenials, 1);
  assert.equal(s.status, 'EXECUTION_REPORTED_COMPLETE');
  es[2].structured_output.status = 'blocked'; es[2].structured_output.blockers = ['Required operation denied.'];
  assert.equal(receipt(es).status, 'PERMISSION_BLOCKED');
});
test('client estimated cost is not weekly quota, invoice, or this-turn spend', () => {
  const s = receipt(); assert.equal(s.usage.cliEstimatedCostUsd, 1.25);
  assert.equal(s.usage.weeklyAllowancePercent, null);
  assert.equal(s.usage.estimateScope, 'PROVIDER_SESSION_ESTIMATE_NOT_INVOICE_OR_RUN_DELTA');
});
test('normalizer excludes thinking, arbitrary result fields, and raw permission inputs', () => {
  const es = events(); es[2].error = 'SECRET_RAW_ERROR_SENTINEL';
  es[2].permission_denials = [{ input: 'PRIVATE_INPUT_SENTINEL' }];
  const text = JSON.stringify(receipt(es));
  for (const sentinel of ['SECRET_THINKING_SENTINEL', 'PRIVATE_ASSISTANT_SENTINEL',
    'SECRET_RAW_ERROR_SENTINEL', 'PRIVATE_INPUT_SENTINEL']) assert.ok(!text.includes(sentinel));
});
test('malformed JSON is a serialization failure', () => {
  const c = createClaudeCollector(request()); c.write('{bad}\n');
  const s = c.finish({ exitCode: 0, signal: null, timedOut: false });
  assert.equal(s.status, 'RESULT_INVALID'); assert.ok(s.reasonCodes.includes('MALFORMED_JSON'));
});
test('byte chunks can split UTF-8 characters and the final line need not have newline', () => {
  const es = events(); es[2].structured_output.summary = 'Vérifié — テスト.';
  const buf = Buffer.from(es.map((e) => JSON.stringify(e)).join('\n'));
  const c = createClaudeCollector(request());
  for (let i = 0; i < buf.length; i += 7) c.write(buf.subarray(i, i + 7));
  const s = c.finish({ exitCode: 0, signal: null, timedOut: false });
  assert.equal(s.report.summary, 'Vérifié — テスト.'); assert.equal(s.status, 'EXECUTION_REPORTED_COMPLETE');
});
test('invalid UTF-8 and excessive output fail without echoing raw content', () => {
  const c = createClaudeCollector(request()); c.write(Buffer.from([0xff]));
  assert.ok(c.finish({ exitCode: 0, signal: null, timedOut: false }).reasonCodes.includes('INVALID_UTF8'));
  const r = request(); r.limits.maxStreamBytes = 1024; const d = createClaudeCollector(r);
  d.write('x'.repeat(1025));
  assert.ok(d.finish({ exitCode: 0, signal: null, timedOut: false }).reasonCodes.includes('STREAM_LIMIT'));
});
test('collector is single-use', () => {
  const c = createClaudeCollector(request()); c.finish({ exitCode: 1, signal: null, timedOut: false });
  assert.throws(() => c.write('{}'), { code: 'COLLECTOR_CLOSED' });
  assert.throws(() => c.finish({ exitCode: 0, signal: null, timedOut: false }), { code: 'COLLECTOR_CLOSED' });
});
test('old OpenAI route receives exact arguments and retains exact result identity', async () => {
  const args = { directive: { workExecutionProfile: { model: 'GPT_5_6_SOL' } },
    setterEvidenceId: 'existing-trusted-evidence', missionControl: { opaqueClient: true } };
  const result = { status: 'EXISTING_STATUS', receipt: 'unchanged' };
  let called = 0;
  const returned = await delegateExistingOpenAI((input) => {
    called++; assert.strictEqual(input, args); return result;
  }, args);
  assert.equal(called, 1); assert.strictEqual(returned, result);
});
test('old dispatcher rejection propagates without retry or fallback', async () => {
  let calls = 0; const failure = new Error('EXISTING_ADMISSION_DENIED');
  await assert.rejects(async () => delegateExistingOpenAI(() => { calls++; throw failure; }, {}), failure);
  assert.equal(calls, 1);
});
test('legacy profile projection preserves all original data and claims no validation', () => {
  const profile = { model: 'GPT_5_6_SOL', effort: 'MEDIUM', routingTier: 'SOL_MEDIUM',
    contractVersion: 'TRUSTED_SETTER_V1', policyRef: 'patterns/work-model-and-effort-routing.md',
    assuranceRequirement: 'SET_REQUEST_SUFFICIENT', fastModeRequest: 'DO_NOT_ENABLE_FAST' };
  const p = describeExistingOpenAIProfile(profile);
  assert.deepEqual(p.existingProfile, profile); assert.equal(p.modelRequested, 'gpt-5.6-sol');
  assert.equal(p.validation, 'DEFER_TO_EXISTING_PROFILE_VALIDATOR'); assert.equal(p.grantsAuthorization, false);
});
test('capability descriptors cannot grant runtime admission', () => {
  assert.equal(CAPABILITIES.claudeCode.liveLaunch, false);
  assert.equal(CAPABILITIES.claudeCode.grantsAuthority, false);
  assert.equal(CAPABILITIES.existingOpenAI.grantsAuthority, false);
});
test('library has no implicit model invocation, network or subprocess transport', async () => {
  const source = await readFile(new URL('../compatibility.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['node:child_process', 'node:https', 'fetch(', 'process.env', 'execSync(']) {
    assert.ok(!source.includes(forbidden));
  }
});


test('trailing control characters cannot weaken exact identity binding', () => {
  rejects((r) => { r.runId += '\n'; }, 'INVALID_RUN_ID');
  rejects((r) => { r.session.id += '\n'; }, 'INVALID_SESSION_ID');
  rejects((r) => { r.binding.directiveSha256 += '\n'; }, 'INVALID_BINDING');
});
test('malformed model metadata is not echoed into a diagnostic receipt', () => {
  const es = events(); es[0].model = 'PRIVATE_MODEL_FIELD_SENTINEL with whitespace';
  const s = receipt(es); assert.ok(s.reasonCodes.includes('INVALID_MODEL_FIELD'));
  assert.ok(!JSON.stringify(s).includes('PRIVATE_MODEL_FIELD_SENTINEL'));
});
test('configured turn limit is enforced from the terminal receipt when the current CLI has no max-turns flag', () => {
  const es = events(); es[2].num_turns = request().limits.maxTurns + 1;
  const s = receipt(es);
  assert.equal(s.status, 'LIMIT_REACHED'); assert.ok(s.reasonCodes.includes('TURN_LIMIT'));
});
test('provider turn limit remains explicit when the CLI exits with an error', () => {
  const es = events(); es[2].subtype = 'error_max_turns'; es[2].is_error = true;
  delete es[2].structured_output;
  assert.equal(receipt(es, request(), { exitCode: 1 }).status, 'LIMIT_REACHED');
});
