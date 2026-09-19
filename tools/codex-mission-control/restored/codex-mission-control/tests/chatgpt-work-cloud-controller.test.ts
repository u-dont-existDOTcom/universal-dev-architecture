import assert from "node:assert/strict";
import test from "node:test";

import {
  HttpWorkCloudEventSink,
  NativeChatGptWorkCloudExecutor,
  capabilityEvidenceFromTools,
  type AppToolResult,
  type WorkCloudAppToolClient,
} from "../lib/chatgpt-work-cloud-controller";

class FakeAppClient implements WorkCloudAppToolClient {
  readonly calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

  constructor(private readonly handler: (name: string, args: Record<string, unknown>) => AppToolResult | Promise<AppToolResult>) {}

  async listTools() {
    return { tools: ["create_thread", "send_message_to_thread", "read_thread", "list_threads"].map((name) => ({ name })) };
  }

  async callTool(input: { name: string; arguments: Record<string, unknown> }) {
    this.calls.push(input);
    return this.handler(input.name, input.arguments);
  }

  async close() {}
}

const value = (structuredContent: unknown): AppToolResult => ({ structuredContent });

test("temporary client identity resolves through exact app-owned lineage without title matching", async () => {
  let temporaryReadCount = 0;
  const client = new FakeAppClient((name, args) => {
    if (name === "create_thread") return value({ kind: "chatgpt", clientThreadId: "client-1", title: "provider changed this title" });
    if (name === "read_thread" && args.threadId === "client-1") {
      temporaryReadCount += 1;
      return { isError: true, content: [{ type: "text", text: "not ready" }] };
    }
    if (name === "list_threads") return value({ threads: [
      { kind: "chatgpt", id: "stable-work-1", clientThreadId: "client-1", title: "unrelated provider title" },
      { kind: "chatgpt", id: "stable-other", clientThreadId: "client-other", title: "Work — requested title" },
    ] });
    if (name === "read_thread" && args.threadId === "stable-work-1") {
      return value({ thread: { kind: "chatgpt", id: "stable-work-1" } });
    }
    throw new Error(`Unexpected ${name}`);
  });
  const executor = new NativeChatGptWorkCloudExecutor(client, { resolutionAttempts: 1, sleep: async () => undefined });

  const result = await executor.createThread({
    title: "Work — requested title",
    prompt: "harmless exact canary",
    target: { type: "chatgptWorkCloud" },
  });

  assert.deepEqual(result, { kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "stable-work-1", hostId: null });
  assert.equal(temporaryReadCount, 1);
  assert.deepEqual(client.calls.map((call) => call.name), ["create_thread", "read_thread", "list_threads", "read_thread"]);
});

test("stable native create is read back on the exact returned thread", async () => {
  const client = new FakeAppClient((name, args) => {
    if (name === "create_thread") return value({ kind: "chatgpt", threadId: "stable-work-2" });
    if (name === "read_thread" && args.threadId === "stable-work-2") {
      return value({ thread: { kind: "chatgpt", id: "stable-work-2" } });
    }
    throw new Error(`Unexpected ${name}`);
  });
  const result = await new NativeChatGptWorkCloudExecutor(client).createThread({
    title: "Work — canary", prompt: "canary", target: { type: "chatgptWorkCloud" },
  });
  assert.equal(result.kind, "READY");
});

test("continuation verifies and preserves the exact stable Work thread", async () => {
  const client = new FakeAppClient((name, args) => {
    if (name === "read_thread" && args.threadId === "stable-work-3") {
      return value({ thread: { kind: "chatgpt", id: "stable-work-3" } });
    }
    if (name === "send_message_to_thread") return value({ kind: "chatgpt", threadId: "stable-work-3" });
    throw new Error(`Unexpected ${name}`);
  });
  const result = await new NativeChatGptWorkCloudExecutor(client)
    .sendMessageToThread({ threadId: "stable-work-3", prompt: "continue exactly here" });
  assert.deepEqual(result, { kind: "READY", surface: "CHATGPT_WORK_CLOUD", threadId: "stable-work-3", hostId: null });
  assert.deepEqual(client.calls.map((call) => call.name), ["read_thread", "send_message_to_thread", "read_thread"]);
});

test("wrong-surface app results are rejected", async () => {
  const client = new FakeAppClient((name) => {
    if (name === "create_thread") return value({ kind: "codex", threadId: "codex-thread" });
    throw new Error(`Unexpected ${name}`);
  });
  const result = await new NativeChatGptWorkCloudExecutor(client).createThread({
    title: "Work — not proof", prompt: "canary", target: { type: "chatgptWorkCloud" },
  });
  assert.deepEqual(result, { kind: "WRONG_SURFACE", observedSurface: "CODEX" });
});

test("native approval requirement is preserved", async () => {
  const client = new FakeAppClient(() => ({ isError: true, content: [{ type: "text", text: "Owner approval required to accept Work" }] }));
  const result = await new NativeChatGptWorkCloudExecutor(client).createThread({
    title: "Work — approval", prompt: "canary", target: { type: "chatgptWorkCloud" },
  });
  assert.deepEqual(result, { kind: "PENDING_APPROVAL" });
});

test("capability evidence reports unavailable executor tools truthfully", () => {
  const evidence = capabilityEvidenceFromTools([{ name: "read_thread" }], "app-test", "2026-09-19T20:00:00.000Z");
  assert.deepEqual(evidence, {
    observedAt: "2026-09-19T20:00:00.000Z",
    appVersion: "app-test",
    createThreadTargetAvailable: false,
    sendMessageToThreadAvailable: false,
    nativeSurfaceVerificationAvailable: false,
  });
});

test("HTTP sink retrieves exact dispatch state and appends through authenticated events", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const requestEnvelope = {
    schema_version: 2 as const, event_id: "request", mission_id: "mission-control-live",
    occurred_at: "2026-09-19T20:00:00.000Z",
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
