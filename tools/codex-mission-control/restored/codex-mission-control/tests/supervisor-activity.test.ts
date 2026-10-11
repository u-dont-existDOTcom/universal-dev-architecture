import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OwnerTaskCard, supervisionHistory } from "../components/Dashboard";
import { parseInternalRoutePacket, pendingRoute, supervisionReadModel, workflowState } from "../components/SupervisionConsole";
import { SupervisionHealthLine, SupervisorActivityPanel, supervisorStatusLine } from "../components/SupervisorActivity";
import { LATEST_CHAT_LABEL, supervisorChatView } from "../components/SupervisorLink";
import { snapshotFromEvents, snapshotFromStore, workerSnapshotFromEvents } from "../lib/dashboard-data";
import { retiredUnsentRequests } from "../lib/github-decision-receipts";
import { inBandRequestRole, inBandRequestStep } from "../lib/in-band-request-binding";
import type { OperatorStatusProjection } from "../lib/operator-status-contract";
import { requestBoundRole, requestBoundStep } from "../lib/request-bound-supervision";
import type { StoredEvent } from "../lib/schema";
import { seedIssue47Store } from "../lib/seed";
import { snapshotForTimeline } from "../lib/snapshot-response";
import { EventStore } from "../lib/store";
import { projectWorker, projectWorkers } from "../lib/projection";
import {
  conflictedRelaySessions, isSupervisorActivity, lastSupervisorQuestionSentAt, latestSupervisorConversation,
  SUPERVISOR_TRANSPORT_BINDINGS, supervisorActivity, type SupervisorRequestAdmission,
} from "../lib/supervisor-activity";
import { validOperatorSnapshot, validTaskSnapshot } from "../lib/owner-view";

