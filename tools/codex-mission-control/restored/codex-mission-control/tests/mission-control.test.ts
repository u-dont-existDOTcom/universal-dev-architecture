import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AttentionCard, HealthyCard } from "../components/Dashboard";
import { sha256 } from "../lib/canonical";
import { correctionStatusLabel, CorrectionInvariantError, validateCorrectionTransition } from "../lib/correction-lifecycle";
import { authenticatedEventTypes, producerKinds, producerMayEmit } from "../lib/ingestion-auth";
import { authenticateIngestProducer } from "../lib/ingestion-credentials";
import { sameOriginMutation } from "../lib/daemon-client";
import { supervisionHandoffCapsuleSha256 } from "../lib/supervision-handoff";
import { attentionPriority, projectWorker, projectWorkers, summarizeChanges } from "../lib/projection";
import { appendEnvelopeSchema, eventSchema, ownerActionObligationSchema, supervisorChatLinkSetSchema, type MissionControlEventV2, type StoredEvent } from "../lib/schema";
import { seedStore } from "../lib/seed";
import { ContractInvariantError, EventStore, IdempotencyConflictError, WriterLockError } from "../lib/store";
import { adaptSymphonyState, SYMPHONY_UPSTREAM_COMMIT } from "../lib/symphony-adapter";
import { authorityStateVectorHash, compareTerminalState } from "../lib/terminal-comparator";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(testRoot, "..");
const fixtureRoot = path.join(testRoot, "fixtures");
const uxFixture = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "attention-and-correction-ux.json"), "utf8"));
const symphonyFixture = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "symphony-state-v1.json"), "utf8"));
const demoStore = new EventStore(":memory:");
seedStore(demoStore);
const demoEvents = demoStore.allEvents();
demoStore.close();

test("attention UX fixture freezes the exact Test cleanup operator message", () => {
  const worker = uxFixture.defaultQueue.workers[0];
  assert.equal(worker.workerId, "tests");
  assert.equal(worker.primaryProblemSummary, "Worker is changing the forbidden production scheduler and callers to solve a test-only task.");
  assert.equal(worker.correction.status, "REDIRECT_DELIVERED");
  assert.equal(worker.correction.acknowledgedAt, null);
  assert.deepEqual(uxFixture.defaultQueue.expected.topViewportStrings, [
    "Test cleanup — REDIRECT",
    "Worker is changing the forbidden production scheduler and callers to solve a test-only task.",
    "Stop and revert production scheduler and caller changes; return to tests/** or test-support/**; rerun the focused test command.",
    "REDIRECT DELIVERED — AWAITING ACKNOWLEDGEMENT",
    "OWNER ACTION: NONE",
  ]);
});

test("supervisor chat links remain first-class HTTPS-only data", () => {
  const parsed = supervisorChatLinkSetSchema.parse({
    type: "supervisor_chat_link_set",
    worker: "alpha",
    supervisor_chat_url: "https://chatgpt.com/c/real-supervisor-chat",
    supervisor_chat_label: "Open Pro chat",
    reason: "Connected the assigned supervisor",
  });
  assert.equal(parsed.supervisor_chat_url, "https://chatgpt.com/c/real-supervisor-chat");
  assert.throws(() => eventSchema.parse({ ...parsed, supervisor_chat_url: "javascript:alert(1)" }));
});

test("versioned envelopes require stable identity, mission identity, and occurrence time", () => {
  const envelope = sourceEnvelope("source:alpha:1");
  assert.equal(appendEnvelopeSchema.parse(envelope).event_id, "source:alpha:1");
  assert.throws(() => appendEnvelopeSchema.parse({ ...envelope, event_id: "bad id" }));
  assert.throws(() => appendEnvelopeSchema.parse({ ...envelope, occurred_at: "yesterday" }));
});

test("all public v2 content identities reject human-readable pseudo-hashes", () => {
  const envelope = sourceEnvelope("source:alpha:strict-hash");
  assert.throws(() => eventSchema.parse({ ...envelope.data, source_sha256: "fixture-source-hash" }));
  assert.throws(() => eventSchema.parse({ ...envelope.data, worker_copy_sha256: "candidate-alpha" }));
});

test("external ingest credentials bind a secret to one producer ID and kind", () => {
  const token = "0123456789abcdef0123456789abcdef";
  const credentials = JSON.stringify({ "collector:tests": { kind: "COLLECTOR", token, workers: ["tests"], tasks: ["task:tests"] } });
  assert.deepEqual(authenticateIngestProducer(credentials, "collector:tests", `Bearer ${token}`), {
    ok: true, producer: { id: "collector:tests", kind: "COLLECTOR", workerScopes: ["tests"], taskScopes: ["task:tests"] },
  });
  assert.equal(authenticateIngestProducer(credentials, "verifier:tests", `Bearer ${token}`).ok, false);
  assert.equal(authenticateIngestProducer(credentials, "collector:tests", "Bearer wrong").ok, false);
  assert.equal(authenticateIngestProducer('{"broken":', "collector:tests", `Bearer ${token}`).ok, false);
});

test("same-origin mutation checks honor the actual Host authority without trusting another origin", () => {
  assert.equal(sameOriginMutation(new Request("http://localhost:3000/api/viewed", {
    method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
  })), true);
  assert.equal(sameOriginMutation(new Request("http://localhost:3000/api/viewed", {
    method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://evil.example" },
  })), false);
  assert.equal(sameOriginMutation(new Request("http://localhost:3000/api/viewed", { method: "POST" })), false);
});

test("authenticated producer identity must match embedded evidence identity and authorized event class", () => {
  const evidence = workerEvents("tests").find((event) => event.data.type === "evidence_receipt_recorded")!.data;
  if (evidence.type !== "evidence_receipt_recorded") throw new Error("Expected v2 evidence fixture.");
  assert.equal(producerMayEmit(scopedProducer(evidence.producer_id, "COLLECTOR", "tests"), evidence), true);
  assert.equal(producerMayEmit(scopedProducer("collector:impostor", "COLLECTOR", "tests"), evidence), false);
  assert.equal(producerMayEmit(scopedProducer(evidence.producer_id, "VERIFIER", "tests"), evidence), false);
  const checkpoint = workerEvents("tests").find((event) => event.data.type === "worker_checkpoint_recorded")!.data;
  if (checkpoint.type !== "worker_checkpoint_recorded") throw new Error("Expected v2 checkpoint fixture.");
  assert.equal(producerMayEmit(scopedProducer("worker:tests", "WORKER", "tests"), checkpoint), true);
  assert.equal(producerMayEmit(scopedProducer("worker:billing", "WORKER", "billing"), checkpoint), false);
});

test("owner outcomes cannot be recorded before their referenced source receipt", () => {
  const store = new EventStore(":memory:");
  assert.throws(() => store.append(outcomeEnvelope("alpha")), ContractInvariantError);
  store.close();
});

test("owner-outcome corrections bind the exact source request, source hash, next epoch, and prior outcome hash", () => {
  const store = new EventStore(":memory:");
  const source = sourceEnvelope("source:alpha:exact-binding");
  store.append(source);
  const first = outcomeEnvelope("alpha");
  assert.throws(() => store.append({ ...first, event_id: "outcome:alpha:wrong-request", data: {
    ...first.data, owner_request_id: "owner-request:wrong",
  } }), /exact referenced owner-source request and source hash/);
  assert.throws(() => store.append({ ...first, event_id: "outcome:alpha:wrong-hash", data: {
    ...first.data, owner_source_sha256: "c".repeat(64),
  } }), /exact referenced owner-source request and source hash/);
  store.append(first);

  const secondSource = {
    ...source,
    event_id: "source:alpha:correction",
    occurred_at: "2026-08-30T10:02:00.000Z",
    data: { ...source.data, receipt_id: "receipt:alpha:2", source_sha256: "c".repeat(64), worker_copy_sha256: "c".repeat(64) },
  };
  store.append(secondSource);
  const secondData = {
    ...first.data,
    epoch: 2,
    owner_outcome_sha256: "d".repeat(64),
    source_receipt_id: "receipt:alpha:2",
    owner_source_sha256: "c".repeat(64),
    supersedes: first.data.owner_outcome_id,
    supersedes_outcome_sha256: first.data.owner_outcome_sha256,
  };
  assert.throws(() => store.append({
    ...first, event_id: "outcome:alpha:skipped-epoch", occurred_at: "2026-08-30T10:03:00.000Z",
    data: { ...secondData, epoch: 3 },
  }), /advance one epoch/);
  assert.throws(() => store.append({
    ...first, event_id: "outcome:alpha:wrong-prior-hash", occurred_at: "2026-08-30T10:03:00.000Z",
    data: { ...secondData, supersedes_outcome_sha256: "e".repeat(64) },
  }), /exact prior outcome identity/);
  assert.doesNotThrow(() => store.append({
    ...first, event_id: "outcome:alpha:2", occurred_at: "2026-08-30T10:03:00.000Z", data: secondData,
  }));
  store.close();
});

test("stable event IDs are exactly idempotent", () => {
  const store = new EventStore(":memory:");
  const event = sourceEnvelope("source:alpha:1");
  const first = store.append(event, "2026-08-30T10:00:01.000Z");
  const retry = store.append(event, "2026-08-30T10:10:00.000Z");
  assert.equal(first.sequence, retry.sequence);
  assert.equal(store.count(), 1);
  store.close();
});

test("an event-ID collision with different content is rejected", () => {
  const store = new EventStore(":memory:");
  const event = sourceEnvelope("source:alpha:1");
  store.append(event);
  const changed = structuredClone(event);
  changed.data.limitations = ["different payload"];
  assert.throws(() => store.append(changed), IdempotencyConflictError);
  store.close();
});

test("the event hash chain verifies from the first event through the demo ledger", () => {
  const store = new EventStore(":memory:");
  seedStore(store);
  assert.equal(store.count(), 108);
  assert.deepEqual(store.verifyChain(), { valid: true, errors: [] });
  assert.equal(store.allEvents()[0].previousHash, null);
  store.close();
});

test("SQLite triggers reject update and delete even from a second connection", () => {
  withTempDatabase((filename) => {
    const store = new EventStore(filename);
    store.append(sourceEnvelope("source:alpha:1"));
    const second = new DatabaseSync(filename);
    assert.throws(() => second.exec("UPDATE events SET type = 'tampered' WHERE sequence = 1"), /append_only/);
    assert.throws(() => second.exec("DELETE FROM events WHERE sequence = 1"), /append_only/);
    second.close();
    store.close();
  });
});

test("appendMany rolls back the whole batch when an authority invariant fails", () => {
  const store = new EventStore(":memory:");
  assert.throws(() => store.appendMany([
    { event: sourceEnvelope("source:alpha:1") },
    { event: outcomeEnvelope("beta") },
  ]), ContractInvariantError);
  assert.equal(store.count(), 0);
  store.close();
});

test("legacy v1 SQLite rows migrate without reinterpretation and keep the review cursor", () => {
  withTempDatabase((filename) => {
    const db = new DatabaseSync(filename);
    db.exec(`
      CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL, occurred_at TEXT NOT NULL);
      CREATE TABLE review_state (id INTEGER PRIMARY KEY, last_viewed_event_id INTEGER NOT NULL, viewed_at TEXT NOT NULL);
    `);
    const objective = legacyObjective();
    db.prepare("INSERT INTO events(worker,type,data,occurred_at) VALUES(?,?,?,?)").run("alpha", "objective_created", JSON.stringify(objective), "2026-08-30T10:00:00.000Z");
    db.prepare("INSERT INTO review_state(id,last_viewed_event_id,viewed_at) VALUES(1,1,?)").run("2026-08-30T10:01:00.000Z");
    db.close();

    const store = new EventStore(filename);
    assert.equal(store.allEvents()[0].schemaVersion, 1);
    assert.equal(store.allEvents()[0].eventId, "legacy-v1:1");
    assert.equal(store.lastViewedSequence(), 1);
    assert.equal(store.verifyChain().valid, true);
    assert.equal(projectWorker(store.workerEvents("alpha")).contractToOwnerAlignment, "SOURCE_MISSING");
    store.close();
  });
});

test("legacy task_completed never upgrades an unreconciled root outcome", () => {
  const events = legacyStoredEvents();
  events.push(legacyStoredEvent(3, { type: "task_completed", worker: "alpha", summary: "Done" }));
  const worker = projectWorker(events, new Date("2026-08-30T10:04:00.000Z"));
  assert.equal(worker.status, "working");
  assert.equal(worker.terminal.rootTerminalizationAllowed, false);
  assert.ok(worker.terminal.reasonCodes.includes("LEGACY_SCHEMA"));
});

test("Test cleanup projects the exact problem, directive, delivery state, and owner action", () => {
  const worker = demoWorker("tests");
  assert.equal(worker.workerToContractAlignment, "RED");
  assert.equal(worker.contractToOwnerAlignment, "MATCH");
  assert.equal(worker.overallTraffic, "RED");
  assert.equal(worker.verdict, "REDIRECT");
  assert.equal(worker.primaryProblemSummary, "Worker is changing the forbidden production scheduler and callers to solve a test-only task.");
  assert.equal(worker.correction.directive, "Stop and revert production scheduler and caller changes; return to tests/** or test-support/**; rerun the focused test command.");
  assert.equal(worker.correction.status, "DIRECTIVE_DELIVERED");
  assert.equal(worker.correction.statusLabel, "REDIRECT DELIVERED — AWAITING ACKNOWLEDGEMENT");
  assert.equal(worker.correction.workerAcknowledged, false);
  assert.equal(worker.correction.correctionStarted, false);
  assert.equal(worker.correction.evidenceSubmitted, false);
  assert.equal(worker.correction.correctionVerified, false);
  assert.equal(worker.correction.ownerActionType, "NONE");
});

test("a REDIRECT assessment alone does not imply that any correction was issued", () => {
  const events = workerEvents("tests").filter((event) => event.data.type !== "correction_lifecycle_recorded");
  const worker = projectWorker(events, new Date("2026-08-30T20:05:00.000Z"));
  assert.equal(worker.verdict, "REDIRECT");
  assert.equal(worker.correction.status, null);
  assert.equal(worker.correction.statusLabel, "NO CORRECTION ISSUED");
  assert.equal(worker.correction.directiveDelivered, false);
});

