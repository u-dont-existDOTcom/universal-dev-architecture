import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../lib/store";
import { seedIssue47Store } from "../lib/seed";
import { classifyFleetSupervisorTick, FleetSupervisorRuntime, routeFleetSupervisorReasoning } from "../lib/fleet-supervisor";
// Exercise the actual downstream browser-relay parser, not only the packet builder.
// @ts-expect-error The separately deployed relay is plain JavaScript without a declaration package.
import { parseSupervisoryCycleRouteBody } from "../../../vps-browser-relay/src/core.mjs";
const start = "2026-09-25T00:00:00.000Z", due = "2026-09-25T01:00:00.000Z";
function fixture() {
  const store = new EventStore(":memory:"); seedIssue47Store(store);
  store.configureFleetSupervisorWatch("project:mission-control", { state: "DISABLED" }, start);
  store.configureFleetSupervisorWatch("project:human-design", { cadenceMs: 3_600_000 }, start);
  const watch = store.fleetSupervisorWatch("project:human-design")!;
  return { store, watch };
}
function blocker(f: ReturnType<typeof fixture>, actor = "SUPERVISOR", status = "OPEN", task = f.watch.taskId) {
  const queue = f.store.workerEvents(f.watch.worker).findLast(e => e.data.type === "work_queue_published")!.data as any;
  f.store.append({ schema_version: 2, event_id: `block:${actor}:${status}:${task}`, mission_id: "test", occurred_at: start,
    data: { type: "structured_blocker_recorded", worker: f.watch.worker, blocker_id: `blocker:${actor}`, task_id: task,
      direction_id: queue.direction_id, queue_item_id: null, status, severity: "BLOCKING", title: "Execution blocked",
      description: "PRIVATE_SENTINEL_MUST_NOT_BE_COPIED", impact: "Task cannot advance", blocking_scope: [task],
      workaround_available: false, workaround: null, required_actor: { kind: actor, id: "actor:fixture" },
      evidence_refs: [], reported_by: `worker:${f.watch.worker}`, needs_owner: actor === "OWNER", reported_at: start } } as any,
    start, { id: `worker:${f.watch.worker}`, kind: "WORKER", workerScopes: [f.watch.worker], taskScopes: ["*"] });
}
const classify = (f: ReturnType<typeof fixture>) => classifyFleetSupervisorTick(f.watch,
  f.store.workerEvents(f.watch.worker), { valid: true, errors: [] });
