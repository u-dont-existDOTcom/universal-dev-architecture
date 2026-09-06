import { canonicalJson, sha256 } from "./canonical";
import { decisionRouteStates, type ReasoningMessageStoredEvent } from "./reasoning-message-state";
import type { StoredEvent } from "./schema";
import {
  continuationId, validateContinuationBinding,
  type OwnerResponseContinuation, type OwnerResponseContinuationBinding,
} from "./owner-response-continuation-schema";

export interface OwnerResponseContinuationIntent {
  worker: string;
  resumeDecisionRequestId: string;
  supervisorId: string;
  ownerOutcome: OwnerResponseContinuationBinding["owner_outcome"];
  evidenceCapsule: OwnerResponseContinuationBinding["evidence_capsule"];
  issuedAt: string;
  expiresAt: string;
}

// Only the server supplies StoredEvents; caller input contains intent and the
// current cycle's outcome/evidence references, never authoritative message data.
export function deriveOwnerResponseContinuation(events: StoredEvent[], intent: OwnerResponseContinuationIntent, now = intent.issuedAt): OwnerResponseContinuation {
  const timeline = events.filter((event) => event.worker === intent.worker && "worker" in event.data && event.data.worker === intent.worker);
  const related = timeline.filter((event) => event.data.type === "reasoning_message_recorded" && event.data.decision_request_id === intent.resumeDecisionRequestId);
  const origins = related.filter((event) => event.data.type === "reasoning_message_recorded"
    && event.data.author_role === "ASSISTANT" && event.data.surface_role === "SUPERVISOR" && event.data.parent_message_id === null);
  if (origins.length !== 1) throw new Error("Continuation requires one exact worker/decision request originating supervisor message.");
  const seenMessageIds = new Set<string>();
for (const event of related) {
  if (event.data.type !== "reasoning_message_recorded") continue;
  if (seenMessageIds.has(event.data.message_id)) throw new Error("Continuation message identity is ambiguous.");
  seenMessageIds.add(event.data.message_id);
}
const request = origins[0] as ReasoningMessageStoredEvent;
const laterOwnerMessages = related.filter((event): event is ReasoningMessageStoredEvent => event.data.type === "reasoning_message_recorded"
  && event.data.author_role === "OWNER" && event.sequence > request.sequence);
const directReplies = laterOwnerMessages.filter((event) => event.data.surface_role === "SUPERVISOR"
  && event.data.parent_message_id === request.data.message_id);
const projectManagerReplies = laterOwnerMessages.filter((event) => event.data.surface_role === "PROJECT_MANAGER"
  && event.data.parent_message_id === request.data.message_id);
if (directReplies.length > 1 || projectManagerReplies.length > 1 || (directReplies.length > 0 && projectManagerReplies.length > 0)) {
  throw new Error("Continuation OWNER response causality is ambiguous.");
}
let direct = false;
let owner: ReasoningMessageStoredEvent | null = null;
let delivery: ReasoningMessageStoredEvent | null = null;
if (directReplies.length === 1) {
  direct = true;
  owner = directReplies[0]!;
  delivery = owner;
} else if (projectManagerReplies.length === 1) {
  const projectManagerOwner = projectManagerReplies[0]!;
  owner = projectManagerOwner;
  const exactForwards = laterOwnerMessages.filter((event) => event.data.surface_role === "SUPERVISOR"
    && event.data.parent_message_id === projectManagerOwner.data.message_id
    && event.data.body_sha256 === projectManagerOwner.data.body_sha256);
  const alteredForwards = laterOwnerMessages.filter((event) => event.data.surface_role === "SUPERVISOR"
    && event.data.parent_message_id === projectManagerOwner.data.message_id
    && event.data.body_sha256 !== projectManagerOwner.data.body_sha256);
  if (exactForwards.length !== 1 || alteredForwards.length > 0) {
    throw new Error("Continuation OWNER response causality is ambiguous or invalid.");
  }
  delivery = exactForwards[0]!;
}
const route = decisionRouteStates(related).find((state) => state.decisionRequestId === intent.resumeDecisionRequestId);
if (!owner || !delivery || !route || route.status !== "SUPERVISOR_RESOLUTION_REQUIRED"
  || route.supervisorResponse?.data.message_id !== delivery.data.message_id) {
  throw new Error("Continuation requires an OWNER response with SUPERVISOR_RESOLUTION_REQUIRED routing.");
}
if (request.data.stable_supervisor_id !== intent.supervisorId || delivery.data.stable_supervisor_id !== intent.supervisorId) {
  throw new Error("Continuation requires exact stable supervisor identity on request and OWNER delivery.");
}
  if (!owner || owner.sequence <= request.sequence || (!direct && delivery.sequence <= owner.sequence)) {
    throw new Error("Continuation OWNER delivery must follow its causal source.");
  }
  for (const message of new Set([request, owner, delivery])) {
    if (timeline.filter((event) => event.data.type === "reasoning_message_recorded" && event.data.message_id === message.data.message_id).length !== 1) {
      throw new Error("Continuation message identity is ambiguous.");
    }
  }
  const exactOwnerResponseText = delivery.data.exact_visible_body;
  if (typeof exactOwnerResponseText !== "string" || !exactOwnerResponseText.length || sha256(exactOwnerResponseText) !== delivery.data.body_sha256) {
    throw new Error("Continuation exact OWNER response text/hash mismatch.");
  }
  const currentOutcome = [...timeline].sort((a, b) => b.sequence - a.sequence).find((event) => event.data.type === "owner_outcome_recorded")?.data;
  if (currentOutcome?.type !== "owner_outcome_recorded"
    || currentOutcome.owner_outcome_id !== intent.ownerOutcome.id || currentOutcome.epoch !== intent.ownerOutcome.epoch
    || currentOutcome.owner_outcome_sha256 !== intent.ownerOutcome.sha256) {
    throw new Error("Continuation is stale against the current owner outcome.");
  }
  const fields: Omit<OwnerResponseContinuationBinding, "continuation_id"> = {
    schema_version: 1, kind: "OWNER_RESPONSE_CONTINUATION", worker: intent.worker,
    decision_request_id: intent.resumeDecisionRequestId, supervisor_id: intent.supervisorId,
    path: direct ? "DIRECT" : "PROJECT_MANAGER",
    originating_supervisor_message: messageReference(request),
    owner_input: { ...messageReference(owner), parent_message_id: owner.data.parent_message_id!, surface_role: owner.data.surface_role },
    supervisor_delivery: { ...messageReference(delivery), parent_message_id: delivery.data.parent_message_id! },
    owner_outcome: intent.ownerOutcome, evidence_capsule: intent.evidenceCapsule,
    issued_at: intent.issuedAt, expires_at: intent.expiresAt,
  };
  const binding = { ...fields, continuation_id: continuationId(fields) };
  const digest = sha256(canonicalJson(binding));
  validateContinuationBinding(binding, digest);
  if (!Number.isFinite(Date.parse(now)) || Date.parse(now) < Date.parse(binding.issued_at) || Date.parse(now) > Date.parse(binding.expires_at)) {
    throw new Error("Continuation is stale outside its Mission Control validity window.");
  }
  if (events.some((event) => event.data.type === "github_decision_receipt_ingested"
    && event.data.continuation_binding?.continuation_id === binding.continuation_id)) {
    throw new Error("Continuation has already been consumed by a GitHub decision receipt.");
  }
  return { binding, digest, exactOwnerResponseText };
}

export function validateOwnerResponseContinuation(events: StoredEvent[], intent: OwnerResponseContinuationIntent, continuation: OwnerResponseContinuation, now: string): OwnerResponseContinuation {
  const authoritative = deriveOwnerResponseContinuation(events, intent, now);
  if (authoritative.digest !== continuation.digest || canonicalJson(authoritative.binding) !== canonicalJson(continuation.binding)
    || authoritative.exactOwnerResponseText !== continuation.exactOwnerResponseText) {
    throw new Error("Continuation no longer matches authoritative events/current evidence.");
  }
  return authoritative;
}

function messageReference(event: ReasoningMessageStoredEvent) {
  return { event_id: event.eventId, message_id: event.data.message_id, body_sha256: event.data.body_sha256 };
}
