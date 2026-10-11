import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OwnerTaskCard } from "../components/Dashboard";
import { parseInternalRoutePacket, pendingRoute, workflowState } from "../components/SupervisionConsole";
import { SupervisionHealthLine, SupervisorActivityPanel, supervisorStatusLine } from "../components/SupervisorActivity";
import { LATEST_CHAT_LABEL, supervisorChatView } from "../components/SupervisorLink";
import { snapshotFromStore } from "../lib/dashboard-data";
import type { OperatorStatusProjection } from "../lib/operator-status-contract";
import type { StoredEvent } from "../lib/schema";
import { seedIssue47Store } from "../lib/seed";
import { snapshotForTimeline } from "../lib/snapshot-response";
import { EventStore } from "../lib/store";
import { latestSupervisorConversation, supervisorActivity } from "../lib/supervisor-activity";

const WORKER = "auth";
const NOW = new Date("2026-10-11T12:00:00Z");
let sequence = 0;

function stored(data: Record<string, unknown>, at: string, producer: { id: string; kind: string } = { id: `worker:${WORKER}`, kind: "WORKER" }): StoredEvent {
  sequence += 1;
  return {
    id: sequence, sequence, eventId: `event-${sequence}`, schemaVersion: 2, missionId: "mission-control-live", worker: WORKER,
    type: data.type as StoredEvent["type"], occurredAt: at, receivedAt: at, previousHash: null, eventHash: `hash-${sequence}`,
    producerId: producer.id, producerKind: producer.kind, data: { worker: WORKER, ...data } as unknown as StoredEvent["data"],
  };
}

function route(requestId: string, at: string, options: { expiresAt?: string; question?: string; supersedes?: string; version?: number } = {}) {
  const version = options.version ?? 6;
  return stored({
    type: "worker_message_recorded", message_id: `message:${requestId}`, thread_id: `thread:fleet-supervision:${WORKER}`,
    message_kind: "QUESTION", reply_to_message_id: null, direction_id: null,
    body: `MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V${version}\n${JSON.stringify({
      schemaVersion: version, packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE", requestId, worker: WORKER, actionBlockedOrRouted: "ROUTE_INTERNAL_SUPERVISOR",
      destination: "PROJECT_MANAGER_CHAT", destinationSupervisorId: "mc-project-manager",
      providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY",
      factualPacket: { taskId: "task-auth", exactFactualState: "{}", decisionRequested: options.question ?? "Review the current state." },
      queuedAt: at, expiresAt: options.expiresAt ?? "2026-10-12T12:00:00Z",
      ...(options.supersedes ? { supersedesRequestId: options.supersedes } : {}),
    })}`,
  }, at);
}

const relay = { id: "collector:relay-primary", kind: "COLLECTOR" };
function transport(requestId: string, at: string, refs: string[], producer = relay, extra: Record<string, unknown> = {}) {
  return stored({
    type: "evidence_receipt_recorded", receipt_id: `receipt:${requestId}:${at}`, producer_id: producer.id, producer_role: producer.kind,
    evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: null,
    summary: "MISSION_CONTROL_RELAY_STAGE_V1", refs: [`request:${requestId}`, ...refs], verified: true, changed_path_manifest: null, ...extra,
  }, at, producer);
}

function decision(requestId: string, at: string, extra: Record<string, unknown> = {}) {
  return stored({
    type: "github_decision_receipt_ingested", task_id: "task-auth", receipt_id: `receipt:${requestId}`, request_id: requestId,
    decision_block: { decision_id: "decision-1", exact_text: "CONTINUE: run the migration tests next.", sha256: "a".repeat(64) },
    ingested_at: at, ...extra,
  }, at, { id: "system:github-decision-receipts", kind: "SYSTEM" });
}

