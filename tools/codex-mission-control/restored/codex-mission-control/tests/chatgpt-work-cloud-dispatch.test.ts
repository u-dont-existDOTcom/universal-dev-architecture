import assert from "node:assert/strict";
import test from "node:test";

import { sha256 } from "../lib/canonical";
import {
  CHATGPT_WORK_CLOUD_TARGET,
  buildWorkCloudDispatchRequestedEnvelope,
  buildWorkCloudHandoffIntentEnvelope,
  dispatchAndRecordChatGptWorkCloud,
  dispatchChatGptWorkCloud,
  type WorkCloudAppExecutor,
  type WorkCloudDispatchInput,
  type WorkCloudExecutorOutcome,
  WorkCloudDispatchAmbiguityError,
} from "../lib/chatgpt-work-cloud-dispatch";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import { projectWorker } from "../lib/projection";
import { parseAppendEnvelope } from "../lib/schema";
import { seedStore } from "../lib/seed";
import { ContractInvariantError, EventStore } from "../lib/store";
import {
  WORK_MODEL_ROUTING_POLICY_BASE_COMMIT,
  WORK_MODEL_ROUTING_POLICY_REF,
} from "../lib/work-execution-profile";

const now = "2026-09-19T03:20:00.000Z";
const sourceBodySha256 = sha256("native Work source directive");
const directiveArtifactSha256 = sha256("native Work directive artifact");
const taskId = "task:auth";
const systemProducer: AuthenticatedProducer = {
  id: "system:chatgpt-work-cloud-dispatch",
  kind: "SYSTEM",
  workerScopes: ["auth"],
  taskScopes: [taskId],
};

function input(overrides: Partial<WorkCloudDispatchInput> = {}): WorkCloudDispatchInput {
  return {
    dispatchId: "dispatch:auth:work-cloud:1",
    mode: "CREATE",
    binding: {
      worker: "auth",
      directiveId: "execution-directive:auth:work-cloud",
      directiveRevision: 1,
      taskId,
      directiveArtifactSha256,
      sourceMessageId: "chat-message:auth:work-cloud",
      sourceBodySha256,
    },
    sourceChatTitle: "Native Work fixture source",
    sourceChatUrl: "chatgpt-conversation://fixture-source",
    requestedWorkTitle: "Work — Native fixture",
    chatgptProjectId: "fixture-project",
    existingWorkThreadId: null,
    prompt: "Execute the exact source-bound directive and return a receipt.",
    capabilityEvidence: {
      observedAt: now,
      appVersion: "2026.09.19",
      createThreadTargetAvailable: true,
      sendMessageToThreadAvailable: true,
      nativeSurfaceVerificationAvailable: true,
    },
    requestedAt: now,
    producerId: systemProducer.id,
    ...overrides,
  };
}

function executor(outcome: WorkCloudExecutorOutcome, calls: unknown[]): WorkCloudAppExecutor {
  return {
    createThread: async (request) => { calls.push(request); return outcome; },
    sendMessageToThread: async (request) => { calls.push(request); return outcome; },
  };
}

test("CREATE uses only the native chatgptWorkCloud target and omits Codex-only setters", async () => {
  const calls: unknown[] = [];
  const result = await dispatchChatGptWorkCloud(input(), executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "work-thread-native-1", hostId: null }, calls));
  assert.equal(calls.length, 1);
  const call = calls[0] as Record<string, unknown>;
  assert.deepEqual(call.target, { type: CHATGPT_WORK_CLOUD_TARGET, projectId: "fixture-project" });
  assert.equal(call.requestedAt, now);
  assert.equal("model" in call, false);
  assert.equal("thinking" in call, false);
  assert.equal(result.result.data.type, "chatgpt_work_cloud_dispatch_recorded");
  if (result.result.data.type !== "chatgpt_work_cloud_dispatch_recorded") return;
  assert.equal(result.result.data.status, "READY");
  assert.equal(result.result.data.surface_verification, "VERIFIED_NATIVE_WORK");
  assert.equal(result.result.data.work_thread_id, "work-thread-native-1");
  parseAppendEnvelope(result.request);
  parseAppendEnvelope(result.result);
});

