import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  HttpWorkCloudEventSink,
  NativeChatGptWorkCloudExecutor,
  capabilityEvidenceFromTools,
  createCodexAppServerMutationBridge,
  connectCodexDriverMutationBridge,
  inMemoryDeferredThreads,
  writePrivateWorkThreadLocator,
  type AppToolResult,
  type ProductMutationResult,
  type WorkCloudAppToolClient,
  type WorkCloudProductMutationBridge,
} from "../lib/chatgpt-work-cloud-controller";

class FakeReadClient implements WorkCloudAppToolClient {
  readonly calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

  constructor(private readonly handler: (name: string, args: Record<string, unknown>) => AppToolResult | Promise<AppToolResult>) {}

  async listTools() {
    return { tools: ["create_thread", "send_message_to_thread", "read_thread", "list_threads"].map((name) => ({ name })) };
  }

  async callTool(input: { name: string; arguments: Record<string, unknown> }) {
    this.calls.push(input);
    if (input.name === "create_thread" || input.name === "send_message_to_thread") {
      throw new Error("mutating calls must not cross the deterministic MCP read bridge");
    }
    return this.handler(input.name, input.arguments);
  }

  async close() {}
}

class FakeMutationBridge implements WorkCloudProductMutationBridge {
  readonly calls: Array<{ name: "create_thread" | "send_message_to_thread"; arguments: Record<string, unknown> }> = [];

  constructor(private readonly handler: (
    name: "create_thread" | "send_message_to_thread",
    args: Record<string, unknown>,
  ) => ProductMutationResult | Promise<ProductMutationResult>) {}

  async callTool(input: { name: "create_thread" | "send_message_to_thread"; arguments: Record<string, unknown> }) {
    this.calls.push(input);
    return this.handler(input.name, input.arguments);
  }

  async close() {}
}

const value = (structuredContent: unknown): AppToolResult => ({ structuredContent });
const result = (structuredContent: unknown): ProductMutationResult => ({ kind: "RESULT", result: value(structuredContent) });
const requestedAt = "2026-09-19T20:00:00.000Z";

test("mutation cannot use the deterministic MCP bridge or caller self-attestation", async () => {
  const reads = new FakeReadClient(() => { throw new Error("no read expected"); });
  const executor = new NativeChatGptWorkCloudExecutor(reads, null);

  const outcome = await executor.createThread({
    title: "Work — approval boundary", prompt: "exact prompt", requestedAt, target: { type: "chatgptWorkCloud" },
  });

  assert.deepEqual(outcome, { kind: "PENDING_APPROVAL" });
  assert.deepEqual(reads.calls, []);
});

test("real local-chatgpt create resolves by time, project, and exact prompt without clientThreadId mapping or title", async () => {
  const prompt = "harmless exact canary\nwith exact bytes";
  const reads = new FakeReadClient((name, args) => {
    if (name === "list_threads") return value({
      unavailableSources: [],
      threads: [
        { kind: "chatgpt", id: "stable-work-1", updatedAt: 1_789_848_001_000, projectId: "project-1", title: "provider changed this title" },
        { kind: "chatgpt", id: "stable-wrong-project", updatedAt: 1_789_848_002, projectId: "project-2", title: "Work — requested title" },
        { kind: "chatgpt", id: "stable-too-old", updatedAt: 1_789_847_999_000, projectId: "project-1" },
      ],
    });
    if (name === "read_thread" && args.threadId === "stable-work-1") return value({
      thread: { kind: "chatgpt", id: "stable-work-1", turns: [{ params: { input: [{ type: "text", text: prompt }] } }] },
    });
    throw new Error(`Unexpected ${name} ${String(args.threadId)}`);
  });
  const mutations = new FakeMutationBridge((name, args) => {
    assert.equal(name, "create_thread");
    assert.deepEqual(args, {
      title: "Work — requested title",
      prompt,
      target: { type: "chatgptWorkCloud", projectId: "project-1" },
    });
    return result({ kind: "chatgpt", threadId: "local-chatgpt:client-1" });
  });
  const executor = new NativeChatGptWorkCloudExecutor(reads, mutations, { resolutionAttempts: 1, sleep: async () => undefined });

  const outcome = await executor.createThread({
    title: "Work — requested title", prompt, requestedAt, target: { type: "chatgptWorkCloud", projectId: "project-1" },
  });

  assert.deepEqual(outcome, { kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "stable-work-1", hostId: null });
  assert.equal(mutations.calls.length, 1);
  assert.deepEqual(reads.calls.map((call) => call.name), ["list_threads", "read_thread", "read_thread"]);
  assert.equal(reads.calls.some((call) => call.arguments.threadId === "local-chatgpt:client-1"), false);
});

