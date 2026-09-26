import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { journalExecutionObservation } from "../lib/journal-execution-observation";
import { observeLiveWorkerSource, startLiveWorkerSourceWatcher } from "../lib/live-worker-source";
import { EventStore } from "../lib/store";
import { seedIssue47Store } from "../lib/seed";
import { classifyFleetSupervisorTick } from "../lib/fleet-supervisor";
const observedAt = "2026-09-25T12:00:00.000Z";
function source(blocker: string | null = "COMPLETION_UNKNOWN") {
  return { stage: "EXTRACT", blocker, completed_units: [], completed_visual_pages: [1, 2],
    total_units: 100, completion: { profile_committed: "not_run" },
    case_id: "PRIVATE_CASE_MUST_NOT_TRAVEL", journal_text: "PRIVATE_JOURNAL_MUST_NOT_TRAVEL" };
}
test("journal observation strips case and journal content; unknown errors stay generic", () => {
  const out = journalExecutionObservation(source("PRIVATE_ERROR_MUST_NOT_TRAVEL"));
  assert.equal(out.phase, "BLOCKED"); assert.equal(out.blockerCode, "RUNTIME_BLOCKED");
  assert.equal(JSON.stringify(out).includes("PRIVATE_"), false);
  assert.equal(JSON.parse(out.summary.split("\n")[1]).semantic_authority, false);
});
test("long-running generation without a declared blocker is not diagnosed as stalled", () => {
  const out = journalExecutionObservation({ ...source(null), updated_at: "1990-01-01" });
  assert.equal(out.phase, "IMPLEMENTING"); assert.equal(out.blockerCode, null);
});
test("real file observer -> event store -> fleet routes the exact blocked task", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mc-journal-observation-"));
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store); const watch = store.fleetSupervisorWatch("project:human-design")!;
    const sourcePath = path.join(directory, "state.json"); fs.writeFileSync(sourcePath, JSON.stringify(source()));
    const data = observeLiveWorkerSource({ sourcePath, worktreePath: process.cwd(),
      sourceFormat: "JOURNAL_EXECUTION_V1", workerId: watch.worker, taskId: watch.taskId }, observedAt);
    assert.equal(data.phase, "BLOCKED"); assert.equal(data.blocker_code, "COMPLETION_UNKNOWN");
    assert.equal(JSON.stringify(data).includes("PRIVATE_CASE"), false);
    store.append({ schema_version: 2, event_id: "observation:journal", mission_id: "test", occurred_at: observedAt, data },
      observedAt, { id: "collector:fixture", kind: "COLLECTOR", workerScopes: [watch.worker], taskScopes: [watch.taskId] });
    const result = classifyFleetSupervisorTick(watch, store.workerEvents(watch.worker), { valid: true, errors: [] });
    assert.equal(result.trigger, "EXECUTION_BLOCKED"); assert.equal(result.reasoningRequired, true);
    assert.equal(result.mechanicalRecoveryEligible, false); assert.equal(result.notifyOwner, false);
    // A different task's observation may not authorize review or continuation here.
    const other = { ...watch, taskId: "task:other" };
    assert.notEqual(classifyFleetSupervisorTick(other, store.workerEvents(watch.worker),
      { valid: true, errors: [] }).trigger, "EXECUTION_BLOCKED");
  } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
test("the existing watcher deduplicates unchanged source across daemon restart", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mc-journal-restart-"));
  const store = new EventStore(":memory:");
  try {
    seedIssue47Store(store);
    const baseline = store.latestSequence();
    const watch = store.fleetSupervisorWatch("project:human-design")!;
    const sourcePath = path.join(directory, "state.json"); fs.writeFileSync(sourcePath, JSON.stringify(source()));
    const config = { sourcePath, worktreePath: process.cwd(), sourceFormat: "JOURNAL_EXECUTION_V1" as const,
      workerId: watch.worker, taskId: watch.taskId };
    const first = startLiveWorkerSourceWatcher(store, config, () => {}); first.close();
    const sequence = store.latestSequence(); assert.equal(sequence, baseline + 1);
    const restarted = startLiveWorkerSourceWatcher(store, config, () => {}); restarted.poll(); restarted.close();
    assert.equal(store.latestSequence(), sequence);
    fs.writeFileSync(sourcePath, JSON.stringify(source(null)));
    const changed = startLiveWorkerSourceWatcher(store, config, () => {}); changed.close();
    assert.equal(store.latestSequence(), sequence + 1);
    // A genuine recurrence after resolution has new file provenance even when bytes repeat.
    fs.writeFileSync(sourcePath, JSON.stringify(source()));
    const later = new Date(Date.now() + 1000); fs.utimesSync(sourcePath, later, later);
    const recurrence = startLiveWorkerSourceWatcher(store, config, () => {}); recurrence.close();
    assert.equal(store.latestSequence(), sequence + 2);
  } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
