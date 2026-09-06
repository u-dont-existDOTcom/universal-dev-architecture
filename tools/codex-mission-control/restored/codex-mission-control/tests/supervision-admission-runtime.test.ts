import assert from "node:assert/strict";
import test from "node:test";

import { loadConfiguredSupervisorChats } from "../lib/configured-supervisor-chats";
import {
  evaluateSupervisionAdmission,
  internalSupervisorRoutePrefix,
  supervisoryCycleRoutePrefix,
  parseInternalSupervisorRouteBody,
} from "../lib/supervision-admission-runtime";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";

const workerProducer: AuthenticatedProducer = {
  id: "worker:askrigor-mast",
  kind: "WORKER",
  workerScopes: ["askrigor-mast"],
  taskScopes: ["task:askrigor-mast"],
};
const digest = "a".repeat(64);

function input(overrides: Record<string, unknown> = {}) {
  const requestOverrides = (overrides.request ?? {}) as Record<string, unknown>;
  const request = {
    requestId: "admission:askrigor:mast:1",
    action: "DESIGN_SPEND",
    actor: "CODEX",
    sourceReceipt: null,
    boundedExecution: false,
    taskRequiresExecutionOutsideChat: false,
    executionScope: null,
    spend: { kind: "MODEL_API_INFERENCE", ceilingUsd: 30, ownerApprovedNonzeroSpendManifestId: null },
    internalRoute: {
      destination: "SPECIALIST_SUPERVISOR_CHAT",
      destinationChatId: "chat:askrigor:new-research-avenues",
      standingOwnerAuthorization: true,
      ownerRelayRequested: false,
      actionTimeConfirmationRequested: false,
    },
    ownerPolicy: { paidModelInferenceAllowed: false, activeZeroSpendDecisionId: "owner:no-paid-api:20260901" },
    ...requestOverrides,
  };
  const base = {
    request,
    factualPacket: {
      packetId: "packet:askrigor:mast:1",
      taskId: "task:askrigor:mast",
      exactFactualState: "The deterministic harness is ready. No inference has run. A worker considered a $30 API smoke.",
      evidenceRefs: ["repo:AskRigor@main"],
      decisionRequested: "Choose the next methodology and spending boundary.",
    },
  };
  return { ...base, ...overrides, request };
}

test("Codex spend design is blocked before action and automatically queued to Chat", () => {
  const result = evaluateSupervisionAdmission("askrigor-mast", workerProducer, input(), "2026-09-01T21:00:00.000Z");
  assert.equal(result.admitted, false);
  assert.equal(result.mayExecute, false);
  assert.equal(result.ownerRelayRequired, false);
  assert.equal(result.primaryDecision.decision, "REJECT_CODEX_OR_WORK_SEMANTIC_AUTHORSHIP");
  assert.equal(result.routeDecision?.decision, "ALLOW_AUTOMATIC_INTERNAL_ROUTE");
  assert.equal(result.providerDeliveryState, "QUEUED_FOR_PROVIDER_RELAY");
  const routeEnvelope = result.routeEnvelope;
  assert.ok(routeEnvelope && routeEnvelope.data.type === "worker_message_recorded");
  if (!routeEnvelope || routeEnvelope.data.type !== "worker_message_recorded") throw new Error("Route envelope missing");
  assert.ok(routeEnvelope.data.body.startsWith(internalSupervisorRoutePrefix));
  const packet = parseInternalSupervisorRouteBody(routeEnvelope.data.body);
  assert.equal(packet?.ownerRelayRequired, false);
  assert.equal(packet?.actionTimeConfirmationRequired, false);
  assert.equal(packet?.providerDeliveryState, "QUEUED_FOR_PROVIDER_RELAY");
});

test("the approximately $175 pilot path is blocked by the same pre-action gate", () => {
  const result = evaluateSupervisionAdmission("askrigor-mast", workerProducer, input({ request: {
    action: "DESIGN_SPEND",
    spend: { kind: "MODEL_API_INFERENCE", ceilingUsd: 175, ownerApprovedNonzeroSpendManifestId: null },
  } }));
  assert.equal(result.mayExecute, false);
  assert.equal(result.providerDeliveryState, "QUEUED_FOR_PROVIDER_RELAY");
});

test("a worker cannot impersonate a Project Manager Chat reasoning surface", () => {
  assert.throws(() => evaluateSupervisionAdmission("askrigor-mast", workerProducer, input({ request: {
    action: "DESIGN_METHODOLOGY",
    actor: "PROJECT_MANAGER_CHAT",
  } })), /cannot claim authority actor/);
});

test("asking Joel to relay or confirm an internal route fails closed without creating a packet", () => {
  const relay = evaluateSupervisionAdmission("askrigor-mast", workerProducer, input({ request: {
    action: "ROUTE_INTERNAL_SUPERVISOR",
    spend: null,
    internalRoute: {
      destination: "PROJECT_MANAGER_CHAT",
      destinationChatId: "chat:mission-control:project-manager",
      standingOwnerAuthorization: true,
      ownerRelayRequested: true,
      actionTimeConfirmationRequested: false,
    },
  } }));
  assert.equal(relay.ownerRelayRequired, false);
  assert.equal(relay.routeEnvelope, null);
  assert.equal(relay.routeDecision?.decision, "REJECT_OWNER_RELAY_FOR_INTERNAL_ROUTE");

  const confirmation = evaluateSupervisionAdmission("askrigor-mast", workerProducer, input({ request: {
    action: "ROUTE_INTERNAL_SUPERVISOR",
    spend: null,
    internalRoute: {
      destination: "PROJECT_MANAGER_CHAT",
      destinationChatId: "chat:mission-control:project-manager",
      standingOwnerAuthorization: true,
      ownerRelayRequested: false,
      actionTimeConfirmationRequested: true,
    },
  } }));
  assert.equal(confirmation.routeDecision?.decision, "REJECT_INTERNAL_ROUTE_CONFIRMATION_HANDOFF");
  assert.equal(confirmation.routeEnvelope, null);
});

