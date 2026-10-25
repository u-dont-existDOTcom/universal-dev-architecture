// A registered task its supervisor held is asked again once Mission Control has verified a checkpoint (#385).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalJson, sha256 } from "../lib/canonical";
import {
  CHECKPOINT_REVIEW_DECISION_REQUESTED, classifyFleetSupervisorTick, FLEET_FACTUAL_STATE_LIMIT, fleetReasoningFactualState,
  FleetSupervisorRuntime, routeFleetSupervisorReasoning, type FleetSupervisorDecision,
} from "../lib/fleet-supervisor";
import { enrollFleetSupervisorWatch } from "../lib/fleet-watch-enrollment";
import { GitHubAppInstallationTokenProvider, githubReconciliationTokenProviderFromEnv } from "../lib/github-app-auth";
import { admittedCycleRequests, parseGitHubReceiptPolicy, pendingDecisionRequests, type PendingDecisionRequest } from "../lib/github-decision-receipts";
import { githubRepositoryFileReader } from "../lib/github-repository-files";
import { inBandRequestBindingEnvelope, inBandRequestRoutePrefix } from "../lib/in-band-request-binding";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import { ownerAttention, workerDisposition } from "../lib/owner-view";
import { parseOwnerTaskRegistration, registerOwnerTask } from "../lib/owner-task-registration";
import { OWNER_TASK_HELD_BY_SUPERVISOR_REASON } from "../lib/owner-task-source";
import { projectWorker } from "../lib/projection";
import type { AppendEnvelope, StoredEvent } from "../lib/schema";
import { EventStore } from "../lib/store";
import {
  isVerifiedTaskCheckpoint, parseTaskCheckpointRepositories, registeredTaskHold, TASK_CHECKPOINT_EXCERPT_LIMIT,
  TASK_CHECKPOINT_MAX_BYTES, TASK_CHECKPOINT_SUMMARY_PREFIX, TASK_CHECKPOINT_VERIFIER_ID, TaskCheckpointReadError,
  TaskCheckpointRejectedError, taskCheckpointEvidenceEnvelope, verifyTaskCheckpoint, type RepositoryFileReader,
} from "../lib/task-checkpoint";
import { recordTaskCheckpoint } from "../lib/task-checkpoint-record";

const owner: AuthenticatedProducer = { id: "owner:primary", kind: "OWNER_AUTHORITY", workerScopes: ["*"], taskScopes: ["*"] };
const decisionSystem: AuthenticatedProducer = { id: "system:github-decision-receipts", kind: "SYSTEM", workerScopes: ["*"], taskScopes: ["*"] };
const at = "2026-10-17T12:00:00.000Z";
const worker = "atlas-test-pilot";
const repository = "owner/private-ledger";
const BASE = "b".repeat(40);
const COMMIT = "c".repeat(40);
const HOLD_TEXT = "Decision: hold. The first bounded step is a checkpoint that names the inputs and their hashes. "
  + "x".repeat(1_400) + " Next review: the checkpoint.";

function bytesSha(value: string | Uint8Array) { return createHash("sha256").update(value).digest("hex"); }

function registered() {
  const store = new EventStore(":memory:");
  const parsed = parseOwnerTaskRegistration({
    worker, name: "Atlas test pilot", goal: "Collect public sources on one question and summarize them.",
    may_use: "Public sources\nChatGPT Work for collecting sources", must_never: "Spend money\nPublish anything", done_when: "A first brief exists",
  });
  assert.notEqual(typeof parsed, "string", String(parsed));
  registerOwnerTask(store, parsed as Exclude<typeof parsed, string>, owner, store.allEvents(), at);
  return store;
}

/** A repository at two commits: files at BASE, and the checkpoint (listing them) at COMMIT. */
function repo(overrides: { checkpoint?: Record<string, unknown>; files?: Record<string, string> } = {}) {
  const files = overrides.files ?? { "inputs/archive.zip": "zip bytes", "ledger/head.json": "{\"count\":3}" };
  const checkpoint = overrides.checkpoint ?? {
    schema: "EXAMPLE_CHECKPOINT_V1", task: worker, base_commit: BASE, "artifact": { path: "inputs/archive.zip" },
    files_sha256_at_base_commit: Object.fromEntries(Object.entries(files).map(([path, content]) => [path, bytesSha(content)])),
  };
  const text = JSON.stringify(checkpoint, null, 2);
  const reads: string[] = [];
  const read: RepositoryFileReader = async (repoName, path, commit, maxBytes) => {
    reads.push(`${repoName} ${commit.slice(0, 1)} ${path} ${maxBytes}`);
    assert.equal(repoName, repository);
    const content = commit === COMMIT && path === "checkpoints/example-v1.json" ? text
      : commit === BASE ? files[path] : undefined;
    if (content === undefined) throw new TaskCheckpointRejectedError(`${path} is not in ${repoName}.`);
    return new TextEncoder().encode(content);
  };
  return { read, reads, text, sha: bytesSha(text), files };
}

const request = (sha: string, extra: Partial<{ path: string; commit: string; worker: string }> = {}) => ({
  worker, repository, path: "checkpoints/example-v1.json", commit: COMMIT, sha256: sha, ...extra,
});

