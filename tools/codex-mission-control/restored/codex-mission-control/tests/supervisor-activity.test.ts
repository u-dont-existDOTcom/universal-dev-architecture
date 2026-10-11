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
import { projectWorker } from "../lib/projection";
import { latestSupervisorConversation, supervisorActivity, type SupervisorRequestAdmission } from "../lib/supervisor-activity";
import { validOperatorSnapshot, validTaskSnapshot } from "../lib/owner-view";

const WORKER = "auth";
const RELAYS: ReadonlySet<string> = new Set(["collector:relay-primary"]);
/** Admits every question in these events (as Mission Control's parser does for well-formed packets) and trusts the relay. */
function admitAll(events: StoredEvent[], replaced: string[] = []): SupervisorRequestAdmission {
  const admitted = events.flatMap((event) => {
    if (event.data.type !== "worker_message_recorded") return [];
    const body = (event.data as { body: string }).body;
    try { return [String(JSON.parse(body.slice(body.indexOf("\n") + 1)).requestId)]; } catch { return []; }
  });
  return { admitted: new Set(admitted), replaced: new Set(replaced), trustedRelays: RELAYS };
}
function activityOf(events: StoredEvent[], replaced: string[] = []) {
  return supervisorActivity(events, NOW, admitAll(events, replaced));
}
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

function route(requestId: string, at: string, options: { expiresAt?: string; question?: string; supersedes?: string; version?: number; worker?: string; patch?: Record<string, unknown> } = {}) {
  const version = options.version ?? 6;
  return stored({
    type: "worker_message_recorded", message_id: `message:${requestId}`, thread_id: `thread:fleet-supervision:${WORKER}`,
    message_kind: "QUESTION", reply_to_message_id: null, direction_id: null,
    body: `MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V${version}\n${JSON.stringify({
      schemaVersion: version, packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE", requestId, worker: WORKER, actionBlockedOrRouted: "ROUTE_INTERNAL_SUPERVISOR",
      destination: "PROJECT_MANAGER_CHAT", destinationSupervisorId: "mc-project-manager",
      providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY",
      factualPacket: { taskId: "task-auth", exactFactualState: "{}", evidenceRefs: [], decisionRequested: options.question ?? "Review the current state." },
      queuedAt: at, expiresAt: options.expiresAt ?? "2026-10-12T12:00:00Z",
      reasoningLane: "EXTRA_HIGH_DIRECT", nonce: `nonce:${requestId}`,
      evidenceCapsule: { id: `capsule:${requestId}`, sha256: "b".repeat(64) },
      ownerOutcome: { id: "outcome-auth", epoch: 1, sha256: "c".repeat(64) },
      githubReceipt: { repository: "owner/receipts", issueNumber: 1, stageIssueNumber: 2 },
      ...(options.supersedes ? { supersedesRequestId: options.supersedes } : {}),
      ...(options.worker ? { worker: options.worker } : {}),
      ...options.patch,
    })}`,
  }, at);
}

