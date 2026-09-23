import assert from "node:assert/strict";
import test from "node:test";

import { pendingDecisionRequests, type GitHubReceiptPolicy } from "../lib/github-decision-receipts";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import { producerMayEmit } from "../lib/ingestion-auth";
import { inBandRequestRoutePrefix } from "../lib/in-band-request-binding";
import { POST_EXECUTION_REASONING_ROUTER_PRODUCER_ID } from "../lib/post-work-reasoning-route";
import type { AppendEnvelope, StoredEvent } from "../lib/schema";
import {
  buildSourceReviewRouteEnvelope,
  SOURCE_REVIEW_ROUTER_PRODUCER_ID,
} from "../lib/source-review-route";

const worker = "askrigor-system-alignment";
const taskId = "task:askrigor-system-alignment";
const priorRequestId = "askrigor231-pr235-review-rdc:prior";
const outcomeId = "outcome:askrigor-system-alignment:issue231";
const outcomeSha = "a".repeat(64);
const evidenceSha = "b".repeat(64);
const candidateHead = "c".repeat(40);
const priorQueuedAt = "2026-09-23T00:04:29.420Z";
const priorExpiresAt = "2026-09-23T01:34:29.420Z";

function policy(): GitHubReceiptPolicy {
  return {
    repository: "u-dont-existDOTcom/universal-dev-architecture",
    decisionIssueNumber: 59,
    capabilityIssueNumber: 60,
    stageIssueNumber: 61,
    authorizedWriterLogins: ["owner"],
    capabilityChallenges: [],
    requestBound: { enabled: true, relayProducerIds: ["collector:relay"] },
  };
}

function currentOutcome(): StoredEvent {
  return storedEvent({
    type: "owner_outcome_recorded",
    worker,
    owner_outcome_id: outcomeId,
    owner_request_id: "request:askrigor-system-alignment:issue231",
    epoch: 1,
    owner_outcome_sha256: outcomeSha,
    source_receipt_id: "source:askrigor",
    owner_source_sha256: "d".repeat(64),
    verbatim_owner_request: ["Implement source-aligned public runtime and supervised Work loop"],
    normalized_result: "Implement the source-aligned AskRigor public runtime and supervised native Work loop.",
    required_outcomes: [{
      id: "askrigor-system-alignment-implementation",
      text: "Complete the full implementation contract.",
      terminal_required: true,
      status: "UNMET",
      direct_evidence_receipt_ids: [],
    }],
    non_satisfying_proxies: ["green tests"],
    current_gap: "Source re-review is required.",
    gap_status: "OPEN",
    supersedes: null,
  } as StoredEvent["data"], "outcome", 1, "2026-09-22T15:32:52.256Z", "owner:askrigor", "OWNER_AUTHORITY");
}

function priorRoute(): StoredEvent {
  const body = inBandRequestRoutePrefix + JSON.stringify({
    schemaVersion: 6,
    executionContext: { task_id: taskId },
    packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE",
    requestId: priorRequestId,
    worker,
    producerId: "worker:" + worker,
    destination: "PROJECT_MANAGER_CHAT",
    destinationSupervisorId: "mc-project-manager",
    factualPacket: { taskId },
    queuedAt: priorQueuedAt,
    expiresAt: priorExpiresAt,
    nonce: "nonce:prior",
    reasoningLane: "EXTRA_HIGH_DIRECT",
    evidenceCapsule: { id: "capsule:prior", sha256: "e".repeat(64) },
    ownerOutcome: { id: outcomeId, epoch: 1, sha256: outcomeSha },
    githubReceipt: {
      repository: "u-dont-existDOTcom/universal-dev-architecture",
      issueNumber: 59,
      stageIssueNumber: 61,
    },
  });
  return storedEvent({
    type: "worker_message_recorded",
    worker,
    message_id: "message:prior",
    thread_id: "thread:prior",
    message_kind: "QUESTION",
    body,
    reply_to_message_id: null,
    direction_id: null,
  }, "prior-route", 2, priorQueuedAt, "worker:" + worker, "WORKER");
}

