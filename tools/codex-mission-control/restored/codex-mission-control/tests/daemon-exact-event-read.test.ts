import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const token = "daemon-test-token-" + "x".repeat(40);
const worker = "exact-worker";
const eventId = "supervision-request-v5:" + "a".repeat(64);

test("daemon exact event lookup is bounded to the original producer and worker scope", async () => {
  const port = await availablePort();
  const directory = mkdtempSync(join(tmpdir(), "mc-exact-event-"));
  const child = spawn(process.execPath, ["--import", "tsx", "daemon/server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MISSION_CONTROL_DAEMON_HOST: "127.0.0.1",
      MISSION_CONTROL_DAEMON_PORT: String(port),
      MISSION_CONTROL_INTERNAL_TOKEN: token,
      MISSION_CONTROL_DB: join(directory, "events.db"),
      MISSION_CONTROL_SKIP_SEED: "1",
      MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    await waitForListening(child, () => stderr);
    const origin = `http://127.0.0.1:${port}`;
    const occurredAt = new Date().toISOString();
    const envelope = {
      schema_version: 2,
      event_id: eventId,
      mission_id: "mission-control-live",
      occurred_at: occurredAt,
      data: {
        type: "worker_message_recorded",
        worker,
        message_id: `message:${eventId}`,
        thread_id: `thread:${worker}`,
        message_kind: "QUESTION",
        body: "bounded exact lookup fixture",
        reply_to_message_id: null,
        direction_id: null,
      },
    };
    const created = await fetch(`${origin}/events`, {
      method: "POST",
      headers: mutationHeaders(`worker:${worker}`, worker),
      body: JSON.stringify(envelope),
    });
    assert.equal(created.status, 201, await created.text());
    const exact = await fetch(`${origin}/events?event_id=${encodeURIComponent(eventId)}`, {
      headers: mutationHeaders(`worker:${worker}`, worker),
    });
    assert.equal(exact.status, 200);
    const exactBody = await exact.json();
    assert.equal(exactBody.event.eventId, eventId);
    assert.equal(exactBody.event.occurredAt, occurredAt);

    const wrongProducer = await fetch(`${origin}/events?event_id=${encodeURIComponent(eventId)}`, {
      headers: mutationHeaders("worker:other", worker),
    });
    assert.equal(wrongProducer.status, 403);

    const wrongWorker = await fetch(`${origin}/events?event_id=${encodeURIComponent(eventId)}`, {
      headers: mutationHeaders("worker:exact", "different-worker"),
    });
    assert.equal(wrongWorker.status, 403);

    const missing = await fetch(`${origin}/events?event_id=missing`, {
      headers: mutationHeaders(`worker:${worker}`, worker),
    });
    assert.equal(missing.status, 404);

    const widened = await fetch(`${origin}/events?event_id=${encodeURIComponent(eventId)}&extra=1`, {
      headers: mutationHeaders(`worker:${worker}`, worker),
    });
    assert.equal(widened.status, 400);
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
    rmSync(directory, { recursive: true, force: true });
  }
});

function mutationHeaders(producerId: string, workerScope: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-mission-control-producer-id": producerId,
    "x-mission-control-producer-kind": "WORKER",
    "x-mission-control-worker-scopes": workerScope,
    "x-mission-control-task-scopes": "*",
  };
}

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}
async function waitForListening(child: ReturnType<typeof spawn>, currentStderr: () => string): Promise<void> {
  let output = "";
  child.stdout!.setEncoding("utf8");
  child.stdout!.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (output.includes("Mission Control daemon listening")) return;
    if (child.exitCode !== null) {
      throw new Error(`Daemon exited before listening: ${currentStderr()}`);
    }
    await delay(25);
  }
  throw new Error(`Timed out waiting for daemon startup: ${currentStderr()}`);
}
