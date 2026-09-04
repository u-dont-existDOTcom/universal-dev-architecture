import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { sha256 } from "../lib/canonical";
import {
  buildGitHubDecisionReceiptEnvelope,
  canonicalDecisionCommentPrefix,
  capabilityReceiptCommentPrefix,
  stageReceiptCommentPrefix,
  capabilityChallengeSummary,
  capabilityVerifiedSummary,
  ensureConfiguredCapabilityChallenges,
  githubDecisionCandidateFromWebhook,
  ingestGitHubSupervisionCandidate,
  modeCapabilityVerifiedSummary,
  parseCanonicalDecisionComment,
  parseStageReceiptComment,
  providerSessionMcpSummary,
  providerSessionModelSummary,
  providerSessionSummary,
  reconcileGitHubDecisionReceipts,
  relayStageSummary,
  stageLivenessSummary,
  sameChatWriterAttestationSummary,
  supervisoryCycleRoutePrefix,
  validateConfiguredDecisionLocation,
  verifyGitHubWebhookSignature,
  type GitHubDecisionCandidate,
  type GitHubReceiptPolicy,
} from "../lib/github-decision-receipts";
import type { CanonicalDecisionEnvelope, StoredEvent } from "../lib/schema";
import type { EventStore } from "../lib/store";

const outcomeSha = "a".repeat(64);
const evidenceSha = "b".repeat(64);
const decisionText = "Use the bounded implementation and preserve the stated stop boundary.";
const supervisorId = "spec";
const bootstrapChatId = "spec-bootstrap";
const providerSessionId = "provider-session:current";

test("GitHub webhook authentication and issue-comment normalization fail closed", () => {
  const secret = "s".repeat(32);
  const raw = JSON.stringify(webhookPayload(decisionBody()));
  const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  assert.equal(verifyGitHubWebhookSignature(secret, raw, signature), true);
  assert.equal(verifyGitHubWebhookSignature(secret, `${raw}x`, signature), false);
  const candidate = githubDecisionCandidateFromWebhook(JSON.parse(raw), "delivery-1");
  assert.equal(candidate.repository, policy().repository);
  assert.equal(candidate.issueNumber, policy().decisionIssueNumber);
  assert.equal(candidate.authorLogin, "u-dont-existDOTcom");
});

test("central policy rejects worker-selected repository/issue and unauthorized writer", () => {
  const p = policy();
  assert.doesNotThrow(() => validateConfiguredDecisionLocation(p.repository, p.decisionIssueNumber, p));
  assert.throws(() => validateConfiguredDecisionLocation(p.repository, 999, p), /centrally configured/);
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(boundEvents(), { ...candidate(), repository: "evil/repo" }, p), /GitHub repository|configured/);
  const store = fakeStore(boundEvents());
  assert.throws(() => ingestGitHubSupervisionCandidate(store, { ...candidate(), authorLogin: "other-user" }, p), /not authorized/);
});

test("capability challenge exposes MC nonce, GitHub nonce hash/location, and stage-liveness target", () => {
  const p = policy();
  const store = fakeStore([]);
  const appended = ensureConfiguredCapabilityChallenges(store, p, "2026-09-02T00:00:00.000Z");
  assert.equal(appended.length, 1);
  const receipt = appended[0];
  assert.equal(receipt.data.type, "evidence_receipt_recorded");
  if (receipt.data.type !== "evidence_receipt_recorded") return;
  assert.equal(receipt.data.summary, capabilityChallengeSummary);
  assert.ok(receipt.data.refs.includes("mc_nonce:mc-nonce"));
  assert.ok(receipt.data.refs.includes(`github_nonce_sha256:${sha256("github-only-nonce")}`));
  assert.equal(receipt.data.refs.some((ref) => ref === "github_nonce:github-only-nonce"), false);
  assert.ok(receipt.data.refs.includes(`stage_receipt_target:https://github.com/${p.repository}/issues/${p.stageIssueNumber}`));
});

