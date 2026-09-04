import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson, sha256 } from "./canonical";
import type { AuthenticatedProducer } from "./ingestion-auth";
import { bindingCapsuleSchema, parseCanonicalDecisionEnvelope, type AppendEnvelope, type BindingCapsule, type CanonicalDecisionEnvelope, type StoredEvent } from "./schema";
import type { EventStore } from "./store";

export const supervisoryCycleRoutePrefix = "MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V3\n";
export const legacySupervisoryCycleRoutePrefix = "MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V2\n";
export const canonicalDecisionCommentPrefix = "MISSION_CONTROL_CANONICAL_DECISION_V1\n";
export const capabilityReceiptCommentPrefix = "MISSION_CONTROL_CHAT_CAPABILITY_RECEIPT_V1\n";
export const stageReceiptCommentPrefix = "MISSION_CONTROL_CHAT_STAGE_RECEIPT_V1\n";
export const capabilityChallengeSummary = "MISSION_CONTROL_CHAT_CAPABILITY_CHALLENGE_V1";
export const capabilityVerifiedSummary = "MISSION_CONTROL_CHAT_CAPABILITY_VERIFIED_V1";
export const modeCapabilityVerifiedSummary = "MISSION_CONTROL_CHAT_MODE_CAPABILITY_VERIFIED_V1";
export const relayStageSummary = "MISSION_CONTROL_RELAY_STAGE_V1";
export const stageLivenessSummary = "MISSION_CONTROL_CHAT_STAGE_LIVENESS_V1";
export const durableStageReceiptAttestationSummary = "MISSION_CONTROL_DURABLE_STAGE_RECEIPT_ATTESTED_V1";
export const providerSessionSummary = "MISSION_CONTROL_PROVIDER_SESSION_V1";
export const providerSessionModelSummary = "MISSION_CONTROL_PROVIDER_SESSION_MODEL_UI_V1";
export const providerSessionMcpSummary = "MISSION_CONTROL_PROVIDER_SESSION_MCP_READ_V1";
export const bindingCapsuleSummary = "MISSION_CONTROL_BINDING_CAPSULE_V1";

export const githubDecisionProducer: AuthenticatedProducer = { id: "system:github-decision-receipts", kind: "SYSTEM", workerScopes: ["*"], taskScopes: ["*"] };
export const githubReceiptCollector: AuthenticatedProducer = { id: "collector:github-supervision-receipts", kind: "COLLECTOR", workerScopes: ["*"], taskScopes: ["*"] };

export interface GitHubReceiptPolicy {
  repository: string;
  decisionIssueNumber: number;
  capabilityIssueNumber: number;
  stageIssueNumber: number;
  authorizedWriterLogins: string[];
  capabilityChallenges: CapabilityChallenge[];
}
export interface CapabilityChallenge {
  challengeId: string; supervisorId: string; chatId: string; worker: string; mcNonce: string; githubNonce: string;
  expiresAt: string; extraHighLabel: string; proLabel: string;
}
export interface PublicCapabilityChallenge {
  schema_version: 1;
  challenge_id: string;
  chat_id: string;
  mc_nonce: string;
  github_nonce_sha256: string;
  github_nonce_source: string;
  receipt_target: string;
  expires_at: string;
}
export interface PendingDecisionRequest {
  worker: string; taskId: string; requestId: string; supervisorId: string; routeSchemaVersion: 2 | 3; nonce: string;
  evidenceCapsule: { id: string; sha256: string };
  ownerOutcome: { id: string; epoch: number; sha256: string };
  reasoningLane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED";
  repository: string; issueNumber: number; stageIssueNumber: number; queuedAt: string; expiresAt: string;
}
export interface GitHubDecisionCandidate {
  repository: string; issueNumber: number; commentId: number; immutableUrl: string; createdAt: string;
  authorLogin: string; deliveryId: string | null; body: string; ingestionMethod: "GITHUB_WEBHOOK" | "RECONCILIATION_POLL";
}
interface CapabilityReceiptBody {
  schemaVersion: 1; challengeId: string; chatId: string; mcNonce: string; githubNonce: string;
  capabilities: ["MISSION_CONTROL_READ", "GITHUB_READ", "GITHUB_WRITE"];
}
export interface StageReceiptBody {
  schemaVersion: 2;
  requestId: string;
  requestNonce: string;
  supervisorId: string;
  bindingProviderSessionId: string;
  stageProviderSessionId: string;
  bindingCapsule: BindingCapsule;
  bindingCapsuleSha256: string;
  stage: "EXTRA_HIGH_READER" | "PRO_DECISION_STAGE";
  status: "STAGE_COMPLETE" | "CONTINUE_REQUIRED";
  evidenceReadingCapsule: { id: string; exactText: string; sha256: string } | null;
  proDecisionBlock: { decisionId: string; exactText: string; sha256: string } | null;
}

export function parseGitHubReceiptPolicy(raw = process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON): GitHubReceiptPolicy | null {
  if (!raw?.trim()) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON must be valid JSON."); }
  const root = record(value, "GitHub receipt policy");
  const repository = repositoryName(root.repository, "repository");
  const decisionIssueNumber = positiveInteger(root.decisionIssueNumber, "decisionIssueNumber");
  const capabilityIssueNumber = positiveInteger(root.capabilityIssueNumber, "capabilityIssueNumber");
  const stageIssueNumber = positiveInteger(root.stageIssueNumber, "stageIssueNumber");
  if (!Array.isArray(root.authorizedWriterLogins) || root.authorizedWriterLogins.length === 0) throw new Error("GitHub receipt policy requires at least one authorizedWriterLogin.");
  const authorizedWriterLogins = root.authorizedWriterLogins.map((item, i) => requiredString(item, `authorizedWriterLogins[${i}]`).toLowerCase());
  if (!Array.isArray(root.capabilityChallenges)) throw new Error("capabilityChallenges must be an array.");
  const capabilityChallenges = root.capabilityChallenges.map((item, i) => {
    const c = record(item, `capabilityChallenges[${i}]`);
    return {
      challengeId: requiredString(c.challengeId, `capabilityChallenges[${i}].challengeId`),
      supervisorId: requiredString(c.supervisorId ?? c.chatId, `capabilityChallenges[${i}].supervisorId`),
      chatId: requiredString(c.chatId, `capabilityChallenges[${i}].chatId`),
      worker: requiredString(c.worker, `capabilityChallenges[${i}].worker`),
      mcNonce: requiredString(c.mcNonce, `capabilityChallenges[${i}].mcNonce`),
      githubNonce: requiredString(c.githubNonce, `capabilityChallenges[${i}].githubNonce`),
      expiresAt: timestamp(c.expiresAt, `capabilityChallenges[${i}].expiresAt`),
      extraHighLabel: requiredString(c.extraHighLabel, `capabilityChallenges[${i}].extraHighLabel`),
      proLabel: requiredString(c.proLabel, `capabilityChallenges[${i}].proLabel`),
    };
  });
  if (new Set(capabilityChallenges.map((c) => c.supervisorId)).size !== capabilityChallenges.length) throw new Error("Capability challenge supervisor IDs must be unique.");
  if (new Set(capabilityChallenges.map((c) => c.challengeId)).size !== capabilityChallenges.length) throw new Error("Capability challenge IDs must be unique.");
  return { repository, decisionIssueNumber, capabilityIssueNumber, stageIssueNumber, authorizedWriterLogins, capabilityChallenges };
}

