// An authorized native Work job whose deadline passes before it runs is never started late, and its supervisor is asked
// once whether to authorize it again (#385, 20 Oct 2026).
import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, sha256 } from "../lib/canonical";
import { discoverDirectWorkCloudDispatches } from "../lib/chatgpt-work-cloud-autodispatch";
import {
  classifyFleetSupervisorTick, expiredWorkJobForSupervision, expiryQuestionReplaces, FleetSupervisorRuntime, routeFleetSupervisorReasoning,
  WORK_DIRECTIVE_EXPIRED_UNRUN_DECISION_REQUESTED,
} from "../lib/fleet-supervisor";
import { enrollFleetSupervisorWatch } from "../lib/fleet-watch-enrollment";
import { admittedCycleRequests, parseGitHubReceiptPolicy, pendingDecisionRequests, type PendingDecisionRequest } from "../lib/github-decision-receipts";
import { buildExecutionDirectiveFromGitHubDecision } from "../lib/github-execution-directive";
import { inBandRequestBindingEnvelope, inBandRequestRoutePrefix } from "../lib/in-band-request-binding";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import { parseOwnerTaskRegistration, registerOwnerTask } from "../lib/owner-task-registration";
import { projectWorker } from "../lib/projection";
import type { AppendEnvelope, StoredEvent } from "../lib/schema";
import { EventStore } from "../lib/store";
import { WORK_MODEL_ROUTING_POLICY_BASE_COMMIT, WORK_MODEL_ROUTING_POLICY_REF } from "../lib/work-execution-profile";
import {
  expiredUnrunWorkDirective, isBoundWorkDirectiveExpiry, isWorkDirectiveExpiryEvidence, PRE_SEND_UNAVAILABLE_CODES,
  WORK_DIRECTIVE_EXPIRED_UNRUN_SUMMARY_PREFIX, WORK_DIRECTIVE_EXPIRY_VERIFIER_ID, workDirectiveDeadline, workDirectiveExpiryEnvelope, workDirectiveExpiryProducer,
} from "../lib/work-directive-expiry";
import { registeredTaskHold } from "../lib/task-checkpoint";
import { OWNER_TASK_HELD_BY_SUPERVISOR_REASON } from "../lib/owner-task-source";

const owner: AuthenticatedProducer = { id: "owner:primary", kind: "OWNER_AUTHORITY", workerScopes: ["*"], taskScopes: ["*"] };
const decisionSystem: AuthenticatedProducer = { id: "system:github-decision-receipts", kind: "SYSTEM", workerScopes: ["*"], taskScopes: ["*"] };
const at = "2026-10-18T12:00:00.000Z";
const DEADLINE = "2026-10-20T00:00:00.000Z";
const BEFORE = "2026-10-19T16:00:00.000Z";
const AFTER = "2026-10-20T16:00:00.000Z";
const worker = "atlas-test-pilot";
const task = `task:${worker}`;

function profile() {
  return {
    model: "GPT_5_6_SOL" as const, effort: "MEDIUM" as const, routingTier: "SOL_MEDIUM" as const,
    routingTriggers: [], fastModeRequest: "DO_NOT_ENABLE_FAST" as const,
    assuranceRequirement: "SET_REQUEST_SUFFICIENT" as const,
    policyRef: WORK_MODEL_ROUTING_POLICY_REF, routingPolicyBaseCommit: WORK_MODEL_ROUTING_POLICY_BASE_COMMIT,
    contractVersion: "TRUSTED_SETTER_V1" as const,
  };
}

function bounded(deadline = DEADLINE, jobId = "job-1") {
  return {
    schema_version: 1 as const, task_id: task, job_id: jobId,
    execution_objective: "Collect public primary sources on one question.", reasoning_summary: "Reasoning already completed in Chat.",
    strategy_id: "strategy:sources", strategy_causal_hypothesis: "Sources advance the owner outcome.",
    predicted_outcome_change: "A staged source list exists.", success_threshold: "Up to 8 sources staged.",
    failure_threshold: "No source found.", next_decision_changing_evidence: "The Work job's receipt.",
    reviewed_evidence_boundary: "The verified checkpoint.",
    inputs: [{ type: "GITHUB", ref: "checkpoint", sha256: "1".repeat(64) }],
    allowed_actions: ["read public pages"], allowed_paths: ["."], allowed_commands: ["none"],
    forbidden_actions: ["spend money"], forbidden_paths: [], forbidden_decisions: ["admit cases"],
    required_evidence: ["execution receipt"], required_tests_or_checks: ["source identity check"],
    stop_and_return_triggers: ["completion or blocker"], maximum_execution_cycles: 2,
    execution_capability: { type: "BROWSER" as const, name: "ChatGPT Work" }, workspace: "/tmp/workspace",
    output_schema: { status: "string" }, prompt: `EXACT BOUNDED DIRECTIVE ${jobId}`,
    deadline, work_execution_profile: profile(), execution_surface: "CHATGPT_WORK_CLOUD" as const,
  };
}

function registered(name = worker) {
  const store = new EventStore(":memory:");
  const parsed = parseOwnerTaskRegistration({
    worker, name: "Atlas test pilot", goal: "Collect public sources on one question and summarize them.",
    may_use: "Public sources\nChatGPT Work for collecting sources", must_never: "Spend money\nPublish anything", done_when: "A first brief exists",
  });
  assert.notEqual(typeof parsed, "string", String(parsed));
  registerOwnerTask(store, parsed as Exclude<typeof parsed, string>, owner, store.allEvents(), at);
  return store;
}

/** The supervisor's decision, as Mission Control ingests it from GitHub, with the directive it derives when the decision
 * authorizes bounded execution (lib/github-decision-receipts.ts appends both). */
