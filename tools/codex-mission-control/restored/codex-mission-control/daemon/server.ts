import http from "node:http";
import { EventEmitter } from "node:events";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { snapshotFromStore, workerSnapshotFromStore } from "../lib/dashboard-data";
import { seedStore } from "../lib/seed";
import {
  ContractInvariantError,
  EventStore,
  IdempotencyConflictError,
} from "../lib/store";
import { CorrectionInvariantError } from "../lib/correction-lifecycle";
import { producerKinds, producerMayEmit, type AuthenticatedProducer, type ProducerKind } from "../lib/ingestion-auth";
import { parseAppendEnvelope } from "../lib/schema";

const host = process.env.MISSION_CONTROL_DAEMON_HOST ?? "127.0.0.1";
const port = Number(process.env.MISSION_CONTROL_DAEMON_PORT ?? 4100);
const internalToken = process.env.MISSION_CONTROL_INTERNAL_TOKEN;
if (!internalToken) throw new Error("MISSION_CONTROL_INTERNAL_TOKEN is required; use npm run dev/start or provide a secret for standalone daemon mode.");
const store = new EventStore();
const notifications = new EventEmitter();
notifications.setMaxListeners(100);
if (process.env.MISSION_CONTROL_SKIP_SEED !== "1") seedStore(store);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, { status: "ok", latestSequence: store.latestSequence(), chain: store.verifyChain() });
    }
    if (request.method === "GET" && url.pathname === "/snapshot") {
      return json(response, 200, snapshotFromStore(store));
    }
    if (request.method === "GET" && url.pathname === "/events") {
      return json(response, 200, { events: store.allEvents() });
    }
    if (request.method === "POST" && url.pathname === "/events") {
      const producer = authorizeMutation(request);
      const envelope = parseAppendEnvelope(await readJson(request));
      if (!producerMayEmit(producer, envelope.data)) return json(response, 403, { error: `Producer ${producer} cannot emit ${envelope.data.type}.` });
      const event = store.append(envelope);
      notifications.emit("event", event);
      return json(response, 201, { event });
    }
    if (request.method === "GET" && url.pathname === "/events/stream") {
      return streamEvents(request, response);
    }
    if (request.method === "POST" && url.pathname === "/viewed") {
      if (authorizeMutation(request).kind !== "UI") return json(response, 403, { error: "Only the dashboard UI may mark a view cursor." });
      const viewed = store.markViewed();
      notifications.emit("event", { type: "review_marked" });
      return json(response, 200, viewed);
    }

    const workerMatch = url.pathname.match(/^\/workers\/([^/]+)$/);
    if (request.method === "GET" && workerMatch) {
      const worker = decodeURIComponent(workerMatch[1]);
      const snapshot = workerSnapshotFromStore(store, worker);
      return snapshot ? json(response, 200, snapshot) : json(response, 404, { error: "Worker not found" });
    }
    const chatMatch = url.pathname.match(/^\/workers\/([^/]+)\/supervisor-chat$/);
    if (request.method === "POST" && chatMatch) {
      if (authorizeMutation(request).kind !== "UI") return json(response, 403, { error: "Only the dashboard UI may update supervisor links." });
      const worker = decodeURIComponent(chatMatch[1]);
      const body = await readJson(request) as Record<string, unknown>;
      const occurredAt = new Date().toISOString();
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
      });
      notifications.emit("event", event);
      return json(response, 201, { event });
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof ZodError) return json(response, 400, { error: "Invalid event", issues: error.issues });
    if (error instanceof Error && "statusCode" in error && (error.statusCode === 401 || error.statusCode === 403)) {
      return json(response, error.statusCode, { error: error.message });
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

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
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
  if (typeof producerId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,179}$/.test(producerId)
    || typeof producerKind !== "string" || !producerKinds.includes(producerKind as ProducerKind)) {
    const error = new Error("A recognized producer identity is required.");
    Object.assign(error, { statusCode: 403 });
    throw error;
  }
  return { id: producerId, kind: producerKind as ProducerKind };
}
