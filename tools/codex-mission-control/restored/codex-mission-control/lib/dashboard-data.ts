import { projectWorkers, summarizeChanges } from "./projection";
import { EventStore } from "./store";
import type { StoredEvent } from "./schema";

const relayTransportEvidenceSummaries = new Set([
  "MISSION_CONTROL_CHAT_CAPABILITY_CHALLENGE_V1",
  "MISSION_CONTROL_CHAT_CAPABILITY_VERIFIED_V1",
  "MISSION_CONTROL_CHAT_MODE_CAPABILITY_VERIFIED_V1",
  "MISSION_CONTROL_RELAY_STAGE_V1",
  "MISSION_CONTROL_CHAT_STAGE_LIVENESS_V1",
  "MISSION_CONTROL_PROVIDER_SESSION_V1",
  "MISSION_CONTROL_PROVIDER_SESSION_MODEL_UI_V1",
  "MISSION_CONTROL_PROVIDER_SESSION_MCP_READ_V1",
  "MISSION_CONTROL_BINDING_CAPSULE_V1",
  "MISSION_CONTROL_BINDING_ENVELOPE_V1",
  "MISSION_CONTROL_PM_CONTROLLER_STAGE_V1",
]);

export function snapshotFromStore(store: EventStore, options: { includeFixtureOnly?: boolean } = {}) {
  return snapshotFromEvents(store.allEvents(), options);
}

export function snapshotFromEvents(events: StoredEvent[], options: { includeFixtureOnly?: boolean } = {}) {
  const projectedWorkers = projectWorkers(events);
  const workers = options.includeFixtureOnly === false
    ? projectedWorkers.filter((worker) => worker.connection.state !== "FIXTURE_ONLY")
    : projectedWorkers;
  const reviewEvent = events.findLast((event) => event.data.type === "review_marked");
  const lastViewedEventId = reviewEvent?.data.type === "review_marked" ? reviewEvent.data.reviewed_through_sequence : 0;
  const liveSourceEvent = [...events].reverse().find((event) => event.data.type === "live_worker_evidence_observed");
  const liveSource = liveSourceEvent?.data.type === "live_worker_evidence_observed" ? liveSourceEvent.data : null;
  return {
    workers,
    fleetQueue: workers.flatMap((worker) => worker.channel.queue).sort((left, right) => {
      const statusOrder = { BLOCKED: 0, IN_PROGRESS: 1, READY: 2, WAITING_REVIEW: 3, PLANNED: 4, DONE: 5, SUPERSEDED: 6, CANCELED: 7 } as const;
      return statusOrder[left.status] - statusOrder[right.status] || left.worker.localeCompare(right.worker) || left.ordinal - right.ordinal;
    }),
    channelSummary: {
      staleDirections: workers.filter((worker) => worker.channel.freshness === "DASHBOARD_BEHIND_OWNER").length,
      awaitingDelivery: workers.filter((worker) => {
        const direction = worker.channel.messages.findLast((message) => message.author === "OWNER" && message.kind === "DIRECTION");
        return Boolean(direction && ["RECORDED", "QUEUED", "DELIVERY_ATTEMPTED"].includes(direction.deliveryStatus));
      }).length,
      awaitingAcknowledgement: workers.filter((worker) => {
        const direction = worker.channel.messages.findLast((message) => message.author === "OWNER" && message.kind === "DIRECTION");
        return Boolean(direction?.deliveryStatus === "DELIVERED" && !direction.acknowledged);
      }).length,
      deliveryFailures: workers.filter((worker) => worker.channel.freshness === "DELIVERY_FAILED").length,
      openBlockers: workers.reduce((count, worker) => count + worker.channel.blockers.length, 0),
      openProposals: workers.reduce((count, worker) => count + worker.channel.proposals.length, 0),
    },
    connectionSummary: {
      connected: workers.filter((worker) => worker.connection.state === "CONNECTED").length,
      offlineConfigured: workers.filter((worker) => worker.connection.state === "OFFLINE_CONFIGURED").length,
      fixtureOnly: workers.filter((worker) => worker.connection.state === "FIXTURE_ONLY").length,
      suppressedFixtureOnly: projectedWorkers.length - workers.length,
    },
    liveSource,
    summary: summarizeChanges(events, lastViewedEventId),
    lastViewedEventId,
    latestEventId: events.at(-1)?.sequence ?? 0,
    generatedAt: new Date().toISOString(),
  };
}

export function workerSnapshotFromStore(
  store: EventStore,
  worker: string,
  options: { includeFixtureOnly?: boolean } = {},
) {
  return workerSnapshotFromEvents(store.allEvents(), worker, options);
}

export function workerSnapshotFromEvents(
  events: StoredEvent[],
  worker: string,
  options: { includeFixtureOnly?: boolean } = {},
) {
  const selected = projectWorkers(events).find((candidate) => candidate.id === worker);
  if (!selected || options.includeFixtureOnly === false && selected.connection.state === "FIXTURE_ONLY") return null;
  return { worker: selected, generatedAt: new Date().toISOString() };
}

export function workerTransportSnapshotFromStore(
  store: EventStore,
  worker: string,
  options: { includeFixtureOnly?: boolean } = {},
) {
  return workerTransportSnapshotFromEvents(store.workerEvents(worker), worker, options);
}

export function workerTransportSnapshotFromEvents(
  events: StoredEvent[],
  worker: string,
  options: { includeFixtureOnly?: boolean } = {},
) {
  const workerEvents = events.filter((event) => event.worker === worker);
  const selected = projectWorkers(workerEvents).find((candidate) => candidate.id === worker);
  if (!selected || options.includeFixtureOnly === false && selected.connection.state === "FIXTURE_ONLY") return null;
  return {
    worker: {
      id: selected.id,
      name: selected.name,
      timeline: workerEvents.filter(isRelayTransportEvent).reverse(),
    },
    generatedAt: new Date().toISOString(),
  };
}

export function isRelayTransportEvent(event: ReturnType<EventStore["allEvents"]>[number]) {
  if (["worker_message_recorded", "github_decision_receipt_ingested", "reasoning_message_recorded"].includes(event.data.type)) return true;
  return event.data.type === "evidence_receipt_recorded" && relayTransportEvidenceSummaries.has(event.data.summary);
}
