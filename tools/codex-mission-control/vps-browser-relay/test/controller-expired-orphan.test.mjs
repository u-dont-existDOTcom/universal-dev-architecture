import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileExpiredOrphanControllerCycles, shouldReconcileExpiredOrphans } from '../src/controller-orphan-expiry.mjs';

class MemoryStateStore {
  constructor(state) { this.state = structuredClone(state); }
  async read() { return structuredClone(this.state); }
  async write(value) { this.state = structuredClone(value); return structuredClone(value); }
}
class MissionControl {
  constructor(routes = [], failEvidenceCount = 0) { this.routes = routes; this.evidence = []; this.failEvidenceCount = failEvidenceCount; }
  async fetchFleet() { return { workers: this.routes }; }
  async recordEvidence(workerId, receipt) {
    this.evidence.push({ workerId, receipt });
    if (this.failEvidenceCount > 0) { this.failEvidenceCount -= 1; throw new Error('temporary evidence failure'); }
    return { eventId: 'e-expired' };
  }
}

class Pacer {
  constructor(status = null) { this.calls = 0; this.value = status ?? { authority: 'MISSION_CONTROL_SINGLE_WRITER', schedulerState: 'READY', ledger: { valid: true }, unresolvedAdmission: null, relayTargetTransition: { state: 'CLEAR' }, safetyHalt: null }; }
  async remoteStatus() { this.calls += 1; return structuredClone(this.value); }
}
function cycle(sendStatus = 'BOUNDARY_VERIFIED') {
  return { cycleId: 'old-cycle', taskId: 'old-task', requestId: 'old-request', workerId: 'worker-a', originSupervisorId: 'origin-a', pmSupervisorId: 'mc-project-manager', step: 'WAIT_ORIGIN_ARTIFACT', expiresAt: '2026-09-10T03:00:00.000Z', updatedAt: '2026-09-09T18:00:58.436Z', sends: { origin: { status: sendStatus, boundaryObservedAt: '2026-09-09T18:00:53.815Z', generationCompletedAt: null }, pm: null, return: null }, recoveries: {}, consumedArtifacts: { origin: null, pm: null }, lastError: 'Expected one exact active controller route for old-request; found 0.' };
}
function fixture(value = cycle(), pacerStatus = null) {
  const store = new MemoryStateStore({ controllerCycles: { [value.cycleId]: value }, submissionPacing: { lastSubmissionAt: '2026-09-12T16:02:30.305Z', lastAdmissionId: 'old-admission' } });
  return { store, missionControl: new MissionControl(), pacer: new Pacer(pacerStatus), config: { runtime: { chats: [] } } };
}

test('expired orphan terminalizes while preserving confirmed-but-unresolved provider truth', async () => {
  const f = fixture();
  const result = await reconcileExpiredOrphanControllerCycles({ config: f.config, missionControl: f.missionControl, stateStore: f.store, submissionPacer: f.pacer });
  assert.equal(result.status, 'EXPIRED_CONTROLLER_ORPHANS_TERMINALIZED');
  const c = f.store.state.controllerCycles['old-cycle'];
  assert.equal(c.step, 'EXPIRED');
  assert.equal(c.terminalization.activeRouteAtTerminalization, false);
  assert.equal(c.terminalization.providerOutcome.state, 'UNRESOLVED_AFTER_CONFIRMED_BOUNDARY');
  assert.deepEqual(c.terminalization.providerOutcome.unresolvedConfirmedBoundaries, ['origin:send']);
  assert.equal(c.terminalization.priorLastError, 'Expected one exact active controller route for old-request; found 0.');
  assert.equal(c.sends.origin.status, 'BOUNDARY_VERIFIED');
  assert.equal(c.sends.origin.generationCompletedAt, null);
  assert.equal(f.store.state.submissionPacing.lastSubmissionAt, '2026-09-12T16:02:30.305Z');
  assert.equal(c.terminalization.evidence.status, 'RECORDED');
  assert.ok(c.terminalization.evidence.recordedAt);
  assert.equal(f.missionControl.evidence.length, 1);
});

