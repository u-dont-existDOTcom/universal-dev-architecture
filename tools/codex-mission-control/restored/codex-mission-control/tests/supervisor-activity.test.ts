import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OwnerTaskCard, supervisionHistory } from "../components/Dashboard";
import { admittedRouteRows, parseInternalRoutePacket, pendingRoute, supervisionReadModel, workflowState } from "../components/SupervisionConsole";
import { SupervisionHealthLine, SupervisorActivityPanel, supervisorStatusLine } from "../components/SupervisorActivity";
import { LATEST_CHAT_LABEL, supervisorChatView } from "../components/SupervisorLink";
import { snapshotFromEvents, snapshotFromStore, workerSnapshotFromEvents } from "../lib/dashboard-data";
import { admittedCycleRequests, parseGitHubReceiptPolicy, retiredUnsentRequests, type PendingDecisionRequest } from "../lib/github-decision-receipts";
import { inBandRequestBindingEnvelope } from "../lib/in-band-request-binding";
import type { OperatorStatusProjection } from "../lib/operator-status-contract";
import type { StoredEvent } from "../lib/schema";
import { seedIssue47Store } from "../lib/seed";
import { snapshotForTimeline } from "../lib/snapshot-response";
import { EventStore } from "../lib/store";
import { projectWorker, projectWorkers, supervisorRelayContext, supervisorTransport } from "../lib/projection";
import {
  isSupervisorActivity, lastSupervisorQuestionSentAt, latestSupervisorConversation, supervisorActivity, type SupervisorRequestAdmission,
} from "../lib/supervisor-activity";
import { validOperatorSnapshot, validTaskSnapshot } from "../lib/owner-view";

const WORKER = "auth";
type Retired = Record<string, "EXPIRED_UNSENT" | "WITHDRAWN">;
const byLedger = (events: StoredEvent[]) => [...events].sort((a, b) => a.sequence - b.sequence);
/** Each request id's first route event in these events. */
function firstRoutes(events: StoredEvent[]): Map<string, number> {
  const routes = new Map<string, number>();
  for (const event of byLedger(events)) {
    if (event.data.type !== "worker_message_recorded") continue;
    const body = (event.data as { body: string }).body;
    try {
      const requestId = String(JSON.parse(body.slice(body.indexOf("\n") + 1)).requestId);
      if (!routes.has(requestId)) routes.set(requestId, event.sequence);
    } catch { /* not a route */ }
  }
  return routes;
}
/**
 * Admits each question's first route event (Mission Control's parser admits these well-formed packets; the projection
 * tests check the parser itself) and, with the request-bound protocol enabled, the transport evidence Mission Control's
 * own validators accept, exactly as the projection works it out.
 */