test("capability receipt proves MC read + GitHub read + GitHub write only with both nonces and authorized writer", () => {
  const p = policy();
  const store = fakeStore([]);
  ensureConfiguredCapabilityChallenges(store, p, "2026-09-02T00:00:00.000Z");
  const body = capabilityReceiptBody("mc-nonce", "github-only-nonce");
  const events = ingestGitHubSupervisionCandidate(store, capabilityCandidate(body), p, "2026-09-02T00:02:00.000Z");
  assert.equal(events.length, 1);
  assert.equal(events[0].data.type, "evidence_receipt_recorded");
  if (events[0].data.type !== "evidence_receipt_recorded") return;
  assert.equal(events[0].data.summary, capabilityVerifiedSummary);
  assert.ok(events[0].data.refs.includes("capability:missionControlRead"));
  assert.ok(events[0].data.refs.includes("capability:githubRead"));
  assert.ok(events[0].data.refs.includes("capability:githubWrite"));

  const badStore = fakeStore([]);
  ensureConfiguredCapabilityChallenges(badStore, p, "2026-09-02T00:00:00.000Z");
  assert.throws(() => ingestGitHubSupervisionCandidate(badStore, capabilityCandidate(capabilityReceiptBody("mc-nonce", "wrong")), p), /nonce mismatch/);
});

test("stage liveness receipt binds exact request, nonce, stable supervisor, provider session, issue and status without semantic authority", () => {
  const p = policy();
  const store = fakeStore([...pendingEvents(), ...providerSessionEvents()]);
  const events = ingestGitHubSupervisionCandidate(
    store,
    stageCandidate(stageReceiptBody("EXTRA_HIGH_READER", "STAGE_COMPLETE")),
    p,
    "2026-09-02T00:04:00.000Z",
  );
  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.data.type, "evidence_receipt_recorded");
  if (event.data.type !== "evidence_receipt_recorded") return;
  assert.equal(event.data.summary, stageLivenessSummary);
  assert.ok(event.data.refs.includes("stage:EXTRA_HIGH_READER"));
  assert.ok(event.data.refs.includes("status:STAGE_COMPLETE"));
  assert.ok(event.data.refs.includes("semantic_authority:false"));

  const wrongNonce = stageReceiptBody("EXTRA_HIGH_READER", "STAGE_COMPLETE", "wrong-nonce");
  assert.throws(() => ingestGitHubSupervisionCandidate(fakeStore([...pendingEvents(), ...providerSessionEvents()]), stageCandidate(wrongNonce), p), /nonce binding/);
  assert.throws(() => ingestGitHubSupervisionCandidate(fakeStore([...pendingEvents(), ...providerSessionEvents()]), stageCandidate(stageReceiptBody("EXTRA_HIGH_READER", "STAGE_COMPLETE", "nonce-1", "provider-session:old")), p), /provider-session binding/);
  assert.throws(() => ingestGitHubSupervisionCandidate(fakeStore([...pendingEvents(), ...providerSessionEvents()]), { ...stageCandidate(stageReceiptBody("EXTRA_HIGH_READER", "STAGE_COMPLETE")), issueNumber: p.capabilityIssueNumber }, p), /stage-liveness channel/);
});

test("canonical Pro decision is rejected until capabilities, semantic liveness, and ordered transport stages exist", () => {
  const p = policy();
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(pendingEvents(), candidate(), p), /capability receipt/);

  const capabilityOnly = [...pendingEvents(), ...capabilityEvents()];
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(capabilityOnly, candidate(), p), /active provider session/);

  const sessionOnly = [...capabilityOnly, ...providerSessionEvents()];
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(sessionOnly, candidate(), p), /semantic stage completion EXTRA_HIGH_READER/);

  const semanticOnly = [...sessionOnly, ...semanticStageEvents()];
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(semanticOnly, candidate(), p), /Missing ordered relay stage/);

  const complete = boundEvents();
  const result = buildGitHubDecisionReceiptEnvelope(complete, candidate(), p);
  assert.equal(result.data.type, "github_decision_receipt_ingested");
  if (result.data.type !== "github_decision_receipt_ingested") return;
  assert.equal(result.data.reasoning_lane, "PRO_ESCALATED");
  assert.equal(result.data.pro_decision_block.used, true);
  assert.equal(result.data.writer_contract.reinterpretation_allowed, false);
});

