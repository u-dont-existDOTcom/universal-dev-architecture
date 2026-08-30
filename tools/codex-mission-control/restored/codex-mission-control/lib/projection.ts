import { driftConfig, DriftConfig } from "./drift-config";
import {
  ObjectiveCreatedEvent,
  StoredEvent,
  SupervisorVerdictEvent,
  WorkerHeartbeatEvent,
} from "./schema";

export type Health = "GREEN" | "YELLOW" | "RED";
export type WorkerStatus = "working" | "blocked" | "done";
export type Verdict = "ON_TRACK" | "WATCH" | "REDIRECT";

export interface WarningSignal {
  code: string;
  label: string;
  points: number;
  immediate: boolean;
}

export interface WorkerState {
  id: string;
  name: string;
  objective: ObjectiveCreatedEvent;
  supervisorChatUrl: string;
  supervisorChatLabel: string;
  supervisorChatIsPlaceholder: boolean;
  status: WorkerStatus;
  health: Health;
  alignment: number;
  driftScore: number;
  verdict: Verdict;
  currentStep: string;
  completedSteps: string[];
  nextSteps: string[];
  planChanged: boolean;
  planChangeReason: string | null;
  blocker: string | null;
  assumptions: string[];
  filesTouched: string[];
  diffLines: number;
  commits: Array<{ sha: string; message: string }>;
  tests: { passing: number; failing: number; lint: string; build: string };
  warnings: WarningSignal[];
  supervisor: {
    verdict: Verdict;
    reason: string;
    correctiveAction: string | null;
    reviewAfter: string;
  };
  lastCheckpointAt: string;
  timeline: StoredEvent[];
}

export function projectWorkers(events: StoredEvent[], now = new Date(), config: DriftConfig = driftConfig): WorkerState[] {
  const workerIds = [...new Set(events.filter((event) => event.type === "objective_created").map((event) => event.worker))];
  return workerIds.map((worker) => projectWorker(events.filter((event) => event.worker === worker), now, config));
}