const WORKER = "auth";
const RELAYS: ReadonlySet<string> = new Set(["collector:relay-primary"]);
type Retired = Record<string, "EXPIRED_UNSENT" | "WITHDRAWN">;
/** Admits every question in these events (as Mission Control's parser does for well-formed packets) and trusts the relay. */
function admitAll(events: StoredEvent[], replaced: string[] = [], retired: Retired = {}): SupervisorRequestAdmission {
  const admitted = events.flatMap((event) => {
    if (event.data.type !== "worker_message_recorded") return [];
    const body = (event.data as { body: string }).body;
    try { return [String(JSON.parse(body.slice(body.indexOf("\n") + 1)).requestId)]; } catch { return []; }
  });
  return { admitted: new Set(admitted), replaced: new Set(replaced), retired: new Map(Object.entries(retired)), trustedRelays: RELAYS,
    conflictedSessions: conflictedRelaySessions(events, RELAYS) };
}
function admission(admitted: string[], replaced: string[] = []): SupervisorRequestAdmission {
  return { admitted: new Set(admitted), replaced: new Set(replaced), retired: new Map(), trustedRelays: RELAYS, conflictedSessions: new Set() };
}
function activityOf(events: StoredEvent[], replaced: string[] = [], retired: Retired = {}) {
  return supervisorActivity(events, NOW, admitAll(events, replaced, retired));
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
const SESSION = "MISSION_CONTROL_PROVIDER_SESSION_V1";
const STAGE = "MISSION_CONTROL_RELAY_STAGE_V1";
interface ReceiptOptions {
  session?: string; supervisor?: string; worker?: string; producer?: { id: string; kind: string };
  extra?: Record<string, unknown>; without?: string[]; refs?: string[];
}
/** A relay receipt naming the request, its supervisor and (unless left out) the request's own provider session. */
function receipt(summary: string, requestId: string, at: string, refs: string[], options: ReceiptOptions = {}): StoredEvent {
  const producer = options.producer ?? relay;
  const all = [`request:${requestId}`, `supervisor:${options.supervisor ?? "mc-project-manager"}`, `provider_session:${options.session ?? `ps-${requestId}`}`,
    ...refs].filter((ref) => !(options.without ?? []).some((key) => ref.startsWith(`${key}:`))).concat(options.refs ?? []);
  const event = stored({
    type: "evidence_receipt_recorded", receipt_id: `receipt:${requestId}:${summary}:${at}`, producer_id: producer.id, producer_role: producer.kind,
    evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: null,
    summary, refs: all, verified: true, changed_path_manifest: null, ...options.extra,
  }, at, producer);
  return options.worker ? { ...event, worker: options.worker } : event;
}
/** The relay's provider-session receipt for a V6 question: its own session's first message, in an exact conversation. */
function session(requestId: string, at: string, url: string, lifecycle = "ACTIVE", options: ReceiptOptions & { role?: string } = {}) {
  return receipt(SESSION, requestId, at, [`session_role:${options.role ?? "IN_BAND_REQUEST_DECISION_SESSION"}`, "message_ordinal:1",
    `conversation_url:${url}`, "url_binding_status:EXACT", `lifecycle_status:${lifecycle}`], options);
}
/** The relay's stage receipt: that session's first message started or completed, at the in-band step. */
function stage(requestId: string, at: string, generation: "STARTED" | "COMPLETE", url: string, options: ReceiptOptions & { step?: string } = {}) {
  return receipt(STAGE, requestId, at, [`step:${options.step ?? "IN_BAND_REQUEST_DECISION"}`, "message_ordinal:1", "first_message:true",
    `conversation_url:${url}`, `generation_state:${generation}`], options);
}
/** Sent to ChatGPT: the session's exact conversation, then the start of its first message there. */
function sent(requestId: string, at: string, url: string, options: ReceiptOptions = {}) {
  return [session(requestId, at, url, "ACTIVE", options), stage(requestId, at, "STARTED", url, options)];
}

function decision(requestId: string, at: string, extra: Record<string, unknown> = {}) {
  return stored({
    type: "github_decision_receipt_ingested", task_id: "task-auth", receipt_id: `receipt:${requestId}`, request_id: requestId,
    decision_block: { decision_id: "decision-1", exact_text: "CONTINUE: run the migration tests next.", sha256: "a".repeat(64) },
    ingested_at: at, ...extra,
  }, at, { id: "system:github-decision-receipts", kind: "SYSTEM" });
}

/** These events as if recorded for another task, numbered from `offset` on. */
function movedTo(id: string, events: StoredEvent[], offset: number): StoredEvent[] {
  return events.map((event, index): StoredEvent => ({ ...event, worker: id, sequence: offset + index + 1,
    data: { ...event.data, worker: id, ...(event.data.type === "worker_message_recorded" ? { body: (event.data as { body: string }).body.replaceAll(`"worker":"${WORKER}"`, `"worker":"${id}"`) } : {}) } as StoredEvent["data"] }));
}
/** These events moved into the seeded live-slice task, after its own, so the real projection reads them. */
function inSeededTask(store: EventStore, events: StoredEvent[]): StoredEvent[] {
  const id = "mission-control-live-slice";
  const base = store.workerEvents(id);
  return [...base, ...movedTo(id, events, base.at(-1)!.sequence)];
}
const receiptPolicy = (enabled: boolean) => JSON.stringify({ repository: "owner/receipts", decisionIssueNumber: 1, capabilityIssueNumber: 2, stageIssueNumber: 3,
  authorizedWriterLogins: ["owner"], capabilityChallenges: [], requestBound: { enabled, relayProducerIds: ["collector:relay-primary"] } });

test("a supervisor question moves from queued to sent, finished and answered, with the chat where it ran", () => {
  const events = [route("fleet-review:1", "2026-10-11T10:00:00Z", { question: "Is the auth task on track?" })];
  let activity = activityOf(events);
  assert.equal(activity.total, 1);
  assert.equal(activity.requests[0].state, "QUEUED");
  assert.equal(activity.requests[0].origin, "ROUTINE_CHECK");
  assert.equal(activity.requests[0].question, "Is the auth task on track?");
  assert.equal(activity.requests[0].supervisorId, "mc-project-manager");
  assert.match(supervisorStatusLine(activity, NOW), /^Asked 2 hours ago; waiting to be sent\.$/);

  events.push(session("fleet-review:1", "2026-10-11T10:04:00Z", "https://chatgpt.com/c/WEB:provisional"),
    stage("fleet-review:1", "2026-10-11T10:05:00Z", "STARTED", "https://chatgpt.com/c/WEB:provisional"));
  activity = activityOf(events);
  assert.equal(activity.requests[0].state, "SENT");
  assert.equal(activity.requests[0].sentAt, "2026-10-11T10:05:00Z");
  assert.equal(latestSupervisorConversation(activity), "https://chatgpt.com/c/WEB:provisional");

  events.push(session("fleet-review:1", "2026-10-11T10:20:00Z", "https://chatgpt.com/c/real-123", "COMPLETE"));
  activity = activityOf(events);
  assert.equal(activity.requests[0].state, "SENT", "the session's own lifecycle is not the question's completion");
  assert.equal(latestSupervisorConversation(activity), "https://chatgpt.com/c/real-123", "the real address wins over the provisional one");
  events.push(session("fleet-review:1", "2026-10-11T10:21:00Z", "https://chatgpt.com/c/WEB:provisional"));
  assert.equal(latestSupervisorConversation(activityOf(events)), "https://chatgpt.com/c/real-123", "and stays ahead of a later provisional one");
  events.push(stage("fleet-review:1", "2026-10-11T10:22:00Z", "COMPLETE", "https://chatgpt.com/c/real-123"));
  activity = activityOf(events);
  assert.equal(activity.requests[0].state, "FINISHED");
  assert.equal(activity.requests[0].finishedAt, "2026-10-11T10:22:00Z");

  events.push(decision("fleet-review:1", "2026-10-11T10:30:00Z", { bounded_execution: { reasoning_summary: "The task is on track; run the migration tests next." } }));
  activity = activityOf(events);
  assert.equal(activity.requests[0].state, "ANSWERED");
  assert.equal(activity.requests[0].answer, "The task is on track; run the migration tests next.");
  assert.equal(activity.answered, 1);
  assert.equal(activity.lastAnsweredAt, "2026-10-11T10:30:00Z");
  assert.equal(supervisorStatusLine(activity, NOW), "Answered 1 hour ago: The task is on track; run the migration tests next.");
});

test("only the policy's relay collectors count as sent, for this supervisor after queueing, and only a ChatGPT conversation is offered", () => {
  const id = "fleet-review:2";
  const events = [
    route(id, "2026-10-11T10:00:00Z"),
    ...sent(id, "2026-10-11T10:01:00Z", "https://chatgpt.com/c/claimed", { session: "s-worker", producer: { id: `worker:${WORKER}`, kind: "WORKER" } }),
    ...sent(id, "2026-10-11T10:02:00Z", "https://chatgpt.com/c/unverified", { session: "s-unverified", extra: { verified: false } }),
    ...sent(id, "2026-10-11T10:03:00Z", "https://example.org/c/elsewhere", { session: "s-elsewhere" }),
    ...sent(id, "2026-10-11T10:04:00Z", "https://chatgpt.com/", { session: "s-home" }),
    ...sent(id, "2026-10-11T10:05:00Z", "https://chatgpt.com/c/other-collector", { session: "s-other", producer: { id: "collector:somebody-else", kind: "COLLECTOR" } }),
    receipt("MISSION_CONTROL_SOMETHING_ELSE_V1", id, "2026-10-11T10:06:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/other-summary"], { session: "s-summary" }),
    ...sent(id, "2026-10-11T09:59:00Z", "https://chatgpt.com/c/before-queued", { session: "s-early" }),
    ...sent(id, "2026-10-11T10:07:00Z", "https://chatgpt.com/c/wrong-supervisor", { session: "s-supervisor", supervisor: "someone-else" }),
  ];
  const activity = activityOf(events);
  assert.equal(activity.requests[0].state, "QUEUED");
  assert.equal(activity.requests[0].conversationUrl, null);
  assert.equal(latestSupervisorConversation(activity), null);
  const reached = activityOf([...events, ...sent(id, "2026-10-11T10:08:00Z", "https://chatgpt.com/c/the-chat")]);
  assert.equal(reached.requests[0].state, "SENT", "the trusted relay's receipts for the question's own session do count");
  assert.equal(reached.requests[0].conversationUrl, "https://chatgpt.com/c/the-chat");
});