export function validateConfiguredDecisionLocation(repository: string, issueNumber: number, policy: GitHubReceiptPolicy | null) {
  if (!policy) throw new Error("GitHub supervisory receipt policy is not configured.");
  if (repository.toLowerCase() !== policy.repository.toLowerCase() || issueNumber !== policy.decisionIssueNumber) {
    throw new Error("Supervisory decision route does not match the centrally configured GitHub receipt channel.");
  }
}

export function publicCapabilityChallenge(
  policy: GitHubReceiptPolicy | null,
  challengeId: string,
  now = new Date().toISOString(),
): PublicCapabilityChallenge | null {
  if (!policy || !Number.isFinite(Date.parse(now))) return null;
  const challenge = policy.capabilityChallenges.find((item) => item.challengeId === challengeId);
  if (!challenge || Date.parse(challenge.expiresAt) <= Date.parse(now)) return null;
  const capabilityChannel = `https://github.com/${policy.repository}/issues/${policy.capabilityIssueNumber}`;
  return {
    schema_version: 1,
    challenge_id: challenge.challengeId,
    chat_id: challenge.chatId,
    mc_nonce: challenge.mcNonce,
    github_nonce_sha256: sha256(challenge.githubNonce),
    github_nonce_source: capabilityChannel,
    receipt_target: capabilityChannel,
    expires_at: challenge.expiresAt,
  };
}

export function verifyGitHubWebhookSignature(secret: string | undefined, rawBody: string, signature: string | null): boolean {
  if (!secret || secret.length < 32 || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`);
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function githubDecisionCandidateFromWebhook(payload: unknown, deliveryId: string | null): GitHubDecisionCandidate {
  const root = record(payload, "GitHub webhook payload");
  if (root.action !== "created") throw new Error("Only newly created GitHub issue comments are supervision receipts.");
  const repository = record(root.repository, "repository"), issue = record(root.issue, "issue"), comment = record(root.comment, "comment"), user = record(comment.user, "comment.user");
  return {
    repository: repositoryName(repository.full_name, "repository.full_name"), issueNumber: positiveInteger(issue.number, "issue.number"),
    commentId: positiveInteger(comment.id, "comment.id"), immutableUrl: httpsUrl(comment.html_url, "comment.html_url"),
    createdAt: timestamp(comment.created_at, "comment.created_at"), authorLogin: requiredString(user.login, "comment.user.login"),
    deliveryId: deliveryId ? requiredString(deliveryId, "x-github-delivery") : null, body: requiredString(comment.body, "comment.body"), ingestionMethod: "GITHUB_WEBHOOK",
  };
}

export function parseCanonicalDecisionComment(body: string): CanonicalDecisionEnvelope {
  if (!body.startsWith(canonicalDecisionCommentPrefix)) throw new Error("GitHub comment does not contain the canonical Mission Control decision prefix.");
  let parsed: unknown;
  try { parsed = JSON.parse(body.slice(canonicalDecisionCommentPrefix.length)); } catch { throw new Error("Canonical Mission Control decision comment contains invalid JSON."); }
  const envelope = parseCanonicalDecisionEnvelope(parsed);
  if (sha256(envelope.decision_block.exact_text) !== envelope.decision_block.sha256) throw new Error("Canonical decision block digest mismatch.");
  if (envelope.pro_decision_block.used && sha256(envelope.pro_decision_block.exact_text!) !== envelope.pro_decision_block.sha256) throw new Error("Durable stage-receipt-attested Pro block digest mismatch.");
  if (envelope.schema_version === 2 && sha256(canonicalJson(envelope.binding_capsule)) !== envelope.binding_capsule_sha256) throw new Error("Canonical binding capsule digest mismatch.");
  return envelope;
}

export function parseCapabilityReceiptComment(body: string): CapabilityReceiptBody {
  if (!body.startsWith(capabilityReceiptCommentPrefix)) throw new Error("Not a chat capability receipt.");
  let parsed: unknown;
  try { parsed = JSON.parse(body.slice(capabilityReceiptCommentPrefix.length)); } catch { throw new Error("Chat capability receipt contains invalid JSON."); }
  const root = record(parsed, "chat capability receipt");
  const required = ["MISSION_CONTROL_READ", "GITHUB_READ", "GITHUB_WRITE"] as const;
  const capabilities = root.capabilities;
  if (root.schema_version !== 1 || !Array.isArray(capabilities) || capabilities.length !== required.length || required.some((item, i) => capabilities[i] !== item)) {
    throw new Error("Chat capability receipt must attest the exact ordered read/read/write capability set.");
  }
  return {
    schemaVersion: 1, challengeId: requiredString(root.challenge_id, "challenge_id"), chatId: requiredString(root.chat_id, "chat_id"),
    mcNonce: requiredString(root.mc_nonce, "mc_nonce"), githubNonce: requiredString(root.github_nonce, "github_nonce"), capabilities: [...required],
  };
}

export function parseStageReceiptComment(body: string): StageReceiptBody {
  if (!body.startsWith(stageReceiptCommentPrefix)) throw new Error("Not a chat stage receipt.");
  let parsed: unknown;
  try { parsed = JSON.parse(body.slice(stageReceiptCommentPrefix.length)); } catch { throw new Error("Chat stage receipt contains invalid JSON."); }
  const root = record(parsed, "chat stage receipt");
  const stage = requiredString(root.stage, "stage");
  const status = requiredString(root.status, "status");
  if (root.schema_version !== 2) throw new Error("Fresh-stage receipt schema_version must be 2.");
  if (stage !== "EXTRA_HIGH_READER" && stage !== "PRO_DECISION_STAGE") throw new Error("Chat stage receipt has an unsupported stage.");
  if (status !== "STAGE_COMPLETE" && status !== "CONTINUE_REQUIRED") throw new Error("Chat stage receipt has an unsupported status.");
  const capsule = bindingCapsuleSchema.parse(root.binding_capsule);
  const bindingCapsuleSha256 = digest(root.binding_capsule_sha256, "binding_capsule_sha256");
  if (sha256(canonicalJson(capsule)) !== bindingCapsuleSha256) throw new Error("Stage receipt binding capsule digest mismatch.");
  const evidenceReadingCapsule = root.evidence_reading_capsule == null ? null : parseDurableTextCapsule(root.evidence_reading_capsule, "evidence_reading_capsule", "id");
  const proDecisionBlock = root.pro_decision_block == null ? null : parseDurableTextCapsule(root.pro_decision_block, "pro_decision_block", "decision_id");
  if (stage === "EXTRA_HIGH_READER" && status === "STAGE_COMPLETE" && !evidenceReadingCapsule) throw new Error("A complete reader receipt requires an evidence-reading capsule.");
  if (stage === "PRO_DECISION_STAGE" && status === "STAGE_COMPLETE" && !proDecisionBlock) throw new Error("A complete Pro decision stage requires a canonical Pro decision block.");
  if (stage === "EXTRA_HIGH_READER" && proDecisionBlock) throw new Error("A reader receipt cannot claim a Pro decision block.");
  if (stage === "PRO_DECISION_STAGE" && evidenceReadingCapsule) throw new Error("A Pro receipt cannot replace the reader evidence capsule.");
  return {
    schemaVersion: 2,
    requestId: requiredString(root.request_id, "request_id"),
    requestNonce: requiredString(root.request_nonce, "request_nonce"),
    supervisorId: requiredString(root.supervisor_id, "supervisor_id"),
    bindingProviderSessionId: requiredString(root.binding_provider_session_id, "binding_provider_session_id"),
    stageProviderSessionId: requiredString(root.stage_provider_session_id, "stage_provider_session_id"),
    bindingCapsule: capsule,
    bindingCapsuleSha256,
    stage,
    status,
    evidenceReadingCapsule,
    proDecisionBlock,
  };
}

export function ensureConfiguredCapabilityChallenges(store: EventStore, policy: GitHubReceiptPolicy | null, now = new Date().toISOString()) {
  if (!policy) return [];
  const events = store.allEvents(), appended: StoredEvent[] = [];
  for (const challenge of policy.capabilityChallenges) {
    const receiptId = `chat-capability-challenge:${challenge.challengeId}`;
    if (events.some((e) => e.data.type === "evidence_receipt_recorded" && e.data.receipt_id === receiptId)) continue;
    appended.push(store.append(evidenceEnvelope({
      worker: challenge.worker, receiptId, producer: githubReceiptCollector, summary: capabilityChallengeSummary, occurredAt: now, verified: true,
      refs: [
        `challenge:${challenge.challengeId}`, `chat:${challenge.chatId}`, `mc_nonce:${challenge.mcNonce}`,
        `supervisor:${challenge.supervisorId}`,
        `github_nonce_sha256:${sha256(challenge.githubNonce)}`,
        `github_nonce_source:https://github.com/${policy.repository}/issues/${policy.capabilityIssueNumber}`,
        `receipt_target:https://github.com/${policy.repository}/issues/${policy.capabilityIssueNumber}`,
        `stage_receipt_target:https://github.com/${policy.repository}/issues/${policy.stageIssueNumber}`,
        `expires_at:${challenge.expiresAt}`, `extra_high_label:${challenge.extraHighLabel}`, `pro_label:${challenge.proLabel}`,
      ],
    }), now, githubReceiptCollector));
  }
  return appended;
}

