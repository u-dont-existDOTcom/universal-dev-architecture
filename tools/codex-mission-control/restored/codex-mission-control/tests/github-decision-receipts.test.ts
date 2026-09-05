import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { canonicalJson, sha256 } from "../lib/canonical";
import {
  bindingCapsuleSummary,
  bindingEnvelopeSummary,
  buildGitHubDecisionReceiptEnvelope,
  canonicalDecisionCommentPrefix,
  capabilityChallengeSummary,
  capabilityReceiptCommentPrefix,
  capabilityVerifiedSummary,
  durableStageReceiptAttestationSummary,
  splitDecisionSessionAttestationSummary,
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
  stageReceiptCommentPrefix,
  stagedSupervisoryCycleRoutePrefix as supervisoryCycleRoutePrefix,
  supervisoryCycleRoutePrefix as directSupervisoryCycleRoutePrefix,
  validateConfiguredDecisionLocation,
  verifyGitHubWebhookSignature,
  type GitHubDecisionCandidate,
  type GitHubReceiptPolicy,
} from "../lib/github-decision-receipts";
import type { BindingCapsule, CanonicalDecisionEnvelope, StoredEvent } from "../lib/schema";
import type { EventStore } from "../lib/store";

const outcomeSha = "a".repeat(64);
const evidenceSha = "b".repeat(64);
const decisionText = "Use the bounded implementation and preserve the stated stop boundary.";
const readerText = "Evidence capsule capsule-1 was read from the configured GitHub sources.";
const supervisorId = "spec";
const bootstrapChatId = "spec-bootstrap";
const bindingSessionId = "provider-session:binding";
const readerSessionId = "provider-session:reader";
const proSessionId = "provider-session:pro";
const writerSessionId = "provider-session:writer";
const directDecisionSessionId = "provider-session:direct-decision";
const directProSessionId = "provider-session:direct-pro-decision";
const directSessionId = "provider-session:direct";
const bindingReceiptId = "binding-receipt-1";

test("GitHub webhook authentication and issue-comment normalization fail closed", () => {
  const secret = "s".repeat(32);
  const raw = JSON.stringify(webhookPayload(decisionBody()));
  const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  assert.equal(verifyGitHubWebhookSignature(secret, raw, signature), true);
  assert.equal(verifyGitHubWebhookSignature(secret, `${raw}x`, signature), false);
  const normalized = githubDecisionCandidateFromWebhook(JSON.parse(raw), "delivery-1");
  assert.equal(normalized.repository, policy().repository);
  assert.equal(normalized.issueNumber, policy().decisionIssueNumber);
  assert.equal(normalized.authorLogin, "u-dont-existDOTcom");
});

test("central policy rejects worker-selected repository/issue and unauthorized writer", () => {
  const p = policy();
  assert.doesNotThrow(() => validateConfiguredDecisionLocation(p.repository, p.decisionIssueNumber, p));
  assert.throws(() => validateConfiguredDecisionLocation(p.repository, 999, p), /centrally configured/);
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(escalatedEvents(), { ...candidate(), repository: "evil/repo" }, p), /GitHub repository|configured/);
  assert.throws(() => ingestGitHubSupervisionCandidate(fakeStore(escalatedEvents()), { ...candidate(), authorLogin: "other-user" }, p), /not authorized/);
});

test("capability challenge exposes MC nonce, GitHub nonce hash/location, and stage target", () => {
  const p = policy();
  const appended = ensureConfiguredCapabilityChallenges(fakeStore([]), p, "2026-09-02T00:00:00.000Z");
  assert.equal(appended.length, 1);
  const receipt = appended[0];
  assert.equal(receipt.data.type, "evidence_receipt_recorded");
  if (receipt.data.type !== "evidence_receipt_recorded") return;
  assert.equal(receipt.data.summary, capabilityChallengeSummary);
  assert.ok(receipt.data.refs.includes("mc_nonce:mc-nonce"));
  assert.ok(receipt.data.refs.includes(`github_nonce_sha256:${sha256("github-only-nonce")}`));
  assert.equal(receipt.data.refs.includes("github_nonce:github-only-nonce"), false);
  assert.ok(receipt.data.refs.includes(`stage_receipt_target:https://github.com/${p.repository}/issues/${p.stageIssueNumber}`));
});

