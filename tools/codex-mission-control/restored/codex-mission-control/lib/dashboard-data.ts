import { projectWorkers, summarizeChanges } from "./projection";
import { seedStore } from "./seed";
import { EventStore, getStore } from "./store";

export function ensureDemoData() {
  const store = getStore();
  if (process.env.MISSION_CONTROL_SKIP_SEED !== "1") seedStore(store);
  return store;
}

export function dashboardSnapshot() {
  const store = ensureDemoData();
  return snapshotFromStore(store);
}

export function snapshotFromStore(store: EventStore) {
  const events = store.allEvents();
  const lastViewedEventId = store.lastViewedEventId();
  return {
    workers: projectWorkers(events),
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