test("a Codex-backed response is rejected even when it uses a Work-like title", async () => {
  const result = await dispatchChatGptWorkCloud(input(), executor({ kind: "WRONG_SURFACE", observedSurface: "CODEX" }, []));
  assert.equal(result.result.data.type, "chatgpt_work_cloud_dispatch_recorded");
  if (result.result.data.type !== "chatgpt_work_cloud_dispatch_recorded") return;
  assert.equal(result.result.data.status, "FAILED");
  assert.equal(result.result.data.surface_verification, "REJECTED_WRONG_SURFACE");
  assert.equal(result.result.data.work_thread_id, null);
  assert.equal(result.result.data.error_code, "WORK_CLOUD_WRONG_SURFACE_CODEX");
});

test("a pending clientThreadId remains setup-pending and is not reported as a ready Work thread", async () => {
  const result = await dispatchChatGptWorkCloud(input(), executor({ kind: "PENDING_SETUP", clientThreadId: "client-work-setup-1" }, []));
  assert.equal(result.result.data.type, "chatgpt_work_cloud_dispatch_recorded");
  if (result.result.data.type !== "chatgpt_work_cloud_dispatch_recorded") return;
  assert.equal(result.result.data.status, "PENDING_SETUP");
  assert.equal(result.result.data.work_thread_id, null);
  assert.equal(result.result.data.client_thread_id, "client-work-setup-1");
  assert.equal(result.result.data.surface_verification, "NOT_VERIFIED");
});

test("the product approval gate is preserved instead of falling back to Codex", async () => {
  const result = await dispatchChatGptWorkCloud(
    input(),
    executor({ kind: "PENDING_APPROVAL" }, []),
  );
  assert.equal(result.result.data.type, "chatgpt_work_cloud_dispatch_recorded");
  if (result.result.data.type !== "chatgpt_work_cloud_dispatch_recorded") return;
  assert.equal(result.result.data.status, "PENDING_APPROVAL");
  assert.equal(result.result.data.approval_state, "PENDING_OWNER_ACCEPT");
  assert.equal(result.result.data.work_thread_id, null);
});

test("missing product-approved mutation capability records the exact approval gate and never calls an executor", async () => {
  const calls: unknown[] = [];
  const result = await dispatchChatGptWorkCloud(
    input({ capabilityEvidence: { ...input().capabilityEvidence, createThreadTargetAvailable: false } }),
    executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "must-not-run", hostId: null }, calls),
  );
  assert.equal(calls.length, 0);
  assert.equal(result.result.data.type, "chatgpt_work_cloud_dispatch_recorded");
  if (result.result.data.type !== "chatgpt_work_cloud_dispatch_recorded") return;
  assert.equal(result.result.data.status, "PENDING_APPROVAL");
  assert.equal(result.result.data.approval_state, "PENDING_OWNER_ACCEPT");
  assert.equal(result.result.data.error_code, null);
});

test("missing native-surface verification fails closed before app execution", async () => {
  const calls: unknown[] = [];
  const result = await dispatchChatGptWorkCloud(
    input({ capabilityEvidence: { ...input().capabilityEvidence, nativeSurfaceVerificationAvailable: false } }),
    executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "must-not-run", hostId: null }, calls),
  );
  assert.equal(calls.length, 0);
  assert.equal(result.result.data.type, "chatgpt_work_cloud_dispatch_recorded");
  if (result.result.data.type !== "chatgpt_work_cloud_dispatch_recorded") return;
  assert.equal(result.result.data.status, "UNAVAILABLE");
  assert.equal(result.result.data.error_code, "WORK_CLOUD_SURFACE_VERIFICATION_UNAVAILABLE");
});

test("CONTINUE sends to the exact persisted Work thread and not a title search", async () => {
  const calls: unknown[] = [];
  const result = await dispatchChatGptWorkCloud(
    input({
      dispatchId: "dispatch:auth:work-cloud:continue",
      mode: "CONTINUE",
      existingWorkThreadId: "work-thread-native-1",
    }),
    executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "work-thread-native-1", hostId: null }, calls),
  );
  assert.deepEqual(calls, [{ threadId: "work-thread-native-1", prompt: input().prompt }]);
  assert.equal(result.result.data.type, "chatgpt_work_cloud_dispatch_recorded");
  if (result.result.data.type !== "chatgpt_work_cloud_dispatch_recorded") return;
  assert.equal(result.result.data.app_tool, "send_message_to_thread");
});

