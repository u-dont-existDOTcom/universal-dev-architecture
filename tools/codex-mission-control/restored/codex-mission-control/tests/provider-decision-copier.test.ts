import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../lib/canonical';
import { canonicalDecisionCommentPrefix, type GitHubReceiptPolicy, type PendingDecisionRequest } from '../lib/github-decision-receipts';
import { ProviderDecisionCopier, type ProviderDecisionCopyInput } from '../lib/provider-decision-copier';
import type { AppendEnvelope, StoredEvent } from '../lib/schema';
import type { EventStore } from '../lib/store';

const relay = { id: 'collector:test-relay', kind: 'COLLECTOR' as const, workerScopes: ['worker-1'], taskScopes: ['*'] };
const policy: GitHubReceiptPolicy = {
  repository: 'private-owner/private-receipts', decisionIssueNumber: 4, capabilityIssueNumber: 4, stageIssueNumber: 4,
  authorizedWriterLogins: ['mission-control-app[bot]'], capabilityChallenges: [],
  requestBound: { enabled: true, relayProducerIds: [relay.id] },
};
const request: PendingDecisionRequest = {
  worker: 'worker-1', taskId: 'task-1', requestId: 'fleet-review:1234567890abcdef1234567890abcdef',
  supervisorId: 'mc-project-manager', routeSchemaVersion: 6, nonce: 'nonce:test',
  evidenceCapsule: { id: 'capsule:test', sha256: 'b'.repeat(64) },
  ownerOutcome: { id: 'owner:test', epoch: 1, sha256: 'c'.repeat(64) }, reasoningLane: 'EXTRA_HIGH_DIRECT',
  repository: policy.repository, issueNumber: 4, stageIssueNumber: 4,
  queuedAt: '2026-10-06T00:00:00.000Z', expiresAt: '2026-10-06T01:00:00.000Z',
  factualStateSha256: 'd'.repeat(64), evidenceRefsSha256: 'e'.repeat(64), decisionRequestedSha256: 'f'.repeat(64),
};
const providerSessionId = 'provider-session:test';
const exactText = 'Proceed with the exact bounded directive.';
const canonicalBody = canonicalDecisionCommentPrefix + JSON.stringify({
  schema_version: 5, envelope_kind: 'MISSION_CONTROL_CANONICAL_DECISION', request_id: request.requestId,
  supervisor_id: request.supervisorId, provider_session_id: providerSessionId, nonce: request.nonce,
  in_band_binding_sha256: 'a'.repeat(64), execution_provenance: 'IN_BAND_REQUEST_BINDING_GITHUB_OBSERVED',
  evidence_capsule: request.evidenceCapsule, owner_outcome: request.ownerOutcome, reasoning_lane: request.reasoningLane,
  decision_block: { decision_id: 'decision:test', exact_text: exactText, sha256: sha256(exactText) },
  pro_decision_block: { used: false, model_mode: null, exact_text: null, sha256: null },
  writer_contract: { mode: 'EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY', reinterpretation_allowed: false },
});
const input: ProviderDecisionCopyInput = {
  requestId: request.requestId, supervisorId: request.supervisorId, providerSessionId, workerId: request.worker,
  conversationUrl: 'https://chatgpt.com/c/exact-conversation', providerPromptSha256: '1'.repeat(64),
  canonicalBody, canonicalBodySha256: sha256(canonicalBody), browserTargetIdSha256: '2'.repeat(64),
  userTurnKeySha256: '3'.repeat(64), assistantTurnKeySha256: '4'.repeat(64), sourceReaderApp: 'GitHub',
};

class FakeStore {
  events: StoredEvent[] = [];
  append(envelope: AppendEnvelope, occurredAt?: string): StoredEvent {
    const event = {
      eventId: envelope.event_id, missionId: envelope.mission_id, occurredAt: occurredAt ?? envelope.occurred_at,
      worker: envelope.data.worker,
      sequence: this.events.length + 1, producerId: 'test', producerKind: 'SYSTEM',
      previousEventHash: null, eventHash: sha256(JSON.stringify(envelope)), schemaVersion: 2, data: envelope.data,
    } as unknown as StoredEvent;
    this.events.push(event);
    return event;
  }
}

