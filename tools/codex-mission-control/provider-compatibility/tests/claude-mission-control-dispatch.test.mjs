import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildClaudeRequestFromDirective,
  dispatchClaudeMissionControlExecution,
} from '../claude-mission-control-dispatch.mjs';
import { codexDirectiveArtifactSha256 } from '../../vps-browser-relay/src/codex-exec-candidate.mjs';

function directive(root) {
  return {
    schemaVersion: 2,
    jobId: 'claude-bridge-test',
    sourceDirective: {
      id: 'directive:claude-bridge:1', revision: 1, taskId: 'task:claude-bridge',
      sourceMessageId: 'chat-message:claude-bridge:1', sourceBodySha256: 'a'.repeat(64),
    },
    executionProvider: 'ANTHROPIC',
    executionSurface: 'CLAUDE_CODE_CLI',
    requestedModel: 'claude-synthetic-test',
    reasoningEffort: 'medium',
    workExecutionProfile: 'LEGACY_MODEL_PROFILE_UNSPECIFIED',
    claudeExecutionProfile: {
      provider: 'ANTHROPIC', surface: 'CLAUDE_CODE_CLI', role: 'EXECUTION',
      model: 'claude-synthetic-test', effort: 'MEDIUM', billing: 'SUBSCRIPTION',
      assuranceRequirement: 'CLIENT_REPORTED_MODEL_REQUIRED',
      expensiveEffortApproved: false, contractVersion: 'TRUSTED_CLAUDE_CODE_V1',
    },
    claudeRuntime: {
      session: { id: '22222222-2222-4222-8222-222222222222', mode: 'new' },
      limits: { maxTurns: 3, maxWallTimeMs: 5000, maxStreamBytes: 1_000_000 },
      access: { builtInTools: ['Read'], autoApprove: [], mcpServers: {} },
    },
    deadline: '2099-09-24T00:00:00.000Z',
    workspace: root,
    executionCapability: { type: 'LOCAL_FILESYSTEM_COMMAND' },
    outputSchema: { type: 'object' },
    prompt: 'Perform only the synthetic bridge fixture.',
  };
}

function admissionInputFor(d) {
  return {
    request: {
      requestId: 'admission:claude-bridge:1',
      action: 'EXECUTE_BOUNDED_TASK', actor: 'WORK',
      sourceReceipt: {
        messageId: d.sourceDirective.sourceMessageId,
        bodySha256: d.sourceDirective.sourceBodySha256,
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
        directiveId: d.sourceDirective.id, directiveRevision: d.sourceDirective.revision,
        taskId: d.sourceDirective.taskId, directiveArtifactSha256: codexDirectiveArtifactSha256(d),
      },
      executionProvider: 'ANTHROPIC',
      workExecutionProfile: 'LEGACY_MODEL_PROFILE_UNSPECIFIED',
      claudeExecutionProfile: structuredClone(d.claudeExecutionProfile),
    },
    factualPacket: null,
  };
}

function admitted(d) {
  return {
    mayExecute: true, admitted: true, executionProvider: 'ANTHROPIC',
    primaryDecision: { executionProvider: 'ANTHROPIC' },
    authorizedClaudeExecutionProfile: structuredClone(d.claudeExecutionProfile),
    authorizedWorkExecutionProfile: null, profileAuthorizationId: null,
    claudeProfileAuthorizationId: 'claude-profile-authorization:test',
  };
}

test('source-bound Mission Control admission reaches the host runner and exact worker receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-mc-bridge-'));
  const d = directive(root);
  const request = buildClaudeRequestFromDirective(d);
  const fake = join(root, 'fake-claude.mjs');
  await writeFile(fake, fakeClaudeSource(request), { mode: 0o700 });
  let calls = 0;
  const result = await dispatchClaudeMissionControlExecution({
    worker: 'claude-bridge-worker',
    admissionInput: admissionInputFor(d),
    directive: d,
    missionControl: { requestExecutionAdmission: async () => { calls += 1; return admitted(d); } },
    sessionRegistryPath: join(root, 'sessions.json'),
    claudeBinary: fake,
    env: { HOME: root },
  });
  assert.equal(calls, 1);
  assert.equal(result.receipt.status, 'EXECUTION_REPORTED_COMPLETE');
  assert.equal(result.receipt.report.runId, d.jobId);
  assert.equal(result.receipt.binding.directiveSha256, codexDirectiveArtifactSha256(d));
  assert.equal(result.hostEvidence.inferenceInvoked, false);
  assert.equal(result.automaticRetries, 0);
  assert.equal(result.automaticFallback, false);
});

test('caller-only Claude profile tampering is rejected before host spawn', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-mc-tamper-'));
  const d = directive(root);
  const input = admissionInputFor(d);
  input.request.claudeExecutionProfile.effort = 'HIGH';
  await assert.rejects(() => dispatchClaudeMissionControlExecution({
    worker: 'claude-bridge-worker',
    admissionInput: input,
    directive: d,
    missionControl: { requestExecutionAdmission: async () => admitted(d) },
    sessionRegistryPath: join(root, 'sessions.json'),
    claudeBinary: '/definitely/not-executed',
    env: { HOME: root },
  }), /MISSION_CONTROL_CLAUDE_SOURCE_BINDING_MISMATCH/);
});

function fakeClaudeSource(request) {
  const report = {
    runId: request.runId, binding: request.binding, status: 'completed',
    summary: 'Synthetic bridge completed.', artifacts: [], tests: [], blockers: [],
  };
  const events = [
    { type: 'system', subtype: 'init', session_id: request.session.id, model: request.selection.model },
    { type: 'result', subtype: 'success', is_error: false, session_id: request.session.id,
      structured_output: report, num_turns: 1, permission_denials: [] },
  ];
  return [
    '#!/usr/bin/env node',
    'const args=process.argv.slice(2);',
    'if(args[0]==="--version"){console.log("2.1.281 (Claude Code)");process.exit(0);}',
    'if(args[0]==="auth"&&args[1]==="status"){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}',
    'for(const event of '+JSON.stringify(events)+') console.log(JSON.stringify(event));',
  ].join('\n')+'\n';
}