export function ingestGitHubSupervisionCandidate(store: EventStore, candidate: GitHubDecisionCandidate, policy: GitHubReceiptPolicy | null, ingestedAt = new Date().toISOString()): StoredEvent[] {
  if (!policy) throw new Error("GitHub supervisory receipt policy is not configured.");
  assertAuthorizedWriter(candidate, policy);
  const events = store.allEvents();
  if (candidate.body.startsWith(canonicalDecisionCommentPrefix)) {
    if (candidate.repository.toLowerCase() !== policy.repository.toLowerCase() || candidate.issueNumber !== policy.decisionIssueNumber) throw new Error("Decision receipt arrived outside the configured GitHub decision channel.");
    const envelope = buildGitHubDecisionReceiptEnvelope(events, candidate, policy, ingestedAt);
    if (envelope.data.type !== "github_decision_receipt_ingested") throw new Error("Canonical decision envelope has an unexpected event type.");
    if (events.some((e) => e.eventId === envelope.event_id)) return [];
    const decisionData = envelope.data;
    const decision = store.append(envelope, ingestedAt, githubDecisionProducer);
    const attestation = store.append(evidenceEnvelope({
      worker: decisionData.worker, receiptId: `durable-stage-receipt-attestation:${candidate.commentId}`, producer: githubReceiptCollector,
      summary: durableStageReceiptAttestationSummary, occurredAt: candidate.createdAt, verified: true,
      refs: [`request:${decisionData.request_id}`, ...(decisionData.supervisor_id ? [`supervisor:${decisionData.supervisor_id}`] : []), ...(decisionData.binding_provider_session_id ? [`binding_provider_session:${decisionData.binding_provider_session_id}`] : []), ...(decisionData.stage_provider_session_id ? [`stage_provider_session:${decisionData.stage_provider_session_id}`] : []), `reasoning_lane:${decisionData.reasoning_lane}`, `github_comment:${candidate.immutableUrl}`, ...(decisionData.pro_decision_block.used ? ["provenance:DURABLE_STAGE_RECEIPT_ATTESTED", "independent_pro_observation:false"] : ["provenance:EXTRA_HIGH_DIRECT"] )],
    }), ingestedAt, githubReceiptCollector);
    return [decision, attestation];
  }
  if (candidate.body.startsWith(capabilityReceiptCommentPrefix)) {
    if (candidate.repository.toLowerCase() !== policy.repository.toLowerCase() || candidate.issueNumber !== policy.capabilityIssueNumber) throw new Error("Capability receipt arrived outside the configured GitHub capability channel.");
    const capability = parseCapabilityReceiptComment(candidate.body);
    const challenge = policy.capabilityChallenges.find((c) => c.challengeId === capability.challengeId);
    if (!challenge || challenge.chatId !== capability.chatId) throw new Error("Capability receipt does not match a configured chat challenge.");
    if (capability.mcNonce !== challenge.mcNonce || capability.githubNonce !== challenge.githubNonce) throw new Error("Capability receipt nonce mismatch.");
    if (Date.parse(candidate.createdAt) > Date.parse(challenge.expiresAt)) throw new Error("Capability receipt is expired.");
    const receiptId = `chat-capability-verified:${capability.chatId}:${candidate.commentId}`;
    if (events.some((e) => e.data.type === "evidence_receipt_recorded" && e.data.receipt_id === receiptId)) return [];
    return [store.append(evidenceEnvelope({
      worker: challenge.worker, receiptId, producer: githubReceiptCollector, summary: capabilityVerifiedSummary, occurredAt: candidate.createdAt, verified: true,
      refs: [`challenge:${challenge.challengeId}`, `supervisor:${challenge.supervisorId}`, `chat:${challenge.chatId}`, "capability:missionControlRead", "capability:githubRead", "capability:githubWrite", `expires_at:${challenge.expiresAt}`, `github_comment:${candidate.immutableUrl}`],
    }), ingestedAt, githubReceiptCollector)];
  }
  if (candidate.body.startsWith(stageReceiptCommentPrefix)) {
    if (candidate.repository.toLowerCase() !== policy.repository.toLowerCase() || candidate.issueNumber !== policy.stageIssueNumber) throw new Error("Stage receipt arrived outside the configured GitHub stage-liveness channel.");
    const stage = parseStageReceiptComment(candidate.body);
    const matches = pendingDecisionRequests(events).filter((request) => request.requestId === stage.requestId);
    if (matches.length !== 1) throw new Error(`Expected one pending supervisory request for stage receipt ${stage.requestId}; found ${matches.length}.`);
    const request = matches[0]!;
    if (request.reasoningLane !== "PRO_ESCALATED") throw new Error("Stage receipts are only valid for escalated durable-stage supervision.");
    if (stage.requestNonce !== request.nonce) throw new Error("Stage receipt does not match the pending request nonce binding.");
    if (request.routeSchemaVersion !== 3) throw new Error("Legacy same-chat stage receipts cannot satisfy fresh-stage admission.");
    if (stage.supervisorId !== request.supervisorId) throw new Error("Stage receipt does not match the pending supervisor binding.");
    const receiptId = `chat-stage:${stage.requestId}:${stage.stage}:${candidate.commentId}`;
    if (events.some((e) => e.data.type === "evidence_receipt_recorded" && e.data.receipt_id === receiptId)) return [];
    assertExactBindingCapsule(events, request, stage.bindingCapsule, stage.bindingCapsuleSha256, stage.bindingProviderSessionId, candidate.createdAt);
    assertFreshStageProviderSession(events, request, stage.bindingProviderSessionId, stage.stageProviderSessionId, stage.stage === "EXTRA_HIGH_READER" ? "EXTRA_HIGH_READER" : "PRO_REASONER", candidate.createdAt, policy);
    assertUnusedStageProviderSession(events, request, stage.stageProviderSessionId);
    const created = Date.parse(candidate.createdAt);
    if (created < Date.parse(request.queuedAt) || created > Date.parse(request.expiresAt)) throw new Error("Stage receipt is stale for the pending request window.");
    return [store.append(evidenceEnvelope({
      worker: request.worker,
      receiptId,
      producer: githubReceiptCollector,
      summary: stageLivenessSummary,
      occurredAt: candidate.createdAt,
      verified: true,
      refs: [
        `request:${stage.requestId}`,
        `request_nonce_sha256:${sha256(stage.requestNonce)}`,
        `supervisor:${stage.supervisorId}`,
        `binding_provider_session:${stage.bindingProviderSessionId}`,
        `stage_provider_session:${stage.stageProviderSessionId}`,
        `binding_capsule_id:${stage.bindingCapsule.binding_capsule_id}`,
        `binding_capsule_sha256:${stage.bindingCapsuleSha256}`,
        `stage:${stage.stage}`,
        `status:${stage.status}`,
        `github_comment:${candidate.immutableUrl}`,
        ...(stage.evidenceReadingCapsule ? [`evidence_reading_capsule:${stage.evidenceReadingCapsule.id}`, `evidence_reading_capsule_sha256:${stage.evidenceReadingCapsule.sha256}`] : []),
        ...(stage.proDecisionBlock ? [`pro_decision_id:${stage.proDecisionBlock.decisionId}`, `pro_decision_sha256:${stage.proDecisionBlock.sha256}`, "semantic_authority:PRO"] : ["semantic_authority:false"]),
      ],
    }), ingestedAt, githubReceiptCollector)];
  }
  throw new Error("GitHub comment is not a recognized Mission Control supervision receipt.");
}

