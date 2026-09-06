import { randomUUID } from "node:crypto";

import {
  evaluateChatWorkAuthorityGate,
  type AuthorityActor,
  type AuthorityGateResult,
  type ChatWorkAuthorityRequest,
  type ControlledAction,
  type ExecutionScope,
  type InternalSupervisorRoute,
  type ReasoningSourceReceipt,
  type SpendRequest,
} from "./chat-work-authority-gate";
import type { AuthenticatedProducer } from "./ingestion-auth";
import type { AppendEnvelope } from "./schema";

export const internalSupervisorRoutePrefix = "MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1\n";
export const supervisoryCycleRoutePrefix = "MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V4\n";
export const legacySupervisoryCycleRoutePrefix = "MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V2\n";

export interface SupervisoryCycleRequest {
  nonce: string;
  evidenceCapsule: { id: string; sha256: string };
  ownerOutcome: { id: string; epoch: number; sha256: string };
  reasoningLane: "EXTRA_HIGH_DIRECT" | "PRO_ESCALATED";
  githubReceipt: { repository: string; issueNumber: number; stageIssueNumber: number };
  expiresAt: string;
}

export interface FactualSupervisorPacket {
  packetId: string;
  taskId: string;
  exactFactualState: string;
  evidenceRefs: string[];
  decisionRequested: string;
  supervisoryCycle: SupervisoryCycleRequest | null;
}

export interface SupervisionAdmissionInput {
  request: ChatWorkAuthorityRequest;
  factualPacket: FactualSupervisorPacket | null;
}

export type ProviderDeliveryState =
  | "NOT_REQUIRED"
  | "QUEUED_FOR_PROVIDER_RELAY"
  | "ROUTE_CONFIGURATION_MISSING"
  | "ROUTE_REJECTED";

export interface SupervisionAdmissionResult {
  requestId: string;
  action: ControlledAction;
  admitted: boolean;
  mayExecute: boolean;
  ownerRelayRequired: false;
  primaryDecision: AuthorityGateResult;
  routeDecision: AuthorityGateResult | null;
  providerDeliveryState: ProviderDeliveryState;
  routeEnvelope: AppendEnvelope | null;
  statement: string;
}

const semanticActions = new Set<ControlledAction>([
  "AUTHOR_PROPOSAL",
  "DESIGN_METHODOLOGY",
  "SET_PRIORITY",
  "DESIGN_SPEND",
  "CHOOSE_CONSEQUENTIAL_TRADEOFF",
  "AUTHOR_ARCHITECTURE_DECISION",
  "AUTHOR_REVIEW",
  "AUTHOR_SUPERVISORY_VERDICT",
  "AUTHOR_OWNER_DECISION",
  "AUTHOR_SUBSTANTIVE_SUPERVISORY_PROSE",
]);