test("runtime records the exact request before invoking the app executor and records the result afterward", async () => {
  const order: string[] = [];
  const sink = {
    getWorkCloudDispatch: async () => null,
    recordWorkerEvents: async (_worker: string, events: unknown[]) => {
      const event = events[0] as { data: { type: string } };
      order.push(event.data.type);
    },
  };
  const app: WorkCloudAppExecutor = {
    createThread: async () => {
      order.push("app:create_thread");
      return { kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "work-thread-native-1", hostId: null };
    },
    sendMessageToThread: async () => { throw new Error("not used"); },
  };
  await dispatchAndRecordChatGptWorkCloud(input(), app, sink);
  assert.deepEqual(order, [
    "chatgpt_work_cloud_dispatch_requested",
    "chatgpt_work_cloud_handoff_intent_recorded",
    "app:create_thread",
    "chatgpt_work_cloud_dispatch_recorded",
  ]);
});

test("durable retry returns an existing completed dispatch without invoking the app twice", async () => {
  const completed = await dispatchChatGptWorkCloud(input(), executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "work-thread-native-1", hostId: null }, []));
  const calls: unknown[] = [];
  const result = await dispatchAndRecordChatGptWorkCloud(input(), executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "duplicate", hostId: null }, calls), {
    getWorkCloudDispatch: async () => completed,
    recordWorkerEvents: async () => { throw new Error("must not rewrite completed dispatch"); },
  });
  assert.equal(calls.length, 0);
  assert.deepEqual(result, completed);
});

test("same logical HTTP retry at a later wall clock reuses the durable request", async () => {
  const completed = await dispatchChatGptWorkCloud(input(), executor({
    kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "work-thread-native-1", hostId: null,
  }, []));
  const calls: unknown[] = [];
  const laterInput = input({
    requestedAt: "2026-09-19T03:25:00.000Z",
    capabilityEvidence: { ...input().capabilityEvidence, observedAt: "2026-09-19T03:24:59.000Z" },
  });
  const replayed = await dispatchAndRecordChatGptWorkCloud(laterInput, executor({
    kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "duplicate", hostId: null,
  }, calls), {
    getWorkCloudDispatch: async () => completed,
    recordWorkerEvents: async () => { throw new Error("must not rewrite a completed logical dispatch"); },
  }, "2026-09-19T03:25:01.000Z");
  assert.equal(calls.length, 0);
  assert.deepEqual(replayed, completed);
  assert.equal(replayed.request.occurred_at, now);
});

test("PENDING_SETUP replay re-resolves from original request time without a second create", async () => {
  const pending = await dispatchChatGptWorkCloud(input(), executor({
    kind: "PENDING_SETUP", clientThreadId: "local-chatgpt:pending-1",
  }, []));
  const calls: string[] = [];
  const app: WorkCloudAppExecutor = {
    createThread: async () => { calls.push("create"); throw new Error("must not create twice"); },
    sendMessageToThread: async () => { throw new Error("not used"); },
    resolveCreatedThread: async (request) => {
      calls.push("resolve");
      assert.deepEqual(request, {
        clientThreadId: "local-chatgpt:pending-1",
        prompt: input().prompt,
        requestedAt: now,
        projectId: "fixture-project",
      });
      return { kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "stable-after-pending", hostId: null };
    },
  };
  const appended: unknown[] = [];
  const replayed = await dispatchAndRecordChatGptWorkCloud(input({
    requestedAt: "2026-09-19T03:25:00.000Z",
    capabilityEvidence: { ...input().capabilityEvidence, observedAt: "2026-09-19T03:24:59.000Z" },
  }), app, {
    getWorkCloudDispatch: async () => pending,
    recordWorkerEvents: async (_worker, events) => { appended.push(...events); },
  }, "2026-09-19T03:25:01.000Z");
  assert.deepEqual(calls, ["resolve"]);
  assert.equal(appended.length, 1);
  assert.deepEqual(replayed.request, pending.request);
  assert.equal(replayed.result.data.type, "chatgpt_work_cloud_dispatch_recorded");
  if (replayed.result.data.type !== "chatgpt_work_cloud_dispatch_recorded") return;
  assert.equal(replayed.result.data.status, "READY");
  assert.equal(replayed.result.data.work_thread_id, "stable-after-pending");
});

test("same dispatch id with different source-bound content fails closed", async () => {
  const completed = await dispatchChatGptWorkCloud(input(), executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "work-thread-native-1", hostId: null }, []));
  const calls: unknown[] = [];
  await assert.rejects(
    dispatchAndRecordChatGptWorkCloud(input({ prompt: "different prompt under a reused dispatch id" }), executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "duplicate", hostId: null }, calls), {
      getWorkCloudDispatch: async () => completed,
      recordWorkerEvents: async () => { throw new Error("must not rewrite a mismatched dispatch"); },
    }),
    WorkCloudDispatchAmbiguityError,
  );
  assert.equal(calls.length, 0);
});