function fixture({ readbackBody = canonicalBody, conflictBody = null as string | null, pending = true,
  initialComments = [] as Array<Record<string, unknown>>, failPage = null as number | null, ambiguousPost = false,
  pendingRequests = () => pending ? [request] : [],
  onToken = (_store: FakeStore) => {}, onDiscovery = (_store: FakeStore) => {} } = {}) {
  const store = new FakeStore();
  const ownerOutcome = {
    worker: request.worker, data: { type: 'owner_outcome_recorded', worker: request.worker,
      owner_outcome_id: request.ownerOutcome.id, epoch: request.ownerOutcome.epoch,
      owner_outcome_sha256: request.ownerOutcome.sha256 },
  } as StoredEvent;
  const comments: Array<Record<string, unknown>> = [...initialComments];
  if (conflictBody) comments.push(comment(7001, conflictBody));
  let posts = 0, gets = 0, tokenCalls = 0;
  const fetchImpl = async (value: string | URL | Request, init?: RequestInit) => {
    const url = String(value);
    const page = new URL(url).searchParams.get('page');
    if (page) {
      onDiscovery(store);
      if (Number(page) === failPage) return new Response('unavailable', { status: 503 });
      return response(comments.slice((Number(page) - 1) * 100, Number(page) * 100));
    }
    if (url.endsWith('/comments') && init?.method === 'POST') {
      posts += 1;
      const posted = JSON.parse(String(init.body)).body;
      const created = comment(7002, posted);
      comments.push(created);
      if (ambiguousPost) throw new Error('Ambiguous publication response');
      return response(created);
    }
    const commentId = url.match(/\/issues\/comments\/(\d+)$/)?.[1];
    if (commentId) { gets += 1; return response({ ...comments.find((item) => item.id === Number(commentId)), body: readbackBody }); }
    throw new Error(`Unexpected URL ${url}`);
  };
  const copier = new ProviderDecisionCopier({
    store: store as unknown as EventStore, policy, tokenProvider: async () => { tokenCalls += 1; onToken(store); return 'installation-token'; },
    eventHistory: () => [ownerOutcome, ...store.events], fetchImpl: fetchImpl as typeof fetch,
    now: () => '2026-10-06T00:10:00.000Z', pendingRequests,
    ingestCandidate: ((eventStore: EventStore, candidate: any, _policy: any, at: string) => {
      if (store.events.some((event) => event.data.type === 'github_decision_receipt_ingested'
        && event.data.request_id === input.requestId)) return [];
      const envelope = { schema_version: 2, event_id: `ingested:${candidate.commentId}`, mission_id: 'mission-control-live', occurred_at: at, data: {
        type: 'github_decision_receipt_ingested', worker: request.worker, task_id: request.taskId,
        receipt_id: `github-comment:${candidate.commentId}`, request_id: input.requestId,
        supervisor_id: input.supervisorId, provider_session_id: input.providerSessionId,
        github_receipt: { repository: policy.repository, issue_number: 4, comment_id: candidate.commentId, immutable_url: candidate.immutableUrl },
        ingested_at: at,
      } } as unknown as AppendEnvelope;
      return [(eventStore as unknown as FakeStore).append(envelope, at)];
    }) as any,
  });
  return { store, copier, comments, counts: () => ({ posts, gets }), sideEffects: () => ({ events: store.events.length, tokenCalls, posts, gets }) };
}

test('exact recovery publishes once, performs immutable readback, ingests, and is idempotent', async () => {
  const f = fixture();
  const first = await f.copier.copy(input, relay);
  assert.equal(first.status, 'INGESTED');
  assert.deepEqual(f.counts(), { posts: 1, gets: 1 });
  assert.equal(f.comments[0]?.body, canonicalBody);
  assert.equal(f.store.events.some((event) => event.data.type === 'evidence_receipt_recorded'
    && event.data.summary === 'MISSION_CONTROL_PROVIDER_SESSION_BROWSER_DOM_READBACK_V1'), true);
  const second = await f.copier.copy(input, relay);
  assert.equal(second.duplicate, true);
  assert.deepEqual(f.counts(), { posts: 1, gets: 2 });
});

for (const boundary of ['onToken', 'onDiscovery'] as const) {
  test(`request retirement during ${boundary} prevents publication`, async () => {
    let pending = true;
    const f = fixture({
      pendingRequests: () => pending ? [request] : [],
      [boundary]: () => { pending = false; },
    });
    await assert.rejects(() => f.copier.copy(input, relay), /pending provider decision request/);
    assert.deepEqual(f.counts(), { posts: 0, gets: 0 });
    assert.equal(f.store.events.some((event) => event.data.type === 'github_decision_receipt_ingested'), false);
  });

  test(`owner-outcome epoch change during ${boundary} prevents stale publication`, async () => {
    const f = fixture({ [boundary]: (store: FakeStore) => {
      store.append({ schema_version: 2, event_id: 'owner-outcome:new', mission_id: 'mission-control-live',
        occurred_at: '2026-10-06T00:09:00.000Z', data: {
          type: 'owner_outcome_recorded', worker: request.worker, owner_outcome_id: request.ownerOutcome.id,
          epoch: request.ownerOutcome.epoch + 1, owner_outcome_sha256: '9'.repeat(64),
        },
      } as AppendEnvelope);
    } });
    await assert.rejects(() => f.copier.copy(input, relay), /current owner-outcome epoch/);
    assert.deepEqual(f.counts(), { posts: 0, gets: 0 });
    assert.equal(f.store.events.some((event) => event.data.type === 'github_decision_receipt_ingested'), false);
  });
}