export function pendingDecisionRequests(events: StoredEvent[]): PendingDecisionRequest[] {
  const completed = new Set(events.flatMap((e) => e.data.type === "github_decision_receipt_ingested" ? [e.data.request_id] : []));
  return events.flatMap((event) => {
    if (event.data.type !== "worker_message_recorded"
      || (!event.data.body.startsWith(supervisoryCycleRoutePrefix) && !event.data.body.startsWith(legacySupervisoryCycleRoutePrefix))) return [];
    const request = parseCycleRequest(event.data.body, event.data.worker);
    return request && !completed.has(request.requestId) ? [request] : [];
  });
}

export function buildGitHubDecisionReceiptEnvelope(events: StoredEvent[], candidate: GitHubDecisionCandidate, policy: GitHubReceiptPolicy, ingestedAt = new Date().toISOString()): AppendEnvelope {
  const decision = parseCanonicalDecisionComment(candidate.body);
  const matches = pendingDecisionRequests(events).filter((r) => r.requestId === decision.request_id);
  if (matches.length !== 1) throw new Error(`Expected one pending supervisory decision request for ${decision.request_id}; found ${matches.length}.`);
  const request = matches[0]!;
  validateConfiguredDecisionLocation(request.repository, request.issueNumber, policy);
  assertEqual(decision.nonce, request.nonce, "decision nonce");
  assertEqual(decision.evidence_capsule.id, request.evidenceCapsule.id, "evidence capsule ID");
  assertEqual(decision.evidence_capsule.sha256, request.evidenceCapsule.sha256, "evidence capsule digest");
  assertEqual(decision.owner_outcome.id, request.ownerOutcome.id, "owner-outcome ID");
  assertEqual(decision.owner_outcome.epoch, request.ownerOutcome.epoch, "owner-outcome epoch");
  assertEqual(decision.owner_outcome.sha256, request.ownerOutcome.sha256, "owner-outcome digest");
  assertEqual(decision.reasoning_lane, request.reasoningLane, "reasoning lane");
  if (request.routeSchemaVersion === 3) {
    if (decision.schema_version !== 2) throw new Error("A provider-session supervisory cycle requires canonical decision schema_version 2.");
    assertEqual(decision.supervisor_id, request.supervisorId, "supervisor ID");
    assertExactBindingCapsule(events, request, decision.binding_capsule, decision.binding_capsule_sha256, decision.binding_provider_session_id, candidate.createdAt);
    const finalStep = request.reasoningLane === "PRO_ESCALATED" ? "EXTRA_HIGH_WRITER" : "EXTRA_HIGH_DIRECT";
    assertFreshStageProviderSession(events, request, decision.binding_provider_session_id, decision.stage_provider_session_id, finalStep, candidate.createdAt, policy);
  }
  assertEqual(candidate.repository.toLowerCase(), policy.repository.toLowerCase(), "GitHub repository");
  assertEqual(candidate.issueNumber, policy.decisionIssueNumber, "GitHub issue number");
  const created = Date.parse(candidate.createdAt);
  if (created < Date.parse(request.queuedAt) || created > Date.parse(request.expiresAt)) throw new Error("GitHub decision receipt is stale for the admitted request window.");
  const currentOutcome = [...events].reverse().find((e) => e.worker === request.worker && e.data.type === "owner_outcome_recorded")?.data;
  if (currentOutcome?.type !== "owner_outcome_recorded" || currentOutcome.owner_outcome_id !== request.ownerOutcome.id || currentOutcome.epoch !== request.ownerOutcome.epoch || currentOutcome.owner_outcome_sha256 !== request.ownerOutcome.sha256) {
    throw new Error("GitHub decision receipt is stale against the current owner-outcome epoch.");
  }
  assertCurrentChatCapabilities(events, request, candidate.createdAt, policy);
  assertSemanticStageCompletion(events, request, candidate.createdAt, decision);
  assertOrderedRelayStages(events, request, candidate.createdAt, policy, decision);
  return {
    schema_version: 2,
    event_id: `github-decision-receipt:${sha256(`${candidate.repository}:${candidate.commentId}`).slice(0, 32)}`,
    mission_id: "mission-control-live",
    occurred_at: candidate.createdAt,
    data: {
      type: "github_decision_receipt_ingested", worker: request.worker, task_id: request.taskId, receipt_id: `github-comment:${candidate.commentId}`,
      request_id: request.requestId, supervisor_id: decision.schema_version === 2 ? decision.supervisor_id : null,
      provider_session_id: null,
      binding_provider_session_id: decision.schema_version === 2 ? decision.binding_provider_session_id : null,
      stage_provider_session_id: decision.schema_version === 2 ? decision.stage_provider_session_id : null,
      binding_capsule: decision.schema_version === 2 ? decision.binding_capsule : null,
      binding_capsule_sha256: decision.schema_version === 2 ? decision.binding_capsule_sha256 : null,
      staged_provenance: decision.schema_version === 2 ? decision.staged_provenance : null,
      nonce: request.nonce, evidence_capsule: request.evidenceCapsule,
      owner_outcome_id: request.ownerOutcome.id, owner_outcome_epoch: request.ownerOutcome.epoch, owner_outcome_sha256: request.ownerOutcome.sha256,
      reasoning_lane: request.reasoningLane, decision_block: decision.decision_block, pro_decision_block: decision.pro_decision_block,
      writer_contract: decision.writer_contract, canonical_envelope_sha256: sha256(canonicalJson(decision)),
      github_receipt: {
        repository: candidate.repository, issue_number: candidate.issueNumber, comment_id: candidate.commentId, immutable_url: candidate.immutableUrl,
        github_created_at: candidate.createdAt, github_author_login: candidate.authorLogin, github_delivery_id: candidate.deliveryId,
      },
      ingestion_method: candidate.ingestionMethod, ingested_at: ingestedAt,
    },
  };
}

