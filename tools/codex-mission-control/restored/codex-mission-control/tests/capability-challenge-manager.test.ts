import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CapabilityChallengeManager,
  assertCapabilityWriterCredentialIsolation,
  capabilityWriterIsolationCredentialsFromEnvironment,
  capabilityNonceCommentPrefix,
  parseCapabilityChallengeDurations,
} from '../lib/capability-challenge-manager';
import {
  capabilityReceiptCommentPrefix,
  capabilityVerifiedSummary,
  ensureConfiguredCapabilityChallenges,
  ingestGitHubSupervisionCandidate,
  parseGitHubReceiptPolicy,
  type GitHubDecisionCandidate,
  type GitHubReceiptPolicy,
} from '../lib/github-decision-receipts';
import { EventStore, type StoredCapabilityChallenge } from '../lib/store';
import { seedIssue47Store } from '../lib/seed';

const repository = 'u-dont-existDOTcom/universal-dev-architecture';
const capabilityIssueNumber = 60;
const writerToken = 'capability-writer-test-token';
const firstTime = '2026-09-13T00:00:00.000Z';
const dayMs = 24 * 60 * 60 * 1000;
const leadMs = 5 * 60 * 60 * 1000;

test('manager publishes the exact public fixture before one durable activation without a provider send path', async () => {
  const store = testStore();
  const calls: FetchCall[] = [];
  const manager = createManager(store, {
    calls,
    now: () => firstTime,
    uuids: ['challenge-one'],
    nonces: ['mc-private', 'github-public'],
  });
  try {
    const active = await manager.ensure('mc-project-manager', 'public-chat-alias');
    assert.equal(active.status, 'ACTIVE');
    assert.equal(active.mcNonce, 'mc-private');
    assert.equal(active.githubNonce, 'github-public');
    assert.notEqual(active.mcNonce, active.githubNonce);
    assert.equal(store.capabilityChallenges().length, 1);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.url.startsWith(exactCommentsUrl())));
    assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST']);
    assert.equal(calls[1]?.authorization, 'Bearer ' + writerToken);

    const posted = JSON.parse(calls[1]?.body ?? '{}') as { body?: string };
    assert.ok(posted.body?.startsWith(capabilityNonceCommentPrefix));
    const fixture = JSON.parse(posted.body?.slice(capabilityNonceCommentPrefix.length) ?? '{}') as Record<string, unknown>;
    assert.deepEqual(Object.keys(fixture).sort(), ['challenge_id', 'chat_id', 'expires_at', 'github_nonce', 'schema_version']);
    assert.equal(fixture.challenge_id, 'capability:challenge-one');
    assert.equal(fixture.chat_id, 'public-chat-alias');
    assert.equal(fixture.github_nonce, 'github-public');
    assert.equal(posted.body?.includes('mc-private'), false);

    const publicChallenge = manager.current('mc-project-manager', 'public-chat-alias', firstTime);
    assert.equal(publicChallenge?.challenge_id, active.challengeId);
    assert.equal(publicChallenge?.mc_nonce, active.mcNonce);
    assert.equal(store.allEvents().some((event) => event.data.type === 'evidence_receipt_recorded'
      && event.data.summary === capabilityVerifiedSummary), false);
    assert.ok(calls.every((call) => call.url.startsWith('https://api.github.com/')));
  } finally {
    store.close();
  }
});

test('simultaneous ensure requests publish and activate at most one challenge', async () => {
  const store = testStore();
  const calls: FetchCall[] = [];
  const manager = createManager(store, {
    calls,
    now: () => firstTime,
    uuids: ['concurrent'],
    nonces: ['mc-concurrent', 'github-concurrent'],
  });
  try {
    const [left, right] = await Promise.all([
      manager.ensure('mc-project-manager', 'public-chat-alias'),
      manager.ensure('mc-project-manager', 'public-chat-alias'),
    ]);
    assert.equal(left.challengeId, right.challengeId);
    assert.equal(store.capabilityChallenges().filter((item) => item.status === 'ACTIVE').length, 1);
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
  } finally {
    store.close();
  }
});

