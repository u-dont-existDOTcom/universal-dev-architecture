import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "../lib/canonical";
import {
  buildGitHubDecisionReceiptEnvelope,
  canonicalDecisionCommentPrefix,
  ingestGitHubSupervisionCandidate,
  pendingDecisionRequests,
  type GitHubDecisionCandidate,
  type GitHubReceiptPolicy,
} from "../lib/github-decision-receipts";
import {
  inBandPreSendSummary,
  inBandRequestBindingEnvelope,
  inBandRequestProvenance,
  inBandRequestRoutePrefix,
  inBandRequestStep,
} from "../lib/in-band-request-binding";
import type { AppendEnvelope, CanonicalDecisionEnvelope, StoredEvent } from "../lib/schema";
import { EventStore } from "../lib/store";

const worker = "in-band-fixture", requestId = "in-band-request-1", supervisor = "fixture-supervisor";
const session = "provider-session:in-band-1", relayId = "collector:fixture-relay";
const promptSha256 = "e".repeat(64), admissionId = "send-admission:in-band-1", queueItemId = "send-queue-item:in-band-1";
const time = (value: string) => `2026-09-19T00:00:${value}Z`;
const policy: GitHubReceiptPolicy = {
  repository: "u-dont-existDOTcom/universal-dev-architecture", decisionIssueNumber: 53, capabilityIssueNumber: 60, stageIssueNumber: 61,
  authorizedWriterLogins: ["u-dont-existDOTcom"], capabilityChallenges: [], requestBound: { enabled: true, relayProducerIds: [relayId] },
};
const controls = [
  "model_visible_label:GPT-5.6 Sol", "thinking_control_label:Thinking effort", "thinking_visible_label:Extra High",
  "thinking_ordinal:4 of 5", "account_plan_label:Pro", "account_plan_role:PROVENANCE_METADATA_ONLY",
  "account_plan_is_reasoning_mode:false", "backend_model_identity_claimed:false", "assistant_content_observed:false",
];
const common = [`request:${requestId}`, `supervisor:${supervisor}`, `provider_session:${session}`];
const conversation = "https://chatgpt.com/c/synthetic-in-band";

function append(store: EventStore, id: string, data: AppendEnvelope["data"], at = time("00.000")) {
  return store.append({ schema_version: 2, event_id: id, mission_id: "mission-control-live", occurred_at: at, data }, at);
}

function evidence(store: EventStore, id: string, summary: string, refs: string[], at: string, producerId = relayId) {
  return store.append({ schema_version: 2, event_id: `evidence:${id}`, mission_id: "mission-control-live", occurred_at: at, data: {
    type: "evidence_receipt_recorded", worker, receipt_id: id, producer_id: producerId, producer_role: "COLLECTOR",
    evidence_class: "ARTIFACT", independence: "SAME_PROVENANCE", freshness: "CURRENT", exact_candidate_sha256: null,
    summary, refs: [...common, ...refs], verified: true, changed_path_manifest: null,
  } }, at, { id: producerId, kind: "COLLECTOR", workerScopes: [worker], taskScopes: ["*"] });
}

