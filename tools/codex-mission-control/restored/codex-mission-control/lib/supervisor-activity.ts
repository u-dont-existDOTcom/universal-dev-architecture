import type { StoredEvent } from "./schema";
import { isSpecificChatAddress } from "./supervisor-chat-address";

/**
 * What a task's supervisor has been doing, from the ledger: each question Mission Control queued for a supervisor
 * chat, whether the relay sent it (and to which ChatGPT conversation), whether the supervisor finished, and the
 * answer that came back. Current questions (V5/V6) each open a fresh conversation, so "the supervisor chat" of a task
 * is the conversation of its latest request. Read-only: nothing here changes what Mission Control sends or accepts.
 *
 * States: QUEUED (no send recorded yet), WAITING (no answer yet, for a route whose sending this view doesn't track),
 * SENT and FINISHED (the relay started or finished the question in the request's own session), DUPLICATE_SEND (sent
 * more than once, which Mission Control's validators reject, so no answer to it can be accepted), ANSWERED,
 * ANSWERED_DUPLICATE_SEND (answered, and also sent more than once: the violation stays visible), NO_ANSWER
 * (sent, then expired without an answer), NO_ANSWER_DUPLICATE_SEND (sent more than once, then expired without one), EXPIRED (expired without an answer, with no send recorded or tracked),
 * EXPIRED_UNSENT and WITHDRAWN (retired with Mission Control's proof that nothing was sent: on expiry, or withdrawn),
 * REPLACED (an admitted replacement superseded it).
 */
export const SUPERVISOR_REQUEST_STATES = [
  "QUEUED", "WAITING", "SENT", "FINISHED", "DUPLICATE_SEND", "ANSWERED", "ANSWERED_DUPLICATE_SEND", "NO_ANSWER",
  "NO_ANSWER_DUPLICATE_SEND", "EXPIRED", "EXPIRED_UNSENT", "WITHDRAWN", "REPLACED",
] as const;
export const SUPERVISOR_REQUEST_ORIGINS = [
  "ROUTINE_CHECK", "WORK_QUESTION", "OWNER_ANSWER", "AFTER_WORK", "SOURCE_REVIEW", "OTHER",
] as const;
export type SupervisorRequestState = typeof SUPERVISOR_REQUEST_STATES[number];
export type SupervisorRequestOrigin = typeof SUPERVISOR_REQUEST_ORIGINS[number];

export interface SupervisorRequestActivity {
  requestId: string;
  origin: SupervisorRequestOrigin;
  supervisorId: string | null;
  question: string | null;
  queuedAt: string;
  expiresAt: string | null;
  state: SupervisorRequestState;
  sentAt: string | null;
  finishedAt: string | null;
  answeredAt: string | null;
  answer: string | null;
  conversationUrl: string | null;
}

export interface SupervisorActivity {
  /** Newest first, at most {@link RECENT_REQUESTS}. */
  requests: SupervisorRequestActivity[];
  /**
   * The older questions (not listed) that the latest chat, the last send and the last answer below come from, so those
   * can be checked against the questions themselves; at most one each.
   */
  evidence: SupervisorRequestActivity[];
  total: number;
  answered: number;
  lastAnsweredAt: string | null;
  /** The chat of the newest question that reached ChatGPT, among all of them, not only the ones listed. */
  latestConversationUrl: string | null;
  /** When the relay last started sending one of these questions to ChatGPT, among all of them. */
  lastSentAt: string | null;
  /** The state of every question, by request id, so other views use the same admitted set. */
  states: Record<string, SupervisorRequestState>;
  /** The sequence of every question's route event, by request id: the exact event shown, never another copy of its id. */
  routeEvents: Record<string, number>;
}

