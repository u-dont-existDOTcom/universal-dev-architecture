import assert from "node:assert/strict";
import test from "node:test";

import type { ChatWorkAuthorityRequest } from "../lib/chat-work-authority-gate";
import { evaluateFinalResponseAdmission } from "../lib/final-response-gate";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import type { WorkerState } from "../lib/projection";
import type { StoredEvent } from "../lib/schema";
import { workExecutionReceiptBindingSchema } from "../lib/schema";
import { seedStore } from "../lib/seed";
import { ContractInvariantError, EventStore } from "../lib/store";
import {
  evaluateSupervisionAdmission,
  parseSupervisionAdmissionInput,
} from "../lib/supervision-admission-runtime";
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
  evaluatePersistedWorkExecutionPreflight,
} from "../lib/work-execution-runtime";

const digest = "a".repeat(64);
const workerProducer: AuthenticatedProducer = {
  id: "worker:profile-worker",
  kind: "WORKER",
  workerScopes: ["profile-worker"],
  taskScopes: ["task:profile-worker"],
};

function profile(overrides: Partial<WorkExecutionProfile> = {}): WorkExecutionProfile {
  return {
    model: "GPT_5_6_SOL",
    effort: "LOW",
    routingTier: "SOL_LOW",
    routingTriggers: [],
    fastMode: false,
    verificationRequirement: "EXACT_PROFILE_REQUIRED",
    policyRef: WORK_MODEL_ROUTING_POLICY_REF,
    policyCommit: WORK_MODEL_ROUTING_POLICY_COMMIT,
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
      ownerPolicy: { paidModelInferenceAllowed: false, activeZeroSpendDecisionId: "owner:zero-spend" },
      directiveSchemaVersion: version,
      executionDirectiveBinding: {
        directiveId: "directive:profile-worker:1",
        directiveRevision: 1,
        taskId: "task:profile-worker",
        directiveSha256: digest,
      },
      ...(workExecutionProfile === undefined ? {} : { workExecutionProfile }),
    },
    factualPacket: null,
  };
}

for (const valid of [
  profile(),
  profile({ effort: "MEDIUM", routingTier: "SOL_MEDIUM" }),
  profile({ model: "GPT_6_ASTRA", effort: "LOW", routingTier: "ASTRA_LOW", routingTriggers: ["HARD_UNKNOWN_CAUSAL_SEAM"] }),
]) {
  test(`valid ${valid.routingTier} profile is admitted exactly`, () => {
    const result = evaluateSupervisionAdmission("profile-worker", workerProducer, admissionRequest(valid));
    assert.equal(result.mayExecute, true);
    assert.deepEqual(result.authorizedWorkExecutionProfile, valid);
  });
}

test("tier/model and tier/effort mismatches are rejected as invalid profiles", () => {
  const invalid = profile({ model: "GPT_6_ASTRA", routingTier: "SOL_LOW" });
  const result = evaluateSupervisionAdmission("profile-worker", workerProducer, admissionRequest(invalid));
  assert.equal(result.mayExecute, false);
  assert.equal(result.primaryDecision.decision, "REJECT_INVALID_WORK_EXECUTION_PROFILE");
});

for (const invalid of [
  profile({ model: "GPT_6_ASTRA", effort: "LOW", routingTier: "ASTRA_LOW", routingTriggers: [] }),
  profile({ effort: "HIGH", routingTier: "SOL_HIGH_EXCEPTION", routingTriggers: [] }),
]) {
  test(`${invalid.routingTier} requires a non-empty source-bound trigger`, () => {
    assert.equal(workExecutionProfileSchema.safeParse(invalid).success, false);
  });
}

