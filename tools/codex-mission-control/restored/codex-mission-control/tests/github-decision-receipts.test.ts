import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { sha256 } from "../lib/canonical";
import {
  buildGitHubDecisionReceiptEnvelope,
  canonicalDecisionCommentPrefix,
  githubDecisionCandidateFromWebhook,
  reconcileGitHubDecisionReceipts,
  supervisoryCycleRoutePrefix,
  verifyGitHubWebhookSignature,
  type GitHubDecisionCandidate,
} from "../lib/github-decision-receipts";
import type { CanonicalDecisionEnvelope, StoredEvent } from "../lib/schema";
import type { EventStore } from "../lib/store";

const outcomeSha = "a".repeat(64);
const evidenceSha = "b".repeat(64);
const proText = "The evidence supports the bounded implementation without architectural change.";
const decisionText = proText;

test("GitHub webhook authentication and issue-comment normalization fail closed", () => {
  const secret = "s".repeat(32);
  const raw = JSON.stringify(webhookPayload(commentBody("PRO_ESCALATED")));
  const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  assert.equal(verifyGitHubWebhookSignature(secret, raw, signature), true);
  assert.equal(verifyGitHubWebhookSignature(secret, `${raw}x`, signature), false);
  const candidate = githubDecisionCandidateFromWebhook(JSON.parse(raw), "delivery-1");
  assert.equal(candidate.repository, "u-dont-existDOTcom/universal-dev-architecture");
  assert.equal(candidate.issueNumber, 58);
  assert.equal(candidate.commentId, 9001);
  assert.equal(candidate.ingestionMethod, "GITHUB_WEBHOOK");
});

test("escalated Pro decision becomes a fully bound durable GitHub receipt", () => {
  const events = pendingEvents("PRO_ESCALATED");
  const result = buildGitHubDecisionReceiptEnvelope(events, candidate("PRO_ESCALATED"));
  assert.equal(result.data.type, "github_decision_receipt_ingested");
  if (result.data.type !== "github_decision_receipt_ingested") return;
  assert.equal(result.data.request_id, "decision-request-1");
  assert.equal(result.data.nonce, "nonce-1");
  assert.equal(result.data.evidence_capsule.sha256, evidenceSha);
  assert.equal(result.data.owner_outcome_epoch, 7);
  assert.equal(result.data.reasoning_lane, "PRO_ESCALATED");
  assert.equal(result.data.pro_decision_block.used, true);
  assert.equal(result.data.writer_contract.reinterpretation_allowed, false);
  assert.equal(result.data.github_receipt.comment_id, 9001);
});

test("ordinary decision remains Extra High direct and cannot claim a Pro block", () => {
  const result = buildGitHubDecisionReceiptEnvelope(pendingEvents("EXTRA_HIGH_DIRECT"), candidate("EXTRA_HIGH_DIRECT"));
  assert.equal(result.data.type, "github_decision_receipt_ingested");
  if (result.data.type !== "github_decision_receipt_ingested") return;
  assert.equal(result.data.reasoning_lane, "EXTRA_HIGH_DIRECT");
  assert.equal(result.data.pro_decision_block.used, false);
  assert.equal(result.data.pro_decision_block.exact_text, null);
});

