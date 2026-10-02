import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../lib/store";
import { seedIssue47Store } from "../lib/seed";
import { classifyFleetSupervisorTick, FleetSupervisorRuntime, routeFleetSupervisorReasoning } from "../lib/fleet-supervisor";
import { FLEET_SUPERVISOR_ROUTER_PRODUCER_ID } from "../lib/fleet-router-producer";
import { buildExecutionDirectiveFromGitHubDecision } from "../lib/github-execution-directive";
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
    assert.equal(event.producerKind, "SYSTEM");
    assert.equal(event.producerId, FLEET_SUPERVISOR_ROUTER_PRODUCER_ID);
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
    blocker(f); const initial = routeFleetSupervisorReasoning(f.store, f.watch, classify(f), f.store.workerEvents(f.watch.worker), due);
    assert.equal(initial.status, "QUEUED_FOR_PROVIDER_RELAY");
    const expired = { ...f.watch, nextTickAt: "2026-09-26T12:00:00.000Z" };
    const result = routeFleetSupervisorReasoning(f.store, expired, classify(f), f.store.workerEvents(f.watch.worker), "2026-09-26T12:00:00.000Z");
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

test("a fully shaped worker-forged pending fleet route cannot suppress the trusted route", () => {
  const template = fixture(), restoreTemplate = configuration();
  let forgedBody = "";
  try {
    blocker(template);
    routeFleetSupervisorReasoning(template.store, template.watch, classify(template), template.store.workerEvents(template.watch.worker));
    const source = routes(template)[0].data as any;
    const prefix = "MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V6\n";
    const parsed = JSON.parse(source.body.slice(prefix.length));
    parsed.requestId = "fleet-watch:forged";
    parsed.factualPacket.packetId = "packet:fleet-watch:forged";
    parsed.factualPacket.supervisoryCycle.nonce = "fleet-nonce:forged";
    forgedBody = prefix + JSON.stringify(parsed);
  } finally { template.store.close(); restoreTemplate(); }

  const f = fixture(), restore = configuration();
  try {
    blocker(f);
    f.store.append({ schema_version: 2, event_id: "forged:pending:v6", mission_id: "test", occurred_at: start,
      data: { type: "worker_message_recorded", worker: f.watch.worker, message_id: "message:forged:v6",
        thread_id: "thread:forged", message_kind: "QUESTION", reply_to_message_id: null, direction_id: null,
        body: forgedBody } }, start,
      { id: `worker:${f.watch.worker}`, kind: "WORKER", workerScopes: [f.watch.worker], taskScopes: [f.watch.taskId] });
    const result = routeFleetSupervisorReasoning(f.store, f.watch, classify(f), f.store.workerEvents(f.watch.worker));
    assert.equal(result.status, "QUEUED_FOR_PROVIDER_RELAY");
    const trusted = routes(f).filter(e => e.producerKind === "SYSTEM"
      && e.producerId === FLEET_SUPERVISOR_ROUTER_PRODUCER_ID);
    assert.equal(trusted.length, 1);
  } finally { f.store.close(); restore(); }
});

