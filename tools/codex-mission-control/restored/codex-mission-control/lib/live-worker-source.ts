import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { sha256 } from "./canonical";
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
}

export function observeLiveWorkerSource(
  config: LiveWorkerSourceConfig,
  observedAt = new Date().toISOString(),
): Extract<MissionControlEventV2, { type: "live_worker_evidence_observed" }> {
  const sourcePath = path.resolve(config.sourcePath);
  const worktreePath = path.resolve(config.worktreePath);
  const bytes = fs.readFileSync(sourcePath);
  const state = liveStateSchema.parse(JSON.parse(bytes.toString("utf8")));
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
      const identity = `${observed.content_sha256}:${observed.head}`;
      if (identity === lastIdentity) return;
      const event = store.append({
        schema_version: 2,
        event_id: `live-source:${observed.worker}:${sha256(identity).slice(0, 32)}`,
        mission_id: "mission-control-issue-47",
        occurred_at: observed.observed_at,
        data: observed,
      });
      lastIdentity = identity;
      onEvent(event);
    } catch (error) {
      console.error(`Live worker source observation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      polling = false;
    }
  };
  poll();
  const timer = setInterval(poll, intervalMs);
  timer.unref();
  return { close: () => clearInterval(timer), poll };
}