function appendDecision(store: EventStore, id: string, execution: ReturnType<typeof bounded> | null, occurredAt = at, withDirective = true) {
  const events = store.workerEvents(worker);
  const outcome = events.findLast((event) => event.data.type === "owner_outcome_recorded")!.data;
  assert.ok(outcome.type === "owner_outcome_recorded");
  const pending = pendingDecisionRequests(events).at(-1);
  const text = `Decision ${id}.`;
  const envelope: AppendEnvelope = {
    schema_version: 2, event_id: `github-decision:${id}`, mission_id: "mission-control-live", occurred_at: occurredAt,
    data: {
      type: "github_decision_receipt_ingested", worker, task_id: task, receipt_id: `receipt:${id}`,
      request_id: pending?.requestId ?? `fleet-review:${sha256(id).slice(0, 32)}`, supervisor_id: "mc-project-manager", nonce: `nonce:${id}`,
      evidence_capsule: { id: `capsule:${id}`, sha256: "e".repeat(64) },
      owner_outcome_id: outcome.owner_outcome_id, owner_outcome_epoch: outcome.epoch, owner_outcome_sha256: outcome.owner_outcome_sha256,
      reasoning_lane: "EXTRA_HIGH_DIRECT",
      decision_block: { decision_id: `decision-${id}`, exact_text: text, sha256: sha256(text) },
      pro_decision_block: { used: false, model_mode: null, exact_text: null, sha256: null },
      writer_contract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretation_allowed: false },
      canonical_envelope_sha256: sha256(`envelope:${id}`),
      provider_session_id: `provider-session:${id}`,
      ...(execution ? { bounded_execution: execution, bounded_execution_sha256: sha256(canonicalJson(execution)) } : {}),
      github_receipt: { repository: "owner/private-receipts", issue_number: 4, comment_id: 1_000 + store.count(),
        immutable_url: `https://github.com/owner/private-receipts/issues/4#issuecomment-${1_000 + store.count()}`,
        github_created_at: occurredAt, github_author_login: "owner", github_delivery_id: null },
      ingestion_method: "RECONCILIATION_POLL", ingested_at: occurredAt,
    } as AppendEnvelope["data"],
  };
  const receipt = store.append(envelope, undefined, decisionSystem, store.allEvents());
  if (!execution || !withDirective) return { receipt, directive: null };
  const directiveEnvelope = buildExecutionDirectiveFromGitHubDecision({
    eventId: receipt.eventId, occurredAt: receipt.occurredAt, data: receipt.data as Extract<StoredEvent["data"], { type: "github_decision_receipt_ingested" }>,
  }, store.workerEvents(worker), occurredAt)!;
  const directive = store.append(directiveEnvelope, undefined, decisionSystem, store.allEvents());
  return { receipt, directive };
}

const relayProducer: AuthenticatedProducer = { id: "collector:relay", kind: "COLLECTOR", workerScopes: [worker], taskScopes: ["*"] };
const PROMPT = "d".repeat(64);
const SESSION_ID = "provider-session:atlas-test-expiry";
const CHAT = "https://chatgpt.com/c/atlas-test-expiry";
const CONTROLS = ["model_selection_policy:TOP_VISIBLE_SELECTABLE_MODEL", "model_selector_index:0", "thinking_control_label:Thinking effort",
  "thinking_visible_label:Extra High", "thinking_ordinal:4 of 5", "account_plan_label:Pro", "account_plan_role:PROVENANCE_METADATA_ONLY",
  "account_plan_is_reasoning_mode:false", "backend_model_identity_claimed:false", "assistant_content_observed:false", "model_ui_label:GPT-6 Sol"];

/** The trusted relay's receipts for sending one V6 question: controls seen, the body committed, the session, the start. */
function sentByTheRelay(request: PendingDecisionRequest, occurredAt: string): AppendEnvelope[] {
  const policy = parseGitHubReceiptPolicy(JSON.stringify(receiptPolicy()))!;
  const envelope = inBandRequestBindingEnvelope(request, SESSION_ID, policy);
  const receipt = (summary: string, refs: string[]): AppendEnvelope => ({
    schema_version: 2, event_id: `relay-test:${summary}`, mission_id: "mission-control-live", occurred_at: occurredAt,
    data: {
      type: "evidence_receipt_recorded", worker, receipt_id: `relay-test:${summary}`, producer_id: relayProducer.id, producer_role: "COLLECTOR",
      evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: null, summary,
      refs: [`request:${request.requestId}`, `supervisor:${request.supervisorId}`, `provider_session:${SESSION_ID}`, ...refs],
      verified: true, changed_path_manifest: null,
    },
  });
  return [
    receipt("MISSION_CONTROL_PROVIDER_SESSION_MODEL_UI_V1", ["session_role:IN_BAND_REQUEST_DECISION_SESSION", ...CONTROLS]),
    receipt("MISSION_CONTROL_IN_BAND_REQUEST_BINDING_PRE_SEND_V1", [`provider_body_sha256:${PROMPT}`, "semantic_authority:false",
      `trusted_relay_producer:${relayProducer.id}`, "submission_admission:admission-1", "binding_protocol:IN_BAND_REQUEST_BINDING_V1",
      `binding_schema:${envelope.binding_schema}`, `in_band_binding_sha256:${envelope.in_band_binding_sha256}`,
      `decision_receipt_target:${envelope.decision_receipt_target.immutable_issue_url}`]),
    receipt("MISSION_CONTROL_PROVIDER_SESSION_V1", ["session_role:IN_BAND_REQUEST_DECISION_SESSION", "message_ordinal:1",
      `conversation_url:${CHAT}`, "url_binding_status:EXACT", "lifecycle_status:ACTIVE"]),
    receipt("MISSION_CONTROL_RELAY_STAGE_V1", ["step:IN_BAND_REQUEST_DECISION", "message_ordinal:1", "first_message:true",
      `conversation_url:${CHAT}`, "generation_state:STARTED", `prompt_sha256:${PROMPT}`, ...CONTROLS, "selected_app:GitHub",
      "semantic_authority:false"]),
  ];
}

function projectManager() {
  return {
    scope: "PROJECT_MANAGER", supervisorId: "mc-project-manager", label: "MC project manager", workerId: null,
    requiredApp: "Mission Control", registrationId: "registration:test:mc-project-manager", ownership: "MISSION_CONTROL_ONLY",
    purpose: "Dedicated Mission Control reasoning supervisor", accountAlias: "owner-account", workspaceAlias: "personal",
    privateLocatorRef: "owner-config:test:mc-project-manager",
    registrationProvenance: { registeredBy: "OWNER", registeredAt: "2026-09-20T00:00:00.000Z", sourceRef: "owner:test" },
    consumerControls: {
      modelSelectionPolicy: "TOP_VISIBLE_SELECTABLE_MODEL", thinkingControlLabel: "Thinking effort", thinkingVisibleLabel: "Extra High",
      thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro", accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false,
    },
    bootstrapCapability: { chatId: "bootstrap:pm", url: "https://chatgpt.com/c/test-project-manager", challengeId: "challenge:pm" },
  };
}

function receiptPolicy() {
  return {
    repository: "owner/private-receipts", decisionIssueNumber: 4, capabilityIssueNumber: 4, stageIssueNumber: 4,
    authorizedWriterLogins: ["owner"], capabilityChallenges: [], requestBound: { enabled: true, relayProducerIds: ["collector:relay"] },
  };
}