test("internal execution blockers route to Chat rather than masquerading as healthy", () => {
  const f = fixture(); try { blocker(f); const d = classify(f);
    assert.equal(d.trigger, "EXECUTION_BLOCKED"); assert.equal(d.reasoningRequired, true);
    assert.equal(d.notifyOwner, false); assert.equal(d.mechanicalRecoveryEligible, false);
  } finally { f.store.close(); }
});
test("missing progress is a reasoning/evidence gap, not an owner decision", () => {
  const f = fixture(); try {
    const events = f.store.workerEvents(f.watch.worker).filter(e => e.data.type !== "outcome_progress_recorded");
    const d = classifyFleetSupervisorTick(f.watch, events, { valid: true, errors: [] });
    assert.equal(d.trigger, "PROGRESS_OBSERVABILITY_GAP"); assert.equal(d.reasoningRequired, true);
    assert.equal(d.notifyOwner, false);
  } finally { f.store.close(); }
});
test("resolved and other-task blockers cannot keep the current task held", () => {
  const f = fixture(); try { blocker(f); blocker(f, "SUPERVISOR", "RESOLVED");
    blocker(f, "OWNER", "OPEN", "task:unrelated"); assert.equal(classify(f).trigger, "HEALTHY_ADVANCING");
  } finally { f.store.close(); }
});
test("true owner and external gates remain fenced", () => {
  for (const actor of ["OWNER", "EXTERNAL"]) {
    const f = fixture(); try { blocker(f, actor); const d = classify(f);
      assert.equal(d.reasoningRequired, false); assert.equal(d.mechanicalRecoveryEligible, false);
      assert.equal(d.notifyOwner, actor === "OWNER");
    } finally { f.store.close(); }
  }
});
function configuration() {
  const old = { chats: process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON,
    policy: process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON };
  process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = JSON.stringify([{
    scope: "PROJECT_MANAGER", supervisorId: "mc-project-manager", label: "Synthetic manager", workerId: null,
    registrationId: "registration:fixture", ownership: "MISSION_CONTROL_ONLY", purpose: "Test review",
    accountAlias: "fixture", workspaceAlias: "fixture", privateLocatorRef: "private:fixture",
    bootstrapCapability: { chatId: "fixture", url: "https://chatgpt.com/c/fixture", challengeId: "challenge:fixture" },
    registrationProvenance: { registeredBy: "OWNER", registeredAt: start, sourceRef: "fixture:owner" },
    consumerControls: { modelSelectionPolicy: "TOP_VISIBLE_SELECTABLE_MODEL", thinkingControlLabel: "Thinking effort",
      thinkingVisibleLabel: "Extra High", thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro",
      accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false }
  }]);
  process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify({ repository: "fixture/control",
    decisionIssueNumber: 1, capabilityIssueNumber: 2, stageIssueNumber: 3, authorizedWriterLogins: ["fixture"],
    capabilityChallenges: [], requestBound: { enabled: true, relayProducerIds: ["collector:fixture"] } });
  return () => {
    if (old.chats === undefined) delete process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
    else process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = old.chats;
    if (old.policy === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
    else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = old.policy;
  };
}
const routes = (f: ReturnType<typeof fixture>) => f.store.workerEvents(f.watch.worker)
  .filter(e => e.data.type === "worker_message_recorded" && e.data.body.startsWith("MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V6\n"));
test("actual fleet tick emits one V6 route accepted by the real relay parser", async () => {
  const f = fixture(), restore = configuration(); try {
    blocker(f); let ownerNotifications = 0;
    const runtime = new FleetSupervisorRuntime(f.store, {
      routeReasoning: (w, d, e) => routeFleetSupervisorReasoning(f.store, w, d, e),
      notifyOwner: () => { ownerNotifications++; }
    });
    await runtime.tick(due);
    assert.equal(routes(f).length, 1);
    const event = routes(f)[0]; assert.equal(event.data.type, "worker_message_recorded");
    if (event.data.type !== "worker_message_recorded") throw new Error("wrong event");
    const parsed = parseSupervisoryCycleRouteBody(event.data.body);
    assert.ok(parsed); assert.equal(parsed.routeSchemaVersion, 6);
    assert.equal(parsed.reasoningLane, "EXTRA_HIGH_DIRECT");
    assert.equal(parsed.factualPacket.taskId, f.watch.taskId);
    assert.equal(parsed.destinationSupervisorId, "mc-project-manager");
    assert.equal(parsed.ownerRelayRequired, false);
    assert.equal(parsed.providerDeliveryState, "QUEUED_FOR_PROVIDER_RELAY");
    assert.equal(event.data.body.includes("PRIVATE_SENTINEL_MUST_NOT_BE_COPIED"), false);
    await new FleetSupervisorRuntime(f.store, {
      routeReasoning: (w, d, e) => routeFleetSupervisorReasoning(f.store, w, d, e)
    }).tick("2026-09-25T02:00:00.000Z");
    assert.equal(routes(f).length, 1); assert.equal(ownerNotifications, 0);
    assert.equal(f.store.verifyChain().valid, true);
  } finally { f.store.close(); restore(); }
});
test("only current source-bound supervisory Pro escalation selects the Pro lane", () => {
  for (const current of [false, true]) {
    const f = fixture(), restore = configuration(); try {
      blocker(f); const events = f.store.workerEvents(f.watch.worker);
      const o = events.findLast(e => e.data.type === "owner_outcome_recorded")!.data as any;
      const r = events.findLast(e => e.data.type === "reasoning_supervision_recorded")!.data as any;
      const appendReview = () => f.store.append({ schema_version: 2, event_id: "review:pro", mission_id: "test", occurred_at: due,
        data: { ...r, decision_id: "decision:pro", owner_outcome_id: o.owner_outcome_id,
          owner_outcome_epoch: current ? o.epoch : o.epoch + 1, owner_outcome_sha256: o.owner_outcome_sha256,
          pro_escalation_state: "PENDING" } }, due,
        { id: "supervisor:fixture", kind: "SUPERVISOR", workerScopes: [f.watch.worker], taskScopes: [f.watch.taskId] });
      if (current) appendReview(); else assert.throws(appendReview, /current exact owner-outcome/);
      routeFleetSupervisorReasoning(f.store, f.watch, classify(f), f.store.workerEvents(f.watch.worker));
      const data = routes(f)[0].data as any;
      assert.equal(parseSupervisoryCycleRouteBody(data.body).reasoningLane, current ? "PRO_ESCALATED" : "EXTRA_HIGH_DIRECT");
    } finally { f.store.close(); restore(); }
  }
});
test("missing relay configuration cannot be presented as a delivered review", async () => {
  const f = fixture(), restore = configuration(); try {
    blocker(f); delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
    const result = await new FleetSupervisorRuntime(f.store, {
      routeReasoning: (w, d, e) => routeFleetSupervisorReasoning(f.store, w, d, e)
    }).tick(due);
    assert.equal(routes(f).length, 0); assert.match(result[0].decision.result, /REASONING_ROUTE_UNAVAILABLE/);
    assert.equal(result[0].decision.mechanicalRecoveryEligible, false);
  } finally { f.store.close(); restore(); }
});
test("an expired unresolved review is held, never duplicated or treated as permission to resume", () => {
  const f = fixture(), restore = configuration(); try {
    blocker(f); const initial = routeFleetSupervisorReasoning(f.store, f.watch, classify(f), f.store.workerEvents(f.watch.worker));
    assert.equal(initial.status, "QUEUED_FOR_PROVIDER_RELAY");
    const expired = { ...f.watch, nextTickAt: "2026-09-26T12:00:00.000Z" };
    const result = routeFleetSupervisorReasoning(f.store, expired, classify(f), f.store.workerEvents(f.watch.worker));
    assert.equal(result.status, "HANDOFF_BLOCKED"); assert.equal(routes(f).length, 1);
  } finally { f.store.close(); restore(); }
});
test("a malformed route-shaped worker message does not suppress a genuine bound review", () => {
  const f = fixture(), restore = configuration(); try {
    blocker(f);
    f.store.append({ schema_version: 2, event_id: "malformed:lookalike", mission_id: "test", occurred_at: due,
      data: { type: "worker_message_recorded", worker: f.watch.worker, message_id: "message:malformed",
        thread_id: "thread:malformed", message_kind: "QUESTION", reply_to_message_id: null, direction_id: null,
        body: "MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V6\n" + JSON.stringify({ requestId: "fleet-watch:lookalike",
          factualPacket: { taskId: f.watch.taskId } }) } }, due,
      { id: `worker:${f.watch.worker}`, kind: "WORKER", workerScopes: [f.watch.worker], taskScopes: [f.watch.taskId] });
    const result = routeFleetSupervisorReasoning(f.store, f.watch, classify(f), f.store.workerEvents(f.watch.worker));
    assert.equal(result.status, "QUEUED_FOR_PROVIDER_RELAY");
    assert.equal(routes(f).filter(e => e.data.type === "worker_message_recorded"
      && parseSupervisoryCycleRouteBody(e.data.body)).length, 1);
  } finally { f.store.close(); restore(); }
});
