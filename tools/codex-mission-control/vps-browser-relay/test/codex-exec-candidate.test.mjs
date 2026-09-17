import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import test from 'node:test';
import {
  CODEX_ATTEMPT_STATUSES,
  CODEX_EXECUTION_ROUTES,
  codexDirectiveArtifactSha256,
  dispatchMissionControlExecution,
  executeMissionControlCandidate,
} from '../src/codex-exec-candidate.mjs';
import { loadCodexExecCandidateConfig } from '../src/config.mjs';

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'value'],
  properties: { success: { type: 'boolean' }, value: { type: 'string' } },
};

const solLowProfile = Object.freeze({
  model: 'GPT_5_6_SOL', effort: 'LOW', routingTier: 'SOL_LOW', routingTriggers: [],
  fastModeRequest: 'DO_NOT_ENABLE_FAST', assuranceRequirement: 'SET_REQUEST_SUFFICIENT',
  policyRef: 'patterns/work-model-and-effort-routing.md',
  routingPolicyBaseCommit: 'fc3d0d7592a4fa69e94ff8ae31d9a4e5433b73cb',
  contractVersion: 'TRUSTED_SETTER_V1',
});

test('preview disabled invokes the actual legacy handler unchanged and never requests Codex admission', async () => {
  const fixture = await candidateFixture('preview-disabled');
  fixture.config.previewEnabled = false;
  const directive = fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' });
  const exact = { status: 'REAL_LEGACY_HANDLER_RESULT', marker: 7 };
  let received = null;
  const result = await fixture.dispatch(directive, {}, async (value) => { received = value; return exact; });
  assert.strictEqual(result, exact);
  assert.strictEqual(received, directive);
  assert.equal(fixture.missionControl.admissionCalls, 0);
  assert.equal(fixture.spawnCalls.length, 0);
});