test("a later CONTINUE_REQUIRED stage receipt blocks decision admission until a later STAGE_COMPLETE", () => {
  const events = boundEvents();
  events.push(livenessEvent("pro-needs-more", 14, "PRO_REASONER", "CONTINUE_REQUIRED", "2026-09-02T00:09:00.000Z"));
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(events, candidate(), policy()), /semantic stage completion PRO_REASONER/);
  events.push(livenessEvent("pro-complete-again", 15, "PRO_REASONER", "STAGE_COMPLETE", "2026-09-02T00:10:00.000Z"));
  assert.doesNotThrow(() => buildGitHubDecisionReceiptEnvelope(events, candidate(), policy()));
});

test("same-chat Pro content is stored with writer attestation, never independent provider provenance", () => {
  const store = fakeStore(boundEvents());
  const events = ingestGitHubSupervisionCandidate(store, candidate(), policy(), "2026-09-02T00:11:00.000Z");
  assert.equal(events.length, 2);
  const attestation = events[1];
  assert.equal(attestation.data.type, "evidence_receipt_recorded");
  if (attestation.data.type !== "evidence_receipt_recorded") return;
  assert.equal(attestation.data.summary, sameChatWriterAttestationSummary);
  assert.ok(attestation.data.refs.includes("provenance:SAME_CHAT_WRITER_ATTESTED"));
  assert.ok(attestation.data.refs.includes("independent_pro_observation:false"));
  assert.equal(attestation.data.independence, "SAME_PROVENANCE");
});

test("wrong transport model label/order cannot acquire authority", () => {
  const events = boundEvents();
  const stage = events.find((event) => event.data.type === "evidence_receipt_recorded" && event.data.refs?.includes("step:PRO_REASONER"));
  assert.ok(stage && stage.data.type === "evidence_receipt_recorded");
  if (!stage || stage.data.type !== "evidence_receipt_recorded") return;
  stage.data.refs = stage.data.refs.filter((ref) => ref !== "model_ui_label:Pro").concat("model_ui_label:Extra High");
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(events, candidate(), policy()), /PRO_REASONER/);
});

test("old provider-session MCP, transport, stage, and canonical receipts cannot satisfy a new cycle", () => {
  const oldSession = "provider-session:old";
  const events = boundEvents();
  for (const event of events) {
    if (event.data.type !== "evidence_receipt_recorded" || event.data.summary !== providerSessionMcpSummary) continue;
    event.data.refs = event.data.refs.map((ref) => ref === `provider_session:${providerSessionId}` ? `provider_session:${oldSession}` : ref);
  }
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(events, candidate(), policy()), /MCP binding preload/);

  const oldDecision = { ...decisionEnvelope(), provider_session_id: oldSession };
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(boundEvents(), { ...candidate(), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(oldDecision)}` }, policy()), /provider session ID/);

  const oldStages = boundEvents().map((event) => {
    if (event.data.type !== "evidence_receipt_recorded" || event.data.summary !== stageLivenessSummary) return event;
    const copy = structuredClone(event);
    if (copy.data.type === "evidence_receipt_recorded") {
      copy.data.refs = copy.data.refs.map((ref) => ref === `provider_session:${providerSessionId}` ? `provider_session:${oldSession}` : ref);
    }
    return copy;
  });
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(oldStages, candidate(), policy()), /semantic stage completion/);
});

test("ordinary provider-session admission needs preload transport plus one binding receipt and no follow-up stage receipt", () => {
  const events = pendingEvents().map((event) => {
    if (event.data.type !== "worker_message_recorded") return event;
    const packet = JSON.parse(event.data.body.slice(supervisoryCycleRoutePrefix.length));
    packet.reasoningLane = "EXTRA_HIGH_DIRECT";
    const copy = structuredClone(event);
    if (copy.data.type === "worker_message_recorded") copy.data.body = supervisoryCycleRoutePrefix + JSON.stringify(packet);
    return copy;
  });
  events.push(
    ...capabilityEvents(),
    ...providerSessionEvents(),
    transportStage("preload", 9, "MCP_BINDING_PRELOAD", "Extra High", "2026-09-02T00:03:30.000Z"),
    transportStage("direct", 10, "EXTRA_HIGH_DIRECT", "Extra High", "2026-09-02T00:04:30.000Z"),
  );
  const direct = {
    ...decisionEnvelope(),
    reasoning_lane: "EXTRA_HIGH_DIRECT" as const,
    pro_decision_block: { used: false, model_mode: null, exact_text: null, sha256: null },
  };
  const result = buildGitHubDecisionReceiptEnvelope(events, { ...candidate(), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(direct)}` }, policy());
  assert.equal(result.data.type, "github_decision_receipt_ingested");
});