test("delivered, acknowledged, evidenced, verified, and resolved labels remain distinct", () => {
  for (const fixture of uxFixture.lifecycleCases) {
    const status = fixtureCorrectionStatus(fixture.status);
    assert.equal(correctionStatusLabel(status, "WORKER_REDIRECT"), fixture.expectedLabel);
    assert.equal(fixture.expectedResolved, status === "CORRECTION_RESOLVED");
  }
});

test("acknowledgement must explicitly bind the directive identity", () => {
  const delivered = correctionData("DIRECTIVE_DELIVERED");
  const invalid = { ...correctionData("DIRECTIVE_ACKNOWLEDGED", [], "event:delivered"), acknowledged_directive_id: null };
  assert.throws(() => validateCorrectionTransition(invalid, delivered, "event:delivered"), CorrectionInvariantError);
  const valid = { ...invalid, acknowledged_directive_id: invalid.directive_id, acknowledged_directive_digest: invalid.directive_digest };
  assert.doesNotThrow(() => validateCorrectionTransition(valid, delivered, "event:delivered"));
});

test("correction verification requires evidence receipts and an exact candidate", () => {
  const prior = correctionData("CORRECTION_EVIDENCE_SUBMITTED", ["evidence:1"]);
  const invalid = correctionData("CORRECTION_VERIFIED", [], "event:evidence");
  assert.throws(() => validateCorrectionTransition(invalid, prior, "event:evidence"), /atomic correction evidence set|exact evidence-set/);
  const valid = {
    ...invalid,
    evidence_receipt_ids: ["evidence:1"], verified_candidate_sha256: sha256("candidate-fixture"),
    evidence_set_id: "evidence-set:1", evidence_requirement_schema_sha256: sha256("requirements-fixture"),
    verification_policy_id: "verification-policy:1", verification_policy_sha256: sha256("policy-fixture"),
    verifier_id: "verifier:independent", verifier_role: "INDEPENDENT" as const, verifier_method_version: "verifier-method:1",
    verification_manifest: [{ requirement: "clean diff", evidence_receipt_id: "evidence:1", conclusion: "PASS" as const }],
    verification_validity_scope: {
      context_id: "validity:tests:1", exact_candidate_sha256: sha256("candidate-fixture"),
      contract_sha256: sha256("contract-fixture"), owner_outcome_id: "outcome:tests", owner_outcome_epoch: 1,
      owner_outcome_sha256: sha256("outcome-fixture"), verification_policy_id: "verification-policy:1",
      verification_policy_sha256: sha256("policy-fixture"), evidence_requirement_schema_sha256: sha256("requirements-fixture"),
      worker_run_id: "run:tests", assignment_epoch: 1, target_kind: "WORKER_RUN" as const, target_id: "run:tests", target_epoch: 1,
      environment_bindings: [], source_snapshot_bindings: [], verifier_method_version: "verifier-method:1",
      invalidate_on: ["CANDIDATE", "CONTRACT", "OWNER_OUTCOME", "VERIFICATION_POLICY", "EVIDENCE_REQUIREMENT_SCHEMA", "ASSIGNMENT", "TARGET", "ENVIRONMENT", "SOURCE_SNAPSHOT", "VERIFIER_METHOD"] as Array<"CANDIDATE" | "CONTRACT" | "OWNER_OUTCOME" | "VERIFICATION_POLICY" | "EVIDENCE_REQUIREMENT_SCHEMA" | "ASSIGNMENT" | "TARGET" | "ENVIRONMENT" | "SOURCE_SNAPSHOT" | "VERIFIER_METHOD">,
    },
  };
  assert.doesNotThrow(() => validateCorrectionTransition(valid, prior, "event:evidence"));
});

test("delivery is not inferred without a receiver-generated digest-bound receipt", () => {
  const issued = correctionData("DIRECTIVE_ISSUED");
  const delivered = correctionData("DIRECTIVE_DELIVERED", [], "event:issued");
  assert.throws(() => validateCorrectionTransition({ ...delivered, delivery_receipt: null }, issued, "event:issued"), /receiver-generated/);
  assert.doesNotThrow(() => validateCorrectionTransition(delivered, issued, "event:issued"));
});

test("correction start requires the targeted execution side and an expiring activity lease", () => {
  const acknowledged = correctionData("DIRECTIVE_ACKNOWLEDGED");
  const started = correctionData("CORRECTION_STARTED", [], "event:acknowledged");
  assert.throws(() => validateCorrectionTransition({ ...started, actor_role: "SUPERVISOR" }, acknowledged, "event:acknowledged"), /target or authorized executor/);
  assert.throws(() => validateCorrectionTransition({ ...started, activity_lease_expires_at: null }, acknowledged, "event:acknowledged"), /expiring activity lease/);
  assert.doesNotThrow(() => validateCorrectionTransition(started, acknowledged, "event:acknowledged"));
});

test("a correction attempt cannot mutate its finding set or evidence requirements", () => {
  const issued = correctionData("DIRECTIVE_ISSUED");
  const delivered = correctionData("DIRECTIVE_DELIVERED", [], "event:issued");
  assert.throws(() => validateCorrectionTransition({ ...delivered, finding_ids: ["finding:replacement"] }, issued, "event:issued"), /immutable finding_ids/);
  assert.throws(() => validateCorrectionTransition({ ...delivered, required_evidence: ["weaker proof"] }, issued, "event:issued"), /immutable required_evidence/);
});

test("lifecycle milestones are projected only from the current correction attempt", () => {
  const store = new EventStore(":memory:");
  seedStore(store);
  const prior = store.workerEvents("tests").findLast((event) => event.data.type === "correction_lifecycle_recorded")!;
  assert.equal(prior.data.type, "correction_lifecycle_recorded");
  const directive = "Prepare a replacement test-scope directive.";
  store.append({
    schema_version: 2, event_id: "demo:tests:correction:replacement", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:00.000Z",
    data: {
      ...prior.data,
      correction_attempt_id: "correction-attempt:tests:2", directive_id: "directive-tests-replacement",
      directive, directive_digest: sha256(directive), status: "DIRECTIVE_PREPARED",
      producer_id: "mission-control-supervisor", actor_id: "mission-control-supervisor", actor_role: "SUPERVISOR",
      causation_event_id: prior.eventId, expected_predecessor_event_id: null, correlation_id: "correlation:tests:correction:2",
      delivery_receipt: null, acknowledged_directive_id: null, acknowledged_directive_digest: null,
    },
  });
  const correction = projectWorker(store.workerEvents("tests"), new Date("2026-08-30T20:07:00.000Z")).correction;
  assert.equal(correction.status, "DIRECTIVE_PREPARED");
  assert.equal(correction.directiveIssued, false);
  assert.equal(correction.directiveDelivered, false);
  assert.equal(correction.workerAcknowledged, false);
  store.close();
});

test("owner action NONE fails closed when its named next transition is overdue", () => {
  const events = cloneEvents(workerEvents("tests"));
  replaceLatest(events, "correction_lifecycle_recorded", (correction) => {
    assert.equal(correction.owner_action.kind, "NONE");
    return { ...correction, owner_action: { ...correction.owner_action, next_due_at: "2026-08-30T19:00:00.000Z" } };
  });
  const worker = projectWorker(events, new Date("2026-08-30T20:05:00.000Z"));
  assert.equal(worker.correction.ownerActionType, "MANUAL_INTERVENTION_REQUIRED");
  assert.match(worker.correction.ownerActionText, /overdue/);
});

test("owner decisions require the full Pro choice packet rather than a brief option list", () => {
  const common = {
    kind: "DECISION_REQUIRED", exact_text: "Choose the release strategy.", reason_code: "OWNER.RELEASE_STRATEGY",
    subject_id: "release:1", blocking_scope: ["release"], source_event_ids: ["event:pro-review"],
    due_at: null, escalation_at: null, status: "OPEN", decision_id: "decision:release:1",
    decision_question: "Which release strategy should govern the candidate?", decision_context: "Pro found a substantive policy tradeoff.",
    default_if_no_decision: "Hold the release.", recommendation_option_id: "option:hold",
    recommendation_reasoning: "Holding preserves reversibility while the missing evidence is obtained.", pro_analysis_ref: "pro-review:turn:2",
  };
  assert.throws(() => ownerActionObligationSchema.parse({ ...common, available_options: ["Release", "Hold"] }));
  assert.doesNotThrow(() => ownerActionObligationSchema.parse({
    ...common,
    options: [
      { option_id: "option:hold", label: "Hold", benefits: ["Preserves reversibility"], drawbacks: ["Delays release"], downstream_consequences: ["Candidate remains unpublished"] },
      { option_id: "option:release", label: "Release", benefits: ["Ships now"], drawbacks: ["Accepts unresolved evidence risk"], downstream_consequences: ["Owner assumes the unresolved risk"] },
    ],
  }));
  assert.throws(() => ownerActionObligationSchema.parse({
    ...common,
    recommendation_option_id: "option:not-described",
    options: [
      { option_id: "option:hold", label: "Hold", benefits: ["Preserves reversibility"], drawbacks: ["Delays release"], downstream_consequences: ["Candidate remains unpublished"] },
      { option_id: "option:release", label: "Release", benefits: ["Ships now"], drawbacks: ["Accepts unresolved evidence risk"], downstream_consequences: ["Owner assumes the unresolved risk"] },
    ],
  }), /must identify one of the fully described options/);
});

test("both owner-facing views render the default outcome when a Pro choice is unanswered", () => {
  for (const relativePath of ["components/Dashboard.tsx", "components/WorkerDetail.tsx"]) {
    const source = fs.readFileSync(path.join(appRoot, relativePath), "utf8");
    assert.match(source, /Default if unanswered: \{action\.default_if_no_decision\}/);
    assert.match(source, /Benefits:/);
    assert.match(source, /Drawbacks:/);
    assert.match(source, /Consequences:/);
    assert.match(source, /recommendation_reasoning/);
  }
});

test("canonical owner changes require an explicit authorization and blocked-owner claims stay nonterminal", () => {
  const reconciliation = workerEvents("auth").find((event) => event.data.type === "objective_reconciliation_recorded")!.data;
  assert.equal(reconciliation.type, "objective_reconciliation_recorded");
  const ownerRemoved = {
    ...reconciliation,
    matrix: reconciliation.matrix.map((row, index) => index === 0
      ? { ...row, status: "OWNER_REMOVED" as const, authorized_change: null }
      : row),
  };
  assert.throws(() => eventSchema.parse(ownerRemoved), /owner-authorized correction reference/);
  assert.doesNotThrow(() => eventSchema.parse({
    ...ownerRemoved,
    matrix: ownerRemoved.matrix.map((row, index) => index === 0 ? { ...row, authorized_change: "owner-decision:remove:1" } : row),
  }));
  const claim = workerEvents("auth").find((event) => event.data.type === "completion_claim_recorded")!.data;
  assert.equal(claim.type, "completion_claim_recorded");
  assert.doesNotThrow(() => eventSchema.parse({
    ...claim, completion_claim_type: "BLOCKED_OWNER_DECISION", proposed_terminal_state: "PARENT_OUTCOME_OPEN",
    exact_candidate_sha256: null, owner_decision_id: null, parent_outcome_remains_open: true,
  }));
});

test("owner-change reconciliation rejects a dangling or wrong-kind authorization record", () => {
  const store = new EventStore(":memory:");
  seedStore(store);
  const reconciliation = store.workerEvents("auth").findLast((event) => event.data.type === "objective_reconciliation_recorded")!.data;
  if (reconciliation.type !== "objective_reconciliation_recorded") throw new Error("Expected reconciliation fixture.");
  assert.throws(() => store.append({
    schema_version: 2, event_id: "demo:auth:reconciliation:unauthorized-removal", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:05:01.000Z",
    data: {
      ...reconciliation, reconciliation_id: "reconciliation:auth:unauthorized-removal",
      matrix: reconciliation.matrix.map((row, index) => index === 0
        ? { ...row, status: "OWNER_REMOVED" as const, authorized_change: "owner-decision:missing" }
        : row),
    },
  }), /matching durable owner decision/);
  store.close();
});

test("finding invalidation closure is labeled separately from a verified correction", () => {
  assert.equal(correctionStatusLabel("CORRECTION_RESOLVED", "WORKER_REDIRECT", "FINDING_INVALIDATED"), "CLOSED — FINDING INVALIDATED");
  assert.equal(correctionStatusLabel("CORRECTION_RESOLVED", "WORKER_REDIRECT", "MIXED_RESOLUTION"), "CLOSED — VERIFIED CORRECTION AND FINDING INVALIDATION");
  assert.equal(correctionStatusLabel("CORRECTION_RESOLVED", "WORKER_REDIRECT", "CORRECTED_AND_VERIFIED"), "REDIRECT RESOLVED");
  const store = new EventStore(":memory:");
  seedStore(store);
  appendInvalidationOnlyClosure(store);
  const lifecycle = projectWorker(store.workerEvents("auth"), new Date("2026-08-30T20:06:06.000Z")).correction;
  assert.equal(lifecycle.correctionResolved, true);
  assert.equal(lifecycle.directiveIssued, false);
  assert.equal(lifecycle.directiveDelivered, false);
  assert.equal(lifecycle.workerAcknowledged, false);
  assert.equal(lifecycle.correctionStarted, false);
  assert.equal(lifecycle.evidenceSubmitted, false);
  assert.equal(lifecycle.correctionVerified, false);
  assert.equal(lifecycle.closureBasis, "FINDING_INVALIDATED");
  assert.match(lifecycle.statusLabel, /FINDING INVALIDATED/);
  store.close();
});

