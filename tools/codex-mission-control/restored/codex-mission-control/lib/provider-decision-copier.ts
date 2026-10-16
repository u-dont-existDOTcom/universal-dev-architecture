import { canonicalJson, sha256 } from './canonical';
import {
  canonicalDecisionCommentPrefix,
  ingestGitHubSupervisionCandidate,
  parseCanonicalDecisionComment,
  pendingDecisionRequests,
  type GitHubDecisionCandidate,
  type GitHubReceiptPolicy,
  type PendingDecisionRequest,
} from './github-decision-receipts';
import {
  inBandBrowserDomReadbackMethod,
  inBandBrowserDomReadbackProducerId,
  inBandBrowserDomReadbackSummary,
} from './in-band-request-binding';
import type { AuthenticatedProducer } from './ingestion-auth';
import type { AppendEnvelope, StoredEvent } from './schema';
import type { EventStore } from './store';
import type { GitHubReconciliationTokenProvider } from './github-app-auth';
import type { GitHubReconciliationEventCache } from './github-decision-receipts';

const githubApiVersion = '2022-11-28';
/** Discovery reads comments updated from this long before the request was queued; an exact or conflicting comment for
 * the request can't be older (ingestion refuses one created before the request), and the margin absorbs clock skew. */
const discoveryMarginMs = 10 * 60_000;
/** A new readback or post needs this much of the request window left: the post may take its full 30-second timeout and
 * GitHub's clock may differ from ours, and a comment GitHub dates after the window can never be taken in. */
const publicationMarginMs = 2 * 60_000;

function windowTooShort(now: string, request: PendingDecisionRequest): boolean {
  return Date.parse(now) + publicationMarginMs > Date.parse(request.expiresAt);
}
const readbackProducer: AuthenticatedProducer = {
  id: inBandBrowserDomReadbackProducerId,
  kind: 'COLLECTOR',
  workerScopes: ['*'],
  taskScopes: ['*'],
};

export interface ProviderDecisionCopyInput {
  requestId: string;
  supervisorId: string;
  providerSessionId: string;
  workerId: string;
  conversationUrl: string;
  providerPromptSha256: string;
  canonicalBody: string;
  canonicalBodySha256: string;
  browserTargetIdSha256: string;
  userTurnKeySha256: string;
  assistantTurnKeySha256: string;
  sourceReaderApp: 'GitHub';
}

export interface ProviderDecisionCopyResult {
  status: 'INGESTED';
  requestId: string;
  providerSessionId: string;
  canonicalBodySha256: string;
  ingestedEventId: string;
  ingestedAt: string;
  duplicate: boolean;
  githubReceipt: { repository: string; issueNumber: number; commentId: number; immutableUrl: string };
}

export interface ProviderDecisionValidationResult {
  status: 'VALIDATED';
  validationScope: 'CANONICAL_SCHEMA_AND_REQUEST_IDENTITY';
  requestId: string;
  providerSessionId: string;
  canonicalBodySha256: string;
  ingestionAuthorized: false;
}

export class ProviderDecisionValidationError extends Error {
  readonly code = 'CANONICAL_SCHEMA_OR_IDENTITY_INVALID';
}

export class ProviderDecisionCopier {
  private tail: Promise<void> = Promise.resolve();
  private readonly inFlight = new Map<string, Promise<ProviderDecisionCopyResult>>();

  constructor(private readonly options: {
    store: EventStore;
    policy: GitHubReceiptPolicy;
    tokenProvider: GitHubReconciliationTokenProvider;
    eventCache?: GitHubReconciliationEventCache | null;
    eventHistory: () => StoredEvent[];
    fetchImpl?: typeof fetch;
    now?: () => string;
    onAppended?: (events: StoredEvent[]) => void;
    pendingRequests?: typeof pendingDecisionRequests;
    ingestCandidate?: typeof ingestGitHubSupervisionCandidate;
  }) {}

