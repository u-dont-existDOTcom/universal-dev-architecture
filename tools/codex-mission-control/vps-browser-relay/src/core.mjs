import { createHash } from 'node:crypto';

export const INTERNAL_ROUTE_PREFIX = 'MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1\n';
export const STATE_VERSION = 1;

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function normalizeConversationUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Chat URL must be a non-empty string.');
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname !== 'chatgpt.com') {
    throw new Error('Chat URL must be an HTTPS chatgpt.com URL without embedded credentials.');
  }
  const match = url.pathname.match(/^\/c\/([A-Za-z0-9_-]+)\/?$/);
  if (!match) throw new Error('Chat URL must identify one concrete /c/<conversation-id> conversation.');
  return `https://chatgpt.com/c/${match[1]}`;
}

export function parseChatDirectory(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Chat directory must be a non-empty JSON array.');
  }
  const entries = value.map((item, index) => parseChatEntry(item, index));
  const ids = new Set(entries.map((entry) => entry.chatId));
  if (ids.size !== entries.length) throw new Error('Chat IDs must be unique.');
  if (entries.filter((entry) => entry.scope === 'PROJECT_MANAGER').length > 1) {
    throw new Error('Only one Project Manager chat may be configured.');
  }
  return entries;
}

function parseChatEntry(item, index) {
  if (!isRecord(item)) throw new Error(`Chat entry ${index} must be an object.`);
  const scope = item.scope;
  if (scope !== 'PROJECT_MANAGER' && scope !== 'SPECIALIST') {
    throw new Error(`Chat entry ${index} has an invalid scope.`);
  }
  const chatId = boundedString(item.chatId, `Chat entry ${index} chatId`, 300);
  const label = boundedString(item.label, `Chat entry ${index} label`, 300);
  const workerId = item.workerId == null ? null : boundedString(item.workerId, `Chat entry ${index} workerId`, 180);
  const pinned = item.pinned === true || scope === 'PROJECT_MANAGER';
  return {
    scope,
    chatId,
    label,
    url: normalizeConversationUrl(boundedString(item.url, `Chat entry ${index} url`, 1000)),
    workerId,
    pinned,
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
      || typeof value.factualPacket.decisionRequested !== 'string') {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function extractQueuedRoutes(snapshot, chats, state) {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.workers)) {
    throw new Error('Mission Control fleet response does not contain workers.');
  }
  const chatById = new Map(chats.map((entry) => [entry.chatId, entry]));
  const routes = [];
  for (const worker of snapshot.workers) {
    if (!isRecord(worker) || !Array.isArray(worker.timeline)) continue;
    const workerId = typeof worker.id === 'string' ? worker.id : 'unknown-worker';
    const workerName = typeof worker.name === 'string' ? worker.name : workerId;
    for (const event of worker.timeline) {
      if (!isRecord(event) || !isRecord(event.data) || event.data.type !== 'worker_message_recorded') continue;
      const packet = parseInternalSupervisorRouteBody(event.data.body);
      if (!packet) continue;
      const chat = chatById.get(packet.destinationChatId);
      if (!chat) continue;
      const routeKey = `request:${packet.requestId}`;
      const prior = state.deliveries?.[routeKey];
      if (prior && ['SUBMITTED_CONFIRMED', 'DISCARDED'].includes(prior.status)) continue;
      routes.push({
        routeKey,
        requestId: packet.requestId,
        messageId: typeof event.data.message_id === 'string' ? event.data.message_id : null,
        eventId: typeof event.eventId === 'string' ? event.eventId : null,
        workerId,
        workerName,
        chat,
        packet,
        body: event.data.body,
        bodySha256: sha256(event.data.body),
        queuedAt: packet.queuedAt,
        prior: prior ?? null,
      });
    }
  }
  return routes.sort((left, right) => left.queuedAt.localeCompare(right.queuedAt) || left.routeKey.localeCompare(right.routeKey));
}

export function defaultState(now = new Date().toISOString()) {
  return {
    schemaVersion: STATE_VERSION,
    createdAt: now,
    updatedAt: now,
    deliveries: {},
    tabs: {},
    health: {
      lastCycleAt: null,
      lastSuccessfulPollAt: null,
      lastError: null,
      pressure: 'UNKNOWN',
      metrics: null,
      pausedReason: null,
    },
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
    try {
      normalized = normalizeConversationUrl(target.url);
    } catch {
      return [];
    }
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
  return managed
    .filter((entry) => !keep.has(entry.targetId))
    .sort((left, right) => left.lastUsedAt.localeCompare(right.lastUsedAt))
    .map((entry) => entry.targetId);
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
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|key|secret)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, 2000);
}

function boundedString(value, field, max) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
    throw new Error(`${field} must be a non-empty string no longer than ${max} characters.`);
  }
  return value;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
