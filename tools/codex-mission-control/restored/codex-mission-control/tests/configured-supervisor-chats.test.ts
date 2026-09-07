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
    requiredApp: "Mission Control",
    expectedModels: { extraHigh: "Extra High", pro: "6 Pro" },
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