export const RECENT_REQUESTS = 5;
const ROUTE_PREFIX = /^MISSION_CONTROL_INTERNAL_SUPERVIS(?:ORY_CYCLE_V[2-6]|OR_ROUTE_V1)\n/;
const CYCLE_VERSION = /^MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V([2-6])\n/;
const INTERNAL_ROUTE_PREFIX = "MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1\n";
// The relay's provider-session and stage receipts, read here only to find provider sessions it reused.
const SESSION_SUMMARY = "MISSION_CONTROL_PROVIDER_SESSION_V1";
const STAGE_SUMMARY = "MISSION_CONTROL_RELAY_STAGE_V1";
const QUESTION_LIMIT = 400;
const ANSWER_LIMIT = 600;

/**
 * What the relay's own receipts show about one V5 or V6 question, as the server works it out with Mission Control's
 * request-bound and in-band validators' own rules (`requestBoundTransportEvidence`, `inBandTransportEvidence`): when it
 * was sent and finished in its own session, and that session's conversation; or that it was sent in more than one
 * session (or, for V6, started twice), which the validators reject.
 */
export interface SupervisorTransportEvidence {
  providerSessionId: string | null;
  sentAt: string;
  finishedAt: string | null;
  conversationUrl: string | null;
  duplicateSend: boolean;
}

export const emptySupervisorActivity: SupervisorActivity = { requests: [], evidence: [], total: 0, answered: 0, lastAnsweredAt: null, latestConversationUrl: null, lastSentAt: null, states: {}, routeEvents: {} };

interface Draft extends SupervisorRequestActivity { sequence: number; version: number; worker: string; duplicateSend: boolean }

/**
 * What a request in each state may carry beyond the times it must (STATE_TIMES): a send time, a finish time and a chat
 * only once it was sent (no finish or chat for a duplicate send), an answer only when answered. Anything else is not
 * a state Mission Control produces.
 */
const STATE_ALLOWS: Record<SupervisorRequestState, { sent?: true; finished?: true; chat?: true; answered?: true }> = {
  QUEUED: {}, WAITING: {}, EXPIRED: {}, EXPIRED_UNSENT: {}, WITHDRAWN: {},
  SENT: { sent: true, chat: true }, FINISHED: { sent: true, finished: true, chat: true }, NO_ANSWER: { sent: true, finished: true, chat: true },
  DUPLICATE_SEND: { sent: true }, NO_ANSWER_DUPLICATE_SEND: { sent: true },
  ANSWERED: { sent: true, finished: true, chat: true, answered: true }, ANSWERED_DUPLICATE_SEND: { sent: true, answered: true },
  REPLACED: { sent: true, finished: true, chat: true },
};

/** The times each state is about: a request in that state always has them (and every time it has is a valid instant). */
const STATE_TIMES: Partial<Record<SupervisorRequestState, ReadonlyArray<"expiresAt" | "sentAt" | "finishedAt" | "answeredAt">>> = {
  SENT: ["sentAt"], FINISHED: ["sentAt", "finishedAt"], DUPLICATE_SEND: ["sentAt"], ANSWERED: ["answeredAt"],
  ANSWERED_DUPLICATE_SEND: ["answeredAt", "sentAt"],
  NO_ANSWER: ["sentAt", "expiresAt"], NO_ANSWER_DUPLICATE_SEND: ["sentAt", "expiresAt"], EXPIRED: ["expiresAt"], EXPIRED_UNSENT: ["expiresAt"],
};

/**
 * What Mission Control itself accepts, worked out on the server: the cycle requests (V2-V6) it admits
 * (`admittedCycleRequests`: its request parser and replacement rules), each by the exact route event admitted; the
 * admitted ones an admitted replacement superseded; the ones retired with its no-send proof (`retiredUnsentRequests`);
 * whether sending is tracked at all (the receipt policy's request-bound protocol is enabled); and, per V5/V6 question,
 * the transport evidence its validators' rules accept.
 */
