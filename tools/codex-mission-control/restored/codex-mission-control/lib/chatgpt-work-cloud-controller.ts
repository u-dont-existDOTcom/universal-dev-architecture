import fs from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { AppendEnvelope } from "./schema";
import type {
  WorkCloudAppExecutor,
  WorkCloudCapabilityEvidence,
  WorkCloudDispatchState,
  WorkCloudEventSink,
  WorkCloudExecutorOutcome,
} from "./chatgpt-work-cloud-dispatch";

const REQUIRED_APP_TOOLS = ["create_thread", "send_message_to_thread", "read_thread", "list_threads"] as const;

export interface AppToolResult {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ type?: string; text?: string }>;
}

export interface WorkCloudAppToolClient {
  listTools(): Promise<{ tools: Array<{ name: string }> }>;
  callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<AppToolResult>;
  close(): Promise<void>;
}

export interface WorkCloudAppExecutorOptions {
  resolutionAttempts?: number;
  resolutionDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * Authenticated native-app executor. Thread identity is accepted only from the
 * app-owned create/read/list lineage; titles are never used for resolution.
 */
export class NativeChatGptWorkCloudExecutor implements WorkCloudAppExecutor {
  private readonly attempts: number;
  private readonly resolutionDelayMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly client: WorkCloudAppToolClient,
    options: WorkCloudAppExecutorOptions = {},
  ) {
    this.attempts = options.resolutionAttempts ?? 20;
    this.resolutionDelayMs = options.resolutionDelayMs ?? 1_000;
    this.sleep = options.sleep ?? (async (milliseconds) => { await delay(milliseconds); });
  }

  async createThread(input: {
    title: string;
    prompt: string;
    target: { type: "chatgptWorkCloud"; projectId?: string };
  }): Promise<WorkCloudExecutorOutcome> {
    const created = await this.call("create_thread", input);
    if (approvalPending(created)) return { kind: "PENDING_APPROVAL" };
    const surface = surfaceKind(created);
    if (surface !== "chatgpt") return wrongSurface(surface);

    const stableThreadId = directThreadId(created);
    if (stableThreadId) return this.verifyExactThread(stableThreadId);

    const clientThreadId = temporaryThreadId(created);
    if (!clientThreadId) return { kind: "FAILED", reasonCode: "WORK_CLOUD_CREATE_MISSING_THREAD_ID" };
    return this.resolveTemporaryThread(clientThreadId);
  }

  async sendMessageToThread(input: { threadId: string; prompt: string }): Promise<WorkCloudExecutorOutcome> {
    const before = await this.readExactThread(input.threadId);
    const beforeSurface = surfaceKind(before);
    if (beforeSurface !== "chatgpt") return wrongSurface(beforeSurface);
    if (directThreadId(before) !== input.threadId) {
      return { kind: "FAILED", reasonCode: "WORK_CLOUD_CONTINUATION_THREAD_MISMATCH" };
    }

    const sent = await this.call("send_message_to_thread", input);
    if (approvalPending(sent)) return { kind: "PENDING_APPROVAL" };
    const sentSurface = surfaceKind(sent);
    if (sentSurface !== "unknown" && sentSurface !== "chatgpt") return wrongSurface(sentSurface);
    const returnedThreadId = directThreadId(sent);
    if (returnedThreadId && returnedThreadId !== input.threadId) {
      return { kind: "FAILED", reasonCode: "WORK_CLOUD_CONTINUATION_THREAD_MISMATCH" };
    }
    return this.verifyExactThread(input.threadId);
  }

  private async verifyExactThread(threadId: string): Promise<WorkCloudExecutorOutcome> {
    const read = await this.readExactThread(threadId);
    const surface = surfaceKind(read);
    if (surface !== "chatgpt") return wrongSurface(surface);
    if (directThreadId(read) !== threadId) {
      return { kind: "FAILED", reasonCode: "WORK_CLOUD_READ_THREAD_MISMATCH" };
    }
    return { kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId, hostId: null };
  }