test("a long Work prompt resolves from the exact 2000-character provider readback prefix only", async () => {
  const prompt = "round4-".repeat(400);
  const preview = prompt.slice(0, 2_000);
  const makeReads = (observed: string) => new FakeReadClient((name, args) => {
    if (name === "list_threads") return value({
      unavailableSources: [],
      threads: [{ kind: "chatgpt", id: "stable-long", updatedAt: 1_789_848_001_000 }],
    });
    if (name === "read_thread" && args.threadId === "stable-long") return value({
      thread: { kind: "chatgpt", id: "stable-long", turns: [{ params: { input: [{ type: "text", text: observed }] } }] },
    });
    throw new Error(`Unexpected ${name}`);
  });

  const accepted = await new NativeChatGptWorkCloudExecutor(makeReads(preview), null, { resolutionAttempts: 1 })
    .resolveCreatedThread({ clientThreadId: "local-chatgpt:long", prompt, requestedAt, projectId: null });
  assert.deepEqual(accepted, { kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "stable-long", hostId: null });

  const rejected = await new NativeChatGptWorkCloudExecutor(makeReads(preview.slice(0, 1_999)), null, { resolutionAttempts: 1 })
    .resolveCreatedThread({ clientThreadId: "local-chatgpt:short-prefix", prompt, requestedAt, projectId: null });
  assert.deepEqual(rejected, { kind: "PENDING_SETUP", clientThreadId: "local-chatgpt:short-prefix" });
});

test("two stable threads with the same exact provider prompt prefix fail closed as ambiguous", async () => {
  const prompt = "same-prefix-".repeat(250);
  const preview = prompt.slice(0, 2_000);
  const reads = new FakeReadClient((name, args) => {
    if (name === "list_threads") return value({
      unavailableSources: [],
      threads: [
        { kind: "chatgpt", id: "stable-prefix-a", updatedAt: 1_789_848_001_000 },
        { kind: "chatgpt", id: "stable-prefix-b", updatedAt: 1_789_848_002_000 },
      ],
    });
    if (name === "read_thread" && (args.threadId === "stable-prefix-a" || args.threadId === "stable-prefix-b")) return value({
      thread: { kind: "chatgpt", id: args.threadId, turns: [{ params: { input: [{ type: "text", text: preview }] } }] },
    });
    throw new Error(`Unexpected ${name}`);
  });
  const outcome = await new NativeChatGptWorkCloudExecutor(reads, null, { resolutionAttempts: 1 })
    .resolveCreatedThread({ clientThreadId: "local-chatgpt:ambiguous-prefix", prompt, requestedAt, projectId: null });
  assert.deepEqual(outcome, { kind: "FAILED", reasonCode: "WORK_CLOUD_CREATE_AMBIGUOUS_PROMPT_MATCH" });
});

test("unavailable ChatGPT source remains retryable PENDING_SETUP and never replays create", async () => {
  const reads = new FakeReadClient((name) => {
    assert.equal(name, "list_threads");
    return value({ threads: [], unavailableSources: ["chatgpt"] });
  });
  const mutations = new FakeMutationBridge(() => result({ kind: "chatgpt", threadId: "local-chatgpt:client-unavailable" }));
  const executor = new NativeChatGptWorkCloudExecutor(reads, mutations, { resolutionAttempts: 2, sleep: async () => undefined });

  const created = await executor.createThread({
    title: "Work — unavailable", prompt: "exact prompt", requestedAt, target: { type: "chatgptWorkCloud" },
  });
  const retried = await executor.resolveCreatedThread({
    clientThreadId: "local-chatgpt:client-unavailable", prompt: "exact prompt", requestedAt, projectId: null,
  });

  assert.deepEqual(created, { kind: "PENDING_SETUP", clientThreadId: "local-chatgpt:client-unavailable" });
  assert.deepEqual(retried, created);
  assert.equal(mutations.calls.length, 1);
  assert.deepEqual(reads.calls.map((call) => call.name), ["list_threads", "list_threads"]);
});

