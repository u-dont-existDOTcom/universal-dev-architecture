// The owner's retry of a native Work start that failed at the ChatGPT app (#385, 22 Oct 2026;
// lib/chatgpt-work-cloud-retry.ts).
import assert from "node:assert/strict";
import test from "node:test";

import { sha256 } from "../lib/canonical";
import { discoverDirectWorkCloudDispatches, selectWorkCloudDispatchCandidate } from "../lib/chatgpt-work-cloud-autodispatch";
import { NativeChatGptWorkCloudExecutor, type AppToolResult, type WorkCloudAppToolClient } from "../lib/chatgpt-work-cloud-controller";
import {
  dispatchChatGptWorkCloud,
  buildWorkCloudDispatchRecordedEnvelope,
  buildWorkCloudHandoffIntentEnvelope,
  type WorkCloudAppExecutor,
  type WorkCloudDispatchInput,
  type WorkCloudExecutorOutcome,
} from "../lib/chatgpt-work-cloud-dispatch";
import {
  authorizeWorkCloudDispatchRetry,
  retryableWorkCloudDispatch,
  workCloudRetryAuthorizationId,
  workCloudRetryDispatchId,
  workCloudRetryEnvelope,
} from "../lib/chatgpt-work-cloud-retry";
import { executionDirectiveArtifactCanonicalJson } from "../lib/github-execution-directive";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import type { StoredEvent } from "../lib/schema";
import { seedStore } from "../lib/seed";
import { ContractInvariantError, EventStore } from "../lib/store";
import { WORK_MODEL_ROUTING_POLICY_BASE_COMMIT, WORK_MODEL_ROUTING_POLICY_REF } from "../lib/work-execution-profile";

const now = "2026-09-19T03:20:00.000Z";
const sourceBodySha256 = sha256("native Work source directive");
const directiveArtifactSha256 = sha256("native Work directive artifact");
const taskId = "task:auth";
const systemProducer: AuthenticatedProducer = { id: "system:chatgpt-work-cloud-dispatch", kind: "SYSTEM", workerScopes: ["auth"], taskScopes: [taskId] };
const owner: AuthenticatedProducer = { id: "owner:primary", kind: "OWNER_AUTHORITY", workerScopes: ["*"], taskScopes: ["*"] };
const PRODUCT_FAILURE = "WORK_CLOUD_PRODUCT_TOOL_EXECUTION_UNAVAILABLE";
// The failed start must have settled 30 minutes before its retry is authorized (WORK_CLOUD_RETRY_SETTLE_MS).
const LATER = "2026-09-19T04:00:00.000Z";
const LATER2 = "2026-09-19T04:40:00.000Z";

function profile() {
  return {
    model: "GPT_5_6_SOL" as const, effort: "MEDIUM" as const, routingTier: "SOL_MEDIUM" as const, routingTriggers: [],
    fastModeRequest: "DO_NOT_ENABLE_FAST" as const, assuranceRequirement: "SET_REQUEST_SUFFICIENT" as const,
    policyRef: WORK_MODEL_ROUTING_POLICY_REF, routingPolicyBaseCommit: WORK_MODEL_ROUTING_POLICY_BASE_COMMIT,
    contractVersion: "TRUSTED_SETTER_V1" as const,
  };
}

function input(overrides: Partial<WorkCloudDispatchInput> = {}): WorkCloudDispatchInput {
  return {
    dispatchId: "dispatch:auth:work-cloud:1",
    mode: "CREATE",
    binding: {
      worker: "auth", directiveId: "execution-directive:auth:work-cloud", directiveRevision: 1, taskId,
      directiveArtifactSha256, sourceMessageId: "chat-message:auth:work-cloud", sourceBodySha256,
    },
    sourceChatTitle: "Native Work fixture source",
    sourceChatUrl: "chatgpt-conversation://fixture-source",
    requestedWorkTitle: "Work — Native fixture",
    chatgptProjectId: "fixture-project",
    existingWorkThreadId: null,
    prompt: "Execute the exact source-bound directive and return a receipt.",
    capabilityEvidence: {
      observedAt: now, appVersion: "2026.09.19", createThreadTargetAvailable: true,
      sendMessageToThreadAvailable: true, nativeSurfaceVerificationAvailable: true,
    },
    requestedAt: now,
    producerId: systemProducer.id,
    ...overrides,
  };
}

