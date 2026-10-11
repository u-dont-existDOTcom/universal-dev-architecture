import type { StoredEvent } from "./schema";
import { isSpecificChatAddress } from "./supervisor-chat-address";

/**
 * What a task's supervisor has been doing, from the ledger: each question Mission Control queued for a supervisor
 * chat, whether the relay sent it (and to which ChatGPT conversation), whether the supervisor finished, and the
 * answer that came back. Every request opens a fresh conversation, so "the supervisor chat" of a task is the
 * conversation of its latest request. Read-only: nothing here changes what Mission Control sends or accepts.
 */
export type SupervisorRequestState =
  | "QUEUED" | "SENT" | "FINISHED" | "ANSWERED" | "NO_ANSWER" | "EXPIRED_UNSENT" | "WITHDRAWN" | "REPLACED";
export type SupervisorRequestOrigin =
  | "ROUTINE_CHECK" | "WORK_QUESTION" | "OWNER_ANSWER" | "AFTER_WORK" | "SOURCE_REVIEW" | "OTHER";

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
  /** The state of every question, by request id, so other views use the same admitted set. */
  states: Record<string, SupervisorRequestState>;
}

export const RECENT_REQUESTS = 5;
const ROUTE_PREFIX = /^MISSION_CONTROL_INTERNAL_SUPERVIS(?:ORY_CYCLE_V[2-6]|OR_ROUTE_V1)\n/;
const INTERNAL_ROUTE_PREFIX = "MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1\n";
const RETIRED_UNSENT_SUMMARY = "MISSION_CONTROL_SUPERVISORY_REQUEST_RETIRED_UNSENT_V1";
const RETIREMENT_PRODUCER = "verifier:fleet-supervisor-request-retirement";
const QUESTION_LIMIT = 400;
const ANSWER_LIMIT = 600;

export const emptySupervisorActivity: SupervisorActivity = { requests: [], total: 0, answered: 0, lastAnsweredAt: null, latestConversationUrl: null, states: {} };

interface Draft extends SupervisorRequestActivity { sequence: number; supersedes: string | null; conversationSequence: number; conversationIsProvisional: boolean }

/**
 * Which cycle requests (V2-V6) Mission Control admits, and which of those an admitted replacement superseded, from its
 * own request parser and replacement rules (`admittedCycleRequests`). The projection always passes it; without it
 * (tests and tools), only the structural checks below apply and a packet's own "supersedes" field marks a replacement.
 */
export interface SupervisorRequestAdmission { admitted: ReadonlySet<string>; replaced: ReadonlySet<string> }

export function supervisorActivity(events: readonly StoredEvent[], now: Date = new Date(), admission?: SupervisorRequestAdmission): SupervisorActivity {
  const all = supervisorRequests(events, now, admission);
  if (!all.length) return emptySupervisorActivity;
  const answered = all.filter((request) => request.answeredAt);
  return {
    requests: all.slice(0, RECENT_REQUESTS),
    total: all.length,
    answered: answered.length,
    lastAnsweredAt: answered.map((request) => request.answeredAt!).sort().at(-1) ?? null,
    latestConversationUrl: all.find((request) => request.conversationUrl)?.conversationUrl ?? null,
    states: Object.fromEntries(all.map((request) => [request.requestId, request.state])),
  };
}

/** Questions still in flight: queued, sent, or finished without a recorded answer, and not expired. */
export function isPendingSupervisorRequest(request: Pick<SupervisorRequestActivity, "state">): boolean {
  return request.state === "QUEUED" || request.state === "SENT" || request.state === "FINISHED";
}

