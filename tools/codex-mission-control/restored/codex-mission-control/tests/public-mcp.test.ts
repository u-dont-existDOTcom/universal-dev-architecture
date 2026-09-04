import assert from "node:assert/strict";
import test from "node:test";

import {
  handlePublicMissionControlMcpRequest,
  publicMcpToolNames,
  publicStageLivenessState,
  publicSupervisoryRequestBinding,
  type PublicMcpDependencies,
} from "../lib/public-mcp";
import {
  providerSessionSummary,
  stageLivenessSummary,
  supervisoryCycleRoutePrefix,
  type GitHubReceiptPolicy,
} from "../lib/github-decision-receipts";
import type { StoredEvent } from "../lib/schema";

const now = "2026-09-03T18:30:00.000Z";
const expiry = "2026-09-04T18:30:00.000Z";
const supervisorId = "mc-hotfix-specialist";
const chatId = "mc-hotfix-specialist-v2";
const providerSessionId = "provider-session:session-safe-1";
const requestId = "request-safe-1";
const workerId = "mission-control-live-slice";

test("public MCP initializes and advertises exactly three read-only noauth non-enumerating tools", async () => {
  const initialized = await mcpCall(dependencies(), "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mission-control-security-test", version: "1.0.0" },
  });
  assert.equal(initialized.result.serverInfo.name, "mission-control");
  assert.equal(initialized.result.serverInfo.version, "1.0.0");

  const listed = await mcpCall(dependencies(), "tools/list", {});
  const tools = listed.result.tools as Array<Record<string, any>>;
  assert.deepEqual(tools.map((tool) => tool.name), publicMcpToolNames);
  for (const tool of tools) {
    assert.deepEqual(tool.annotations, {
      readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
    });
    assert.deepEqual(tool._meta?.securitySchemes, [{ type: "noauth" }]);
    assert.equal(/list|search|write|create|update|delete|mutat/i.test(tool.name), false);
  }
});

test("capability tool returns exactly the eight allowlisted disposable fields and fails closed", async () => {
  const deps = dependencies();
  const result = await mcpTool(deps, "get_capability_challenge", {
    challenge_id: "challenge-safe-1", chat_id: chatId,
  });
  assert.deepEqual(Object.keys(result.structuredContent), [
    "schema_version", "challenge_id", "chat_id", "mc_nonce", "github_nonce_sha256", "github_nonce_source", "receipt_target", "expires_at",
  ]);
  assert.equal(result.structuredContent.chat_id, chatId);
  assert.equal(JSON.stringify(result.structuredContent).includes("private-worker-body"), false);

  await assertToolFailure(deps, "get_capability_challenge", { challenge_id: "challenge-safe-1", chat_id: "wrong-chat" });
  await assertToolFailure(deps, "get_capability_challenge", { challenge_id: "unknown", chat_id: chatId });
  await assertToolFailure(dependencies({ currentTime: "2026-09-05T00:00:00.000Z" }), "get_capability_challenge", { challenge_id: "challenge-safe-1", chat_id: chatId });
});

