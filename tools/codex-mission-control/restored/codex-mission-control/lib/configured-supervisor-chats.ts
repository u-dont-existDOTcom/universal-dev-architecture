export interface ConfiguredSupervisorChat {
  scope: "PROJECT_MANAGER" | "SPECIALIST";
  chatId: string;
  label: string;
  url: string;
  workerId: string | null;
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
    const ids = new Set(entries.map((entry) => entry.chatId));
    if (ids.size !== entries.length) throw new Error("Configured chat IDs must be unique.");
    if (entries.filter((entry) => entry.scope === "PROJECT_MANAGER").length > 1) {
      throw new Error("Only one overall Project Manager chat may be configured.");
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
  const chatId = nonEmpty(value.chatId, `Configured chat ${index} chatId`, 300);
  const label = nonEmpty(value.label, `Configured chat ${index} label`, 300);
  const url = nonEmpty(value.url, `Configured chat ${index} url`, 1000);
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password
    || parsedUrl.hostname !== "chatgpt.com" || !parsedUrl.pathname.startsWith("/c/")) {
    throw new Error(`Configured chat ${index} must be an HTTPS chatgpt.com conversation URL.`);
  }
  const workerId = value.workerId === null || value.workerId === undefined
    ? null
    : nonEmpty(value.workerId, `Configured chat ${index} workerId`, 180);
  return { scope, chatId, label, url: parsedUrl.toString(), workerId, locatorVerification: "OWNER_CONFIGURED_UNVERIFIED" };
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