test("verified correction reopens fail-closed when its contract binding changes", () => {
  const events = cloneEvents(workerEvents("tests"));
  replaceLatest(events, "correction_lifecycle_recorded", (correction) => ({
    ...correction, status: "CORRECTION_VERIFIED", verified_candidate_sha256: sha256("candidate:verified"),
  }));
  replaceLatest(events, "task_contract_recorded", (contract) => ({
    ...contract, revision: contract.revision + 1, task_contract_sha256: sha256("contract:changed"),
  }));
  const worker = projectWorker(events, new Date("2026-08-30T20:05:00.000Z"));
  assert.equal(worker.correction.status, "CORRECTION_REOPENED");
  assert.equal(worker.correction.reopenRequired, true);
  assert.equal(worker.correction.correctionVerified, false);
});

test("a durable validity-context change identifies the exact event that reopens verification", () => {
  const events = cloneEvents(workerEvents("tests"));
  const candidate = sha256("tests:verified-candidate");
  const policy = sha256("tests:verification-policy:v1");
  const requirements = sha256("tests:evidence-requirements:v1");
  const contract = events.findLast((event) => event.data.type === "task_contract_recorded")!.data;
  const outcome = events.findLast((event) => event.data.type === "owner_outcome_recorded")!.data;
  assert.equal(contract.type, "task_contract_recorded");
  assert.equal(outcome.type, "owner_outcome_recorded");
  const context = {
    type: "verification_validity_recorded" as const, worker: "tests", context_id: "validity:tests:1",
    supersedes_context_id: null, change_reason: "Initial exact-candidate validity authority.", changed_dimensions: [],
    exact_candidate_sha256: candidate, contract_sha256: contract.task_contract_sha256,
    owner_outcome_id: outcome.owner_outcome_id, owner_outcome_epoch: outcome.epoch, owner_outcome_sha256: outcome.owner_outcome_sha256,
    verification_policy_id: "policy:tests:1", verification_policy_sha256: policy,
    evidence_requirement_schema_sha256: requirements, worker_run_id: "run-tests-01", assignment_epoch: 1,
    target_kind: "WORKER_RUN" as const, target_id: "run-tests-01", target_epoch: 1,
    environment_bindings: [{ binding_id: "environment:tests", binding_sha256: sha256("environment:tests:v1") }],
    source_snapshot_bindings: [{ binding_id: "source:tests", binding_sha256: sha256("source:tests:v1") }],
    verifier_method_version: "verifier-method:tests:1",
  };
  pushV2(events, "validity:tests:event:1", context, "2026-08-30T20:05:01.000Z");
  replaceLatest(events, "correction_lifecycle_recorded", (correction) => ({
    ...correction, status: "CORRECTION_VERIFIED", verified_candidate_sha256: candidate,
    evidence_requirement_schema_sha256: requirements, verification_policy_id: "policy:tests:1", verification_policy_sha256: policy,
    verifier_method_version: "verifier-method:tests:1",
    verification_validity_scope: {
      context_id: context.context_id, exact_candidate_sha256: context.exact_candidate_sha256, contract_sha256: context.contract_sha256,
      owner_outcome_id: context.owner_outcome_id, owner_outcome_epoch: context.owner_outcome_epoch, owner_outcome_sha256: context.owner_outcome_sha256,
      verification_policy_id: context.verification_policy_id, verification_policy_sha256: context.verification_policy_sha256,
      evidence_requirement_schema_sha256: context.evidence_requirement_schema_sha256, worker_run_id: context.worker_run_id,
      assignment_epoch: context.assignment_epoch, target_kind: context.target_kind, target_id: context.target_id, target_epoch: context.target_epoch,
      environment_bindings: context.environment_bindings, source_snapshot_bindings: context.source_snapshot_bindings,
      verifier_method_version: context.verifier_method_version,
      invalidate_on: ["CANDIDATE", "CONTRACT", "OWNER_OUTCOME", "VERIFICATION_POLICY", "EVIDENCE_REQUIREMENT_SCHEMA", "ASSIGNMENT", "TARGET", "ENVIRONMENT", "SOURCE_SNAPSHOT", "VERIFIER_METHOD"],
    },
  }));
  assert.equal(projectWorker(events, new Date("2026-08-30T20:05:02.000Z")).correction.correctionVerified, true);
  const verificationEvent = events.findLast((event) => event.data.type === "correction_lifecycle_recorded")!;
  pushV2(events, "finding:tests:resolved-before-validity-change", {
    type: "finding_status_changed", worker: "tests", finding_id: "finding-tests-forbidden-production",
    from_status: "OPEN", status: "RESOLVED", reason: "The exact correction was independently verified.",
    reason_code: "FINDING.RESOLVED.CORRECTION_VERIFIED", basis_event_ids: [verificationEvent.eventId],
    actor_id: "verifier:tests", actor_role: "VERIFIER", exact_candidate_sha256: candidate,
    contract_sha256: contract.task_contract_sha256, owner_outcome_id: outcome.owner_outcome_id,
    owner_outcome_epoch: outcome.epoch, owner_outcome_sha256: outcome.owner_outcome_sha256,
    resolution_path: "CORRECTION_VERIFIED", verification_event_id: verificationEvent.eventId,
    evidence_requirement_schema_sha256: requirements, verification_policy_sha256: policy,
  }, "2026-08-30T20:05:02.500Z");
  pushV2(events, "validity:tests:event:2", {
    ...context, context_id: "validity:tests:2", supersedes_context_id: context.context_id,
    change_reason: "Verification policy advanced.", changed_dimensions: ["VERIFICATION_POLICY"],
    verification_policy_id: "policy:tests:2", verification_policy_sha256: sha256("tests:verification-policy:v2"),
  }, "2026-08-30T20:05:03.000Z");
  const invalidatedWorker = projectWorker(events, new Date("2026-08-30T20:05:04.000Z"));
  const reopened = invalidatedWorker.correction;
  assert.equal(reopened.status, "CORRECTION_REOPENED");
  assert.equal(reopened.correctionVerified, false);
  assert.equal(reopened.reopenTriggerEventId, "validity:tests:event:2");
  assert.equal(invalidatedWorker.activeFindings.find((finding) => finding.id === "finding-tests-forbidden-production")?.status, "REOPENED");
  assert.equal(invalidatedWorker.terminal.rootTerminalizationAllowed, false);
});

test("Test cleanup continuation is scoped and requires stop/revert before test-only work continues", () => {
  const policy = demoWorker("tests").correction.continuationPolicy;
  assert.equal(policy.mode, "SAFE_WITHIN_SCOPE");
  assert.deepEqual(policy.allowed_scope, ["tests/**", "test-support/**"]);
  assert.deepEqual(policy.forbidden_scope, ["src/core/**", "src/production/**"]);
  assert.ok(policy.preconditions.some((item) => /Stop the production rewrite/.test(item)));
});

test("Test cleanup forbidden-scope evidence is a complete content-addressed changed-path manifest", () => {
  const receipt = workerEvents("tests").find((event) => event.data.type === "evidence_receipt_recorded"
    && event.data.receipt_id === "evidence:finding-tests-forbidden-production")!.data;
  assert.equal(receipt.type, "evidence_receipt_recorded");
  assert.equal(receipt.evidence_class, "DIFF");
  assert.equal(receipt.changed_path_manifest?.complete, true);
  assert.deepEqual(receipt.changed_path_manifest?.paths.map((item) => item.path), ["tests/setup.ts", "src/core/scheduler.ts"]);
  assert.equal(receipt.changed_path_manifest?.current_candidate_sha256, receipt.exact_candidate_sha256);
  assert.throws(() => eventSchema.parse({ ...receipt, changed_path_manifest: null }), /complete content-addressed/);
});

test("expired continuation authority fails closed instead of preserving a formerly safe scope", () => {
  const events = cloneEvents(workerEvents("tests"));
  replaceLatest(events, "correction_lifecycle_recorded", (correction) => ({
    ...correction,
    continuation_policy: {
      ...correction.continuation_policy,
      expires_at: "2026-08-30T20:04:59.000Z",
    },
  }));
  const policy = projectWorker(events, new Date("2026-08-30T20:05:00.000Z")).correction.continuationPolicy;
  assert.equal(policy.mode, "UNKNOWN");
  assert.deepEqual(policy.allowed_scope, []);
  assert.ok(policy.forbidden_scope.includes("all unverified work"));
  assert.ok(policy.preconditions.some((item) => /authority expired/.test(item)));
});

test("finding status is event-derived and immutable finding records cannot be overwritten", () => {
  const store = new EventStore(":memory:");
  seedStore(store);
  const finding = store.workerEvents("billing").find((event) => event.data.type === "finding_recorded")!;
  const invalidationEvidence = store.workerEvents("billing").find((event) => event.data.type === "evidence_receipt_recorded"
    && event.data.receipt_id === "evidence:finding-billing-shared-schema")!;
  const invalidationProposition = sha256("The billing finding is false because the detector used an obsolete path rule.");
  const contract = store.workerEvents("billing").findLast((event) => event.data.type === "task_contract_recorded")!.data;
  const outcome = store.workerEvents("billing").findLast((event) => event.data.type === "owner_outcome_recorded")!.data;
  assert.equal(contract.type, "task_contract_recorded");
  assert.equal(outcome.type, "owner_outcome_recorded");
  assert.throws(() => store.append({
    schema_version: 2, event_id: "demo:billing:finding:duplicate", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:03:00.000Z", data: finding.data,
  }), /immutable/);
  if (invalidationEvidence.data.type !== "evidence_receipt_recorded") throw new Error("Expected billing evidence.");
  const propositionReceiptId = "evidence:billing:invalidation-proposition";
  const propositionReceiptEventId = "demo:billing:evidence:invalidation-proposition";
  store.append({
    schema_version: 2, event_id: propositionReceiptEventId, mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:03:30.000Z",
    data: {
      ...invalidationEvidence.data,
      receipt_id: propositionReceiptId,
      summary: "Independent verifier disproved the exact billing finding proposition.",
      claim_kind: "FINDING_INVALIDATION",
      supports_finding_id: "finding-billing-shared-schema",
      proposition_sha256: invalidationProposition,
    },
  });
  store.append({
    schema_version: 2, event_id: "demo:billing:finding:invalidated", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:04:00.000Z",
    data: {
      type: "finding_status_changed", worker: "billing", finding_id: "finding-billing-shared-schema",
      from_status: "OPEN", status: "INVALIDATED", reason: "The detector used an obsolete path rule.",
      reason_code: "FINDING.INVALIDATED.OBSOLETE_RULE", basis_event_ids: [propositionReceiptEventId],
      actor_id: "verifier:billing", actor_role: "VERIFIER",
      exact_candidate_sha256: invalidationEvidence.data.type === "evidence_receipt_recorded" ? invalidationEvidence.data.exact_candidate_sha256 : null,
      contract_sha256: contract.type === "task_contract_recorded" ? contract.task_contract_sha256 : sha256("unreachable"),
      owner_outcome_id: outcome.type === "owner_outcome_recorded" ? outcome.owner_outcome_id : "unreachable",
      owner_outcome_epoch: outcome.type === "owner_outcome_recorded" ? outcome.epoch : 1,
      owner_outcome_sha256: outcome.type === "owner_outcome_recorded" ? outcome.owner_outcome_sha256 : sha256("unreachable"),
      invalidation_evidence_receipt_ids: [propositionReceiptId], invalidation_proposition_sha256: invalidationProposition,
      invalidator_method_version: "path-rule-verifier:v2", affected_directive_event_ids: [],
    },
  });
  assert.equal(projectWorker(store.workerEvents("billing"), new Date("2026-08-30T20:05:00.000Z")).activeFindings.length, 0);
  store.close();
});

test("finding state transitions reject reopen-without-closure and stale mitigation evidence", () => {
  const store = new EventStore(":memory:");
  seedStore(store);
  const events = store.workerEvents("billing");
  const finding = events.find((event) => event.data.type === "finding_recorded")!;
  const contract = events.findLast((event) => event.data.type === "task_contract_recorded")!.data;
  const outcome = events.findLast((event) => event.data.type === "owner_outcome_recorded")!.data;
  if (contract.type !== "task_contract_recorded" || outcome.type !== "owner_outcome_recorded") throw new Error("Expected authority fixtures.");
  const common = {
    type: "finding_status_changed" as const, worker: "billing", finding_id: "finding-billing-shared-schema",
    from_status: "OPEN" as const, reason: "Unsupported state assertion", reason_code: "FINDING.INVALID_TRANSITION",
    basis_event_ids: [finding.eventId], actor_id: "verifier:billing", actor_role: "VERIFIER" as const,
    exact_candidate_sha256: null, contract_sha256: contract.task_contract_sha256,
    owner_outcome_id: outcome.owner_outcome_id, owner_outcome_epoch: outcome.epoch, owner_outcome_sha256: outcome.owner_outcome_sha256,
  };
  assert.throws(() => store.append({
    schema_version: 2, event_id: "demo:billing:finding:reopen-without-closure", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:05:01.000Z",
    data: { ...common, status: "REOPENED", invalidating_event_id: finding.eventId, invalidated_closure_event_id: finding.eventId, binding_change: "None" },
  }), /Invalid finding status transition OPEN -> REOPENED/);
  store.append({
    schema_version: 2, event_id: "demo:billing:evidence:stale-mitigation", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:05:02.000Z",
    data: {
      type: "evidence_receipt_recorded", worker: "billing", receipt_id: "evidence:billing:stale-mitigation",
      producer_id: "verifier:billing", producer_role: "VERIFIER", evidence_class: "SEMANTIC_REVIEW",
      independence: "INDEPENDENT", freshness: "STALE", exact_candidate_sha256: null,
      summary: "A stale review cannot mitigate the current finding.", refs: ["review:obsolete"], verified: true, changed_path_manifest: null,
    },
  });
  assert.throws(() => store.append({
    schema_version: 2, event_id: "demo:billing:finding:stale-mitigation", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:05:03.000Z",
    data: {
      ...common, status: "MITIGATED", mitigation_evidence_receipt_ids: ["evidence:billing:stale-mitigation"],
      residual_risk: "Unverified", remaining_required_response: "Collect current evidence", next_review_trigger: "after current evidence",
    },
  }), /current independent verified evidence/);
  store.close();
});