/** The supervisor's decision for the task's pending question, as Mission Control ingests it from GitHub. */
function appendDecision(store: EventStore, text: string, id: string, extra: Record<string, unknown> = {}) {
  const events = store.workerEvents(worker);
  const outcome = events.findLast((event) => event.data.type === "owner_outcome_recorded")!.data;
  assert.ok(outcome.type === "owner_outcome_recorded");
  const pending = pendingDecisionRequests(events).at(-1);
  return store.append({
    schema_version: 2, event_id: `github-decision:${id}`, mission_id: "mission-control-live", occurred_at: new Date().toISOString(),
    data: {
      type: "github_decision_receipt_ingested", worker, task_id: `task:${worker}`, receipt_id: `receipt:${id}`,
      request_id: pending?.requestId ?? `fleet-review:${sha256(id).slice(0, 32)}`, supervisor_id: "mc-project-manager", nonce: `nonce:${id}`,
      evidence_capsule: { id: `capsule:${id}`, sha256: "e".repeat(64) },
      owner_outcome_id: outcome.owner_outcome_id, owner_outcome_epoch: outcome.epoch, owner_outcome_sha256: outcome.owner_outcome_sha256,
      reasoning_lane: "EXTRA_HIGH_DIRECT",
      decision_block: { decision_id: `decision-${id}`, exact_text: text, sha256: sha256(text) },
      pro_decision_block: { used: false, model_mode: null, exact_text: null, sha256: null },
      writer_contract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretation_allowed: false },
      canonical_envelope_sha256: sha256(`envelope:${id}`),
      github_receipt: { repository: "owner/private-receipts", issue_number: 4, comment_id: 1_000 + store.count(),
        immutable_url: `https://github.com/owner/private-receipts/issues/4#issuecomment-${1_000 + store.count()}`,
        github_created_at: new Date().toISOString(), github_author_login: "owner", github_delivery_id: null },
      ingestion_method: "RECONCILIATION_POLL", ingested_at: new Date().toISOString(), ...extra,
    } as AppendEnvelope["data"],
  }, undefined, decisionSystem, store.allEvents());
}

test("a checkpoint is verified only when it and every file it lists match, at the exact commits named", async () => {
  const good = repo();
  const verification = await verifyTaskCheckpoint(request(good.sha), good.read);
  assert.equal(verification.baseCommit, BASE);
  assert.deepEqual(verification.files.map((file) => file.path), ["inputs/archive.zip", "ledger/head.json"]);
  assert.deepEqual(good.reads, [
    `${repository} c checkpoints/example-v1.json ${TASK_CHECKPOINT_MAX_BYTES}`,
    `${repository} b inputs/archive.zip ${32 * 1024 * 1024}`,
    `${repository} b ledger/head.json ${32 * 1024 * 1024}`,
  ]);

  await assert.rejects(verifyTaskCheckpoint(request("0".repeat(64)), good.read), /does not have the SHA-256 given/);
  const wrongFile = repo({ files: { "a.txt": "a" } });
  const tampered = { ...JSON.parse(wrongFile.text), files_sha256_at_base_commit: { "a.txt": bytesSha("not a") } };
  const tamperedRepo = repo({ checkpoint: tampered, files: { "a.txt": "a" } });
  await assert.rejects(verifyTaskCheckpoint(request(tamperedRepo.sha), tamperedRepo.read), /a\.txt at commit bbbbbbbbbbbb does not have the SHA-256/);
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ task: "another-task", base_commit: BASE, files_sha256_at_base_commit: { "a.txt": bytesSha("a") } }, /names another task/],
    [{ task: worker, base_commit: "main", files_sha256_at_base_commit: { "a.txt": bytesSha("a") } }, /base_commit must be/],
    [{ task: worker, base_commit: BASE, files_sha256_at_base_commit: {} }, /1 to 32 files/],
    [{ task: worker, base_commit: BASE, files_sha256_at_base_commit: Object.fromEntries(Array.from({ length: 33 }, (_, n) => [`f${n}`, "a".repeat(64)])) }, /1 to 32 files/],
    [{ task: worker, base_commit: BASE, files_sha256_at_base_commit: { "../secret": bytesSha("a") } }, /file path Mission Control can't read/],
    [{ task: worker, base_commit: BASE, files_sha256_at_base_commit: { "a.txt": "A".repeat(64) } }, /not 64 lowercase hex/],
  ];
  for (const [checkpoint, expected] of cases) {
    const bad = repo({ checkpoint, files: { "a.txt": "a" } });
    await assert.rejects(verifyTaskCheckpoint(request(bad.sha), bad.read), expected);
  }
  for (const bad of [{ path: "/etc/passwd" }, { path: "a/../b" }, { commit: "main" }, { worker: "Atlas" }]) {
    await assert.rejects(verifyTaskCheckpoint(request(good.sha, bad), good.read), TaskCheckpointRejectedError);
  }
  const notJson = { read: (async () => new TextEncoder().encode("not json")) as RepositoryFileReader };
  await assert.rejects(verifyTaskCheckpoint(request(bytesSha("not json")), notJson.read), /not a UTF-8 JSON document/);
});

