import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  pendingDecisionRequests,
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
import { parseAppendEnvelope, type BindingCapsule, type CanonicalDecisionEnvelope, type StoredEvent } from "../lib/schema";
import { EventStore } from "../lib/store";
import { deriveOwnerResponseContinuation } from "../lib/owner-response-continuation";
import { continuationId } from "../lib/owner-response-continuation-schema";
import { decisionRouteStates } from "../lib/reasoning-message-state";
import { producerMayEmit, type AuthenticatedProducer } from "../lib/ingestion-auth";
import { publicSupervisoryRequestBinding } from "../lib/public-mcp";
import { evaluateSupervisionAdmission } from "../lib/supervision-admission-runtime";
import {
  buildWorkExecutionAuthorizationEnvelope,
  currentExecutionDirectiveProof,
  evaluatePersistedWorkExecutionPreflight,
} from "../lib/work-execution-runtime";
import {
  WORK_MODEL_ROUTING_POLICY_BASE_COMMIT,
  WORK_MODEL_ROUTING_POLICY_REF,
} from "../lib/work-execution-profile";
import { daemonLiveness } from "../lib/daemon-health";
import { WORK_CLOUD_DISPATCH_RECEIPT_PREFIX, WORK_CLOUD_EXECUTION_RECEIPT_PREFIX } from "../lib/chatgpt-work-cloud-autodispatch";
import { workerTransportSnapshotFromStore } from "../lib/dashboard-data";
import { seedIssue47Store } from "../lib/seed";

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
    ...semanticSessionEvents(readerSessionId, "EXTRA_HIGH_READER", "GPT-5.6 Sol", 20, "2026-09-02T00:04:00.000Z", "2026-09-02T00:05:30.000Z"),
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
    ...semanticSessionEvents(readerSessionId, "EXTRA_HIGH_READER", "GPT-5.6 Sol", 20, "2026-09-02T00:04:00.000Z", "2026-09-02T00:05:30.000Z"),
  ].map((item) => structuredClone(item));
  const transport = followUpEvents.find((item) => item.data.type === "evidence_receipt_recorded" && item.data.summary === relayStageSummary && item.data.refs.includes(`provider_session:${readerSessionId}`));
  assert.ok(transport && transport.data.type === "evidence_receipt_recorded");
  if (transport?.data.type === "evidence_receipt_recorded") {
    transport.data.refs = transport.data.refs.filter((ref) => ref !== "message_ordinal:1").concat("message_ordinal:2");
  }
  assert.throws(() => ingestGitHubSupervisionCandidate(fakeStore(followUpEvents), stageCandidate(stageReceiptBody("EXTRA_HIGH_READER", readerSessionId)), p), /first-message GitHub transport/);
});

test("prompt-forged and stale binding capsules are rejected", () => {
  const base = [...pendingEvents(), ...capabilityEvents(), ...bindingEvents(), ...semanticSessionEvents(readerSessionId, "EXTRA_HIGH_READER", "GPT-5.6 Sol", 20, "2026-09-02T00:04:00.000Z", "2026-09-02T00:05:30.000Z")];
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
    ...semanticSessionEvents(readerSessionId, "EXTRA_HIGH_READER", "GPT-5.6 Sol", 20, "2026-09-02T00:04:00.000Z", "2026-09-02T00:05:30.000Z"),
    stageCompletion("reader-receipt", 23, "EXTRA_HIGH_READER", readerSessionId, "2026-09-02T00:05:00.000Z", "2026-09-02T00:05:40.000Z"),
    ...semanticSessionEvents(readerSessionId, "PRO_REASONER", "GPT-5.6 Sol", 24, "2026-09-02T00:06:00.000Z", "2026-09-02T00:07:30.000Z"),
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
    ...semanticSessionEvents(writerSessionId, "EXTRA_HIGH_WRITER", "GPT-5.6 Sol", 20, "2026-09-02T00:08:00.000Z", "2026-09-02T00:15:30.000Z"),
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
  assert.equal(result.data.decision_session_provenance, "VISIBLE_GPT_5_6_SOL_EXTRA_HIGH_4_OF_5_SESSION_GITHUB_ATTESTED");
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
  assert.ok(attestation.data.refs.includes("provenance:VISIBLE_GPT_5_6_SOL_EXTRA_HIGH_4_OF_5_SESSION_GITHUB_ATTESTED"));
  assert.ok(attestation.data.refs.includes("backend_model_identity_claimed:false"));
});

test("accepted canonical decision materializes one SYSTEM directive only when complete bounded residue exists", () => {
  const withoutResidue = fakeStore(directDecisionEvents("EXTRA_HIGH_DIRECT"));
  const ordinary = ingestGitHubSupervisionCandidate(withoutResidue, directCandidate("EXTRA_HIGH_DIRECT"), policy(), "2026-09-02T00:15:20.000Z");
  assert.equal(ordinary.filter((event) => event.data.type === "execution_directive_recorded").length, 0);

  const decision = directDecisionEnvelope("EXTRA_HIGH_DIRECT");
  decision.bounded_execution = boundedExecutionResidue("/tmp/mission-control-decision-directive");
  const store = fakeStore(directDecisionEvents("EXTRA_HIGH_DIRECT"));
  const executionCandidate = { ...directCandidate("EXTRA_HIGH_DIRECT"), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(decision)}` };
  const admitted = ingestGitHubSupervisionCandidate(store, executionCandidate, policy(), "2026-09-02T00:15:20.000Z");
  const directive = admitted.find((event) => event.data.type === "execution_directive_recorded");
  assert.ok(directive);
  assert.equal(directive.producerId, "system:github-decision-receipts");
  assert.equal(directive.producerKind, "SYSTEM");
  if (directive.data.type !== "execution_directive_recorded") throw new Error("Expected execution directive");
  assert.equal(directive.data.directive_schema_version, 3);
  assert.equal(directive.data.validated_decision_proof?.authority_path, "VALIDATED_GITHUB_SUPERVISORY_DECISION");
  assert.equal(directive.data.source_message_id?.startsWith("github-decision-source:"), true);
  assert.equal(admitted.some((event) => event.data.type === "reasoning_message_recorded"), false);
  assert.deepEqual(ingestGitHubSupervisionCandidate(store, executionCandidate, policy(), "2026-09-02T00:15:21.000Z"), []);
  assert.equal(store.allEvents().filter((event) => event.data.type === "execution_directive_recorded").length, 1);

  const changed = structuredClone(decision);
  changed.bounded_execution!.prompt = "materially changed executable residue";
  assert.throws(
    () => ingestGitHubSupervisionCandidate(store, { ...executionCandidate, body: `${canonicalDecisionCommentPrefix}${JSON.stringify(changed)}` }, policy(), "2026-09-02T00:15:22.000Z"),
    /changed canonical content/,
  );
});

test("malformed or untrusted bounded residue fails before directive publication", () => {
  const decision = directDecisionEnvelope("EXTRA_HIGH_DIRECT") as Record<string, unknown>;
  decision.bounded_execution = { ...boundedExecutionResidue("/tmp/mission-control-decision-directive"), prompt: "" };
  const malformedStore = fakeStore(directDecisionEvents("EXTRA_HIGH_DIRECT"));
  assert.throws(
    () => ingestGitHubSupervisionCandidate(malformedStore, { ...directCandidate("EXTRA_HIGH_DIRECT"), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(decision)}` }, policy()),
  );
  assert.equal(malformedStore.allEvents().some((event) => event.data.type === "execution_directive_recorded"), false);

  const validDecision = directDecisionEnvelope("EXTRA_HIGH_DIRECT");
  validDecision.bounded_execution = boundedExecutionResidue("/tmp/mission-control-decision-directive");
  const untrustedStore = fakeStore(directDecisionEvents("EXTRA_HIGH_DIRECT"));
  assert.throws(
    () => ingestGitHubSupervisionCandidate(untrustedStore, {
      ...directCandidate("EXTRA_HIGH_DIRECT"), authorLogin: "untrusted-writer",
      body: `${canonicalDecisionCommentPrefix}${JSON.stringify(validDecision)}`,
    }, policy()),
    /not authorized/,
  );
  assert.equal(untrustedStore.allEvents().some((event) => event.data.type === "execution_directive_recorded"), false);
});