function withSupervisorConfiguration(work: () => void | Promise<void>) {
  const saved = {
    chats: process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON,
    policy: process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON,
  };
  process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = JSON.stringify([projectManager()]);
  process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(receiptPolicy());
  const restore = () => {
    if (saved.chats === undefined) delete process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
    else process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = saved.chats;
    if (saved.policy === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
    else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = saved.policy;
  };
  return Promise.resolve().then(work).finally(restore);
}

function routeBody(event: StoredEvent) {
  assert.equal(event.data.type, "worker_message_recorded");
  const body = event.data.type === "worker_message_recorded" ? event.data.body : "";
  assert.ok(body.startsWith(inBandRequestRoutePrefix));
  return JSON.parse(body.slice(inBandRequestRoutePrefix.length));
}

test("a directive's deadline comes from the validated decision it was made from", () => {
  const store = registered();
  try {
    const { directive } = appendDecision(store, "work-1", bounded());
    assert.ok(directive?.data.type === "execution_directive_recorded");
    assert.equal(workDirectiveDeadline(store.workerEvents(worker), directive.data), DEADLINE);
  } finally { store.close(); }
});

test("an unsent Work job is never started at or after its deadline, and the store refuses its request and its handoff", () => {
  const store = registered();
  try {
    appendDecision(store, "work-1", bounded());
    const sourceChats = [{ supervisorId: "mc-project-manager", sourceChatTitle: "Mission Control Fleet Watch",
      sourceChatUrl: "chatgpt-conversation://abc-123", sourceChatBrowserUrl: null, chatgptProjectId: null }];
    const discover = (requestedAt: string) => discoverDirectWorkCloudDispatches({
      events: store.workerEvents(worker), sourceChats, allowedWorkers: new Set([worker]),
      receiptTarget: { repository: "owner/private-receipts", stageIssueNumber: 4 }, requestedAt,
      artifactPathFor: (dispatchId) => `/private/${sha256(dispatchId)}.json`,
    });
    const [before] = discover(BEFORE);
    assert.equal(before?.recoveryState, "NEW");
    assert.equal(discover(DEADLINE).length, 0, "at the deadline");
    assert.equal(discover(AFTER).length, 0, "after it");

    const binding = before!.controllerRequest.binding;
    const request = (requestedAt: string): AppendEnvelope => ({
      schema_version: 2, event_id: `work-cloud-dispatch-request:${before!.dispatchId}`, mission_id: "mission-control-live", occurred_at: requestedAt,
      data: {
        type: "chatgpt_work_cloud_dispatch_requested", worker, dispatch_id: before!.dispatchId, mode: "CREATE",
        requested_surface: "CHATGPT_WORK_CLOUD", directive_id: binding.directiveId, directive_revision: binding.directiveRevision,
        task_id: task, directive_artifact_sha256: binding.directiveArtifactSha256, source_message_id: binding.sourceMessageId,
        source_body_sha256: binding.sourceBodySha256, source_chat_title: "Mission Control Fleet Watch",
        source_chat_url: "chatgpt-conversation://abc-123", requested_work_title: "Work — Mission Control Fleet Watch",
        chatgpt_project_id: null, existing_work_thread_id: null, prompt_sha256: before!.workPromptSha256,
        approval_state: "NOT_REQUIRED",
        capability_evidence: { observed_at: requestedAt, app_version: "fixture", create_thread_target_available: true,
          send_message_to_thread_available: true, native_surface_verification_available: true },
        requested_at: requestedAt, producer_id: "system:chatgpt-work-cloud-dispatch", source: "TRUSTED_CHATGPT_APP_EXECUTOR_BOUNDARY",
      } as AppendEnvelope["data"],
    });
    const dispatcher: AuthenticatedProducer = { id: "system:chatgpt-work-cloud-dispatch", kind: "SYSTEM", workerScopes: ["*"], taskScopes: ["*"] };
    assert.throws(() => store.append(request(AFTER), undefined, dispatcher, store.allEvents()), /at or after its directive's bounded deadline/);
    assert.throws(() => store.append(request(DEADLINE), undefined, dispatcher, store.allEvents()), /at or after its directive's bounded deadline/);
    store.append(request(BEFORE), undefined, dispatcher, store.allEvents());
    const intent = (intentAt: string): AppendEnvelope => ({
      schema_version: 2, event_id: `work-cloud-handoff-intent:${before!.dispatchId}`, mission_id: "mission-control-live", occurred_at: intentAt,
      data: {
        type: "chatgpt_work_cloud_handoff_intent_recorded", worker, dispatch_id: before!.dispatchId,
        directive_id: binding.directiveId, directive_revision: binding.directiveRevision, task_id: task,
        app_tool: "create_thread", intent_at: intentAt, producer_id: "system:chatgpt-work-cloud-dispatch",
        source: "TRUSTED_CHATGPT_APP_EXECUTOR_BOUNDARY",
      } as AppendEnvelope["data"],
    });
    assert.throws(() => store.append(intent(AFTER), undefined, dispatcher, store.allEvents()), /handoff intent cannot be recorded at or after/);
    store.append(intent(BEFORE), undefined, dispatcher, store.allEvents());
    // A job that crossed the provider boundary before its deadline may have run: it is never treated as unrun.
    assert.equal(expiredUnrunWorkDirective(store.workerEvents(worker), AFTER), null);
  } finally { store.close(); }
});

test("before its deadline an authorized job is not expired; after it, it is expired and unrun until something ran", () => {
  const store = registered();
  try {
    appendDecision(store, "work-1", bounded());
    const events = store.workerEvents(worker);
    assert.equal(expiredUnrunWorkDirective(events, BEFORE), null);
    const expiry = expiredUnrunWorkDirective(events, AFTER);
    assert.ok(expiry);
    assert.equal(expiry.deadline, DEADLINE);
    assert.equal(expiry.dispatchRequests, 0);
    assert.equal(expiry.evidence, null);
    assert.equal(expiry.priorUnrunExpiries, 0);
    const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
    assert.notEqual(classifyFleetSupervisorTick(watch, events, store.verifyChain(), BEFORE).trigger, "WORK_DIRECTIVE_EXPIRED_UNRUN");
    const after = classifyFleetSupervisorTick(watch, events, store.verifyChain(), AFTER);
    assert.equal(after.trigger, "WORK_DIRECTIVE_EXPIRED_UNRUN");
    assert.equal(after.reasoningRequired, true);
    assert.equal(after.notifyOwner, false, "the supervisor is asked quietly");
  } finally { store.close(); }
});

test("the expired job is recorded once by Mission Control and its supervisor is asked once, at that record", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(AFTER) });
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      const { receipt } = appendDecision(store, "work-1", bounded());
      enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
      let routed = 0;
      const notified: string[] = [];
      const runtime = new FleetSupervisorRuntime(store, {
        routeReasoning: (current, routedDecision, events) => { routed += 1; return routeFleetSupervisorReasoning(store, current, routedDecision, events); },
        notifyOwner: (_current, routedDecision) => { notified.push(routedDecision.notificationReason ?? ""); },
      });
      const [first] = await runtime.tick(AFTER);
      assert.equal(first?.decision.trigger, "WORK_DIRECTIVE_EXPIRED_UNRUN");
      assert.equal(routed, 1);
      assert.equal(notified.length, 0);
      const events = store.workerEvents(worker);
      const evidence = events.filter((event) => isWorkDirectiveExpiryEvidence(event));
      assert.equal(evidence.length, 1, "one record of the expiry");
      assert.ok(evidence[0]!.data.type === "evidence_receipt_recorded");
      assert.ok(evidence[0]!.data.summary.startsWith(`${WORK_DIRECTIVE_EXPIRED_UNRUN_SUMMARY_PREFIX}\n`));
      assert.match(evidence[0]!.data.summary, /had a deadline of 2026-10-20T00:00:00.000Z/);
      assert.match(evidence[0]!.data.summary, /no dispatch was requested before the deadline/);
      assert.ok(evidence[0]!.data.refs.includes("lifecycle_status:EXPIRED_UNRUN"));
      const request = admittedCycleRequests(events).admitted.at(-1)!;
      assert.match(request.requestId, /^fleet-review:[a-f0-9]{32}$/);
      assert.notEqual(request.requestId, (receipt.data as { request_id: string }).request_id, "a new question, not the answered one");
      const root = routeBody(events.findLast((event) => event.data.type === "worker_message_recorded")!);
      assert.equal(root.factualPacket.decisionRequested, WORK_DIRECTIVE_EXPIRED_UNRUN_DECISION_REQUESTED);
      const facts = JSON.parse(root.factualPacket.exactFactualState);
      assert.equal(facts.trigger, "WORK_DIRECTIVE_EXPIRED_UNRUN");
      assert.equal(facts.decision_boundary.event_id, evidence[0]!.eventId, "asked at the expiry's own boundary");
      assert.equal(facts.expired_work_job.receipt_id, (evidence[0]!.data as { receipt_id: string }).receipt_id);

      // The next check reuses the pending question: nothing new is recorded or asked.
      const [second] = await runtime.tick(new Date(Date.parse(AFTER) + 61_000).toISOString());
      assert.equal(second?.decision.trigger, "WORK_DIRECTIVE_EXPIRED_UNRUN");
      const later = store.workerEvents(worker);
      assert.equal(later.filter((event) => isWorkDirectiveExpiryEvidence(event)).length, 1);
      assert.equal(admittedCycleRequests(later).admitted.length, admittedCycleRequests(events).admitted.length);
    });
  } finally { store.close(); }
});