test('request binding changes during discovery prevent publication', async () => {
  let current = request;
  const f = fixture({ pendingRequests: () => [current],
    onDiscovery: () => { current = { ...request, nonce: 'nonce:replaced' }; } });
  await assert.rejects(() => f.copier.copy(input, relay), /request binding changed/);
  assert.deepEqual(f.counts(), { posts: 0, gets: 0 });
});

test('complete comment discovery reuses a receipt after 2000 unrelated comments', async () => {
  const f = fixture({ initialComments: [...unrelatedComments(2_000), comment(7001, canonicalBody)] });
  await f.copier.copy(input, relay);
  assert.deepEqual(f.counts(), { posts: 0, gets: 1 });
});

test('complete discovery rejects a later conflict even after an exact match on page 21', async () => {
  const parsed = JSON.parse(canonicalBody.slice(canonicalDecisionCommentPrefix.length));
  parsed.decision_block.exact_text += ' changed';
  parsed.decision_block.sha256 = sha256(parsed.decision_block.exact_text);
  const f = fixture({ initialComments: [...unrelatedComments(2_000), comment(7001, canonicalBody),
    ...unrelatedComments(99), comment(7003, canonicalDecisionCommentPrefix + JSON.stringify(parsed))] });
  await assert.rejects(() => f.copier.copy(input, relay), /conflicting GitHub decision/);
  assert.deepEqual(f.counts(), { posts: 0, gets: 0 });
});

test('incomplete discovery past page 20 fails closed before publication', async () => {
  const f = fixture({ initialComments: unrelatedComments(2_000), failPage: 21 });
  await assert.rejects(() => f.copier.copy(input, relay), /discovery failed with HTTP 503/);
  assert.deepEqual(f.counts(), { posts: 0, gets: 0 });
});

test('retry after an ambiguous POST finds the receipt past page 20 without publishing again', async () => {
  const f = fixture({ initialComments: unrelatedComments(2_000), ambiguousPost: true });
  await assert.rejects(() => f.copier.copy(input, relay), /Ambiguous publication response/);
  assert.equal((await f.copier.copy(input, relay)).status, 'INGESTED');
  assert.deepEqual(f.counts(), { posts: 1, gets: 1 });
});

function unrelatedComments(count: number) {
  return Array.from({ length: count }, (_, index) => comment(10_000 + index, 'Unrelated discussion.'));
}

test('immutable readback mismatch fails closed after publication', async () => {
  const f = fixture({ readbackBody: canonicalBody + 'x' });
  await assert.rejects(() => f.copier.copy(input, relay), /readback hash mismatch/);
  assert.deepEqual(f.counts(), { posts: 1, gets: 1 });
});

test('conflicting same request/session comment and non-pending request both fail before publication', async () => {
  const parsed = JSON.parse(canonicalBody.slice(canonicalDecisionCommentPrefix.length));
  parsed.decision_block.exact_text += ' changed';
  parsed.decision_block.sha256 = sha256(parsed.decision_block.exact_text);
  const conflict = canonicalDecisionCommentPrefix + JSON.stringify(parsed);
  const conflicting = fixture({ conflictBody: conflict });
  await assert.rejects(() => conflicting.copier.copy(input, relay), /conflicting GitHub decision/);
  assert.equal(conflicting.counts().posts, 0);
  const retired = fixture({ pending: false });
  await assert.rejects(() => retired.copier.copy(input, relay), /Expected one pending/);
  assert.deepEqual(retired.counts(), { posts: 0, gets: 0 });
});