const relay = { id: "collector:relay-primary", kind: "COLLECTOR" };
function transport(requestId: string, at: string, refs: string[], producer = relay, extra: Record<string, unknown> = {}) {
  return stored({
    type: "evidence_receipt_recorded", receipt_id: `receipt:${requestId}:${at}`, producer_id: producer.id, producer_role: producer.kind,
    evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: null,
    summary: "MISSION_CONTROL_RELAY_STAGE_V1", refs: [`request:${requestId}`, "supervisor:mc-project-manager", ...refs], verified: true, changed_path_manifest: null, ...extra,
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
  let activity = activityOf(events);
  assert.equal(activity.total, 1);
  assert.equal(activity.requests[0].state, "QUEUED");
  assert.equal(activity.requests[0].origin, "ROUTINE_CHECK");
  assert.equal(activity.requests[0].question, "Is the auth task on track?");
  assert.equal(activity.requests[0].supervisorId, "mc-project-manager");
  assert.match(supervisorStatusLine(activity, NOW), /^Asked 2 hours ago; waiting to be sent\.$/);

  events.push(transport("fleet-review:1", "2026-10-11T10:05:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/WEB:provisional"]));
  activity = activityOf(events);
  assert.equal(activity.requests[0].state, "SENT");
  assert.equal(activity.requests[0].sentAt, "2026-10-11T10:05:00Z");
  assert.equal(latestSupervisorConversation(activity), "https://chatgpt.com/c/WEB:provisional");

  events.push(transport("fleet-review:1", "2026-10-11T10:20:00Z", ["lifecycle_status:COMPLETE", "conversation_url:https://chatgpt.com/c/real-123"]));
  activity = activityOf(events);
  assert.equal(activity.requests[0].state, "FINISHED");
  assert.equal(latestSupervisorConversation(activity), "https://chatgpt.com/c/real-123", "the real address wins over the provisional one");
  events.push(transport("fleet-review:1", "2026-10-11T10:21:00Z", ["generation_state:COMPLETE", "conversation_url:https://chatgpt.com/c/WEB:provisional"]));
  assert.equal(latestSupervisorConversation(activityOf(events)), "https://chatgpt.com/c/real-123", "and stays ahead of a later provisional one");

  events.push(decision("fleet-review:1", "2026-10-11T10:30:00Z", { bounded_execution: { reasoning_summary: "The task is on track; run the migration tests next." } }));
  activity = activityOf(events);
  assert.equal(activity.requests[0].state, "ANSWERED");
  assert.equal(activity.requests[0].answer, "The task is on track; run the migration tests next.");
  assert.equal(activity.answered, 1);
  assert.equal(activity.lastAnsweredAt, "2026-10-11T10:30:00Z");
  assert.equal(supervisorStatusLine(activity, NOW), "Answered 1 hour ago: The task is on track; run the migration tests next.");
});

test("only the policy's relay collectors count as sent, for this supervisor after queueing, and only a ChatGPT conversation is offered", () => {
  const events = [
    route("fleet-review:2", "2026-10-11T10:00:00Z"),
    transport("fleet-review:2", "2026-10-11T10:01:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/claimed"], { id: `worker:${WORKER}`, kind: "WORKER" }),
    transport("fleet-review:2", "2026-10-11T10:02:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/unverified"], relay, { verified: false }),
    transport("fleet-review:2", "2026-10-11T10:03:00Z", ["conversation_url:https://example.org/c/elsewhere"]),
    transport("fleet-review:2", "2026-10-11T10:04:00Z", ["conversation_url:https://chatgpt.com/"]),
    transport("fleet-review:2", "2026-10-11T10:05:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/other-collector"], { id: "collector:somebody-else", kind: "COLLECTOR" }),
    transport("fleet-review:2", "2026-10-11T10:06:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/other-summary"], relay, { summary: "MISSION_CONTROL_SOMETHING_ELSE_V1" }),
    transport("fleet-review:2", "2026-10-11T09:59:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/before-queued"]),
    stored({ type: "evidence_receipt_recorded", receipt_id: "wrong-supervisor", producer_id: relay.id, producer_role: "COLLECTOR",
      evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: null,
      summary: "MISSION_CONTROL_RELAY_STAGE_V1", refs: ["request:fleet-review:2", "supervisor:someone-else", "generation_state:STARTED",
        "conversation_url:https://chatgpt.com/c/wrong-supervisor"], verified: true, changed_path_manifest: null }, "2026-10-11T10:07:00Z", relay),
  ];
  const activity = activityOf(events);
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
  // Mission Control's admission says "second" validly replaced "first" (see the projection test for the rule itself).
  const states = Object.fromEntries(activityOf(events, ["fleet-review:first"]).requests.map((request) => [request.requestId, request.state]));
  assert.deepEqual(states, {
    "fleet-review:second": "QUEUED",
    "fleet-review:first": "REPLACED",
    "fleet-review:claimed-withdrawn": "QUEUED",
    "fleet-review:withdrawn": "WITHDRAWN",
    "fleet-review:silent": "NO_ANSWER",
  });
  const all = activityOf(events, ["fleet-review:first"]);
  assert.equal(all.total, 6);
  assert.equal(all.requests.length, 5, "newest five");
  const expired = activityOf(events.slice(0, 1));
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
  const requests = activityOf(events).requests;
  assert.deepEqual(requests.map((request) => request.origin), ["AFTER_WORK", "OWNER_ANSWER", "WORK_QUESTION"]);
  assert.equal(requests[2].answer, "Asks you to decide: Keep the old rows?");
  assert.deepEqual(activityOf([...events].reverse()), activityOf(events), "a newest-first timeline gives the same answer");
  assert.equal(activityOf([]).total, 0);
  assert.equal(supervisorStatusLine(activityOf([]), NOW), "Not asked anything yet.");
  assert.equal(supervisorStatusLine(undefined, NOW), "Not asked anything yet.");
});