  private async resolveTemporaryThread(clientThreadId: string): Promise<WorkCloudExecutorOutcome> {
    for (let attempt = 0; attempt < this.attempts; attempt += 1) {
      try {
        const read = await this.readExactThread(clientThreadId);
        const surface = surfaceKind(read);
        if (surface === "codex") return wrongSurface(surface);
        const stableFromRead = directThreadId(read);
        if (surface === "chatgpt" && stableFromRead && stableFromRead !== clientThreadId) {
          return this.verifyExactThread(stableFromRead);
        }
      } catch {
        // A temporary client id may not be readable until the provider publishes
        // its stable thread. Continue into the exact app-owned list resolution.
      }

      const listed = await this.call("list_threads", {});
      const exact = stableIdForClientThread(listed, clientThreadId);
      if (exact) return this.verifyExactThread(exact);
      if (attempt + 1 < this.attempts) await this.sleep(this.resolutionDelayMs);
    }
    return { kind: "PENDING_SETUP", clientThreadId };
  }

  private async readExactThread(threadId: string): Promise<unknown> {
    return this.call("read_thread", { threadId });
  }

  private async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      const result = await this.client.callTool({ name, arguments: args });
      if (result.isError) throw new Error(toolText(result) || `${name} failed`);
      return toolValue(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/\b(accept|approval|approve|consent)\b/i.test(message)) return { kind: "pendingApproval" };
      throw error;
    }
  }
}

export function capabilityEvidenceFromTools(
  tools: Array<{ name: string }>,
  appVersion: string,
  observedAt = new Date().toISOString(),
): WorkCloudCapabilityEvidence {
  const names = new Set(tools.map((tool) => tool.name));
  return {
    observedAt,
    appVersion,
    createThreadTargetAvailable: names.has("create_thread"),
    sendMessageToThreadAvailable: names.has("send_message_to_thread"),
    nativeSurfaceVerificationAvailable: names.has("read_thread") && names.has("list_threads"),
  };
}

export function missingRequiredAppTools(tools: Array<{ name: string }>): string[] {
  const names = new Set(tools.map((tool) => tool.name));
  return REQUIRED_APP_TOOLS.filter((name) => !names.has(name));
}

export interface NativeAppMcpConfig {
  command: string;
  serverPath: string;
  appToolsPipePath: string;
  executorThreadId: string;
}