test("relay receipts count only when bound to the question's own session, role, step and first message", () => {
  const id = "fleet-review:bound";
  const url = "https://chatgpt.com/c/bound-chat";
  const at = (minute: number) => `2026-10-11T10:0${minute}:00Z`;
  const queued = route(id, at(0));
  const view = (...receipts: StoredEvent[]) => {
    const [request] = activityOf([queued, ...receipts]).requests;
    return { state: request.state, chat: request.conversationUrl };
  };
  const nothing = { state: "QUEUED", chat: null };
  // A trusted receipt with only the request, the supervisor and a completion binds to no session.
  assert.deepEqual(view(
    receipt(SESSION, id, at(1), ["lifecycle_status:COMPLETE", `conversation_url:${url}`], { without: ["provider_session"] }),
    receipt(STAGE, id, at(1), ["generation_state:COMPLETE", `conversation_url:${url}`], { without: ["provider_session"] }),
  ), nothing);
  // A session receipt needs the in-band session role, the first message and an exact conversation.
  assert.deepEqual(view(session(id, at(1), url, "COMPLETE", { role: "REQUEST_BOUND_DECISION_SESSION" })), nothing);
  assert.deepEqual(view(session(id, at(1), url, "COMPLETE", { without: ["message_ordinal"], refs: ["message_ordinal:2"] })), nothing);
  assert.deepEqual(view(session(id, at(1), url, "COMPLETE", { without: ["url_binding_status"], refs: ["url_binding_status:PENDING_PROVIDER_ASSIGNMENT"] })), nothing);
  assert.deepEqual(view(session(id, at(1), url, "COMPLETE", { refs: ["request:fleet-review:other"] })), nothing, "a receipt naming two requests names none");
  // A stage needs the in-band step, the session's first message, its session and one of its conversations.
  const opened = session(id, at(1), url);
  const waiting = nothing;
  assert.deepEqual(view(opened), waiting, "a chat opened for the question isn't offered until the question is sent in it");
  assert.deepEqual(view(session(id, at(1), url, "COMPLETE")), nothing, "a session closed before its first message started is neither sent nor finished");
  assert.deepEqual(view(opened, stage(id, at(3), "COMPLETE", url)), nothing, "a completion without its start is not a finish");
  assert.deepEqual(view(opened, stage(id, at(2), "STARTED", url, { step: "MCP_BINDING_PRELOAD" })), waiting);
  assert.deepEqual(view(opened, stage(id, at(2), "STARTED", url, { without: ["first_message"] })), waiting);
  assert.deepEqual(view(opened, stage(id, at(2), "STARTED", url, { without: ["message_ordinal"], refs: ["message_ordinal:2"] })), waiting);
  assert.deepEqual(view(opened, stage(id, at(2), "STARTED", "https://chatgpt.com/c/another-chat")), waiting);
  assert.deepEqual(view(opened, stage(id, at(2), "STARTED", url, { session: "ps-another" })), waiting);
  assert.deepEqual(view(opened, stage(id, at(2), "STARTED", url)), { state: "SENT", chat: url });
  // A completion counts only in the conversation the session ended with.
  assert.deepEqual(view(opened, stage(id, at(2), "STARTED", url), stage(id, at(3), "COMPLETE", "https://chatgpt.com/c/another-chat")), { state: "SENT", chat: url });
  assert.deepEqual(view(opened, stage(id, at(2), "STARTED", url), stage(id, at(3), "COMPLETE", url)), { state: "FINISHED", chat: url });
  // A session also named for another request, worker or role counts for none of them.
  assert.deepEqual(view(opened, stage(id, at(2), "STARTED", url), stage("fleet-review:other", at(3), "STARTED", url, { session: `ps-${id}` })), nothing);
  assert.deepEqual(view(opened, stage(id, at(2), "STARTED", url, { worker: "billing" })), nothing);
  assert.deepEqual(view(opened, stage(id, at(2), "STARTED", url), session(id, at(3), url, "ACTIVE", { role: "MC_BINDING_PRELOAD_SESSION" })), nothing);
  // A session naming a second real address changed identity: it was sent, but no chat is offered for it.
  assert.deepEqual(view(opened, stage(id, at(2), "STARTED", url), session(id, at(3), "https://chatgpt.com/c/second-real")), { state: "SENT", chat: null });
  // Should a question ever run in two sessions, the one it was sent in is shown.
  assert.deepEqual(view(opened, stage(id, at(2), "STARTED", url), session(id, at(4), "https://chatgpt.com/c/later-unsent", "ACTIVE", { session: "ps-retry" })),
    { state: "SENT", chat: url });

  // A V5 (request-bound) question binds with its own role and step, and never to a provisional conversation.
  const v5 = route("fleet-review:v5", at(0), { version: 5 });
  const v5state = (...receipts: StoredEvent[]) => activityOf([v5, ...receipts]).requests[0].state;
  const bound = { role: "REQUEST_BOUND_DECISION_SESSION", step: "REQUEST_BOUND_DECISION" };
  assert.equal(v5state(session("fleet-review:v5", at(1), url, "ACTIVE", bound), stage("fleet-review:v5", at(2), "STARTED", url, bound)), "SENT");
  assert.equal(v5state(session("fleet-review:v5", at(1), url), stage("fleet-review:v5", at(2), "STARTED", url)), "QUEUED", "V6's role and step don't bind a V5 question");
  assert.equal(v5state(session("fleet-review:v5", at(1), "https://chatgpt.com/c/WEB:provisional", "ACTIVE", bound),
    stage("fleet-review:v5", at(2), "STARTED", "https://chatgpt.com/c/WEB:provisional", bound)), "QUEUED");
});

