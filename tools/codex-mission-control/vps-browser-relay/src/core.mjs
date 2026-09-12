import { createHash, randomUUID } from 'node:crypto';

export const INTERNAL_ROUTE_PREFIX = 'MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1\n';
export const SUPERVISORY_CYCLE_ROUTE_PREFIX = 'MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V2\n';
export const PROVIDER_SESSION_CYCLE_ROUTE_PREFIX = 'MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V4\n';
export const STAGED_PROVIDER_SESSION_CYCLE_ROUTE_PREFIX = 'MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V3\n';
export const STATE_VERSION = 1;
export const CAPABILITY_CHALLENGE_SUMMARY = 'MISSION_CONTROL_CHAT_CAPABILITY_CHALLENGE_V1';
export const CAPABILITY_VERIFIED_SUMMARY = 'MISSION_CONTROL_CHAT_CAPABILITY_VERIFIED_V1';
export const MODE_CAPABILITY_VERIFIED_SUMMARY = 'MISSION_CONTROL_CHAT_MODE_CAPABILITY_VERIFIED_V1';
export const RELAY_STAGE_SUMMARY = 'MISSION_CONTROL_RELAY_STAGE_V1';
export const STAGE_LIVENESS_SUMMARY = 'MISSION_CONTROL_CHAT_STAGE_LIVENESS_V1';
export const PROVIDER_SESSION_SUMMARY = 'MISSION_CONTROL_PROVIDER_SESSION_V1';
export const PROVIDER_SESSION_MODEL_SUMMARY = 'MISSION_CONTROL_PROVIDER_SESSION_MODEL_UI_V1';
export const PROVIDER_SESSION_MCP_SUMMARY = 'MISSION_CONTROL_PROVIDER_SESSION_MCP_READ_V1';
export const BINDING_CAPSULE_SUMMARY = 'MISSION_CONTROL_BINDING_CAPSULE_V1';
export const BINDING_ENVELOPE_SUMMARY = 'MISSION_CONTROL_BINDING_ENVELOPE_V1';
export const MCP_BINDING_PRELOAD_STEP = 'MCP_BINDING_PRELOAD';
export const MANAGED_CHATGPT_STEADY_STATE_TABS = 1;
export const MANAGED_CHATGPT_TRANSITION_MAX_TABS = 2;
export const MANAGED_CHATGPT_HARD_CEILING_TABS = 3;
export const CONTINUE_NUDGE_DELAY_MS = 300_000;
export const STAGE_RECEIPT_GRACE_MS = 360_000;
export const CURRENT_CONSUMER_CONTROLS = Object.freeze({
  modelVisibleLabel: 'GPT-5.6 Sol',
  thinkingControlLabel: 'Thinking effort',
  thinkingVisibleLabel: 'Extra High',
  thinkingOrdinal: '4 of 5',
  accountPlanLabel: 'Pro',
  accountPlanRole: 'PROVENANCE_METADATA_ONLY',
  accountPlanIsReasoningMode: false,
});
export const CURRENT_DECISION_SESSION_PROVENANCE = 'VISIBLE_GPT_5_6_SOL_EXTRA_HIGH_4_OF_5_SESSION_GITHUB_ATTESTED';

