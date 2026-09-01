import { projectWorkers, summarizeChanges } from "./projection";
import { EventStore } from "./store";

export function snapshotFromStore(store: EventStore) {
  const events = store.allEvents();
  const workers = projectWorkers(events);
  const lastViewedEventId = store.lastViewedEventId();
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
    },
    liveSource,
    summary: summarizeChanges(events, lastViewedEventId),
    lastViewedEventId,
    latestEventId: store.latestEventId(),
    generatedAt: new Date().toISOString(),
  };
}

export function workerSnapshotFromStore(store: EventStore, worker: string) {
  const projected = projectWorkers(store.workerEvents(worker));
  return projected[0] ? { worker: projected[0], generatedAt: new Date().toISOString() } : null;
}
