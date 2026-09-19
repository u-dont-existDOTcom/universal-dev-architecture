import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import type { AppendEnvelope } from "../lib/schema";
import { EventStore, IdempotencyConflictError } from "../lib/store";
import { inBandRequestRoutePrefix } from "../lib/in-band-request-binding";
import { requestBoundRoutePrefix } from "../lib/request-bound-supervision";

const worker = "route-worker";
const otherWorker = "other-worker";
const producer: AuthenticatedProducer = {
  id: "worker:route-admission",
  kind: "WORKER",
  workerScopes: [worker, otherWorker],
  taskScopes: ["*"],
};
const otherProducer: AuthenticatedProducer = {
  id: "worker:other-admission",
  kind: "WORKER",
  workerScopes: [worker],
  taskScopes: ["*"],
};
const tokens = {
  [producer.id]: "route-token-" + "a".repeat(40),
  [otherProducer.id]: "other-token-" + "b".repeat(40),
};

function admissionInput(requestId: string, expiresAt: string) {
  return {
    request: {
      requestId,
      action: "ROUTE_INTERNAL_SUPERVISOR",
      actor: "CODEX",
      sourceReceipt: null,
      boundedExecution: true,
      taskRequiresExecutionOutsideChat: true,
      executionScope: "TERMINAL_OR_COMPUTER_WORK",
      spend: null,
      internalRoute: {
        destination: "PROJECT_MANAGER_CHAT",
        destinationChatId: "mc-project-manager",
        standingOwnerAuthorization: true,
        ownerRelayRequested: false,
        actionTimeConfirmationRequested: false,
      },
      ownerPolicy: {
        paidModelInferenceAllowed: false,
        activeZeroSpendDecisionId: "owner:no-paid-api",
      },
    },
    factualPacket: {
      packetId: `packet:${requestId}`,
      taskId: "task:route",
      exactFactualState: "A bounded request needs one request-bound supervisor decision.",
      evidenceRefs: ["evidence:route"],
      decisionRequested: "Return one canonical request-bound decision.",
      supervisoryCycle: {
        nonce: `nonce:${requestId}`,
        evidenceCapsule: { id: "capsule:route", sha256: "b".repeat(64) },
        ownerOutcome: { id: "outcome:route", epoch: 7, sha256: "c".repeat(64) },
        reasoningLane: "EXTRA_HIGH_DIRECT",
        githubReceipt: {
          repository: "u-dont-existDOTcom/universal-dev-architecture",
          issueNumber: 58,
          stageIssueNumber: 61,
        },
        executionContext: {
          task_id: "task:route",
          run_id: "run:route",
          family_id: "family:route",
          round: 1,
        },
        expiresAt,
      },
    },
  };
}

type HarnessOptions = {
  loseFirstAcknowledgement?: boolean;
  barrierExactMisses?: number;
};

function daemonHarness(options: HarnessOptions = {}) {
  const store = new EventStore(":memory:");
  let postCount = 0;
  let exactMissCount = 0;
  let loseNext = options.loseFirstAcknowledgement ?? false;
  const waiters: Array<() => void> = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/events");
    const authenticated = producerFromHeaders(init?.headers);
    if ((init?.method ?? "GET") === "GET") {
      const eventId = url.searchParams.get("event_id");
      if (!eventId) return Response.json({ events: store.allEvents() });
      const event = store.eventByEventId(eventId);
      if (!event) {
        exactMissCount += 1;
        const barrier = options.barrierExactMisses ?? 0;
        if (barrier > 0 && exactMissCount <= barrier) {
          if (exactMissCount < barrier) await new Promise<void>((resolve) => waiters.push(resolve));
          else waiters.splice(0).forEach((resolve) => resolve());
        }
        return Response.json({ error: "Event not found." }, { status: 404 });
      }
      if (event.producerId !== authenticated.id || event.producerKind !== authenticated.kind
        || event.worker !== null
          && !authenticated.workerScopes.includes("*")
          && !authenticated.workerScopes.includes(event.worker)) {
        return Response.json({ error: "Exact event lookup does not match producer scope." }, { status: 403 });
      }
      return Response.json({ event });
    }
    postCount += 1;
    const envelope = JSON.parse(String(init?.body)) as AppendEnvelope;
    try {
      const event = store.append(envelope, undefined, authenticated);
      if (loseNext) {
        loseNext = false;
        return Response.json({ error: "Simulated lost HTTP acknowledgement." }, { status: 503 });
      }
      return Response.json({ event }, { status: 201 });
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        return Response.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }
  };
  return {
    store,
    fetch,
    get postCount() { return postCount; },
    close() { store.close(); },
  };
}

