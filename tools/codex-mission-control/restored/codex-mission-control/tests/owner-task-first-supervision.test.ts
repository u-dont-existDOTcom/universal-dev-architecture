// A task the owner registered on the form (PR #394) gets its first supervisor question from the fleet watch.
import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyFleetSupervisorTick, FIRST_SUPERVISION_DECISION_REQUESTED, FleetSupervisorRuntime, routeFleetSupervisorReasoning,
} from "../lib/fleet-supervisor";
import { enrollFleetSupervisorWatch } from "../lib/fleet-watch-enrollment";
import {
  admittedCycleRequests, parseGitHubReceiptPolicy, pendingDecisionRequests, type PendingDecisionRequest,
} from "../lib/github-decision-receipts";
import { inBandRequestBindingEnvelope, inBandRequestRoutePrefix } from "../lib/in-band-request-binding";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import { awaitingItsSupervisor, ownerAttention, workerDisposition } from "../lib/owner-view";
import { parseOwnerTaskRegistration, registerOwnerTask } from "../lib/owner-task-registration";
import { OWNER_TASK_AWAITING_SUPERVISION_REASON, OWNER_TASK_FIRST_QUESTION_UNANSWERED_REASON } from "../lib/owner-task-source";
import { projectWorker } from "../lib/projection";
import type { AppendEnvelope, StoredEvent } from "../lib/schema";
import { EventStore } from "../lib/store";

const owner: AuthenticatedProducer = { id: "owner:primary", kind: "OWNER_AUTHORITY", workerScopes: ["*"], taskScopes: ["*"] };
const at = "2026-10-17T12:00:00.000Z";
const worker = "atlas-test-pilot";
const body = {
  worker, name: "Atlas test pilot",
  goal: "Find neglected treatments with large patient-important benefits, and their harms.",
  may_use: "Public sources\nChatGPT Work for collecting sources",
  must_never: "Spend money\nPublish anything",
  done_when: "A first brief exists",
};

function registered() {
  const store = new EventStore(":memory:");
  const parsed = parseOwnerTaskRegistration(body);
  assert.notEqual(typeof parsed, "string", String(parsed));
  registerOwnerTask(store, parsed as Exclude<typeof parsed, string>, owner, store.allEvents(), at);
  return store;
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
  if (event.data.type !== "worker_message_recorded") throw new Error("not a route");
  assert.ok(event.data.body.startsWith(inBandRequestRoutePrefix));
  return JSON.parse(event.data.body.slice(inBandRequestRoutePrefix.length));
}

test("a registered task joins the fleet watch at once, under task:<worker> and no other task id", () => {
  const store = registered();
  try {
    for (const taskId of ["contract:atlas-test-pilot", "task:another-task", "task:atlas-test-pilot:extra"]) {
      assert.throws(() => enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId, cadenceMs: 60_000 }, at),
        /does not appear/, taskId);
    }
    const { watch, created } = enrollFleetSupervisorWatch(store, "project:atlas-test",
      { worker, taskId: `task:${worker}`, cadenceMs: 60_000 }, at);
    assert.equal(created, true);
    assert.equal(watch.taskId, "task:atlas-test-pilot");
    assert.equal(watch.state, "ACTIVE");
    assert.equal(watch.nextTickAt, "2026-10-17T12:01:00.000Z");
    // A worker that wasn't registered on the form doesn't get task:<worker> for free.
    const workerProducer: AuthenticatedProducer = { id: "worker:plain-worker", kind: "WORKER", workerScopes: ["plain-worker"], taskScopes: ["*"] };
    store.append({ schema_version: 2, event_id: "message:plain", mission_id: "mission-control", occurred_at: at, data: {
      type: "worker_message_recorded", worker: "plain-worker", message_id: "message:plain", thread_id: "thread:plain-worker",
      message_kind: "QUESTION", body: "x", reply_to_message_id: null, direction_id: null,
    } }, undefined, workerProducer, store.allEvents());
    assert.throws(() => enrollFleetSupervisorWatch(store, "project:plain",
      { worker: "plain-worker", taskId: "task:plain-worker", cadenceMs: 60_000 }, at), /does not appear/);
  } finally { store.close(); }
});