test("missing supervisor configuration is visible and never converted into an owner relay", () => {
  const result = evaluateSupervisionAdmission("askrigor-mast", workerProducer, input({ request: { internalRoute: null } }));
  assert.equal(result.providerDeliveryState, "ROUTE_CONFIGURATION_MISSING");
  assert.equal(result.ownerRelayRequired, false);
  assert.equal(result.routeEnvelope, null);
});

test("only a source-bound bounded zero-spend Chat directive admits execution", () => {
  const result = evaluateSupervisionAdmission("askrigor-mast", workerProducer, input({
    request: {
      action: "EXECUTE_BOUNDED_TASK",
      actor: "CODEX",
      sourceReceipt: {
        messageId: "chat-message:askrigor:zero-spend",
        bodySha256: digest,
        claimedSurface: "CHATGPT_PROJECT_MANAGER",
        observedSurface: "CHATGPT_PROJECT_MANAGER",
        provenanceStatus: "VERIFIED",
        authorActor: "PROJECT_MANAGER_CHAT",
      },
      boundedExecution: true,
      taskRequiresExecutionOutsideChat: true,
      executionScope: "TERMINAL_OR_COMPUTER_WORK",
      spend: { kind: "MODEL_API_INFERENCE", ceilingUsd: 0, ownerApprovedNonzeroSpendManifestId: null },
      internalRoute: null,
    },
    factualPacket: null,
  }));
  assert.equal(result.admitted, true);
  assert.equal(result.mayExecute, true);
  assert.equal(result.providerDeliveryState, "NOT_REQUIRED");
});

test("a registered provider-session cycle is emitted for the stable supervisor with exact nonce, evidence, owner epoch, lane, and GitHub location", () => {
  const result = evaluateSupervisionAdmission("askrigor-mast", workerProducer, input({
    factualPacket: {
      packetId: "packet:askrigor:mast:cycle",
      taskId: "task:askrigor:mast",
      exactFactualState: "Exact factual state is stored in the registered evidence capsule.",
      evidenceRefs: ["github:u-dont-existDOTcom/universal-dev-architecture#58"],
      decisionRequested: "Return the bounded canonical decision.",
      supervisoryCycle: {
        nonce: "nonce-cycle-1",
        evidenceCapsule: { id: "capsule-cycle-1", sha256: "b".repeat(64) },
        ownerOutcome: { id: "owner-outcome-cycle-1", epoch: 3, sha256: "c".repeat(64) },
        reasoningLane: "PRO_ESCALATED",
        githubReceipt: { repository: "u-dont-existDOTcom/universal-dev-architecture", issueNumber: 58, stageIssueNumber: 61 },
        expiresAt: "2026-09-03T00:00:00.000Z",
      },
    },
  }), "2026-09-02T00:00:00.000Z");
  assert.ok(result.routeEnvelope?.data.type === "worker_message_recorded");
  if (result.routeEnvelope?.data.type !== "worker_message_recorded") return;
  assert.ok(result.routeEnvelope.data.body.startsWith(supervisoryCycleRoutePrefix));
  const packet = JSON.parse(result.routeEnvelope.data.body.slice(supervisoryCycleRoutePrefix.length));
  assert.equal(packet.schemaVersion, 4);
  assert.equal(packet.packetKind, "PROVIDER_SESSION_SUPERVISORY_CYCLE");
  assert.equal(packet.destinationSupervisorId, "chat:askrigor:new-research-avenues");
  assert.equal(Object.hasOwn(packet, "destinationChatId"), false);
  assert.equal(packet.requestId, "admission:askrigor:mast:1");
  assert.equal(packet.nonce, "nonce-cycle-1");
  assert.equal(packet.reasoningLane, "PRO_ESCALATED");
  assert.equal(packet.writerContract.reinterpretationAllowed, false);
});

test("configured stable supervisor identity is distinct from its bootstrap conversation locator", () => {
  const directory = loadConfiguredSupervisorChats(JSON.stringify([
    {
      scope: "PROJECT_MANAGER",
      supervisorId: "mc-hotfix-specialist",
      label: "Mission Control overall supervisor",
      workerId: null,
      requiredApp: "Mission Control",
      expectedModels: { extraHigh: "Extra High", pro: "Pro" },
      bootstrapCapability: {
        chatId: "mc-hotfix-specialist-v2",
        url: "https://chatgpt.com/c/6a944d7a-3350-83e9-8302-5c011835fd77",
        challengeId: "challenge-bootstrap",
      },
    },
  ]));
  assert.equal(directory.configurationState, "CONFIGURED");
  assert.equal(directory.providerRelayState, "NOT_CONNECTED");
  assert.equal(directory.entries[0]?.supervisorId, "mc-hotfix-specialist");
  assert.equal(directory.entries[0]?.bootstrapCapability.chatId, "mc-hotfix-specialist-v2");
  assert.notEqual(directory.entries[0]?.supervisorId, directory.entries[0]?.bootstrapCapability.chatId);
  assert.equal(directory.entries[0]?.locatorVerification, "OWNER_CONFIGURED_UNVERIFIED");
});
