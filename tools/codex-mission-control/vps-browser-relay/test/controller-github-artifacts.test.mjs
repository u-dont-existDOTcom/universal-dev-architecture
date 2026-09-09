import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTROLLER_ARTIFACT_KINDS,
  CONTROLLER_ARTIFACT_PREFIX,
  ControllerGitHubArtifacts,
  parseControllerArtifact,
  validateControllerArtifact,
} from '../src/controller-github-artifacts.mjs';
import { sha256 } from '../src/core.mjs';

const ownerExactText = 'Keep CRLF\r\ntrailing spaces  \u00a0emoji 🙂 and e\u0301 distinct.';

test('artifact parser and validator preserve exact OWNER UTF-8 bytes', () => {
  const expected = expectedArtifact();
  const artifact = artifactFor(expected);
  const parsed = parseControllerArtifact(body(artifact));
  assert.equal(parsed.semantic_payload.exact_text, ownerExactText);
  assert.equal(validateControllerArtifact(parsed, expected), true);
  for (const changed of [
    ownerExactText.replace('\r\n', '\n'),
    ownerExactText.replace('spaces  ', 'spaces '),
    ownerExactText.replace('\u00a0', ' '),
    ownerExactText.normalize('NFC'),
  ]) {
    const mutant = structuredClone(artifact);
    mutant.semantic_payload.exact_text = changed;
    mutant.semantic_payload.sha256 = sha256(changed);
    mutant.owner_bytes_sha256 = sha256(changed);
    assert.throws(() => validateControllerArtifact(parseControllerArtifact(body(mutant)), expected), /MISMATCH/);
  }
});

test('artifact schema rejects extra fields, hash changes, and predecessor changes', () => {
  const expected = expectedArtifact();
  const base = artifactFor(expected);
  const mutants = [
    (value) => { value.extra = true; },
    (value) => { value.semantic_payload.extra = true; },
    (value) => { value.semantic_payload.sha256 = '0'.repeat(64); },
    (value) => { value.predecessor = { comment_id: 'other', body_sha256: 'a'.repeat(64) }; },
  ];
  for (const mutate of mutants) {
    const value = structuredClone(base);
    mutate(value);
    assert.throws(() => validateControllerArtifact(parseControllerArtifact(body(value)), expected));
  }
});

test('GitHub reconciliation scans all pages then binds an immutable exact comment', async () => {
  const expected = expectedArtifact();
  const artifactBody = body(artifactFor(expected));
  const filler = Array.from({ length: 100 }, (_, index) => githubComment(index + 1, 'unrelated'));
  const exact = githubComment(101, artifactBody);
  const calls = [];
  const client = new ControllerGitHubArtifacts({
    repository: 'o/r', issueNumber: 61, authorizedWriterLogins: ['owner'],
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith('/issues/comments/101')) return jsonResponse(exact);
      if (new URL(url).searchParams.get('page') === '1') return jsonResponse(filler);
      return jsonResponse([exact]);
    },
  });
  const found = await client.reconcile(expected);
  assert.equal(found.commentId, '101');
  assert.equal(found.bodySha256, sha256(artifactBody));
  assert.equal(found.artifact.semantic_payload.exact_text, ownerExactText);
  assert.equal(calls.length, 3);
  assert.equal(new URL(calls[0]).searchParams.get('since'), expected.notBefore);
});

test('same-identity duplicate redelivery blocks instead of choosing latest', async () => {
  const expected = expectedArtifact();
  const artifactBody = body(artifactFor(expected));
  const client = new ControllerGitHubArtifacts({
    repository: 'o/r', issueNumber: 61, authorizedWriterLogins: ['owner'],
    fetchImpl: async () => jsonResponse([githubComment(1, artifactBody), githubComment(2, artifactBody)]),
  });
  await assert.rejects(() => client.reconcile(expected), /CARDINALITY_CONFLICT/);
});

test('unrelated artifacts are ignored but exact-identity invalid input fails closed', async () => {
  const expected = expectedArtifact();
  const unrelated = artifactFor({ ...expected, artifactNonce: 'other-nonce' });
  const invalid = artifactFor(expected);
  invalid.semantic_payload.sha256 = '0'.repeat(64);
  let phase = 'unrelated';
  const client = new ControllerGitHubArtifacts({
    repository: 'o/r', issueNumber: 61, authorizedWriterLogins: ['owner'],
    fetchImpl: async () => jsonResponse(phase === 'unrelated' ? [githubComment(1, body(unrelated))] : [githubComment(2, body(invalid))]),
  });
  assert.equal(await client.reconcile(expected), null);
  phase = 'invalid';
  await assert.rejects(() => client.reconcile(expected), /schema/);
});

test('exact comment rejects unauthorized author, wrong channel, and stale time', async () => {
  const expected = expectedArtifact();
  const artifactBody = body(artifactFor(expected));
  for (const mutate of [
    (comment) => { comment.user.login = 'intruder'; },
    (comment) => { comment.issue_url = 'https://api.github.com/repos/o/r/issues/62'; },
    (comment) => { comment.created_at = '2026-09-08T00:00:00.000Z'; },
  ]) {
    const exact = githubComment(1, artifactBody);
    mutate(exact);
    const client = new ControllerGitHubArtifacts({
      repository: 'o/r', issueNumber: 61, authorizedWriterLogins: ['owner'],
      fetchImpl: async (url) => jsonResponse(url.endsWith('/issues/comments/1') ? exact : [exact]),
    });
    await assert.rejects(() => client.reconcile(expected));
  }
});

function expectedArtifact() {
  return {
    artifactKind: CONTROLLER_ARTIFACT_KINDS.ORIGIN,
    cycleId: 'cycle-1', taskId: 'task-1', requestId: 'request-1', artifactNonce: 'nonce-origin',
    producerSupervisorId: 'origin', consumerSupervisorId: 'mc-project-manager',
    sourceProviderSessionId: 'provider-session:origin',
    sourceTargetBindingSha256: 'a'.repeat(64), controllerBindingSha256: 'b'.repeat(64),
    ownerBytesSha256: sha256(ownerExactText), ownerExactText, predecessor: null,
    notBefore: '2026-09-09T00:00:00.000Z', notAfter: '2026-09-10T00:00:00.000Z',
  };
}

function artifactFor(expected) {
  return {
    schema_version: 1,
    artifact_kind: expected.artifactKind,
    cycle_id: expected.cycleId,
    task_id: expected.taskId,
    request_id: expected.requestId,
    artifact_nonce: expected.artifactNonce,
    producer_supervisor_id: expected.producerSupervisorId,
    consumer_supervisor_id: expected.consumerSupervisorId,
    source_provider_session_id: expected.sourceProviderSessionId,
    source_target_binding_sha256: expected.sourceTargetBindingSha256,
    controller_binding_sha256: expected.controllerBindingSha256,
    predecessor: expected.predecessor,
    owner_bytes_sha256: expected.ownerBytesSha256,
    semantic_payload: { exact_text: expected.ownerExactText, sha256: expected.ownerBytesSha256 },
  };
}

function body(value) { return CONTROLLER_ARTIFACT_PREFIX + JSON.stringify(value); }

function githubComment(id, commentBody) {
  return {
    id, body: commentBody, user: { login: 'owner' }, created_at: '2026-09-09T12:00:00.000Z',
    html_url: `https://github.com/o/r/issues/61#issuecomment-${id}`,
    issue_url: 'https://api.github.com/repos/o/r/issues/61',
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}