test("a bare finding RESOLVED assertion cannot bypass current correction verification", () => {
  const store = new EventStore(":memory:");
  seedStore(store);
  const events = store.workerEvents("billing");
  const finding = events.find((event) => event.data.type === "finding_recorded")!;
  const contract = events.findLast((event) => event.data.type === "task_contract_recorded")!.data;
  const outcome = events.findLast((event) => event.data.type === "owner_outcome_recorded")!.data;
  assert.equal(contract.type, "task_contract_recorded");
  assert.equal(outcome.type, "owner_outcome_recorded");
  assert.throws(() => store.append({
    schema_version: 2, event_id: "demo:billing:finding:false-resolve", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:04:00.000Z",
    data: {
      type: "finding_status_changed", worker: "billing", finding_id: "finding-billing-shared-schema",
      from_status: "OPEN", status: "RESOLVED", reason: "Bare assertion", reason_code: "FINDING.FALSE_RESOLUTION",
      basis_event_ids: [finding.eventId], actor_id: "supervisor:billing", actor_role: "SUPERVISOR",
      exact_candidate_sha256: sha256("billing:candidate"), contract_sha256: contract.task_contract_sha256,
      owner_outcome_id: outcome.owner_outcome_id, owner_outcome_epoch: outcome.epoch, owner_outcome_sha256: outcome.owner_outcome_sha256,
      resolution_path: "CORRECTION_VERIFIED", verification_event_id: finding.eventId,
      evidence_requirement_schema_sha256: sha256("billing:requirements"), verification_policy_sha256: sha256("billing:policy"),
    },
  }), /current exact correction verification/);
  store.close();
});

test("the 13.82 percent contract-laundering fixture preserves worker GREEN and makes the root RED", () => {
  const worker = demoWorker("article-humanization");
  assert.equal(worker.workerToContractAlignment, "GREEN");
  assert.equal(worker.contractToOwnerAlignment, "DIVERGED");
  assert.equal(worker.overallTraffic, "RED");
  assert.equal(worker.terminal.completionClaimType, "READY_FOR_OWNER_REVIEW");
  assert.equal(worker.terminal.contractStatus, "CONTRACT_LAUNDERING");
  assert.equal(worker.terminal.requiredDirective, "HOLD_SAME_STRATEGY_AND_SELECT_REPLACEMENT_METHOD");
  assert.equal(worker.terminal.rootTerminalizationAllowed, false);
  for (const code of ["SCOPE_CONTRACTION", "OBJECTIVE_SUBSTITUTION", "PROXY_SUBSTITUTION", "COMPLETION_ILLUSION"]) {
    assert.ok(worker.terminal.reasonCodes.includes(code));
  }
  assert.equal(worker.correction.directiveKind, "CONTRACT_REPAIR");
});

test("an unsupported institutional gate cannot remain aligned with the owner", () => {
  const events = cloneEvents(workerEvents("auth"));
  replaceLatest(events, "task_contract_recorded", (contract) => ({
    ...contract,
    unsupported_added_constraints: [
      "Require an invite-only pilot and a consolidated staffing gate before allowing the owner-requested public form.",
    ],
  }));
  const comparison = compareTerminalState(events);
  const worker = projectWorker(events, new Date("2026-08-30T20:05:00.000Z"));
  assert.equal(comparison.workerToContractAlignment, "GREEN");
  assert.equal(comparison.contractToOwnerAlignment, "DIVERGED");
  assert.equal(comparison.contractStatus, "CONTRACT_LAUNDERING");
  assert.equal(comparison.overallTraffic, "RED");
  assert.equal(comparison.rootTerminalizationAllowed, false);
  assert.ok(comparison.reasonCodes.includes("UNSUPPORTED_CONSTRAINT_ADDITION"));
  assert.match(worker.primaryProblemSummary ?? "", /added a material gate.*not supported by the independent owner source/i);
});

test("an honest completed subtask can close while its parent outcome remains open", () => {
  const events = cloneEvents(workerEvents("auth"));
  replaceLatest(events, "completion_claim_recorded", (claim) => ({
    ...claim, completion_claim_type: "SUBTASK_COMPLETE_PARENT_OPEN", proposed_terminal_state: "SUBTASK_COMPLETE_PARENT_OPEN",
  }));
  const comparison = compareTerminalState(events);
  assert.equal(comparison.decision, "ALLOW_SUBTASK_CLOSE_PARENT_OPEN");
  assert.equal(comparison.rootTerminalizationAllowed, false);
});

test("stale reconciliation makes contract-to-owner PARTIAL and holds source authority", () => {
  const events = cloneEvents(workerEvents("auth"));
  replaceLatest(events, "objective_reconciliation_recorded", (record) => ({ ...record, freshness: "STALE" }));
  const comparison = compareTerminalState(events);
  assert.equal(comparison.contractToOwnerAlignment, "PARTIAL");
  assert.equal(comparison.decision, "HOLD_SOURCE_AUTHORITY");
  assert.ok(comparison.reasonCodes.includes("RECONCILIATION_STALE"));
});

test("terminal claims require current independent exact-candidate evidence", () => {
  const events = cloneEvents(workerEvents("auth"));
  replaceLatest(events, "owner_outcome_recorded", (outcome) => ({
    ...outcome,
    gap_status: "NONE",
    required_outcomes: outcome.required_outcomes.map((item) => ({ ...item, status: "MET" })),
  }));
  replaceLatest(events, "objective_reconciliation_recorded", (reconciliation) => ({
    ...reconciliation, gap_status: "NONE", current_gap: "No remaining owner-outcome gap.", unmet_owner_outcome_ids: [], unknown_owner_outcome_ids: [],
  }));
  replaceLatest(events, "completion_claim_recorded", (claim) => ({
    ...claim,
    completion_claim_type: "OWNER_OUTCOME_ACHIEVED",
    proposed_terminal_state: "OWNER_OUTCOME_SATISFIED",
    exact_candidate_sha256: sha256("candidate-a"),
    evidence_receipt_ids: [],
  }));
  const comparison = compareTerminalState(events);
  assert.equal(comparison.decision, "HOLD_COMPLETION_EVIDENCE");
  assert.ok(comparison.reasonCodes.includes("EVIDENCE_RECEIPT_MISSING"));
  assert.equal(comparison.rootTerminalizationAllowed, false);
});

test("owner cancellation cannot be inferred without an exact durable owner decision", () => {
  const events = cloneEvents(workerEvents("auth"));
  replaceLatest(events, "completion_claim_recorded", (claim) => ({
    ...claim, completion_claim_type: "CANCELED_BY_OWNER", proposed_terminal_state: "CANCELED",
    owner_decision_id: null, parent_outcome_remains_open: false,
  }));
  const comparison = compareTerminalState(events);
  assert.equal(comparison.rootTerminalizationAllowed, false);
  assert.notEqual(comparison.decision, "ALLOW_OWNER_CANCELLATION");
  assert.ok(comparison.reasonCodes.includes("OWNER_CANCELLATION_AUTHORITY_MISSING"));
});

test("root close requires a coherent fresh authority vector and exact outcome-to-receipt coverage", () => {
  const events = cloneEvents(workerEvents("auth"));
  const candidate = sha256("auth:root-candidate");
  const receiptId = "evidence:auth:root-outcome";
  pushV2(events, "evidence:auth:root-outcome:event", {
    type: "evidence_receipt_recorded", worker: "auth", receipt_id: receiptId,
    producer_id: "verifier:auth", producer_role: "VERIFIER", evidence_class: "ARTIFACT",
    independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: candidate,
    summary: "The exact auth candidate satisfies the terminal owner outcome.", refs: ["auth-root-verification"], verified: true,
    changed_path_manifest: null,
  }, "2026-08-30T20:05:01.000Z");
  replaceLatest(events, "owner_outcome_recorded", (outcome) => ({
    ...outcome, gap_status: "NONE", current_gap: "No remaining owner-outcome gap.",
    required_outcomes: outcome.required_outcomes.map((item) => ({ ...item, status: "MET", direct_evidence_receipt_ids: [receiptId] })),
  }));
  replaceLatest(events, "objective_reconciliation_recorded", (reconciliation) => ({
    ...reconciliation, gap_status: "NONE", current_gap: "No remaining owner-outcome gap.", unmet_owner_outcome_ids: [], unknown_owner_outcome_ids: [],
    matrix: reconciliation.matrix.map((row) => ({ ...row, acceptance_evidence_receipt_ids: [receiptId] })),
  }));
  replaceLatest(events, "completion_claim_recorded", (claim) => ({
    ...claim, completion_claim_type: "OWNER_OUTCOME_ACHIEVED", proposed_terminal_state: "OWNER_OUTCOME_SATISFIED",
    exact_candidate_sha256: candidate, evidence_receipt_ids: [receiptId], parent_outcome_remains_open: false,
  }));
  replaceLatest(events, "supervisor_assessment_recorded", (assessment) => ({ ...assessment, reviewed_state_vector_sha256: authorityStateVectorHash(events) }));
  const comparison = compareTerminalState(events);
  assert.equal(comparison.decision, "ALLOW_ROOT_CLOSE");
  assert.equal(comparison.rootTerminalizationAllowed, true);
  replaceLatest(events, "supervisor_assessment_recorded", (assessment) => ({
    ...assessment,
    worker_to_contract_alignment: "RED",
    operator_verdict: "REDIRECT",
    reason: "The worker no longer follows the exact contract.",
  }));
  const redComparison = compareTerminalState(events);
  assert.equal(redComparison.workerToContractAlignment, "RED");
  assert.equal(redComparison.rootTerminalizationAllowed, false);
  assert.equal(redComparison.overallTraffic, "RED");
});

test("unmet reconciliation, unrelated evidence, and stale review can never authorize a root close", () => {
  const events = cloneEvents(workerEvents("auth"));
  const candidate = sha256("auth:false-root-candidate");
  pushV2(events, "evidence:auth:unrelated:event", {
    type: "evidence_receipt_recorded", worker: "auth", receipt_id: "evidence:auth:unrelated",
    producer_id: "collector:auth", producer_role: "COLLECTOR", evidence_class: "TEST",
    independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: candidate,
    summary: "An unrelated unit test passed.", refs: ["unit:test"], verified: true, changed_path_manifest: null,
  }, "2026-08-30T20:05:01.000Z");
  replaceLatest(events, "owner_outcome_recorded", (outcome) => ({
    ...outcome, required_outcomes: outcome.required_outcomes.map((item) => ({ ...item, status: "MET" })),
  }));
  replaceLatest(events, "completion_claim_recorded", (claim) => ({
    ...claim, completion_claim_type: "OWNER_OUTCOME_ACHIEVED", proposed_terminal_state: "OWNER_OUTCOME_SATISFIED",
    exact_candidate_sha256: candidate, evidence_receipt_ids: ["evidence:auth:unrelated"], parent_outcome_remains_open: false,
  }));
  const comparison = compareTerminalState(events);
  assert.equal(comparison.rootTerminalizationAllowed, false);
  assert.notEqual(comparison.decision, "ALLOW_ROOT_CLOSE");
  assert.notEqual(comparison.overallTraffic, "GREEN");
  assert.ok(comparison.reasonCodes.includes("OWNER_OUTCOME_UNMET"));
  assert.ok(comparison.reasonCodes.includes("SUPERVISOR_ASSESSMENT_STALE"));
});

test("supervisor GREEN cannot override an unmet owner outcome at a terminal boundary", () => {
  const events = cloneEvents(workerEvents("auth"));
  replaceLatest(events, "completion_claim_recorded", (claim) => ({
    ...claim, completion_claim_type: "OWNER_OUTCOME_ACHIEVED", proposed_terminal_state: "OWNER_OUTCOME_SATISFIED",
  }));
  const comparison = compareTerminalState(events);
  assert.equal(comparison.workerToContractAlignment, "GREEN");
  assert.equal(comparison.ownerOutcomeStatus, "UNMET");
  assert.equal(comparison.rootTerminalizationAllowed, false);
  assert.notEqual(comparison.overallTraffic, "GREEN");
});

test("AskRigor keeps operational, scientific, and release planes independent", () => {
  const worker = demoWorker("askrigor");
  assert.deepEqual(worker.research && {
    operational: worker.research.operationalProtocol,
    scientific: worker.research.scientificConclusion,
    release: worker.research.releaseAdequacy,
    permission: worker.research.releasePermission,
  }, { operational: "PASS", scientific: "FAIL", release: "FAIL", permission: false });
  assert.match(worker.primaryProblemSummary ?? "", /not supported/i);
  assert.equal(worker.terminal.requiredDirective, "HOLD_RELEASE");
});

test("attention ordering puts an unacknowledged REDIRECT before contract repair and WATCH", () => {
  const workers = projectWorkers(demoEvents, new Date("2026-08-30T20:05:00.000Z"));
  assert.deepEqual(workers.slice(0, 4).map((worker) => worker.id), ["tests", "article-humanization", "askrigor", "billing"]);
  assert.ok(attentionPriority(workers[0]) < attentionPriority(workers[1]));
});

test("no RED or YELLOW projection relies on a numeric index without an explanation and correction state", () => {
  for (const worker of projectWorkers(demoEvents)) {
    if (!["RED", "YELLOW"].includes(worker.overallTraffic)) continue;
    assert.ok(worker.primaryProblemSummary);
    assert.ok(worker.correction.statusLabel);
    assert.equal(typeof worker.alignment, "number");
  }
});

