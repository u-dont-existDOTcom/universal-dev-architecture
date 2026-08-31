import { projectWorkers, summarizeChanges } from "./projection";
import { EventStore } from "./store";

export function snapshotFromStore(store: EventStore) {
  const events = store.allEvents();
  const lastViewedEventId = store.lastViewedEventId();
  const liveSourceEvent = [...events].reverse().find((event) => event.data.type === "live_worker_evidence_observed");
  const liveSource = liveSourceEvent?.data.type === "live_worker_evidence_observed" ? liveSourceEvent.data : null;
  return {
    workers: projectWorkers(events),
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