export async function reconcileGitHubDecisionReceipts(store: EventStore, options: { token?: string; policy: GitHubReceiptPolicy; fetchImpl?: typeof fetch; now?: string }): Promise<StoredEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch, appended: StoredEvent[] = [];
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "mission-control-supervision-reconciler",
  };
  if (options.token?.trim()) headers.authorization = `Bearer ${options.token}`;
  for (const issueNumber of [...new Set([options.policy.decisionIssueNumber, options.policy.capabilityIssueNumber, options.policy.stageIssueNumber])]) {
    const response = await fetchImpl(`https://api.github.com/repos/${options.policy.repository}/issues/${issueNumber}/comments?per_page=100&sort=created&direction=desc`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub reconciliation failed for ${options.policy.repository}#${issueNumber} with HTTP ${response.status}.`);
    const comments = await response.json();
    if (!Array.isArray(comments)) throw new Error("GitHub reconciliation returned a non-array comment payload.");
    for (const value of [...comments].reverse()) {
      const comment = record(value, "GitHub issue comment");
      if (typeof comment.body !== "string" || (!comment.body.startsWith(canonicalDecisionCommentPrefix) && !comment.body.startsWith(capabilityReceiptCommentPrefix) && !comment.body.startsWith(stageReceiptCommentPrefix))) continue;
      const user = record(comment.user, "comment.user");
      const candidate: GitHubDecisionCandidate = {
        repository: options.policy.repository, issueNumber, commentId: positiveInteger(comment.id, "comment.id"), immutableUrl: httpsUrl(comment.html_url, "comment.html_url"),
        createdAt: timestamp(comment.created_at, "comment.created_at"), authorLogin: requiredString(user.login, "comment.user.login"), deliveryId: null,
        body: comment.body, ingestionMethod: "RECONCILIATION_POLL",
      };
      try { appended.push(...ingestGitHubSupervisionCandidate(store, candidate, options.policy, options.now)); } catch { /* skip invalid/unrelated receipts */ }
    }
  }
  return appended;
}

function assertCurrentChatCapabilities(events: StoredEvent[], request: PendingDecisionRequest, at: string, policy: GitHubReceiptPolicy) {
  const challenge = policy.capabilityChallenges.find((c) => c.supervisorId === request.supervisorId);
  if (!challenge) throw new Error(`No central capability challenge is configured for supervisor ${request.supervisorId}.`);
  if (!latestEvidence(events, capabilityVerifiedSummary, challenge.chatId, at, ["capability:missionControlRead", "capability:githubRead", "capability:githubWrite"])) {
    throw new Error(`Supervisor ${request.supervisorId} lacks a current Mission Control/GitHub capability receipt.`);
  }
  if (!latestEvidence(events, modeCapabilityVerifiedSummary, challenge.chatId, at, ["capability:modeSwitching", `extra_high_label:${challenge.extraHighLabel}`, `pro_label:${challenge.proLabel}`])) {
    throw new Error(`Supervisor ${request.supervisorId} lacks a current exact model-label switching receipt.`);
  }
}

