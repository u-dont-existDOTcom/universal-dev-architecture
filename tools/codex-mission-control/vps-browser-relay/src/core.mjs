import { createHash } from 'node:crypto';

export const INTERNAL_ROUTE_PREFIX = 'MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1\n';
export const SUPERVISORY_CYCLE_ROUTE_PREFIX = 'MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V2\n';
export const STATE_VERSION = 1;
export const CAPABILITY_CHALLENGE_SUMMARY = 'MISSION_CONTROL_CHAT_CAPABILITY_CHALLENGE_V1';
export const CAPABILITY_VERIFIED_SUMMARY = 'MISSION_CONTROL_CHAT_CAPABILITY_VERIFIED_V1';
export const MODE_CAPABILITY_VERIFIED_SUMMARY = 'MISSION_CONTROL_CHAT_MODE_CAPABILITY_VERIFIED_V1';
export const RELAY_STAGE_SUMMARY = 'MISSION_CONTROL_RELAY_STAGE_V1';
export const STAGE_LIVENESS_SUMMARY = 'MISSION_CONTROL_CHAT_STAGE_LIVENESS_V1';
export const CONTINUE_NUDGE_DELAY_MS = 300_000;
export const STAGE_RECEIPT_GRACE_MS = 360_000;

export function oneShotExitCode(result) {
  return result?.status === 'ERROR' ? 1 : 0;
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function normalizeConversationUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Chat URL must be a non-empty string.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname !== 'chatgpt.com') {
    throw new Error('Chat URL must be an HTTPS chatgpt.com URL without embedded credentials.');
  }
  const match = url.pathname.match(/^\/c\/([A-Za-z0-9_-]+)\/?$/);
  if (!match) throw new Error('Chat URL must identify one concrete /c/<conversation-id> conversation.');
  return `https://chatgpt.com/c/${match[1]}`;
}

export function parseChatDirectory(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Chat directory must be a non-empty JSON array.');
  const entries = value.map((item, index) => parseChatEntry(item, index));
  const ids = new Set(entries.map((entry) => entry.chatId));
  if (ids.size !== entries.length) throw new Error('Chat IDs must be unique.');
  const challenges = new Set(entries.map((entry) => entry.capabilityChallengeId));
  if (challenges.size !== entries.length) throw new Error('Capability challenge IDs must be unique.');
  if (entries.filter((entry) => entry.scope === 'PROJECT_MANAGER').length > 1) {
    throw new Error('Only one Project Manager chat may be configured.');
  }
  return entries;
}

function parseChatEntry(item, index) {
  if (!isRecord(item)) throw new Error(`Chat entry ${index} must be an object.`);
  const scope = item.scope;
  if (scope !== 'PROJECT_MANAGER' && scope !== 'SPECIALIST') throw new Error(`Chat entry ${index} has an invalid scope.`);
  return {
    scope,
    chatId: boundedString(item.chatId, `Chat entry ${index} chatId`, 300),
    label: boundedString(item.label, `Chat entry ${index} label`, 300),
    url: normalizeConversationUrl(boundedString(item.url, `Chat entry ${index} url`, 1000)),
    workerId: boundedString(item.workerId, `Chat entry ${index} workerId`, 180),
    pinned: item.pinned === true || scope === 'PROJECT_MANAGER',
    capabilityChallengeId: boundedString(item.capabilityChallengeId, `Chat entry ${index} capabilityChallengeId`, 180),
    modelLabels: parseModelLabels(item.modelLabels, index),
  };
}

function parseModelLabels(value, index) {
  if (!isRecord(value)) throw new Error(`Chat entry ${index} modelLabels must be an object.`);
  return {
    extraHigh: boundedString(value.extraHigh, `Chat entry ${index} modelLabels.extraHigh`, 100),
    pro: boundedString(value.pro, `Chat entry ${index} modelLabels.pro`, 100),
  };
}

