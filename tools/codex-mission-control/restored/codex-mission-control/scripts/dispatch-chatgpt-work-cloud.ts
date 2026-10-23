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
  inMemoryDeferredThreads,
  PRIOR_SEARCH_RULE_VERSION,
  privatePriorSearchRuledOut,
  type DeferredThreadQueue,
  type ThreadIdSet,
  type WorkCloudAppToolClient,
  type WorkCloudProductMutationBridge,
  writePrivateWorkThreadLocator,
} from "../lib/chatgpt-work-cloud-controller";
import {
  dispatchAndRecordChatGptWorkCloud,
  type WorkCloudDirectiveBinding,
  type WorkCloudDispatchMode,
} from "../lib/chatgpt-work-cloud-dispatch";
import { parseWorkCloudAutodispatchWorkers } from "../lib/chatgpt-work-cloud-autodispatch";
import { WORK_CLOUD_RETRY_SETTLE_MS, workCloudRetryPrior } from "../lib/chatgpt-work-cloud-retry";
import type { StoredEvent } from "../lib/schema";

const PRODUCER_ID = "system:chatgpt-work-cloud-dispatch";
/** The pause between a retry's search reads: ChatGPT refuses reads that come too fast ("Too many requests"). */
const PRIOR_SEARCH_READ_PAUSE_MS = 2_000;

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
  /** The directive's bounded-execution deadline (from the watcher): no Work call starts at or after it. */
  deadline?: string;
  /** For a retry the owner authorized after a failed start (lib/chatgpt-work-cloud-retry.ts): that start. */
  priorAttempt?: {
    dispatchId: string;
    requestedAt: string;
    resultRecordedAt: string | null;
    promptSha256: string;
    prompt: string | null;
  } | null;
}

/** Mission Control's ledger, as the watcher reads it (scripts/run-chatgpt-work-cloud-autodispatcher.ts). */
async function ledgerEvents(baseUrl: string): Promise<StoredEvent[]> {
  const response = await fetch(`${baseUrl}/events`, { signal: AbortSignal.timeout(15_000) });
  const body = await response.json() as { events?: StoredEvent[] };
  if (!response.ok || !Array.isArray(body.events)) throw new Error("Mission Control's ledger couldn't be read.");
  return body.events;
}

