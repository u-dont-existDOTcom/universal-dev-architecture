import { extractQueuedRoutes, sha256 } from './core.mjs';
import { CONTROLLER_STAGE_SUMMARY, isTerminalControllerCycle } from './controller-mediated-pm.mjs';

const EXPIRED_STEP = 'EXPIRED';

export async function reconcileExpiredOrphanControllerCycles({ config, missionControl, stateStore, submissionPacer }) {
  let state = await stateStore.read();
  await flushPendingExpiredEvidence({ missionControl, stateStore, state });
  state = await stateStore.read();
  const nowMs = Date.now();
  const candidates = Object.values(state.controllerCycles ?? {})
    .filter((cycle) => !isTerminalControllerCycle(cycle))
    .filter((cycle) => Number.isFinite(Date.parse(cycle?.expiresAt ?? '')) && nowMs > Date.parse(cycle.expiresAt));
  if (candidates.length === 0) return { status: 'NO_EXPIRED_CONTROLLER_ORPHANS', terminalized: [], blocked: [] };

  const snapshot = await missionControl.fetchFleet();
  const routes = extractQueuedRoutes(snapshot, config.runtime.chats, state);
  const terminalized = [];
  const blocked = [];

  for (const candidate of candidates.sort((a, b) => String(a.cycleId).localeCompare(String(b.cycleId)))) {
    state = await stateStore.read();
    const cycle = state.controllerCycles?.[candidate.cycleId];
    if (!cycle || isTerminalControllerCycle(cycle)) continue;
    const matchingRoutes = routes.filter((route) => route.requestId === cycle.requestId);
    if (matchingRoutes.length > 1) {
      blocked.push({ cycleId: cycle.cycleId, reason: 'MULTIPLE_ACTIVE_ROUTES' });
      continue;
    }
    if (matchingRoutes.length === 1) continue;

    const central = await submissionPacer.remoteStatus();
    const unsafe = orphanTerminalizationUnsafeReasons(state, cycle, central);
    if (unsafe.length > 0) {
      blocked.push({ cycleId: cycle.cycleId, reason: 'TERMINALIZATION_UNSAFE', unsafe });
      continue;
    }

    const terminalizedAt = new Date().toISOString();
    const priorStep = cycle.step;
    const priorLastError = cycle.lastError ?? null;
    cycle.step = EXPIRED_STEP;
    cycle.updatedAt = terminalizedAt;
    cycle.lastError = null;
    const evidenceReceiptId = `pm-controller:${cycle.cycleId}:EXPIRED:${sha256(terminalizedAt).slice(0, 12)}`;
    cycle.terminalization = {
      schemaVersion: 1,
      reason: 'ROUTE_EXPIRED_ORPHANED',
      priorStep,
      expiresAt: cycle.expiresAt,
      terminalizedAt,
      priorLastError,
      activeRouteAtTerminalization: false,
      providerOutcome: expiredProviderOutcome(cycle),
      evidence: { receiptId: evidenceReceiptId, status: 'PENDING', recordedAt: null },
      centralAuthority: {
        authority: central.authority,
        schedulerState: central.schedulerState ?? null,
        ledgerValid: central.ledger.valid,
        unresolvedAdmission: null,
        relayTargetTransition: 'CLEAR',
        safetyHalt: null,
        observedAt: terminalizedAt,
      },
      preservedEvidence: {
        lastAdmissionId: state.submissionPacing?.lastAdmissionId ?? null,
        sends: summarizeSends(cycle.sends),
        consumedArtifacts: summarizeArtifacts(cycle.consumedArtifacts),
      },
    };
    state.controllerCycles[cycle.cycleId] = cycle;
    state = await stateStore.write(state);
    await recordExpiredEvidence(missionControl, cycle);
    state = await stateStore.read();
    const persisted = state.controllerCycles[cycle.cycleId];
    persisted.terminalization.evidence.status = 'RECORDED';
    persisted.terminalization.evidence.recordedAt = new Date().toISOString();
    state.controllerCycles[cycle.cycleId] = persisted;
    await stateStore.write(state);
    terminalized.push(cycle.cycleId);
  }

  return {
    status: terminalized.length > 0 ? 'EXPIRED_CONTROLLER_ORPHANS_TERMINALIZED' : 'NO_SAFE_EXPIRED_CONTROLLER_ORPHANS',
    terminalized,
    blocked,
  };
}

export function shouldReconcileExpiredOrphans(command) {
  return ['once', 'run', 'controller-init', 'controller-once', 'controller-run'].includes(command);
}

