import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256 } from '../lib/canonical';
import { canonicalDecisionCommentPrefix, parseCanonicalDecisionComment, type GitHubReceiptPolicy, type PendingDecisionRequest } from '../lib/github-decision-receipts';
import { inBandRequestRoutePrefix } from '../lib/in-band-request-binding';
import { WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID } from '../lib/owner-question-route';
import { ProviderDecisionCopier, ProviderDecisionValidationError, type ProviderDecisionCopyInput } from '../lib/provider-decision-copier';
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
  initialComments = [] as Array<Record<string, unknown>>, failPage = null as number | null, ambiguousPost = false, failPost = false,
  pendingRequests = () => pending ? [request] : [], now = (): string => '2026-10-06T00:10:00.000Z', tokenDelay = null as Promise<void> | null,
  history = [] as StoredEvent[],
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
  const discoveries: string[] = [];
  const fetchImpl = async (value: string | URL | Request, init?: RequestInit) => {
    const url = String(value);
    const page = new URL(url).searchParams.get('page');
    if (page) {
      discoveries.push(url);
      onDiscovery(store);
      if (Number(page) === failPage) return new Response('unavailable', { status: 503 });
      // GitHub's since keeps comments updated at or after it.
      const since = new URL(url).searchParams.get('since');
      const listed = since ? comments.filter((item) => Date.parse(String(item.updated_at ?? item.created_at)) >= Date.parse(since)) : comments;
      return response(listed.slice((Number(page) - 1) * 100, Number(page) * 100));
    }
    if (url.endsWith('/comments') && init?.method === 'POST') {
      posts += 1;
      if (failPost) return new Response('unavailable', { status: 503 });
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
    store: store as unknown as EventStore, policy, tokenProvider: async () => {
      tokenCalls += 1; onToken(store); if (tokenDelay) await tokenDelay; return 'installation-token';
    },
    eventHistory: () => [ownerOutcome, ...history, ...store.events], fetchImpl: fetchImpl as typeof fetch,
    now, pendingRequests,
    ingestCandidate: ((eventStore: EventStore, candidate: any, _policy: any, at: string) => {
      if (store.events.some((event) => event.data.type === 'github_decision_receipt_ingested'
        && event.data.request_id === input.requestId)) return [];
      const envelope = { schema_version: 2, event_id: `ingested:${candidate.commentId}`, mission_id: 'mission-control-live', occurred_at: at, data: {
        type: 'github_decision_receipt_ingested', worker: request.worker, task_id: request.taskId,
        receipt_id: `github-comment:${candidate.commentId}`, request_id: input.requestId,
        supervisor_id: input.supervisorId, provider_session_id: input.providerSessionId,
        github_receipt: { repository: policy.repository, issue_number: 4, comment_id: candidate.commentId, immutable_url: candidate.immutableUrl },
        canonical_envelope_sha256: sha256(canonicalJson(parseCanonicalDecisionComment(candidate.body))),
        ingested_at: at,
      } } as unknown as AppendEnvelope;
      return [(eventStore as unknown as FakeStore).append(envelope, at)];
    }) as any,
  });
  return { store, copier, comments, discoveries, counts: () => ({ posts, gets }), sideEffects: () => ({ events: store.events.length, tokenCalls, posts, gets }) };
}

