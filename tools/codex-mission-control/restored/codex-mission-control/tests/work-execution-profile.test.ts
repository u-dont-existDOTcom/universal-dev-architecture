import assert from "node:assert/strict";
import test from "node:test";

import {
  type ChatWorkAuthorityRequest,
  type PersistedExecutionDirectiveProof,
} from "../lib/chat-work-authority-gate";
import { evaluateFinalResponseAdmission } from "../lib/final-response-gate";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import type { WorkerState } from "../lib/projection";
import type { StoredEvent } from "../lib/schema";
import { workExecutionReceiptBindingSchema } from "../lib/schema";
import { seedStore } from "../lib/seed";
import { ContractInvariantError, EventStore } from "../lib/store";
import { evaluateSupervisionAdmission, parseSupervisionAdmissionInput } from "../lib/supervision-admission-runtime";
import {
  CURRENT_WORK_EXECUTION_CAPABILITY,
  LEGACY_MODEL_PROFILE_UNSPECIFIED,
  WORK_MODEL_ROUTING_POLICY_COMMIT,
  WORK_MODEL_ROUTING_POLICY_REF,
  evaluateWorkExecutionPreflight,
  failureMayAuthorizeProfileEscalation,
  launchSelectionFor,
  workExecutionProfileSchema,
  type WorkExecutionCapabilityMatrix,
  type WorkExecutionProfile,
} from "../lib/work-execution-profile";
import {
  buildWorkExecutionAuthorizationEnvelope,
  buildWorkRoutingCheckpointEnvelopes,
  completedWorkRoutingTelemetryCount,
  currentExecutionDirectiveProof,
  evaluatePersistedWorkExecutionPreflight,
} from "../lib/work-execution-runtime";

const sourceDigest = "a".repeat(64);
const directiveArtifactDigest = "b".repeat(64);
const workerProducer: AuthenticatedProducer = {
  id: "worker:profile-worker",
  kind: "WORKER",
  workerScopes: ["profile-worker"],
  taskScopes: ["task:profile-worker"],
};

function profile(overrides: Partial<WorkExecutionProfile> = {}): WorkExecutionProfile {
  return {
    model: "GPT_5_6_SOL",
    effort: "MEDIUM",
    routingTier: "SOL_MEDIUM",
    routingTriggers: [],
    fastModeRequest: "DO_NOT_ENABLE_FAST",
    assuranceRequirement: "SET_REQUEST_SUFFICIENT",
    policyRef: WORK_MODEL_ROUTING_POLICY_REF,
    policyCommit: WORK_MODEL_ROUTING_POLICY_COMMIT,
    ...overrides,
  };
}

function directiveProof(
  selected: WorkExecutionProfile = profile(),
  overrides: Partial<PersistedExecutionDirectiveProof> = {},
): PersistedExecutionDirectiveProof {
  return {
    directiveId: "directive:profile-worker:1",
    directiveRevision: 1,
    taskId: "task:profile-worker",
    directiveArtifactSha256: directiveArtifactDigest,
    sourceMessageId: "chat-message:profile-worker:1",
    sourceBodySha256: sourceDigest,
    status: "ACTIVE",
    workExecutionProfile: selected,
    ...overrides,
  };
}

