// A task the owner registered on the form (PR #394) gets its first supervisor question from the fleet watch.
import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyFleetSupervisorTick, FIRST_SUPERVISION_DECISION_REQUESTED, FleetSupervisorRuntime, routeFleetSupervisorReasoning,
} from "../lib/fleet-supervisor";
import { enrollFleetSupervisorWatch } from "../lib/fleet-watch-enrollment";
import { pendingDecisionRequests } from "../lib/github-decision-receipts";
import { inBandRequestRoutePrefix } from "../lib/in-band-request-binding";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import { parseOwnerTaskRegistration, registerOwnerTask } from "../lib/owner-task-registration";
import { OWNER_TASK_AWAITING_SUPERVISION_REASON } from "../lib/owner-task-source";
import { projectWorker } from "../lib/projection";
import type { StoredEvent } from "../lib/schema";
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
    "CHATGPT_WORK_CLOUD", "Do not weaken the contract, spend money, or publish anything."]) {
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