export function oneShotExitCode(result) {
  return result?.status === 'ERROR' ? 1 : 0;
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function deriveBindingCapsule(route, bindingProviderSessionId, bindingReceiptId) {
  if (route.routeKind !== 'SUPERVISORY_CYCLE') throw new Error('Binding capsules require a supervisory-cycle route.');
  if (!bindingProviderSessionId || !bindingReceiptId) throw new Error('Binding capsules require an exact binding provider session and receipt.');
  const stageIssueNumber = route.packet.githubReceipt.stageIssueNumber;
  if (!Number.isInteger(stageIssueNumber) || stageIssueNumber < 1) throw new Error('Binding capsules require an exact GitHub stage issue number.');
  const capsule = {
    schema_version: 1,
    binding_capsule_id: `binding-capsule:${route.requestId}:${sha256(`${bindingProviderSessionId}:${bindingReceiptId}`).slice(0, 16)}`,
    request_id: route.requestId,
    request_nonce: route.packet.nonce,
    supervisor_id: route.supervisorId,
    binding_provider_session_id: bindingProviderSessionId,
    binding_receipt_id: bindingReceiptId,
    worker_id: route.workerId,
    reasoning_lane: route.packet.reasoningLane,
    queued_at: route.packet.queuedAt,
    expires_at: route.packet.expiresAt,
    evidence_capsule: { ...route.packet.evidenceCapsule },
    owner_outcome: { ...route.packet.ownerOutcome },
    receipt_targets: {
      repository: route.packet.githubReceipt.repository,
      decision_issue_number: route.packet.githubReceipt.issueNumber,
      stage_issue_number: stageIssueNumber,
    },
  };
  return { payload: capsule, sha256: sha256(canonicalJson(capsule)) };
}

export function newProviderSessionId(uuid = randomUUID()) {
  if (typeof uuid !== 'string' || !/^[A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*$/.test(uuid)) throw new Error('Provider session UUID must be a non-empty URL-safe identifier.');
  return `provider-session:${uuid}`;
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
  const ids = new Set(entries.map((entry) => entry.supervisorId));
  if (ids.size !== entries.length) throw new Error('Supervisor IDs must be unique.');
  const registrationIds = new Set(entries.map((entry) => entry.registrationId));
  if (registrationIds.size !== entries.length) throw new Error('Supervisor registration IDs must be unique.');
  const bootstrapChatIds = new Set(entries.map((entry) => entry.bootstrapCapability.chatId));
  if (bootstrapChatIds.size !== entries.length) throw new Error('Bootstrap chat IDs must be unique across supervisors.');
  const bootstrapUrls = new Set(entries.map((entry) => entry.bootstrapCapability.url));
  if (bootstrapUrls.size !== entries.length) throw new Error('Bootstrap conversation URLs must be unique across supervisors.');
  const challenges = new Set(entries.map((entry) => entry.bootstrapCapability.challengeId));
  if (challenges.size !== entries.length) throw new Error('Capability challenge IDs must be unique.');
  if (entries.filter((entry) => entry.scope === 'PROJECT_MANAGER').length > 1) {
    throw new Error('Only one Project Manager chat may be configured.');
  }
  return entries;
}

export function parseChatProvisionDirectory(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Supervisor provision directory must be a non-empty JSON array.');
  const entries = value.map((item, index) => parseChatProvisionEntry(item, index));
  for (const [label, values] of [
    ['supervisor IDs', entries.map((entry) => entry.supervisorId)],
    ['registration IDs', entries.map((entry) => entry.registrationId)],
    ['provisioning keys', entries.map((entry) => entry.provisioningKey)],
  ]) {
    if (new Set(values).size !== values.length) throw new Error(`Supervisor provision ${label} must be unique.`);
  }
  const projectManagers = entries.filter((entry) => entry.scope === 'PROJECT_MANAGER');
  if (projectManagers.length > 1) throw new Error('Only one Project Manager chat may be provisioned.');
  if (projectManagers.length === 1 && projectManagers[0].supervisorId !== 'mc-project-manager') {
    throw new Error('The provisioned Project Manager supervisorId must be mc-project-manager.');
  }
  return entries;
}

function parseChatProvisionEntry(item, index) {
  if (!isRecord(item)) throw new Error(`Supervisor provision ${index} must be an object.`);
  if (item.registrationState !== 'PROVISIONING') throw new Error(`Supervisor provision ${index} registrationState must be PROVISIONING.`);
  for (const forbidden of ['url', 'chatId', 'challengeId', 'capabilityChallengeId', 'bootstrapCapability']) {
    if (Object.hasOwn(item, forbidden)) {
      throw new Error(`Supervisor provision ${index} must not contain a provider conversation locator or bootstrap capability (${forbidden}).`);
    }
  }
  if (!['PROJECT_MANAGER', 'SPECIALIST'].includes(item.scope)) throw new Error(`Supervisor provision ${index} has an invalid scope.`);
  if (item.ownership !== 'MISSION_CONTROL_ONLY') throw new Error(`Supervisor provision ${index} ownership must be explicitly MISSION_CONTROL_ONLY.`);
  if (!isRecord(item.provisioningProvenance) || item.provisioningProvenance.authorizedBy !== 'OWNER') {
    throw new Error(`Supervisor provision ${index} provisioningProvenance.authorizedBy must be OWNER.`);
  }
  const authorizedAt = boundedString(item.provisioningProvenance.authorizedAt, `Supervisor provision ${index} provisioningProvenance.authorizedAt`, 100);
  if (!Number.isFinite(Date.parse(authorizedAt))) throw new Error(`Supervisor provision ${index} provisioningProvenance.authorizedAt must be an ISO timestamp.`);
  const provisioningKey = boundedString(item.provisioningKey, `Supervisor provision ${index} provisioningKey`, 500);
  if (!provisioningKey.startsWith('provider-session:provisioning:')) {
    throw new Error(`Supervisor provision ${index} provisioningKey must use the provider-session:provisioning: namespace.`);
  }
  return {
    registrationState: 'PROVISIONING',
    scope: item.scope,
    supervisorId: boundedString(item.supervisorId, `Supervisor provision ${index} supervisorId`, 300),
    label: boundedString(item.label, `Supervisor provision ${index} label`, 300),
    workerId: item.workerId == null ? null : boundedString(item.workerId, `Supervisor provision ${index} workerId`, 180),
    pinned: item.pinned === true || item.scope === 'PROJECT_MANAGER',
    registrationId: boundedString(item.registrationId, `Supervisor provision ${index} registrationId`, 300),
    provisioningKey,
    ownership: 'MISSION_CONTROL_ONLY',
    purpose: boundedString(item.purpose, `Supervisor provision ${index} purpose`, 500),
    accountAlias: boundedString(item.accountAlias, `Supervisor provision ${index} accountAlias`, 180),
    workspaceAlias: boundedString(item.workspaceAlias, `Supervisor provision ${index} workspaceAlias`, 180),
    privateLocatorRef: boundedString(item.privateLocatorRef, `Supervisor provision ${index} privateLocatorRef`, 500),
    provisioningProvenance: {
      authorizedBy: 'OWNER',
      authorizedAt,
      sourceRef: boundedString(item.provisioningProvenance.sourceRef, `Supervisor provision ${index} provisioningProvenance.sourceRef`, 500),
    },
    consumerControls: parseConsumerControls(item.consumerControls, index),
    requiredApps: parseRequiredApps(item.requiredApps, index),
  };
}

function parseChatEntry(item, index) {
  if (!isRecord(item)) throw new Error(`Chat entry ${index} must be an object.`);
  const scope = item.scope;
  if (scope !== 'PROJECT_MANAGER' && scope !== 'SPECIALIST') throw new Error(`Chat entry ${index} has an invalid scope.`);
  const supervisorId = boundedString(item.supervisorId ?? item.chatId, `Chat entry ${index} supervisorId`, 300);
  const bootstrap = isRecord(item.bootstrapCapability) ? item.bootstrapCapability : item;
  const bootstrapChatId = boundedString(bootstrap.chatId, `Chat entry ${index} bootstrapCapability.chatId`, 300);
  const bootstrapUrl = normalizeConversationUrl(boundedString(bootstrap.url, `Chat entry ${index} bootstrapCapability.url`, 1000));
  const bootstrapChallengeId = boundedString(bootstrap.challengeId ?? bootstrap.capabilityChallengeId, `Chat entry ${index} bootstrapCapability.challengeId`, 180);
  if (item.ownership !== 'MISSION_CONTROL_ONLY') {
    throw new Error(`Chat entry ${index} ownership must be explicitly MISSION_CONTROL_ONLY; personal, legacy-unclassified, and ambiguous conversations are not live-send eligible.`);
  }
  if (!isRecord(item.registrationProvenance) || item.registrationProvenance.registeredBy !== 'OWNER') {
    throw new Error(`Chat entry ${index} registrationProvenance.registeredBy must be OWNER.`);
  }
  const registeredAt = boundedString(item.registrationProvenance.registeredAt, `Chat entry ${index} registrationProvenance.registeredAt`, 100);
  if (!Number.isFinite(Date.parse(registeredAt))) throw new Error(`Chat entry ${index} registrationProvenance.registeredAt must be an ISO timestamp.`);
  return {
    scope,
    supervisorId,
    label: boundedString(item.label, `Chat entry ${index} label`, 300),
    workerId: boundedString(item.workerId, `Chat entry ${index} workerId`, 180),
    pinned: item.pinned === true || scope === 'PROJECT_MANAGER',
    registrationId: boundedString(item.registrationId, `Chat entry ${index} registrationId`, 300),
    ownership: 'MISSION_CONTROL_ONLY',
    purpose: boundedString(item.purpose, `Chat entry ${index} purpose`, 500),
    accountAlias: boundedString(item.accountAlias, `Chat entry ${index} accountAlias`, 180),
    workspaceAlias: boundedString(item.workspaceAlias, `Chat entry ${index} workspaceAlias`, 180),
    privateLocatorRef: boundedString(item.privateLocatorRef, `Chat entry ${index} privateLocatorRef`, 500),
    registrationProvenance: {
      registeredBy: 'OWNER',
      registeredAt,
      sourceRef: boundedString(item.registrationProvenance.sourceRef, `Chat entry ${index} registrationProvenance.sourceRef`, 500),
    },
    bootstrapCapability: {
      chatId: bootstrapChatId,
      url: bootstrapUrl,
      challengeId: bootstrapChallengeId,
    },
    consumerControls: parseConsumerControls(item.consumerControls, index),
    requiredApps: parseRequiredApps(item.requiredApps, index),
  };
}

function parseConsumerControls(value, index) {
  if (!isRecord(value)) throw new Error(`Chat entry ${index} consumerControls must be an object.`);
  const controls = {
    modelVisibleLabel: boundedString(value.modelVisibleLabel, `Chat entry ${index} consumerControls.modelVisibleLabel`, 100),
    thinkingControlLabel: boundedString(value.thinkingControlLabel, `Chat entry ${index} consumerControls.thinkingControlLabel`, 100),
    thinkingVisibleLabel: boundedString(value.thinkingVisibleLabel, `Chat entry ${index} consumerControls.thinkingVisibleLabel`, 100),
    thinkingOrdinal: boundedString(value.thinkingOrdinal, `Chat entry ${index} consumerControls.thinkingOrdinal`, 100),
    accountPlanLabel: boundedString(value.accountPlanLabel, `Chat entry ${index} consumerControls.accountPlanLabel`, 100),
    accountPlanRole: boundedString(value.accountPlanRole, `Chat entry ${index} consumerControls.accountPlanRole`, 100),
    accountPlanIsReasoningMode: value.accountPlanIsReasoningMode,
  };
  if (canonicalJson(controls) !== canonicalJson(CURRENT_CONSUMER_CONTROLS)) {
    throw new Error(`Chat entry ${index} consumerControls must exactly match the fixed current GPT-5.6 Sol / Thinking effort Extra High, 4 of 5 disposition; Pro is account-plan provenance only.`);
  }
  return controls;
}

function parseRequiredApps(value, index) {
  if (!isRecord(value)) throw new Error(`Chat entry ${index} requiredApps must be an object.`);
  return {
    missionControl: boundedString(value.missionControl, `Chat entry ${index} requiredApps.missionControl`, 100),
    github: boundedString(value.github, `Chat entry ${index} requiredApps.github`, 100),
  };
}

export function parseInternalSupervisorRouteBody(body) {
  if (typeof body !== 'string' || !body.startsWith(INTERNAL_ROUTE_PREFIX)) return null;
  try {
    const value = JSON.parse(body.slice(INTERNAL_ROUTE_PREFIX.length));
    if (!isRecord(value)
      || value.schemaVersion !== 1
      || ['routeSchemaVersion', 'continuationBinding', 'continuationBindingSha256', 'continuationOwnerResponseExactText'].some((field) => Object.hasOwn(value, field))
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
  if (typeof body !== 'string') return null;
  const version = body.startsWith(PROVIDER_SESSION_CYCLE_ROUTE_PREFIX) ? 4
    : body.startsWith(STAGED_PROVIDER_SESSION_CYCLE_ROUTE_PREFIX) ? 3
      : body.startsWith(SUPERVISORY_CYCLE_ROUTE_PREFIX) ? 2
        : null;
  if (!version) return null;
  try {
    const prefix = version === 4 ? PROVIDER_SESSION_CYCLE_ROUTE_PREFIX
      : version === 3 ? STAGED_PROVIDER_SESSION_CYCLE_ROUTE_PREFIX
        : SUPERVISORY_CYCLE_ROUTE_PREFIX;
    const value = JSON.parse(body.slice(prefix.length));
    if (!isRecord(value)
      || value.schemaVersion !== version
      || value.packetKind !== (version >= 3 ? 'PROVIDER_SESSION_SUPERVISORY_CYCLE' : 'SAME_CHAT_SUPERVISORY_CYCLE')
      || typeof value.requestId !== 'string'
      || typeof value.nonce !== 'string'
      || (value.reasoningLane !== 'EXTRA_HIGH_DIRECT' && value.reasoningLane !== 'PRO_ESCALATED')
      || (version >= 3 ? typeof value.destinationSupervisorId !== 'string' : typeof value.destinationChatId !== 'string')
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
      || value.githubReceipt.issueNumber < 1
      || !Number.isInteger(value.githubReceipt.stageIssueNumber)
      || value.githubReceipt.stageIssueNumber < 1) return null;
    validateOwnerResponseContinuation(value, version);
    return { ...value, routeSchemaVersion: version, destinationSupervisorId: version >= 3 ? value.destinationSupervisorId : value.destinationChatId };
  } catch {
    return null;
  }
}

// This is private prompt transport. It does not extend the historical binding capsule.
function validateOwnerResponseContinuation(packet, version, workerId, supervisorId = packet.destinationSupervisorId) {
  const fields = ['continuationBinding', 'continuationBindingSha256', 'continuationOwnerResponseExactText'];
  if (!fields.some((field) => Object.hasOwn(packet, field))) return null;
  const fail = () => { throw new Error('Invalid owner-response continuation binding or exact OWNER response text.'); };
  if (version !== 4 || packet.schemaVersion !== 4 || !fields.every((field) => Object.hasOwn(packet, field))) fail();
  const binding = packet.continuationBinding;
  const exactKeys = (value, keys) => isRecord(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
  const identifier = (value) => typeof value === 'string' && value.trim().length > 0;
  const message = (value, extraKeys = []) => exactKeys(value, ['event_id', 'message_id', 'body_sha256', ...extraKeys])
    && identifier(value.event_id) && identifier(value.message_id) && isSha256(value.body_sha256);
  if (!exactKeys(binding, ['schema_version', 'kind', 'continuation_id', 'worker', 'decision_request_id', 'supervisor_id', 'path', 'originating_supervisor_message', 'owner_input', 'supervisor_delivery', 'owner_outcome', 'evidence_capsule', 'issued_at', 'expires_at'])
    || binding.schema_version !== 1 || binding.kind !== 'OWNER_RESPONSE_CONTINUATION'
    || !isSha256(binding.continuation_id) || !identifier(binding.worker) || !identifier(binding.decision_request_id)
    || !identifier(binding.supervisor_id) || binding.supervisor_id !== supervisorId
    || (workerId !== undefined && binding.worker !== workerId)
    || !['DIRECT', 'PROJECT_MANAGER'].includes(binding.path)
    || !message(binding.originating_supervisor_message)
    || !message(binding.owner_input, ['parent_message_id', 'surface_role'])
    || !message(binding.supervisor_delivery, ['parent_message_id'])
    || !exactKeys(binding.owner_outcome, ['id', 'epoch', 'sha256'])
    || !exactKeys(binding.evidence_capsule, ['id', 'sha256'])
    || canonicalJson(binding.owner_outcome) !== canonicalJson(packet.ownerOutcome)
    || canonicalJson(binding.evidence_capsule) !== canonicalJson(packet.evidenceCapsule)
    || binding.issued_at !== packet.queuedAt || binding.expires_at !== packet.expiresAt
    || typeof binding.issued_at !== 'string' || !Number.isFinite(Date.parse(binding.issued_at))
    || typeof binding.expires_at !== 'string' || Date.parse(binding.expires_at) <= Date.parse(binding.issued_at)
    || !Number.isFinite(Date.parse(binding.expires_at))) fail();
  const origin = binding.originating_supervisor_message;
  const input = binding.owner_input;
  const delivery = binding.supervisor_delivery;
  if (input.parent_message_id !== origin.message_id || input.body_sha256 !== delivery.body_sha256
    || origin.message_id === input.message_id || origin.event_id === input.event_id
    || origin.message_id === delivery.message_id || origin.event_id === delivery.event_id) fail();
  if (binding.path === 'DIRECT') {
    if (input.surface_role !== 'SUPERVISOR' || input.event_id !== delivery.event_id
      || input.message_id !== delivery.message_id || delivery.parent_message_id !== origin.message_id) fail();
  } else if (input.surface_role !== 'PROJECT_MANAGER' || delivery.parent_message_id !== input.message_id
    || input.event_id === delivery.event_id || input.message_id === delivery.message_id) fail();
  const { continuation_id, owner_outcome, evidence_capsule, issued_at, expires_at, ...causalFields } = binding;
  if (sha256(canonicalJson(causalFields)) !== continuation_id
    || !isSha256(packet.continuationBindingSha256)
    || sha256(canonicalJson(binding)) !== packet.continuationBindingSha256
    || typeof packet.continuationOwnerResponseExactText !== 'string'
    || sha256(packet.continuationOwnerResponseExactText) !== delivery.body_sha256) fail();
  return binding;
}

export function extractQueuedRoutes(snapshot, chats, state) {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.workers)) throw new Error('Mission Control fleet response does not contain workers.');
  const chatById = new Map(chats.map((entry) => [entry.supervisorId, entry]));
  const receiptByWorkerRequest = new Map();
  const livenessByWorkerRequest = new Map();
  const mcpByWorkerRequest = new Map();
  for (const worker of snapshot.workers) {
    if (!isRecord(worker) || !Array.isArray(worker.timeline)) continue;
    const workerId = typeof worker.id === 'string' ? worker.id : 'unknown-worker';
    for (const event of worker.timeline) {
      if (!isRecord(event?.data)) continue;
      if (event.data.type === 'github_decision_receipt_ingested' && typeof event.data.request_id === 'string') {
        receiptByWorkerRequest.set(`${workerId}:${event.data.request_id}`, event.data);
        continue;
      }
      if (event.data.type === 'evidence_receipt_recorded' && event.data.summary === PROVIDER_SESSION_MCP_SUMMARY
        && event.data.verified === true && Array.isArray(event.data.refs)) {
        const requestId = refValue(event.data.refs, 'request:');
        const supervisorId = refValue(event.data.refs, 'supervisor:');
        const providerSessionId = refValue(event.data.refs, 'provider_session:');
        if (requestId && supervisorId && providerSessionId && event.data.refs.includes('tool:get_supervisory_request_binding') && event.data.refs.includes('status:OK')) {
          mcpByWorkerRequest.set(`${workerId}:${requestId}:${providerSessionId}`, { receiptId: event.data.receipt_id, supervisorId, providerSessionId, occurredAt: event.occurredAt });
        }
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
      const chat = chatById.get(packet.destinationSupervisorId);
      if (!chat || chat.workerId !== workerId) continue;
      if (packet.routeSchemaVersion !== 3 && packet.routeSchemaVersion !== 4) continue;
      try { validateOwnerResponseContinuation(packet, packet.routeSchemaVersion, workerId); } catch { continue; }
      const routeKey = `request:${packet.requestId}`;
      const prior = state.deliveries?.[routeKey];
      if (prior && ['SUBMITTED_CONFIRMED', 'DISCARDED', 'DECISION_RECEIPT_INGESTED'].includes(prior.status)) continue;
      const providerSessionId = prior?.providerSessionId ?? null;
      const bindingProviderSessionId = prior?.bindingProviderSessionId ?? (prior?.cycleStep === MCP_BINDING_PRELOAD_STEP ? providerSessionId : null);
      const workerRequestKey = `${workerId}:${packet.requestId}`;
      routes.push({
        routeKey,
        requestId: packet.requestId,
        messageId: typeof event.data.message_id === 'string' ? event.data.message_id : null,
        eventId: typeof event.eventId === 'string' ? event.eventId : null,
        workerId,
        workerName,
        chat,
        supervisorId: packet.destinationSupervisorId,
        providerSessionId,
        bindingProviderSessionId,
        bindingCapsule: prior?.bindingCapsule ?? null,
        packet,
        routeKind: packet.routeSchemaVersion >= 3 ? 'SUPERVISORY_CYCLE' : 'LEGACY_OUTBOUND',
        decisionReceipt: receiptByWorkerRequest.get(workerRequestKey) ?? null,
        firstTurnMcpReceipt: bindingProviderSessionId
          ? mcpByWorkerRequest.get(`${workerId}:${packet.requestId}:${bindingProviderSessionId}`) ?? null
          : null,
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
  const supervisorId = refValue(event.data.refs, 'supervisor:');
  const bindingProviderSessionId = refValue(event.data.refs, 'binding_provider_session:');
  const stageProviderSessionId = refValue(event.data.refs, 'stage_provider_session:');
  const stage = refValue(event.data.refs, 'stage:');
  const status = refValue(event.data.refs, 'status:');
  if (!requestId || !supervisorId || !bindingProviderSessionId || !stageProviderSessionId || !['EXTRA_HIGH_READER', 'PRO_DECISION_STAGE'].includes(stage) || !['STAGE_COMPLETE', 'CONTINUE_REQUIRED'].includes(status)) return null;
  return {
    receiptId: event.data.receipt_id,
    requestId,
    supervisorId,
    bindingProviderSessionId,
    stageProviderSessionId,
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
    `challenge:${chat.bootstrapCapability.challengeId}`,
    `chat:${chat.bootstrapCapability.chatId}`,
  ], now, false);
  const capability = latestEvidence(timeline, CAPABILITY_VERIFIED_SUMMARY, [
    `challenge:${chat.bootstrapCapability.challengeId}`,
    `chat:${chat.bootstrapCapability.chatId}`,
    'capability:missionControlRead',
    'capability:githubRead',
    'capability:githubWrite',
  ], now, true);
  const mode = latestEvidence(timeline, MODE_CAPABILITY_VERIFIED_SUMMARY, [
    `chat:${chat.bootstrapCapability.chatId}`,
    'capability:modeSwitching',
    ...consumerControlRefs(chat.consumerControls),
  ], now, true);
  return {
    supervisorId: chat.supervisorId,
    chatId: chat.bootstrapCapability.chatId,
    challengeId: chat.bootstrapCapability.challengeId,
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

export function consumerControlRefs(controls) {
  return [
    `model_visible_label:${controls.modelVisibleLabel}`,
    `thinking_control_label:${controls.thinkingControlLabel}`,
    `thinking_visible_label:${controls.thinkingVisibleLabel}`,
    `thinking_ordinal:${controls.thinkingOrdinal}`,
    `account_plan_label:${controls.accountPlanLabel}`,
    `account_plan_role:${controls.accountPlanRole}`,
    `account_plan_is_reasoning_mode:${controls.accountPlanIsReasoningMode}`,
  ];
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

export function capabilityControlPrompt(chat) {
  return `Mission Control capability test for challenge ${chat.bootstrapCapability.challengeId} and chat ${chat.bootstrapCapability.chatId}. Use the selected ${chat.requiredApps.missionControl} app and call get_capability_challenge for exactly that challenge_id and chat_id. Do not infer or reuse any nonce from this prompt or prior context. Then follow the returned github_nonce_source using ${chat.requiredApps.github}, reread the raw nonce, verify its SHA-256 equals the live github_nonce_sha256, and write exactly one MISSION_CONTROL_CHAT_CAPABILITY_RECEIPT_V1 to the returned receipt_target with the exact ordered capabilities ["MISSION_CONTROL_READ","GITHUB_READ","GITHUB_WRITE"]. Make no substantive project decision. Fail closed without writing if any live field, hash, binding, or expiry check fails.`;
}

export function mcpReadPreflightPrompt(chat) {
  return `Mission Control read-only MCP preflight for capability challenge ${chat.bootstrapCapability.challengeId} and chat ${chat.bootstrapCapability.chatId}: remain in Extra High. Use the selected ${chat.requiredApps.missionControl} app and call get_capability_challenge with challenge_id ${chat.bootstrapCapability.challengeId} and chat_id ${chat.bootstrapCapability.chatId}. Fail closed if the exact tool, challenge, or chat binding is unavailable or mismatched, or if expires_at has passed. This is a read-only connectivity preflight: do not use GitHub, do not write or mutate anything, do not delegate to Work, and stop after the tool call.`;
}

export function appSelectionForMessage(chat, step) {
  const missionControl = chat.requiredApps.missionControl;
  const github = chat.requiredApps.github;
  const knownLabels = [...new Set([missionControl, github])];
  const missionControlSteps = new Set([
    'CAPABILITY',
    'MCP_PREFLIGHT',
    MCP_BINDING_PRELOAD_STEP,
  ]);
  const githubSteps = new Set([
    'EXTRA_HIGH_DIRECT',
    'EXTRA_HIGH_READER',
    'PRO_REASONER',
    'EXTRA_HIGH_WRITER',
  ]);
  const requiredLabels = [];
  const referencedLabels = [];
  if (missionControlSteps.has(step)) requiredLabels.push(missionControl);
  if (githubSteps.has(step)) requiredLabels.push(github);
  if (step === 'EXTRA_HIGH_DECISION' || step === 'PRO_DECISION') referencedLabels.push(github);
  if (step === 'CAPABILITY') referencedLabels.push(github);
  return { knownLabels, requiredLabels, referencedLabels };
}

export function cycleControlPrompt(route, step, { omitContinuationOwnerExactText = false } = {}) {
  if (route.routeKind !== 'SUPERVISORY_CYCLE') throw new Error('Control prompts require a supervisory-cycle route.');
  const requestId = route.requestId;
  const location = `${route.packet.githubReceipt.repository}#${route.packet.githubReceipt.issueNumber}`;
  const supervisorId = route.supervisorId ?? route.chat.supervisorId;
  const providerSessionId = route.providerSessionId;
  if (!providerSessionId) throw new Error('A provider session must be allocated before constructing a supervisory-cycle prompt.');
  const missionControl = route.chat.requiredApps.missionControl;
  const github = route.chat.requiredApps.github;
  if (step === MCP_BINDING_PRELOAD_STEP) {
    return `Mission Control binding preload only. Use the selected ${missionControl} app. Your only action in this turn is to call get_supervisory_request_binding exactly once with request_id ${requestId}, supervisor_id ${supervisorId}, and provider_session_id ${providerSessionId}. Do not reason, use GitHub, make a decision, write a receipt, or answer from values in this prompt/context instead of calling the tool. If the exact tool call is unavailable or fails, fail closed. After the tool result is loaded into this conversation, stop.`;
  }
  if (route.packet.routeSchemaVersion === 4 && (step === 'EXTRA_HIGH_DECISION' || step === 'PRO_DECISION')) {
    const provenance = CURRENT_DECISION_SESSION_PROVENANCE;
    const laneInstruction = step === 'PRO_DECISION'
      ? 'Use the escalated semantic decision lane in the fixed visible GPT-5.6 Sol session with Thinking effort Extra High, 4 of 5; Pro is account-plan provenance only, not a reasoning mode.'
      : 'Use the ordinary semantic decision lane in the fixed visible GPT-5.6 Sol session with Thinking effort Extra High, 4 of 5.';
    const continuationInstruction = route.packet.continuationBinding
      ? ' Copy the supplied continuation_binding and continuation_binding_sha256 exactly into the canonical schema_version 3 decision as optional top-level fields outside binding_envelope.' : '';
    return freshToolStagePrompt(route, step, `${laneInstruction} Use the connected ${github} tool to read the immutable evidence and write MISSION_CONTROL_CANONICAL_DECISION_V1 to ${location} as schema_version 3 in this same first message. Set decision_provider_session_id to ${providerSessionId}, copy the supplied binding envelope and digest exactly, and set decision_session_provenance to ${provenance}.${continuationInstruction} Do not use or call Mission Control. No later writer, reader, liveness, continue, or follow-up tool turn is permitted.`, { omitContinuationOwnerExactText });
  }
  if (step === 'EXTRA_HIGH_DIRECT') {
    return freshToolStagePrompt(route, step, `Read the substantive evidence only from the immutable GitHub references, make the bounded decision requested, and write MISSION_CONTROL_CANONICAL_DECISION_V1 to ${location} as schema_version 2 in this same first message. Set stage_provider_session_id to ${providerSessionId}.`);
  }
  if (step === 'EXTRA_HIGH_READER') {
    return freshToolStagePrompt(route, step, `Read the substantive evidence only from the immutable GitHub references. Do not decide. Write MISSION_CONTROL_CHAT_STAGE_RECEIPT_V1 to ${route.packet.githubReceipt.repository}#${route.packet.githubReceipt.stageIssueNumber} as schema_version 2 in this same first message, with stage EXTRA_HIGH_READER, stage_provider_session_id ${providerSessionId}, status STAGE_COMPLETE or CONTINUE_REQUIRED, and a compact evidence_reading_capsule with its SHA-256 for downstream Pro construction.`);
  }
  if (step === 'PRO_REASONER') {
    return freshToolStagePrompt(route, step, `Use ${github} to read the current EXTRA_HIGH_READER receipt and its evidence-reading capsule from ${route.packet.githubReceipt.repository}#${route.packet.githubReceipt.stageIssueNumber}. Adjudicate in Pro and write MISSION_CONTROL_CHAT_STAGE_RECEIPT_V1 to that issue as schema_version 2 in this same first message, with stage PRO_DECISION_STAGE, stage_provider_session_id ${providerSessionId}, status STAGE_COMPLETE or CONTINUE_REQUIRED, and the canonical pro_decision_block exact text and SHA-256. Semantic authority belongs only to Pro.`);
  }
  if (step === 'EXTRA_HIGH_WRITER') {
    return freshToolStagePrompt(route, step, `Use ${github} to read the current ordered EXTRA_HIGH_READER and PRO_DECISION_STAGE receipts from ${route.packet.githubReceipt.repository}#${route.packet.githubReceipt.stageIssueNumber}. Check completeness without reinterpreting the Pro decision. If complete, write MISSION_CONTROL_CANONICAL_DECISION_V1 to ${location} as schema_version 2 in this same first message, set stage_provider_session_id to ${providerSessionId}, set Pro provenance to DURABLE_STAGE_RECEIPT_ATTESTED, and preserve the Pro decision by exact copy or structured transformation only.`);
  }
  throw new Error(`Unknown supervisory-cycle step: ${step}`);
}

function freshToolStagePrompt(route, step, instruction, { omitContinuationOwnerExactText = false } = {}) {
  if (!route.bindingCapsule?.payload || !route.bindingCapsule?.sha256) throw new Error(`${step} requires a mechanically derived binding capsule.`);
  if (route.bindingCapsule.payload.binding_provider_session_id === route.providerSessionId) throw new Error(`${step} must use a provider session distinct from the binding preload session.`);
  const evidenceRefs = route.packet.factualPacket?.evidenceRefs ?? [];
  const decisionRequested = route.packet.factualPacket?.decisionRequested ?? '';
  const direct = route.packet.routeSchemaVersion === 4;
  const bindingLabel = direct ? 'binding envelope' : 'binding capsule';
  const digestLabel = direct ? 'binding_envelope_sha256' : 'binding_capsule_sha256';
  const continuation = validateOwnerResponseContinuation(route.packet, route.packet.routeSchemaVersion, route.workerId, route.supervisorId);
  const continuationPrompt = continuation
    ? ` continuation_binding: ${canonicalJson(continuation)}. continuation_binding_sha256: ${route.packet.continuationBindingSha256}.${omitContinuationOwnerExactText
      ? ' The exact OWNER response is intentionally not embedded in this prompt; obtain it only from the separately controller-bound immutable GitHub artifact.\n'
      : ` The following exact text is the OWNER-authored response delivered to this supervisor, supplied for this fresh decision.\nBEGIN EXACT OWNER RESPONSE\n${route.packet.continuationOwnerResponseExactText}\nEND EXACT OWNER RESPONSE\n`}` : '';
  return `Mission Control fresh-first-message stage ${step} for request ${route.requestId}. Use the connected ${route.chat.requiredApps.github} tool; a selectable composer chip is not required. This is the first and only message in provider session ${route.providerSessionId}; do not use Mission Control or prior-chat memory. Copy this exact ${bindingLabel} into the receipt without alteration: ${canonicalJson(route.bindingCapsule.payload)}. ${digestLabel}: ${route.bindingCapsule.sha256}. Immutable GitHub evidence references: ${canonicalJson(evidenceRefs)}. Bounded decision request: ${JSON.stringify(decisionRequested)}.${continuationPrompt || ' '}${instruction} Do not answer with prose instead of attempting the required GitHub write. If GitHub is unavailable, the binding/hash mismatches, or the write fails, fail closed. Do not delegate to Work.`;
}

export function nextSupervisoryCycleAction(route, prior, nowMs = Date.now(), continueDelayMs = CONTINUE_NUDGE_DELAY_MS, maxSemanticNudges = 3) {
  if (route.routeKind !== 'SUPERVISORY_CYCLE') return null;
  if (route.decisionReceipt) return { type: 'WAIT_GITHUB_RECEIPT' };
  const status = prior?.status ?? 'UNSEEN';
  const directDecisionStep = route.packet.routeSchemaVersion === 4
    ? (route.packet.reasoningLane === 'PRO_ESCALATED' ? 'PRO_DECISION' : 'EXTRA_HIGH_DECISION')
    : null;
  if (status === 'FAILED_RETRYABLE' && prior?.cycleStep) {
    if (directDecisionStep && prior.cycleStep === directDecisionStep) {
      return { type: 'WAIT_GITHUB_RECEIPT', recovery: 'MANDATORY_DECISION_STAGE_FAILED_NO_AUTOMATIC_RETRY' };
    }
    if (isContinueNudgeStep(prior.cycleStep)) {
      const stage = semanticStageForStep(prior.cycleStep);
      return stage
        ? { type: 'WAIT_GITHUB_RECEIPT', waitFor: 'STAGE_LIVENESS', stage, recovery: 'CONTINUE_NUDGE_FAILED' }
        : { type: 'WAIT_GITHUB_RECEIPT', recovery: 'CONTINUE_NUDGE_FAILED' };
    }
    return { type: 'SEND_CONTROL', step: prior.cycleStep, model: modelForStep(prior.cycleStep) };
  }
  if (status === 'AMBIGUOUS_AFTER_RESTART' || status === 'SUBMISSION_INTENT_RECORDED') return null;
  if (status === 'UNSEEN' || status === 'RETRY_AUTHORIZED') return { type: 'SEND_CONTROL', step: MCP_BINDING_PRELOAD_STEP, model: 'EXTRA_HIGH' };
  if (status === startedCycleStepStatus(MCP_BINDING_PRELOAD_STEP)) return { type: 'WAIT_GENERATION', step: MCP_BINDING_PRELOAD_STEP };
  if (status === completedCycleStepStatus(MCP_BINDING_PRELOAD_STEP) && !route.firstTurnMcpReceipt) {
    return { type: 'WAIT_MCP_BINDING_RECEIPT', step: MCP_BINDING_PRELOAD_STEP };
  }
  if (directDecisionStep) {
    const model = directDecisionStep === 'PRO_DECISION' ? 'PRO' : 'EXTRA_HIGH';
    if (status === completedCycleStepStatus(MCP_BINDING_PRELOAD_STEP)) return { type: 'SEND_CONTROL', step: directDecisionStep, model };
    if (status === startedCycleStepStatus(directDecisionStep)) return { type: 'WAIT_GENERATION', step: directDecisionStep };
    if (status === completedCycleStepStatus(directDecisionStep)) {
      return continueNudgeEligible(prior, nowMs, continueDelayMs)
        ? { type: 'WAIT_GITHUB_RECEIPT', recovery: 'MANDATORY_DECISION_RECEIPT_MISSING_NO_AUTOMATIC_RETRY' }
        : { type: 'WAIT_GITHUB_RECEIPT', recovery: 'AWAITING_MANDATORY_DECISION_RECEIPT' };
    }
    return null;
  }
  if (route.packet.reasoningLane === 'EXTRA_HIGH_DIRECT') {
    if (status === completedCycleStepStatus(MCP_BINDING_PRELOAD_STEP)) return { type: 'SEND_CONTROL', step: 'EXTRA_HIGH_DIRECT', model: 'EXTRA_HIGH' };
    if (status === startedCycleStepStatus('EXTRA_HIGH_DIRECT')) return { type: 'WAIT_GENERATION', step: 'EXTRA_HIGH_DIRECT' };
    if (status === completedCycleStepStatus('EXTRA_HIGH_DIRECT')) {
      return freshStageReplayAction(prior, 'EXTRA_HIGH_DIRECT', 'EXTRA_HIGH', nowMs, continueDelayMs, maxSemanticNudges, 'MISSING_FINAL_RECEIPT');
    }
    return null;
  }

  if (status === completedCycleStepStatus(MCP_BINDING_PRELOAD_STEP)) return { type: 'SEND_CONTROL', step: 'EXTRA_HIGH_READER', model: 'EXTRA_HIGH' };
  if (status === startedCycleStepStatus('EXTRA_HIGH_READER')) {
    return { type: 'WAIT_GENERATION', step: 'EXTRA_HIGH_READER' };
  }
  if (status === completedCycleStepStatus('EXTRA_HIGH_READER')) {
    return stageReceiptAction({ route, prior, stage: 'EXTRA_HIGH_READER', completeAction: { type: 'SEND_CONTROL', step: 'PRO_REASONER', model: 'PRO' }, replayStep: 'EXTRA_HIGH_READER', replayModel: 'EXTRA_HIGH', nowMs, graceMs: STAGE_RECEIPT_GRACE_MS, maxAttempts: maxSemanticNudges });
  }

  if (status === startedCycleStepStatus('PRO_REASONER')) {
    return { type: 'WAIT_GENERATION', step: 'PRO_REASONER' };
  }
  if (status === completedCycleStepStatus('PRO_REASONER')) {
    return stageReceiptAction({ route, prior, stage: 'PRO_DECISION_STAGE', completeAction: { type: 'SEND_CONTROL', step: 'EXTRA_HIGH_WRITER', model: 'EXTRA_HIGH' }, replayStep: 'PRO_REASONER', replayModel: 'PRO', nowMs, graceMs: STAGE_RECEIPT_GRACE_MS, maxAttempts: maxSemanticNudges });
  }

  if (status === startedCycleStepStatus('EXTRA_HIGH_WRITER')) return { type: 'WAIT_GENERATION', step: 'EXTRA_HIGH_WRITER' };
  if (status === completedCycleStepStatus('EXTRA_HIGH_WRITER')) {
    return freshStageReplayAction(prior, 'EXTRA_HIGH_WRITER', 'EXTRA_HIGH', nowMs, continueDelayMs, maxSemanticNudges, 'MISSING_FINAL_RECEIPT');
  }
  return null;
}

function stageReceiptAction({ route, prior, stage, completeAction, replayStep, replayModel, nowMs, graceMs, maxAttempts }) {
  const stageState = route.stageLiveness?.[stage] ?? null;
  const receipt = stageState?.latest ?? null;
  const currentAttemptStartedAt = Date.parse(prior?.generationStartedAt ?? '');
  const receiptAt = Date.parse(receipt?.occurredAt ?? '');
  const currentReceipt = receipt
    && receipt.bindingProviderSessionId === route.bindingProviderSessionId
    && receipt.stageProviderSessionId === prior?.providerSessionId
    && Number.isFinite(currentAttemptStartedAt)
    && Number.isFinite(receiptAt)
    && receiptAt >= currentAttemptStartedAt
    ? receipt
    : null;
  if (currentReceipt?.status === 'STAGE_COMPLETE') return { ...completeAction, stageReceiptId: currentReceipt.receiptId, livenessStatus: currentReceipt.status };
  if (currentReceipt?.status === 'CONTINUE_REQUIRED') {
    if (stageAttemptCount(prior, replayStep) >= maxAttempts) return { type: 'WAIT_GITHUB_RECEIPT', waitFor: 'STAGE_LIVENESS', stage, recovery: 'FRESH_STAGE_REPLAY_LIMIT_REACHED' };
    return { type: 'SEND_CONTROL', step: replayStep, model: replayModel, recovery: 'FRESH_STAGE_CONTINUATION_REQUIRED', stageReceiptId: currentReceipt.receiptId };
  }
  if (stageReceiptGraceElapsed(prior, nowMs, graceMs)) {
    if (stageAttemptCount(prior, replayStep) >= maxAttempts) return { type: 'WAIT_GITHUB_RECEIPT', waitFor: 'STAGE_LIVENESS', stage, recovery: 'FRESH_STAGE_REPLAY_LIMIT_REACHED' };
    return { type: 'SEND_CONTROL', step: replayStep, model: replayModel, recovery: 'MISSING_STAGE_RECEIPT_FRESH_REPLAY' };
  }
  return { type: 'WAIT_GITHUB_RECEIPT', waitFor: 'STAGE_LIVENESS', stage, recovery: 'AWAITING_STAGE_RECEIPT' };
}

function freshStageReplayAction(prior, step, model, nowMs, delayMs, maxAttempts, recovery) {
  if (!continueNudgeEligible(prior, nowMs, delayMs)) return { type: 'WAIT_GITHUB_RECEIPT' };
  if (stageAttemptCount(prior, step) >= maxAttempts) return { type: 'WAIT_GITHUB_RECEIPT', recovery: 'FRESH_STAGE_REPLAY_LIMIT_REACHED' };
  return { type: 'SEND_CONTROL', step, model, recovery: `${recovery}_FRESH_REPLAY` };
}

function stageAttemptCount(prior, step) {
  return Number.isInteger(prior?.stageAttempts?.[step]) ? prior.stageAttempts[step] : 1;
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
    controllerCycles: {},
    providerSessions: {},
    tabs: {},
    submissionPacing: { lastSubmissionAt: null, lastAdmissionId: null },
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
    controllerCycles: isRecord(value.controllerCycles) ? value.controllerCycles : {},
    providerSessions: isRecord(value.providerSessions) ? value.providerSessions : {},
    tabs: isRecord(value.tabs) ? value.tabs : {},
    submissionPacing: isRecord(value.submissionPacing) && Number.isFinite(Date.parse(value.submissionPacing.lastSubmissionAt ?? ''))
      ? { lastSubmissionAt: value.submissionPacing.lastSubmissionAt, lastAdmissionId: typeof value.submissionPacing.lastAdmissionId === 'string' ? value.submissionPacing.lastAdmissionId : null }
      : { lastSubmissionAt: null, lastAdmissionId: null },
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
  const bootstrapByUrl = new Map(chats.map((chat) => [chat.bootstrapCapability.url, chat]));
  const rememberedByTarget = new Map(Object.values(state.tabs ?? {}).filter(isRecord).map((entry) => [entry.targetId, entry]));
  const managed = targets.flatMap((target) => {
    if (!isManagedChatGptTarget(target)) return [];
    let normalized = null;
    try { normalized = normalizeConversationUrl(target.url); } catch { /* fresh root is still managed */ }
    const remembered = rememberedByTarget.get(target.id);
    const chat = bootstrapByUrl.get(normalized);
    return [{
      targetId: target.id,
      chatId: remembered?.chatId ?? chat?.bootstrapCapability.chatId ?? null,
      providerSessionId: remembered?.providerSessionId ?? null,
      lastUsedAt: typeof remembered?.lastUsedAt === 'string' ? remembered.lastUsedAt : '1970-01-01T00:00:00.000Z',
      active: target.id === activeTargetId,
    }];
  });
  const hardCeiling = Math.min(maxHotTabs, MANAGED_CHATGPT_HARD_CEILING_TABS);
  if (managed.length > hardCeiling && activeTargetId && !managed.some((entry) => entry.active)) {
    throw new Error(`Managed ChatGPT tab count ${managed.length} exceeds hard ceiling ${hardCeiling} without the active target.`);
  }
  const keepBudget = MANAGED_CHATGPT_STEADY_STATE_TABS;
  if (managed.length <= keepBudget) return [];
  const rankedToKeep = [...managed].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    return right.lastUsedAt.localeCompare(left.lastUsedAt);
  });
  const keep = new Set(rankedToKeep.slice(0, keepBudget).map((entry) => entry.targetId));
  return managed.filter((entry) => !keep.has(entry.targetId)).sort((left, right) => left.lastUsedAt.localeCompare(right.lastUsedAt)).map((entry) => entry.targetId);
}

export function isManagedChatGptTarget(target) {
  if (target?.type !== 'page' || typeof target.url !== 'string') return false;
  try {
    const url = new URL(target.url);
    return url.protocol === 'https:' && url.hostname === 'chatgpt.com';
  } catch {
    return false;
  }
}

export function managedChatGptTabTelemetry(targets) {
  const managedChatGptTabCount = Array.isArray(targets) ? targets.filter(isManagedChatGptTarget).length : 0;
  return {
    managedChatGptTabCount,
    steadyStateTarget: MANAGED_CHATGPT_STEADY_STATE_TABS,
    transitionMax: MANAGED_CHATGPT_TRANSITION_MAX_TABS,
    hardCeiling: MANAGED_CHATGPT_HARD_CEILING_TABS,
    hardCeilingExceeded: managedChatGptTabCount > MANAGED_CHATGPT_HARD_CEILING_TABS,
  };
}

export function freshChatTargetPlan(targets, { reusableTargetId = null, reuseFailed = false, hardCeiling = MANAGED_CHATGPT_HARD_CEILING_TABS } = {}) {
  if (!Number.isInteger(hardCeiling) || hardCeiling < 1 || hardCeiling > MANAGED_CHATGPT_HARD_CEILING_TABS) {
    throw new Error(`Managed ChatGPT hard ceiling must be 1-${MANAGED_CHATGPT_HARD_CEILING_TABS}.`);
  }
  const pages = Array.isArray(targets) ? targets.filter((target) => target?.type === 'page') : [];
  const managed = pages.filter(isManagedChatGptTarget);
  const reusable = pages.find((target) => target.id === reusableTargetId) ?? managed[0] ?? null;
  if (reusable && !reuseFailed) return { type: 'REUSE_CURRENT', targetId: reusable.id, managedChatGptTabCount: managed.length };
  if (managed.length >= hardCeiling) {
    throw new Error(`MANAGED_CHATGPT_TAB_HARD_CEILING: refusing to open managed tab ${managed.length + 1}; ceiling is ${hardCeiling}.`);
  }
  if (reusable && reuseFailed) {
    return { type: 'OPEN_REPLACEMENT', supersededTargetId: reusable.id, managedChatGptTabCount: managed.length };
  }
  return { type: 'OPEN_INITIAL', supersededTargetId: null, managedChatGptTabCount: managed.length };
}

export async function replaceUnusableManagedChatGptTarget({
  targets,
  reusableTargetId,
  hardCeiling = MANAGED_CHATGPT_HARD_CEILING_TABS,
  openReplacement,
  verifyReplacement,
  closeTarget,
}) {
  const plan = freshChatTargetPlan(targets, { reusableTargetId, reuseFailed: true, hardCeiling });
  const replacement = await openReplacement();
  try {
    await verifyReplacement(replacement);
  } catch (error) {
    await closeTarget(replacement.id).catch(() => {});
    throw error;
  }
  if (plan.supersededTargetId) await closeTarget(plan.supersededTargetId);
  return { ...replacement, created: true, reused: false, replacedTargetId: plan.supersededTargetId };
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
