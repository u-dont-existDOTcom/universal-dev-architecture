import http from "node:http";
import { EventEmitter } from "node:events";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { snapshotFromStore, workerSnapshotFromStore } from "../lib/dashboard-data";
import { seedIssue47Store, seedStore } from "../lib/seed";
import { startLiveWorkerSourceWatcher } from "../lib/live-worker-source";
import {
  ContractInvariantError,
  EventStore,
  IdempotencyConflictError,
} from "../lib/store";
import { CorrectionInvariantError } from "../lib/correction-lifecycle";
import { producerKinds, producerMayEmit, type AuthenticatedProducer, type ProducerKind } from "../lib/ingestion-auth";
import { parseAppendEnvelope } from "../lib/schema";
import { pullWorkerOutbox, recordOwnerMessage } from "../lib/worker-channel";
import {
  ensureConfiguredCapabilityChallenges,
  githubDecisionProducer,
  ingestGitHubSupervisionCandidate,
  parseGitHubReceiptPolicy,
  reconcileGitHubDecisionReceipts,
  type GitHubDecisionCandidate,
} from "../lib/github-decision-receipts";
import { SubmissionAuthorityRuntime, SubmissionSchedulerError } from "../lib/submission-authority-runtime";
import { loadConfiguredSupervisorChats } from "../lib/configured-supervisor-chats";
import { CapabilityRotationRuntime } from "../lib/capability-rotation";
import { UnixCapabilityNoncePublisher } from "../lib/capability-nonce-publisher";

const host = process.env.MISSION_CONTROL_DAEMON_HOST ?? "127.0.0.1";
const port = Number(process.env.MISSION_CONTROL_DAEMON_PORT ?? 4100);
const internalToken = process.env.MISSION_CONTROL_INTERNAL_TOKEN;
if (!internalToken) throw new Error("MISSION_CONTROL_INTERNAL_TOKEN is required; use npm run dev/start or provide a secret for standalone daemon mode.");
const store = new EventStore();
const submissionAuthority = new SubmissionAuthorityRuntime(store);
const dashboardProjectionOptions = { includeFixtureOnly: process.env.MISSION_CONTROL_SKIP_SEED !== "1" };
const notifications = new EventEmitter();
notifications.setMaxListeners(100);
if (process.env.MISSION_CONTROL_SKIP_SEED !== "1") {
  if ((process.env.MISSION_CONTROL_SEED_PROFILE ?? "ISSUE_47") === "ISSUE_47") seedIssue47Store(store);
  else seedStore(store);
}
const githubPolicy = parseGitHubReceiptPolicy();
ensureConfiguredCapabilityChallenges(store, githubPolicy);
const capabilityDirectory=loadConfiguredSupervisorChats();
const capabilityRotationEnabled=process.env.MISSION_CONTROL_CAPABILITY_ROTATION_ENABLED==="1";
if(!capabilityRotationEnabled && store.capabilityRotation.hasHistory()) throw new Error("CAPABILITY_ROTATION_DURABLE_HISTORY_REQUIRES_ENABLED_RUNTIME");
if(capabilityRotationEnabled && (!githubPolicy || capabilityDirectory.configurationState!=="CONFIGURED")) throw new Error("CAPABILITY_ROTATION_STATIC_AUTHORITY_UNAVAILABLE");
const capabilityRotation=capabilityRotationEnabled && githubPolicy ? new CapabilityRotationRuntime(store,githubPolicy,capabilityDirectory.entries,
  process.env.MISSION_CONTROL_CAPABILITY_NONCE_PUBLISHER_SOCKET ? new UnixCapabilityNoncePublisher(process.env.MISSION_CONTROL_CAPABILITY_NONCE_PUBLISHER_SOCKET) : null,
  {ttlMs:Number(process.env.MISSION_CONTROL_CAPABILITY_TTL_MS??86_400_000),renewBeforeMs:Number(process.env.MISSION_CONTROL_CAPABILITY_RENEW_BEFORE_MS??14_400_000)}) : null;