export function parseInternalSupervisorRouteBody(body) {
  if (typeof body !== 'string' || !body.startsWith(INTERNAL_ROUTE_PREFIX)) return null;
  try {
    const value = JSON.parse(body.slice(INTERNAL_ROUTE_PREFIX.length));
    if (!isRecord(value)
      || value.schemaVersion !== 1
      || value.packetKind !== 'FACTUAL_STATE_ONLY'
      || typeof value.requestId !== 'string'
      || typeof value.actionBlockedOrRouted !== 'string'
      || (value.destination !== 'PROJECT_MANAGER_CHAT' && value.destination !== 'SPECIALIST_SUPERVISOR_CHAT')
      || typeof value.destinationChatId !== 'string'
      || value.providerDeliveryState !== 'QUEUED_FOR_PROVIDER_RELAY'
      || typeof value.queuedAt !== 'string'
      || !isRecord(value.factualPacket)
      || typeof value.factualPacket.packetId !== 'string'
      || typeof value.factualPacket.taskId !== 'string'
      || typeof value.factualPacket.exactFactualState !== 'string'
      || !Array.isArray(value.factualPacket.evidenceRefs)
      || typeof value.factualPacket.decisionRequested !== 'string') return null;
    return value;
  } catch {
    return null;
  }
}

export function parseSupervisoryCycleRouteBody(body) {
  if (typeof body !== 'string' || !body.startsWith(SUPERVISORY_CYCLE_ROUTE_PREFIX)) return null;
  try {
    const value = JSON.parse(body.slice(SUPERVISORY_CYCLE_ROUTE_PREFIX.length));
    if (!isRecord(value)
      || value.schemaVersion !== 2
      || value.packetKind !== 'SAME_CHAT_SUPERVISORY_CYCLE'
      || typeof value.requestId !== 'string'
      || typeof value.nonce !== 'string'
      || (value.reasoningLane !== 'EXTRA_HIGH_DIRECT' && value.reasoningLane !== 'PRO_ESCALATED')
      || typeof value.destinationChatId !== 'string'
      || value.providerDeliveryState !== 'QUEUED_FOR_PROVIDER_RELAY'
      || typeof value.queuedAt !== 'string'
      || typeof value.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(value.queuedAt))
      || !Number.isFinite(Date.parse(value.expiresAt))
      || Date.parse(value.expiresAt) <= Date.parse(value.queuedAt)
      || !isRecord(value.evidenceCapsule)
      || typeof value.evidenceCapsule.id !== 'string'
      || !isSha256(value.evidenceCapsule.sha256)
      || !isRecord(value.ownerOutcome)
      || typeof value.ownerOutcome.id !== 'string'
      || !Number.isInteger(value.ownerOutcome.epoch)
      || value.ownerOutcome.epoch < 1
      || !isSha256(value.ownerOutcome.sha256)
      || !isRecord(value.githubReceipt)
      || typeof value.githubReceipt.repository !== 'string'
      || !Number.isInteger(value.githubReceipt.issueNumber)
      || value.githubReceipt.issueNumber < 1) return null;
    return value;
  } catch {
    return null;
  }
}

export function extractQueuedRoutes(snapshot, chats, state) {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.workers)) throw new Error('Mission Control fleet response does not contain workers.');
  const chatById = new Map(chats.map((entry) => [entry.chatId, entry]));
  const receiptByWorkerRequest = new Map();
  const livenessByWorkerRequest = new Map();
  for (const worker of snapshot.workers) {
    if (!isRecord(worker) || !Array.isArray(worker.timeline)) continue;
    const workerId = typeof worker.id === 'string' ? worker.id : 'unknown-worker';
    for (const event of worker.timeline) {
      if (!isRecord(event?.data)) continue;
      if (event.data.type === 'github_decision_receipt_ingested' && typeof event.data.request_id === 'string') {
        receiptByWorkerRequest.set(`${workerId}:${event.data.request_id}`, event.data);
        continue;
      }
      const parsed = parseStageLivenessEvidence(event);
      if (!parsed) continue;
      const key = `${workerId}:${parsed.requestId}`;
      const current = livenessByWorkerRequest.get(key) ?? {};
      const stageState = current[parsed.stage] ?? { latest: null, continueRequiredCount: 0 };
      if (parsed.status === 'CONTINUE_REQUIRED') stageState.continueRequiredCount += 1;
      if (!stageState.latest || parsed.sequence > stageState.latest.sequence) stageState.latest = parsed;
      current[parsed.stage] = stageState;
      livenessByWorkerRequest.set(key, current);
    }
  }
  const routes = [];
  for (const worker of snapshot.workers) {
    if (!isRecord(worker) || !Array.isArray(worker.timeline)) continue;
    const workerId = typeof worker.id === 'string' ? worker.id : 'unknown-worker';
    const workerName = typeof worker.name === 'string' ? worker.name : workerId;
    for (const event of worker.timeline) {
      if (!isRecord(event) || !isRecord(event.data) || event.data.type !== 'worker_message_recorded') continue;
      const packet = parseSupervisoryCycleRouteBody(event.data.body) ?? parseInternalSupervisorRouteBody(event.data.body);
      if (!packet) continue;
      const chat = chatById.get(packet.destinationChatId);
      if (!chat || chat.workerId !== workerId) continue;
      const routeKey = `request:${packet.requestId}`;
      const prior = state.deliveries?.[routeKey];
      if (prior && ['SUBMITTED_CONFIRMED', 'DISCARDED', 'DECISION_RECEIPT_INGESTED'].includes(prior.status)) continue;
      const workerRequestKey = `${workerId}:${packet.requestId}`;
      routes.push({
        routeKey,
        requestId: packet.requestId,
        messageId: typeof event.data.message_id === 'string' ? event.data.message_id : null,
        eventId: typeof event.eventId === 'string' ? event.eventId : null,
        workerId,
        workerName,
        chat,
        packet,
        routeKind: packet.packetKind === 'SAME_CHAT_SUPERVISORY_CYCLE' ? 'SUPERVISORY_CYCLE' : 'LEGACY_OUTBOUND',
        decisionReceipt: receiptByWorkerRequest.get(workerRequestKey) ?? null,
        stageLiveness: livenessByWorkerRequest.get(workerRequestKey) ?? {},
        body: event.data.body,
        bodySha256: sha256(event.data.body),
        queuedAt: packet.queuedAt,
        prior: prior ?? null,
      });
    }
  }
  return routes.sort((left, right) => left.queuedAt.localeCompare(right.queuedAt) || left.routeKey.localeCompare(right.routeKey));
}

