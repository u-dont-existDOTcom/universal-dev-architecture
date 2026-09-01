import assert from "node:assert/strict";
import test from "node:test";
import { decideSupervisionAdmission, type OwnerSupervisionPolicy } from "../lib/supervision-admission";

const policy: OwnerSupervisionPolicy = {
  chatOwnsReasoning: true,
  codexExecutionOnly: true,
  paidApiModelInferenceAllowed: false,
  preferIncludedChatgptCapacity: true,
  internalSupervisorRoutingPreauthorized: true,
  continueUntilOutcomeOrExactBoundary: true,
};

const activeDirective = {
  directiveId: "directive:askrigor:mast:zero-spend:001",
  status: "ACTIVE" as const,
  sourceRole: "PROJECT_MANAGER_CHAT" as const,
  provenanceStatus: "VERIFIED" as const,
  exactBodySha256: "a".repeat(64),
};

test("Codex cannot author a thirty-dollar paid API smoke proposal", () => {
  const result = decideSupervisionAdmission({
    actor: "CODEX",
    action: "SPEND_PROPOSAL",
    policy,
    estimatedSpendUsd: 30,
  });
  assert.equal(result.decision, "BLOCK_PAID_API_PATH");
  assert.equal(result.allowed, false);
  assert.equal(result.ownerActionRequired, false);
  assert.equal(result.routeTarget, "PROJECT_MANAGER_CHAT");
  assert.match(result.requiredNextAction, /Cancel the paid path/);
});

test("Codex cannot independently escalate the same path to a 175-dollar pilot ceiling", () => {
  const result = decideSupervisionAdmission({
    actor: "CODEX",
    action: "PAID_MODEL_INFERENCE",
    policy,
    estimatedSpendUsd: 175,
  });
  assert.equal(result.decision, "BLOCK_PAID_API_PATH");
  assert.equal(result.ownerActionRequired, false);
});

test("unverified claim that a proposal came from a supervisor chat fails closed", () => {
  const result = decideSupervisionAdmission({
    actor: "CODEX",
    action: "BOUNDED_EXECUTION",
    policy,
    directive: activeDirective,
    claimedReasoningSource: {
      claimed: true,
      provenanceStatus: "UNVERIFIED",
      sourceRole: "SPECIALIST_SUPERVISOR_CHAT",
      messageId: "claimed-message-not-observed",
    },
  });
  assert.equal(result.decision, "BLOCK_UNVERIFIED_REASONING_SOURCE");
  assert.equal(result.allowed, false);
  assert.match(result.reason, /cannot be represented/);
});

test("methodology and consequential tradeoffs authored by Codex auto-route to Chat instead", () => {
  for (const action of ["METHODOLOGY", "PRIORITIZATION", "CONSEQUENTIAL_TRADEOFF"] as const) {
    const result = decideSupervisionAdmission({
      actor: "CODEX",
      action,
      policy,
      preferredRoute: "SPECIALIST_SUPERVISOR_CHAT",
    });
    assert.equal(result.decision, "AUTO_ROUTE_TO_SPECIALIST_SUPERVISOR");
    assert.equal(result.ownerActionRequired, false);
    assert.match(result.requiredNextAction, /without asking the owner to relay it/);
  }
});

test("pre-authorized internal supervisor routing is automatic even when a generic browser policy labels communication representational", () => {
  const result = decideSupervisionAdmission({
    actor: "CODEX",
    action: "INTERNAL_SUPERVISOR_ROUTE",
    policy,
    preferredRoute: "PROJECT_MANAGER_CHAT",
    routeScope: "INTERNAL_SUPERVISION",
    genericTransportPolicyRequiresConfirmation: true,
  });
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.allowed, true);
  assert.equal(result.ownerActionRequired, false);
  assert.match(result.requiredNextAction, /Deliver the exact packet automatically/);
});

test("external third-party communication still requires action-time owner confirmation", () => {
  const result = decideSupervisionAdmission({
    actor: "CODEX",
    action: "EXTERNAL_THIRD_PARTY_COMMUNICATION",
    policy,
    routeScope: "EXTERNAL_THIRD_PARTY",
  });
  assert.equal(result.decision, "OWNER_DECISION_REQUIRED");
  assert.equal(result.ownerActionRequired, true);
});

test("Codex bounded execution requires an exact active ChatGPT directive", () => {
  const missing = decideSupervisionAdmission({
    actor: "CODEX",
    action: "BOUNDED_EXECUTION",
    policy,
  });
  assert.equal(missing.decision, "BLOCK_MISSING_CHAT_DIRECTIVE");
  assert.equal(missing.ownerActionRequired, false);

  const admitted = decideSupervisionAdmission({
    actor: "CODEX",
    action: "BOUNDED_EXECUTION",
    policy,
    directive: activeDirective,
  });
  assert.equal(admitted.decision, "ALLOW");
  assert.equal(admitted.allowed, true);
});

test("intermediate green state cannot stop while deployment or live verification remains", () => {
  const result = decideSupervisionAdmission({
    actor: "CODEX",
    action: "COMPLETION_CLAIM",
    policy,
    pendingCompletionSteps: ["deploy the reviewed build", "perform live owner-visible acceptance"],
  });
  assert.equal(result.decision, "CONTINUE_TO_NEXT_STEP");
  assert.equal(result.ownerActionRequired, false);
  assert.match(result.requiredNextAction, /deploy the reviewed build/);
});

test("only a genuine owner decision or exact external blocker may stop automatic completion", () => {
  const ownerDecision = decideSupervisionAdmission({
    actor: "CODEX",
    action: "COMPLETION_CLAIM",
    policy,
    unresolvedOwnerDecision: "Choose whether the externally visible publication should occur.",
  });
  assert.equal(ownerDecision.decision, "OWNER_DECISION_REQUIRED");
  assert.equal(ownerDecision.ownerActionRequired, true);

  const blocker = decideSupervisionAdmission({
    actor: "CODEX",
    action: "COMPLETION_CLAIM",
    policy,
    exactBlocker: "Railway volume creation is unavailable through the connected tool and requires one owner-account action.",
  });
  assert.equal(blocker.decision, "STOP_AT_EXACT_BLOCKER");
});

test("Project Manager and specialist supervisor may author semantic proposals under zero-spend policy", () => {
  for (const actor of ["PROJECT_MANAGER_CHAT", "SPECIALIST_SUPERVISOR_CHAT"] as const) {
    const result = decideSupervisionAdmission({
      actor,
      action: "PROPOSAL",
      policy,
      estimatedSpendUsd: 0,
    });
    assert.equal(result.decision, "ALLOW");
    assert.equal(result.allowed, true);
  }
});
