import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  NativeChatGptWorkCloudExecutor,
  HttpWorkCloudEventSink,
  appVersionFromEnvironment,
  capabilityEvidenceFromTools,
  connectNativeAppToolClient,
  type WorkCloudAppToolClient,
} from "../lib/chatgpt-work-cloud-controller";
import {
  dispatchAndRecordChatGptWorkCloud,
  type WorkCloudApprovalState,
  type WorkCloudDirectiveBinding,
  type WorkCloudDispatchMode,
} from "../lib/chatgpt-work-cloud-dispatch";

const PRODUCER_ID = "system:chatgpt-work-cloud-dispatch";

interface ControllerRequest {
  dispatchId: string;
  mode: WorkCloudDispatchMode;
  binding: WorkCloudDirectiveBinding;
  directiveArtifactPath: string;
  sourceChatTitle: string;
  sourceChatUrl: string;
  requestedWorkTitle: string;
  chatgptProjectId: string | null;
  existingWorkThreadId: string | null;
  prompt?: string;
  promptFile?: string;
  approvalState: WorkCloudApprovalState;
  requestedAt?: string;
}

const requestPath = argument("--request");
if (!requestPath) throw new Error("Usage: npm run work-cloud:dispatch -- --request <controller-request.json>");
const absoluteRequestPath = path.resolve(requestPath);
const request = JSON.parse(fs.readFileSync(absoluteRequestPath, "utf8")) as ControllerRequest;
const requestDirectory = path.dirname(absoluteRequestPath);
const prompt = exactPrompt(request, requestDirectory);
verifyDirectiveArtifact(request, requestDirectory);

const token = requiredEnvironment("MISSION_CONTROL_INTERNAL_TOKEN");
const baseUrl = process.env.MISSION_CONTROL_DAEMON_URL ?? "http://127.0.0.1:4100";
const observedAt = new Date().toISOString();
let appClient: WorkCloudAppToolClient | null = null;
let executor: NativeChatGptWorkCloudExecutor | null = null;
let capabilityEvidence = capabilityEvidenceFromTools([], appVersionFromEnvironment(), observedAt);
let setupError: string | null = null;

try {
  appClient = await connectNativeAppToolClient({
    command: requiredEnvironment("MISSION_CONTROL_CHATGPT_APP_MCP_COMMAND"),
    serverPath: requiredEnvironment("MISSION_CONTROL_CHATGPT_APP_MCP_SERVER"),
    appToolsPipePath: requiredEnvironment("MISSION_CONTROL_CHATGPT_APP_TOOLS_PIPE_PATH"),
    executorThreadId: process.env.MISSION_CONTROL_CHATGPT_APP_EXECUTOR_THREAD_ID
      ?? requiredEnvironment("CODEX_THREAD_ID"),
  });
  const tools = await appClient.listTools();
  capabilityEvidence = capabilityEvidenceFromTools(tools.tools, appVersionFromEnvironment(), observedAt);
  executor = new NativeChatGptWorkCloudExecutor(appClient);
} catch (error) {
  setupError = error instanceof Error ? error.message : "Native app executor setup failed.";
}

const sink = new HttpWorkCloudEventSink({
  baseUrl,
  token,
  producerId: PRODUCER_ID,
  workerScopes: [request.binding.worker],
  taskScopes: [request.binding.taskId],
});

try {
  const completed = await dispatchAndRecordChatGptWorkCloud({
    dispatchId: request.dispatchId,
    mode: request.mode,
    binding: request.binding,
    sourceChatTitle: request.sourceChatTitle,
    sourceChatUrl: request.sourceChatUrl,
    requestedWorkTitle: request.requestedWorkTitle,
    chatgptProjectId: request.chatgptProjectId,
    existingWorkThreadId: request.existingWorkThreadId,
    prompt,
    approvalState: request.approvalState,
    capabilityEvidence,
    requestedAt: request.requestedAt ?? observedAt,
    producerId: PRODUCER_ID,
  }, executor, sink, new Date().toISOString());
  process.stdout.write(`${JSON.stringify({ ...completed, setupError }, null, 2)}\n`);
} finally {
  await appClient?.close().catch(() => undefined);
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function exactPrompt(request: ControllerRequest, requestDirectory: string): string {
  if (Boolean(request.prompt) === Boolean(request.promptFile)) {
    throw new Error("Provide exactly one of prompt or promptFile.");
  }
  const value = request.promptFile
    ? fs.readFileSync(resolveFrom(requestDirectory, request.promptFile), "utf8")
    : request.prompt!;
  if (!value.trim()) throw new Error("The exact runnable prompt must not be empty.");
  return value;
}

function verifyDirectiveArtifact(request: ControllerRequest, requestDirectory: string): void {
  const bytes = fs.readFileSync(resolveFrom(requestDirectory, request.directiveArtifactPath));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== request.binding.directiveArtifactSha256) {
    throw new Error("The controller request does not match the exact bound execution-directive artifact digest.");
  }
}

function resolveFrom(base: string, target: string): string {
  return path.isAbsolute(target) ? target : path.resolve(base, target);
}
