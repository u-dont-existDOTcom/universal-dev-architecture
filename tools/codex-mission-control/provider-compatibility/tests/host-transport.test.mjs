import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CLAUDE_PROVIDER_BINDING, claudeProfileForRequest, inspectClaudeHost, runClaudeTransport,
  dispatchClaudeMissionControlExecution,
} from '../host-transport.mjs';

function baseRequest(workspace) {
  return {
    schemaVersion: 1, runId: 'transport-run-1',
    binding: { taskId: 'task:transport', directiveId: 'directive:transport:1', revision: 1,
      directiveSha256: 'b'.repeat(64) },
    provider: 'anthropic', surface: 'claude-code-cli', role: 'execution',
    session: { mode: 'new', id: '550e8400-e29b-41d4-a716-446655440001' },
    selection: { model: 'claude-synthetic-test', effort: 'medium', assurance: 'set_request',
      expensiveEffortApproved: false },
    workspace, instruction: 'Operate only on this synthetic fixture.',
    limits: { maxTurns: 3, maxWallTimeMs: 2000, maxStreamBytes: 1024 * 1024 },
    access: { builtInTools: ['Read'], autoApprove: [], mcpServers: {} }, billing: 'subscription',
  };
}

function admissionFor(request) {
  const profile = claudeProfileForRequest(request);
  const requestId = 'admission:transport:1';
  const admissionInput = { request: {
    requestId, action: 'EXECUTE_BOUNDED_TASK', actor: 'WORK',
    sourceReceipt: { messageId: 'chat-message:transport:1', bodySha256: 'a'.repeat(64),
      claimedSurface: 'CHATGPT_PROJECT_MANAGER', observedSurface: 'CHATGPT_PROJECT_MANAGER',
      provenanceStatus: 'VERIFIED', authorActor: 'PROJECT_MANAGER_CHAT' },
    boundedExecution: true, taskRequiresExecutionOutsideChat: true,
    executionScope: 'TERMINAL_OR_COMPUTER_WORK', spend: { kind: 'MODEL_API_INFERENCE', ceilingUsd: 0,
      ownerApprovedNonzeroSpendManifestId: null }, internalRoute: null,
    ownerPolicy: { paidModelInferenceAllowed: false, activeZeroSpendDecisionId: 'owner:zero-spend' },
    directiveSchemaVersion: 3,
    executionDirectiveBinding: { directiveId: request.binding.directiveId, directiveRevision: request.binding.revision,
      taskId: request.binding.taskId, directiveArtifactSha256: request.binding.directiveSha256 },
    workExecutionProfile: 'LEGACY_MODEL_PROFILE_UNSPECIFIED',
    executionProviderBinding: CLAUDE_PROVIDER_BINDING, claudeExecutionProfile: profile,
  }, factualPacket: null };
  const admission = { admitted: true, mayExecute: true, requestId,
    authorizedWorkExecutionProfile: null, authorizedClaudeExecutionProfile: profile,
    executionProviderBinding: CLAUDE_PROVIDER_BINDING,
    claudeProfileAuthorizationId: 'claude-profile-authorization:synthetic', profileAuthorizationId: null };
  return { admissionInput, admission };
}

async function fixture({ hang = false, turns = 2 } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'claude-host-transport-'));
  const workspace = join(root, 'workspace');
  await writeFile(join(root, 'placeholder'), 'x');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(workspace));
  const binary = join(root, 'fake-claude.mjs');
  const source = `#!/usr/bin/env node\n` +
`const args=process.argv.slice(2);\n` +
`if(args[0]==='--version'){console.log('2.1.281 (Claude Code)');process.exit(0)}\n` +
`if(args[0]==='--help'){console.log('${['--print','--verbose','--output-format','--model','--effort','--permission-mode','--permission-prompts','--restricted','--disable-slash-commands','--no-chrome','--strict-mcp-config','--mcp-config','--tools','--disallowedTools','--json-schema'].join(' ')}');process.exit(0)}\n` +
`if(args[0]==='auth'&&args[1]==='status'){console.log(JSON.stringify({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'max'}));process.exit(0)}\n` +
`if(process.env.ANTHROPIC_API_KEY||process.env.ANTHROPIC_BASE_URL||process.env.CLAUDE_CODE_USE_BEDROCK||process.env.CLAUDE_CODE_USE_VERTEX){process.exit(72)}\n` +
`if(process.env.FAKE_CLAUDE_HANG==='1'){setInterval(()=>{},1000)}else{let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>{const sid=args[args.indexOf('--session-id')+1];const model=args[args.indexOf('--model')+1];const report=JSON.parse(process.env.FAKE_CLAUDE_REPORT);console.log(JSON.stringify({type:'system',subtype:'init',session_id:sid,model}));console.log(JSON.stringify({type:'assistant',session_id:sid,message:{model,content:[]}}));console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,session_id:sid,structured_output:report,num_turns:Number(process.env.FAKE_CLAUDE_TURNS||2),permission_denials:[]}));})}\n`;
  await writeFile(binary, source); await chmod(binary, 0o755);
  const request = baseRequest(workspace);
  const report = { runId: request.runId, binding: structuredClone(request.binding), status: 'completed',
    summary: 'Synthetic execution complete.', artifacts: [], tests: [], blockers: [] };
  const env = { ...process.env, FAKE_CLAUDE_REPORT: JSON.stringify(report), FAKE_CLAUDE_TURNS: String(turns),
    ...(hang ? { FAKE_CLAUDE_HANG: '1' } : {}) };
  return { request, binary, env, ...admissionFor(request) };
}