export async function connectNativeAppToolClient(config: NativeAppMcpConfig): Promise<WorkCloudAppToolClient> {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  env.CODEX_APP_TOOLS_PIPE_PATH = config.appToolsPipePath;
  const transport = new StdioClientTransport({
    command: config.command,
    args: [config.serverPath, "--interaction-client-id", config.executorThreadId],
    env,
    stderr: "pipe",
  });
  const client = new Client({ name: "mission-control-work-cloud-controller", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return {
    listTools: () => client.listTools(),
    callTool: (input) => client.callTool(input) as Promise<AppToolResult>,
    close: () => client.close(),
  };
}

export interface HttpWorkCloudEventSinkOptions {
  baseUrl: string;
  token: string;
  producerId: string;
  workerScopes: string[];
  taskScopes: string[];
  fetch?: typeof fetch;
}

export class HttpWorkCloudEventSink implements WorkCloudEventSink {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(options: HttpWorkCloudEventSinkOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.headers = {
      authorization: `Bearer ${options.token}`,
      "content-type": "application/json",
      "x-mission-control-producer-id": options.producerId,
      "x-mission-control-producer-kind": "SYSTEM",
      "x-mission-control-worker-scopes": options.workerScopes.join(","),
      "x-mission-control-task-scopes": options.taskScopes.join(","),
    };
  }

  async getWorkCloudDispatch(worker: string, dispatchId: string): Promise<WorkCloudDispatchState | null> {
    const response = await this.fetcher(
      `${this.baseUrl}/workers/${encodeURIComponent(worker)}/work-cloud-dispatches/${encodeURIComponent(dispatchId)}`,
      { headers: this.headers },
    );
    if (response.status === 404) return null;
    const body = await response.json() as { error?: string; request?: AppendEnvelope; result?: AppendEnvelope | null };
    if (!response.ok) throw new Error(`${response.status} ${body.error ?? response.statusText}`);
    if (!body.request) throw new Error("Mission Control returned an incomplete Work-cloud dispatch state.");
    return { request: body.request, result: body.result ?? null };
  }

  async recordWorkerEvents(worker: string, events: AppendEnvelope[]): Promise<unknown> {
    for (const event of events) {
      if (event.data.worker !== worker) throw new Error("Work-cloud event worker does not match its sink scope.");
      const response = await this.fetcher(`${this.baseUrl}/events`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(event),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(`${response.status} ${body.error ?? response.statusText}`);
    }
    return { recorded: events.length };
  }
}

export function appVersionFromEnvironment(env = process.env): string {
  if (env.MISSION_CONTROL_CHATGPT_APP_VERSION?.trim()) return env.MISSION_CONTROL_CHATGPT_APP_VERSION.trim();
  const versionFile = env.MISSION_CONTROL_CHATGPT_APP_VERSION_FILE?.trim();
  if (versionFile) {
    try {
      const value = fs.readFileSync(versionFile, "utf8").trim();
      if (value) return value;
    } catch {}
  }
  return "UNKNOWN_APP_VERSION";
}

function toolValue(result: AppToolResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = toolText(result);
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { text }; }
}

function toolText(result: AppToolResult): string {
  return result.content?.filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text).join("\n") ?? "";
}

function approvalPending(value: unknown): boolean {
  return objectsIn(value).some((object) => {
    const kind = stringField(object, "kind", "status")?.toLowerCase();
    return kind === "pendingapproval" || kind === "pending_approval";
  });
}

function surfaceKind(value: unknown): "chatgpt" | "codex" | "ordinaryChat" | "unknown" {
  for (const object of objectsIn(value)) {
    const kind = stringField(object, "kind", "surface", "threadKind", "thread_kind")?.toLowerCase();
    if (kind === "chatgpt" || kind === "chatgptworkcloud" || kind === "chatgpt_work_cloud") return "chatgpt";
    if (kind === "codex") return "codex";
    if (kind === "chat" || kind === "ordinarychat" || kind === "ordinary_chat") return "ordinaryChat";
  }
  return "unknown";
}

function wrongSurface(surface: ReturnType<typeof surfaceKind>): WorkCloudExecutorOutcome {
  return {
    kind: "WRONG_SURFACE",
    observedSurface: surface === "codex" ? "CODEX" : surface === "ordinaryChat" ? "ORDINARY_CHAT" : "UNKNOWN",
  };
}

function directThreadId(value: unknown): string | null {
  for (const object of objectsIn(value)) {
    const id = stringField(object, "threadId", "thread_id", "id");
    if (id) return id;
  }
  return null;
}

function temporaryThreadId(value: unknown): string | null {
  for (const object of objectsIn(value)) {
    const id = stringField(object, "clientThreadId", "client_thread_id", "clientId", "client_id");
    if (id) return id;
  }
  return null;
}

function stableIdForClientThread(value: unknown, clientThreadId: string): string | null {
  for (const object of objectsIn(value)) {
    if (stringField(object, "clientThreadId", "client_thread_id", "clientId", "client_id") !== clientThreadId) continue;
    const kind = stringField(object, "kind", "surface", "threadKind", "thread_kind")?.toLowerCase();
    if (kind !== "chatgpt" && kind !== "chatgptworkcloud" && kind !== "chatgpt_work_cloud") continue;
    const id = stringField(object, "threadId", "thread_id", "id");
    if (id && id !== clientThreadId) return id;
  }
  return null;
}

function objectsIn(value: unknown): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    const object = candidate as Record<string, unknown>;
    result.push(object);
    for (const nested of Object.values(object)) visit(nested);
  };
  visit(value);
  return result;
}

function stringField(object: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) if (typeof object[key] === "string" && object[key]) return object[key];
  return null;
}