test('wrong request/session/body digest and untrusted relay fail before GitHub transport', async () => {
  for (const changed of [
    { ...input, requestId: 'fleet-review:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    { ...input, providerSessionId: 'provider-session:wrong' },
    { ...input, canonicalBodySha256: '0'.repeat(64) },
  ]) {
    const f = fixture();
    await assert.rejects(() => f.copier.copy(changed, relay));
    assert.deepEqual(f.counts(), { posts: 0, gets: 0 });
  }
  const f = fixture();
  await assert.rejects(() => f.copier.copy(input, { ...relay, id: 'collector:untrusted' }), /trusted request-bound relay/);
  assert.deepEqual(f.counts(), { posts: 0, gets: 0 });
});

test('authoritative canonical-schema validation is side-effect free and rejects an invalid nested execution profile', () => {
  const validBody = withBoundedExecution('HIGH');
  const validInput = { ...input, canonicalBody: validBody, canonicalBodySha256: sha256(validBody) };
  const valid = fixture();
  assert.deepEqual(valid.copier.validate(validInput, relay), {
    status: 'VALIDATED', validationScope: 'CANONICAL_SCHEMA_AND_REQUEST_IDENTITY',
    requestId: input.requestId, providerSessionId: input.providerSessionId,
    canonicalBodySha256: sha256(validBody), ingestionAuthorized: false,
  });
  assert.deepEqual(valid.sideEffects(), { events: 0, tokenCalls: 0, posts: 0, gets: 0 });

  const invalidBody = withBoundedExecution('XHIGH');
  const invalidInput = { ...input, canonicalBody: invalidBody, canonicalBodySha256: sha256(invalidBody) };
  const invalid = fixture();
  assert.throws(() => invalid.copier.validate(invalidInput, relay));
  assert.deepEqual(invalid.sideEffects(), { events: 0, tokenCalls: 0, posts: 0, gets: 0 });
});

test('copy reuses authoritative validation before evidence, token, or publication side effects', async () => {
  const invalidBody = withBoundedExecution('XHIGH');
  const invalidInput = { ...input, canonicalBody: invalidBody, canonicalBodySha256: sha256(invalidBody) };
  const f = fixture();
  await assert.rejects(() => f.copier.copy(invalidInput, relay));
  assert.deepEqual(f.sideEffects(), { events: 0, tokenCalls: 0, posts: 0, gets: 0 });
});

test('accepted nonidentical canonical bytes are published and read back without rewriting', async () => {
  const parsed = JSON.parse(canonicalBody.slice(canonicalDecisionCommentPrefix.length));
  const exactBody = canonicalDecisionCommentPrefix + JSON.stringify(parsed, null, 2);
  assert.notEqual(exactBody, canonicalBody);
  const exactInput = { ...input, canonicalBody: exactBody, canonicalBodySha256: sha256(exactBody) };
  const f = fixture({ readbackBody: exactBody });
  await f.copier.copy(exactInput, relay);
  assert.equal(f.comments[0]?.body, exactBody);
});

function withBoundedExecution(effort: 'HIGH' | 'XHIGH') {
  const parsed = JSON.parse(canonicalBody.slice(canonicalDecisionCommentPrefix.length));
  parsed.bounded_execution = {
    schema_version: 1, task_id: request.taskId, job_id: 'job-schema-guard',
    execution_objective: 'Execute the exact bounded directive.',
    reasoning_summary: 'The accepted reasoning selected this bounded residue.',
    strategy_id: 'strategy:schema-guard',
    strategy_causal_hypothesis: 'The bounded action advances the current outcome.',
    predicted_outcome_change: 'The named bounded evidence becomes available.',
    success_threshold: 'The named evidence passes.', failure_threshold: 'The named evidence fails.',
    next_decision_changing_evidence: 'The bounded execution result.',
    reviewed_evidence_boundary: 'The current frozen evidence boundary.',
    inputs: [{ type: 'ARTIFACT', ref: 'fixture:schema-guard', sha256: null }],
    allowed_actions: ['Run the bounded action.'], allowed_paths: ['/tmp/schema-guard'],
    allowed_commands: ['true'], forbidden_actions: ['Do not publish.'], forbidden_paths: [],
    forbidden_decisions: ['Do not change strategy.'], required_evidence: ['A deterministic receipt.'],
    required_tests_or_checks: ['Validate the receipt.'], stop_and_return_triggers: ['Any validation failure.'],
    maximum_execution_cycles: 1, execution_capability: { type: 'LOCAL_FILESYSTEM_COMMAND' },
    workspace: '/tmp/schema-guard', output_schema: { type: 'object' },
    prompt: 'Return the exact bounded result.', deadline: '2026-10-07T00:00:00.000Z',
    work_execution_profile: {
      model: 'GPT_5_6_SOL', effort, routingTier: 'SOL_HIGH_EXCEPTION', routingTriggers: ['OWNER_AUTHORIZED_BLOCKER'],
      fastModeRequest: 'DO_NOT_ENABLE_FAST', assuranceRequirement: 'SET_REQUEST_SUFFICIENT',
      policyRef: 'patterns/work-model-and-effort-routing.md',
      routingPolicyBaseCommit: 'fc3d0d7592a4fa69e94ff8ae31d9a4e5433b73cb', contractVersion: 'TRUSTED_SETTER_V1',
    },
  };
  return canonicalDecisionCommentPrefix + JSON.stringify(parsed);
}

function comment(id: number, body: string) {
  return { id, body, html_url: `https://github.com/${policy.repository}/issues/4#issuecomment-${id}`,
    created_at: '2026-10-06T00:09:00.000Z', user: { login: 'mission-control-app[bot]' } };
}

function response(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}