test("the recorded evidence carries the checkpoint's statements to the supervisor, and only Mission Control's verifier makes it", async () => {
  const good = repo();
  const envelope = taskCheckpointEvidenceEnvelope(await verifyTaskCheckpoint(request(good.sha), good.read), at);
  assert.equal(envelope.data.type, "evidence_receipt_recorded");
  if (envelope.data.type !== "evidence_receipt_recorded") return;
  assert.equal(envelope.data.producer_id, TASK_CHECKPOINT_VERIFIER_ID);
  assert.equal(envelope.data.independence, "INDEPENDENT");
  assert.equal(envelope.data.exact_candidate_sha256, good.sha);
  assert.ok(envelope.data.refs.includes("status:STAGE_COMPLETE") && envelope.data.refs.includes("next_reasoning_review_required:true"));
  assert.ok(envelope.data.refs.includes(`checkpoint_commit:${COMMIT}`) && envelope.data.refs.includes("checkpoint_files_verified:2"));
  const [prefix, explanation, excerpt] = envelope.data.summary.split("\n");
  assert.equal(prefix, TASK_CHECKPOINT_SUMMARY_PREFIX);
  assert.match(explanation!, /It checked these hashes only, not what the checkpoint says/);
  const { files_sha256_at_base_commit: _files, ...statements } = JSON.parse(good.text);
  assert.equal(excerpt, canonicalJson(statements), "the statements, without the file list the hashes replace");
  const long = repo({ checkpoint: { ...JSON.parse(good.text), notes: "n".repeat(10_000) } });
  const clipped = taskCheckpointEvidenceEnvelope(await verifyTaskCheckpoint(request(long.sha), long.read), at);
  assert.ok(clipped.data.type === "evidence_receipt_recorded");
  const clippedExcerpt = clipped.data.summary.split("\n")[2]!;
  assert.equal(clippedExcerpt.length, TASK_CHECKPOINT_EXCERPT_LIMIT);
  assert.ok(clippedExcerpt.endsWith("…"));
  assert.match(clipped.data.summary.split("\n")[1]!, /cut at 4000 characters/);

  const store = registered();
  try {
    const stored = store.append(envelope, undefined, { id: TASK_CHECKPOINT_VERIFIER_ID, kind: "VERIFIER", workerScopes: [worker], taskScopes: [`task:${worker}`] });
    assert.equal(isVerifiedTaskCheckpoint(stored), true);
    // The same words from any other producer are not a verified checkpoint.
    const copy = store.append({ ...envelope, event_id: "copy:1", data: { ...envelope.data, receipt_id: "copy:1", producer_id: "collector:other", producer_role: "COLLECTOR" } as AppendEnvelope["data"] },
      undefined, { id: "collector:other", kind: "COLLECTOR", workerScopes: [worker], taskScopes: ["*"] });
    assert.equal(isVerifiedTaskCheckpoint(copy), false);
    // Nor are they when another producer writes the verifier's own id into the record.
    const borrowed = store.append({ ...envelope, event_id: "copy:2", data: { ...envelope.data, receipt_id: "copy:2" } as AppendEnvelope["data"] },
      undefined, { id: "collector:other", kind: "COLLECTOR", workerScopes: [worker], taskScopes: ["*"] });
    assert.equal(isVerifiedTaskCheckpoint(borrowed), false);
  } finally { store.close(); }
});

test("the owner's checkpoint-verify reads only the task's configured repository, only while the task is held", async () => {
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: `task:${worker}`, cadenceMs: 60_000 }, at);
      const good = repo();
      const repositories = parseTaskCheckpointRepositories(JSON.stringify({ [worker]: repository }));
      const options = { repositories, readerFor: () => good.read };
      const input = { worker, path: "checkpoints/example-v1.json", commit: COMMIT, sha256: good.sha };

      assert.equal((await recordTaskCheckpoint(store, input, { ...options, repositories: new Map() })).status, 409);
      const unregistered = await recordTaskCheckpoint(store, { ...input, worker: "other-worker" }, { ...options,
        repositories: new Map([["other-worker", repository]]) });
      assert.equal(unregistered.status, 409);
      assert.match(String(unregistered.body.error), /only for a task the owner registered/);
      const notHeld = await recordTaskCheckpoint(store, input, options);
      assert.equal(notHeld.status, 409, "a task waiting for its first question isn't held");
      assert.match(String(notHeld.body.error), /only while the task's supervisor holds it/);
      assert.equal((await recordTaskCheckpoint(store, { ...input, commit: "main" }, options)).status, 400);
      assert.equal(good.reads.length, 0, "nothing is read before the task is held");

      await new FleetSupervisorRuntime(store, { routeReasoning: (current, decision, events) => routeFleetSupervisorReasoning(store, current, decision, events) })
        .tick(new Date(Date.now() + 61_000).toISOString());
      appendDecision(store, HOLD_TEXT, "hold-1");
      const before = store.count();
      const rejected = await recordTaskCheckpoint(store, { ...input, sha256: "0".repeat(64) }, options);
      assert.equal(rejected.status, 409);
      assert.equal(rejected.body.status, "TASK_CHECKPOINT_REJECTED");
      const unreadable = await recordTaskCheckpoint(store, input, { ...options, readerFor: () => (async () => { throw new TaskCheckpointReadError("GitHub answered HTTP 502 for x."); }) });
      assert.equal(unreadable.status, 502);
      assert.equal((await recordTaskCheckpoint(store, input, { ...options, readerFor: () => null })).status, 503);
      assert.equal(store.count(), before, "nothing is recorded unless every check passed");

      const recorded = await recordTaskCheckpoint(store, input, options);
      assert.equal(recorded.status, 201);
      assert.equal(recorded.body.status, "TASK_CHECKPOINT_VERIFIED");
      assert.equal(recorded.body.filesVerified, 2);
      assert.equal(recorded.body.reviewPending, true);
      assert.equal(recorded.body.watchesDue, 1);
      assert.equal(recorded.event?.producerId, TASK_CHECKPOINT_VERIFIER_ID);
      const reads = good.reads.length;
      const again = await recordTaskCheckpoint(store, input, options);
      assert.equal(again.status, 200);
      assert.equal(again.body.duplicate, true);
      assert.equal(good.reads.length, reads, "a checkpoint already verified is not read again");
      assert.equal(store.count(), before + 1);
      assert.equal(classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain()).trigger, "CHECKPOINT_REVIEW_REQUIRED");
    });

    assert.throws(() => parseTaskCheckpointRepositories("{\"Atlas\": \"owner/repo\"}"), /must map worker ids/);
    assert.throws(() => parseTaskCheckpointRepositories("{\"atlas\": \"https://github.com/owner/repo\"}"), /must map worker ids/);
    assert.equal(parseTaskCheckpointRepositories(undefined).size, 0);
  } finally { store.close(); }
});