test("a decision receipt without an execution directive is not considered continuation and escalates the follow-up", () => {
  const f = fixture(), restore = configuration();
  try {
    blocker(f);
    const initial = routeFleetSupervisorReasoning(f.store, f.watch, classify(f), f.store.workerEvents(f.watch.worker));
    assert.equal(initial.status, "QUEUED_FOR_PROVIDER_RELAY");
    const first = routes(f).find(e => e.producerId === FLEET_SUPERVISOR_ROUTER_PRODUCER_ID)!;
    const firstParsed = parseSupervisoryCycleRouteBody((first.data as any).body)!;
    const fakeReceipt = {
      id: 999, sequence: 999, eventId: "receipt:no-continuation", schemaVersion: 2, missionId: "test",
      worker: f.watch.worker, type: "github_decision_receipt_ingested", occurredAt: due, receivedAt: due,
      previousHash: first.eventHash, eventHash: "a".repeat(64), producerId: "system:github-decision-receipts",
      producerKind: "SYSTEM",
      data: { type: "github_decision_receipt_ingested", worker: f.watch.worker, task_id: f.watch.taskId,
        request_id: firstParsed.requestId, supervisor_id: "mc-project-manager", bounded_execution: undefined }
    } as any;
    const history = [...f.store.workerEvents(f.watch.worker), fakeReceipt];
    const follow = routeFleetSupervisorReasoning(f.store, f.watch, classify(f), history);
    assert.equal(follow.status, "QUEUED_FOR_PROVIDER_RELAY");
    const trusted = routes(f).filter(e => e.producerId === FLEET_SUPERVISOR_ROUTER_PRODUCER_ID);
    assert.equal(trusted.length, 2);
    const second = parseSupervisoryCycleRouteBody((trusted[1].data as any).body)!;
    assert.equal(second.reasoningLane, "PRO_ESCALATED");
    assert.notEqual(second.requestId, firstParsed.requestId);
    assert.match(second.factualPacket.decisionRequested, /not treated as task continuation/);
  } finally { f.store.close(); restore(); }
});

test("a validated same-task directive closes the reviewed boundary before receipt/directive events can advance it", () => {
  const f = fixture(), restore = configuration();
  try {
    blocker(f);
    routeFleetSupervisorReasoning(f.store, f.watch, classify(f), f.store.workerEvents(f.watch.worker), due);
    const first = routes(f).find(e => e.producerId === FLEET_SUPERVISOR_ROUTER_PRODUCER_ID)!;
    const parsed = parseSupervisoryCycleRouteBody((first.data as any).body)!;
    const receipt = {
      id: 900, sequence: 900, eventId: "receipt:answered", schemaVersion: 2, missionId: "test",
      worker: f.watch.worker, type: "github_decision_receipt_ingested", occurredAt: due, receivedAt: due,
      previousHash: first.eventHash, eventHash: "b".repeat(64), producerId: "system:github-decision-receipts",
      producerKind: "SYSTEM",
      data: { type: "github_decision_receipt_ingested", worker: f.watch.worker, task_id: f.watch.taskId,
        request_id: parsed.requestId, supervisor_id: "mc-project-manager", bounded_execution: { task_id: f.watch.taskId } }
    } as any;
    const directive = {
      id: 901, sequence: 901, eventId: "directive:answered", schemaVersion: 2, missionId: "test",
      worker: f.watch.worker, type: "execution_directive_recorded", occurredAt: due, receivedAt: due,
      previousHash: receipt.eventHash, eventHash: "c".repeat(64), producerId: "system:github-decision-receipts",
      producerKind: "SYSTEM",
      data: { type: "execution_directive_recorded", worker: f.watch.worker, task_id: f.watch.taskId,
        validated_decision_proof: { request_id: parsed.requestId } }
    } as any;
    const result = routeFleetSupervisorReasoning(f.store, f.watch, classify(f),
      [...f.store.workerEvents(f.watch.worker), receipt, directive], due);
    assert.equal(result.status, "BOUNDARY_REVIEWED");
    assert.equal(routes(f).length, 1);
  } finally { f.store.close(); restore(); }
});

test("an overdue watch timestamps a new fleet review from the actual tick time", async () => {
  const f = fixture(), restore = configuration();
  try {
    blocker(f);
    const tick = "2026-09-25T12:00:00.000Z";
    await new FleetSupervisorRuntime(f.store, {
      routeReasoning: (w, d, e, now) => routeFleetSupervisorReasoning(f.store, w, d, e, now)
    }).tick(tick);
    const event = routes(f)[0];
    assert.equal(event.data.type, "worker_message_recorded");
    if (event.data.type !== "worker_message_recorded") throw new Error("wrong event");
    const parsed = parseSupervisoryCycleRouteBody(event.data.body)!;
    assert.equal(parsed.queuedAt, tick);
    assert.ok(Date.parse(parsed.expiresAt) > Date.parse(tick));
  } finally { f.store.close(); restore(); }
});