export function projectWorker(events: StoredEvent[], now = new Date(), config: DriftConfig = driftConfig): WorkerState {
  const objectiveEvent = events.find((event) => event.type === "objective_created");
  if (!objectiveEvent || objectiveEvent.data.type !== "objective_created") throw new Error("Worker has no objective contract");
  const objective = objectiveEvent.data;
  const heartbeats = events.filter((event) => event.data.type === "worker_heartbeat");
  const heartbeat = lastData<WorkerHeartbeatEvent>(heartbeats);
  const verdictEvents = events.filter((event) => event.data.type === "supervisor_verdict");
  const supervisorVerdict = lastData<SupervisorVerdictEvent>(verdictEvents);
  const linkEvent = [...events].reverse().find((event) => event.data.type === "supervisor_chat_link_set");
  const link = linkEvent?.data.type === "supervisor_chat_link_set" ? linkEvent.data : null;
  const latestEvent = events.at(-1) ?? objectiveEvent;

  const filesTouched = unique(events.flatMap((event) => {
    if (event.data.type === "files_changed") return event.data.files;
    if (event.data.type === "worker_heartbeat") return event.data.files_touched;
    return [];
  }));
  const commits = events.flatMap((event) => event.data.type === "commit_created"
    ? [{ sha: event.data.sha, message: event.data.message }]
    : []);
  const latestTests = [...events].reverse().find((event) => event.data.type === "tests_run");
  const tests = heartbeat?.tests ?? (latestTests?.data.type === "tests_run"
    ? { passing: latestTests.data.passing, failing: latestTests.data.failing, lint: "not_run", build: "not_run" }
    : { passing: 0, failing: 0, lint: "not_run", build: "not_run" });

  const latestPlanChange = [...events].reverse().find((event) => event.data.type === "plan_changed");
  const outOfScope = filesTouched.some((file) => objective.forbidden_scope.some((pattern) => pathMatches(file, pattern)));
  const testRegression = events.some((event) => event.data.type === "tests_run" && event.data.previously_passing_regressed);
  const diffLines = Math.max(
    heartbeat?.diff_lines ?? 0,
    ...events.flatMap((event) => event.data.type === "files_changed" ? [event.data.additions + event.data.deletions] : []),
  );
  const expectedMax = objective.expected_max_diff_lines ?? config.limits.largeDiffLines;
  const staleMs = config.limits.staleCheckpointMinutes * 60_000;
  const stale = now.getTime() - new Date(latestEvent.occurredAt).getTime() > staleMs;

  const warnings: WarningSignal[] = [];
  addWarning(warnings, supervisorVerdict?.work_no_longer_serves_objective === true, "supervisor_misalignment", "Supervisor says current work no longer serves the objective", config.weights.supervisorMisalignment);
  addWarning(
    warnings,
    heartbeat?.plan_changed === true && !heartbeat.plan_change_reason || latestPlanChange?.data.type === "plan_changed" && !latestPlanChange.data.reason,
    "unexplained_plan_change",
    "Plan changed without an explanation",
    config.weights.unexplainedPlanChange,
  );
  addWarning(warnings, outOfScope, "out_of_scope_touch", "Files in explicitly forbidden scope were touched", config.weights.outOfScopeTouch);
  addWarning(warnings, testRegression, "test_regression", "Previously passing tests regressed", config.weights.testRegression);
  addWarning(warnings, diffLines > expectedMax, "oversized_diff", `Diff is larger than the expected ${expectedMax}-line scope`, config.weights.oversizedDiff);
  addWarning(warnings, (heartbeat?.repeated_failure_count ?? 0) >= config.limits.repeatedFailureCount, "repeated_failure_loop", "Repeated failure / undo / retry loop detected", config.weights.repeatedFailureLoop);
  addWarning(warnings, heartbeat?.assumptions_materially_changed === true, "material_assumption_change", "Requirements assumptions materially changed", config.weights.materialAssumptionChange);
  addWarning(warnings, stale, "stale_checkpoint", "Checkpoint is stale", config.weights.staleCheckpoint);

  addWarning(warnings, supervisorVerdict?.verdict === "REDIRECT" || events.some((event) => event.type === "redirect_issued"), "supervisor_redirect", "Supervisor issued a redirect", 0, true);
  addWarning(warnings, events.some((event) => event.data.type === "files_changed" && event.data.destructive_action) || heartbeat?.destructive_action === true, "destructive_action", "Unexpected destructive action reported", 0, true);
  addWarning(warnings, heartbeat?.architecture_rewrite === true && !heartbeat.architecture_rewrite_explained, "unexplained_architecture_rewrite", "Unexplained architecture rewrite", 0, true);
  addWarning(warnings, events.some((event) => event.data.type === "files_changed" && event.data.touched_other_worker_area) || heartbeat?.touched_other_worker_area === true, "other_worker_owned_area", "Another worker's owned area was modified", 0, true);
  addWarning(warnings, heartbeat?.major_contract_violation === true, "major_contract_violation", "Major objective-contract violation", 0, true);

  const driftScore = Math.min(100, warnings.reduce((total, warning) => total + warning.points, 0));
  const immediate = warnings.some((warning) => warning.immediate);
  const verdict = supervisorVerdict?.verdict ?? "ON_TRACK";
  const health: Health = immediate || driftScore >= config.thresholds.red
    ? "RED"
    : verdict === "WATCH" || driftScore >= config.thresholds.yellow
      ? "YELLOW"
      : "GREEN";
  const alignment = Math.round((supervisorVerdict?.alignment ?? Math.max(0, 1 - driftScore / 100)) * 100);
  const blockerEvent = [...events].reverse().find((event) => event.data.type === "blocker_reported");
  const blocker = heartbeat?.blocker ?? (blockerEvent?.data.type === "blocker_reported" ? blockerEvent.data.blocker : null);
  const completed = events.some((event) => event.type === "task_completed");
  const status = completed ? "done" : blocker ? "blocked" : heartbeat?.status ?? "working";
  const supervisorChatUrl = link?.supervisor_chat_url ?? objective.supervisor_chat_url;

  return {
    id: objective.worker,
    name: objective.worker_name,
    objective,
    supervisorChatUrl,
    supervisorChatLabel: link?.supervisor_chat_label ?? objective.supervisor_chat_label,
    supervisorChatIsPlaceholder: /replace-|example|placeholder/i.test(supervisorChatUrl),
    status,
    health,
    alignment,
    driftScore,
    verdict,
    currentStep: heartbeat?.current_step ?? "Awaiting first worker checkpoint",
    completedSteps: heartbeat?.completed_steps ?? [],
    nextSteps: heartbeat?.next_steps ?? [],
    planChanged: heartbeat?.plan_changed ?? latestPlanChange !== undefined,
    planChangeReason: heartbeat?.plan_change_reason ?? (latestPlanChange?.data.type === "plan_changed" ? latestPlanChange.data.reason : null),
    blocker,
    assumptions: heartbeat?.assumptions ?? [],
    filesTouched,
    diffLines,
    commits,
    tests,
    warnings,
    supervisor: {
      verdict,
      reason: supervisorVerdict?.reason ?? "No supervisor assessment received yet.",
      correctiveAction: supervisorVerdict?.corrective_action ?? null,
      reviewAfter: supervisorVerdict?.review_after ?? "next_checkpoint",
    },
    lastCheckpointAt: (heartbeats.at(-1) ?? latestEvent).occurredAt,
    timeline: [...events].reverse(),
  };
}