test("the view's V5 and V6 session bindings are Mission Control's own", () => {
  assert.deepEqual([SUPERVISOR_TRANSPORT_BINDINGS[5].sessionRole, SUPERVISOR_TRANSPORT_BINDINGS[5].step], [requestBoundRole, requestBoundStep]);
  assert.deepEqual([SUPERVISOR_TRANSPORT_BINDINGS[6].sessionRole, SUPERVISOR_TRANSPORT_BINDINGS[6].step], [inBandRequestRole, inBandRequestStep]);
  assert.deepEqual(Object.keys(SUPERVISOR_TRANSPORT_BINDINGS), ["5", "6"]);
});

test("older routes (V3, V4) are never shown as sent: only waiting, answered or expired", () => {
  for (const version of [3, 4]) {
    const id = `fleet-review:v${version}`;
    const url = `https://chatgpt.com/c/v${version}-chat`;
    const activity = activityOf([route(id, "2026-10-11T10:00:00Z", { version }),
      session(id, "2026-10-11T10:01:00Z", url, "COMPLETE", { session: "decision-1", role: "EXTRA_HIGH_DECISION_SESSION" }),
      stage(id, "2026-10-11T10:02:00Z", "STARTED", url, { session: "decision-1", step: "EXTRA_HIGH_DECISION" }),
      ...sent(id, "2026-10-11T10:03:00Z", url)]);
    assert.equal(activity.requests[0].state, "WAITING");
    assert.equal(activity.requests[0].sentAt, null);
    assert.equal(activity.requests[0].conversationUrl, null);
    assert.equal(supervisorStatusLine(activity, NOW), "Asked 2 hours ago; waiting for an answer.");
  }
  const old = activityOf([route("fleet-review:v4-old", "2026-10-09T09:00:00Z", { version: 4, expiresAt: "2026-10-10T09:00:00Z" })]);
  assert.equal(old.requests[0].state, "EXPIRED");
  assert.equal(pendingRoute({ state: "WAITING" }), true);
});

test("expired, withdrawn and replaced questions say so", () => {
  const events = [
    route("fleet-review:old", "2026-10-09T09:00:00Z", { expiresAt: "2026-10-10T09:00:00Z" }),
    route("fleet-review:silent", "2026-10-10T09:00:00Z", { expiresAt: "2026-10-11T09:00:00Z" }),
    ...sent("fleet-review:silent", "2026-10-10T09:10:00Z", "https://chatgpt.com/c/silent-chat"),
    route("fleet-review:withdrawn", "2026-10-11T08:00:00Z"),
    route("fleet-review:aged", "2026-10-11T08:20:00Z"),
    route("fleet-review:first", "2026-10-11T09:00:00Z"),
    route("fleet-review:second", "2026-10-11T09:30:00Z", { supersedes: "fleet-review:first" }),
  ];
  // Mission Control's admission says "second" validly replaced "first", and retired two questions with its no-send
  // proof (the projection tests below check both rules on real receipts).
  const all = activityOf(events, ["fleet-review:first"], { "fleet-review:withdrawn": "WITHDRAWN", "fleet-review:aged": "EXPIRED_UNSENT" });
  assert.deepEqual(Object.fromEntries(all.requests.map((request) => [request.requestId, request.state])), {
    "fleet-review:second": "QUEUED",
    "fleet-review:first": "REPLACED",
    "fleet-review:aged": "EXPIRED_UNSENT",
    "fleet-review:withdrawn": "WITHDRAWN",
    "fleet-review:silent": "NO_ANSWER",
  });
  assert.equal(all.total, 6);
  assert.equal(all.requests.length, 5, "newest five");
  const expired = activityOf(events.slice(0, 1));
  assert.equal(expired.requests[0].state, "EXPIRED", "no send recorded is not proof it was never sent");
  assert.equal(supervisorStatusLine(expired, NOW), "Asked 2 days ago; it expired 27 hours ago without an answer.");
  assert.equal(pendingRoute({ state: "EXPIRED" }), false);
});