function executor(outcome: WorkCloudExecutorOutcome): WorkCloudAppExecutor {
  return { createThread: async () => outcome, sendMessageToThread: async () => outcome };
}

/** A store whose current directive is an ACTIVE version 3 native Work directive (no decision deadline). */
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
      ...priorDirective, directive_id: "execution-directive:auth:work-cloud", directive_revision: 1,
      chat_decision_id: "reasoning-decision:auth:work-cloud", directive_schema_version: 3,
      directive_artifact_sha256: directiveArtifactSha256, source_message_id: sourceMessageId, source_body_sha256: sourceBodySha256,
      work_execution_profile: profile(), execution_surface: "CHATGPT_WORK_CLOUD", status: "ACTIVE",
    },
  });
  return store;
}

/** One start as the dispatcher records it, at `at`: its request, its app-boundary intent and its result. */
async function recordStart(store: EventStore, overrides: Partial<WorkCloudDispatchInput>, outcome: WorkCloudExecutorOutcome, at = now) {
  const dispatched = await dispatchChatGptWorkCloud(input({ requestedAt: at, ...overrides }), executor(outcome));
  store.append(dispatched.request, at, systemProducer);
  store.append(buildWorkCloudHandoffIntentEnvelope(input({ requestedAt: at, ...overrides })), at, systemProducer);
  store.append(dispatched.result, at, systemProducer);
}

test("the owner retries a failed start once, as a new dispatch of the same job, and only the owner can", async () => {
  const store = currentDirectiveStore();
  try {
    await recordStart(store, {}, { kind: "UNAVAILABLE", reasonCode: PRODUCT_FAILURE });
    const failedId = "dispatch:auth:work-cloud:1";
    // Not the owner: refused by the route's function and by the store on any route.
    const system = { ...systemProducer, workerScopes: ["*"], taskScopes: ["*"] };
    assert.throws(() => authorizeWorkCloudDispatchRetry(store, { worker: "auth", producer: system }), /Only the owner/);
    // Not before the failed start has settled: a Work thread it made late could still appear (Codex review of e508a5f9).
    assert.throws(() => authorizeWorkCloudDispatchRetry(store, { worker: "auth", producer: owner }, () => "2026-09-19T03:49:59.000Z"), /less than 30 minutes/);
    const retryable = retryableWorkCloudDispatch(store.workerEvents("auth"), LATER);
    assert.ok(!("refusal" in retryable));
    assert.throws(() => store.append(workCloudRetryEnvelope(retryable, system.id, LATER), LATER, system), ContractInvariantError);
    assert.throws(() => store.append(workCloudRetryEnvelope(retryable, owner.id, LATER), LATER), ContractInvariantError, "no producer");
    // Its time is the store's: a record claiming a later time than it is received at is refused.
    assert.throws(() => store.append(workCloudRetryEnvelope(retryable, owner.id, LATER), now, owner), /at the time it is recorded/);
    // An owner record naming another failed start, result or retry is refused.
    const forged = workCloudRetryEnvelope({ ...retryable, retryDispatchId: "work-cloud:forged" }, owner.id, LATER);
    assert.throws(() => store.append(forged, LATER, owner), ContractInvariantError);

    const first = authorizeWorkCloudDispatchRetry(store, { worker: "auth", producer: owner }, () => LATER);
    assert.equal(first.status, "WORK_START_RETRY_AUTHORIZED");
    assert.equal(first.failedDispatchId, failedId);
    assert.equal(first.failedStatus, "UNAVAILABLE");
    assert.equal(first.failedErrorCode, PRODUCT_FAILURE);
    assert.equal(first.retryDispatchId, workCloudRetryDispatchId(failedId));
    assert.equal(first.authorizationEventId, workCloudRetryAuthorizationId(failedId));
    // A repeat before the retry starts reports it; nothing is appended twice.
    const count = store.count();
    const again = authorizeWorkCloudDispatchRetry(store, { worker: "auth", producer: owner }, () => LATER);
    assert.equal(again.status, "WORK_START_RETRY_ALREADY_AUTHORIZED");
    assert.equal(again.duplicate, true);
    assert.equal(store.count(), count);

    // Another start of the same job is refused unless it is exactly the authorized retry.
    const other = await dispatchChatGptWorkCloud(input({ dispatchId: "dispatch:auth:work-cloud:other" }), executor({ kind: "UNAVAILABLE", reasonCode: PRODUCT_FAILURE }));
    assert.throws(() => store.append(other.request, now, systemProducer), /only as the owner.s authorized retry/);
    await recordStart(store, { dispatchId: first.retryDispatchId }, { kind: "UNAVAILABLE", reasonCode: PRODUCT_FAILURE }, LATER);

    // The retry failed too: only a new authorization of the owner, naming the retry, allows one more.
    const second = authorizeWorkCloudDispatchRetry(store, { worker: "auth", producer: owner }, () => LATER2);
    assert.equal(second.failedDispatchId, first.retryDispatchId);
    assert.equal(second.retryDispatchId, workCloudRetryDispatchId(first.retryDispatchId));
    assert.notEqual(second.retryDispatchId, first.retryDispatchId);
  } finally { store.close(); }
});