export interface SupervisorRequestAdmission {
  /** Request id -> the sequence of the route event Mission Control admitted for it. */
  admitted: ReadonlyMap<string, number>;
  replaced: ReadonlySet<string>;
  /** Retired before anything was sent: by the fleet check because it expired, or withdrawn. */
  retired: ReadonlyMap<string, "EXPIRED_UNSENT" | "WITHDRAWN">;
  tracksTransport: boolean;
  transport: ReadonlyMap<string, SupervisorTransportEvidence>;
}

export function supervisorActivity(events: readonly StoredEvent[], now: Date, admission: SupervisorRequestAdmission): SupervisorActivity {
  const { requests: all, routeEvents: routeEventOf } = projectRequests(events, now, admission);
  if (!all.length) return emptySupervisorActivity;
  const listed = all.slice(0, RECENT_REQUESTS);
  // `all` is newest first, so the first question with a chat is the newest one that reached a chat.
  const { latestConversation, lastSent, lastAnswered } = aggregateSources(all);
  const listedIds = new Set(listed.map((request) => request.requestId));
  const evidence = [...new Map([latestConversation, lastSent, lastAnswered]
    .filter((request): request is SupervisorRequestActivity => request !== null && !listedIds.has(request.requestId))
    .map((request) => [request.requestId, request])).values()];
  return {
    requests: listed,
    evidence,
    total: all.length,
    answered: all.filter((request) => request.answeredAt).length,
    lastAnsweredAt: lastAnswered?.answeredAt ?? null,
    latestConversationUrl: latestConversation?.conversationUrl ?? null,
    lastSentAt: lastSent?.sentAt ?? null,
    states: Object.fromEntries(all.map((request) => [request.requestId, request.state])),
    routeEvents: Object.fromEntries(all.map((request) => [request.requestId, routeEventOf.get(request.requestId)!])),
  };
}

/** Among questions in newest-first order: the newest that reached a chat, the latest send and the latest answer. */
function aggregateSources(newestFirst: readonly SupervisorRequestActivity[]) {
  const latestBy = (time: (request: SupervisorRequestActivity) => string | null) => newestFirst.reduce<SupervisorRequestActivity | null>((best, request) => {
    const value = time(request);
    if (value === null || !Number.isFinite(instant(value))) return best;
    return best === null || instant(value) > instant(time(best)!) ? request : best;
  }, null);
  return {
    latestConversation: newestFirst.find((request) => request.conversationUrl) ?? null,
    lastSent: latestBy((request) => request.sentAt),
    lastAnswered: latestBy((request) => request.answeredAt),
  };
}

/**
 * Questions still in flight, as Mission Control's own pending set has them: queued, waiting, sent (once or more), or
 * finished without a recorded answer, and not expired.
 */
export function isPendingSupervisorRequest(request: Pick<SupervisorRequestActivity, "state">): boolean {
  return request.state === "QUEUED" || request.state === "WAITING" || request.state === "SENT" || request.state === "FINISHED"
    || request.state === "DUPLICATE_SEND";
}

/** Every supervisor question in these events with its current state, newest first. */
export function supervisorRequests(events: readonly StoredEvent[], now: Date, admission: SupervisorRequestAdmission): SupervisorRequestActivity[] {
  return projectRequests(events, now, admission).requests;
}

