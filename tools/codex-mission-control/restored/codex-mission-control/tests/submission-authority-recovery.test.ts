import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalJson, sha256 } from "../lib/canonical";
import { EventStore } from "../lib/store";
import {
  MissionControlSubmissionStateStore,
  SubmissionAuthorityRuntime,
  type SubmissionRecoveryDecision,
} from "../lib/submission-authority-runtime";
import {
  normalizeSchedulerState,
  parsePrecompositionRecoveryPermit,
  PRECOMPOSITION_RECOVERED,
  recoveryPermitScopeSha256,
  recoverySha256,
} from "../lib/provider-submission-authority.mjs";

const origin = Date.parse("2026-09-13T21:16:00.000Z");
const producer = { id: "collector:primary", kind: "COLLECTOR" as const, workerScopes: ["worker-test"], taskScopes: ["task:worker-test"] };
const domain = "chatgpt:test-account";

// Unit fixture for transaction-snapshot races; real SQLite integration follows.
class RecoveryStore {
  state: any = null;
  records: any[] = [];
  inTransaction = false;
  beforeDecision: (() => void) | null = null;
  failAfterAppend = false;
  submissionAuthorityState() { return structuredClone(this.state); }
  submissionAuthorityLedger(_domain: string, limit = 200) { return structuredClone(this.records.slice(-limit)); }
  submissionAuthorityBoundaryLedger() { return structuredClone(this.records.filter((r) => r.eventKind === "BOUNDARY_RECORDED")); }
  verifySubmissionAuthorityLedger() { return { valid: true, errors: [] }; }
  commitSubmissionAuthorityState(pacingDomain: string, state: unknown, ledger: Record<string, unknown>) {
    const payload = { ...ledger, schemaVersion: 1, pacingDomain, recordedAt: "2026-09-13T21:19:00.000Z" };
    const previousHash = this.records.at(-1)?.eventHash ?? null;
    const eventHash = sha256(canonicalJson({ payload, previousHash }));
    const receipt = { sequence: this.records.length + 1, ...payload, previousHash, eventHash };
    this.records.push(receipt);
    this.state = structuredClone(state);
    return receipt;
  }
  transactSubmissionAuthorityRecovery(pacingDomain: string, decide: (snapshot: { state: unknown; ledger: any[] }) => SubmissionRecoveryDecision) {
    assert.equal(this.inTransaction, false);
    this.inTransaction = true;
    this.beforeDecision?.();
    const beforeState = structuredClone(this.state), beforeRecords = structuredClone(this.records);
    try {
      const decision = decide({ state: structuredClone(this.state), ledger: structuredClone(this.records) });
      if ("duplicate" in decision) return decision.duplicate;
      const receipt = this.commitSubmissionAuthorityState(pacingDomain, decision.state, decision.ledger);
      if (this.failAfterAppend) throw new Error("INJECTED_TRANSACTION_FAILURE");
      return receipt;
    } catch (error) {
      this.state = beforeState;
      this.records = beforeRecords;
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }
}

test("recovery digests use the store's canonical JSON, including mixed-case keys", () => {
  const value = { z: 1, A: [{ b: 2, a: null }], a: "test", B: false };
  assert.equal(recoverySha256(value), sha256(canonicalJson(value)));
});

for (const sendPath of ["CAPABILITY", "MCP_PREFLIGHT"]) {
  test(`${sendPath}: exact startup recovery appends evidence, preserves history and requires a fresh ordinary admission`, async () => {
    const f = await fixture(sendPath);
    const before = structuredClone(f.store.state), oldLedger = structuredClone(f.store.records);
    const authority = runtime(f, f.permit);
    await authority.status(producer);
    const recovered = f.store.state.admissions[0];
    assert.equal(recovered.status, PRECOMPOSITION_RECOVERED);
    assert.equal(recovered.abortedAt, null);
    assert.equal(recovered.abortStage, null);
    assert.equal(recovered.deliveryStatus, null);
    assert.equal(f.store.records.length, oldLedger.length + 1);
    assert.deepEqual(f.store.records.slice(0, -1), oldLedger);
    const receipt = f.store.records.at(-1);
    assert.equal(receipt.eventKind, PRECOMPOSITION_RECOVERED);
    assert.equal(receipt.producerId, "operator:startup-recovery");
    assert.equal(receipt.permitSha256, recoverySha256(f.permit));
    assert.deepEqual(receipt.permit, f.permit);
    assert.equal(receipt.priorStateSha256, recoverySha256(before));
    assert.equal(receipt.resultingStateSha256, recoverySha256(f.store.state));
    const expected = structuredClone(before);
    expected.admissions[0] = recovered;
    expected.queueItems[0].status = "PRECLICK_RETRY_PENDING";
    expected.queueItems[0].terminalAt = null;
    assert.deepEqual(f.store.state, expected);
    assert.equal(canonicalJson(normalizeSchedulerState(f.store.state)), canonicalJson(f.store.state));
    const fresh = await authority.execute("admissions", request(sendPath), producer);
    assert.notEqual(fresh.admissionId, recovered.admissionId);
    assert.equal(fresh.queueItemId, recovered.queueItemId);
    assert.deepEqual(f.store.state.admissions[0], recovered);
    for (const [operation, body] of [
      ["aborts", { relayStage: "BEFORE_SUBMIT" }],
      ["admissions/validate", {}],
      ["boundaries", { boundaryAt: new Date(f.now.value).toISOString(), boundaryKind: "CLICKED" }],
      ["provider-rate-limits", {}],
      ["outcomes", { deliveryStatus: "DELIVERED", recoveryStatus: "RECOVERED" }],
    ] as const) {
      await assert.rejects(authority.execute(operation, { ...body, admissionId: recovered.admissionId }, producer));
    }
    for (const operation of ["recoveries", "recover-before-composition", PRECOMPOSITION_RECOVERED]) {
      await assert.rejects(authority.execute(operation, f.permit, producer), code("SUBMISSION_AUTHORITY_OPERATION_UNKNOWN"));
    }
  });
}

test("an identical consumed permit is idempotent after expiry and after later ledger writes", async () => {
  const f = await fixture();
  await runtime(f, f.permit).status(producer);
  f.now.value += 31 * 60_000;
  f.store.commitSubmissionAuthorityState(domain, f.store.state, { eventKind: "STATE_COMMITTED" });
  const state = structuredClone(f.store.state), ledger = structuredClone(f.store.records);
  await runtime(f, f.permit).status(producer);
  assert.deepEqual(f.store.state, state);
  assert.deepEqual(f.store.records, ledger);
  const conflict = authorize({ ...f.permit, issuedAt: new Date(f.now.value).toISOString(), expiresAt: new Date(f.now.value + 60_000).toISOString() });
  await assert.rejects(runtime(f, conflict).status(producer), code("SUBMISSION_RECOVERY_REPLAY_CONFLICT"));
  assert.deepEqual(f.store.records, ledger);
});

test("unused expired permits and a new permit ID cannot use consumed-permit idempotency", async () => {
  const f = await fixture();
  f.now.value = Date.parse(f.permit.expiresAt);
  await unchangedFailure(f, f.permit, "SUBMISSION_RECOVERY_PERMIT_EXPIRED");
  f.now.value -= 1;
  await runtime(f, f.permit).status(producer);
  await unchangedFailure(f, authorize({ ...f.permit, permitId: "operator-recovery:other" }), "SUBMISSION_RECOVERY_LEDGER_HEAD_MISMATCH");
});

test("hash and ledger-head checks run against the snapshot supplied inside the transaction", async () => {
  for (const mutation of ["state", "head"]) {
    const f = await fixture();
    f.store.beforeDecision = () => {
      assert.equal(f.store.inTransaction, true);
      if (mutation === "state") f.store.state.updatedAt = new Date(f.now.value + 1).toISOString();
      else f.store.commitSubmissionAuthorityState(domain, f.store.state, { eventKind: "STATE_COMMITTED" });
    };
    await assert.rejects(runtime(f, f.permit).status(producer), code(mutation === "state"
      ? "SUBMISSION_RECOVERY_STATE_HASH_MISMATCH" : "SUBMISSION_RECOVERY_LEDGER_HEAD_MISMATCH"));
    assert.equal(f.store.records.some((r) => r.eventKind === PRECOMPOSITION_RECOVERED), false);
    assert.equal(f.store.state.admissions[0].status, "AMBIGUOUS_AFTER_RESTART");
  }
});

test("failed transaction leaves no recovery or consumed permit; the same permit can then succeed", async () => {
  const f = await fixture();
  f.store.failAfterAppend = true;
  const state = structuredClone(f.store.state), ledger = structuredClone(f.store.records);
  await assert.rejects(runtime(f, f.permit).status(producer), /INJECTED_TRANSACTION_FAILURE/);
  assert.deepEqual(f.store.state, state);
  assert.deepEqual(f.store.records, ledger);
  f.store.failAfterAppend = false;
  await runtime(f, f.permit).status(producer);
  assert.equal(f.store.records.length, ledger.length + 1);
});

test("normal state writes cannot introduce, edit or remove recovery evidence", async () => {
  const f = await fixture();
  await runtime(f, f.permit).status(producer);
  const writer = new MissionControlSubmissionStateStore(f.store as unknown as EventStore, domain, 60_000);
  const original = structuredClone(f.store.state), ledger = structuredClone(f.store.records);
  for (const change of [
    (s: any) => { s.admissions[0].precompositionRecovery.permit.failureEvidence.failureCode = "CHANGED"; },
    (s: any) => { s.admissions[0].status = "AMBIGUOUS_AFTER_RESTART"; delete s.admissions[0].precompositionRecovery; s.queueItems[0].status = "AMBIGUOUS_AFTER_RESTART"; s.queueItems[0].terminalAt = new Date(f.now.value).toISOString(); },
    (s: any) => { s.admissions = []; s.queueItems = []; },
  ]) {
    const changed = structuredClone(original);
    change(changed);
    await assert.rejects(writer.write(changed));
    assert.deepEqual(f.store.records, ledger);
  }
  const other = await fixture();
  const otherWriter = new MissionControlSubmissionStateStore(other.store as unknown as EventStore, domain, 60_000);
  await assert.rejects(otherWriter.write(original), code("SUBMISSION_RECOVERY_ORDINARY_WRITE_FORBIDDEN"));
});

test("strict permit rejects weakened evidence, authorization, scope and expiry", async () => {
  const f = await fixture();
  const cases: Array<(p: any) => void> = [
    (p) => { p.sendPath = "SUPERVISOR_MESSAGE"; },
    (p) => { p.expectedAdmissionStatus = "ADMITTED"; },
    (p) => { p.expectedQueueStatus = "QUEUED"; },
    (p) => { p.expiresAt = new Date(Date.parse(p.issuedAt) + 30 * 60_000 + 1).toISOString(); },
    (p) => { p.expiresAt = p.issuedAt; },
    (p) => { p.failureEvidence.compositionStarted = true; },
    (p) => { p.failureEvidence.submitInvoked = true; },
    (p) => { p.failureEvidence.boundaryObserved = true; },
    (p) => { p.failureEvidence.kind = "UNKNOWN"; },
    (p) => { p.failureEvidence.retainedArtifactSha256s = []; },
    (p) => { p.failureEvidence.sourceSha256 = "missing"; },
    (p) => { p.failureEvidence.admissionId = "other"; },
    (p) => { p.ownerAuthorization.authorizedBy = "COLLECTOR"; },
    (p) => { p.ownerAuthorization.action = "ALLOW_SEND"; },
    (p) => { p.ownerAuthorization.sourceSha256 = "missing"; },
    (p) => { p.force = true; },
  ];
  for (const mutate of cases) {
    const permit = structuredClone(f.permit);
    mutate(permit);
    const candidate = authorize(permit);
    await unchangedFailure(f, candidate);
  }
  for (const key of ["failureEvidenceSha256", "ownerAuthorizationSha256"]) {
    await unchangedFailure(f, { ...f.permit, [key]: "0".repeat(64) });
  }
  const badScope = structuredClone(f.permit);
  badScope.ownerAuthorization.scopeSha256 = "0".repeat(64);
  badScope.ownerAuthorizationSha256 = recoverySha256(badScope.ownerAuthorization);
  await unchangedFailure(f, badScope);
});

test("reservation, state, request, lease and durable binding must all match", async () => {
  const f = await fixture();
  for (const key of ["expectedStateSha256", "expectedAdmissionSha256", "expectedQueueItemSha256", "requestFingerprint", "logicalFingerprint", "expectedLeaseSha256", "expectedRelayBindingSha256", "bodySha256"]) {
    const changed = { ...f.permit, [key]: "b".repeat(64) };
    await unchangedFailure(f, authorize(changed));
  }
  for (const key of ["permitId", "pacingDomain", "admissionId", "queueItemId", "requestId", "producerId"]) {
    if (key === "permitId") continue; // Unused operator IDs are valid; their exact scope is still required.
    await unchangedFailure(f, authorize({ ...f.permit, [key]: "wrong" }));
  }
  await unchangedFailure(f, authorize({ ...f.permit, expectedLedgerHead: { ...f.permit.expectedLedgerHead, eventHash: "c".repeat(64) } }));
  const future = authorize({ ...f.permit, issuedAt: new Date(f.now.value + 1).toISOString(), expiresAt: new Date(f.now.value + 60_000).toISOString() });
  await unchangedFailure(f, future, "SUBMISSION_RECOVERY_PERMIT_EXPIRED");
  await unchangedFailure(f, f.permit, "SUBMISSION_RECOVERY_LEASE_MISMATCH", { MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON: JSON.stringify({ ...lease(), epoch: 2 }) });
});

test("positive state or ledger boundary evidence, safety halt, another ambiguity and transition block recovery", async () => {
  const changes: Array<(f: Fixture) => void> = [
    (f) => { f.store.state.admissions[0].boundaryAt = new Date(origin + 5_000).toISOString(); },
    (f) => { f.store.state.lastBoundaryAt = new Date(origin + 5_000).toISOString(); },
    (f) => { f.store.state.safetyHalt = { code: "EXISTING_HALT", admissionId: f.permit.admissionId, queueItemId: f.permit.queueItemId, boundaryAt: new Date(origin).toISOString() }; },
    (f) => {
      const admission = structuredClone(f.store.state.admissions[0]), queue = structuredClone(f.store.state.queueItems[0]);
      admission.admissionId = "admission:other"; admission.queueItemId = "queue:other"; admission.sequence = 2;
      queue.queueItemId = "queue:other"; queue.sequence = 2; queue.admissionIds = [admission.admissionId];
      f.store.state.admissions.push(admission); f.store.state.queueItems.push(queue);
      f.store.state.nextSequence = 3; f.store.state.nextQueueSequence = 3;
    },
    (f) => {
      f.store.state.relayTargetTransition = {
        transitionId: "transition:test", producerId: producer.id, operation: "ADD", hostAlias: "primary-test", hostRole: "PRIMARY",
        deploymentEpoch: 1, leaseId: "lease:primary:1", automationWindowId: 101, priorBindingRevision: 1,
        priorOwnedTargetIds: ["owned-target"], anchorTargetId: "owned-target", targetId: null,
        reason: "AUTOMATION_OWNED_TARGET_CREATE", beginFingerprint: "d".repeat(64), begunAt: new Date(origin).toISOString(),
      };
    },
    (f) => { f.store.commitSubmissionAuthorityState(domain, f.store.state, { eventKind: "BOUNDARY_RECORDED", queueItemId: f.permit.queueItemId, actualSubmissionBoundaryAt: new Date(origin + 10_000).toISOString() }); },
  ];
  for (const change of changes) {
    const f = await fixture();
    change(f);
    f.permit = makePermit(f); // Even fresh owner/hash bindings cannot waive these gates.
    await unchangedFailure(f, f.permit);
  }
});

test("ledger integrity and complete history remain required, including for a consumed permit", async () => {
  const f = await fixture();
  f.store.records[0].eventHash = "0".repeat(64);
  await unchangedFailure(f, f.permit, "SUBMISSION_RECOVERY_LEDGER_INVALID");
  const consumed = await fixture();
  await runtime(consumed, consumed.permit).status(producer);
  consumed.now.value += 31 * 60_000;
  consumed.store.records.shift();
  await unchangedFailure(consumed, consumed.permit, "SUBMISSION_RECOVERY_LEDGER_INVALID");
});

test("a missing transaction hook or standalone permit fails closed", async () => {
  const f = await fixture();
  Object.defineProperty(f.store, "transactSubmissionAuthorityRecovery", { value: undefined });
  await unchangedFailure(f, f.permit, "SUBMISSION_RECOVERY_TRANSACTION_UNAVAILABLE");
  const store = new EventStore(":memory:");
  try {
    assert.throws(() => new SubmissionAuthorityRuntime(store, { MISSION_CONTROL_SUBMISSION_RECOVERY_PERMIT_JSON: JSON.stringify(f.permit) }), /requires both/);
  } finally { store.close(); }
});

test("real EventStore: recovery survives restart without a permit and exact expired-permit restart", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mc-recovery-restart-"));
  const filename = path.join(directory, "authority.db");
  let store = new EventStore(filename);
  try {
    const f = await sqliteFixture(store);
    const before = sqliteSnapshot(store);
    await runtime(f, f.permit).status(producer);
    const recovered = sqliteSnapshot(store);
    assert.equal(recovered.ledger.length, before.ledger.length + 1);
    assert.deepEqual(recovered.ledger.slice(0, -1), before.ledger);
    assert.equal(store.verifySubmissionAuthorityLedger(domain).valid, true);
    store.close();
    store = new EventStore(filename);
    f.store = store;
    await runtime(f).status(producer); // No permit: new parser must retain the committed recovery.
    assert.deepEqual(sqliteSnapshot(store), recovered);
    f.now.value += 31 * 60_000;
    await runtime(f, f.permit).status(producer);
    assert.deepEqual(sqliteSnapshot(store), recovered);
    const fresh = await runtime(f).execute("admissions", request("MCP_PREFLIGHT"), producer);
    assert.notEqual(fresh.admissionId, f.permit.admissionId);
    assert.equal(fresh.queueItemId, f.permit.queueItemId);
    assert.equal((store.submissionAuthorityState(domain) as any).admissions[0].status, PRECOMPOSITION_RECOVERED);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("real EventStore: callback and both writes share one rollback boundary; old ledger remains append-only", async () => {
  const store = new EventStore(":memory:");
  try {
    const f = await sqliteFixture(store);
    const db = (store as any).db; // Only this isolated test database is fault-injected.
    db.exec("CREATE TEMP TABLE recovery_callback_probe(value INTEGER)");
    assert.throws(() => store.transactSubmissionAuthorityRecovery(domain, () => {
      db.exec("INSERT INTO recovery_callback_probe VALUES (1)");
      throw new Error("CALLBACK_ROLLBACK");
    }), /CALLBACK_ROLLBACK/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM recovery_callback_probe").get().count, 0);
    const before = sqliteSnapshot(store);
    db.exec(`CREATE TEMP TRIGGER reject_recovery_state BEFORE UPDATE ON provider_submission_authority_state
      BEGIN SELECT RAISE(ABORT, 'INJECTED_STATE_WRITE_FAILURE'); END`);
    await assert.rejects(runtime(f, f.permit).status(producer), /INJECTED_STATE_WRITE_FAILURE/);
    assert.deepEqual(sqliteSnapshot(store), before); // The already-inserted recovery event rolled back too.
    db.exec("DROP TRIGGER reject_recovery_state");
    db.exec(`CREATE TEMP TRIGGER reject_recovery_ledger BEFORE INSERT ON provider_submission_authority_ledger
      BEGIN SELECT RAISE(ABORT, 'INJECTED_LEDGER_WRITE_FAILURE'); END`);
    await assert.rejects(runtime(f, f.permit).status(producer), /INJECTED_LEDGER_WRITE_FAILURE/);
    assert.deepEqual(sqliteSnapshot(store), before);
    db.exec("DROP TRIGGER reject_recovery_ledger");
    await runtime(f, f.permit).status(producer);
    assert.equal(store.verifySubmissionAuthorityLedger(domain).valid, true);
    assert.throws(() => db.prepare("UPDATE provider_submission_authority_ledger SET event_kind = 'ERASED'").run(), /is_append_only/);
    assert.throws(() => db.prepare("DELETE FROM provider_submission_authority_ledger").run(), /is_append_only/);
    const after = sqliteSnapshot(store);
    assert.deepEqual(after.ledger.slice(0, -1), before.ledger);
    assert.equal(after.state.lastBoundaryAt, before.state.lastBoundaryAt);
    assert.equal(after.state.nextSequence, before.state.nextSequence);
    assert.equal(after.state.nextQueueSequence, before.state.nextQueueSequence);
    assert.deepEqual(after.state.leaseHistory, before.state.leaseHistory);
  } finally { store.close(); }
});

test("real EventStore: changed state and head fail before any recovery write", async () => {
  for (const change of ["state", "head"]) {
    const store = new EventStore(":memory:");
    try {
      const f = await sqliteFixture(store);
      if (change === "head") store.commitSubmissionAuthorityState(domain, store.submissionAuthorityState(domain), { eventKind: "STATE_COMMITTED" });
      else {
        const state = store.submissionAuthorityState(domain) as any;
        state.updatedAt = new Date(origin + 1).toISOString();
        (store as any).db.prepare("UPDATE provider_submission_authority_state SET state_json = ? WHERE pacing_domain = ?").run(canonicalJson(state), domain);
      }
      const before = sqliteSnapshot(store);
      await assert.rejects(runtime(f, f.permit).status(producer), code(change === "state"
        ? "SUBMISSION_RECOVERY_STATE_HASH_MISMATCH" : "SUBMISSION_RECOVERY_LEDGER_HEAD_MISMATCH"));
      assert.deepEqual(sqliteSnapshot(store), before);
    } finally { store.close(); }
  }
});

test("real EventStore: complete ledger finds consumed permits and boundary evidence beyond the UI limit", async () => {
  for (const consumed of [false, true]) {
    const store = new EventStore(":memory:");
    try {
      const f = await sqliteFixture(store);
      if (consumed) await runtime(f, f.permit).status(producer);
      else store.commitSubmissionAuthorityState(domain, store.submissionAuthorityState(domain), {
        eventKind: "ADMISSION_STATE_CHANGED", queueItemId: f.permit.queueItemId,
        actualSubmissionBoundaryAt: new Date(origin + 10_000).toISOString(), boundaryKind: "CLICKED",
      });
      for (let i = 0; i < 1001; i++) store.commitSubmissionAuthorityState(domain, store.submissionAuthorityState(domain), { eventKind: "STATE_COMMITTED" });
      assert.equal(store.submissionAuthorityLedger(domain, 5000).length, 1000);
      const before = sqliteSnapshot(store);
      if (consumed) {
        f.now.value += 31 * 60_000;
        await runtime(f, f.permit).status(producer);
      } else {
        f.permit = permitFromSnapshot(before.state, before.ledger, f.now.value, "MCP_PREFLIGHT");
        await assert.rejects(runtime(f, f.permit).status(producer), code("SUBMISSION_RECOVERY_BOUNDARY_OR_OUTCOME_PRESENT"));
      }
      assert.deepEqual(sqliteSnapshot(store), before);
    } finally { store.close(); }
  }
});

function sqliteSnapshot(store: EventStore): { state: any; ledger: any[] } {
  return store.transactSubmissionAuthorityRecovery(domain, (snapshot) => ({ duplicate: snapshot })) as any;
}

async function sqliteFixture(store: EventStore) {
  const f = { store, now: { value: origin }, permit: null as any };
  const authority = runtime(f);
  await authority.execute("admissions", request("MCP_PREFLIGHT"), producer);
  f.now.value += 120_001;
  await assert.rejects(authority.execute("admissions", request("MCP_PREFLIGHT"), producer), code("SUBMISSION_RESTART_AMBIGUITY"));
  const snapshot = sqliteSnapshot(store);
  f.permit = permitFromSnapshot(snapshot.state, snapshot.ledger, f.now.value, "MCP_PREFLIGHT");
  return f;
}

type Fixture = { store: RecoveryStore; now: { value: number }; permit: any; sendPath: string };

async function fixture(sendPath = "MCP_PREFLIGHT"): Promise<Fixture> {
  const f: Fixture = { store: new RecoveryStore(), now: { value: origin }, permit: null, sendPath };
  const authority = runtime(f);
  await authority.execute("admissions", request(sendPath), producer);
  f.now.value += 120_001;
  await assert.rejects(authority.execute("admissions", request(sendPath), producer), code("SUBMISSION_RESTART_AMBIGUITY"));
  f.permit = makePermit(f);
  return f;
}

function makePermit(f: Fixture): any {
  return permitFromSnapshot(f.store.state, f.store.records, f.now.value, f.sendPath);
}

function permitFromSnapshot(state: any, records: any[], nowMs: number, sendPath: string): any {
  const admission = state.admissions[0], queue = state.queueItems[0], head = records.at(-1);
  return authorize({
    schemaVersion: 1, permitId: "operator-recovery:one", pacingDomain: domain,
    issuedAt: new Date(nowMs).toISOString(), expiresAt: new Date(nowMs + 30 * 60_000).toISOString(),
    admissionId: admission.admissionId, queueItemId: queue.queueItemId, requestId: admission.requestId, producerId: producer.id,
    sendPath, bodySha256: admission.bodySha256,
    expectedAdmissionStatus: "AMBIGUOUS_AFTER_RESTART", expectedQueueStatus: "AMBIGUOUS_AFTER_RESTART",
    expectedStateSha256: recoverySha256(state), expectedLedgerHead: { sequence: head.sequence, eventHash: head.eventHash },
    expectedAdmissionSha256: recoverySha256(admission), expectedQueueItemSha256: recoverySha256(queue),
    requestFingerprint: queue.requestFingerprint, logicalFingerprint: queue.logicalFingerprint,
    expectedLeaseSha256: recoverySha256(state.activeLease), expectedRelayBindingSha256: recoverySha256(state.relayBindings[producer.id]),
    failureEvidence: {
      kind: "APP_SELECTION_FAILED_BEFORE_COMPOSITION", admissionId: admission.admissionId, queueItemId: queue.queueItemId,
      requestId: admission.requestId, bodySha256: admission.bodySha256, observedAt: new Date(origin + 52_432).toISOString(),
      failureCode: "APP_SELECTION_TIMEOUT", compositionStarted: false, submitInvoked: false, boundaryObserved: false,
      sourceRef: "evidence:audited-source-manifest", sourceSha256: "1".repeat(64), retainedArtifactSha256s: ["2".repeat(64), "3".repeat(64)],
    },
    ownerAuthorization: { authorizedBy: "OWNER", action: PRECOMPOSITION_RECOVERED, sourceRef: "owner:exact-recovery", sourceSha256: "4".repeat(64) },
  });
}

function authorize(value: any): any {
  const p = structuredClone(value);
  p.failureEvidenceSha256 = recoverySha256(p.failureEvidence);
  p.ownerAuthorization.scopeSha256 = recoveryPermitScopeSha256(p);
  p.ownerAuthorizationSha256 = recoverySha256(p.ownerAuthorization);
  return p;
}

async function unchangedFailure(f: Fixture, permit: any, expectedCode?: string, overrides = {}) {
  const state = structuredClone(f.store.state), ledger = structuredClone(f.store.records);
  const result = runtime(f, permit, overrides).status(producer);
  if (expectedCode) await assert.rejects(result, code(expectedCode));
  else await assert.rejects(result);
  assert.deepEqual(f.store.state, state);
  assert.deepEqual(f.store.records, ledger);
}

function code(expected: string) { return (error: any) => error?.code === expected; }

function runtime(f: { store: RecoveryStore | EventStore; now: { value: number } }, permit?: any, overrides: Record<string, string> = {}) {
  const chats = [{
    scope: "SPECIALIST", supervisorId: "spec", label: "Test supervisor", workerId: "worker-test", requiredApp: "Mission Control",
    registrationId: "registration:test", ownership: "MISSION_CONTROL_ONLY", purpose: "Dedicated test supervision", accountAlias: "test-account", workspaceAlias: "test",
    privateLocatorRef: "private-config:test", registrationProvenance: { registeredBy: "OWNER", registeredAt: new Date(origin - 60_000).toISOString(), sourceRef: "owner:test" },
    bootstrapCapability: { chatId: "bootstrap-test", url: "https://chatgpt.com/c/bootstrap-test", challengeId: "challenge-test" },
    consumerControls: { modelVisibleLabel: "GPT-5.6 Sol", thinkingControlLabel: "Thinking effort", thinkingVisibleLabel: "Extra High", thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro", accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false },
  }];
  return new SubmissionAuthorityRuntime(f.store as unknown as EventStore, {
    MISSION_CONTROL_SUPERVISOR_CHATS_JSON: JSON.stringify(chats), MISSION_CONTROL_SUBMISSION_PACING_DOMAIN: domain,
    MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON: JSON.stringify(lease()),
    MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON: JSON.stringify({ [producer.id]: { hostAlias: "primary-test", hostRole: "PRIMARY", automationWindowId: 101, ownedTargetIds: ["owned-target"] } }),
    MISSION_CONTROL_SUBMISSION_RELAY_ATTESTORS_JSON: JSON.stringify({ [producer.id]: "test-attestor-" + "a".repeat(40) }),
    MISSION_CONTROL_INGEST_CREDENTIALS: JSON.stringify({ [producer.id]: { kind: "COLLECTOR", token: "test-ingress-" + "b".repeat(40), workers: producer.workerScopes, tasks: producer.taskScopes } }),
    ...(permit === undefined ? {} : { MISSION_CONTROL_SUBMISSION_RECOVERY_PERMIT_JSON: JSON.stringify(permit) }),
    ...overrides,
  }, () => f.now.value);
}

function lease() {
  return { schemaVersion: 1, leaseId: "lease:primary:1", epoch: 1, activeHostAlias: "primary-test", activeHostRole: "PRIMARY",
    issuedAt: new Date(origin - 60_000).toISOString(), expiresAt: new Date(origin + 3 * 60 * 60_000).toISOString(), splitBrainStatus: "SINGLE_ACTIVE_CONFIRMED", takeover: null };
}

function request(sendPath: string) {
  return { requestId: "request:test", authorizationRef: "task:worker-test", queueKey: "queue:test", retryRootKey: "queue:test", sendPath,
    hostAlias: "primary-test", hostRole: "PRIMARY", deploymentEpoch: 1, leaseId: "lease:primary:1", supervisorId: "spec", registrationId: "registration:test",
    targetId: "owned-target", automationWindowId: 101, targetKind: "REGISTERED_BOOTSTRAP", targetKey: "bootstrap-test",
    expectedUrlSha256: sha256("https://chatgpt.com/c/bootstrap-test"), bodySha256: "a".repeat(64) };
}