function parseStageLivenessEvidence(event) {
  if (!isRecord(event) || !isRecord(event.data) || event.data.type !== 'evidence_receipt_recorded' || event.data.summary !== STAGE_LIVENESS_SUMMARY || event.data.verified !== true || !Array.isArray(event.data.refs)) return null;
  const requestId = refValue(event.data.refs, 'request:');
  const stage = refValue(event.data.refs, 'stage:');
  const status = refValue(event.data.refs, 'status:');
  if (!requestId || !['EXTRA_HIGH_READER', 'PRO_REASONER'].includes(stage) || !['STAGE_COMPLETE', 'CONTINUE_REQUIRED'].includes(status)) return null;
  return {
    receiptId: event.data.receipt_id,
    requestId,
    stage,
    status,
    occurredAt: event.occurredAt ?? null,
    sequence: Number.isInteger(event.sequence) ? event.sequence : -1,
  };
}

function refValue(refs, prefix) {
  const ref = refs.find((value) => typeof value === 'string' && value.startsWith(prefix));
  return ref ? ref.slice(prefix.length) : null;
}

export function chatCapabilityState(snapshot, chat, now = new Date().toISOString()) {
  const worker = snapshot?.workers?.find((item) => item?.id === chat.workerId);
  const timeline = Array.isArray(worker?.timeline) ? worker.timeline : [];
  const challenge = latestEvidence(timeline, CAPABILITY_CHALLENGE_SUMMARY, [
    `challenge:${chat.capabilityChallengeId}`,
    `chat:${chat.chatId}`,
  ], now, false);
  const capability = latestEvidence(timeline, CAPABILITY_VERIFIED_SUMMARY, [
    `challenge:${chat.capabilityChallengeId}`,
    `chat:${chat.chatId}`,
    'capability:missionControlRead',
    'capability:githubRead',
    'capability:githubWrite',
  ], now, true);
  const mode = latestEvidence(timeline, MODE_CAPABILITY_VERIFIED_SUMMARY, [
    `chat:${chat.chatId}`,
    'capability:modeSwitching',
    `extra_high_label:${chat.modelLabels.extraHigh}`,
    `pro_label:${chat.modelLabels.pro}`,
  ], now, true);
  return {
    chatId: chat.chatId,
    challengeId: chat.capabilityChallengeId,
    challengeAvailable: Boolean(challenge),
    missionControlRead: Boolean(capability),
    githubRead: Boolean(capability),
    githubWrite: Boolean(capability),
    modeSwitching: Boolean(mode),
    allCurrent: Boolean(capability && mode),
    capabilityReceiptId: capability?.data?.receipt_id ?? null,
    modeReceiptId: mode?.data?.receipt_id ?? null,
    expiresAt: earliestExpiry(capability, mode),
  };
}

