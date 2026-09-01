import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateChatWorkAuthorityGate,
  type ChatWorkAuthorityRequest,
  type ReasoningSourceReceipt,
} from "../lib/chat-work-authority-gate";

const digest = "a".repeat(64);

const extraHighReceipt: ReasoningSourceReceipt = {
  messageId: "chat-message:askrigor-extra-high:zero-spend-directive",
  bodySha256: digest,
  claimedSurface: "CHATGPT_PROJECT_MANAGER",
  observedSurface: "CHATGPT_PROJECT_MANAGER",
  provenanceStatus: "VERIFIED",
  authorActor: "PROJECT_MANAGER_CHAT",
};

function request(
  overrides: Partial<ChatWorkAuthorityRequest> = {},
): ChatWorkAuthorityRequest {
  return {
    requestId: "gate-request:askrigor:mast",
    action: "EXECUTE_BOUNDED_TASK",
    actor: "CODEX",
    sourceReceipt: extraHighReceipt,
    boundedExecution: true,
    taskRequiresExecutionOutsideChat: true,
    spend: {
      kind: "MODEL_API_INFERENCE",
      ceilingUsd: 0,
      ownerApprovedNonzeroSpendManifestId: null,
    },
    internalRoute: null,
    ownerPolicy: {
      paidModelInferenceAllowed: false,
      activeZeroSpendDecisionId: "owner-decision:askrigor:no-paid-api:20260901",
    },
    ...overrides,
  };
}

test("Codex-authored $30 paid-API smoke proposal is rejected before proposal formation", () => {
  const result = evaluateChatWorkAuthorityGate(request({
    action: "DESIGN_SPEND",
    actor: "CODEX",
    sourceReceipt: null,
    spend: {
      kind: "MODEL_API_INFERENCE",
      ceilingUsd: 30,
      ownerApprovedNonzeroSpendManifestId: null,
    },
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.decision, "REJECT_CODEX_OR_WORK_SEMANTIC_AUTHORSHIP");
  assert.match(result.requiredNextAction, /Route the exact factual state automatically/);
});

test("Codex-authored approximately $175 pilot ceiling is rejected", () => {
  const result = evaluateChatWorkAuthorityGate(request({
    action: "DESIGN_SPEND",
    actor: "WORK",
    sourceReceipt: null,
    spend: {
      kind: "MODEL_API_INFERENCE",
      ceilingUsd: 175,
      ownerApprovedNonzeroSpendManifestId: null,
    },
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.decision, "REJECT_CODEX_OR_WORK_SEMANTIC_AUTHORSHIP");
});

test("a false claim that a costed proposal came from ChatGPT fails closed", () => {
  const result = evaluateChatWorkAuthorityGate(request({
    action: "DESIGN_SPEND",
    actor: "PROJECT_MANAGER_CHAT",
    sourceReceipt: {
      ...extraHighReceipt,
      claimedSurface: "CHATGPT_PROJECT_MANAGER",
      observedSurface: "CODEX_LOCAL",
      provenanceStatus: "UNVERIFIED",
      authorActor: "CODEX",
    },
    spend: {
      kind: "MODEL_API_INFERENCE",
      ceilingUsd: 30,
      ownerApprovedNonzeroSpendManifestId: null,
    },
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.decision, "REJECT_UNVERIFIED_REASONING_SOURCE");
  assert.match(result.reasons.join(" "), /does not match observed surface/);
});

test("active zero-spend owner decision rejects paid inference even when Chat authored the idea", () => {
  const result = evaluateChatWorkAuthorityGate(request({
    action: "DESIGN_SPEND",
    actor: "PROJECT_MANAGER_CHAT",
    sourceReceipt: extraHighReceipt,
    spend: {
      kind: "MODEL_API_INFERENCE",
      ceilingUsd: 30,
      ownerApprovedNonzeroSpendManifestId: "manifest:obsolete-paid-proposal",
    },
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.decision, "REJECT_PAID_MODEL_INFERENCE");
  assert.match(result.requiredNextAction, /keep API spend at \$0/);
});

test("routine internal supervisor routing is automatic under standing owner authorization", () => {
  const result = evaluateChatWorkAuthorityGate(request({
    action: "ROUTE_INTERNAL_SUPERVISOR",
    actor: "CODEX",
    sourceReceipt: null,
    boundedExecution: true,
    taskRequiresExecutionOutsideChat: true,
    spend: null,
    internalRoute: {
      destination: "SPECIALIST_SUPERVISOR_CHAT",
      destinationChatId: "chat:askrigor:new-research-avenues",
      standingOwnerAuthorization: true,
      ownerRelayRequested: false,
      actionTimeConfirmationRequested: false,
    },
  }));
  assert.equal(result.allowed, true);
  assert.equal(result.decision, "ALLOW_AUTOMATIC_INTERNAL_ROUTE");
});

test("asking Joel to say send it for an internal supervisor route is rejected", () => {
  const result = evaluateChatWorkAuthorityGate(request({
    action: "ROUTE_INTERNAL_SUPERVISOR",
    actor: "CODEX",
    sourceReceipt: null,
    spend: null,
    internalRoute: {
      destination: "PROJECT_MANAGER_CHAT",
      destinationChatId: "chat:mission-control:project-manager",
      standingOwnerAuthorization: true,
      ownerRelayRequested: true,
      actionTimeConfirmationRequested: false,
    },
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.decision, "REJECT_OWNER_RELAY_FOR_INTERNAL_ROUTE");
  assert.match(result.requiredNextAction, /Send the exact packet/);
});

test("generic browser action-time confirmation cannot override authorized internal routing", () => {
  const result = evaluateChatWorkAuthorityGate(request({
    action: "ROUTE_INTERNAL_SUPERVISOR",
    actor: "WORK",
    sourceReceipt: null,
    spend: null,
    internalRoute: {
      destination: "SPECIALIST_SUPERVISOR_CHAT",
      destinationChatId: "chat:askrigor:methods-supervisor",
      standingOwnerAuthorization: true,
      ownerRelayRequested: false,
      actionTimeConfirmationRequested: true,
    },
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.decision, "REJECT_INTERNAL_ROUTE_CONFIRMATION_HANDOFF");
  assert.match(result.requiredNextAction, /without asking the owner to say 'send it'/);
});

test("Extra High Chat reasoning may issue a zero-spend methodology decision", () => {
  const result = evaluateChatWorkAuthorityGate(request({
    action: "DESIGN_METHODOLOGY",
    actor: "PROJECT_MANAGER_CHAT",
    sourceReceipt: extraHighReceipt,
    boundedExecution: false,
    taskRequiresExecutionOutsideChat: false,
    spend: {
      kind: "MODEL_API_INFERENCE",
      ceilingUsd: 0,
      ownerApprovedNonzeroSpendManifestId: null,
    },
  }));
  assert.equal(result.allowed, true);
  assert.equal(result.decision, "ALLOW_CHAT_REASONING");
});

test("Codex may execute only the zero-spend bounded mechanical residue", () => {
  const result = evaluateChatWorkAuthorityGate(request());
  assert.equal(result.allowed, true);
  assert.equal(result.decision, "ALLOW_BOUNDED_EXECUTION");
});

test("Work cannot take over a task the reasoning chat can perform directly", () => {
  const result = evaluateChatWorkAuthorityGate(request({
    actor: "WORK",
    taskRequiresExecutionOutsideChat: false,
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.decision, "REJECT_CHAT_EXECUTABLE_TASK_SUBSTITUTION");
});