test("capability receipt proves MC read plus GitHub read/write only with both nonces", () => {
  const p = policy();
  const store = fakeStore([]);
  ensureConfiguredCapabilityChallenges(store, p, "2026-09-02T00:00:00.000Z");
  const events = ingestGitHubSupervisionCandidate(store, capabilityCandidate(capabilityReceiptBody("mc-nonce", "github-only-nonce")), p, "2026-09-02T00:02:00.000Z");
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

test("route-v3 reader admits STARTED < comment < COMPLETE < ingestedAt for one exact first-message session", () => {
  const p = policy();
  const store = fakeStore([
    ...pendingEvents(), ...capabilityEvents(), ...bindingEvents(),
    ...semanticSessionEvents(readerSessionId, "EXTRA_HIGH_READER", "Extra High", 20, "2026-09-02T00:04:00.000Z", "2026-09-02T00:05:30.000Z"),
  ]);
  const appended = ingestGitHubSupervisionCandidate(store, stageCandidate(stageReceiptBody("EXTRA_HIGH_READER", readerSessionId)), p, "2026-09-02T00:05:40.000Z");
  assert.equal(appended.length, 1);
  const event = appended[0];
  assert.equal(event.data.type, "evidence_receipt_recorded");
  if (event.data.type !== "evidence_receipt_recorded") return;
  assert.equal(event.data.summary, stageLivenessSummary);
  assert.ok(event.data.refs.includes(`binding_provider_session:${bindingSessionId}`));
  assert.ok(event.data.refs.includes(`stage_provider_session:${readerSessionId}`));
  assert.ok(event.data.refs.includes("stage:EXTRA_HIGH_READER"));
  assert.ok(event.data.refs.includes("evidence_reading_capsule_sha256:" + sha256(readerText)));

  const followUpEvents = [
    ...pendingEvents(), ...capabilityEvents(), ...bindingEvents(),
    ...semanticSessionEvents(readerSessionId, "EXTRA_HIGH_READER", "Extra High", 20, "2026-09-02T00:04:00.000Z", "2026-09-02T00:05:30.000Z"),
  ].map((item) => structuredClone(item));
  const transport = followUpEvents.find((item) => item.data.type === "evidence_receipt_recorded" && item.data.summary === relayStageSummary && item.data.refs.includes(`provider_session:${readerSessionId}`));
  assert.ok(transport && transport.data.type === "evidence_receipt_recorded");
  if (transport?.data.type === "evidence_receipt_recorded") {
    transport.data.refs = transport.data.refs.filter((ref) => ref !== "message_ordinal:1").concat("message_ordinal:2");
  }
  assert.throws(() => ingestGitHubSupervisionCandidate(fakeStore(followUpEvents), stageCandidate(stageReceiptBody("EXTRA_HIGH_READER", readerSessionId)), p), /first-message GitHub transport/);
});

test("prompt-forged and stale binding capsules are rejected", () => {
  const base = [...pendingEvents(), ...capabilityEvents(), ...bindingEvents(), ...semanticSessionEvents(readerSessionId, "EXTRA_HIGH_READER", "Extra High", 20, "2026-09-02T00:04:00.000Z", "2026-09-02T00:05:30.000Z")];
  const forged = structuredClone(bindingCapsule());
  forged.request_nonce = "forged-nonce";
  assert.throws(
    () => ingestGitHubSupervisionCandidate(fakeStore(base), stageCandidate(stageReceiptBody("EXTRA_HIGH_READER", readerSessionId, forged)), policy()),
    /exactly match|nonce binding/,
  );

  const stale = structuredClone(bindingCapsule());
  stale.binding_provider_session_id = "provider-session:old";
  assert.throws(
    () => ingestGitHubSupervisionCandidate(fakeStore(base), stageCandidate(stageReceiptBody("EXTRA_HIGH_READER", readerSessionId, stale)), policy()),
    /exactly match|Stage-1/,
  );
});

test("route-v3 compatibility preserves the no-reuse gate across durable reader and Pro receipts", () => {
  const events = [
    ...pendingEvents(), ...capabilityEvents(), ...bindingEvents(),
    ...semanticSessionEvents(readerSessionId, "EXTRA_HIGH_READER", "Extra High", 20, "2026-09-02T00:04:00.000Z", "2026-09-02T00:05:30.000Z"),
    stageCompletion("reader-receipt", 23, "EXTRA_HIGH_READER", readerSessionId, "2026-09-02T00:05:00.000Z", "2026-09-02T00:05:40.000Z"),
    ...semanticSessionEvents(readerSessionId, "PRO_REASONER", "Pro", 24, "2026-09-02T00:06:00.000Z", "2026-09-02T00:07:30.000Z"),
  ];
  assert.throws(
    () => ingestGitHubSupervisionCandidate(
      fakeStore(events),
      { ...stageCandidate(stageReceiptBody("PRO_DECISION_STAGE", readerSessionId)), createdAt: "2026-09-02T00:07:00.000Z" },
      policy(),
    ),
    /already used by another durable stage receipt/,
  );
});

test("route-v3 compatibility preserves ordered semantic stages under corrected GitHub transport timing", () => {
  const p = policy();
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(pendingEvents(), candidate(), p), /Stage-1 MCP receipt/);
  assert.throws(() => buildGitHubDecisionReceiptEnvelope([
    ...pendingEvents(), ...capabilityEvents(), ...bindingEvents(),
    ...semanticSessionEvents(writerSessionId, "EXTRA_HIGH_WRITER", "Extra High", 20, "2026-09-02T00:08:00.000Z", "2026-09-02T00:15:30.000Z"),
  ], candidate(), p), /semantic stage completion EXTRA_HIGH_READER/);

  const complete = escalatedEvents();
  const result = buildGitHubDecisionReceiptEnvelope(complete, candidate(), p);
  assert.equal(result.data.type, "github_decision_receipt_ingested");
  if (result.data.type !== "github_decision_receipt_ingested") return;
  assert.equal(result.data.binding_provider_session_id, bindingSessionId);
  assert.equal(result.data.stage_provider_session_id, writerSessionId);
  assert.equal(result.data.staged_provenance, "DURABLE_STAGE_RECEIPT_ATTESTED");
  assert.equal(result.data.pro_decision_block.used, true);

  const wrongOrder = escalatedEvents();
  const readerRelay = wrongOrder.find((item) => item.data.type === "evidence_receipt_recorded" && item.data.summary === relayStageSummary && item.data.refs.includes("step:EXTRA_HIGH_READER"));
  const proRelay = wrongOrder.find((item) => item.data.type === "evidence_receipt_recorded" && item.data.summary === relayStageSummary && item.data.refs.includes("step:PRO_REASONER"));
  assert.ok(readerRelay && proRelay);
  if (readerRelay && proRelay) [readerRelay.sequence, proRelay.sequence] = [proRelay.sequence, readerRelay.sequence];
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(wrongOrder, candidate(), p), /ordered relay stage|transport window/);
});

test("route-v3 compatibility preserves the durable Pro digest and final-writer authority gate", () => {
  const mismatched = decisionEnvelope();
  mismatched.decision_block = { decision_id: "decision-2", exact_text: "A different decision.", sha256: sha256("A different decision.") };
  mismatched.pro_decision_block = { used: true, model_mode: "PRO", exact_text: "A different decision.", sha256: sha256("A different decision.") };
  assert.throws(
    () => buildGitHubDecisionReceiptEnvelope(escalatedEvents(), { ...candidate(), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(mismatched)}` }, policy()),
    /durable Pro decision-stage digest/,
  );

  const store = fakeStore(escalatedEvents());
  const appended = ingestGitHubSupervisionCandidate(store, candidate(), policy(), "2026-09-02T00:16:00.000Z");
  assert.equal(appended.length, 2);
  const attestation = appended[1];
  assert.equal(attestation.data.type, "evidence_receipt_recorded");
  if (attestation.data.type !== "evidence_receipt_recorded") return;
  assert.equal(attestation.data.summary, durableStageReceiptAttestationSummary);
  assert.ok(attestation.data.refs.includes("provenance:DURABLE_STAGE_RECEIPT_ATTESTED"));
  assert.ok(attestation.data.refs.includes(`binding_provider_session:${bindingSessionId}`));
  assert.ok(attestation.data.refs.includes(`stage_provider_session:${writerSessionId}`));
});

test("ordinary decision needs Stage-1 binding plus a distinct fresh Stage-2 transport receipt", () => {
  const events = ordinaryEvents();
  const decision = ordinaryDecisionEnvelope();
  const result = buildGitHubDecisionReceiptEnvelope(events, { ...candidate(), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(decision)}` }, policy());
  assert.equal(result.data.type, "github_decision_receipt_ingested");

  const missingBinding = events.filter((event) => !(event.data.type === "evidence_receipt_recorded" && event.data.summary === providerSessionMcpSummary));
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(missingBinding, { ...candidate(), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(decision)}` }, policy()), /Stage-1 MCP receipt/);

  const sameSession = { ...decision, stage_provider_session_id: bindingSessionId };
  assert.throws(() => parseCanonicalDecisionComment(`${canonicalDecisionCommentPrefix}${JSON.stringify(sameSession)}`), /distinct/);
});

test("old same-chat receipt schemas cannot satisfy the split-stage contract", () => {
  const legacyDecision = { ...decisionEnvelope(), schema_version: 1 } as Record<string, unknown>;
  delete legacyDecision.supervisor_id;
  delete legacyDecision.binding_provider_session_id;
  delete legacyDecision.stage_provider_session_id;
  delete legacyDecision.binding_capsule;
  delete legacyDecision.binding_capsule_sha256;
  delete legacyDecision.staged_provenance;
  const parsed = parseCanonicalDecisionComment(`${canonicalDecisionCommentPrefix}${JSON.stringify(legacyDecision)}`);
  assert.equal(parsed.schema_version, 1);
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(escalatedEvents(), { ...candidate(), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(legacyDecision)}` }, policy()), /schema_version 2/);
  assert.throws(() => parseStageReceiptComment(`${stageReceiptCommentPrefix}${JSON.stringify({ schema_version: 1, request_id: "legacy", request_nonce: "nonce", chat_id: "chat", stage: "PRO_REASONER", status: "STAGE_COMPLETE" })}`), /schema_version must be 2/);
});