function latestEvidence(timeline, summary, requiredRefs, now, requireCurrent) {
  return [...timeline].reverse().find((event) => {
    if (!isRecord(event?.data) || event.data.type !== 'evidence_receipt_recorded' || event.data.summary !== summary || event.data.verified !== true) return false;
    if (!Array.isArray(event.data.refs) || requiredRefs.some((ref) => !event.data.refs.includes(ref))) return false;
    if (!requireCurrent) return true;
    const expiry = event.data.refs.find((ref) => typeof ref === 'string' && ref.startsWith('expires_at:'))?.slice('expires_at:'.length);
    return Boolean(expiry && Number.isFinite(Date.parse(expiry)) && Date.parse(expiry) >= Date.parse(now));
  }) ?? null;
}

function earliestExpiry(...events) {
  const values = events.flatMap((event) => event?.data?.refs?.filter((ref) => typeof ref === 'string' && ref.startsWith('expires_at:')).map((ref) => ref.slice('expires_at:'.length)) ?? []);
  return values.sort()[0] ?? null;
}

export function capabilityChallengeUrl(missionControlBaseUrl, challengeId) {
  const base = new URL(missionControlBaseUrl);
  base.pathname = `${base.pathname.replace(/\/$/, '')}/api/capability-challenges/${encodeURIComponent(challengeId)}`;
  base.search = '';
  base.hash = '';
  return base.toString();
}

export function capabilityControlPrompt(chat, missionControlBaseUrl) {
  const challengeUrl = capabilityChallengeUrl(missionControlBaseUrl, chat.capabilityChallengeId);
  return `Mission Control capability challenge ${chat.capabilityChallengeId} for chat ${chat.chatId}: remain in Extra High. Fetch and read ${challengeUrl}. Extract its exact mc_nonce, github_nonce_sha256, github_nonce_source, receipt_target, and expires_at. Fail closed if the challenge_id or chat_id does not exactly match this challenge/chat, or if expires_at has passed. Follow github_nonce_source and reread the raw GitHub nonce. Compute its SHA-256 and verify that it exactly equals github_nonce_sha256 before writing. Then write exactly one MISSION_CONTROL_CHAT_CAPABILITY_RECEIPT_V1 receipt to the exact receipt_target with schema_version 1, challenge_id, chat_id, mc_nonce, github_nonce, and the exact ordered capabilities ["MISSION_CONTROL_READ","GITHUB_READ","GITHUB_WRITE"]. Fail closed without writing if any value, source, hash, binding, or expiry check fails. Do not delegate to Work and do not make a substantive project decision.`;
}

export function cycleControlPrompt(route, step) {
  if (route.routeKind !== 'SUPERVISORY_CYCLE') throw new Error('Control prompts require a supervisory-cycle route.');
  const requestId = route.requestId;
  const location = `${route.packet.githubReceipt.repository}#${route.packet.githubReceipt.issueNumber}`;
  const chatId = route.chat.chatId;
  if (step === 'EXTRA_HIGH_DIRECT') {
    return `MC ${requestId}: remain in Extra High. Read the registered Mission Control/GitHub evidence, make the bounded decision, and write MISSION_CONTROL_CANONICAL_DECISION_V1 to ${location}. Use the exact-copy/structured-transform writer contract. Do not delegate to Work.`;
  }
  if (step === 'EXTRA_HIGH_READER') {
    return `MC ${requestId}: remain in Extra High. Read the registered Mission Control and GitHub evidence fully into this same chat context. Do not decide. When this reader-stage objective is fully complete, read the current stage_receipt_target from Mission Control and write MISSION_CONTROL_CHAT_STAGE_RECEIPT_V1 with request_id ${requestId}, the request_nonce from the pending Mission Control route, chat_id ${chatId}, stage EXTRA_HIGH_READER, status STAGE_COMPLETE. If you can determine that more reader work is required before the stage is complete, write status CONTINUE_REQUIRED instead. Do not delegate to Work.`;
  }
  if (step === 'PRO_REASONER') {
    return `MC ${requestId}: switch to Pro. Adjudicate using the evidence already present in this same conversation and produce the canonical decision block. Do not delegate to Work.`;
  }
  if (step === 'PRO_LIVENESS_CHECK') {
    return `MC ${requestId}: switch to Extra High only to validate liveness of the immediately preceding Pro turn. Do not reinterpret, improve, replace, or summarize the Pro decision. Determine only whether the requested Pro reasoning stage is actually complete. Read the current stage_receipt_target and request_nonce from Mission Control, then write MISSION_CONTROL_CHAT_STAGE_RECEIPT_V1 with request_id ${requestId}, chat_id ${chatId}, stage PRO_REASONER, and status STAGE_COMPLETE if the Pro stage is complete or CONTINUE_REQUIRED if Pro needs more work. Do not write the canonical decision yet.`;
  }
  if (step === 'EXTRA_HIGH_WRITER') {
    return `MC ${requestId}: remain in Extra High. The immediately preceding Pro stage has a durable STAGE_COMPLETE liveness receipt. Write that same-chat Pro decision as MISSION_CONTROL_CANONICAL_DECISION_V1 to ${location}. Set Pro provenance to SAME_CHAT_WRITER_ATTESTED. Exact copy or structured transformation only; no reinterpretation.`;
  }
  if (isContinueNudgeStep(step)) return 'continue';
  throw new Error(`Unknown supervisory-cycle step: ${step}`);
}