test("request-only recovery with no handoff intent is proven unsent and resumes exactly once", async () => {
  const request = buildRequestForRetry();
  const calls: unknown[] = [];
  const appended: Array<{ data: { type: string } }> = [];
  const recovered = await dispatchAndRecordChatGptWorkCloud(input({
    requestedAt: "2026-09-19T03:25:00.000Z",
    capabilityEvidence: { ...input().capabilityEvidence, observedAt: "2026-09-19T03:24:59.000Z" },
  }), executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "recovered-once", hostId: null }, calls), {
    getWorkCloudDispatch: async () => ({ request, handoffIntent: null, result: null }),
    recordWorkerEvents: async (_worker, events) => { appended.push(...events as Array<{ data: { type: string } }>); },
  }, "2026-09-19T03:25:01.000Z");
  assert.equal(calls.length, 1);
  assert.deepEqual(appended.map((event) => event.data.type), [
    "chatgpt_work_cloud_handoff_intent_recorded",
    "chatgpt_work_cloud_dispatch_recorded",
  ]);
  assert.deepEqual(recovered.request, request);
});

test("request recovery after durable handoff intent is ambiguous and never replays the app call", async () => {
  const request = buildRequestForRetry();
  const handoffIntent = {
    schema_version: 2 as const, event_id: `work-cloud-handoff-intent:${input().dispatchId}`,
    mission_id: "mission-control-live", occurred_at: now,
    data: {
      type: "chatgpt_work_cloud_handoff_intent_recorded" as const, worker: "auth", dispatch_id: input().dispatchId,
      directive_id: input().binding.directiveId, directive_revision: 1, task_id: taskId, app_tool: "create_thread" as const,
      intent_at: now, producer_id: systemProducer.id, source: "TRUSTED_CHATGPT_APP_EXECUTOR_BOUNDARY" as const,
    },
  };
  const calls: unknown[] = [];
  await assert.rejects(dispatchAndRecordChatGptWorkCloud(input(), executor({
    kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "must-not-replay", hostId: null,
  }, calls), {
    getWorkCloudDispatch: async () => ({ request, handoffIntent, result: null }),
    recordWorkerEvents: async () => { throw new Error("must not append after ambiguous app-boundary intent"); },
  }), WorkCloudDispatchAmbiguityError);
  assert.equal(calls.length, 0);
});

test("unavailable executor records an unavailable result", async () => {
  const result = await dispatchChatGptWorkCloud(input(), null);
  assert.equal(result.result.data.type, "chatgpt_work_cloud_dispatch_recorded");
  if (result.result.data.type !== "chatgpt_work_cloud_dispatch_recorded") return;
  assert.equal(result.result.data.status, "UNAVAILABLE");
  assert.equal(result.result.data.error_code, "WORK_CLOUD_DISPATCH_UNAVAILABLE");
});

test("runtime normalizes a READY response that reports Codex as the actual surface", async () => {
  const result = await dispatchChatGptWorkCloud(input(), executor({ kind: "READY", surface: "CODEX", threadId: "codex-thread", hostId: null }, []));
  assert.equal(result.result.data.type, "chatgpt_work_cloud_dispatch_recorded");
  if (result.result.data.type !== "chatgpt_work_cloud_dispatch_recorded") return;
  assert.equal(result.result.data.status, "FAILED");
  assert.equal(result.result.data.surface_verification, "REJECTED_WRONG_SURFACE");
  assert.equal(result.result.data.error_code, "WORK_CLOUD_WRONG_SURFACE_CODEX");
});

test("caller input cannot self-attest ACCEPTED approval", () => {
  const forged = { ...input(), approvalState: "ACCEPTED" } as WorkCloudDispatchInput;
  const request = buildWorkCloudDispatchRequestedEnvelope(forged);
  assert.equal(request.data.type, "chatgpt_work_cloud_dispatch_requested");
  if (request.data.type !== "chatgpt_work_cloud_dispatch_requested") return;
  assert.equal(request.data.approval_state, "PENDING_OWNER_ACCEPT");
});