test("the projection retires a question only with Mission Control's full no-send proof", () => {
  const verifier = { id: "verifier:fleet-supervisor-request-retirement", kind: "VERIFIER" };
  const retirement = (requestId: string, refs: string[], producer = verifier) => stored({
    type: "evidence_receipt_recorded", receipt_id: `retired:${requestId}:${refs.length}`, producer_id: producer.id,
    producer_role: producer.kind, evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: null,
    summary: "MISSION_CONTROL_SUPERVISORY_REQUEST_RETIRED_UNSENT_V1", refs: [`request:${requestId}`, "lifecycle_status:RETIRED_UNSENT", ...refs],
    verified: true, changed_path_manifest: null,
  }, "2026-10-11T11:00:00Z", producer);
  const proof = ["provider_send_boundary:NOT_CROSSED", "submission_authority_queue_records:0", "submission_authority_admission_records:0", "provider_transport_evidence_records:0"];
  const [aged, pulled, partial, claimed] = ["a", "b", "c", "d"].map((digit) => `fleet-review:${digit.repeat(32)}`);
  const events = [
    route(aged, "2026-10-11T10:00:00Z"), retirement(aged, [...proof, "retirement_reason:REQUEST_EXPIRED"]),
    route(pulled, "2026-10-11T10:10:00Z"), retirement(pulled, proof),
    route(partial, "2026-10-11T10:20:00Z"), retirement(partial, ["retirement_reason:REQUEST_EXPIRED"]),
    route(claimed, "2026-10-11T10:30:00Z"), retirement(claimed, proof, { id: `worker:${WORKER}`, kind: "WORKER" }),
  ];
  assert.deepEqual(retiredUnsentRequests(events), new Map([[aged, "REQUEST_EXPIRED"], [pulled, null]]));
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const states = projectWorker(inSeededTask(store, events), NOW).supervisorActivity.states;
    // No relay is trusted in the test environment, so a question that isn't retired is just waiting.
    assert.deepEqual(states, { [aged]: "EXPIRED_UNSENT", [pulled]: "WITHDRAWN", [partial]: "WAITING", [claimed]: "WAITING" });
  } finally { store.close(); }
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
  assert.equal(supervisorStatusLine(undefined, NOW), "Not available right now.", "missing activity is unknown, not an empty history");
});