export function nextSupervisoryCycleAction(route, prior, nowMs = Date.now(), continueDelayMs = CONTINUE_NUDGE_DELAY_MS, maxSemanticNudges = 3) {
  if (route.routeKind !== 'SUPERVISORY_CYCLE') return null;
  if (route.decisionReceipt) return { type: 'WAIT_GITHUB_RECEIPT' };
  const status = prior?.status ?? 'UNSEEN';
  if (status === 'FAILED_RETRYABLE' && prior?.cycleStep) {
    if (isContinueNudgeStep(prior.cycleStep)) {
      const stage = semanticStageForStep(prior.cycleStep);
      return stage
        ? { type: 'WAIT_GITHUB_RECEIPT', waitFor: 'STAGE_LIVENESS', stage, recovery: 'CONTINUE_NUDGE_FAILED' }
        : { type: 'WAIT_GITHUB_RECEIPT', recovery: 'CONTINUE_NUDGE_FAILED' };
    }
    return { type: 'SEND_CONTROL', step: prior.cycleStep, model: modelForStep(prior.cycleStep) };
  }
  if (status === 'AMBIGUOUS_AFTER_RESTART' || status === 'SUBMISSION_INTENT_RECORDED') return null;
  if (route.packet.reasoningLane === 'EXTRA_HIGH_DIRECT') {
    if (status === 'UNSEEN' || status === 'RETRY_AUTHORIZED') return { type: 'SEND_CONTROL', step: 'EXTRA_HIGH_DIRECT', model: 'EXTRA_HIGH' };
    if (status === startedCycleStepStatus('EXTRA_HIGH_DIRECT')) return { type: 'WAIT_GENERATION', step: 'EXTRA_HIGH_DIRECT' };
    if (status === completedCycleStepStatus('EXTRA_HIGH_DIRECT')) {
      return continueNudgeEligible(prior, nowMs, continueDelayMs)
        ? { type: 'SEND_CONTROL', step: 'EXTRA_HIGH_DIRECT_CONTINUE', model: 'EXTRA_HIGH', recovery: 'MISSING_FINAL_RECEIPT' }
        : { type: 'WAIT_GITHUB_RECEIPT' };
    }
    if (status === startedCycleStepStatus('EXTRA_HIGH_DIRECT_CONTINUE')) return { type: 'WAIT_GENERATION', step: 'EXTRA_HIGH_DIRECT_CONTINUE' };
    if (status === completedCycleStepStatus('EXTRA_HIGH_DIRECT_CONTINUE')) return { type: 'WAIT_GITHUB_RECEIPT', recovery: 'CONTINUE_NUDGE_EXHAUSTED' };
    return null;
  }

  if (status === 'UNSEEN' || status === 'RETRY_AUTHORIZED') return { type: 'SEND_CONTROL', step: 'EXTRA_HIGH_READER', model: 'EXTRA_HIGH' };
  if (status === startedCycleStepStatus('EXTRA_HIGH_READER') || status === startedCycleStepStatus('EXTRA_HIGH_READER_CONTINUE')) {
    return { type: 'WAIT_GENERATION', step: prior.cycleStep };
  }
  if (status === completedCycleStepStatus('EXTRA_HIGH_READER') || status === completedCycleStepStatus('EXTRA_HIGH_READER_CONTINUE')) {
    return stageReceiptAction({ route, prior, stage: 'EXTRA_HIGH_READER', completeAction: { type: 'SEND_CONTROL', step: 'PRO_REASONER', model: 'PRO' }, continueStep: 'EXTRA_HIGH_READER_CONTINUE', continueModel: 'EXTRA_HIGH', nowMs, maxSemanticNudges });
  }

  if (status === startedCycleStepStatus('PRO_REASONER') || status === startedCycleStepStatus('PRO_REASONER_CONTINUE')) {
    return { type: 'WAIT_GENERATION', step: prior.cycleStep };
  }
  if (status === completedCycleStepStatus('PRO_REASONER') || status === completedCycleStepStatus('PRO_REASONER_CONTINUE')) {
    return { type: 'SEND_CONTROL', step: 'PRO_LIVENESS_CHECK', model: 'EXTRA_HIGH' };
  }

  if (status === startedCycleStepStatus('PRO_LIVENESS_CHECK') || status === startedCycleStepStatus('PRO_LIVENESS_CHECK_CONTINUE')) {
    return { type: 'WAIT_GENERATION', step: prior.cycleStep };
  }
  if (status === completedCycleStepStatus('PRO_LIVENESS_CHECK') || status === completedCycleStepStatus('PRO_LIVENESS_CHECK_CONTINUE')) {
    return stageReceiptAction({ route, prior, stage: 'PRO_REASONER', completeAction: { type: 'SEND_CONTROL', step: 'EXTRA_HIGH_WRITER', model: 'EXTRA_HIGH' }, continueStep: 'PRO_REASONER_CONTINUE', continueModel: 'PRO', missingReceiptContinueStep: 'PRO_LIVENESS_CHECK_CONTINUE', missingReceiptContinueModel: 'EXTRA_HIGH', nowMs, maxSemanticNudges });
  }

  if (status === startedCycleStepStatus('EXTRA_HIGH_WRITER')) return { type: 'WAIT_GENERATION', step: 'EXTRA_HIGH_WRITER' };
  if (status === completedCycleStepStatus('EXTRA_HIGH_WRITER')) {
    return continueNudgeEligible(prior, nowMs, continueDelayMs)
      ? { type: 'SEND_CONTROL', step: 'EXTRA_HIGH_WRITER_CONTINUE', model: 'EXTRA_HIGH', recovery: 'MISSING_FINAL_RECEIPT' }
      : { type: 'WAIT_GITHUB_RECEIPT' };
  }
  if (status === startedCycleStepStatus('EXTRA_HIGH_WRITER_CONTINUE')) return { type: 'WAIT_GENERATION', step: 'EXTRA_HIGH_WRITER_CONTINUE' };
  if (status === completedCycleStepStatus('EXTRA_HIGH_WRITER_CONTINUE')) return { type: 'WAIT_GITHUB_RECEIPT', recovery: 'CONTINUE_NUDGE_EXHAUSTED' };
  return null;
}