function fixture() {
  const store = new EventStore(":memory:");
  append(store, "owner-source", {
    type: "owner_source_recorded", worker, receipt_id: "owner-source-1", owner_request_id: "owner-request-1", canonical_locator: "synthetic-owner-source",
    source_sha256: "d".repeat(64), worker_copy_sha256: null, capture_integrity: "VERIFIED", acquisition_mode: "OWNER_REATTESTED",
    receipt_capability: "OWNER_REATTESTED", comparison: "MATCH", freshness: "CURRENT", limitations: [],
  });
  append(store, "owner-outcome", {
    type: "owner_outcome_recorded", worker, owner_request_id: "owner-request-1", owner_outcome_id: "owner-outcome-1", epoch: 1,
    source_receipt_id: "owner-source-1", owner_source_sha256: "d".repeat(64), owner_outcome_sha256: "a".repeat(64),
    verbatim_owner_request: ["Synthetic in-band request"], normalized_result: "One exact V6 decision", current_gap: "Awaiting decision", gap_status: "OPEN",
    required_outcomes: [{ id: "outcome-1", text: "One decision", terminal_required: true, status: "UNMET", direct_evidence_receipt_ids: [] }],
    non_satisfying_proxies: [], supersedes: null,
  });
  append(store, "task-contract", {
    type: "task_contract_recorded", worker, worker_name: "In-band fixture", contract_id: "contract-v6", revision: 1,
    task_contract_sha256: "c".repeat(64), owner_outcome_id: "owner-outcome-1", owner_outcome_epoch: 1,
    owner_outcome_sha256: "a".repeat(64), goal: "Verify one exact in-band decision", acceptance_criteria: ["One exact durable receipt"],
    forbidden_scope: [], omitted_owner_outcome_ids: [], weakened_owner_outcome_ids: [], proxy_substitutions: [], authorized_scope_changes: [],
    allowed_scope: ["fixture"], effective_finish_line: "Receipt admitted", required_owner_outcome_ids: ["outcome-1"], parent_outcome_remains_open: true,
  });
  const packet = {
    schemaVersion: 6, packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE", worker, requestId, destinationSupervisorId: supervisor,
    nonce: "request-nonce-1", reasoningLane: "EXTRA_HIGH_DIRECT", providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY",
    evidenceCapsule: { id: "capsule-1", sha256: "b".repeat(64) }, ownerOutcome: { id: "owner-outcome-1", epoch: 1, sha256: "a".repeat(64) },
    githubReceipt: { repository: policy.repository, issueNumber: 53, stageIssueNumber: 61 },
    factualPacket: { taskId: "task-1", evidenceRefs: ["https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/53#issuecomment-5744485891"] },
    executionContext: { task_id: "task-1", run_id: "run-1", family_id: "family-1", round: 0 },
    queuedAt: time("00.000"), expiresAt: time("30.000"),
  };
  append(store, "supervision-request-v6", {
    type: "worker_message_recorded", worker, message_id: "message-v6", thread_id: "thread-v6", message_kind: "QUESTION",
    body: inBandRequestRoutePrefix + JSON.stringify(packet), reply_to_message_id: null, direction_id: null,
  });
  const request = pendingDecisionRequests(store.allEvents())[0]!;
  const binding = inBandRequestBindingEnvelope(request, session, policy);
  evidence(store, "model", "MISSION_CONTROL_PROVIDER_SESSION_MODEL_UI_V1", ["session_role:IN_BAND_REQUEST_DECISION_SESSION", ...controls], time("01.000"));
  evidence(store, "session-active", "MISSION_CONTROL_PROVIDER_SESSION_V1", ["session_role:IN_BAND_REQUEST_DECISION_SESSION", "message_ordinal:1", "lifecycle_status:ACTIVE", "url_binding_status:PENDING_PROVIDER_ASSIGNMENT"], time("01.000"));
  evidence(store, "pre-send", inBandPreSendSummary, [
    "worker:in-band-fixture", "binding_protocol:IN_BAND_REQUEST_BINDING_V1", "binding_schema:MISSION_CONTROL_IN_BAND_REQUEST_BINDING_V1",
    `in_band_binding_sha256:${binding.in_band_binding_sha256}`, `provider_body_sha256:${promptSha256}`,
    `decision_receipt_target:https://github.com/${policy.repository}/issues/53`, `submission_admission:${admissionId}`,
    `admitted_at:${time("01.500")}`, `admission_expires_at:${time("20.000")}`, `trusted_relay_producer:${relayId}`, "semantic_authority:false",
  ], time("02.000"));
  const stageRefs = (state: "STARTED" | "COMPLETE") => [
    `step:${inBandRequestStep}`, "message_ordinal:1", "first_message:true", `conversation_url:${conversation}`,
    `prompt_sha256:${promptSha256}`, `generation_state:${state}`, "selected_app:GitHub", "semantic_authority:false", ...controls,
  ];
  evidence(store, "stage-start", "MISSION_CONTROL_RELAY_STAGE_V1", stageRefs("STARTED"), time("03.000"));
  evidence(store, "stage-complete", "MISSION_CONTROL_RELAY_STAGE_V1", stageRefs("COMPLETE"), time("05.000"));
  evidence(store, "session-complete", "MISSION_CONTROL_PROVIDER_SESSION_V1", [
    "session_role:IN_BAND_REQUEST_DECISION_SESSION", "message_ordinal:1", "lifecycle_status:COMPLETE", "url_binding_status:EXACT", `conversation_url:${conversation}`,
  ], time("05.000"));
  const exactText = "Proceed with the bounded in-band decision.";
  const decision: Extract<CanonicalDecisionEnvelope, { schema_version: 5 }> = {
    schema_version: 5, envelope_kind: "MISSION_CONTROL_CANONICAL_DECISION", request_id: requestId, supervisor_id: supervisor,
    provider_session_id: session, in_band_binding_sha256: binding.in_band_binding_sha256,
    execution_provenance: inBandRequestProvenance, nonce: request.nonce, evidence_capsule: request.evidenceCapsule,
    owner_outcome: request.ownerOutcome, reasoning_lane: "EXTRA_HIGH_DIRECT",
    decision_block: { decision_id: "decision-v6", exact_text: exactText, sha256: sha256(exactText) },
    pro_decision_block: { used: false, model_mode: null, exact_text: null, sha256: null },
    writer_contract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretation_allowed: false },
  };
  const candidate: GitHubDecisionCandidate = {
    repository: policy.repository, issueNumber: 53, commentId: 5744000001,
    immutableUrl: `https://github.com/${policy.repository}/issues/53#issuecomment-5744000001`,
    createdAt: time("04.000"), authorLogin: "u-dont-existDOTcom", deliveryId: null,
    body: canonicalDecisionCommentPrefix + JSON.stringify(decision), ingestionMethod: "RECONCILIATION_POLL",
  };
  const authority = {
    admissions: [{
      admissionId, queueItemId, producerId: relayId, requestId, supervisorId: supervisor,
      targetKind: "FRESH_PROVIDER_SESSION", targetKey: session, bodySha256: promptSha256,
      queueKey: `request:${requestId}:${inBandRequestStep}`, retryRootKey: `request:${requestId}:${inBandRequestStep}`,
      sendPath: `SUPERVISORY_CYCLE_${inBandRequestStep}`, status: "BOUNDARY_RECORDED", boundaryKind: "GENERATION_STARTED",
      admittedAt: time("01.500"), expiresAt: time("20.000"), boundaryAt: time("02.500"),
    }],
    queueItems: [{ queueItemId, admissionIds: [admissionId] }],
  };
  return { store, events: store.allEvents(), request, binding, decision, candidate, authority };
}