test("trusted app-executor events reject a mismatched authenticated system producer", async () => {
  const store = currentDirectiveStore();
  try {
    const created = await dispatchChatGptWorkCloud(input(), executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "work-thread-native-1", hostId: null }, []));
    assert.throws(() => store.append(created.request, now, {
      id: "system:other-dispatcher", kind: "SYSTEM", workerScopes: ["auth"], taskScopes: [taskId],
    }));
  } finally { store.close(); }
});

test("EventStore enforces handoff intent ordering and accepts only exact directly verified Work execution receipt", async () => {
  const store = currentDirectiveStore();
  try {
    const request = buildWorkCloudDispatchRequestedEnvelope(input());
    const intent = buildWorkCloudHandoffIntentEnvelope(input(), now);
    const created = await dispatchChatGptWorkCloud(input(), executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "work-thread-native-store", hostId: null }, []));
    store.append(request, now, systemProducer);
    store.append(intent, now, systemProducer);
    assert.equal(store.append(intent, now, systemProducer).eventId, intent.event_id); // exact replay is idempotent
    const secondIntent = { ...intent, event_id: `${intent.event_id}:duplicate` };
    assert.throws(() => store.append(secondIntent, now, systemProducer), ContractInvariantError);
    store.append(created.result, now, systemProducer);
    const receipt = {
      schema_version: 2 as const,
      event_id: "github-work-cloud-execution:store-fixture",
      mission_id: "mission-control-live",
      occurred_at: now,
      data: {
        type: "chatgpt_work_cloud_execution_receipt_recorded" as const,
        worker: "auth", dispatch_id: input().dispatchId,
        directive_id: input().binding.directiveId, directive_revision: 1, task_id: taskId,
        work_thread_id: "work-thread-native-store", status: "COMPLETED" as const,
        terminal_state: "IMPLEMENTATION_READY_FOR_REVIEW",
        check_summary: { passed: 3, failed: 0, not_run: 0 }, blocker_codes: [], artifact_sha256s: ["7".repeat(64)],
        github_comment_sha256: "8".repeat(64),
        github_receipt: { repository: "u-dont-existDOTcom/universal-dev-architecture", issue_number: 61, comment_id: 123,
          immutable_url: "https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/61#issuecomment-123", github_created_at: now },
        recorded_at: now, producer_id: "system:github-decision-receipts", source: "CHATGPT_WORK_GITHUB_RECEIPT_ATTESTED" as const,
      },
    };
    store.append(receipt, now, { id: "system:github-decision-receipts", kind: "SYSTEM", workerScopes: ["auth"], taskScopes: [taskId] });
    assert.equal(store.workerEvents("auth").filter((event) => event.data.type === "chatgpt_work_cloud_execution_receipt_recorded").length, 1);
  } finally { store.close(); }
});

test("ledger persists verified Work lineage and rejects unverified continuation or thread substitution", async () => {
  const store = currentDirectiveStore();
  try {
    const create = await dispatchChatGptWorkCloud(input(), executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "work-thread-native-1", hostId: null }, []));
    store.append(create.request, now, systemProducer);
    store.append(create.result, now, systemProducer);
    const projected = projectWorker(store.workerEvents("auth"));
    assert.equal(projected.workCloudDispatch.status, "READY");
    assert.equal(projected.workCloudDispatch.workThreadId, "work-thread-native-1");
    assert.equal(projected.workCloudDispatch.surfaceVerification, "VERIFIED_NATIVE_WORK");

    const continuationInput = input({
      dispatchId: "dispatch:auth:work-cloud:continue",
      mode: "CONTINUE",
      existingWorkThreadId: "work-thread-native-1",
    });
    const continued = await dispatchChatGptWorkCloud(continuationInput, executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "work-thread-native-1", hostId: null }, []), "2026-09-19T03:21:00.000Z");
    store.append(continued.request, "2026-09-19T03:21:00.000Z", systemProducer);
    store.append(continued.result, "2026-09-19T03:21:00.000Z", systemProducer);

    const nextRequest = await dispatchChatGptWorkCloud(
      input({ dispatchId: "dispatch:auth:work-cloud:next" }),
      executor({ kind: "PENDING_APPROVAL" }, []),
      "2026-09-19T03:21:30.000Z",
    );
    store.append(nextRequest.request, "2026-09-19T03:21:30.000Z", systemProducer);
    const pendingProjection = projectWorker(store.workerEvents("auth"));
    assert.equal(pendingProjection.workCloudDispatch.status, "REQUESTED");
    assert.equal(pendingProjection.workCloudDispatch.workThreadId, null);

    const wrong = await dispatchChatGptWorkCloud(
      input({ dispatchId: "dispatch:auth:work-cloud:wrong", mode: "CONTINUE", existingWorkThreadId: "work-thread-native-1" }),
      executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "codex-thread-renamed-work", hostId: null }, []),
      "2026-09-19T03:22:00.000Z",
    );
    store.append(wrong.request, "2026-09-19T03:22:00.000Z", systemProducer);
    assert.throws(() => store.append(wrong.result, "2026-09-19T03:22:00.000Z", systemProducer), ContractInvariantError);
  } finally { store.close(); }
});