const effectiveGithubPolicy=()=>{
  const policy=capabilityRotation?.effectivePolicy()??githubPolicy;
  return policy ? {...policy,authorizedModeProducerIds:submissionAuthority.capabilityModeProducerIds()} : null;
};
let capabilityRotationStatus: Array<{supervisorId:string;state:"CURRENT"|"BLOCKED"}>=[];
async function reconcileCapabilities() {
  if(!capabilityRotation) return;
  const before=store.latestEventId();
  capabilityRotationStatus=await capabilityRotation.reconcile();
  if(store.latestEventId()!==before) notifications.emit("event",store.allEvents().at(-1));
}
const capabilityRotationTimer=capabilityRotation ? setInterval(()=>void reconcileCapabilities(),60_000) : null;
capabilityRotationTimer?.unref();
void reconcileCapabilities();
const liveSourceWatcher = process.env.MISSION_CONTROL_LIVE_SOURCE && process.env.MISSION_CONTROL_LIVE_WORKTREE
  ? startLiveWorkerSourceWatcher(store, {
    sourcePath: process.env.MISSION_CONTROL_LIVE_SOURCE,
    worktreePath: process.env.MISSION_CONTROL_LIVE_WORKTREE,
  }, (event) => notifications.emit("event", event))
  : null;