test("bringing a watch due stops a tick already running from committing, so the next poll sees the checkpoint", () => {
  const store = registered();
  try {
    const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: `task:${worker}`, cadenceMs: 60_000 }, at);
    const runningDue = watch.nextTickAt!;
    // A tick for the due time is running when the checkpoint lands, even at that very instant: its watch is due already.
    assert.equal(store.bringFleetSupervisorWatchesDue(worker, runningDue), 1);
    const sameInstant = store.fleetSupervisorWatch("project:atlas-test")!.nextTickAt!;
    assert.notEqual(sameInstant, runningDue, "the due time changes even when the checkpoint lands exactly at it");
    store.configureFleetSupervisorWatch("project:atlas-test", { cadenceMs: 60_000 }, at);
    assert.equal(store.fleetSupervisorWatch("project:atlas-test")!.nextTickAt, runningDue);
    const landed = new Date(Date.parse(runningDue) + 5_000).toISOString();
    assert.equal(store.bringFleetSupervisorWatchesDue(worker, landed), 1);
    const moved = store.fleetSupervisorWatch("project:atlas-test")!.nextTickAt!;
    assert.notEqual(moved, runningDue);
    assert.ok(Date.parse(moved) <= Date.parse(landed) + 1);
    assert.equal(store.completeFleetSupervisorTick({ projectId: "project:atlas-test", dueAt: runningDue, tickAt: landed, trigger: "SUPERVISOR_HOLD",
      result: "r", state: "ACTIVE", notificationDisposition: "OWNER_NOTIFIED", notificationReason: null, notificationFingerprint: null, notifiedAt: null }),
      false, "the running tick's old due time no longer commits");
    assert.equal(store.completeFleetSupervisorTick({ projectId: "project:atlas-test", dueAt: moved, tickAt: landed, trigger: "CHECKPOINT_REVIEW_REQUIRED",
      result: "r", state: "ACTIVE", notificationDisposition: "SUPPRESSED_NOT_ACTIONABLE", notificationReason: null, notificationFingerprint: null, notifiedAt: null }), true);
    // Again at the same instant: never a due time an earlier tick used, and never the current one.
    assert.equal(store.bringFleetSupervisorWatchesDue(worker, landed), 1);
    const again = store.fleetSupervisorWatch("project:atlas-test")!.nextTickAt!;
    assert.ok(again !== moved && Date.parse(again) > Date.parse(moved));
  } finally { store.close(); }
});

test("a hold is shown as a hold, and a verified checkpoint after it is taken to the supervisor once, quietly", async () => {
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: `task:${worker}`, cadenceMs: 60_000 }, at);
      const notified: string[] = [];
      let routed = 0;
      const runtime = new FleetSupervisorRuntime(store, {
        routeReasoning: (current, decision, events) => { routed += 1; return routeFleetSupervisorReasoning(store, current, decision, events); },
        notifyOwner: (_current, decision) => { notified.push(decision.trigger); },
      });
      await runtime.tick(new Date(Date.now() + 61_000).toISOString());
      assert.equal(routed, 1, "the first question");
      const hold = appendDecision(store, HOLD_TEXT, "hold-1");

      // The hold: no false telemetry alarm; the owner sees what it is, and nothing is asked again.
      const held = projectWorker(store.workerEvents(worker));
      assert.equal(held.correction.ownerAction.reason_code, OWNER_TASK_HELD_BY_SUPERVISOR_REASON);
      const attention = ownerAttention(held);
      assert.equal(attention?.kind === "alarm" ? attention.title : null, "Held by its supervisor");
      assert.equal(workerDisposition(held), "Needs a look: held by its supervisor");
      const quiet = classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain());
      assert.equal(quiet.trigger, "SUPERVISOR_HOLD");
      assert.equal(quiet.reasoningRequired, false);
      const tickAt = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
      await runtime.tick(tickAt(5));
      await runtime.tick(tickAt(10));
      assert.equal(routed, 1);
      assert.deepEqual(notified, ["SUPERVISOR_HOLD"], "the owner is told once");

      // A checkpoint verified after the hold: the next check asks the supervisor to review it, without the owner.
      const good = repo();
      const recorded = await recordTaskCheckpoint(store, { worker, path: "checkpoints/example-v1.json", commit: COMMIT, sha256: good.sha },
        { repositories: new Map([[worker, repository]]), readerFor: () => good.read });
      assert.equal(recorded.body.reviewPending, true);
      assert.equal(recorded.body.watchesDue, 1, "the held task's watch checks at once, not at its next daily check");
      assert.ok(Date.parse(store.fleetSupervisorWatch("project:atlas-test")!.nextTickAt!) <= Date.now());
      assert.equal(registeredTaskHold(store.workerEvents(worker))?.decision.eventId, hold.eventId);
      const review = classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain());
      assert.equal(review.trigger, "CHECKPOINT_REVIEW_REQUIRED");
      assert.equal(review.notifyOwner, false);
      await runtime.tick(tickAt(15));
      assert.equal(routed, 2);
      assert.deepEqual(notified, ["SUPERVISOR_HOLD"]);
      const route = store.workerEvents(worker).at(-1)!;
      assert.ok(route.data.type === "worker_message_recorded" && route.data.body.startsWith(inBandRequestRoutePrefix));
      const root = route.data.type === "worker_message_recorded" ? JSON.parse(route.data.body.slice(inBandRequestRoutePrefix.length)) : null;
      assert.equal(root.factualPacket.decisionRequested, CHECKPOINT_REVIEW_DECISION_REQUESTED);
      const facts = JSON.parse(root.factualPacket.exactFactualState);
      assert.equal(facts.trigger, "CHECKPOINT_REVIEW_REQUIRED");
      assert.equal(facts.held_by_decision.exact_text, HOLD_TEXT, "the decision under review, in full");
      assert.equal(facts.decision_boundary.event_id, recorded.event!.eventId, "asked at the checkpoint");
      assert.ok(facts.execution.latest_verified_sealed_evidence.summary.startsWith(`${TASK_CHECKPOINT_SUMMARY_PREFIX}\n`));
      assert.ok(root.factualPacket.exactFactualState.length <= FLEET_FACTUAL_STATE_LIMIT);
      const count = store.count();
      await runtime.tick(tickAt(20));
      assert.equal(store.count(), count, "the open review is not asked twice");

      // The supervisor holds again: the task waits for a newer checkpoint, and nothing is asked meanwhile.
      appendDecision(store, "Decision: HOLD. The checkpoint lacks one input.", "hold-2");
      assert.equal(classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain()).trigger, "SUPERVISOR_HOLD");
      assert.equal(registeredTaskHold(store.workerEvents(worker))?.checkpointAfter, null);
    });
  } finally { store.close(); }
});