function admitAll(events: StoredEvent[], replaced: string[] = [], retired: Retired = {}): SupervisorRequestAdmission {
  const parsed = new Map<string, PendingDecisionRequest>();
  for (const request of admittedCycleRequests(byLedger(events)).admitted) if (!parsed.has(request.requestId)) parsed.set(request.requestId, request);
  return { admitted: firstRoutes(events), replaced: new Set(replaced), retired: new Map(Object.entries(retired)), tracksTransport: true,
    transport: supervisorTransport(parsed.values(), events, NOW, supervisorRelayContext(events, TEST_POLICY)) };
}
/** Admits only the given questions (by their first route event), with no transport. */
function admission(events: StoredEvent[], admitted: string[], replaced: string[] = []): SupervisorRequestAdmission {
  const routes = firstRoutes(events);
  return { admitted: new Map(admitted.map((requestId) => [requestId, routes.get(requestId) ?? -1])), replaced: new Set(replaced),
    retired: new Map(), tracksTransport: true, transport: new Map() };
}
function activityOf(unbound: StoredEvent[], replaced: string[] = [], retired: Retired = {}) {
  const events = bound(unbound);
  const activity = supervisorActivity(events, NOW, admitAll(events, replaced, retired));
  // The views and the dashboard's refresh check reject any activity that fails the shape check; Mission Control's own
  // output must always pass it, or the dashboard would refuse its own data.
  assert.equal(isSupervisorActivity(activity), true, JSON.stringify(activity).slice(0, 300));
  return activity;
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
const MODEL = "MISSION_CONTROL_PROVIDER_SESSION_MODEL_UI_V1";
const PRE_SEND = "MISSION_CONTROL_IN_BAND_REQUEST_BINDING_PRE_SEND_V1";
const PROMPT = "d".repeat(64);
/** The fixed model and thinking controls the relay observes in the ChatGPT window and repeats on every stage. */
const CONTROLS = ["model_selection_policy:TOP_VISIBLE_SELECTABLE_MODEL", "model_selector_index:0", "thinking_control_label:Thinking effort",
  "thinking_visible_label:Extra High", "thinking_ordinal:4 of 5", "account_plan_label:Pro", "account_plan_role:PROVENANCE_METADATA_ONLY",
  "account_plan_is_reasoning_mode:false", "backend_model_identity_claimed:false", "assistant_content_observed:false", "model_ui_label:GPT-6 Sol"];
const V5 = { role: "REQUEST_BOUND_DECISION_SESSION", step: "REQUEST_BOUND_DECISION" };
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
/**
 * The relay's stage receipt: that session's first message started or completed at the in-band step, with the prompt it
 * sent, the observed controls, the read-only source app and no semantic authority.
 */
function stage(requestId: string, at: string, generation: "STARTED" | "COMPLETE", url: string, options: ReceiptOptions & { step?: string; prompt?: string; app?: string } = {}) {
  return receipt(STAGE, requestId, at, [`step:${options.step ?? "IN_BAND_REQUEST_DECISION"}`, "message_ordinal:1", "first_message:true",
    `conversation_url:${url}`, `generation_state:${generation}`, `prompt_sha256:${options.prompt ?? PROMPT}`, ...CONTROLS,
    `selected_app:${options.app ?? "GitHub"}`, "semantic_authority:false"], options);
}
/** The relay's observation of the session's model controls, before anything is sent. */
function modelSeen(requestId: string, at: string, options: ReceiptOptions & { role?: string } = {}) {
  return receipt(MODEL, requestId, at, [`session_role:${options.role ?? "IN_BAND_REQUEST_DECISION_SESSION"}`, ...CONTROLS], options);
}
/**
 * The relay's pre-send receipt for a V6 question: the provider body it commits to send, for the request's exact binding
 * envelope and session, before the send. `bound` fills in the envelope digest from the request's route event, as the
 * relay computes it; `digest` sets another one.
 */
function preSend(requestId: string, at: string, options: ReceiptOptions & { body?: string; digest?: string } = {}) {
  return receipt(PRE_SEND, requestId, at, [`provider_body_sha256:${options.body ?? PROMPT}`, "semantic_authority:false",
    `trusted_relay_producer:${(options.producer ?? relay).id}`, "submission_admission:admission-1",
    "binding_protocol:IN_BAND_REQUEST_BINDING_V1", "binding_schema:MISSION_CONTROL_IN_BAND_REQUEST_BINDING_V1",
    `in_band_binding_sha256:${options.digest ?? AUTO_DIGEST}`, "decision_receipt_target:https://github.com/owner/receipts/issues/1"], options);
}
const AUTO_DIGEST = "auto";
const refOf = (refs: readonly string[], key: string) => refs.find((ref) => ref.startsWith(`${key}:`))?.slice(key.length + 1);
/** Each pre-send receipt's envelope digest, from its request's route event among these events and its own session. */
function bound(events: StoredEvent[]): StoredEvent[] {
  const requests = new Map(admittedCycleRequests(byLedger(events)).admitted.map((request) => [request.requestId, request]));
  return events.map((event) => {
    if (event.data.type !== "evidence_receipt_recorded" || event.data.summary !== PRE_SEND) return event;
    const refs = event.data.refs;
    const request = requests.get(refOf(refs, "request") ?? "");
    const session = refOf(refs, "provider_session");
    if (!request || !session || !refs.includes(`in_band_binding_sha256:${AUTO_DIGEST}`)) return event;
    const digest = inBandRequestBindingEnvelope(request, session, TEST_POLICY).in_band_binding_sha256;
    return { ...event, data: { ...event.data, refs: refs.map((ref) => ref === `in_band_binding_sha256:${AUTO_DIGEST}` ? `in_band_binding_sha256:${digest}` : ref) } };
  });
}
/** Sent to ChatGPT: model controls seen, the body committed, the session's exact conversation, then its first message started. */
function sent(requestId: string, at: string, url: string, options: ReceiptOptions = {}) {
  return [modelSeen(requestId, at, options), preSend(requestId, at, options), session(requestId, at, url, "ACTIVE", options), stage(requestId, at, "STARTED", url, options)];
}
/** The same for a V5 (request-bound) question: its own session role and step, and no pre-send receipt. */
function sentV5(requestId: string, at: string, url: string) {
  return [modelSeen(requestId, at, V5), session(requestId, at, url, "ACTIVE", V5), stage(requestId, at, "STARTED", url, V5)];
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
const TEST_POLICY = parseGitHubReceiptPolicy(receiptPolicy(true))!;

test("a supervisor question moves from queued to sent, finished and answered, with the chat where it ran", () => {
  const events = [route("fleet-review:1", "2026-10-11T10:00:00Z", { question: "Is the auth task on track?" })];
  let activity = activityOf(events);
  assert.equal(activity.total, 1);
  assert.equal(activity.requests[0].state, "QUEUED");
  assert.equal(activity.requests[0].origin, "ROUTINE_CHECK");
  assert.equal(activity.requests[0].question, "Is the auth task on track?");
  assert.equal(activity.requests[0].supervisorId, "mc-project-manager");
  assert.match(supervisorStatusLine(activity, NOW), /^Asked 2 hours ago; waiting to be sent\.$/);

  events.push(modelSeen("fleet-review:1", "2026-10-11T10:03:00Z"), preSend("fleet-review:1", "2026-10-11T10:03:30Z"),
    session("fleet-review:1", "2026-10-11T10:04:00Z", "https://chatgpt.com/c/WEB:provisional"),
    stage("fleet-review:1", "2026-10-11T10:05:00Z", "STARTED", "https://chatgpt.com/c/WEB:provisional"));
  activity = activityOf(events);
  assert.equal(activity.requests[0].state, "SENT");
  assert.equal(activity.requests[0].sentAt, "2026-10-11T10:05:00Z");
  assert.equal(latestSupervisorConversation(activity), "https://chatgpt.com/c/WEB:provisional");

  events.push(session("fleet-review:1", "2026-10-11T10:20:00Z", "https://chatgpt.com/c/real-123", "COMPLETE"));
  activity = activityOf(events);
  assert.equal(activity.requests[0].state, "SENT", "the session's own lifecycle is not the question's completion");
  assert.equal(latestSupervisorConversation(activity), "https://chatgpt.com/c/real-123", "the real address replaces the provisional one");
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
  const queued = route(id, "2026-10-11T10:00:00Z");
  const variants: Array<[string, StoredEvent[]]> = [
    ["a worker's claim", sent(id, "2026-10-11T10:01:00Z", "https://chatgpt.com/c/claimed", { producer: { id: `worker:${WORKER}`, kind: "WORKER" } })],
    ["an unverified receipt", sent(id, "2026-10-11T10:02:00Z", "https://chatgpt.com/c/unverified", { extra: { verified: false } })],
    ["another site", sent(id, "2026-10-11T10:03:00Z", "https://example.org/c/elsewhere")],
    ["the ChatGPT home page", sent(id, "2026-10-11T10:04:00Z", "https://chatgpt.com/")],
    ["another collector", sent(id, "2026-10-11T10:05:00Z", "https://chatgpt.com/c/other-collector", { producer: { id: "collector:somebody-else", kind: "COLLECTOR" } })],
    ["another summary", [receipt("MISSION_CONTROL_SOMETHING_ELSE_V1", id, "2026-10-11T10:06:00Z", ["generation_state:STARTED", "conversation_url:https://chatgpt.com/c/other-summary"])]],
    ["before it was queued", sent(id, "2026-10-11T09:59:00Z", "https://chatgpt.com/c/before-queued")],
    ["dated after now", sent(id, "2026-10-11T12:30:00Z", "https://chatgpt.com/c/from-the-future")],
    ["another supervisor", sent(id, "2026-10-11T10:07:00Z", "https://chatgpt.com/c/wrong-supervisor", { supervisor: "someone-else" })],
  ];
  for (const [what, receipts] of variants) {
    const activity = activityOf([queued, ...receipts]);
    assert.deepEqual([activity.requests[0].state, activity.requests[0].conversationUrl, latestSupervisorConversation(activity)], ["QUEUED", null, null], what);
  }
  const reached = activityOf([queued, ...sent(id, "2026-10-11T10:08:00Z", "https://chatgpt.com/c/the-chat")]);
  assert.equal(reached.requests[0].state, "SENT", "the trusted relay's receipts for the question's own session do count");
  assert.equal(reached.requests[0].conversationUrl, "https://chatgpt.com/c/the-chat");
});

test("relay receipts count only when bound as Mission Control's validators bind them: session, role, step, prompt and controls", () => {
  const id = "fleet-review:bound";
  const url = "https://chatgpt.com/c/bound-chat";
  const at = (minute: number) => `2026-10-11T10:0${minute}:00Z`;
  const queued = route(id, at(0));
  const view = (...receipts: StoredEvent[]) => {
    const [request] = activityOf([queued, ...receipts]).requests;
    return { state: request.state, chat: request.conversationUrl };
  };
  const nothing = { state: "QUEUED", chat: null };
  const sentHere = { state: "SENT", chat: url };
  // Before the send: the model controls seen, the body committed, the session's exact conversation.
  const ready = (sessionOptions: ReceiptOptions & { role?: string } = {}) => [modelSeen(id, at(1)), preSend(id, at(1)), session(id, at(1), url, "ACTIVE", sessionOptions)];
  const start = (options: ReceiptOptions & { step?: string; prompt?: string; app?: string } = {}) => stage(id, at(2), "STARTED", url, options);
  assert.deepEqual(view(...ready(), start()), sentHere);
  // A trusted receipt with only the request, the supervisor and a completion binds to no session.
  assert.deepEqual(view(
    receipt(SESSION, id, at(1), ["lifecycle_status:COMPLETE", `conversation_url:${url}`], { without: ["provider_session"] }),
    receipt(STAGE, id, at(1), ["generation_state:COMPLETE", `conversation_url:${url}`], { without: ["provider_session"] }),
  ), nothing);
  // The session needs the in-band role, the first message and an exact conversation; a receipt naming two requests names none.
  assert.deepEqual(view(...ready({ role: "REQUEST_BOUND_DECISION_SESSION" }), start()), nothing);
  assert.deepEqual(view(...ready({ without: ["message_ordinal"], refs: ["message_ordinal:2"] }), start()), nothing);
  assert.deepEqual(view(...ready({ without: ["url_binding_status"], refs: ["url_binding_status:PENDING_PROVIDER_ASSIGNMENT"] }), start()), nothing);
  assert.deepEqual(view(...ready({ refs: ["request:fleet-review:other"] }), start()), nothing);
  // Nothing is sent until the first message starts; a session closed without that, or a completion alone, is neither sent nor finished.
  assert.deepEqual(view(...ready()), nothing, "a chat opened for the question isn't offered until the question is sent in it");
  assert.deepEqual(view(modelSeen(id, at(1)), preSend(id, at(1)), session(id, at(1), url, "COMPLETE")), nothing);
  assert.deepEqual(view(...ready(), stage(id, at(3), "COMPLETE", url)), nothing);
  // The stage needs the in-band step, the first message, the session's conversation and the session itself.
  assert.deepEqual(view(...ready(), start({ step: "MCP_BINDING_PRELOAD" })), nothing);
  assert.deepEqual(view(...ready(), start({ without: ["first_message"] })), nothing);
  assert.deepEqual(view(...ready(), start({ without: ["message_ordinal"], refs: ["message_ordinal:2"] })), nothing);
  assert.deepEqual(view(...ready(), stage(id, at(2), "STARTED", "https://chatgpt.com/c/another-chat")), nothing);
  assert.deepEqual(view(...ready(), start({ session: "ps-another" })), nothing);
  // It must send the committed body with the observed controls, through a read-only source app and without semantic authority.
  assert.deepEqual(view(...ready(), start({ prompt: "e".repeat(64) })), nothing, "a prompt other than the committed body");
  assert.deepEqual(view(...ready(), start({ without: ["prompt_sha256"] })), nothing);
  assert.deepEqual(view(...ready(), start({ without: ["model_ui_label"], refs: ["model_ui_label:Another model"] })), nothing, "other controls than observed");
  assert.deepEqual(view(...ready(), start({ without: ["thinking_visible_label"] })), nothing, "no control evidence");
  assert.deepEqual(view(...ready(), start({ app: "Mission Control" })), nothing);
  assert.deepEqual(view(...ready(), start({ without: ["semantic_authority"] })), nothing);
  assert.deepEqual(view(preSend(id, at(1)), session(id, at(1), url), start()), nothing, "no model observation");
  assert.deepEqual(view(modelSeen(id, at(1)), session(id, at(1), url), start()), nothing, "no pre-send body");
  assert.deepEqual(view(modelSeen(id, at(1)), preSend(id, at(1)), preSend(id, at(1), { body: "f".repeat(64) }), session(id, at(1), url), start()), nothing, "two bodies");
  assert.deepEqual(view(modelSeen(id, at(1)), preSend(id, at(1), { digest: "0".repeat(64) }), session(id, at(1), url), start()), nothing, "another request's envelope");
  assert.deepEqual(view(modelSeen(id, at(1)), preSend(id, at(1), { without: ["binding_protocol"] }), session(id, at(1), url), start()), nothing, "no binding protocol");
  assert.deepEqual(view(modelSeen(id, at(1)), preSend(id, at(1), { without: ["decision_receipt_target"], refs: ["decision_receipt_target:https://github.com/elsewhere/x/issues/9"] }),
    session(id, at(1), url), start()), nothing, "another receipt target");
  assert.deepEqual(view(preSend(id, at(1)), modelSeen(id, at(2)), session(id, at(1), url), stage(id, at(3), "STARTED", url)), nothing, "controls seen only after the body was committed");
  // A completion counts only in the session's conversation, after its start; a stage elsewhere unbinds the session.
  assert.deepEqual(view(...ready(), start(), stage(id, at(3), "COMPLETE", url)), { state: "FINISHED", chat: url });
  assert.deepEqual(view(...ready(), start(), stage(id, at(3), "COMPLETE", "https://chatgpt.com/c/another-chat")), nothing);
  // A session also named for another request, task or role, or whose address changed, counts for none.
  assert.deepEqual(view(...ready(), start(), stage("fleet-review:other", at(3), "STARTED", url, { session: `ps-${id}` })), nothing);
  assert.deepEqual(view(...ready(), start({ worker: "billing" })), nothing);
  assert.deepEqual(view(...ready(), start(), session(id, at(3), url, "ACTIVE", { role: "MC_BINDING_PRELOAD_SESSION" })), nothing);
  assert.deepEqual(view(...ready(), start(), session(id, at(3), "https://chatgpt.com/c/second-real")), nothing);
  // A second session opened but never sent in doesn't change which chat the question ran in.
  assert.deepEqual(view(...ready(), start(), session(id, at(4), "https://chatgpt.com/c/later-unsent", "ACTIVE", { session: "ps-retry" })), sentHere);

  // A V5 (request-bound) question binds with its own role and step, and never to a provisional conversation.
  const v5 = route("fleet-review:v5", at(0), { version: 5 });
  const v5state = (...receipts: StoredEvent[]) => activityOf([v5, ...receipts]).requests[0].state;
  assert.equal(v5state(...sentV5("fleet-review:v5", at(1), url)), "SENT");
  assert.equal(v5state(modelSeen("fleet-review:v5", at(1)), session("fleet-review:v5", at(1), url), stage("fleet-review:v5", at(2), "STARTED", url)),
    "QUEUED", "V6's role and step don't bind a V5 question");
  assert.equal(v5state(...sentV5("fleet-review:v5", at(1), "https://chatgpt.com/c/WEB:provisional")), "QUEUED");
  assert.equal(v5state(modelSeen("fleet-review:v5", at(1), V5), session("fleet-review:v5", at(1), url, "ACTIVE", V5),
    stage("fleet-review:v5", at(2), "STARTED", url, V5), stage("fleet-review:v5", at(3), "COMPLETE", url, { ...V5, prompt: "e".repeat(64) })), "QUEUED", "one prompt on every stage");
});

test("a relocated V6 question's transport is checked against the decision channel it was sent for", () => {
  const moved = "fleet-review:moved";
  const stayed = "fleet-review:stayed";
  // Both were sent while the decision channel was owner/receipts #1; the channel then moved, with a relocation for one.
  const events = bound([route(moved, "2026-10-11T10:00:00Z"), ...sent(moved, "2026-10-11T10:05:00Z", "https://chatgpt.com/c/moved-chat"),
    route(stayed, "2026-10-11T10:10:00Z"), ...sent(stayed, "2026-10-11T10:15:00Z", "https://chatgpt.com/c/stayed-chat")]);
  const relocate = (requestId: string, source = { repository: "owner/receipts", issue: 1 }) => parseGitHubReceiptPolicy(JSON.stringify({
    ...JSON.parse(receiptPolicy(true)), repository: "owner/private-receipts", decisionIssueNumber: 7,
    decisionReceiptRelocations: [{ requestId, sourceRepository: source.repository, sourceDecisionIssueNumber: source.issue,
      destinationRepository: "owner/private-receipts", destinationDecisionIssueNumber: 7, canonicalReceiptSha256: "a".repeat(64) }],
  }))!;
  const requests = admittedCycleRequests(byLedger(events)).admitted;
  const transport = supervisorTransport(requests, events, NOW, supervisorRelayContext(events, relocate(moved)));
  assert.equal(transport.get(moved)?.conversationUrl, "https://chatgpt.com/c/moved-chat", "checked against its original channel");
  assert.equal(transport.get(stayed), undefined, "without a relocation, a question is checked against the configured channel");
  const mismatched = supervisorTransport(requests, events, NOW, supervisorRelayContext(events, relocate(moved, { repository: "owner/elsewhere", issue: 3 })));
  assert.equal(mismatched.get(moved), undefined, "a relocation that doesn't match the question's route binds nothing");
});

test("a question sent in more than one session, or a V6 question started twice, is flagged, with no chat", () => {
  const id = "fleet-review:twice";
  const queued = route(id, "2026-10-11T10:00:00Z");
  const first = "https://chatgpt.com/c/first-chat";
  const second = "https://chatgpt.com/c/second-chat";
  const twice = activityOf([queued, ...sent(id, "2026-10-11T10:01:00Z", first), ...sent(id, "2026-10-11T10:02:00Z", second, { session: "ps-second" })]);
  assert.deepEqual([twice.requests[0].state, twice.requests[0].sentAt, twice.requests[0].conversationUrl], ["DUPLICATE_SEND", "2026-10-11T10:01:00Z", null]);
  assert.equal(supervisorStatusLine(twice, NOW), "Asked 2 hours ago; sent more than once, so its answer can't be accepted.");
  assert.equal(twice.latestConversationUrl, null, "no one chat is the question's");
  assert.equal(twice.lastSentAt, "2026-10-11T10:01:00Z");
  // A start in another session counts even when that session never bound, as it does for the validators.
  assert.equal(activityOf([queued, ...sent(id, "2026-10-11T10:01:00Z", first),
    stage(id, "2026-10-11T10:02:00Z", "STARTED", second, { session: "ps-unbound" })]).requests[0].state, "DUPLICATE_SEND");
  assert.equal(activityOf([queued, ...sent(id, "2026-10-11T10:01:00Z", first), stage(id, "2026-10-11T10:03:00Z", "STARTED", first)]).requests[0].state,
    "DUPLICATE_SEND", "a V6 question started twice in its session");
  const once = activityOf([route("fleet-review:v5-twice", "2026-10-11T10:00:00Z", { version: 5 }), ...sentV5("fleet-review:v5-twice", "2026-10-11T10:02:00Z", first),
    stage("fleet-review:v5-twice", "2026-10-11T10:03:00Z", "STARTED", first, V5)]);
  assert.deepEqual([once.requests[0].state, once.requests[0].sentAt], ["SENT", "2026-10-11T10:02:00Z"], "a V5 question takes its first start");
  const late = activityOf([route(id, "2026-10-10T09:00:00Z", { expiresAt: "2026-10-11T09:00:00Z" }), ...sent(id, "2026-10-10T09:01:00Z", first),
    ...sent(id, "2026-10-10T09:02:00Z", second, { session: "ps-second" })]);
  assert.equal(late.requests[0].state, "NO_ANSWER");
  assert.equal(pendingRoute({ state: "DUPLICATE_SEND" }), true, "still pending for Mission Control until it expires or is replaced");
});

test("an activity state without the times it is about is not accepted", () => {
  const good = activityOf([route("fleet-review:1", "2026-10-11T10:00:00Z"), ...sent("fleet-review:1", "2026-10-11T10:05:00Z", "https://chatgpt.com/c/real-123")]);
  const request = good.requests[0];
  const times = { sentAt: "2026-10-11T10:05:00Z", finishedAt: "2026-10-11T10:06:00Z", answeredAt: "2026-10-11T10:07:00Z", expiresAt: "2026-10-12T12:00:00Z" };
  const required: Array<[string, keyof typeof times]> = [["SENT", "sentAt"], ["FINISHED", "sentAt"], ["FINISHED", "finishedAt"], ["DUPLICATE_SEND", "sentAt"],
    ["ANSWERED", "answeredAt"], ["NO_ANSWER", "sentAt"], ["NO_ANSWER", "expiresAt"], ["EXPIRED", "expiresAt"], ["EXPIRED_UNSENT", "expiresAt"]];
  for (const [state, time] of required) {
    const filled = { ...request, ...times, state };
    assert.equal(isSupervisorActivity({ ...good, requests: [filled] }), true, `${state} with its times`);
    assert.equal(isSupervisorActivity({ ...good, requests: [{ ...filled, [time]: null }] }), false, `${state} without ${time}`);
  }
  assert.equal(isSupervisorActivity({ ...good, requests: [{ ...request, sentAt: "yesterday" }] }), false);
  assert.equal(isSupervisorActivity({ ...good, requests: [{ ...request, queuedAt: "soon" }] }), false);
  assert.equal(isSupervisorActivity({ ...good, lastSentAt: "never" }), false);
  assert.equal(supervisorStatusLine({ ...good, requests: [{ ...request, sentAt: null }] }, NOW), "Not available right now.");
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
    assert.deepEqual(worker.supervisorActivity, { requests: [], total: 0, answered: 0, lastAnsweredAt: null, latestConversationUrl: null, lastSentAt: null, states: {}, routeEvents: {} }, "every projected task carries its activity");
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
    // The snapshot builders read the real clock, so these times are an hour ago and the questions expire in a day.
    const at = (minutes: number) => new Date(Date.now() - 60 * 60_000 + minutes * 60_000).toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const one = movedTo(first, [route("fleet-review:one", at(0), { expiresAt }), ...sent("fleet-review:one", at(5), url, { session: "ps-shared" })], ledger.at(-1)!.sequence);
    const two = movedTo(second, [route("fleet-review:two", at(0), { expiresAt }), ...sent("fleet-review:two", at(6), url, { session: "ps-shared" })], one.at(-1)!.sequence);
    const own = movedTo(second, [route("fleet-review:own", at(10), { expiresAt }), ...sent("fleet-review:own", at(11), "https://chatgpt.com/c/own-chat")], two.at(-1)!.sequence);
    const events = bound([...ledger, ...one, ...two, ...own]);
    const requests = new Map(snapshotFromEvents(events).workers.flatMap((worker) => worker.supervisorActivity.requests).map((request) => [request.requestId, request]));
    assert.deepEqual([requests.get("fleet-review:one")?.state, requests.get("fleet-review:one")?.conversationUrl], ["QUEUED", null]);
    assert.deepEqual([requests.get("fleet-review:two")?.state, requests.get("fleet-review:two")?.conversationUrl], ["QUEUED", null]);
    assert.deepEqual([requests.get("fleet-review:own")?.state, requests.get("fleet-review:own")?.conversationUrl], ["SENT", "https://chatgpt.com/c/own-chat"]);
    const page = workerSnapshotFromEvents(events, first)!.worker.supervisorActivity.requests[0];
    assert.equal(page.state, "QUEUED", "the task's own page reads the whole ledger too");
    assert.equal(validTaskSnapshot(snapshotFromEvents(events)), true, "the server's own snapshot passes the dashboard's check");
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
    const events = bound(inSeededTask(store, [route("fleet-review:policy", "2026-10-11T10:00:00Z"),
      ...sent("fleet-review:policy", "2026-10-11T10:05:00Z", "https://chatgpt.com/c/policy-chat")]));
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
  assert.equal(supervisorActivity([good], NOW, admission([good], [])).total, 0, "a request Mission Control didn't admit is not shown");
  assert.equal(supervisorActivity([good], NOW, admission([good], ["fleet-review:good"])).total, 1);
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

test("a question is the exact route event Mission Control admitted, not another copy of its id", () => {
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    // An earlier copy that passes the shape checks but not Mission Control's parser (no nonce), then the admitted packet.
    const copy = route("fleet-review:same", "2026-10-11T09:00:00Z", { question: "An earlier copy", patch: { nonce: undefined } });
    const admitted = route("fleet-review:same", "2026-10-11T09:30:00Z", { question: "The admitted question" });
    const projected = projectWorker(inSeededTask(store, [copy, admitted]), NOW);
    assert.deepEqual(projected.supervisorActivity.requests.map((request) => [request.requestId, request.question, request.queuedAt]),
      [["fleet-review:same", "The admitted question", "2026-10-11T09:30:00Z"]]);
    const unit = supervisorActivity([copy, admitted], NOW, { ...admission([copy, admitted], []), admitted: new Map([["fleet-review:same", admitted.sequence]]) });
    assert.equal(unit.requests[0].question, "The admitted question");
    // The supervision page lists that exact event once, not the copy.
    const rows = admittedRouteRows([projected]);
    assert.deepEqual(rows.map((row) => [row.packet.factualPacket.decisionRequested, row.event.sequence]),
      [["The admitted question", projected.supervisorActivity.routeEvents["fleet-review:same"]]]);
  } finally { store.close(); }
});

test("a replacement counts only when Mission Control admits it", () => {
  const first = route("fleet-review:first", "2026-10-11T09:00:00Z");
  const second = route("fleet-review:second", "2026-10-11T09:30:00Z", { supersedes: "fleet-review:first" });
  const admittedReplacement = supervisorActivity([first, second], NOW, admission([first, second], ["fleet-review:first", "fleet-review:second"], ["fleet-review:first"]));
  assert.deepEqual(admittedReplacement.states, { "fleet-review:first": "REPLACED", "fleet-review:second": "QUEUED" });
  const rejectedReplacement = supervisorActivity([first, second], NOW, admission([first, second], ["fleet-review:first"]));
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
  // 05:00-05:00 is 10:00Z, later than 09:30Z, though it sorts earlier as text.
  // A V5 question (the validator takes its earliest start, so two starts in one session are allowed there).
  const url = "https://chatgpt.com/c/offset-chat";
  const bound = V5;
  const offset = activityOf([
    route("fleet-review:offsets", "2026-10-11T09:00:00Z", { version: 5 }),
    modelSeen("fleet-review:offsets", "2026-10-11T09:01:00Z", bound),
    session("fleet-review:offsets", "2026-10-11T09:01:00Z", url, "ACTIVE", bound),
    stage("fleet-review:offsets", "2026-10-11T09:30:00Z", "STARTED", url, bound),
    stage("fleet-review:offsets", "2026-10-11T05:00:00-05:00", "STARTED", url, bound),
    stage("fleet-review:offsets", "2026-10-11T09:40:00Z", "COMPLETE", url, bound),
    stage("fleet-review:offsets", "2026-10-11T05:05:00-05:00", "COMPLETE", url, bound),
  ]);
  assert.equal(offset.requests[0].sentAt, "2026-10-11T09:30:00Z", "the earliest start is the send");
  assert.equal(offset.requests[0].finishedAt, "2026-10-11T05:05:00-05:00", "the latest completion is the finish");
  assert.equal(lastSupervisorQuestionSentAt([{ ...offset, lastSentAt: "2026-10-11T09:30:00Z" }, { ...offset, lastSentAt: "2026-10-11T05:00:00-05:00" }]), "2026-10-11T05:00:00-05:00");
  const answers = activityOf([
    route("fleet-review:x", "2026-10-11T08:00:00Z"), decision("fleet-review:x", "2026-10-11T14:30:00Z"),
    route("fleet-review:y", "2026-10-11T08:10:00Z"), decision("fleet-review:y", "2026-10-11T10:00:00-05:00"),
  ]);
  assert.equal(answers.lastAnsweredAt, "2026-10-11T10:00:00-05:00");
});