test("a start that may be running or ran, or that may hold a thread elsewhere, is never retried", async () => {
  const cases: Array<[string, WorkCloudExecutorOutcome, Partial<WorkCloudDispatchInput>, RegExp]> = [
    ["ready", { kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "work-thread-native-1", hostId: null }, {}, /ready or still waiting/],
    ["setting up", { kind: "PENDING_SETUP", clientThreadId: "local-chatgpt:abc" }, {}, /ready or still waiting/],
    ["waiting for approval", { kind: "PENDING_APPROVAL" }, {}, /ready or still waiting/],
    // A thread holding the prompt was made on another surface: the search reads only ChatGPT threads.
    ["wrong surface", { kind: "WRONG_SURFACE", observedSurface: "CODEX" }, {}, /can mean a thread holding its prompt exists/],
    ["ambiguous", { kind: "FAILED", reasonCode: "WORK_CLOUD_CREATE_AMBIGUOUS_PROMPT_MATCH" }, {}, /can mean a thread holding its prompt exists/],
  ];
  for (const [label, outcome, overrides, refusal] of cases) {
    const store = currentDirectiveStore();
    try {
      await recordStart(store, overrides, outcome);
      assert.throws(() => authorizeWorkCloudDispatchRetry(store, { worker: "auth", producer: owner }, () => LATER), refusal, label);
    } finally { store.close(); }
  }
  // Across the app boundary without a result: the call may be under way.
  const store = currentDirectiveStore();
  try {
    const dispatched = await dispatchChatGptWorkCloud(input(), executor({ kind: "UNAVAILABLE", reasonCode: PRODUCT_FAILURE }));
    store.append(dispatched.request, now, systemProducer);
    assert.throws(() => authorizeWorkCloudDispatchRetry(store, { worker: "auth", producer: owner }, () => LATER), /no result yet/);
    store.append(buildWorkCloudHandoffIntentEnvelope(input()), now, systemProducer);
    assert.throws(() => authorizeWorkCloudDispatchRetry(store, { worker: "auth", producer: owner }, () => LATER), /without a result/);
  } finally { store.close(); }
  // A start that waited for setup and then failed when the app executor itself failed may be retried: its latest result counts.
  const setup = currentDirectiveStore();
  try {
    await recordStart(setup, {}, { kind: "PENDING_SETUP", clientThreadId: "local-chatgpt:abc" });
    setup.append(buildWorkCloudDispatchRecordedEnvelope(input(), { kind: "FAILED", reasonCode: "WORK_CLOUD_APP_EXECUTOR_FAILED" }, now), now, systemProducer);
    assert.equal(authorizeWorkCloudDispatchRetry(setup, { worker: "auth", producer: owner }, () => LATER).failedStatus, "FAILED");
  } finally { setup.close(); }
  // No start on record at all.
  const empty = currentDirectiveStore();
  try {
    assert.throws(() => authorizeWorkCloudDispatchRetry(empty, { worker: "auth", producer: owner }, () => LATER), /No start/);
  } finally { empty.close(); }
});

// The dispatcher's view (fixture events as in tests/chatgpt-work-cloud-autodispatch.test.ts).
const receiptTarget = { repository: "u-dont-existDOTcom/universal-dev-architecture", stageIssueNumber: 61 };
const sourceChats = [{ supervisorId: "mc-project-manager", sourceChatTitle: "Mission Control Fleet Watch", sourceChatUrl: "chatgpt-conversation://abc-123", sourceChatBrowserUrl: "https://chatgpt.com/c/abc-123", chatgptProjectId: null }];
const DEADLINE = "2026-09-22T00:00:00.000Z";
const BEFORE = "2026-09-21T01:45:00.000Z";
const FAILED_AT = "2026-09-21T01:00:00.000Z";