test('exact recovery publishes once, performs immutable readback, ingests, and is idempotent', async () => {
  const f = fixture();
  const first = await f.copier.copy(input, relay);
  assert.equal(first.status, 'INGESTED');
  assert.deepEqual(f.counts(), { posts: 1, gets: 1 });
  assert.equal(f.comments[0]?.body, canonicalBody);
  assert.equal(f.store.events.some((event) => event.data.type === 'evidence_receipt_recorded'
    && event.data.summary === 'MISSION_CONTROL_PROVIDER_SESSION_BROWSER_DOM_READBACK_V1'), true);
  const discoveries = f.discoveries.length;
  const second = await f.copier.copy(input, relay);
  assert.equal(second.duplicate, true);
  assert.deepEqual(second.githubReceipt, first.githubReceipt);
  assert.deepEqual(f.counts(), { posts: 1, gets: 2 }, 'a repeat reads back only the accepted comment');
  assert.equal(f.discoveries.length, discoveries);
  const reformatted = canonicalDecisionCommentPrefix + JSON.stringify(JSON.parse(canonicalBody.slice(canonicalDecisionCommentPrefix.length)), null, 1);
  await assert.rejects(() => f.copier.copy({ ...input, canonicalBody: reformatted, canonicalBodySha256: sha256(reformatted) }, relay),
    /different decision was already accepted/, 'the same decision in other bytes is not reported as the bytes taken in');
  const parsed = JSON.parse(canonicalBody.slice(canonicalDecisionCommentPrefix.length));
  parsed.decision_block.exact_text += ' changed';
  parsed.decision_block.sha256 = sha256(parsed.decision_block.exact_text);
  const changedBody = canonicalDecisionCommentPrefix + JSON.stringify(parsed);
  await assert.rejects(() => f.copier.copy({ ...input, canonicalBody: changedBody, canonicalBodySha256: sha256(changedBody) }, relay),
    /different decision was already accepted/);
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

function unrelatedComments(count: number, createdAt?: string) {
  return Array.from({ length: count }, (_, index) => comment(10_000 + index, 'Unrelated discussion.', createdAt));
}

test('an exclusive section runs after the copy in flight and holds later copies until it ends', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const f = fixture({ tokenDelay: gate });
  const seen: Array<{ at: string; ingested: boolean; tokenCalls: number; posts: number }> = [];
  const mark = (at: string) => {
    const effects = f.sideEffects();
    seen.push({ at, ingested: f.store.events.some((event) => event.data.type === 'github_decision_receipt_ingested'),
      tokenCalls: effects.tokenCalls, posts: effects.posts });
  };
  const first = f.copier.copy(input, relay);
  const section = f.copier.exclusive(async () => { mark('start'); await new Promise((resolve) => setTimeout(resolve, 5)); mark('end'); return 7; });
  const later = f.copier.copy({ ...input, browserTargetIdSha256: '5'.repeat(64) }, relay);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(seen, [], 'the section waits for the copy that is still waiting for its token');
  assert.equal(f.sideEffects().tokenCalls, 1, 'the later copy waits behind the section');
  release();
  assert.equal(await section, 7);
  assert.deepEqual(seen, [
    { at: 'start', ingested: true, tokenCalls: 1, posts: 1 },
    { at: 'end', ingested: true, tokenCalls: 1, posts: 1 },
  ], 'the earlier copy had posted and been taken in, and the later one had not started');
  assert.equal((await first).duplicate, false);
  assert.equal((await later).duplicate, true);
  assert.equal(f.sideEffects().posts, 1);
  await assert.rejects(f.copier.exclusive(async () => { throw new Error('section failed'); }), /section failed/);
  assert.equal((await f.copier.copy(input, relay)).duplicate, true, 'a failed section does not stop later copies');
});

test('a Work answer that breaks the Work decision contract is refused before any readback, token, read or post', async () => {
  const workRequestId = 'work-question:' + '9'.repeat(32);
  const routeBody = inBandRequestRoutePrefix + canonicalJson({
    schemaVersion: 6, requestId: workRequestId, producerId: WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID,
    factualPacket: { exactFactualState: canonicalJson({ review_kind: 'WORK_SUPERVISOR_QUESTION', source_work_dispatch_id: 'dispatch-1',
      question_id: 'question-1', exact_question_sha256: '9'.repeat(64) }) },
  });
  const history = [
    { eventId: 'work-route', worker: request.worker, sequence: 1,
      data: { type: 'worker_message_recorded', worker: request.worker, body: routeBody } },
    { eventId: 'work-dispatch', worker: request.worker, sequence: 2,
      data: { type: 'chatgpt_work_cloud_dispatch_recorded', worker: request.worker, dispatch_id: 'dispatch-1', status: 'READY',
        surface_verification: 'VERIFIED_NATIVE_WORK', work_thread_id: 'work-thread-1' } },
  ] as unknown as StoredEvent[];
  const decision = JSON.parse(canonicalBody.slice(canonicalDecisionCommentPrefix.length));
  const workInput = (extra: Record<string, unknown> = {}): ProviderDecisionCopyInput => {
    const body = canonicalDecisionCommentPrefix + JSON.stringify({ ...decision, request_id: workRequestId, ...extra });
    return { ...input, requestId: workRequestId, canonicalBody: body, canonicalBodySha256: sha256(body) };
  };
  const f = fixture({ history, pendingRequests: () => [{ ...request, requestId: workRequestId }] });
  const missing = workInput();
  assert.throws(() => f.copier.validate(missing, relay),
    (error: unknown) => error instanceof ProviderDecisionValidationError && /explicit owner_action classification/.test(error.message));
  await assert.rejects(f.copier.copy(missing, relay), /explicit owner_action classification/);
  assert.deepEqual(f.sideEffects(), { events: 0, tokenCalls: 0, posts: 0, gets: 0 }, 'no readback, token, read or post');
  assert.equal(f.discoveries.length, 0);
  assert.throws(() => f.copier.validate(workInput({ owner_action: { kind: 'NONE' } }), relay), /CHATGPT_WORK_CLOUD bounded continuation/);
  const ownerRequired = {
    kind: 'DECISION_REQUIRED', decision_id: 'decision:owner-1', question: 'Which repair goes first?', context: 'Two repairs compete.',
    options: [
      { option_id: 'guard', label: 'Guard first', benefits: ['Safer'], drawbacks: ['Slower'], downstream_consequences: ['Retry later'] },
      { option_id: 'retry', label: 'Retry first', benefits: ['Faster'], drawbacks: ['Riskier'], downstream_consequences: ['Guard later'] },
    ],
    recommendation_option_id: 'guard', recommendation_reasoning: 'The guard protects the retry.', default_if_no_decision: 'Guard first.',
  };
  assert.equal(f.copier.validate(workInput({ owner_action: ownerRequired }), relay).status, 'VALIDATED');
  // An answer to a request that isn't a Work question is not held to the Work contract.
  assert.equal(fixture().copier.validate(input, relay).status, 'VALIDATED');
});

test('discovery reads the decision issue only from just before the request was queued', async () => {
  const f = fixture({ initialComments: [...unrelatedComments(2_000, '2026-10-05T12:00:00.000Z'), comment(7001, canonicalBody)] });
  assert.equal((await f.copier.copy(input, relay)).status, 'INGESTED');
  assert.deepEqual(f.counts(), { posts: 0, gets: 1 });
  assert.equal(f.discoveries.length, 1, 'older comments are not paged through');
  assert.equal(new URL(f.discoveries[0]!).searchParams.get('since'), '2026-10-05T23:50:00.000Z');
});

test('a repeated copy joins the one still running instead of queueing another', async () => {
  const f = fixture({ initialComments: unrelatedComments(250) });
  const [first, second] = await Promise.all([f.copier.copy(input, relay), f.copier.copy({ ...input }, relay)]);
  assert.equal(first, second);
  assert.equal(first.duplicate, false);
  assert.deepEqual(f.counts(), { posts: 1, gets: 1 });
  assert.equal(f.discoveries.length, 3, 'one discovery of three pages');
  const later = await f.copier.copy(input, relay);
  assert.equal(later.duplicate, true, 'a copy after it settled runs again');
  const other = fixture();
  await assert.rejects(() => Promise.all([other.copier.copy(input, relay),
    other.copier.copy({ ...input, providerSessionId: 'provider-session:other' }, relay)]), /identity does not match/);
});

test('no readback is recorded and nothing is posted without time left to post inside the request window', async () => {
  for (const at of ['2026-10-06T01:00:00.001Z', '2026-10-06T00:58:00.001Z']) {
    const late = fixture({ now: () => at });
    await assert.rejects(() => late.copier.copy(input, relay), /Too little of the request window is left to record the relay readback/);
    assert.deepEqual(late.sideEffects(), { events: 0, tokenCalls: 0, posts: 0, gets: 0 });
  }
  const justInTime = fixture({ now: () => '2026-10-06T00:58:00.000Z' });
  assert.equal((await justInTime.copier.copy(input, relay)).status, 'INGESTED', 'two minutes before the window closes is enough');

  let clock = '2026-10-06T00:10:00.000Z';
  const posted = fixture({ ambiguousPost: true, now: () => clock });
  await assert.rejects(() => posted.copier.copy(input, relay), /Ambiguous publication response/);
  clock = '2026-10-06T01:30:00.000Z';
  const recovered = await posted.copier.copy(input, relay);
  assert.equal(recovered.status, 'INGESTED', 'a decision posted inside the window is still ingested after it');
  assert.equal(recovered.ingestedAt, clock);
  assert.deepEqual(posted.counts(), { posts: 1, gets: 1 });

  clock = '2026-10-06T00:10:00.000Z';
  const unposted = fixture({ now: () => clock, failPost: true });
  await assert.rejects(() => unposted.copier.copy(input, relay), /publication failed with HTTP 503/);
  assert.equal(unposted.store.events.length, 1, 'the readback was recorded right before the post');
  clock = '2026-10-06T00:58:30.000Z';
  await assert.rejects(() => unposted.copier.copy(input, relay), /Too little of the request window is left to post the decision/);
  assert.deepEqual(unposted.counts(), { posts: 1, gets: 0 }, 'no second post');

  clock = '2026-10-06T00:10:00.000Z';
  let offline = true;
  const unreachable = fixture({ now: () => clock, onDiscovery: () => { if (offline) throw new Error('GitHub unreachable'); } });
  await assert.rejects(() => unreachable.copier.copy(input, relay), /GitHub unreachable/);
  assert.equal(unreachable.store.events.length, 0, 'nothing is recorded before discovery finishes');
  offline = false;
  clock = '2026-10-06T00:58:30.000Z';
  await assert.rejects(() => unreachable.copier.copy(input, relay), /Too little of the request window is left to record the relay readback/);
  assert.deepEqual(unreachable.sideEffects(), { events: 0, tokenCalls: 1, posts: 0, gets: 0 });
});

test('a comment listed twice while pages shift is one match', async () => {
  const exact = comment(7001, canonicalBody);
  const f = fixture({ initialComments: [...unrelatedComments(99), exact, exact] });
  assert.equal((await f.copier.copy(input, relay)).status, 'INGESTED');
  assert.deepEqual(f.counts(), { posts: 0, gets: 1 });
});

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

function comment(id: number, body: string, createdAt = '2026-10-06T00:09:00.000Z') {
  return { id, body, html_url: `https://github.com/${policy.repository}/issues/4#issuecomment-${id}`,
    created_at: createdAt, updated_at: createdAt, user: { login: 'mission-control-app[bot]' } };
}

function response(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}