function priorDecision(ownerSha = outcomeSha): StoredEvent {
  return storedEvent({
    type: "github_decision_receipt_ingested",
    worker,
    task_id: taskId,
    receipt_id: "github-comment:old-review",
    request_id: priorRequestId,
    supervisor_id: "mc-project-manager",
    provider_session_id: "provider-session:prior",
    binding_provider_session_id: null,
    stage_provider_session_id: null,
    decision_provider_session_id: null,
    binding_capsule: null,
    binding_capsule_sha256: null,
    staged_provenance: null,
    binding_envelope: null,
    binding_envelope_sha256: null,
    decision_session_provenance: null,
    nonce: "nonce:prior",
    evidence_capsule: { id: "capsule:prior", sha256: "e".repeat(64) },
    owner_outcome_id: outcomeId,
    owner_outcome_epoch: 1,
    owner_outcome_sha256: ownerSha,
    reasoning_lane: "EXTRA_HIGH_DIRECT",
    decision_block: { decision_id: "prior", exact_text: "SOURCE_REWORK_REQUIRED", sha256: "f".repeat(64) },
    pro_decision_block: { used: false, model_mode: null, exact_text: null, sha256: null },
    writer_contract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretation_allowed: false },
    execution_provenance: "IN_BAND_REQUEST_BINDING_GITHUB_OBSERVED",
    in_band_binding_sha256: "1".repeat(64),
    execution_pre_send_receipt_id: "pre-send:prior",
    execution_submission_admission_id: "admission:prior",
    execution_provider_body_sha256: "2".repeat(64),
    canonical_envelope_sha256: "3".repeat(64),
    github_receipt: {
      repository: "u-dont-existDOTcom/universal-dev-architecture",
      issue_number: 59,
      comment_id: 1,
      immutable_url: "https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/59#issuecomment-1",
      github_created_at: "2026-09-23T11:09:28Z",
      github_author_login: "owner",
      github_delivery_id: null,
    },
    ingestion_method: "RECONCILIATION_POLL",
    ingested_at: "2026-09-23T11:11:06.410Z",
  } as unknown as StoredEvent["data"], "prior-decision", 3, "2026-09-23T11:09:28.000Z",
  "system:github-decision-receipts", "SYSTEM");
}

function routeInput(events: StoredEvent[], recordedAt = "2026-09-23T17:00:00.000Z") {
  return {
    events,
    policy: policy(),
    worker,
    taskId,
    priorRequestId,
    evidence: {
      repository: "u-dont-existDOTcom/AskRigor",
      issueNumber: 231,
      commentId: 5798122595,
      immutableUrl: "https://github.com/u-dont-existDOTcom/AskRigor/issues/231#issuecomment-5798122595",
      sha256: evidenceSha,
      candidateHead,
      additionalRefs: [
        "https://github.com/u-dont-existDOTcom/AskRigor/pull/235",
        "workflow:deterministic:916",
      ],
    },
    exactFactualState: "The corrected candidate is ready for the same independent source review.",
    decisionRequested: "Review the corrected exact head against the prior source-rework decision and return one canonical decision.",
    recordedAt,
    reviewAttemptId: "corrected-head-1",
  };
}

