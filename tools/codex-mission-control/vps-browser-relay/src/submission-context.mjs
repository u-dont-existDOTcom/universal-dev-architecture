import { normalizeConversationUrl, sha256 } from './core.mjs';

const PROVIDER_ROOT = 'https://chatgpt.com/';

export function submissionSchedulerContext({ chat, target, expectedUrl, providerSessionId = null, requestId, queueKey, sendPath, bodySha256 }) {
  if (!chat || chat.ownership !== 'MISSION_CONTROL_ONLY' || !chat.registrationId) throw new Error('A current Mission Control-only supervisor registration is required before scheduling a send.');
  if (!target?.id || target.automationOwned !== true || !Number.isInteger(target.automationWindowId)) {
    throw new Error('An exact automation-owned target and window identity are required before scheduling a send.');
  }
  let targetKind;
  let targetKey;
  let canonicalUrl;
  if (chat.registrationState === 'PROVISIONING') {
    if (sendPath !== 'MC_ONLY_PROVISIONING' || expectedUrl !== PROVIDER_ROOT
      || providerSessionId !== chat.provisioningKey
      || !providerSessionId?.startsWith('provider-session:provisioning:')) {
      throw new Error('A provisioning registration permits only its exact Mission Control-only provider-root send.');
    }
    targetKind = 'FRESH_PROVIDER_SESSION';
    targetKey = providerSessionId;
    canonicalUrl = PROVIDER_ROOT;
  } else if (expectedUrl === chat.bootstrapCapability.url) {
    targetKind = 'REGISTERED_BOOTSTRAP';
    targetKey = chat.bootstrapCapability.chatId;
    canonicalUrl = normalizeConversationUrl(expectedUrl);
  } else if (expectedUrl === PROVIDER_ROOT) {
    if (!providerSessionId?.startsWith('provider-session:')) throw new Error('A fresh provider session send requires its exact provider-session ID.');
    targetKind = 'FRESH_PROVIDER_SESSION';
    targetKey = providerSessionId;
    canonicalUrl = PROVIDER_ROOT;
  } else {
    if (!providerSessionId?.startsWith('provider-session:')) throw new Error('A bound provider conversation send requires its exact provider-session ID.');
    targetKind = 'BOUND_PROVIDER_SESSION';
    targetKey = providerSessionId;
    canonicalUrl = normalizeConversationUrl(expectedUrl);
  }
  return {
    requestId,
    authorizationRef: chat.workerId ? `task:${chat.workerId}` : 'task:mission-control',
    queueKey,
    sendPath,
    supervisorId: chat.supervisorId,
    registrationId: chat.registrationId,
    targetId: target.id,
    automationWindowId: target.automationWindowId,
    targetKind,
    targetKey,
    expectedUrlSha256: sha256(canonicalUrl),
    bodySha256,
    hash: sha256,
  };
}