test("a supervisor question moves from queued to sent, finished and answered, with the chat where it ran", () => {
  const events = [route("fleet-review:1", "2026-10-11T10:00:00Z", { question: "Is the auth task on track?" })];
  let activity = supervisorActivity(events, NOW);
  assert.equal(activity.total, 1);
  assert.equal(activity.requests[0].state, "QUEUED");
  assert.equal(activity.requests[0].origin, "ROUTINE_CHECK");
  assert.equal(activity.requests[0].question, "Is the auth task on track?");
  assert.equal(activity.requests[0].supervisorId, "mc-project-manager");
  assert.match(supervisorStatusLine(activity, NOW), /^Asked 2 hours ago; waiting to be sent\.$/);

  events.push(transport("fleet-review:1", "2026-10-11T10:05:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/WEB:provisional"]));
  activity = supervisorActivity(events, NOW);
  assert.equal(activity.requests[0].state, "SENT");
  assert.equal(activity.requests[0].sentAt, "2026-10-11T10:05:00Z");
  assert.equal(latestSupervisorConversation(activity), "https://chatgpt.com/c/WEB:provisional");

  events.push(transport("fleet-review:1", "2026-10-11T10:20:00Z", ["lifecycle_status:COMPLETE", "conversation_url:https://chatgpt.com/c/real-123"]));
  activity = supervisorActivity(events, NOW);
  assert.equal(activity.requests[0].state, "FINISHED");
  assert.equal(latestSupervisorConversation(activity), "https://chatgpt.com/c/real-123", "the real address wins over the provisional one");
  events.push(transport("fleet-review:1", "2026-10-11T10:21:00Z", ["generation_state:COMPLETE", "conversation_url:https://chatgpt.com/c/WEB:provisional"]));
  assert.equal(latestSupervisorConversation(supervisorActivity(events, NOW)), "https://chatgpt.com/c/real-123", "and stays ahead of a later provisional one");

  events.push(decision("fleet-review:1", "2026-10-11T10:30:00Z", { bounded_execution: { reasoning_summary: "The task is on track; run the migration tests next." } }));
  activity = supervisorActivity(events, NOW);
  assert.equal(activity.requests[0].state, "ANSWERED");
  assert.equal(activity.requests[0].answer, "The task is on track; run the migration tests next.");
  assert.equal(activity.answered, 1);
  assert.equal(activity.lastAnsweredAt, "2026-10-11T10:30:00Z");
  assert.equal(supervisorStatusLine(activity, NOW), "Answered 1 hour ago: The task is on track; run the migration tests next.");
});

test("only the relay's verified evidence counts as sent, and only a ChatGPT conversation is offered as the chat", () => {
  const events = [
    route("fleet-review:2", "2026-10-11T10:00:00Z"),
    transport("fleet-review:2", "2026-10-11T10:01:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/claimed"], { id: `worker:${WORKER}`, kind: "WORKER" }),
    transport("fleet-review:2", "2026-10-11T10:02:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/unverified"], relay, { verified: false }),
    transport("fleet-review:2", "2026-10-11T10:03:00Z", ["conversation_url:https://example.org/c/elsewhere"]),
    transport("fleet-review:2", "2026-10-11T10:04:00Z", ["conversation_url:https://chatgpt.com/"]),
  ];
  const activity = supervisorActivity(events, NOW);
  assert.equal(activity.requests[0].state, "QUEUED");
  assert.equal(activity.requests[0].conversationUrl, null);
  assert.equal(latestSupervisorConversation(activity), null);
});