export function summarizeChanges(events: StoredEvent[], lastViewedEventId: number, now = new Date()): string {
  const changed = events.filter((event) => event.id > lastViewedEventId);
  if (changed.length === 0) return "No new worker or supervisor events since your last review.";
  const before = new Map(projectWorkers(events.filter((event) => event.id <= lastViewedEventId), now).map((worker) => [worker.id, worker]));
  const after = new Map(projectWorkers(events, now).map((worker) => [worker.id, worker]));
  const changedIds = unique(changed.map((event) => event.worker));
  const statements = changedIds.map((id) => {
    const current = after.get(id);
    if (!current) return null;
    const previous = before.get(id);
    if (!previous) return `${current.name} was added in ${current.health.toLowerCase()} state with a ${formatVerdict(current.verdict)} verdict.`;
    if (previous.health !== current.health) {
      const cause = current.warnings[0]?.label.toLowerCase() ?? current.supervisor.reason.toLowerCase();
      return `${current.name} moved from ${previous.health.toLowerCase()} to ${current.health.toLowerCase()} because ${cause}.`;
    }
    const relevant = changed.filter((event) => event.worker === id);
    if (relevant.some((event) => event.type === "supervisor_chat_link_set")) return `${current.name}'s Pro supervisor chat link was updated.`;
    if (relevant.some((event) => event.type === "supervisor_verdict")) return `${current.name} remains ${current.health.toLowerCase()} with a ${formatVerdict(current.verdict)} verdict.`;
    if (current.status === "blocked") return `${current.name} is blocked on ${current.blocker ?? "a reported dependency"}.`;
    return `${current.name} reported new progress and remains ${current.health.toLowerCase()}.`;
  }).filter(Boolean);
  const unresolvedFailures = [...after.values()].reduce((count, worker) => count + worker.tests.failing, 0);
  statements.push(unresolvedFailures === 0 ? "No test regressions are unresolved." : `${unresolvedFailures} failing test${unresolvedFailures === 1 ? " is" : "s are"} currently reported.`);
  return statements.join(" ");
}

function addWarning(target: WarningSignal[], condition: boolean, code: string, label: string, points: number, immediate = false) {
  if (condition) target.push({ code, label, points, immediate });
}

function lastData<T>(events: StoredEvent[]): T | undefined {
  return events.at(-1)?.data as T | undefined;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function pathMatches(file: string, pattern: string): boolean {
  const prefix = pattern.replace(/\*\*.*$/, "").replace(/\*.*$/, "").replace(/\/$/, "");
  return prefix.length > 0 && (file === prefix || file.startsWith(`${prefix}/`));
}

function formatVerdict(verdict: Verdict): string {
  return verdict.replace("_", " ");
}
