import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertSubscriptionHostReady,
  createFileClaudeSessionRegistry,
  probeClaudeHost,
  runAuthorizedClaudeCode,
} from '../claude-host-transport.mjs';

function request(root, overrides = {}) {
  const binding = {
    taskId: 'task:test',
    directiveId: 'directive:test:1',
    revision: 1,
    directiveSha256: 'a'.repeat(64),
  };
  return {
    schemaVersion: 1,
    runId: 'run-test',
    binding,
    provider: 'anthropic',
    surface: 'claude-code-cli',
    role: 'execution',
    session: {
      id: '11111111-1111-4111-8111-111111111111',
      mode: 'new',
    },
    selection: {
      model: 'claude-synthetic-test',
      effort: 'medium',
      assurance: 'client_reported_model',
      expensiveEffortApproved: false,
    },
    workspace: root,
    instruction: 'Perform the bounded synthetic task.',
    limits: {
      maxTurns: 4,
      maxWallTimeMs: 5000,
      maxStreamBytes: 1_000_000,
    },
    access: {
      builtInTools: ['Read'],
      autoApprove: [],
      mcpServers: {},
    },
    billing: 'subscription',
    ...overrides,
  };
}

function authorizationFor(r) {
  return {
    allowed: true,
    executionProvider: 'ANTHROPIC',
    authorizationId: 'claude-auth:test:1',
    binding: structuredClone(r.binding),
    model: r.selection.model,
    effort: r.selection.effort,
  };
}

test('host probe exposes only privacy-safe subscription/auth evidence', async () => {
  const calls = [];
  const host = await probeClaudeHost({
    spawnCapture: async (_command, args) => {
      calls.push(args);
      if (args[0] === '--version') return { exitCode: 0, stdout: '2.1.281 (Claude Code)\n' };
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: 'claude.ai',
          apiProvider: 'firstParty',
          subscriptionType: 'max',
          email: 'private@example.invalid',
          orgId: 'private-org',
        }),
      };
    },
    env: {},
  });
  assert.equal(host.subscriptionAuthenticated, true);
  assert.equal(host.apiOrProviderOverridesPresent, false);
  assert.equal(host.inferenceInvoked, false);
  assert.ok(!JSON.stringify(host).includes('private@example.invalid'));
  assert.ok(!JSON.stringify(host).includes('private-org'));
  assert.deepEqual(calls, [['--version'], ['auth', 'status', '--json']]);
});

test('host readiness fails closed on API/provider overrides', () => {
  assert.throws(() => assertSubscriptionHostReady({
    subscriptionAuthenticated: true,
    apiOrProviderOverridesPresent: true,
  }), /CLAUDE_API_OR_PROVIDER_OVERRIDE_PRESENT/);
});

test('default Claude settings are inspected for provider overrides without exposing values', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-host-settings-'));
  const { mkdir } = await import('node:fs/promises');
  const claudeDir = join(root, '.claude');
  await mkdir(claudeDir, { recursive: true });
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({
    apiKeyHelper: 'PRIVATE_HELPER_SENTINEL',
    model: 'claude-opus-5-5',
  }));
  const host = await probeClaudeHost({
    spawnCapture: async (_command, args) => args[0] === '--version'
      ? { exitCode: 0, stdout: '2.1.281 (Claude Code)\n' }
      : { exitCode: 0, stdout: JSON.stringify({
        loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max',
      }) },
    env: { HOME: root },
  });
  assert.equal(host.apiOrProviderOverridesPresent, true);
  assert.ok(host.settingsOverridePaths.some((value) => value.endsWith('apiKeyHelper')));
  assert.ok(!JSON.stringify(host).includes('PRIVATE_HELPER_SENTINEL'));
});

test('authorized runner uses direct argv and validates the collected worker report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-host-success-'));
  const r = request(root);
  const fake = join(root, 'fake-claude.mjs');
  await writeFile(fake, fakeClaudeSource(r), { mode: 0o700 });
  const registry = await createFileClaudeSessionRegistry({ path: join(root, 'sessions.json') });
  const result = await runAuthorizedClaudeCode({
    request: r,
    authorize: async () => authorizationFor(r),
    sessionRegistry: registry,
    hostProbe: async () => ({
      subscriptionAuthenticated: true,
      apiOrProviderOverridesPresent: false,
      inferenceInvoked: false,
    }),
    claudeBinary: fake,
  });
  assert.equal(result.receipt.status, 'EXECUTION_REPORTED_COMPLETE');
  assert.equal(result.receipt.report.runId, r.runId);
  assert.equal(result.authorizationId, 'claude-auth:test:1');
  assert.equal(result.automaticRetries, 0);
  assert.equal(result.automaticFallback, false);
  assert.equal(result.stderr.contentRetained, false);
  assert.equal(result.cancellation.processTreeStopped, true);
  assert.deepEqual((await registry.lookup(r.session.id)).binding, r.binding);
});

