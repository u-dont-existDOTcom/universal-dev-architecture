import type { StoredEvent } from "./schema";

export type GitHubReconciliationTrigger = "STARTUP" | "INTERVAL" | "OWNER_RECOVERY";

export interface GitHubReconciliationRunResult {
  status: "COMPLETED" | "ALREADY_RUNNING";
  trigger: GitHubReconciliationTrigger;
  appendedEvents: number;
  requestIds: string[];
  latestSequence: number;
}

interface GitHubReconciliationCoordinatorOptions {
  execute: () => Promise<StoredEvent[]>;
  latestSequence: () => number;
  onAppended?: (events: StoredEvent[]) => void;
}

export class GitHubReconciliationCoordinator {
  private running = false;

  constructor(private readonly options: GitHubReconciliationCoordinatorOptions) {}

  async run(trigger: GitHubReconciliationTrigger): Promise<GitHubReconciliationRunResult> {
    if (this.running) {
      return {
        status: "ALREADY_RUNNING",
        trigger,
        appendedEvents: 0,
        requestIds: [],
        latestSequence: this.options.latestSequence(),
      };
    }
    this.running = true;
    try {
      const events = await this.options.execute();
      this.options.onAppended?.(events);
      return {
        status: "COMPLETED",
        trigger,
        appendedEvents: events.length,
        requestIds: requestIds(events),
        latestSequence: this.options.latestSequence(),
      };
    } finally {
      this.running = false;
    }
  }
}

function requestIds(events: StoredEvent[]): string[] {
  return [...new Set(events.flatMap((event) => {
    const data = event.data as unknown as Record<string, unknown>;
    return typeof data.request_id === "string" ? [data.request_id] : [];
  }))].sort();
}