test("once the supervisor answers, a new authorized job replaces the expired one; a hold ends the questions", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(AFTER) });
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      appendDecision(store, "work-1", bounded());
      const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
      routeFleetSupervisorReasoning(store, watch, classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain(), AFTER), []);
      // A hold: the supervisor answers without new bounded execution, so the expired directive stays the latest.
      appendDecision(store, "hold-1", null, new Date(Date.parse(AFTER) + 120_000).toISOString());
      const held = classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain(), new Date(Date.parse(AFTER) + 180_000).toISOString());
      assert.notEqual(held.trigger, "WORK_DIRECTIVE_EXPIRED_UNRUN", "the expiry had its one question");
    });
  } finally { store.close(); }
  const second = registered();
  try {
    await withSupervisorConfiguration(async () => {
      appendDecision(second, "work-1", bounded());
      const { watch } = enrollFleetSupervisorWatch(second, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
      routeFleetSupervisorReasoning(second, watch, classifyFleetSupervisorTick(watch, second.workerEvents(worker), second.verifyChain(), AFTER), []);
      // A new authorization with a new deadline: the new directive is the latest, and it is open.
      const renewed = "2026-10-21T18:00:00.000Z";
      appendDecision(second, "work-2", bounded(renewed, "job-2"), new Date(Date.parse(AFTER) + 120_000).toISOString());
      assert.equal(expiredUnrunWorkDirective(second.workerEvents(worker), "2026-10-21T00:00:00.000Z"), null);
      // If that one expires unrun too, the owner is told and nothing asks a third time.
      const twice = classifyFleetSupervisorTick(watch, second.workerEvents(worker), second.verifyChain(), "2026-10-21T19:00:00.000Z");
      assert.equal(twice.trigger, "OWNER_ACTION_REQUIRED");
      assert.equal(twice.reasoningRequired, false);
      assert.equal(twice.notifyOwner, true);
      assert.match(twice.notificationReason ?? "", /Two authorized ChatGPT Work jobs in a row expired/);
    });
  } finally { second.close(); }
});

test("a job that may have started between two expired ones breaks the unrun streak (Codex review of ea4356dd)", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(AFTER) });
  const cases: Array<[string, Record<string, unknown> | "codex" | null, number]> = [
    ["a FAILED result", { status: "FAILED", error_code: "WORK_CLOUD_APP_EXECUTOR_FAILED" }, 0],
    ["an UNAVAILABLE result after a Work call", { status: "UNAVAILABLE", error_code: "WORK_CLOUD_DRIVER_TIMEOUT" }, 0],
    ["a READY result", { status: "READY", error_code: null }, 0],
    ["a handoff intent without a result", null, 0],
    ["a Codex start", "codex", 0],
    ["a pre-send UNAVAILABLE result", { status: "UNAVAILABLE", error_code: "WORK_CLOUD_SURFACE_VERIFICATION_UNAVAILABLE" }, 1],
  ];
  for (const [label, result, expected] of cases) {
    const store = registered();
    try {
      await withSupervisorConfiguration(async () => {
        appendDecision(store, "work-1", bounded());
        const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
        routeFleetSupervisorReasoning(store, watch, classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain(), AFTER), []);
        // The supervisor authorizes a second job; something happens to it, then a third job is authorized and expires.
        const { directive: second } = appendDecision(store, "work-2", bounded("2026-10-21T00:00:00.000Z", "job-2"), new Date(Date.parse(AFTER) + 60_000).toISOString());
        assert.ok(second?.data.type === "execution_directive_recorded");
        const middle = store.workerEvents(worker);
        const binding = { worker, directive_id: second.data.directive_id, directive_revision: second.data.directive_revision, task_id: task };
        const intent = fake(middle, { ...binding, type: "chatgpt_work_cloud_handoff_intent_recorded", dispatch_id: "work-cloud:2" }, "i2");
        const between = result === "codex"
          ? [fake(middle, { ...binding, type: "codex_execution_started", execution_start_id: "codex:2" }, "c2")]
          : result
            ? [intent, fake([...middle, intent], { ...binding, type: "chatgpt_work_cloud_dispatch_recorded", dispatch_id: "work-cloud:2", ...result }, "d2")]
            : [intent];
        appendDecision(store, "work-3", bounded("2026-10-22T00:00:00.000Z", "job-3"), new Date(Date.parse(AFTER) + 120_000).toISOString());
        const after = store.workerEvents(worker);
        const events = [...middle, ...between, ...after.slice(middle.length)];
        const expiry = expiredUnrunWorkDirective(events, "2026-10-22T01:00:00.000Z");
        assert.ok(expiry, label);
        assert.equal(expiry.priorUnrunExpiries, expected, label);
      });
    } finally { store.close(); }
  }
});