test('host preflight proves subscription route and exact source-bound Claude admission without inference', async () => {
  const f = await fixture();
  const preflight = await inspectClaudeHost({ request: f.request, admissionInput: f.admissionInput,
    admission: f.admission, claudeBinary: f.binary, environment: f.env });
  assert.equal(preflight.evidence.subscriptionRouteVerified, true);
  assert.equal(preflight.evidence.providerOverridesPresent, false);
  assert.equal(preflight.evidence.requiredFlagsVerified, true);
  assert.match(preflight.evidence.evidenceId, /^claude-host-preflight:[a-f0-9]{32}$/);
  const result = await runClaudeTransport(preflight);
  assert.equal(result.status, 'EXECUTION_REPORTED_COMPLETE');
  assert.equal(result.hostEvidence.processTreeStopped, true);
  assert.equal(result.hostEvidence.stderrBytes, 0);
});

test('provider override environment fails closed instead of being silently used', async () => {
  const f = await fixture();
  await assert.rejects(() => inspectClaudeHost({ request: f.request, admissionInput: f.admissionInput,
    admission: f.admission, claudeBinary: f.binary, environment: { ...f.env, ANTHROPIC_API_KEY: 'not-used' } }),
  /CLAUDE_PROVIDER_OVERRIDE_PRESENT/);
});

test('caller cannot forge a host preflight token', async () => {
  await assert.rejects(() => runClaudeTransport({ evidence: { evidenceId: 'fake' } }), /TRUSTED_CLAUDE_HOST_PREFLIGHT_REQUIRED/);
});

test('receipt-level turn cap replaces the removed max-turns CLI flag', async () => {
  const f = await fixture({ turns: 4 });
  const preflight = await inspectClaudeHost({ request: f.request, admissionInput: f.admissionInput,
    admission: f.admission, claudeBinary: f.binary, environment: f.env });
  const result = await runClaudeTransport(preflight);
  assert.equal(result.status, 'LIMIT_REACHED'); assert.ok(result.reasonCodes.includes('TURN_LIMIT'));
});

test('wall clock timeout terminates the detached process group before reporting', async () => {
  const f = await fixture({ hang: true }); f.request.limits.maxWallTimeMs = 1000;
  const preflight = await inspectClaudeHost({ request: f.request, admissionInput: f.admissionInput,
    admission: f.admission, claudeBinary: f.binary, environment: f.env });
  const result = await runClaudeTransport(preflight, { killGraceMs: 100 });
  assert.equal(result.status, 'TIMED_OUT'); assert.equal(result.hostEvidence.processTreeStopped, true);
});


test('Mission Control admission and persisted host preflight both complete before Claude spawn', async () => {
  const f = await fixture(); const calls = [];
  const missionControl = {
    async requestExecutionAdmission(worker, input) {
      calls.push(['admission', worker]); assert.strictEqual(input, f.admissionInput); return f.admission;
    },
    async requestClaudeExecutionPreflight(worker, input) {
      calls.push(['preflight', worker]);
      assert.equal(input.authorizationId, f.admission.claudeProfileAuthorizationId);
      assert.equal(input.evidence.subscriptionRouteVerified, true);
      assert.equal(input.evidence.providerOverridesPresent, false);
      assert.equal(input.evidence.requiredFlagsVerified, true);
      return { allowed: true, preflightId: input.evidence.evidenceId };
    },
    async recordWorkerEvents(worker, events) {
      calls.push(['receipt', worker]); assert.equal(events.length, 1);
      assert.equal(events[0].data.type, 'claude_execution_receipt_recorded');
      return { events };
    },
  };
  const result = await dispatchClaudeMissionControlExecution({ worker: 'worker-claude-test',
    admissionInput: f.admissionInput, request: f.request, missionControl,
    claudeBinary: f.binary, environment: f.env });
  assert.deepEqual(calls.map(([kind]) => kind), ['admission', 'preflight', 'receipt']);
  assert.equal(result.status, 'EXECUTION_REPORTED_COMPLETE');
  assert.equal(result.missionControlLifecycle.preflightPersisted, true);
  assert.equal(result.missionControlLifecycle.executionReceiptRecorded, true);
  assert.equal(result.missionControlLifecycle.claudePreflightId, result.hostEvidence.evidenceId);
});

test('Mission Control preflight rejection stops before Claude execution', async () => {
  const f = await fixture();
  const missionControl = {
    async requestExecutionAdmission() { return f.admission; },
    async requestClaudeExecutionPreflight(_worker, input) { return { allowed: false, preflightId: input.evidence.evidenceId, error: 'DENIED' }; },
    async recordWorkerEvents() { throw new Error('receipt must not record after rejected preflight'); },
  };
  await assert.rejects(() => dispatchClaudeMissionControlExecution({ worker: 'worker-claude-test',
    admissionInput: f.admissionInput, request: f.request, missionControl,
    claudeBinary: f.binary, environment: f.env }), /CLAUDE_EXECUTION_PREFLIGHT_REJECTED/);
});