test("zero exact-prompt candidates remain PENDING_SETUP", async () => {
  const reads = new FakeReadClient((name, args) => {
    if (name === "list_threads") return value({ threads: [
      { kind: "chatgpt", id: "stable-other", updatedAt: "2026-09-19T20:00:01.000Z" },
    ] });
    if (name === "read_thread" && args.threadId === "stable-other") return value({
      thread: { kind: "chatgpt", id: "stable-other", turns: [{ params: { input: [{ type: "text", text: "different prompt" }] } }] },
    });
    throw new Error(`Unexpected ${name}`);
  });
  const mutations = new FakeMutationBridge(() => result({ kind: "chatgpt", threadId: "local-chatgpt:client-zero" }));
  const outcome = await new NativeChatGptWorkCloudExecutor(reads, mutations, { resolutionAttempts: 1 })
    .createThread({ title: "Work — zero", prompt: "exact prompt", requestedAt, target: { type: "chatgptWorkCloud" } });
  assert.deepEqual(outcome, { kind: "PENDING_SETUP", clientThreadId: "local-chatgpt:client-zero" });
});

test("multiple exact-prompt candidates fail closed as ambiguous", async () => {
  const reads = new FakeReadClient((name, args) => {
    if (name === "list_threads") return value({ threads: [
      { kind: "chatgpt", id: "stable-a", updatedAt: "2026-09-19T20:00:01.000Z" },
      { kind: "chatgpt", id: "stable-b", updatedAt: "2026-09-19T20:00:02.000Z" },
    ] });
    if (name === "read_thread") return value({
      thread: { kind: "chatgpt", id: args.threadId, turns: [{ params: { input: [{ type: "text", text: "exact prompt" }] } }] },
    });
    throw new Error(`Unexpected ${name}`);
  });
  const mutations = new FakeMutationBridge(() => result({ kind: "chatgpt", threadId: "local-chatgpt:client-many" }));
  const outcome = await new NativeChatGptWorkCloudExecutor(reads, mutations, { resolutionAttempts: 1 })
    .createThread({ title: "Work — many", prompt: "exact prompt", requestedAt, target: { type: "chatgptWorkCloud" } });
  assert.deepEqual(outcome, { kind: "FAILED", reasonCode: "WORK_CLOUD_CREATE_AMBIGUOUS_PROMPT_MATCH" });
});

test("continuation crosses the product bridge with the exact stable thread and is read back", async () => {
  const reads = new FakeReadClient((name, args) => {
    assert.equal(name, "read_thread");
    return value({ thread: { kind: "chatgpt", id: args.threadId } });
  });
  const mutations = new FakeMutationBridge((name, args) => {
    assert.equal(name, "send_message_to_thread");
    assert.deepEqual(args, { threadId: "stable-work-3", prompt: "continue exactly here" });
    return result({ kind: "chatgpt", threadId: "stable-work-3" });
  });
  const outcome = await new NativeChatGptWorkCloudExecutor(reads, mutations)
    .sendMessageToThread({ threadId: "stable-work-3", prompt: "continue exactly here" });
  assert.deepEqual(outcome, { kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "stable-work-3", hostId: null });
  assert.equal(mutations.calls.length, 1);
  assert.deepEqual(reads.calls.map((call) => call.name), ["read_thread", "read_thread"]);
});

test("wrong-surface product result is rejected", async () => {
  const reads = new FakeReadClient(() => { throw new Error("no read expected"); });
  const mutations = new FakeMutationBridge(() => result({ kind: "codex", threadId: "codex-thread" }));
  const outcome = await new NativeChatGptWorkCloudExecutor(reads, mutations).createThread({
    title: "Work — not proof", prompt: "canary", requestedAt, target: { type: "chatgptWorkCloud" },
  });
  assert.deepEqual(outcome, { kind: "WRONG_SURFACE", observedSurface: "CODEX" });
});

