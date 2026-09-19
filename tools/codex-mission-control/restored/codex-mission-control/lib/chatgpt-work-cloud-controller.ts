import fs from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface as ReadLineInterface } from "node:readline";
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
const READ_ONLY_APP_TOOLS = ["read_thread", "list_threads"] as const;
const MUTATING_APP_TOOLS = ["create_thread", "send_message_to_thread"] as const;
type MutatingAppToolName = typeof MUTATING_APP_TOOLS[number];

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

export type ProductMutationResult =
  | { kind: "RESULT"; result: AppToolResult }
  | { kind: "PENDING_APPROVAL" }
  | { kind: "UNAVAILABLE"; reasonCode: string };

/** Mutating calls only. Implementations must preserve product approval/review. */
export interface WorkCloudProductMutationBridge {
  callTool(input: { name: MutatingAppToolName; arguments: Record<string, unknown> }): Promise<ProductMutationResult>;
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
    private readonly readClient: WorkCloudAppToolClient,
    private readonly mutationBridge: WorkCloudProductMutationBridge | null,
    options: WorkCloudAppExecutorOptions = {},
  ) {
    this.attempts = options.resolutionAttempts ?? 20;
    this.resolutionDelayMs = options.resolutionDelayMs ?? 1_000;
    this.sleep = options.sleep ?? (async (milliseconds) => { await delay(milliseconds); });
  }

  async createThread(input: {
    title: string;
    prompt: string;
    requestedAt: string;
    target: { type: "chatgptWorkCloud"; projectId?: string };
  }): Promise<WorkCloudExecutorOutcome> {
    const created = await this.mutate("create_thread", {
      title: input.title,
      prompt: input.prompt,
      target: input.target,
    });
    if (isExecutorOutcome(created)) return created;
    const surface = surfaceKind(created);
    if (surface === "codex" || surface === "ordinaryChat") return wrongSurface(surface);

    const stableThreadId = directThreadId(created);
    if (stableThreadId && !isTemporaryThreadId(stableThreadId)) return this.verifyExactThread(stableThreadId);

    const clientThreadId = temporaryThreadId(created);
    if (!clientThreadId) return { kind: "FAILED", reasonCode: "WORK_CLOUD_CREATE_MISSING_THREAD_ID" };
    return this.resolveCreatedThread({
      clientThreadId,
      prompt: input.prompt,
      requestedAt: input.requestedAt,
      projectId: input.target.projectId ?? null,
    });
  }

  async sendMessageToThread(input: { threadId: string; prompt: string }): Promise<WorkCloudExecutorOutcome> {
    const before = await this.readExactThread(input.threadId);
    const beforeSurface = surfaceKind(before);
    if (beforeSurface !== "chatgpt") return wrongSurface(beforeSurface);
    if (directThreadId(before) !== input.threadId) {
      return { kind: "FAILED", reasonCode: "WORK_CLOUD_CONTINUATION_THREAD_MISMATCH" };
    }

    const sent = await this.mutate("send_message_to_thread", input);
    if (isExecutorOutcome(sent)) return sent;
    const sentSurface = surfaceKind(sent);
    if (sentSurface !== "unknown" && sentSurface !== "chatgpt") return wrongSurface(sentSurface);
    const returnedThreadId = directThreadId(sent);
    if (returnedThreadId && returnedThreadId !== input.threadId) {
      return { kind: "FAILED", reasonCode: "WORK_CLOUD_CONTINUATION_THREAD_MISMATCH" };
    }
    return this.verifyExactThread(input.threadId);
  }

  async resolveCreatedThread(input: {
    clientThreadId: string;
    prompt: string;
    requestedAt: string;
    projectId: string | null;
  }): Promise<WorkCloudExecutorOutcome> {
    return this.resolveTemporaryThread(input);
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

  private async resolveTemporaryThread(input: {
    clientThreadId: string;
    prompt: string;
    requestedAt: string;
    projectId: string | null;
  }): Promise<WorkCloudExecutorOutcome> {
    for (let attempt = 0; attempt < this.attempts; attempt += 1) {
      const listed = await this.read("list_threads", {});
      if (chatGptSourceUnavailable(listed)) return { kind: "PENDING_SETUP", clientThreadId: input.clientThreadId };
      const matchingIds: string[] = [];
      for (const candidate of chatGptCandidates(listed, input.requestedAt, input.projectId)) {
        try {
          const read = await this.readExactThread(candidate.threadId);
          if (surfaceKind(read) !== "chatgpt" || directThreadId(read) !== candidate.threadId) continue;
          if (initialUserPrompt(read) === input.prompt) matchingIds.push(candidate.threadId);
        } catch {
          // A listed provider candidate may not yet be readable. Retry the
          // source-bound resolver; never infer identity from its title.
        }
      }
      const exact = [...new Set(matchingIds)];
      if (exact.length > 1) {
        return { kind: "FAILED", reasonCode: "WORK_CLOUD_CREATE_AMBIGUOUS_PROMPT_MATCH" };
      }
      if (exact.length === 1) return this.verifyExactThread(exact[0]);
      if (attempt + 1 < this.attempts) await this.sleep(this.resolutionDelayMs);
    }
    return { kind: "PENDING_SETUP", clientThreadId: input.clientThreadId };
  }

  private async readExactThread(threadId: string): Promise<unknown> {
    return this.read("read_thread", { threadId });
  }

  private async read(name: typeof READ_ONLY_APP_TOOLS[number], args: Record<string, unknown>): Promise<unknown> {
    const result = await this.readClient.callTool({ name, arguments: args });
    if (result.isError) throw new Error(toolText(result) || `${name} failed`);
    return toolValue(result);
  }

  private async mutate(name: MutatingAppToolName, args: Record<string, unknown>): Promise<unknown | WorkCloudExecutorOutcome> {
    if (!this.mutationBridge) return { kind: "PENDING_APPROVAL" };
    try {
      const outcome = await this.mutationBridge.callTool({ name, arguments: args });
      if (outcome.kind === "PENDING_APPROVAL") return { kind: "PENDING_APPROVAL" };
      if (outcome.kind === "UNAVAILABLE") return { kind: "UNAVAILABLE", reasonCode: outcome.reasonCode };
      const result = outcome.result;
      if (result.isError) throw new Error(toolText(result) || `${name} failed`);
      return toolValue(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/\b(accept|approval|approve|consent)\b/i.test(message)) return { kind: "PENDING_APPROVAL" };
      throw error;
    }
  }
}