function admissionRequest(workExecutionProfile: unknown = profile(), version: 2 | 3 = 3) {
  return {
    request: {
      requestId: "admission:profile-worker:1",
      action: "EXECUTE_BOUNDED_TASK",
      actor: "WORK",
      sourceReceipt: {
        messageId: "chat-message:profile-worker:1",
        bodySha256: sourceDigest,
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
      ownerPolicy: { paidModelInferenceAllowed: false, activeZeroSpendDecisionId: "owner:zero-spend" },
      directiveSchemaVersion: version,
      executionDirectiveBinding: {
        directiveId: "directive:profile-worker:1",
        directiveRevision: 1,
        taskId: "task:profile-worker",
        directiveArtifactSha256: directiveArtifactDigest,
      },
      ...(workExecutionProfile === undefined ? {} : { workExecutionProfile }),
    },
    factualPacket: null,
  };
}

function admit(selected: WorkExecutionProfile, proof = directiveProof(selected)) {
  return evaluateSupervisionAdmission(
    "profile-worker", workerProducer, admissionRequest(selected),
    "2026-09-14T03:00:00.000Z", undefined, proof,
  );
}

for (const valid of [
  profile({ effort: "LOW", routingTier: "SOL_LOW" }),
  profile(),
  profile({ model: "GPT_6_ASTRA", effort: "LOW", routingTier: "ASTRA_LOW", routingTriggers: ["HARD_UNKNOWN_CAUSAL_SEAM"] }),
]) {
  test(`valid ${valid.routingTier} profile is admitted exactly`, () => {
    const result = admit(valid);
    assert.equal(result.mayExecute, true);
    assert.deepEqual(result.authorizedWorkExecutionProfile, valid);
  });
}

test("the source-message body hash and directive-artifact hash are distinct valid bindings", () => {
  assert.notEqual(sourceDigest, directiveArtifactDigest);
  assert.equal(admit(profile()).mayExecute, true);
});

for (const [label, proof] of [
  ["artifact digest", directiveProof(profile(), { directiveArtifactSha256: "c".repeat(64) })],
  ["directive identity", directiveProof(profile(), { directiveId: "directive:wrong" })],
  ["directive revision", directiveProof(profile(), { directiveRevision: 2 })],
  ["task identity", directiveProof(profile(), { taskId: "task:wrong" })],
  ["source message identity", directiveProof(profile(), { sourceMessageId: "chat-message:wrong" })],
  ["source body digest", directiveProof(profile(), { sourceBodySha256: "c".repeat(64) })],
] as const) {
  test(`admission rejects wrong persisted ${label}`, () => {
    const result = admit(profile(), proof);
    assert.equal(result.mayExecute, false);
    assert.equal(result.primaryDecision.decision, "REJECT_UNVERIFIED_REASONING_SOURCE");
  });
}

test("tier/model and tier/effort mismatches are rejected as invalid profiles", () => {
  const invalid = profile({ model: "GPT_6_ASTRA", routingTier: "SOL_MEDIUM" });
  const result = evaluateSupervisionAdmission(
    "profile-worker", workerProducer, admissionRequest(invalid), undefined, undefined, directiveProof(profile()),
  );
  assert.equal(result.mayExecute, false);
  assert.equal(result.primaryDecision.decision, "REJECT_INVALID_WORK_EXECUTION_PROFILE");
});

test("Work cannot alter the source-authorized assurance requirement", () => {
  const sourceAuthorized = profile({ assuranceRequirement: "INDEPENDENT_READBACK_REQUIRED" });
  const workerSupplied = profile({ assuranceRequirement: "SET_REQUEST_SUFFICIENT" });
  const result = admit(workerSupplied, directiveProof(sourceAuthorized));
  assert.equal(result.mayExecute, false);
  assert.equal(result.primaryDecision.decision, "REJECT_UNVERIFIED_REASONING_SOURCE");
});

for (const invalid of [
  profile({ model: "GPT_6_ASTRA", effort: "LOW", routingTier: "ASTRA_LOW", routingTriggers: [] }),
  profile({ effort: "HIGH", routingTier: "SOL_HIGH_EXCEPTION", routingTriggers: [] }),
]) {
  test(`${invalid.routingTier} requires a non-empty source-bound trigger`, () => {
    assert.equal(workExecutionProfileSchema.safeParse(invalid).success, false);
  });
}

test("new-format missing profile is rejected while legacy recovery remains explicitly unspecified", () => {
  const missingBody = admissionRequest();
  delete (missingBody.request as Record<string, unknown>).workExecutionProfile;
  const missing = evaluateSupervisionAdmission("profile-worker", workerProducer, missingBody);
  assert.equal(missing.primaryDecision.decision, "REJECT_MISSING_WORK_EXECUTION_PROFILE");

  const legacyBody = admissionRequest(profile(), 2);
  delete (legacyBody.request as Record<string, unknown>).workExecutionProfile;
  delete (legacyBody.request as Record<string, unknown>).executionDirectiveBinding;
  const parsed = parseSupervisionAdmissionInput(legacyBody);
  assert.equal(parsed.request.workExecutionProfile, LEGACY_MODEL_PROFILE_UNSPECIFIED);
  const legacy = evaluateSupervisionAdmission("profile-worker", workerProducer, legacyBody);
  assert.equal(legacy.primaryDecision.decision, "REJECT_MISSING_WORK_EXECUTION_PROFILE");

  const retrofitted = evaluateSupervisionAdmission("profile-worker", workerProducer, admissionRequest(profile(), 2));
  assert.equal(retrofitted.primaryDecision.decision, "REJECT_INVALID_WORK_EXECUTION_PROFILE");
});

const verifiedCapability: WorkExecutionCapabilityMatrix = {
  surfaceId: "TEST_SET_AND_VERIFY",
  interface: "STRUCTURED_API",
  model: "SET_AND_VERIFY",
  effort: "SET_AND_VERIFY",
  fastMode: "SET_AND_VERIFY",
};

test("ordinary Sol Medium setter-only preflight proceeds with provider identity explicitly unverified", () => {
  const selected = profile();
  const result = evaluateWorkExecutionPreflight({
    requestedProfile: selected,
    authorizedProfile: selected,
    observedProfile: { model: null, effort: null, fastMode: null },
    appliedSelection: launchSelectionFor(selected),
    capability: CURRENT_WORK_EXECUTION_CAPABILITY,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.result, "SET_REQUEST_ACCEPTED_UNVERIFIED");
  assert.equal(result.decision, "WORK_EXECUTION_SET_REQUEST_ACCEPTED_UNVERIFIED");
  assert.equal(result.modelIdentityEvidence, "SET_REQUEST_ONLY");
  assert.equal(result.fieldResults.model, "SET_REQUEST_ONLY");
  assert.equal(result.fieldResults.effort, "SET_REQUEST_ONLY");
  assert.equal(result.fieldResults.fastMode, "NOT_REQUESTED_UNVERIFIED");
  assert.deepEqual(result.observedProfile, { model: null, effort: null, fastMode: null });
});

test("ordinary Astra Low setter-only preflight also proceeds without fabricated readback", () => {
  const selected = profile({
    model: "GPT_6_ASTRA", effort: "LOW", routingTier: "ASTRA_LOW", routingTriggers: ["HARD_UNKNOWN_CAUSAL_SEAM"],
  });
  const result = evaluateWorkExecutionPreflight({
    requestedProfile: selected,
    authorizedProfile: selected,
    observedProfile: { model: null, effort: null, fastMode: null },
    appliedSelection: launchSelectionFor(selected),
    capability: CURRENT_WORK_EXECUTION_CAPABILITY,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.modelIdentityEvidence, "SET_REQUEST_ONLY");
  assert.deepEqual(result.observedProfile, { model: null, effort: null, fastMode: null });
});

test("independent-readback mode fails closed on the current setter-only surface", () => {
  const selected = profile({ assuranceRequirement: "INDEPENDENT_READBACK_REQUIRED" });
  const result = evaluateWorkExecutionPreflight({
    requestedProfile: selected,
    authorizedProfile: selected,
    observedProfile: { model: null, effort: null, fastMode: null },
    appliedSelection: launchSelectionFor(selected),
    capability: CURRENT_WORK_EXECUTION_CAPABILITY,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.decision, "WORK_EXECUTION_PROFILE_UNVERIFIABLE");
  assert.ok(result.reasonCodes.includes("INDEPENDENT_MODEL_EFFORT_READBACK_REQUIRED"));
});

test("missing or wrong exact setter evidence blocks launch", () => {
  const selected = profile();
  for (const appliedSelection of [null, { ...launchSelectionFor(selected), thinking: "high" as const }]) {
    const result = evaluateWorkExecutionPreflight({
      requestedProfile: selected,
      authorizedProfile: selected,
      observedProfile: { model: null, effort: null, fastMode: null },
      appliedSelection,
      capability: CURRENT_WORK_EXECUTION_CAPABILITY,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.decision, "WORK_EXECUTION_PROFILE_MISMATCH");
  }
});

test("any observed model, effort, or Fast contradiction fails closed even on SET_ONLY", () => {
  const selected = profile();
  for (const observedProfile of [
    { model: "GPT_6_ASTRA" as const, effort: null, fastMode: null },
    { model: null, effort: "HIGH" as const, fastMode: null },
    { model: null, effort: null, fastMode: true },
  ]) {
    const result = evaluateWorkExecutionPreflight({
      requestedProfile: selected,
      authorizedProfile: selected,
      observedProfile,
      appliedSelection: launchSelectionFor(selected),
      capability: CURRENT_WORK_EXECUTION_CAPABILITY,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.decision, "WORK_EXECUTION_PROFILE_MISMATCH");
  }
});

test("Fast is not falsely represented as verified-off, and enabling it fails when unavailable", () => {
  const ordinary = profile();
  const allowed = evaluateWorkExecutionPreflight({
    requestedProfile: ordinary,
    authorizedProfile: ordinary,
    observedProfile: { model: null, effort: null, fastMode: null },
    appliedSelection: launchSelectionFor(ordinary),
    capability: CURRENT_WORK_EXECUTION_CAPABILITY,
  });
  assert.equal(allowed.fieldResults.fastMode, "NOT_REQUESTED_UNVERIFIED");
  assert.equal(allowed.observedProfile.fastMode, null);

  const fast = profile({ fastModeRequest: "ENABLE_FAST" });
  const blocked = evaluateWorkExecutionPreflight({
    requestedProfile: fast,
    authorizedProfile: fast,
    observedProfile: { model: null, effort: null, fastMode: null },
    appliedSelection: launchSelectionFor(fast),
    capability: CURRENT_WORK_EXECUTION_CAPABILITY,
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.decision, "WORK_EXECUTION_PROFILE_UNVERIFIABLE");
});

test("an independently observed exact profile is classified as set and verified", () => {
  const selected = profile({ assuranceRequirement: "INDEPENDENT_READBACK_REQUIRED" });
  const result = evaluateWorkExecutionPreflight({
    requestedProfile: selected,
    authorizedProfile: selected,
    observedProfile: { model: selected.model, effort: selected.effort, fastMode: false },
    appliedSelection: launchSelectionFor(selected),
    capability: verifiedCapability,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.result, "SET_AND_VERIFIED");
  assert.equal(result.modelIdentityEvidence, "SET_AND_VERIFIED");
});

test("only an execution-reasoning shortfall can justify profile escalation", () => {
  assert.equal(failureMayAuthorizeProfileEscalation("EXECUTION_REASONING_SHORTFALL"), true);
  for (const failure of ["CHAT_PLAN_DEFECT", "ACCESS_CONTEXT_DEFECT", "MECHANICAL_EXECUTION_FAILURE", "NOT_APPLICABLE"] as const) {
    assert.equal(failureMayAuthorizeProfileEscalation(failure), false);
  }
});

test("routing telemetry rejects prompt/source/secret fields", () => {
  const binding = receiptBinding(profile());
  const withPrompt = { ...binding, routing_telemetry: { ...binding.routing_telemetry, prompt: "forbidden" } };
  const withSecret = { ...binding, secret: "forbidden" };
  assert.equal(workExecutionReceiptBindingSchema.safeParse(withPrompt).success, false);
  assert.equal(workExecutionReceiptBindingSchema.safeParse(withSecret).success, false);
});

test("only eligible nontrivial Work receipts count, and 5/10 checkpoints never mutate policy", () => {
  const firstFive = Array.from({ length: 5 }, (_, index) => telemetryEvent(index + 1));
  assert.equal(completedWorkRoutingTelemetryCount([...firstFive, telemetryEvent(99, false)]), 5);
  const five = buildWorkRoutingCheckpointEnvelopes(firstFive);
  assert.equal(five.length, 1);
  if (five[0]?.data.type === "work_model_routing_checkpoint_recorded") {
    assert.equal(five[0].data.checkpoint_kind, "LOCAL_SUMMARY");
    assert.equal(five[0].data.policy_mutated, false);
    assert.deepEqual(five[0].data.identity_evidence_counts, [{ key: "SET_REQUEST_ONLY", count: 5 }]);
  }
  const firstTen = Array.from({ length: 10 }, (_, index) => telemetryEvent(index + 1));
  const ten = buildWorkRoutingCheckpointEnvelopes([...firstTen, checkpointEvent(5)]);
  assert.equal(ten.length, 1);
  if (ten[0]?.data.type === "work_model_routing_checkpoint_recorded") {
    assert.equal(ten[0].data.checkpoint_kind, "CHAT_POLICY_REVIEW");
    assert.equal(ten[0].data.policy_mutated, false);
    assert.equal(ten[0].data.review_required, true);
  }
});

test("ordinary setter-only evidence permits truthful finalization", () => {
  const result = evaluateFinalResponseAdmission(finalizationWorker());
  assert.equal(result.decision, "ALLOW_ROOT_CLOSE");
  assert.equal(result.terminalResponseAllowed, true);
});

test("finalization rejects mismatches, required missing readback, wrong provenance, and self-escalation", () => {
  assert.equal(evaluateFinalResponseAdmission(finalizationWorker({ receipt: null })).decision, "REJECT_MISSING_WORK_EXECUTION_PROFILE");
  assert.equal(evaluateFinalResponseAdmission(finalizationWorker({
    binding: receiptBinding(profile(), { applied_selection: null }),
  })).decision, "WORK_EXECUTION_PROFILE_MISMATCH");
  assert.equal(evaluateFinalResponseAdmission(finalizationWorker({
    binding: receiptBinding(profile(), { observed_profile: { model: "GPT_6_ASTRA", effort: null, fastMode: null } }),
  })).decision, "WORK_EXECUTION_PROFILE_MISMATCH");
  assert.equal(evaluateFinalResponseAdmission(finalizationWorker({
    baseProfile: profile({ assuranceRequirement: "INDEPENDENT_READBACK_REQUIRED" }),
  })).decision, "WORK_EXECUTION_PROFILE_UNVERIFIABLE");
  assert.equal(evaluateFinalResponseAdmission(finalizationWorker({
    authorizationOverrides: { directive_artifact_sha256: "c".repeat(64) },
  })).decision, "REJECT_INVALID_EXECUTION_DIRECTIVE_PROVENANCE");

  const target = profile({
    model: "GPT_6_ASTRA", effort: "LOW", routingTier: "ASTRA_LOW", routingTriggers: ["EXECUTION_REASONING_SHORTFALL"],
  });
  assert.equal(evaluateFinalResponseAdmission(finalizationWorker({
    binding: receiptBinding(profile(), {
      escalations: [{ from_profile: profile(), to_profile: target, authorization_id: "authorization:missing" }],
      final_profile: target,
    }),
  })).decision, "REJECT_UNAUTHORIZED_WORK_EXECUTION_PROFILE_ESCALATION");
});

test("the durable admission consumer seam uses the current execution_directive_recorded event and admits setter-only execution", () => {
  const store = new EventStore(":memory:");
  seedStore(store);
  const priorEvents = store.workerEvents("auth");
  const priorReasoning = priorEvents.findLast((event) => event.data.type === "reasoning_supervision_recorded")?.data;
  const priorDirective = priorEvents.findLast((event) => event.data.type === "execution_directive_recorded")?.data;
  assert.equal(priorReasoning?.type, "reasoning_supervision_recorded");
  assert.equal(priorDirective?.type, "execution_directive_recorded");
  if (priorReasoning?.type !== "reasoning_supervision_recorded" || priorDirective?.type !== "execution_directive_recorded") return;

  const selected = profile();
  const now = "2026-09-14T03:01:00.000Z";
  const directiveId = "execution-directive:auth:setter-only";
  const decisionId = "reasoning-decision:auth:setter-only";
  const sourceMessageId = "chat-message:auth:setter-only";
  store.append({
    schema_version: 2, event_id: sourceMessageId, mission_id: "mission-control-demo", occurred_at: now,
    data: {
      type: "reasoning_message_recorded",
      worker: "auth",
      stable_supervisor_id: "supervisor:auth",
      message_id: sourceMessageId,
      thread_id: "thread:auth",
      surface_role: "PROJECT_MANAGER",
      provider_surface: "CHATGPT_WORK",
      model_mode: "CHAT_AUTHORED",
      account_workspace: "OWNER_WORKSPACE",
      author_role: "ASSISTANT",
      sent_at_source: now,
      received_at_mission_control: now,
      body_sha256: sourceDigest,
      exact_visible_body: null,
      immutable_provider_locator: "https://chatgpt.com/c/source-bound-directive",
      parent_message_id: null,
      owner_direction_id: null,
      decision_request_id: null,
      acquisition_method: "PROVIDER_DIRECT",
      provenance_status: "VERIFIED",
      limitations: [],
      recorded_by: "collector:provider",
    },
  });
  store.append({
    schema_version: 2, event_id: "reasoning:auth:setter-only", mission_id: "mission-control-demo", occurred_at: now,
    data: {
      ...priorReasoning,
      decision_id: decisionId,
      active_execution_directive_id: directiveId,
      last_reasoning_review_at: now,
    },
  });
  store.append({
    schema_version: 2, event_id: "directive:auth:setter-only", mission_id: "mission-control-demo", occurred_at: now,
    data: {
      ...priorDirective,
      directive_id: directiveId,
      directive_revision: 1,
      chat_decision_id: decisionId,
      directive_schema_version: 3,
      directive_artifact_sha256: directiveArtifactDigest,
      source_message_id: sourceMessageId,
      source_body_sha256: sourceDigest,
      work_execution_profile: selected,
      status: "ACTIVE",
    },
  });

  const proof = currentExecutionDirectiveProof("auth", store.allEvents());
  assert.ok(proof);
  assert.notEqual(proof.directiveArtifactSha256, proof.sourceBodySha256);
  const request = admissionRequest(selected).request as unknown as ChatWorkAuthorityRequest;
  request.requestId = "admission:auth:setter-only";
  request.sourceReceipt = {
    messageId: sourceMessageId,
    bodySha256: sourceDigest,
    claimedSurface: "CHATGPT_PROJECT_MANAGER",
    observedSurface: "CHATGPT_PROJECT_MANAGER",
    provenanceStatus: "VERIFIED",
    authorActor: "PROJECT_MANAGER_CHAT",
  };
  request.executionDirectiveBinding = {
    directiveId, directiveRevision: 1, taskId: priorDirective.task_id, directiveArtifactSha256: directiveArtifactDigest,
  };
  const admission = evaluateSupervisionAdmission("auth", {
    id: "worker:auth", kind: "WORKER", workerScopes: ["auth"], taskScopes: [priorDirective.task_id],
  }, { request, factualPacket: null }, now, undefined, proof);
  assert.equal(admission.mayExecute, true);

  const authorization = buildWorkExecutionAuthorizationEnvelope({ worker: "auth", request, authorizedProfile: selected, now });
  store.append(authorization);
  const evaluated = evaluatePersistedWorkExecutionPreflight({
    worker: "auth",
    body: {
      authorizationId: authorization.data.type === "work_execution_profile_authorized" ? authorization.data.authorization_id : "invalid",
      requestedProfile: selected,
      observedProfile: { model: null, effort: null, fastMode: null },
      appliedSelection: launchSelectionFor(selected),
    },
    events: store.allEvents(),
    now,
  });
  assert.equal(evaluated.preflight.allowed, true);
  assert.equal(evaluated.preflight.modelIdentityEvidence, "SET_REQUEST_ONLY");
  store.append(evaluated.envelope);
  const authorizationData = authorization.data;
  const preflightData = evaluated.envelope.data;
  assert.equal(authorizationData.type, "work_execution_profile_authorized");
  assert.equal(preflightData.type, "work_execution_preflight_recorded");
  if (authorizationData.type !== "work_execution_profile_authorized" || preflightData.type !== "work_execution_preflight_recorded") return;

  store.append({
    schema_version: 2, event_id: "execution-start:auth:setter-only", mission_id: "mission-control-demo", occurred_at: now,
    data: {
      type: "codex_execution_started",
      worker: "auth",
      execution_start_id: "execution-start:auth:setter-only",
      worker_run_id: "run-auth-setter-only",
      task_id: priorDirective.task_id,
      directive_id: directiveId,
      directive_revision: 1,
      started_at: now,
      execution_mode: "SUBSTANTIVE",
      declared_tactical_boundary: "Bounded setter-only consumer-seam test.",
      work_profile_authorization_id: authorizationData.authorization_id,
      work_profile_preflight_id: preflightData.preflight_id,
    },
  });
  const priorReceipt = priorEvents.findLast((event) => event.data.type === "execution_receipt_recorded")?.data;
  assert.equal(priorReceipt?.type, "execution_receipt_recorded");
  if (priorReceipt?.type !== "execution_receipt_recorded") return;
  store.append({
    schema_version: 2, event_id: "execution-receipt:auth:setter-only", mission_id: "mission-control-demo", occurred_at: "2026-09-14T03:02:00.000Z",
    data: {
      ...priorReceipt,
      receipt_id: "execution-receipt:auth:setter-only",
      directive_id: directiveId,
      directive_revision: 1,
      task_id: priorDirective.task_id,
      worker_run_id: "run-auth-setter-only",
      started_at: now,
      stopped_at: "2026-09-14T03:02:00.000Z",
      receipt_schema_version: 3,
      work_execution: {
        ...receiptBinding(selected),
        authorization_id: authorizationData.authorization_id,
        preflight_id: preflightData.preflight_id,
      },
    },
  });
  assert.equal(completedWorkRoutingTelemetryCount(store.allEvents()), 1);
  assert.equal(store.verifyChain().valid, true);
  store.close();
});

function receiptBinding(base: WorkExecutionProfile, overrides: Record<string, unknown> = {}) {
  return {
    authorization_id: "authorization:profile:1",
    preflight_id: "preflight:profile:1",
    requested_profile: base,
    authorized_profile: base,
    observed_profile: { model: null, effort: null, fastMode: null },
    applied_selection: launchSelectionFor(base),
    observability: { model: "SET_ONLY", effort: "SET_ONLY", fastMode: "UNOBSERVABLE" },
    preflight: "SET_REQUEST_ACCEPTED_UNVERIFIED",
    preflight_decision: "WORK_EXECUTION_SET_REQUEST_ACCEPTED_UNVERIFIED",
    model_identity_evidence: "SET_REQUEST_ONLY",
    escalations: [],
    final_profile: base,
    fast_mode_observed: null,
    allowance_delta: null,
    routing_telemetry: {
      eligible: true,
      telemetry_index: 1,
      repository_id: "owner/repository",
      residual_execution_class: "BOUNDED_IMPLEMENTATION",
      direct_consumer_seam_result: "PASS",
      failure_classification: "NOT_APPLICABLE",
      wall_time_seconds: 10,
      retries: 0,
      interventions: [],
      test_wall_time_seconds: 2,
      escalation_occurred: false,
      final_successful_tier: base.routingTier,
      model_identity_evidence: "SET_REQUEST_ONLY",
      hindsight_initial_tier: "APPROPRIATE",
    },
    ...overrides,
  };
}

function telemetryEvent(index: number, eligible = true): StoredEvent {
  return {
    id: index,
    sequence: index,
    eventId: `receipt:${index}`,
    schemaVersion: 2,
    missionId: "telemetry-test",
    worker: "profile-worker",
    type: "execution_receipt_recorded",
    occurredAt: `2026-09-14T00:${String(index).padStart(2, "0")}:00.000Z`,
    receivedAt: `2026-09-14T00:${String(index).padStart(2, "0")}:00.000Z`,
    previousHash: null,
    eventHash: "b".repeat(64),
    producerId: "worker:profile-worker",
    producerKind: "WORKER",
    data: {
      type: "execution_receipt_recorded",
      receipt_schema_version: 3,
      work_execution: {
        ...receiptBinding(profile()),
        routing_telemetry: eligible
          ? { ...receiptBinding(profile()).routing_telemetry, telemetry_index: index }
          : { eligible: false, telemetry_index: null, exclusion_reason: "TRIVIAL" },
      },
    },
  } as unknown as StoredEvent;
}

function checkpointEvent(count: 5 | 10): StoredEvent {
  return { sequence: 100 + count, data: { type: "work_model_routing_checkpoint_recorded", checkpoint_count: count } } as unknown as StoredEvent;
}

function finalizationWorker(options: {
  receipt?: null;
  baseProfile?: WorkExecutionProfile;
  binding?: ReturnType<typeof receiptBinding>;
  authorizationOverrides?: Record<string, unknown>;
} = {}): WorkerState {
  const baseProfile = options.baseProfile ?? profile();
  const binding = options.receipt === null ? null : options.binding ?? receiptBinding(baseProfile);
  const timeline = [
    {
      sequence: 20,
      data: {
        type: "execution_directive_recorded",
        directive_schema_version: 3,
        directive_id: "directive:profile:1",
        directive_revision: 1,
        task_id: "task:profile:1",
        directive_artifact_sha256: directiveArtifactDigest,
        source_message_id: "chat-message:profile:1",
        source_body_sha256: sourceDigest,
        work_execution_profile: baseProfile,
        status: "ACTIVE",
      },
    },
    {
      sequence: 25,
      data: {
        type: "work_execution_profile_authorized",
        authorization_id: "authorization:profile:1",
        directive_id: "directive:profile:1",
        directive_revision: 1,
        task_id: "task:profile:1",
        directive_artifact_sha256: directiveArtifactDigest,
        source_message_id: "chat-message:profile:1",
        source_body_sha256: sourceDigest,
        authorized_profile: baseProfile,
        ...options.authorizationOverrides,
      },
    },
    ...(binding ? [{
      sequence: 30,
      data: {
        type: "execution_receipt_recorded",
        directive_id: "directive:profile:1",
        directive_revision: 1,
        receipt_schema_version: 3,
        work_execution: binding,
      },
    }] : []),
  ];
  return {
    terminal: {
      stateVectorSha256: sourceDigest,
      rootTerminalizationAllowed: true,
      decision: "ALLOW_ROOT_CLOSE",
      unresolvedOwnerObligation: false,
    },
    timeline,
  } as unknown as WorkerState;
}