test("product approval request remains PENDING_APPROVAL", async () => {
  const reads = new FakeReadClient(() => { throw new Error("no read expected"); });
  const mutations = new FakeMutationBridge(() => ({ kind: "PENDING_APPROVAL" }));
  const outcome = await new NativeChatGptWorkCloudExecutor(reads, mutations).createThread({
    title: "Work — approval", prompt: "canary", requestedAt, target: { type: "chatgptWorkCloud" },
  });
  assert.deepEqual(outcome, { kind: "PENDING_APPROVAL" });
});

test("Codex app-server approval request is surfaced without an acceptance response", async () => {
  const calls: unknown[] = [];
  const bridge = createCodexAppServerMutationBridge({ threadId: "product-thread-1", appServerName: "codex_apps" }, {
    call: async (input) => { calls.push(input); return { kind: "PENDING_APPROVAL" }; },
    close: async () => undefined,
  });
  try {
    const outcome = await bridge.callTool({
      name: "create_thread",
      arguments: { title: "Work — approval", prompt: "exact", target: { type: "chatgptWorkCloud" } },
    });
    assert.deepEqual(outcome, { kind: "PENDING_APPROVAL" });
    assert.deepEqual(calls, [{
      threadId: "product-thread-1",
      server: "codex_apps",
      tool: "create_thread",
      arguments: { title: "Work — approval", prompt: "exact", target: { type: "chatgptWorkCloud" } },
    }]);
  } finally {
    await bridge.close();
  }
});

test("Codex app-server bridge validates exact arguments and rejects an extra mutation", async () => {
  const bridge = createCodexAppServerMutationBridge({ threadId: "product-thread-2", appServerName: "codex_apps" }, {
    call: async (input) => ({ kind: "RESULT", value: { structuredContent: { echo: input } } }),
    close: async () => undefined,
  });
  try {
    const first = await bridge.callTool({
      name: "send_message_to_thread",
      arguments: { threadId: "stable-work-3", prompt: "continue exactly here" },
    });
    assert.equal(first.kind, "RESULT");
    if (first.kind === "RESULT") assert.deepEqual(first.result.structuredContent, { echo: {
      threadId: "product-thread-2",
      server: "codex_apps",
      tool: "send_message_to_thread",
      arguments: { threadId: "stable-work-3", prompt: "continue exactly here" },
    } });
    assert.deepEqual(await bridge.callTool({
      name: "send_message_to_thread",
      arguments: { threadId: "stable-work-3", prompt: "duplicate" },
    }), { kind: "UNAVAILABLE", reasonCode: "WORK_CLOUD_EXTRA_MUTATION_REJECTED" });
  } finally {
    await bridge.close();
  }
});

