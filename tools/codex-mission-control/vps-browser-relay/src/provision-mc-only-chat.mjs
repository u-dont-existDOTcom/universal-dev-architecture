import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { normalizeConversationUrl, sha256 } from './core.mjs';
import { submissionSchedulerContext } from './submission-context.mjs';

const PROVIDER_ROOT = 'https://chatgpt.com/';

export async function provisionMcOnlyChat({ config, provision, browser, submissionPacer, body }) {
  if (!config?.runtime?.submitEnabled) throw new Error('MC_RELAY_SUBMIT_ENABLED=1 is required for live Mission Control-only provisioning.');
  if (!provision || provision.registrationState !== 'PROVISIONING') throw new Error('An exact owner-authorized provisioning registration is required.');
  if (typeof body !== 'string' || body.trim() === '') throw new Error('The provisioning message must be non-empty.');
  const bodySha256 = sha256(body);
  const target = await browser.createFreshChatTarget({ hardCeiling: config.runtime.maxHotTabs });
  const context = submissionSchedulerContext({
    chat: provision,
    target,
    expectedUrl: PROVIDER_ROOT,
    providerSessionId: provision.provisioningKey,
    requestId: `provision:${provision.registrationId}`,
    queueKey: `provision:${provision.registrationId}:${bodySha256}`,
    sendPath: 'MC_ONLY_PROVISIONING',
    bodySha256,
  });
  const result = await submissionPacer.submit({
    context,
    beforeSubmit: () => browser.ensureExactConsumerControls(target, {
      expectedUrl: PROVIDER_ROOT,
      controls: provision.consumerControls,
    }),
    submit: (onSubmissionBoundary, _admission, onBeforeSubmissionBoundary) => browser.submitExactMessage(target, {
      expectedUrl: PROVIDER_ROOT,
      body,
      bodySha256,
      onBeforeSubmissionBoundary,
      onSubmissionBoundary,
    }),
  });
  const conversationUrl = normalizeConversationUrl(result?.conversationUrl);
  const registration = activeRegistration(provision, conversationUrl);
  await persistPrivateRegistration(config.runtime.provisionResultsFile, registration);
  return {
    status: 'MISSION_CONTROL_ONLY_CHAT_PROVISIONED',
    supervisorId: provision.supervisorId,
    registrationId: provision.registrationId,
    conversationUrlSha256: sha256(conversationUrl),
    inspectedAssistantOutput: false,
  };
}

function activeRegistration(provision, conversationUrl) {
  const chatId = conversationUrl.slice('https://chatgpt.com/c/'.length);
  return {
    scope: provision.scope,
    supervisorId: provision.supervisorId,
    label: provision.label,
    workerId: provision.workerId,
    pinned: provision.pinned,
    registrationId: provision.registrationId,
    ownership: 'MISSION_CONTROL_ONLY',
    purpose: provision.purpose,
    accountAlias: provision.accountAlias,
    workspaceAlias: provision.workspaceAlias,
    privateLocatorRef: provision.privateLocatorRef,
    registrationProvenance: {
      registeredBy: 'OWNER',
      registeredAt: new Date().toISOString(),
      sourceRef: provision.provisioningProvenance.sourceRef,
    },
    requiredApp: provision.requiredApps.missionControl,
    requiredApps: { ...provision.requiredApps },
    consumerControls: { ...provision.consumerControls },
    bootstrapCapability: {
      chatId,
      url: conversationUrl,
      challengeId: `provisioned:${randomUUID()}`,
    },
  };
}

async function persistPrivateRegistration(filename, registration) {
  let entries = [];
  try {
    entries = JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (!Array.isArray(entries)) throw new Error('Private provision results must be a JSON array.');
  const sameSupervisor = entries.find((entry) => entry?.supervisorId === registration.supervisorId);
  if (sameSupervisor) {
    if (sameSupervisor.registrationId !== registration.registrationId
      || sameSupervisor.bootstrapCapability?.url !== registration.bootstrapCapability.url) {
      throw new Error('A different private registration already exists for this supervisor; refusing to overwrite it.');
    }
    return;
  }
  if (entries.some((entry) => entry?.registrationId === registration.registrationId
    || entry?.bootstrapCapability?.chatId === registration.bootstrapCapability.chatId
    || entry?.bootstrapCapability?.url === registration.bootstrapCapability.url)) {
    throw new Error('Private registration identity or conversation locator collision.');
  }
  entries.push(registration);
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filename);
}