export function evaluateSupervisionAdmission(
  worker: string,
  producer: AuthenticatedProducer,
  input: unknown,
  now = new Date().toISOString(),
): SupervisionAdmissionResult {
  const parsed = parseSupervisionAdmissionInput(input);
  assertProducerActor(producer, parsed.request.actor);
  if (producer.kind !== "WORKER") {
    throw admissionError(403, "The worker admission endpoint accepts only an authenticated execution worker.");
  }
  if (!scopeIncludes(producer.workerScopes, worker)) {
    throw admissionError(403, "Worker admission scope does not match the authenticated producer.");
  }

  const primaryDecision = evaluateChatWorkAuthorityGate(parsed.request);
  if (primaryDecision.allowed && parsed.request.action === "EXECUTE_BOUNDED_TASK") {
    return {
      requestId: parsed.request.requestId,
      action: parsed.request.action,
      admitted: true,
      mayExecute: true,
      ownerRelayRequired: false,
      primaryDecision,
      routeDecision: null,
      providerDeliveryState: "NOT_REQUIRED",
      routeEnvelope: null,
      statement: "Bounded execution is admitted by a source-bound Chat decision. Execute only the exact authorized residue.",
    };
  }

  const routeRequired = parsed.request.action === "ROUTE_INTERNAL_SUPERVISOR"
    || semanticActions.has(parsed.request.action)
    || primaryDecision.decision === "REJECT_PAID_MODEL_INFERENCE"
    || primaryDecision.decision === "REJECT_NONZERO_SPEND_WITHOUT_OWNER_MANIFEST"
    || primaryDecision.decision === "REJECT_UNVERIFIED_REASONING_SOURCE";

  if (!routeRequired) {
    return deniedWithoutRoute(parsed.request, primaryDecision, "ROUTE_REJECTED");
  }
  if (!parsed.request.internalRoute || !parsed.factualPacket) {
    return deniedWithoutRoute(parsed.request, primaryDecision, "ROUTE_CONFIGURATION_MISSING");
  }

  const routeRequest: ChatWorkAuthorityRequest = {
    ...parsed.request,
    action: "ROUTE_INTERNAL_SUPERVISOR",
    sourceReceipt: null,
    spend: null,
    boundedExecution: true,
    taskRequiresExecutionOutsideChat: true,
  };
  const routeDecision = evaluateChatWorkAuthorityGate(routeRequest);
  if (!routeDecision.allowed) {
    return {
      requestId: parsed.request.requestId,
      action: parsed.request.action,
      admitted: false,
      mayExecute: false,
      ownerRelayRequired: false,
      primaryDecision,
      routeDecision,
      providerDeliveryState: "ROUTE_REJECTED",
      routeEnvelope: null,
      statement: "The action is blocked and the internal route is invalid. Do not ask Joel to relay it.",
    };
  }

  const routeEnvelope = buildRouteEnvelope(worker, producer, parsed, primaryDecision, routeDecision, now);
  return {
    requestId: parsed.request.requestId,
    action: parsed.request.action,
    admitted: parsed.request.action === "ROUTE_INTERNAL_SUPERVISOR",
    mayExecute: false,
    ownerRelayRequired: false,
    primaryDecision,
    routeDecision,
    providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY",
    routeEnvelope,
    statement: parsed.request.action === "ROUTE_INTERNAL_SUPERVISOR"
      ? "The exact factual packet is admitted to the internal supervisor queue. Provider delivery still requires the configured relay and a source receipt."
      : "The worker action is blocked. The exact factual packet is queued for the authorized Chat supervisor; no owner relay or action-time confirmation is permitted.",
  };
}

