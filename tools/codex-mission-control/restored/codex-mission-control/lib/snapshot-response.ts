// Projected timelines are newest first. Keep projection and full-history reads intact.
export const RECENT_TIMELINE_LIMIT = 20;

export function snapshotForTimeline<T extends { workers: { timeline: unknown[] }[] }>(
  snapshot: T,
  timeline: string | null,
) {
  if (timeline !== "recent") return snapshot;
  return {
    ...snapshot,
    workers: snapshot.workers.map((worker) => ({
      ...worker,
      timeline: worker.timeline.slice(0, RECENT_TIMELINE_LIMIT),
      timelineTotal: worker.timeline.length,
      timelineTruncated: worker.timeline.length > RECENT_TIMELINE_LIMIT,
    })),
  };
}