test("the worker page lists the questions with their chats, and the button opens the latest chat", () => {
  const events = [
    route("fleet-review:1", "2026-10-11T10:00:00Z", { question: "Is the auth task on track?" }),
    ...sent("fleet-review:1", "2026-10-11T10:05:00Z", "https://chatgpt.com/c/real-123"),
    decision("fleet-review:1", "2026-10-11T10:30:00Z", { bounded_execution: { reasoning_summary: "On track." } }),
  ];
  const activity = activityOf(events);
  const html = renderToStaticMarkup(createElement(SupervisorActivityPanel, { activity, now: NOW }));
  assert.match(html, /What its supervisor is doing/);
  assert.match(html, /1 question so far, 1 answered, the last 1 hour ago/);
  assert.match(html, /Mission Control(?:&#x27;|')s routine check/);
  assert.match(html, /Is the auth task on track\?/);
  assert.match(html, /href="https:\/\/chatgpt\.com\/c\/real-123"[^>]*>.*Open this chat/);
  const unknown = renderToStaticMarkup(createElement(SupervisorActivityPanel, { activity: undefined, now: NOW }));
  assert.match(unknown, /aren(?:&#x27;|')t available right now/);
  assert.doesNotMatch(unknown, /hasn(?:&#x27;|')t been asked anything yet/);
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
    assert.deepEqual(worker.supervisorActivity, { requests: [], total: 0, answered: 0, lastAnsweredAt: null, latestConversationUrl: null, lastSentAt: null, states: {} }, "every projected task carries its activity");
    const recent = snapshotForTimeline(snapshotFromStore(store), "recent").workers.find((candidate) => candidate.id === worker.id)!;
    assert.deepEqual(recent.supervisorActivity, worker.supervisorActivity, "the dashboard's trimmed snapshot keeps it");
    const empty = renderToStaticMarkup(createElement(OwnerTaskCard, { worker }));
    assert.match(empty, /<dt>Supervisor<\/dt><dd>Not asked anything yet\.<\/dd>/);
    const activity = activityOf([route("fleet-review:1", "2026-10-11T10:00:00Z"), ...sent("fleet-review:1", "2026-10-11T10:05:00Z", "https://chatgpt.com/c/real-123")]);
    const busy = renderToStaticMarkup(createElement(OwnerTaskCard, { worker: { ...worker, supervisorActivity: activity } }));
    assert.match(busy, /<dt>Supervisor<\/dt><dd>Asked [^<]*; sent [^<]*, working on it\.<\/dd>/);
    assert.match(busy, /href="https:\/\/chatgpt\.com\/c\/real-123"[^>]*>.*Open its latest supervisor chat/);
    const older = { ...worker } as Partial<typeof worker>;
    delete older.supervisorActivity;
    const unknown = renderToStaticMarkup(createElement(OwnerTaskCard, { worker: older as typeof worker }));
    assert.match(unknown, /<dt>Supervisor<\/dt><dd>Not available right now\.<\/dd>/, "a task without its activity doesn't claim nothing was asked");
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

test("the first screen says whether supervision can run and when the last supervisor question went out", () => {
  const LAST = "2026-10-11T11:00:00Z";
  assert.equal(renderToStaticMarkup(createElement(SupervisionHealthLine, { status: null, lastQuestionAt: LAST, now: NOW })), "");
  const running = renderToStaticMarkup(createElement(SupervisionHealthLine, { status: operatorStatus({}), lastQuestionAt: LAST, now: NOW }));
  assert.match(running, /Supervisor chats can be reached: the relay to ChatGPT is up and the Project Manager supervisor has been reached\. The last supervisor question went to ChatGPT 1 hour ago\./);
  const otherSends = renderToStaticMarkup(createElement(SupervisionHealthLine, { status: operatorStatus({}), lastQuestionAt: null, now: NOW }));
  assert.match(otherSends, /No supervisor question has reached ChatGPT yet\./, "the relay's other sends (provisioning, Work journals) are not supervisor questions");
  const unknown = renderToStaticMarkup(createElement(SupervisionHealthLine, { status: operatorStatus({}), lastQuestionAt: undefined, now: NOW }));
  assert.match(unknown, /When a supervisor question last went to ChatGPT isn(?:&#x27;|')t known right now\./);
  assert.doesNotMatch(unknown, /No supervisor question has reached ChatGPT yet/, "without current task data it makes no claim about the questions");
  const unproven = renderToStaticMarkup(createElement(SupervisionHealthLine, { status: operatorStatus({ supervisors: [{ ...manager, reachable: false }] }), lastQuestionAt: LAST, now: NOW }));
  assert.match(unproven, /role="alert"/);
  assert.match(unproven, /The Project Manager supervisor isn(?:&#x27;|')t proven reachable yet/);
  assert.doesNotMatch(unproven, /can be reached/);
  const down = renderToStaticMarkup(createElement(SupervisionHealthLine, { now: NOW, lastQuestionAt: "2026-10-08T12:00:00Z", status: operatorStatus({
    overallState: "DEGRADED", providerRelayState: "UNAVAILABLE",
    hosts: [{ label: "relay-a", role: "PRIMARY", active: true, reportFresh: false, relayWorkerState: "UNAVAILABLE", browserState: "UNAVAILABLE", authorityBindingState: "UNAVAILABLE", ownedTargetCount: 0, observedAt: "2026-10-08T12:00:00Z", detail: "" }],
  }) }));
  assert.match(down, /role="alert"/);
  assert.match(down, /Supervisor chats can(?:&#x27;|')t be reached right now/);
  assert.match(down, /is unavailable, so questions wait until it(?:&#x27;|')s back\. The last supervisor question went to ChatGPT 3 days ago\./);
  assert.match(down, /relay-a: relay unavailable, browser unavailable, no fresh report/);
  const never = renderToStaticMarkup(createElement(SupervisionHealthLine, { now: NOW, lastQuestionAt: null, status: operatorStatus({ providerRelayState: "DEGRADED" }) }));
  assert.match(never, /is degraded[^<]*No supervisor question has reached ChatGPT yet\./);
  assert.match(never, /no relay host has reported/);
  assert.doesNotMatch(never, /Project Manager/, "no manager warning while a manager is set up");
  const noManager = renderToStaticMarkup(createElement(SupervisionHealthLine, { now: NOW, lastQuestionAt: LAST, status: operatorStatus({ supervisors: [] }) }));
  assert.match(noManager, /Routine supervisor checks can(?:&#x27;|')t run\./);
  assert.match(noManager, /No Project Manager supervisor chat is set up/);
  assert.doesNotMatch(noManager, /can be reached/);
  const provisioning = renderToStaticMarkup(createElement(SupervisionHealthLine, { now: NOW, lastQuestionAt: LAST, status: operatorStatus({ supervisors: [{ ...manager, registrationState: "PROVISIONING" }] }) }));
  assert.match(provisioning, /hasn(?:&#x27;|')t been created yet/);
  const downWithoutManager = renderToStaticMarkup(createElement(SupervisionHealthLine, { now: NOW, lastQuestionAt: LAST, status: operatorStatus({ providerRelayState: "UNAVAILABLE", supervisors: [] }) }));
  assert.match(downWithoutManager, /can(?:&#x27;|')t be reached right now/);
  assert.match(downWithoutManager, /No Project Manager supervisor chat is set up/);
});

test("the first screen states the question history only from current task data", () => {
  const sentActivity = activityOf([route("fleet-review:a", "2026-10-11T08:00:00Z"), ...sent("fleet-review:a", "2026-10-11T08:05:00Z", "https://chatgpt.com/c/a-chat")]);
  const snapshot = { workers: [{ supervisorActivity: sentActivity }] };
  assert.equal(supervisionHistory(snapshot, false), "2026-10-11T08:05:00Z");
  assert.equal(supervisionHistory({ workers: [] }, false), null, "current data with no tasks: nothing has gone out");
  assert.equal(supervisionHistory(snapshot, true), undefined, "task data that failed to refresh is last-known, not current");
  assert.equal(supervisionHistory(null, true), undefined, "no task data at all");
});

test("a malformed activity is unknown everywhere, and the supervision page keeps its last-known view", () => {
  for (const bad of [{}, { requests: "x" }, { ...activityOf([]), states: null }, null, undefined]) {
    assert.equal(supervisorStatusLine(bad, NOW), "Not available right now.");
    assert.equal(latestSupervisorConversation(bad), null);
    assert.equal(lastSupervisorQuestionSentAt([activityOf([]), bad]), undefined);
    assert.match(renderToStaticMarkup(createElement(SupervisorActivityPanel, { activity: bad, now: NOW })), /aren(?:&#x27;|')t available right now/);
  }
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const snapshot = snapshotFromStore(store);
    const status = operatorStatus({});
    assert.ok(supervisionReadModel(snapshot, status), "the server's own answers pass");
    const skewed = { ...snapshot, workers: snapshot.workers.map((worker) => ({ ...worker, supervisorActivity: {} })) };
    assert.equal(supervisionReadModel(skewed, status), null, "a malformed activity never reaches the page");
    assert.equal(supervisionReadModel(snapshot, { ...status, supervisors: "x" }), null);
  } finally { store.close(); }
});

test("the last supervisor question time comes from the questions themselves, across tasks", () => {
  const first = activityOf([route("fleet-review:a", "2026-10-11T08:00:00Z"), ...sent("fleet-review:a", "2026-10-11T08:05:00Z", "https://chatgpt.com/c/a-chat")]);
  const second = activityOf([route("fleet-review:b", "2026-10-11T09:00:00Z"), ...sent("fleet-review:b", "2026-10-11T09:10:00Z", "https://chatgpt.com/c/b-chat"),
    route("fleet-review:c", "2026-10-11T10:00:00Z")]);
  assert.equal(first.lastSentAt, "2026-10-11T08:05:00Z");
  assert.equal(second.lastSentAt, "2026-10-11T09:10:00Z", "an unsent newer question doesn't count");
  assert.equal(lastSupervisorQuestionSentAt([first, second, activityOf([])]), "2026-10-11T09:10:00Z");
  assert.equal(lastSupervisorQuestionSentAt([first, undefined, second]), undefined, "a task whose activity isn't known leaves it unknown");
  assert.equal(lastSupervisorQuestionSentAt([]), null);
});

test("a provider session the relay reused for another task counts for neither task", () => {
  const store = new EventStore(":memory:");
  const saved = process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
  try {
    seedIssue47Store(store);
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = receiptPolicy(true);
    const ledger = store.allEvents();
    const [first, second] = projectWorkers(ledger, NOW).map((worker) => worker.id);
    const url = "https://chatgpt.com/c/shared-chat";
    const one = movedTo(first, [route("fleet-review:one", "2026-10-11T10:00:00Z"), ...sent("fleet-review:one", "2026-10-11T10:05:00Z", url, { session: "ps-shared" })], ledger.at(-1)!.sequence);
    const two = movedTo(second, [route("fleet-review:two", "2026-10-11T10:00:00Z"), ...sent("fleet-review:two", "2026-10-11T10:06:00Z", url, { session: "ps-shared" })], one.at(-1)!.sequence);
    const own = movedTo(second, [route("fleet-review:own", "2026-10-11T10:10:00Z"), ...sent("fleet-review:own", "2026-10-11T10:11:00Z", "https://chatgpt.com/c/own-chat")], two.at(-1)!.sequence);
    const events = [...ledger, ...one, ...two, ...own];
    const requests = new Map(snapshotFromEvents(events).workers.flatMap((worker) => worker.supervisorActivity.requests).map((request) => [request.requestId, request]));
    assert.deepEqual([requests.get("fleet-review:one")?.state, requests.get("fleet-review:one")?.conversationUrl], ["QUEUED", null]);
    assert.deepEqual([requests.get("fleet-review:two")?.state, requests.get("fleet-review:two")?.conversationUrl], ["QUEUED", null]);
    assert.deepEqual([requests.get("fleet-review:own")?.state, requests.get("fleet-review:own")?.conversationUrl], ["SENT", "https://chatgpt.com/c/own-chat"]);
    const page = workerSnapshotFromEvents(events, first)!.worker.supervisorActivity.requests[0];
    assert.equal(page.state, "QUEUED", "the task's own page reads the whole ledger too");
  } finally {
    if (saved === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON; else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = saved;
    store.close();
  }
});

test("an activity whose chat address isn't one ChatGPT conversation is not accepted", () => {
  const good = activityOf([route("fleet-review:1", "2026-10-11T10:00:00Z"), ...sent("fleet-review:1", "2026-10-11T10:05:00Z", "https://chatgpt.com/c/real-123")]);
  assert.equal(isSupervisorActivity(good), true);
  for (const address of ["https://chatgpt.com/", "https://chatgpt.com/settings", "/settings", "javascript:alert(1)", "https://example.org/c/x"]) {
    const latest = { ...good, latestConversationUrl: address };
    const listed = { ...good, requests: [{ ...good.requests[0], conversationUrl: address }] };
    for (const bad of [latest, listed]) {
      assert.equal(isSupervisorActivity(bad), false, address);
      assert.equal(latestSupervisorConversation(bad), null);
      assert.equal(supervisorStatusLine(bad, NOW), "Not available right now.");
    }
  }
});

test("relay receipts count only while the receipt policy enables the request-bound protocol", () => {
  const store = new EventStore(":memory:");
  const saved = process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
  try {
    seedIssue47Store(store);
    const events = inSeededTask(store, [route("fleet-review:policy", "2026-10-11T10:00:00Z"),
      ...sent("fleet-review:policy", "2026-10-11T10:05:00Z", "https://chatgpt.com/c/policy-chat")]);
    const policy = receiptPolicy;
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = policy(true);
    let [request] = projectWorker(events, NOW).supervisorActivity.requests;
    assert.equal(request.state, "SENT");
    assert.equal(request.conversationUrl, "https://chatgpt.com/c/policy-chat");
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = policy(false);
    [request] = projectWorker(events, NOW).supervisorActivity.requests;
    assert.equal(request.state, "WAITING", "a disabled protocol trusts no relay, so sending isn't known");
    assert.equal(request.conversationUrl, null);
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = "{not json";
    [request] = projectWorker(events, NOW).supervisorActivity.requests;
    assert.equal(request.state, "WAITING", "an invalid policy trusts no relay");
  } finally {
    if (saved === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON; else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = saved;
    store.close();
  }
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
    ...sent("fleet-review:reached", "2026-10-11T01:05:00Z", "https://chatgpt.com/c/reached-chat"),
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
  assert.equal(supervisorActivity([good], NOW, admission([])).total, 0, "a request Mission Control didn't admit is not shown");
  assert.equal(supervisorActivity([good], NOW, admission(["fleet-review:good"])).total, 1);
});

test("the projection counts only requests Mission Control's own parser accepts", () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const valid = route("fleet-review:parsed", "2026-10-11T10:00:00Z");
    const unparsed = route("fleet-review:no-nonce", "2026-10-11T10:30:00Z", { patch: { nonce: undefined } });
    const projected = projectWorker(inSeededTask(store, [valid, unparsed]), NOW);
    assert.deepEqual(projected.supervisorActivity.requests.map((request) => request.requestId), ["fleet-review:parsed"]);
  } finally { store.close(); }
});

test("a replacement counts only when Mission Control admits it", () => {
  const first = route("fleet-review:first", "2026-10-11T09:00:00Z");
  const second = route("fleet-review:second", "2026-10-11T09:30:00Z", { supersedes: "fleet-review:first" });
  const admittedReplacement = supervisorActivity([first, second], NOW, admission(["fleet-review:first", "fleet-review:second"], ["fleet-review:first"]));
  assert.deepEqual(admittedReplacement.states, { "fleet-review:first": "REPLACED", "fleet-review:second": "QUEUED" });
  const rejectedReplacement = supervisorActivity([first, second], NOW, admission(["fleet-review:first"]));
  assert.deepEqual(rejectedReplacement.states, { "fleet-review:first": "QUEUED" }, "a rejected replacement neither replaces nor shows");
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    // Without the supersession record and failure proof Mission Control requires of a replacement, it keeps the first.
    // (No relay is trusted in the test environment, so the question shows as waiting for an answer.)
    const projected = projectWorker(inSeededTask(store, [first, second]), NOW);
    assert.deepEqual(projected.supervisorActivity.states, { "fleet-review:first": "WAITING" });
  } finally { store.close(); }
});

test("a task snapshot with a missing or malformed supervisor activity is not accepted as a refresh", () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const snapshot = snapshotFromStore(store);
    assert.equal(validTaskSnapshot(snapshot), true);
    const withActivity = (supervisorActivity: unknown) => ({ ...snapshot, workers: snapshot.workers.map((worker, index) => index === 0 ? { ...worker, supervisorActivity } : worker) });
    const good = activityOf([route("fleet-review:1", "2026-10-11T10:00:00Z"), ...sent("fleet-review:1", "2026-10-11T10:05:00Z", "https://chatgpt.com/c/real-123")]);
    assert.equal(validTaskSnapshot(withActivity(good)), true);
    assert.equal(validTaskSnapshot(withActivity(undefined)), false, "a snapshot without it (another build's) has unknown questions, not none");
    for (const bad of [{}, null, { ...good, requests: "x" }, { ...good, states: { a: "LOST" } }, { ...good, requests: [{ ...good.requests[0], state: "LOST" }] },
      { ...good, requests: [{ ...good.requests[0], conversationUrl: 5 }] }, { ...good, total: "1" }, { ...good, lastSentAt: 5 }]) {
      assert.equal(validTaskSnapshot(withActivity(bad)), false, JSON.stringify(bad).slice(0, 80));
    }
  } finally { store.close(); }
});

test("supervisor times with different UTC offsets compare as instants", () => {
  // 10:00-05:00 is 15:00Z, later than 14:30Z, though it sorts earlier as text.
  const url = "https://chatgpt.com/c/offset-chat";
  const offset = activityOf([
    route("fleet-review:offsets", "2026-10-11T09:00:00Z"),
    session("fleet-review:offsets", "2026-10-11T09:01:00Z", url),
    stage("fleet-review:offsets", "2026-10-11T14:30:00Z", "STARTED", url),
    stage("fleet-review:offsets", "2026-10-11T10:00:00-05:00", "STARTED", url),
    stage("fleet-review:offsets", "2026-10-11T14:40:00Z", "COMPLETE", url),
    stage("fleet-review:offsets", "2026-10-11T10:05:00-05:00", "COMPLETE", url),
  ]);
  assert.equal(offset.requests[0].sentAt, "2026-10-11T14:30:00Z", "the earliest start is the send");
  assert.equal(offset.requests[0].finishedAt, "2026-10-11T10:05:00-05:00", "the latest completion is the finish");
  assert.equal(lastSupervisorQuestionSentAt([{ ...offset, lastSentAt: "2026-10-11T14:30:00Z" }, { ...offset, lastSentAt: "2026-10-11T10:00:00-05:00" }]), "2026-10-11T10:00:00-05:00");
  const answers = activityOf([
    route("fleet-review:x", "2026-10-11T08:00:00Z"), decision("fleet-review:x", "2026-10-11T14:30:00Z"),
    route("fleet-review:y", "2026-10-11T08:10:00Z"), decision("fleet-review:y", "2026-10-11T10:00:00-05:00"),
  ]);
  assert.equal(answers.lastAnsweredAt, "2026-10-11T10:00:00-05:00");
});