function producerFromHeaders(value: HeadersInit | undefined): AuthenticatedProducer {
  const headers = new Headers(value);
  const id = headers.get("x-mission-control-producer-id");
  const kind = headers.get("x-mission-control-producer-kind");
  assert.ok(id && (kind === "WORKER" || kind === "SYSTEM"));
  return {
    id,
    kind,
    workerScopes: (headers.get("x-mission-control-worker-scopes") ?? "").split(",").filter(Boolean),
    taskScopes: (headers.get("x-mission-control-task-scopes") ?? "").split(",").filter(Boolean),
  };
}
async function send(
  post: typeof import("../app/api/worker-channel/[worker]/admission/route").POST,
  body: unknown,
  selectedProducer = producer,
  selectedWorker = worker,
) {
  const token = tokens[selectedProducer.id as keyof typeof tokens];
  return post(new Request(`http://app.test.invalid/api/worker-channel/${selectedWorker}/admission`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-mission-control-producer-id": selectedProducer.id,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ worker: selectedWorker }) });
}

test("request-bound admission acknowledges the one original durable enqueue", async (t) => {
  const previousFetch = globalThis.fetch;
  const saved = {
    internalToken: process.env.MISSION_CONTROL_INTERNAL_TOKEN,
    credentials: process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    policy: process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON,
    daemonUrl: process.env.MISSION_CONTROL_DAEMON_URL,
  };
  process.env.MISSION_CONTROL_INTERNAL_TOKEN = "internal-token-" + "z".repeat(40);
  process.env.MISSION_CONTROL_DAEMON_URL = "http://daemon.test.invalid";
  process.env.MISSION_CONTROL_INGEST_CREDENTIALS = JSON.stringify({
    [producer.id]: { kind: "WORKER", token: tokens[producer.id], workers: producer.workerScopes, tasks: ["*"] },
    [otherProducer.id]: { kind: "WORKER", token: tokens[otherProducer.id], workers: otherProducer.workerScopes, tasks: ["*"] },
  });
  process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify({
    repository: "u-dont-existDOTcom/universal-dev-architecture",
    decisionIssueNumber: 58,
    capabilityIssueNumber: 61,
    stageIssueNumber: 60,
    authorizedWriterLogins: ["owner"],
    capabilityChallenges: [],
    requestBound: { enabled: true, relayProducerIds: ["relay:test"] },
  });
  try {
    const { POST } = await import("../app/api/worker-channel/[worker]/admission/route");

    await t.test("explicit V6 admission is distinct while unchanged requestBound policy still defaults to V5", async () => {
      const v6Daemon = daemonHarness();
      globalThis.fetch = v6Daemon.fetch;
      const v6 = admissionInput("request:v6", new Date(Date.now() + 60_000).toISOString());
      Object.assign(v6.factualPacket.supervisoryCycle, { bindingProtocol: "IN_BAND_REQUEST_BINDING_V1" });
      const v6Response = await send(POST, v6);
      assert.equal(v6Response.status, 202);
      const v6Event = v6Daemon.store.allEvents()[0]!;
      assert.equal(v6Event.data.type, "worker_message_recorded");
      if (v6Event.data.type === "worker_message_recorded") {
        assert.equal(v6Event.data.body.startsWith(inBandRequestRoutePrefix), true);
        assert.equal(JSON.parse(v6Event.data.body.slice(inBandRequestRoutePrefix.length)).schemaVersion, 6);
      }
      assert.match(v6Event.eventId, /^supervision-request-v6:/);
      v6Daemon.close();

      const v5Daemon = daemonHarness();
      globalThis.fetch = v5Daemon.fetch;
      const v5Response = await send(POST, admissionInput("request:v5-unchanged", new Date(Date.now() + 60_000).toISOString()));
      assert.equal(v5Response.status, 202);
      const v5Event = v5Daemon.store.allEvents()[0]!;
      assert.equal(v5Event.data.type, "worker_message_recorded");
      if (v5Event.data.type === "worker_message_recorded") assert.equal(v5Event.data.body.startsWith(requestBoundRoutePrefix), true);
      assert.match(v5Event.eventId, /^supervision-request-v5:/);
      v5Daemon.close();
    });

    await t.test("lost HTTP acknowledgement returns the original record on retry", async () => {
      const daemon = daemonHarness({ loseFirstAcknowledgement: true });
      globalThis.fetch = daemon.fetch;
      const body = admissionInput("request:lost-ack", new Date(Date.now() + 60_000).toISOString());
      const first = await send(POST, body);
      assert.equal(first.status, 503);
      assert.equal(daemon.store.count(), 1);
      const original = daemon.store.allEvents()[0]!;
      const retry = await send(POST, body);
      assert.equal(retry.status, 202);
      const payload = await retry.json();
      assert.equal(payload.routeEvent.eventId, original.eventId);
      assert.equal(payload.routeAcknowledgement.queuedAt, original.occurredAt);
      assert.equal(payload.routeAcknowledgement.expiresAt, body.factualPacket.supervisoryCycle.expiresAt);
      assert.equal(payload.routeAcknowledgement.binding.requestId, "request:lost-ack");
      assert.equal(daemon.postCount, 1);
      assert.equal(daemon.store.count(), 1);
      daemon.close();
    });

    await t.test("concurrent identical admissions converge on one queue event", async () => {
      const daemon = daemonHarness({ barrierExactMisses: 2 });
      globalThis.fetch = daemon.fetch;
      const body = admissionInput("request:concurrent", new Date(Date.now() + 60_000).toISOString());
      const [left, right] = await Promise.all([send(POST, body), send(POST, body)]);
      assert.deepEqual([left.status, right.status], [202, 202]);
      const [leftBody, rightBody] = await Promise.all([left.json(), right.json()]);
      assert.equal(leftBody.routeAcknowledgement.eventId, rightBody.routeAcknowledgement.eventId);
      assert.equal(leftBody.routeAcknowledgement.queuedAt, rightBody.routeAcknowledgement.queuedAt);
      assert.equal(daemon.postCount, 2);
      assert.equal(daemon.store.count(), 1);
      daemon.close();
    });

    await t.test("post-expiry retry acknowledges without extending or sending", async () => {
      const daemon = daemonHarness();
      globalThis.fetch = daemon.fetch;
      const expiresAt = new Date(Date.now() + 120).toISOString();
      const body = admissionInput("request:expired-ack", expiresAt);
      const first = await send(POST, body);
      assert.equal(first.status, 202);
      const firstBody = await first.json();
      await delay(180);
      const retry = await send(POST, body);
      assert.equal(retry.status, 202);
      const retryBody = await retry.json();
      assert.equal(retryBody.routeAcknowledgement.queuedAt, firstBody.routeAcknowledgement.queuedAt);
      assert.equal(retryBody.routeAcknowledgement.expiresAt, expiresAt);
      assert.equal(retryBody.routeAcknowledgement.expiredAtAcknowledgement, true);
      assert.equal(retryBody.routeAcknowledgement.sendEligible, false);
      assert.equal(daemon.postCount, 1);
      assert.equal(daemon.store.count(), 1);
      daemon.close();
    });

    await t.test("changed evidence or execution context cannot reuse the request identity", async () => {
      const daemon = daemonHarness();
      globalThis.fetch = daemon.fetch;
      const body = admissionInput("request:changed-intent", new Date(Date.now() + 60_000).toISOString());
      assert.equal((await send(POST, body)).status, 202);
      const changedContext = structuredClone(body);
      changedContext.factualPacket.supervisoryCycle.executionContext.round = 2;
      const contextRetry = await send(POST, changedContext);
      assert.equal(contextRetry.status, 400);
      assert.match((await contextRetry.json()).error, /conflicts with the original durable request intent/);
      const changedEvidence = structuredClone(body);
      changedEvidence.factualPacket.supervisoryCycle.evidenceCapsule.id = "capsule:changed";
      const evidenceRetry = await send(POST, changedEvidence);
      assert.equal(evidenceRetry.status, 400);
      assert.equal(daemon.postCount, 1);
      assert.equal(daemon.store.count(), 1);
      daemon.close();
    });

    await t.test("wrong producer and cross-worker replay are rejected", async () => {
      const daemon = daemonHarness();
      globalThis.fetch = daemon.fetch;
      const body = admissionInput("request:scope", new Date(Date.now() + 60_000).toISOString());
      assert.equal((await send(POST, body)).status, 202);
      const wrongProducer = await send(POST, body, otherProducer);
      assert.equal(wrongProducer.status, 403);
      const crossWorker = await send(POST, body, producer, otherWorker);
      assert.equal(crossWorker.status, 400);
      assert.match((await crossWorker.json()).error, /worker, or producer/);
      assert.equal(daemon.postCount, 1);
      assert.equal(daemon.store.count(), 1);
      daemon.close();
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (saved.internalToken === undefined) delete process.env.MISSION_CONTROL_INTERNAL_TOKEN;
    else process.env.MISSION_CONTROL_INTERNAL_TOKEN = saved.internalToken;
    if (saved.credentials === undefined) delete process.env.MISSION_CONTROL_INGEST_CREDENTIALS;
    else process.env.MISSION_CONTROL_INGEST_CREDENTIALS = saved.credentials;
    if (saved.policy === undefined) delete process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON;
    else process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = saved.policy;
    if (saved.daemonUrl === undefined) delete process.env.MISSION_CONTROL_DAEMON_URL;
    else process.env.MISSION_CONTROL_DAEMON_URL = saved.daemonUrl;
  }
});