test("legacy receipt schemas remain parseable without being relabeled as provider-session evidence", () => {
  const legacyDecision = { ...decisionEnvelope(), schema_version: 1 as const } as Record<string, unknown>;
  delete legacyDecision.supervisor_id;
  delete legacyDecision.provider_session_id;
  const parsedDecision = parseCanonicalDecisionComment(`${canonicalDecisionCommentPrefix}${JSON.stringify(legacyDecision)}`);
  assert.equal(parsedDecision.schema_version, 1);
  assert.equal("provider_session_id" in parsedDecision, false);
  const parsedStage = parseStageReceiptComment(`${stageReceiptCommentPrefix}${JSON.stringify({ schema_version: 1, request_id: "legacy-request", request_nonce: "legacy-nonce", chat_id: "legacy-chat", stage: "PRO_REASONER", status: "STAGE_COMPLETE" })}`);
  assert.equal(parsedStage.schemaVersion, 1);
  assert.equal(parsedStage.providerSessionId, null);
});

test("public reconciliation polls all centrally configured buses without requiring Authorization", async () => {
  const p = policy();
  const store = fakeStore([]);
  ensureConfiguredCapabilityChallenges(store, p, "2026-09-02T00:00:00.000Z");
  const urls: string[] = [];
  const authorizationHeaders: Array<string | null> = [];
  const result = await reconcileGitHubDecisionReceipts(store, {
    policy: p,
    now: "2026-09-02T00:02:00.000Z",
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      authorizationHeaders.push(new Headers(init?.headers).get("authorization"));
      const issue = String(url).includes(`/issues/${p.capabilityIssueNumber}/`);
      return new Response(JSON.stringify(issue ? [webhookPayload(capabilityReceiptBody("mc-nonce", "github-only-nonce"), p.capabilityIssueNumber).comment] : []), { status: 200 });
    },
  });
  assert.equal(urls.length, 3);
  assert.ok(urls.every((url) => url.includes(`/repos/${p.repository}/issues/`)));
  assert.deepEqual(authorizationHeaders, [null, null, null]);
  assert.equal(result.some((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === capabilityVerifiedSummary), true);
});

function policy(): GitHubReceiptPolicy {
  return {
    repository: "u-dont-existDOTcom/universal-dev-architecture",
    decisionIssueNumber: 58,
    capabilityIssueNumber: 59,
    stageIssueNumber: 60,
    authorizedWriterLogins: ["u-dont-existDOTcom"],
    capabilityChallenges: [{
      challengeId: "challenge-spec", supervisorId, chatId: bootstrapChatId, worker: "mission-control-live-slice",
      mcNonce: "mc-nonce", githubNonce: "github-only-nonce", expiresAt: "2026-09-03T00:00:00.000Z",
      extraHighLabel: "Extra High", proLabel: "Pro",
    }],
  };
}