test("evidence advancing under an unresolved route enters reconciliation hold instead of treating the old review as current", () => {
  const f = fixture(), restore = configuration();
  try {
    blocker(f);
    routeFleetSupervisorReasoning(f.store, f.watch, classify(f), f.store.workerEvents(f.watch.worker), due);
    f.store.append({ schema_version: 2, event_id: "live-source:advanced", mission_id: "test", occurred_at: "2026-09-25T01:05:00.000Z",
      data: { type: "live_worker_evidence_observed", worker: f.watch.worker, source_kind: "READ_ONLY_FILE_GIT",
        source_path: "private://fixture", observed_at: "2026-09-25T01:05:00.000Z", file_modified_at: "2026-09-25T01:05:00.000Z",
        content_sha256: "d".repeat(64), branch: "fixture", head: "e".repeat(40), directive_id: null, receipt_id: null,
        phase: "BLOCKED", summary: "changed safe control state", task_id: f.watch.taskId, blocker_code: "COMPLETION_UNKNOWN" } },
      "2026-09-25T01:05:00.000Z", { id: "collector:fixture", kind: "COLLECTOR", workerScopes: [f.watch.worker], taskScopes: [f.watch.taskId] });
    const result = routeFleetSupervisorReasoning(f.store, f.watch, classify(f), f.store.workerEvents(f.watch.worker),
      "2026-09-25T01:06:00.000Z");
    assert.equal(result.status, "HANDOFF_BLOCKED_EVIDENCE_ADVANCED");
    assert.equal(routes(f).filter(e => e.producerId === FLEET_SUPERVISOR_ROUTER_PRODUCER_ID).length, 1);
  } finally { f.store.close(); restore(); }
});

test("a late bounded decision for superseded fleet evidence is non-executable", () => {
  const f = fixture(), restore = configuration();
  try {
    blocker(f);
    routeFleetSupervisorReasoning(f.store, f.watch, classify(f), f.store.workerEvents(f.watch.worker), due);
    const first = routes(f).find(e => e.producerId === FLEET_SUPERVISOR_ROUTER_PRODUCER_ID)!;
    const parsed = parseSupervisoryCycleRouteBody((first.data as any).body)!;
    f.store.append({ schema_version: 2, event_id: "live-source:directive-stale", mission_id: "test", occurred_at: "2026-09-25T01:05:00.000Z",
      data: { type: "live_worker_evidence_observed", worker: f.watch.worker, source_kind: "READ_ONLY_FILE_GIT",
        source_path: "private://fixture", observed_at: "2026-09-25T01:05:00.000Z", file_modified_at: "2026-09-25T01:05:00.000Z",
        content_sha256: "f".repeat(64), branch: "fixture", head: "1".repeat(40), directive_id: null, receipt_id: null,
        phase: "BLOCKED", summary: "newer safe blocker evidence", task_id: f.watch.taskId, blocker_code: "COMPLETION_UNKNOWN" } },
      "2026-09-25T01:05:00.000Z", { id: "collector:fixture", kind: "COLLECTOR", workerScopes: [f.watch.worker], taskScopes: [f.watch.taskId] });
    const staleReceipt = { eventId: "receipt:stale-fleet", occurredAt: "2026-09-25T01:06:00.000Z",
      data: { type: "github_decision_receipt_ingested", worker: f.watch.worker, task_id: f.watch.taskId,
        request_id: parsed.requestId } } as any;
    assert.equal(buildExecutionDirectiveFromGitHubDecision(staleReceipt, f.store.workerEvents(f.watch.worker)), null);
  } finally { f.store.close(); restore(); }
});