test("the worker page lists the questions with their chats, and the button opens the latest chat", () => {
  const events = [
    route("fleet-review:1", "2026-10-11T10:00:00Z", { question: "Is the auth task on track?" }),
    transport("fleet-review:1", "2026-10-11T10:05:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/real-123"]),
    decision("fleet-review:1", "2026-10-11T10:30:00Z", { bounded_execution: { reasoning_summary: "On track." } }),
  ];
  const activity = activityOf(events);
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
    assert.deepEqual(worker.supervisorActivity, { requests: [], total: 0, answered: 0, lastAnsweredAt: null, latestConversationUrl: null, states: {} }, "every projected task carries its activity");
    const recent = snapshotForTimeline(snapshotFromStore(store), "recent").workers.find((candidate) => candidate.id === worker.id)!;
    assert.deepEqual(recent.supervisorActivity, worker.supervisorActivity, "the dashboard's trimmed snapshot keeps it");
    const empty = renderToStaticMarkup(createElement(OwnerTaskCard, { worker }));
    assert.match(empty, /<dt>Supervisor<\/dt><dd>Not asked anything yet\.<\/dd>/);
    const activity = activityOf([
      route("fleet-review:1", "2026-10-11T10:00:00Z"),
      transport("fleet-review:1", "2026-10-11T10:05:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/real-123"]),
    ]);
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
  assert.match(running, /Supervisor chats can be reached: the relay to ChatGPT is up and the Project Manager supervisor has been reached\. The last question went to ChatGPT 1 hour ago\./);
  const unproven = renderToStaticMarkup(createElement(SupervisionHealthLine, { status: operatorStatus({ supervisors: [{ ...manager, reachable: false }] }), now: NOW }));
  assert.match(unproven, /role="alert"/);
  assert.match(unproven, /The Project Manager supervisor isn(?:&#x27;|')t proven reachable yet/);
  assert.doesNotMatch(unproven, /can be reached/);
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
  const pending = activityOf([queued]);
  assert.equal(pending.states["fleet-review:page"], "QUEUED", "the projection hands the page every question's state");
  assert.equal(pendingRoute({ state: pending.states["fleet-review:page"] }), true);
  const answered = activityOf([queued, decision("fleet-review:page", "2026-10-11T11:00:00Z")]);
  assert.equal(pendingRoute({ state: answered.states["fleet-review:page"] }), false);
  assert.equal(pendingRoute({ state: "EXPIRED_UNSENT" }), false);
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

test("the button keeps the newest chat that was reached even when newer questions never got one", () => {
  const events = [
    route("fleet-review:reached", "2026-10-11T01:00:00Z"),
    transport("fleet-review:reached", "2026-10-11T01:05:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/reached-chat"]),
    ...[1, 2, 3, 4, 5].map((n) => route(`fleet-review:unsent-${n}`, `2026-10-11T0${n + 1}:00:00Z`)),
  ];
  const activity = activityOf(events);
  assert.equal(activity.requests.length, 5);
  assert.ok(activity.requests.every((request) => request.conversationUrl === null), "the five listed questions never reached a chat");
  assert.equal(activity.latestConversationUrl, "https://chatgpt.com/c/reached-chat");
  assert.equal(latestSupervisorConversation(activity), "https://chatgpt.com/c/reached-chat");
});

test("an operator status without well-formed supervisors is not accepted as a refresh", () => {
  const good = operatorStatus({ hosts: [{ label: "relay-a", role: "PRIMARY", active: true, reportFresh: true, relayWorkerState: "HEALTHY", browserState: "HEALTHY", authorityBindingState: "BOUND", ownedTargetCount: 1, observedAt: "2026-10-11T11:00:00Z", detail: "" }] });
  assert.equal(validOperatorSnapshot(good), true);
  const { supervisors: _dropped, ...withoutSupervisors } = good;
  assert.equal(validOperatorSnapshot(withoutSupervisors), false);
  assert.equal(validOperatorSnapshot({ ...good, supervisors: [{ supervisorId: "mc-project-manager" }] }), false);
  assert.equal(validOperatorSnapshot({ ...good, supervisors: [{ ...manager, reachable: "yes" }] }), false);
  assert.equal(validOperatorSnapshot({ ...good, hosts: [{ ...good.hosts[0], reportFresh: undefined }] }), false);
  assert.equal(validOperatorSnapshot({ ...good, pacing: { ...good.pacing, lastProviderSendBoundaryAt: 5 } }), false);
});

test("a malformed or foreign route packet is not shown as a question", () => {
  const at = "2026-10-11T10:00:00Z";
  const bad = [
    route("fleet-review:kind", at, { patch: { packetKind: "SOMETHING_ELSE" } }),
    route("fleet-review:version", at, { patch: { schemaVersion: 5 } }),
    route("fleet-review:delivery", at, { patch: { providerDeliveryState: "DELIVERED" } }),
    route("fleet-review:worker", at, { worker: "billing" }),
    route("fleet-review:destination", at, { patch: { destinationSupervisorId: "" } }),
    route("fleet-review:expiry", at, { expiresAt: "2026-10-11T09:00:00Z" }),
    route("fleet-review:task", at, { patch: { factualPacket: { decisionRequested: "x" } } }),
  ];
  assert.equal(activityOf(bad).total, 0);
  const good = route("fleet-review:good", at);
  assert.equal(activityOf([...bad, good]).total, 1);
  assert.equal(supervisorActivity([good], NOW, { admitted: new Set(), replaced: new Set(), trustedRelays: RELAYS }).total, 0, "a request Mission Control didn't admit is not shown");
  assert.equal(supervisorActivity([good], NOW, { admitted: new Set(["fleet-review:good"]), replaced: new Set(), trustedRelays: RELAYS }).total, 1);
});

test("the projection counts only requests Mission Control's own parser accepts", () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const id = "mission-control-live-slice";
    const base = store.workerEvents(id);
    const offset = base.at(-1)!.sequence;
    const ours = (event: StoredEvent): StoredEvent => ({ ...event, worker: id, sequence: offset + event.sequence,
      data: { ...event.data, worker: id, ...(event.data.type === "worker_message_recorded" ? { body: (event.data as { body: string }).body.replaceAll(`"worker":"${WORKER}"`, `"worker":"${id}"`) } : {}) } as StoredEvent["data"] });
    const valid = ours(route("fleet-review:parsed", "2026-10-11T10:00:00Z"));
    const unparsed = ours(route("fleet-review:no-nonce", "2026-10-11T10:30:00Z", { patch: { nonce: undefined } }));
    const projected = projectWorker([...base, valid, unparsed], NOW);
    assert.deepEqual(projected.supervisorActivity.requests.map((request) => request.requestId), ["fleet-review:parsed"]);
  } finally { store.close(); }
});

