import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadCodexExecCandidateConfig } from '../src/config.mjs';
import {
  CODEX_ATTEMPT_STATUSES,
  CODEX_EXECUTION_ROUTES,
  executeMissionControlCandidate,
} from '../src/codex-exec-candidate.mjs';

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'value'],
  properties: {
    success: { type: 'boolean' },
    value: { type: 'string' },
  },
};

test('preview flag off preserves the legacy handler result without candidate validation', async () => {
  assert.equal(loadCodexExecCandidateConfig({}).previewEnabled, false);
  const exactLegacyResult = { existing: 'legacy-result' };
  let calls = 0;
  const result = await executeMissionControlCandidate({
    directive: { deliberately: 'not-a-candidate-directive' },
    config: { previewEnabled: false },
    legacyBrowserHandler: async (_directive, routing) => {
      calls += 1;
      assert.equal(routing.route, CODEX_EXECUTION_ROUTES.LEGACY_BROWSER);
      assert.equal(routing.reason, 'PREVIEW_DISABLED');
      return exactLegacyResult;
    },
  });
  assert.equal(calls, 1);
  assert.strictEqual(result, exactLegacyResult);
});

test('an admitted local directive routes to Codex and records a complete lifecycle', async () => {
  const fixture = await candidateFixture('local-success');
  const directive = await fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' });
  const result = await fixture.execute(directive, { FAKE_CODEX_MODE: 'success' });
  assert.equal(result.route, CODEX_EXECUTION_ROUTES.LOCAL);
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.equal(result.processExitState.exitCode, 0);
  assert.equal(result.protocol.terminalTurnCompletedCount, 1);
  assert.equal(result.protocol.structuredResultParsed, true);
  assert.equal(result.authenticationPreflight.authenticationType, 'ChatGPT subscription');
  assert.equal(result.runtimeCredentialCopyRemoved, true);
  assert.equal(result.mcpPreflight.effectiveEnabledServerNames.length, 0);
  assert.equal(result.startedAt < result.finishedAt, true);
  assert.equal((await readFile(result.evidence.eventsPath, 'utf8')).includes('turn.completed'), true);
  const contract = JSON.parse(await readFile(join(result.evidence.attemptDir, 'command-contract.json'), 'utf8'));
  assert.equal(contract.sandbox, 'workspace-write');
  assert.equal(contract.approvalPolicy, 'never');
  assert.equal(contract.workspaceNetworkAccess, false);
  assert.equal(contract.apiKeyVariablesRemoved.includes('OPENAI_API_KEY'), true);
});

test('approved restricted-browser capability binds the qualified adapter and disables other MCP servers', async () => {
  const fixture = await candidateFixture('browser-success');
  const adapterPath = join(fixture.root, 'qualified-adapter.mjs');
  const adapterBytes = 'console.log("qualified adapter fixture");\n';
  await writeFile(adapterPath, adapterBytes, { mode: 0o700 });
  fixture.config.restrictedBrowserAdapterPath = adapterPath;
  fixture.config.restrictedBrowserAdapterSha256 = sha256(adapterBytes);
  const directive = await fixture.directive({ type: 'BROWSER', name: 'EXAMPLE_TARGET_LIFECYCLE' });
  const result = await fixture.execute(directive, {
    FAKE_CODEX_MODE: 'success',
    FAKE_CODEX_EXISTING_MCP: 'unrestricted_browser',
  });
  assert.equal(result.route, CODEX_EXECUTION_ROUTES.RESTRICTED_BROWSER);
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.deepEqual(result.mcpPreflight.effectiveEnabledServerNames, ['existing_chromium_bridge']);
  assert.equal(result.mcpPreflight.restrictedAdapter.sha256, sha256(adapterBytes));
  assert.equal(result.mcpPreflight.rawCdpEndpointExposed, false);
  assert.equal(result.protocol.routeContractSatisfied, true);
  assert.equal(result.protocol.completedRestrictedBrowserToolCallCount, 1);
  assert.equal(result.protocol.commandExecutionCount, 0);
  const contract = JSON.parse(await readFile(join(result.evidence.attemptDir, 'command-contract.json'), 'utf8'));
  assert.equal(contract.args.some((value) => value.includes('mcp_servers.unrestricted_browser.enabled=false')), true);
  assert.equal(contract.args.some((value) => value.includes(adapterPath)), true);
  assert.equal(contract.args.some((value) => value === 'mcp_servers.existing_chromium_bridge.tools.example_target_lifecycle.approval_mode="approve"'), true);
  assert.equal(contract.args.some((value) => value.includes('127.0.0.1:9222')), false);
});