test("nonce, evidence, owner epoch, reasoning lane, and stale-window mismatches are rejected", () => {
  const cases: Array<[string, (value: CanonicalDecisionEnvelope) => void, RegExp]> = [
    ["nonce", (value) => { value.nonce = "wrong"; }, /nonce/],
    ["evidence", (value) => { value.evidence_capsule.sha256 = "c".repeat(64); }, /evidence capsule digest/],
    ["epoch", (value) => { value.owner_outcome.epoch = 8; }, /owner-outcome epoch/],
    ["lane", (value) => {
      value.reasoning_lane = "EXTRA_HIGH_DIRECT";
      value.pro_decision_block = { used: false, model_mode: null, exact_text: null, sha256: null };
    }, /reasoning lane/],
    ["reinterpretation", (value) => {
      value.decision_block.exact_text = "A writer-authored reinterpretation.";
      value.decision_block.sha256 = sha256(value.decision_block.exact_text);
    }, /exact Pro decision bytes/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const envelope = decisionEnvelope("PRO_ESCALATED");
    mutate(envelope);
    assert.throws(() => buildGitHubDecisionReceiptEnvelope(
      pendingEvents("PRO_ESCALATED"),
      { ...candidate("PRO_ESCALATED"), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(envelope)}` },
    ), pattern, name);
  }
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(
    pendingEvents("PRO_ESCALATED"),
    { ...candidate("PRO_ESCALATED"), createdAt: "2026-09-03T00:00:01.000Z" },
  ), /stale.*window/);

  const staleEvents = pendingEvents("PRO_ESCALATED");
  const outcome = staleEvents.find((event) => event.data.type === "owner_outcome_recorded")!;
  if (outcome.data.type === "owner_outcome_recorded") outcome.data.epoch = 8;
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(staleEvents, candidate("PRO_ESCALATED")), /stale.*owner-outcome/);
});

test("periodic reconciliation polling ingests a missed webhook receipt", async () => {
  const events = pendingEvents("PRO_ESCALATED");
  const appended: StoredEvent[] = [];
  const store = {
    allEvents: () => [...events, ...appended],
    append: (input: unknown) => {
      const envelope = input as { event_id: string; occurred_at: string; data: StoredEvent["data"] };
      const stored = storedEvent(envelope.data, envelope.event_id, envelope.occurred_at);
      appended.push(stored);
      return stored;
    },
  } as unknown as EventStore;
  const result = await reconcileGitHubDecisionReceipts(store, {
    token: "token",
    now: "2026-09-02T00:02:00.000Z",
    fetchImpl: async () => new Response(JSON.stringify([webhookPayload(commentBody("PRO_ESCALATED")).comment]), { status: 200 }),
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].data.type, "github_decision_receipt_ingested");
  if (result[0].data.type === "github_decision_receipt_ingested") {
    assert.equal(result[0].data.ingestion_method, "RECONCILIATION_POLL");
  }
});

function pendingEvents(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED"): StoredEvent[] {
  const outcome = storedEvent({
    type: "owner_outcome_recorded",
    worker: "mission-control-live-slice",
    owner_request_id: "request-owner-1",
    owner_outcome_id: "owner-outcome-1",
    epoch: 7,
    source_receipt_id: "owner-source-1",
    owner_source_sha256: "d".repeat(64),
    owner_outcome_sha256: outcomeSha,
    verbatim_owner_request: ["Exact owner request"],
    normalized_result: "Exact result",
    current_gap: "Decision receipt pending",
    gap_status: "OPEN",
    required_outcomes: [{ id: "outcome-1", text: "Result", terminal_required: true, status: "UNMET", direct_evidence_receipt_ids: [] }],
    non_satisfying_proxies: ["tests only"],
    supersedes: null,
    supersedes_outcome_sha256: null,
  } as StoredEvent["data"], "owner-outcome-event");
  const packet = {
    schemaVersion: 2,
    packetKind: "SAME_CHAT_SUPERVISORY_CYCLE",
    requestId: "decision-request-1",
    nonce: "nonce-1",
    reasoningLane: lane,
    providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY",
    evidenceCapsule: { id: "evidence-capsule-1", sha256: evidenceSha },
    ownerOutcome: { id: "owner-outcome-1", epoch: 7, sha256: outcomeSha },
    githubReceipt: { repository: "u-dont-existDOTcom/universal-dev-architecture", issueNumber: 58 },
    factualPacket: { taskId: "task-1" },
    queuedAt: "2026-09-02T00:00:00.000Z",
    expiresAt: "2026-09-03T00:00:00.000Z",
  };
  const message = storedEvent({
    type: "worker_message_recorded",
    worker: "mission-control-live-slice",
    message_id: "message-1",
    thread_id: "thread-1",
    message_kind: "QUESTION",
    body: `${supervisoryCycleRoutePrefix}${JSON.stringify(packet)}`,
    reply_to_message_id: null,
    direction_id: null,
  }, "route-event");
  return [outcome, message];
}

function candidate(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED"): GitHubDecisionCandidate {
  return {
    repository: "u-dont-existDOTcom/universal-dev-architecture",
    issueNumber: 58,
    commentId: 9001,
    immutableUrl: "https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/58#issuecomment-9001",
    createdAt: "2026-09-02T00:01:00.000Z",
    authorLogin: "u-dont-existDOTcom",
    deliveryId: "delivery-1",
    body: commentBody(lane),
    ingestionMethod: "GITHUB_WEBHOOK",
  };
}

function commentBody(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED") {
  return `${canonicalDecisionCommentPrefix}${JSON.stringify(decisionEnvelope(lane))}`;
}

function decisionEnvelope(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED"): CanonicalDecisionEnvelope {
  return {
    schema_version: 1,
    envelope_kind: "MISSION_CONTROL_CANONICAL_DECISION",
    request_id: "decision-request-1",
    nonce: "nonce-1",
    evidence_capsule: { id: "evidence-capsule-1", sha256: evidenceSha },
    owner_outcome: { id: "owner-outcome-1", epoch: 7, sha256: outcomeSha },
    reasoning_lane: lane,
    decision_block: { decision_id: "decision-1", exact_text: decisionText, sha256: sha256(decisionText) },
    pro_decision_block: lane === "PRO_ESCALATED"
      ? { used: true, model_mode: "PRO", exact_text: proText, sha256: sha256(proText) }
      : { used: false, model_mode: null, exact_text: null, sha256: null },
    writer_contract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretation_allowed: false },
  };
}

function webhookPayload(body: string) {
  return {
    action: "created",
    repository: { full_name: "u-dont-existDOTcom/universal-dev-architecture" },
    issue: { number: 58 },
    comment: {
      id: 9001,
      html_url: "https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/58#issuecomment-9001",
      created_at: "2026-09-02T00:01:00.000Z",
      body,
      user: { login: "u-dont-existDOTcom" },
    },
  };
}

function storedEvent(data: StoredEvent["data"], eventId: string, occurredAt = "2026-09-02T00:00:00.000Z"): StoredEvent {
  return {
    id: 1,
    sequence: 1,
    eventId,
    schemaVersion: 2,
    missionId: "mission-control-live",
    worker: data.worker,
    type: data.type,
    occurredAt,
    receivedAt: occurredAt,
    previousHash: null,
    eventHash: "e".repeat(64),
    producerId: "test",
    producerKind: "SYSTEM",
    data,
  };
}