test('ambiguous click and unsafe central state remain nonterminal', async () => {
  const f = fixture(cycle('CLICK_BOUNDARY_PERSISTED'));
  let result = await reconcileExpiredOrphanControllerCycles({ config: f.config, missionControl: f.missionControl, stateStore: f.store, submissionPacer: f.pacer });
  assert.equal(result.status, 'NO_SAFE_EXPIRED_CONTROLLER_ORPHANS');
  assert.equal(f.store.state.controllerCycles['old-cycle'].step, 'WAIT_ORIGIN_ARTIFACT');
  const unsafeCentral = { authority: 'MISSION_CONTROL_SINGLE_WRITER', schedulerState: 'READY', ledger: { valid: true }, unresolvedAdmission: { id: 'pending' }, relayTargetTransition: { state: 'CLEAR' }, safetyHalt: null };
  const g = fixture(cycle(), unsafeCentral);
  result = await reconcileExpiredOrphanControllerCycles({ config: g.config, missionControl: g.missionControl, stateStore: g.store, submissionPacer: g.pacer });
  assert.equal(result.status, 'NO_SAFE_EXPIRED_CONTROLLER_ORPHANS');
  assert.equal(g.store.state.controllerCycles['old-cycle'].step, 'WAIT_ORIGIN_ARTIFACT');
});

test('terminal and unexpired cycles are left to their proper lifecycle owner', async () => {
  const unexpired = cycle(); unexpired.expiresAt = '2099-09-10T03:00:00.000Z';
  let f = fixture(unexpired);
  let result = await reconcileExpiredOrphanControllerCycles({ config: f.config, missionControl: f.missionControl, stateStore: f.store, submissionPacer: f.pacer });
  assert.equal(result.status, 'NO_EXPIRED_CONTROLLER_ORPHANS');
  assert.equal(f.pacer.calls, 0);
  const done = cycle(); done.step = 'EXPIRED';
  f = fixture(done);
  result = await reconcileExpiredOrphanControllerCycles({ config: f.config, missionControl: f.missionControl, stateStore: f.store, submissionPacer: f.pacer });
  assert.equal(result.status, 'NO_EXPIRED_CONTROLLER_ORPHANS');
  assert.equal(f.pacer.calls, 0);
});


test('a failed evidence write is retried with the same stable receipt before dispatch can continue', async () => {
  const f = fixture();
  f.missionControl = new MissionControl([], 1);
  await assert.rejects(
    reconcileExpiredOrphanControllerCycles({ config: f.config, missionControl: f.missionControl, stateStore: f.store, submissionPacer: f.pacer }),
    /temporary evidence failure/,
  );
  const pending = f.store.state.controllerCycles['old-cycle'];
  assert.equal(pending.step, 'EXPIRED');
  assert.equal(pending.terminalization.evidence.status, 'PENDING');
  const receiptId = pending.terminalization.evidence.receiptId;
  const result = await reconcileExpiredOrphanControllerCycles({ config: f.config, missionControl: f.missionControl, stateStore: f.store, submissionPacer: f.pacer });
  assert.equal(result.status, 'NO_EXPIRED_CONTROLLER_ORPHANS');
  const recorded = f.store.state.controllerCycles['old-cycle'];
  assert.equal(recorded.terminalization.evidence.status, 'RECORDED');
  assert.equal(recorded.terminalization.evidence.receiptId, receiptId);
  assert.equal(f.missionControl.evidence[0].receipt.receiptId, receiptId);
  assert.equal(f.missionControl.evidence[1].receipt.receiptId, receiptId);
});

test('dispatch commands reconcile orphans but diagnostic commands stay read-only', () => {
  for (const command of ['once', 'run', 'controller-init', 'controller-once', 'controller-run']) assert.equal(shouldReconcileExpiredOrphans(command), true, command);
  for (const command of ['doctor', 'health-report', 'status', 'capabilities', 'mcp-preflight', 'provision']) assert.equal(shouldReconcileExpiredOrphans(command), false, command);
});