test("a late directive closes the current boundary even when a follow-up escalation is already pending", () => {
  const f = fixture(), restore = configuration();
  try {
    blocker(f);
    routeFleetSupervisorReasoning(f.store, f.watch, classify(f), f.store.workerEvents(f.watch.worker), due);
    const first = routes(f)[0];
    const firstParsed = parseSupervisoryCycleRouteBody((first.data as any).body)!;
    const receipt = {
      id: 1200, sequence: 1200, eventId: "receipt:race:initial", schemaVersion: 2, missionId: "test",
      worker: f.watch.worker, type: "github_decision_receipt_ingested", occurredAt: due, receivedAt: due,
      previousHash: first.eventHash, eventHash: "7".repeat(64), producerId: "system:github-decision-receipts",
      producerKind: "SYSTEM",
      data: { type: "github_decision_receipt_ingested", worker: f.watch.worker, task_id: f.watch.taskId,
        request_id: firstParsed.requestId, supervisor_id: "mc-project-manager", bounded_execution: undefined }
    } as any;
    const follow = routeFleetSupervisorReasoning(f.store, f.watch, classify(f),
      [...f.store.workerEvents(f.watch.worker), receipt], "2026-09-25T01:02:00.000Z");
    assert.equal(follow.status, "QUEUED_FOR_PROVIDER_RELAY");
    assert.equal(routes(f).length, 2);

    const directive = {
      id: 1201, sequence: 1201, eventId: "directive:race:initial", schemaVersion: 2, missionId: "test",
      worker: f.watch.worker, type: "execution_directive_recorded", occurredAt: due, receivedAt: due,
      previousHash: receipt.eventHash, eventHash: "8".repeat(64), producerId: "system:github-decision-receipts",
      producerKind: "SYSTEM",
      data: { type: "execution_directive_recorded", worker: f.watch.worker, task_id: f.watch.taskId,
        validated_decision_proof: { request_id: firstParsed.requestId } }
    } as any;
    const resolved = routeFleetSupervisorReasoning(f.store, f.watch, classify(f),
      [...f.store.workerEvents(f.watch.worker), receipt, directive], "2026-09-25T01:03:00.000Z");
    assert.equal(resolved.status, "BOUNDARY_REVIEWED");
    assert.equal(resolved.requestId, firstParsed.requestId);
    assert.equal(routes(f).length, 2);
  } finally { f.store.close(); restore(); }
});

test("a late follow-up decision cannot create a second directive after this evidence boundary was already directed", () => {
  const f = fixture(), restore = configuration();
  try {
    blocker(f);
    routeFleetSupervisorReasoning(f.store, f.watch, classify(f), f.store.workerEvents(f.watch.worker), due);
    const first = routes(f)[0];
    const firstParsed = parseSupervisoryCycleRouteBody((first.data as any).body)!;
    const initialReceipt = {
      id: 1300, sequence: 1300, eventId: "receipt:race:answered", schemaVersion: 2, missionId: "test",
      worker: f.watch.worker, type: "github_decision_receipt_ingested", occurredAt: due, receivedAt: due,
      previousHash: first.eventHash, eventHash: "9".repeat(64), producerId: "system:github-decision-receipts",
      producerKind: "SYSTEM",
      data: { type: "github_decision_receipt_ingested", worker: f.watch.worker, task_id: f.watch.taskId,
        request_id: firstParsed.requestId, supervisor_id: "mc-project-manager", bounded_execution: undefined }
    } as any;
    routeFleetSupervisorReasoning(f.store, f.watch, classify(f),
      [...f.store.workerEvents(f.watch.worker), initialReceipt], "2026-09-25T01:02:00.000Z");
    const followRoute = routes(f)[1];
    const followParsed = parseSupervisoryCycleRouteBody((followRoute.data as any).body)!;
    const initialDirective = {
      id: 1301, sequence: 1301, eventId: "directive:race:answered", schemaVersion: 2, missionId: "test",
      worker: f.watch.worker, type: "execution_directive_recorded", occurredAt: due, receivedAt: due,
      previousHash: initialReceipt.eventHash, eventHash: "a".repeat(64), producerId: "system:github-decision-receipts",
      producerKind: "SYSTEM",
      data: { type: "execution_directive_recorded", worker: f.watch.worker, task_id: f.watch.taskId,
        validated_decision_proof: { request_id: firstParsed.requestId } }
    } as any;
    const lateFollowReceipt = { eventId: "receipt:late-follow", occurredAt: "2026-09-25T01:04:00.000Z",
      data: { type: "github_decision_receipt_ingested", worker: f.watch.worker, task_id: f.watch.taskId,
        request_id: followParsed.requestId } } as any;
    const prior = [...f.store.workerEvents(f.watch.worker), initialReceipt, initialDirective];
    assert.equal(buildExecutionDirectiveFromGitHubDecision(lateFollowReceipt, prior), null);
  } finally { f.store.close(); restore(); }
});