test("only Mission Control's own verifier makes an expiry record, and each directive expires once", () => {
  const store = registered();
  try {
    appendDecision(store, "work-1", bounded());
    const expiry = expiredUnrunWorkDirective(store.workerEvents(worker), AFTER)!;
    const envelope = workDirectiveExpiryEnvelope(expiry, AFTER);
    const stored = store.append(envelope, undefined, workDirectiveExpiryProducer(worker, task), store.allEvents());
    assert.equal(isWorkDirectiveExpiryEvidence(stored), true);
    const again = store.append(envelope, undefined, workDirectiveExpiryProducer(worker, task), store.allEvents());
    assert.equal(again.eventId, stored.eventId, "the same record, not a second one");
    assert.equal(store.workerEvents(worker).filter((event) => isWorkDirectiveExpiryEvidence(event)).length, 1);
    assert.equal(expiredUnrunWorkDirective(store.workerEvents(worker), AFTER)?.evidence?.eventId, stored.eventId);
    // The same words from any other producer are not an expiry record, even with the verifier's id written in.
    const borrowed = store.append({ ...envelope, event_id: "copy:1", data: { ...envelope.data, receipt_id: "copy:1" } as AppendEnvelope["data"] },
      undefined, { id: "collector:other", kind: "COLLECTOR", workerScopes: [worker], taskScopes: ["*"] }, store.allEvents());
    assert.equal(isWorkDirectiveExpiryEvidence(borrowed), false);
  } finally { store.close(); }
});

test("a question about the expired job that was sent but never answered goes to the owner, and nothing asks again", async (t) => {
  const afterMs = Date.parse(AFTER);
  t.mock.timers.enable({ apis: ["Date"], now: afterMs });
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      appendDecision(store, "work-1", bounded());
      enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
      let routed = 0;
      const notified: string[] = [];
      const runtime = new FleetSupervisorRuntime(store, {
        routeReasoning: (current, routedDecision, events) => { routed += 1; return routeFleetSupervisorReasoning(store, current, routedDecision, events); },
        notifyOwner: (_current, routedDecision) => { notified.push(routedDecision.notificationReason ?? ""); },
      });
      await runtime.tick(AFTER);
      assert.equal(routed, 1);
      const request = admittedCycleRequests(store.workerEvents(worker)).admitted.at(-1)!;
      for (const event of sentByTheRelay(request, new Date(afterMs + 5 * 60_000).toISOString())) {
        store.append(event, undefined, relayProducer, store.allEvents());
      }
      const later = afterMs + 25 * 3_600_000;
      t.mock.timers.setTime(later);
      const state = projectWorker(store.workerEvents(worker));
      assert.ok(state.supervisorActivity.requests.some((item) => item.requestId === request.requestId && item.state === "NO_ANSWER"));
      const [check] = await runtime.tick(new Date(later).toISOString());
      assert.equal(check?.decision.trigger, "OWNER_ACTION_REQUIRED");
      assert.equal(routed, 1, "nothing is routed again");
      assert.equal(notified.length, 1);
      assert.match(notified[0] ?? "", /didn't answer the question about that before it expired/);
    });
  } finally { store.close(); }
});

test("the fleet check judges the deadline by the time of its tick", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(BEFORE) });
  const store = registered();
  try {
    appendDecision(store, "work-1", bounded());
    enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
    const runtime = new FleetSupervisorRuntime(store, {});
    const [check] = await runtime.tick(AFTER);
    assert.equal(check?.decision.trigger, "WORK_DIRECTIVE_EXPIRED_UNRUN");
  } finally { store.close(); }
});

/** An event bound to the directive, as the dispatcher or a Codex start would record it (for the pure rules only). */
function fake(events: readonly StoredEvent[], data: Record<string, unknown>, id: string): StoredEvent {
  const last = events.at(-1)!;
  return { ...last, id: last.id + 1, sequence: last.sequence + 1, eventId: id, type: data.type as StoredEvent["type"],
    occurredAt: BEFORE, receivedAt: BEFORE, producerId: "system:fixture", producerKind: "SYSTEM", data: data as StoredEvent["data"] };
}

