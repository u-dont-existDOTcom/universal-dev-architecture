import { projectWorkers, summarizeChanges } from "./projection";
import { seedStore } from "./seed";
import { getStore } from "./store";

export function ensureDemoData() {
  const store = getStore();
  if (process.env.MISSION_CONTROL_SKIP_SEED !== "1") seedStore(store);
  return store;
}

export function dashboardSnapshot() {
  const store = ensureDemoData();
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