test("ledger rejects CONTINUE when no prior verified native Work locator exists", async () => {
  const store = currentDirectiveStore();
  try {
    const continuation = await dispatchChatGptWorkCloud(
      input({ dispatchId: "dispatch:auth:work-cloud:no-lineage", mode: "CONTINUE", existingWorkThreadId: "codex-only-thread" }),
      executor({ kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "codex-only-thread", hostId: null }, []),
    );
    assert.throws(() => store.append(continuation.request, now, systemProducer), ContractInvariantError);
  } finally { store.close(); }
});

function buildRequestForRetry() {
  return buildWorkCloudDispatchRequestedEnvelope(input());
}

function currentDirectiveStore(): EventStore {
  const store = new EventStore(":memory:");
  seedStore(store);
  const events = store.workerEvents("auth");
  const priorReasoning = events.findLast((event) => event.data.type === "reasoning_supervision_recorded")?.data;
  const priorDirective = events.findLast((event) => event.data.type === "execution_directive_recorded")?.data;
  if (priorReasoning?.type !== "reasoning_supervision_recorded" || priorDirective?.type !== "execution_directive_recorded") {
    throw new Error("Seed lacks auth reasoning/directive.");
  }
  const sourceMessageId = "chat-message:auth:work-cloud";
  store.append({
    schema_version: 2, event_id: sourceMessageId, mission_id: "mission-control-demo", occurred_at: now,
    data: {
      type: "reasoning_message_recorded", worker: "auth", stable_supervisor_id: "supervisor:auth",
      message_id: sourceMessageId, thread_id: "thread:auth", surface_role: "PROJECT_MANAGER",
      provider_surface: "CHATGPT_WORK", model_mode: "CHAT_AUTHORED", account_workspace: "OWNER_WORKSPACE",
      author_role: "ASSISTANT", sent_at_source: now, received_at_mission_control: now,
      body_sha256: sourceBodySha256, exact_visible_body: null,
      immutable_provider_locator: "https://chatgpt.com/c/source-bound-work-directive",
      parent_message_id: null, owner_direction_id: null, decision_request_id: null,
      acquisition_method: "PROVIDER_DIRECT", provenance_status: "VERIFIED", limitations: [], recorded_by: "collector:provider",
    },
  });
  store.append({
    schema_version: 2, event_id: "reasoning:auth:work-cloud", mission_id: "mission-control-demo", occurred_at: now,
    data: { ...priorReasoning, decision_id: "reasoning-decision:auth:work-cloud",
      active_execution_directive_id: "execution-directive:auth:work-cloud", last_reasoning_review_at: now },
  });
  store.append({
    schema_version: 2, event_id: "directive:auth:work-cloud", mission_id: "mission-control-demo", occurred_at: now,
    data: {
      ...priorDirective,
      directive_id: "execution-directive:auth:work-cloud", directive_revision: 1,
      chat_decision_id: "reasoning-decision:auth:work-cloud", directive_schema_version: 3,
      directive_artifact_sha256: directiveArtifactSha256,
      source_message_id: sourceMessageId, source_body_sha256: sourceBodySha256,
      work_execution_profile: {
        model: "GPT_5_6_SOL", effort: "MEDIUM", routingTier: "SOL_MEDIUM", routingTriggers: [],
        fastModeRequest: "DO_NOT_ENABLE_FAST", assuranceRequirement: "SET_REQUEST_SUFFICIENT",
        policyRef: WORK_MODEL_ROUTING_POLICY_REF, routingPolicyBaseCommit: WORK_MODEL_ROUTING_POLICY_BASE_COMMIT,
        contractVersion: "TRUSTED_SETTER_V1",
      },
      execution_surface: "CHATGPT_WORK_CLOUD",
      status: "ACTIVE",
    },
  });
  return store;
}