test('healthy restart reuses the current challenge without GitHub access', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-capability-healthy-'));
  const filename = join(root, 'mission-control.sqlite');
  let store: EventStore | null = testStore(filename);
  const firstCalls: FetchCall[] = [];
  try {
    const first = await createManager(store, {
      calls: firstCalls,
      now: () => firstTime,
      uuids: ['healthy'],
      nonces: ['mc-healthy', 'github-healthy'],
    }).ensure('mc-project-manager', 'public-chat-alias');
    store.close();
    store = null;
    store = new EventStore(filename);
    const restarted = new CapabilityChallengeManager(store, policy(), {
      ttlMs: dayMs,
      renewalLeadMs: leadMs,
      now: () => new Date(Date.parse(firstTime) + 60_000).toISOString(),
      uuid: () => 'unused',
      nonce: () => 'unused-nonce',
      fetchImpl: async () => {
        throw new Error('healthy restart must not call GitHub');
      },
    });
    const reused = await restarted.ensure('mc-project-manager', 'public-chat-alias');
    assert.equal(reused.challengeId, first.challengeId);
    assert.equal(store.capabilityChallenges().length, 1);
  } finally {
    store?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('restart after publication recovers the pending exact comment and activates only that challenge', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-capability-pending-'));
  const filename = join(root, 'mission-control.sqlite');
  let store: EventStore | null = testStore(filename);
  try {
    const expiresAt = new Date(Date.parse(firstTime) + dayMs).toISOString();
    const pending = store.reserveCapabilityChallenge({
      challengeId: 'capability:pending-restart',
      supervisorId: 'mc-project-manager',
      chatId: 'public-chat-alias',
      worker: 'mission-control-live-slice',
      mcNonce: 'mc-restart',
      githubNonce: 'github-restart',
      issuedAt: firstTime,
      expiresAt,
      source: 'DYNAMIC',
    }, firstTime, leadMs).challenge;
    store.close();
    store = new EventStore(filename);
    const calls: FetchCall[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const call = captureCall(input, init);
      calls.push(call);
      assert.equal(call.method, 'GET');
      return jsonResponse([publicationFixture(pending, 501)]);
    };
    const manager = new CapabilityChallengeManager(store, policy(), {
      ttlMs: dayMs,
      renewalLeadMs: leadMs,
      token: writerToken,
      now: () => new Date(Date.parse(firstTime) + 60_000).toISOString(),
      uuid: () => 'unused-restart',
      nonce: (() => {
        const values = ['unused-restart-mc', 'unused-restart-github'];
        return () => values.shift() ?? 'unused-restart-extra';
      })(),
      fetchImpl,
    });
    const active = await manager.ensure('mc-project-manager', 'public-chat-alias');
    assert.equal(active.challengeId, pending.challengeId);
    assert.equal(active.publicationCommentId, 501);
    assert.equal(calls.length, 1);
    assert.equal(store.capabilityChallenges().filter((item) => item.status === 'ACTIVE').length, 1);
  } finally {
    store?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('renewal rotates once, retires the old challenge, and old receipts cannot satisfy the new challenge', async () => {
  const store = testStore();
  const calls: FetchCall[] = [];
  let now = firstTime;
  const manager = createManager(store, {
    calls,
    now: () => now,
    uuids: ['old', 'new'],
    nonces: ['mc-old', 'github-old', 'mc-new', 'github-new'],
  });
  try {
    const oldChallenge = await manager.ensure('mc-project-manager', 'public-chat-alias');
    now = new Date(Date.parse(firstTime) + 20 * 60 * 60 * 1000).toISOString();
    const newChallenge = await manager.ensure('mc-project-manager', 'public-chat-alias');
    assert.notEqual(newChallenge.challengeId, oldChallenge.challengeId);
    assert.equal(store.capabilityChallengeById(oldChallenge.challengeId)?.status, 'RETIRED');
    assert.equal(store.capabilityChallengeById(newChallenge.challengeId)?.status, 'ACTIVE');
    assert.equal(store.capabilityChallenges().filter((item) => item.status === 'ACTIVE').length, 1);
    assert.equal(calls.filter((call) => call.method === 'POST').length, 2);
    assert.equal(manager.exact(oldChallenge.challengeId, now), null);

    assert.throws(
      () => ingestGitHubSupervisionCandidate(store, capabilityCandidate(oldChallenge, now), policy(), now),
      /exact current authorized chat challenge/,
    );
    assert.equal(store.allEvents().some((event) => event.data.type === 'evidence_receipt_recorded'
      && event.data.summary === capabilityVerifiedSummary
      && event.data.refs.includes('challenge:' + newChallenge.challengeId)), false);
  } finally {
    store.close();
  }
});

test('failed or misbound GitHub publication never activates a candidate', async () => {
  for (const response of [
    new Response('unavailable', { status: 503 }),
    jsonResponse({
      id: 99,
      body: 'wrong',
      issue_url: 'https://api.github.com/repos/' + repository + '/issues/999',
      html_url: 'https://github.com/' + repository + '/issues/999#issuecomment-99',
    }),
  ]) {
    const store = testStore();
    const fetchImpl: typeof fetch = async (_input, init) => init?.method === 'POST' ? response.clone() : jsonResponse([]);
    const manager = new CapabilityChallengeManager(store, policy(), {
      ttlMs: dayMs,
      renewalLeadMs: leadMs,
      token: writerToken,
      now: () => firstTime,
      uuid: () => 'failed-' + response.status,
      nonce: (() => {
        const values = ['mc-failed-' + response.status, 'github-failed-' + response.status];
        return () => values.shift() ?? 'unused';
      })(),
      fetchImpl,
    });
    try {
      await assert.rejects(manager.ensure('mc-project-manager', 'public-chat-alias'), /no new challenge was activated/);
      assert.equal(store.currentCapabilityChallenge('mc-project-manager', 'public-chat-alias', firstTime), null);
      assert.equal(store.capabilityChallenges()[0]?.status, 'FAILED');
    } finally {
      store.close();
    }
  }
});

test('wrong supervisor/chat binding cannot resolve or consume another challenge', async () => {
  const store = testStore();
  const calls: FetchCall[] = [];
  const manager = createManager(store, {
    calls,
    now: () => firstTime,
    uuids: ['binding'],
    nonces: ['mc-binding', 'github-binding'],
  });
  try {
    const active = await manager.ensure('mc-project-manager', 'public-chat-alias');
    await assert.rejects(manager.ensure('other-supervisor', 'public-chat-alias'), /not statically authorized/);
    await assert.rejects(manager.ensure('mc-project-manager', 'other-chat'), /not statically authorized/);
    assert.equal(manager.current('mc-project-manager', 'other-chat', firstTime), null);
    assert.throws(
      () => ingestGitHubSupervisionCandidate(store, capabilityCandidate(active, firstTime, { chat_id: 'other-chat' }), policy(), firstTime),
      /exact current authorized chat challenge/,
    );
  } finally {
    store.close();
  }
});

test('legacy static challenge policy imports once while new static policy carries subjects only', () => {
  const legacyRaw = JSON.stringify({
    repository,
    decisionIssueNumber: 59,
    capabilityIssueNumber,
    stageIssueNumber: 61,
    authorizedWriterLogins: ['u-dont-existDOTcom'],
    capabilityChallenges: [{
      challengeId: 'legacy-challenge',
      supervisorId: 'mc-project-manager',
      chatId: 'public-chat-alias',
      worker: 'mission-control-live-slice',
      mcNonce: 'legacy-mc',
      githubNonce: 'legacy-github',
      expiresAt: '2099-01-01T00:00:00Z',
      ...controls(),
    }],
  });
  const parsed = parseGitHubReceiptPolicy(legacyRaw);
  assert.ok(parsed);
  assert.equal(parsed.capabilitySubjects.length, 1);
  assert.equal(parsed.capabilityChallenges[0]?.issuedAt, '1970-01-01T00:00:00.000Z');
  const store = testStore();
  try {
    assert.equal(ensureConfiguredCapabilityChallenges(store, parsed, firstTime).length, 1);
    assert.equal(ensureConfiguredCapabilityChallenges(store, parsed, firstTime).length, 0);
    assert.equal(store.currentCapabilityChallenge('mc-project-manager', 'public-chat-alias', firstTime)?.source, 'LEGACY_STATIC');
  } finally {
    store.close();
  }

  const current = parseGitHubReceiptPolicy(JSON.stringify({
    repository,
    decisionIssueNumber: 59,
    capabilityIssueNumber,
    stageIssueNumber: 61,
    authorizedWriterLogins: ['u-dont-existDOTcom'],
    capabilitySubjects: [{ supervisorId: 'mc-project-manager', chatId: 'public-chat-alias', worker: 'mission-control-live-slice', ...controls() }],
  }));
  assert.ok(current);
  assert.equal(current.capabilityChallenges.length, 0);
  assert.equal(current.capabilitySubjects.length, 1);
});

test('legacy migration can never retire a current dynamic challenge', () => {
  const store = testStore();
  try {
    const dynamic = store.reserveCapabilityChallenge({
      challengeId: 'capability:dynamic-current',
      supervisorId: 'mc-project-manager',
      chatId: 'public-chat-alias',
      worker: 'mission-control-live-slice',
      mcNonce: 'dynamic-mc',
      githubNonce: 'dynamic-github',
      issuedAt: firstTime,
      expiresAt: new Date(Date.parse(firstTime) + dayMs).toISOString(),
      source: 'DYNAMIC',
    }, firstTime).challenge;
    store.activateCapabilityChallenge(dynamic.challengeId, {
      commentId: 700,
      url: 'https://github.com/' + repository + '/issues/' + capabilityIssueNumber + '#issuecomment-700',
    }, firstTime);
    const legacy = store.importLegacyCapabilityChallenge({
      challengeId: 'legacy-after-dynamic',
      supervisorId: 'mc-project-manager',
      chatId: 'public-chat-alias',
      worker: 'mission-control-live-slice',
      mcNonce: 'legacy-after-dynamic-mc',
      githubNonce: 'legacy-after-dynamic-github',
      issuedAt: '1970-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      source: 'LEGACY_STATIC',
    }, firstTime);
    assert.equal(legacy.status, 'RETIRED');
    assert.equal(store.capabilityChallengeById(dynamic.challengeId)?.status, 'ACTIVE');
    assert.equal(store.currentCapabilityChallenge('mc-project-manager', 'public-chat-alias', firstTime)?.challengeId, dynamic.challengeId);
  } finally {
    store.close();
  }
});

test('duration bounds and capability-writer credential isolation fail closed', () => {
  assert.deepEqual(parseCapabilityChallengeDurations({ NODE_ENV: 'test' }), { ttlMs: dayMs, renewalLeadMs: leadMs });
  assert.throws(() => parseCapabilityChallengeDurations({ NODE_ENV: 'test', MISSION_CONTROL_CAPABILITY_CHALLENGE_TTL_MS: '1000' }), /must be an integer/);
  assert.throws(() => parseCapabilityChallengeDurations({
    NODE_ENV: 'test',
    MISSION_CONTROL_CAPABILITY_CHALLENGE_TTL_MS: String(6 * 60 * 60 * 1000),
    MISSION_CONTROL_CAPABILITY_CHALLENGE_RENEWAL_LEAD_MS: String(6 * 60 * 60 * 1000),
  }), /must be an integer/);
  assert.throws(() => assertCapabilityWriterCredentialIsolation('same', { reconciliation: 'same' }), /must be distinct/);
  assert.doesNotThrow(() => assertCapabilityWriterCredentialIsolation('writer', { reconciliation: 'reader' }));
  const isolated = capabilityWriterIsolationCredentialsFromEnvironment({
    NODE_ENV: 'test',
    MISSION_CONTROL_INTERNAL_TOKEN: 'internal',
    MISSION_CONTROL_SESSION_SECRET: 'session',
    MISSION_CONTROL_MCP_TOKEN: 'mcp',
    MISSION_CONTROL_WORKER_TOKEN: 'worker',
    MISSION_CONTROL_INGEST_CREDENTIALS: JSON.stringify({
      collector: { token: 'ingest', kind: 'COLLECTOR', workers: ['worker'], tasks: ['task:worker'] },
    }),
  });
  assert.throws(() => assertCapabilityWriterCredentialIsolation('session', isolated), /session credential/);
  assert.throws(() => assertCapabilityWriterCredentialIsolation('ingest', isolated), /ingest credential/);
  assert.throws(
    () => capabilityWriterIsolationCredentialsFromEnvironment({ NODE_ENV: 'test', MISSION_CONTROL_INGEST_CREDENTIALS: '{' }),
    /valid JSON/,
  );
});

interface FetchCall {
  url: string;
  method: string;
  authorization: string | null;
  body: string | null;
}

function createManager(
  store: EventStore,
  options: { calls: FetchCall[]; now: () => string; uuids: string[]; nonces: string[] },
): CapabilityChallengeManager {
  const uuids = [...options.uuids];
  const nonces = [...options.nonces];
  return new CapabilityChallengeManager(store, policy(), {
    ttlMs: dayMs,
    renewalLeadMs: leadMs,
    token: writerToken,
    now: options.now,
    uuid: () => uuids.shift() ?? 'unused-uuid',
    nonce: () => nonces.shift() ?? 'unused-nonce',
    fetchImpl: githubFixtureFetch(options.calls),
  });
}

function githubFixtureFetch(calls: FetchCall[]): typeof fetch {
  return async (input, init) => {
    const call = captureCall(input, init);
    calls.push(call);
    if (call.method === 'GET') return jsonResponse([]);
    const request = JSON.parse(call.body ?? '{}') as { body?: string };
    assert.equal(typeof request.body, 'string');
    const fixture = JSON.parse(request.body?.slice(capabilityNonceCommentPrefix.length) ?? '{}') as Record<string, unknown>;
    return jsonResponse({
      id: calls.length + 100,
      body: request.body,
      issue_url: 'https://api.github.com/repos/' + repository + '/issues/' + capabilityIssueNumber,
      html_url: 'https://github.com/' + repository + '/issues/' + capabilityIssueNumber + '#issuecomment-' + (calls.length + 100),
      fixture,
    });
  };
}

function captureCall(input: RequestInfo | URL, init?: RequestInit): FetchCall {
  return {
    url: String(input),
    method: init?.method ?? 'GET',
    authorization: new Headers(init?.headers).get('authorization'),
    body: typeof init?.body === 'string' ? init.body : null,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}

function publicationFixture(challenge: StoredCapabilityChallenge, commentId: number) {
  const body = capabilityNonceCommentPrefix + JSON.stringify({
    challenge_id: challenge.challengeId,
    chat_id: challenge.chatId,
    expires_at: challenge.expiresAt,
    github_nonce: challenge.githubNonce,
    schema_version: 1,
  });
  return {
    id: commentId,
    body,
    issue_url: 'https://api.github.com/repos/' + repository + '/issues/' + capabilityIssueNumber,
    html_url: 'https://github.com/' + repository + '/issues/' + capabilityIssueNumber + '#issuecomment-' + commentId,
  };
}

function capabilityCandidate(
  challenge: StoredCapabilityChallenge,
  createdAt: string,
  overrides: Record<string, unknown> = {},
): GitHubDecisionCandidate {
  return {
    repository,
    issueNumber: capabilityIssueNumber,
    commentId: 700,
    immutableUrl: 'https://github.com/' + repository + '/issues/' + capabilityIssueNumber + '#issuecomment-700',
    createdAt,
    authorLogin: 'u-dont-existDOTcom',
    deliveryId: null,
    body: capabilityReceiptCommentPrefix + JSON.stringify({
      schema_version: 1,
      challenge_id: challenge.challengeId,
      chat_id: challenge.chatId,
      mc_nonce: challenge.mcNonce,
      github_nonce: challenge.githubNonce,
      capabilities: ['MISSION_CONTROL_READ', 'GITHUB_READ', 'GITHUB_WRITE'],
      ...overrides,
    }),
    ingestionMethod: 'RECONCILIATION_POLL',
  };
}

function policy(): GitHubReceiptPolicy {
  return {
    repository,
    decisionIssueNumber: 59,
    capabilityIssueNumber,
    stageIssueNumber: 61,
    authorizedWriterLogins: ['u-dont-existDOTcom'],
    capabilitySubjects: [{
      supervisorId: 'mc-project-manager',
      chatId: 'public-chat-alias',
      worker: 'mission-control-live-slice',
      ...controls(),
    }],
    capabilityChallenges: [],
  };
}

function controls() {
  return {
    modelVisibleLabel: 'GPT-5.6 Sol' as const,
    thinkingControlLabel: 'Thinking effort' as const,
    thinkingVisibleLabel: 'Extra High' as const,
    thinkingOrdinal: '4 of 5' as const,
    accountPlanLabel: 'Pro' as const,
    accountPlanRole: 'PROVENANCE_METADATA_ONLY' as const,
    accountPlanIsReasoningMode: false as const,
  };
}

function testStore(filename = ':memory:'): EventStore {
  const store = new EventStore(filename);
  seedIssue47Store(store);
  return store;
}

function exactCommentsUrl() {
  return 'https://api.github.com/repos/' + repository + '/issues/' + capabilityIssueNumber + '/comments';
}
