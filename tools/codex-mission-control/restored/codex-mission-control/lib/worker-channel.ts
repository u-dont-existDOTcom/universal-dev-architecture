import { randomUUID } from "node:crypto";
import type { AuthenticatedProducer } from "./ingestion-auth";
import type { MissionControlEventV2, StoredEvent } from "./schema";
import { EventStore } from "./store";

const systemProducer: AuthenticatedProducer = {
  id: "system:outbound-delivery",
  kind: "SYSTEM",
  workerScopes: ["*"],
  taskScopes: ["*"],
};

export interface OwnerMessageInput {
  worker: string;
  missionId?: string;
  threadId?: string;
  kind: "CONVERSATION" | "DIRECTION";
  body: string;
  replyToMessageId?: string | null;
  supersedesDirectionId?: string | null;
  priority?: "URGENT" | "HIGH" | "NORMAL" | "LOW";
  scope?: { kind: "WORKER" | "TASK" | "FLEET"; id: string };
  authorityEpoch?: number;
  ownerOutcomeId?: string | null;
  ownerOutcomeSha256?: string | null;
  transport?: "LOCAL_POLL" | "REMOTE_POLL" | "WEBHOOK";
  endpointId?: string;
  now?: string;
  messageId?: string;
  directionId?: string;
  deliveryId?: string;
  ownerEventId?: string;
  deliveryEventId?: string;
  supersedeDeliveryEventId?: string;
}

export interface ChannelMessageProjection {
  messageId: string;
  directionId: string | null;
  threadId: string;
  author: "OWNER" | "WORKER";
  kind: "CONVERSATION" | "DIRECTION" | "RESPONSE" | "QUESTION";
  body: string;
  replyToMessageId: string | null;
  recordedAt: string;
  deliveryId: string | null;
  deliveryStatus: "RECORDED" | "QUEUED" | "DELIVERY_ATTEMPTED" | "DELIVERED" | "DELIVERY_FAILED" | "EXPIRED" | "SUPERSEDED";
  acknowledged: boolean;
  incorporated: boolean;
  priority: "URGENT" | "HIGH" | "NORMAL" | "LOW" | null;
  scope: { kind: "WORKER" | "TASK" | "FLEET"; id: string } | null;
  authorityEpoch: number | null;
}