test("a request the fleet check retired because it expired reads as expired, not withdrawn", () => {
  const retirement = (requestId: string, refs: string[]) => stored({
    type: "evidence_receipt_recorded", receipt_id: `retired:${requestId}`, producer_id: "verifier:fleet-supervisor-request-retirement",
    producer_role: "VERIFIER", evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: null,
    summary: "MISSION_CONTROL_SUPERVISORY_REQUEST_RETIRED_UNSENT_V1", refs: [`request:${requestId}`, "lifecycle_status:RETIRED_UNSENT", ...refs],
    verified: true, changed_path_manifest: null,
  }, "2026-10-11T11:00:00Z", { id: "verifier:fleet-supervisor-request-retirement", kind: "VERIFIER" });
  const states = Object.fromEntries(activityOf([
    route("fleet-review:aged", "2026-10-11T10:00:00Z"),
    retirement("fleet-review:aged", ["retirement_reason:REQUEST_EXPIRED"]),
    route("fleet-review:pulled", "2026-10-11T10:10:00Z"),
    retirement("fleet-review:pulled", []),
  ]).requests.map((request) => [request.requestId, request.state]));
  assert.deepEqual(states, { "fleet-review:pulled": "WITHDRAWN", "fleet-review:aged": "EXPIRED_UNSENT" });
});