function pendingEvents(): StoredEvent[] {
  const outcome = storedEvent({
    type: "owner_outcome_recorded", worker: "mission-control-live-slice", owner_request_id: "owner-request-1",
    owner_outcome_id: "owner-outcome-1", epoch: 7, source_receipt_id: "owner-source-1", owner_source_sha256: "d".repeat(64), owner_outcome_sha256: outcomeSha,
    verbatim_owner_request: ["Exact owner request"], normalized_result: "Exact result", current_gap: "Decision receipt pending", gap_status: "OPEN",
    required_outcomes: [{ id: "outcome-1", text: "Result", terminal_required: true, status: "UNMET", direct_evidence_receipt_ids: [] }], non_satisfying_proxies: [], supersedes: null, supersedes_outcome_sha256: null,
  } as StoredEvent["data"], "owner-outcome", 1, "2026-09-02T00:00:00.000Z");
  const packet = {
    schemaVersion: 3, packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE", requestId: "decision-request-1", destinationSupervisorId: supervisorId, nonce: "nonce-1", reasoningLane: "PRO_ESCALATED",
    providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY", evidenceCapsule: { id: "capsule-1", sha256: evidenceSha }, ownerOutcome: { id: "owner-outcome-1", epoch: 7, sha256: outcomeSha },
    githubReceipt: { repository: policy().repository, issueNumber: policy().decisionIssueNumber }, factualPacket: { taskId: "task-1" }, queuedAt: "2026-09-02T00:01:00.000Z", expiresAt: "2026-09-03T00:00:00.000Z",
  };
  const message = storedEvent({
    type: "worker_message_recorded", worker: "mission-control-live-slice", message_id: "message-1", thread_id: "thread-1", message_kind: "QUESTION",
    body: `${supervisoryCycleRoutePrefix}${JSON.stringify(packet)}`, reply_to_message_id: null, direction_id: null,
  }, "route-event", 2, "2026-09-02T00:01:00.000Z");
  return [outcome, message];
}

function capabilityEvents(): StoredEvent[] {
  return [
    evidenceEvent("challenge", 3, capabilityChallengeSummary, ["challenge:challenge-spec", `supervisor:${supervisorId}`, `chat:${bootstrapChatId}`, "mc_nonce:mc-nonce", `github_nonce_sha256:${sha256("github-only-nonce")}`, "expires_at:2026-09-03T00:00:00.000Z"]),
    evidenceEvent("tools", 4, capabilityVerifiedSummary, ["challenge:challenge-spec", `supervisor:${supervisorId}`, `chat:${bootstrapChatId}`, "capability:missionControlRead", "capability:githubRead", "capability:githubWrite", "expires_at:2026-09-03T00:00:00.000Z"]),
    evidenceEvent("mode", 5, modeCapabilityVerifiedSummary, [`chat:${bootstrapChatId}`, "capability:modeSwitching", "extra_high_label:Extra High", "pro_label:Pro", "expires_at:2026-09-03T00:00:00.000Z"]),
  ];
}

function providerSessionEvents(): StoredEvent[] {
  const common = ["request:decision-request-1", `supervisor:${supervisorId}`, `provider_session:${providerSessionId}`];
  return [
    evidenceEvent("provider-session", 6, providerSessionSummary, [...common, "conversation_url:https://chatgpt.com/c/current-session", "url_binding_status:EXACT", "lifecycle_status:ACTIVE", "semantic_authority:false"], "2026-09-02T00:02:10.000Z"),
    evidenceEvent("provider-model", 7, providerSessionModelSummary, [...common, "round_trip:EXTRA_HIGH_PRO_EXTRA_HIGH", "extra_high_label:Extra High", "pro_label:Pro", "assistant_content_observed:false"], "2026-09-02T00:02:20.000Z"),
    evidenceEvent("provider-mcp", 8, providerSessionMcpSummary, [...common, "tool:get_supervisory_request_binding", "status:OK"], "2026-09-02T00:03:10.000Z"),
  ];
}

function semanticStageEvents(): StoredEvent[] {
  return [
    livenessEvent("reader-live", 11, "EXTRA_HIGH_READER", "STAGE_COMPLETE", "2026-09-02T00:05:00.000Z"),
    livenessEvent("pro-live", 13, "PRO_REASONER", "STAGE_COMPLETE", "2026-09-02T00:07:00.000Z"),
  ];
}