test("supervision routes enforce the three-turn hard maximum", () => {
  const routeEvent = workerEvents("auth").find((event) => event.data.type === "supervision_route_recorded")!;
  assert.equal(routeEvent.data.type === "supervision_route_recorded" && routeEvent.data.hard_maximum, 3);
  const invalid = structuredClone(routeEvent.data) as Extract<MissionControlEventV2, { type: "supervision_route_recorded" }>;
  invalid.substantive_response_count = 4 as never;
  assert.throws(() => eventSchema.parse(invalid));
  const activeTurnThree = { ...structuredClone(routeEvent.data), substantive_response_count: 3, status: "ACTIVE", handoff_capsule_id: null, handoff_capsule_sha256: null, accepted_state_vector_sha256: null };
  assert.throws(() => eventSchema.parse(activeTurnThree), /Turn 3 cannot remain ACTIVE/);
  assert.doesNotThrow(() => eventSchema.parse({
    ...activeTurnThree,
    status: "ROLLOVER_REQUIRED",
    handoff_capsule_id: "handoff:auth:1",
    handoff_capsule_sha256: sha256("handoff:auth:1"),
    accepted_state_vector_sha256: sha256("state:auth:turn-3"),
  }));

  const store = new EventStore(":memory:");
  seedStore(store);
  const current = store.workerEvents("auth").findLast((event) => event.data.type === "supervision_route_recorded")!.data;
  assert.equal(current.type, "supervision_route_recorded");
  const highWater = store.latestSequence();
  const acceptedStateVectorSha256 = authorityStateVectorHash(
    store.workerEvents("auth").filter((event) => event.sequence <= highWater),
  );
  const capsuleId = "handoff:auth:turn-3";
  const handoffCapsuleSha256 = supervisionHandoffCapsuleSha256({
    capsuleId,
    worker: "auth",
    sourceSessionId: current.session_id,
    acceptedStateVectorSha256,
    authorityHighWaterSequence: highWater,
  });
  const outgoing = {
    ...current,
    substantive_response_count: 3 as const,
    status: "ROLLOVER_REQUIRED" as const,
    handoff_capsule_id: capsuleId,
    handoff_capsule_sha256: handoffCapsuleSha256,
    accepted_state_vector_sha256: acceptedStateVectorSha256,
    authority_high_water_sequence: highWater,
  };
  assert.throws(() => store.append({
    schema_version: 2, event_id: "route:auth:turn-3:forged", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:00.000Z", data: { ...outgoing, handoff_capsule_sha256: sha256("forged") },
  }), /capsule digest must bind/);
  store.append({
    schema_version: 2, event_id: "route:auth:turn-3", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:00.000Z", data: outgoing,
  });
  assert.doesNotThrow(() => store.append({
    schema_version: 2, event_id: "route:auth:successor", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:07:00.000Z", data: {
      ...outgoing,
      session_id: "pro-session:auth:successor",
      predecessor_session_id: current.session_id,
      substantive_response_count: 0,
      status: "ACTIVE",
    },
  }));
  store.close();
});

test("every authenticated event family rejects a producer scoped to another worker and task", () => {
  const families = new Map(workerEvents("tests").map((event) => [event.data.type, event.data as MissionControlEventV2]));
  assert.ok(families.has("execution_directive_recorded"));
  assert.ok(families.has("execution_receipt_recorded"));
  assert.ok(families.has("outcome_progress_recorded"));
  for (const [type, event] of families) {
    for (const kind of producerKinds) {
      assert.equal(producerMayEmit({
        id: `cross-worker:${kind.toLowerCase()}`,
        kind,
        workerScopes: ["billing"],
        taskScopes: ["task:billing"],
      }, event), false, `${kind} unexpectedly emitted ${type} across worker/task scope`);
    }
  }
  for (const type of authenticatedEventTypes) {
    const worker = type === "review_marked" ? null : "tests";
    const scopeProbe = { type, worker } as MissionControlEventV2;
    assert.equal(producerMayEmit({
      id: "scope-probe:wrong-worker", kind: "UI", workerScopes: ["billing"], taskScopes: ["*"],
    }, scopeProbe), false, `${type} accepted a producer outside its worker scope`);
    assert.equal(producerMayEmit({
      id: "scope-probe:wrong-task", kind: "UI", workerScopes: ["*"], taskScopes: ["task:wrong"],
    }, scopeProbe), false, `${type} accepted a producer outside its task scope`);
  }
});

test("authenticated producer provenance is immutable and persisted on every append", () => {
  const store = new EventStore(":memory:");
  const producer = { id: "owner-authority:alpha", kind: "OWNER_AUTHORITY" as const, workerScopes: ["alpha"], taskScopes: ["task:alpha"] };
  const source = sourceEnvelope("source:alpha:provenance");
  const stored = store.append(source, source.occurred_at, producer);
  assert.equal(stored.producerId, producer.id);
  assert.equal(stored.producerKind, producer.kind);
  assert.throws(() => store.append(source, source.occurred_at, { ...producer, id: "owner-authority:other" }), IdempotencyConflictError);
  assert.ok(store.allEvents().every((event) => event.producerId && event.producerKind));
  store.close();
});

test("an unrelated later owner-source receipt cannot launder the bound owner outcome", () => {
  const events = cloneEvents(workerEvents("auth"));
  const outcome = events.findLast((event) => event.data.type === "owner_outcome_recorded")!.data;
  assert.equal(outcome.type, "owner_outcome_recorded");
  const linkedReceiptId = outcome.source_receipt_id;
  pushV2(events, "source:auth:unrelated", {
    type: "owner_source_recorded", worker: "auth", receipt_id: "source:auth:unrelated",
    owner_request_id: "owner-request:unrelated", canonical_locator: "fixture://owner-request/unrelated",
    source_sha256: sha256("unrelated-source"), worker_copy_sha256: sha256("unrelated-copy"), capture_integrity: "VERIFIED",
    acquisition_mode: "INDEPENDENT_READER_DIRECT", receipt_capability: "INDEPENDENT_SOURCE_VERIFIED",
    comparison: "MISMATCH", freshness: "CURRENT", limitations: ["Unrelated to the active owner outcome."],
  }, "2026-08-30T20:06:00.000Z");
  const worker = projectWorker(events);
  assert.equal(worker.sourceReceipt.receiptId, linkedReceiptId);
  assert.equal(worker.contractToOwnerAlignment, "MATCH");
});

test("Somatic regression stays RED even while worker and contract alignment pass", () => {
  const worker = demoWorker("article-humanization");
  assert.equal(worker.workerToContractAlignment, "GREEN");
  assert.equal(worker.progress.outcomeAdvancement, "REGRESSING");
  assert.equal(worker.progress.strategyEfficacy, "REPLACEMENT_REQUIRED");
  assert.equal(worker.progress.sameStrategyContinuationAllowed, false);
  assert.equal(worker.overallTraffic, "RED");
  assert.equal(worker.terminal.requiredDirective, "HOLD_SAME_STRATEGY_AND_SELECT_REPLACEMENT_METHOD");
  assert.match(worker.progress.latestEvidence, /0\.1231321841/);
  assert.match(worker.progress.bestEvidence, /0\.1547368467/);
});

test("numeric evidence direction automatically overrides a dishonest healthy progress classification", () => {
  const events = cloneEvents(workerEvents("auth"));
  replaceLatest(events, "outcome_progress_recorded", (progress) => ({
    ...progress,
    measurement_direction: "HIGHER_IS_BETTER",
    target_evidence: { state: "target", numeric_value: 1, unit: "score", evidence_receipt_ids: [], evidence_role: "UNKNOWN", predictive_basis: null, decision_boundary: null },
    baseline_evidence: { state: "baseline", numeric_value: 0.8, unit: "score", evidence_receipt_ids: [], evidence_role: "UNKNOWN", predictive_basis: null, decision_boundary: null },
    previous_evidence: { state: "previous", numeric_value: 0.7, unit: "score", evidence_receipt_ids: [], evidence_role: "UNKNOWN", predictive_basis: null, decision_boundary: null },
    current_evidence: { state: "current", numeric_value: 0.5, unit: "score", evidence_receipt_ids: [], evidence_role: "UNKNOWN", predictive_basis: null, decision_boundary: null },
    best_evidence: { state: "best", numeric_value: 0.8, unit: "score", evidence_receipt_ids: [], evidence_role: "UNKNOWN", predictive_basis: null, decision_boundary: null },
    change_from_baseline: -0.3,
    change_from_previous: -0.2,
    outcome_advancement: "ADVANCING",
    strategy_efficacy: "VIABLE",
    overall_control_state: "GREEN",
    same_strategy_continuation_allowed: true,
  }));
  const worker = projectWorker(events);
  assert.equal(worker.progress.outcomeAdvancement, "REGRESSING");
  assert.equal(worker.progress.strategyEfficacy, "UNCERTAIN");
  assert.equal(worker.progress.sameStrategyContinuationAllowed, false);
  assert.equal(worker.overallTraffic, "RED");
  assert.equal(worker.terminal.requiredDirective, "HOLD_SAME_STRATEGY_AND_SELECT_REPLACEMENT_METHOD");

  const store = new EventStore(":memory:");
  seedStore(store);
  const invalid = events.findLast((event) => event.data.type === "outcome_progress_recorded")!.data;
  assert.equal(invalid.type, "outcome_progress_recorded");
  assert.throws(() => store.append({
    schema_version: 2,
    event_id: "outcome-progress:auth:dishonest-healthy",
    mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:00.000Z",
    data: { ...invalid, progress_receipt_id: "outcome-progress:auth:dishonest-healthy" },
  }), /outcome_advancement must be REGRESSING/);
  store.close();
});

test("missing directives hold current-epoch Codex execution and execution receipts cannot claim supervisory authority", () => {
  const events = cloneEvents(workerEvents("auth")).filter((event) => event.data.type !== "execution_directive_recorded");
  const worker = projectWorker(events);
  assert.equal(worker.terminal.activeDirectiveCurrent, false);
  assert.ok(worker.terminal.reasonCodes.includes("SUPERVISION_DIRECTIVE_MISSING"));
  assert.notEqual(worker.overallTraffic, "GREEN");
  assert.match(worker.primaryProblemSummary ?? "", /No current chat-authored execution directive/i);
  assert.match(worker.whyItMatters ?? "", /SUPERVISION_DIRECTIVE_MISSING/);
  assert.equal(worker.correction.directive, "OBTAIN_CURRENT_CHAT_AUTHORED_EXECUTION_DIRECTIVE");
  const receipt = workerEvents("auth").find((event) => event.data.type === "execution_receipt_recorded")!.data;
  assert.equal(receipt.type, "execution_receipt_recorded");
  assert.throws(() => eventSchema.parse({ ...receipt, progress_classification: "ADVANCING" }));
  assert.throws(() => eventSchema.parse({ ...receipt, strategy_change: "new-strategy" }));
  assert.throws(() => eventSchema.parse({ ...receipt, supervisory_verdict: "PASS" }));
  const store = new EventStore(":memory:");
  seedStore(store);
  const start = store.workerEvents("auth").find((event) => event.data.type === "codex_execution_started")!.data;
  assert.equal(start.type, "codex_execution_started");
  assert.throws(() => store.append({
    schema_version: 2, event_id: "execution-start:auth:missing-directive", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:07:00.000Z", data: {
      ...start, execution_start_id: "execution-start:auth:missing-directive", directive_id: "directive:missing",
    },
  }), /cannot start without the current active exact chat-authored directive/);
  assert.throws(() => store.append({
    schema_version: 2, event_id: "execution-start:auth:continued-after-stop", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:08:00.000Z", data: { ...start, execution_start_id: "execution-start:auth:continued-after-stop" },
  }), /cannot continue after a directive stop receipt/);
  store.close();
});

test("a receipt awaiting reasoning review remains a visible nonterminal auto-continuation handoff", () => {
  const source = cloneEvents(workerEvents("auth"));
  const receiptIndex = source.findIndex((event) => event.data.type === "execution_receipt_recorded");
  assert.ok(receiptIndex > 0);
  const worker = projectWorker(source.slice(0, receiptIndex + 1), new Date(source[receiptIndex].occurredAt));
  assert.equal(worker.executionSupervision.pendingReasoningReview, true);
  assert.equal(worker.executionSupervision.codexExecutionState, "AWAITING_REASONING_REVIEW_AUTO_RESUME_REQUIRED");
  assert.equal(worker.terminal.requiredDirective, "ROUTE_RECEIPT_AWAIT_REVIEW_AND_RESUME_AUTOMATICALLY");
  assert.equal(worker.terminal.decision, "CONTINUE_WORK");
  assert.equal(worker.terminal.rootTerminalizationAllowed, false);
  assert.notEqual(worker.overallTraffic, "GREEN");
  assert.match(worker.primaryProblemSummary ?? "", /nonterminal handoff.*resume automatically/i);
  assert.equal(worker.correction.ownerActionType, "NONE");
  assert.match(worker.correction.ownerActionText, /No owner action.*automatic continuation/i);
  assert.ok(!worker.terminal.requiredDirective.includes("STOP"));
});

test("a dropped review handoff escalates only after the controller continuation lease expires", () => {
  const source = cloneEvents(workerEvents("auth"));
  const receiptIndex = source.findIndex((event) => event.data.type === "execution_receipt_recorded");
  assert.ok(receiptIndex > 0);
  const receiptAt = new Date(source[receiptIndex].occurredAt).getTime();
  const worker = projectWorker(source.slice(0, receiptIndex + 1), new Date(receiptAt + 10 * 60_000 + 1));
  assert.equal(worker.executionSupervision.pendingReasoningReview, true);
  assert.equal(worker.correction.ownerActionType, "MANUAL_INTERVENTION_REQUIRED");
  assert.match(worker.correction.ownerActionText, /non-owner next action is overdue/i);
});

