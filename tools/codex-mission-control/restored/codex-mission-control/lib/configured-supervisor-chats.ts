export const CANONICAL_PROJECT_MANAGER_ID = "mc-project-manager";

export interface ConfiguredSupervisorChat {
  scope: "PROJECT_MANAGER" | "SPECIALIST";
  supervisorId: string;
  /** Backward-compatible UI alias for supervisorId. */
  chatId: string;
  label: string;
  /** Bootstrap capability locator only; supervisory cycles create fresh provider sessions. */
  url: string;
  workerId: string | null;
  requiredApp: string;
  registrationId: string;
  ownership: "MISSION_CONTROL_ONLY";
  purpose: string;
  accountAlias: string;
  workspaceAlias: string;
  privateLocatorRef: string;
  registrationProvenance: {
    registeredBy: "OWNER";
    registeredAt: string;
    sourceRef: string;
  };
  consumerControls: {
    modelVisibleLabel: "GPT-5.6 Sol";
    thinkingControlLabel: "Thinking effort";
    thinkingVisibleLabel: "Extra High";
    thinkingOrdinal: "4 of 5";
    accountPlanLabel: "Pro";
    accountPlanRole: "PROVENANCE_METADATA_ONLY";
    accountPlanIsReasoningMode: false;
  };
  bootstrapCapability: { chatId: string; url: string; challengeId: string };
  locatorVerification: "OWNER_CONFIGURED_UNVERIFIED";
}

export interface ConfiguredSupervisorDirectory {
  configurationState: "MISSING" | "CONFIGURED" | "INVALID";
  providerRelayState: "NOT_CONNECTED";
  entries: ConfiguredSupervisorChat[];
  error: string | null;
}

export function loadConfiguredSupervisorChats(
  raw = process.env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON,
): ConfiguredSupervisorDirectory {
  if (!raw?.trim()) {
    return { configurationState: "MISSING", providerRelayState: "NOT_CONNECTED", entries: [], error: null };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("The configured chat directory must be a JSON array.");
    const entries = parsed.map((item, index) => parseEntry(item, index));
    const ids = new Set(entries.map((entry) => entry.supervisorId));
    if (ids.size !== entries.length) throw new Error("Configured supervisor IDs must be unique.");
    const registrations = new Set(entries.map((entry) => entry.registrationId));
    if (registrations.size !== entries.length) throw new Error("Configured supervisor registration IDs must be unique.");
    const bootstrapChatIds = new Set(entries.map((entry) => entry.bootstrapCapability.chatId));
    if (bootstrapChatIds.size !== entries.length) throw new Error("Configured bootstrap chat IDs must be unique across supervisors.");
    const bootstrapUrls = new Set(entries.map((entry) => entry.bootstrapCapability.url));
    if (bootstrapUrls.size !== entries.length) throw new Error("Configured bootstrap conversation URLs must be unique across supervisors.");
    const projectManagers = entries.filter((entry) => entry.scope === "PROJECT_MANAGER");
    if (projectManagers.length > 1) {
      throw new Error("Only one overall Project Manager chat may be configured.");
    }
    if (projectManagers.length === 1 && projectManagers[0].supervisorId !== CANONICAL_PROJECT_MANAGER_ID) {
      throw new Error(`Configured Project Manager supervisorId must be ${CANONICAL_PROJECT_MANAGER_ID}.`);
    }
    return { configurationState: "CONFIGURED", providerRelayState: "NOT_CONNECTED", entries, error: null };
  } catch (error) {
    return {
      configurationState: "INVALID",
      providerRelayState: "NOT_CONNECTED",
      entries: [],
      error: error instanceof Error ? error.message : "Configured supervisor chat directory is invalid.",
    };
  }
}