  async copy(rawInput: unknown, caller: AuthenticatedProducer): Promise<ProviderDecisionCopyResult> {
    // A caller that gives up leaves its copy running, so a retry of the exact same copy joins the one still queued or
    // running instead of queueing another behind it.
    const key = copyKey(rawInput, caller);
    const joined = key === null ? undefined : this.inFlight.get(key);
    if (joined) return joined;
    const run = this.tail.then(() => this.copySerialized(rawInput, caller));
    this.tail = run.then(() => undefined, () => undefined);
    if (key !== null) {
      this.inFlight.set(key, run);
      const release = () => { if (this.inFlight.get(key) === run) this.inFlight.delete(key); };
      run.then(release, release);
    }
    return run;
  }

  validate(rawInput: unknown, caller: AuthenticatedProducer): ProviderDecisionValidationResult {
    const input = this.validateInput(rawInput, caller);
    return {
      status: 'VALIDATED',
      validationScope: 'CANONICAL_SCHEMA_AND_REQUEST_IDENTITY',
      requestId: input.requestId,
      providerSessionId: input.providerSessionId,
      canonicalBodySha256: input.canonicalBodySha256,
      ingestionAuthorized: false,
    };
  }

  private async copySerialized(rawInput: unknown, caller: AuthenticatedProducer): Promise<ProviderDecisionCopyResult> {
    const input = this.validateInput(rawInput, caller);
    const events = this.options.eventHistory();
    const pending = (this.options.pendingRequests ?? pendingDecisionRequests)(events).filter((request) => request.requestId === input.requestId);
    const already = events.find((event) => event.data.type === 'github_decision_receipt_ingested'
      && event.data.request_id === input.requestId
      && event.data.provider_session_id === input.providerSessionId);
    // A repeat of an accepted decision is answered from the ledger, without GitHub.
    if (already?.data.type === 'github_decision_receipt_ingested') return alreadyIngested(input, already);
    if (pending.length !== 1) throw new Error(`Expected one pending provider decision request; found ${pending.length}.`);
    const request = pending[0]!;
    if (request.supervisorId !== input.supervisorId || request.worker !== input.workerId) {
      throw new Error('Provider decision copy request/supervisor/worker binding mismatch.');
    }
    // The readback is recorded only right before this copier's own post. Without one, and without time left to post,
    // nothing can come of a GitHub round trip, so none is made.
    if (!this.readbackRecorded(input) && windowTooShort(this.now(), request)) {
      throw new Error('Too little of the request window is left to record the relay readback and post the decision; only app-owned completion evidence can carry it now.');
    }

    const token = await this.options.tokenProvider();
    if (!token) throw new Error('GitHub write authentication is not configured.');
    const candidate = await this.findOrPublishExactComment(input, token, request);
    // Ingestion is timed after the comment's immutable readback, never before the comment existed.
    const ingestedAt = this.now();
    const beforeIngest = this.options.eventHistory();
    const appended = (this.options.ingestCandidate ?? ingestGitHubSupervisionCandidate)(this.options.store, candidate, this.options.policy, ingestedAt, beforeIngest);
    if (appended.length) {
      this.options.eventCache?.recordReconciliationAppend(this.options.store, appended);
      this.options.onAppended?.(appended);
    }
    const allEvents = this.options.eventHistory();
    const ingested = [...allEvents].reverse().find((event) => event.data.type === 'github_decision_receipt_ingested'
      && event.data.request_id === input.requestId
      && event.data.provider_session_id === input.providerSessionId
      && event.data.github_receipt.comment_id === candidate.commentId);
    if (!ingested || ingested.data.type !== 'github_decision_receipt_ingested') {
      throw new Error('Exact GitHub decision was not durably ingested after immutable readback.');
    }
    return {
      status: 'INGESTED', requestId: input.requestId, providerSessionId: input.providerSessionId,
      canonicalBodySha256: input.canonicalBodySha256, ingestedEventId: ingested.eventId,
      ingestedAt: ingested.data.ingested_at, duplicate: appended.length === 0,
      githubReceipt: {
        repository: candidate.repository, issueNumber: candidate.issueNumber,
        commentId: candidate.commentId, immutableUrl: candidate.immutableUrl,
      },
    };
  }