test("a next directive requires a post-receipt reasoning review and the exact review capsule", () => {
  const source = workerEvents("auth");
  const receiptIndex = source.findIndex((event) => event.data.type === "execution_receipt_recorded");
  assert.ok(receiptIndex > 0);
  const store = new EventStore(":memory:");
  for (const event of source.slice(0, receiptIndex)) {
    store.append({
      schema_version: 2, event_id: event.eventId, mission_id: event.missionId,
      occurred_at: event.occurredAt, data: event.data,
    }, event.receivedAt);
  }
  const priorReasoning = store.workerEvents("auth").findLast((event) => event.data.type === "reasoning_supervision_recorded")!.data;
  assert.equal(priorReasoning.type, "reasoning_supervision_recorded");
  const predatedReview = {
    ...priorReasoning,
    decision_id: "reasoning-decision:auth:predated",
    capsule_id: "reasoning-capsule:auth:predated",
    reasoning_supervisor_chat_epoch: "chat-epoch:auth:predated",
    active_execution_directive_id: null,
    last_reasoning_review_at: "2026-08-30T20:05:57.000Z",
  };
  store.append({
    schema_version: 2, event_id: "reasoning:auth:predated", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:05:57.000Z", data: predatedReview,
  });
  const receipt = source[receiptIndex];
  store.append({
    schema_version: 2, event_id: receipt.eventId, mission_id: receipt.missionId,
    occurred_at: receipt.occurredAt, data: receipt.data,
  }, receipt.receivedAt);
  const priorDirective = store.workerEvents("auth").findLast((event) => event.data.type === "execution_directive_recorded")!.data;
  assert.equal(priorDirective.type, "execution_directive_recorded");
  const predatedDirective = {
    ...priorDirective,
    directive_id: "execution-directive:auth:2",
    directive_revision: 2,
    reasoning_chat_epoch: predatedReview.reasoning_supervisor_chat_epoch,
    chat_decision_id: predatedReview.decision_id,
    capsule_id: predatedReview.capsule_id,
  };
  assert.throws(() => store.append({
    schema_version: 2, event_id: "directive:auth:predated-review", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:05:59.000Z", data: predatedDirective,
  }), /later independent reasoning review after the prior execution receipt/);

  const postReceiptReview = {
    ...predatedReview,
    decision_id: "reasoning-decision:auth:post-receipt",
    capsule_id: "reasoning-capsule:auth:post-receipt",
    reasoning_supervisor_chat_epoch: "chat-epoch:auth:post-receipt",
    last_reasoning_review_at: "2026-08-30T20:06:00.000Z",
  };
  store.append({
    schema_version: 2, event_id: "reasoning:auth:post-receipt", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:00.000Z", data: postReceiptReview,
  });
  const validDirective = {
    ...predatedDirective,
    reasoning_chat_epoch: postReceiptReview.reasoning_supervisor_chat_epoch,
    chat_decision_id: postReceiptReview.decision_id,
    capsule_id: postReceiptReview.capsule_id,
  };
  assert.throws(() => store.append({
    schema_version: 2, event_id: "directive:auth:capsule-mismatch", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:01.000Z", data: { ...validDirective, capsule_id: "reasoning-capsule:auth:wrong" },
  }), /exact current chat decision, capsule/);
  assert.doesNotThrow(() => store.append({
    schema_version: 2, event_id: "directive:auth:post-receipt", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:02.000Z", data: validDirective,
  }));
  store.close();
});

test("new reasoning supervision binds the exact current owner-outcome authority while legacy records remain readable but non-authoritative", () => {
  const current = workerEvents("auth").findLast((event) => event.data.type === "reasoning_supervision_recorded")!.data;
  assert.equal(current.type, "reasoning_supervision_recorded");
  const legacy = { ...current } as Record<string, unknown>;
  delete legacy.owner_outcome_id;
  delete legacy.owner_outcome_epoch;
  delete legacy.owner_outcome_sha256;
  const readable = eventSchema.parse(legacy);
  assert.equal(readable.type, "reasoning_supervision_recorded");
  assert.equal(readable.type === "reasoning_supervision_recorded" && readable.owner_outcome_id, null);
  const legacyEvents = cloneEvents(workerEvents("auth"));
  replaceLatest(legacyEvents, "reasoning_supervision_recorded", (reasoning) => ({
    ...reasoning, owner_outcome_id: null, owner_outcome_epoch: null, owner_outcome_sha256: null,
  }));
  const legacyProjection = projectWorker(legacyEvents);
  assert.equal(legacyProjection.terminal.reasoningReviewFresh, false);
  assert.equal(legacyProjection.terminal.activeDirectiveCurrent, false);
  assert.notEqual(legacyProjection.overallTraffic, "GREEN");
  assert.ok(legacyProjection.terminal.reasonCodes.includes("REASONING_SUPERVISOR_MISSING"));

  const store = new EventStore(":memory:");
  seedStore(store);
  assert.throws(() => store.append({
    schema_version: 2,
    event_id: "reasoning:auth:stale-owner-epoch",
    mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:00.000Z",
    data: {
      ...current,
      decision_id: "reasoning-decision:auth:stale-owner-epoch",
      capsule_id: "reasoning-capsule:auth:stale-owner-epoch",
      owner_outcome_epoch: 3,
      owner_outcome_sha256: sha256("auth-stale-owner-outcome"),
    },
  }), /current exact owner-outcome ID, epoch, and hash/);
  store.close();
});

test("qualitative ADVANCING fails closed unless current and best evidence are durable independent outcome indicators", () => {
  const store = new EventStore(":memory:");
  seedStore(store);
  const base = store.workerEvents("auth").findLast((event) => event.data.type === "outcome_progress_recorded")!.data;
  assert.equal(base.type, "outcome_progress_recorded");
  const validReceiptId = base.current_evidence.evidence_receipt_ids[0];
  assert.ok(validReceiptId);

  const appendProgress = (id: string, currentEvidence: typeof base.current_evidence, bestEvidence = currentEvidence) => store.append({
    schema_version: 2,
    event_id: `outcome-progress:auth:${id}`,
    mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:07:00.000Z",
    data: { ...base, progress_receipt_id: `outcome-progress:auth:${id}`, current_evidence: currentEvidence, best_evidence: bestEvidence },
  });

  assert.throws(() => appendProgress("missing-receipts", {
    ...base.current_evidence, evidence_role: "DIRECT_OUTCOME", evidence_receipt_ids: [], predictive_basis: null, decision_boundary: null,
  }), /nonnumeric ADVANCING requires current and best evidence/);
  assert.throws(() => appendProgress("supporting-only", {
    ...base.current_evidence, evidence_role: "SUPPORTING_ONLY", evidence_receipt_ids: [validReceiptId], predictive_basis: null, decision_boundary: null,
  }), /nonnumeric ADVANCING requires current and best evidence/);
  assert.doesNotThrow(() => appendProgress("valid-direct-outcome", {
    ...base.current_evidence, evidence_role: "DIRECT_OUTCOME", evidence_receipt_ids: [validReceiptId], predictive_basis: null, decision_boundary: null,
  }));
  assert.throws(() => eventSchema.parse({ ...base, current_evidence: {
    ...base.current_evidence, evidence_role: "VALIDATED_LEADING_INDICATOR", predictive_basis: null, decision_boundary: null,
  } }), /validated leading indicator requires/i);

  const billingReceipt = store.workerEvents("billing").find((event) => event.data.type === "evidence_receipt_recorded")!.data;
  assert.equal(billingReceipt.type, "evidence_receipt_recorded");
  assert.throws(() => appendProgress("cross-worker", {
    ...base.current_evidence, evidence_role: "DIRECT_OUTCOME", evidence_receipt_ids: [billingReceipt.receipt_id], predictive_basis: null, decision_boundary: null,
  }), /belongs to another worker/);

  for (const [suffix, receiptState, expected] of [
    ["stale", { freshness: "STALE" as const, verified: true, independence: "INDEPENDENT" as const, evidence_class: "TEST" as const }, /verified, CURRENT, and INDEPENDENT/],
    ["unverified", { freshness: "CURRENT" as const, verified: false, independence: "INDEPENDENT" as const, evidence_class: "TEST" as const }, /verified, CURRENT, and INDEPENDENT/],
    ["worker-reported", { freshness: "CURRENT" as const, verified: true, independence: "WORKER_REPORTED" as const, evidence_class: "TEST" as const }, /verified, CURRENT, and INDEPENDENT/],
    ["activity", { freshness: "CURRENT" as const, verified: true, independence: "INDEPENDENT" as const, evidence_class: "COMMAND" as const }, /worker activity or supporting change evidence/],
  ] as const) {
    const receiptId = `evidence:auth:${suffix}-qualitative`;
    store.append({
      schema_version: 2,
      event_id: `evidence:auth:${suffix}-qualitative:event`,
      mission_id: "mission-control-demo",
      occurred_at: "2026-08-30T20:06:30.000Z",
      data: {
        type: "evidence_receipt_recorded", worker: "auth", receipt_id: receiptId,
        producer_id: `verifier:auth:${suffix}`, producer_role: "VERIFIER", evidence_class: receiptState.evidence_class,
        independence: receiptState.independence, freshness: receiptState.freshness, exact_candidate_sha256: sha256(`auth-${suffix}-candidate`),
        summary: `Hostile ${suffix} qualitative evidence fixture.`, refs: [`fixture:${suffix}`], verified: receiptState.verified,
        changed_path_manifest: null,
      },
    });
    assert.throws(() => appendProgress(suffix, {
      ...base.current_evidence, evidence_role: "DIRECT_OUTCOME", evidence_receipt_ids: [receiptId], predictive_basis: null, decision_boundary: null,
    }), expected);
  }
  store.close();

  const auth = demoWorker("auth");
  assert.equal(auth.overallTraffic, "GREEN");
  assert.match(auth.progress.latestEvidence, /Independent auth characterization verification passed/);
  assert.match(auth.progress.bestEvidence, /Best current validated owner-outcome indicator/);
  assert.equal(auth.ownerOutcome.requiredOutcomes[0].status, "UNMET");
  assert.match(auth.ownerOutcome.currentGap, /Finish the bounded guard extraction/);
  assert.equal(auth.progress.supportingWork[0].classification, "ENABLEMENT_PROGRESS");
});

test("every owner-action-bearing event rejects missing and cross-worker source provenance", () => {
  const store = new EventStore(":memory:");
  seedStore(store);
  const samples = [
    store.workerEvents("auth").findLast((event) => event.data.type === "supervisor_assessment_recorded")!.data,
    store.workerEvents("auth").findLast((event) => event.data.type === "outcome_progress_recorded")!.data,
    store.workerEvents("tests").findLast((event) => event.data.type === "finding_recorded")!.data,
    store.workerEvents("tests").findLast((event) => event.data.type === "correction_lifecycle_recorded")!.data,
  ];
  assert.equal(samples.length, 4);
  for (const [index, data] of samples.entries()) {
    assert.ok("owner_action" in data);
    if (!("owner_action" in data)) continue;
    assert.throws(() => store.append({
      schema_version: 2, event_id: `owner-action:missing:${index}`, mission_id: "mission-control-demo",
      occurred_at: `2026-08-30T20:1${index}:00.000Z`,
      data: { ...data, owner_action: { ...data.owner_action, source_event_ids: ["event:does-not-exist"] } },
    }), /same worker ledger/);
    assert.throws(() => store.append({
      schema_version: 2, event_id: `owner-action:cross-worker:${index}`, mission_id: "mission-control-demo",
      occurred_at: `2026-08-30T20:2${index}:00.000Z`,
      data: { ...data, owner_action: { ...data.owner_action, source_event_ids: ["demo:billing:base:1"] } },
    }), /same worker ledger/);
  }
  store.close();
});

test("attention and healthy card variants render the complete progress and execution-supervision state", () => {
  const originalDateNow = Date.now;
  Date.now = () => new Date("2026-08-31T00:00:00.000Z").getTime();
  try {
    const sentinelWorker = (workerId: string, prefix: string, outcomeAdvancement: string, strategyEfficacy: string, pendingReasoningReview: boolean) => {
      const worker = structuredClone(demoWorker(workerId));
      worker.ownerOutcome.currentGap = `${prefix}-owner-gap`;
      worker.progress.outcomeAdvancement = outcomeAdvancement;
      worker.progress.strategyId = `${prefix}-strategy-id`;
      worker.progress.strategyEfficacy = strategyEfficacy;
      worker.progress.targetEvidence = `${prefix}-owner-target`;
      worker.progress.latestEvidence = `${prefix}-latest-evidence`;
      worker.progress.bestEvidence = `${prefix}-best-evidence`;
      worker.progress.supportingWork = [{ classification: "ENABLEMENT_PROGRESS", summary: `${prefix}-supporting-work` }];
      worker.progress.nextDecisionTrigger = `${prefix}-next-measurement`;
      worker.progress.requiredIntervention = `${prefix}-required-intervention`;
      worker.executionSupervision.surface = `${prefix}-reasoning-surface`;
      worker.executionSupervision.sessionId = `${prefix}-reasoning-session`;
      worker.executionSupervision.chatEpoch = `${prefix}-chat-epoch`;
      worker.executionSupervision.lastReviewAt = "2026-08-30T23:00:00.000Z";
      worker.executionSupervision.reviewFreshness = `${prefix}-review-freshness`;
      worker.executionSupervision.activeDirectiveId = `${prefix}-directive-id`;
      worker.executionSupervision.directiveStatus = `${prefix}-directive-status`;
      worker.executionSupervision.directiveObjective = `${prefix}-directive-objective`;
      worker.executionSupervision.codexExecutionState = `${prefix}_codex_state`;
      worker.executionSupervision.stopBoundary = [`${prefix}-stop-boundary-a`, `${prefix}-stop-boundary-b`];
      worker.executionSupervision.latestReceiptId = `${prefix}-receipt-id`;
      worker.executionSupervision.receiptClaim = `${prefix}-receipt-claim`;
      worker.executionSupervision.pendingReasoningReview = pendingReasoningReview;
      worker.executionSupervision.proEscalationState = `${prefix}_pro_state`;
      worker.correction.ownerActionType = "NONE";
      worker.correction.ownerActionText = `${prefix}-owner-action`;
      worker.correction.nextReviewTrigger = `${prefix}-next-review`;
      return worker;
    };

    const variants = [
      {
        name: "attention",
        prefix: "sentinel-attention",
        worker: sentinelWorker("tests", "sentinel-attention", "REGRESSING", "FAILED", true),
        Card: AttentionCard,
        planeFragments: [
          "<span>Outcome progress</span>",
          ">REGRESSING</strong>",
          '<div><span>Strategy</span><strong class="bad">FAILED</strong></div>',
        ],
        pendingReviewText: "PENDING",
      },
      {
        name: "healthy",
        prefix: "sentinel-healthy",
        worker: sentinelWorker("auth", "sentinel-healthy", "ADVANCING", "EFFECTIVE", false),
        Card: HealthyCard,
        planeFragments: [
          "<span>Outcome <strong>ADVANCING</strong></span>",
          "<span>Strategy <strong>EFFECTIVE</strong></span>",
        ],
        pendingReviewText: "sentinel-healthy-review-freshness",
      },
    ] as const;

    for (const { name, prefix, worker, Card, planeFragments, pendingReviewText } of variants) {
      const html = renderToStaticMarkup(createElement(Card, { worker }));
      for (const fragment of planeFragments) {
        assert.ok(html.includes(fragment), `${name} card must render its exact outcome/strategy value fragment: ${fragment}`);
      }
      const facts = [
        ["Owner outcome target", `${prefix}-owner-target`],
        ["Owner outcome gap", `${prefix}-owner-gap`],
        ["Latest direct evidence", `${prefix}-latest-evidence`],
        ["Best direct evidence", `${prefix}-best-evidence`],
        ["Active strategy", `${prefix}-strategy-id · ${worker.progress.strategyEfficacy}`],
        ["Supporting work", `ENABLEMENT PROGRESS: ${prefix}-supporting-work`],
        ["Next decision-changing measurement / intervention", `${prefix}-next-measurement · ${prefix}-required-intervention`],
        ["Reasoning review", `${prefix}-reasoning-surface · session ${prefix}-reasoning-session · chat ${prefix}-chat-epoch · reviewed 1h ago · ${prefix}-review-freshness`],
        ["Active directive", `${prefix}-directive-id · ${prefix}-directive-status · ${prefix}-directive-objective`],
        ["Codex execution", `${prefix} codex state`],
        ["Review / auto-continuation boundary", `Boundary: ${prefix}-stop-boundary-a; ${prefix}-stop-boundary-b · Review: ${prefix}-next-measurement`],
        ["Execution receipt / claim", `${prefix}-receipt-id · ${prefix}-receipt-claim · independent review ${pendingReviewText}`],
        ["Pro escalation", `${prefix} pro state`],
        ["Owner action", `NONE · ${prefix}-owner-action`],
        ["Next review", `${prefix}-next-review`],
      ] as const;
      for (const [label, value] of facts) {
        const fragment = `<div><span>${label}</span><p>${value}</p></div>`;
        assert.ok(html.includes(fragment), `${name} card must render the deletion-sensitive ${label} sentinel`);
      }
    }
  } finally {
    Date.now = originalDateNow;
  }
});