test("new-format missing profile is rejected while a legacy input recovers only the explicit sentinel", () => {
  const missingBody = admissionRequest();
  delete (missingBody.request as Record<string, unknown>).workExecutionProfile;
  const missing = evaluateSupervisionAdmission("profile-worker", workerProducer, missingBody);
  assert.equal(missing.primaryDecision.decision, "REJECT_MISSING_WORK_EXECUTION_PROFILE");
  assert.equal(missing.mayExecute, false);

  const legacyBody = admissionRequest(profile(), 2);
  delete (legacyBody.request as Record<string, unknown>).workExecutionProfile;
  delete (legacyBody.request as Record<string, unknown>).executionDirectiveBinding;
  const parsed = parseSupervisionAdmissionInput(legacyBody);
  assert.equal(parsed.request.workExecutionProfile, LEGACY_MODEL_PROFILE_UNSPECIFIED);
  const legacy = evaluateSupervisionAdmission("profile-worker", workerProducer, legacyBody);
  assert.equal(legacy.primaryDecision.decision, "REJECT_MISSING_WORK_EXECUTION_PROFILE");

  const retrofittedLegacy = evaluateSupervisionAdmission("profile-worker", workerProducer, admissionRequest(profile(), 2));
  assert.equal(retrofittedLegacy.primaryDecision.decision, "REJECT_INVALID_WORK_EXECUTION_PROFILE");
  assert.equal(retrofittedLegacy.mayExecute, false);
});

const verifiedCapability: WorkExecutionCapabilityMatrix = {
  surfaceId: "TEST_SET_AND_VERIFY",
  interface: "STRUCTURED_API",
  model: "SET_AND_VERIFY",
  effort: "SET_AND_VERIFY",
  fastMode: "SET_AND_VERIFY",
};

