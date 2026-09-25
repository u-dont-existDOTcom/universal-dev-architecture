import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { sha256 } from "./canonical";
import { journalExecutionObservation } from "./journal-execution-observation";
import type { MissionControlEventV2 } from "./schema";
import type { EventStore } from "./store";

const liveStateSchema = z.object({
  schemaVersion: z.literal(1),
  worker: z.string().min(1),
  directiveId: z.string().min(1).nullable(),
  receiptId: z.string().min(1).nullable(),
  phase: z.enum(["DIRECTED", "IMPLEMENTING", "VERIFYING", "EVIDENCED", "COMPLETE"]),
  summary: z.string().min(1),
});

export interface LiveWorkerSourceConfig {
  sourcePath: string;
  worktreePath: string;
  sourceFormat?: "MISSION_CONTROL_V1" | "JOURNAL_EXECUTION_V1";
  workerId?: string;
  taskId?: string;
}

export function observeLiveWorkerSource(
  config: LiveWorkerSourceConfig,
  observedAt = new Date().toISOString(),
): Extract<MissionControlEventV2, { type: "live_worker_evidence_observed" }> {
  const sourcePath = path.resolve(config.sourcePath);
  const worktreePath = path.resolve(config.worktreePath);
  const bytes = fs.readFileSync(sourcePath);
  const raw = JSON.parse(bytes.toString("utf8"));
  const journal = config.sourceFormat === "JOURNAL_EXECUTION_V1";
  if (journal && (!config.workerId || !config.taskId)) throw new Error("Journal observations require configured worker and task identities.");
  if (config.sourceFormat && !["MISSION_CONTROL_V1", "JOURNAL_EXECUTION_V1"].includes(config.sourceFormat)) throw new Error("Unknown live source format.");
  const observation = journal ? journalExecutionObservation(raw) : null;
  const state = observation ? { worker: config.workerId!, directiveId: null, receiptId: null,
    phase: observation.phase, summary: observation.summary } : liveStateSchema.parse(raw);
  const stat = fs.statSync(sourcePath);
  const git = (args: string[]) => execFileSync("git", ["-C", worktreePath, ...args], { encoding: "utf8" }).trim();
  return {
    type: "live_worker_evidence_observed",
    worker: state.worker,
    source_kind: "READ_ONLY_FILE_GIT",
    source_path: sourcePath,
    observed_at: observedAt,
    file_modified_at: stat.mtime.toISOString(),
    content_sha256: sha256(bytes.toString("utf8")),
    branch: git(["branch", "--show-current"]),
    head: git(["rev-parse", "HEAD"]),
    directive_id: state.directiveId,
    receipt_id: state.receiptId,
    phase: state.phase,
    summary: state.summary,
    ...(observation ? { task_id: config.taskId, blocker_code: observation.blockerCode } : {}),
  };
}

export function startLiveWorkerSourceWatcher(
  store: EventStore,
  config: LiveWorkerSourceConfig,
  onEvent: (event: unknown) => void,
  intervalMs = 750,
): { close(): void; poll(): void } {
  let lastIdentity = "";
  let polling = false;
  const poll = () => {
    if (polling) return;
    polling = true;
    try {
      const observed = observeLiveWorkerSource(config);
      const identity = `${observed.content_sha256}:${observed.file_modified_at}:${observed.head}:${config.sourceFormat ?? "MISSION_CONTROL_V1"}:${config.taskId ?? ""}`;
      if (identity === lastIdentity) return;
      const eventId = `live-source:${observed.worker}:${sha256(identity).slice(0, 32)}`;
      // Reopening the daemon is not a new observation of changed source bytes.
      if (store.eventByEventId(eventId)) { lastIdentity = identity; return; }
      const event = store.append({
        schema_version: 2,
        event_id: eventId,
        mission_id: "mission-control-live",
        occurred_at: observed.observed_at,
        data: observed,
      });
      lastIdentity = identity;
      onEvent(event);
    } catch (error) {
      console.error(config.sourceFormat === "JOURNAL_EXECUTION_V1"
        ? "JOURNAL_EXECUTION_OBSERVATION_UNAVAILABLE: source state remains unknown."
        : `Live worker source observation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      polling = false;
    }
  };
  poll();
  const timer = setInterval(poll, intervalMs);
  timer.unref();
  return { close: () => clearInterval(timer), poll };
}
