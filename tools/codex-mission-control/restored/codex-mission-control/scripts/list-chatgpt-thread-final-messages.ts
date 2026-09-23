import { connectNativeAppToolClient } from "../lib/chatgpt-work-cloud-controller";

function requiredArg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function parseToolJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("app tool returned an invalid result");
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) throw new Error("app tool returned no content array");
  const item = content.find((entry) => entry && typeof entry === "object" && (entry as { type?: unknown }).type === "text") as { text?: unknown } | undefined;
  if (!item || typeof item.text !== "string") throw new Error("app tool returned no text payload");
  const parsed = JSON.parse(item.text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("app tool text payload is invalid");
  return parsed as Record<string, unknown>;
}
function timestampMs(value: unknown): number | null {
  if (typeof value === "string") { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (value < 100_000_000_000) return value * 1_000;
  if (value > 100_000_000_000_000) return value / 1_000;
  return value;
}
function finalAgentMessage(root: Record<string, unknown>): string | null {
  const turns = root.turns;
  if (!Array.isArray(turns)) return null;
  for (const turn of turns) {
    if (!turn || typeof turn !== "object" || Array.isArray(turn)) continue;
    const items = (turn as { items?: unknown }).items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      if (record.type === "agentMessage" && typeof record.text === "string") return record.text;
    }
  }
  return null;
}
async function main() {
  const updatedAfterText = requiredArg("--updated-after");
  const updatedAfter = Date.parse(updatedAfterText);
  if (!Number.isFinite(updatedAfter)) throw new Error("--updated-after must be an ISO timestamp");
  const app = await connectNativeAppToolClient({
    command: requiredEnv("MISSION_CONTROL_CHATGPT_APP_MCP_COMMAND"),
    serverPath: requiredEnv("MISSION_CONTROL_CHATGPT_APP_MCP_SERVER"),
    appToolsPipePath: requiredEnv("MISSION_CONTROL_CHATGPT_APP_TOOLS_PIPE_PATH"),
    executorThreadId: requiredEnv("MISSION_CONTROL_CHATGPT_APP_EXECUTOR_THREAD_ID"),
  });
  try {
    const listed = parseToolJson(await app.callTool({ name: "list_threads", arguments: { limit: 50 } }));
    const threads = Array.isArray(listed.threads) ? listed.threads : [];
    const output: Array<{ threadId: string; status: string | null; updatedAt: number; observedAt: string; finalAgentMessage: string | null }> = [];
    for (const summary of threads) {
      if (!summary || typeof summary !== "object" || Array.isArray(summary)) continue;
      const record = summary as Record<string, unknown>;
      if (record.kind !== "chatgpt") continue;
      const threadId = typeof record.id === "string" ? record.id : typeof record.threadId === "string" ? record.threadId : null;
      const updatedAt = timestampMs(record.updatedAt ?? record.updated_at);
      if (!threadId || threadId.startsWith("local-chatgpt:") || updatedAt === null || updatedAt < updatedAfter) continue;
      try {
        const root = parseToolJson(await app.callTool({
          name: "read_thread",
          arguments: { threadId, turnLimit: 10, includeOutputs: false, maxOutputCharsPerItem: 20_000 },
        }));
        const thread = root.thread;
        const status = thread && typeof thread === "object" && !Array.isArray(thread)
          && (thread as { status?: unknown }).status && typeof (thread as { status: { type?: unknown } }).status.type === "string"
          ? String((thread as { status: { type: string } }).status.type) : null;
        output.push({ threadId, status, updatedAt, observedAt: new Date().toISOString(), finalAgentMessage: finalAgentMessage(root) });
      } catch { /* unreadable candidates cannot satisfy exact binding */ }
    }
    process.stdout.write(`${JSON.stringify({ threads: output })}\n`);
  } finally { await app.close(); }
}
main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
