import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import test from 'node:test';
import {
  AUTOMATIC_CODEX_DISPATCH_IDLE,
  CODEX_EXECUTION_PAYLOAD_PREFIX,
  CODEX_ATTEMPT_STATUSES,
  CODEX_EXECUTION_ROUTES,
  codexDirectiveArtifactSha256,
  dispatchAutomaticMissionControlExecution,
  dispatchMissionControlExecution,
  executeMissionControlCandidate,
  providerSchemaCompatibilityIssues,
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

test('a campaign deadline beyond one attempt keeps the child bounded by the configured attempt timeout', async () => {
  const fixture = await candidateFixture('future-campaign-deadline');
  fixture.config.maxTimeoutMs = 6_500;
  const result = await fixture.dispatch(fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' }, { deadlineMs: 60_000 }));
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.equal(result.route, CODEX_EXECUTION_ROUTES.LOCAL);
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
  fixture.config.maxTimeoutMs = 6_500;
  const directive = fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' }, { deadlineMs: 6_000 });
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

test('provider-incompatible output schema closes for reasoning review without launching Codex', async () => {
  const fixture = await candidateFixture('invalid-output-schema');
  const directive = fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' });
  directive.outputSchema = {
    type: 'object',
    required: ['values'],
    properties: { values: { type: 'array' } },
  };
  const result = await fixture.dispatch(directive);
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.FAILED);
  assert.equal(result.processExitState.started, false);
  assert.deepEqual(result.outputSchemaCompatibilityIssues, [
    '$.additionalProperties must be false',
    '$.properties.values.items is required',
  ]);
  assert.equal(result.missionControlLifecycle.executionReceiptRecorded, true);
  assert.deepEqual(fixture.missionControl.eventTypes, ['codex_execution_started', 'execution_receipt_recorded']);
  assert.equal(fixture.spawnCalls.length, 0);
});

test('a provider-schema failure whose receipt write was interrupted is reconciled without duplicate execution', async () => {
  const fixture = await candidateFixture('invalid-schema-reconcile');
  const directive = fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' });
  directive.outputSchema = { type: 'object', required: ['values'], properties: { values: { type: 'array' } } };
  fixture.missionControl.failNextReceipt = true;
  await assert.rejects(fixture.dispatch(directive), /injected receipt interruption/);
  const jobDir = join(fixture.config.stateDir, 'jobs', directive.jobId);
  const firstEntries = (await readdir(jobDir, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  assert.equal(firstEntries.length, 1);
  assert.equal(fixture.spawnCalls.length, 0);

  const recovered = await fixture.dispatch(directive);
  const finalEntries = (await readdir(jobDir, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  assert.equal(finalEntries.length, 1);
  assert.equal(recovered.recoveredTerminalAttempt, true);
  assert.equal(recovered.missionControlLifecycle.executionStartRecorded, false);
  assert.equal(recovered.missionControlLifecycle.executionStartRecovered, true);
  assert.equal(recovered.missionControlLifecycle.executionReceiptRecorded, true);
  assert.deepEqual(fixture.missionControl.eventTypes, ['codex_execution_started', 'execution_receipt_recorded']);
  assert.equal(fixture.spawnCalls.length, 0);
});

test('a structured STOPPED result closes the directive and requests independent reasoning review', async () => {
  const fixture = await candidateFixture('structured-stop');
  const directive = fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' });
  directive.outputSchema = structuredStopOutputSchema();
  const result = await fixture.dispatch(directive, { environment: { FAKE_CODEX_MODE: 'structured-stop' } });
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.equal(result.protocol.resultRequestsReasoningReviewStop, true);
  assert.equal(result.missionControlLifecycle.executionReceiptRecorded, true);
  assert.deepEqual(fixture.missionControl.eventTypes, ['codex_execution_started', 'execution_receipt_recorded']);
  const receipt = fixture.missionControl.events.find((event) => event.data.type === 'execution_receipt_recorded');
  assert.equal(receipt.data.next_reasoning_review_required, true);
  assert.equal(receipt.data.stop_trigger_reached, 'integrity evidence unavailable');
  assert.deepEqual(receipt.data.blockers, ['integrity evidence unavailable']);
});

test('an interrupted structured STOPPED receipt is reconciled without duplicate execution', async () => {
  const fixture = await candidateFixture('structured-stop-reconcile');
  const directive = fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' });
  directive.outputSchema = structuredStopOutputSchema();
  fixture.missionControl.failNextReceipt = true;
  await assert.rejects(
    fixture.dispatch(directive, { environment: { FAKE_CODEX_MODE: 'structured-stop' } }),
    /injected receipt interruption/,
  );
  const firstSpawnCount = fixture.spawnCalls.length;
  assert.ok(firstSpawnCount > 0);

  const recovered = await fixture.dispatch(directive, { environment: { FAKE_CODEX_MODE: 'structured-stop' } });
  assert.equal(recovered.recoveredTerminalAttempt, true);
  assert.equal(recovered.missionControlLifecycle.executionStartRecovered, true);
  assert.equal(recovered.missionControlLifecycle.executionReceiptRecorded, true);
  assert.deepEqual(fixture.missionControl.eventTypes, ['codex_execution_started', 'execution_receipt_recorded']);
  assert.equal(fixture.spawnCalls.length, firstSpawnCount);
});

test('a structured BLOCKED result closes the directive for independent reasoning review', async () => {
  const fixture = await candidateFixture('structured-blocked');
  const directive = fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' });
  directive.outputSchema = structuredStopOutputSchema();
  const result = await fixture.dispatch(directive, { environment: { FAKE_CODEX_MODE: 'structured-blocked' } });
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.equal(result.protocol.resultRequestsReasoningReviewStop, true);
  assert.equal(result.missionControlLifecycle.executionReceiptRecorded, true);
  const receipt = fixture.missionControl.events.find((event) => event.data.type === 'execution_receipt_recorded');
  assert.equal(receipt.data.stop_trigger_reached, 'required inputs unavailable');
  assert.deepEqual(receipt.data.blockers, ['required inputs unavailable']);
});

test('a structured COMPLETED result closes the directive without requiring a success boolean', async () => {
  const fixture = await candidateFixture('structured-completed');
  const directive = fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' });
  directive.outputSchema = structuredCompletionOutputSchema();
  const result = await fixture.dispatch(directive, { environment: { FAKE_CODEX_MODE: 'structured-completed' } });
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.equal(result.protocol.resultReportsSuccess, true);
  assert.equal(result.protocol.resultReportsStructuredCompletion, true);
  assert.equal(result.missionControlLifecycle.executionReceiptRecorded, true);
  assert.deepEqual(fixture.missionControl.eventTypes, ['codex_execution_started', 'execution_receipt_recorded']);
});

test('an interrupted structured COMPLETED receipt is reconciled without duplicate execution', async () => {
  const fixture = await candidateFixture('structured-completed-reconcile');
  const directive = fixture.directive({ type: 'LOCAL_FILESYSTEM_COMMAND' });
  directive.outputSchema = structuredCompletionOutputSchema();
  fixture.missionControl.failNextReceipt = true;
  await assert.rejects(
    fixture.dispatch(directive, { environment: { FAKE_CODEX_MODE: 'structured-completed' } }),
    /injected receipt interruption/,
  );
  const firstSpawnCount = fixture.spawnCalls.length;
  assert.ok(firstSpawnCount > 0);

  const recovered = await fixture.dispatch(directive, { environment: { FAKE_CODEX_MODE: 'structured-completed' } });
  assert.equal(recovered.recoveredTerminalAttempt, true);
  assert.equal(recovered.missionControlLifecycle.executionStartRecovered, true);
  assert.equal(recovered.missionControlLifecycle.executionReceiptRecorded, true);
  assert.deepEqual(fixture.missionControl.eventTypes, ['codex_execution_started', 'execution_receipt_recorded']);
  assert.equal(fixture.spawnCalls.length, firstSpawnCount);
});

test('provider schema compatibility inspection is deterministic and non-mutating', () => {
  const schema = { type: 'object', required: ['items'], properties: { items: { type: 'array' } } };
  const before = JSON.stringify(schema);
  assert.deepEqual(providerSchemaCompatibilityIssues(schema), [
    '$.additionalProperties must be false',
    '$.properties.items.items is required',
  ]);
  assert.equal(JSON.stringify(schema), before);
  assert.deepEqual(providerSchemaCompatibilityIssues(outputSchema), []);
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

test('durable schema-v3 state automatically reaches CODEX_LOCAL without directive or admission files', async () => {
  const fixture = await automaticFixture('automatic-local', { type: 'LOCAL_FILESYSTEM_COMMAND' });
  const result = await dispatchAutomaticMissionControlExecution({
    config: fixture.config,
    missionControl: fixture.missionControl,
    legacyBrowserHandler: async () => { throw new Error('legacy path must not run'); },
    spawnImpl: fixture.spawnImpl,
  });
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.equal(result.route, CODEX_EXECUTION_ROUTES.LOCAL);
  assert.equal(result.automaticDispatch.taskId, fixture.directive.sourceDirective.taskId);
  assert.equal(result.automaticDispatch.directiveId, fixture.directive.sourceDirective.id);
  assert.equal(fixture.missionControl.admissionCalls, 1);
  assert.equal(fixture.missionControl.preflightCalls, 1);
  assert.deepEqual(fixture.missionControl.eventTypes, ['codex_execution_started', 'execution_receipt_recorded']);
});

test('automatic dispatch selects the highest-sequence directive from a newest-first transport timeline', async () => {
  const fixture = await automaticFixture('automatic-newest-first', { type: 'LOCAL_FILESYSTEM_COMMAND' });
  const timeline = fixture.missionControl.snapshot.workers[0].timeline;
  timeline.push({ sequence: 0, data: {
    type: 'execution_directive_recorded', worker: fixture.sourceBinding.worker,
    directive_id: 'directive:historical:0', directive_revision: 1, task_id: 'task:historical',
    directive_schema_version: 3, directive_artifact_sha256: '0'.repeat(64),
    source_message_id: 'chat-message:historical:0', source_body_sha256: '0'.repeat(64),
    work_execution_profile: 'LEGACY_MODEL_PROFILE_UNSPECIFIED', status: 'ACTIVE',
  } });
  timeline.sort((left, right) => right.sequence - left.sequence);
  const result = await dispatchAutomaticMissionControlExecution({
    config: fixture.config,
    missionControl: fixture.missionControl,
    legacyBrowserHandler: async () => { throw new Error('legacy path must not run'); },
    spawnImpl: fixture.spawnImpl,
  });
  assert.equal(result.status, CODEX_ATTEMPT_STATUSES.COMPLETED);
  assert.equal(result.automaticDispatch.directiveId, fixture.directive.sourceDirective.id);
});

test('automatic preview-disabled and unsupported-browser fallback retain the exact durable task and request', async (t) => {
  for (const [name, capability, previewEnabled, reason] of [
    ['preview-off', { type: 'LOCAL_FILESYSTEM_COMMAND' }, false, 'PREVIEW_DISABLED'],
    ['unsupported-browser', { type: 'BROWSER', name: 'CLICK_AND_TYPE' }, true, 'UNSUPPORTED_OR_UNCLASSIFIED_CAPABILITY'],
  ]) {
    await t.test(name, async () => {
      const fixture = await automaticFixture(`automatic-${name}`, capability);
      fixture.config.previewEnabled = previewEnabled;
      let received = null;
      const result = await dispatchAutomaticMissionControlExecution({
        config: fixture.config,
        missionControl: fixture.missionControl,
        legacyBrowserHandler: async (_directive, routing) => {
          received = routing;
          return { status: 'EXACT_LEGACY_HANDLER_CALLED', missionControlLegacyBinding: routing.missionControlBinding };
        },
        spawnImpl: fixture.spawnImpl,
      });
      assert.equal(result.status, 'EXACT_LEGACY_HANDLER_CALLED');
      assert.equal(received.reason, reason);
      assert.deepEqual(received.missionControlBinding, fixture.sourceBinding);
      assert.equal(fixture.missionControl.admissionCalls, 0);
      assert.equal(fixture.spawnCalls.length, 0);
    });
  }
});

test('automatic Codex dispatcher ignores an explicit CHATGPT_WORK_CLOUD directive', async () => {
  const fixture = await automaticFixture('native-work-excluded', { type: 'LOCAL_FILESYSTEM_COMMAND' });
  fixture.missionControl.snapshot.workers[0].timeline[1].data.execution_surface = 'CHATGPT_WORK_CLOUD';
  const result = await dispatchAutomaticMissionControlExecution({
    config: fixture.config, missionControl: fixture.missionControl,
    legacyBrowserHandler: async () => { throw new Error('legacy path must not run'); },
    spawnImpl: fixture.spawnImpl,
  });
  assert.equal(result.status, AUTOMATIC_CODEX_DISPATCH_IDLE);
  assert.equal(result.codexChildStarted, false);
  assert.equal(fixture.spawnCalls.length, 0);
  assert.equal(fixture.missionControl.admissionCalls, 0);
});

test('no durable executable directive is idle and cannot start Codex', async () => {
  const fixture = await candidateFixture('automatic-idle');
  fixture.missionControl.snapshot = { workers: [{ id: 'worker-automatic-idle', timeline: [] }] };
  const result = await dispatchAutomaticMissionControlExecution({
    config: fixture.config,
    missionControl: fixture.missionControl,
    legacyBrowserHandler: async () => { throw new Error('legacy path must not run'); },
    spawnImpl: fixture.spawnImpl,
  });
  assert.equal(result.status, AUTOMATIC_CODEX_DISPATCH_IDLE);
  assert.equal(result.codexChildStarted, false);
  assert.equal(fixture.spawnCalls.length, 0);
  assert.equal(fixture.missionControl.admissionCalls, 0);
});

async function automaticFixture(name, executionCapability) {
  const fixture = await candidateFixture(name);
  const payload = {
    schemaVersion: 1,
    jobId: `job-${name}`,
    deadline: new Date(Date.now() + 30_000).toISOString(),
    workspace: fixture.workspace,
    executionCapability,
    outputSchema,
    prompt: `bounded directive for ${name}`,
  };
  const sourceBody = `${CODEX_EXECUTION_PAYLOAD_PREFIX}${JSON.stringify(payload)}`;
  const sourceBodySha256 = sha256(sourceBody);
  const directive = {
    ...fixture.directive(executionCapability),
    deadline: payload.deadline,
    prompt: payload.prompt,
    executionSurface: 'CODEX',
    sourceDirective: {
      id: `directive:${name}:1`, revision: 1, taskId: `task:${name}`,
      sourceMessageId: `chat-message:${name}:1`, sourceBodySha256,
    },
  };
  const sourceBinding = {
    worker: `worker-${name}`,
    taskId: directive.sourceDirective.taskId,
    directiveId: directive.sourceDirective.id,
    directiveRevision: 1,
    sourceMessageId: directive.sourceDirective.sourceMessageId,
    sourceBodySha256,
    decisionRequestId: `legacy-request:${name}`,
  };
  fixture.missionControl.snapshot = {
    generatedAt: new Date().toISOString(),
    workers: [{
      id: sourceBinding.worker,
      timeline: [
        { sequence: 1, data: {
          type: 'reasoning_message_recorded', message_id: sourceBinding.sourceMessageId,
          surface_role: 'PROJECT_MANAGER', author_role: 'ASSISTANT', provenance_status: 'VERIFIED',
          body_sha256: sourceBodySha256, exact_visible_body: sourceBody,
          decision_request_id: sourceBinding.decisionRequestId,
        } },
        { sequence: 2, data: {
          type: 'execution_directive_recorded', worker: sourceBinding.worker,
          directive_id: sourceBinding.directiveId, directive_revision: 1, task_id: sourceBinding.taskId,
          directive_schema_version: 3, directive_artifact_sha256: codexDirectiveArtifactSha256(directive),
          source_message_id: sourceBinding.sourceMessageId, source_body_sha256: sourceBodySha256,
          work_execution_profile: solLowProfile, execution_surface: 'CODEX', status: 'ACTIVE',
        } },
      ],
    }],
  };
  fixture.directive = directive;
  fixture.sourceBinding = sourceBinding;
  return fixture;
}

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
    mcpStartupTimeoutSeconds: 5, mcpToolTimeoutSeconds: 5, environment: { ...process.env },
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
      config.environment = { ...config.environment, OPENAI_API_KEY: 'must-not-reach-child', CODEX_API_KEY: 'must-not-reach-child', ...environment };
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
  events = [];
  failNextReceipt = false;

  bind(admissionInput, profile) {
    this.admissionInput = admissionInput;
    this.profile = profile;
  }

  async requestExecutionAdmission(_worker, input) {
    this.admissionCalls += 1;
    if (this.admissionOverride) return this.admissionOverride;
    if (this.admissionInput) assert.strictEqual(input, this.admissionInput);
    else {
      this.admissionInput = input;
      this.profile = input.request.workExecutionProfile;
    }
    return {
      admitted: true, mayExecute: true, requestId: input.request.requestId,
      profileAuthorizationId: `work-profile-authorization:${sha256(input.request.requestId).slice(0, 24)}`,
      setterEvidenceId: `setter:${sha256(input.request.requestId).slice(0, 24)}`,
      authorizedWorkExecutionProfile: this.profile,
      primaryDecision: { decision: 'ALLOW_BOUNDED_EXECUTION' },
    };
  }

  async fetchFleet() { return this.snapshot; }

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
    if (this.failNextReceipt && events.some((event) => event.data.type === 'execution_receipt_recorded')) {
      this.failNextReceipt = false;
      throw new Error('injected receipt interruption');
    }
    this.events.push(...events);
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
else if (mode === 'structured-stop') {
  writeFileSync(resultPath, JSON.stringify({
    status: 'STOPPED', next_reasoning_review_required: true,
    stop_trigger_reached: 'integrity evidence unavailable', deviations: ['receipt was not locatable'],
  }));
  process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');
}
else if (mode === 'structured-blocked') {
  writeFileSync(resultPath, JSON.stringify({
    status: 'BLOCKED', next_reasoning_review_required: true,
    stop_trigger_reached: 'required inputs unavailable', deviations: [],
  }));
  process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');
}
else if (mode === 'structured-completed') {
  writeFileSync(resultPath, JSON.stringify({ status: 'COMPLETED', gate_verdict: 'PASS' }));
  process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');
}
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

function structuredStopOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'next_reasoning_review_required', 'stop_trigger_reached', 'deviations'],
    properties: {
      status: { type: 'string' },
      next_reasoning_review_required: { type: 'boolean' },
      stop_trigger_reached: { type: 'string' },
      deviations: { type: 'array', items: { type: 'string' } },
    },
  };
}

function structuredCompletionOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'gate_verdict'],
    properties: {
      status: { type: 'string' },
      gate_verdict: { type: 'string' },
    },
  };
}

test('config places ephemeral runtime outside the durable state default', () => {
  const config = loadCodexExecCandidateConfig({ HOME: '/home/USER' });
  assert.equal(pathWithin(config.stateDir, config.runtimeDir), false);
});
