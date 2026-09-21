import { connectNativeAppToolClient } from "../lib/chatgpt-work-cloud-controller";

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseToolJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("read_thread returned an invalid tool result.");
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) throw new Error("read_thread returned no content array.");
  const item = content.find((entry) => entry && typeof entry === "object" && (entry as { type?: unknown }).type === "text") as { text?: unknown } | undefined;
  if (!item || typeof item.text !== "string") throw new Error("read_thread returned no text payload.");
  const parsed = JSON.parse(item.text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("read_thread text payload is not a JSON object.");
  return parsed as Record<string, unknown>;
}

async function main() {
  const threadId = arg("--thread-id");
  const app = await connectNativeAppToolClient({
    command: requiredEnv("MISSION_CONTROL_CHATGPT_APP_MCP_COMMAND"),
    serverPath: requiredEnv("MISSION_CONTROL_CHATGPT_APP_MCP_SERVER"),
    appToolsPipePath: requiredEnv("MISSION_CONTROL_CHATGPT_APP_TOOLS_PIPE_PATH"),
    executorThreadId: requiredEnv("MISSION_CONTROL_CHATGPT_APP_EXECUTOR_THREAD_ID"),
  });
  try {
    const raw = await app.callTool({
      name: "read_thread",
      arguments: { threadId, turnLimit: 10, includeOutputs: false, maxOutputCharsPerItem: 20_000 },
    });
    const root = parseToolJson(raw);
    const thread = root.thread;
    if (!thread || typeof thread !== "object" || Array.isArray(thread)) throw new Error("read_thread returned no thread object.");
    const turns = root.turns;
    if (!Array.isArray(turns)) throw new Error("read_thread returned no turns array.");
    let finalMessage: string | null = null;
    for (const turn of turns) {
      if (!turn || typeof turn !== "object" || Array.isArray(turn)) continue;
      const items = (turn as { items?: unknown }).items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const record = item as Record<string, unknown>;
        if (record.type === "agentMessage" && typeof record.text === "string") {
          finalMessage = record.text;
          break;
        }
      }
      if (finalMessage !== null) break; // read_thread is newest-first.
    }
    const status = (thread as { status?: unknown }).status;
    const statusType = status && typeof status === "object" && !Array.isArray(status) && typeof (status as { type?: unknown }).type === "string"
      ? (status as { type: string }).type : null;
    process.stdout.write(`${JSON.stringify({ threadId, status: statusType, finalAgentMessage: finalMessage })}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
