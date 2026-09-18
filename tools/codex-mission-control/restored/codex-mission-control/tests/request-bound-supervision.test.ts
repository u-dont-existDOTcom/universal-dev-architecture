import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sha256 } from "../lib/canonical";
import { EventStore } from "../lib/store";
import { handlePublicMissionControlMcpRequest } from "../lib/public-mcp";
import {
  buildGitHubDecisionReceiptEnvelope, canonicalDecisionCommentPrefix, ingestGitHubSupervisionCandidate,
  pendingDecisionRequests, type GitHubReceiptPolicy,
} from "../lib/github-decision-receipts";
import { requestBindingDigest, requestBoundRoutePrefix, requestExecutionContext, requestRouteEventId } from "../lib/request-bound-supervision";
import { deriveOwnerResponseContinuation } from "../lib/owner-response-continuation";
import { decisionRouteStates } from "../lib/reasoning-message-state";
import type { AppendEnvelope, CanonicalDecisionEnvelope, StoredEvent } from "../lib/schema";

const worker = "request-bound-fixture", requestId = "per-request-test-1", supervisor = "fixture-supervisor";
const session = "provider-session:request-bound-1", relayId = "collector:fixture-relay", mcpId = "collector:public-mcp-access";
const time = (second: number) => `2026-09-18T00:01:${String(second).padStart(2, "0")}.000Z`;
const expiry = "2026-09-19T00:00:00.000Z";
const policy: GitHubReceiptPolicy = {
  repository: "u-dont-existDOTcom/universal-dev-architecture", decisionIssueNumber: 59, capabilityIssueNumber: 60, stageIssueNumber: 61,
  authorizedWriterLogins: ["u-dont-existDOTcom"], capabilityChallenges: [], requestBound: { enabled: true, relayProducerIds: [relayId] },
};
const controls = ["model_visible_label:GPT-5.6 Sol", "thinking_control_label:Thinking effort", "thinking_visible_label:Extra High", "thinking_ordinal:4 of 5", "account_plan_label:Pro", "account_plan_role:PROVENANCE_METADATA_ONLY", "account_plan_is_reasoning_mode:false", "backend_model_identity_claimed:false", "assistant_content_observed:false"];
const common = [`request:${requestId}`, `supervisor:${supervisor}`, `provider_session:${session}`];
const conversation = "https://chatgpt.com/c/synthetic-request-bound";
const continuationDecisionRequestId = "original-owner-question";
const continuationOwnerText = "Use the exact bounded owner response through the project manager.";