  private validateInput(rawInput: unknown, caller: AuthenticatedProducer): ProviderDecisionCopyInput {
    if (!this.options.policy.requestBound?.enabled
      || !this.options.policy.requestBound.relayProducerIds.includes(caller.id)) {
      throw new Error('Provider decision copy requires an explicitly trusted request-bound relay producer.');
    }
    try {
      const input = parseInput(rawInput);
      const decision = parseCanonicalDecisionComment(input.canonicalBody);
      if (decision.schema_version !== 5
        || decision.request_id !== input.requestId
        || decision.supervisor_id !== input.supervisorId
        || decision.provider_session_id !== input.providerSessionId) {
        throw new Error('Provider decision copy identity does not match the canonical decision.');
      }
      return input;
    } catch (error) {
      throw new ProviderDecisionValidationError(error instanceof Error ? error.message : 'Canonical decision validation failed.');
    }
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }

  private readbackRecorded(input: ProviderDecisionCopyInput): boolean {
    const receiptId = readbackReceiptId(input);
    return this.options.eventHistory().some((event) => event.data.type === 'evidence_receipt_recorded'
      && event.data.receipt_id === receiptId);
  }

  private ensureReadbackEvidence(input: ProviderDecisionCopyInput, occurredAt: string) {
    if (this.readbackRecorded(input)) return;
    const receiptId = readbackReceiptId(input);
    const envelope: AppendEnvelope = {
      schema_version: 2,
      event_id: `evidence:${sha256(`${readbackProducer.id}:${receiptId}`).slice(0, 32)}`,
      mission_id: 'mission-control-live',
      occurred_at: occurredAt,
      data: {
        type: 'evidence_receipt_recorded', worker: input.workerId, receipt_id: receiptId,
        producer_id: readbackProducer.id, producer_role: 'COLLECTOR', evidence_class: 'ARTIFACT',
        independence: 'SAME_PROVENANCE', freshness: 'CURRENT', exact_candidate_sha256: null,
        summary: inBandBrowserDomReadbackSummary,
        refs: [
          `request:${input.requestId}`, `supervisor:${input.supervisorId}`, `provider_session:${input.providerSessionId}`,
          'status:COMPLETE', `machine_block_sha256:${input.canonicalBodySha256}`,
          `provider_prompt_sha256:${input.providerPromptSha256}`, `conversation_url:${input.conversationUrl}`,
          'thread_surface:chatgpt', `browser_target_id_sha256:${input.browserTargetIdSha256}`,
          `user_turn_key_sha256:${input.userTurnKeySha256}`, `assistant_turn_key_sha256:${input.assistantTurnKeySha256}`,
          'source_reader_app:GitHub', 'source_reader_mode:READ_ONLY',
          'browser_capture_surface:EXISTING_BOUND_CONVERSATION_DOM',
          'assistant_message_selection:UNIQUE_CANONICAL_BLOCK', 'semantic_authority:false',
          `readback_method:${inBandBrowserDomReadbackMethod}`,
        ],
        verified: true, changed_path_manifest: null,
      },
    };
    const appended = this.options.store.append(envelope, occurredAt, readbackProducer, this.options.eventHistory());
    this.options.eventCache?.recordReconciliationAppend(this.options.store, [appended]);
    this.options.onAppended?.([appended]);
  }