test('wall timeout terminates the process group and reports no retry or fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-host-timeout-'));
  const r = request(root, {
    limits: { maxTurns: 4, maxWallTimeMs: 1000, maxStreamBytes: 1_000_000 },
  });
  const fake = join(root, 'fake-claude-hang.mjs');
  await writeFile(fake, [
    '#!/usr/bin/env node',
    'console.log(JSON.stringify({type:"system",subtype:"init",session_id:' + JSON.stringify(r.session.id)
      + ',model:' + JSON.stringify(r.selection.model) + '}));',
    'setInterval(() => {}, 1000);',
  ].join('\n') + '\n', { mode: 0o700 });
  const registry = await createFileClaudeSessionRegistry({ path: join(root, 'sessions.json') });
  const result = await runAuthorizedClaudeCode({
    request: r,
    authorize: async () => authorizationFor(r),
    sessionRegistry: registry,
    hostProbe: async () => ({
      subscriptionAuthenticated: true,
      apiOrProviderOverridesPresent: false,
      inferenceInvoked: false,
    }),
    claudeBinary: fake,
    cancellationGraceMs: 20,
  });
  assert.equal(result.receipt.status, 'TIMED_OUT');
  assert.equal(result.cancellation.timedOut, true);
  assert.equal(result.cancellation.processTreeStopped, true);
  assert.equal(result.automaticRetries, 0);
  assert.equal(result.automaticFallback, false);
});

test('explicit abort cancels the same process tree without automatic replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-host-abort-'));
  const r = request(root);
  const fake = join(root, 'fake-claude-abort.mjs');
  await writeFile(fake, [
    '#!/usr/bin/env node',
    'console.log(JSON.stringify({type:"system",subtype:"init",session_id:' + JSON.stringify(r.session.id)
      + ',model:' + JSON.stringify(r.selection.model) + '}));',
    'setInterval(() => {}, 1000);',
  ].join('\n') + '\n', { mode: 0o700 });
  const registry = await createFileClaudeSessionRegistry({ path: join(root, 'sessions.json') });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);
  const result = await runAuthorizedClaudeCode({
    request: r,
    authorize: async () => authorizationFor(r),
    sessionRegistry: registry,
    hostProbe: async () => ({
      subscriptionAuthenticated: true,
      apiOrProviderOverridesPresent: false,
      inferenceInvoked: false,
    }),
    claudeBinary: fake,
    abortSignal: controller.signal,
    cancellationGraceMs: 20,
  });
  assert.equal(result.receipt.status, 'INTERRUPTED');
  assert.equal(result.cancellation.abortRequested, true);
  assert.equal(result.cancellation.processTreeStopped, true);
  assert.equal(result.automaticRetries, 0);
});

test('resume fails before spawn when persisted session binding differs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-host-resume-'));
  const base = request(root);
  const registry = await createFileClaudeSessionRegistry({ path: join(root, 'sessions.json') });
  await registry.reserve({
    sessionId: base.session.id,
    binding: { ...base.binding, revision: 99 },
    authorizationId: 'old',
  });
  const resumed = request(root, {
    session: {
      id: base.session.id,
      mode: 'resume',
      previousBinding: structuredClone(base.binding),
    },
  });
  let authorized = 0;
  await assert.rejects(() => runAuthorizedClaudeCode({
    request: resumed,
    authorize: async () => { authorized += 1; return authorizationFor(resumed); },
    sessionRegistry: registry,
    hostProbe: async () => ({
      subscriptionAuthenticated: true,
      apiOrProviderOverridesPresent: false,
      inferenceInvoked: false,
    }),
    claudeBinary: '/definitely/not/executed',
  }), /CLAUDE_RESUME_PERSISTED_BINDING_MISMATCH/);
  assert.equal(authorized, 1);
});

function fakeClaudeSource(r) {
  const report = {
    runId: r.runId,
    binding: r.binding,
    status: 'completed',
    summary: 'Synthetic host transport completed.',
    artifacts: [],
    tests: [],
    blockers: [],
  };
  const events = [
    { type: 'system', subtype: 'init', session_id: r.session.id, model: r.selection.model },
    {
      type: 'assistant',
      session_id: r.session.id,
      message: { model: r.selection.model, content: [{ type: 'text', text: 'private text' }] },
    },
    {
      type: 'result',
      subtype: 'success',
      is_error: false,
      session_id: r.session.id,
      structured_output: report,
      num_turns: 1,
      permission_denials: [],
    },
  ];
  return [
    '#!/usr/bin/env node',
    'const args = process.argv.slice(2);',
    'if (args[0] === "--version") { console.log("2.1.281 (Claude Code)"); process.exit(0); }',
    'if (args[0] === "auth" && args[1] === "status") { console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"})); process.exit(0); }',
    'const events = ' + JSON.stringify(events) + ';',
    'for (const event of events) console.log(JSON.stringify(event));',
  ].join('\n') + '\n';
}