function bounded(worker: string) {
  return {
    schema_version: 1 as const, task_id: `task:${worker}`, job_id: `job-${worker}`,
    execution_objective: "Apply the exact bounded change.", reasoning_summary: "Reasoning already completed in Chat.",
    strategy_id: `strategy:${worker}`, strategy_causal_hypothesis: "Bounded implementation advances the owner outcome.",
    predicted_outcome_change: "The exact requested behavior becomes mechanically available.", success_threshold: "Focused acceptance passes.",
    failure_threshold: "The target seam remains unavailable.", next_decision_changing_evidence: "Execution receipt and focused acceptance.",
    reviewed_evidence_boundary: "Current source-bound decision and exact repository head.",
    inputs: [{ type: "GITHUB", ref: "source-bound", sha256: "1".repeat(64) }],
    allowed_actions: ["edit bounded files"], allowed_paths: ["."], allowed_commands: ["focused tests"],
    forbidden_actions: ["scope expansion"], forbidden_paths: [], forbidden_decisions: ["methodology"],
    required_evidence: ["execution receipt"], required_tests_or_checks: ["focused acceptance"],
    stop_and_return_triggers: ["completion or blocker"], maximum_execution_cycles: 1,
    execution_capability: { type: "LOCAL_FILESYSTEM_COMMAND" as const }, workspace: "/tmp/workspace",
    output_schema: { status: "string" }, prompt: `EXACT BOUNDED DIRECTIVE FOR ${worker}`,
    deadline: DEADLINE, work_execution_profile: profile(), execution_surface: "CHATGPT_WORK_CLOUD" as const,
  };
}
function event(sequence: number, worker: string, eventId: string, data: any): StoredEvent {
  return { eventId, missionId: "mission-control-live", worker, sequence, occurredAt: BEFORE, receivedAt: BEFORE,
    type: data.type, data, producerId: "fixture", producerKind: "SYSTEM", hash: "a".repeat(64), prevHash: null } as unknown as StoredEvent;
}
function workerEvents(worker: string): StoredEvent[] {
  const b = bounded(worker);
  const sourceDirective = { id: `directive:${worker}`, revision: 1, taskId: b.task_id, sourceMessageId: `message:${worker}`, sourceBodySha256: "2".repeat(64) };
  const artifact = executionDirectiveArtifactCanonicalJson({ bounded: b, sourceDirective, requestedModel: "gpt-5.6-sol", reasoningEffort: "medium" });
  const receiptId = `receipt:${worker}`;
  return [
    event(1, worker, receiptId, {
      type: "github_decision_receipt_ingested", worker, request_id: `request:${worker}`, task_id: b.task_id,
      reasoning_lane: "EXTRA_HIGH_DIRECT", supervisor_id: "mc-project-manager", bounded_execution: b,
    }),
    event(2, worker, `directive-event:${worker}`, {
      type: "execution_directive_recorded", worker, directive_id: sourceDirective.id, directive_revision: 1,
      task_id: b.task_id, directive_schema_version: 3, source_message_id: sourceDirective.sourceMessageId,
      source_body_sha256: sourceDirective.sourceBodySha256, directive_artifact_sha256: sha256(artifact),
      execution_surface: "CHATGPT_WORK_CLOUD", work_execution_profile: profile(), status: "ACTIVE",
      validated_decision_proof: { authority_path: "VALIDATED_GITHUB_SUPERVISORY_DECISION", receipt_event_id: receiptId },
    }),
  ];
}
function discover(events: StoredEvent[]) {
  return discoverDirectWorkCloudDispatches({ events, sourceChats, allowedWorkers: new Set(["alpha"]), receiptTarget, requestedAt: BEFORE,
    artifactPathFor: (dispatchId) => `/private/${sha256(dispatchId)}.directive.json` });
}
/** A failed start of the candidate's dispatch, as fixture events. */
function failedStart(sequence: number, dispatchId: string, promptSha256: string, at = FAILED_AT): StoredEvent[] {
  const binding = { worker: "alpha", dispatch_id: dispatchId, directive_id: "directive:alpha", directive_revision: 1, task_id: "task:alpha" };
  return [
    event(sequence, "alpha", `request:${dispatchId}`, { ...binding, type: "chatgpt_work_cloud_dispatch_requested", mode: "CREATE", prompt_sha256: promptSha256, requested_at: at }),
    event(sequence + 1, "alpha", `intent:${dispatchId}`, { ...binding, type: "chatgpt_work_cloud_handoff_intent_recorded", app_tool: "create_thread" }),
    event(sequence + 2, "alpha", `result:${dispatchId}`, { ...binding, type: "chatgpt_work_cloud_dispatch_recorded", mode: "CREATE", status: "UNAVAILABLE", error_code: PRODUCT_FAILURE }),
  ];
}
function authorization(sequence: number, failedDispatchId: string): StoredEvent {
  return event(sequence, "alpha", workCloudRetryAuthorizationId(failedDispatchId), {
    type: "chatgpt_work_cloud_dispatch_retry_authorized", worker: "alpha", task_id: "task:alpha", directive_id: "directive:alpha",
    directive_revision: 1, retry_authorization_id: workCloudRetryAuthorizationId(failedDispatchId), failed_dispatch_id: failedDispatchId,
    failed_status: "UNAVAILABLE", failed_error_code: PRODUCT_FAILURE, retry_dispatch_id: workCloudRetryDispatchId(failedDispatchId),
    authorized_by: owner.id, authorized_at: BEFORE,
  });
}