function append(store: EventStore, id: string, data: AppendEnvelope["data"], at = time(0)) {
  return store.append({ schema_version: 2, event_id: id, mission_id: "mission-control-live", occurred_at: at, data }, at);
}
function fixture(filename = ":memory:", continuationPath?: "DIRECT" | "PROJECT_MANAGER") {
  const store = new EventStore(filename);
  append(store, "owner-source", {
    type: "owner_source_recorded", worker, receipt_id: "owner-source-1", owner_request_id: "owner-request-1", canonical_locator: "synthetic-owner-source",
    source_sha256: "d".repeat(64), worker_copy_sha256: null, capture_integrity: "VERIFIED", acquisition_mode: "OWNER_REATTESTED", receipt_capability: "OWNER_REATTESTED", comparison: "MATCH", freshness: "CURRENT", limitations: [],
  });
  append(store, "owner-outcome", {
    type: "owner_outcome_recorded", worker, owner_request_id: "owner-request-1", owner_outcome_id: "owner-outcome-1", epoch: 1,
    source_receipt_id: "owner-source-1", owner_source_sha256: "d".repeat(64), owner_outcome_sha256: "a".repeat(64),
    verbatim_owner_request: ["Synthetic bounded decision"], normalized_result: "One durable request", current_gap: "Awaiting decision", gap_status: "OPEN",
    required_outcomes: [{ id: "outcome-1", text: "One decision", terminal_required: true, status: "UNMET", direct_evidence_receipt_ids: [] }], non_satisfying_proxies: [], supersedes: null,
  });
  append(store, "contract", {
    type: "task_contract_recorded", worker, worker_name: "Request-bound fixture", contract_id: "contract-1", revision: 1, task_contract_sha256: "c".repeat(64),
    owner_outcome_id: "owner-outcome-1", owner_outcome_epoch: 1, owner_outcome_sha256: "a".repeat(64), goal: "Test request-bound execution", acceptance_criteria: ["One exact durable receipt"],
    forbidden_scope: [], omitted_owner_outcome_ids: [], weakened_owner_outcome_ids: [], proxy_substitutions: [], authorized_scope_changes: [],
    allowed_scope: ["fixture"], effective_finish_line: "Receipt admitted", required_owner_outcome_ids: ["outcome-1"], parent_outcome_remains_open: true,
  });
  const message = (id: string, author: "ASSISTANT" | "OWNER", surface: "SUPERVISOR" | "PROJECT_MANAGER", parent: string | null, text: string) => append(store, id, {
    type: "reasoning_message_recorded", worker, message_id: id, thread_id: "original-supervisor-thread",
    surface_role: surface, stable_supervisor_id: supervisor, provider_surface: "CHATGPT_CONSUMER", model_mode: "UNKNOWN", account_workspace: "UNKNOWN",
    author_role: author, sent_at_source: null, received_at_mission_control: time(0), body_sha256: sha256(text), exact_visible_body: text,
    immutable_provider_locator: null, parent_message_id: parent, owner_direction_id: null, decision_request_id: continuationDecisionRequestId,
    acquisition_method: author === "OWNER" ? "OWNER_ATTESTED" : "UNKNOWN", provenance_status: author === "OWNER" ? "OWNER_ATTESTED" : "UNVERIFIED",
    limitations: [], recorded_by: author === "OWNER" ? "owner:fixture" : "supervisor:fixture",
  });
  let continuation: ReturnType<typeof deriveOwnerResponseContinuation> | undefined;
  if (continuationPath) {
    message("original-question", "ASSISTANT", "SUPERVISOR", null, "Owner, choose the bounded option.");
    if (continuationPath === "PROJECT_MANAGER") {
      message("pm-owner-input", "OWNER", "PROJECT_MANAGER", "original-question", continuationOwnerText);
      message("pm-assistant-output", "ASSISTANT", "PROJECT_MANAGER", "pm-owner-input", "PM ASSISTANT OUTPUT MUST NOT TRAVEL");
      message("supervisor-owner-delivery", "OWNER", "SUPERVISOR", "pm-owner-input", continuationOwnerText);
    } else {
      message("supervisor-owner-delivery", "OWNER", "SUPERVISOR", "original-question", continuationOwnerText);
    }
    continuation = deriveOwnerResponseContinuation(store.allEvents(), {
      worker, resumeDecisionRequestId: continuationDecisionRequestId, supervisorId: supervisor,
      ownerOutcome: { id: "owner-outcome-1", epoch: 1, sha256: "a".repeat(64) },
      evidenceCapsule: { id: "capsule-1", sha256: "b".repeat(64) }, issuedAt: time(0), expiresAt: expiry,
    });
  }
  const packet = {
    schemaVersion: 5, packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE", worker, requestId, destinationSupervisorId: supervisor,
    nonce: "request-nonce-1", reasoningLane: "EXTRA_HIGH_DIRECT", providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY",
    evidenceCapsule: { id: "capsule-1", sha256: "b".repeat(64) }, ownerOutcome: { id: "owner-outcome-1", epoch: 1, sha256: "a".repeat(64) },
    githubReceipt: { repository: policy.repository, issueNumber: 59, stageIssueNumber: 61 }, factualPacket: { taskId: "task-1" },
    ...(continuation ? { continuationBinding: continuation.binding, continuationBindingSha256: continuation.digest, continuationOwnerResponseExactText: continuation.exactOwnerResponseText } : {}),
    executionContext: { task_id: "task-1", run_id: "run-1", family_id: "family-1", round: 0 }, queuedAt: time(0), expiresAt: expiry,
  };
  append(store, requestRouteEventId(requestId), { type: "worker_message_recorded", worker, message_id: "request-message-1", thread_id: "thread-1", message_kind: "QUESTION", body: requestBoundRoutePrefix + JSON.stringify(packet), reply_to_message_id: null, direction_id: null });
  evidence(store, "model-1", "MISSION_CONTROL_PROVIDER_SESSION_MODEL_UI_V1", ["session_role:REQUEST_BOUND_DECISION_SESSION", ...controls], 1);
  evidence(store, "session-active", "MISSION_CONTROL_PROVIDER_SESSION_V1", ["session_role:REQUEST_BOUND_DECISION_SESSION", "message_ordinal:1", "model_receipt:model-1", "lifecycle_status:ACTIVE", "url_binding_status:PENDING_PROVIDER_ASSIGNMENT"], 1);
  evidence(store, "started", "MISSION_CONTROL_RELAY_STAGE_V1", stageRefs("STARTED"), 2);
  return store;
}
function evidence(store: EventStore, id: string, summary: string, refs: string[], second: number, producerId = relayId) {
  return store.append({ schema_version: 2, event_id: `evidence:${id}`, mission_id: "mission-control-live", occurred_at: time(second), data: {
    type: "evidence_receipt_recorded", worker, receipt_id: id, producer_id: producerId, producer_role: "COLLECTOR", evidence_class: "ARTIFACT", independence: "SAME_PROVENANCE", freshness: "CURRENT", exact_candidate_sha256: null,
    summary, refs: [...common, ...refs], verified: true, changed_path_manifest: null,
  } }, time(second), { id: producerId, kind: "COLLECTOR", workerScopes: [worker], taskScopes: ["*"] });
}
function stageRefs(state: string) {
  return ["step:REQUEST_BOUND_DECISION", "message_ordinal:1", "first_message:true", `conversation_url:${conversation}`, `prompt_sha256:${"e".repeat(64)}`, `generation_state:${state}`, ...controls];
}
async function callBinding(store: EventStore, overrides: Record<string, string | undefined> = {}, persist = true) {
  const response = await handlePublicMissionControlMcpRequest(new Request("https://synthetic.example/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_supervisory_request_binding", arguments: { request_id: requestId, supervisor_id: supervisor, provider_session_id: session, ...overrides } } }),
  }), {
    loadEvents: async () => store.allEvents(), loadPolicy: () => policy, now: () => time(3),
    ...(persist ? { recordAccess: async (event: any) => {
      if (event.status === "OK") evidence(store, "mcp-1", "MISSION_CONTROL_PROVIDER_SESSION_MCP_READ_V1", ["tool:get_supervisory_request_binding", "status:OK", "server_observed:true"], 3, mcpId);
    } } : {}),
  });
  return await response.json() as any;
}
function complete(store: EventStore) {
  evidence(store, "complete", "MISSION_CONTROL_RELAY_STAGE_V1", stageRefs("COMPLETE"), 5);
  evidence(store, "session-complete", "MISSION_CONTROL_PROVIDER_SESSION_V1", ["session_role:REQUEST_BOUND_DECISION_SESSION", "message_ordinal:1", "model_receipt:model-1", "lifecycle_status:COMPLETE", "url_binding_status:EXACT", `conversation_url:${conversation}`], 5);
}
function candidate(store: EventStore) {
  const request = pendingDecisionRequests(store.allEvents())[0]!;
  const text = "Synthetic bounded answer; no provider inference occurred.";
  const decision: Extract<CanonicalDecisionEnvelope, { schema_version: 4 }> = {
    schema_version: 4, envelope_kind: "MISSION_CONTROL_CANONICAL_DECISION", request_id: requestId, supervisor_id: supervisor, provider_session_id: session,
    request_binding_sha256: requestBindingDigest(request, session, policy), execution_provenance: "REQUEST_BOUND_MCP_GITHUB_OBSERVED", nonce: request.nonce,
    evidence_capsule: request.evidenceCapsule, owner_outcome: request.ownerOutcome, reasoning_lane: "EXTRA_HIGH_DIRECT",
    decision_block: { decision_id: "decision-1", exact_text: text, sha256: sha256(text) }, pro_decision_block: { used: false, model_mode: null, exact_text: null, sha256: null },
    ...(request.continuation ? { continuation_binding: request.continuation.binding, continuation_binding_sha256: request.continuation.digest } : {}),
    writer_contract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretation_allowed: false },
  };
  return { repository: policy.repository, issueNumber: 59, commentId: 9001, immutableUrl: `https://github.com/${policy.repository}/issues/59#issuecomment-9001`, createdAt: time(4), authorLogin: "u-dont-existDOTcom", deliveryId: null, body: canonicalDecisionCommentPrefix + JSON.stringify(decision), ingestionMethod: "RECONCILIATION_POLL" as const };
}