function boundEvents(): StoredEvent[] {
  return [
    ...pendingEvents(),
    ...capabilityEvents(),
    ...providerSessionEvents(),
    transportStage("preload", 9, "MCP_BINDING_PRELOAD", "Extra High", "2026-09-02T00:03:30.000Z"),
    transportStage("reader", 10, "EXTRA_HIGH_READER", "Extra High", "2026-09-02T00:04:30.000Z"),
    livenessEvent("reader-live", 11, "EXTRA_HIGH_READER", "STAGE_COMPLETE", "2026-09-02T00:05:00.000Z"),
    transportStage("pro", 12, "PRO_REASONER", "Pro", "2026-09-02T00:06:00.000Z"),
    livenessEvent("pro-live", 13, "PRO_REASONER", "STAGE_COMPLETE", "2026-09-02T00:07:00.000Z"),
    transportStage("writer", 14, "EXTRA_HIGH_WRITER", "Extra High", "2026-09-02T00:08:00.000Z"),
  ];
}

function transportStage(id: string, sequence: number, step: string, model: string, occurredAt: string): StoredEvent {
  return evidenceEvent(id, sequence, relayStageSummary, [
    "request:decision-request-1", `supervisor:${supervisorId}`, `provider_session:${providerSessionId}`, `conversation_url:https://chatgpt.com/c/current-session`, `step:${step}`, `model_ui_label:${model}`, `prompt_sha256:${"c".repeat(64)}`,
    "generation_state:COMPLETE", `app_selection_attempted:${step === "MCP_BINDING_PRELOAD"}`, `observed_at:${occurredAt}`, "assistant_content_observed:false", "backend_model_identity_claimed:false", "semantic_authority:false",
  ], occurredAt);
}

function livenessEvent(id: string, sequence: number, stage: string, status: string, occurredAt: string): StoredEvent {
  return evidenceEvent(id, sequence, stageLivenessSummary, [
    "request:decision-request-1", `request_nonce_sha256:${sha256("nonce-1")}`, `supervisor:${supervisorId}`, `provider_session:${providerSessionId}`, `stage:${stage}`, `status:${status}`,
    `github_comment:https://github.com/${policy().repository}/issues/${policy().stageIssueNumber}#issuecomment-${sequence}`, "semantic_authority:false",
  ], occurredAt);
}

function evidenceEvent(id: string, sequence: number, summary: string, refs: string[], occurredAt = "2026-09-02T00:02:00.000Z"): StoredEvent {
  return storedEvent({
    type: "evidence_receipt_recorded", worker: "mission-control-live-slice", receipt_id: id, producer_id: "collector:test", producer_role: "COLLECTOR",
    evidence_class: "ARTIFACT", independence: "SAME_PROVENANCE", freshness: "CURRENT", exact_candidate_sha256: null, summary, refs, verified: true, changed_path_manifest: null,
  }, `event-${id}`, sequence, occurredAt);
}

function candidate(): GitHubDecisionCandidate {
  return {
    repository: policy().repository, issueNumber: policy().decisionIssueNumber, commentId: 9001,
    immutableUrl: `https://github.com/${policy().repository}/issues/${policy().decisionIssueNumber}#issuecomment-9001`,
    createdAt: "2026-09-02T00:15:00.000Z", authorLogin: "u-dont-existDOTcom", deliveryId: "delivery-1", body: decisionBody(), ingestionMethod: "GITHUB_WEBHOOK",
  };
}

function capabilityCandidate(body: string): GitHubDecisionCandidate {
  return {
    repository: policy().repository, issueNumber: policy().capabilityIssueNumber, commentId: 9100,
    immutableUrl: `https://github.com/${policy().repository}/issues/${policy().capabilityIssueNumber}#issuecomment-9100`,
    createdAt: "2026-09-02T00:01:30.000Z", authorLogin: "u-dont-existDOTcom", deliveryId: "delivery-cap", body, ingestionMethod: "GITHUB_WEBHOOK",
  };
}