const githubReconciliationTimer = startGitHubReconciliation();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
    if (request.method === "GET" && url.pathname === "/health") {
      const authorityHealth = await submissionAuthority.health();
      return json(response, 200, {
        status: "ok",
        latestSequence: store.latestSequence(),
        chain: store.verifyChain(),
        submissionAuthorityConfigured: authorityHealth.configured,
        submissionAuthoritySchedulerState: authorityHealth.schedulerState,
        submissionAuthorityLedger: authorityHealth.ledger,
        capabilityRotation: {enabled:!!capabilityRotation,publisherConfigured:!!process.env.MISSION_CONTROL_CAPABILITY_NONCE_PUBLISHER_SOCKET,registrations:capabilityRotationStatus},
      });
    }
    if(request.method==="GET" && url.pathname==="/internal/capability-policy") {
      const producer=authorizeMutation(request);
      if(producer.kind!=="SYSTEM" || producer.id!==githubDecisionProducer.id) return json(response,403,{error:"Internal policy reader required"});
      response.setHeader("cache-control","no-store");
      return json(response,200,effectiveGithubPolicy());
    }
    if(request.method==="GET" && url.pathname==="/capability-challenges/current") {
      const producer=authorizeMutation(request);
      await submissionAuthority.status(producer); // Requires a currently registered relay collector, not arbitrary internal ingress.
      const supervisor=url.searchParams.get("supervisor_id"),chat=url.searchParams.get("chat_id");
      const entry=capabilityDirectory.entries.find(e=>e.supervisorId===supervisor&&e.bootstrapCapability.chatId===chat);
      if(!entry?.workerId || !producer.workerScopes.some(s=>s==="*"||s===entry.workerId)
        || !producer.taskScopes.some(s=>s==="*"||s===`task:${entry.workerId}`)) return json(response,403,{error:"Exact registered pair and worker scope required"});
      const result=capabilityRotation?.discovery(supervisor!,chat!)??null;
      response.setHeader("cache-control","no-store");
      return json(response,result?200:404,result??{error:"Current capability challenge unavailable"});
    }
    if (request.method === "GET" && url.pathname === "/submission-authority/status") {
      const producer = authorizeMutation(request);
      return json(response, 200, await submissionAuthority.status(producer));
    }
    if (request.method === "GET" && url.pathname === "/submission-authority/ledger") {
      const producer = authorizeMutation(request);
      return json(response, 200, await submissionAuthority.ledger(producer, Number(url.searchParams.get("limit") ?? 200)));
    }
    if (request.method === "GET" && url.pathname === "/operator-status") {
      const producer = authorizeMutation(request);
      if (producer.kind !== "OWNER_AUTHORITY" && producer.kind !== "UI") {
        return json(response, 403, { error: "Operator status requires an authenticated owner surface." });
      }
      return json(response, 200, await submissionAuthority.operatorStatus());
    }
    const submissionAuthorityMatch = url.pathname.match(/^\/submission-authority\/(admissions(?:\/validate)?|relay-target-transitions\/(?:begin|commit|abort)|boundaries|target-bindings|provider-rate-limits|aborts|outcomes|relay-health)$/);
    if (request.method === "POST" && submissionAuthorityMatch) {
      const producer = authorizeMutation(request);
      const result = await submissionAuthority.execute(submissionAuthorityMatch[1], await readJson(request), producer);
      return json(response, submissionAuthorityMatch[1] === "admissions/validate" || submissionAuthorityMatch[1] === "aborts" ? 200 : 201, result);
    }
    if (request.method === "GET" && url.pathname === "/snapshot") {
      return json(response, 200, snapshotFromStore(store, dashboardProjectionOptions));
    }
    if (request.method === "GET" && url.pathname === "/events") {
      return json(response, 200, { events: store.allEvents() });
    }
    if (request.method === "POST" && url.pathname === "/mcp") {
      const producer = authorizeMutation(request);
      const body = await readJson(request) as Record<string, unknown>;
      const id = body.id ?? null;
      if (body.method === "initialize") return json(response, 200, { jsonrpc: "2.0", id, result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "codex-mission-control", version: "1.0.0" },
      } });
      if (body.method === "notifications/initialized" && body.id === undefined) return empty(response, 202);
      if (body.method === "tools/list") return json(response, 200, { jsonrpc: "2.0", id, result: { tools: [
        { name: "mission_control_get_fleet", description: "Read the current projected Mission Control fleet and work queue.", annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, inputSchema: { type: "object", properties: {}, additionalProperties: false } },
        { name: "mission_control_get_worker", description: "Read one worker's projected state, owner channel, queue, blockers, proposals, capability challenges, and transport evidence.", annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, inputSchema: { type: "object", properties: { worker: { type: "string" } }, required: ["worker"], additionalProperties: false } },
      ] } });
      if (body.method === "tools/call") {
        const params = body.params as { name?: string; arguments?: { worker?: string } } | undefined;
        if (params?.name === "mission_control_get_fleet") {
          if (!["OWNER_AUTHORITY", "SUPERVISOR", "UI"].includes(producer.kind)) return json(response, 403, { error: "Fleet reads require owner or supervisor scope." });
          return json(response, 200, mcpResult(id, snapshotFromStore(store, dashboardProjectionOptions)));
        }
        if (params?.name === "mission_control_get_worker" && typeof params.arguments?.worker === "string") {
          const worker = params.arguments.worker;
          if (!producer.workerScopes.includes("*") && !producer.workerScopes.includes(worker)) return json(response, 403, { error: "Worker scope mismatch." });
          const snapshot = workerSnapshotFromStore(store, worker, dashboardProjectionOptions);
          return json(response, 200, snapshot ? mcpResult(id, snapshot) : { jsonrpc: "2.0", id, error: { code: -32004, message: "Worker not found." } });
        }
      }
      return json(response, 400, { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found." } });
    }
    if (request.method === "POST" && url.pathname === "/events") {
      const producer = authorizeMutation(request);
      const envelope = parseAppendEnvelope(await readJson(request));
      if (!producerMayEmit(producer, envelope.data)) return json(response, 403, { error: `Producer ${producer.id} cannot emit ${envelope.data.type}.` });
      if(envelope.data.type==="evidence_receipt_recorded" && envelope.data.summary==="MISSION_CONTROL_CHAT_MODE_CAPABILITY_VERIFIED_V1") {
        await submissionAuthority.status(producer); // Only an existing bound relay can attest observed UI mode.
      }
      const event = store.append(envelope, undefined, producer);
      notifications.emit("event", event);
      return json(response, 201, { event });
    }
    if (request.method === "POST" && url.pathname === "/github/decision-receipts") {
      const producer = authorizeMutation(request);
      if (producer.kind !== "SYSTEM" || producer.id !== githubDecisionProducer.id) {
        return json(response, 403, { error: "Only the authenticated GitHub supervision-receipt system producer may use this route." });
      }
      try {
        const candidate = await readJson(request) as GitHubDecisionCandidate;
        const events = ingestGitHubSupervisionCandidate(store, candidate, effectiveGithubPolicy());
        if (events.length) notifications.emit("event", events.at(-1));
        return json(response, events.length ? 201 : 200, { events, duplicate: events.length === 0 });
      } catch (error) {
        if (error instanceof ZodError) throw error;
        return json(response, 409, { error: error instanceof Error ? error.message : "GitHub supervision receipt was rejected." });
      }
    }
    if (request.method === "GET" && url.pathname === "/events/stream") {
      return streamEvents(request, response);
    }
    if (request.method === "POST" && url.pathname === "/viewed") {
      const producer = authorizeMutation(request);
      if (producer.kind !== "UI" && producer.kind !== "OWNER_AUTHORITY") return json(response, 403, { error: "Only an authenticated owner surface may mark a view cursor." });
      const viewed = store.markViewed(producer);
      notifications.emit("event", { type: "review_marked" });
      return json(response, 200, viewed);
    }

    const workerMatch = url.pathname.match(/^\/workers\/([^/]+)$/);
    if (request.method === "GET" && workerMatch) {
      const worker = decodeURIComponent(workerMatch[1]);
      const snapshot = workerSnapshotFromStore(store, worker, dashboardProjectionOptions);
      return snapshot ? json(response, 200, snapshot) : json(response, 404, { error: "Worker not found" });
    }
    const messageMatch = url.pathname.match(/^\/workers\/([^/]+)\/messages$/);
    if (request.method === "POST" && messageMatch) {
      const producer = authorizeMutation(request);
      if (producer.kind !== "UI" && producer.kind !== "OWNER_AUTHORITY") return json(response, 403, { error: "Only the owner surface may send worker messages." });
      const worker = decodeURIComponent(messageMatch[1]);
      const body = await readJson(request) as Record<string, unknown>;
      const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key : randomUUID();
      const messageId = `message:${idempotencyKey}`;
      const latestDirection = store.workerEvents(worker).findLast((event) => event.data.type === "owner_message_recorded"
        && event.data.message_kind === "DIRECTION" && event.data.message_id !== messageId)?.data;
      const result = recordOwnerMessage(store, {
        worker,
        missionId: typeof body.mission_id === "string" ? body.mission_id : "mission-control",
        threadId: typeof body.thread_id === "string" ? body.thread_id : undefined,
        kind: body.kind === "DIRECTION" ? "DIRECTION" : "CONVERSATION",
        body: typeof body.body === "string" ? body.body : "",
        priority: body.priority === "URGENT" || body.priority === "HIGH" || body.priority === "LOW" ? body.priority : "NORMAL",
        scope: { kind: "WORKER", id: worker },
        replyToMessageId: typeof body.reply_to_message_id === "string" ? body.reply_to_message_id : null,
        supersedesDirectionId: body.kind === "DIRECTION"
          ? typeof body.supersedes_direction_id === "string" ? body.supersedes_direction_id
            : latestDirection?.type === "owner_message_recorded" ? latestDirection.direction_id : null
          : null,
        transport: body.transport === "LOCAL_POLL" ? "LOCAL_POLL" : "REMOTE_POLL",
        messageId,
        directionId: body.kind === "DIRECTION" ? `direction:${idempotencyKey}` : undefined,
        deliveryId: `delivery:${idempotencyKey}`,
        ownerEventId: `owner-message:${idempotencyKey}`,
        deliveryEventId: `outbound-queued:${idempotencyKey}`,
      }, producer);
      notifications.emit("event", result.delivery);
      return json(response, 201, result);
    }
    const outboxMatch = url.pathname.match(/^\/workers\/([^/]+)\/outbox$/);
    if (request.method === "GET" && outboxMatch) {
      const producer = authorizeMutation(request);
      const worker = decodeURIComponent(outboxMatch[1]);
      const result = pullWorkerOutbox(store, worker, producer, { limit: Number(url.searchParams.get("limit") ?? 20) });
      if (result.appended.length) notifications.emit("event", result.appended.at(-1));
      return json(response, 200, { deliveries: result.deliveries, cursor: result.cursor });
    }
    const channelEventsMatch = url.pathname.match(/^\/workers\/([^/]+)\/channel\/events$/);
    if (request.method === "POST" && channelEventsMatch) {
      const producer = authorizeMutation(request);
      if (producer.kind !== "WORKER") return json(response, 403, { error: "Only workers may publish worker-channel events." });
      const worker = decodeURIComponent(channelEventsMatch[1]);
      const body = await readJson(request) as { events?: unknown[] };
      if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > 100) return json(response, 400, { error: "Provide 1-100 event envelopes." });
      const envelopes = body.events.map(parseAppendEnvelope);
      if (envelopes.some((envelope) => envelope.data.worker !== worker || !producerMayEmit(producer, envelope.data))) {
        return json(response, 403, { error: "Worker-channel events must match the authenticated worker and its allowed event families." });
      }
      const events = store.appendMany(envelopes.map((event) => ({ event, producer })));
      notifications.emit("event", events.at(-1));
      return json(response, 201, { events, cursor: store.latestSequence() });
    }
    const chatMatch = url.pathname.match(/^\/workers\/([^/]+)\/supervisor-chat$/);
    if (request.method === "POST" && chatMatch) {
      if (authorizeMutation(request).kind !== "UI") return json(response, 403, { error: "Only the dashboard UI may update supervisor links." });
      const worker = decodeURIComponent(chatMatch[1]);
      const body = await readJson(request) as Record<string, unknown>;
      const occurredAt = new Date().toISOString();
      const producer = authorizeMutation(request);
      const event = store.append({
        schema_version: 2,
        event_id: typeof body.event_id === "string" ? body.event_id : `chat-link:${randomUUID()}`,
        mission_id: typeof body.mission_id === "string" ? body.mission_id : "mission-control",
        occurred_at: occurredAt,
        data: {
          type: "supervisor_chat_link_set",
          worker,
          supervisor_chat_url: body.supervisor_chat_url,
          supervisor_chat_label: body.supervisor_chat_label,
          reason: body.reason,
        },
      }, undefined, producer);
      notifications.emit("event", event);
      return json(response, 201, { event });
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof ZodError) return json(response, 400, { error: "Invalid event", issues: error.issues });
    if (error instanceof SubmissionSchedulerError) {
      const { statusCode, message, code, detail } = error;
      return json(response, statusCode, { error: message, code, ...detail });
    }
    if (error instanceof Error && "statusCode" in error
      && typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode <= 599) {
      return json(response, error.statusCode, { error: error.message, code: "code" in error ? error.code : undefined });
    }
    if (error instanceof IdempotencyConflictError || error instanceof ContractInvariantError || error instanceof CorrectionInvariantError) {
      return json(response, 409, { error: error.message });
    }
    console.error(error);
    return json(response, 500, { error: "Mission Control daemon request failed." });
  }
});

