import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { normalizeConversationUrl, sha256 } from './core.mjs';
import { submissionSchedulerContext } from './submission-context.mjs';
import { workSelectionControls } from './work-selection.mjs';

const PROVIDER_ROOT = 'https://chatgpt.com/';

export async function provisionMcOnlyChat({ config, provision, browser, submissionPacer, body, workCreation = null }) {
  if (!config?.runtime?.submitEnabled) throw new Error('MC_RELAY_SUBMIT_ENABLED=1 is required for live Mission Control-only provisioning.');
  if (!provision || provision.registrationState !== 'PROVISIONING') throw new Error('An exact owner-authorized provisioning registration is required.');
  if (typeof body !== 'string' || body.trim() === '') throw new Error('The provisioning message must be non-empty.');
  const bodySha256 = sha256(body);
  const prior = await readFile(config.runtime.provisionResultsFile, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '[]';
    throw error;
  });
  if (JSON.parse(prior).some((entry) => entry.registrationId === provision.registrationId))
    throw new Error('PROVISION_ALREADY_CREATED_DO_NOT_REPLAY');
  let authorization = null;
  let selection = null;
  if (workCreation) {
    authorization = await workCreation.missionControl.fetchWorkCreationAuthorization(provision.workerId, workCreation.authorizationId);
    if (authorization.worker !== provision.workerId || authorization.authorization_id !== workCreation.authorizationId
      || authorization.directive_artifact_sha256 !== bodySha256) throw new Error('WORK_DIRECTIVE_AUTHORITY_MISMATCH');
    workSelectionControls(authorization.authorized_profile);
  }
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
    beforeSubmit: async () => {
      if (authorization) {
        const refreshed = await workCreation.missionControl.fetchWorkCreationAuthorization(provision.workerId, workCreation.authorizationId);
        if (JSON.stringify(refreshed) !== JSON.stringify(authorization)) throw new Error('WORK_AUTHORITY_CHANGED');
        selection = await browser.ensureExactWorkControls(target, { expectedUrl: PROVIDER_ROOT, profile: authorization.authorized_profile });
        const expected = workSelectionControls(authorization.authorized_profile);
        if (selection?.status !== 'DOM_SELECTION_VERIFIED' || selection.model !== expected.model
          || selection.effort !== expected.effort || selection.managed_target_verified !== true
          || selection.fast_observed !== null) throw new Error('WORK_UI_SELECTION_MISMATCH');
        return selection;
      }
      return browser.ensureExactConsumerControls(target, {
        expectedUrl: PROVIDER_ROOT,
        controls: provision.consumerControls,
      });
    },
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
  if (authorization) {
    // A Work task is not a supervisor chat: never register the supervisor's fixed
    // Extra High controls as if they were the Work selection actually applied.
    delete registration.consumerControls;
    registration.registrationKind = 'WORK_TASK_CREATION';
    registration.workAuthorizationId = authorization.authorization_id;
    registration.workSelection = selection;
  }
  await persistPrivateRegistration(config.runtime.provisionResultsFile, registration);
  if (authorization) {
    const evidenceId = await workCreation.missionControl.recordWorkCreation(authorization, selection, conversationUrl, target);
    return { status: 'BROWSER_TASK_CREATION_TRUSTED_SETTER_ACTIVE', setterEvidenceId: evidenceId,
      conversationUrlSha256: sha256(conversationUrl), inspectedAssistantOutput: false };
  }
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
  const sameSupervisor = entries.find((entry) => registration.registrationKind === 'WORK_TASK_CREATION'
    ? entry?.registrationId === registration.registrationId
    : entry?.registrationKind !== 'WORK_TASK_CREATION' && entry?.supervisorId === registration.supervisorId);
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