function stageCandidate(body: string): GitHubDecisionCandidate {
  return {
    repository: policy().repository, issueNumber: policy().stageIssueNumber, commentId: 9200,
    immutableUrl: `https://github.com/${policy().repository}/issues/${policy().stageIssueNumber}#issuecomment-9200`,
    createdAt: "2026-09-02T00:03:30.000Z", authorLogin: "u-dont-existDOTcom", deliveryId: "delivery-stage", body, ingestionMethod: "GITHUB_WEBHOOK",
  };
}

function decisionBody() { return `${canonicalDecisionCommentPrefix}${JSON.stringify(decisionEnvelope())}`; }
function capabilityReceiptBody(mcNonce: string, githubNonce: string) {
  return `${capabilityReceiptCommentPrefix}${JSON.stringify({ schema_version: 1, challenge_id: "challenge-spec", chat_id: bootstrapChatId, mc_nonce: mcNonce, github_nonce: githubNonce, capabilities: ["MISSION_CONTROL_READ", "GITHUB_READ", "GITHUB_WRITE"] })}`;
}
function stageReceiptBody(stage: "EXTRA_HIGH_READER" | "PRO_REASONER", status: "STAGE_COMPLETE" | "CONTINUE_REQUIRED", nonce = "nonce-1", sessionId = providerSessionId) {
  return `${stageReceiptCommentPrefix}${JSON.stringify({ schema_version: 2, request_id: "decision-request-1", request_nonce: nonce, supervisor_id: supervisorId, provider_session_id: sessionId, stage, status })}`;
}
function decisionEnvelope(): CanonicalDecisionEnvelope {
  return {
    schema_version: 2, envelope_kind: "MISSION_CONTROL_CANONICAL_DECISION", request_id: "decision-request-1", supervisor_id: supervisorId, provider_session_id: providerSessionId, nonce: "nonce-1",
    evidence_capsule: { id: "capsule-1", sha256: evidenceSha }, owner_outcome: { id: "owner-outcome-1", epoch: 7, sha256: outcomeSha }, reasoning_lane: "PRO_ESCALATED",
    decision_block: { decision_id: "decision-1", exact_text: decisionText, sha256: sha256(decisionText) },
    pro_decision_block: { used: true, model_mode: "PRO", exact_text: decisionText, sha256: sha256(decisionText) },
    writer_contract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretation_allowed: false },
  };
}
function webhookPayload(body: string, issueNumber = policy().decisionIssueNumber) {
  return { action: "created", repository: { full_name: policy().repository }, issue: { number: issueNumber }, comment: { id: 9001, html_url: `https://github.com/${policy().repository}/issues/${issueNumber}#issuecomment-9001`, created_at: "2026-09-02T00:01:30.000Z", body, user: { login: "u-dont-existDOTcom" } } };
}

function fakeStore(initial: StoredEvent[]) {
  const events = initial.map((event) => structuredClone(event));
  let sequence = Math.max(0, ...events.map((event) => event.sequence));
  return {
    allEvents: () => events,
    append: (input: unknown) => {
      const envelope = input as { event_id: string; mission_id: string; occurred_at: string; data: StoredEvent["data"] };
      const existing = events.find((event) => event.eventId === envelope.event_id);
      if (existing) return existing;
      const stored = storedEvent(envelope.data, envelope.event_id, ++sequence, envelope.occurred_at);
      events.push(stored);
      return stored;
    },
  } as unknown as EventStore;
}

function storedEvent(data: StoredEvent["data"], eventId: string, sequence: number, occurredAt: string): StoredEvent {
  return { id: sequence, sequence, eventId, schemaVersion: 2, missionId: "mission-control-live", worker: data.worker, type: data.type, occurredAt, receivedAt: occurredAt, previousHash: null, eventHash: "e".repeat(64), producerId: "test", producerKind: "COLLECTOR", data };
}