test("real MCP handler persists server observation and admits the same-request final artifact without capability challenges", async () => {
  const store = fixture();
  try {
    const response = await callBinding(store);
    assert.equal(response.result?.isError, undefined, JSON.stringify(response));
    assert.equal(response.result.structuredContent.schema_version, 3);
    assert.equal(response.result.structuredContent.execution_protocol, "PER_REQUEST_V1");
    assert.deepEqual(response.result.structuredContent.execution_context, { task_id: "task-1", run_id: "run-1", family_id: "family-1", round: 0 });
    assert.equal(JSON.stringify(response).includes(conversation), false);
    complete(store);
    const result = ingestGitHubSupervisionCandidate(store, candidate(store), policy, time(6));
    assert.equal(result.length, 2);
    assert.equal(result[0]!.data.type, "github_decision_receipt_ingested");
    assert.equal(store.verifyChain().valid, true);
    assert.equal(pendingDecisionRequests(store.allEvents()).length, 0);
  } finally { store.close(); }
});

test("MC lookup rejects wrong session/supervisor and cannot report success without a persistence callback", async () => {
  for (const args of [{ provider_session_id: "provider-session:wrong" }, { supervisor_id: "wrong-supervisor" }, {}]) {
    const store = fixture();
    try {
      const response = await callBinding(store, args, Object.keys(args).length > 0);
      assert.equal(response.result?.isError, true, JSON.stringify(response));
    } finally { store.close(); }
  }
});