test("desktop Codex driver accepts only the exact structured app-tool receipt", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mc-work-driver-test-"));
  const rollout = join(dir, "rollout.jsonl");
  await writeFile(rollout, "");
  const expectedArguments = {
    title: "Work — driver exact",
    prompt: "exact Work prompt",
    target: { type: "chatgptWorkCloud" },
  };
  const bridge = await connectCodexDriverMutationBridge({
    command: "/fake/codex", threadId: "driver-thread-1", rolloutPath: rollout, timeoutMs: 1_000, pollMs: 1,
  }, {
    requestId: () => "driver-request-exact-1",
    sleep: async () => undefined,
    queueMessage: async ({ command, threadId, message }) => {
      assert.equal(command, "/fake/codex");
      assert.equal(threadId, "driver-thread-1");
      assert.match(message, /driver-request-exact-1/);
      assert.match(message, /create_thread exactly once/);
      await appendFile(rollout, [
        JSON.stringify({ type: "message", payload: { role: "user", content: [{ type: "input_text", text: message }] } }),
        JSON.stringify({ type: "event_msg", payload: { type: "item_completed", item: {
          type: "McpToolCall", server: "codex_app", tool: "create_thread", arguments: expectedArguments,
          status: "completed", result: { content: [{ type: "text", text: JSON.stringify({ kind: "chatgpt", clientThreadId: "local-chatgpt:driver-1" }) }], isError: false },
        } } }),
        JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } }),
      ].join("\n") + "\n");
    },
  });
  try {
    const outcome = await bridge.callTool({ name: "create_thread", arguments: expectedArguments });
    assert.deepEqual(outcome, {
      kind: "RESULT",
      result: { content: [{ type: "text", text: JSON.stringify({ kind: "chatgpt", clientThreadId: "local-chatgpt:driver-1" }) }], isError: false },
    });
    assert.deepEqual(await bridge.callTool({ name: "create_thread", arguments: expectedArguments }), {
      kind: "UNAVAILABLE", reasonCode: "WORK_CLOUD_EXTRA_MUTATION_REJECTED",
    });
  } finally {
    await bridge.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("desktop Codex driver fails closed when the turn performs a different MCP action", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mc-work-driver-test-"));
  const rollout = join(dir, "rollout.jsonl");
  await writeFile(rollout, "");
  const expectedArguments = { threadId: "stable-work-1", prompt: "continue exactly" };
  const bridge = await connectCodexDriverMutationBridge({
    command: "/fake/codex", threadId: "driver-thread-2", rolloutPath: rollout, timeoutMs: 1_000, pollMs: 1,
  }, {
    requestId: () => "driver-request-wrong-1",
    sleep: async () => undefined,
    queueMessage: async ({ message }) => {
      await appendFile(rollout, [
        JSON.stringify({ type: "message", payload: { role: "user", content: [{ type: "input_text", text: message }] } }),
        JSON.stringify({ type: "event_msg", payload: { type: "item_completed", item: {
          type: "McpToolCall", server: "codex_app", tool: "list_threads", arguments: { limit: 1 },
          status: "completed", result: { content: [{ type: "text", text: "{}" }], isError: false },
        } } }),
        JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } }),
      ].join("\n") + "\n");
    },
  });
  try {
    assert.deepEqual(await bridge.callTool({ name: "send_message_to_thread", arguments: expectedArguments }), {
      kind: "UNAVAILABLE", reasonCode: "WORK_CLOUD_DRIVER_UNEXPECTED_ACTION",
    });
  } finally {
    await bridge.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("private Work locator cache preserves requested title to verified cloud thread mapping", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mc-work-locator-test-"));
  try {
    const locator = await writePrivateWorkThreadLocator({
      directory: dir,
      dispatchId: "dispatch:auth:work-cloud:test",
      requestedWorkTitle: "Work — requested owner title",
      sourceChatTitle: "Source Chat",
      sourceChatUrl: "chatgpt-conversation://source-chat-test",
      workThreadId: "stable-cloud-work-1",
      chatgptProjectId: null,
      verifiedAt: requestedAt,
    });
    const stat = await import("node:fs/promises").then((fs) => fs.stat(locator));
    assert.equal(stat.mode & 0o777, 0o600);
    const payload = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(locator, "utf8")));
    assert.deepEqual(payload, {
      schema_version: 1,
      surface: "CHATGPT_WORK_CLOUD",
      dispatch_id: "dispatch:auth:work-cloud:test",
      requested_work_title: "Work — requested owner title",
      source_chat_title: "Source Chat",
      source_chat_url: "chatgpt-conversation://source-chat-test",
      work_thread_id: "stable-cloud-work-1",
      chatgpt_project_id: null,
      verified_at: requestedAt,
      authority: "MISSION_CONTROL_LEDGER",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("capability evidence does not treat direct MCP mutation tools as an approved bridge", () => {
  const tools = ["create_thread", "send_message_to_thread", "read_thread", "list_threads"].map((name) => ({ name }));
  assert.deepEqual(capabilityEvidenceFromTools(tools, "app-test", requestedAt), {
    observedAt: requestedAt,
    appVersion: "app-test",
    createThreadTargetAvailable: false,
    sendMessageToThreadAvailable: false,
    nativeSurfaceVerificationAvailable: true,
  });
  assert.deepEqual(capabilityEvidenceFromTools(tools, "app-test", requestedAt, true), {
    observedAt: requestedAt,
    appVersion: "app-test",
    createThreadTargetAvailable: true,
    sendMessageToThreadAvailable: true,
    nativeSurfaceVerificationAvailable: true,
  });
});

test("HTTP sink retrieves exact dispatch state and appends through authenticated events", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const requestEnvelope = {
    schema_version: 2 as const, event_id: "request", mission_id: "mission-control-live",
    occurred_at: requestedAt,
    data: { type: "chatgpt_work_cloud_dispatch_requested" as const, worker: "askrigor" },
  } as never;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    if (init?.method === "POST") return new Response(JSON.stringify({ event: {} }), { status: 201 });
    return new Response(JSON.stringify({ request: requestEnvelope, handoffIntent: null, result: null }), { status: 200 });
  };
  const sink = new HttpWorkCloudEventSink({
    baseUrl: "http://mission-control.test/", token: "secret", producerId: "system:chatgpt-work-cloud-dispatch",
    workerScopes: ["askrigor"], taskScopes: ["task:askrigor"], fetch: fetcher as typeof fetch,
  });
  assert.deepEqual(await sink.getWorkCloudDispatch("askrigor", "dispatch:1"), { request: requestEnvelope, handoffIntent: null, result: null });
  await sink.recordWorkerEvents("askrigor", [requestEnvelope]);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, "http://mission-control.test/events");
  assert.equal(new Headers(requests[1].init?.headers).get("x-mission-control-producer-kind"), "SYSTEM");
});

