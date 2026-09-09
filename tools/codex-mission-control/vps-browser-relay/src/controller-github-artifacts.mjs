import { canonicalJson, sha256 } from './core.mjs';

export const CONTROLLER_ARTIFACT_PREFIX = 'MISSION_CONTROL_CONTROLLER_GITHUB_ARTIFACT_V1\n';
export const CONTROLLER_ARTIFACT_KINDS = Object.freeze({
  ORIGIN: 'ORIGIN_TO_PM',
  PM: 'PM_TO_ORIGIN',
});

export class ControllerGitHubArtifacts {
  constructor({ repository, issueNumber, authorizedWriterLogins, fetchImpl = fetch, requestTimeoutMs = 30_000 }) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) throw new Error('Controller artifact repository must be owner/name.');
    if (!Number.isInteger(issueNumber) || issueNumber < 1) throw new Error('Controller artifact issue number must be positive.');
    if (!Array.isArray(authorizedWriterLogins) || authorizedWriterLogins.length === 0
      || authorizedWriterLogins.some((login) => typeof login !== 'string' || login.trim() === '')) {
      throw new Error('Controller artifacts require at least one exact authorized GitHub writer login.');
    }
    this.repository = repository;
    this.issueNumber = issueNumber;
    this.authorizedWriterLogins = new Set(authorizedWriterLogins.map((login) => login.toLowerCase()));
    this.fetchImpl = fetchImpl;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async reconcile(expected) {
    const identityMatches = [];
    if (!Number.isFinite(Date.parse(expected?.notBefore ?? ''))) throw new Error('Controller artifact lower time bound is invalid.');
    const since = encodeURIComponent(new Date(Date.parse(expected.notBefore)).toISOString());
    for (let page = 1; ; page += 1) {
      const comments = await this.#request(`/repos/${this.repository}/issues/${this.issueNumber}/comments?per_page=100&page=${page}&sort=created&direction=asc&since=${since}`);
      if (!Array.isArray(comments)) throw new Error('GitHub issue comments response is not an array.');
      for (const comment of comments) {
        if (typeof comment?.body !== 'string' || !comment.body.startsWith(CONTROLLER_ARTIFACT_PREFIX)) continue;
        const identity = peekArtifactIdentity(comment.body);
        if (!sameArtifactIdentity(identity, expected)) continue;
        const parsed = parseControllerArtifact(comment.body);
        identityMatches.push({ comment, parsed });
      }
      if (comments.length < 100) break;
      if (page >= 1000) throw new Error('Controller artifact pagination exceeded the bounded 100000-comment scan.');
    }
    if (identityMatches.length === 0) return null;
    if (identityMatches.length !== 1) throw new Error(`CONTROLLER_ARTIFACT_CARDINALITY_CONFLICT: found ${identityMatches.length} exact identity candidates.`);

    const listed = identityMatches[0];
    const comment = await this.#request(`/repos/${this.repository}/issues/comments/${listed.comment.id}`);
    if (comment?.id !== listed.comment.id || comment?.body !== listed.comment.body) {
      throw new Error('CONTROLLER_ARTIFACT_IMMUTABLE_REREAD_MISMATCH: listed and exact-comment reads differ.');
    }
    const actual = parseControllerArtifact(comment.body);
    validateControllerArtifact(actual, expected);
    const authorLogin = comment?.user?.login;
    if (typeof authorLogin !== 'string' || !this.authorizedWriterLogins.has(authorLogin.toLowerCase())) {
      throw new Error(`CONTROLLER_ARTIFACT_UNAUTHORIZED_AUTHOR: ${authorLogin ?? 'UNKNOWN'}.`);
    }
    const immutableUrl = `https://github.com/${this.repository}/issues/${this.issueNumber}#issuecomment-${comment.id}`;
    if (comment.html_url !== immutableUrl) throw new Error('CONTROLLER_ARTIFACT_IMMUTABLE_URL_MISMATCH.');
    if (comment.issue_url !== `https://api.github.com/repos/${this.repository}/issues/${this.issueNumber}`) {
      throw new Error('CONTROLLER_ARTIFACT_ISSUE_BINDING_MISMATCH.');
    }
    if (!Number.isFinite(Date.parse(comment.created_at ?? ''))) throw new Error('CONTROLLER_ARTIFACT_CREATED_AT_INVALID.');
    const createdMs = Date.parse(comment.created_at);
    if (createdMs < Date.parse(expected.notBefore) || createdMs > Date.parse(expected.notAfter)) {
      throw new Error('CONTROLLER_ARTIFACT_STALE: comment is outside the exact controller cycle window.');
    }
    return {
      commentId: String(comment.id),
      immutableUrl,
      bodySha256: sha256(comment.body),
      authorLogin,
      createdAt: comment.created_at,
      artifact: actual,
    };
  }

  async #request(path) {
    const response = await this.fetchImpl(`https://api.github.com${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'mission-control-controller-relay',
      },
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    const text = await response.text();
    let value;
    try { value = JSON.parse(text); }
    catch { throw new Error(`GitHub artifact read returned non-JSON HTTP ${response.status}.`); }
    if (!response.ok) throw new Error(`GitHub artifact read failed with HTTP ${response.status}.`);
    return value;
  }
}

export function parseControllerArtifact(body) {
  if (typeof body !== 'string' || !body.startsWith(CONTROLLER_ARTIFACT_PREFIX)) {
    throw new Error('Controller artifact prefix is missing.');
  }
  let value;
  try { value = JSON.parse(body.slice(CONTROLLER_ARTIFACT_PREFIX.length)); }
  catch { throw new Error('Controller artifact JSON is invalid.'); }
  const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).length === keys.length && keys.every((key) => Object.hasOwn(object, key));
  const rootKeys = [
    'schema_version', 'artifact_kind', 'cycle_id', 'task_id', 'request_id', 'artifact_nonce',
    'producer_supervisor_id', 'consumer_supervisor_id', 'source_provider_session_id',
    'source_target_binding_sha256', 'controller_binding_sha256', 'predecessor',
    'owner_bytes_sha256', 'semantic_payload',
  ];
  if (!exact(value, rootKeys) || value.schema_version !== 1
    || !Object.values(CONTROLLER_ARTIFACT_KINDS).includes(value.artifact_kind)
    || !['cycle_id', 'task_id', 'request_id', 'artifact_nonce', 'producer_supervisor_id', 'consumer_supervisor_id', 'source_provider_session_id']
      .every((key) => typeof value[key] === 'string' && value[key].trim() !== '')
    || !['source_target_binding_sha256', 'controller_binding_sha256', 'owner_bytes_sha256']
      .every((key) => isSha256(value[key]))
    || !exact(value.semantic_payload, ['exact_text', 'sha256'])
    || typeof value.semantic_payload.exact_text !== 'string'
    || !isSha256(value.semantic_payload.sha256)
    || sha256(value.semantic_payload.exact_text) !== value.semantic_payload.sha256
    || value.semantic_payload.sha256 !== value.owner_bytes_sha256
    || !(value.predecessor === null || (exact(value.predecessor, ['comment_id', 'body_sha256'])
      && typeof value.predecessor.comment_id === 'string' && value.predecessor.comment_id.trim() !== ''
      && isSha256(value.predecessor.body_sha256)))) {
    throw new Error('Controller artifact schema, semantic payload, or digest is invalid.');
  }
  return value;
}

export function validateControllerArtifact(actual, expected) {
  const exactFields = [
    'artifactKind', 'cycleId', 'taskId', 'requestId', 'artifactNonce', 'producerSupervisorId',
    'consumerSupervisorId', 'sourceProviderSessionId', 'sourceTargetBindingSha256',
    'controllerBindingSha256', 'ownerBytesSha256',
  ];
  const actualByExpected = {
    artifactKind: actual.artifact_kind,
    cycleId: actual.cycle_id,
    taskId: actual.task_id,
    requestId: actual.request_id,
    artifactNonce: actual.artifact_nonce,
    producerSupervisorId: actual.producer_supervisor_id,
    consumerSupervisorId: actual.consumer_supervisor_id,
    sourceProviderSessionId: actual.source_provider_session_id,
    sourceTargetBindingSha256: actual.source_target_binding_sha256,
    controllerBindingSha256: actual.controller_binding_sha256,
    ownerBytesSha256: actual.owner_bytes_sha256,
  };
  for (const field of exactFields) {
    if (actualByExpected[field] !== expected[field]) throw new Error(`CONTROLLER_ARTIFACT_BINDING_MISMATCH: ${field}.`);
  }
  if (actual.semantic_payload.exact_text !== expected.ownerExactText
    || actual.semantic_payload.sha256 !== expected.ownerBytesSha256) {
    throw new Error('CONTROLLER_ARTIFACT_OWNER_BYTES_MISMATCH.');
  }
  const actualPredecessor = actual.predecessor === null ? null : canonicalJson(actual.predecessor);
  const expectedPredecessor = expected.predecessor === null ? null : canonicalJson(expected.predecessor);
  if (actualPredecessor !== expectedPredecessor) throw new Error('CONTROLLER_ARTIFACT_PREDECESSOR_MISMATCH.');
  return true;
}

function sameArtifactIdentity(actual, expected) {
  return actual.cycle_id === expected.cycleId
    && actual.artifact_kind === expected.artifactKind
    && actual.artifact_nonce === expected.artifactNonce;
}

function peekArtifactIdentity(body) {
  try {
    const value = JSON.parse(body.slice(CONTROLLER_ARTIFACT_PREFIX.length));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