function assertSemanticStageCompletion(events: StoredEvent[], request: PendingDecisionRequest, at: string, decision?: CanonicalDecisionEnvelope) {
  if (request.reasoningLane !== "PRO_ESCALATED") return;
  if (request.routeSchemaVersion !== 3) throw new Error("Legacy same-chat stage completion cannot satisfy fresh-stage admission.");
  let minimumSequence = -1;
  for (const stage of ["EXTRA_HIGH_READER", "PRO_DECISION_STAGE"] as const) {
    const receipts = events.filter((event) => event.sequence > minimumSequence && event.data.type === "evidence_receipt_recorded"
      && event.data.summary === stageLivenessSummary && event.data.verified
      && event.data.refs.includes(`request:${request.requestId}`)
      && event.data.refs.includes(`supervisor:${request.supervisorId}`)
      && event.data.refs.includes(`stage:${stage}`)
      && Date.parse(event.occurredAt) >= Date.parse(request.queuedAt)
      && Date.parse(event.occurredAt) <= Date.parse(at));
    const latest = receipts.at(-1);
    if (!latest || latest.data.type !== "evidence_receipt_recorded" || !latest.data.refs.includes("status:STAGE_COMPLETE")) {
      throw new Error(`Missing current semantic stage completion ${stage} for ${request.requestId}.`);
    }
    if (stage === "PRO_DECISION_STAGE" && decision?.schema_version === 2
      && !latest!.data.refs.includes(`pro_decision_sha256:${decision.pro_decision_block.sha256}`)) {
      throw new Error("Final canonical decision does not exactly match the durable Pro decision-stage digest.");
    }
    minimumSequence = latest.sequence;
  }
}

function assertOrderedRelayStages(events: StoredEvent[], request: PendingDecisionRequest, at: string, policy: GitHubReceiptPolicy, decision?: CanonicalDecisionEnvelope) {
  const challenge = policy.capabilityChallenges.find((c) => c.supervisorId === request.supervisorId);
  if (!challenge) throw new Error(`No capability policy exists for supervisor ${request.supervisorId}.`);
  if (request.routeSchemaVersion !== 3 || decision?.schema_version !== 2) throw new Error("Fresh-stage relay ordering requires the split-session schema.");
  const bindingProviderSessionId = decision.binding_provider_session_id;
  const semanticStages: Array<readonly [string, string, string]> = request.reasoningLane === "PRO_ESCALATED"
    ? [
      ["EXTRA_HIGH_READER", challenge.extraHighLabel, stageProviderSessionFor(events, request, "EXTRA_HIGH_READER", at)],
      ["PRO_REASONER", challenge.proLabel, stageProviderSessionFor(events, request, "PRO_DECISION_STAGE", at)],
      ["EXTRA_HIGH_WRITER", challenge.extraHighLabel, decision.stage_provider_session_id],
    ]
    : [["EXTRA_HIGH_DIRECT", challenge.extraHighLabel, decision.stage_provider_session_id]];
  const required: Array<readonly [string, string, string]> = [["MCP_BINDING_PRELOAD", challenge.extraHighLabel, bindingProviderSessionId], ...semanticStages];
  let minimumSequence = -1;
  const seenSessions = new Set<string>();
  for (const [step, label, providerSessionId] of required) {
    if (seenSessions.has(providerSessionId)) throw new Error(`Provider session ${providerSessionId} was reused across mandatory first-message stages.`);
    seenSessions.add(providerSessionId);
    const selectedApp = step === "MCP_BINDING_PRELOAD" ? "Mission Control" : "GitHub";
    const receipt = events.find((e) => e.sequence > minimumSequence && e.data.type === "evidence_receipt_recorded" && e.data.summary === relayStageSummary && e.data.verified
      && e.data.refs.includes(`request:${request.requestId}`) && e.data.refs.includes(`step:${step}`)
      && e.data.refs.includes(`supervisor:${request.supervisorId}`) && e.data.refs.includes(`provider_session:${providerSessionId}`)
      && e.data.refs.includes(`binding_provider_session:${bindingProviderSessionId}`)
      && e.data.refs.includes(`model_ui_label:${label}`) && e.data.refs.includes("generation_state:COMPLETE")
      && e.data.refs.includes("app_selection_attempted:true") && e.data.refs.includes(`selected_app:${selectedApp}`)
      && e.data.refs.includes("message_ordinal:1") && e.data.refs.includes("first_message:true")
      && e.data.refs.includes("assistant_content_observed:false") && Date.parse(e.occurredAt) >= Date.parse(request.queuedAt) && Date.parse(e.occurredAt) <= Date.parse(at));
    if (!receipt) throw new Error(`Missing ordered relay stage receipt ${step} for ${request.requestId}.`);
    minimumSequence = receipt.sequence;
  }
}

function latestEvidence(events: StoredEvent[], summary: string, chatId: string, at: string, requiredRefs: string[]) {
  return [...events].reverse().find((event) => {
    const data = event.data;
    if (data.type !== "evidence_receipt_recorded") return false;
    if (data.summary !== summary || !data.verified || !data.refs.includes(`chat:${chatId}`) || requiredRefs.some((ref) => !data.refs.includes(ref))) return false;
    const expiry = data.refs.find((ref) => ref.startsWith("expires_at:"))?.slice("expires_at:".length);
    return Boolean(expiry && Date.parse(expiry) >= Date.parse(at) && Date.parse(event.occurredAt) <= Date.parse(at));
  }) ?? null;
}

export function findOpenProviderSession(
  events: StoredEvent[],
  request: PendingDecisionRequest,
  providerSessionId: string,
  at: string,
) {
  if (request.routeSchemaVersion !== 3 || !Number.isFinite(Date.parse(at))) return null;
  const session = [...events].reverse().find((event) => event.data.type === "evidence_receipt_recorded"
    && event.data.summary === providerSessionSummary && event.data.verified
    && event.data.refs.includes(`request:${request.requestId}`)
    && event.data.refs.includes(`supervisor:${request.supervisorId}`)
    && event.data.refs.includes(`provider_session:${providerSessionId}`)
    && Date.parse(event.occurredAt) >= Date.parse(request.queuedAt)
    && Date.parse(event.occurredAt) <= Date.parse(at));
  return session?.data.type === "evidence_receipt_recorded" && session.data.refs.includes("lifecycle_status:ACTIVE") ? session : null;
}