test("resolver stops at the first rate-limit response and stays PENDING_SETUP", async () => {
  const reads = new FakeReadClient((name, args) => {
    if (name === "list_threads") {
      assert.deepEqual(args, { limit: 50 });
      return value({ unavailableSources: [], threads: [
        { kind: "chatgpt", id: "busy-a", updatedAt: 1_789_848_001_000 },
        { kind: "chatgpt", id: "busy-b", updatedAt: 1_789_848_002_000 },
      ] });
    }
    return { isError: true, content: [{ type: "text", text: "{\"detail\":\"Too many requests\"}" }] };
  });
  const outcome = await new NativeChatGptWorkCloudExecutor(reads, null, { resolutionAttempts: 5, sleep: async () => undefined })
    .resolveCreatedThread({ clientThreadId: "local-chatgpt:rate", prompt: "exact prompt", requestedAt, projectId: null });
  assert.deepEqual(outcome, { kind: "PENDING_SETUP", clientThreadId: "local-chatgpt:rate" });
  assert.deepEqual(reads.calls.map((call) => call.name), ["list_threads", "read_thread"]);
});

test("a proven non-matching thread is read once and remembered across resolutions", async () => {
  const reads = new FakeReadClient((name, args) => {
    if (name === "list_threads") return value({ unavailableSources: [], threads: [
      { kind: "chatgpt", id: "other-chat", updatedAt: 1_789_848_001_000 },
    ] });
    if (name === "read_thread" && args.threadId === "other-chat") return value({
      thread: { kind: "chatgpt", id: "other-chat", turns: [{ params: { input: [{ type: "text", text: "an unrelated owner chat" }] } }] },
    });
    throw new Error(`Unexpected ${name}`);
  });
  const remembered = new Set<string>();
  const options = { resolutionAttempts: 3, sleep: async () => undefined, knownNonMatchingThreads: remembered };
  const first = await new NativeChatGptWorkCloudExecutor(reads, null, options)
    .resolveCreatedThread({ clientThreadId: "local-chatgpt:nm", prompt: "exact prompt", requestedAt, projectId: null });
  const second = await new NativeChatGptWorkCloudExecutor(reads, null, options)
    .resolveCreatedThread({ clientThreadId: "local-chatgpt:nm", prompt: "exact prompt", requestedAt, projectId: null });
  assert.deepEqual(first, { kind: "PENDING_SETUP", clientThreadId: "local-chatgpt:nm" });
  assert.deepEqual(second, first);
  assert.deepEqual([...remembered], ["other-chat"]);
  assert.equal(reads.calls.filter((call) => call.name === "read_thread").length, 1);
});

