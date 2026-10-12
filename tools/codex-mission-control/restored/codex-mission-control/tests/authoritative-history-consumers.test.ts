import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { isRelayTransportEvent } from "../lib/dashboard-data";
import type { StoredEvent } from "../lib/schema";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function stored(sequence: number, data: any): StoredEvent {
  return {
    id: sequence, sequence, eventId: "event:" + sequence, schemaVersion: 2,
    missionId: "mission-control-live", worker: data.worker ?? null, type: data.type,
    occurredAt: "2026-10-07T18:00:00.000Z", receivedAt: "2026-10-07T18:00:00.000Z",
    previousHash: null, eventHash: String(sequence).padStart(64, "0"),
    producerId: "fixture", producerKind: "SYSTEM", data,
  } as unknown as StoredEvent;
}

test("relay transport filter intentionally omits native Work dispatch and owner-outcome authority events", () => {
  const worker = "fixture-worker";
  const ownerOutcome = stored(1, {
    type: "owner_outcome_recorded", worker, owner_request_id: "owner:1",
    owner_outcome_id: "outcome:1", epoch: 1, source_receipt_id: "source:1",
    owner_source_sha256: "a".repeat(64), owner_outcome_sha256: "b".repeat(64),
    verbatim_owner_request: ["fixture"], normalized_result: "fixture",
    current_gap: "fixture", gap_status: "OPEN", required_outcomes: [],
    non_satisfying_proxies: [], supersedes: null,
  });
  const dispatch = stored(2, {
    type: "chatgpt_work_cloud_dispatch_recorded", worker, dispatch_id: "work-cloud:fixture",
    mode: "CREATE", requested_surface: "CHATGPT_WORK_CLOUD", directive_id: "directive:fixture",
    directive_revision: 1, task_id: "task:fixture", app_tool: "create_thread",
    status: "READY", work_thread_id: "thread:fixture", client_thread_id: null,
    approval_state: "ACCEPTED", surface_verification: "VERIFIED_NATIVE_WORK",
    native_surface_evidence: "TRUSTED_APP_EXECUTOR_CHATGPT_WORK_CLOUD_TARGET",
    host_id: null, error_code: null, recorded_at: "2026-10-07T18:00:00.000Z",
    producer_id: "system:chatgpt-work-cloud-dispatch", source: "TRUSTED_CHATGPT_APP_EXECUTOR_BOUNDARY",
  });
  const route = stored(3, {
    type: "worker_message_recorded", worker, message_id: "message:fixture",
    thread_id: "thread:route", message_kind: "QUESTION", body: "route",
    reply_to_message_id: null, direction_id: null,
  });
  assert.equal(isRelayTransportEvent(ownerOutcome), false);
  assert.equal(isRelayTransportEvent(dispatch), false);
  assert.equal(isRelayTransportEvent(route), true);
});

test("Work supervisor recorder and owner decision endpoint consume authoritative event history", () => {
  for (const relative of [
    "scripts/record-work-supervisor-handoff.ts",
    "app/api/workers/[worker]/owner-decision/route.ts",
  ]) {
    const source = readFileSync(path.join(root, relative), "utf8");
    assert.match(source, /daemonFetch\("\/events"\)/);
    assert.match(source, /payload\.events\.filter\(\(event\) => event\.worker ===/);
    assert.doesNotMatch(source, /daemonFetch\("\/workers\//);
  }
});
