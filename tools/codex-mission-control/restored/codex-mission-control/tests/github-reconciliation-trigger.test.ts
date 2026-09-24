import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { GitHubReconciliationCoordinator } from "../lib/github-reconciliation-coordinator";
import type { StoredEvent } from "../lib/schema";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

function event(requestId: string, sequence: number): StoredEvent {
  return {
    data: { request_id: requestId },
    sequence,
  } as unknown as StoredEvent;
}

test("manual reconciliation trigger serializes with the background cycle and returns bounded metadata", async () => {
  let release!: () => void;
  let executions = 0;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const coordinator = new GitHubReconciliationCoordinator({
    execute: async () => {
      executions += 1;
      await gate;
      return [event("request:z", 10), event("request:a", 11), event("request:z", 12)];
    },
    latestSequence: () => 12,
  });

  const first = coordinator.run("OWNER_RECOVERY");
  const overlapping = await coordinator.run("INTERVAL");
  assert.deepEqual(overlapping, {
    status: "ALREADY_RUNNING",
    trigger: "INTERVAL",
    appendedEvents: 0,
    requestIds: [],
    latestSequence: 12,
  });
  release();
  const completed = await first;
  assert.deepEqual(completed, {
    status: "COMPLETED",
    trigger: "OWNER_RECOVERY",
    appendedEvents: 3,
    requestIds: ["request:a", "request:z"],
    latestSequence: 12,
  });
  assert.equal(executions, 1);
});

test("repeated recovery is harmless when the underlying reconciler returns no new events", async () => {
  let pass = 0;
  const coordinator = new GitHubReconciliationCoordinator({
    execute: async () => (++pass === 1 ? [event("request:one", 1)] : []),
    latestSequence: () => pass,
  });
  const first = await coordinator.run("OWNER_RECOVERY");
  const duplicate = await coordinator.run("OWNER_RECOVERY");
  assert.equal(first.appendedEvents, 1);
  assert.deepEqual(first.requestIds, ["request:one"]);
  assert.equal(duplicate.status, "COMPLETED");
  assert.equal(duplicate.appendedEvents, 0);
  assert.deepEqual(duplicate.requestIds, []);
});

test("owner-facing reconcile route is bodyless, authenticated, and never handles secret values", () => {
  const route = read("app/api/github/decision-receipts/reconcile/route.ts");
  assert.match(route, /authenticateOwnerRequest\(request, true\)/);
  assert.match(route, /request\.text\(\)/);
  assert.match(route, /body\.length !== 0/);
  assert.match(route, /relayJson\("\/github\/decision-receipts\/reconcile"/);
  assert.match(route, /daemonMutationHeaders\(authentication\.principal\)/);
  assert.doesNotMatch(route, /MISSION_CONTROL_(?:OWNER|INTERNAL|GITHUB).*TOKEN/);
  assert.doesNotMatch(route, /candidate|receipt.*body|githubDecisionCandidate/i);
});

test("daemon trigger cannot replace the unchanged SYSTEM-only receipt-ingestion route", () => {
  const daemon = read("daemon/server.ts");
  assert.match(daemon, /url\.pathname === "\/github\/decision-receipts\/reconcile"/);
  assert.match(daemon, /producer\.kind !== "OWNER_AUTHORITY" && producer\.kind !== "UI"/);
  assert.match(daemon, /readBody\(request, 1_000\)\)\.length !== 0/);
  assert.match(daemon, /githubReconciliationCoordinator\.run\("OWNER_RECOVERY"\)/);
  assert.match(daemon, /producer\.kind !== "SYSTEM" \|\| producer\.id !== githubDecisionProducer\.id/);
  assert.match(daemon, /ingestGitHubSupervisionCandidate\(store, candidate, githubPolicy/);
});