test("reads per resolution are capped", async () => {
  const threads = Array.from({ length: 30 }, (_, index) => ({ kind: "chatgpt", id: `t-${index}`, updatedAt: 1_789_848_001_000 + index }));
  const reads = new FakeReadClient((name) => {
    if (name === "list_threads") return value({ unavailableSources: [], threads });
    throw new Error("not readable yet");
  });
  const outcome = await new NativeChatGptWorkCloudExecutor(reads, null, { resolutionAttempts: 20, sleep: async () => undefined, maxResolutionReads: 12 })
    .resolveCreatedThread({ clientThreadId: "local-chatgpt:cap", prompt: "exact prompt", requestedAt, projectId: null });
  assert.deepEqual(outcome, { kind: "PENDING_SETUP", clientThreadId: "local-chatgpt:cap" });
  assert.equal(reads.calls.filter((call) => call.name === "read_thread").length, 12);
});

test("unreadable candidates rotate behind unread ones so a capped scan reaches a later match across cycles", async () => {
  const threads = Array.from({ length: 20 }, (_, index) => ({ kind: "chatgpt", id: `t-${index}`, updatedAt: 1_789_848_001_000 + index }));
  const target = "t-15";
  let earlyThreadsReadable = false;
  const reads = new FakeReadClient((name, args) => {
    if (name === "list_threads") return value({ unavailableSources: [], threads });
    if (name === "read_thread" && args.threadId === target) return value({
      thread: { kind: "chatgpt", id: target, turns: [{ params: { input: [{ type: "text", text: "exact prompt" }] } }] },
    });
    if (name === "read_thread" && !earlyThreadsReadable && Number(String(args.threadId).slice(2)) < 12) throw new Error("not readable yet");
    if (name === "read_thread") return value({
      thread: { kind: "chatgpt", id: args.threadId, turns: [{ params: { input: [{ type: "text", text: "an unrelated owner chat" }] } }] },
    });
    throw new Error(`Unexpected ${name}`);
  });
  const deferredThreads = inMemoryDeferredThreads();
  const knownNonMatchingThreads = new Set<string>();
  const matches = new Set<string>();
  const provisionalMatches = { has: (id: string) => matches.has(id), add: (id: string) => { matches.add(id); }, ids: () => [...matches] };
  const options = { resolutionAttempts: 1, sleep: async () => undefined, maxResolutionReads: 12, deferredThreads, knownNonMatchingThreads, provisionalMatches };
  const input = { clientThreadId: "local-chatgpt:rotate", prompt: "exact prompt", requestedAt, projectId: null };
  const pending = { kind: "PENDING_SETUP", clientThreadId: "local-chatgpt:rotate" };
  const readIds = () => reads.calls.filter((call) => call.name === "read_thread").map((call) => call.arguments.threadId);

  assert.deepEqual(await new NativeChatGptWorkCloudExecutor(reads, null, options).resolveCreatedThread(input), pending);
  assert.deepEqual(readIds(), Array.from({ length: 12 }, (_, index) => `t-${index}`));

  // Cycle 2 reads the unread candidates first and finds the match, but the cap is reached before the
  // deferred candidates are all re-checked, so the match stays provisional.
  assert.deepEqual(await new NativeChatGptWorkCloudExecutor(reads, null, options).resolveCreatedThread(input), pending);
  assert.deepEqual(readIds().slice(12, 20), Array.from({ length: 8 }, (_, index) => `t-${index + 12}`));
  assert.deepEqual([...matches], [target]);

  // Cycle 3: the early threads are now readable and ruled out, so the scan completes within the cap and
  // binds the single match.
  earlyThreadsReadable = true;
  const third = await new NativeChatGptWorkCloudExecutor(reads, null, options).resolveCreatedThread(input);
  assert.deepEqual(third, { kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: target, hostId: null });
});

