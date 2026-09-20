import assert from "node:assert/strict";
import test from "node:test";

import {
  HttpWorkCloudEventSink,
  NativeChatGptWorkCloudExecutor,
  capabilityEvidenceFromTools,
  createCodexAppServerMutationBridge,
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
    return new Response(JSON.stringify({ request: requestEnvelope, result: null }), { status: 200 });
  };
  const sink = new HttpWorkCloudEventSink({
    baseUrl: "http://mission-control.test/", token: "secret", producerId: "system:chatgpt-work-cloud-dispatch",
    workerScopes: ["askrigor"], taskScopes: ["task:askrigor"], fetch: fetcher as typeof fetch,
  });
  assert.deepEqual(await sink.getWorkCloudDispatch("askrigor", "dispatch:1"), { request: requestEnvelope, result: null });
  await sink.recordWorkerEvents("askrigor", [requestEnvelope]);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, "http://mission-control.test/events");
  assert.equal(new Headers(requests[1].init?.headers).get("x-mission-control-producer-kind"), "SYSTEM");
});