test("EventStore accepts only the exact SYSTEM-derived directive and rejects WORKER authority minting", () => {
  const decision = directDecisionEnvelope("EXTRA_HIGH_DIRECT");
  decision.bounded_execution = boundedExecutionResidue("/tmp/mission-control-decision-directive");
  const store = continuationStore(directDecisionEvents("EXTRA_HIGH_DIRECT"));
  try {
    const admitted = ingestGitHubSupervisionCandidate(store, {
      ...directCandidate("EXTRA_HIGH_DIRECT"), body: `${canonicalDecisionCommentPrefix}${JSON.stringify(decision)}`,
    }, policy(), "2026-09-02T00:15:20.000Z");
    const directive = admitted.find((event) => event.data.type === "execution_directive_recorded");
    assert.ok(directive);
    if (!directive || directive.data.type !== "execution_directive_recorded") throw new Error("Expected execution directive");
    const proof = currentExecutionDirectiveProof("mission-control-live-slice", store.allEvents());
    assert.equal(proof?.authoritySource?.kind, "VALIDATED_GITHUB_DECISION");
    assert.equal(proof?.sourceBodySha256, directive.data.source_body_sha256);
    const forgedProducerEvents = store.allEvents().map((event) => structuredClone(event));
    const receiptEventId = directive.data.validated_decision_proof?.receipt_event_id;
    const acceptedReceipt = forgedProducerEvents.find((event) => event.eventId === receiptEventId);
    assert.ok(acceptedReceipt);
    if (acceptedReceipt) acceptedReceipt.producerId = "worker:mission-control-live-slice";
    assert.equal(currentExecutionDirectiveProof("mission-control-live-slice", forgedProducerEvents), null);
    const workerProducer: AuthenticatedProducer = {
      id: "worker:mission-control-live-slice", kind: "WORKER",
      workerScopes: ["mission-control-live-slice"], taskScopes: ["task-1"],
    };
    assert.equal(producerMayEmit(workerProducer, directive.data), false);
    assert.throws(() => store.append({
      ...appendEnvelope(directive),
      event_id: "worker-forged-equivalent-directive",
    }, "2026-09-02T00:15:21.000Z", workerProducer), /exact mechanical derivation|not authorized|cannot emit/i);
  } finally { store.close(); }
});

test("canonical GitHub decision reaches fake CODEX_LOCAL through RelayRuntime without manual execution-state seeding", async () => {
  const relay = await import(new URL("../../../vps-browser-relay/src/relay.mjs", import.meta.url).href);
  const relayCore = await import(new URL("../../../vps-browser-relay/src/core.mjs", import.meta.url).href);
  const candidateRuntime = await import(new URL("../../../vps-browser-relay/src/codex-exec-candidate.mjs", import.meta.url).href);
  const root = await mkdtemp(join(tmpdir(), "mc-decision-directive-e2e-"));
  const workspace = join(root, "workspace");
  const sourceCodexHome = join(root, "source-codex-home");
  await mkdir(workspace);
  await mkdir(sourceCodexHome);
  await writeFile(join(sourceCodexHome, "auth.json"), "DETERMINISTIC_FIXTURE_SUBSCRIPTION_CREDENTIAL\n", { mode: 0o600 });
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, fakeCodexSource(), { mode: 0o700 });

  const decision = directDecisionEnvelope("EXTRA_HIGH_DIRECT");
  decision.bounded_execution = {
    ...boundedExecutionResidue(workspace),
    deadline: new Date(Date.now() + 30_000).toISOString(),
  };
  const store = continuationStore(directDecisionEvents("EXTRA_HIGH_DIRECT"));
  try {
    ingestGitHubSupervisionCandidate(store, {
      ...directCandidate("EXTRA_HIGH_DIRECT"),
      body: `${canonicalDecisionCommentPrefix}${JSON.stringify(decision)}`,
    }, policy(), "2026-09-02T00:15:20.000Z");
    const authoritativeRuntime = new DecisionExecutionRuntime("mission-control-live-slice", store.allEvents());
    const codexConfig = {
      previewEnabled: true,
      stateDir: join(root, "durable-state"),
      runtimeDir: join(root, "ephemeral-runtime"),
      codexBinary: fakeCodex,
      sourceCodexHome,
      nodeBinary: process.execPath,
      restrictedBrowserAdapterPath: null,
      restrictedBrowserAdapterSha256: null,
      maxTimeoutMs: 60_000,
      mcpStartupTimeoutSeconds: 5,
      mcpToolTimeoutSeconds: 5,
      environment: { ...process.env },
    };
    let browserInspected = false;
    const runtime = new relay.RelayRuntime({
      config: relayConfig(),
      missionControl: authoritativeRuntime,
      browser: { listTargets: async () => { browserInspected = true; throw new Error("browser must not gate CODEX_LOCAL"); } },
      stateStore: new DecisionMemoryStateStore(relayCore.defaultState()),
      submissionPacer: { remoteStatus: async () => ({}), status: () => ({}) },
      codexExecutionDispatcher: ({ snapshot, legacyBrowserHandler }: any) => candidateRuntime.dispatchAutomaticMissionControlExecution({
        snapshot,
        config: codexConfig,
        missionControl: authoritativeRuntime,
        legacyBrowserHandler,
        spawnImpl: spawn,
      }),
      memoryReader: async () => { throw new Error("browser memory must not gate CODEX_LOCAL"); },
      logger: { log() {}, warn() {}, error() {} },
    });
    const result = await runtime.cycle();
    assert.equal(result.status, "CODEX_EXECUTION_DISPATCHED", JSON.stringify(result));
    assert.equal(result.codexExecution.route, "CODEX_LOCAL");
    assert.equal(result.codexExecution.status, "COMPLETED");
    assert.equal(browserInspected, false);
    assert.equal(authoritativeRuntime.actualAdmission?.mayExecute, true);
    assert.equal(authoritativeRuntime.actualPreflight?.allowed, true);
    assert.deepEqual(authoritativeRuntime.lifecycleTypes, ["codex_execution_started", "execution_receipt_recorded"]);
    assert.equal(store.allEvents().some((event) => event.data.type === "reasoning_message_recorded"), false);
  } finally { store.close(); }
});