test('a non-empty fake receipt cannot launch any Codex child without verified runtime admission', async () => {
  const fixture = await candidateFixture('fake-receipt');
  const directive = { ...fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' }), admissionReceiptId: 'looks-real-but-is-not-authority' };
  await assert.rejects(executeMissionControlCandidate({
    directive, config: fixture.config, spawnImpl: fixture.spawnImpl,
    legacyBrowserHandler: async () => { throw new Error('legacy must not run'); },
  }), /VERIFIED_RUNTIME_ADMISSION_REQUIRED/);
  assert.equal(fixture.spawnCalls.length, 0);
});

test('an explicit Mission Control denial fails closed before any Codex child starts', async () => {
  const fixture = await candidateFixture('denied');
  fixture.missionControl.admissionOverride = {
    admitted: false, mayExecute: false, requestId: 'admission:denied',
    primaryDecision: { decision: 'REJECT_UNVERIFIED_REASONING_SOURCE' },
  };
  await assert.rejects(fixture.dispatch(fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' })), /MISSION_CONTROL_EXECUTION_NOT_ADMITTED/);
  assert.equal(fixture.spawnCalls.length, 0);
  assert.equal(fixture.missionControl.preflightCalls, 0);
});

test('valid source-bound mayExecute and persisted preflight make the Codex backend eligible', async () => {
  const fixture = await candidateFixture('valid-authority');
  const result = await fixture.dispatch(fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' }));
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.equal(result.route, CODEX_EXECUTION_ROUTES.LOCAL);
  assert.equal(fixture.missionControl.admissionCalls, 1);
  assert.equal(fixture.missionControl.preflightCalls, 1);
  assert.equal(result.missionControlLifecycle.executionStartRecorded, true);
  assert.equal(result.missionControlLifecycle.executionReceiptRecorded, true);
  assert.deepEqual(fixture.missionControl.eventTypes, ['codex_execution_started', 'execution_receipt_recorded']);
});

test('source digest, revision, or profile mismatch fails closed before Mission Control or Codex launch', async () => {
  for (const kind of ['digest', 'revision', 'profile']) {
    const fixture = await candidateFixture(`mismatch-${kind}`);
    const directive = fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' });
    const admission = fixture.admissionFor(directive);
    if (kind === 'digest') admission.request.executionDirectiveBinding.directiveArtifactSha256 = 'f'.repeat(64);
    if (kind === 'revision') admission.request.executionDirectiveBinding.directiveRevision += 1;
    if (kind === 'profile') admission.request.workExecutionProfile = { ...solLowProfile, effort: 'MEDIUM', routingTier: 'SOL_MEDIUM' };
    await assert.rejects(fixture.dispatch(directive, { admission }), /does not match|differs/);
    assert.equal(fixture.missionControl.admissionCalls, 0);
    assert.equal(fixture.spawnCalls.length, 0);
  }
});

test('CODEX_LOCAL runs through the integrated Mission Control dispatch seam', async () => {
  const fixture = await candidateFixture('local-dispatch');
  const result = await fixture.dispatch(fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' }));
  assert.equal(result.route, CODEX_EXECUTION_ROUTES.LOCAL);
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.equal(result.protocol.terminalTurnCompletedCount, 1);
  assert.equal(result.authenticationPreflight.authenticationType, 'ChatGPT subscription');
});

test('CODEX_BROWSER_RESTRICTED reaches Codex with only the digest-bound restricted MCP adapter', async () => {
  const fixture = await candidateFixture('browser-dispatch');
  await fixture.installAdapter();
  const result = await fixture.dispatch(fixture.directive({ type: 'BROWSER', name: 'EXAMPLE_TARGET_LIFECYCLE' }), {
    environment: { FAKE_CODEX_MODE: 'success', FAKE_CODEX_EXISTING_MCP: 'unrestricted_browser' },
  });
  assert.equal(result.route, CODEX_EXECUTION_ROUTES.RESTRICTED_BROWSER);
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.deepEqual(result.mcpPreflight.effectiveEnabledServerNames, ['existing_chromium_bridge']);
  assert.equal(result.protocol.completedRestrictedBrowserToolCallCount, 1);
  assert.equal(result.protocol.commandExecutionCount, 0);
});

test('unsupported browser capability passes the exact task to the actual legacy handler', async () => {
  const fixture = await candidateFixture('legacy-browser');
  const directive = fixture.directive({ type: 'BROWSER', name: 'CLICK_AND_TYPE' });
  let received = null;
  const exact = { status: 'LEGACY_DISPATCH_COMPLETED' };
  const result = await fixture.dispatch(directive, {}, async (value, routing) => {
    received = { value, routing };
    return exact;
  });
  assert.strictEqual(result, exact);
  assert.strictEqual(received.value, directive);
  assert.equal(received.routing.route, CODEX_EXECUTION_ROUTES.LEGACY_BROWSER);
  assert.equal(fixture.missionControl.admissionCalls, 0);
});

test('authentication runtime is private, outside durable attempts, removed, and never copied into evidence', async () => {
  const fixture = await candidateFixture('ephemeral-auth');
  const result = await fixture.dispatch(fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' }));
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.ok(fixture.observedCodexHomes.length >= 1);
  for (const observed of fixture.observedCodexHomes) {
    assert.equal(pathWithin(fixture.config.stateDir, observed.path), false);
    assert.equal(observed.homeMode, 0o700);
    assert.equal(observed.authMode, 0o600);
    assert.equal(existsSync(observed.path), false);
  }
  const durableFiles = await walkFiles(result.evidence.attemptDir);
  assert.equal(durableFiles.some((path) => path.endsWith('/auth.json')), false);
  const durableBytes = (await Promise.all(durableFiles.map((path) => readFile(path, 'utf8').catch(() => '')))).join('\n');
  assert.equal(durableBytes.includes(fixture.credentialSentinel), false);
});

test('deadline expiry stays scoped to the attempt process group and records TIMED_OUT', async () => {
  const fixture = await candidateFixture('timeout');
  fixture.config.maxTimeoutMs = 2_500;
  const directive = fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' }, { deadlineMs: 2_200 });
  const result = await fixture.dispatch(directive, { environment: { FAKE_CODEX_MODE: 'timeout' } });
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.TIMED_OUT);
  assert.equal(result.processExitState.started, true);
  assert.notEqual(result.processExitState.signal, null);
  assert.deepEqual(fixture.missionControl.eventTypes, ['codex_execution_started']);
});

test('changed retry semantics are rejected while a valid same-source retry gets a distinct attempt identity', async () => {
  const fixture = await candidateFixture('retry');
  const firstDirective = fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' }, { deadlineMs: 30_000 });
  const first = await fixture.dispatch(firstDirective, { environment: { FAKE_CODEX_MODE: 'process-failure' } });
  assert.equal(first.status, CODEX_ATTEMPT_STATUSES.FAILED);

  const changed = { ...firstDirective, prompt: 'materially changed prompt', retryOfAttemptId: first.attemptId,
    deadline: new Date(Date.now() + 30_000).toISOString() };
  await assert.rejects(fixture.dispatch(changed), /RETRY_SOURCE_BINDING_MISMATCH/);

  const retry = { ...firstDirective, retryOfAttemptId: first.attemptId, deadline: new Date(Date.now() + 30_000).toISOString() };
  const completed = await fixture.dispatch(retry, { environment: { FAKE_CODEX_MODE: 'success' } });
  assert.equal(completed.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.notEqual(completed.attemptId, first.attemptId);
  assert.equal(completed.retryOfAttemptId, first.attemptId);
});

test('raw CDP remains absent from restricted Codex job configuration', async () => {
  const fixture = await candidateFixture('raw-cdp');
  await fixture.installAdapter();
  const result = await fixture.dispatch(fixture.directive({ type: 'BROWSER', name: 'EXAMPLE_TARGET_LIFECYCLE' }));
  const contract = JSON.parse(await readFile(join(result.evidence.attemptDir, 'command-contract.json'), 'utf8'));
  assert.equal(contract.rawCdpEndpointExposed, false);
  assert.equal(contract.args.some((value) => value.includes('127.0.0.1:9222')), false);
});

test('malformed or absent terminal protocol evidence remains non-success', async (t) => {
  for (const [name, mode] of [['malformed result', 'malformed-result'], ['missing terminal', 'missing-terminal']]) {
    await t.test(name, async () => {
      const fixture = await candidateFixture(`protocol-${mode}`);
      const result = await fixture.dispatch(fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' }), { environment: { FAKE_CODEX_MODE: mode } });
      assert.equal(result.status, CODEX_ATTEMPT_STATUSES.PROTOCOL_ERROR);
      assert.deepEqual(fixture.missionControl.eventTypes, ['codex_execution_started']);
    });
  }
});

async function candidateFixture(name) {
  const root = await mkdtemp(join(tmpdir(), `mc-codex-authority-${name}-`));
  const workspace = join(root, 'workspace');
  const stateDir = join(root, 'durable-state');
  const runtimeDir = join(root, 'ephemeral-runtime');
  await mkdir(workspace);
  const fakeCodex = join(root, 'fake-codex.mjs');
  const sourceCodexHome = join(root, 'source-codex-home');
  await mkdir(sourceCodexHome);
  const credentialSentinel = `TEST_SUBSCRIPTION_CREDENTIAL_${name}`;
  await writeFile(join(sourceCodexHome, 'auth.json'), `${credentialSentinel}\n`, { mode: 0o600 });
  await writeFile(fakeCodex, fakeCodexSource(), { mode: 0o700 });
  const config = {
    previewEnabled: true, stateDir, runtimeDir, codexBinary: fakeCodex, sourceCodexHome,
    nodeBinary: process.execPath, restrictedBrowserAdapterPath: null,
    restrictedBrowserAdapterSha256: null, maxTimeoutMs: 60_000,
    mcpStartupTimeoutSeconds: 5, mcpToolTimeoutSeconds: 5, environment: {},
  };
  const missionControl = new FakeMissionControl();
  const spawnCalls = [];
  const observedCodexHomes = [];
  const spawnImpl = (command, args, options) => {
    spawnCalls.push({ command, args: [...args] });
    const codexHome = options?.env?.CODEX_HOME;
    if (codexHome && !observedCodexHomes.some((item) => item.path === codexHome)) {
      observedCodexHomes.push({
        path: codexHome,
        homeMode: statSync(codexHome).mode & 0o777,
        authMode: statSync(join(codexHome, 'auth.json')).mode & 0o777,
      });
    }
    return spawn(command, args, options);
  };
  const fixture = {
    root, workspace, config, missionControl, spawnCalls, spawnImpl, observedCodexHomes, credentialSentinel,
    directive(executionCapability, { deadlineMs = 30_000 } = {}) {
      return {
        schemaVersion: 2,
        jobId: `job-${name}`,
        sourceDirective: {
          id: `directive:${name}:1`, revision: 1, taskId: `task:${name}`,
          sourceMessageId: `chat-message:${name}:1`, sourceBodySha256: 'a'.repeat(64),
        },
        requestedModel: 'gpt-5.6-sol', reasoningEffort: 'low',
        workExecutionProfile: solLowProfile,
        deadline: new Date(Date.now() + deadlineMs).toISOString(),
        workspace, executionCapability, outputSchema, prompt: `bounded directive for ${name}`,
      };
    },
    admissionFor(directive, requestId = `admission:${name}:${Date.now()}`) {
      return {
        request: {
          requestId, action: 'EXECUTE_BOUNDED_TASK', actor: 'WORK',
          sourceReceipt: {
            messageId: directive.sourceDirective.sourceMessageId,
            bodySha256: directive.sourceDirective.sourceBodySha256,
            claimedSurface: 'CHATGPT_PROJECT_MANAGER', observedSurface: 'CHATGPT_PROJECT_MANAGER',
            provenanceStatus: 'VERIFIED', authorActor: 'PROJECT_MANAGER_CHAT',
          },
          boundedExecution: true, taskRequiresExecutionOutsideChat: true,
          executionScope: 'TERMINAL_OR_COMPUTER_WORK',
          spend: { kind: 'MODEL_API_INFERENCE', ceilingUsd: 0, ownerApprovedNonzeroSpendManifestId: null },
          internalRoute: null,
          ownerPolicy: { paidModelInferenceAllowed: false, activeZeroSpendDecisionId: 'owner:zero-spend' },
          directiveSchemaVersion: 3,
          executionDirectiveBinding: {
            directiveId: directive.sourceDirective.id,
            directiveRevision: directive.sourceDirective.revision,
            taskId: directive.sourceDirective.taskId,
            directiveArtifactSha256: codexDirectiveArtifactSha256(directive),
          },
          workExecutionProfile: directive.workExecutionProfile,
        },
        factualPacket: null,
      };
    },
    async dispatch(directive, { admission = null, environment = {} } = {}, legacyBrowserHandler = async () => { throw new Error('legacy handler should not run'); }) {
      config.environment = { OPENAI_API_KEY: 'must-not-reach-child', CODEX_API_KEY: 'must-not-reach-child', ...environment };
      const admissionInput = admission ?? fixture.admissionFor(directive);
      missionControl.bind(admissionInput, directive.workExecutionProfile);
      return dispatchMissionControlExecution({
        worker: `worker-${name}`, admissionInput, setterEvidenceId: `setter:${name}:1`, directive,
        config, missionControl, legacyBrowserHandler, spawnImpl,
      });
    },
    async installAdapter() {
      const adapterPath = join(root, 'qualified-adapter.mjs');
      const adapterBytes = 'console.log("qualified adapter fixture");\n';
      await writeFile(adapterPath, adapterBytes, { mode: 0o700 });
      config.restrictedBrowserAdapterPath = adapterPath;
      config.restrictedBrowserAdapterSha256 = sha256(adapterBytes);
    },
  };
  return fixture;
}

class FakeMissionControl {
  admissionCalls = 0;
  preflightCalls = 0;
  admissionOverride = null;
  eventTypes = [];

  bind(admissionInput, profile) {
    this.admissionInput = admissionInput;
    this.profile = profile;
  }

  async requestExecutionAdmission(_worker, input) {
    this.admissionCalls += 1;
    if (this.admissionOverride) return this.admissionOverride;
    assert.strictEqual(input, this.admissionInput);
    return {
      admitted: true, mayExecute: true, requestId: input.request.requestId,
      profileAuthorizationId: `work-profile-authorization:${sha256(input.request.requestId).slice(0, 24)}`,
      authorizedWorkExecutionProfile: this.profile,
      primaryDecision: { decision: 'ALLOW_BOUNDED_EXECUTION' },
    };
  }

  async requestWorkExecutionPreflight(_worker, input) {
    this.preflightCalls += 1;
    return {
      setterEvidenceId: input.setterEvidenceId,
      allowed: true,
      result: 'SET_REQUEST_ACCEPTED_UNVERIFIED',
      decision: 'WORK_EXECUTION_SET_REQUEST_ACCEPTED_UNVERIFIED',
      fieldResults: { model: 'SET_REQUEST_ONLY', effort: 'SET_REQUEST_ONLY', fastMode: 'NOT_REQUESTED_UNVERIFIED' },
      reasonCodes: ['PROVIDER_MODEL_IDENTITY_NOT_INDEPENDENTLY_VERIFIED'],
      modelIdentityEvidence: 'SET_REQUEST_ONLY',
      requestedProfile: input.requestedProfile,
      authorizedProfile: input.requestedProfile,
      observedProfile: { model: null, effort: null, fastMode: null },
      appliedSelection: { model: 'gpt-5.6-sol', thinking: 'low', fastModeRequest: 'DO_NOT_ENABLE_FAST' },
      capability: {
        surfaceId: 'TEST_SET_ONLY', interface: 'STRUCTURED_API',
        model: 'SET_ONLY', effort: 'SET_ONLY', fastMode: 'UNOBSERVABLE',
      },
      launchSelection: { model: 'gpt-5.6-sol', thinking: 'low', fastModeRequest: 'DO_NOT_ENABLE_FAST' },
      preflightId: `work-profile-preflight:${sha256(input.authorizationId).slice(0, 24)}`,
    };
  }

  async recordWorkerEvents(_worker, events) {
    this.eventTypes.push(...events.map((event) => event.data.type));
    return { events };
  }
}

async function walkFiles(root) {
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...await walkFiles(path));
    else found.push(path);
  }
  return found;
}

function pathWithin(parent, candidate) {
  const value = relative(parent, candidate);
  return value === '' || (!value.startsWith('..') && !isAbsolute(value));
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

function fakeCodexSource() {
  return `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'login' && args[1] === 'status') { process.stderr.write('Logged in using ChatGPT\\n'); process.exit(0); }
if (args[0] === 'mcp' && args[1] === 'list') {
  const disabled = (name) => args.some((value) => value === 'mcp_servers.' + name + '.enabled=false');
  const servers = [];
  if (process.env.FAKE_CODEX_EXISTING_MCP) servers.push({ name: process.env.FAKE_CODEX_EXISTING_MCP, enabled: !disabled(process.env.FAKE_CODEX_EXISTING_MCP) });
  if (args.some((value) => value.startsWith('mcp_servers.existing_chromium_bridge.command='))) servers.push({ name: 'existing_chromium_bridge', enabled: true });
  process.stdout.write(JSON.stringify(servers)); process.exit(0);
}
if (args[0] !== 'exec') process.exit(64);
if (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY) process.exit(65);
const resultPath = args[args.indexOf('--output-last-message') + 1];
const mode = process.env.FAKE_CODEX_MODE || 'success';
process.stdout.write(JSON.stringify({ type: 'turn.started' }) + '\\n');
if (mode === 'timeout') setInterval(() => {}, 1000);
else if (mode === 'process-failure') process.exit(7);
else if (mode === 'malformed-result') { writeFileSync(resultPath, '{not json'); process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n'); }
else if (mode === 'missing-terminal') writeFileSync(resultPath, JSON.stringify({ success: true, value: 'ok' }));
else {
  if (args.some((value) => value.startsWith('mcp_servers.existing_chromium_bridge.command='))) {
    process.stdout.write(JSON.stringify({ type: 'item.completed', item: {
      id: 'item_mcp_1', type: 'mcp_tool_call', server: 'existing_chromium_bridge', tool: 'example_target_lifecycle',
      arguments: {}, status: 'completed', error: null, result: { structured_content: { success: true } },
    } }) + '\\n');
  }
  writeFileSync(resultPath, JSON.stringify({ success: true, value: 'ok' }));
  process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');
}
`;
}

test('config places ephemeral runtime outside the durable state default', () => {
  const config = loadCodexExecCandidateConfig({ HOME: '/home/USER' });
  assert.equal(pathWithin(config.stateDir, config.runtimeDir), false);
});