test("a step the supervisor starts, a real owner decision or an owner blocker is not hidden behind a hold", () => {
  const store = registered();
  try {
    const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: `task:${worker}`, cadenceMs: 60_000 }, at);
    const history = store.workerEvents(worker);
    const last = history.at(-1)!;
    const decision = (n: number, extra: Record<string, unknown> = {}): StoredEvent => ({
      ...last, eventId: `decision:${n}`, sequence: last.sequence + n, producerKind: "SYSTEM", producerId: "system:github-decision-receipts",
      data: { type: "github_decision_receipt_ingested", worker, task_id: `task:${worker}`, request_id: `fleet-review:${String(n).padStart(32, "0")}`,
        decision_block: { decision_id: `d${n}`, exact_text: "Hold.", sha256: "a".repeat(64) }, ...extra } as StoredEvent["data"],
    });
    assert.ok(registeredTaskHold([...history, decision(1)]));
    assert.equal(registeredTaskHold([...history, decision(1, { bounded_execution: { strategy_id: "s" } })]), null, "a decision that starts a step is no hold");
    const directive = { ...decision(2), eventId: "directive:2", data: { type: "execution_directive_recorded", worker } as StoredEvent["data"] };
    assert.equal(registeredTaskHold([...history, decision(1), directive]), null, "nor one a directive followed");
    assert.equal(registeredTaskHold([...history, { ...directive, sequence: last.sequence }, decision(3)]), null, "nor a task that has had a directive");
    // After a Work job of the latest directive ran and its receipt was recorded, a later decision that starts no step
    // (the supervisor's review of the receipt) holds the task; a receipt for another directive or revision, or a
    // decision before the receipt, does not.
    const ranDirective = { ...decision(5), eventId: "directive:5", data: { type: "execution_directive_recorded", worker,
      directive_id: "github-execution:ran", directive_revision: 3 } as StoredEvent["data"] };
    const receiptFor = (n: number, directiveId: string, revision: number): StoredEvent => ({ ...decision(n), eventId: `work-receipt:${n}`,
      data: { type: "chatgpt_work_cloud_execution_receipt_recorded", worker, dispatch_id: "work-cloud:ran", directive_id: directiveId,
        directive_revision: revision, task_id: `task:${worker}`, status: "BLOCKED" } as StoredEvent["data"] });
    const reviewed = [...history, ranDirective, receiptFor(6, "github-execution:ran", 3), decision(7)];
    assert.equal(registeredTaskHold(reviewed)?.decision.eventId, "decision:7");
    assert.equal(projectWorker(reviewed).correction.ownerAction.reason_code, OWNER_TASK_HELD_BY_SUPERVISOR_REASON);
    assert.equal(classifyFleetSupervisorTick(watch, reviewed, store.verifyChain()).trigger, "SUPERVISOR_HOLD");
    assert.equal(registeredTaskHold([...history, ranDirective, decision(6), receiptFor(7, "github-execution:ran", 3)]), null, "a decision before the receipt");
    assert.equal(registeredTaskHold([...history, ranDirective, receiptFor(6, "github-execution:other", 3), decision(7)]), null, "another directive's receipt");
    assert.equal(registeredTaskHold([...history, ranDirective, receiptFor(6, "github-execution:ran", 2), decision(7)]), null, "another revision's receipt");
    const completed = { ...receiptFor(6, "github-execution:ran", 3), data: { ...receiptFor(6, "github-execution:ran", 3).data, status: "COMPLETED" } as StoredEvent["data"] };
    assert.equal(registeredTaskHold([...history, ranDirective, completed, decision(7)]), null, "a completed job's review may end the task");
    assert.equal(registeredTaskHold([...history, ranDirective, receiptFor(6, "github-execution:ran", 3),
      decision(7, { bounded_execution: { strategy_id: "s" } })]), null, "a review that starts a step");
    const asks = decision(4, { owner_action: { kind: "DECISION_REQUIRED", question: "A or B?" } });
    assert.equal(registeredTaskHold([...history, asks]), null, "a decision that asks the owner is the owner's, not a hold");
    assert.notEqual(projectWorker([...history, asks]).correction.ownerAction.reason_code, OWNER_TASK_HELD_BY_SUPERVISOR_REASON);
    assert.equal(registeredTaskHold(history), null, "no decision yet: the first-question wait, not a hold");

    const blocker: StoredEvent = { ...last, eventId: "blocker:owner", sequence: last.sequence + 3, producerKind: "WORKER", producerId: `worker:${worker}`,
      data: { type: "structured_blocker_recorded", worker, blocker_id: "blocker:owner", task_id: `task:${worker}`, direction_id: "direction:1",
        queue_item_id: null, status: "OPEN", severity: "BLOCKING", title: "Needs a login", description: "The source needs the owner's own login.",
        impact: "Collection can't start.", blocking_scope: ["collection"], workaround_available: false, workaround: null,
        required_actor: { kind: "OWNER", id: "actor:1" }, evidence_refs: [], reported_by: `worker:${worker}`, needs_owner: true, reported_at: at,
      } as StoredEvent["data"] };
    const blocked = classifyFleetSupervisorTick(watch, [...history, decision(1), blocker], store.verifyChain());
    assert.equal(blocked.trigger, "OWNER_ACTION_REQUIRED");
    assert.equal(blocked.notificationReason, "The source needs the owner's own login.");
  } finally { store.close(); }
});