test("unsupported browser residue preserves the exact existing legacy route binding", async () => {
  const candidateRuntime = await import(new URL("../../../vps-browser-relay/src/codex-exec-candidate.mjs", import.meta.url).href);
  const decision = directDecisionEnvelope("EXTRA_HIGH_DIRECT");
  decision.bounded_execution = boundedExecutionResidue(
    "/tmp/mission-control-decision-directive",
    { type: "BROWSER", name: "UNSUPPORTED_BROWSER_FIXTURE" },
  );
  const store = fakeStore(directDecisionEvents("EXTRA_HIGH_DIRECT"));
  ingestGitHubSupervisionCandidate(store, {
    ...directCandidate("EXTRA_HIGH_DIRECT"),
    body: `${canonicalDecisionCommentPrefix}${JSON.stringify(decision)}`,
  }, policy(), "2026-09-02T00:15:20.000Z");
  let received: any = null;
  const result = await candidateRuntime.dispatchAutomaticMissionControlExecution({
    snapshot: { workers: [{ id: "mission-control-live-slice", timeline: store.allEvents() }] },
    config: { previewEnabled: true },
    missionControl: { fetchFleet: async () => { throw new Error("snapshot is already supplied"); } },
    legacyBrowserHandler: async (directive: any, routing: any) => {
      received = { directive, routing };
      return { status: "EXACT_LEGACY_HANDLER_CALLED", route: routing.route };
    },
  });
  assert.equal(result.status, "EXACT_LEGACY_HANDLER_CALLED");
  assert.equal(result.route, "LEGACY_BROWSER");
  assert.equal(received.directive.executionCapability.name, "UNSUPPORTED_BROWSER_FIXTURE");
  assert.equal(received.routing.missionControlBinding.taskId, "task-1");
  assert.equal(received.routing.missionControlBinding.decisionRequestId, "decision-request-1");
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
      event.data.refs = event.data.refs.map((ref) => ref === "model_ui_label:GPT-5.6 Sol" ? "model_ui_label:GPT-5.5" : ref);
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
    ["model", (event) => replaceRef(event, "model_ui_label:", "GPT-5.5")],
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

test("reconciliation indexes 10k durable events once, skips 100 finalized comments, and yields below the relay timeout budget", async () => {
  const p = policy();
  const historical = Array.from({ length: 100 }, (_, index) => {
    const commentId = 10_000 + index;
    return evidenceEvent(`historical-${commentId}`, index + 1, capabilityVerifiedSummary, [
      `github_comment:https://github.com/${p.repository}/issues/${p.capabilityIssueNumber}#issuecomment-${commentId}`,
    ], "2026-09-02T00:01:30.000Z");
  });
  const irrelevant = Array.from({ length: 9_900 }, (_, index) => evidenceEvent(
    `irrelevant-${index}`,
    historical.length + index + 1,
    "IRRELEVANT_HISTORICAL_EVIDENCE",
    [`item:${index}`],
    "2026-09-01T00:00:00.000Z",
  ));
  const store = fakeStore([...historical, ...irrelevant]);
  const originalAllEvents = store.allEvents.bind(store);
  let fullHistoryLoads = 0;
  store.allEvents = () => { fullHistoryLoads += 1; return originalAllEvents(); };
  const comments = historical.map((_, index) => githubComment(
    10_000 + index,
    p.capabilityIssueNumber,
    capabilityReceiptBody("mc-nonce", "github-only-nonce"),
    "2026-09-02T00:01:30.000Z",
  ));
  const urls: string[] = [];
  let eventLoopYielded = false;
  const representativeStore = new EventStore(":memory:");
  seedIssue47Store(representativeStore);
  const responsivenessProbe = new Promise<number>((resolve, reject) => setImmediate(() => {
    const probeStartedAt = Date.now();
    try {
      assert.deepEqual(daemonLiveness(), { status: "ok", kind: "liveness" });
      const worker = workerTransportSnapshotFromStore(representativeStore, "mission-control-live-slice");
      assert.equal(worker?.worker.id, "mission-control-live-slice");
      eventLoopYielded = true;
      resolve(Date.now() - probeStartedAt);
    } catch (error) {
      reject(error);
    }
  }));
  const startedAt = Date.now();
  const reconciliation = reconcileGitHubDecisionReceipts(store, {
    policy: p,
    now: "2026-09-02T00:03:00.000Z",
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      urls.push(url.toString());
      if (url.pathname.includes(`/issues/${p.capabilityIssueNumber}/comments`)) {
        return new Response(JSON.stringify(url.searchParams.get("page") === "1" ? comments : []), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    },
  });
  const responsivenessLatencyMs = await responsivenessProbe;
  const result = await reconciliation;
  representativeStore.close();

  assert.deepEqual(result, []);
  assert.equal(fullHistoryLoads, 1);
  assert.equal(eventLoopYielded, true);
  assert.equal(urls.length, 4);
  assert.equal(urls.some((url) => url.includes("since=")), true);
  assert.ok(responsivenessLatencyMs < 10_000, "concurrent liveness and representative worker read must remain materially below 30s");
  assert.ok(Date.now() - startedAt < 10_000, "10k-event reconciliation must remain materially below the relay's 30s timeout");
});

test("reconciliation ingests a late valid comment after the reconstructed high-water mark", async () => {
  const p = policy();
  const oldCommentId = 20_001;
  const newCommentId = 20_002;
  const store = fakeStore([
    evidenceEvent("challenge", 1, capabilityChallengeSummary, [
      "challenge:challenge-spec", `supervisor:${supervisorId}`, `chat:${bootstrapChatId}`,
      "mc_nonce:mc-nonce", `github_nonce_sha256:${sha256("github-only-nonce")}`,
      "expires_at:2026-09-03T00:00:00.000Z",
    ]),
    evidenceEvent("old-capability", 2, capabilityVerifiedSummary, [
      `github_comment:https://github.com/${p.repository}/issues/${p.capabilityIssueNumber}#issuecomment-${oldCommentId}`,
    ], "2026-09-02T00:01:00.000Z"),
  ]);
  const result = await reconcileGitHubDecisionReceipts(store, {
    policy: p,
    now: "2026-09-02T00:03:00.000Z",
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      const payload = url.pathname.includes(`/issues/${p.capabilityIssueNumber}/comments`)
        ? [githubComment(newCommentId, p.capabilityIssueNumber, capabilityReceiptBody("mc-nonce", "github-only-nonce"), "2026-09-02T00:02:00.000Z")]
        : [];
      return new Response(JSON.stringify(payload), { status: 200 });
    },
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.data.type, "evidence_receipt_recorded");
  assert.equal(result[0]?.data.type === "evidence_receipt_recorded" && result[0].data.refs.includes(`github_comment:https://github.com/${p.repository}/issues/${p.capabilityIssueNumber}#issuecomment-${newCommentId}`), true);
});

test("restart overlap skips the committed comment, admits the next one, and ignores invalid or unrelated comments", async () => {
  const p = policy();
  const store = fakeStore([]);
  ensureConfiguredCapabilityChallenges(store, p, "2026-09-02T00:00:00.000Z");
  const first = githubComment(30_001, p.capabilityIssueNumber, capabilityReceiptBody("mc-nonce", "github-only-nonce"), "2026-09-02T00:01:00.000Z");
  const second = githubComment(30_002, p.capabilityIssueNumber, capabilityReceiptBody("mc-nonce", "github-only-nonce"), "2026-09-02T00:02:00.000Z");
  const invalid = githubComment(30_003, p.capabilityIssueNumber, capabilityReceiptBody("wrong", "wrong"), "2026-09-02T00:02:30.000Z");
  const unrelated = githubComment(30_004, p.capabilityIssueNumber, "ordinary issue discussion", "2026-09-02T00:02:40.000Z");
  let pass = 1;
  const fetchImpl = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const payload = url.pathname.includes(`/issues/${p.capabilityIssueNumber}/comments`)
      ? pass === 1 ? [first] : [first, second, invalid, unrelated]
      : [];
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  const firstResult = await reconcileGitHubDecisionReceipts(store, { policy: p, now: "2026-09-02T00:03:00.000Z", fetchImpl });
  assert.equal(firstResult.length, 1);
  pass = 2;
  const restartResult = await reconcileGitHubDecisionReceipts(store, { policy: p, now: "2026-09-02T00:04:00.000Z", fetchImpl });
  assert.equal(restartResult.length, 1);
  const receipts = store.allEvents().filter((event) => event.data.type === "evidence_receipt_recorded"
    && event.data.summary === capabilityVerifiedSummary
    && event.data.refs.some((ref) => ref.startsWith("github_comment:")));
  assert.equal(receipts.length, 2);
  assert.equal(receipts.filter((event) => event.data.type === "evidence_receipt_recorded"
    && event.data.refs.includes(`github_comment:https://github.com/${p.repository}/issues/${p.capabilityIssueNumber}#issuecomment-30001`)).length, 1);
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
      modelVisibleLabel: "GPT-5.6 Sol", thinkingControlLabel: "Thinking effort", thinkingVisibleLabel: "Extra High", thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro", accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false,
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
    evidenceEvent("mode", 5, modeCapabilityVerifiedSummary, [`chat:${bootstrapChatId}`, "capability:modeSwitching", "model_visible_label:GPT-5.6 Sol", "thinking_control_label:Thinking effort", "thinking_visible_label:Extra High", "thinking_ordinal:4 of 5", "account_plan_label:Pro", "account_plan_role:PROVENANCE_METADATA_ONLY", "account_plan_is_reasoning_mode:false", "expires_at:2026-09-03T00:00:00.000Z"]),
  ];
}

function bindingEvents(lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED" = "PRO_ESCALATED"): StoredEvent[] {
  const capsule = bindingCapsule(lane);
  return [
    providerSessionEvent("binding-active", 6, bindingSessionId, "MC_BINDING_PRELOAD", "ACTIVE", "2026-09-02T00:02:00.000Z", bindingSessionId),
    evidenceEvent("binding-model", 7, providerSessionModelSummary, ["request:decision-request-1", `supervisor:${supervisorId}`, `provider_session:${bindingSessionId}`, "model_ui_label:GPT-5.6 Sol", "assistant_content_observed:false"], "2026-09-02T00:02:05.000Z"),
    relayStage("preload", 8, bindingSessionId, "MCP_BINDING_PRELOAD", "GPT-5.6 Sol", "Mission Control", "2026-09-02T00:02:10.000Z", bindingSessionId),
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
    ...semanticSessionEvents(readerSessionId, "EXTRA_HIGH_READER", "GPT-5.6 Sol", 20, "2026-09-02T00:04:00.000Z", "2026-09-02T00:05:30.000Z"),
    stageCompletion("reader-receipt", 23, "EXTRA_HIGH_READER", readerSessionId, "2026-09-02T00:05:00.000Z", "2026-09-02T00:05:40.000Z"),
    ...semanticSessionEvents(proSessionId, "PRO_REASONER", "GPT-5.6 Sol", 24, "2026-09-02T00:06:00.000Z", "2026-09-02T00:07:30.000Z"),
    stageCompletion("pro-receipt", 27, "PRO_DECISION_STAGE", proSessionId, "2026-09-02T00:07:00.000Z", "2026-09-02T00:07:40.000Z"),
    ...semanticSessionEvents(writerSessionId, "EXTRA_HIGH_WRITER", "GPT-5.6 Sol", 28, "2026-09-02T00:08:00.000Z", "2026-09-02T00:15:30.000Z"),
  ];
}

function ordinaryEvents(): StoredEvent[] {
  return [
    ...pendingEvents("EXTRA_HIGH_DIRECT"), ...capabilityEvents(), ...bindingEvents("EXTRA_HIGH_DIRECT"),
    ...semanticSessionEvents(directSessionId, "EXTRA_HIGH_DIRECT", "GPT-5.6 Sol", 20, "2026-09-02T00:04:00.000Z", "2026-09-02T00:15:30.000Z"),
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
  const label = "GPT-5.6 Sol";
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
    decision_session_provenance: "VISIBLE_GPT_5_6_SOL_EXTRA_HIGH_4_OF_5_SESSION_GITHUB_ATTESTED",
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

function boundedExecutionResidue(workspace: string, executionCapability: { type: "LOCAL_FILESYSTEM_COMMAND" } | { type: "BROWSER"; name: string } = { type: "LOCAL_FILESYSTEM_COMMAND" }) {
  return {
    schema_version: 1 as const,
    task_id: "task-1",
    job_id: "job-decision-directive-fixture",
    execution_objective: "Execute the exact harmless local fixture.",
    reasoning_summary: "The accepted supervisory decision selected this bounded mechanical residue.",
    strategy_id: "strategy:decision-directive-fixture",
    strategy_causal_hypothesis: "A server-derived directive removes manual EventStore seeding.",
    predicted_outcome_change: "The relay automatically discovers one executable task.",
    success_threshold: "One deterministic fake Codex receipt is recorded.",
    failure_threshold: "No directive or more than one directive is recorded.",
    next_decision_changing_evidence: "The direct RelayRuntime consumer seam result.",
    reviewed_evidence_boundary: "Canonical GitHub decision fixture and current owner outcome.",
    inputs: [{ type: "ARTIFACT", ref: "fixture:canonical-decision", sha256: null }],
    allowed_actions: ["Run the deterministic fake local command."],
    allowed_paths: [workspace],
    allowed_commands: ["fake-codex"],
    forbidden_actions: ["Modify production."],
    forbidden_paths: ["/etc"],
    forbidden_decisions: ["Do not change strategy or scope."],
    required_evidence: ["codex_execution_started", "execution_receipt_recorded"],
    required_tests_or_checks: ["Validate structured fake runner output."],
    stop_and_return_triggers: ["Any authority or preflight rejection."],
    maximum_execution_cycles: 1,
    execution_capability: executionCapability,
    workspace,
    output_schema: {
      type: "object", additionalProperties: false, required: ["success", "value"],
      properties: { success: { type: "boolean" }, value: { type: "string" } },
    },
    prompt: "Return the harmless deterministic fixture result.",
    deadline: "2099-09-18T00:00:00.000Z",
    work_execution_profile: {
      model: "GPT_5_6_SOL" as const,
      effort: "LOW" as const,
      routingTier: "SOL_LOW" as const,
      routingTriggers: [],
      fastModeRequest: "DO_NOT_ENABLE_FAST" as const,
      assuranceRequirement: "SET_REQUEST_SUFFICIENT" as const,
      policyRef: WORK_MODEL_ROUTING_POLICY_REF,
      routingPolicyBaseCommit: WORK_MODEL_ROUTING_POLICY_BASE_COMMIT,
      contractVersion: "TRUSTED_SETTER_V1" as const,
    },
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

function githubComment(commentId: number, issueNumber: number, body: string, createdAt: string) {
  return {
    id: commentId,
    html_url: `https://github.com/${policy().repository}/issues/${issueNumber}#issuecomment-${commentId}`,
    created_at: createdAt,
    updated_at: createdAt,
    body,
    user: { login: "u-dont-existDOTcom" },
  };
}

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
  const append = (input: unknown, receivedAt?: string, producer?: AuthenticatedProducer) => {
    const envelope = input as { event_id: string; occurred_at: string; data: StoredEvent["data"] };
    const existing = events.find((event) => event.eventId === envelope.event_id);
    if (existing) return existing;
    const stored = storedEvent(envelope.data, envelope.event_id, ++sequence, envelope.occurred_at, receivedAt ?? envelope.occurred_at);
    stored.producerId = producer?.id ?? "test";
    stored.producerKind = producer?.kind ?? "COLLECTOR";
    events.push(stored);
    return stored;
  };
  return {
    allEvents: () => events,
    append,
    appendMany: (items: Array<{ event: unknown; receivedAt?: string; producer?: AuthenticatedProducer }>) => items.map((item) => append(item.event, item.receivedAt, item.producer)),
  } as unknown as EventStore;
}
function storedEvent(data: StoredEvent["data"], eventId: string, sequence: number, occurredAt: string, receivedAt = occurredAt): StoredEvent {
  return { id: sequence, sequence, eventId, schemaVersion: 2, missionId: "mission-control-live", worker: data.worker, type: data.type, occurredAt, receivedAt, previousHash: null, eventHash: "e".repeat(64), producerId: "test", producerKind: "COLLECTOR", data };
}


test("GitHub native Work dispatch receipt binds exact persisted prompt and admits source-attested Work", () => {
  const p = policy();
  const request = storedEvent({
    type: "chatgpt_work_cloud_dispatch_requested", worker: "mission-control-live-slice", dispatch_id: "work-cloud:test-dispatch", mode: "CREATE",
    requested_surface: "CHATGPT_WORK_CLOUD", directive_id: "directive:work-cloud", directive_revision: 1, task_id: "task:work-cloud",
    directive_artifact_sha256: "1".repeat(64), source_message_id: "message:work-cloud", source_body_sha256: "2".repeat(64),
    source_chat_title: "Goal Alignment", source_chat_url: "chatgpt-conversation://abc-123", source_chat_browser_url: "https://chatgpt.com/c/abc-123",
    requested_work_title: "Work — Goal Alignment", chatgpt_project_id: null, existing_work_thread_id: null, prompt_sha256: "3".repeat(64),
    approval_state: "NOT_REQUIRED", capability_evidence: { observed_at: "2026-09-19T19:00:00.000Z", app_version: "VERSIONED_PRODUCT_SCHEMA_2026-09-19", create_thread_target_available: true, send_message_to_thread_available: true, native_surface_verification_available: true },
    requested_at: "2026-09-19T19:00:00.000Z", producer_id: "system:chatgpt-work-cloud-dispatch", source: "MISSION_CONTROL_SUPERVISOR_WORK_DISPATCH",
  } as StoredEvent["data"], "work-request", 1, "2026-09-19T19:00:00.000Z");
  const body = `${WORK_CLOUD_DISPATCH_RECEIPT_PREFIX}${JSON.stringify({ schemaVersion: 1, dispatchId: "work-cloud:test-dispatch", worker: "mission-control-live-slice", taskId: "task:work-cloud", directiveId: "directive:work-cloud", directiveRevision: 1, promptSha256: "3".repeat(64), status: "READY", surface: "CHATGPT_WORK_CLOUD", workThreadId: "native-work-thread-1", clientThreadId: null, errorCode: null })}`;
  const candidate: GitHubDecisionCandidate = { repository: p.repository, issueNumber: p.stageIssueNumber, commentId: 901, immutableUrl: `https://github.com/${p.repository}/issues/${p.stageIssueNumber}#issuecomment-901`, createdAt: "2026-09-19T19:01:00.000Z", authorLogin: p.authorizedWriterLogins[0], deliveryId: "delivery-work-1", body, ingestionMethod: "GITHUB_WEBHOOK" };
  const appended = ingestGitHubSupervisionCandidate(fakeStore([request]), candidate, p, "2026-09-19T19:01:01.000Z");
  assert.equal(appended.length, 1);
  assert.equal(appended[0].data.type, "chatgpt_work_cloud_dispatch_recorded");
  if (appended[0].data.type !== "chatgpt_work_cloud_dispatch_recorded") return;
  assert.equal(appended[0].data.status, "READY");
  assert.equal(appended[0].data.surface_verification, "SOURCE_ATTESTED_NATIVE_WORK");
  assert.equal(appended[0].data.work_thread_id, "native-work-thread-1");
  const wrong = body.replace("3".repeat(64), "4".repeat(64));
  assert.throws(() => ingestGitHubSupervisionCandidate(fakeStore([request]), { ...candidate, commentId: 902, body: wrong }, p), /prompt binding/);
});

test("GitHub native Work execution receipt atomically creates a fresh reasoning-review route", () => {
  const p = policy();
  const currentOutcome = structuredClone(pendingEvents("EXTRA_HIGH_DIRECT")[0]!);
  currentOutcome.sequence = 1;
  const originRouteBody = "MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V5\n" + JSON.stringify({
    schemaVersion: 5,
    packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE",
    requestId: "origin-work-request",
    worker: "mission-control-live-slice",
    producerId: "worker:fixture",
    destination: "SPECIALIST_SUPERVISOR_CHAT",
    destinationSupervisorId: supervisorId,
    providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY",
    factualPacket: { taskId: "task:exec" },
    queuedAt: "2026-09-19T18:00:00.000Z",
    expiresAt: "2026-09-19T19:00:00.000Z",
  });
  const originRoute = storedEvent({
    type: "worker_message_recorded", worker: "mission-control-live-slice", message_id: "origin-work-message", thread_id: "thread-origin-work",
    message_kind: "QUESTION", body: originRouteBody, reply_to_message_id: null, direction_id: null,
  }, "origin-work-route", 2, "2026-09-19T18:00:00.000Z");
  const originDecision = storedEvent({
    type: "github_decision_receipt_ingested", worker: "mission-control-live-slice", task_id: "task:exec",
    receipt_id: "origin-work-decision-receipt", request_id: "origin-work-request", supervisor_id: supervisorId,
    reasoning_lane: "EXTRA_HIGH_DIRECT",
  } as unknown as StoredEvent["data"], "origin-work-decision", 3, "2026-09-19T18:10:00.000Z");
  const directive = storedEvent({
    type: "execution_directive_recorded", worker: "mission-control-live-slice", directive_id: "directive:exec",
    directive_revision: 2, task_id: "task:exec", status: "ACTIVE", directive_schema_version: 3,
    execution_surface: "CHATGPT_WORK_CLOUD",
    validated_decision_proof: {
      authority_path: "VALIDATED_GITHUB_SUPERVISORY_DECISION", receipt_event_id: "origin-work-decision",
      receipt_id: "origin-work-decision-receipt", request_id: "origin-work-request",
      canonical_envelope_sha256: "4".repeat(64), bounded_execution_sha256: "5".repeat(64), exact_execution_payload: "fixture",
    },
  } as unknown as StoredEvent["data"], "origin-work-directive", 4, "2026-09-19T18:10:01.000Z");
  const request = storedEvent({
    type: "chatgpt_work_cloud_dispatch_requested", worker: "mission-control-live-slice", dispatch_id: "work-cloud:test-exec", mode: "CREATE",
    requested_surface: "CHATGPT_WORK_CLOUD", directive_id: "directive:exec", directive_revision: 2, task_id: "task:exec",
    directive_artifact_sha256: "1".repeat(64), source_message_id: "message:exec", source_body_sha256: "2".repeat(64),
    source_chat_title: "Goal Alignment", source_chat_url: "chatgpt-conversation://abc-123", source_chat_browser_url: "https://chatgpt.com/c/abc-123",
    requested_work_title: "Work — Goal Alignment", chatgpt_project_id: null, existing_work_thread_id: null, prompt_sha256: "3".repeat(64),
    approval_state: "NOT_REQUIRED", capability_evidence: { observed_at: "2026-09-19T19:00:00.000Z", app_version: "SUPERVISOR_MEDIATED_CAPABILITY_UNVERIFIED", create_thread_target_available: false, send_message_to_thread_available: false, native_surface_verification_available: false },
    requested_at: "2026-09-19T19:00:00.000Z", producer_id: "system:chatgpt-work-cloud-dispatch", source: "MISSION_CONTROL_SUPERVISOR_WORK_DISPATCH",
  } as StoredEvent["data"], "work-request-exec", 5, "2026-09-19T19:00:00.000Z");
  const ready = storedEvent({
    type: "chatgpt_work_cloud_dispatch_recorded", worker: "mission-control-live-slice", dispatch_id: "work-cloud:test-exec", mode: "CREATE", requested_surface: "CHATGPT_WORK_CLOUD",
    directive_id: "directive:exec", directive_revision: 2, task_id: "task:exec", app_tool: "create_thread", status: "READY", work_thread_id: "native-work-thread-2", client_thread_id: null,
    approval_state: "ACCEPTED", surface_verification: "SOURCE_ATTESTED_NATIVE_WORK", native_surface_evidence: "CHATGPT_SUPERVISOR_NATIVE_WORK_TOOL_RESULT", host_id: null, error_code: null,
    recorded_at: "2026-09-19T19:01:00.000Z", producer_id: "system:github-decision-receipts", source: "CHATGPT_SUPERVISOR_WORK_DISPATCH_ATTESTED",
  } as StoredEvent["data"], "work-ready-exec", 6, "2026-09-19T19:01:00.000Z");
  const body = `${WORK_CLOUD_EXECUTION_RECEIPT_PREFIX}${JSON.stringify({ schemaVersion: 1, dispatchId: "work-cloud:test-exec", worker: "mission-control-live-slice", taskId: "task:exec", directiveId: "directive:exec", directiveRevision: 2, status: "COMPLETED", terminalState: "IMPLEMENTATION_READY_FOR_REVIEW", checksPassed: 12, checksFailed: 0, checksNotRun: 1, blockerCodes: [], artifactCount: 4 })}`;
  const candidate: GitHubDecisionCandidate = { repository: p.repository, issueNumber: p.stageIssueNumber, commentId: 903, immutableUrl: `https://github.com/${p.repository}/issues/${p.stageIssueNumber}#issuecomment-903`, createdAt: "2026-09-19T19:02:00.000Z", authorLogin: p.authorizedWriterLogins[0], deliveryId: "delivery-work-2", body, ingestionMethod: "GITHUB_WEBHOOK" };
  const store = fakeStore([currentOutcome, originRoute, originDecision, directive, request, ready]);
  const appended = ingestGitHubSupervisionCandidate(store, candidate, p, "2026-09-19T19:02:01.000Z");
  assert.equal(appended.length, 2);
  assert.equal(appended[0].data.type, "chatgpt_work_cloud_execution_receipt_recorded");
  assert.equal(appended[1].data.type, "reasoning_review_route_recorded");
  if (appended[0].data.type !== "chatgpt_work_cloud_execution_receipt_recorded"
    || appended[1].data.type !== "reasoning_review_route_recorded") return;
  assert.equal(appended[0].data.work_thread_id, "native-work-thread-2");
  assert.deepEqual(appended[0].data.check_summary, { passed: 12, failed: 0, not_run: 1 });
  assert.equal(appended[0].data.github_comment_sha256, sha256(body));
  assert.equal("raw_logs" in appended[0].data, false);
  assert.equal(appended[1].data.source_execution_receipt_event_id, appended[0].eventId);
  assert.equal(appended[1].data.destination_supervisor_id, supervisorId);
  assert.equal(appended[1].data.body_sha256, sha256(appended[1].data.body));
  const pending = pendingDecisionRequests(store.allEvents()).filter((item) => item.taskId === "task:exec");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].routeSchemaVersion, 5);
  assert.equal(pending[0].supervisorId, supervisorId);
  assert.equal(pending[0].ownerOutcome.id, "owner-outcome-1");
  assert.equal(pending[0].reasoningLane, "EXTRA_HIGH_DIRECT");
  assert.equal(pending[0].evidenceCapsule.sha256.length, 64);
});

const continuationIngestedAt = "2026-09-02T00:15:20.000Z";

for (const path of ["DIRECT", "PROJECT_MANAGER"] as const) for (const lane of ["EXTRA_HIGH_DIRECT", "PRO_ESCALATED"] as const) {
  test(`canonical continuation ${path} ${lane} atomically consumes receipt and resolves existing decision route`, () => {
    const fixture = continuationFixture(path, lane);
    const store = continuationStore(fixture.events);
    try {
      assert.equal(decisionRouteStates(store.allEvents())[0].status, "SUPERVISOR_RESOLUTION_REQUIRED");
      const admitted = ingestGitHubSupervisionCandidate(store, fixture.candidate, policy(), continuationIngestedAt);
      assert.equal(admitted.length, 3);
      const receipt = admitted[0], resolution = admitted[2];
      assert.equal(receipt.data.type, "github_decision_receipt_ingested");
      if (receipt.data.type !== "github_decision_receipt_ingested" || resolution.data.type !== "reasoning_message_recorded") throw new Error("Expected continuation events");
      assert.deepEqual(receipt.data.continuation_binding, fixture.continuation.binding);
      assert.equal(receipt.data.continuation_binding_sha256, fixture.continuation.digest);
      assert.equal(resolution.data.exact_visible_body, decisionText);
      assert.equal(resolution.data.body_sha256, sha256(decisionText));
      assert.equal(resolution.data.parent_message_id, fixture.continuation.binding.supervisor_delivery.message_id);
      assert.equal(resolution.data.stable_supervisor_id, supervisorId);
      assert.equal(resolution.data.sent_at_source, null);
      assert.equal(resolution.data.provenance_status, "UNVERIFIED");
      assert.equal(resolution.data.acquisition_method, "GITHUB_SESSION_ATTESTED");
      assert.equal(resolution.data.immutable_provider_locator, null);
      assert.equal(resolution.producerKind, "SUPERVISOR");
      assert.equal(resolution.data.recorded_by, resolution.producerId);
      assert.equal(producerMayEmit({ id: resolution.producerId, kind: "SUPERVISOR", workerScopes: [resolution.worker!], taskScopes: [`task:${resolution.worker}`] }, resolution.data), true);
      assert.equal(producerMayEmit({ id: resolution.producerId, kind: "WORKER", workerScopes: [resolution.worker!], taskScopes: ["*"] }, resolution.data), false);
      assert.match(resolution.data.limitations.join(" "), /Provider source timestamp unavailable/);
      assert.match(resolution.data.limitations.join(" "), /canonical GitHub session-attested decision artifact/);
      assert.equal(decisionRouteStates(store.allEvents())[0].status, "RESOLVED");
      assert.equal(store.verifyChain().valid, true);
      const count = store.count();
      assert.deepEqual(ingestGitHubSupervisionCandidate(store, fixture.candidate, policy(), continuationIngestedAt), []);
const replayCommentId = fixture.candidate.commentId + 1000;
const replayCandidate = { ...fixture.candidate, commentId: replayCommentId,
  immutableUrl: fixture.candidate.immutableUrl.replace(/issuecomment-\d+$/, `issuecomment-${replayCommentId}`) };
assert.throws(() => ingestGitHubSupervisionCandidate(store, replayCandidate, policy(), continuationIngestedAt), /pending|already been consumed/);
      assert.equal(store.count(), count);
    } finally { store.close(); }
  });
}

test("canonical continuation echo is mandatory, exact, canonical-digest-bound and unexpected fields fail closed", () => {
  const fixture = continuationFixture("DIRECT");
  const build = (decision: unknown, events = fixture.events) => buildGitHubDecisionReceiptEnvelope(events,
    { ...fixture.candidate, body: canonicalDecisionCommentPrefix + JSON.stringify(decision) }, policy(), continuationIngestedAt);
  assert.doesNotThrow(() => build(fixture.decision));
  const missing: Partial<typeof fixture.decision> = { ...fixture.decision };
  delete missing.continuation_binding; delete missing.continuation_binding_sha256;
  assert.throws(() => build(missing), /must echo/);
  assert.throws(() => build({ ...fixture.decision, continuation_binding_sha256: undefined }), /invalid or incomplete/);
  assert.throws(() => build({ ...fixture.decision, continuation_binding_sha256: "0".repeat(64) }), /invalid or incomplete/);
  const changed = structuredClone(fixture.continuation.binding);
  changed.evidence_capsule.id = "capsule-other";
  assert.throws(() => build({ ...fixture.decision, continuation_binding: changed, continuation_binding_sha256: sha256(canonicalJson(changed)) }), /continuation binding\/digest mismatch/);
  assert.throws(() => build(fixture.decision, directDecisionEvents("EXTRA_HIGH_DIRECT")), /Unexpected continuation/);
  assert.throws(() => parseCanonicalDecisionComment(canonicalDecisionCommentPrefix + JSON.stringify({ ...decisionEnvelope(), continuation_binding: fixture.continuation.binding })), /schema_version 3/);
});

test("receipt rederives continuation from authoritative events and rejects forged route metadata, stale outcome and replay", () => {
  const fixture = continuationFixture("DIRECT");
  const ingest = (events: StoredEvent[], c = fixture.candidate) => buildGitHubDecisionReceiptEnvelope(events, c, policy(), continuationIngestedAt);
  const missingOwner = fixture.events.filter((event) => event.eventId !== fixture.continuation.binding.supervisor_delivery.event_id);
  assert.throws(() => ingest(missingOwner), /OWNER response/);
  const wrongStable = structuredClone(fixture.events);
  const owner = wrongStable.find((event) => event.eventId === fixture.continuation.binding.supervisor_delivery.event_id)!;
  if (owner.data.type !== "reasoning_message_recorded") throw new Error("Expected owner");
  owner.data.stable_supervisor_id = "wrong-supervisor";
  assert.throws(() => ingest(wrongStable), /stable supervisor/);
  const stale = structuredClone(fixture.events);
  const outcome = structuredClone(stale.find((event) => event.data.type === "owner_outcome_recorded")!);
  outcome.sequence = 1000;
  if (outcome.data.type === "owner_outcome_recorded") outcome.data.epoch++;
  stale.push(outcome);
  assert.throws(() => ingest(stale), /current owner outcome/);
  const receipt = ingest(fixture.events);
  assert.throws(() => ingest([...fixture.events, storedEvent({ ...receipt.data, request_id: "other-retry-request" } as StoredEvent["data"], "consumed-earlier", 1000, continuationIngestedAt)]), /already been consumed/);
  assert.throws(() => buildGitHubDecisionReceiptEnvelope(fixture.events, fixture.candidate, policy(), "2026-09-03T00:00:01.000Z"), /validity window/);

  const forged = structuredClone(fixture.continuation.binding);
  forged.originating_supervisor_message.body_sha256 = "f".repeat(64);
  const { continuation_id: _, ...causal } = forged;
  forged.continuation_id = continuationId(causal);
  const digest = sha256(canonicalJson(forged));
  const tampered = structuredClone(fixture.events);
  const route = tampered.find((event) => event.data.type === "worker_message_recorded")!;
  if (route.data.type !== "worker_message_recorded") throw new Error("Expected route");
  const packet = JSON.parse(route.data.body.slice(directSupervisoryCycleRoutePrefix.length));
  packet.continuationBinding = forged; packet.continuationBindingSha256 = digest;
  route.data.body = directSupervisoryCycleRoutePrefix + JSON.stringify(packet);
  const forgedCandidate = { ...fixture.candidate, body: canonicalDecisionCommentPrefix + JSON.stringify({ ...fixture.decision, continuation_binding: forged, continuation_binding_sha256: digest }) };
  assert.throws(() => ingest(tampered, forgedCandidate), /authoritative events\/current evidence/);
});

test("failed resolution append rolls back receipt consumption and permits an unchanged retry", () => {
  const fixture = continuationFixture("PROJECT_MANAGER"), store = continuationStore(fixture.events);
  try {
    const originalAppend = store.append.bind(store), before = store.count();
    store.append = (input, receivedAt, producer) => {
      if ((input as { data?: { type?: string } }).data?.type === "reasoning_message_recorded") throw new Error("injected resolution write failure");
      return originalAppend(input, receivedAt, producer);
    };
    assert.throws(() => ingestGitHubSupervisionCandidate(store, fixture.candidate, policy(), continuationIngestedAt), /injected/);
    assert.equal(store.count(), before);
    assert.equal(decisionRouteStates(store.allEvents())[0].status, "SUPERVISOR_RESOLUTION_REQUIRED");
    store.append = originalAppend;
    assert.equal(ingestGitHubSupervisionCandidate(store, fixture.candidate, policy(), continuationIngestedAt).length, 3);
    assert.equal(store.verifyChain().valid, true);
  } finally { store.close(); }
});

test("historical non-continuation schema-v3 canonical bytes and route-v4 binding remain exact", () => {
  for (const lane of ["EXTRA_HIGH_DIRECT", "PRO_ESCALATED"] as const) {
    const raw = directDecisionEnvelope(lane);
    const parsed = parseCanonicalDecisionComment(canonicalDecisionCommentPrefix + JSON.stringify(raw));
    assert.equal(canonicalJson(parsed), canonicalJson(raw));
    assert.equal("continuation_binding" in parsed, false);
    const receipt = buildGitHubDecisionReceiptEnvelope(directDecisionEvents(lane), directCandidate(lane), policy(), continuationIngestedAt);
    if (receipt.data.type !== "github_decision_receipt_ingested") throw new Error("Expected receipt");
    assert.equal("continuation_binding" in receipt.data, false);
    assert.equal("continuation_binding_sha256" in receipt.data, false);
    assert.equal(receipt.data.binding_envelope_sha256, sha256(canonicalJson(bindingCapsule(lane))));
  }
});

function continuationFixture(path: "DIRECT" | "PROJECT_MANAGER", lane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED" = "EXTRA_HIGH_DIRECT") {
  const events = directDecisionEvents(lane);
  const worker = "mission-control-live-slice", ownerText = "Choose the owner-defined second option.\nPreserve this exact OWNER input.";
  const message = (eventId: string, sequence: number, author: "ASSISTANT" | "OWNER", surface: "SUPERVISOR" | "PROJECT_MANAGER", parent: string | null, text: string): StoredEvent => storedEvent({
    type: "reasoning_message_recorded", worker, message_id: eventId, thread_id: "original-supervisor-thread",
    surface_role: surface, stable_supervisor_id: supervisorId, provider_surface: "CHATGPT_CONSUMER", model_mode: "UNKNOWN", account_workspace: "UNKNOWN",
    author_role: author, sent_at_source: null, received_at_mission_control: "2026-09-02T00:00:30.000Z",
    body_sha256: sha256(text), exact_visible_body: text, immutable_provider_locator: null, parent_message_id: parent,
    owner_direction_id: null, decision_request_id: "original-owner-question", acquisition_method: author === "OWNER" ? "OWNER_ATTESTED" : "UNKNOWN",
    provenance_status: author === "OWNER" ? "OWNER_ATTESTED" : "UNVERIFIED", limitations: [], recorded_by: author === "OWNER" ? "owner:fixture" : "supervisor:fixture",
  }, eventId, sequence, "2026-09-02T00:00:30.000Z");
  events.push(message("original-question", 30, "ASSISTANT", "SUPERVISOR", null, "Owner, choose an option."));
  if (path === "PROJECT_MANAGER") {
    events.push(message("pm-owner-input", 31, "OWNER", "PROJECT_MANAGER", "original-question", ownerText));
    events.push(message("pm-assistant-output", 32, "ASSISTANT", "PROJECT_MANAGER", "pm-owner-input", "PM ASSISTANT OUTPUT MUST NOT TRAVEL"));
  }
  events.push(message("supervisor-owner-delivery", 33, "OWNER", "SUPERVISOR", path === "DIRECT" ? "original-question" : "pm-owner-input", ownerText));
  const continuation = deriveOwnerResponseContinuation(events, {
    worker, resumeDecisionRequestId: "original-owner-question", supervisorId,
    ownerOutcome: { id: "owner-outcome-1", epoch: 7, sha256: outcomeSha }, evidenceCapsule: { id: "capsule-1", sha256: evidenceSha },
    issuedAt: "2026-09-02T00:01:00.000Z", expiresAt: "2026-09-03T00:00:00.000Z",
  });
  const route = events.find((event) => event.data.type === "worker_message_recorded")!;
  if (route.data.type !== "worker_message_recorded") throw new Error("Expected route");
  const packet = JSON.parse(route.data.body.slice(directSupervisoryCycleRoutePrefix.length));
  Object.assign(packet, { worker, continuationBinding: continuation.binding, continuationBindingSha256: continuation.digest, continuationOwnerResponseExactText: continuation.exactOwnerResponseText });
  route.data.body = directSupervisoryCycleRoutePrefix + JSON.stringify(packet);
  const decision = { ...directDecisionEnvelope(lane), continuation_binding: continuation.binding, continuation_binding_sha256: continuation.digest };
  return { events, continuation, decision, candidate: { ...candidate(), body: canonicalDecisionCommentPrefix + JSON.stringify(decision) } };
}

function continuationStore(events: StoredEvent[]) {
  const store = new EventStore(":memory:");
  store.append({ schema_version: 2, event_id: "owner-source", mission_id: "mission-control-live", occurred_at: "2026-09-02T00:00:00.000Z", data: {
    type: "owner_source_recorded", worker: "mission-control-live-slice", receipt_id: "owner-source-1", owner_request_id: "owner-request-1", canonical_locator: "owner-source-fixture",
    source_sha256: "d".repeat(64), worker_copy_sha256: null, capture_integrity: "VERIFIED", acquisition_mode: "OWNER_REATTESTED", receipt_capability: "OWNER_REATTESTED", comparison: "MATCH", freshness: "CURRENT", limitations: [],
  } });
  for (const event of [...events].sort((a, b) => Number(a.data.type !== "reasoning_message_recorded") - Number(b.data.type !== "reasoning_message_recorded"))) {
    const data = { ...event.data };
    if (data.type === "owner_outcome_recorded") delete data.supersedes_outcome_sha256;
    store.append({ ...appendEnvelope(event), data }, event.receivedAt);
    if (data.type === "owner_outcome_recorded") store.append({ schema_version: 2, event_id: "fixture-contract", mission_id: event.missionId, occurred_at: event.occurredAt, data: {
      type: "task_contract_recorded", worker: data.worker, worker_name: "Continuation fixture", contract_id: "fixture-contract", revision: 1,
      task_contract_sha256: "c".repeat(64), owner_outcome_id: data.owner_outcome_id, owner_outcome_epoch: data.epoch, owner_outcome_sha256: data.owner_outcome_sha256,
      goal: "Resolve the owner response", acceptance_criteria: ["Exact canonical continuation receipt"], allowed_scope: ["fixture"], effective_finish_line: "Canonical continuation resolved",
      required_owner_outcome_ids: ["outcome-1"], parent_outcome_remains_open: true,
    } }, event.receivedAt);
  }
  return store;
}

class DecisionMemoryStateStore {
  private state: unknown;
  constructor(initial: unknown) { this.state = structuredClone(initial); }
  async read() { return structuredClone(this.state); }
  async write(value: unknown) { this.state = structuredClone(value); return structuredClone(value); }
  async writeStatus(_value: unknown) {}
}

class DecisionExecutionRuntime {
  events: StoredEvent[];
  lifecycleTypes: string[] = [];
  actualAdmission: any = null;
  actualPreflight: any = null;
  private sequence: number;
  private readonly producer: AuthenticatedProducer;

  constructor(private readonly worker: string, initialEvents: StoredEvent[]) {
    this.events = initialEvents.map((event) => structuredClone(event));
    this.sequence = Math.max(0, ...this.events.map((event) => event.sequence));
    const directive = this.events.findLast((event) => event.data.type === "execution_directive_recorded")?.data;
    if (directive?.type !== "execution_directive_recorded") throw new Error("Expected derived execution directive");
    this.producer = { id: `worker:${worker}`, kind: "WORKER", workerScopes: [worker], taskScopes: [directive.task_id] };
  }

  async fetchFleet() {
    return { generatedAt: new Date().toISOString(), workers: [{ id: this.worker, timeline: this.events }] };
  }

  async requestExecutionAdmission(worker: string, input: any) {
    assert.equal(worker, this.worker);
    const proof = currentExecutionDirectiveProof(worker, this.events);
    assert.ok(proof);
    const now = new Date().toISOString();
    const result = evaluateSupervisionAdmission(worker, this.producer, input, now, undefined, proof);
    this.actualAdmission = result;
    const setterEvidenceId = "setter:decision-directive-e2e:1";
    if (result.mayExecute && result.authorizedWorkExecutionProfile
      && result.authorizedWorkExecutionProfile !== "LEGACY_MODEL_PROFILE_UNSPECIFIED") {
      const authorization = buildWorkExecutionAuthorizationEnvelope({
        worker,
        request: input.request,
        authorizedProfile: result.authorizedWorkExecutionProfile,
        now,
      });
      this.events.push(this.stored(authorization, "SYSTEM", "system:work-profile-admission"));
      this.events.push(this.stored({
        schema_version: 2,
        event_id: setterEvidenceId,
        mission_id: "mission-control-live",
        occurred_at: now,
        data: {
          type: "work_task_creation_selection_applied",
          worker,
          evidence_id: setterEvidenceId,
          authorization_id: result.profileAuthorizationId!,
          directive_id: proof.directiveId,
          directive_revision: proof.directiveRevision,
          task_id: proof.taskId,
          authorized_profile: result.authorizedWorkExecutionProfile,
          model_setter: "gpt-5.6-sol",
          effort_setter: "low",
          fast_request: "DO_NOT_ENABLE_FAST",
          fast_setter: null,
          producer_id: "system:trusted-task-creation",
          source: "TRUSTED_TASK_CREATION_BOUNDARY",
          provider_task_locator: null,
          applied_at: now,
        },
      }, "SYSTEM", "system:trusted-task-creation"));
    }
    return { ...result, setterEvidenceId };
  }

  async requestWorkExecutionPreflight(worker: string, body: any) {
    const now = new Date().toISOString();
    const evaluated = evaluatePersistedWorkExecutionPreflight({ worker, body, events: this.events, now });
    this.events.push(this.stored(evaluated.envelope, "SYSTEM", "system:work-execution-preflight"));
    this.actualPreflight = evaluated.preflight;
    return {
      ...evaluated.preflight,
      preflightId: evaluated.envelope.data.type === "work_execution_preflight_recorded"
        ? evaluated.envelope.data.preflight_id : null,
    };
  }

  async recordWorkerEvents(worker: string, events: unknown[]) {
    assert.equal(worker, this.worker);
    const parsed = events.map((event) => parseAppendEnvelope(event));
    this.lifecycleTypes.push(...parsed.map((event) => event.data.type));
    return { events: parsed };
  }

  private stored(envelope: any, producerKind: StoredEvent["producerKind"], producerId: string): StoredEvent {
    this.sequence += 1;
    return {
      id: this.sequence,
      sequence: this.sequence,
      eventId: envelope.event_id,
      schemaVersion: envelope.schema_version,
      missionId: envelope.mission_id,
      worker: envelope.data.worker ?? null,
      type: envelope.data.type,
      occurredAt: envelope.occurred_at,
      receivedAt: envelope.occurred_at,
      previousHash: null,
      eventHash: "f".repeat(64),
      producerKind,
      producerId,
      data: envelope.data,
    };
  }
}

function relayConfig() {
  return {
    missionControl: { url: "https://mission-control.example" },
    browser: { profileDir: "/tmp/mission-control-decision-directive-browser" },
    runtime: {
      chats: [],
      workerIds: ["mission-control-live-slice"],
      submitEnabled: false,
      capabilityTestEnabled: false,
      pollIntervalMs: 15_000,
      minSubmissionIntervalMs: 60_000,
      retryDelayMs: 300_000,
      maxHotTabs: 3,
      submissionHost: { alias: "fixture", role: "PRIMARY", deploymentEpoch: 1, leaseId: "fixture-lease" },
    },
    memory: { profile: "AUTO", overrides: {} },
  };
}

function fakeCodexSource() {
  return `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'login' && args[1] === 'status') { process.stderr.write('Logged in using ChatGPT\\n'); process.exit(0); }
if (args[0] === 'mcp' && args[1] === 'list') { process.stdout.write('[]'); process.exit(0); }
if (args[0] !== 'exec') process.exit(64);
const resultPath = args[args.indexOf('--output-last-message') + 1];
process.stdout.write(JSON.stringify({ type: 'turn.started' }) + '\\n');
writeFileSync(resultPath, JSON.stringify({ success: true, value: 'ok' }));
process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');
`;
}


test("worker event endpoint cannot bypass authoritative continuation derivation or persistence freshness", () => {
  const fixture = continuationFixture("DIRECT");
  const route = fixture.events.find((event) => event.data.type === "worker_message_recorded")!;
  if (route.data.type !== "worker_message_recorded") throw new Error("Expected route");
  const missing = continuationStore(fixture.events.filter((event) => event.data.type !== "worker_message_recorded" && event.data.type !== "reasoning_message_recorded"));
  try {
    const before = missing.count();
    assert.throws(() => missing.append(appendEnvelope(route), route.receivedAt), /originating supervisor message/);
    assert.equal(missing.count(), before);
  } finally { missing.close(); }

  const store = continuationStore(fixture.events.filter((event) => event.data.type !== "worker_message_recorded"));
  try {
    const forged = structuredClone(route);
    if (forged.data.type !== "worker_message_recorded") throw new Error("Expected route");
    const packet = JSON.parse(forged.data.body.slice(directSupervisoryCycleRoutePrefix.length));
    packet.continuationOwnerResponseExactText = "Worker-invented owner input";
    packet.continuationBinding.owner_input.body_sha256 = sha256(packet.continuationOwnerResponseExactText);
    packet.continuationBinding.supervisor_delivery.body_sha256 = sha256(packet.continuationOwnerResponseExactText);
    const { continuation_id: _, ...causal } = packet.continuationBinding;
    packet.continuationBinding.continuation_id = continuationId(causal);
    packet.continuationBindingSha256 = sha256(canonicalJson(packet.continuationBinding));
    forged.data.body = directSupervisoryCycleRoutePrefix + JSON.stringify(packet);
    assert.throws(() => store.append(appendEnvelope(forged), route.receivedAt), /authoritative events\/current evidence/);
    assert.throws(() => store.append(appendEnvelope(route), "2026-09-03T00:00:01.000Z"), /validity window/);
    const outcome = store.allEvents().find((event) => event.data.type === "owner_outcome_recorded")!;
    if (outcome.data.type !== "owner_outcome_recorded") throw new Error("Expected outcome");
    store.append({ ...appendEnvelope(outcome), event_id: "new-outcome", data: { ...outcome.data, epoch: 8, supersedes: outcome.data.owner_outcome_id, supersedes_outcome_sha256: outcome.data.owner_outcome_sha256 } }, route.receivedAt);
    assert.throws(() => store.append(appendEnvelope(route), route.receivedAt), /current owner outcome/);
  } finally { store.close(); }
});


test("public MCP keeps the historical metadata projection and exposes no continuation OWNER or PM text", () => {
  const fixture = continuationFixture("PROJECT_MANAGER");
  const project = (events: StoredEvent[]) => publicSupervisoryRequestBinding(events, policy(), "decision-request-1", supervisorId, bindingSessionId, "2026-09-02T00:02:20.000Z");
  const publicBinding = project(fixture.events);
  assert.ok(publicBinding);
  assert.deepEqual(publicBinding, project(directDecisionEvents("EXTRA_HIGH_DIRECT")));
  const json = JSON.stringify(publicBinding);
  assert.equal(json.includes(fixture.continuation.exactOwnerResponseText), false);
  assert.equal(json.includes("PM ASSISTANT OUTPUT MUST NOT TRAVEL"), false);
  assert.equal(json.includes("continuationOwnerResponseExactText"), false);
});