test("the dispatcher follows the owner's retry to a new dispatch and hands the controller the failed start to search for", () => {
  const base = workerEvents("alpha");
  const first = discover(base)[0]!;
  assert.equal(first.controllerRequest.priorAttempt, null);
  const failed = [...base, ...failedStart(3, first.dispatchId, sha256(first.workPrompt))];
  // A failed start without the owner's retry is never started again.
  assert.equal(discover(failed).length, 0);
  const retried = discover([...failed, authorization(6, first.dispatchId)]);
  assert.equal(retried.length, 1);
  const retry = retried[0]!;
  assert.equal(retry.dispatchId, workCloudRetryDispatchId(first.dispatchId));
  assert.equal(retry.recoveryState, "NEW");
  assert.equal(retry.controllerRequest.mode, "CREATE");
  assert.match(retry.workPrompt, new RegExp(retry.dispatchId));
  assert.notEqual(retry.workPrompt, first.workPrompt);
  const priorAttempt = { dispatchId: first.dispatchId, requestedAt: FAILED_AT, resultRecordedAt: BEFORE, promptSha256: sha256(first.workPrompt), prompt: first.workPrompt };
  assert.deepEqual(retry.controllerRequest.priorAttempt, priorAttempt);
  // A failed start whose recorded prompt can't be rebuilt: no prompt here (the watcher reads it from the failed start's
  // private request file, and the controller holds the retry without it).
  const unknown = discover([...base, ...failedStart(3, first.dispatchId, "f".repeat(64)), authorization(6, first.dispatchId)])[0]!;
  assert.equal(unknown.controllerRequest.priorAttempt?.prompt, null);
  assert.equal(unknown.controllerRequest.priorAttempt?.promptSha256, "f".repeat(64));
  // Once the retry's own request is recorded, the controller request is the same (its private file never changes), and
  // the controller, seeing the request recorded, doesn't search again.
  const requested = discover([...failed, authorization(6, first.dispatchId),
    event(7, "alpha", "request:retry", { worker: "alpha", dispatch_id: retry.dispatchId, directive_id: "directive:alpha", directive_revision: 1,
      task_id: "task:alpha", type: "chatgpt_work_cloud_dispatch_requested", mode: "CREATE", prompt_sha256: sha256(retry.workPrompt), requested_at: BEFORE })])[0]!;
  assert.equal(requested.recoveryState, "REQUEST_ONLY_PROVEN_UNSENT");
  assert.deepEqual(requested.controllerRequest.priorAttempt, priorAttempt);
  // The chain starts where the ledger's authorization names the failed start, even when the id computed now differs
  // (its source Chat changed since).
  const moved = discover([...base, ...failedStart(3, "work-cloud:old-source", "e".repeat(64)), authorization(6, "work-cloud:old-source")])[0]!;
  assert.equal(moved.dispatchId, workCloudRetryDispatchId("work-cloud:old-source"));
  assert.equal(moved.controllerRequest.priorAttempt?.dispatchId, "work-cloud:old-source");
  // A retry that failed again needs another authorization, naming it.
  const twice = [...failed, authorization(6, first.dispatchId), ...failedStart(7, retry.dispatchId, sha256(retry.workPrompt), BEFORE)];
  assert.equal(discover(twice).length, 0);
  const third = discover([...twice, authorization(10, retry.dispatchId)])[0]!;
  assert.equal(third.dispatchId, workCloudRetryDispatchId(retry.dispatchId));
  assert.deepEqual(third.controllerRequest.priorAttempt,
    { dispatchId: retry.dispatchId, requestedAt: BEFORE, resultRecordedAt: BEFORE, promptSha256: sha256(retry.workPrompt), prompt: retry.workPrompt });
});