/** The questions, newest first, and the sequence of the route event each one is. */
function projectRequests(unordered: readonly StoredEvent[], now: Date, admission: SupervisorRequestAdmission): { requests: SupervisorRequestActivity[]; routeEvents: Map<string, number> } {
  // Callers pass ledger order or a newest-first timeline; read oldest first either way.
  const events = [...unordered].sort((a, b) => a.sequence - b.sequence);
  const drafts = new Map<string, Draft>();
  for (const event of events) {
    const data = event.data;
    if (data.type !== "worker_message_recorded" || typeof data.body !== "string" || !ROUTE_PREFIX.test(data.body)) continue;
    const packet = parsePacket(data.body);
    const requestId = text(packet?.requestId);
    if (!packet || !requestId || drafts.has(requestId) || !event.worker || !routeLooksValid(data.body, packet, event.worker)) continue;
    // A cycle question counts only as the exact route event Mission Control admitted, never an earlier or replayed copy.
    if (!data.body.startsWith(INTERNAL_ROUTE_PREFIX) && admission.admitted.get(requestId) !== event.sequence) continue;
    const factual = record(packet.factualPacket);
    drafts.set(requestId, {
      requestId,
      origin: originOf(requestId),
      supervisorId: text(packet?.destinationSupervisorId) ?? text(packet?.destinationChatId),
      question: shorten(text(factual?.decisionRequested) ?? text(packet?.continuationOwnerResponseExactText), QUESTION_LIMIT),
      queuedAt: timestamp(packet?.queuedAt) ?? event.occurredAt,
      expiresAt: timestamp(packet?.expiresAt),
      state: "QUEUED",
      sentAt: null, finishedAt: null, answeredAt: null, answer: null, conversationUrl: null,
      sequence: event.sequence,
      version: Number(CYCLE_VERSION.exec(data.body)?.[1] ?? 1),
      worker: event.worker,
      duplicateSend: false,
    });
  }
  if (!drafts.size) return { requests: [], routeEvents: new Map() };

  for (const event of events) {
    const data = event.data;
    if (data.type !== "github_decision_receipt_ingested") continue;
    const draft = drafts.get(data.request_id);
    if (!draft || draft.answeredAt) continue;
    draft.answeredAt = timestamp(data.ingested_at) ?? event.occurredAt;
    draft.answer = shorten(answerOf(data), ANSWER_LIMIT);
  }

  const nowMs = now.getTime();
  const all = [...drafts.values()].map((draft): SupervisorRequestActivity => {
    // Sending is tracked only where Mission Control's validators bind the relay's receipts to the request (V5/V6) and
    // the receipt policy enables them.
    const tracked = (draft.version === 5 || draft.version === 6) && admission.tracksTransport;
    const evidence = tracked ? admission.transport.get(draft.requestId) : undefined;
    const sentAt = evidence ? timestamp(evidence.sentAt) : null;
    if (evidence && sentAt && instant(sentAt) <= nowMs) {
      draft.sentAt = sentAt;
      draft.duplicateSend = evidence.duplicateSend;
      const finishedAt = evidence.duplicateSend ? null : timestamp(evidence.finishedAt);
      draft.finishedAt = finishedAt && instant(finishedAt) >= instant(sentAt) ? finishedAt : null;
      draft.conversationUrl = !evidence.duplicateSend && isSpecificChatAddress(evidence.conversationUrl) ? evidence.conversationUrl : null;
    }
    const expired = draft.expiresAt !== null && Date.parse(draft.expiresAt) <= nowMs;
    // A retirement for expiry names the expiry; without one on the route it reads as a plain withdrawal.
    const retired = admission.retired.get(draft.requestId);
    const retiredState = retired === "EXPIRED_UNSENT" && draft.expiresAt === null ? "WITHDRAWN" : retired;
    if (retiredState && !draft.answeredAt && !admission.replaced.has(draft.requestId)) {
      // Retired with the proof that nothing was sent: no send, finish or chat goes with it.
      draft.sentAt = null; draft.finishedAt = null; draft.conversationUrl = null; draft.duplicateSend = false;
    }
    // An answer doesn't hide a duplicate send: both show.
    const state: SupervisorRequestState = draft.answeredAt ? (draft.duplicateSend ? "ANSWERED_DUPLICATE_SEND" : "ANSWERED")
      : admission.replaced.has(draft.requestId) ? "REPLACED"
        : retiredState
          ?? (!tracked ? (expired ? "EXPIRED" : "WAITING")
            : draft.duplicateSend ? (expired ? "NO_ANSWER_DUPLICATE_SEND" : "DUPLICATE_SEND")
              : draft.sentAt ? (expired ? "NO_ANSWER" : draft.finishedAt ? "FINISHED" : "SENT")
                : expired ? "EXPIRED" : "QUEUED");
    return {
      requestId: draft.requestId, origin: draft.origin, supervisorId: draft.supervisorId, question: draft.question,
      queuedAt: draft.queuedAt, expiresAt: draft.expiresAt, state, sentAt: draft.sentAt, finishedAt: draft.finishedAt,
      answeredAt: draft.answeredAt, answer: draft.answer, conversationUrl: draft.conversationUrl,
    };
  });
  const order = new Map([...drafts.values()].map((draft) => [draft.requestId, draft.sequence]));
  return { requests: all.sort((a, b) => (order.get(b.requestId) ?? 0) - (order.get(a.requestId) ?? 0)), routeEvents: order };
}