test("observed model, effort, and Fast mismatches fail closed before launch", () => {
  const authorized = profile({ effort: "MEDIUM", routingTier: "SOL_MEDIUM" });
  for (const observedProfile of [
    { model: "GPT_6_ASTRA" as const, effort: "MEDIUM" as const, fastMode: false },
    { model: "GPT_5_6_SOL" as const, effort: "HIGH" as const, fastMode: false },
    { model: "GPT_5_6_SOL" as const, effort: "MEDIUM" as const, fastMode: true },
  ]) {
    const result = evaluateWorkExecutionPreflight({
      requestedProfile: authorized,
      authorizedProfile: authorized,
      observedProfile,
      appliedSelection: launchSelectionFor(authorized),
      capability: verifiedCapability,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.decision, "WORK_EXECUTION_PROFILE_MISMATCH");
  }
});

test("current material profile is explicitly unverifiable, while the source-authorized simple deterministic case proceeds without fabricated observation", () => {
  const material = profile();
  const observed = { model: null, effort: null, fastMode: null };
  const blocked = evaluateWorkExecutionPreflight({
    requestedProfile: material,
    authorizedProfile: material,
    observedProfile: observed,
    appliedSelection: launchSelectionFor(material),
    capability: CURRENT_WORK_EXECUTION_CAPABILITY,
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.decision, "WORK_EXECUTION_PROFILE_UNVERIFIABLE");
  assert.deepEqual(blocked.observedProfile, observed);

  const simple = profile({ verificationRequirement: "SIMPLE_DETERMINISTIC_UNOBSERVABLE_ALLOWED" });
  const allowed = evaluateWorkExecutionPreflight({
    requestedProfile: simple,
    authorizedProfile: simple,
    observedProfile: observed,
    appliedSelection: launchSelectionFor(simple),
    capability: CURRENT_WORK_EXECUTION_CAPABILITY,
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.decision, "PROFILE_FIELD_UNOBSERVABLE_PROCEEDED_BY_POLICY");
  assert.deepEqual(allowed.observedProfile, observed);
});

test("a set-capable surface must prove the exact setter request was applied before even a simple unobservable launch", () => {
  const simple = profile({ verificationRequirement: "SIMPLE_DETERMINISTIC_UNOBSERVABLE_ALLOWED" });
  const result = evaluateWorkExecutionPreflight({
    requestedProfile: simple,
    authorizedProfile: simple,
    observedProfile: { model: null, effort: null, fastMode: null },
    appliedSelection: null,
    capability: CURRENT_WORK_EXECUTION_CAPABILITY,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.decision, "WORK_EXECUTION_PROFILE_MISMATCH");
  assert.ok(result.reasonCodes.includes("PROFILE_FIELD_MISMATCH_MODEL"));
  assert.ok(result.reasonCodes.includes("PROFILE_FIELD_MISMATCH_EFFORT"));
});

test("Fast false is an explicit verified contract value", () => {
  const authorized = profile();
  const result = evaluateWorkExecutionPreflight({
    requestedProfile: authorized,
    authorizedProfile: authorized,
    observedProfile: { model: "GPT_5_6_SOL", effort: "LOW", fastMode: false },
    appliedSelection: launchSelectionFor(authorized),
    capability: verifiedCapability,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.result, "MATCH");
  assert.equal(result.launchSelection.fastMode, false);
});

test("only an execution-reasoning shortfall can justify model-profile escalation", () => {
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
  assert.equal(five[0]?.data.type, "work_model_routing_checkpoint_recorded");
  if (five[0]?.data.type === "work_model_routing_checkpoint_recorded") {
    assert.equal(five[0].data.checkpoint_kind, "LOCAL_SUMMARY");
    assert.equal(five[0].data.policy_mutated, false);
    assert.equal(five[0].data.review_required, false);
  }
  const firstTen = Array.from({ length: 10 }, (_, index) => telemetryEvent(index + 1));
  const ten = buildWorkRoutingCheckpointEnvelopes([
    ...firstTen,
    checkpointEvent(5),
  ]);
  assert.equal(ten.length, 1);
  if (ten[0]?.data.type === "work_model_routing_checkpoint_recorded") {
    assert.equal(ten[0].data.checkpoint_kind, "CHAT_POLICY_REVIEW");
    assert.equal(ten[0].data.policy_mutated, false);
    assert.equal(ten[0].data.review_required, true);
  }
});

test("finalization rejects missing, mismatched, materially unverifiable, and self-escalated profile receipts", () => {
  assert.equal(evaluateFinalResponseAdmission(finalizationWorker({ receipt: null })).decision, "REJECT_MISSING_WORK_EXECUTION_PROFILE");
  assert.equal(evaluateFinalResponseAdmission(finalizationWorker({
    binding: receiptBinding(profile(), { authorized_profile: profile({ effort: "MEDIUM", routingTier: "SOL_MEDIUM" }) }),
  })).decision, "WORK_EXECUTION_PROFILE_MISMATCH");
  assert.equal(evaluateFinalResponseAdmission(finalizationWorker({
    binding: receiptBinding(profile(), { observed_profile: { model: "GPT_6_ASTRA", effort: "LOW", fastMode: false } }),
  })).decision, "WORK_EXECUTION_PROFILE_MISMATCH");
  assert.equal(evaluateFinalResponseAdmission(finalizationWorker({
    binding: receiptBinding(profile(), { applied_selection: null }),
  })).decision, "WORK_EXECUTION_PROFILE_MISMATCH");
  assert.equal(evaluateFinalResponseAdmission(finalizationWorker({
    binding: receiptBinding(profile(), {
      preflight: "UNVERIFIABLE",
      preflight_decision: "WORK_EXECUTION_PROFILE_UNVERIFIABLE",
      observability: { model: "SET_ONLY", effort: "SET_ONLY", fastMode: "UNOBSERVABLE" },
    }),
  })).decision, "WORK_EXECUTION_PROFILE_UNVERIFIABLE");
  const target = profile({ model: "GPT_6_ASTRA", effort: "LOW", routingTier: "ASTRA_LOW", routingTriggers: ["EXECUTION_REASONING_SHORTFALL"] });
  assert.equal(evaluateFinalResponseAdmission(finalizationWorker({
    binding: receiptBinding(profile(), {
      escalations: [{ from_profile: profile(), to_profile: target, authorization_id: "missing:new-chat-authorization" }],
      final_profile: target,
    }),
  })).decision, "REJECT_UNAUTHORIZED_WORK_EXECUTION_PROFILE_ESCALATION");
});

test("a fully verified exact profile does not prevent an otherwise authorized finalization", () => {
  const result = evaluateFinalResponseAdmission(finalizationWorker({ binding: receiptBinding(profile()) }));
  assert.equal(result.decision, "ALLOW_ROOT_CLOSE");
  assert.equal(result.terminalResponseAllowed, true);
});

test("the durable consumer seam blocks a materially unverifiable launch and admits only the persisted simple-policy preflight and matching receipt", () => {
  const store = new EventStore(":memory:");
  seedStore(store);
  const priorEvents = store.workerEvents("auth");
  const priorReasoning = priorEvents.findLast((event) => event.data.type === "reasoning_supervision_recorded")?.data;
  const priorDirective = priorEvents.findLast((event) => event.data.type === "execution_directive_recorded")?.data;
  assert.equal(priorReasoning?.type, "reasoning_supervision_recorded");
  assert.equal(priorDirective?.type, "execution_directive_recorded");
  if (priorReasoning?.type !== "reasoning_supervision_recorded" || priorDirective?.type !== "execution_directive_recorded") return;

  const appendCycle = (suffix: string, selected: WorkExecutionProfile, minute: number) => {
    const decisionId = `reasoning-decision:auth:${suffix}`;
    const directiveId = `execution-directive:auth:${suffix}`;
    const now = `2026-09-14T03:${String(minute).padStart(2, "0")}:00.000Z`;
    store.append({
      schema_version: 2,
      event_id: `reasoning:auth:${suffix}`,
      mission_id: "mission-control-demo",
      occurred_at: now,
      data: {
        ...priorReasoning,
        decision_id: decisionId,
        active_execution_directive_id: directiveId,
        last_reasoning_review_at: now,
      },
    });
    store.append({
      schema_version: 2,
      event_id: `directive:auth:${suffix}`,
      mission_id: "mission-control-demo",
      occurred_at: now,
      data: {
        ...priorDirective,
        directive_id: directiveId,
        chat_decision_id: decisionId,
        directive_schema_version: 3,
        work_execution_profile: selected,
      },
    });
    const requestId = `admission:auth:${suffix}`;
    const request = admissionRequest(selected).request as unknown as ChatWorkAuthorityRequest;
    request.requestId = requestId;
    request.executionDirectiveBinding = {
      directiveId,
      directiveRevision: 1,
      taskId: priorDirective.task_id,
      directiveSha256: digest,
    };
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
    store.append(evaluated.envelope);
    return { directiveId, now, authorization, evaluated };
  };

  const blocked = appendCycle("material", profile(), 1);
  assert.equal(blocked.evaluated.preflight.decision, "WORK_EXECUTION_PROFILE_UNVERIFIABLE");
  assert.throws(() => store.append({
    schema_version: 2,
    event_id: "execution-start:auth:material",
    mission_id: "mission-control-demo",
    occurred_at: blocked.now,
    data: {
      type: "codex_execution_started",
      worker: "auth",
      execution_start_id: "execution-start:auth:material",
      worker_run_id: "run-auth-material",
      task_id: priorDirective.task_id,
      directive_id: blocked.directiveId,
      directive_revision: 1,
      started_at: blocked.now,
      execution_mode: "SUBSTANTIVE",
      declared_tactical_boundary: "Bounded profile-contract consumer-seam test.",
      work_profile_authorization_id: blocked.authorization.data.type === "work_execution_profile_authorized" ? blocked.authorization.data.authorization_id : null,
      work_profile_preflight_id: blocked.evaluated.envelope.data.type === "work_execution_preflight_recorded" ? blocked.evaluated.envelope.data.preflight_id : null,
    },
  }), ContractInvariantError);

  const simpleProfile = profile({ verificationRequirement: "SIMPLE_DETERMINISTIC_UNOBSERVABLE_ALLOWED" });
  const admitted = appendCycle("simple", simpleProfile, 2);
  assert.equal(admitted.evaluated.preflight.decision, "PROFILE_FIELD_UNOBSERVABLE_PROCEEDED_BY_POLICY");
  const authorizationData = admitted.authorization.data;
  const preflightData = admitted.evaluated.envelope.data;
  assert.equal(authorizationData.type, "work_execution_profile_authorized");
  assert.equal(preflightData.type, "work_execution_preflight_recorded");
  if (authorizationData.type !== "work_execution_profile_authorized" || preflightData.type !== "work_execution_preflight_recorded") return;
  store.append({
    schema_version: 2,
    event_id: "execution-start:auth:simple",
    mission_id: "mission-control-demo",
    occurred_at: admitted.now,
    data: {
      type: "codex_execution_started",
      worker: "auth",
      execution_start_id: "execution-start:auth:simple",
      worker_run_id: "run-auth-simple",
      task_id: priorDirective.task_id,
      directive_id: admitted.directiveId,
      directive_revision: 1,
      started_at: admitted.now,
      execution_mode: "BOUNDED_MECHANICAL",
      declared_tactical_boundary: "Run only the exact deterministic profile-contract consumer-seam check.",
      work_profile_authorization_id: authorizationData.authorization_id,
      work_profile_preflight_id: preflightData.preflight_id,
    },
  });
  const priorReceipt = priorEvents.findLast((event) => event.data.type === "execution_receipt_recorded")?.data;
  assert.equal(priorReceipt?.type, "execution_receipt_recorded");
  if (priorReceipt?.type !== "execution_receipt_recorded") return;
  store.append({
    schema_version: 2,
    event_id: "execution-receipt:auth:simple",
    mission_id: "mission-control-demo",
    occurred_at: "2026-09-14T03:03:00.000Z",
    data: {
      ...priorReceipt,
      receipt_id: "execution-receipt:auth:simple",
      directive_id: admitted.directiveId,
      worker_run_id: "run-auth-simple",
      started_at: admitted.now,
      stopped_at: "2026-09-14T03:03:00.000Z",
      receipt_schema_version: 3,
      work_execution: {
        authorization_id: authorizationData.authorization_id,
        preflight_id: preflightData.preflight_id,
        requested_profile: preflightData.requested_profile,
        authorized_profile: preflightData.authorized_profile,
        observed_profile: preflightData.observed_profile,
        applied_selection: preflightData.applied_selection,
        observability: {
          model: preflightData.capability.model,
          effort: preflightData.capability.effort,
          fastMode: preflightData.capability.fastMode,
        },
        preflight: preflightData.preflight,
        preflight_decision: preflightData.decision,
        escalations: [],
        final_profile: simpleProfile,
        fast_mode: false,
        allowance_delta: null,
        routing_telemetry: {
          eligible: true,
          telemetry_index: 1,
          repository_id: "owner/repository",
          residual_execution_class: "SIMPLE_DETERMINISTIC",
          direct_consumer_seam_result: "PASS",
          failure_classification: "NOT_APPLICABLE",
          wall_time_seconds: 60,
          retries: 0,
          interventions: [],
          test_wall_time_seconds: 5,
          escalation_occurred: false,
          final_successful_tier: "SOL_LOW",
          hindsight_initial_tier: "APPROPRIATE",
        },
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
    observed_profile: { model: base.model, effort: base.effort, fastMode: base.fastMode },
    applied_selection: launchSelectionFor(base),
    observability: { model: "SET_AND_VERIFY", effort: "SET_AND_VERIFY", fastMode: "SET_AND_VERIFY" },
    preflight: "MATCH",
    preflight_decision: "WORK_EXECUTION_PROFILE_MATCH",
    escalations: [],
    final_profile: base,
    fast_mode: base.fastMode,
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
  return {
    sequence: 100 + count,
    data: { type: "work_model_routing_checkpoint_recorded", checkpoint_count: count },
  } as unknown as StoredEvent;
}

function finalizationWorker(options: { receipt?: null; binding?: ReturnType<typeof receiptBinding> } = {}): WorkerState {
  const baseProfile = profile();
  const binding = options.receipt === null ? null : options.binding ?? receiptBinding(baseProfile);
  const timeline = [
    {
      sequence: 20,
      data: {
        type: "execution_directive_recorded",
        directive_schema_version: 3,
        directive_id: "directive:profile:1",
        directive_revision: 1,
        work_execution_profile: baseProfile,
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
      stateVectorSha256: digest,
      rootTerminalizationAllowed: true,
      decision: "ALLOW_ROOT_CLOSE",
      unresolvedOwnerObligation: false,
    },
    timeline,
  } as unknown as WorkerState;
}