export interface WorkQueueItemProjection {
  worker: string;
  directionId: string;
  queueRevisionId: string;
  revision: number;
  projectId: string;
  taskId: string;
  itemId: string;
  title: string;
  detail: string;
  status: "PLANNED" | "READY" | "IN_PROGRESS" | "BLOCKED" | "WAITING_REVIEW" | "DONE" | "SUPERSEDED" | "CANCELED";
  priority: "P0" | "P1" | "P2" | "P3";
  ordinal: number;
  dependsOn: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkerChannelProjection {
  freshness: "NO_DIRECTION" | "DASHBOARD_BEHIND_OWNER" | "AWAITING_DELIVERY" | "AWAITING_ACKNOWLEDGEMENT" | "CURRENT" | "DELIVERY_FAILED";
  latestDirectionId: string | null;
  latestDirectionBody: string | null;
  latestDirectionAt: string | null;
  acknowledgementInterpretation: string | null;
  messages: ChannelMessageProjection[];
  queueRevisionId: string | null;
  queue: WorkQueueItemProjection[];
  blockers: Array<{
    blockerId: string; directionId: string; queueItemId: string | null; status: string; severity: string;
    title: string; description: string; impact: string; blockingScope: string[]; workaround: string | null;
    requiredActor: { kind: string; id: string }; evidenceRefs: string[]; reportedBy: string; needsOwner: boolean; reportedAt: string;
  }>;
  proposals: Array<{
    proposalId: string; directionId: string; queueItemId: string | null; status: string; title: string;
    rationale: string; expectedImpact: string; affectedScope: string[]; proposerId: string; reasoningAuthority: string;
    authorityEffect: "NON_OPERATIVE"; disposition: string | null; evidenceRefs: string[]; requiresOwnerDecision: boolean; reportedAt: string;
  }>;
}

export function recordOwnerMessage(store: EventStore, input: OwnerMessageInput, producer: AuthenticatedProducer) {
  const suffix = randomUUID();
  const messageId = input.messageId ?? `message:${suffix}`;
  const directionId = input.kind === "DIRECTION" ? input.directionId ?? `direction:${suffix}` : null;
  const deliveryId = input.deliveryId ?? `delivery:${suffix}`;
  const ownerEventId = input.ownerEventId ?? `owner-message:${suffix}`;
  const deliveryEventId = input.deliveryEventId ?? `outbound-queued:${suffix}`;
  const existingOwnerEvent = store.eventByEventId(ownerEventId);
  const now = existingOwnerEvent?.occurredAt ?? input.now ?? new Date().toISOString();
  const missionId = input.missionId ?? "mission-control";
  const threadId = input.threadId ?? `thread:${input.worker}`;
  const workerEvents = store.workerEvents(input.worker);
  const priorDirectionEvent = workerEvents.findLast((event) => event.data.type === "owner_message_recorded"
    && event.data.message_kind === "DIRECTION" && event.data.message_id !== messageId);
  const priorDirection = priorDirectionEvent?.data;
  const ownerOutcome = workerEvents.findLast((event) => event.data.type === "owner_outcome_recorded")?.data;
  const directionEpoch = input.kind === "DIRECTION"
    ? input.authorityEpoch ?? (priorDirection?.type === "owner_message_recorded" ? (priorDirection.authority_epoch ?? 0) + 1 : 1)
    : null;
  const ownerEvent = {
    schema_version: 2 as const,
    event_id: ownerEventId,
    mission_id: missionId,
    occurred_at: now,
    data: {
      type: "owner_message_recorded" as const,
      worker: input.worker,
      message_id: messageId,
      thread_id: threadId,
      message_kind: input.kind,
      body: input.body,
      direction_id: directionId,
      reply_to_message_id: input.replyToMessageId ?? null,
      created_by: producer.id,
      delivery_required: true,
      supersedes_direction_id: input.supersedesDirectionId ?? null,
      priority: input.kind === "DIRECTION" ? input.priority ?? "NORMAL" : null,
      scope: input.kind === "DIRECTION" ? input.scope ?? { kind: "WORKER" as const, id: input.worker } : null,
      authority_epoch: directionEpoch,
      owner_outcome_id: input.kind === "DIRECTION" ? input.ownerOutcomeId ?? (ownerOutcome?.type === "owner_outcome_recorded" ? ownerOutcome.owner_outcome_id : null) : null,
      owner_outcome_sha256: input.kind === "DIRECTION" ? input.ownerOutcomeSha256 ?? (ownerOutcome?.type === "owner_outcome_recorded" ? ownerOutcome.owner_outcome_sha256 : null) : null,
      authority_semantics: input.kind === "DIRECTION" ? "CURRENT_UNTIL_SUPERSEDED" as const : "INFORMATIONAL" as const,
    },
  };
  const queuedEvent = {
    schema_version: 2 as const,
    event_id: deliveryEventId,
    mission_id: missionId,
    occurred_at: now,
    data: {
      type: "outbound_delivery_lifecycle_recorded" as const,
      worker: input.worker,
      delivery_id: deliveryId,
      message_id: messageId,
      source_message_event_id: ownerEventId,
      status: "QUEUED" as const,
      attempt: 0,
      transport: input.transport ?? "REMOTE_POLL",
      endpoint_id: input.endpointId ?? `worker:${input.worker}:poll`,
      next_attempt_at: now,
      lease_expires_at: null,
      remote_receipt_id: null,
      error_code: null,
    },
  };
  const appendItems: Array<{ event: unknown; producer: AuthenticatedProducer }> = [{ event: ownerEvent, producer }];
  if (input.kind === "DIRECTION" && input.supersedesDirectionId && priorDirection?.type === "owner_message_recorded"
    && priorDirection.direction_id === input.supersedesDirectionId) {
    const priorDelivery = workerEvents.findLast((event) => event.data.type === "outbound_delivery_lifecycle_recorded"
      && event.data.message_id === priorDirection.message_id)?.data;
    if (priorDelivery?.type === "outbound_delivery_lifecycle_recorded" && !["SUPERSEDED", "EXPIRED"].includes(priorDelivery.status)) {
      appendItems.push({ event: channelEnvelope(missionId, input.supersedeDeliveryEventId ?? `outbound-superseded:${messageId}`, now, {
        ...priorDelivery,
        status: "SUPERSEDED",
        next_attempt_at: null,
        lease_expires_at: null,
        remote_receipt_id: null,
        error_code: null,
      }), producer: systemProducer });
    }
  }
  appendItems.push({ event: queuedEvent, producer: systemProducer });
  const appended = store.appendMany(appendItems);
  const message = appended[0];
  const delivery = appended.at(-1)!;
  return { message, delivery, directionId, messageId, deliveryId };
}

export function pullWorkerOutbox(
  store: EventStore,
  worker: string,
  producer: AuthenticatedProducer,
  options: { now?: string; limit?: number; leaseSeconds?: number } = {},
) {
  if (producer.kind !== "WORKER" || !scopeIncludes(producer.workerScopes, worker)) {
    throw Object.assign(new Error("Worker outbox access is limited to the authenticated worker."), { statusCode: 403 });
  }
  const now = options.now ?? new Date().toISOString();
  const nowMs = new Date(now).getTime();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const leaseSeconds = Math.min(Math.max(options.leaseSeconds ?? 300, 30), 3600);
  const events = store.workerEvents(worker);
  const ownerMessages = events.filter((event): event is StoredEvent & { data: Extract<MissionControlEventV2, { type: "owner_message_recorded" }> } => event.data.type === "owner_message_recorded");
  const acknowledgements = new Set(events.flatMap((event) => event.data.type === "outbound_message_acknowledged" ? [event.data.message_id] : []));
  const latestDelivery = new Map<string, Extract<MissionControlEventV2, { type: "outbound_delivery_lifecycle_recorded" }>>();
  for (const event of events) if (event.data.type === "outbound_delivery_lifecycle_recorded") latestDelivery.set(event.data.message_id, event.data);
  const eligible = ownerMessages.filter((event) => {
    if (acknowledgements.has(event.data.message_id)) return false;
    const delivery = latestDelivery.get(event.data.message_id);
    if (!delivery || ["EXPIRED", "SUPERSEDED"].includes(delivery.status)) return false;
    if (delivery.status === "QUEUED") return !delivery.next_attempt_at || new Date(delivery.next_attempt_at).getTime() <= nowMs;
    if (delivery.status === "DELIVERY_FAILED") return !delivery.next_attempt_at || new Date(delivery.next_attempt_at).getTime() <= nowMs;
    if (delivery.status === "DELIVERED") return Boolean(delivery.lease_expires_at && new Date(delivery.lease_expires_at).getTime() <= nowMs);
    return false;
  }).slice(0, limit);
  const appended: StoredEvent[] = [];
  const deliveries = eligible.map((message) => {
    const prior = latestDelivery.get(message.data.message_id)!;
    const attempt = prior.attempt + 1;
    const receiptId = `receipt:${randomUUID()}`;
    const leaseExpiresAt = new Date(nowMs + leaseSeconds * 1000).toISOString();
    const attemptSuffix = randomUUID();
    const [attempted, delivered] = store.appendMany([
      { event: channelEnvelope(message.missionId, `outbound-attempt:${attemptSuffix}`, now, {
        ...prior, status: "DELIVERY_ATTEMPTED", attempt, next_attempt_at: null, lease_expires_at: leaseExpiresAt,
        remote_receipt_id: null, error_code: null,
      }), producer: systemProducer },
      { event: channelEnvelope(message.missionId, `outbound-delivered:${attemptSuffix}`, now, {
        ...prior, status: "DELIVERED", attempt, next_attempt_at: null, lease_expires_at: leaseExpiresAt,
        remote_receipt_id: receiptId, error_code: null,
      }), producer: systemProducer },
    ]);
    appended.push(attempted, delivered);
    return {
      messageId: message.data.message_id,
      directionId: message.data.direction_id,
      deliveryId: prior.delivery_id,
      receiptId,
      threadId: message.data.thread_id,
      kind: message.data.message_kind,
      body: message.data.body,
      replyToMessageId: message.data.reply_to_message_id,
      recordedAt: message.occurredAt,
      leaseExpiresAt,
    };
  });
  return { deliveries, appended, cursor: store.latestSequence() };
}

export function projectWorkerChannel(events: StoredEvent[]): WorkerChannelProjection {
  const deliveries = new Map<string, Extract<MissionControlEventV2, { type: "outbound_delivery_lifecycle_recorded" }>>();
  const genericAcks = new Set<string>();
  const directionAcks = new Map<string, Extract<MissionControlEventV2, { type: "direction_acknowledged" }>>();
  const reconciliations = new Map<string, Extract<MissionControlEventV2, { type: "direction_reconciled" }>>();
  const queues = new Map<string, Extract<MissionControlEventV2, { type: "work_queue_published" }>>();
  for (const event of events) {
    if (event.data.type === "outbound_delivery_lifecycle_recorded") deliveries.set(event.data.message_id, event.data);
    if (event.data.type === "outbound_message_acknowledged") genericAcks.add(event.data.message_id);
    if (event.data.type === "direction_acknowledged") directionAcks.set(event.data.direction_id, event.data);
    if (event.data.type === "direction_reconciled") reconciliations.set(event.data.direction_id, event.data);
    if (event.data.type === "work_queue_published") queues.set(event.data.direction_id, event.data);
  }
  const messages = events.flatMap<ChannelMessageProjection>((event) => {
    if (event.data.type === "owner_message_recorded") {
      const delivery = deliveries.get(event.data.message_id);
      const directionAck = event.data.direction_id ? directionAcks.get(event.data.direction_id) : undefined;
      const reconciliation = event.data.direction_id ? reconciliations.get(event.data.direction_id) : undefined;
      return [{
        messageId: event.data.message_id,
        directionId: event.data.direction_id,
        threadId: event.data.thread_id,
        author: "OWNER" as const,
        kind: event.data.message_kind,
        body: event.data.body,
        replyToMessageId: event.data.reply_to_message_id,
        recordedAt: event.occurredAt,
        deliveryId: delivery?.delivery_id ?? null,
        deliveryStatus: delivery?.status ?? "RECORDED" as const,
        acknowledged: genericAcks.has(event.data.message_id) || Boolean(directionAck),
        incorporated: reconciliation?.status === "INCORPORATED",
        priority: event.data.priority,
        scope: event.data.scope,
        authorityEpoch: event.data.authority_epoch,
      }];
    }
    if (event.data.type === "worker_message_recorded") return [{
      messageId: event.data.message_id,
      directionId: event.data.direction_id,
      threadId: event.data.thread_id,
      author: "WORKER" as const,
      kind: event.data.message_kind,
      body: event.data.body,
      replyToMessageId: event.data.reply_to_message_id,
      recordedAt: event.occurredAt,
      deliveryId: null,
      deliveryStatus: "RECORDED" as const,
      acknowledged: true,
      incorporated: false,
      priority: null,
      scope: null,
      authorityEpoch: null,
    }];
    return [];
  });
  const latestDirection = [...messages].reverse().find((message) => message.author === "OWNER" && message.kind === "DIRECTION");
  const latestDirectionId = latestDirection?.directionId ?? null;
  const latestAck = latestDirectionId ? directionAcks.get(latestDirectionId) : undefined;
  const latestReconciliation = latestDirectionId ? reconciliations.get(latestDirectionId) : undefined;
  const latestQueue = latestDirectionId ? queues.get(latestDirectionId) : [...queues.values()].at(-1);
  let freshness: WorkerChannelProjection["freshness"] = "NO_DIRECTION";
  if (latestDirection) {
    if (latestDirection.deliveryStatus === "DELIVERY_FAILED") freshness = "DELIVERY_FAILED";
    else if (!latestAck || !latestQueue || !latestReconciliation || latestReconciliation.queue_revision_id !== latestQueue.queue_revision_id) freshness = "DASHBOARD_BEHIND_OWNER";
    else freshness = "CURRENT";
  }
  const blockerMap = new Map<string, Extract<MissionControlEventV2, { type: "structured_blocker_recorded" }>>();
  const proposalMap = new Map<string, Extract<MissionControlEventV2, { type: "change_proposal_recorded" }>>();
  for (const event of events) {
    if (event.data.type === "structured_blocker_recorded") blockerMap.set(event.data.blocker_id, event.data);
    if (event.data.type === "change_proposal_recorded") proposalMap.set(event.data.proposal_id, event.data);
  }
  const worker = events.find((event) => event.worker)?.worker ?? "unknown";
  return {
    freshness,
    latestDirectionId,
    latestDirectionBody: latestDirection?.body ?? null,
    latestDirectionAt: latestDirection?.recordedAt ?? null,
    acknowledgementInterpretation: latestAck?.interpretation ?? null,
    messages,
    queueRevisionId: latestQueue?.queue_revision_id ?? null,
    queue: (latestQueue?.items ?? []).sort((left, right) => left.ordinal - right.ordinal).map((item) => ({
      worker,
      directionId: latestQueue!.direction_id,
      queueRevisionId: latestQueue!.queue_revision_id,
      revision: latestQueue!.revision,
      projectId: latestQueue!.project_id,
      taskId: latestQueue!.task_id,
      itemId: item.item_id,
      title: item.title,
      detail: item.detail,
      status: item.status,
      priority: item.priority,
      ordinal: item.ordinal,
      dependsOn: item.depends_on,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
    blockers: [...blockerMap.values()].filter((item) => item.status === "OPEN").map((item) => ({
      blockerId: item.blocker_id, directionId: item.direction_id, queueItemId: item.queue_item_id,
      status: item.status, severity: item.severity, title: item.title, description: item.description,
      impact: item.impact, blockingScope: item.blocking_scope, workaround: item.workaround,
      requiredActor: item.required_actor, evidenceRefs: item.evidence_refs, reportedBy: item.reported_by,
      needsOwner: item.needs_owner, reportedAt: item.reported_at,
    })),
    proposals: [...proposalMap.values()].filter((item) => item.status === "OPEN").map((item) => ({
      proposalId: item.proposal_id, directionId: item.direction_id, queueItemId: item.queue_item_id,
      status: item.status, title: item.title, rationale: item.rationale, expectedImpact: item.expected_impact,
      affectedScope: item.affected_scope, proposerId: item.proposer_id, reasoningAuthority: item.reasoning_authority,
      authorityEffect: item.authority_effect, disposition: item.disposition, evidenceRefs: item.evidence_refs,
      requiresOwnerDecision: item.requires_owner_decision, reportedAt: item.reported_at,
    })),
  };
}

function channelEnvelope(missionId: string, eventId: string, occurredAt: string, data: MissionControlEventV2) {
  return { schema_version: 2 as const, event_id: eventId, mission_id: missionId, occurred_at: occurredAt, data };
}

function scopeIncludes(scopes: string[], worker: string) {
  return scopes.includes("*") || scopes.includes(worker);
}