function assertExactBindingCapsule(events: StoredEvent[], request: PendingDecisionRequest, capsule: BindingCapsule, capsuleSha256: string, bindingProviderSessionId: string, at: string) {
  const expected = {
    schema_version: 1,
    binding_capsule_id: capsule.binding_capsule_id,
    request_id: request.requestId,
    request_nonce: request.nonce,
    supervisor_id: request.supervisorId,
    binding_provider_session_id: bindingProviderSessionId,
    binding_receipt_id: capsule.binding_receipt_id,
    worker_id: request.worker,
    reasoning_lane: request.reasoningLane,
    queued_at: request.queuedAt,
    expires_at: request.expiresAt,
    evidence_capsule: request.evidenceCapsule,
    owner_outcome: request.ownerOutcome,
    receipt_targets: { repository: request.repository, decision_issue_number: request.issueNumber, stage_issue_number: request.stageIssueNumber },
  };
  if (canonicalJson(capsule) !== canonicalJson(expected) || sha256(canonicalJson(capsule)) !== capsuleSha256) throw new Error("Supplied binding capsule does not exactly match the pending request.");
  if (!events.some((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === providerSessionMcpSummary && event.data.verified
    && event.data.receipt_id === capsule.binding_receipt_id
    && event.data.refs.includes(`request:${request.requestId}`)
    && event.data.refs.includes(`supervisor:${request.supervisorId}`)
    && event.data.refs.includes(`provider_session:${bindingProviderSessionId}`)
    && event.data.refs.includes("tool:get_supervisory_request_binding") && event.data.refs.includes("status:OK")
    && Date.parse(event.occurredAt) >= Date.parse(request.queuedAt) && Date.parse(event.occurredAt) <= Date.parse(at))) {
    throw new Error("Binding capsule lacks its exact current Stage-1 MCP receipt.");
  }
  const bindingSession = [...events].reverse().find((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === providerSessionSummary && event.data.verified
    && event.data.refs.includes(`request:${request.requestId}`) && event.data.refs.includes(`supervisor:${request.supervisorId}`)
    && event.data.refs.includes(`provider_session:${bindingProviderSessionId}`) && event.data.refs.includes(`binding_provider_session:${bindingProviderSessionId}`)
    && event.data.refs.includes("session_role:MC_BINDING_PRELOAD_SESSION"));
  if (!bindingSession || bindingSession.data.type !== "evidence_receipt_recorded"
    || !bindingSession.data.refs.includes("lifecycle_status:COMPLETE") || !bindingSession.data.refs.includes("url_binding_status:EXACT")
    || !bindingSession.data.refs.includes("message_ordinal:1") || !bindingSession.data.refs.some((ref) => ref.startsWith("conversation_url:https://chatgpt.com/c/"))) {
    throw new Error("Binding capsule lacks an exact completed Stage-1 provider session.");
  }
  if (!events.some((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === relayStageSummary && event.data.verified
    && event.data.refs.includes(`request:${request.requestId}`) && event.data.refs.includes(`provider_session:${bindingProviderSessionId}`)
    && event.data.refs.includes("step:MCP_BINDING_PRELOAD") && event.data.refs.includes("generation_state:COMPLETE")
    && event.data.refs.includes("message_ordinal:1") && event.data.refs.includes("first_message:true")
    && event.data.refs.includes("app_selection_attempted:true") && event.data.refs.includes("selected_app:Mission Control")
    && event.data.refs.includes("assistant_content_observed:false"))) {
    throw new Error("Binding capsule lacks a first-message Mission Control preload transport receipt.");
  }
  if (!events.some((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === bindingCapsuleSummary && event.data.verified
    && event.data.refs.includes(`request:${request.requestId}`)
    && event.data.refs.includes(`binding_provider_session:${bindingProviderSessionId}`)
    && event.data.refs.includes(`binding_receipt:${capsule.binding_receipt_id}`)
    && event.data.refs.includes(`binding_capsule_id:${capsule.binding_capsule_id}`)
    && event.data.refs.includes(`binding_capsule_sha256:${capsuleSha256}`))) {
    throw new Error("Binding capsule is not durably recorded in Mission Control transport state.");
  }
  return capsule;
}

function assertFreshStageProviderSession(events: StoredEvent[], request: PendingDecisionRequest, bindingProviderSessionId: string, stageProviderSessionId: string, step: string, at: string, policy: GitHubReceiptPolicy) {
  if (bindingProviderSessionId === stageProviderSessionId) throw new Error("Binding and stage provider sessions must be distinct.");
  const challenge = policy.capabilityChallenges.find((item) => item.supervisorId === request.supervisorId);
  if (!challenge) throw new Error(`No capability policy exists for supervisor ${request.supervisorId}.`);
  const expectedLabel = step === "PRO_REASONER" ? challenge.proLabel : challenge.extraHighLabel;
  const expectedRole = `${step}_SESSION`;
  const session = [...events].reverse().find((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === providerSessionSummary && event.data.verified
    && event.data.refs.includes(`request:${request.requestId}`) && event.data.refs.includes(`supervisor:${request.supervisorId}`)
    && event.data.refs.includes(`provider_session:${stageProviderSessionId}`) && event.data.refs.includes(`binding_provider_session:${bindingProviderSessionId}`)
    && event.data.refs.includes(`stage_provider_session:${stageProviderSessionId}`) && event.data.refs.includes(`session_role:${expectedRole}`));
  if (!session || session.data.type !== "evidence_receipt_recorded" || !session.data.refs.includes("lifecycle_status:COMPLETE")
    || !session.data.refs.includes("url_binding_status:EXACT") || !session.data.refs.includes("message_ordinal:1")
    || !session.data.refs.some((ref) => ref.startsWith("conversation_url:https://chatgpt.com/c/"))) {
    throw new Error(`Fresh stage provider session ${stageProviderSessionId} is not complete and exact for ${step}.`);
  }
  const relay = events.find((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === relayStageSummary && event.data.verified
    && event.data.refs.includes(`request:${request.requestId}`) && event.data.refs.includes(`supervisor:${request.supervisorId}`)
    && event.data.refs.includes(`provider_session:${stageProviderSessionId}`) && event.data.refs.includes(`binding_provider_session:${bindingProviderSessionId}`)
    && event.data.refs.includes(`stage_provider_session:${stageProviderSessionId}`) && event.data.refs.includes(`step:${step}`)
    && event.data.refs.includes(`model_ui_label:${expectedLabel}`) && event.data.refs.includes("generation_state:COMPLETE")
    && event.data.refs.includes("message_ordinal:1") && event.data.refs.includes("first_message:true")
    && event.data.refs.includes("app_selection_attempted:true") && event.data.refs.includes(`selected_app:${request.repository === policy.repository ? "GitHub" : "INVALID"}`)
    && event.data.refs.includes("assistant_content_observed:false")
    && Date.parse(event.occurredAt) >= Date.parse(request.queuedAt) && Date.parse(event.occurredAt) <= Date.parse(at));
  if (!relay) throw new Error(`Fresh stage ${step} lacks a first-message GitHub transport receipt.`);
  return relay;
}

function assertUnusedStageProviderSession(events: StoredEvent[], request: PendingDecisionRequest, stageProviderSessionId: string) {
  if (events.some((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === stageLivenessSummary
    && event.data.refs.includes(`request:${request.requestId}`)
    && event.data.refs.includes(`stage_provider_session:${stageProviderSessionId}`))) {
    throw new Error(`Stage provider session ${stageProviderSessionId} was already used by another durable stage receipt.`);
  }
}

function stageProviderSessionFor(events: StoredEvent[], request: PendingDecisionRequest, stage: "EXTRA_HIGH_READER" | "PRO_DECISION_STAGE", at: string) {
  const receipt = [...events].reverse().find((event) => event.data.type === "evidence_receipt_recorded" && event.data.summary === stageLivenessSummary && event.data.verified
    && event.data.refs.includes(`request:${request.requestId}`) && event.data.refs.includes(`supervisor:${request.supervisorId}`)
    && event.data.refs.includes(`stage:${stage}`) && event.data.refs.includes("status:STAGE_COMPLETE")
    && Date.parse(event.occurredAt) >= Date.parse(request.queuedAt) && Date.parse(event.occurredAt) <= Date.parse(at));
  const stageProviderSessionId = receipt?.data.type === "evidence_receipt_recorded" ? refValue(receipt.data.refs, "stage_provider_session:") : null;
  if (!stageProviderSessionId) throw new Error(`Stage ${stage} lacks a bound provider session.`);
  return stageProviderSessionId;
}

function parseCycleRequest(body: string, worker: string): PendingDecisionRequest | null {
  try {
    const current = body.startsWith(supervisoryCycleRoutePrefix);
    const prefix = current ? supervisoryCycleRoutePrefix : legacySupervisoryCycleRoutePrefix;
    const root = record(JSON.parse(body.slice(prefix.length)), "cycle request"), evidence = record(root.evidenceCapsule, "evidenceCapsule"), outcome = record(root.ownerOutcome, "ownerOutcome"), github = record(root.githubReceipt, "githubReceipt"), factual = record(root.factualPacket, "factualPacket");
    if ((current && (root.schemaVersion !== 3 || root.packetKind !== "PROVIDER_SESSION_SUPERVISORY_CYCLE"))
      || (!current && (root.schemaVersion !== 2 || root.packetKind !== "SAME_CHAT_SUPERVISORY_CYCLE"))
      || (root.reasoningLane !== "EXTRA_HIGH_DIRECT" && root.reasoningLane !== "PRO_ESCALATED")) return null;
    const supervisorId = requiredString(current ? root.destinationSupervisorId : root.destinationChatId, current ? "destinationSupervisorId" : "destinationChatId");
    return {
      worker, taskId: requiredString(factual.taskId, "factualPacket.taskId"), requestId: requiredString(root.requestId, "requestId"), supervisorId, routeSchemaVersion: current ? 3 : 2, nonce: requiredString(root.nonce, "nonce"),
      evidenceCapsule: { id: requiredString(evidence.id, "evidenceCapsule.id"), sha256: digest(evidence.sha256, "evidenceCapsule.sha256") },
      ownerOutcome: { id: requiredString(outcome.id, "ownerOutcome.id"), epoch: positiveInteger(outcome.epoch, "ownerOutcome.epoch"), sha256: digest(outcome.sha256, "ownerOutcome.sha256") },
      reasoningLane: root.reasoningLane, repository: repositoryName(github.repository, "githubReceipt.repository"), issueNumber: positiveInteger(github.issueNumber, "githubReceipt.issueNumber"), stageIssueNumber: positiveInteger(github.stageIssueNumber, "githubReceipt.stageIssueNumber"),
      queuedAt: timestamp(root.queuedAt, "queuedAt"), expiresAt: timestamp(root.expiresAt, "expiresAt"),
    };
  } catch { return null; }
}

function evidenceEnvelope(input: { worker: string; receiptId: string; producer: AuthenticatedProducer; summary: string; refs: string[]; occurredAt: string; verified: boolean }): AppendEnvelope {
  return {
    schema_version: 2, event_id: `evidence:${sha256(`${input.producer.id}:${input.receiptId}`).slice(0, 32)}`, mission_id: "mission-control-live", occurred_at: input.occurredAt,
    data: { type: "evidence_receipt_recorded", worker: input.worker, receipt_id: input.receiptId, producer_id: input.producer.id, producer_role: "COLLECTOR", evidence_class: "ARTIFACT", independence: "SAME_PROVENANCE", freshness: "CURRENT", exact_candidate_sha256: null, summary: input.summary, refs: input.refs, verified: input.verified, changed_path_manifest: null },
  };
}
function assertAuthorizedWriter(candidate: GitHubDecisionCandidate, policy: GitHubReceiptPolicy) {
  if (candidate.repository.toLowerCase() !== policy.repository.toLowerCase()) throw new Error("Unauthorized GitHub repository for supervision receipt.");
  const candidateLogin = candidate.authorLogin.toLowerCase();
  if (!policy.authorizedWriterLogins.some((login) => login.toLowerCase() === candidateLogin)) throw new Error(`GitHub writer ${candidate.authorLogin} is not authorized for supervisory receipts.`);
}
function assertEqual(actual: unknown, expected: unknown, field: string) { if (actual !== expected) throw new Error(`Canonical decision ${field} does not match the pending request.`); }
function record(value: unknown, field: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`); return value as Record<string, unknown>; }
function requiredString(value: unknown, field: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`); return value; }
function repositoryName(value: unknown, field: string): string { const result = requiredString(value, field); if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(result)) throw new Error(`${field} must be an owner/name GitHub repository.`); return result; }
function digest(value: unknown, field: string): string { const result = requiredString(value, field); if (!/^[a-f0-9]{64}$/.test(result)) throw new Error(`${field} must be a lowercase SHA-256 digest.`); return result; }
function positiveInteger(value: unknown, field: string): number { if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`${field} must be a positive integer.`); return Number(value); }
function timestamp(value: unknown, field: string): string { const result = requiredString(value, field); if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be an ISO timestamp.`); return result; }
function httpsUrl(value: unknown, field: string): string { const result = requiredString(value, field), url = new URL(result); if (url.protocol !== "https:") throw new Error(`${field} must use HTTPS.`); return result; }
function refValue(refs: string[], prefix: string) { return refs.find((ref) => ref.startsWith(prefix))?.slice(prefix.length) ?? null; }
function parseDurableTextCapsule(value: unknown, field: string, idField: "id"): { id: string; exactText: string; sha256: string };
function parseDurableTextCapsule(value: unknown, field: string, idField: "decision_id"): { decisionId: string; exactText: string; sha256: string };
function parseDurableTextCapsule(value: unknown, field: string, idField: "id" | "decision_id") {
  const item = record(value, field);
  const exactText = requiredString(item.exact_text, `${field}.exact_text`);
  const claimed = digest(item.sha256, `${field}.sha256`);
  if (sha256(exactText) !== claimed) throw new Error(`${field} digest mismatch.`);
  return idField === "id"
    ? { id: requiredString(item.id, `${field}.id`), exactText, sha256: claimed }
    : { decisionId: requiredString(item.decision_id, `${field}.decision_id`), exactText, sha256: claimed };
}