test("early GitHub delivery remains recoverable as the unchanged artifact after generation completion", async () => {
  const store = fixture();
  try {
    await callBinding(store); const receipt = candidate(store);
    assert.throws(() => ingestGitHubSupervisionCandidate(store, receipt, policy, time(4)), /completed exact|incomplete/);
    complete(store);
    assert.equal(ingestGitHubSupervisionCandidate(store, receipt, policy, time(6)).length, 2);
  } finally { store.close(); }
});

test("SQLite restart recovers the accepted artifact, even after expiry; edited or cross-session replays conflict", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-request-bound-")); const filename = path.join(dir, "events.db");
  let store = fixture(filename);
  try {
    await callBinding(store); complete(store); const receipt = candidate(store);
    ingestGitHubSupervisionCandidate(store, receipt, policy, time(6)); store.close(); store = new EventStore(filename);
    const before = store.count();
    assert.deepEqual(ingestGitHubSupervisionCandidate(store, receipt, policy, "2026-09-20T00:00:00.000Z"), []);
    const changed = JSON.parse(receipt.body.slice(canonicalDecisionCommentPrefix.length)); changed.provider_session_id = "provider-session:other";
    assert.throws(() => ingestGitHubSupervisionCandidate(store, { ...receipt, body: canonicalDecisionCommentPrefix + JSON.stringify(changed) }, policy, time(8)), /replay conflicts/);
    assert.equal(store.count(), before); assert.equal(store.verifyChain().valid, true);
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("failure between decision and attestation rolls back both and unchanged retry succeeds", async () => {
  const store = fixture();
  try {
    await callBinding(store); complete(store); const receipt = candidate(store); const before = store.count();
    const original = store.append.bind(store); let calls = 0;
    store.append = ((...args: Parameters<EventStore["append"]>) => { if (++calls === 2) throw new Error("injected storage failure"); return original(...args); }) as EventStore["append"];
    assert.throws(() => ingestGitHubSupervisionCandidate(store, receipt, policy, time(6)), /injected storage/);
    store.append = original; assert.equal(store.count(), before);
    assert.equal(ingestGitHubSupervisionCandidate(store, receipt, policy, time(6)).length, 2);
  } finally { store.close(); }
});

test("V5 project-manager continuation is exact and decision, attestation, and resolution commit atomically", async () => {
  const store = fixture(":memory:", "PROJECT_MANAGER");
  try {
    await callBinding(store); complete(store); const receipt = candidate(store); const before = store.count();
    const pending = pendingDecisionRequests(store.allEvents())[0]!;
    assert.equal(pending.continuation?.binding.path, "PROJECT_MANAGER");
    assert.equal(pending.continuation?.exactOwnerResponseText, continuationOwnerText);
    assert.equal(JSON.stringify(pending.continuation).includes("PM ASSISTANT OUTPUT MUST NOT TRAVEL"), false);
    assert.equal(decisionRouteStates(store.allEvents())[0]?.status, "SUPERVISOR_RESOLUTION_REQUIRED");
    const original = store.append.bind(store);
    store.append = ((...args: Parameters<EventStore["append"]>) => {
      if ((args[0] as { data?: { type?: string } }).data?.type === "reasoning_message_recorded") throw new Error("injected V5 resolution write failure");
      return original(...args);
    }) as EventStore["append"];
    assert.throws(() => ingestGitHubSupervisionCandidate(store, receipt, policy, time(6)), /injected V5/);
    assert.equal(store.count(), before);
    assert.equal(decisionRouteStates(store.allEvents())[0]?.status, "SUPERVISOR_RESOLUTION_REQUIRED");
    store.append = original;
    const admitted = ingestGitHubSupervisionCandidate(store, receipt, policy, time(6));
    assert.equal(admitted.length, 3);
    assert.equal(admitted[0]?.data.type, "github_decision_receipt_ingested");
    assert.equal(admitted[2]?.data.type, "reasoning_message_recorded");
    assert.equal(decisionRouteStates(store.allEvents())[0]?.status, "RESOLVED");
    assert.equal(pendingDecisionRequests(store.allEvents()).length, 0);
    assert.equal(store.verifyChain().valid, true);
  } finally { store.close(); }
});

test("collector identity, stale MCP data, request context, and exact generation identity are enforced", async () => {
  const store = fixture();
  try {
    await callBinding(store); complete(store); const receipt = candidate(store);
    for (const mutate of [
      (events: StoredEvent[]) => { const e = events.find(e => e.producerId === mcpId)!; e.producerId = "collector:impostor"; },
      (events: StoredEvent[]) => { events.find(e => e.producerId === mcpId)!.occurredAt = "2026-09-17T00:00:00.000Z"; },
      (events: StoredEvent[]) => { const e = events.find(e => e.eventId === "evidence:complete")!; if (e.data.type === "evidence_receipt_recorded") e.data.refs.push("provider_session:other"); },
      (events: StoredEvent[]) => { const e = events.find(e => e.data.type === "worker_message_recorded")!; if (e.data.type === "worker_message_recorded") { const p = JSON.parse(e.data.body.slice(requestBoundRoutePrefix.length)); p.executionContext.round = 1; e.data.body = requestBoundRoutePrefix + JSON.stringify(p); } },
    ]) {
      const events = structuredClone(store.allEvents()); mutate(events);
      assert.throws(() => buildGitHubDecisionReceiptEnvelope(events, receipt, policy, time(6)), /Request-bound execution rejected/);
    }
    assert.throws(() => buildGitHubDecisionReceiptEnvelope(store.allEvents(), receipt, { ...policy, requestBound: { enabled: false, relayProducerIds: [relayId] } }, time(6)), /not enabled/);
  } finally { store.close(); }
});

test("execution context is complete or task-only, never partially invented", () => {
  assert.deepEqual(requestExecutionContext(undefined, "task-1"), { task_id: "task-1" });
  assert.throws(() => requestExecutionContext({ task_id: "task-1", run_id: "r" }, "task-1"), /exact run/);
  assert.throws(() => requestExecutionContext({ task_id: "other" }, "task-1"), /mismatch/);
  assert.throws(() => requestExecutionContext({ task_id: "task-1", extra: "secret" }, "task-1"), /mismatch/);
});
