import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson, sha256 } from "./canonical";
import type { AuthenticatedProducer } from "./ingestion-auth";
import {
  parseCanonicalDecisionEnvelope,
  type AppendEnvelope,
  type CanonicalDecisionEnvelope,
  type StoredEvent,
} from "./schema";
import type { EventStore } from "./store";

export const supervisoryCycleRoutePrefix = "MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V2\n";
export const canonicalDecisionCommentPrefix = "MISSION_CONTROL_CANONICAL_DECISION_V1\n";
export const githubDecisionProducer: AuthenticatedProducer = {
  id: "system:github-decision-receipts",
  kind: "SYSTEM",
  workerScopes: ["*"],
  taskScopes: ["*"],
};

interface PendingDecisionRequest {
  worker: string;
  taskId: string;
  requestId: string;
  nonce: string;
  evidenceCapsule: { id: string; sha256: string };
  ownerOutcome: { id: string; epoch: number; sha256: string };
  reasoningLane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED";
  repository: string;
  issueNumber: number;
  queuedAt: string;
  expiresAt: string;
}

export interface GitHubDecisionCandidate {
  repository: string;
  issueNumber: number;
  commentId: number;
  immutableUrl: string;
  createdAt: string;
  authorLogin: string;
  deliveryId: string | null;
  body: string;
  ingestionMethod: "GITHUB_WEBHOOK" | "RECONCILIATION_POLL";
}

