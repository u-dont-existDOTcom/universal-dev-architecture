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
 * more than once, which Mission Control's validators reject, so no answer to it can be accepted), ANSWERED, NO_ANSWER
 * (sent, then expired without an answer), EXPIRED (expired without an answer, with no send recorded or tracked),
 * EXPIRED_UNSENT and WITHDRAWN (retired with Mission Control's proof that nothing was sent: on expiry, or withdrawn),
 * REPLACED (an admitted replacement superseded it).
 */
export const SUPERVISOR_REQUEST_STATES = [
  "QUEUED", "WAITING", "SENT", "FINISHED", "DUPLICATE_SEND", "ANSWERED", "NO_ANSWER", "EXPIRED", "EXPIRED_UNSENT", "WITHDRAWN", "REPLACED",
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
  total: number;
  answered: number;
  lastAnsweredAt: string | null;
  /** The chat of the newest question that reached ChatGPT, among all of them, not only the ones listed. */
  latestConversationUrl: string | null;
  /** When the relay last started sending one of these questions to ChatGPT, among all of them. */
  lastSentAt: string | null;
  /** The state of every question, by request id, so other views use the same admitted set. */
  states: Record<string, SupervisorRequestState>;
}

export const RECENT_REQUESTS = 5;
const ROUTE_PREFIX = /^MISSION_CONTROL_INTERNAL_SUPERVIS(?:ORY_CYCLE_V[2-6]|OR_ROUTE_V1)\n/;
const CYCLE_VERSION = /^MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V([2-6])\n/;
const INTERNAL_ROUTE_PREFIX = "MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1\n";
// The relay's provider-session and stage receipts: the only transport evidence that says a question was sent, finished
// or ran in a given conversation.
const SESSION_SUMMARY = "MISSION_CONTROL_PROVIDER_SESSION_V1";
const STAGE_SUMMARY = "MISSION_CONTROL_RELAY_STAGE_V1";
const QUESTION_LIMIT = 400;
const ANSWER_LIMIT = 600;

/**
 * The route versions whose relay transport Mission Control binds to one request's own provider session, with the
 * session role, relay step and conversation address their validators require (V5: lib/request-bound-supervision.ts,
 * V6: lib/in-band-request-binding.ts; repeated here because those modules are server-only, and a test keeps them
 * equal). Older routes bind their sessions differently, so this view never shows them as sent: only as waiting,
 * answered or expired.
 */
export const SUPERVISOR_TRANSPORT_BINDINGS: Readonly<Record<number, { sessionRole: string; step: string; conversation: RegExp }>> = {
  5: { sessionRole: "REQUEST_BOUND_DECISION_SESSION", step: "REQUEST_BOUND_DECISION", conversation: /^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/ },
  6: { sessionRole: "IN_BAND_REQUEST_DECISION_SESSION", step: "IN_BAND_REQUEST_DECISION", conversation: /^https:\/\/chatgpt\.com\/c\/(?:WEB:)?[A-Za-z0-9_-]+$/ },
};

export const emptySupervisorActivity: SupervisorActivity = { requests: [], total: 0, answered: 0, lastAnsweredAt: null, latestConversationUrl: null, lastSentAt: null, states: {} };

interface Draft extends SupervisorRequestActivity { sequence: number; version: number; worker: string; duplicateSend: boolean }

/** The times each state is about: a request in that state always has them (and every time it has is a valid instant). */
const STATE_TIMES: Partial<Record<SupervisorRequestState, ReadonlyArray<"expiresAt" | "sentAt" | "finishedAt" | "answeredAt">>> = {
  SENT: ["sentAt"], FINISHED: ["sentAt", "finishedAt"], DUPLICATE_SEND: ["sentAt"], ANSWERED: ["answeredAt"],
  NO_ANSWER: ["sentAt", "expiresAt"], EXPIRED: ["expiresAt"], EXPIRED_UNSENT: ["expiresAt"],
};

/**
 * What Mission Control itself accepts, from its request admission and receipt policy: the cycle requests (V2-V6) it
 * admits (`admittedCycleRequests`: its request parser and replacement rules), the admitted ones an admitted replacement
 * superseded, the ones retired with its no-send proof (`retiredUnsentRequests`), the relay collectors (the policy's
 * request-bound relay producers) whose transport receipts count, and the provider sessions those receipts name for more
 * than one owner anywhere in the ledger.
 */
export interface SupervisorRequestAdmission {
  admitted: ReadonlySet<string>;
  replaced: ReadonlySet<string>;
  /** Retired before anything was sent: by the fleet check because it expired, or withdrawn. */
  retired: ReadonlyMap<string, "EXPIRED_UNSENT" | "WITHDRAWN">;
  trustedRelays: ReadonlySet<string>;
  /**
   * From the whole ledger (`conflictedRelaySessions`), not one task's events: a session reused for another task,
   * request or supervisor shows in neither.
   */
  conflictedSessions: ReadonlySet<string>;
}

export function supervisorActivity(events: readonly StoredEvent[], now: Date, admission: SupervisorRequestAdmission): SupervisorActivity {
  const all = supervisorRequests(events, now, admission);
  if (!all.length) return emptySupervisorActivity;
  const answered = all.filter((request) => request.answeredAt);
  return {
    requests: all.slice(0, RECENT_REQUESTS),
    total: all.length,
    answered: answered.length,
    lastAnsweredAt: latestInstant(answered.map((request) => request.answeredAt)),
    latestConversationUrl: all.find((request) => request.conversationUrl)?.conversationUrl ?? null,
    lastSentAt: latestInstant(all.map((request) => request.sentAt)),
    states: Object.fromEntries(all.map((request) => [request.requestId, request.state])),
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
export function supervisorRequests(unordered: readonly StoredEvent[], now: Date, admission: SupervisorRequestAdmission): SupervisorRequestActivity[] {
  // Callers pass ledger order or a newest-first timeline; read oldest first either way.
  const events = [...unordered].sort((a, b) => a.sequence - b.sequence);
  const drafts = new Map<string, Draft>();
  for (const event of events) {
    const data = event.data;
    if (data.type !== "worker_message_recorded" || typeof data.body !== "string" || !ROUTE_PREFIX.test(data.body)) continue;
    const packet = parsePacket(data.body);
    const requestId = text(packet?.requestId);
    if (!packet || !requestId || drafts.has(requestId) || !event.worker || !routeLooksValid(data.body, packet, event.worker)) continue;
    if (!data.body.startsWith(INTERNAL_ROUTE_PREFIX) && !admission.admitted.has(requestId)) continue;
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
  if (!drafts.size) return [];

  for (const event of events) {
    const data = event.data;
    if (data.type !== "github_decision_receipt_ingested") continue;
    const draft = drafts.get(data.request_id);
    if (!draft || draft.answeredAt) continue;
    draft.answeredAt = timestamp(data.ingested_at) ?? event.occurredAt;
    draft.answer = shorten(answerOf(data), ANSWER_LIMIT);
  }

  const transport = relayTransport(events, admission.trustedRelays);
  const nowMs = now.getTime();
  const all = [...drafts.values()].map((draft): SupervisorRequestActivity => {
    // Sending is tracked only where Mission Control binds the relay's receipts to the request (V5/V6) and trusts a relay.
    const tracked = Boolean(SUPERVISOR_TRANSPORT_BINDINGS[draft.version]) && admission.trustedRelays.size > 0;
    if (tracked) applyBoundTransport(draft, transport, admission.conflictedSessions, now);
    const expired = draft.expiresAt !== null && Date.parse(draft.expiresAt) <= nowMs;
    // A retirement for expiry names the expiry; without one on the route it reads as a plain withdrawal.
    const retired = admission.retired.get(draft.requestId);
    const retiredState = retired === "EXPIRED_UNSENT" && draft.expiresAt === null ? "WITHDRAWN" : retired;
    const state: SupervisorRequestState = draft.answeredAt ? "ANSWERED"
      : admission.replaced.has(draft.requestId) ? "REPLACED"
        : retiredState
          ?? (!tracked ? (expired ? "EXPIRED" : "WAITING")
            : draft.duplicateSend ? (expired ? "NO_ANSWER" : "DUPLICATE_SEND")
              : draft.sentAt ? (expired ? "NO_ANSWER" : draft.finishedAt ? "FINISHED" : "SENT")
                : expired ? "EXPIRED" : "QUEUED");
    return {
      requestId: draft.requestId, origin: draft.origin, supervisorId: draft.supervisorId, question: draft.question,
      queuedAt: draft.queuedAt, expiresAt: draft.expiresAt, state, sentAt: draft.sentAt, finishedAt: draft.finishedAt,
      answeredAt: draft.answeredAt, answer: draft.answer, conversationUrl: draft.conversationUrl,
    };
  });
  const order = new Map([...drafts.values()].map((draft) => [draft.requestId, draft.sequence]));
  return all.sort((a, b) => (order.get(b.requestId) ?? 0) - (order.get(a.requestId) ?? 0));
}

interface BoundSession { conversations: Set<string>; starts: string[]; completions: string[]; sequence: number }
interface RelayReceipt { event: StoredEvent; summary: string; session: string | null; supervisor: string | null; ref: (key: string) => string | null }
interface RelayTransport {
  byRequest: Map<string, RelayReceipt[]>;
  /** Per provider session: the one worker, request and supervisor its receipts name, the roles its session receipts name. */
  sessions: Map<string, { owner: string; conflict: boolean; roles: Set<string | null> }>;
}

/**
 * The provider sessions the trusted relay's receipts name for more than one worker, request or supervisor, or with more
 * than one session role. Mission Control's validators never accept a reused session, so give this the whole ledger.
 */
export function conflictedRelaySessions(events: readonly StoredEvent[], relays: ReadonlySet<string>): Set<string> {
  return new Set([...relayTransport(events, relays).sessions].flatMap(([session, use]) => use.conflict || use.roles.size > 1 ? [session] : []));
}

/**
 * The relay's receipts that can count: provider-session and stage receipts from a collector the receipt policy trusts,
 * never a worker's, supervisor's or other collector's claim.
 */
function relayTransport(events: readonly StoredEvent[], relays: ReadonlySet<string>): RelayTransport {
  const byRequest = new Map<string, RelayReceipt[]>();
  const sessions: RelayTransport["sessions"] = new Map();
  for (const event of events) {
    const data = event.data;
    if (data.type !== "evidence_receipt_recorded" || data.verified !== true
      || (data.summary !== SESSION_SUMMARY && data.summary !== STAGE_SUMMARY)
      || event.producerKind !== "COLLECTOR" || !relays.has(event.producerId)
      || data.producer_id !== event.producerId || data.producer_role !== "COLLECTOR") continue;
    const ref = (key: string) => refValue(data.refs, key);
    const request = ref("request");
    const receipt: RelayReceipt = { event, summary: data.summary, session: ref("provider_session"), supervisor: ref("supervisor"), ref };
    if (receipt.session) {
      // A relay never reuses a provider session: one named for another worker, request or supervisor counts for none.
      const owner = JSON.stringify([event.worker ?? null, request, receipt.supervisor]);
      const use = sessions.get(receipt.session) ?? { owner, conflict: false, roles: new Set<string | null>() };
      if (use.owner !== owner) use.conflict = true;
      if (data.summary === SESSION_SUMMARY) use.roles.add(ref("session_role"));
      sessions.set(receipt.session, use);
    }
    if (request) {
      const list = byRequest.get(request) ?? [];
      list.push(receipt);
      byRequest.set(request, list);
    }
  }
  return { byRequest, sessions };
}

/**
 * Sent, finished and the conversation, from the receipts bound to this request's own provider session the way its
 * route version's validators bind them: session receipts with the version's session role, first message and an exact
 * ChatGPT conversation; stage receipts at the version's step for that session's first message, in that conversation:
 * sent when it STARTED, finished when it then reached COMPLETE.
 */
function applyBoundTransport(draft: Draft, transport: RelayTransport, conflicted: ReadonlySet<string>, now: Date): void {
  const binding = SUPERVISOR_TRANSPORT_BINDINGS[draft.version]!;
  const owner = JSON.stringify([draft.worker, draft.requestId, draft.supervisorId]);
  // Like the validators' window: evidence from when the question was queued up to now.
  const inWindow = (receipt: RelayReceipt) => instant(receipt.event.occurredAt) >= instant(draft.queuedAt) && instant(receipt.event.occurredAt) <= now.getTime();
  const receipts = (transport.byRequest.get(draft.requestId) ?? []).filter((receipt) => {
    const use = receipt.session ? transport.sessions.get(receipt.session) : undefined;
    return use !== undefined && !use.conflict && !conflicted.has(receipt.session!) && use.owner === owner
      && [...use.roles].every((role) => role === binding.sessionRole) && inWindow(receipt);
  });
  const sessions = new Map<string, BoundSession>();
  for (const receipt of receipts) {
    const url = receipt.ref("conversation_url");
    if (receipt.summary !== SESSION_SUMMARY || receipt.ref("message_ordinal") !== "1" || receipt.ref("url_binding_status") !== "EXACT"
      || !url || !binding.conversation.test(url) || !isSpecificChatAddress(url)) continue;
    const session = sessions.get(receipt.session!) ?? { conversations: new Set<string>(), starts: [], completions: [], sequence: -1 };
    session.conversations.add(url);
    session.sequence = Math.max(session.sequence, receipt.event.sequence);
    sessions.set(receipt.session!, session);
  }
  for (const receipt of receipts) {
    const session = receipt.summary === STAGE_SUMMARY ? sessions.get(receipt.session!) : undefined;
    if (!session || receipt.ref("step") !== binding.step || receipt.ref("message_ordinal") !== "1" || receipt.ref("first_message") !== "true") continue;
    const url = receipt.ref("conversation_url");
    const generation = receipt.ref("generation_state");
    // The send starts in one of the session's exact conversations (a provisional "WEB:" one counts); it completes in
    // the session's conversation (its real address once assigned).
    if (generation === "STARTED" && url !== null && session.conversations.has(url)) session.starts.push(receipt.event.occurredAt);
    else if (generation === "COMPLETE" && url !== null && url === sessionConversation(session.conversations)) session.completions.push(receipt.event.occurredAt);
    else continue;
    session.sequence = Math.max(session.sequence, receipt.event.sequence);
  }
  // Like the validators, a question is sent in exactly one provider session (and a V6 question started once): any
  // trusted start for it in another session, bound or not, makes the send ambiguous. Then no one chat is the
  // question's, no answer to it can be accepted, and the view says it was sent more than once.
  const startReceipts = (transport.byRequest.get(draft.requestId) ?? []).filter((receipt) => receipt.summary === STAGE_SUMMARY
    && receipt.event.worker === draft.worker && receipt.ref("generation_state") === "STARTED" && inWindow(receipt));
  const sendSessions = new Set(startReceipts.map((receipt) => receipt.session));
  // The question ran in a session only once its first message started there (a session opened, or closed, without
  // that is neither sent nor finished, and offers no chat). Completion is the stage's own COMPLETE after that start,
  // never a session's lifecycle alone.
  const started = [...sessions.values()].filter((session) => session.starts.length > 0);
  if (sendSessions.size > 1 || started.length > 1 || (draft.version === 6 && started.some((session) => session.starts.length > 1))) {
    draft.duplicateSend = true;
    draft.sentAt = earliestInstant(startReceipts.map((receipt) => receipt.event.occurredAt));
    return;
  }
  const chosen = started[0];
  if (!chosen) return;
  const sentAt = earliestInstant(chosen.starts)!;
  draft.sentAt = sentAt;
  draft.finishedAt = latestInstant(chosen.completions.filter((at) => instant(at) >= instant(sentAt)));
  draft.conversationUrl = sessionConversation(chosen.conversations);
}

/**
 * The conversation a session ran in: its real address once ChatGPT assigned one, else its provisional "WEB:" one. A
 * session naming two real or two provisional addresses changed identity, which Mission Control's validators reject, so
 * it offers none.
 */
function sessionConversation(conversations: ReadonlySet<string>): string | null {
  const real = [...conversations].filter((url) => !/\/c\/WEB:/.test(url));
  const provisional = [...conversations].filter((url) => /\/c\/WEB:/.test(url));
  return real.length > 1 || provisional.length > 1 ? null : real[0] ?? provisional[0] ?? null;
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
  return Array.isArray(activity.requests) && activity.requests.every((item: unknown) => {
    const request = record(item);
    return request !== null && typeof request.requestId === "string" && timeOrNull(request.queuedAt) && request.queuedAt !== null
      && (SUPERVISOR_REQUEST_STATES as readonly unknown[]).includes(request.state)
      && (SUPERVISOR_REQUEST_ORIGINS as readonly unknown[]).includes(request.origin)
      && ["supervisorId", "question", "answer"].every((key) => nullableString(request[key]))
      && ["expiresAt", "sentAt", "finishedAt", "answeredAt"].every((key) => timeOrNull(request[key]))
      && (STATE_TIMES[request.state as SupervisorRequestState] ?? []).every((key) => request[key] !== null)
      && chatAddressOrNull(request.conversationUrl);
  });
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
function earliestInstant(values: ReadonlyArray<string | null | undefined>): string | null {
  let earliest: string | null = null;
  for (const value of values) {
    if (typeof value !== "string" || !Number.isFinite(instant(value))) continue;
    if (earliest === null || instant(value) < instant(earliest)) earliest = value;
  }
  return earliest;
}

function parsePacket(body: string): Record<string, unknown> | null {
  try {
    return record(JSON.parse(body.slice(body.indexOf("\n") + 1)));
  } catch {
    return null;
  }
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