function build(f: ReturnType<typeof fixture>, events = f.events, candidate = f.candidate, authority = f.authority) {
  return buildGitHubDecisionReceiptEnvelope(events, candidate, policy, time("06.000"), { submissionAuthorityState: authority });
}

function candidateWith(f: ReturnType<typeof fixture>, change: (decision: any) => void): GitHubDecisionCandidate {
  const decision = structuredClone(f.decision) as any;
  change(decision);
  return { ...f.candidate, body: canonicalDecisionCommentPrefix + JSON.stringify(decision) };
}

test("V6 admits one exact GitHub decision without any MCP receipt and records distinct provenance", () => {
  const f = fixture();
  try {
    const envelope = build(f);
    assert.equal(envelope.data.type, "github_decision_receipt_ingested");
    if (envelope.data.type !== "github_decision_receipt_ingested") return;
    assert.equal(envelope.data.execution_provenance, inBandRequestProvenance);
    assert.equal(envelope.data.execution_mcp_receipt_id, undefined);
    assert.equal(envelope.data.execution_submission_admission_id, admissionId);
    assert.equal(envelope.data.execution_provider_body_sha256, promptSha256);
  } finally { f.store.close(); }
});

test("V6 production ingestion reads and verifies the current central authority state before committing atomically", () => {
  const f = fixture();
  const priorDomain = process.env.MISSION_CONTROL_SUBMISSION_PACING_DOMAIN;
  try {
    process.env.MISSION_CONTROL_SUBMISSION_PACING_DOMAIN = "chatgpt:v6-fixture";
    f.store.commitSubmissionAuthorityState("chatgpt:v6-fixture", f.authority, { eventKind: "V6_TEST_AUTHORITY" });
    const appended = ingestGitHubSupervisionCandidate(f.store, f.candidate, policy, time("06.000"), f.events);
    assert.equal(appended.length, 2);
    assert.equal(appended[0]?.data.type, "github_decision_receipt_ingested");
    assert.equal(appended[1]?.data.type, "evidence_receipt_recorded");
    assert.equal(f.store.verifyChain().valid, true);
    assert.equal(f.store.verifySubmissionAuthorityLedger("chatgpt:v6-fixture").valid, true);
  } finally {
    if (priorDomain === undefined) delete process.env.MISSION_CONTROL_SUBMISSION_PACING_DOMAIN;
    else process.env.MISSION_CONTROL_SUBMISSION_PACING_DOMAIN = priorDomain;
    f.store.close();
  }
});