test("what may have run is never unrun: results other than UNAVAILABLE, and Codex records for the directive", () => {
  const store = registered();
  try {
    const { directive } = appendDecision(store, "work-1", bounded());
    assert.ok(directive?.data.type === "execution_directive_recorded");
    const base = store.workerEvents(worker);
    const binding = { worker, directive_id: directive.data.directive_id, directive_revision: directive.data.directive_revision, task_id: task };
    const request = fake(base, { ...binding, type: "chatgpt_work_cloud_dispatch_requested", dispatch_id: "work-cloud:1", mode: "CREATE" }, "r1");
    const intent = fake([...base, request], { ...binding, type: "chatgpt_work_cloud_handoff_intent_recorded", dispatch_id: "work-cloud:1" }, "i1");
    const result = (status: string, error_code: string | null = status === "UNAVAILABLE" || status === "FAILED" ? "WORK_CLOUD_SURFACE_VERIFICATION_UNAVAILABLE" : null) =>
      fake([...base, request, intent], { ...binding, type: "chatgpt_work_cloud_dispatch_recorded", dispatch_id: "work-cloud:1", status, error_code }, `d-${status}-${error_code}`);
    // Only a request, proven unsent: unrun.
    assert.equal(expiredUnrunWorkDirective([...base, request], AFTER)?.dispatchRequests, 1);
    // Stopped before any Work call: unrun.
    for (const code of PRE_SEND_UNAVAILABLE_CODES) {
      assert.equal(expiredUnrunWorkDirective([...base, request, intent, result("UNAVAILABLE", code)], AFTER)?.unavailableResults, 1, code);
    }
    // An UNAVAILABLE result after a Work call may have been made (the driver queued it, then timed out or found no
    // receipt), or with no code at all: it may have run, so it is never unrun (Codex review of 5a8a8df4).
    for (const code of ["WORK_CLOUD_DRIVER_TIMEOUT", "WORK_CLOUD_DRIVER_TOOL_RECEIPT_MISSING", "WORK_CLOUD_DRIVER_TOOL_RESULT_INVALID",
      "WORK_CLOUD_DRIVER_EXECUTION_UNAVAILABLE", "WORK_CLOUD_PRODUCT_TOOL_EXECUTION_UNAVAILABLE", "WORK_CLOUD_PRODUCT_TOOL_RESULT_INVALID",
      "WORK_CLOUD_EXTRA_MUTATION_REJECTED", "WORK_CLOUD_DRIVER_UNEXPECTED_ACTION", "WORK_CLOUD_DRIVER_ROLLOUT_REWOUND", null]) {
      assert.equal(expiredUnrunWorkDirective([...base, request, intent, result("UNAVAILABLE", code)], AFTER), null, String(code));
    }
    // One proven-unsent attempt and one ambiguous one: ambiguous.
    const second = fake([...base, request, intent, result("UNAVAILABLE")], { ...binding, type: "chatgpt_work_cloud_dispatch_recorded",
      dispatch_id: "work-cloud:1", status: "UNAVAILABLE", error_code: "WORK_CLOUD_DRIVER_TIMEOUT" }, "d-late");
    assert.equal(expiredUnrunWorkDirective([...base, request, intent, result("UNAVAILABLE"), second], AFTER), null);
    for (const status of ["READY", "PENDING_SETUP", "PENDING_APPROVAL", "FAILED"]) {
      assert.equal(expiredUnrunWorkDirective([...base, request, intent, result(status)], AFTER), null, status);
    }
    const codex = fake(base, { ...binding, type: "codex_execution_started", execution_start_id: "codex:1" }, "c1");
    assert.equal(expiredUnrunWorkDirective([...base, codex], AFTER), null, "a Codex start for the directive");
    const codexReceipt = fake(base, { ...binding, type: "execution_receipt_recorded", receipt_id: "receipt:codex" }, "c2");
    assert.equal(expiredUnrunWorkDirective([...base, codexReceipt], AFTER), null, "a Codex receipt for the directive");
  } finally { store.close(); }
});

test("an expiry record counts only for a directive that exists, made at or after that directive's deadline", () => {
  const store = registered();
  try {
    appendDecision(store, "work-1", bounded());
    const events = store.workerEvents(worker);
    const envelope = workDirectiveExpiryEnvelope(expiredUnrunWorkDirective(events, AFTER)!, AFTER);
    const asStored = (occurredAt: string, refs?: string[], receivedAt = occurredAt): StoredEvent => ({
      ...events.at(-1)!, id: 9_000, sequence: 9_000, eventId: envelope.event_id, type: "evidence_receipt_recorded", occurredAt,
      receivedAt, producerId: WORK_DIRECTIVE_EXPIRY_VERIFIER_ID, producerKind: "VERIFIER",
      data: { ...(envelope.data as object), ...(refs ? { refs } : {}) } as StoredEvent["data"],
    });
    assert.equal(isBoundWorkDirectiveExpiry(events, asStored(AFTER)), true);
    assert.equal(isBoundWorkDirectiveExpiry(events, asStored(BEFORE)), false, "made before the deadline");
    assert.equal(isBoundWorkDirectiveExpiry(events, asStored(AFTER, undefined, BEFORE)), false, "received before it, whatever it claims");
    const noDirective = (envelope.data as { refs: string[] }).refs.map((ref) => ref.startsWith("directive_event:") ? "directive_event:unknown" : ref);
    assert.equal(isBoundWorkDirectiveExpiry(events, asStored(AFTER, noDirective)), false, "naming no directive that exists");
  } finally { store.close(); }
});

test("the question carries the job as it was authorized, and a long prompt is shortened to fit", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(AFTER) });
  for (const [label, prompt] of [["short", "EXACT BOUNDED DIRECTIVE job-1"], ["long", `LONG PROMPT ${"p".repeat(30_000)}`]] as const) {
    const store = registered();
    try {
      await withSupervisorConfiguration(async () => {
        appendDecision(store, "work-1", { ...bounded(), prompt });
        const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
        routeFleetSupervisorReasoning(store, watch, classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain(), AFTER), []);
        const root = routeBody(store.workerEvents(worker).findLast((event) => event.data.type === "worker_message_recorded")!);
        assert.ok(root.factualPacket.exactFactualState.length <= 12_000, label);
        const { bounded_execution: job, provenance } = JSON.parse(root.factualPacket.exactFactualState).expired_work_job.authorized_job;
        assert.equal(job.deadline, DEADLINE);
        assert.deepEqual(job.allowed_actions, ["read public pages"]);
        assert.deepEqual(job.forbidden_actions, ["spend money"]);
        assert.equal(job.maximum_execution_cycles, 2);
        assert.equal(job.success_threshold, "Up to 8 sources staged.");
        assert.equal(provenance.prompt_sha256, sha256(prompt));
        assert.equal(provenance.prompt_length, prompt.length);
        // The job keeps the bounded-execution shape, so it can be authorized again as it stands.
        assert.deepEqual(Object.keys(job).sort(), Object.keys({ ...bounded(), prompt }).sort());
        if (label === "short") { assert.equal(job.prompt, prompt); assert.equal(provenance.prompt_clipped, false); }
        else {
          assert.ok(job.prompt.length >= 500 && job.prompt.length < prompt.length); assert.ok(job.prompt.endsWith("…"));
          assert.equal(provenance.prompt_clipped, true);
        }
      });
    } finally { store.close(); }
  }
});

