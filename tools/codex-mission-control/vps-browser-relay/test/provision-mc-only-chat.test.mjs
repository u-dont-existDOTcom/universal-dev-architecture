import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseChatProvisionDirectory, sha256 } from '../src/core.mjs';
import { provisionMcOnlyChat } from '../src/provision-mc-only-chat.mjs';

test('private provisioning persists the locator without returning it or inspecting assistant output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mc-only-provision-'));
  const resultsFile = path.join(root, 'private', 'provisioned-chats.json');
  const provision = parseChatProvisionDirectory([provisionEntry()])[0];
  const contexts = [];
  const browser = {
    async createFreshChatTarget() {
      return { id: 'owned-target', automationOwned: true, automationWindowId: 101, url: 'https://chatgpt.com/' };
    },
    async ensureExactConsumerControls(_target, input) {
      assert.equal(input.expectedUrl, 'https://chatgpt.com/');
      assert.deepEqual(input.controls, provision.consumerControls);
      return { status: 'FIXED_CONSUMER_CONTROLS_VERIFIED', inspectedAssistantOutput: false };
    },
    async submitExactMessage(_target, input) {
      await input.onBeforeSubmissionBoundary();
      await input.onSubmissionBoundary({ clickedAtObserved: '2026-09-12T12:00:01.000Z' });
      return {
        conversationUrl: 'https://chatgpt.com/c/private-provisioned-chat',
        clickedAtObserved: '2026-09-12T12:00:01.000Z',
        generationStarted: true,
        inspectedAssistantOutput: false,
      };
    },
  };
  const submissionPacer = {
    async submit(input) {
      contexts.push(input.context);
      await input.beforeSubmit();
      return input.submit(async () => {}, {}, async () => {});
    },
  };
  try {
    const result = await provisionMcOnlyChat({
      config: { runtime: { submitEnabled: true, maxHotTabs: 3, provisionResultsFile: resultsFile } },
      provision,
      browser,
      submissionPacer,
      body: 'Initialize the private Mission Control-only task.',
    });
    assert.deepEqual(result, {
      status: 'MISSION_CONTROL_ONLY_CHAT_PROVISIONED',
      supervisorId: 'mc-project-manager',
      registrationId: 'registration:pm:provisioning:test',
      conversationUrlSha256: sha256('https://chatgpt.com/c/private-provisioned-chat'),
      inspectedAssistantOutput: false,
    });
    assert.equal(JSON.stringify(result).includes('/c/'), false);
    assert.equal(contexts[0].sendPath, 'MC_ONLY_PROVISIONING');
    assert.equal(contexts[0].targetKind, 'FRESH_PROVIDER_SESSION');
    assert.equal(contexts[0].targetKey, provision.provisioningKey);
    assert.equal(contexts[0].expectedUrlSha256, sha256('https://chatgpt.com/'));
    const privateEntries = JSON.parse(await readFile(resultsFile, 'utf8'));
    assert.equal(privateEntries[0].bootstrapCapability.url, 'https://chatgpt.com/c/private-provisioned-chat');
    assert.equal((await stat(resultsFile)).mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function provisionEntry() {
  return {
    registrationState: 'PROVISIONING', scope: 'PROJECT_MANAGER', supervisorId: 'mc-project-manager',
    label: 'Mission Control Project Manager', workerId: 'mission-control-live-slice', pinned: true,
    registrationId: 'registration:pm:provisioning:test', provisioningKey: 'provider-session:provisioning:pm-test',
    ownership: 'MISSION_CONTROL_ONLY', purpose: 'Dedicated Mission Control project supervision.',
    accountAlias: 'account:test', workspaceAlias: 'workspace:test', privateLocatorRef: 'private-config:supervisors/pm',
    provisioningProvenance: { authorizedBy: 'OWNER', authorizedAt: '2026-09-12T12:00:00.000Z', sourceRef: 'owner-requirement:test' },
    consumerControls: { modelVisibleLabel: 'GPT-5.6 Sol', thinkingControlLabel: 'Thinking effort', thinkingVisibleLabel: 'Extra High', thinkingOrdinal: '4 of 5', accountPlanLabel: 'Pro', accountPlanRole: 'PROVENANCE_METADATA_ONLY', accountPlanIsReasoningMode: false },
    requiredApps: { missionControl: 'Mission Control', github: 'GitHub' },
  };
}
