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

test('Work creation reuses the launcher, verifies exact authority and blocks mismatches before sending', async () => {
  for (const mismatch of [false, true]) {
    const root = await mkdtemp(path.join(tmpdir(), 'mc-work-create-'));
    const body = 'Reply OK only.';
    const provision = parseChatProvisionDirectory([provisionEntry()])[0];
    let sends = 0;
    let records = 0;
    let newChats = 0;
    const authorization = { worker: provision.workerId, authorization_id: 'authorization:test',
      directive_artifact_sha256: sha256(body), authorized_profile: { model: 'GPT_5_6_SOL', effort: 'MEDIUM', fastModeRequest: 'DO_NOT_ENABLE_FAST' } };
    const input = {
      config: { runtime: { submitEnabled: true, maxHotTabs: 3, provisionResultsFile: path.join(root, 'results.json') } },
      provision, body,
      browser: {
        async createFreshChatTarget() { newChats++; return { id: 'owned-target', automationOwned: true, automationWindowId: 101, url: 'https://chatgpt.com/' }; },
        async ensureExactWorkControls() { return { status: 'DOM_SELECTION_VERIFIED', model: 'gpt-5.6-sol', effort: mismatch ? 'max' : 'medium', managed_target_verified: true, fast_observed: null }; },
        async submitExactMessage(_target, input) { sends++; assert.equal(input.body, body); return { conversationUrl: 'https://chatgpt.com/c/created-work-test' }; },
      },
      submissionPacer: { async submit(input) { await input.beforeSubmit(); return input.submit(async () => {}, {}, async () => {}); } },
      workCreation: { authorizationId: 'authorization:test', missionControl: {
        async fetchWorkCreationAuthorization() { return authorization; },
        async recordWorkCreation(auth, selection, locator) { records++; assert.equal(auth, authorization); assert.equal(selection.effort, 'medium'); assert.equal(locator, 'https://chatgpt.com/c/created-work-test'); return 'setter:test'; },
      } },
    };
    try {
      if (mismatch) await assert.rejects(provisionMcOnlyChat(input), /WORK_UI_SELECTION_MISMATCH/);
      else {
        const result = await provisionMcOnlyChat(input);
        assert.equal(result.status, 'BROWSER_TASK_CREATION_TRUSTED_SETTER_ACTIVE');
        assert.equal(result.setterEvidenceId, 'setter:test');
        assert.equal(JSON.stringify(result).includes(body), false);
        await assert.rejects(provisionMcOnlyChat(input), /DO_NOT_REPLAY/);
      }
      assert.equal(sends, mismatch ? 0 : 1);
      assert.equal(records, mismatch ? 0 : 1);
      assert.equal(newChats, 1);
    } finally { await rm(root, { recursive: true, force: true }); }
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