test("a checkpoint review that was sent but never answered goes to the owner, and nothing asks again", async (t) => {
  const start = Date.parse(at) + 60_000;
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: `task:${worker}`, cadenceMs: 60_000 }, at);
      let routed = 0;
      const notified: string[] = [];
      const runtime = new FleetSupervisorRuntime(store, {
        routeReasoning: (current, decision, events) => { routed += 1; return routeFleetSupervisorReasoning(store, current, decision, events); },
        notifyOwner: (_current, decision) => { notified.push(decision.notificationReason ?? ""); },
      });
      await runtime.tick(new Date(start).toISOString());
      appendDecision(store, HOLD_TEXT, "hold-1");
      const good = repo();
      await recordTaskCheckpoint(store, { worker, path: "checkpoints/example-v1.json", commit: COMMIT, sha256: good.sha },
        { repositories: new Map([[worker, repository]]), readerFor: () => good.read });
      t.mock.timers.setTime(start + 2 * 60_000);
      await runtime.tick(new Date(start + 2 * 60_000).toISOString());
      assert.equal(routed, 2);
      const request = admittedCycleRequests(store.workerEvents(worker)).admitted.at(-1)!;
      for (const event of sentByTheRelay(request, new Date(start + 3 * 60_000).toISOString())) {
        store.append(event, undefined, relayProducer, store.allEvents());
      }
      const afterExpiry = start + 26 * 3_600_000;
      t.mock.timers.setTime(afterExpiry);
      const [check] = await runtime.tick(new Date(afterExpiry).toISOString());
      assert.equal(check?.decision.trigger, "OWNER_ACTION_REQUIRED");
      assert.equal(check?.committed, true, "the check completes instead of failing on every poll");
      assert.equal(routed, 2, "nothing is routed again");
      assert.match(notified.at(-1) ?? "", /didn't answer the checkpoint review/);
    });
  } finally { store.close(); }
});

test("a checkpoint review that doesn't fit shortens only the checkpoint and the held decision, never past 500 characters each", async () => {
  const store = registered();
  try {
    await withSupervisorConfiguration(async () => {
      enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: `task:${worker}`, cadenceMs: 60_000 }, at);
      const runtime = new FleetSupervisorRuntime(store, { routeReasoning: (current, decision, events) => routeFleetSupervisorReasoning(store, current, decision, events) });
      await runtime.tick(new Date(Date.now() + 61_000).toISOString());
      appendDecision(store, HOLD_TEXT, "hold-1");
      const long = repo({ checkpoint: { ...JSON.parse(repo().text), notes: "n".repeat(10_000) } });
      await recordTaskCheckpoint(store, { worker, path: "checkpoints/example-v1.json", commit: COMMIT, sha256: long.sha },
        { repositories: new Map([[worker, repository]]), readerFor: () => long.read });
      const events = store.workerEvents(worker);
      const boundary = events.at(-1)!;
      const review: FleetSupervisorDecision = { trigger: "CHECKPOINT_REVIEW_REQUIRED", result: "r", state: "ACTIVE", reasoningRequired: true,
        mechanicalRecoveryEligible: false, notifyOwner: false, notificationReason: null };
      const full = JSON.parse(fleetReasoningFactualState(review, events, boundary, `task:${worker}`, 1_000_000));
      const fullLength = canonicalJson(full).length;
      const fitted = fleetReasoningFactualState(review, events, boundary, `task:${worker}`, fullLength - 2_000);
      assert.ok(fitted.length <= fullLength - 2_000);
      const facts = JSON.parse(fitted);
      assert.ok(facts.execution.latest_verified_sealed_evidence.summary.startsWith(TASK_CHECKPOINT_SUMMARY_PREFIX));
      assert.equal(facts.held_by_decision.exact_text, HOLD_TEXT, "the checkpoint is shortened first");
      const floor = JSON.parse(fleetReasoningFactualState(review, events, boundary, `task:${worker}`, 1_000));
      assert.equal(floor.execution.latest_verified_sealed_evidence.summary.length, 500);
      assert.equal(floor.held_by_decision.exact_text.length, 500);
    });
  } finally { store.close(); }
});