test("every recorded owner obligation and blocker still comes first; only the placeholder owner action gives way", () => {
  const store = registered();
  try {
    appendDecision(store, "work-1", bounded());
    const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
    const history = store.workerEvents(worker);
    assert.equal(projectWorker([...history]).correction.ownerAction.reason_code, "OWNER.ACTION_TELEMETRY_MISSING");
    assert.equal(classifyFleetSupervisorTick(watch, history, store.verifyChain(), AFTER).trigger, "WORK_DIRECTIVE_EXPIRED_UNRUN");
    const blocker = (kind: "OWNER" | "EXTERNAL" | "SUPERVISOR", needsOwner: boolean, offset: number): StoredEvent => ({
      ...history.at(-1)!, eventId: `blocker:${kind}:${offset}`, sequence: history.at(-1)!.sequence + offset,
      producerKind: "WORKER", producerId: `worker:${worker}`,
      data: {
        type: "structured_blocker_recorded", worker, blocker_id: `blocker:${kind}:${offset}`, task_id: task,
        direction_id: "direction:1", queue_item_id: null, status: "OPEN", severity: "BLOCKING", title: "Sign in",
        description: "The owner must sign in to the app on the host.", impact: "Work can't start.", blocking_scope: ["work"],
        workaround_available: false, workaround: null, required_actor: { kind, id: "actor:1" }, evidence_refs: [],
        reported_by: `worker:${worker}`, needs_owner: needsOwner, reported_at: at,
      } as StoredEvent["data"],
    });
    assert.equal(classifyFleetSupervisorTick(watch, [...history, blocker("OWNER", true, 1)], store.verifyChain(), AFTER).trigger, "OWNER_ACTION_REQUIRED");
    assert.equal(classifyFleetSupervisorTick(watch, [...history, blocker("EXTERNAL", false, 1)], store.verifyChain(), AFTER).trigger, "BLOCKED_EXTERNAL");
    // An earlier blocker on the owner isn't hidden by a later one on someone else.
    const hidden = [...history, blocker("OWNER", true, 1), blocker("SUPERVISOR", false, 2)];
    assert.equal(classifyFleetSupervisorTick(watch, hidden, store.verifyChain(), AFTER).trigger, "OWNER_ACTION_REQUIRED");
    // Nor an earlier blocker on an outside actor (Codex review of 0a800301).
    const hiddenExternal = [...history, blocker("EXTERNAL", false, 1), blocker("SUPERVISOR", false, 2)];
    assert.equal(classifyFleetSupervisorTick(watch, hiddenExternal, store.verifyChain(), AFTER).trigger, "BLOCKED_EXTERNAL");
  } finally { store.close(); }
});

test("an earlier question that was sent and expired unanswered goes to the owner; nothing is recorded or asked", async (t) => {
  const firstAt = Date.parse(BEFORE);
  t.mock.timers.enable({ apis: ["Date"], now: firstAt });
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      appendDecision(store, "work-1", bounded());
      const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
      // A routine question before the deadline (as a stalled check would ask), sent by the relay, never answered.
      routeFleetSupervisorReasoning(store, watch, { trigger: "REASONING_REVIEW_OVERDUE", result: "fixture", state: "ACTIVE",
        reasoningRequired: true, mechanicalRecoveryEligible: false, notifyOwner: false, notificationReason: null }, []);
      const request = admittedCycleRequests(store.workerEvents(worker)).admitted.at(-1)!;
      for (const event of sentByTheRelay(request, new Date(firstAt + 60_000).toISOString())) store.append(event, undefined, relayProducer, store.allEvents());
      const later = firstAt + 25 * 3_600_000;
      t.mock.timers.setTime(later);
      const decision = classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain(), new Date(later).toISOString());
      assert.equal(decision.trigger, "OWNER_ACTION_REQUIRED");
      assert.equal(decision.reasoningRequired, false);
      assert.match(decision.notificationReason ?? "", /an earlier question to its supervisor was sent but expired without an answer/);
      assert.equal(store.workerEvents(worker).filter((event) => isWorkDirectiveExpiryEvidence(event)).length, 0);
    });
  } finally { store.close(); }
});

test("only a task the owner registered is asked about an expired job", () => {
  const store = registered();
  try {
    appendDecision(store, "work-1", bounded());
    const events = store.workerEvents(worker);
    assert.ok(expiredWorkJobForSupervision(events, AFTER), "registered: asked about");
    // The same history without the owner's registration record (another worker's kind): left to its own supervision.
    const unregistered = events.filter((event) => !(event.data.type === "owner_source_recorded"));
    assert.ok(expiredUnrunWorkDirective(unregistered, AFTER), "its job is expired and unrun all the same");
    assert.equal(expiredWorkJobForSupervision(unregistered, AFTER), null);
  } finally { store.close(); }
});

test("a hold answered after the expiry is a hold: the task waits for a checkpoint, held by its supervisor", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(AFTER) });
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      appendDecision(store, "work-1", bounded());
      const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
      assert.equal(registeredTaskHold(store.workerEvents(worker)), null, "a task with a directive isn't held");
      routeFleetSupervisorReasoning(store, watch, classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain(), AFTER), []);
      appendDecision(store, "hold-1", null, new Date(Date.parse(AFTER) + 120_000).toISOString());
      const events = store.workerEvents(worker);
      assert.ok(registeredTaskHold(events), "held by the answer to the expiry record");
      assert.equal(projectWorker([...events]).correction.ownerAction.reason_code, OWNER_TASK_HELD_BY_SUPERVISOR_REASON);
      const held = classifyFleetSupervisorTick(watch, events, store.verifyChain(), new Date(Date.parse(AFTER) + 180_000).toISOString());
      assert.equal(held.trigger, "SUPERVISOR_HOLD");
    });
  } finally { store.close(); }
});

test("a job already sent can still be checked read-only after its deadline; one only requested is not sent", () => {
  const store = registered();
  try {
    appendDecision(store, "work-1", bounded());
    const sourceChats = [{ supervisorId: "mc-project-manager", sourceChatTitle: "Mission Control Fleet Watch",
      sourceChatUrl: "chatgpt-conversation://abc-123", sourceChatBrowserUrl: null, chatgptProjectId: null }];
    const discover = (events: StoredEvent[], requestedAt: string) => discoverDirectWorkCloudDispatches({
      events, sourceChats, allowedWorkers: new Set([worker]),
      receiptTarget: { repository: "owner/private-receipts", stageIssueNumber: 4 }, requestedAt,
      artifactPathFor: (dispatchId) => `/private/${sha256(dispatchId)}.json`,
    });
    const base = store.workerEvents(worker);
    const [candidate] = discover(base, BEFORE);
    const binding = { worker, directive_id: candidate!.controllerRequest.binding.directiveId,
      directive_revision: candidate!.controllerRequest.binding.directiveRevision, task_id: task, dispatch_id: candidate!.dispatchId };
    const request = fake(base, { ...binding, type: "chatgpt_work_cloud_dispatch_requested", mode: "CREATE" }, "r1");
    assert.equal(discover([...base, request], BEFORE)[0]?.recoveryState, "REQUEST_ONLY_PROVEN_UNSENT");
    assert.equal(discover([...base, request], AFTER).length, 0, "not sent after the deadline");
    const intent = fake([...base, request], { ...binding, type: "chatgpt_work_cloud_handoff_intent_recorded" }, "i1");
    const pending = fake([...base, request, intent], { ...binding, type: "chatgpt_work_cloud_dispatch_recorded", status: "PENDING_SETUP" }, "d1");
    assert.equal(discover([...base, request, intent, pending], AFTER)[0]?.recoveryState, "PENDING_SETUP_READ_ONLY");
  } finally { store.close(); }
});