test("a GREEN-base owner decision enters attention and retains the full Pro choice packet", () => {
  const events = cloneEvents(workerEvents("auth"));
  const decision = {
    kind: "DECISION_REQUIRED" as const, exact_text: "Choose the auth rollout boundary.", reason_code: "OWNER.AUTH_ROLLOUT",
    subject_id: "auth:rollout", blocking_scope: ["auth rollout"], source_event_ids: [events.at(-1)!.eventId],
    due_at: null, escalation_at: null, status: "OPEN" as const, decision_id: "decision:auth:rollout",
    decision_question: "Should rollout remain canary-only or expand now?", decision_context: "Both approaches preserve the contract but carry different operational risk.",
    options: [
      { option_id: "option:canary", label: "Canary only", benefits: ["Limits blast radius"], drawbacks: ["Delays full adoption"], downstream_consequences: ["Only canary traffic changes"] },
      { option_id: "option:expand", label: "Expand now", benefits: ["Completes rollout sooner"], drawbacks: ["Increases live risk"], downstream_consequences: ["All auth traffic changes"] },
    ],
    recommendation_option_id: "option:canary", recommendation_reasoning: "Canary preserves reversibility while exact live evidence accumulates.",
    pro_analysis_ref: "pro:auth-rollout:turn-2", default_if_no_decision: "Hold at canary-only rollout.",
  };
  const progress = events.findLast((event) => event.data.type === "outcome_progress_recorded")!.data;
  assert.equal(progress.type, "outcome_progress_recorded");
  pushV2(events, "outcome-progress:auth:owner-decision", {
    ...progress, progress_receipt_id: "outcome-progress:auth:owner-decision", owner_action: decision,
  }, "2026-08-30T20:06:00.000Z");
  const worker = projectWorker(events);
  assert.equal(worker.correction.ownerActionType, "DECISION_REQUIRED");
  assert.equal(worker.overallTraffic, "YELLOW");
  assert.ok(attentionPriority(worker) < 90);
  assert.equal(worker.correction.ownerAction.kind === "DECISION_REQUIRED" && worker.correction.ownerAction.options.length, 2);
  assert.equal(worker.correction.ownerAction.kind === "DECISION_REQUIRED" && worker.correction.ownerAction.default_if_no_decision, "Hold at canary-only rollout.");
});

test("progress, strategy, directive, receipt, and producer identity survive a daemon-store restart", () => {
  withTempDatabase((filename) => {
    const first = new EventStore(filename);
    seedStore(first);
    const count = first.count();
    first.close();
    const reopened = new EventStore(filename);
    const article = projectWorker(reopened.workerEvents("article-humanization"));
    assert.equal(reopened.count(), count);
    assert.deepEqual(reopened.verifyChain(), { valid: true, errors: [] });
    assert.equal(article.progress.outcomeAdvancement, "REGRESSING");
    assert.equal(article.progress.strategyEfficacy, "REPLACEMENT_REQUIRED");
    assert.equal(article.executionSupervision.activeDirectiveId, "execution-directive:article-humanization:1");
    assert.equal(article.executionSupervision.latestReceiptId, "execution-receipt:article-humanization:1");
    assert.ok(reopened.allEvents().every((event) => event.producerId && event.producerKind));
    reopened.close();
  });
});

test("a file-backed Mission Control database permits only one EventStore writer", () => {
  withTempDatabase((filename) => {
    const first = new EventStore(filename);
    assert.throws(() => new EventStore(filename), WriterLockError);
    first.close();
    const successor = new EventStore(filename);
    successor.close();
  });
});

test("Symphony adapter observes running, retrying, and blocked arrays without control semantics", () => {
  const result = adaptSymphonyState(symphonyFixture, "2026-08-30T12:00:01Z", (identifier) => identifier.toLowerCase());
  assert.deepEqual(result.observations.map((event) => event.kind), ["running", "retrying", "blocked"]);
  assert.equal(result.observations[0].source.upstream_commit, SYMPHONY_UPSTREAM_COMMIT);
  assert.equal(result.observations[0].tracker_state, "In Progress");
  assert.equal(result.observations[1].tracker_state, null);
  assert.deepEqual(result.diagnostics, []);
});

test("Symphony array lengths, not declared counts, drive observations and emit diagnostics", () => {
  const input = structuredClone(symphonyFixture);
  input.counts.running = 99;
  const result = adaptSymphonyState(input, "2026-08-30T12:00:01Z", () => "symphony-worker");
  assert.equal(result.observations.filter((event) => event.kind === "running").length, 1);
  assert.deepEqual(result.diagnostics, ["SYMPHONY_COUNT_MISMATCH:running:declared=99:observed=1"]);
  assert.throws(() => adaptSymphonyState({ error: "not a state response" }, "2026-08-30T12:00:01Z", () => "worker"));
});

test("an unmapped Symphony input produces a durable diagnostic with no control semantics", () => {
  const result = adaptSymphonyState(symphonyFixture, "2026-08-30T12:00:01Z", () => null);
  const store = new EventStore(":memory:");
  assert.equal(result.observations.length, 0);
  assert.equal(result.diagnosticEvents.length, 3);
  assert.ok(result.diagnostics.every((diagnostic) => diagnostic.startsWith("SYMPHONY_WORKER_UNMAPPED:")));
  const stored = store.append({
    schema_version: 2,
    event_id: "symphony:unmapped:diagnostic:1",
    mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T12:00:01.000Z",
    data: result.diagnosticEvents[0],
  });
  assert.equal(stored.type, "symphony_adapter_diagnostic_recorded");
  assert.equal(stored.data.type === "symphony_adapter_diagnostic_recorded" && stored.data.control_semantics, false);
  seedStore(store);
  assert.equal(projectWorkers(store.allEvents()).length, 6);
  assert.equal(projectWorkers(store.allEvents()).some((worker) => worker.id === "symphony-adapter"), false);
  store.close();
});

test("Next route handlers proxy the daemon and never import the SQLite store", () => {
  const routes = [
    "app/api/events/route.ts", "app/api/events/stream/route.ts", "app/api/viewed/route.ts",
    "app/api/workers/route.ts", "app/api/workers/[worker]/route.ts", "app/api/workers/[worker]/supervisor-chat/route.ts",
  ];
  for (const route of routes) {
    const source = fs.readFileSync(path.join(appRoot, route), "utf8");
    assert.doesNotMatch(source, /(?:@\/lib|\.\.\/.*\/lib)\/store/);
    assert.match(source, /daemon-client/);
  }
  const stream = fs.readFileSync(path.join(appRoot, "app/api/events/stream/route.ts"), "utf8");
  assert.doesNotMatch(stream, /setInterval|eventsAfter|750/);
});

test("demo seed is idempotent and mark-viewed is an append-only event", () => {
  const store = new EventStore(":memory:");
  assert.equal(seedStore(store), true);
  const before = store.count();
  assert.equal(seedStore(store), false);
  assert.equal(store.count(), before);
  const viewed = store.markViewed();
  assert.equal(viewed.lastViewedEventId, before);
  assert.equal(store.count(), before + 1);
  assert.equal(store.allEvents().at(-1)?.type, "review_marked");
  store.close();
});

test("mark-viewed summaries consider only later append-only events", () => {
  const store = new EventStore(":memory:");
  seedStore(store);
  store.markViewed();
  assert.equal(summarizeChanges(store.allEvents(), store.lastViewedEventId()), "No new worker or supervisor events since your last review.");
  const authSourceEventId = store.workerEvents("auth").at(-1)!.eventId;
  store.append({
    schema_version: 2,
    event_id: "evidence:auth:new:event",
    mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:09:00.000Z",
    data: {
      type: "evidence_receipt_recorded", worker: "auth", receipt_id: "evidence:auth:new",
      producer_id: "collector:auth", producer_role: "COLLECTOR", evidence_class: "SEMANTIC_REVIEW",
      independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: sha256("auth:new-candidate"),
      summary: "The prior auth verification evidence is stale.", refs: ["auth-verification:v1"], verified: true,
      changed_path_manifest: null,
    },
  });
  store.append({
    schema_version: 2,
    event_id: "finding:auth:new",
    mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:10:00.000Z",
    data: {
      type: "finding_recorded", worker: "auth", finding_id: "finding-auth-new", principal_group_id: "finding-group-auth-new",
      finding_type: "EVIDENCE_STALE", severity: "MATERIAL", statement: "Auth evidence is stale.",
      violated_requirement: "Current evidence is required.", evidence_refs: ["auth-verification:v1"], evidence_receipt_ids: ["evidence:auth:new"],
      reason_codes: ["EVIDENCE.STALE"], status: "OPEN",
      required_response: "Rerun the focused auth verification.",
      owner_action: { ...testOwnerAction("finding-auth-new"), source_event_ids: [authSourceEventId] },
      continuation_policy: testContinuation("finding-auth-new"),
    },
  });
  assert.match(summarizeChanges(store.allEvents(), store.lastViewedEventId(), new Date("2026-08-30T20:11:00.000Z")), /Auth refactor/);
  store.close();
});

function demoWorker(worker: string) {
  return projectWorker(workerEvents(worker), new Date("2026-08-30T20:05:00.000Z"));
}

function workerEvents(worker: string): StoredEvent[] {
  return demoEvents.filter((event) => event.worker === worker);
}

function sourceEnvelope(eventId: string, worker = "alpha") {
  const hash = "a".repeat(64);
  return {
    schema_version: 2 as const,
    event_id: eventId,
    mission_id: "test-mission",
    occurred_at: "2026-08-30T10:00:00.000Z",
    data: {
      type: "owner_source_recorded" as const,
      worker,
      receipt_id: `receipt:${worker}:1`,
      owner_request_id: `owner-request:${worker}`,
      canonical_locator: `fixture://${worker}`,
      source_sha256: hash,
      worker_copy_sha256: hash,
      capture_integrity: "VERIFIED" as const,
      acquisition_mode: "INDEPENDENT_READER_DIRECT" as const,
      receipt_capability: "INDEPENDENT_SOURCE_VERIFIED" as const,
      comparison: "MATCH" as const,
      freshness: "CURRENT" as const,
      limitations: [] as string[],
    },
  };
}

function outcomeEnvelope(worker: string) {
  return {
    schema_version: 2 as const,
    event_id: `outcome:${worker}:1`,
    mission_id: "test-mission",
    occurred_at: "2026-08-30T10:01:00.000Z",
    data: {
      type: "owner_outcome_recorded" as const,
      worker,
      owner_outcome_id: `outcome:${worker}`,
      owner_request_id: `owner-request:${worker}`,
      epoch: 1,
      owner_outcome_sha256: "b".repeat(64),
      source_receipt_id: `receipt:${worker}:1`,
      owner_source_sha256: "a".repeat(64),
      verbatim_owner_request: ["Do the exact bounded task."],
      normalized_result: "The exact bounded task is complete.",
      required_outcomes: [{ id: `required:${worker}`, text: "Complete it.", terminal_required: true, status: "UNMET" as const, direct_evidence_receipt_ids: [] }],
      non_satisfying_proxies: ["tests pass"],
      current_gap: "Complete it.",
      gap_status: "OPEN" as const,
      supersedes: null,
      supersedes_outcome_sha256: null,
    },
  };
}

function legacyObjective() {
  return {
    type: "objective_created" as const,
    worker: "alpha",
    worker_name: "Alpha worker",
    goal: "Implement one bounded change",
    acceptance_criteria: ["Tests pass"],
    allowed_scope: ["src/alpha/**"],
    forbidden_scope: ["src/core/**"],
    expected_max_diff_lines: 100,
    supervisor_chat_url: "https://chatgpt.com/c/replace-alpha-supervisor",
    supervisor_chat_label: "Open Alpha Pro supervisor",
  };
}