export function capabilityEvidenceFromTools(
  tools: Array<{ name: string }>,
  appVersion: string,
  observedAt = new Date().toISOString(),
  productMutationBridgeAvailable = false,
): WorkCloudCapabilityEvidence {
  const names = new Set(tools.map((tool) => tool.name));
  return {
    observedAt,
    appVersion,
    createThreadTargetAvailable: productMutationBridgeAvailable && names.has("create_thread"),
    sendMessageToThreadAvailable: productMutationBridgeAvailable && names.has("send_message_to_thread"),
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

export interface CodexAppServerMutationConfig {
  command: string;
  args: string[];
  threadId: string;
  appServerName: string;
}

export interface CodexAppServerToolCaller {
  call(input: {
    threadId: string;
    server: string;
    tool: MutatingAppToolName;
    arguments: Record<string, unknown>;
  }): Promise<{ kind: "RESULT"; value: unknown } | { kind: "PENDING_APPROVAL" }>;
  close(): Promise<void>;
}

/**
 * Calls the app connector through Codex app-server. The app-server remains the
 * product authority for automatic review or user approval; this bridge never
 * answers an item/tool/requestUserInput request itself.
 */
export async function connectCodexAppServerMutationBridge(
  config: CodexAppServerMutationConfig,
): Promise<WorkCloudProductMutationBridge> {
  const rpc = new AppServerJsonRpc(config.command, config.args);
  await rpc.initialize();
  return createCodexAppServerMutationBridge(config, {
    async call(input) {
      try {
        return { kind: "RESULT", value: await rpc.request("mcpServer/tool/call", input) };
      } catch (error) {
        if (error instanceof ProductApprovalRequired) return { kind: "PENDING_APPROVAL" };
        throw error;
      }
    },
    close: () => rpc.close(),
  });
}

export function createCodexAppServerMutationBridge(
  config: Pick<CodexAppServerMutationConfig, "threadId" | "appServerName">,
  caller: CodexAppServerToolCaller,
): WorkCloudProductMutationBridge {
  let mutationCalled = false;
  return {
    async callTool(input) {
      if (mutationCalled) {
        return { kind: "UNAVAILABLE", reasonCode: "WORK_CLOUD_EXTRA_MUTATION_REJECTED" };
      }
      mutationCalled = true;
      validateMutationToolCall(input);
      try {
        const response = await caller.call({
          threadId: config.threadId,
          server: config.appServerName,
          tool: input.name,
          arguments: input.arguments,
        });
        if (response.kind === "PENDING_APPROVAL") return { kind: "PENDING_APPROVAL" };
        const result = response.value;
        if (!isAppToolResult(result)) {
          return { kind: "UNAVAILABLE", reasonCode: "WORK_CLOUD_PRODUCT_TOOL_RESULT_INVALID" };
        }
        return { kind: "RESULT", result };
      } catch (error) {
        return { kind: "UNAVAILABLE", reasonCode: "WORK_CLOUD_PRODUCT_TOOL_EXECUTION_UNAVAILABLE" };
      }
    },
    close: () => caller.close(),
  };
}

class ProductApprovalRequired extends Error {}

class AppServerJsonRpc {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly lines: ReadLineInterface;
  private nextId = 1;
  private readonly pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();
  private activeToolRequestId: number | null = null;

  constructor(command: string, args: string[]) {
    this.child = spawn(command, args, { stdio: "pipe", env: process.env });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on("line", (line) => this.receive(line));
    this.child.once("error", (error) => this.rejectAll(error));
    this.child.once("exit", (code, signal) => {
      this.rejectAll(new Error(`Codex app-server exited (${code ?? signal ?? "unknown"}).`));
    });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: { name: "mission-control-work-cloud-controller", title: "Mission Control Work cloud controller", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    if (method === "mcpServer/tool/call") this.activeToolRequestId = id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  async close(): Promise<void> {
    this.lines.close();
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill("SIGTERM");
  }

  private receive(line: string): void {
    let message: Record<string, unknown>;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      message = parsed as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof message.method === "string" && message.id !== undefined) {
      if (message.method === "item/tool/requestUserInput" && this.activeToolRequestId !== null) {
        const active = this.pending.get(this.activeToolRequestId);
        this.pending.delete(this.activeToolRequestId);
        this.activeToolRequestId = null;
        active?.reject(new ProductApprovalRequired("Product approval is required."));
      } else if (this.activeToolRequestId !== null) {
        const active = this.pending.get(this.activeToolRequestId);
        this.pending.delete(this.activeToolRequestId);
        this.activeToolRequestId = null;
        active?.reject(new Error(`Unsupported app-server request ${message.method}.`));
      }
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.id === this.activeToolRequestId) this.activeToolRequestId = null;
    if (message.error) pending.reject(new Error(jsonRpcError(message.error)));
    else pending.resolve(message.result);
  }

  private notify(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private write(message: unknown): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.activeToolRequestId = null;
  }
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
    const id = stringField(object, "clientThreadId", "client_thread_id", "clientId", "client_id", "threadId", "thread_id", "id");
    if (id && isTemporaryThreadId(id)) return id;
  }
  return null;
}

function isTemporaryThreadId(id: string): boolean {
  return id.startsWith("local-chatgpt:");
}

function chatGptSourceUnavailable(value: unknown): boolean {
  return objectsIn(value).some((object) => {
    const sources = object.unavailableSources ?? object.unavailable_sources;
    return Array.isArray(sources) && sources.some((source) => typeof source === "string" && source.toLowerCase().includes("chatgpt"));
  });
}

function chatGptCandidates(
  value: unknown,
  requestedAt: string,
  projectId: string | null,
): Array<{ threadId: string }> {
  const requestedTime = Date.parse(requestedAt);
  if (!Number.isFinite(requestedTime)) return [];
  const threads = objectsIn(value).flatMap((object) => Array.isArray(object.threads) ? object.threads : [])
    .filter((thread): thread is Record<string, unknown> => Boolean(thread && typeof thread === "object" && !Array.isArray(thread)));
  const candidates: Array<{ threadId: string }> = [];
  for (const thread of threads) {
    const kind = stringField(thread, "kind", "surface", "threadKind", "thread_kind")?.toLowerCase();
    if (kind !== "chatgpt" && kind !== "chatgptworkcloud" && kind !== "chatgpt_work_cloud") continue;
    const threadId = stringField(thread, "threadId", "thread_id", "id");
    if (!threadId || isTemporaryThreadId(threadId)) continue;
    const updatedAt = stringField(thread, "updatedAt", "updated_at");
    if (!updatedAt || Date.parse(updatedAt) < requestedTime) continue;
    if (projectId !== null && stringField(thread, "projectId", "project_id") !== projectId) continue;
    candidates.push({ threadId });
  }
  return candidates;
}

function initialUserPrompt(value: unknown): string | null {
  for (const object of objectsIn(value)) {
    if (Array.isArray(object.turns)) {
      for (const turn of object.turns) {
        if (!turn || typeof turn !== "object" || Array.isArray(turn)) continue;
        const turnObject = turn as Record<string, unknown>;
        const authored = userAuthoredText(turnObject);
        if (authored !== null) return authored;
        const params = asObject(turnObject.params);
        const input = params ? textContent(params.input) : null;
        if (input !== null) return input;
      }
    }
    if (Array.isArray(object.messages)) {
      for (const message of object.messages) {
        if (!message || typeof message !== "object" || Array.isArray(message)) continue;
        const authored = userAuthoredText(message as Record<string, unknown>);
        if (authored !== null) return authored;
      }
    }
  }
  return null;
}

function userAuthoredText(object: Record<string, unknown>): string | null {
  const author = asObject(object.author);
  const role = (stringField(object, "role", "authorRole", "author_role") ?? (author && stringField(author, "role")))?.toLowerCase();
  const type = stringField(object, "type")?.toLowerCase();
  if (role === "user" || type === "usermessage" || type === "user_message") {
    return textContent(object.content ?? object.text ?? object.input);
  }
  if (Array.isArray(object.items)) {
    for (const item of object.items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const text = userAuthoredText(item as Record<string, unknown>);
      if (text !== null) return text;
    }
  }
  return null;
}

function textContent(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  const parts: string[] = [];
  for (const item of value) {
    if (typeof item === "string") parts.push(item);
    else if (item && typeof item === "object" && !Array.isArray(item)) {
      const object = item as Record<string, unknown>;
      const type = stringField(object, "type")?.toLowerCase();
      if (!type || type === "text" || type === "input_text") {
        const text = stringField(object, "text", "value");
        if (text !== null) parts.push(text);
      }
    }
  }
  return parts.length ? parts.join("") : null;
}

function isExecutorOutcome(value: unknown): value is WorkCloudExecutorOutcome {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return ["READY", "WRONG_SURFACE", "PENDING_SETUP", "PENDING_APPROVAL", "UNAVAILABLE", "FAILED"]
    .includes(String((value as Record<string, unknown>).kind));
}

function isAppToolResult(value: unknown): value is AppToolResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  return (object.isError === undefined || typeof object.isError === "boolean")
    && (object.content === undefined || Array.isArray(object.content));
}

function validateMutationToolCall(input: { name: MutatingAppToolName; arguments: Record<string, unknown> }): void {
  const keys = Object.keys(input.arguments).sort();
  if (input.name === "create_thread") {
    if (canonicalKeyList(keys) !== "prompt,target,title") throw new Error("create_thread arguments do not match the bounded contract.");
    const target = asObject(input.arguments.target);
    if (!target || target.type !== "chatgptWorkCloud") throw new Error("create_thread target must be chatgptWorkCloud.");
    const targetKeys = Object.keys(target).sort();
    if (!(["type"].toString() === targetKeys.toString() || ["projectId", "type"].toString() === targetKeys.toString())) {
      throw new Error("create_thread target contains unsupported fields.");
    }
    if (typeof input.arguments.title !== "string" || typeof input.arguments.prompt !== "string") {
      throw new Error("create_thread title and prompt must be exact strings.");
    }
    if (target.projectId !== undefined && typeof target.projectId !== "string") throw new Error("create_thread projectId must be a string.");
    return;
  }
  if (canonicalKeyList(keys) !== "prompt,threadId"
    || typeof input.arguments.threadId !== "string" || typeof input.arguments.prompt !== "string") {
    throw new Error("send_message_to_thread arguments do not match the bounded contract.");
  }
}

function canonicalKeyList(keys: string[]): string {
  return keys.join(",");
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function jsonRpcError(value: unknown): string {
  const object = asObject(value);
  return object && typeof object.message === "string" ? object.message : "Codex app-server request failed.";
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
