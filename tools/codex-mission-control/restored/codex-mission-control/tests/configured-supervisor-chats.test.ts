import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_PROJECT_MANAGER_ID,
  loadConfiguredSupervisorChats,
} from "../lib/configured-supervisor-chats";

function configuredEntry(overrides: Record<string, unknown> = {}) {
  return {
    scope: "PROJECT_MANAGER",
    supervisorId: CANONICAL_PROJECT_MANAGER_ID,
    label: "Mission Control Project Manager",
    workerId: null,
    registrationId: "registration:pm:test",
    ownership: "MISSION_CONTROL_ONLY",
    purpose: "Dedicated Mission Control project supervision.",
    accountAlias: "account:test",
    workspaceAlias: "workspace:test",
    privateLocatorRef: "private-config:supervisors/pm",
    registrationProvenance: { registeredBy: "OWNER", registeredAt: "2026-09-10T12:00:00.000Z", sourceRef: "owner-requirement:test" },
    requiredApp: "Mission Control",
    consumerControls: { modelVisibleLabel: "GPT-5.6 Sol", thinkingControlLabel: "Thinking effort", thinkingVisibleLabel: "Extra High", thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro", accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false },
    bootstrapCapability: {
      chatId: "pm-bootstrap-test",
      url: "https://chatgpt.com/c/pm-bootstrap-test",
      challengeId: "pm-capability-test",
    },
    ...overrides,
  };
}

test("the global Project Manager identity is exactly mc-project-manager", () => {
  const directory = loadConfiguredSupervisorChats(JSON.stringify([configuredEntry()]));
  assert.equal(CANONICAL_PROJECT_MANAGER_ID, "mc-project-manager");
  assert.equal(directory.configurationState, "CONFIGURED");
  assert.equal(directory.entries.length, 1);
  assert.equal(directory.entries[0].scope, "PROJECT_MANAGER");
  assert.equal(directory.entries[0].supervisorId, CANONICAL_PROJECT_MANAGER_ID);
});

test("alternate global Project Manager identities fail closed", () => {
  const directory = loadConfiguredSupervisorChats(JSON.stringify([
    configuredEntry({ supervisorId: "project-manager-primary" }),
  ]));
  assert.equal(directory.configurationState, "INVALID");
  assert.match(directory.error ?? "", /mc-project-manager/);
  assert.deepEqual(directory.entries, []);
});

test("specialist identities remain distinct and are not promoted into the global PM role", () => {
  const directory = loadConfiguredSupervisorChats(JSON.stringify([
    configuredEntry({
      scope: "SPECIALIST",
      supervisorId: "mc-hotfix-specialist",
      label: "Mission Control hotfix specialist",
    }),
  ]));
  assert.equal(directory.configurationState, "CONFIGURED");
  assert.equal(directory.entries[0].scope, "SPECIALIST");
  assert.equal(directory.entries[0].supervisorId, "mc-hotfix-specialist");
});

test("the identity lock does not fabricate a missing Project Manager locator", () => {
  const directory = loadConfiguredSupervisorChats(undefined);
  assert.equal(directory.configurationState, "MISSING");
  assert.equal(directory.providerRelayState, "NOT_CONNECTED");
  assert.deepEqual(directory.entries, []);
});

test("legacy, personal, ambiguous, and incomplete supervisor ownership fails closed", () => {
  for (const ownership of [undefined, "PERSONAL", "AMBIGUOUS", "LEGACY_UNCLASSIFIED"]) {
    const directory = loadConfiguredSupervisorChats(JSON.stringify([configuredEntry({ ownership })]));
    assert.equal(directory.configurationState, "INVALID");
    assert.match(directory.error ?? "", /MISSION_CONTROL_ONLY/);
  }
  const noPurpose = loadConfiguredSupervisorChats(JSON.stringify([configuredEntry({ purpose: "" })]));
  assert.equal(noPurpose.configurationState, "INVALID");
  const wrongProvenance = loadConfiguredSupervisorChats(JSON.stringify([configuredEntry({ registrationProvenance: { registeredBy: "RELAY", registeredAt: "2026-09-10T12:00:00.000Z", sourceRef: "test" } })]));
  assert.equal(wrongProvenance.configurationState, "INVALID");
});

test("two supervisors cannot reuse a bootstrap chat ID or normalized conversation URL", () => {
  const first = configuredEntry();
  const specialist = configuredEntry({
    scope: "SPECIALIST",
    supervisorId: "mc-specialist",
    registrationId: "registration:specialist:test",
    bootstrapCapability: {
      chatId: "specialist-bootstrap-test",
      url: "https://chatgpt.com/c/specialist-bootstrap-test",
      challengeId: "specialist-capability-test",
    },
  });
  const duplicateChatId = loadConfiguredSupervisorChats(JSON.stringify([
    first,
    { ...specialist, bootstrapCapability: { ...(specialist.bootstrapCapability as Record<string, unknown>), chatId: "pm-bootstrap-test" } },
  ]));
  assert.equal(duplicateChatId.configurationState, "INVALID");
  assert.match(duplicateChatId.error ?? "", /bootstrap chat IDs must be unique/i);

  const duplicateUrl = loadConfiguredSupervisorChats(JSON.stringify([
    first,
    { ...specialist, bootstrapCapability: { ...(specialist.bootstrapCapability as Record<string, unknown>), url: "https://chatgpt.com/c/pm-bootstrap-test/?source=duplicate#fragment" } },
  ]));
  assert.equal(duplicateUrl.configurationState, "INVALID");
  assert.match(duplicateUrl.error ?? "", /bootstrap conversation URLs must be unique/i);
});