function legacyStoredEvents(): StoredEvent[] {
  return [
    legacyStoredEvent(1, legacyObjective()),
    legacyStoredEvent(2, {
      type: "worker_heartbeat", worker: "alpha", objective: "Implement one bounded change", status: "working",
      current_step: "Writing the bounded change", completed_steps: [], next_steps: ["Run tests"], files_touched: ["src/alpha/change.ts"],
      tests: { passing: 4, failing: 0, lint: "passing", build: "passing" }, plan_changed: false, plan_change_reason: null,
      blocker: null, assumptions: [], assumptions_materially_changed: false, diff_lines: 40, repeated_failure_count: 0,
      architecture_rewrite: false, architecture_rewrite_explained: false, destructive_action: false,
      touched_other_worker_area: false, major_contract_violation: false,
    }),
  ];
}

function legacyStoredEvent(sequence: number, data: StoredEvent["data"]): StoredEvent {
  return {
    id: sequence, sequence, eventId: `legacy-v1:${sequence}`, schemaVersion: 1, missionId: "legacy-default", worker: "alpha",
    type: data.type, occurredAt: `2026-08-30T10:0${sequence - 1}:00.000Z`, receivedAt: `2026-08-30T10:0${sequence - 1}:00.000Z`,
    previousHash: sequence === 1 ? null : `hash-${sequence - 1}`, eventHash: `hash-${sequence}`, data,
    producerId: "legacy:migration", producerKind: "SYSTEM",
  };
}

function appendInvalidationOnlyClosure(store: EventStore) {
  const events = store.workerEvents("auth");
  const contract = events.findLast((event) => event.data.type === "task_contract_recorded")!.data;
  const outcome = events.findLast((event) => event.data.type === "owner_outcome_recorded")!.data;
  const checkpoint = events.findLast((event) => event.data.type === "worker_checkpoint_recorded")!.data;
  const assessment = events.findLast((event) => event.data.type === "supervisor_assessment_recorded")!.data;
  assert.equal(contract.type, "task_contract_recorded");
  assert.equal(outcome.type, "owner_outcome_recorded");
  assert.equal(checkpoint.type, "worker_checkpoint_recorded");
  assert.equal(assessment.type, "supervisor_assessment_recorded");
  const evidence = store.append({
    schema_version: 2, event_id: "evidence:auth:invalidation-basis", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:05:59.000Z", data: {
      type: "evidence_receipt_recorded", worker: "auth", receipt_id: "evidence:auth:invalidation-basis",
      producer_id: "verifier:auth:invalidation-basis", producer_role: "VERIFIER", evidence_class: "SEMANTIC_REVIEW",
      independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: null,
      summary: "Initial evidence raised a proposition that requires an independent applicability check.", refs: [], verified: true,
      claim_kind: "GENERAL", supports_finding_id: null, proposition_sha256: null, changed_path_manifest: null,
    },
  }).data;
  assert.equal(evidence.type, "evidence_receipt_recorded");
  const findingId = "finding:auth:invalidated-only";
  const continuationPolicy = { ...assessment.continuation_policy, basis_finding_ids: [findingId] };
  store.append({
    schema_version: 2, event_id: "finding:auth:invalidated-only:event", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:00.000Z", data: {
      type: "finding_recorded", worker: "auth", finding_id: findingId, principal_group_id: "group:auth:invalidated-only",
      finding_type: "EVIDENCE_MISSING", severity: "MATERIAL", statement: "A candidate evidence gap requires checking.",
      violated_requirement: "Root claims require current exact evidence.", evidence_refs: [evidence.receipt_id],
      evidence_receipt_ids: [evidence.receipt_id], reason_codes: ["EVIDENCE.MISSING"], status: "OPEN",
      required_response: "Check whether the evidence requirement applies.", owner_action: assessment.owner_action,
      continuation_policy: continuationPolicy,
    },
  });
  const directive = "Check the evidence requirement.";
  const prepared = {
    ...correctionData("DIRECTIVE_PREPARED"), worker: "auth", correction_attempt_id: "attempt:auth:invalidation-only",
    directive_id: "directive:auth:invalidation-only", directive_digest: sha256(directive), directive,
    finding_ids: [findingId], task_id: "task:auth", worker_run_id: checkpoint.worker_run_id,
    contract_id: contract.contract_id, contract_sha256: contract.task_contract_sha256,
    owner_outcome_id: outcome.owner_outcome_id, owner_outcome_epoch: outcome.epoch,
    owner_outcome_sha256: outcome.owner_outcome_sha256, target_id: checkpoint.worker_run_id,
    producer_id: "supervisor:auth", actor_id: "supervisor:auth", actor_role: "SUPERVISOR" as const,
    owner_action: assessment.owner_action, continuation_policy: continuationPolicy,
  };
  const preparedEvent = store.append({
    schema_version: 2, event_id: "correction:auth:invalidation-only:prepared", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:01.000Z", data: prepared,
  });
  const withdrawnEvent = store.append({
    schema_version: 2, event_id: "correction:auth:invalidation-only:withdrawn", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:02.000Z", data: {
      ...prepared, status: "DIRECTIVE_WITHDRAWN" as const, expected_predecessor_event_id: preparedEvent.eventId,
      causation_event_id: preparedEvent.eventId, exception_reason: "Independent evidence showed that the finding proposition was false.",
    },
  });
  const propositionSha256 = sha256("The auth candidate lacks the required exact evidence.");
  const invalidationEvidence = store.append({
    schema_version: 2, event_id: "evidence:auth:invalidation-only", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:03.000Z", data: {
      ...evidence, receipt_id: "evidence:auth:invalidation-only", producer_id: "verifier:auth:invalidation-only",
      producer_role: "VERIFIER" as const, evidence_class: "SEMANTIC_REVIEW" as const,
      independence: "INDEPENDENT" as const, freshness: "CURRENT" as const, verified: true,
      claim_kind: "FINDING_INVALIDATION" as const, supports_finding_id: findingId, proposition_sha256: propositionSha256,
      changed_path_manifest: null, summary: "Independent review falsified the exact evidence-gap proposition.",
    },
  });
  const invalidated = store.append({
    schema_version: 2, event_id: "finding:auth:invalidation-only:invalidated", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:04.000Z", data: {
      type: "finding_status_changed", worker: "auth", finding_id: findingId, from_status: "OPEN", status: "INVALIDATED",
      reason: "Independent evidence falsified the exact finding proposition.", reason_code: "FINDING.INVALIDATED",
      basis_event_ids: [invalidationEvidence.eventId, withdrawnEvent.eventId], actor_id: "verifier:auth:invalidation-only",
      actor_role: "VERIFIER", exact_candidate_sha256: null, contract_sha256: contract.task_contract_sha256,
      owner_outcome_id: outcome.owner_outcome_id, owner_outcome_epoch: outcome.epoch,
      owner_outcome_sha256: outcome.owner_outcome_sha256, invalidation_evidence_receipt_ids: ["evidence:auth:invalidation-only"],
      invalidation_proposition_sha256: propositionSha256, invalidator_method_version: "verifier-method:auth:1",
      affected_directive_event_ids: [withdrawnEvent.eventId],
    },
  });
  store.append({
    schema_version: 2, event_id: "correction:auth:invalidation-only:resolved", mission_id: "mission-control-demo",
    occurred_at: "2026-08-30T20:06:05.000Z", data: {
      ...prepared, status: "CORRECTION_RESOLVED" as const, expected_predecessor_event_id: withdrawnEvent.eventId,
      causation_event_id: invalidated.eventId, closure_basis: "FINDING_INVALIDATED" as const,
    },
  });
}

function correctionData(
  status: Extract<MissionControlEventV2, { type: "correction_lifecycle_recorded" }>["status"],
  receipts: string[] = [],
  expectedPredecessorEventId: string | null = null,
): Extract<MissionControlEventV2, { type: "correction_lifecycle_recorded" }> {
  const directive = "Stop and revert.";
  const directiveDigest = sha256(directive);
  return {
    type: "correction_lifecycle_recorded", worker: "tests", correction_attempt_id: "attempt:tests:1",
    directive_id: "directive:tests", directive_digest: directiveDigest, directive_kind: "WORKER_REDIRECT",
    finding_ids: ["finding:tests"], task_id: "task:tests", worker_run_id: "run:tests", assignment_epoch: 1,
    contract_id: "contract:tests", contract_sha256: sha256("contract-fixture"), owner_outcome_id: "outcome:tests",
    owner_outcome_epoch: 1, owner_outcome_sha256: sha256("outcome-fixture"), target_kind: "WORKER_RUN", target_id: "run:tests", target_epoch: 1,
    status, directive, producer_id: "supervisor:tests", actor_id: status === "CORRECTION_STARTED" ? "worker:tests" : "supervisor:tests",
    actor_role: status === "CORRECTION_STARTED" ? "WORKER" : "SUPERVISOR", causation_event_id: expectedPredecessorEventId,
    correlation_id: "correlation:tests:1", expected_predecessor_event_id: expectedPredecessorEventId,
    required_evidence: ["clean diff"], evidence_receipt_ids: receipts,
    verified_candidate_sha256: receipts.length ? sha256("candidate-fixture") : null,
    evidence_set_id: receipts.length ? "evidence-set:1" : null,
    evidence_requirement_schema_sha256: sha256("requirements-fixture"),
    verification_policy_id: null, verification_policy_sha256: null, verifier_id: null, verifier_role: null, verifier_method_version: null,
    verification_manifest: [], verification_validity_scope: null,
    delivery_receipt: status === "DIRECTIVE_DELIVERED" ? {
      receipt_id: "delivery:tests:1", destination: "worker-run:tests", transport: "test-transport",
      receiver_generated: true, directive_digest: directiveDigest,
    } : null,
    acknowledged_directive_id: status === "DIRECTIVE_ACKNOWLEDGED" ? "directive:tests" : null,
    acknowledged_directive_digest: status === "DIRECTIVE_ACKNOWLEDGED" ? directiveDigest : null,
    first_corrective_action: status === "CORRECTION_STARTED" ? "Reverting production changes" : null,
    activity_lease_expires_at: status === "CORRECTION_STARTED" ? "2099-01-01T00:00:00.000Z" : null,
    superseded_by_directive_id: null, exception_reason: null, blocker_actor_id: null, escalation_trigger: null, retry_possible: null,
    closure_basis: null,
    next_review_trigger: "after evidence", owner_action: testOwnerAction("directive:tests"),
    continuation_policy: testContinuation("finding:tests"),
  };
}

function fixtureCorrectionStatus(status: string): Extract<MissionControlEventV2, { type: "correction_lifecycle_recorded" }>["status"] {
  const aliases: Record<string, Extract<MissionControlEventV2, { type: "correction_lifecycle_recorded" }>["status"]> = {
    REDIRECT_DELIVERED: "DIRECTIVE_DELIVERED",
    REDIRECT_ACKNOWLEDGED: "DIRECTIVE_ACKNOWLEDGED",
    REDIRECT_RESOLVED: "CORRECTION_RESOLVED",
    CORRECTION_EVIDENCE_SUBMITTED: "CORRECTION_EVIDENCE_SUBMITTED",
    CORRECTION_VERIFIED: "CORRECTION_VERIFIED",
  };
  const mapped = aliases[status];
  if (!mapped) throw new Error(`Unknown fixture correction status ${status}`);
  return mapped;
}

function testOwnerAction(subjectId: string): Extract<MissionControlEventV2, { type: "finding_recorded" }>["owner_action"] {
  return {
    kind: "NONE", exact_text: "No owner action.", reason_code: "OWNER.NOT_REQUIRED.TEST",
    subject_id: subjectId, blocking_scope: [], source_event_ids: ["event:test:source"], due_at: null,
    escalation_at: null, status: "NOT_REQUIRED", none_reason_code: "SUPERVISOR_OWNS_NEXT_TRANSITION",
    next_actor_kind: "SUPERVISOR", next_actor_id: "supervisor:test", next_action: "Review correction evidence",
    next_trigger: "after evidence", next_due_at: "2099-01-01T00:00:00.000Z",
    escalation_policy: "Escalate if overdue or telemetry is incomplete.",
  };
}

function testContinuation(findingId: string): Extract<MissionControlEventV2, { type: "finding_recorded" }>["continuation_policy"] {
  return {
    mode: "SAFE_WITHIN_SCOPE", allowed_scope: ["tests/**"], forbidden_scope: ["src/**"],
    preconditions: ["Stop forbidden work"], basis_finding_ids: [findingId], basis_evidence_ids: [],
    expires_at: "2099-01-01T00:00:00.000Z", recheck_trigger: "scope change",
  };
}

function cloneEvents(events: StoredEvent[]): StoredEvent[] {
  return structuredClone(events);
}

function pushV2(
  events: StoredEvent[],
  eventId: string,
  data: MissionControlEventV2,
  occurredAt: string,
) {
  const sequence = (events.at(-1)?.sequence ?? 0) + 1;
  events.push({
    id: sequence,
    sequence,
    eventId,
    schemaVersion: 2,
    missionId: "mission-control-demo",
    worker: data.worker,
    type: data.type,
    occurredAt,
    receivedAt: occurredAt,
    previousHash: events.at(-1)?.eventHash ?? null,
    eventHash: sha256(`${eventId}:${sequence}`),
    producerId: `test:${data.worker ?? "system"}`,
    producerKind: "SYSTEM",
    data,
  });
}

function scopedProducer(id: string, kind: "COLLECTOR" | "VERIFIER" | "WORKER", worker: string) {
  return { id, kind, workerScopes: [worker], taskScopes: [`task:${worker}`] };
}

function replaceLatest<T extends MissionControlEventV2["type"]>(
  events: StoredEvent[],
  type: T,
  replace: (data: Extract<MissionControlEventV2, { type: T }>) => Extract<MissionControlEventV2, { type: T }>,
) {
  const index = events.findLastIndex((event) => event.data.type === type);
  assert.notEqual(index, -1);
  const data = events[index].data as Extract<MissionControlEventV2, { type: T }>;
  events[index] = { ...events[index], data: replace(data) };
}

function withTempDatabase(run: (filename: string) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-test-"));
  try {
    run(path.join(directory, "mission-control.db"));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