test("the first check routes the registered task's first question to the project manager, without telling the owner", async () => {
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: `task:${worker}`, cadenceMs: 60_000 }, at);
      const decision = classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain());
      assert.equal(decision.trigger, "FIRST_SUPERVISION_REQUIRED");
      assert.equal(decision.reasoningRequired, true);
      assert.equal(decision.notifyOwner, false);
      assert.equal(decision.state, "ACTIVE");

      const notified: string[] = [];
      const runtime = new FleetSupervisorRuntime(store, {
        routeReasoning: (current, routed, events) => routeFleetSupervisorReasoning(store, current, routed, events),
        notifyOwner: (_current, routed) => { notified.push(routed.trigger); },
      });
      const [first] = await runtime.tick("2026-10-17T12:01:00.000Z");
      assert.equal(first?.decision.trigger, "FIRST_SUPERVISION_REQUIRED");
      assert.equal(first?.committed, true);
      assert.equal(first?.notificationDisposition, "SUPPRESSED_NOT_ACTIONABLE");
      assert.deepEqual(notified, []);

      const events = store.workerEvents(worker);
      const contract = events.find((event) => event.data.type === "task_contract_recorded")!;
      const route = events.at(-1)!;
      assert.equal(route.producerKind, "WORKER");
      const root = routeBody(route);
      assert.equal(root.schemaVersion, 6);
      assert.equal(root.destination, "PROJECT_MANAGER_CHAT");
      assert.equal(root.destinationSupervisorId, "mc-project-manager");
      assert.equal(root.reasoningLane, "EXTRA_HIGH_DIRECT");
      assert.deepEqual(root.executionContext, { task_id: "task:atlas-test-pilot" });
      assert.equal(root.factualPacket.decisionRequested, FIRST_SUPERVISION_DECISION_REQUESTED);
      const facts = JSON.parse(root.factualPacket.exactFactualState);
      assert.equal(facts.trigger, "FIRST_SUPERVISION_REQUIRED");
      assert.deepEqual(facts.decision_boundary, { event_id: contract.eventId, event_type: "task_contract_recorded", occurred_at: at });
      assert.equal(facts.task_contract.goal, body.goal);
      assert.deepEqual(facts.task_contract.source.forbidden_scope, ["Spend money", "Publish anything"]);
      assert.ok(facts.task_contract.source.allowed_scope.includes("ChatGPT Work for collecting sources"));
      assert.equal(pendingDecisionRequests(events).length, 1);
      // The question doesn't end the wait: the owner still sees it waiting for its supervisor.
      assert.equal(projectWorker(events).correction.ownerAction.reason_code, OWNER_TASK_AWAITING_SUPERVISION_REASON);

      // Later checks while the question is open ask nothing new.
      const count = store.count();
      const [second] = await runtime.tick("2026-10-17T12:02:00.000Z");
      assert.equal(second?.decision.trigger, "FIRST_SUPERVISION_REQUIRED");
      assert.equal(store.count(), count);
      assert.deepEqual(notified, []);
    });
  } finally { store.close(); }
});

test("the first question asks for one bounded step within the owner's contract, and Work only where the contract allows it", () => {
  assert.ok(FIRST_SUPERVISION_DECISION_REQUESTED.length <= 2_000, "fits the factual packet's decision limit");
  for (const phrase of ["first bounded step", "allowed scope", "must-never limits", "includes ChatGPT Work",
    "CHATGPT_WORK_CLOUD", "don't choose CODEX unless the contract names it", "Do not weaken the contract, spend money, or publish anything."]) {
    assert.ok(FIRST_SUPERVISION_DECISION_REQUESTED.includes(phrase), phrase);
  }
});

test("once the supervisor has acted, the registered task leaves the first-question path", () => {
  const store = registered();
  try {
    const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: `task:${worker}`, cadenceMs: 60_000 }, at);
    const history = store.workerEvents(worker);
    const last = history.at(-1)!;
    const supervisorRecord = { ...last, eventId: "supervisor:1", sequence: last.sequence + 1, producerKind: "SUPERVISOR" as const };
    const decision = classifyFleetSupervisorTick(watch, [...history, supervisorRecord], store.verifyChain());
    assert.notEqual(decision.trigger, "FIRST_SUPERVISION_REQUIRED");
    // An owner action that isn't the registration wait still goes to the owner, as before.
    assert.equal(decision.trigger, "OWNER_ACTION_REQUIRED");
    assert.equal(decision.notifyOwner, true);
  } finally { store.close(); }
});