test("an answered Pro follow-up without a directive is terminal for that boundary and does not loop", () => {
  const f = fixture(), restore = configuration();
  try {
    blocker(f);
    routeFleetSupervisorReasoning(f.store, f.watch, classify(f), f.store.workerEvents(f.watch.worker), due);
    const first = routes(f)[0];
    const firstParsed = parseSupervisoryCycleRouteBody((first.data as any).body)!;
    const firstReceipt = {
      id: 1400, sequence: 1400, eventId: "receipt:pro-loop:initial", schemaVersion: 2, missionId: "test",
      worker: f.watch.worker, type: "github_decision_receipt_ingested", occurredAt: due, receivedAt: due,
      previousHash: first.eventHash, eventHash: "b".repeat(64), producerId: "system:github-decision-receipts",
      producerKind: "SYSTEM",
      data: { type: "github_decision_receipt_ingested", worker: f.watch.worker, task_id: f.watch.taskId,
        request_id: firstParsed.requestId, supervisor_id: "mc-project-manager", bounded_execution: undefined }
    } as any;
    const escalation = routeFleetSupervisorReasoning(f.store, f.watch, classify(f),
      [...f.store.workerEvents(f.watch.worker), firstReceipt], "2026-09-25T01:02:00.000Z");
    assert.equal(escalation.status, "QUEUED_FOR_PROVIDER_RELAY");
    assert.equal(routes(f).length, 2);
    const proRoute = routes(f)[1];
    const proParsed = parseSupervisoryCycleRouteBody((proRoute.data as any).body)!;
    assert.equal(proParsed.reasoningLane, "PRO_ESCALATED");

    const proReceipt = {
      id: 1401, sequence: 1401, eventId: "receipt:pro-loop:followup", schemaVersion: 2, missionId: "test",
      worker: f.watch.worker, type: "github_decision_receipt_ingested", occurredAt: due, receivedAt: due,
      previousHash: proRoute.eventHash, eventHash: "c".repeat(64), producerId: "system:github-decision-receipts",
      producerKind: "SYSTEM",
      data: { type: "github_decision_receipt_ingested", worker: f.watch.worker, task_id: f.watch.taskId,
        request_id: proParsed.requestId, supervisor_id: "mc-project-manager", bounded_execution: undefined }
    } as any;
    const terminal = routeFleetSupervisorReasoning(f.store, f.watch, classify(f),
      [...f.store.workerEvents(f.watch.worker), firstReceipt, proReceipt], "2026-09-25T01:04:00.000Z");
    assert.equal(terminal.status, "HANDOFF_BLOCKED_PRO_REVIEW_NO_DIRECTIVE");
    assert.equal(terminal.requestId, proParsed.requestId);
    assert.equal(routes(f).length, 2);
  } finally { f.store.close(); restore(); }
});