test("no retry is authorized once the supervisor's authorization has ended", () => {
  const base = workerEvents("alpha");
  const first = discover(base)[0]!;
  const failed = [...base, ...failedStart(3, first.dispatchId, sha256(first.workPrompt))];
  const soon = retryableWorkCloudDispatch(failed, "2026-09-21T02:14:59.000Z");
  assert.ok("refusal" in soon && /less than 30 minutes/.test(soon.refusal));
  const open = retryableWorkCloudDispatch(failed, "2026-09-21T02:15:00.000Z");
  assert.ok(!("refusal" in open));
  assert.equal(open.failedDispatchId, first.dispatchId);
  const closed = retryableWorkCloudDispatch(failed, DEADLINE);
  assert.ok("refusal" in closed && /deadline passed/.test(closed.refusal));
});

test("a held retry waits like a setup check, without delaying another new start", () => {
  const base = workerEvents("alpha");
  const first = discover(base)[0]!;
  const retry = discover([...base, ...failedStart(3, first.dispatchId, sha256(first.workPrompt)), authorization(6, first.dispatchId)])[0]!;
  const other = { ...first, worker: "beta", dispatchId: "work-cloud:other" };
  const held = new Map([[retry.dispatchId, 1_000]]);
  assert.equal(selectWorkCloudDispatchCandidate([retry], held, 1_000 + 299_999, 300_000), null);
  assert.equal(selectWorkCloudDispatchCandidate([retry], held, 1_000 + 300_000, 300_000), retry);
  assert.equal(selectWorkCloudDispatchCandidate([retry, other], held, 1_000 + 1, 300_000), other);
  assert.equal(selectWorkCloudDispatchCandidate([retry], new Map(), 0, 300_000), retry);
});

class Reads implements WorkCloudAppToolClient {
  readonly calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  constructor(private readonly handler: (name: string, args: Record<string, unknown>) => AppToolResult | Promise<AppToolResult>) {}
  async listTools() { return { tools: ["read_thread", "list_threads"].map((name) => ({ name })) }; }
  async callTool(input: { name: string; arguments: Record<string, unknown> }) {
    this.calls.push(input);
    if (input.name !== "list_threads" && input.name !== "read_thread") throw new Error(`the search must not call ${input.name}`);
    return this.handler(input.name, input.arguments);
  }
  async close() {}
}
const value = (structuredContent: unknown): AppToolResult => ({ structuredContent });
const PROMPT = "MISSION_CONTROL_NATIVE_WORK_EXECUTION_V2\nthe failed start's exact prompt";
const SINCE = "2026-10-22T01:27:10.000Z";
const at = (iso: string) => Date.parse(iso);
const thread = (id: string, prompt: string, kind = "chatgpt") => value({ thread: { kind, id, turns: [{ params: { input: [{ type: "text", text: prompt }] } }] } });