function stageReceiptAction({ route, prior, stage, completeAction, continueStep, continueModel, missingReceiptContinueStep = continueStep, missingReceiptContinueModel = continueModel, nowMs, maxSemanticNudges }) {
  const stageState = route.stageLiveness?.[stage] ?? null;
  const receipt = stageState?.latest ?? null;
  const currentAttemptStartedAt = Date.parse(prior?.generationStartedAt ?? '');
  const receiptAt = Date.parse(receipt?.occurredAt ?? '');
  const currentReceipt = receipt && Number.isFinite(currentAttemptStartedAt) && Number.isFinite(receiptAt) && receiptAt >= currentAttemptStartedAt ? receipt : null;
  const continueRequiredCount = stageState?.continueRequiredCount ?? 0;
  if (currentReceipt?.status === 'STAGE_COMPLETE') return { ...completeAction, stageReceiptId: currentReceipt.receiptId, livenessStatus: currentReceipt.status };
  if (currentReceipt?.status === 'CONTINUE_REQUIRED') {
    if (continueRequiredCount > maxSemanticNudges) return { type: 'WAIT_GITHUB_RECEIPT', waitFor: 'STAGE_LIVENESS', stage, recovery: 'SEMANTIC_CONTINUE_LIMIT_REACHED' };
    return { type: 'SEND_CONTROL', step: continueStep, model: continueModel, recovery: 'SEMANTIC_CONTINUE_REQUIRED', stageReceiptId: currentReceipt.receiptId };
  }
  if (stageReceiptGraceElapsed(prior, nowMs)) {
    if (prior?.cycleStep === missingReceiptContinueStep) return { type: 'WAIT_GITHUB_RECEIPT', waitFor: 'STAGE_LIVENESS', stage, recovery: 'MISSING_STAGE_RECEIPT_AFTER_NUDGE' };
    return { type: 'SEND_CONTROL', step: missingReceiptContinueStep, model: missingReceiptContinueModel, recovery: 'MISSING_STAGE_RECEIPT' };
  }
  return { type: 'WAIT_GITHUB_RECEIPT', waitFor: 'STAGE_LIVENESS', stage, recovery: 'AWAITING_STAGE_RECEIPT' };
}

