import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  NativeChatGptWorkCloudExecutor,
  HttpWorkCloudEventSink,
  appVersionFromEnvironment,
  capabilityEvidenceFromTools,
  connectCodexAppServerMutationBridge,
  connectCodexDriverMutationBridge,
  connectNativeAppToolClient,
  type WorkCloudAppToolClient,
  type WorkCloudProductMutationBridge,
  writePrivateWorkThreadLocator,
} from "../lib/chatgpt-work-cloud-controller";
import {
  dispatchAndRecordChatGptWorkCloud,
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
  requestedAt?: string;
}

async function main(): Promise<void> {
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
let mutationBridge: WorkCloudProductMutationBridge | null = null;
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
  try {
    const driverConfig = codexDriverMutationConfigFromEnvironment();
    const mutationConfig = productMutationConfigFromEnvironment();
    if (driverConfig) mutationBridge = await connectCodexDriverMutationBridge(driverConfig);
    else if (mutationConfig) mutationBridge = await connectCodexAppServerMutationBridge(mutationConfig);
    else setupError = productMutationApprovalGate();
  } catch (error) {
    setupError = error instanceof Error ? error.message : productMutationApprovalGate();
  }
  capabilityEvidence = capabilityEvidenceFromTools(
    tools.tools,
    appVersionFromEnvironment(),
    observedAt,
    mutationBridge !== null,
  );
  executor = new NativeChatGptWorkCloudExecutor(appClient, mutationBridge);
} catch (error) {
  setupError = error instanceof Error ? error.message : "Native app read/verification setup failed.";
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
    capabilityEvidence,
    requestedAt: request.requestedAt ?? observedAt,
    producerId: PRODUCER_ID,
  }, executor, sink, new Date().toISOString());
  const approvalGate = completed.result.data.type === "chatgpt_work_cloud_dispatch_recorded"
    && completed.result.data.status === "PENDING_APPROVAL"
    ? setupError ?? "Accept the pending app-tool request in the configured Codex/ChatGPT product approval surface."
    : null;
  let privateLocatorPath: string | null = null;
  const locatorDirectory = process.env.MISSION_CONTROL_CHATGPT_WORK_LOCATOR_DIR?.trim();
  if (locatorDirectory && request.mode === "CREATE"
    && completed.result.data.type === "chatgpt_work_cloud_dispatch_recorded"
    && completed.result.data.status === "READY" && completed.result.data.work_thread_id) {
    privateLocatorPath = await writePrivateWorkThreadLocator({
      directory: locatorDirectory,
      dispatchId: request.dispatchId,
      requestedWorkTitle: request.requestedWorkTitle,
      sourceChatTitle: request.sourceChatTitle,
      sourceChatUrl: request.sourceChatUrl,
      workThreadId: completed.result.data.work_thread_id,
      chatgptProjectId: request.chatgptProjectId,
      verifiedAt: completed.result.data.recorded_at,
    });
  }
  process.stdout.write(`${JSON.stringify({ ...completed, setupError, approvalGate, privateLocatorPath }, null, 2)}\n`);
} finally {
  await mutationBridge?.close().catch(() => undefined);
  await appClient?.close().catch(() => undefined);
}
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

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

function codexDriverMutationConfigFromEnvironment(): {
  command: string;
  threadId: string;
  rolloutPath: string;
  timeoutMs?: number;
  pollMs?: number;
} | null {
  const names = [
    "MISSION_CONTROL_CHATGPT_WORK_DRIVER_COMMAND",
    "MISSION_CONTROL_CHATGPT_WORK_DRIVER_THREAD_ID",
    "MISSION_CONTROL_CHATGPT_WORK_DRIVER_ROLLOUT_PATH",
  ] as const;
  const values = names.map((name) => process.env[name]?.trim() ?? "");
  if (values.every((value) => !value)) return null;
  if (values.some((value) => !value)) {
    throw new Error(`Desktop Work driver requires ${names.join(", ")}.`);
  }
  const timeout = optionalPositiveIntegerEnvironment("MISSION_CONTROL_CHATGPT_WORK_DRIVER_TIMEOUT_MS");
  const poll = optionalPositiveIntegerEnvironment("MISSION_CONTROL_CHATGPT_WORK_DRIVER_POLL_MS");
  return { command: values[0], threadId: values[1], rolloutPath: values[2], ...(timeout ? { timeoutMs: timeout } : {}), ...(poll ? { pollMs: poll } : {}) };
}

function optionalPositiveIntegerEnvironment(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function productMutationConfigFromEnvironment(): {
  command: string;
  args: string[];
  threadId: string;
  appServerName: string;
} | null {
  const names = [
    "MISSION_CONTROL_CODEX_APP_SERVER_COMMAND",
    "MISSION_CONTROL_CODEX_APP_SERVER_ARGS_JSON",
    "MISSION_CONTROL_CODEX_APP_SERVER_THREAD_ID",
    "MISSION_CONTROL_CHATGPT_APP_SERVER_NAME",
  ] as const;
  const values = names.map((name) => process.env[name]?.trim() ?? "");
  if (values.every((value) => !value)) return null;
  if (values.some((value) => !value)) {
    throw new Error(`Product-approved mutation bridge requires ${names.join(", ")}.`);
  }
  const args = JSON.parse(values[1]) as unknown;
  if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) {
    throw new Error("MISSION_CONTROL_CODEX_APP_SERVER_ARGS_JSON must be a JSON array of strings.");
  }
  return { command: values[0], args, threadId: values[2], appServerName: values[3] };
}

function productMutationApprovalGate(): string {
  return "Configure either the authenticated desktop Work driver or Codex app-server product-tool route for this controller; direct bundled-MCP mutation is forbidden.";
}