test("a replacement counts only when Mission Control admits it", () => {
  const first = route("fleet-review:first", "2026-10-11T09:00:00Z");
  const second = route("fleet-review:second", "2026-10-11T09:30:00Z", { supersedes: "fleet-review:first" });
  const admittedReplacement = supervisorActivity([first, second], NOW, { admitted: new Set(["fleet-review:first", "fleet-review:second"]), replaced: new Set(["fleet-review:first"]), trustedRelays: RELAYS });
  assert.deepEqual(admittedReplacement.states, { "fleet-review:first": "REPLACED", "fleet-review:second": "QUEUED" });
  const rejectedReplacement = supervisorActivity([first, second], NOW, { admitted: new Set(["fleet-review:first"]), replaced: new Set(), trustedRelays: RELAYS });
  assert.deepEqual(rejectedReplacement.states, { "fleet-review:first": "QUEUED" }, "a rejected replacement neither replaces nor shows");
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const id = "mission-control-live-slice";
    const base = store.workerEvents(id);
    const offset = base.at(-1)!.sequence;
    const ours = (event: StoredEvent): StoredEvent => ({ ...event, worker: id, sequence: offset + event.sequence,
      data: { ...event.data, worker: id, body: (event.data as { body: string }).body.replaceAll(`"worker":"${WORKER}"`, `"worker":"${id}"`) } as StoredEvent["data"] });
    // Without the supersession record and failure proof Mission Control requires of a replacement, it keeps the first.
    const projected = projectWorker([...base, ours(first), ours(second)], NOW);
    assert.deepEqual(projected.supervisorActivity.states, { "fleet-review:first": "QUEUED" });
  } finally { store.close(); }
});

test("a task snapshot with a malformed supervisor activity is not accepted as a refresh", () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const snapshot = snapshotFromStore(store);
    assert.equal(validTaskSnapshot(snapshot), true);
    const withActivity = (supervisorActivity: unknown) => ({ ...snapshot, workers: snapshot.workers.map((worker, index) => index === 0 ? { ...worker, supervisorActivity } : worker) });
    const good = activityOf([route("fleet-review:1", "2026-10-11T10:00:00Z"), transport("fleet-review:1", "2026-10-11T10:05:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/real-123"])]);
    assert.equal(validTaskSnapshot(withActivity(good)), true);
    assert.equal(validTaskSnapshot(withActivity(undefined)), true, "a snapshot from a build without it still renders");
    for (const bad of [{}, null, { ...good, requests: "x" }, { ...good, states: { a: "LOST" } }, { ...good, requests: [{ ...good.requests[0], state: "LOST" }] },
      { ...good, requests: [{ ...good.requests[0], conversationUrl: 5 }] }, { ...good, total: "1" }]) {
      assert.equal(validTaskSnapshot(withActivity(bad)), false, JSON.stringify(bad).slice(0, 80));
    }
  } finally { store.close(); }
});

test("a split-session cycle's binding preload is not the question being sent", () => {
  const events = [
    route("fleet-review:split", "2026-10-11T10:00:00Z", { version: 4 }),
    transport("fleet-review:split", "2026-10-11T10:01:00Z", ["session_role:MC_BINDING_PRELOAD_SESSION", "generation_state:STARTED", "conversation_url:https://chatgpt.com/c/preload-a"]),
    transport("fleet-review:split", "2026-10-11T10:02:00Z", ["step:MCP_BINDING_PRELOAD", "generation_state:COMPLETE", "conversation_url:https://chatgpt.com/c/preload-b"]),
    transport("fleet-review:split", "2026-10-11T10:03:00Z", ["provider_session:binding-1", "binding_provider_session:binding-1", "lifecycle_status:COMPLETE", "conversation_url:https://chatgpt.com/c/preload-c"]),
  ];
  let [request] = activityOf(events).requests;
  assert.equal(request.state, "QUEUED");
  assert.equal(request.conversationUrl, null);
  events.push(transport("fleet-review:split", "2026-10-11T10:05:00Z", ["provider_session:decision-1", "binding_provider_session:binding-1", "session_role:SUPERVISORY_DECISION_SESSION", "generation_state:STARTED", "conversation_url:https://chatgpt.com/c/decision-chat"]));
  [request] = activityOf(events).requests;
  assert.equal(request.state, "SENT");
  assert.equal(request.conversationUrl, "https://chatgpt.com/c/decision-chat");
});