  private async findOrPublishExactComment(input: ProviderDecisionCopyInput, token: string, request: PendingDecisionRequest): Promise<GitHubDecisionCandidate> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const [owner, repository] = this.options.policy.repository.split('/');
    const issue = this.options.policy.decisionIssueNumber;
    const headers = {
      accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
      'content-type': 'application/json', 'user-agent': 'mission-control-provider-decision-copier',
      'x-github-api-version': githubApiVersion,
    };
    // Keyed by comment id: a comment edited while pages are read can move between pages and be listed twice.
    const matches = new Map<unknown, Record<string, unknown>>();
    const conflicts = new Map<unknown, Record<string, unknown>>();
    const queuedAt = Date.parse(request.queuedAt);
    const since = Number.isFinite(queuedAt) ? `&since=${encodeURIComponent(new Date(queuedAt - discoveryMarginMs).toISOString())}` : '';
    for (let page = 1; ; page += 1) {
      const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repository}/issues/${issue}/comments?per_page=100${since}&page=${page}`, {
        headers, signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`GitHub exact-comment discovery failed with HTTP ${response.status}.`);
      const comments = await response.json() as unknown;
      if (!Array.isArray(comments)) throw new Error('GitHub exact-comment discovery returned a non-array payload.');
      for (const value of comments) {
        const comment = record(value, 'GitHub issue comment');
        if (typeof comment.body !== 'string' || !comment.body.startsWith(canonicalDecisionCommentPrefix)) continue;
        let parsed;
        try { parsed = parseCanonicalDecisionComment(comment.body); } catch { continue; }
        if (parsed.schema_version === 5 && parsed.request_id === input.requestId && parsed.provider_session_id === input.providerSessionId) {
          (comment.body === input.canonicalBody ? matches : conflicts).set(comment.id, comment);
        }
      }
      if (comments.length < 100) break;
    }
    if (conflicts.size) throw new Error('A conflicting GitHub decision already exists for the exact request/provider session.');
    if (matches.size > 1) throw new Error('Multiple exact GitHub decision comments exist for the exact request/provider session.');
    let comment = [...matches.values()][0];
    if (!comment) {
      // Token acquisition and discovery yield to owner updates and request replacement.
      // Revalidate synchronously at the last controllable boundary before the write.
      const events = this.options.eventHistory();
      const current = (this.options.pendingRequests ?? pendingDecisionRequests)(events)
        .filter((candidate) => candidate.requestId === input.requestId);
      if (current.length !== 1) throw new Error(`Expected one current pending provider decision request; found ${current.length}.`);
      if (canonicalJson(current[0]) !== canonicalJson(request)) {
        throw new Error('Provider decision request binding changed before GitHub publication.');
      }
      const outcome = [...events].reverse().find((event) => event.worker === request.worker
        && event.data.type === 'owner_outcome_recorded')?.data;
      if (outcome?.type !== 'owner_outcome_recorded'
        || outcome.owner_outcome_id !== request.ownerOutcome.id
        || outcome.epoch !== request.ownerOutcome.epoch
        || outcome.owner_outcome_sha256 !== request.ownerOutcome.sha256) {
        throw new Error('Provider decision publication is stale against the current owner-outcome epoch.');
      }
      // A comment GitHub dates after the window needs app-owned evidence, which can't stand beside this relay readback,
      // so a post that could land after the window is not started.
      if (windowTooShort(this.now(), request)) {
        throw new Error('Too little of the request window is left to post the decision; it is not posted.');
      }
      // The relay's readback is recorded right before the write, so a reconciliation can take in the comment even if
      // the post's answer is lost.
      this.ensureReadbackEvidence(input, this.now());
      const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repository}/issues/${issue}/comments`, {
        method: 'POST', headers, body: JSON.stringify({ body: input.canonicalBody }), signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`GitHub exact decision publication failed with HTTP ${response.status}.`);
      comment = record(await response.json(), 'GitHub created comment');
    }
    const commentId = positiveInteger(comment.id, 'GitHub comment ID');
    const readback = await fetchImpl(`https://api.github.com/repos/${owner}/${repository}/issues/comments/${commentId}`, {
      headers, signal: AbortSignal.timeout(30_000),
    });
    if (!readback.ok) throw new Error(`GitHub immutable decision readback failed with HTTP ${readback.status}.`);
    const exact = record(await readback.json(), 'GitHub immutable comment');
    if (exact.body !== input.canonicalBody || sha256(String(exact.body)) !== input.canonicalBodySha256) {
      throw new Error('GitHub immutable decision readback hash mismatch.');
    }
    const user = record(exact.user, 'GitHub immutable comment user');
    return {
      repository: this.options.policy.repository, issueNumber: issue, commentId,
      immutableUrl: exactString(exact.html_url, 'GitHub immutable comment URL'),
      createdAt: exactString(exact.created_at, 'GitHub immutable comment creation time'),
      authorLogin: exactString(user.login, 'GitHub immutable comment author'),
      deliveryId: null, body: exact.body as string, ingestionMethod: 'RECONCILIATION_POLL',
    };
  }
}