export function parseInternalSupervisorRouteBody(body: string): Record<string, unknown> | null {
  if (!body.startsWith(internalSupervisorRoutePrefix)) return null;
  try {
    const parsed = JSON.parse(body.slice(internalSupervisorRoutePrefix.length));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildRouteEnvelope(
  worker: string,
  producer: AuthenticatedProducer,
  input: SupervisionAdmissionInput,
  primaryDecision: AuthorityGateResult,
  routeDecision: AuthorityGateResult,
  now: string,
): AppendEnvelope {
  const route = input.request.internalRoute!;
  const packet = input.factualPacket!;
  const suffix = randomUUID();
  const cycle = packet.supervisoryCycle;
  if (cycle && Date.parse(cycle.expiresAt) <= Date.parse(now)) {
    throw admissionError(400, "A provider-session supervisory cycle must expire after its queue time.");
  }
  const body = (cycle ? supervisoryCycleRoutePrefix : internalSupervisorRoutePrefix) + JSON.stringify({
    schemaVersion: cycle ? 4 : 1,
    packetKind: cycle ? "PROVIDER_SESSION_SUPERVISORY_CYCLE" : "FACTUAL_STATE_ONLY",
    requestId: input.request.requestId,
    actionBlockedOrRouted: input.request.action,
    worker,
    producerId: producer.id,
    destination: route.destination,
    ...(cycle ? { destinationSupervisorId: route.destinationChatId } : { destinationChatId: route.destinationChatId }),
    standingOwnerAuthorization: route.standingOwnerAuthorization,
    ownerRelayRequired: false,
    actionTimeConfirmationRequired: false,
    providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY",
    primaryDecision: primaryDecision.decision,
    routeDecision: routeDecision.decision,
    factualPacket: packet,
    queuedAt: now,
    ...(cycle ? {
      nonce: cycle.nonce,
      reasoningLane: cycle.reasoningLane,
      evidenceCapsule: cycle.evidenceCapsule,
      ownerOutcome: cycle.ownerOutcome,
      githubReceipt: cycle.githubReceipt,
      expiresAt: cycle.expiresAt,
      writerContract: {
        mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY",
        reinterpretationAllowed: false,
      },
    } : {}),
  });
  if (body.length > 20_000) throw admissionError(400, "The factual supervisor packet exceeds the durable message limit.");
  return {
    schema_version: 2,
    event_id: `supervision-route-request:${suffix}`,
    mission_id: "mission-control-live",
    occurred_at: now,
    data: {
      type: "worker_message_recorded",
      worker,
      message_id: `message:supervision-route:${suffix}`,
      thread_id: `thread:supervision-route:${worker}`,
      message_kind: "QUESTION",
      body,
      reply_to_message_id: null,
      direction_id: null,
    },
  };
}

function deniedWithoutRoute(
  request: ChatWorkAuthorityRequest,
  primaryDecision: AuthorityGateResult,
  providerDeliveryState: "ROUTE_CONFIGURATION_MISSING" | "ROUTE_REJECTED",
): SupervisionAdmissionResult {
  return {
    requestId: request.requestId,
    action: request.action,
    admitted: false,
    mayExecute: false,
    ownerRelayRequired: false,
    primaryDecision,
    routeDecision: null,
    providerDeliveryState,
    routeEnvelope: null,
    statement: providerDeliveryState === "ROUTE_CONFIGURATION_MISSING"
      ? "The action is blocked and no exact internal supervisor route is configured. Record the control-plane blocker; do not ask Joel to relay a prompt."
      : "The action is blocked by the Chat/Work authority gate.",
  };
}

function parseSupervisionAdmissionInput(value: unknown): SupervisionAdmissionInput {
  const root = requiredRecord(value, "Admission body");
  const request = requiredRecord(root.request, "request");
  const action = requiredEnum(request.action, controlledActions, "request.action");
  const actor = requiredEnum(request.actor, authorityActors, "request.actor");
  const sourceReceipt = request.sourceReceipt === null || request.sourceReceipt === undefined
    ? null
    : parseReasoningSourceReceipt(request.sourceReceipt);
  const spend = request.spend === null || request.spend === undefined ? null : parseSpend(request.spend);
  const internalRoute = request.internalRoute === null || request.internalRoute === undefined
    ? null
    : parseInternalRoute(request.internalRoute);
  const ownerPolicy = requiredRecord(request.ownerPolicy, "request.ownerPolicy");
  const parsedRequest: ChatWorkAuthorityRequest = {
    requestId: requiredString(request.requestId, "request.requestId", 180),
    action,
    actor,
    sourceReceipt,
    boundedExecution: requiredBoolean(request.boundedExecution, "request.boundedExecution"),
    taskRequiresExecutionOutsideChat: requiredBoolean(request.taskRequiresExecutionOutsideChat, "request.taskRequiresExecutionOutsideChat"),
    executionScope: request.executionScope === null || request.executionScope === undefined
      ? null
      : requiredEnum(request.executionScope, executionScopes, "request.executionScope") as ExecutionScope,
    spend,
    internalRoute,
    ownerPolicy: {
      paidModelInferenceAllowed: requiredBoolean(ownerPolicy.paidModelInferenceAllowed, "request.ownerPolicy.paidModelInferenceAllowed"),
      activeZeroSpendDecisionId: nullableString(ownerPolicy.activeZeroSpendDecisionId, "request.ownerPolicy.activeZeroSpendDecisionId", 180),
    },
  };
  const factualPacket = root.factualPacket === null || root.factualPacket === undefined
    ? null
    : parseFactualPacket(root.factualPacket);
  return { request: parsedRequest, factualPacket };
}

function parseReasoningSourceReceipt(value: unknown): ReasoningSourceReceipt {
  const record = requiredRecord(value, "request.sourceReceipt");
  const bodySha256 = requiredString(record.bodySha256, "request.sourceReceipt.bodySha256", 64);
  if (!/^[a-f0-9]{64}$/.test(bodySha256)) throw admissionError(400, "request.sourceReceipt.bodySha256 must be a lowercase SHA-256 digest.");
  return {
    messageId: requiredString(record.messageId, "request.sourceReceipt.messageId", 300),
    bodySha256,
    claimedSurface: requiredEnum(record.claimedSurface, reasoningSurfaces, "request.sourceReceipt.claimedSurface"),
    observedSurface: requiredEnum(record.observedSurface, reasoningSurfaces, "request.sourceReceipt.observedSurface"),
    provenanceStatus: requiredEnum(record.provenanceStatus, provenanceStatuses, "request.sourceReceipt.provenanceStatus"),
    authorActor: requiredEnum(record.authorActor, authorityActors, "request.sourceReceipt.authorActor"),
  };
}

function parseSpend(value: unknown): SpendRequest {
  const record = requiredRecord(value, "request.spend");
  if (typeof record.ceilingUsd !== "number" || !Number.isFinite(record.ceilingUsd) || record.ceilingUsd < 0) {
    throw admissionError(400, "request.spend.ceilingUsd must be a finite nonnegative number.");
  }
  return {
    kind: requiredEnum(record.kind, spendKinds, "request.spend.kind"),
    ceilingUsd: record.ceilingUsd,
    ownerApprovedNonzeroSpendManifestId: nullableString(record.ownerApprovedNonzeroSpendManifestId, "request.spend.ownerApprovedNonzeroSpendManifestId", 300),
  };
}

function parseInternalRoute(value: unknown): InternalSupervisorRoute {
  const record = requiredRecord(value, "request.internalRoute");
  return {
    destination: requiredEnum(record.destination, routeDestinations, "request.internalRoute.destination"),
    destinationChatId: requiredString(record.destinationChatId, "request.internalRoute.destinationChatId", 500),
    standingOwnerAuthorization: requiredBoolean(record.standingOwnerAuthorization, "request.internalRoute.standingOwnerAuthorization"),
    ownerRelayRequested: requiredBoolean(record.ownerRelayRequested, "request.internalRoute.ownerRelayRequested"),
    actionTimeConfirmationRequested: requiredBoolean(record.actionTimeConfirmationRequested, "request.internalRoute.actionTimeConfirmationRequested"),
  };
}

function parseFactualPacket(value: unknown): FactualSupervisorPacket {
  const record = requiredRecord(value, "factualPacket");
  if (!Array.isArray(record.evidenceRefs) || record.evidenceRefs.some((item) => typeof item !== "string" || item.length === 0 || item.length > 1000)) {
    throw admissionError(400, "factualPacket.evidenceRefs must be an array of non-empty strings.");
  }
  return {
    packetId: requiredString(record.packetId, "factualPacket.packetId", 180),
    taskId: requiredString(record.taskId, "factualPacket.taskId", 180),
    exactFactualState: requiredString(record.exactFactualState, "factualPacket.exactFactualState", 12_000),
    evidenceRefs: [...record.evidenceRefs],
    decisionRequested: requiredString(record.decisionRequested, "factualPacket.decisionRequested", 2_000),
    supervisoryCycle: record.supervisoryCycle === null || record.supervisoryCycle === undefined
      ? null
      : parseSupervisoryCycle(record.supervisoryCycle),
  };
}

function parseSupervisoryCycle(value: unknown): SupervisoryCycleRequest {
  const record = requiredRecord(value, "factualPacket.supervisoryCycle");
  const evidence = requiredRecord(record.evidenceCapsule, "factualPacket.supervisoryCycle.evidenceCapsule");
  const outcome = requiredRecord(record.ownerOutcome, "factualPacket.supervisoryCycle.ownerOutcome");
  const github = requiredRecord(record.githubReceipt, "factualPacket.supervisoryCycle.githubReceipt");
  const evidenceSha256 = requiredString(evidence.sha256, "factualPacket.supervisoryCycle.evidenceCapsule.sha256", 64);
  const outcomeSha256 = requiredString(outcome.sha256, "factualPacket.supervisoryCycle.ownerOutcome.sha256", 64);
  if (!/^[a-f0-9]{64}$/.test(evidenceSha256) || !/^[a-f0-9]{64}$/.test(outcomeSha256)) {
    throw admissionError(400, "Supervisory-cycle evidence and owner-outcome digests must be lowercase SHA-256 values.");
  }
  if (!Number.isInteger(outcome.epoch) || Number(outcome.epoch) < 1
    || !Number.isInteger(github.issueNumber) || Number(github.issueNumber) < 1
    || !Number.isInteger(github.stageIssueNumber) || Number(github.stageIssueNumber) < 1) {
    throw admissionError(400, "Supervisory-cycle owner epoch and GitHub decision/stage issue numbers must be positive integers.");
  }
  const expiresAt = requiredString(record.expiresAt, "factualPacket.supervisoryCycle.expiresAt", 100);
  if (!Number.isFinite(Date.parse(expiresAt))) throw admissionError(400, "Supervisory-cycle expiry must be an ISO timestamp.");
  return {
    nonce: requiredString(record.nonce, "factualPacket.supervisoryCycle.nonce", 180),
    evidenceCapsule: {
      id: requiredString(evidence.id, "factualPacket.supervisoryCycle.evidenceCapsule.id", 180),
      sha256: evidenceSha256,
    },
    ownerOutcome: {
      id: requiredString(outcome.id, "factualPacket.supervisoryCycle.ownerOutcome.id", 180),
      epoch: Number(outcome.epoch),
      sha256: outcomeSha256,
    },
    reasoningLane: requiredEnum(record.reasoningLane, ["EXTRA_HIGH_DIRECT", "PRO_ESCALATED"] as const, "factualPacket.supervisoryCycle.reasoningLane"),
    githubReceipt: {
      repository: requiredString(github.repository, "factualPacket.supervisoryCycle.githubReceipt.repository", 300),
      issueNumber: Number(github.issueNumber),
      stageIssueNumber: Number(github.stageIssueNumber),
    },
    expiresAt,
  };
}

function assertProducerActor(producer: AuthenticatedProducer, actor: AuthorityActor) {
  const valid = producer.kind === "WORKER" && (actor === "CODEX" || actor === "WORK")
    || producer.kind === "OWNER_AUTHORITY" && actor === "OWNER"
    || producer.kind === "UI" && actor === "OWNER"
    || producer.kind === "SUPERVISOR" && (actor === "PROJECT_MANAGER_CHAT" || actor === "SPECIALIST_SUPERVISOR_CHAT");
  if (!valid) throw admissionError(403, `Authenticated producer kind ${producer.kind} cannot claim authority actor ${actor}.`);
}

function scopeIncludes(scopes: string[], value: string): boolean {
  return scopes.includes("*") || scopes.includes(value);
}

function requiredRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw admissionError(400, `${field} must be an object.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw admissionError(400, `${field} must be a non-empty string no longer than ${max} characters.`);
  }
  return value;
}

function nullableString(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value, field, max);
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw admissionError(400, `${field} must be boolean.`);
  return value;
}

function requiredEnum<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) throw admissionError(400, `${field} is invalid.`);
  return value as T[number];
}

export function admissionError(statusCode: 400 | 403, message: string): Error & { statusCode: 400 | 403 } {
  return Object.assign(new Error(message), { statusCode });
}

const controlledActions = [
  "AUTHOR_PROPOSAL", "DESIGN_METHODOLOGY", "SET_PRIORITY", "DESIGN_SPEND",
  "CHOOSE_CONSEQUENTIAL_TRADEOFF", "AUTHOR_ARCHITECTURE_DECISION", "AUTHOR_REVIEW",
  "AUTHOR_SUPERVISORY_VERDICT", "AUTHOR_OWNER_DECISION", "AUTHOR_SUBSTANTIVE_SUPERVISORY_PROSE",
  "EXECUTE_BOUNDED_TASK", "ROUTE_INTERNAL_SUPERVISOR",
  "SEND_EXTERNAL_REPRESENTATIONAL_MESSAGE",
] as const;
const authorityActors = ["OWNER", "PROJECT_MANAGER_CHAT", "SPECIALIST_SUPERVISOR_CHAT", "CODEX", "WORK"] as const;
const reasoningSurfaces = ["OWNER_DIRECT", "CHATGPT_PROJECT_MANAGER", "CHATGPT_SPECIALIST_SUPERVISOR", "CODEX_LOCAL", "WORK_LOCAL", "UNKNOWN"] as const;
const provenanceStatuses = ["VERIFIED", "OWNER_ATTESTED", "UNVERIFIED"] as const;
const spendKinds = ["MODEL_API_INFERENCE", "OTHER"] as const;
const routeDestinations = ["PROJECT_MANAGER_CHAT", "SPECIALIST_SUPERVISOR_CHAT"] as const;
const executionScopes = [
  "TERMINAL_OR_COMPUTER_WORK", "GENUINELY_LONG_RANGE_REPOSITORY_OPERATION", "ROUTINE_GITHUB_READ_WRITE",
  "ISSUE_OR_PR_UPDATE", "ARCHITECTURE_DECISION", "REVIEW", "SUPERVISORY_REASONING", "SUBSTANTIVE_SUPERVISORY_PROSE",
] as const;
