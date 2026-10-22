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
/** A listed thread's kind, as lib/chatgpt-work-cloud-controller.ts's listedThreads classifies it: "chatgpt" for its
 * aliases, "other" for another named surface, "unknown" when no kind is named (Codex review of da9e663d). */
function threadKind(record: Record<string, unknown>): "chatgpt" | "other" | "unknown" {
  let named: string | null = null;
  for (const key of ["kind", "surface", "threadKind", "thread_kind"]) {
    const value = record[key];
    if (typeof value === "string" && value) { named = value; break; }
  }
  if (named === null) return "unknown";
  return ["chatgpt", "chatgptworkcloud", "chatgpt_work_cloud"].includes(named.toLowerCase()) ? "chatgpt" : "other";
}
/** The app's list_threads limit (its maximum): the newest non-pinned threads first. */
const LIST_LIMIT = 50;
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
    const listed = parseToolJson(await app.callTool({ name: "list_threads", arguments: { limit: LIST_LIMIT } }));
    const threads = Array.isArray(listed.threads) ? listed.threads : [];
    // Pinned threads come in full beside the recent page: they are read too, but only the page shows reach-back.
    const pinned = Array.isArray(listed.pinnedThreads) ? listed.pinnedThreads : [];
    // Whether this scan saw every ChatGPT thread updated after `--updated-after` (the copier advances its scan floor only
    // then): a thread list that reaches back past the floor (a ChatGPT or unknown-kind thread updated before it; a short
    // page alone proves nothing, since sources may be paged apart, as for the Work retry's search), no thread source
    // reported unavailable (a rate-limited ChatGPT listing shows only other surfaces), and every read in range succeeded.
    const unavailable = listed.unavailableSources ?? listed.unavailable_sources;
    const sourcesUnavailable = Array.isArray(unavailable) ? unavailable.length > 0 : unavailable !== undefined && unavailable !== null;
    // A pinned listing in another shape may hide a pinned thread: the scan isn't complete (Codex review of 573422d6).
    let unreadable = listed.pinnedThreads !== undefined && !Array.isArray(listed.pinnedThreads) ? 1 : 0;
    const output: Array<{ threadId: string; status: string | null; updatedAt: number; observedAt: string; finalAgentMessage: string | null }> = [];
    const seen = new Set<string>();
    for (const summary of [...threads, ...pinned]) {
      // An entry that isn't a thread summary may be an in-range thread in another shape: the scan isn't complete.
      if (!summary || typeof summary !== "object" || Array.isArray(summary)) { unreadable += 1; continue; }
      const record = summary as Record<string, unknown>;
      // A thread listed without a kind may be a ChatGPT thread: it is read too (Codex review of dc538ad3).
      if (threadKind(record) === "other") continue;
      const threadId = typeof record.id === "string" ? record.id : typeof record.threadId === "string" ? record.threadId : null;
      const updatedAt = timestampMs(record.updatedAt ?? record.updated_at);
      if (updatedAt !== null && updatedAt < updatedAfter) continue;
      // A thread in range (or of unknown time) that can't be read exactly leaves the scan incomplete.
      if (!threadId || threadId.startsWith("local-chatgpt:") || updatedAt === null) { unreadable += 1; continue; }
      if (seen.has(threadId)) continue;
      seen.add(threadId);
      try {
        const root = parseToolJson(await app.callTool({
          name: "read_thread",
          arguments: { threadId, turnLimit: 10, includeOutputs: false, maxOutputCharsPerItem: 20_000 },
        }));
        const thread = root.thread;
        // The read must be this thread's (its id) with its turns; any other shape counts as unreadable, not as a thread
        // without a receipt (Codex review of c1d9b23e).
        const readId = thread && typeof thread === "object" && !Array.isArray(thread)
          ? (thread as { id?: unknown; threadId?: unknown }).id ?? (thread as { threadId?: unknown }).threadId : undefined;
        if (readId !== threadId || !Array.isArray(root.turns)) { unreadable += 1; continue; }
        const status = thread && typeof thread === "object" && !Array.isArray(thread)
          && (thread as { status?: unknown }).status && typeof (thread as { status: { type?: unknown } }).status.type === "string"
          ? String((thread as { status: { type: string } }).status.type) : null;
        if (status === null) { unreadable += 1; continue; }
        output.push({ threadId, status, updatedAt, observedAt: new Date().toISOString(), finalAgentMessage: finalAgentMessage(root) });
      } catch { unreadable += 1; /* unreadable candidates cannot satisfy exact binding */ }
    }
    const reachesBack = threads.some((summary) => {
      if (!summary || typeof summary !== "object" || Array.isArray(summary)) return false;
      const record = summary as Record<string, unknown>;
      if (threadKind(record) === "other") return false;
      return (timestampMs(record.updatedAt ?? record.updated_at) ?? Infinity) < updatedAfter;
    });
    const complete = Array.isArray(listed.threads) && reachesBack && !sourcesUnavailable && unreadable === 0;
    process.stdout.write(`${JSON.stringify({ threads: output, complete, truncated: !reachesBack, sourcesUnavailable, unreadable })}\n`);
  } finally { await app.close(); }
}
main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