async function main(): Promise<void> {
const requestPath = argument("--request");
if (!requestPath) throw new Error("Usage: npm run work-cloud:dispatch -- --request <controller-request.json>");
const absoluteRequestPath = path.resolve(requestPath);
const request = JSON.parse(fs.readFileSync(absoluteRequestPath, "utf8")) as ControllerRequest;
// The same worker list as the watcher's (it passes its environment on): native Work runs only for the listed workers,
// whoever starts the controller, and the check comes before anything is read from or sent to the app.
const allowedWorkers = parseWorkCloudAutodispatchWorkers(process.env.MISSION_CONTROL_CHATGPT_WORK_AUTODISPATCH_WORKERS_JSON);
if (!allowedWorkers.has(request.binding?.worker)) {
  throw new Error("Native Work is not allowed for this request's worker: it isn't on the native Work autodispatch worker list.");
}
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
  executor = new NativeChatGptWorkCloudExecutor(appClient, mutationBridge, {
    knownNonMatchingThreads: privateThreadIdSet(`${absoluteRequestPath}.nonmatching.json`),
    deferredThreads: privateDeferredThreads(`${absoluteRequestPath}.deferred.json`),
    provisionalMatches: privateThreadIdSet(`${absoluteRequestPath}.matches.json`),
  });
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
  // Before a retry of a failed start is recorded and makes its Work call: the failed start must have settled
  // (WORK_CLOUD_RETRY_SETTLE_MS after Mission Control recorded its result), and a read-only search of the app for a
  // thread whose first message is its exact prompt must have read every thread made since it and found none. Whether
  // the dispatch is a retry, of which start, and that start's times and prompt digest come from the ledger, never from
  // the request file, which only carries the prompt text (Codex review of 10885e69). Otherwise the retry is held:
  // nothing is recorded or sent, and the watcher tries again later. A dispatch whose request is already recorded (a
  // retry's search passed then) is never searched again.
  if (!(await sink.getWorkCloudDispatch(request.binding.worker, request.dispatchId).catch(() => null))?.request) {
    const events = await ledgerEvents(baseUrl).catch(() => null);
    const prior = events === null ? "UNKNOWN" as const : workCloudRetryPrior(events, request.binding.worker, request.dispatchId);
    const filed = request.priorAttempt ?? null;
    if (prior !== null || filed !== null) {
      const priorPrompt = prior !== null && prior !== "UNKNOWN" && filed !== null && filed.dispatchId === prior.dispatchId && filed.prompt !== null
        && createHash("sha256").update(filed.prompt).digest("hex") === prior.promptSha256 ? filed.prompt : null;
      const settledAt = prior !== null && prior !== "UNKNOWN" && prior.resultRecordedAt
        ? Date.parse(prior.resultRecordedAt) + WORK_CLOUD_RETRY_SETTLE_MS : Number.NaN;
      const reason = prior === "UNKNOWN" ? "PRIOR_ATTEMPT_LEDGER_UNREADABLE"
        : prior === null ? "PRIOR_ATTEMPT_NOT_IN_LEDGER"
        : !Number.isFinite(settledAt) || Date.now() < settledAt ? "PRIOR_ATTEMPT_NOT_SETTLED"
        : priorPrompt === null ? "PRIOR_ATTEMPT_PROMPT_UNKNOWN"
        : !executor ? "PRIOR_ATTEMPT_SEARCH_INCOMPLETE"
        : await executor.searchForPrompt({
          prompt: priorPrompt, requestedAt: prior.requestedAt, marker: prior.dispatchId, earlierMarkers: prior.earlierDispatchIds,
          // Threads ruled out by this search's earlier runs, so a search ChatGPT keeps cutting short still finishes. The
          // rule's version is part of the search's name: threads ruled out under an older rule are read again.
          ruledOut: privatePriorSearchRuledOut(`${absoluteRequestPath}.prior-search.json`,
            createHash("sha256").update(JSON.stringify([PRIOR_SEARCH_RULE_VERSION, priorPrompt, prior.dispatchId, prior.earlierDispatchIds])).digest("hex")),
          readPauseMs: PRIOR_SEARCH_READ_PAUSE_MS,
          // This controller's own setup threads, which the owner's setup named for it to run in.
          ownThreadIds: [
            process.env.MISSION_CONTROL_CHATGPT_APP_EXECUTOR_THREAD_ID ?? process.env.CODEX_THREAD_ID,
            process.env.MISSION_CONTROL_CODEX_APP_SERVER_THREAD_ID,
            process.env.MISSION_CONTROL_CHATGPT_WORK_DRIVER_THREAD_ID,
          ].map((threadId) => threadId?.trim() ?? "").filter((threadId) => threadId.length > 0),
        })
          .then((search) => search === "NONE" ? null : search === "MATCH" ? "PRIOR_ATTEMPT_WORK_THREAD_FOUND" : "PRIOR_ATTEMPT_SEARCH_INCOMPLETE")
          .catch(() => "PRIOR_ATTEMPT_SEARCH_INCOMPLETE");
      if (reason) {
        process.stdout.write(`${JSON.stringify({ status: "RETRY_HELD", reason, setupError }, null, 2)}\n`);
        return;
      }
    }
  }
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
    deadline: request.deadline ?? null,
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

// Per-dispatch set of thread ids (proven non-matches, or provisional prompt matches), kept beside the
// private request file (same 0700 directory, file mode 0600) so each thread is read at most once.
function privateThreadIdSet(file: string): ThreadIdSet {
  let ids = new Set<string>();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (Array.isArray(parsed)) ids = new Set(parsed.filter((id): id is string => typeof id === "string").slice(-1_000));
  } catch { /* absent or unreadable: start empty */ }
  return {
    has: (threadId) => ids.has(threadId),
    ids: () => [...ids],
    add: (threadId) => {
      if (ids.has(threadId)) return;
      ids.add(threadId);
      const temp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temp, JSON.stringify([...ids].slice(-1_000)), { mode: 0o600 });
      fs.renameSync(temp, file);
    },
  };
}

// Per-dispatch deferral order of listed-but-unreadable threads (same private directory and mode), so the
// capped resolver scan rotates across cycles instead of re-reading the same unreadable threads.
function privateDeferredThreads(file: string): DeferredThreadQueue {
  let initial: string[] = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (Array.isArray(parsed)) initial = parsed.filter((id): id is string => typeof id === "string").slice(-500);
  } catch { /* absent or unreadable: start empty */ }
  const queue = inMemoryDeferredThreads(initial);
  const persist = () => {
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(queue.ids().slice(-500)), { mode: 0o600 });
    fs.renameSync(temp, file);
  };
  return {
    rank: (threadId) => queue.rank(threadId),
    defer: (threadId) => { queue.defer(threadId); persist(); },
    clear: (threadId) => {
      if (queue.rank(threadId) === -1) return;
      queue.clear(threadId);
      persist();
    },
  };
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