function parseEntry(value: unknown, index: number): ConfiguredSupervisorChat {
  if (!isRecord(value)) throw new Error(`Configured chat ${index} must be an object.`);
  const scope = value.scope;
  if (scope !== "PROJECT_MANAGER" && scope !== "SPECIALIST") throw new Error(`Configured chat ${index} has an invalid scope.`);
  const supervisorId = nonEmpty(value.supervisorId ?? value.chatId, `Configured chat ${index} supervisorId`, 300);
  const label = nonEmpty(value.label, `Configured chat ${index} label`, 300);
  const bootstrap = isRecord(value.bootstrapCapability) ? value.bootstrapCapability : value;
  const bootstrapChatId = nonEmpty(bootstrap.chatId, `Configured chat ${index} bootstrapCapability.chatId`, 300);
  const url = normalizeConversationUrl(nonEmpty(bootstrap.url, `Configured chat ${index} bootstrapCapability.url`, 1000), index);
  const challengeId = nonEmpty(bootstrap.challengeId ?? bootstrap.capabilityChallengeId ?? `legacy:${bootstrapChatId}`, `Configured chat ${index} bootstrapCapability.challengeId`, 300);
  const workerId = value.workerId === null || value.workerId === undefined
    ? null
    : nonEmpty(value.workerId, `Configured chat ${index} workerId`, 180);
  const controls = isRecord(value.consumerControls) ? value.consumerControls : {};
  const provenance = isRecord(value.registrationProvenance) ? value.registrationProvenance : {};
  if (value.ownership !== "MISSION_CONTROL_ONLY") {
    throw new Error(`Configured chat ${index} ownership must be explicitly MISSION_CONTROL_ONLY; legacy or ambiguous registrations are not live-send eligible.`);
  }
  if (provenance.registeredBy !== "OWNER") {
    throw new Error(`Configured chat ${index} registrationProvenance.registeredBy must be OWNER.`);
  }
  const registeredAt = isoTimestamp(provenance.registeredAt, `Configured chat ${index} registrationProvenance.registeredAt`);
  return {
    scope,
    supervisorId,
    chatId: supervisorId,
    label,
    url,
    workerId,
    requiredApp: nonEmpty(value.requiredApp ?? "Mission Control", `Configured chat ${index} requiredApp`, 100),
    registrationId: nonEmpty(value.registrationId, `Configured chat ${index} registrationId`, 300),
    ownership: "MISSION_CONTROL_ONLY",
    purpose: nonEmpty(value.purpose, `Configured chat ${index} purpose`, 500),
    accountAlias: nonEmpty(value.accountAlias, `Configured chat ${index} accountAlias`, 180),
    workspaceAlias: nonEmpty(value.workspaceAlias, `Configured chat ${index} workspaceAlias`, 180),
    privateLocatorRef: nonEmpty(value.privateLocatorRef, `Configured chat ${index} privateLocatorRef`, 500),
    registrationProvenance: {
      registeredBy: "OWNER",
      registeredAt,
      sourceRef: nonEmpty(provenance.sourceRef, `Configured chat ${index} registrationProvenance.sourceRef`, 500),
    },
    consumerControls: parseConsumerControls(controls, index),
    bootstrapCapability: { chatId: bootstrapChatId, url, challengeId },
    locatorVerification: "OWNER_CONFIGURED_UNVERIFIED",
  };
}

function parseConsumerControls(value: Record<string, unknown>, index: number): ConfiguredSupervisorChat["consumerControls"] {
  const expected: ConfiguredSupervisorChat["consumerControls"] = {
    modelVisibleLabel: "GPT-5.6 Sol",
    thinkingControlLabel: "Thinking effort",
    thinkingVisibleLabel: "Extra High",
    thinkingOrdinal: "4 of 5",
    accountPlanLabel: "Pro",
    accountPlanRole: "PROVENANCE_METADATA_ONLY",
    accountPlanIsReasoningMode: false,
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) {
      throw new Error(`Configured chat ${index} consumerControls.${key} must exactly match the fixed current consumer-surface disposition.`);
    }
  }
  return expected;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new Error(`${field} must be a non-empty string no longer than ${max} characters.`);
  }
  return value;
}

function isoTimestamp(value: unknown, field: string): string {
  const text = nonEmpty(value, field, 100);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${field} must be an ISO timestamp.`);
  return text;
}

function normalizeConversationUrl(value: string, index: number): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hostname !== "chatgpt.com") {
    throw new Error(`Configured chat ${index} must be an HTTPS chatgpt.com conversation URL.`);
  }
  const match = url.pathname.match(/^\/c\/([A-Za-z0-9_-]+)\/?$/);
  if (!match) throw new Error(`Configured chat ${index} must identify one concrete /c/<conversation-id> conversation.`);
  return `https://chatgpt.com/c/${match[1]}`;
}
