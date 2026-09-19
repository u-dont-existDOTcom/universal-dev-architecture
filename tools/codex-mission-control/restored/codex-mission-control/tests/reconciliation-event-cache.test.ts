import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  capabilityChallengeSummary,
  capabilityReceiptCommentPrefix,
  capabilityVerifiedSummary,
  GitHubReconciliationCacheInconsistencyError,
  GitHubReconciliationEventCache,
  reconcileGitHubDecisionReceipts,
  type GitHubReceiptPolicy,
} from "../lib/github-decision-receipts";
import { seedIssue47Store } from "../lib/seed";
import { EventStore } from "../lib/store";

const token = `reconciliation-cache-test-${"x".repeat(40)}`;
const occurredAt = "2026-09-02T00:00:00.000Z";
const packageRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

test("file-backed reconciliation cache stays incremental, reconstructs on restart, and leaves live authority routes responsive", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mc-reconciliation-cache-"));
  const filename = join(directory, "events.db");
  const store = new EventStore(filename);
  let child: ReturnType<typeof spawn> | null = null;
  try {
    seedIssue47Store(store);
    store.appendMany(Array.from({ length: 12_000 - store.count() }, (_, index) => ({
      event: reviewEnvelope(index + 1),
      receivedAt: occurredAt,
    })));

    const originalAllEvents = store.allEvents.bind(store);
    let fullHistoryLoads = 0;
    store.allEvents = () => {
      fullHistoryLoads += 1;
      return originalAllEvents();
    };
    const cache = GitHubReconciliationEventCache.fromStore(store);
    const p = policy();
    let capabilityComments: unknown[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const body = url.pathname.includes(`/issues/${p.capabilityIssueNumber}/comments`)
        ? capabilityComments
        : [];
      return new Response(JSON.stringify(body), { status: 200 });
    };

    await reconcileGitHubDecisionReceipts(store, { policy: p, eventCache: cache, fetchImpl });
    await reconcileGitHubDecisionReceipts(store, { policy: p, eventCache: cache, fetchImpl });
    assert.equal(fullHistoryLoads, 1, "the second cycle must not reload the complete durable history");

    store.append(evidenceEnvelope("chat-capability-challenge:challenge-spec", capabilityChallengeSummary, [
      "challenge:challenge-spec",
      "chat:spec-bootstrap",
      "mc_nonce:mc-nonce",
      "supervisor:spec",
      `github_nonce_sha256:${sha256ForTest("github-only-nonce")}`,
      `github_nonce_source:https://github.com/${p.repository}/issues/${p.capabilityIssueNumber}`,
      `receipt_target:https://github.com/${p.repository}/issues/${p.capabilityIssueNumber}`,
      `stage_receipt_target:https://github.com/${p.repository}/issues/${p.stageIssueNumber}`,
      "expires_at:2026-09-03T00:00:00.000Z",
      "model_visible_label:GPT-5.6 Sol",
      "thinking_control_label:Thinking effort",
      "thinking_visible_label:Extra High",
      "thinking_ordinal:4 of 5",
      "account_plan_label:Pro",
      "account_plan_role:PROVENANCE_METADATA_ONLY",
      "account_plan_is_reasoning_mode:false",
    ]));
    capabilityComments = [githubComment(p)];
    const newlyValid = await reconcileGitHubDecisionReceipts(store, {
      policy: p,
      eventCache: cache,
      fetchImpl,
      now: "2026-09-02T00:02:00.000Z",
    });
    assert.equal(newlyValid.length, 1, "an event appended outside reconciliation must be visible on the next cycle");
    assert.equal(newlyValid[0]?.data.type === "evidence_receipt_recorded"
      && newlyValid[0].data.summary === capabilityVerifiedSummary, true);
    const duplicate = await reconcileGitHubDecisionReceipts(store, {
      policy: p,
      eventCache: cache,
      fetchImpl,
      now: "2026-09-02T00:03:00.000Z",
    });
    assert.deepEqual(duplicate, [], "a repeated GitHub receipt must remain idempotent");
    assert.equal(fullHistoryLoads, 1, "normal incremental cycles must continue to avoid allEvents");

    store.append(evidenceEnvelope("gap-probe", "CACHE_GAP_PROBE", ["probe:gap"]));
    const originalEventsAfter = store.eventsAfter.bind(store);
    store.eventsAfter = () => [];
    assert.throws(
      () => cache.eventsForCycle(store),
      GitHubReconciliationCacheInconsistencyError,
      "a missing durable suffix must refuse the current cycle",
    );
    assert.equal(fullHistoryLoads, 2, "an inconsistency may rebuild once but must still fail the current cycle");
    store.eventsAfter = originalEventsAfter;
    assert.equal(cache.eventsForCycle(store).at(-1)?.eventId, "cache-fixture-gap-probe");

    store.allEvents = originalAllEvents;
    store.close();
    const restarted = new EventStore(filename);
    try {
      const restartedCache = GitHubReconciliationEventCache.fromStore(restarted);
      assert.equal(restartedCache.eventsForCycle(restarted).length, 12_003);
      assert.equal(restarted.verifyChain().valid, true);
    } finally {
      restarted.close();
    }

    const port = await availablePort();
    const env = cleanDaemonEnv();
    child = spawn(process.execPath, ["--import", "tsx", "tests/fixtures/slow-github-reconciliation-daemon.ts"], {
      cwd: packageRoot,
      env: {
        ...env,
        MISSION_CONTROL_DAEMON_HOST: "127.0.0.1",
        MISSION_CONTROL_DAEMON_PORT: String(port),
        MISSION_CONTROL_INTERNAL_TOKEN: token,
        MISSION_CONTROL_DB: filename,
        MISSION_CONTROL_SKIP_SEED: "1",
        MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON: JSON.stringify(p),
        MISSION_CONTROL_GITHUB_RECONCILIATION_INTERVAL_MS: "30000",
        MISSION_CONTROL_TEST_GITHUB_FETCH_DELAY_MS: "3000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = await waitForRunningReconciliation(child);
    const origin = `http://127.0.0.1:${port}`;
    const latencies: number[] = [];
    for (let sample = 0; sample < 8; sample += 1) {
      const liveStartedAt = Date.now();
      const live = await fetch(`${origin}/live`, { signal: AbortSignal.timeout(2_000) });
      latencies.push(Date.now() - liveStartedAt);
      assert.equal(live.status, 200);

      const statusStartedAt = Date.now();
      const status = await fetch(`${origin}/submission-authority/status`, {
        headers: authorityHeaders(),
        signal: AbortSignal.timeout(2_000),
      });
      latencies.push(Date.now() - statusStartedAt);
      assert.equal(status.status, 503);
      await delay(100);
    }
    assert.equal(output().includes("github_supervision_reconciliation_completed"), false,
      "responsiveness probes must run while the deliberately slow cycle is still active");
    assert.ok(Math.max(...latencies) < 2_000,
      `live and authenticated scheduler status must remain well below 10s; observed ${Math.max(...latencies)}ms`);
  } finally {
    if (child) {
      child.kill("SIGTERM");
      if (child.exitCode === null) await once(child, "exit");
    } else {
      try { store.close(); } catch {}
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

function policy(): GitHubReceiptPolicy {
  return {
    repository: "u-dont-existDOTcom/universal-dev-architecture",
    decisionIssueNumber: 59,
    capabilityIssueNumber: 60,
    stageIssueNumber: 61,
    authorizedWriterLogins: ["u-dont-existDOTcom"],
    capabilityChallenges: [{
      challengeId: "challenge-spec",
      supervisorId: "spec",
      chatId: "spec-bootstrap",
      worker: "mission-control-live-slice",
      mcNonce: "mc-nonce",
      githubNonce: "github-only-nonce",
      expiresAt: "2026-09-03T00:00:00.000Z",
      modelVisibleLabel: "GPT-5.6 Sol",
      thinkingControlLabel: "Thinking effort",
      thinkingVisibleLabel: "Extra High",
      thinkingOrdinal: "4 of 5",
      accountPlanLabel: "Pro",
      accountPlanRole: "PROVENANCE_METADATA_ONLY",
      accountPlanIsReasoningMode: false,
    }],
  };
}

function evidenceEnvelope(receiptId: string, summary: string, refs: string[]) {
  return {
    schema_version: 2,
    event_id: `cache-fixture-${receiptId}`,
    mission_id: "mission-control-live",
    occurred_at: occurredAt,
    data: {
      type: "evidence_receipt_recorded",
      worker: "mission-control-live-slice",
      receipt_id: receiptId,
      producer_id: "collector:cache-test",
      producer_role: "COLLECTOR",
      evidence_class: "ARTIFACT",
      independence: "SAME_PROVENANCE",
      freshness: "CURRENT",
      exact_candidate_sha256: null,
      summary,
      refs,
      verified: true,
      changed_path_manifest: null,
    },
  };
}

function reviewEnvelope(index: number) {
  return {
    schema_version: 2,
    event_id: `cache-history-${index}`,
    mission_id: "mission-control-live",
    occurred_at: occurredAt,
    data: {
      type: "review_marked",
      worker: null,
      reviewed_through_sequence: index,
    },
  };
}

function githubComment(p: GitHubReceiptPolicy) {
  return {
    id: 40_001,
    html_url: `https://github.com/${p.repository}/issues/${p.capabilityIssueNumber}#issuecomment-40001`,
    created_at: "2026-09-02T00:01:30.000Z",
    updated_at: "2026-09-02T00:01:30.000Z",
    body: `${capabilityReceiptCommentPrefix}${JSON.stringify({
      schema_version: 1,
      challenge_id: "challenge-spec",
      chat_id: "spec-bootstrap",
      mc_nonce: "mc-nonce",
      github_nonce: "github-only-nonce",
      capabilities: ["MISSION_CONTROL_READ", "GITHUB_READ", "GITHUB_WRITE"],
    })}`,
    user: { login: "u-dont-existDOTcom" },
  };
}

function sha256ForTest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  server.close();
  await once(server, "close");
  return address.port;
}

async function waitForRunningReconciliation(child: ReturnType<typeof spawn>): Promise<() => string> {
  let output = "";
  let stderr = "";
  child.stdout!.setEncoding("utf8");
  child.stderr!.setEncoding("utf8");
  child.stdout!.on("data", (chunk) => { output += chunk; });
  child.stderr!.on("data", (chunk) => { stderr += chunk; });
  for (let attempt = 0; attempt < 4_800; attempt += 1) {
    if (output.includes("Mission Control daemon listening")
      && output.includes("github_supervision_reconciliation_started")) return () => output;
    if (child.exitCode !== null) throw new Error(`Daemon exited before reconciliation probe: ${stderr}`);
    await delay(25);
  }
  throw new Error(`Timed out waiting for active reconciliation: ${stderr}`);
}

function authorityHeaders(): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    "x-mission-control-producer-id": "owner:cache-test",
    "x-mission-control-producer-kind": "OWNER_AUTHORITY",
    "x-mission-control-worker-scopes": "*",
    "x-mission-control-task-scopes": "*",
  };
}

function cleanDaemonEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("MISSION_CONTROL_SUBMISSION_")
      || key.startsWith("MISSION_CONTROL_SUPERVISOR_")
      || key.startsWith("MISSION_CONTROL_INGEST_")) delete env[key];
  }
  return env;
}