test("expired, withdrawn and replaced questions say so", () => {
  const events = [
    route("fleet-review:old", "2026-10-09T09:00:00Z", { expiresAt: "2026-10-10T09:00:00Z" }),
    route("fleet-review:silent", "2026-10-10T09:00:00Z", { expiresAt: "2026-10-11T09:00:00Z" }),
    transport("fleet-review:silent", "2026-10-10T09:10:00Z", ["generation_state:STARTED"]),
    route("fleet-review:withdrawn", "2026-10-11T08:00:00Z"),
    stored({
      type: "evidence_receipt_recorded", receipt_id: "retired", producer_id: "verifier:fleet-supervisor-request-retirement",
      producer_role: "VERIFIER", evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT",
      exact_candidate_sha256: null, summary: "MISSION_CONTROL_SUPERVISORY_REQUEST_RETIRED_UNSENT_V1",
      refs: ["request:fleet-review:withdrawn", "lifecycle_status:RETIRED_UNSENT"], verified: true, changed_path_manifest: null,
    }, "2026-10-11T08:30:00Z", { id: "verifier:fleet-supervisor-request-retirement", kind: "VERIFIER" }),
    route("fleet-review:claimed-withdrawn", "2026-10-11T08:40:00Z"),
    stored({
      type: "evidence_receipt_recorded", receipt_id: "fake-retired", producer_id: `worker:${WORKER}`,
      producer_role: "WORKER", evidence_class: "ARTIFACT", independence: "WORKER_REPORTED", freshness: "CURRENT",
      exact_candidate_sha256: null, summary: "MISSION_CONTROL_SUPERVISORY_REQUEST_RETIRED_UNSENT_V1",
      refs: ["request:fleet-review:claimed-withdrawn", "lifecycle_status:RETIRED_UNSENT"], verified: true, changed_path_manifest: null,
    }, "2026-10-11T08:41:00Z"),
    route("fleet-review:first", "2026-10-11T09:00:00Z"),
    route("fleet-review:second", "2026-10-11T09:30:00Z", { supersedes: "fleet-review:first" }),
  ];
  const states = Object.fromEntries(supervisorActivity(events, NOW).requests.map((request) => [request.requestId, request.state]));
  assert.deepEqual(states, {
    "fleet-review:second": "QUEUED",
    "fleet-review:first": "REPLACED",
    "fleet-review:claimed-withdrawn": "QUEUED",
    "fleet-review:withdrawn": "WITHDRAWN",
    "fleet-review:silent": "NO_ANSWER",
  });
  const all = supervisorActivity(events, NOW);
  assert.equal(all.total, 6);
  assert.equal(all.requests.length, 5, "newest five");
  const expired = supervisorActivity(events.slice(0, 1), NOW);
  assert.equal(expired.requests[0].state, "EXPIRED_UNSENT");
  assert.equal(supervisorStatusLine(expired, NOW), "Asked 2 days ago; never sent, and it expired 27 hours ago.");
});

test("an answer that asks the owner to decide is shown as such, and other routes are labelled by where they came from", () => {
  const events = [
    route("work-question:abc", "2026-10-11T10:00:00Z", { question: "Which schema should the import use?" }),
    decision("work-question:abc", "2026-10-11T10:40:00Z", { owner_action: { kind: "DECISION_REQUIRED", question: "Keep the old rows?" } }),
    route("work-owner-continuation:def", "2026-10-11T11:00:00Z"),
    route("post-work-review:ghi", "2026-10-11T11:10:00Z"),
  ];
  const requests = supervisorActivity(events, NOW).requests;
  assert.deepEqual(requests.map((request) => request.origin), ["AFTER_WORK", "OWNER_ANSWER", "WORK_QUESTION"]);
  assert.equal(requests[2].answer, "Asks you to decide: Keep the old rows?");
  assert.deepEqual(supervisorActivity([...events].reverse(), NOW), supervisorActivity(events, NOW), "a newest-first timeline gives the same answer");
  assert.equal(supervisorActivity([], NOW).total, 0);
  assert.equal(supervisorStatusLine(supervisorActivity([], NOW), NOW), "Not asked anything yet.");
  assert.equal(supervisorStatusLine(undefined, NOW), "Not asked anything yet.");
});