test("source re-review route keeps the prior reviewer and current owner outcome", () => {
  const events = [currentOutcome(), priorRoute(), priorDecision()];
  const envelope = buildSourceReviewRouteEnvelope(routeInput(events));
  assert.equal(envelope.data.type, "worker_message_recorded");
  if (envelope.data.type !== "worker_message_recorded") return;
  assert.match(envelope.event_id, /^supervision-request-v6:/);
  assert.equal(envelope.data.body.startsWith(inBandRequestRoutePrefix), true);
  const packet = JSON.parse(envelope.data.body.slice(inBandRequestRoutePrefix.length));
  assert.equal(packet.producerId, SOURCE_REVIEW_ROUTER_PRODUCER_ID);
  assert.equal(packet.destinationSupervisorId, "mc-project-manager");
  assert.equal(packet.actionBlockedOrRouted, "AUTHOR_REVIEW");
  assert.equal(packet.reasoningLane, "EXTRA_HIGH_DIRECT");
  assert.deepEqual(packet.ownerOutcome, { id: outcomeId, epoch: 1, sha256: outcomeSha });
  assert.equal(packet.evidenceCapsule.id, "github-source-review-receipt:5798122595");
  assert.equal(packet.evidenceCapsule.sha256, evidenceSha);
  assert.equal(packet.expiresAt, "2026-09-23T18:30:00.000Z");
  assert.deepEqual(packet.factualPacket.evidenceRefs, [
    "https://github.com/u-dont-existDOTcom/AskRigor/issues/231#issuecomment-5798122595",
    "source_review_receipt_sha256:" + evidenceSha,
    "commit:" + candidateHead,
    "https://github.com/u-dont-existDOTcom/AskRigor/pull/235",
    "workflow:deterministic:916",
  ]);
  const fact = JSON.parse(packet.factualPacket.exactFactualState);
  assert.equal(fact.candidate_head, candidateHead);
  assert.equal(fact.semantic_authority, "OWNER_AUTHENTICATED_CHAT_REQUEST");

  const systemProducer: AuthenticatedProducer = {
    id: SOURCE_REVIEW_ROUTER_PRODUCER_ID,
    kind: "SYSTEM",
    workerScopes: [worker],
    taskScopes: [taskId],
  };
  assert.equal(producerMayEmit(systemProducer, envelope.data), true);
  assert.equal(producerMayEmit({
    ...systemProducer,
    id: POST_EXECUTION_REASONING_ROUTER_PRODUCER_ID,
  }, envelope.data), false);

  const pending = pendingDecisionRequests([
    ...events,
    storedFromEnvelope(envelope, 4, systemProducer),
  ]);
  const request = pending.find((item) => item.requestId === packet.requestId);
  assert.ok(request);
  assert.equal(request.routeSchemaVersion, 6);
  assert.equal(request.supervisorId, "mc-project-manager");
  assert.equal(request.evidenceCapsule.sha256, evidenceSha);
  assert.deepEqual(request.ownerOutcome, { id: outcomeId, epoch: 1, sha256: outcomeSha });
});

test("source re-review rejects a prior decision from a stale owner-outcome identity", () => {
  const events = [currentOutcome(), priorRoute(), priorDecision("9".repeat(64))];
  assert.throws(
    () => buildSourceReviewRouteEnvelope(routeInput(events)),
    /stale against the current owner-outcome identity/,
  );
});

test("source re-review rejects a mismatched immutable evidence locator", () => {
  const input = routeInput([currentOutcome(), priorRoute(), priorDecision()]);
  input.evidence.immutableUrl = "https://github.com/u-dont-existDOTcom/AskRigor/issues/231#issuecomment-1";
  assert.throws(
    () => buildSourceReviewRouteEnvelope(input),
    /exact immutable GitHub issue-comment URL/,
  );
});