test("a checkpoint review too long for one question goes to the owner once, instead of failing every poll", async () => {
  const store = new EventStore(":memory:");
  try {
    const long = (word: string) => `${word} ${"w".repeat(3_900)}`;
    const parsed = parseOwnerTaskRegistration({ worker, name: "Long task", goal: long("Goal"), may_use: long("Sources"),
      must_never: long("Never"), done_when: long("Done") });
    assert.notEqual(typeof parsed, "string", String(parsed));
    registerOwnerTask(store, parsed as Exclude<typeof parsed, string>, owner, store.allEvents(), at);
    await withSupervisorConfiguration(async () => {
      const { watch } = enrollFleetSupervisorWatch(store, "project:atlas-test", { worker, taskId: `task:${worker}`, cadenceMs: 60_000 }, at);
      appendDecision(store, HOLD_TEXT, "hold-1");
      const good = repo();
      const recorded = await recordTaskCheckpoint(store, { worker, path: "checkpoints/example-v1.json", commit: COMMIT, sha256: good.sha },
        { repositories: new Map([[worker, repository]]), readerFor: () => good.read });
      assert.equal(recorded.status, 201);
      let routed = 0;
      const notified: string[] = [];
      const runtime = new FleetSupervisorRuntime(store, {
        routeReasoning: (current, decision, events) => { routed += 1; return routeFleetSupervisorReasoning(store, current, decision, events); },
        notifyOwner: (_current, decision) => { notified.push(decision.notificationReason ?? ""); },
      });
      const [check] = await runtime.tick(new Date(Date.now() + 1_000).toISOString());
      assert.equal(check?.decision.trigger, "OWNER_ACTION_REQUIRED");
      assert.equal(check?.committed, true);
      assert.equal(routed, 0);
      assert.match(notified[0] ?? "", /too long for one supervisor question/);
      assert.equal(classifyFleetSupervisorTick(watch, store.workerEvents(worker), store.verifyChain()).trigger, "OWNER_ACTION_REQUIRED");
    });
  } finally { store.close(); }
});

test("GitHub is read with a files-only token, by exact commit, within the size limit", async () => {
  const seen: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), headers: init?.headers as Record<string, string> });
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/missing.json")) return new Response("{}", { status: 404 });
    if (path.endsWith("/down.json")) return new Response("{}", { status: 500 });
    if (path.endsWith("/big.bin")) return new Response("x".repeat(20), { status: 200, headers: { "content-length": "20" } });
    return new Response("hello", { status: 200 });
  }) as typeof fetch;
  const read = githubRepositoryFileReader(async () => "token-1", fetchImpl);
  assert.equal(new TextDecoder().decode(await read("owner/private-ledger", "dir name/a+b.json", COMMIT, 100)), "hello");
  assert.equal(seen[0]!.url, `https://api.github.com/repos/owner/private-ledger/contents/dir%20name/a%2Bb.json?ref=${COMMIT}`);
  assert.equal(seen[0]!.headers.accept, "application/vnd.github.raw+json");
  assert.equal(seen[0]!.headers.authorization, "Bearer token-1");
  await assert.rejects(read("owner/private-ledger", "missing.json", COMMIT, 100), TaskCheckpointRejectedError);
  await assert.rejects(read("owner/private-ledger", "down.json", COMMIT, 100), TaskCheckpointReadError);
  await assert.rejects(read("owner/private-ledger", "big.bin", COMMIT, 10), /larger than Mission Control reads/);
  await assert.rejects(read("owner/private-ledger", "hello.txt", COMMIT, 3), /larger than Mission Control reads/, "a body past the limit without a length header");
  await assert.rejects(githubRepositoryFileReader(async () => undefined, fetchImpl)("owner/private-ledger", "a", COMMIT, 10), TaskCheckpointReadError);

  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const bodies: unknown[] = [];
  const tokenFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ token: "t", expires_at: new Date(Date.now() + 3_600_000).toISOString() }), { status: 201 });
  }) as typeof fetch;
  await new GitHubAppInstallationTokenProvider({ appId: "1", installationId: "2", privateKeyPem: pem, repository: "owner/private-ledger",
    contentsPermission: "read", fetchImpl: tokenFetch }).token();
  assert.deepEqual(bodies[0], { repositories: ["private-ledger"], permissions: { contents: "read" } });
  assert.throws(() => new GitHubAppInstallationTokenProvider({ appId: "1", installationId: "2", privateKeyPem: pem, repository: "owner/x",
    contentsPermission: "read", issuesPermission: "read" }), /issues or its files, not both/);
  const fromEnv = githubReconciliationTokenProviderFromEnv({ repository: "owner/private-ledger", contentsPermission: "read", fetchImpl: tokenFetch,
    env: { MISSION_CONTROL_GITHUB_APP_ID: "1", MISSION_CONTROL_GITHUB_APP_INSTALLATION_ID: "2", MISSION_CONTROL_GITHUB_APP_PRIVATE_KEY_PATH: "/key.pem" },
    readFile: () => pem });
  await fromEnv!();
  assert.deepEqual(bodies[1], { repositories: ["private-ledger"], permissions: { contents: "read" } });
});