test("the worker page lists the questions with their chats, and the button opens the latest chat", () => {
  const events = [
    route("fleet-review:1", "2026-10-11T10:00:00Z", { question: "Is the auth task on track?" }),
    transport("fleet-review:1", "2026-10-11T10:05:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/real-123"]),
    decision("fleet-review:1", "2026-10-11T10:30:00Z", { bounded_execution: { reasoning_summary: "On track." } }),
  ];
  const activity = supervisorActivity(events, NOW);
  const html = renderToStaticMarkup(createElement(SupervisorActivityPanel, { activity, now: NOW }));
  assert.match(html, /What its supervisor is doing/);
  assert.match(html, /1 question so far, 1 answered, the last 1 hour ago/);
  assert.match(html, /Mission Control(?:&#x27;|')s routine check/);
  assert.match(html, /Is the auth task on track\?/);
  assert.match(html, /href="https:\/\/chatgpt\.com\/c\/real-123"[^>]*>.*Open this chat/);
  assert.match(renderToStaticMarkup(createElement(SupervisorActivityPanel, { activity: undefined, now: NOW })), /hasn(?:&#x27;|')t been asked anything yet/);
  const props = { url: "https://chatgpt.com/c/recorded", label: "Open supervisor chat", placeholder: false, workerId: WORKER, activityUrl: latestSupervisorConversation(activity) };
  assert.deepEqual(supervisorChatView(props, { state: "checking" }), { kind: "link", href: "https://chatgpt.com/c/real-123", label: LATEST_CHAT_LABEL });
  assert.deepEqual(supervisorChatView({ ...props, activityUrl: "https://chatgpt.com/" }, { state: "checking" }),
    { kind: "link", href: "https://chatgpt.com/c/recorded", label: "Open supervisor chat" }, "a home page is never the latest chat");
});

test("the task card says what its supervisor was last asked, and links to that chat", () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const worker = snapshotFromStore(store).workers.find((candidate) => candidate.id === "mission-control-live-slice")!;
    assert.deepEqual(worker.supervisorActivity, { requests: [], total: 0, answered: 0, lastAnsweredAt: null }, "every projected task carries its activity");
    const recent = snapshotForTimeline(snapshotFromStore(store), "recent").workers.find((candidate) => candidate.id === worker.id)!;
    assert.deepEqual(recent.supervisorActivity, worker.supervisorActivity, "the dashboard's trimmed snapshot keeps it");
    const empty = renderToStaticMarkup(createElement(OwnerTaskCard, { worker }));
    assert.match(empty, /<dt>Supervisor<\/dt><dd>Not asked anything yet\.<\/dd>/);
    const activity = supervisorActivity([
      route("fleet-review:1", "2026-10-11T10:00:00Z"),
      transport("fleet-review:1", "2026-10-11T10:05:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/real-123"]),
    ], NOW);
    const busy = renderToStaticMarkup(createElement(OwnerTaskCard, { worker: { ...worker, supervisorActivity: activity } }));
    assert.match(busy, /<dt>Supervisor<\/dt><dd>Asked [^<]*; sent [^<]*, working on it\.<\/dd>/);
    assert.match(busy, /href="https:\/\/chatgpt\.com\/c\/real-123"[^>]*>.*Open its latest supervisor chat/);
    const older = { ...worker } as Partial<typeof worker>;
    delete older.supervisorActivity;
    assert.match(renderToStaticMarkup(createElement(OwnerTaskCard, { worker: older as typeof worker })), /Not asked anything yet/, "a snapshot from an older build still renders");
  } finally { store.close(); }
});

function operatorStatus(patch: Partial<OperatorStatusProjection>): OperatorStatusProjection {
  return {
    checkedAt: NOW.toISOString(), overallState: "HEALTHY", providerRelayState: "HEALTHY", activeHostLabel: "primary",
    authority: { state: "HEALTHY", writer: "MISSION_CONTROL_SINGLE_WRITER", schedulerState: "RUNNING", activeLeaseRole: "PRIMARY", epoch: 1, queueDepth: 0, ledgerIntegrity: "VALID" },
    pacing: { lastProviderSendBoundaryAt: "2026-10-11T11:00:00Z", configuredMinimumIntervalMs: 60_000, minimumObservedIntervalMs: 60_000, recentIntervalsMs: [], violationsBelowConfiguredMinimum: 0, rateLimitState: "CLEAR", cooldownRemainingMs: null },
    hosts: [], supervisors: [manager], ...patch,
  };
}
const manager = { supervisorId: "mc-project-manager", registrationState: "ACTIVE" as const, scope: "PROJECT_MANAGER" as const, registered: true,
  reachable: true, sourceBound: true, latestRouteState: "NONE", latestReasoningAt: null, verifiedReasoningMessages: 0 };