test("route-v4 ordinary admits the exact live 13.481-second comment-before-COMPLETE shape", () => {
  const decision = directDecisionEnvelope("EXTRA_HIGH_DIRECT");
  const receipt = candidate();
  assert.equal(Date.parse("2026-09-02T00:15:13.481Z") - Date.parse(receipt.createdAt), 13_481);
  const result = buildGitHubDecisionReceiptEnvelope(
    directDecisionEvents("EXTRA_HIGH_DIRECT"),
    { ...receipt, body: `${canonicalDecisionCommentPrefix}${JSON.stringify(decision)}` },
    policy(),
    "2026-09-02T00:15:20.000Z",
  );
  assert.equal(result.data.type, "github_decision_receipt_ingested");
  if (result.data.type !== "github_decision_receipt_ingested") return;
  assert.equal(result.data.binding_provider_session_id, bindingSessionId);
  assert.equal(result.data.decision_provider_session_id, directDecisionSessionId);
  assert.equal(result.data.decision_session_provenance, "VISIBLE_EXTRA_HIGH_SESSION_GITHUB_ATTESTED");
  assert.equal(result.data.stage_provider_session_id, null);

  const sameSession = { ...decision, decision_provider_session_id: bindingSessionId };
  assert.throws(
    () => parseCanonicalDecisionComment(`${canonicalDecisionCommentPrefix}${JSON.stringify(sameSession)}`),
    /distinct/,
  );
});

test("route-v4 Pro uses the same first-message transport window without issue 61 stages", () => {
  const decision = directDecisionEnvelope("PRO_ESCALATED");
  const events = directDecisionEvents("PRO_ESCALATED");
  assert.equal(events.some((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === stageLivenessSummary), false);
  const store = fakeStore(events);
  const appended = ingestGitHubSupervisionCandidate(
    store,
    { ...candidate(), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(decision)}` },
    policy(),
    "2026-09-02T00:15:20.000Z",
  );
  assert.equal(appended.length, 2);
  const attestation = appended[1];
  assert.equal(attestation.data.type, "evidence_receipt_recorded");
  if (attestation.data.type !== "evidence_receipt_recorded") return;
  assert.equal(attestation.data.summary, splitDecisionSessionAttestationSummary);
  assert.ok(attestation.data.refs.includes(`decision_provider_session:${directProSessionId}`));
  assert.ok(attestation.data.refs.includes("provenance:VISIBLE_PRO_SESSION_GITHUB_ATTESTED"));
  assert.ok(attestation.data.refs.includes("backend_model_identity_claimed:false"));
});

test("new direct binding envelope rejects forged, stale, cross-supervisor, and cross-session values", () => {
  const base = directDecisionEvents("PRO_ESCALATED");
  const mutations: Array<[string, (decision: ReturnType<typeof directDecisionEnvelope>) => void]> = [
    ["cross-request", (decision) => { decision.binding_envelope.request_id = "another-request"; }],
    ["cross-supervisor", (decision) => { decision.binding_envelope.supervisor_id = "another-supervisor"; }],
    ["cross-session", (decision) => { decision.binding_envelope.binding_provider_session_id = "provider-session:other"; }],
    ["stale", (decision) => { decision.binding_envelope.expires_at = "2026-09-01T00:00:00.000Z"; }],
  ];
  for (const [label, mutate] of mutations) {
    const decision = directDecisionEnvelope("PRO_ESCALATED");
    mutate(decision);
    decision.binding_envelope_sha256 = sha256(canonicalJson(decision.binding_envelope));
    assert.throws(
      () => buildGitHubDecisionReceiptEnvelope(base, { ...candidate(), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(decision)}` }, policy()),
      /binding envelope|binding capsule|exactly match|Stage-1/,
      label,
    );
  }
});

