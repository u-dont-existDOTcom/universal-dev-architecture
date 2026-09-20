import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { connectCodexAppServerMutationBridge } from "../lib/chatgpt-work-cloud-controller";

test("spawned app-server resumes the bound thread and receives the app-tools pipe", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "mc-app-server-"));
  const server = path.join(directory, "fake-app-server.mjs");
  writeFileSync(server, `
import readline from "node:readline";
const rl = readline.createInterface({ input: process.stdin });
function send(message) { process.stdout.write(JSON.stringify(message) + "\\n"); }
rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { userAgent: "fake" } });
    return;
  }
  if (message.method === "initialized") return;
  if (message.method === "thread/resume") {
    if (message.params?.threadId !== "product-thread-lifecycle") {
      send({ jsonrpc: "2.0", id: message.id, error: { code: -32602, message: "wrong thread" } });
      return;
    }
    if (process.env.CODEX_APP_TOOLS_PIPE_PATH !== "/tmp/mc-app-tools-test.pipe") {
      send({ jsonrpc: "2.0", id: message.id, error: { code: -32602, message: "pipe not forwarded" } });
      return;
    }
    send({ jsonrpc: "2.0", id: message.id, result: { thread: { id: message.params.threadId } } });
    return;
  }
  if (message.method === "mcpServer/tool/call") {
    send({ jsonrpc: "2.0", id: message.id, result: {
      structuredContent: { kind: "chatgpt", threadId: "stable-work-test" }
    } });
  }
});
`);

  const priorMissionPipe = process.env.MISSION_CONTROL_CHATGPT_APP_TOOLS_PIPE_PATH;
  const priorCodexPipe = process.env.CODEX_APP_TOOLS_PIPE_PATH;
  process.env.MISSION_CONTROL_CHATGPT_APP_TOOLS_PIPE_PATH = "/tmp/mc-app-tools-test.pipe";
  delete process.env.CODEX_APP_TOOLS_PIPE_PATH;

  let bridge: Awaited<ReturnType<typeof connectCodexAppServerMutationBridge>> | null = null;
  try {
    bridge = await connectCodexAppServerMutationBridge({
      command: process.execPath,
      args: [server],
      threadId: "product-thread-lifecycle",
      appServerName: "codex_app",
    });
    const result = await bridge.callTool({
      name: "create_thread",
      arguments: {
        title: "Work — lifecycle",
        prompt: "exact",
        target: { type: "chatgptWorkCloud" },
      },
    });
    assert.equal(result.kind, "RESULT");
  } finally {
    await bridge?.close();
    if (priorMissionPipe === undefined) delete process.env.MISSION_CONTROL_CHATGPT_APP_TOOLS_PIPE_PATH;
    else process.env.MISSION_CONTROL_CHATGPT_APP_TOOLS_PIPE_PATH = priorMissionPipe;
    if (priorCodexPipe === undefined) delete process.env.CODEX_APP_TOOLS_PIPE_PATH;
    else process.env.CODEX_APP_TOOLS_PIPE_PATH = priorCodexPipe;
    rmSync(directory, { recursive: true, force: true });
  }
});