test("a duplicate prompt found after the read cap is ambiguous, not silently bound to the first match", async () => {
  const threads = Array.from({ length: 14 }, (_, index) => ({ kind: "chatgpt", id: `d-${index}`, updatedAt: 1_789_848_001_000 + index }));
  const reads = new FakeReadClient((name, args) => {
    if (name === "list_threads") return value({ unavailableSources: [], threads });
    if (name === "read_thread") {
      const id = String(args.threadId);
      const text = id === "d-0" || id === "d-13" ? "exact prompt" : "an unrelated owner chat";
      return value({ thread: { kind: "chatgpt", id, turns: [{ params: { input: [{ type: "text", text }] } }] } });
    }
    throw new Error(`Unexpected ${name}`);
  });
  const matches = new Set<string>();
  const options = {
    resolutionAttempts: 1, sleep: async () => undefined, maxResolutionReads: 12,
    knownNonMatchingThreads: new Set<string>(),
    provisionalMatches: { has: (id: string) => matches.has(id), add: (id: string) => { matches.add(id); }, ids: () => [...matches] },
  };
  const input = { clientThreadId: "local-chatgpt:dup", prompt: "exact prompt", requestedAt, projectId: null };
  assert.deepEqual(await new NativeChatGptWorkCloudExecutor(reads, null, options).resolveCreatedThread(input),
    { kind: "PENDING_SETUP", clientThreadId: "local-chatgpt:dup" });
  assert.deepEqual([...matches], ["d-0"]);
  assert.deepEqual(await new NativeChatGptWorkCloudExecutor(reads, null, options).resolveCreatedThread(input),
    { kind: "FAILED", reasonCode: "WORK_CLOUD_CREATE_AMBIGUOUS_PROMPT_MATCH" });
});

test("a deferred thread that becomes readable is cleared from the deferral order", () => {
  const queue = inMemoryDeferredThreads(["a", "b"]);
  queue.defer("a");
  assert.deepEqual(queue.ids(), ["b", "a"]);
  queue.clear("b");
  assert.deepEqual(queue.ids(), ["a"]);
  assert.equal(queue.rank("b"), -1);
});

test("a provisional match is not bound while another eligible candidate is still unreadable", async () => {
  const threads = [
    { kind: "chatgpt", id: "u-match", updatedAt: 1_789_848_001_000 },
    { kind: "chatgpt", id: "u-hidden", updatedAt: 1_789_848_002_000 },
    { kind: "chatgpt", id: "u-codex", updatedAt: 1_789_848_003_000 },
  ];
  let hiddenReadable = false;
  const reads = new FakeReadClient((name, args) => {
    if (name === "list_threads") return value({ unavailableSources: [], threads });
    if (name === "read_thread" && args.threadId === "u-match") return value({
      thread: { kind: "chatgpt", id: "u-match", turns: [{ params: { input: [{ type: "text", text: "exact prompt" }] } }] },
    });
    if (name === "read_thread" && args.threadId === "u-codex") return value({ thread: { kind: "codex", id: "u-codex", turns: [] } });
    if (name === "read_thread" && args.threadId === "u-hidden" && !hiddenReadable) throw new Error("not readable yet");
    if (name === "read_thread") return value({
      thread: { kind: "chatgpt", id: args.threadId, turns: [{ params: { input: [{ type: "text", text: "an unrelated owner chat" }] } }] },
    });
    throw new Error(`Unexpected ${name}`);
  });
  const matches = new Set<string>();
  const knownNonMatchingThreads = new Set<string>();
  const options = {
    resolutionAttempts: 2, sleep: async () => undefined, maxResolutionReads: 12, knownNonMatchingThreads,
    provisionalMatches: { has: (id: string) => matches.has(id), add: (id: string) => { matches.add(id); }, ids: () => [...matches] },
  };
  const input = { clientThreadId: "local-chatgpt:hidden", prompt: "exact prompt", requestedAt, projectId: null };
  assert.deepEqual(await new NativeChatGptWorkCloudExecutor(reads, null, options).resolveCreatedThread(input),
    { kind: "PENDING_SETUP", clientThreadId: "local-chatgpt:hidden" });
  assert.deepEqual([...matches], ["u-match"]);
  assert.ok(knownNonMatchingThreads.has("u-codex"), "a readable thread on another surface is ruled out");
  hiddenReadable = true;
  assert.deepEqual(await new NativeChatGptWorkCloudExecutor(reads, null, options).resolveCreatedThread(input),
    { kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "u-match", hostId: null });
});