function readbackReceiptId(input: ProviderDecisionCopyInput): string {
  return `provider-browser-dom-readback:${sha256(`${input.requestId}\0${input.providerSessionId}\0${input.canonicalBodySha256}`)}`;
}

function alreadyIngested(input: ProviderDecisionCopyInput, ingested: StoredEvent): ProviderDecisionCopyResult {
  if (ingested.data.type !== 'github_decision_receipt_ingested') throw new Error('Unexpected accepted-decision event.');
  if (ingested.data.canonical_envelope_sha256 !== sha256(canonicalJson(parseCanonicalDecisionComment(input.canonicalBody)))) {
    throw new Error('A different decision was already accepted for the exact request/provider session.');
  }
  const receipt = ingested.data.github_receipt;
  return {
    status: 'INGESTED', requestId: input.requestId, providerSessionId: input.providerSessionId,
    canonicalBodySha256: input.canonicalBodySha256, ingestedEventId: ingested.eventId,
    ingestedAt: ingested.data.ingested_at, duplicate: true,
    githubReceipt: {
      repository: receipt.repository, issueNumber: receipt.issue_number,
      commentId: receipt.comment_id, immutableUrl: receipt.immutable_url,
    },
  };
}

function copyKey(rawInput: unknown, caller: AuthenticatedProducer): string | null {
  try {
    return sha256(canonicalJson({ caller: { id: caller.id, kind: caller.kind }, input: rawInput }));
  } catch {
    return null;
  }
}

function parseInput(value: unknown): ProviderDecisionCopyInput {
  const input = record(value, 'Provider decision copy input');
  const digest = (field: string) => {
    const result = exactString(input[field], field);
    if (!/^[a-f0-9]{64}$/.test(result)) throw new Error(`${field} must be a lowercase SHA-256 digest.`);
    return result;
  };
  const result: ProviderDecisionCopyInput = {
    requestId: exactString(input.requestId, 'requestId'), supervisorId: exactString(input.supervisorId, 'supervisorId'),
    providerSessionId: exactString(input.providerSessionId, 'providerSessionId'), workerId: exactString(input.workerId, 'workerId'),
    conversationUrl: exactString(input.conversationUrl, 'conversationUrl'), providerPromptSha256: digest('providerPromptSha256'),
    canonicalBody: exactString(input.canonicalBody, 'canonicalBody'), canonicalBodySha256: digest('canonicalBodySha256'),
    browserTargetIdSha256: digest('browserTargetIdSha256'), userTurnKeySha256: digest('userTurnKeySha256'),
    assistantTurnKeySha256: digest('assistantTurnKeySha256'), sourceReaderApp: 'GitHub',
  };
  if (input.sourceReaderApp !== 'GitHub') throw new Error('sourceReaderApp must be GitHub.');
  if (sha256(result.canonicalBody) !== result.canonicalBodySha256) throw new Error('Canonical provider body digest mismatch.');
  if (!result.canonicalBody.startsWith(canonicalDecisionCommentPrefix)) throw new Error('Canonical provider body prefix is invalid.');
  const url = new URL(result.conversationUrl);
  if (url.origin !== 'https://chatgpt.com' || !/^\/c\/(?:WEB:)?[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
    throw new Error('conversationUrl must identify one exact ChatGPT conversation.');
  }
  return result;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`${label} must be a positive integer.`);
  return Number(value);
}