/**
 * The provider sessions the trusted relay's provider-session and stage receipts name for more than one worker, request
 * or supervisor, or with more than one session role (never a worker's, supervisor's or other collector's claim). A
 * relay never reuses a session and Mission Control's validators never accept a reused one, so give this the whole
 * ledger: such a session counts for no question.
 */
export function conflictedRelaySessions(events: readonly StoredEvent[], relays: ReadonlySet<string>): Set<string> {
  const sessions = new Map<string, { owner: string; conflict: boolean; roles: Set<string | null> }>();
  for (const event of events) {
    const data = event.data;
    if (data.type !== "evidence_receipt_recorded" || data.verified !== true
      || (data.summary !== SESSION_SUMMARY && data.summary !== STAGE_SUMMARY)
      || event.producerKind !== "COLLECTOR" || !relays.has(event.producerId)
      || data.producer_id !== event.producerId || data.producer_role !== "COLLECTOR") continue;
    const session = refValue(data.refs, "provider_session");
    if (!session) continue;
    const owner = JSON.stringify([event.worker ?? null, refValue(data.refs, "request"), refValue(data.refs, "supervisor")]);
    const use = sessions.get(session) ?? { owner, conflict: false, roles: new Set<string | null>() };
    if (use.owner !== owner) use.conflict = true;
    if (data.summary === SESSION_SUMMARY) use.roles.add(refValue(data.refs, "session_role"));
    sessions.set(session, use);
  }
  return new Set([...sessions].flatMap(([session, use]) => use.conflict || use.roles.size > 1 ? [session] : []));
}

/**
 * Whether a value has the full shape of a task's supervisor activity: every time a valid instant, each state with the
 * times it is about (a sent question its send time, an answered one its answer time...), and every chat address naming
 * one ChatGPT conversation. Anything else (missing, malformed, another build's) is unknown, never an empty history: the dashboard
 * and the supervision page refuse such a refresh, and every view says it isn't available.
 */