test("V6 fail-closes changed binding fields, binding digest, body digest, session, expiry, and missing or wrong-producer pre-send proof", () => {
  const f = fixture();
  try {
    const cases: Array<[string, StoredEvent[], GitHubDecisionCandidate, any]> = [];
    const changedField = structuredClone(f.events);
    const route = changedField.find((event) => event.data.type === "worker_message_recorded")!;
    if (route.data.type === "worker_message_recorded") {
      const parsed = JSON.parse(route.data.body.slice(inBandRequestRoutePrefix.length));
      parsed.executionContext.round = 1;
      route.data.body = inBandRequestRoutePrefix + JSON.stringify(parsed);
    }
    cases.push(["binding field", changedField, f.candidate, f.authority]);
    cases.push(["binding digest", f.events, candidateWith(f, (decision) => { decision.in_band_binding_sha256 = "f".repeat(64); }), f.authority]);
    const changedPrompt = structuredClone(f.events);
    const pre = changedPrompt.find((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === inBandPreSendSummary)!;
    if (pre.data.type === "evidence_receipt_recorded") pre.data.refs = pre.data.refs.map((ref) => ref.startsWith("provider_body_sha256:") ? `provider_body_sha256:${"c".repeat(64)}` : ref);
    cases.push(["body digest", changedPrompt, f.candidate, f.authority]);
    cases.push(["session", f.events, candidateWith(f, (decision) => { decision.provider_session_id = "provider-session:other"; }), f.authority]);
    const stale = structuredClone(f.events);
    const staleRoute = stale.find((event) => event.data.type === "worker_message_recorded")!;
    if (staleRoute.data.type === "worker_message_recorded") {
      const parsed = JSON.parse(staleRoute.data.body.slice(inBandRequestRoutePrefix.length));
      parsed.expiresAt = time("01.750");
      staleRoute.data.body = inBandRequestRoutePrefix + JSON.stringify(parsed);
    }
    cases.push(["expiry", stale, f.candidate, f.authority]);
    cases.push(["missing pre-send", f.events.filter((event) => !(event.data.type === "evidence_receipt_recorded" && event.data.summary === inBandPreSendSummary)), f.candidate, f.authority]);
    const wrongProducer = structuredClone(f.events);
    const wrong = wrongProducer.find((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === inBandPreSendSummary)!;
    wrong.producerId = "collector:wrong-relay";
    if (wrong.data.type === "evidence_receipt_recorded") wrong.data.producer_id = "collector:wrong-relay";
    cases.push(["wrong producer", wrongProducer, f.candidate, f.authority]);
    for (const [name, events, candidate, authority] of cases) {
      assert.throws(() => build(f, events, candidate, authority), /In-band request execution rejected|stale/, name);
    }
  } finally { f.store.close(); }
});

test("V6 rejects multiple sends, MCP evidence, central admission changes, and current owner-outcome changes", () => {
  const f = fixture();
  try {
    const secondSend = structuredClone(f.events);
    const start = structuredClone(secondSend.find((event) => event.eventId === "evidence:stage-start")!);
    start.eventId = "evidence:second-send"; start.sequence += 100;
    if (start.data.type === "evidence_receipt_recorded") start.data.refs = start.data.refs.map((ref) => ref === `provider_session:${session}` ? "provider_session:other" : ref);
    secondSend.push(start);
    assert.throws(() => build(f, secondSend), /more than one provider/);

    const withMcp = structuredClone(f.events);
    const mcp = structuredClone(withMcp.find((event) => event.eventId === "evidence:stage-start")!);
    mcp.eventId = "evidence:forbidden-mcp"; mcp.sequence += 101;
    if (mcp.data.type === "evidence_receipt_recorded") {
      mcp.data.summary = "MISSION_CONTROL_PROVIDER_SESSION_MCP_READ_V1";
      mcp.data.refs.push("tool:get_supervisory_request_binding");
    }
    withMcp.push(mcp);
    assert.throws(() => build(f, withMcp), /must not carry an MCP receipt/);

    for (const mutate of [
      (authority: any) => { authority.admissions[0].bodySha256 = "1".repeat(64); },
      (authority: any) => { authority.admissions[0].producerId = "collector:wrong-relay"; },
      (authority: any) => { authority.admissions[0].targetKey = "provider-session:other"; },
      (authority: any) => { authority.queueItems[0].admissionIds.push("send-admission:second"); },
    ]) {
      const authority = structuredClone(f.authority); mutate(authority);
      assert.throws(() => build(f, f.events, f.candidate, authority), /central admission|single-use/);
    }

    const changedOutcome = structuredClone(f.events);
    const latest = structuredClone(changedOutcome.find((event) => event.eventId === "owner-outcome")!);
    latest.eventId = "owner-outcome-new"; latest.sequence += 1000;
    if (latest.data.type === "owner_outcome_recorded") { latest.data.epoch = 2; latest.data.owner_outcome_sha256 = "9".repeat(64); }
    changedOutcome.push(latest);
    assert.throws(() => build(f, changedOutcome), /current owner-outcome epoch/);
  } finally { f.store.close(); }
});

test("V6 rejects wrong GitHub location/writer and never accepts V5 MCP provenance", () => {
  const f = fixture();
  try {
    assert.throws(() => build(f, f.events, { ...f.candidate, issueNumber: 54 }), /GitHub issue number|configured/);
    assert.throws(() => ingestGitHubSupervisionCandidate(f.store, { ...f.candidate, authorLogin: "untrusted-writer" }, policy, time("06.000"), f.events), /not authorized/);
    const wrongProvenance = structuredClone(f.decision) as any;
    wrongProvenance.execution_provenance = "REQUEST_BOUND_MCP_GITHUB_OBSERVED";
    assert.throws(() => build(f, f.events, { ...f.candidate, body: canonicalDecisionCommentPrefix + JSON.stringify(wrongProvenance) }), /Invalid input|execution_provenance/);
  } finally { f.store.close(); }
});