/** Every supervisor question in these events with its current state, newest first. */
export function supervisorRequests(unordered: readonly StoredEvent[], now: Date = new Date(), admission?: SupervisorRequestAdmission): SupervisorRequestActivity[] {
  // Callers pass ledger order or a newest-first timeline; read oldest first either way.
  const events = [...unordered].sort((a, b) => a.sequence - b.sequence);
  const drafts = new Map<string, Draft>();
  for (const event of events) {
    const data = event.data;
    if (data.type !== "worker_message_recorded" || typeof data.body !== "string" || !ROUTE_PREFIX.test(data.body)) continue;
    const packet = parsePacket(data.body);
    const requestId = text(packet?.requestId);
    if (!packet || !requestId || drafts.has(requestId) || !event.worker || !routeLooksValid(data.body, packet, event.worker)) continue;
    if (admission && !data.body.startsWith(INTERNAL_ROUTE_PREFIX) && !admission.admitted.has(requestId)) continue;
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
      supersedes: text(packet?.supersedesRequestId),
      conversationSequence: -1,
      conversationIsProvisional: false,
    });
  }
  if (!drafts.size) return [];

  const withdrawn = new Set<string>();
  const retiredExpired = new Set<string>();
  const replaced = new Set<string>();
  if (admission) for (const requestId of admission.replaced) replaced.add(requestId);
  else for (const draft of drafts.values()) if (draft.supersedes && drafts.has(draft.supersedes)) replaced.add(draft.supersedes);
  for (const event of events) {
    const data = event.data;
    if (data.type === "github_decision_receipt_ingested") {
      const draft = drafts.get(data.request_id);
      if (!draft || draft.answeredAt) continue;
      draft.answeredAt = data.ingested_at;
      draft.answer = shorten(answerOf(data), ANSWER_LIMIT);
      continue;
    }
    if (data.type !== "evidence_receipt_recorded" || !data.verified) continue;
    const requestId = refValue(data.refs, "request");
    const draft = requestId ? drafts.get(requestId) : undefined;
    if (!draft) continue;
    if (data.summary === RETIRED_UNSENT_SUMMARY) {
      if (data.producer_id === RETIREMENT_PRODUCER && event.producerId === RETIREMENT_PRODUCER
        && data.refs.includes("lifecycle_status:RETIRED_UNSENT")) {
        // The fleet check retires an expired request on its own (reason REQUEST_EXPIRED); any other retirement is a
        // deliberate withdrawal.
        (data.refs.includes("retirement_reason:REQUEST_EXPIRED") ? retiredExpired : withdrawn).add(draft.requestId);
      }
      continue;
    }
    // Transport evidence counts only from the relay's own collectors, never from a worker's or supervisor's claim.
    if (event.producerKind !== "COLLECTOR" || data.producer_role !== "COLLECTOR" || data.producer_id !== event.producerId) continue;
    const generation = refValue(data.refs, "generation_state");
    const lifecycle = refValue(data.refs, "lifecycle_status");
    if (generation === "STARTED" && (!draft.sentAt || event.occurredAt < draft.sentAt)) draft.sentAt = event.occurredAt;
    if ((generation === "COMPLETE" || lifecycle === "COMPLETE") && (!draft.finishedAt || event.occurredAt > draft.finishedAt)) {
      draft.finishedAt = event.occurredAt;
    }
    const url = refValue(data.refs, "conversation_url");
    if (url && isSpecificChatAddress(url)) {
      // A provisional "WEB:" address is replaced by the real one once ChatGPT assigns it; prefer the real one.
      const provisional = /\/c\/WEB:/.test(url);
      const better = !draft.conversationUrl
        || (draft.conversationIsProvisional && !provisional)
        || (draft.conversationIsProvisional === provisional && event.sequence > draft.conversationSequence);
      if (better) {
        draft.conversationUrl = url;
        draft.conversationSequence = event.sequence;
        draft.conversationIsProvisional = provisional;
      }
    }
  }

  const nowMs = now.getTime();
  const all = [...drafts.values()].map((draft): SupervisorRequestActivity => {
    const expired = draft.expiresAt !== null && Date.parse(draft.expiresAt) <= nowMs;
    const state: SupervisorRequestState = draft.answeredAt ? "ANSWERED"
      : replaced.has(draft.requestId) ? "REPLACED"
        : retiredExpired.has(draft.requestId) ? "EXPIRED_UNSENT"
          : withdrawn.has(draft.requestId) ? "WITHDRAWN"
          : draft.sentAt || draft.finishedAt ? (expired ? "NO_ANSWER" : draft.finishedAt ? "FINISHED" : "SENT")
            : expired ? "EXPIRED_UNSENT" : "QUEUED";
    return {
      requestId: draft.requestId, origin: draft.origin, supervisorId: draft.supervisorId, question: draft.question,
      queuedAt: draft.queuedAt, expiresAt: draft.expiresAt, state, sentAt: draft.sentAt, finishedAt: draft.finishedAt,
      answeredAt: draft.answeredAt, answer: draft.answer, conversationUrl: draft.conversationUrl,
    };
  });
  const order = new Map([...drafts.values()].map((draft) => [draft.requestId, draft.sequence]));
  return all.sort((a, b) => (order.get(b.requestId) ?? 0) - (order.get(a.requestId) ?? 0));
}

/** The conversation to open for "what is the supervisor doing": the newest request that reached a chat. */
export function latestSupervisorConversation(activity: SupervisorActivity | undefined | null): string | null {
  return activity?.latestConversationUrl ?? activity?.requests.find((request) => request.conversationUrl)?.conversationUrl ?? null;
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

function parsePacket(body: string): Record<string, unknown> | null {
  try {
    return record(JSON.parse(body.slice(body.indexOf("\n") + 1)));
  } catch {
    return null;
  }
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
