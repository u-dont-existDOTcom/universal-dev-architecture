import { sha256 } from './canonical';
import {
  canonicalDecisionCommentPrefix,
  ingestGitHubSupervisionCandidate,
  parseCanonicalDecisionComment,
  pendingDecisionRequests,
  type GitHubDecisionCandidate,
  type GitHubReceiptPolicy,
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

export class ProviderDecisionCopier {
  private tail: Promise<void> = Promise.resolve();

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
    const run = this.tail.then(() => this.copySerialized(rawInput, caller));
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  private async copySerialized(rawInput: unknown, caller: AuthenticatedProducer): Promise<ProviderDecisionCopyResult> {
    const input = parseInput(rawInput);
    if (!this.options.policy.requestBound?.enabled
      || !this.options.policy.requestBound.relayProducerIds.includes(caller.id)) {
      throw new Error('Provider decision copy requires an explicitly trusted request-bound relay producer.');
    }
    const decision = parseCanonicalDecisionComment(input.canonicalBody);
    if (decision.schema_version !== 5
      || decision.request_id !== input.requestId
      || decision.supervisor_id !== input.supervisorId
      || decision.provider_session_id !== input.providerSessionId) {
      throw new Error('Provider decision copy identity does not match the canonical decision.');
    }
    const events = this.options.eventHistory();
    const pending = (this.options.pendingRequests ?? pendingDecisionRequests)(events).filter((request) => request.requestId === input.requestId);
    const already = events.find((event) => event.data.type === 'github_decision_receipt_ingested'
      && event.data.request_id === input.requestId
      && event.data.provider_session_id === input.providerSessionId);
    if (pending.length !== 1 && !already) throw new Error(`Expected one pending provider decision request; found ${pending.length}.`);
    if (pending[0] && (pending[0].supervisorId !== input.supervisorId || pending[0].worker !== input.workerId)) {
      throw new Error('Provider decision copy request/supervisor/worker binding mismatch.');
    }

    const now = this.options.now?.() ?? new Date().toISOString();
    this.ensureReadbackEvidence(input, now);
    const token = await this.options.tokenProvider();
    if (!token) throw new Error('GitHub write authentication is not configured.');
    const candidate = await this.findOrPublishExactComment(input, token);
    const beforeIngest = this.options.eventHistory();
    const appended = (this.options.ingestCandidate ?? ingestGitHubSupervisionCandidate)(this.options.store, candidate, this.options.policy, now, beforeIngest);
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

  private ensureReadbackEvidence(input: ProviderDecisionCopyInput, occurredAt: string) {
    const receiptId = `provider-browser-dom-readback:${sha256(`${input.requestId}\0${input.providerSessionId}\0${input.canonicalBodySha256}`)}`;
    const existing = this.options.eventHistory().find((event) => event.data.type === 'evidence_receipt_recorded'
      && event.data.receipt_id === receiptId);
    if (existing) return;
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

  private async findOrPublishExactComment(input: ProviderDecisionCopyInput, token: string): Promise<GitHubDecisionCandidate> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const [owner, repository] = this.options.policy.repository.split('/');
    const issue = this.options.policy.decisionIssueNumber;
    const headers = {
      accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
      'content-type': 'application/json', 'user-agent': 'mission-control-provider-decision-copier',
      'x-github-api-version': githubApiVersion,
    };
    const matches: Array<Record<string, unknown>> = [];
    const conflicts: Array<Record<string, unknown>> = [];
    for (let page = 1; page <= 20; page += 1) {
      const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repository}/issues/${issue}/comments?per_page=100&page=${page}`, {
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
          (comment.body === input.canonicalBody ? matches : conflicts).push(comment);
        }
      }
      if (comments.length < 100) break;
    }
    if (conflicts.length) throw new Error('A conflicting GitHub decision already exists for the exact request/provider session.');
    if (matches.length > 1) throw new Error('Multiple exact GitHub decision comments exist for the exact request/provider session.');
    let comment = matches[0];
    if (!comment) {
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