export function isContinueNudgeStep(step) {
  return typeof step === 'string' && step.endsWith('_CONTINUE');
}

function semanticStageForStep(step) {
  if (step?.startsWith('EXTRA_HIGH_READER')) return 'EXTRA_HIGH_READER';
  if (step?.startsWith('PRO_REASONER') || step?.startsWith('PRO_LIVENESS_CHECK')) return 'PRO_REASONER';
  return null;
}

function modelForStep(step) {
  return step?.startsWith('PRO_REASONER') ? 'PRO' : 'EXTRA_HIGH';
}

export function continueNudgeEligible(prior, nowMs = Date.now(), continueDelayMs = CONTINUE_NUDGE_DELAY_MS) {
  if (!prior || !Number.isFinite(nowMs) || !Number.isFinite(continueDelayMs) || continueDelayMs < 0) return false;
  const completedAt = Date.parse(prior.generationCompletedAt ?? '');
  return Number.isFinite(completedAt) && nowMs - completedAt >= continueDelayMs;
}

export function stageReceiptGraceElapsed(prior, nowMs = Date.now(), graceMs = STAGE_RECEIPT_GRACE_MS) {
  if (!prior || !Number.isFinite(nowMs) || !Number.isFinite(graceMs) || graceMs < 0) return false;
  const completedAt = Date.parse(prior.generationCompletedAt ?? '');
  return Number.isFinite(completedAt) && nowMs - completedAt >= graceMs;
}

export function completedCycleStepStatus(step) {
  return `${step}_COMPLETE`;
}

export function startedCycleStepStatus(step) {
  return `${step}_GENERATION_STARTED`;
}

export function submittedCycleStepStatus(step) {
  return startedCycleStepStatus(step);
}

export function defaultState(now = new Date().toISOString()) {
  return {
    schemaVersion: STATE_VERSION,
    createdAt: now,
    updatedAt: now,
    deliveries: {},
    tabs: {},
    submissionPacing: { lastSubmissionAt: null },
    health: { lastCycleAt: null, lastSuccessfulPollAt: null, lastError: null, pressure: 'UNKNOWN', metrics: null, pausedReason: null },
  };
}

export function normalizeState(value, now = new Date().toISOString()) {
  if (!isRecord(value) || value.schemaVersion !== STATE_VERSION) return defaultState(now);
  return {
    schemaVersion: STATE_VERSION,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now,
    deliveries: isRecord(value.deliveries) ? value.deliveries : {},
    tabs: isRecord(value.tabs) ? value.tabs : {},
    submissionPacing: isRecord(value.submissionPacing) && Number.isFinite(Date.parse(value.submissionPacing.lastSubmissionAt ?? ''))
      ? { lastSubmissionAt: value.submissionPacing.lastSubmissionAt }
      : { lastSubmissionAt: null },
    health: isRecord(value.health) ? {
      lastCycleAt: typeof value.health.lastCycleAt === 'string' ? value.health.lastCycleAt : null,
      lastSuccessfulPollAt: typeof value.health.lastSuccessfulPollAt === 'string' ? value.health.lastSuccessfulPollAt : null,
      lastError: typeof value.health.lastError === 'string' ? value.health.lastError : null,
      pressure: typeof value.health.pressure === 'string' ? value.health.pressure : 'UNKNOWN',
      metrics: isRecord(value.health.metrics) ? value.health.metrics : null,
      pausedReason: typeof value.health.pausedReason === 'string' ? value.health.pausedReason : null,
    } : defaultState(now).health,
  };
}

export function resolveMemoryPolicy(totalMb, config = {}) {
  const selected = config.profile === '8GB' || config.profile === '16GB'
    ? config.profile
    : totalMb < 12_288 ? '8GB' : '16GB';
  const preset = selected === '8GB'
    ? { softAvailableMb: 2048, hardAvailableMb: 1024, softBrowserRssMb: 4096, hardBrowserRssMb: 5120, softSwapUsedMb: 256, hardSwapUsedMb: 768 }
    : { softAvailableMb: 4096, hardAvailableMb: 2048, softBrowserRssMb: 7168, hardBrowserRssMb: 9216, softSwapUsedMb: 512, hardSwapUsedMb: 1536 };
  const overrides = isRecord(config.overrides) ? config.overrides : {};
  return {
    profile: selected,
    ...Object.fromEntries(Object.entries(preset).map(([key, fallback]) => [key, Number.isFinite(overrides[key]) ? overrides[key] : fallback])),
  };
}