function search(threads: unknown[], reads: Record<string, AppToolResult | Error>) {
  const client = new Reads((name, args) => {
    if (name === "list_threads") return value({ unavailableSources: [], threads });
    const answer = reads[String(args.threadId)];
    if (!answer) throw new Error(`unexpected read of ${String(args.threadId)}`);
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const executor = new NativeChatGptWorkCloudExecutor(client, null);
  return { client, result: executor.searchForPrompt({ prompt: PROMPT, requestedAt: SINCE }) };
}

test("the search for a failed start's Work thread is read-only and says NONE only after reading every thread made since", async () => {
  const old = { kind: "chatgpt", id: "old", updatedAt: at("2026-10-21T00:00:00Z") };
  // Updated since, but made before the failed start (its creation time shows it): not read.
  const busyOld = { kind: "chatgpt", id: "busy-old", createdAt: at("2026-10-20T00:00:00Z"), updatedAt: at("2026-10-22T09:00:00Z") };
  const codex = { kind: "codex", id: "codex-1", updatedAt: at("2026-10-22T02:00:00Z") };
  const fresh = { kind: "chatgpt", id: "fresh", createdAt: at("2026-10-22T05:00:00Z"), updatedAt: at("2026-10-22T05:00:00Z") };
  const none = search([fresh, busyOld, codex, old], { fresh: thread("fresh", "another conversation") });
  assert.equal(await none.result, "NONE");
  assert.deepEqual(none.client.calls.map((call) => `${call.name}:${String(call.arguments.threadId ?? "")}`), ["list_threads:", "read_thread:fresh"]);
  assert.equal((await search([fresh, old], { fresh: thread("fresh", PROMPT) }).result), "MATCH");
  // The provider shows only the first 2,000 characters of a long first message.
  const long = `${PROMPT}\n${"x".repeat(3_000)}`;
  const client = new Reads((name) => name === "list_threads" ? value({ threads: [fresh, old] }) : thread("fresh", long.slice(0, 2_000)));
  assert.equal(await new NativeChatGptWorkCloudExecutor(client, null).searchForPrompt({ prompt: long, requestedAt: SINCE }), "MATCH");
  // No project narrows the search, and the app's clock may run up to 10 minutes behind: both threads are read.
  const skewed = { kind: "chatgpt", id: "skewed", createdAt: at("2026-10-22T01:20:00Z"), updatedAt: at("2026-10-22T01:20:00Z") };
  const wide = search([{ ...fresh, projectId: "project-2" }, skewed, old], { fresh: thread("fresh", "x"), skewed: thread("skewed", PROMPT) });
  assert.equal(await wide.result, "MATCH");
});

test("anything the search couldn't read holds the retry", async () => {
  const old = { kind: "chatgpt", id: "old", updatedAt: at("2026-10-21T00:00:00Z") };
  const fresh = (id: string) => ({ kind: "chatgpt", id, updatedAt: at("2026-10-22T05:00:00Z") });
  // A page of threads all updated since the failed start, however short: older ones may be unlisted.
  const fullPage = Array.from({ length: 50 }, (_, index) => ({ kind: "codex", id: `c-${index}`, updatedAt: at("2026-10-22T05:00:00Z") }));
  assert.equal(await search(fullPage, {}).result, "INCOMPLETE");
  assert.equal(await search(fullPage.slice(0, 3), {}).result, "INCOMPLETE");
  assert.equal(await search([], {}).result, "INCOMPLETE");
  // A listing that holds no thread list (an error text, a changed shape) tells nothing.
  for (const answer of [{ content: [{ type: "text", text: "Too many requests" }] }, { content: [] }, value({ items: [old] })]) {
    const odd = new Reads(() => answer as AppToolResult);
    assert.equal(await new NativeChatGptWorkCloudExecutor(odd, null).searchForPrompt({ prompt: PROMPT, requestedAt: SINCE }), "INCOMPLETE");
  }
  assert.equal(await search([fresh("a"), old], { a: new Error("Too many requests") }).result, "INCOMPLETE");
  assert.equal(await search([fresh("a"), old], { a: value({ thread: { kind: "chatgpt", id: "a", turns: [] } }) }).result, "INCOMPLETE");
  assert.equal(await search([{ kind: "chatgpt", id: "local-chatgpt:tmp", updatedAt: at("2026-10-22T05:00:00Z") }, old], {}).result, "INCOMPLETE");
  const many = Array.from({ length: 26 }, (_, index) => fresh(`t-${index}`));
  assert.equal(await search([...many, old], {}).result, "INCOMPLETE");
  assert.equal(await search([{ id: "kindless", updatedAt: at("2026-10-22T05:00:00Z") }, old], { kindless: new Error("unreadable") }).result, "INCOMPLETE");
  // A thread listed without a kind is read, and a readable thread on another surface isn't the Work thread.
  assert.equal(await search([{ id: "kindless", updatedAt: at("2026-10-22T05:00:00Z") }, old], { kindless: thread("kindless", PROMPT, "codex") }).result, "NONE");
  const unavailable = new Reads(() => value({ unavailableSources: ["chatgpt"], threads: [] }));
  assert.equal(await new NativeChatGptWorkCloudExecutor(unavailable, null).searchForPrompt({ prompt: PROMPT, requestedAt: SINCE }), "INCOMPLETE");
});