test("owner-authenticated source-review API persists one idempotent SYSTEM V6 request", async () => {
  const saved = {
    ownerToken: process.env.MISSION_CONTROL_OWNER_TOKEN,
    ownerId: process.env.MISSION_CONTROL_OWNER_ID,
    sessionSecret: process.env.MISSION_CONTROL_SESSION_SECRET,
    internalToken: process.env.MISSION_CONTROL_INTERNAL_TOKEN,
    daemonUrl: process.env.MISSION_CONTROL_DAEMON_URL,
    policy: process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON,
    supervisors: process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON,
  };
  const previousFetch = globalThis.fetch;
  const ownerToken = "owner-token-" + "o".repeat(40);
  process.env.MISSION_CONTROL_OWNER_TOKEN = ownerToken;
  process.env.MISSION_CONTROL_OWNER_ID = "owner:test";
  process.env.MISSION_CONTROL_SESSION_SECRET = "session-secret-" + "s".repeat(40);
  process.env.MISSION_CONTROL_INTERNAL_TOKEN = "internal-token-" + "i".repeat(40);
  process.env.MISSION_CONTROL_DAEMON_URL = "http://daemon.test.invalid";
  process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(policy());
  process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = JSON.stringify([configuredProjectManager()]);
  const history = [currentOutcome(), priorRoute(), priorDecision()];
  let appended: StoredEvent | null = null;
  let appendCount = 0;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "http://daemon.test.invalid");
    assert.equal(url.pathname, "/events");
    const method = init?.method ?? "GET";
    if (method === "GET" && !url.searchParams.has("event_id")) {
      return Response.json({ events: appended ? [...history, appended] : history });
    }
    const producer = producerFromHeaders(init?.headers);
    assert.equal(producer.id, SOURCE_REVIEW_ROUTER_PRODUCER_ID);
    assert.equal(producer.kind, "SYSTEM");
    if (method === "GET") {
      if (!appended || appended.eventId !== url.searchParams.get("event_id")) {
        return Response.json({ error: "Event not found." }, { status: 404 });
      }
      return Response.json({ event: appended });
    }
    appendCount += 1;
    const envelope = JSON.parse(String(init?.body)) as AppendEnvelope;
    if (!producerMayEmit(producer, envelope.data)) {
      return Response.json({ error: "Producer may not emit event." }, { status: 403 });
    }
    if (appended) return Response.json({ error: "conflict" }, { status: 409 });
    appended = storedFromEnvelope(envelope, 4, producer);
    return Response.json({ event: appended }, { status: 201 });
  };

  try {
    const { POST } = await import("../app/api/workers/[worker]/source-review/route");
    const requestBody = apiBody();
    const first = await POST(new Request(
      "http://app.test.invalid/api/workers/" + worker + "/source-review",
      {
        method: "POST",
        headers: { authorization: "Bearer " + ownerToken, "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    ), { params: Promise.resolve({ worker }) });
    assert.equal(first.status, 202);
    const firstPayload = await first.json();
    assert.equal(firstPayload.providerDeliveryState, "QUEUED_FOR_PROVIDER_RELAY");
    assert.equal(appendCount, 1);
    const persisted = appended as StoredEvent | null;
    if (!persisted) throw new Error("Expected the mocked daemon to persist the source-review route.");
    assert.equal(persisted.producerId, SOURCE_REVIEW_ROUTER_PRODUCER_ID);
    const packet = JSON.parse((persisted.data as Extract<StoredEvent["data"], { type: "worker_message_recorded" }>).body
      .slice(inBandRequestRoutePrefix.length));
    assert.equal(packet.destinationSupervisorId, "mc-project-manager");

    const retry = await POST(new Request(
      "http://app.test.invalid/api/workers/" + worker + "/source-review",
      {
        method: "POST",
        headers: { authorization: "Bearer " + ownerToken, "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    ), { params: Promise.resolve({ worker }) });
    assert.equal(retry.status, 202);
    const retryPayload = await retry.json();
    assert.equal(retryPayload.routeEvent.eventId, persisted.eventId);
    assert.equal(appendCount, 1);

    const unauthorized = await POST(new Request(
      "http://app.test.invalid/api/workers/" + worker + "/source-review",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    ), { params: Promise.resolve({ worker }) });
    assert.equal(unauthorized.status, 401);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("MISSION_CONTROL_OWNER_TOKEN", saved.ownerToken);
    restoreEnv("MISSION_CONTROL_OWNER_ID", saved.ownerId);
    restoreEnv("MISSION_CONTROL_SESSION_SECRET", saved.sessionSecret);
    restoreEnv("MISSION_CONTROL_INTERNAL_TOKEN", saved.internalToken);
    restoreEnv("MISSION_CONTROL_DAEMON_URL", saved.daemonUrl);
    restoreEnv("MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON", saved.policy);
    restoreEnv("MISSION_CONTROL_SUPERVISOR_CHATS_JSON", saved.supervisors);
  }
});

function apiBody() {
  return {
    task_id: taskId,
    prior_request_id: priorRequestId,
    exact_factual_state: "The corrected candidate is ready for the same independent source review.",
    decision_requested: "Review the corrected exact head against the prior source-rework decision and return one canonical decision.",
    review_attempt_id: "corrected-head-1",
    evidence: {
      repository: "u-dont-existDOTcom/AskRigor",
      issue_number: 231,
      comment_id: 5798122595,
      immutable_url: "https://github.com/u-dont-existDOTcom/AskRigor/issues/231#issuecomment-5798122595",
      sha256: evidenceSha,
      candidate_head: candidateHead,
      additional_refs: ["https://github.com/u-dont-existDOTcom/AskRigor/pull/235"],
    },
  };
}

function configuredProjectManager() {
  return {
    scope: "PROJECT_MANAGER",
    supervisorId: "mc-project-manager",
    label: "MC project manager",
    workerId: null,
    requiredApp: "Mission Control",
    registrationId: "registration:test:mc-project-manager",
    ownership: "MISSION_CONTROL_ONLY",
    purpose: "Dedicated Mission Control reasoning supervisor",
    accountAlias: "owner-account",
    workspaceAlias: "personal",
    privateLocatorRef: "owner-config:test:mc-project-manager",
    registrationProvenance: {
      registeredBy: "OWNER",
      registeredAt: "2026-09-20T00:00:00.000Z",
      sourceRef: "owner:test",
    },
    consumerControls: {
      modelSelectionPolicy: "TOP_VISIBLE_SELECTABLE_MODEL",
      thinkingControlLabel: "Thinking effort",
      thinkingVisibleLabel: "Extra High",
      thinkingOrdinal: "4 of 5",
      accountPlanLabel: "Pro",
      accountPlanRole: "PROVENANCE_METADATA_ONLY",
      accountPlanIsReasoningMode: false,
    },
    bootstrapCapability: {
      chatId: "bootstrap:pm",
      url: "https://chatgpt.com/c/test-project-manager",
      challengeId: "challenge:pm",
    },
  };
}

function producerFromHeaders(value: HeadersInit | undefined): AuthenticatedProducer {
  const headers = new Headers(value);
  const id = headers.get("x-mission-control-producer-id");
  const kind = headers.get("x-mission-control-producer-kind");
  assert.ok(id && kind === "SYSTEM");
  return {
    id,
    kind,
    workerScopes: (headers.get("x-mission-control-worker-scopes") ?? "").split(",").filter(Boolean),
    taskScopes: (headers.get("x-mission-control-task-scopes") ?? "").split(",").filter(Boolean),
  };
}

function storedEvent(
  data: StoredEvent["data"],
  eventId: string,
  sequence: number,
  occurredAt: string,
  producerId: string,
  producerKind: StoredEvent["producerKind"],
): StoredEvent {
  return {
    id: sequence,
    sequence,
    eventId,
    schemaVersion: 2,
    missionId: "mission-control-live",
    worker: "worker" in data && typeof data.worker === "string" ? data.worker : null,
    type: data.type,
    occurredAt,
    receivedAt: occurredAt,
    previousHash: sequence === 1 ? null : "0".repeat(64),
    eventHash: String(sequence).padStart(64, "0"),
    producerId,
    producerKind,
    data,
  };
}

function storedFromEnvelope(
  envelope: AppendEnvelope,
  sequence: number,
  producer: AuthenticatedProducer,
): StoredEvent {
  return {
    id: sequence,
    sequence,
    eventId: envelope.event_id,
    schemaVersion: envelope.schema_version,
    missionId: envelope.mission_id,
    worker: "worker" in envelope.data && typeof envelope.data.worker === "string" ? envelope.data.worker : null,
    type: envelope.data.type,
    occurredAt: envelope.occurred_at,
    receivedAt: envelope.occurred_at,
    previousHash: "0".repeat(64),
    eventHash: String(sequence).padStart(64, "0"),
    producerId: producer.id,
    producerKind: producer.kind,
    data: envelope.data,
  };
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