test("new direct admission requires exact visible lane proof and rejects relabeled old provenance", () => {
  const decision = directDecisionEnvelope("PRO_ESCALATED");
  const wrongModel = directDecisionEvents("PRO_ESCALATED").map((event) => structuredClone(event));
  for (const event of wrongModel) {
    if (event.data.type === "evidence_receipt_recorded" && event.data.refs.includes("step:PRO_DECISION")) {
      event.data.refs = event.data.refs.map((ref) => ref === "model_ui_label:Pro" ? "model_ui_label:Extra High" : ref);
    }
  }
  assert.throws(
    () => buildGitHubDecisionReceiptEnvelope(wrongModel, { ...candidate(), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(decision)}` }, policy()),
    /visible|direct relay|transport receipt/,
  );

  const relabeled = { ...decision, decision_session_provenance: "DURABLE_STAGE_RECEIPT_ATTESTED" } as Record<string, unknown>;
  assert.throws(
    () => parseCanonicalDecisionComment(`${canonicalDecisionCommentPrefix}${JSON.stringify(relabeled)}`),
    /decision_session_provenance|Invalid input/,
  );

  assert.throws(
    () => buildGitHubDecisionReceiptEnvelope(directDecisionEvents("PRO_ESCALATED"), candidate(), policy()),
    /schema_version 3/,
  );
});

test("early webhook fails closed, then later reconciliation admits the unchanged comment after COMPLETE", () => {
  const decision = directDecisionEnvelope("EXTRA_HIGH_DIRECT");
  const receipt = { ...candidate(), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(decision)}` };
  const all = directDecisionEvents("EXTRA_HIGH_DIRECT");
  const completed = all.filter((event) => event.data.type === "evidence_receipt_recorded"
    && (event.data.refs.includes("generation_state:COMPLETE") || event.data.refs.includes("lifecycle_status:COMPLETE"))
    && event.data.refs.includes(`decision_provider_session:${directDecisionSessionId}`));
  const store = fakeStore(all.filter((event) => !completed.includes(event)));

  assert.throws(
    () => ingestGitHubSupervisionCandidate(store, receipt, policy(), "2026-09-02T00:15:05.000Z"),
    /not complete|transport receipt/,
  );
  for (const event of completed) store.append(appendEnvelope(event), event.receivedAt);
  const admitted = ingestGitHubSupervisionCandidate(store, receipt, policy(), "2026-09-02T00:15:20.000Z");
  assert.equal(admitted[0]?.data.type, "github_decision_receipt_ingested");
  if (admitted[0]?.data.type === "github_decision_receipt_ingested") {
    assert.equal(admitted[0].data.github_receipt.comment_id, receipt.commentId);
    assert.equal(admitted[0].data.github_receipt.github_created_at, receipt.createdAt);
  }
});

test("GitHub comment before STARTED fails the exact generation window", () => {
  const events = directDecisionEvents("EXTRA_HIGH_DIRECT");
  setRelayOccurredAt(events, "EXTRA_HIGH_DECISION", "STARTED", "2026-09-02T00:15:01.000Z");
  assert.throws(
    () => buildGitHubDecisionReceiptEnvelope(events, directCandidate("EXTRA_HIGH_DIRECT"), policy(), "2026-09-02T00:15:20.000Z"),
    /transport receipt|transport window/,
  );
});

test("GitHub comment after COMPLETE fails the exact generation window", () => {
  const events = directDecisionEvents("EXTRA_HIGH_DIRECT");
  setRelayOccurredAt(events, "EXTRA_HIGH_DECISION", "COMPLETE", "2026-09-02T00:14:59.999Z");
  const session = events.find((event) => event.data.type === "evidence_receipt_recorded"
    && event.data.refs.includes(`decision_provider_session:${directDecisionSessionId}`)
    && event.data.refs.includes("lifecycle_status:COMPLETE"));
  assert.ok(session);
  if (session) session.occurredAt = "2026-09-02T00:14:59.999Z";
  assert.throws(
    () => buildGitHubDecisionReceiptEnvelope(events, directCandidate("EXTRA_HIGH_DIRECT"), policy(), "2026-09-02T00:15:20.000Z"),
    /transport receipt|transport window/,
  );
});

test("COMPLETE after ingestedAt fails that admission attempt", () => {
  assert.throws(
    () => buildGitHubDecisionReceiptEnvelope(
      directDecisionEvents("EXTRA_HIGH_DIRECT"),
      directCandidate("EXTRA_HIGH_DIRECT"),
      policy(),
      "2026-09-02T00:15:10.000Z",
    ),
    /not complete|transport receipt|transport window/,
  );
});

test("STARTED and COMPLETE must carry the same exact prompt hash", () => {
  const events = directDecisionEvents("EXTRA_HIGH_DIRECT");
  const complete = relayReceipt(events, "EXTRA_HIGH_DECISION", "COMPLETE");
  replaceRef(complete, "prompt_sha256:", "d".repeat(64));
  assert.throws(
    () => buildGitHubDecisionReceiptEnvelope(events, directCandidate("EXTRA_HIGH_DIRECT"), policy(), "2026-09-02T00:15:20.000Z"),
    /transport receipt|transport window/,
  );
});

test("STARTED and COMPLETE must match the exact session, step, model, and app contract", () => {
  const mutations: Array<readonly [string, (event: StoredEvent) => void]> = [
    ["session", (event) => replaceRef(event, "decision_provider_session:", "provider-session:other")],
    ["step", (event) => replaceRef(event, "step:", "EXTRA_HIGH_WRITER")],
    ["model", (event) => replaceRef(event, "model_ui_label:", "6 Pro")],
    ["app", (event) => {
      if (event.data.type !== "evidence_receipt_recorded") return;
      event.data.refs = event.data.refs
        .filter((ref) => !ref.startsWith("app_selection_attempted:") && !ref.startsWith("app_selection_status:") && !ref.startsWith("selected_app:"))
        .concat("app_selection_attempted:true", "app_selection_status:MESSAGE_APPS_SELECTED", "selected_app:GitHub");
    }],
  ];
  for (const [label, mutate] of mutations) {
    const events = directDecisionEvents("EXTRA_HIGH_DIRECT");
    mutate(relayReceipt(events, "EXTRA_HIGH_DECISION", "COMPLETE"));
    assert.throws(
      () => buildGitHubDecisionReceiptEnvelope(events, directCandidate("EXTRA_HIGH_DIRECT"), policy(), "2026-09-02T00:15:20.000Z"),
      /transport receipt|transport window/,
      label,
    );
  }
});

test("binding preload COMPLETE must still predate the GitHub decision comment", () => {
  const events = directDecisionEvents("EXTRA_HIGH_DIRECT");
  setRelayOccurredAt(events, "MCP_BINDING_PRELOAD", "COMPLETE", "2026-09-02T00:15:01.000Z");
  assert.throws(
    () => buildGitHubDecisionReceiptEnvelope(events, directCandidate("EXTRA_HIGH_DIRECT"), policy(), "2026-09-02T00:15:20.000Z"),
    /Stage-1|preload transport/,
  );
});

test("later ingestedAt does not rescue stale request, owner, capability, or binding evidence", () => {
  const lateIngestion = "2026-09-03T00:01:00.000Z";

  const staleRequestEvents = directDecisionEvents("EXTRA_HIGH_DIRECT");
  setRelayOccurredAt(staleRequestEvents, "EXTRA_HIGH_DECISION", "STARTED", "2026-09-02T23:59:30.000Z");
  setRelayOccurredAt(staleRequestEvents, "EXTRA_HIGH_DECISION", "COMPLETE", "2026-09-03T00:00:10.000Z");
  const staleRequestSession = staleRequestEvents.find((event) => event.data.type === "evidence_receipt_recorded"
    && event.data.refs.includes(`decision_provider_session:${directDecisionSessionId}`)
    && event.data.refs.includes("lifecycle_status:COMPLETE"));
  assert.ok(staleRequestSession);
  if (staleRequestSession) staleRequestSession.occurredAt = "2026-09-03T00:00:10.000Z";
  assert.throws(
    () => buildGitHubDecisionReceiptEnvelope(
      staleRequestEvents,
      { ...directCandidate("EXTRA_HIGH_DIRECT"), createdAt: "2026-09-03T00:00:01.000Z" },
      policy(),
      lateIngestion,
    ),
    /stale for the admitted request window/,
  );

  const staleOwnerEvents = directDecisionEvents("EXTRA_HIGH_DIRECT");
  const newerOwner = structuredClone(staleOwnerEvents[0]!);
  newerOwner.sequence = 100;
  newerOwner.eventId = "newer-owner-outcome";
  if (newerOwner.data.type === "owner_outcome_recorded") newerOwner.data.epoch = 8;
  staleOwnerEvents.push(newerOwner);
  assert.throws(
    () => buildGitHubDecisionReceiptEnvelope(staleOwnerEvents, directCandidate("EXTRA_HIGH_DIRECT"), policy(), lateIngestion),
    /stale against the current owner-outcome epoch/,
  );

  const staleCapabilityEvents = directDecisionEvents("EXTRA_HIGH_DIRECT");
  for (const event of staleCapabilityEvents) {
    if (event.data.type === "evidence_receipt_recorded"
      && (event.data.summary === capabilityVerifiedSummary || event.data.summary === modeCapabilityVerifiedSummary)) {
      replaceRef(event, "expires_at:", "2026-09-02T00:14:59.999Z");
    }
  }
  assert.throws(
    () => buildGitHubDecisionReceiptEnvelope(staleCapabilityEvents, directCandidate("EXTRA_HIGH_DIRECT"), policy(), lateIngestion),
    /lacks a current/,
  );

  const staleBindingEvents = directDecisionEvents("EXTRA_HIGH_DIRECT");
  const mcp = staleBindingEvents.find((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === providerSessionMcpSummary);
  assert.ok(mcp);
  if (mcp) mcp.occurredAt = "2026-09-02T00:15:01.000Z";
  assert.throws(
    () => buildGitHubDecisionReceiptEnvelope(staleBindingEvents, directCandidate("EXTRA_HIGH_DIRECT"), policy(), lateIngestion),
    /Stage-1 MCP receipt/,
  );
});

test("public reconciliation polls all centrally configured buses without Authorization", async () => {
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
  assert.deepEqual(authorizationHeaders, [null, null, null]);
  assert.equal(result.some((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === capabilityVerifiedSummary), true);
});

function policy(): GitHubReceiptPolicy {
  return {
    repository: "u-dont-existDOTcom/universal-dev-architecture",
    decisionIssueNumber: 59,
    capabilityIssueNumber: 60,
    stageIssueNumber: 61,
    authorizedWriterLogins: ["u-dont-existDOTcom"],
    capabilityChallenges: [{
      challengeId: "challenge-spec", supervisorId, chatId: bootstrapChatId, worker: "mission-control-live-slice",
      mcNonce: "mc-nonce", githubNonce: "github-only-nonce", expiresAt: "2026-09-03T00:00:00.000Z",
      extraHighLabel: "Extra High", proLabel: "Pro",
    }],
  };
}

function bindingCapsule(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED" = "PRO_ESCALATED"): BindingCapsule {
  return {
    schema_version: 1,
    binding_capsule_id: `binding-capsule:${lane.toLowerCase()}`,
    request_id: "decision-request-1",
    request_nonce: "nonce-1",
    supervisor_id: supervisorId,
    binding_provider_session_id: bindingSessionId,
    binding_receipt_id: bindingReceiptId,
    worker_id: "mission-control-live-slice",
    reasoning_lane: lane,
    queued_at: "2026-09-02T00:01:00.000Z",
    expires_at: "2026-09-03T00:00:00.000Z",
    evidence_capsule: { id: "capsule-1", sha256: evidenceSha },
    owner_outcome: { id: "owner-outcome-1", epoch: 7, sha256: outcomeSha },
    receipt_targets: { repository: policy().repository, decision_issue_number: policy().decisionIssueNumber, stage_issue_number: policy().stageIssueNumber },
  };
}

function pendingEvents(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED" = "PRO_ESCALATED"): StoredEvent[] {
  const outcome = storedEvent({
    type: "owner_outcome_recorded", worker: "mission-control-live-slice", owner_request_id: "owner-request-1",
    owner_outcome_id: "owner-outcome-1", epoch: 7, source_receipt_id: "owner-source-1", owner_source_sha256: "d".repeat(64), owner_outcome_sha256: outcomeSha,
    verbatim_owner_request: ["Exact owner request"], normalized_result: "Exact result", current_gap: "Decision receipt pending", gap_status: "OPEN",
    required_outcomes: [{ id: "outcome-1", text: "Result", terminal_required: true, status: "UNMET", direct_evidence_receipt_ids: [] }], non_satisfying_proxies: [], supersedes: null, supersedes_outcome_sha256: null,
  } as StoredEvent["data"], "owner-outcome", 1, "2026-09-02T00:00:00.000Z");
  const packet = {
    schemaVersion: 3, packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE", requestId: "decision-request-1", destinationSupervisorId: supervisorId, nonce: "nonce-1", reasoningLane: lane,
    providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY", evidenceCapsule: { id: "capsule-1", sha256: evidenceSha }, ownerOutcome: { id: "owner-outcome-1", epoch: 7, sha256: outcomeSha },
    githubReceipt: { repository: policy().repository, issueNumber: policy().decisionIssueNumber, stageIssueNumber: policy().stageIssueNumber }, factualPacket: { taskId: "task-1" }, queuedAt: "2026-09-02T00:01:00.000Z", expiresAt: "2026-09-03T00:00:00.000Z",
  };
  return [outcome, storedEvent({
    type: "worker_message_recorded", worker: "mission-control-live-slice", message_id: "message-1", thread_id: "thread-1", message_kind: "QUESTION",
    body: `${supervisoryCycleRoutePrefix}${JSON.stringify(packet)}`, reply_to_message_id: null, direction_id: null,
  }, "route-event", 2, "2026-09-02T00:01:00.000Z")];
}

function capabilityEvents(): StoredEvent[] {
  return [
    evidenceEvent("challenge", 3, capabilityChallengeSummary, ["challenge:challenge-spec", `supervisor:${supervisorId}`, `chat:${bootstrapChatId}`, "mc_nonce:mc-nonce", `github_nonce_sha256:${sha256("github-only-nonce")}`, "expires_at:2026-09-03T00:00:00.000Z"]),
    evidenceEvent("tools", 4, capabilityVerifiedSummary, ["challenge:challenge-spec", `supervisor:${supervisorId}`, `chat:${bootstrapChatId}`, "capability:missionControlRead", "capability:githubRead", "capability:githubWrite", "expires_at:2026-09-03T00:00:00.000Z"]),
    evidenceEvent("mode", 5, modeCapabilityVerifiedSummary, [`chat:${bootstrapChatId}`, "capability:modeSwitching", "extra_high_label:Extra High", "pro_label:Pro", "expires_at:2026-09-03T00:00:00.000Z"]),
  ];
}

function bindingEvents(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED" = "PRO_ESCALATED"): StoredEvent[] {
  const capsule = bindingCapsule(lane);
  return [
    providerSessionEvent("binding-active", 6, bindingSessionId, "MC_BINDING_PRELOAD", "ACTIVE", "2026-09-02T00:02:00.000Z", bindingSessionId),
    evidenceEvent("binding-model", 7, providerSessionModelSummary, ["request:decision-request-1", `supervisor:${supervisorId}`, `provider_session:${bindingSessionId}`, "model_ui_label:Extra High", "assistant_content_observed:false"], "2026-09-02T00:02:05.000Z"),
    relayStage("preload", 8, bindingSessionId, "MCP_BINDING_PRELOAD", "Extra High", "Mission Control", "2026-09-02T00:02:10.000Z", bindingSessionId),
    evidenceEvent(bindingReceiptId, 9, providerSessionMcpSummary, ["request:decision-request-1", `supervisor:${supervisorId}`, `provider_session:${bindingSessionId}`, "tool:get_supervisory_request_binding", "status:OK"], "2026-09-02T00:02:20.000Z"),
    providerSessionEvent("binding-complete", 10, bindingSessionId, "MC_BINDING_PRELOAD", "COMPLETE", "2026-09-02T00:02:30.000Z", bindingSessionId),
    evidenceEvent("binding-capsule", 11, bindingCapsuleSummary, ["request:decision-request-1", `binding_provider_session:${bindingSessionId}`, `binding_receipt:${bindingReceiptId}`, `binding_capsule_id:${capsule.binding_capsule_id}`, `binding_capsule_sha256:${sha256(canonicalJson(capsule))}`], "2026-09-02T00:02:35.000Z"),
  ];
}

function semanticSessionEvents(sessionId: string, step: string, model: string, sequence: number, startedAt: string, completedAt: string): StoredEvent[] {
  return [
    relayStage(`${step}-relay-started`, sequence, sessionId, step, model, "GitHub", startedAt, bindingSessionId, "STARTED"),
    relayStage(`${step}-relay-complete`, sequence + 1, sessionId, step, model, "GitHub", completedAt, bindingSessionId, "COMPLETE"),
    providerSessionEvent(`${step}-complete`, sequence + 2, sessionId, step, "COMPLETE", completedAt),
  ];
}

function stageCompletion(id: string, sequence: number, stage: "EXTRA_HIGH_READER" | "PRO_DECISION_STAGE", sessionId: string, occurredAt: string, receivedAt = occurredAt): StoredEvent {
  const refs = [
    "request:decision-request-1", `request_nonce_sha256:${sha256("nonce-1")}`, `supervisor:${supervisorId}`,
    `binding_provider_session:${bindingSessionId}`, `stage_provider_session:${sessionId}`,
    `binding_capsule_id:${bindingCapsule().binding_capsule_id}`, `binding_capsule_sha256:${sha256(canonicalJson(bindingCapsule()))}`,
    `stage:${stage}`, "status:STAGE_COMPLETE", `github_comment:https://github.com/${policy().repository}/issues/${policy().stageIssueNumber}#issuecomment-${sequence}`,
  ];
  if (stage === "EXTRA_HIGH_READER") refs.push("evidence_reading_capsule:reader-capsule-1", `evidence_reading_capsule_sha256:${sha256(readerText)}`, "semantic_authority:false");
  else refs.push("pro_decision_id:decision-1", `pro_decision_sha256:${sha256(decisionText)}`, "semantic_authority:PRO");
  return evidenceEvent(id, sequence, stageLivenessSummary, refs, occurredAt, receivedAt);
}

function escalatedEvents(): StoredEvent[] {
  return [
    ...pendingEvents(), ...capabilityEvents(), ...bindingEvents(),
    ...semanticSessionEvents(readerSessionId, "EXTRA_HIGH_READER", "Extra High", 20, "2026-09-02T00:04:00.000Z", "2026-09-02T00:05:30.000Z"),
    stageCompletion("reader-receipt", 23, "EXTRA_HIGH_READER", readerSessionId, "2026-09-02T00:05:00.000Z", "2026-09-02T00:05:40.000Z"),
    ...semanticSessionEvents(proSessionId, "PRO_REASONER", "Pro", 24, "2026-09-02T00:06:00.000Z", "2026-09-02T00:07:30.000Z"),
    stageCompletion("pro-receipt", 27, "PRO_DECISION_STAGE", proSessionId, "2026-09-02T00:07:00.000Z", "2026-09-02T00:07:40.000Z"),
    ...semanticSessionEvents(writerSessionId, "EXTRA_HIGH_WRITER", "Extra High", 28, "2026-09-02T00:08:00.000Z", "2026-09-02T00:15:30.000Z"),
  ];
}

function ordinaryEvents(): StoredEvent[] {
  return [
    ...pendingEvents("EXTRA_HIGH_DIRECT"), ...capabilityEvents(), ...bindingEvents("EXTRA_HIGH_DIRECT"),
    ...semanticSessionEvents(directSessionId, "EXTRA_HIGH_DIRECT", "Extra High", 20, "2026-09-02T00:04:00.000Z", "2026-09-02T00:15:30.000Z"),
  ];
}

function directPendingEvents(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED"): StoredEvent[] {
  const events = pendingEvents(lane).map((event) => structuredClone(event));
  const route = events[1]!;
  if (route.data.type !== "worker_message_recorded") throw new Error("expected route event");
  const staged = JSON.parse(route.data.body.slice(supervisoryCycleRoutePrefix.length));
  staged.schemaVersion = 4;
  route.data.body = `${directSupervisoryCycleRoutePrefix}${JSON.stringify(staged)}`;
  return events;
}

function directDecisionEvents(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED"): StoredEvent[] {
  const decisionSession = lane === "PRO_ESCALATED" ? directProSessionId : directDecisionSessionId;
  const step = lane === "PRO_ESCALATED" ? "PRO_DECISION" : "EXTRA_HIGH_DECISION";
  const label = lane === "PRO_ESCALATED" ? "Pro" : "Extra High";
  return [
    ...directPendingEvents(lane),
    ...capabilityEvents(),
    ...directBindingEvents(lane),
    directRelayStage("direct-decision-relay-started", 20, decisionSession, step, label, "2026-09-02T00:14:00.000Z", "STARTED"),
    directRelayStage("direct-decision-relay-complete", 21, decisionSession, step, label, "2026-09-02T00:15:13.481Z", "COMPLETE"),
    directProviderSessionEvent("direct-decision-complete", 22, decisionSession, step, "2026-09-02T00:15:13.481Z"),
  ];
}

function directBindingEvents(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED"): StoredEvent[] {
  return bindingEvents(lane).map((event) => {
    const copy = structuredClone(event);
    if (copy.data.type !== "evidence_receipt_recorded" || copy.data.summary !== bindingCapsuleSummary) return copy;
    copy.data.summary = bindingEnvelopeSummary;
    copy.data.refs = copy.data.refs.map((ref) => ref.replace(/^binding_capsule_sha256:/, "binding_envelope_sha256:"));
    return copy;
  });
}

function directRelayStage(id: string, sequence: number, sessionId: string, step: string, model: string, occurredAt: string, generationState: "STARTED" | "COMPLETE"): StoredEvent {
  return evidenceEvent(id, sequence, relayStageSummary, [
    "request:decision-request-1", `supervisor:${supervisorId}`, `provider_session:${sessionId}`,
    `binding_provider_session:${bindingSessionId}`, `decision_provider_session:${sessionId}`,
    `conversation_url:https://chatgpt.com/c/${sessionId.replaceAll(":", "-")}`, `step:${step}`,
    `model_ui_label:${model}`, `prompt_sha256:${"c".repeat(64)}`, `generation_state:${generationState}`,
    "app_selection_attempted:false", "app_selection_status:APP_SELECTION_NOT_ATTEMPTED",
    "message_ordinal:1", "first_message:true", `observed_at:${occurredAt}`,
    "assistant_content_observed:false", "backend_model_identity_claimed:false", "semantic_authority:false",
  ], occurredAt);
}

function directProviderSessionEvent(id: string, sequence: number, sessionId: string, step: string, occurredAt: string): StoredEvent {
  return evidenceEvent(id, sequence, providerSessionSummary, [
    "request:decision-request-1", `supervisor:${supervisorId}`, `provider_session:${sessionId}`,
    `binding_provider_session:${bindingSessionId}`, `decision_provider_session:${sessionId}`,
    `session_role:${step}_SESSION`, `conversation_url:https://chatgpt.com/c/${sessionId.replaceAll(":", "-")}`,
    "url_binding_status:EXACT", "lifecycle_status:COMPLETE", "message_ordinal:1", "semantic_authority:false",
  ], occurredAt);
}

function relayStage(id: string, sequence: number, sessionId: string, step: string, model: string, app: string, occurredAt: string, bindingId = bindingSessionId, generationState: "STARTED" | "COMPLETE" = "COMPLETE"): StoredEvent {
  return evidenceEvent(id, sequence, relayStageSummary, [
    "request:decision-request-1", `supervisor:${supervisorId}`, `provider_session:${sessionId}`, `binding_provider_session:${bindingId}`,
    ...(sessionId === bindingId ? [] : [`stage_provider_session:${sessionId}`]),
    `conversation_url:https://chatgpt.com/c/${sessionId.replaceAll(":", "-")}`, `step:${step}`, `model_ui_label:${model}`,
    `prompt_sha256:${"c".repeat(64)}`, `generation_state:${generationState}`, "app_selection_attempted:true", "app_selection_status:MESSAGE_APPS_SELECTED", `selected_app:${app}`,
    "message_ordinal:1", "first_message:true", `observed_at:${occurredAt}`, "assistant_content_observed:false", "backend_model_identity_claimed:false", "semantic_authority:false",
  ], occurredAt);
}

function providerSessionEvent(id: string, sequence: number, sessionId: string, step: string, lifecycle: "ACTIVE" | "COMPLETE", occurredAt: string, bindingId = bindingSessionId): StoredEvent {
  const role = step === "MCP_BINDING_PRELOAD" || step === "MC_BINDING_PRELOAD" ? "MC_BINDING_PRELOAD_SESSION" : `${step}_SESSION`;
  return evidenceEvent(id, sequence, providerSessionSummary, [
    "request:decision-request-1", `supervisor:${supervisorId}`, `provider_session:${sessionId}`, `binding_provider_session:${bindingId}`,
    ...(sessionId === bindingId ? [] : [`stage_provider_session:${sessionId}`]),
    `session_role:${role}`, `conversation_url:https://chatgpt.com/c/${sessionId.replaceAll(":", "-")}`, "url_binding_status:EXACT", `lifecycle_status:${lifecycle}`, "message_ordinal:1", "semantic_authority:false",
  ], occurredAt);
}

function decisionEnvelope(): Extract<CanonicalDecisionEnvelope, { schema_version: 2 }> {
  const capsule = bindingCapsule();
  return {
    schema_version: 2, envelope_kind: "MISSION_CONTROL_CANONICAL_DECISION", request_id: "decision-request-1", supervisor_id: supervisorId,
    binding_provider_session_id: bindingSessionId, stage_provider_session_id: writerSessionId, binding_capsule: capsule,
    binding_capsule_sha256: sha256(canonicalJson(capsule)), staged_provenance: "DURABLE_STAGE_RECEIPT_ATTESTED", nonce: "nonce-1",
    evidence_capsule: { id: "capsule-1", sha256: evidenceSha }, owner_outcome: { id: "owner-outcome-1", epoch: 7, sha256: outcomeSha }, reasoning_lane: "PRO_ESCALATED",
    decision_block: { decision_id: "decision-1", exact_text: decisionText, sha256: sha256(decisionText) },
    pro_decision_block: { used: true, model_mode: "PRO", exact_text: decisionText, sha256: sha256(decisionText) },
    writer_contract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretation_allowed: false },
  };
}

function ordinaryDecisionEnvelope(): Extract<CanonicalDecisionEnvelope, { schema_version: 2 }> {
  const capsule = bindingCapsule("EXTRA_HIGH_DIRECT");
  return {
    ...decisionEnvelope(), binding_provider_session_id: bindingSessionId, stage_provider_session_id: directSessionId,
    binding_capsule: capsule, binding_capsule_sha256: sha256(canonicalJson(capsule)), staged_provenance: null,
    reasoning_lane: "EXTRA_HIGH_DIRECT", pro_decision_block: { used: false, model_mode: null, exact_text: null, sha256: null },
  };
}

function directDecisionEnvelope(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED"): Extract<CanonicalDecisionEnvelope, { schema_version: 3 }> {
  const binding = bindingCapsule(lane);
  const pro = lane === "PRO_ESCALATED";
  const sessionId = pro ? directProSessionId : directDecisionSessionId;
  return {
    schema_version: 3,
    envelope_kind: "MISSION_CONTROL_CANONICAL_DECISION",
    request_id: "decision-request-1",
    supervisor_id: supervisorId,
    binding_provider_session_id: bindingSessionId,
    decision_provider_session_id: sessionId,
    binding_envelope: binding,
    binding_envelope_sha256: sha256(canonicalJson(binding)),
    decision_session_provenance: pro ? "VISIBLE_PRO_SESSION_GITHUB_ATTESTED" : "VISIBLE_EXTRA_HIGH_SESSION_GITHUB_ATTESTED",
    nonce: "nonce-1",
    evidence_capsule: { id: "capsule-1", sha256: evidenceSha },
    owner_outcome: { id: "owner-outcome-1", epoch: 7, sha256: outcomeSha },
    reasoning_lane: lane,
    decision_block: { decision_id: "decision-1", exact_text: decisionText, sha256: sha256(decisionText) },
    pro_decision_block: pro
      ? { used: true, model_mode: "PRO", exact_text: decisionText, sha256: sha256(decisionText) }
      : { used: false, model_mode: null, exact_text: null, sha256: null },
    writer_contract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretation_allowed: false },
  };
}

function stageReceiptBody(stage: "EXTRA_HIGH_READER" | "PRO_DECISION_STAGE", stageSessionId: string, capsule = bindingCapsule()) {
  const body: Record<string, unknown> = {
    schema_version: 2, request_id: "decision-request-1", request_nonce: "nonce-1", supervisor_id: supervisorId,
    binding_provider_session_id: capsule.binding_provider_session_id, stage_provider_session_id: stageSessionId,
    binding_capsule: capsule, binding_capsule_sha256: sha256(canonicalJson(capsule)), stage, status: "STAGE_COMPLETE",
  };
  if (stage === "EXTRA_HIGH_READER") body.evidence_reading_capsule = { id: "reader-capsule-1", exact_text: readerText, sha256: sha256(readerText) };
  else body.pro_decision_block = { decision_id: "decision-1", exact_text: decisionText, sha256: sha256(decisionText) };
  return `${stageReceiptCommentPrefix}${JSON.stringify(body)}`;
}

function candidate(): GitHubDecisionCandidate {
  return { repository: policy().repository, issueNumber: policy().decisionIssueNumber, commentId: 9001, immutableUrl: `https://github.com/${policy().repository}/issues/${policy().decisionIssueNumber}#issuecomment-9001`, createdAt: "2026-09-02T00:15:00.000Z", authorLogin: "u-dont-existDOTcom", deliveryId: "delivery-1", body: decisionBody(), ingestionMethod: "GITHUB_WEBHOOK" };
}
function capabilityCandidate(body: string): GitHubDecisionCandidate {
  return { ...candidate(), issueNumber: policy().capabilityIssueNumber, commentId: 9100, immutableUrl: `https://github.com/${policy().repository}/issues/${policy().capabilityIssueNumber}#issuecomment-9100`, createdAt: "2026-09-02T00:01:30.000Z", body: body, deliveryId: "delivery-cap" };
}
function stageCandidate(body: string): GitHubDecisionCandidate {
  return { ...candidate(), issueNumber: policy().stageIssueNumber, commentId: 9200, immutableUrl: `https://github.com/${policy().repository}/issues/${policy().stageIssueNumber}#issuecomment-9200`, createdAt: "2026-09-02T00:05:00.000Z", body, deliveryId: "delivery-stage" };
}
function directCandidate(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED"): GitHubDecisionCandidate {
  return { ...candidate(), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(directDecisionEnvelope(lane))}` };
}
function decisionBody() { return `${canonicalDecisionCommentPrefix}${JSON.stringify(decisionEnvelope())}`; }
function capabilityReceiptBody(mcNonce: string, githubNonce: string) { return `${capabilityReceiptCommentPrefix}${JSON.stringify({ schema_version: 1, challenge_id: "challenge-spec", chat_id: bootstrapChatId, mc_nonce: mcNonce, github_nonce: githubNonce, capabilities: ["MISSION_CONTROL_READ", "GITHUB_READ", "GITHUB_WRITE"] })}`; }
function webhookPayload(body: string, issueNumber = policy().decisionIssueNumber) { return { action: "created", repository: { full_name: policy().repository }, issue: { number: issueNumber }, comment: { id: 9001, html_url: `https://github.com/${policy().repository}/issues/${issueNumber}#issuecomment-9001`, created_at: "2026-09-02T00:01:30.000Z", body, user: { login: "u-dont-existDOTcom" } } }; }

function relayReceipt(events: StoredEvent[], step: string, generationState: "STARTED" | "COMPLETE") {
  const event = events.find((item) => item.data.type === "evidence_receipt_recorded"
    && item.data.summary === relayStageSummary
    && item.data.refs.includes(`step:${step}`)
    && item.data.refs.includes(`generation_state:${generationState}`));
  if (!event) throw new Error(`Missing ${step}/${generationState} relay fixture.`);
  return event;
}

function replaceRef(event: StoredEvent, prefix: string, value: string) {
  if (event.data.type !== "evidence_receipt_recorded") throw new Error("Expected an evidence fixture.");
  const matches = event.data.refs.filter((ref) => ref.startsWith(prefix));
  if (matches.length !== 1) throw new Error(`Expected one ${prefix} fixture ref; found ${matches.length}.`);
  event.data.refs = event.data.refs.map((ref) => ref.startsWith(prefix) ? `${prefix}${value}` : ref);
}

function setRelayOccurredAt(events: StoredEvent[], step: string, generationState: "STARTED" | "COMPLETE", occurredAt: string) {
  const event = relayReceipt(events, step, generationState);
  event.occurredAt = occurredAt;
  event.receivedAt = occurredAt;
  replaceRef(event, "observed_at:", occurredAt);
}

function appendEnvelope(event: StoredEvent) {
  return {
    schema_version: 2,
    event_id: event.eventId,
    mission_id: event.missionId,
    occurred_at: event.occurredAt,
    data: event.data,
  };
}

function evidenceEvent(id: string, sequence: number, summary: string, refs: string[], occurredAt = "2026-09-02T00:02:00.000Z", receivedAt = occurredAt): StoredEvent {
  return storedEvent({ type: "evidence_receipt_recorded", worker: "mission-control-live-slice", receipt_id: id, producer_id: "collector:test", producer_role: "COLLECTOR", evidence_class: "ARTIFACT", independence: "SAME_PROVENANCE", freshness: "CURRENT", exact_candidate_sha256: null, summary, refs, verified: true, changed_path_manifest: null }, `event-${id}`, sequence, occurredAt, receivedAt);
}
function fakeStore(initial: StoredEvent[]) {
  const events = initial.map((event) => structuredClone(event));
  let sequence = Math.max(0, ...events.map((event) => event.sequence));
  return { allEvents: () => events, append: (input: unknown) => { const envelope = input as { event_id: string; occurred_at: string; data: StoredEvent["data"] }; const existing = events.find((event) => event.eventId === envelope.event_id); if (existing) return existing; const stored = storedEvent(envelope.data, envelope.event_id, ++sequence, envelope.occurred_at); events.push(stored); return stored; } } as unknown as EventStore;
}
function storedEvent(data: StoredEvent["data"], eventId: string, sequence: number, occurredAt: string, receivedAt = occurredAt): StoredEvent {
  return { id: sequence, sequence, eventId, schemaVersion: 2, missionId: "mission-control-live", worker: data.worker, type: data.type, occurredAt, receivedAt, previousHash: null, eventHash: "e".repeat(64), producerId: "test", producerKind: "COLLECTOR", data };
}