test('restricted-browser success is a protocol error without the actual qualified MCP call', async () => {
  const fixture = await candidateFixture('browser-missing-call');
  const adapterPath = join(fixture.root, 'qualified-adapter.mjs');
  const adapterBytes = 'console.log("qualified adapter fixture");\n';
  await writeFile(adapterPath, adapterBytes, { mode: 0o700 });
  fixture.config.restrictedBrowserAdapterPath = adapterPath;
  fixture.config.restrictedBrowserAdapterSha256 = sha256(adapterBytes);
  const directive = await fixture.directive({ type: 'BROWSER', name: 'EXAMPLE_TARGET_LIFECYCLE' });
  const result = await fixture.execute(directive, { FAKE_CODEX_MODE: 'success-without-mcp' });
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.PROTOCOL_ERROR);
  assert.equal(result.protocol.routeContractSatisfied, false);
  assert.equal(result.protocol.completedRestrictedBrowserToolCallCount, 0);
});

test('unsupported browser capabilities preserve the legacy browser route', async () => {
  const fixture = await candidateFixture('unsupported-browser');
  const directive = await fixture.directive({ type: 'BROWSER', name: 'CLICK_AND_TYPE' });
  let legacyCalled = false;
  const result = await executeMissionControlCandidate({
    directive,
    config: fixture.config,
    legacyBrowserHandler: async (_value, routing) => {
      legacyCalled = true;
      return { route: routing.route, marker: 'unchanged-legacy-path' };
    },
  });
  assert.equal(legacyCalled, true);
  assert.deepEqual(result, { route: CODEX_EXECUTION_ROUTES.LEGACY_BROWSER, marker: 'unchanged-legacy-path' });
});

test('deadline expiry terminates only the attempt process group and records TIMED_OUT', async () => {
  const fixture = await candidateFixture('timeout');
  fixture.config.maxTimeoutMs = 2_500;
  const directive = await fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' }, { deadlineMs: 2_200 });
  const result = await fixture.execute(directive, { FAKE_CODEX_MODE: 'timeout' });
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.TIMED_OUT);
  assert.equal(result.processExitState.started, true);
  assert.notEqual(result.processExitState.signal, null);
  assert.equal(await readFile(join(result.evidence.attemptDir, 'status'), 'utf8'), 'TIMED_OUT\n');
});

test('malformed or absent terminal protocol evidence cannot become success', async (t) => {
  await t.test('malformed structured result', async () => {
    const fixture = await candidateFixture('malformed-result');
    const directive = await fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' });
    const result = await fixture.execute(directive, { FAKE_CODEX_MODE: 'malformed-result' });
    assert.equal(result.status, CODEX_ATTEMPT_STATUSES.PROTOCOL_ERROR);
    assert.equal(result.protocol.structuredResultParsed, false);
  });
  await t.test('absent terminal event', async () => {
    const fixture = await candidateFixture('missing-terminal');
    const directive = await fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' });
    const result = await fixture.execute(directive, { FAKE_CODEX_MODE: 'missing-terminal' });
    assert.equal(result.status, CODEX_ATTEMPT_STATUSES.PROTOCOL_ERROR);
    assert.equal(result.protocol.terminalTurnCompletedCount, 0);
  });
});