server.listen(port, host, () => {
  console.log(`Mission Control daemon listening on http://${host}:${port}`);
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(() => {
      liveSourceWatcher?.close();
      if (githubReconciliationTimer) clearInterval(githubReconciliationTimer);
      if (capabilityRotationTimer) clearInterval(capabilityRotationTimer);
      store.close();
      process.exit(0);
    });
    server.closeAllConnections();
  });
}

function streamEvents(request: http.IncomingMessage, response: http.ServerResponse) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  response.write(`event: ready\ndata: ${JSON.stringify({ cursor: store.latestSequence() })}\n\n`);
  const onEvent = (event: unknown) => response.write(`event: mission-control-event\ndata: ${JSON.stringify(event)}\n\n`);
  const heartbeat = setInterval(() => response.write(": keepalive\n\n"), 15_000);
  notifications.on("event", onEvent);
  request.on("close", () => {
    clearInterval(heartbeat);
    notifications.off("event", onEvent);
    response.end();
  });
}

function json(response: http.ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function empty(response: http.ServerResponse, status: number) {
  response.writeHead(status);
  response.end();
}

async function readJson(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1_000_000) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function authorizeMutation(request: http.IncomingMessage): AuthenticatedProducer {
  const authorization = request.headers.authorization ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expectedBuffer = Buffer.from(internalToken!);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    const error = new Error("Unauthorized Mission Control mutation.");
    Object.assign(error, { statusCode: 401 });
    throw error;
  }
  const producerId = request.headers["x-mission-control-producer-id"];
  const producerKind = request.headers["x-mission-control-producer-kind"];
  const workerScopes = parseScopes(request.headers["x-mission-control-worker-scopes"]);
  const taskScopes = parseScopes(request.headers["x-mission-control-task-scopes"]);
  if (typeof producerId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,179}$/.test(producerId)
    || typeof producerKind !== "string" || !producerKinds.includes(producerKind as ProducerKind)
    || workerScopes.length === 0 || taskScopes.length === 0) {
    const error = new Error("A recognized producer identity is required.");
    Object.assign(error, { statusCode: 403 });
    throw error;
  }
  return { id: producerId, kind: producerKind as ProducerKind, workerScopes, taskScopes };
}

function parseScopes(value: string | string[] | undefined): string[] {
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function mcpResult(id: unknown, value: unknown) {
  return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value } };
}

function startGitHubReconciliation(): NodeJS.Timeout | null {
  if (!githubPolicy) return null;
  const token = process.env.MISSION_CONTROL_GITHUB_RECONCILIATION_TOKEN;
  const configured = Number(process.env.MISSION_CONTROL_GITHUB_RECONCILIATION_INTERVAL_MS ?? 300_000);
  if (!Number.isInteger(configured) || configured < 30_000 || configured > 3_600_000) {
    throw new Error("MISSION_CONTROL_GITHUB_RECONCILIATION_INTERVAL_MS must be 30000-3600000.");
  }
  let running = false;
  const reconcile = async () => {
    if (running) return;
    running = true;
    try {
      const policy=effectiveGithubPolicy();
      if(!policy) return;
      const events = await reconcileGitHubDecisionReceipts(store, { token, policy, policyProvider:effectiveGithubPolicy });
      for (const event of events) notifications.emit("event", event);
    } catch (error) {
      console.error("GitHub supervision reconciliation failed", error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void reconcile(), configured);
  timer.unref();
  void reconcile();
  return timer;
}