function withSupervisorConfiguration(work: () => void | Promise<void>) {
  const saved = { chats: process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON, policy: process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON };
  process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = JSON.stringify([projectManager()]);
  process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(receiptPolicy());
  const restore = () => {
    if (saved.chats === undefined) delete process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON;
    else process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON = saved.chats;
    if (saved.policy === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
    else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = saved.policy;
  };
  return Promise.resolve().then(work).finally(restore);
}

const relayProducer: AuthenticatedProducer = { id: "collector:relay", kind: "COLLECTOR", workerScopes: [worker], taskScopes: ["*"] };
const PROMPT = "d".repeat(64);
const SESSION_ID = "provider-session:atlas-test-review";
const CHAT = "https://chatgpt.com/c/atlas-test-review";
const CONTROLS = ["model_selection_policy:TOP_VISIBLE_SELECTABLE_MODEL", "model_selector_index:0", "thinking_control_label:Thinking effort",
  "thinking_visible_label:Extra High", "thinking_ordinal:4 of 5", "account_plan_label:Pro", "account_plan_role:PROVENANCE_METADATA_ONLY",
  "account_plan_is_reasoning_mode:false", "backend_model_identity_claimed:false", "assistant_content_observed:false", "model_ui_label:GPT-6 Sol"];

/** The trusted relay's receipts for sending one V6 question (as in tests/owner-task-first-supervision.test.ts). */
function sentByTheRelay(request: PendingDecisionRequest, occurredAt: string): AppendEnvelope[] {
  const policy = parseGitHubReceiptPolicy(JSON.stringify(receiptPolicy()))!;
  const envelope = inBandRequestBindingEnvelope(request, SESSION_ID, policy);
  const receipt = (summary: string, refs: string[]): AppendEnvelope => ({
    schema_version: 2, event_id: `relay-test:${request.requestId}:${summary}`, mission_id: "mission-control-live", occurred_at: occurredAt,
    data: {
      type: "evidence_receipt_recorded", worker, receipt_id: `relay-test:${request.requestId}:${summary}`, producer_id: relayProducer.id,
      producer_role: "COLLECTOR", evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: null, summary,
      refs: [`request:${request.requestId}`, `supervisor:${request.supervisorId}`, `provider_session:${SESSION_ID}`, ...refs],
      verified: true, changed_path_manifest: null,
    },
  });
  return [
    receipt("MISSION_CONTROL_PROVIDER_SESSION_MODEL_UI_V1", ["session_role:IN_BAND_REQUEST_DECISION_SESSION", ...CONTROLS]),
    receipt("MISSION_CONTROL_IN_BAND_REQUEST_BINDING_PRE_SEND_V1", [`provider_body_sha256:${PROMPT}`, "semantic_authority:false",
      `trusted_relay_producer:${relayProducer.id}`, "submission_admission:admission-1", "binding_protocol:IN_BAND_REQUEST_BINDING_V1",
      `binding_schema:${envelope.binding_schema}`, `in_band_binding_sha256:${envelope.in_band_binding_sha256}`,
      `decision_receipt_target:${envelope.decision_receipt_target.immutable_issue_url}`]),
    receipt("MISSION_CONTROL_PROVIDER_SESSION_V1", ["session_role:IN_BAND_REQUEST_DECISION_SESSION", "message_ordinal:1",
      `conversation_url:${CHAT}`, "url_binding_status:EXACT", "lifecycle_status:ACTIVE"]),
    receipt("MISSION_CONTROL_RELAY_STAGE_V1", ["step:IN_BAND_REQUEST_DECISION", "message_ordinal:1", "first_message:true",
      `conversation_url:${CHAT}`, "generation_state:STARTED", `prompt_sha256:${PROMPT}`, ...CONTROLS, "selected_app:GitHub",
      "semantic_authority:false"]),
  ];
}

function projectManager() {
  return {
    scope: "PROJECT_MANAGER", supervisorId: "mc-project-manager", label: "MC project manager", workerId: null,
    requiredApp: "Mission Control", registrationId: "registration:test:mc-project-manager", ownership: "MISSION_CONTROL_ONLY",
    purpose: "Dedicated Mission Control reasoning supervisor", accountAlias: "owner-account", workspaceAlias: "personal",
    privateLocatorRef: "owner-config:test:mc-project-manager",
    registrationProvenance: { registeredBy: "OWNER", registeredAt: "2026-09-20T00:00:00.000Z", sourceRef: "owner:test" },
    consumerControls: {
      modelSelectionPolicy: "TOP_VISIBLE_SELECTABLE_MODEL", thinkingControlLabel: "Thinking effort", thinkingVisibleLabel: "Extra High",
      thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro", accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false,
    },
    bootstrapCapability: { chatId: "bootstrap:pm", url: "https://chatgpt.com/c/test-project-manager", challengeId: "challenge:pm" },
  };
}

function receiptPolicy() {
  return {
    repository: "owner/private-receipts", decisionIssueNumber: 4, capabilityIssueNumber: 4, stageIssueNumber: 4,
    authorizedWriterLogins: ["owner"], capabilityChallenges: [], requestBound: { enabled: true, relayProducerIds: ["collector:relay"] },
  };
}