test('an explicit retry receives a distinct attempt identity and completed work is not silently duplicated', async () => {
  const fixture = await candidateFixture('retry');
  const firstDirective = await fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' });
  const first = await fixture.execute(firstDirective, { FAKE_CODEX_MODE: 'process-failure' });
  assert.equal(first.status, CODEX_ATTEMPT_STATUSES.FAILED);

  const retryDirective = { ...firstDirective, retryOfAttemptId: first.attemptId };
  const retry = await fixture.execute(retryDirective, { FAKE_CODEX_MODE: 'success' });
  assert.equal(retry.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.notEqual(retry.attemptId, first.attemptId);
  assert.equal(retry.retryOfAttemptId, first.attemptId);

  await assert.rejects(
    fixture.execute(firstDirective, { FAKE_CODEX_MODE: 'success' }),
    /COMPLETED_ATTEMPT_EXISTS/,
  );
});

async function candidateFixture(name) {
  const root = await mkdtemp(join(tmpdir(), `mc-codex-candidate-${name}-`));
  const workspace = join(root, 'workspace');
  const stateDir = join(root, 'state');
  await mkdir(workspace);
  const fakeCodex = join(root, 'fake-codex.mjs');
  const sourceCodexHome = join(root, 'source-codex-home');
  await mkdir(sourceCodexHome);
  await writeFile(join(sourceCodexHome, 'auth.json'), '{}\n', { mode: 0o600 });
  await writeFile(fakeCodex, fakeCodexSource(), { mode: 0o700 });
  const config = {
    previewEnabled: true,
    stateDir,
    codexBinary: fakeCodex,
    sourceCodexHome,
    nodeBinary: process.execPath,
    restrictedBrowserAdapterPath: null,
    restrictedBrowserAdapterSha256: null,
    maxTimeoutMs: 5_000,
    mcpStartupTimeoutSeconds: 5,
    mcpToolTimeoutSeconds: 5,
    environment: {},
  };
  return {
    root,
    workspace,
    config,
    async directive(executionCapability, { deadlineMs = 4_000 } = {}) {
      const prompt = `bounded directive for ${name}`;
      return {
        schemaVersion: 1,
        jobId: `job-${name}`,
        admissionReceiptId: `admission-${name}`,
        sourceDirective: { id: `directive-${name}`, sha256: sha256(prompt) },
        requestedModel: 'gpt-5.6-sol',
        reasoningEffort: 'low',
        deadline: new Date(Date.now() + deadlineMs).toISOString(),
        workspace,
        executionCapability,
        outputSchema,
        prompt,
      };
    },
    async execute(directive, fakeEnvironment) {
      config.environment = {
        OPENAI_API_KEY: 'must-not-reach-child',
        CODEX_API_KEY: 'must-not-reach-child',
        ...fakeEnvironment,
      };
      return executeMissionControlCandidate({
        directive,
        config,
        legacyBrowserHandler: async () => { throw new Error('legacy handler should not run'); },
      });
    },
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fakeCodexSource() {
  return `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === 'login' && args[1] === 'status') {
  process.stderr.write('Logged in using ChatGPT\\n');
  process.exit(0);
}
if (args[0] === 'mcp' && args[1] === 'list') {
  const disabled = (name) => args.some((value) => value === 'mcp_servers.' + name + '.enabled=false');
  const servers = [];
  if (process.env.FAKE_CODEX_EXISTING_MCP && !disabled(process.env.FAKE_CODEX_EXISTING_MCP)) {
    servers.push({ name: process.env.FAKE_CODEX_EXISTING_MCP, enabled: true });
  } else if (process.env.FAKE_CODEX_EXISTING_MCP) {
    servers.push({ name: process.env.FAKE_CODEX_EXISTING_MCP, enabled: false });
  }
  if (args.some((value) => value.startsWith('mcp_servers.existing_chromium_bridge.command='))) {
    servers.push({ name: 'existing_chromium_bridge', enabled: true });
  }
  process.stdout.write(JSON.stringify(servers));
  process.exit(0);
}

if (args[0] !== 'exec') process.exit(64);
if (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY) process.exit(65);
const resultIndex = args.indexOf('--output-last-message');
const resultPath = args[resultIndex + 1];
const mode = process.env.FAKE_CODEX_MODE || 'success';
process.stdout.write(JSON.stringify({ type: 'turn.started' }) + '\\n');
if (mode === 'timeout') {
  setInterval(() => {}, 1000);
} else if (mode === 'process-failure') {
  process.exit(7);
} else if (mode === 'malformed-result') {
  writeFileSync(resultPath, '{not json');
  process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');
} else if (mode === 'missing-terminal') {
  writeFileSync(resultPath, JSON.stringify({ success: true, value: 'ok' }));
} else {
  if (mode !== 'success-without-mcp'
    && args.some((value) => value.startsWith('mcp_servers.existing_chromium_bridge.command='))) {
    process.stdout.write(JSON.stringify({
      type: 'item.completed',
      item: {
        id: 'item_mcp_1', type: 'mcp_tool_call', server: 'existing_chromium_bridge',
        tool: 'example_target_lifecycle', arguments: {}, status: 'completed', error: null,
        result: { structured_content: { success: true } },
      },
    }) + '\\n');
  }
  writeFileSync(resultPath, JSON.stringify({ success: true, value: 'ok' }));
  process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');
}
`;
}