export function isSupervisorActivity(value: unknown): value is SupervisorActivity {
  const activity = record(value);
  if (!activity || typeof activity.total !== "number" || typeof activity.answered !== "number") return false;
  if (!timeOrNull(activity.lastAnsweredAt) || !chatAddressOrNull(activity.latestConversationUrl) || !timeOrNull(activity.lastSentAt)) return false;
  const states = record(activity.states);
  if (!states || !Object.values(states).every((state) => (SUPERVISOR_REQUEST_STATES as readonly unknown[]).includes(state))) return false;
  const routeEvents = record(activity.routeEvents);
  if (!routeEvents || Object.keys(routeEvents).length !== Object.keys(states).length
    || !Object.keys(states).every((requestId) => Number.isSafeInteger(routeEvents[requestId]))
    || new Set(Object.values(routeEvents)).size !== Object.keys(routeEvents).length) return false;
  if (!Array.isArray(activity.requests) || activity.requests.length > RECENT_REQUESTS) return false;
  // The listed questions, the state of every question and the totals all describe one set: they must agree.
  const stateValues = Object.values(states);
  if (activity.total !== stateValues.length
    || activity.answered !== stateValues.filter((state) => state === "ANSWERED" || state === "ANSWERED_DUPLICATE_SEND").length) return false;
  const listed = activity.requests.map((item: unknown) => record(item)?.requestId);
  // The listed questions are exactly the newest ones (by route event), newest first: never a subset or another order.
  const newestIds = Object.keys(states).sort((a, b) => Number(routeEvents[b]) - Number(routeEvents[a])).slice(0, RECENT_REQUESTS);
  if (listed.length !== newestIds.length || listed.some((requestId, index) => requestId !== newestIds[index])) return false;
  if (!Array.isArray(activity.evidence) || activity.evidence.length > 3) return false;
  const evidenceIds = activity.evidence.map((item: unknown) => record(item)?.requestId);
  if (new Set([...listed, ...evidenceIds]).size !== listed.length + evidenceIds.length) return false;
  const pool = [...activity.requests, ...activity.evidence] as unknown[];
  if (!pool.every((item) => requestFits(item, states))) return false;
  // The latest chat, last send and last answer must be what these questions record, newest first by route event.
  const newestFirst = (pool as SupervisorRequestActivity[]).slice().sort((a, b) => Number(routeEvents[b.requestId]) - Number(routeEvents[a.requestId]));
  const sources = aggregateSources(newestFirst);
  return (sources.latestConversation?.conversationUrl ?? null) === activity.latestConversationUrl
    && sameInstant(sources.lastSent?.sentAt ?? null, activity.lastSentAt as string | null)
    && sameInstant(sources.lastAnswered?.answeredAt ?? null, activity.lastAnsweredAt as string | null);
}

function sameInstant(a: string | null, b: string | null): boolean {
  return a === null || b === null ? a === b : instant(a) === instant(b);
}

/** One question's entry: valid fields, the times its state is about and nothing it can't carry, as the state map has it. */
function requestFits(item: unknown, states: Record<string, unknown>): boolean {
  const request = record(item);
  return request !== null && typeof request.requestId === "string" && timeOrNull(request.queuedAt) && request.queuedAt !== null
    && (SUPERVISOR_REQUEST_STATES as readonly unknown[]).includes(request.state)
    && request.origin === originOf(request.requestId)
    && ["supervisorId", "question", "answer"].every((key) => nullableString(request[key]))
    && ["expiresAt", "sentAt", "finishedAt", "answeredAt"].every((key) => timeOrNull(request[key]))
    && (STATE_TIMES[request.state as SupervisorRequestState] ?? []).every((key) => request[key] !== null)
    && fieldsFitState(request)
    && chatAddressOrNull(request.conversationUrl)
    && Object.hasOwn(states, request.requestId) && states[request.requestId] === request.state;
}

/**
 * The newest time any of these tasks' supervisor questions started going to ChatGPT; undefined when a task's activity
 * isn't known (missing or malformed), since then nobody can say.
 */
export function lastSupervisorQuestionSentAt(activities: ReadonlyArray<unknown>): string | null | undefined {
  const known = activities.filter(isSupervisorActivity);
  if (known.length !== activities.length) return undefined;
  return latestInstant(known.map((activity) => activity.lastSentAt));
}

/** The conversation to open for "what is the supervisor doing": the newest request that reached a chat. */
export function latestSupervisorConversation(activity: unknown): string | null {
  if (!isSupervisorActivity(activity)) return null;
  return activity.latestConversationUrl ?? activity.requests.find((request) => request.conversationUrl)?.conversationUrl ?? null;
}

function originOf(requestId: string): SupervisorRequestOrigin {
  if (requestId.startsWith("fleet-review:")) return "ROUTINE_CHECK";
  if (requestId.startsWith("work-owner-continuation:")) return "OWNER_ANSWER";
  if (requestId.startsWith("work-question:")) return "WORK_QUESTION";
  if (requestId.startsWith("post-work-review:")) return "AFTER_WORK";
  if (requestId.startsWith("source-review:")) return "SOURCE_REVIEW";
  return "OTHER";
}