test("the first screen says whether supervision is running and when the last question went out", () => {
  assert.equal(renderToStaticMarkup(createElement(SupervisionHealthLine, { status: null, now: NOW })), "");
  const running = renderToStaticMarkup(createElement(SupervisionHealthLine, { status: operatorStatus({}), now: NOW }));
  assert.match(running, /Supervisor chats can be reached: the relay to ChatGPT is up\. The last question went to ChatGPT 1 hour ago\./);
  const down = renderToStaticMarkup(createElement(SupervisionHealthLine, { now: NOW, status: operatorStatus({
    overallState: "DEGRADED", providerRelayState: "UNAVAILABLE",
    pacing: { ...operatorStatus({}).pacing, lastProviderSendBoundaryAt: "2026-10-08T12:00:00Z" },
    hosts: [{ label: "relay-a", role: "PRIMARY", active: true, reportFresh: false, relayWorkerState: "UNAVAILABLE", browserState: "UNAVAILABLE", authorityBindingState: "UNAVAILABLE", ownedTargetCount: 0, observedAt: "2026-10-08T12:00:00Z", detail: "" }],
  }) }));
  assert.match(down, /role="alert"/);
  assert.match(down, /Supervisor chats can(?:&#x27;|')t be reached right now/);
  assert.match(down, /is unavailable, so questions wait until it(?:&#x27;|')s back\. The last question went to ChatGPT 3 days ago\./);
  assert.match(down, /relay-a: relay unavailable, browser unavailable, no fresh report/);
  const never = renderToStaticMarkup(createElement(SupervisionHealthLine, { now: NOW, status: operatorStatus({ providerRelayState: "DEGRADED", pacing: { ...operatorStatus({}).pacing, lastProviderSendBoundaryAt: null } }) }));
  assert.match(never, /is degraded[^<]*Nothing has been sent to ChatGPT yet\./);
  assert.match(never, /no relay host has reported/);
  assert.doesNotMatch(never, /Project Manager/, "no manager warning while a manager is set up");
  const noManager = renderToStaticMarkup(createElement(SupervisionHealthLine, { now: NOW, status: operatorStatus({ supervisors: [] }) }));
  assert.match(noManager, /Routine supervisor checks can(?:&#x27;|')t run\./);
  assert.match(noManager, /No Project Manager supervisor chat is set up/);
  assert.doesNotMatch(noManager, /can be reached/);
  const provisioning = renderToStaticMarkup(createElement(SupervisionHealthLine, { now: NOW, status: operatorStatus({ supervisors: [{ ...manager, registrationState: "PROVISIONING" }] }) }));
  assert.match(provisioning, /hasn(?:&#x27;|')t been created yet/);
  const downWithoutManager = renderToStaticMarkup(createElement(SupervisionHealthLine, { now: NOW, status: operatorStatus({ providerRelayState: "UNAVAILABLE", supervisors: [] }) }));
  assert.match(downWithoutManager, /can(?:&#x27;|')t be reached right now/);
  assert.match(downWithoutManager, /No Project Manager supervisor chat is set up/);
});

test("the supervision page reads current (V5/V6) questions and stops waiting once they are answered or expired", () => {
  const queued = route("fleet-review:page", "2026-10-11T10:00:00Z");
  const body = (queued.data as { body: string }).body;
  const packet = parseInternalRoutePacket(body);
  assert.equal(packet?.requestId, "fleet-review:page");
  assert.equal(packet?.destinationSupervisorId, "mc-project-manager");
  assert.equal(parseInternalRoutePacket(body.replace("CYCLE_V6", "CYCLE_V5"))?.requestId, "fleet-review:page");
  const [pending] = supervisorActivity([queued], NOW).requests;
  assert.equal(pendingRoute({ request: pending }), true);
  const [answered] = supervisorActivity([queued, decision("fleet-review:page", "2026-10-11T11:00:00Z")], NOW).requests;
  assert.equal(pendingRoute({ request: answered }), false);
  assert.equal(pendingRoute({ request: null }), false);
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const worker = snapshotFromStore(store).workers.find((candidate) => candidate.id === "mission-control-live-slice")!;
    const idle = { ...worker, status: "working" as const, correction: { ...worker.correction, ownerActionType: "NONE" as const },
      executionSupervision: { ...worker.executionSupervision, pendingReasoningReview: false } };
    assert.equal(workflowState(idle, true), "WAITING FOR SUPERVISOR");
    assert.notEqual(workflowState(idle, false), "WAITING FOR SUPERVISOR");
  } finally { store.close(); }
});