test("only the projection's placeholder owner action gives way to the expiry question", () => {
  assert.equal(expiryQuestionReplaces({ reason_code: "OWNER.ACTION_TELEMETRY_MISSING" }), true);
  for (const reason of ["SUPERVISOR.HOST_APP_SIGN_IN", "OWNER.TASK_HELD_BY_SUPERVISOR", "OWNER.ACTIVE_DIRECTIVE_CONFLICT", null]) {
    assert.equal(expiryQuestionReplaces({ reason_code: reason }), false, String(reason));
  }
});

test("an answer after the expiry record settles it even when it leaves the expired directive in place", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(AFTER) });
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      appendDecision(store, "work-1", bounded());
      const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
      routeFleetSupervisorReasoning(store, watch, classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain(), AFTER), []);
      // A decision that carries execution but derived no directive here: the expired directive stays the latest.
      appendDecision(store, "work-2", bounded("2026-10-22T00:00:00.000Z", "job-2"), new Date(Date.parse(AFTER) + 120_000).toISOString(), false);
      const decision = classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain(), new Date(Date.parse(AFTER) + 180_000).toISOString());
      assert.notEqual(decision.trigger, "WORK_DIRECTIVE_EXPIRED_UNRUN");
    });
  } finally { store.close(); }
});

test("a prompt that fits travels whole, past 4,000 characters; one that doesn't is shortened and marked", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(AFTER) });
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      const prompt = `PROMPT ${"q".repeat(20_000)}`;
      appendDecision(store, "work-1", { ...bounded(), prompt, success_threshold: `Threshold ${"t".repeat(5_500)}` });
      const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
      const decision = classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain(), AFTER);
      assert.equal(decision.trigger, "WORK_DIRECTIVE_EXPIRED_UNRUN");
      routeFleetSupervisorReasoning(store, watch, decision, []);
      const root = routeBody(store.workerEvents(worker).findLast((event) => event.data.type === "worker_message_recorded")!);
      assert.ok(root.factualPacket.exactFactualState.length <= 12_000);
      const { bounded_execution: job, provenance } = JSON.parse(root.factualPacket.exactFactualState).expired_work_job.authorized_job;
      assert.ok(job.prompt.length >= 500 && job.prompt.length < 4_000, String(job.prompt.length));
      assert.equal(provenance.prompt_clipped, true);
      assert.equal(job.success_threshold.length, 5_510, "other fields travel whole");
      assert.match(root.factualPacket.decisionRequested, /prompt_clipped is true, the prompt shown was cut/);
    });
  } finally { store.close(); }
});

test("a 6,000-character prompt that fits goes out whole", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(AFTER) });
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      const prompt = `${"r".repeat(6_000)} STOP AND RETURN WHEN DONE`;
      appendDecision(store, "work-1", { ...bounded(), prompt });
      const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
      routeFleetSupervisorReasoning(store, watch, classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain(), AFTER), []);
      const root = routeBody(store.workerEvents(worker).findLast((event) => event.data.type === "worker_message_recorded")!);
      const { bounded_execution: job, provenance } = JSON.parse(root.factualPacket.exactFactualState).expired_work_job.authorized_job;
      assert.equal(job.prompt, prompt);
      assert.equal(provenance.prompt_clipped, false);
    });
  } finally { store.close(); }
});

test("a job that can't fit one question even shortened goes to the owner, and nothing is recorded or asked", () => {
  const store = registered();
  try {
    appendDecision(store, "work-1", { ...bounded(), success_threshold: `T ${"t".repeat(11_800)}` });
    const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
    const decision = classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain(), AFTER);
    assert.equal(decision.trigger, "OWNER_ACTION_REQUIRED");
    assert.equal(decision.reasoningRequired, false);
    assert.match(decision.notificationReason ?? "", /too long for one supervisor question, even shortened/);
    assert.equal(store.workerEvents(worker).filter((event) => isWorkDirectiveExpiryEvidence(event)).length, 0);
  } finally { store.close(); }
});

test("an earlier question that expired unsent is retired first, then the expiry is recorded and asked about", async (t) => {
  const firstAt = Date.parse(BEFORE);
  t.mock.timers.enable({ apis: ["Date"], now: firstAt });
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      appendDecision(store, "work-1", bounded());
      const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: task, cadenceMs: 60_000 }, at);
      routeFleetSupervisorReasoning(store, watch, { trigger: "REASONING_REVIEW_OVERDUE", result: "fixture", state: "ACTIVE",
        reasoningRequired: true, mechanicalRecoveryEligible: false, notifyOwner: false, notificationReason: null }, []);
      const old = admittedCycleRequests(store.workerEvents(worker)).admitted.at(-1)!;
      const later = firstAt + 25 * 3_600_000;
      t.mock.timers.setTime(later);
      const now = new Date(later).toISOString();
      const decision = classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain(), now);
      assert.equal(decision.trigger, "WORK_DIRECTIVE_EXPIRED_UNRUN", "never sent, so not the owner's");
      // Without proof that it went unsent, nothing is recorded.
      assert.throws(() => routeFleetSupervisorReasoning(store, watch, decision, []), /did not prove the expired request unsent/);
      assert.equal(store.workerEvents(worker).filter((event) => isWorkDirectiveExpiryEvidence(event)).length, 0);
      const proof = { schemaVersion: 1 as const, requestId: old.requestId, pacingDomain: "p", ledgerValid: true, matchingStateSections: [],
        queueRecordCount: 0, admissionRecordCount: 0, provenUnsent: true, proofSha256: "a".repeat(64) };
      const route = routeFleetSupervisorReasoning(store, watch, decision, [], proof as never);
      const root = routeBody(route as StoredEvent);
      const events = store.workerEvents(worker);
      assert.notEqual(root.requestId, old.requestId);
      assert.equal(events.filter((event) => isWorkDirectiveExpiryEvidence(event)).length, 1);
      const facts = JSON.parse(root.factualPacket.exactFactualState);
      assert.equal(facts.decision_boundary.event_type, "evidence_receipt_recorded");
      assert.ok(facts.expired_work_job.authorized_job.bounded_execution);
    });
  } finally { store.close(); }
});