function answerOf(data: Extract<StoredEvent["data"], { type: "github_decision_receipt_ingested" }>): string | null {
  const summary = text(data.bounded_execution?.reasoning_summary);
  if (summary) return summary;
  if (data.owner_action?.kind === "DECISION_REQUIRED") return `Asks you to decide: ${data.owner_action.question}`;
  return text(data.decision_block.exact_text);
}

/**
 * Structural checks every route packet must pass to count as a question: the version its prefix names, its packet kind,
 * a queued delivery state, this worker, a destination supervisor and a queue time (and, for provider-session cycles,
 * an expiry after it).
 */
function routeLooksValid(body: string, packet: Record<string, unknown>, worker: string): boolean {
  const version = /^MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V([2-6])\n/.exec(body)?.[1];
  const kind = version ? (version === "2" ? "SAME_CHAT_SUPERVISORY_CYCLE" : "PROVIDER_SESSION_SUPERVISORY_CYCLE") : "FACTUAL_STATE_ONLY";
  if (packet.schemaVersion !== (version ? Number(version) : 1) || packet.packetKind !== kind) return false;
  if (packet.providerDeliveryState !== "QUEUED_FOR_PROVIDER_RELAY") return false;
  if (packet.worker !== undefined && packet.worker !== worker) return false;
  const destination = version && version !== "2" ? packet.destinationSupervisorId : packet.destinationChatId;
  const queuedAt = timestamp(packet.queuedAt);
  if (!text(destination) || !queuedAt) return false;
  const factual = record(packet.factualPacket);
  if (!factual || !text(factual.taskId) || typeof factual.decisionRequested !== "string") return false;
  if (!version || version === "2") return true;
  const expiresAt = timestamp(packet.expiresAt);
  return Boolean(expiresAt && Date.parse(expiresAt) > Date.parse(queuedAt));
}

/** Timestamps may carry different UTC offsets; compare them as instants, never as text. */
function instant(value: string): number {
  return Date.parse(value);
}
function latestInstant(values: ReadonlyArray<string | null | undefined>): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (typeof value !== "string" || !Number.isFinite(instant(value))) continue;
    if (latest === null || instant(value) > instant(latest)) latest = value;
  }
  return latest;
}

function parsePacket(body: string): Record<string, unknown> | null {
  try {
    return record(JSON.parse(body.slice(body.indexOf("\n") + 1)));
  } catch {
    return null;
  }
}
/** A request's send time, finish time, chat and answer are ones its state can have, and a finish or chat comes with a send. */
function fieldsFitState(request: Record<string, unknown>): boolean {
  const allows = STATE_ALLOWS[request.state as SupervisorRequestState];
  return Boolean(allows)
    && (allows.sent || request.sentAt === null) && (allows.finished || request.finishedAt === null)
    && (allows.chat || request.conversationUrl === null) && (allows.answered || (request.answeredAt === null && request.answer === null))
    && (request.finishedAt === null || request.sentAt !== null) && (request.conversationUrl === null || request.sentAt !== null);
}
function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}
function timeOrNull(value: unknown): boolean {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}
/** A chat address in the activity is one specific ChatGPT conversation, or none: never a home, settings or other page. */
function chatAddressOrNull(value: unknown): boolean {
  return value === null || (typeof value === "string" && isSpecificChatAddress(value));
}
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function timestamp(value: unknown): string | null {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}
function shorten(value: string | null, limit: number): string | null {
  if (!value) return null;
  const single = value.replace(/\s+/g, " ").trim();
  return single.length <= limit ? single : `${single.slice(0, limit - 1).trimEnd()}…`;
}
function refValue(refs: readonly string[], key: string): string | null {
  const values = refs.filter((ref) => ref.startsWith(`${key}:`));
  return values.length === 1 ? values[0]!.slice(key.length + 1) : null;
}