test("a first question that was sent but not answered before it expired goes to the owner, and nothing asks again", async (t) => {
  const firstCheck = Date.parse(at) + 60_000;
  t.mock.timers.enable({ apis: ["Date"], now: firstCheck });
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: `task:${worker}`, cadenceMs: 60_000 }, at);
      let routed = 0;
      const notified: string[] = [];
      const runtime = new FleetSupervisorRuntime(store, {
        routeReasoning: (current, routedDecision, events) => {
          routed += 1;
          return routeFleetSupervisorReasoning(store, current, routedDecision, events);
        },
        notifyOwner: (_current, routedDecision) => { notified.push(routedDecision.notificationReason ?? ""); },
      });
      await runtime.tick(new Date(firstCheck).toISOString());
      assert.equal(routed, 1);
      const request = admittedCycleRequests(store.workerEvents(worker)).admitted.at(-1)!;
      // The relay sends it (its trusted receipts) and no answer comes back.
      for (const event of sentByTheRelay(request, new Date(firstCheck + 5 * 60_000).toISOString())) {
        store.append(event, undefined, relayProducer, store.allEvents());
      }
      t.mock.timers.setTime(firstCheck + 10 * 60_000);
      assert.equal(projectWorker(store.workerEvents(worker)).supervisorActivity.requests[0]?.state, "SENT");
      assert.ok(awaitingItsSupervisor(projectWorker(store.workerEvents(worker))), "while it may still be answered, the task waits quietly");

      const afterExpiry = firstCheck + 25 * 3_600_000;
      t.mock.timers.setTime(afterExpiry);
      const state = projectWorker(store.workerEvents(worker));
      assert.equal(state.supervisorActivity.requests[0]?.state, "NO_ANSWER");
      assert.equal(state.correction.ownerAction.reason_code, OWNER_TASK_FIRST_QUESTION_UNANSWERED_REASON);
      assert.equal(awaitingItsSupervisor(state), false);
      const attention = ownerAttention(state);
      assert.equal(attention?.kind, "alarm");
      assert.equal(attention?.kind === "alarm" ? attention.title : null, "Its supervisor didn't answer");
      assert.equal(workerDisposition(state), "Needs a look: its supervisor didn't answer");

      const [check] = await runtime.tick(new Date(afterExpiry).toISOString());
      assert.equal(check?.decision.trigger, "OWNER_ACTION_REQUIRED");
      assert.equal(check?.committed, true, "the check completes instead of failing on every poll");
      assert.equal(routed, 1, "nothing is routed again");
      assert.equal(notified.length, 1);
      assert.match(notified[0] ?? "", /no answer came back before it expired/);
      const [again] = await runtime.tick(new Date(afterExpiry + 61_000).toISOString());
      assert.equal(again?.notificationDisposition, "SUPPRESSED_DUPLICATE");
      assert.equal(notified.length, 1);
    });
  } finally { store.close(); }
});

test("a blocker that waits on the owner isn't hidden behind the quiet first question", () => {
  const store = registered();
  try {
    const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: `task:${worker}`, cadenceMs: 60_000 }, at);
    const history = store.workerEvents(worker);
    const last = history.at(-1)!;
    const blocker = (requiredActor: "OWNER" | "EXTERNAL"): StoredEvent => ({
      ...last, eventId: `blocker:${requiredActor}`, sequence: last.sequence + 1, producerKind: "WORKER", producerId: `worker:${worker}`,
      data: {
        type: "structured_blocker_recorded", worker, blocker_id: `blocker:${requiredActor}`, task_id: `task:${worker}`,
        direction_id: "direction:1", queue_item_id: null, status: "OPEN", severity: "BLOCKING", title: "Needs a login",
        description: "The source needs the owner's own login.", impact: "Collection can't start.", blocking_scope: ["collection"],
        workaround_available: false, workaround: null, required_actor: { kind: requiredActor, id: "actor:1" }, evidence_refs: [],
        reported_by: `worker:${worker}`, needs_owner: requiredActor === "OWNER", reported_at: at,
      } as StoredEvent["data"],
    });
    const owner = classifyFleetSupervisorTick(watch, [...history, blocker("OWNER")], store.verifyChain());
    assert.equal(owner.trigger, "OWNER_ACTION_REQUIRED");
    assert.equal(owner.notifyOwner, true);
    assert.equal(owner.notificationReason, "The source needs the owner's own login.");
    const external = classifyFleetSupervisorTick(watch, [...history, blocker("EXTERNAL")], store.verifyChain());
    assert.equal(external.trigger, "FIRST_SUPERVISION_REQUIRED", "a blocker on someone else doesn't stop the first question");
    // The task card says the owner is needed, not that the task waits quietly for its supervisor.
    const blocked = projectWorker([...history, blocker("OWNER")]);
    assert.equal(awaitingItsSupervisor(blocked), false);
    assert.equal(workerDisposition(blocked), "Waiting for your decision");
    assert.equal(awaitingItsSupervisor(projectWorker([...history, blocker("EXTERNAL")])), true);
  } finally { store.close(); }
});

test("without the registration the old boundary rule stands: no durable boundary, no question", async () => {
  const store = registered();
  try {
    await withSupervisorConfiguration(() => {
      const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: `task:${worker}`, cadenceMs: 60_000 }, at);
      const unregistered = store.workerEvents(worker).filter((event) => event.data.type !== "owner_source_recorded");
      const decision = classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain());
      const fakeStore = Object.create(store) as EventStore;
      fakeStore.workerEvents = () => unregistered;
      assert.throws(() => routeFleetSupervisorReasoning(fakeStore, watch, decision, unregistered), /durable decision boundary/);
    });
  } finally { store.close(); }
});

const relayProducer: AuthenticatedProducer = { id: "collector:relay", kind: "COLLECTOR", workerScopes: [worker], taskScopes: ["*"] };
const PROMPT = "d".repeat(64);
const SESSION_ID = "provider-session:atlas-test-first";
const CHAT = "https://chatgpt.com/c/atlas-test-first";
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