function orphanTerminalizationUnsafeReasons(state, cycle, central) {
  const reasons = [];
  if (central?.authority !== 'MISSION_CONTROL_SINGLE_WRITER' || central?.ledger?.valid !== true) reasons.push('CENTRAL_LEDGER_NOT_READY');
  if (central?.unresolvedAdmission) reasons.push('CENTRAL_ADMISSION_UNRESOLVED');
  if (central?.relayTargetTransition?.state !== 'CLEAR') reasons.push('CENTRAL_TARGET_TRANSITION_UNRESOLVED');
  if (central?.safetyHalt) reasons.push('CENTRAL_SAFETY_HALT_ACTIVE');
  for (const [lane, send] of Object.entries(cycle.sends ?? {})) {
    if (!send) continue;
    if (['INTENT_RECORDED', 'CLICK_BOUNDARY_PERSISTED'].includes(send.status)) reasons.push(`${lane.toUpperCase()}_SEND_${send.status}`);
    else if (!['FAILED_PRECLICK', 'BOUNDARY_VERIFIED', 'ARTIFACT_CONFIRMED_BOUNDARY'].includes(send.status)) reasons.push(`${lane.toUpperCase()}_SEND_STATE_UNRECOGNIZED`);
  }
  for (const [lane, recovery] of Object.entries(cycle.recoveries ?? {})) {
    for (const attempt of recovery?.attempts ?? []) {
      if (['INTENT_RECORDED', 'CLICK_BOUNDARY_PERSISTED'].includes(attempt.status)) reasons.push(`${lane.toUpperCase()}_CONTINUE_${attempt.status}`);
      else if (!['BOUNDARY_VERIFIED', 'CONTINUE_COMPLETE_PENDING_RETRY_INSPECTION', 'CONTINUE_COMPLETE_NO_RETRY', 'RETRY_FAILED_CONTINUE', 'RETRY_COMPLETE'].includes(attempt.status)) reasons.push(`${lane.toUpperCase()}_CONTINUE_STATE_UNRECOGNIZED`);
      const retry = attempt.retry;
      if (!retry) continue;
      if (['INTENT_RECORDED', 'CLICK_BOUNDARY_PERSISTED'].includes(retry.status)) reasons.push(`${lane.toUpperCase()}_CONTINUE_RETRY_${retry.status}`);
      else if (!['READY', 'BOUNDARY_VERIFIED', 'COMPLETE_PENDING_FAILURE_INSPECTION', 'COMPLETE'].includes(retry.status)) reasons.push(`${lane.toUpperCase()}_CONTINUE_RETRY_STATE_UNRECOGNIZED`);
    }
  }
  return reasons;
}

function expiredProviderOutcome(cycle) {
  const unresolvedConfirmedBoundaries = [];
  for (const [lane, send] of Object.entries(cycle.sends ?? {})) {
    if (send?.status === 'BOUNDARY_VERIFIED' && !Number.isFinite(Date.parse(send.generationCompletedAt ?? ''))) unresolvedConfirmedBoundaries.push(`${lane}:send`);
  }
  for (const [lane, recovery] of Object.entries(cycle.recoveries ?? {})) {
    for (const attempt of recovery?.attempts ?? []) {
      if (attempt?.status === 'BOUNDARY_VERIFIED' && !Number.isFinite(Date.parse(attempt.generationCompletedAt ?? ''))) unresolvedConfirmedBoundaries.push(`${lane}:continue:${attempt.attemptNumber ?? 'unknown'}`);
      if (attempt?.retry?.status === 'BOUNDARY_VERIFIED' && !Number.isFinite(Date.parse(attempt.retry.generationCompletedAt ?? ''))) unresolvedConfirmedBoundaries.push(`${lane}:retry:${attempt.attemptNumber ?? 'unknown'}`);
    }
  }
  return { state: unresolvedConfirmedBoundaries.length ? 'UNRESOLVED_AFTER_CONFIRMED_BOUNDARY' : 'NO_UNRESOLVED_CONFIRMED_BOUNDARY', unresolvedConfirmedBoundaries };
}

function summarizeSends(sends) {
  return Object.fromEntries(Object.entries(sends ?? {}).map(([lane, send]) => [lane, send ? {
    status: send.status ?? null,
    boundaryObservedAt: send.boundaryObservedAt ?? null,
    generationCompletedAt: send.generationCompletedAt ?? null,
  } : null]));
}

function summarizeArtifacts(artifacts) {
  return Object.fromEntries(Object.entries(artifacts ?? {}).map(([lane, artifact]) => [lane, artifact ? {
    commentId: artifact.commentId,
    bodySha256: artifact.bodySha256,
    artifactKind: artifact.artifactKind,
  } : null]));
}

async function flushPendingExpiredEvidence({ missionControl, stateStore, state }) {
  for (const cycle of Object.values(state.controllerCycles ?? {})) {
    if (cycle?.step !== EXPIRED_STEP || cycle?.terminalization?.reason !== 'ROUTE_EXPIRED_ORPHANED'
      || cycle?.terminalization?.evidence?.status !== 'PENDING') continue;
    await recordExpiredEvidence(missionControl, cycle);
    const current = await stateStore.read();
    const persisted = current.controllerCycles?.[cycle.cycleId];
    if (!persisted || persisted?.terminalization?.evidence?.receiptId !== cycle.terminalization.evidence.receiptId) {
      throw new Error('CONTROLLER_ORPHAN_EXPIRED_EVIDENCE_STATE_CHANGED.');
    }
    persisted.terminalization.evidence.status = 'RECORDED';
    persisted.terminalization.evidence.recordedAt = new Date().toISOString();
    current.controllerCycles[cycle.cycleId] = persisted;
    await stateStore.write(current);
  }
}

async function recordExpiredEvidence(missionControl, cycle) {
  const receiptId = cycle?.terminalization?.evidence?.receiptId;
  if (!receiptId) throw new Error('CONTROLLER_ORPHAN_EXPIRED_EVIDENCE_RECEIPT_MISSING.');
  return missionControl.recordEvidence(cycle.workerId, {
    receiptId,
    summary: CONTROLLER_STAGE_SUMMARY,
    refs: [
      `cycle:${cycle.cycleId}`, `task:${cycle.taskId}`, `request:${cycle.requestId}`,
      `origin_supervisor:${cycle.originSupervisorId}`, `pm_supervisor:${cycle.pmSupervisorId}`,
      'step:EXPIRED', 'active_route_at_terminalization:false',
      `provider_outcome:${cycle.terminalization.providerOutcome.state}`,
      'assistant_content_observed:false', 'semantic_authority:false',
    ],
    occurredAt: cycle.updatedAt,
  });
}