test("request binding returns only exact current admitted control metadata and rejects wrong, stale, completed, or superseded bindings", async () => {
  const events = currentEvents();
  const before = structuredClone(events);
  const accesses: unknown[] = [];
  const deps = dependencies({ events });
  deps.recordAccess = (event) => { accesses.push(event); };
  const result = await mcpTool(deps, "get_supervisory_request_binding", { request_id: requestId, supervisor_id: supervisorId, provider_session_id: providerSessionId });
  assert.deepEqual(Object.keys(result.structuredContent), [
    "schema_version", "request_id", "request_nonce", "supervisor_id", "provider_session_id", "worker_id", "reasoning_lane", "queued_at", "expires_at",
    "evidence_capsule_id", "evidence_capsule_sha256", "owner_outcome_id", "owner_outcome_epoch", "owner_outcome_sha256",
    "github_repository", "decision_issue_number", "stage_issue_number", "decision_receipt_target", "stage_receipt_target", "admission_status",
  ]);
  assert.equal(result.structuredContent.request_nonce, "request-nonce-safe");
  assert.equal(result.structuredContent.worker_id, workerId);
  assert.equal(result.structuredContent.admission_status, "ADMITTED_PENDING");
  assert.deepEqual(accesses, [{ event: "mission_control_public_mcp_tool_call", tool: "get_supervisory_request_binding", request_id: requestId, supervisor_id: supervisorId, provider_session_id: providerSessionId, worker_id: workerId, status: "OK", occurred_at: now }]);
  const serialized = JSON.stringify(result.structuredContent);
  for (const forbidden of ["private-worker-body", "owner-message-body", "railway-secret", "session-cookie", "token-value", "DATABASE_URL"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.deepEqual(events, before, "read-only MCP calls must not mutate the event ledger");

  const failedAccesses: unknown[] = [];
  const failedDeps = dependencies({ events });
  failedDeps.recordAccess = (event) => { failedAccesses.push(event); };
  await assertToolFailure(failedDeps, "get_supervisory_request_binding", { request_id: requestId, supervisor_id: supervisorId, provider_session_id: "provider-session:old" });
  assert.deepEqual(failedAccesses, [{ event: "mission_control_public_mcp_tool_call", tool: "get_supervisory_request_binding", request_id: requestId, supervisor_id: supervisorId, provider_session_id: "provider-session:old", worker_id: workerId, status: "NOT_FOUND", occurred_at: now }]);

  await assertToolFailure(dependencies({ events }), "get_supervisory_request_binding", { request_id: requestId, supervisor_id: "wrong-supervisor", provider_session_id: providerSessionId });
  await assertToolFailure(dependencies({ events }), "get_supervisory_request_binding", { request_id: requestId, supervisor_id: supervisorId, provider_session_id: "provider-session:old" });
  await assertToolFailure(dependencies({ events }), "get_supervisory_request_binding", { request_id: "unknown", supervisor_id: supervisorId, provider_session_id: providerSessionId });
  await assertToolFailure(dependencies({ events, currentTime: "2026-09-05T00:00:00.000Z" }), "get_supervisory_request_binding", { request_id: requestId, supervisor_id: supervisorId, provider_session_id: providerSessionId });
  await assertToolFailure(dependencies({ events: [...events, completedDecisionEvent()] }), "get_supervisory_request_binding", { request_id: requestId, supervisor_id: supervisorId, provider_session_id: providerSessionId });
  const superseded = structuredClone(events);
  superseded.push(ownerOutcomeEvent(99, "different-owner-outcome"));
  await assertToolFailure(dependencies({ events: superseded }), "get_supervisory_request_binding", { request_id: requestId, supervisor_id: supervisorId, provider_session_id: providerSessionId });
});

test("request binding fails closed when its server-observed access receipt cannot be persisted", async () => {
  const deps = dependencies({ events: currentEvents() });
  deps.recordAccess = async (event) => {
    if (event.tool === "get_supervisory_request_binding" && event.status === "OK") throw new Error("telemetry unavailable");
  };
  await assertToolFailure(deps, "get_supervisory_request_binding", { request_id: requestId, supervisor_id: supervisorId, provider_session_id: providerSessionId });
});

test("stage state contains only non-semantic receipt metadata and rejects non-current or non-escalated requests", async () => {
  const events = currentEvents();
  events.push(stageEvent(3, "reader-continue", "EXTRA_HIGH_READER", "CONTINUE_REQUIRED", "2026-09-03T18:10:00.000Z"));
  events.push(stageEvent(4, "reader-complete", "EXTRA_HIGH_READER", "STAGE_COMPLETE", "2026-09-03T18:20:00.000Z"));
  events.push(stageEvent(5, "pro-complete", "PRO_REASONER", "STAGE_COMPLETE", "2026-09-03T18:25:00.000Z"));
  events.push(privateBodyEvent(6));
  const result = await mcpTool(dependencies({ events }), "get_stage_liveness_state", { request_id: requestId, supervisor_id: supervisorId, provider_session_id: providerSessionId });
  assert.deepEqual(Object.keys(result.structuredContent), [
    "schema_version", "request_id", "supervisor_id", "provider_session_id", "extra_high_reader", "pro_reasoner", "extra_high_reader_continue_required_count",
    "pro_reasoner_continue_required_count", "semantic_authority",
  ]);
  assert.deepEqual(result.structuredContent.extra_high_reader, {
    status: "STAGE_COMPLETE", receipt_id: "reader-complete", occurred_at: "2026-09-03T18:20:00.000Z",
  });
  assert.equal(result.structuredContent.extra_high_reader_continue_required_count, 1);
  assert.equal(result.structuredContent.pro_reasoner_continue_required_count, 0);
  assert.equal(result.structuredContent.semantic_authority, false);
  const serialized = JSON.stringify(result.structuredContent);
  assert.equal(serialized.includes("private-worker-body"), false);
  assert.equal(serialized.includes("semantic-decision-body"), false);

  await assertToolFailure(dependencies({ events }), "get_stage_liveness_state", { request_id: requestId, supervisor_id: supervisorId, provider_session_id: "provider-session:old" });
  const direct = currentEvents("EXTRA_HIGH_DIRECT");
  await assertToolFailure(dependencies({ events: direct }), "get_stage_liveness_state", { request_id: requestId, supervisor_id: supervisorId, provider_session_id: providerSessionId });
});

test("pure projections fail closed and never surface unrelated event content", () => {
  const events = [...currentEvents(), privateBodyEvent(7)];
  const binding = publicSupervisoryRequestBinding(events, policy(), requestId, supervisorId, providerSessionId, now);
  assert.ok(binding);
  assert.equal(Object.hasOwn(binding, "factual_packet"), false);
  const liveness = publicStageLivenessState(events, requestId, supervisorId, providerSessionId, "2026-09-03T18:00:00.000Z", expiry, now);
  assert.ok(liveness);
  assert.equal(Object.hasOwn(liveness, "decision"), false);
});

function dependencies(options: { events?: StoredEvent[]; currentTime?: string } = {}): PublicMcpDependencies {
  const events = options.events ?? currentEvents();
  return {
    loadEvents: async () => events,
    loadPolicy: policy,
    now: () => options.currentTime ?? now,
  };
}

async function mcpCall(deps: PublicMcpDependencies, method: string, params: unknown) {
  const response = await handlePublicMissionControlMcpRequest(new Request("https://mission-control.example/mcp", {
    method: "POST",
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json", "mcp-protocol-version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }), deps);
  assert.equal(response.status, 200);
  return await response.json() as any;
}

async function mcpTool(deps: PublicMcpDependencies, name: string, args: Record<string, unknown>) {
  const response = await mcpCall(deps, "tools/call", { name, arguments: args });
  assert.equal(response.result?.isError, undefined, JSON.stringify(response));
  return response.result as { structuredContent: Record<string, any> };
}

async function assertToolFailure(deps: PublicMcpDependencies, name: string, args: Record<string, unknown>) {
  const response = await mcpCall(deps, "tools/call", { name, arguments: args });
  assert.equal(response.result?.isError, true, JSON.stringify(response));
  assert.equal(JSON.stringify(response).includes("private-worker-body"), false);
}

function policy(): GitHubReceiptPolicy {
  return {
    repository: "u-dont-existDOTcom/universal-dev-architecture",
    decisionIssueNumber: 59,
    capabilityIssueNumber: 60,
    stageIssueNumber: 61,
    authorizedWriterLogins: ["u-dont-existDOTcom"],
    capabilityChallenges: [{
      challengeId: "challenge-safe-1", supervisorId, chatId, worker: workerId, mcNonce: "disposable-mc-nonce", githubNonce: "disposable-github-nonce",
      expiresAt: expiry, extraHighLabel: "Extra High", proLabel: "Pro",
    }],
  };
}

function currentEvents(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED" = "PRO_ESCALATED"): StoredEvent[] {
  return [ownerOutcomeEvent(1, "owner-outcome-safe"), requestEvent(2, lane), providerSessionEvent(3)];
}

function ownerOutcomeEvent(sequence: number, id: string): StoredEvent {
  return event(sequence, {
    type: "owner_outcome_recorded", worker: workerId, owner_request_id: "owner-request-safe", owner_outcome_id: id, epoch: 1,
    source_receipt_id: "owner-source-safe", owner_source_sha256: "d".repeat(64), owner_outcome_sha256: "b".repeat(64),
    verbatim_owner_request: ["owner-message-body"], normalized_result: "private-worker-body", current_gap: "semantic-decision-body", gap_status: "OPEN",
    required_outcomes: [{ id: "outcome-safe", text: "private-worker-body", terminal_required: true, status: "UNMET", direct_evidence_receipt_ids: [] }],
    non_satisfying_proxies: [], supersedes: null, supersedes_outcome_sha256: null,
  } as StoredEvent["data"]);
}

function requestEvent(sequence: number, lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED"): StoredEvent {
  const body = supervisoryCycleRoutePrefix + JSON.stringify({
    schemaVersion: 3, packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE", requestId, destinationSupervisorId: supervisorId,
    nonce: "request-nonce-safe", reasoningLane: lane, providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY",
    evidenceCapsule: { id: "capsule-safe", sha256: "a".repeat(64) }, ownerOutcome: { id: "owner-outcome-safe", epoch: 1, sha256: "b".repeat(64) },
    githubReceipt: { repository: policy().repository, issueNumber: policy().decisionIssueNumber },
    factualPacket: { taskId: "task-safe", exactFactualState: "private-worker-body", evidenceRefs: ["railway-secret", "session-cookie", "token-value", "DATABASE_URL"] },
    queuedAt: "2026-09-03T18:00:00.000Z", expiresAt: expiry,
  });
  return event(sequence, {
    type: "worker_message_recorded", worker: workerId, message_id: "message-safe", thread_id: "thread-safe", message_kind: "QUESTION",
    body, reply_to_message_id: null, direction_id: null,
  } as StoredEvent["data"]);
}

function stageEvent(sequence: number, receiptId: string, stage: "EXTRA_HIGH_READER" | "PRO_REASONER", status: "STAGE_COMPLETE" | "CONTINUE_REQUIRED", occurredAt: string): StoredEvent {
  return event(sequence, {
    type: "evidence_receipt_recorded", worker: workerId, receipt_id: receiptId, producer_id: "collector:test", producer_role: "COLLECTOR",
    evidence_class: "ARTIFACT", independence: "SAME_PROVENANCE", freshness: "CURRENT", exact_candidate_sha256: null,
    summary: stageLivenessSummary, refs: [`request:${requestId}`, `supervisor:${supervisorId}`, `provider_session:${providerSessionId}`, `stage:${stage}`, `status:${status}`, "semantic_authority:false"],
    verified: true, changed_path_manifest: null,
  } as StoredEvent["data"], occurredAt);
}

function privateBodyEvent(sequence: number): StoredEvent {
  return event(sequence, {
    type: "worker_message_recorded", worker: workerId, message_id: `private-${sequence}`, thread_id: "thread-private", message_kind: "QUESTION",
    body: "private-worker-body railway-secret session-cookie token-value DATABASE_URL semantic-decision-body", reply_to_message_id: null, direction_id: null,
  } as StoredEvent["data"]);
}

function providerSessionEvent(sequence: number): StoredEvent {
  return event(sequence, {
    type: "evidence_receipt_recorded", worker: workerId, receipt_id: "provider-session-open", producer_id: "collector:test", producer_role: "COLLECTOR",
    evidence_class: "ARTIFACT", independence: "SAME_PROVENANCE", freshness: "CURRENT", exact_candidate_sha256: null,
    summary: providerSessionSummary, refs: [`request:${requestId}`, `supervisor:${supervisorId}`, `provider_session:${providerSessionId}`, "conversation_url:PENDING_PROVIDER_ASSIGNMENT", "url_binding_status:PENDING_PROVIDER_ASSIGNMENT", "lifecycle_status:ACTIVE", "semantic_authority:false"],
    verified: true, changed_path_manifest: null,
  } as StoredEvent["data"], "2026-09-03T18:01:00.000Z");
}

function completedDecisionEvent(): StoredEvent {
  return event(20, {
    type: "github_decision_receipt_ingested", worker: workerId, task_id: "task-safe", receipt_id: "done", request_id: requestId,
    supervisor_id: supervisorId, provider_session_id: providerSessionId,
    nonce: "request-nonce-safe", evidence_capsule: { id: "capsule-safe", sha256: "a".repeat(64) }, owner_outcome_id: "owner-outcome-safe",
    owner_outcome_epoch: 1, owner_outcome_sha256: "b".repeat(64), reasoning_lane: "PRO_ESCALATED",
    decision_block: { decision_id: "decision", exact_text: "semantic-decision-body", sha256: "c".repeat(64) },
    pro_decision_block: { used: true, model_mode: "PRO", exact_text: "semantic-decision-body", sha256: "c".repeat(64) },
    writer_contract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretation_allowed: false }, canonical_envelope_sha256: "e".repeat(64),
    github_receipt: { repository: policy().repository, issue_number: 59, comment_id: 1, immutable_url: "https://github.com/example/repo/issues/1#issuecomment-1", github_created_at: now, github_author_login: "owner", github_delivery_id: null },
    ingestion_method: "RECONCILIATION_POLL", ingested_at: now,
  } as StoredEvent["data"]);
}

function event(sequence: number, data: StoredEvent["data"], occurredAt = "2026-09-03T18:00:00.000Z"): StoredEvent {
  return {
    id: sequence, sequence, eventId: `event-${sequence}`, schemaVersion: 2, missionId: "mission-control-live", worker: data.worker,
    type: data.type, occurredAt, receivedAt: occurredAt, previousHash: null, eventHash: "f".repeat(64), producerId: "test", producerKind: "COLLECTOR", data,
  };
}