export function classifyMemoryPressure(metrics, policy) {
  const reasons = [];
  if (metrics.availableMb <= policy.hardAvailableMb) reasons.push(`available memory ${metrics.availableMb} MB <= hard floor ${policy.hardAvailableMb} MB`);
  if (metrics.browserRssMb >= policy.hardBrowserRssMb) reasons.push(`browser RSS ${metrics.browserRssMb} MB >= hard ceiling ${policy.hardBrowserRssMb} MB`);
  if (metrics.swapUsedMb >= policy.hardSwapUsedMb) reasons.push(`swap use ${metrics.swapUsedMb} MB >= hard ceiling ${policy.hardSwapUsedMb} MB`);
  if (reasons.length > 0) return { pressure: 'HARD', reasons };
  if (metrics.availableMb <= policy.softAvailableMb) reasons.push(`available memory ${metrics.availableMb} MB <= soft floor ${policy.softAvailableMb} MB`);
  if (metrics.browserRssMb >= policy.softBrowserRssMb) reasons.push(`browser RSS ${metrics.browserRssMb} MB >= soft ceiling ${policy.softBrowserRssMb} MB`);
  if (metrics.swapUsedMb >= policy.softSwapUsedMb) reasons.push(`swap use ${metrics.swapUsedMb} MB >= soft ceiling ${policy.softSwapUsedMb} MB`);
  if (reasons.length > 0) return { pressure: 'SOFT', reasons };
  return { pressure: 'NORMAL', reasons: [] };
}

export function selectManagedTabClosures({ targets, chats, state, activeTargetId = null, pressure = 'NORMAL', maxHotTabs = 3 }) {
  const chatByUrl = new Map(chats.map((chat) => [chat.url, chat]));
  const managed = targets.flatMap((target) => {
    if (target.type !== 'page' || typeof target.url !== 'string') return [];
    let normalized;
    try { normalized = normalizeConversationUrl(target.url); } catch { return []; }
    const chat = chatByUrl.get(normalized);
    if (!chat) return [];
    const remembered = Object.values(state.tabs ?? {}).find((entry) => isRecord(entry) && entry.targetId === target.id);
    return [{
      targetId: target.id,
      chatId: chat.chatId,
      pinned: chat.pinned,
      lastUsedAt: typeof remembered?.lastUsedAt === 'string' ? remembered.lastUsedAt : '1970-01-01T00:00:00.000Z',
      active: target.id === activeTargetId,
    }];
  });
  const keepBudget = pressure === 'HARD' ? 1 : pressure === 'SOFT' ? Math.min(maxHotTabs, 2) : maxHotTabs;
  if (managed.length <= keepBudget) return [];
  const rankedToKeep = [...managed].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    if (pressure !== 'HARD' && left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return right.lastUsedAt.localeCompare(left.lastUsedAt);
  });
  const keep = new Set(rankedToKeep.slice(0, keepBudget).map((entry) => entry.targetId));
  return managed.filter((entry) => !keep.has(entry.targetId)).sort((left, right) => left.lastUsedAt.localeCompare(right.lastUsedAt)).map((entry) => entry.targetId);
}

export function shouldAttemptRoute(prior, nowMs, retryDelayMs) {
  if (!prior) return true;
  if (prior.status === 'RETRY_AUTHORIZED') return true;
  if (['SUBMITTED_CONFIRMED', 'DISCARDED', 'SUBMISSION_INTENT_RECORDED', 'AMBIGUOUS_AFTER_RESTART'].includes(prior.status)) return false;
  if (prior.status === 'FAILED_RETRYABLE') {
    const last = Date.parse(prior.lastAttemptAt ?? '');
    return Number.isFinite(last) && nowMs - last >= retryDelayMs;
  }
  return false;
}

export function redactError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]').replace(/([?&](?:token|key|secret)=)[^&\s]+/gi, '$1[REDACTED]').slice(0, 2000);
}

function boundedString(value, field, max) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) throw new Error(`${field} must be a non-empty string no longer than ${max} characters.`);
  return value;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
