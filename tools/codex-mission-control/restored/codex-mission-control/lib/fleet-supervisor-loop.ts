import type { FleetSupervisorWatchTiming } from "./fleet-supervisor";

export interface FleetSupervisorLoopStatus {
  enabled: boolean;
  pollMs: number;
  stallMs: number;
  slowTickMs: number;
  lastTickStartedAt: string | null;
  lastTickCompletedAt: string | null;
  lastTickDurationMs: number | null;
  lastTickWatchTimings: FleetSupervisorWatchTiming[];
  lastTickFailedAt: string | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
  stalledTickCount: number;
  stalled: boolean;
}

interface LoopRuntime<T> {
  tick(now: string, signal: AbortSignal, onWatchTiming?: (timing: FleetSupervisorWatchTiming) => void,
    onWatchResults?: (results: T) => void): Promise<T>;
  readonly currentProgress?: { stage: string; projectId: string | null };
}

export interface FleetSupervisorLoopOptions<T> {
  enabled?: boolean;
  pollMs?: number;
  stallMs?: number;
  slowTickMs?: number;
  now?: () => number;
  onResults?: (results: T) => void;
  onFailure?: (error: unknown) => void;
  onStall?: (line: { event: "fleet_supervisor_tick_stalled"; tick_started_at: string;
    age_ms: number; stage: string | null; project_id: string | null }) => void;
  onSlowTick?: (line: { event: "fleet_supervisor_tick_slow"; tick_started_at: string; duration_ms: number;
    synchronous_ms: number; project_id: string; watch_timings: FleetSupervisorWatchTiming[] }) => void;
}

export function fleetSupervisorSlowTickMs(raw: string | undefined) {
  if (raw === undefined) return 5_000;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1_000 || value > 3_600_000) {
    throw new Error("MISSION_CONTROL_FLEET_SUPERVISOR_SLOW_TICK_MS must be 1000-3600000.");
  }
  return value;
}

export function fleetSupervisorStallMs(raw: string | undefined, pollMs: number) {
  if (raw === undefined) return Math.max(5 * pollMs, 300_000);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1_000 || value > 3_600_000) {
    throw new Error("MISSION_CONTROL_FLEET_SUPERVISOR_STALL_MS must be 1000-3600000.");
  }
  return value;
}

// Each invocation owns its guard. Abandoned settlements cannot publish evidence
// or release a replacement invocation's guard.
export class FleetSupervisorLoop<T> {
  private active: { started: number; controller: AbortController } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  private readonly enabledAt: number;
  private lastSlowTickLoggedAt: number | null = null;
  private readonly state: Omit<FleetSupervisorLoopStatus, "stalled">;

  constructor(private readonly runtime: LoopRuntime<T> | null, private readonly options: FleetSupervisorLoopOptions<T> = {}) {
    this.now = options.now ?? Date.now;
    this.enabledAt = this.now();
    const pollMs = options.pollMs ?? 60_000;
    this.state = { enabled: options.enabled ?? true, pollMs,
      stallMs: options.stallMs ?? fleetSupervisorStallMs(undefined, pollMs),
      slowTickMs: options.slowTickMs ?? fleetSupervisorSlowTickMs(undefined),
      lastTickStartedAt: null, lastTickCompletedAt: null, lastTickFailedAt: null,
      lastTickDurationMs: null, lastTickWatchTimings: [],
      lastErrorMessage: null, consecutiveFailures: 0, stalledTickCount: 0 };
  }

  status(): FleetSupervisorLoopStatus {
    const lastCompletion = this.state.lastTickCompletedAt;
    return { ...this.state, stalled: this.state.enabled
      && this.now() - (lastCompletion === null ? this.enabledAt : Date.parse(lastCompletion)) > this.state.stallMs + this.state.pollMs };
  }

  start() {
    if (!this.state.enabled || this.timer) return this;
    this.timer = setInterval(() => this.advance(), this.state.pollMs);
    this.timer.unref();
    this.advance();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.state.enabled = false;
    this.active?.controller.abort();
  }

  // Also the deterministic timer seam for tests; production calls it on each poll.
  advance() {
    if (!this.state.enabled || !this.runtime) return;
    const now = this.now();
    if (this.active) {
      const age = now - this.active.started;
      if (age <= this.state.stallMs) return;
      const progress = this.runtime.currentProgress;
      this.state.stalledTickCount += 1;
      this.options.onStall?.({ event: "fleet_supervisor_tick_stalled",
        tick_started_at: new Date(this.active.started).toISOString(), age_ms: age,
        stage: progress?.stage ?? null, project_id: progress?.projectId ?? null });
      this.active.controller.abort();
    }
    const invocation = { started: now, controller: new AbortController() };
    this.active = invocation;
    this.state.lastTickStartedAt = new Date(now).toISOString();
    void (async () => {
      try {
        const watchTimings: FleetSupervisorWatchTiming[] = [];
        let published = false;
        const publish = (results: T) => {
          if (this.active !== invocation || invocation.controller.signal.aborted) return;
          published = true;
          this.options.onResults?.(results);
        };
        const results = await this.runtime!.tick(new Date(now).toISOString(), invocation.controller.signal,
          (timing) => watchTimings.push(timing), publish);
        if (this.active !== invocation || invocation.controller.signal.aborted) return;
        const completed = this.now();
        this.state.lastTickCompletedAt = new Date(completed).toISOString();
        this.state.lastTickDurationMs = Math.max(0, completed - now);
        this.state.lastTickWatchTimings = watchTimings;
        this.state.consecutiveFailures = 0;
        const synchronousMs = watchTimings.reduce((sum, timing) => sum + timing.synchronousMs, 0);
        if (synchronousMs > this.state.slowTickMs && this.options.onSlowTick
          && (this.lastSlowTickLoggedAt === null || completed - this.lastSlowTickLoggedAt >= 600_000)) {
          this.lastSlowTickLoggedAt = completed;
          const slowestWatch = watchTimings.reduce((slowest, timing) => timing.synchronousMs > slowest.synchronousMs ? timing : slowest);
          this.options.onSlowTick({ event: "fleet_supervisor_tick_slow", tick_started_at: new Date(now).toISOString(),
            duration_ms: this.state.lastTickDurationMs, synchronous_ms: synchronousMs,
            project_id: slowestWatch.projectId, watch_timings: watchTimings });
        }
        // Keep batch-only runtimes compatible without republishing streamed watches.
        if (!published) publish(results);
      } catch (error) {
        if (this.active !== invocation || invocation.controller.signal.aborted) return;
        this.state.lastTickFailedAt = new Date(this.now()).toISOString();
        this.state.lastErrorMessage = error instanceof Error ? error.message : "Unknown fleet supervisor failure";
        this.state.consecutiveFailures += 1;
        this.options.onFailure?.(error);
      } finally {
        if (this.active === invocation) this.active = null;
      }
    })();
  }
}