export function verifyGitHubWebhookSignature(secret: string | undefined, rawBody: string, signature: string | null): boolean {
  if (!secret || secret.length < 32 || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`);
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function githubDecisionCandidateFromWebhook(
  payload: unknown,
  deliveryId: string | null,
): GitHubDecisionCandidate {
  const root = record(payload, "GitHub webhook payload");
  if (root.action !== "created") throw new Error("Only newly created GitHub issue comments are decision receipts.");
  const repository = record(root.repository, "repository");
  const issue = record(root.issue, "issue");
  const comment = record(root.comment, "comment");
  const user = record(comment.user, "comment.user");
  return {
    repository: requiredString(repository.full_name, "repository.full_name"),
    issueNumber: positiveInteger(issue.number, "issue.number"),
    commentId: positiveInteger(comment.id, "comment.id"),
    immutableUrl: httpsUrl(comment.html_url, "comment.html_url"),
    createdAt: timestamp(comment.created_at, "comment.created_at"),
    authorLogin: requiredString(user.login, "comment.user.login"),
    deliveryId: deliveryId ? requiredString(deliveryId, "x-github-delivery") : null,
    body: requiredString(comment.body, "comment.body"),
    ingestionMethod: "GITHUB_WEBHOOK",
  };
}

export function parseCanonicalDecisionComment(body: string): CanonicalDecisionEnvelope {
  if (!body.startsWith(canonicalDecisionCommentPrefix)) {
    throw new Error("GitHub comment does not contain the canonical Mission Control decision prefix.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(canonicalDecisionCommentPrefix.length));
  } catch {
    throw new Error("Canonical Mission Control decision comment contains invalid JSON.");
  }
  const envelope = parseCanonicalDecisionEnvelope(parsed);
  if (sha256(envelope.decision_block.exact_text) !== envelope.decision_block.sha256) {
    throw new Error("Canonical decision block digest mismatch.");
  }
  if (envelope.pro_decision_block.used
    && sha256(envelope.pro_decision_block.exact_text!) !== envelope.pro_decision_block.sha256) {
    throw new Error("Canonical Pro decision block digest mismatch.");
  }
  return envelope;
}

export function pendingDecisionRequests(events: StoredEvent[]): PendingDecisionRequest[] {
  const completed = new Set(events.flatMap((event) => event.data.type === "github_decision_receipt_ingested"
    ? [event.data.request_id]
    : []));
  const requests: PendingDecisionRequest[] = [];
  for (const event of events) {
    if (event.data.type !== "worker_message_recorded" || !event.data.body.startsWith(supervisoryCycleRoutePrefix)) continue;
    const request = parseCycleRequest(event.data.body, event.data.worker);
    if (request && !completed.has(request.requestId)) requests.push(request);
  }
  return requests;
}

export function buildGitHubDecisionReceiptEnvelope(
  events: StoredEvent[],
  candidate: GitHubDecisionCandidate,
  ingestedAt = new Date().toISOString(),
): AppendEnvelope {
  const envelope = parseCanonicalDecisionComment(candidate.body);
  const matches = pendingDecisionRequests(events).filter((item) => item.requestId === envelope.request_id);
  if (matches.length !== 1) throw new Error(`Expected one pending supervisory decision request for ${envelope.request_id}; found ${matches.length}.`);
  const request = matches[0]!;
  assertEqual(envelope.nonce, request.nonce, "decision nonce");
  assertEqual(envelope.evidence_capsule.id, request.evidenceCapsule.id, "evidence capsule ID");
  assertEqual(envelope.evidence_capsule.sha256, request.evidenceCapsule.sha256, "evidence capsule digest");
  assertEqual(envelope.owner_outcome.id, request.ownerOutcome.id, "owner-outcome ID");
  assertEqual(envelope.owner_outcome.epoch, request.ownerOutcome.epoch, "owner-outcome epoch");
  assertEqual(envelope.owner_outcome.sha256, request.ownerOutcome.sha256, "owner-outcome digest");
  assertEqual(envelope.reasoning_lane, request.reasoningLane, "reasoning lane");
  assertEqual(candidate.repository.toLowerCase(), request.repository.toLowerCase(), "GitHub repository");
  assertEqual(candidate.issueNumber, request.issueNumber, "GitHub issue number");
  const created = Date.parse(candidate.createdAt);
  if (created < Date.parse(request.queuedAt) || created > Date.parse(request.expiresAt)) {
    throw new Error("GitHub decision receipt is stale for the admitted request window.");
  }
  const currentOutcome = [...events].reverse().find((event) => event.worker === request.worker
    && event.data.type === "owner_outcome_recorded")?.data;
  if (currentOutcome?.type !== "owner_outcome_recorded"
    || currentOutcome.owner_outcome_id !== request.ownerOutcome.id
    || currentOutcome.epoch !== request.ownerOutcome.epoch
    || currentOutcome.owner_outcome_sha256 !== request.ownerOutcome.sha256) {
    throw new Error("GitHub decision receipt is stale against the current owner-outcome epoch.");
  }
  return {
    schema_version: 2,
    event_id: `github-decision-receipt:${sha256(`${candidate.repository}:${candidate.commentId}`).slice(0, 32)}`,
    mission_id: "mission-control-live",
    occurred_at: candidate.createdAt,
    data: {
      type: "github_decision_receipt_ingested",
      worker: request.worker,
      task_id: request.taskId,
      receipt_id: `github-comment:${candidate.commentId}`,
      request_id: request.requestId,
      nonce: request.nonce,
      evidence_capsule: request.evidenceCapsule,
      owner_outcome_id: request.ownerOutcome.id,
      owner_outcome_epoch: request.ownerOutcome.epoch,
      owner_outcome_sha256: request.ownerOutcome.sha256,
      reasoning_lane: request.reasoningLane,
      decision_block: envelope.decision_block,
      pro_decision_block: envelope.pro_decision_block,
      writer_contract: envelope.writer_contract,
      canonical_envelope_sha256: sha256(canonicalJson(envelope)),
      github_receipt: {
        repository: candidate.repository,
        issue_number: candidate.issueNumber,
        comment_id: candidate.commentId,
        immutable_url: candidate.immutableUrl,
        github_created_at: candidate.createdAt,
        github_author_login: candidate.authorLogin,
        github_delivery_id: candidate.deliveryId,
      },
      ingestion_method: candidate.ingestionMethod,
      ingested_at: ingestedAt,
    },
  };
}

export async function reconcileGitHubDecisionReceipts(
  store: EventStore,
  options: { token: string; fetchImpl?: typeof fetch; now?: string },
): Promise<ReturnType<EventStore["append"]>[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const appended: ReturnType<EventStore["append"]>[] = [];
  const requests = pendingDecisionRequests(store.allEvents());
  const locations = new Map<string, PendingDecisionRequest[]>();
  for (const request of requests) {
    const key = `${request.repository.toLowerCase()}#${request.issueNumber}`;
    locations.set(key, [...(locations.get(key) ?? []), request]);
  }
  for (const locationRequests of locations.values()) {
    const location = locationRequests[0]!;
    const response = await fetchImpl(`https://api.github.com/repos/${location.repository}/issues/${location.issueNumber}/comments?per_page=100&sort=created&direction=desc`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${options.token}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "mission-control-decision-reconciler",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub reconciliation failed for ${location.repository}#${location.issueNumber} with HTTP ${response.status}.`);
    const comments = await response.json();
    if (!Array.isArray(comments)) throw new Error("GitHub reconciliation returned a non-array comment payload.");
    for (const value of comments) {
      const comment = record(value, "GitHub issue comment");
      if (typeof comment.body !== "string" || !comment.body.startsWith(canonicalDecisionCommentPrefix)) continue;
      let parsed: CanonicalDecisionEnvelope;
      try { parsed = parseCanonicalDecisionComment(comment.body); } catch { continue; }
      const request = locationRequests.find((item) => item.requestId === parsed.request_id);
      if (!request) continue;
      const user = record(comment.user, "comment.user");
      const candidate: GitHubDecisionCandidate = {
        repository: request.repository,
        issueNumber: request.issueNumber,
        commentId: positiveInteger(comment.id, "comment.id"),
        immutableUrl: httpsUrl(comment.html_url, "comment.html_url"),
        createdAt: timestamp(comment.created_at, "comment.created_at"),
        authorLogin: requiredString(user.login, "comment.user.login"),
        deliveryId: null,
        body: comment.body,
        ingestionMethod: "RECONCILIATION_POLL",
      };
      const event = buildGitHubDecisionReceiptEnvelope(store.allEvents(), candidate, options.now);
      appended.push(store.append(event, options.now, githubDecisionProducer));
      locationRequests.splice(locationRequests.indexOf(request), 1);
      if (locationRequests.length === 0) break;
    }
  }
  return appended;
}

function parseCycleRequest(body: string, worker: string): PendingDecisionRequest | null {
  try {
    const root = record(JSON.parse(body.slice(supervisoryCycleRoutePrefix.length)), "cycle request");
    const evidence = record(root.evidenceCapsule, "evidenceCapsule");
    const outcome = record(root.ownerOutcome, "ownerOutcome");
    const github = record(root.githubReceipt, "githubReceipt");
    const factual = record(root.factualPacket, "factualPacket");
    if (root.schemaVersion !== 2 || root.packetKind !== "SAME_CHAT_SUPERVISORY_CYCLE"
      || (root.reasoningLane !== "EXTRA_HIGH_DIRECT" && root.reasoningLane !== "PRO_ESCALATED")) return null;
    return {
      worker,
      taskId: requiredString(factual.taskId, "factualPacket.taskId"),
      requestId: requiredString(root.requestId, "requestId"),
      nonce: requiredString(root.nonce, "nonce"),
      evidenceCapsule: { id: requiredString(evidence.id, "evidenceCapsule.id"), sha256: digest(evidence.sha256, "evidenceCapsule.sha256") },
      ownerOutcome: {
        id: requiredString(outcome.id, "ownerOutcome.id"),
        epoch: positiveInteger(outcome.epoch, "ownerOutcome.epoch"),
        sha256: digest(outcome.sha256, "ownerOutcome.sha256"),
      },
      reasoningLane: root.reasoningLane,
      repository: requiredString(github.repository, "githubReceipt.repository"),
      issueNumber: positiveInteger(github.issueNumber, "githubReceipt.issueNumber"),
      queuedAt: timestamp(root.queuedAt, "queuedAt"),
      expiresAt: timestamp(root.expiresAt, "expiresAt"),
    };
  } catch {
    return null;
  }
}

function assertEqual(actual: unknown, expected: unknown, field: string) {
  if (actual !== expected) throw new Error(`Canonical decision ${field} does not match the pending request.`);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  return value;
}

function digest(value: unknown, field: string): string {
  const result = requiredString(value, field);
  if (!/^[a-f0-9]{64}$/.test(result)) throw new Error(`${field} must be a lowercase SHA-256 digest.`);
  return result;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`${field} must be a positive integer.`);
  return Number(value);
}

function timestamp(value: unknown, field: string): string {
  const result = requiredString(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be an ISO timestamp.`);
  return result;
}

function httpsUrl(value: unknown, field: string): string {
  const result = requiredString(value, field);
  const url = new URL(result);
  if (url.protocol !== "https:") throw new Error(`${field} must use HTTPS.`);
  return result;
}
