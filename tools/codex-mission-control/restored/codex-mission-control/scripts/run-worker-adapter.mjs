import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const worker = value("--worker");
const repository = path.resolve(value("--repo", "."));
const statePath = value("--state-file", "state/CURRENT-STATE.md");
const baseUrl = value("--base-url", "http://127.0.0.1:3000").replace(/\/$/, "");
const producerId = value("--producer-id", worker ? `worker:${worker}` : null);
const token = value("--token", process.env.MISSION_CONTROL_WORKER_TOKEN);
const dryRun = args.includes("--dry-run");
const watch = args.includes("--watch");
const intervalMs = Number(value("--interval-ms", "30000"));

if (!worker || !producerId) {
  throw new Error("Provide --worker; the producer ID derives safely or may be supplied explicitly.");
}
if (!dryRun && (!token || token.length < 32)) throw new Error("MISSION_CONTROL_WORKER_TOKEN or --token must contain at least 32 characters.");

if (dryRun) {
  const source = inspectRepository(repository, statePath);
  const preview = buildDirectionDeliveryEvents({
    worker,
    source,
    delivery: {
      messageId: "message:adapter:dry-run", directionId: "direction:adapter:dry-run",
      deliveryId: "delivery:adapter:dry-run", receiptId: "receipt:adapter:dry-run",
      threadId: `thread:${worker}`, body: "Continue the current owner-prioritized work.", recordedAt: new Date().toISOString(),
    },
  });
  process.stdout.write(`${JSON.stringify({ dryRun: true, source, events: preview }, null, 2)}\n`);
  process.exit(0);
}

const headers = {
  authorization: `Bearer ${token}`,
  "x-mission-control-producer-id": producerId,
  "content-type": "application/json",
};
if (!Number.isFinite(intervalMs) || intervalMs < 5_000) throw new Error("--interval-ms must be at least 5000.");
do {
  try {
    process.stdout.write(`${JSON.stringify(await pollOnce(), null, 2)}\n`);
  } catch (error) {
    if (!watch) throw error;
    process.stderr.write(`${JSON.stringify({ worker, status: "POLL_FAILED", at: new Date().toISOString(), error: error instanceof Error ? error.message : "Unknown adapter error" })}\n`);
  }
  if (watch) await new Promise((resolve) => setTimeout(resolve, intervalMs));
} while (watch);

async function pollOnce() {
  const source = inspectRepository(repository, statePath);
  const outbox = await fetchJson(`${baseUrl}/api/worker-channel/${encodeURIComponent(worker)}/outbox?limit=20`, { headers });
  let published = 0;
  for (const delivery of outbox.deliveries ?? []) {
    const events = delivery.kind === "DIRECTION"
      ? buildDirectionDeliveryEvents({ worker, source, delivery })
      : buildConversationDeliveryEvents({ worker, source, delivery });
    await fetchJson(`${baseUrl}/api/worker-channel/${encodeURIComponent(worker)}/events`, {
      method: "POST", headers, body: JSON.stringify({ events }),
    });
    published += events.length;
  }
  if ((outbox.deliveries ?? []).length === 0) {
    await fetchJson(`${baseUrl}/api/worker-channel/${encodeURIComponent(worker)}/events`, {
      method: "POST", headers, body: JSON.stringify({ events: [connectionEnvelope(worker, source)] }),
    });
    published = 1;
  }
  return { worker, deliveries: outbox.deliveries?.length ?? 0, published, source };
}

/**
 * This sidecar proves transport and repository identity only.
 *
 * It deliberately does not emit direction_acknowledged, work_queue_published,
 * structured_blocker_recorded, change_proposal_recorded, or
 * direction_reconciled. Those events contain semantic judgments and must come
 * from a separately authenticated worker or reasoning surface that actually
 * interpreted the exact owner direction.
 */
function buildDirectionDeliveryEvents({ worker, source, delivery }) {
  const now = new Date().toISOString();
  const suffix = stableSuffix(`${delivery.receiptId}:${delivery.directionId}`);
  return [
    envelope(`adapter:message-ack:${suffix}`, worker, now, {
      type: "outbound_message_acknowledged", worker, acknowledgement_id: `ack:message:${suffix}`,
      message_id: delivery.messageId, delivery_id: delivery.deliveryId, acknowledged_at: now,
    }),
    connectionEnvelope(worker, source, now),
    envelope(`adapter:worker-message:${suffix}`, worker, now, {
      type: "worker_message_recorded", worker, message_id: `message:worker:${suffix}`, thread_id: delivery.threadId,
      message_kind: "RESPONSE",
      body: `Transport-only sidecar delivered the direction while tracking ${source.branch}@${source.head.slice(0, 8)}. Semantic acknowledgement, queue publication, and reconciliation remain pending verified worker or supervisor events.`,
      reply_to_message_id: delivery.messageId, direction_id: delivery.directionId,
    }),
  ];
}

function buildConversationDeliveryEvents({ worker, source, delivery }) {
  const now = new Date().toISOString();
  const suffix = stableSuffix(`${delivery.receiptId}:${delivery.messageId}`);
  return [
    envelope(`adapter:message-ack:${suffix}`, worker, now, {
      type: "outbound_message_acknowledged", worker, acknowledgement_id: `ack:message:${suffix}`,
      message_id: delivery.messageId, delivery_id: delivery.deliveryId, acknowledged_at: now,
    }),
    connectionEnvelope(worker, source, now),
    envelope(`adapter:worker-message:${suffix}`, worker, now, {
      type: "worker_message_recorded", worker, message_id: `message:worker:${suffix}`, thread_id: delivery.threadId,
      message_kind: "RESPONSE", body: `Transport-only sidecar delivered the message while tracking ${source.branch}@${source.head.slice(0, 8)}.`,
      reply_to_message_id: delivery.messageId, direction_id: null,
    }),
  ];
}

function connectionEnvelope(worker, source, now = new Date().toISOString()) {
  const leaseExpiresAt = new Date(new Date(now).getTime() + 5 * 60_000).toISOString();
  const suffix = randomUUID();
  return envelope(`adapter:connection:${suffix}`, worker, now, {
    type: "worker_connection_observed", worker, connection_id: `connection:${worker}:${suffix}`,
    state: "CONNECTED", runtime_kind: "POLLING_SIDECAR", endpoint_id: `worker:${worker}:poll`,
    observed_at: now, lease_expires_at: leaseExpiresAt,
    source: { repository: source.repository, branch: source.branch, head: source.head, state_path: source.statePath },
    detail: `Authenticated sidecar poll succeeded and bound live repository state at ${source.branch}@${source.head.slice(0, 8)}. No semantic interpretation is asserted.`,
  });
}

function inspectRepository(repository, statePath) {
  const absoluteState = path.resolve(repository, statePath);
  const stateBytes = fs.readFileSync(absoluteState);
  const git = (...gitArgs) => {
    const result = spawnSync("git", gitArgs, { cwd: repository, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || `git ${gitArgs.join(" ")} failed`);
    return result.stdout.trim();
  };
  const branch = git("branch", "--show-current") || "DETACHED";
  const head = git("rev-parse", "HEAD");
  const dirtyEntries = git("status", "--short").split(/\r?\n/).filter(Boolean);
  return {
    repository,
    statePath,
    stateSha256: createHash("sha256").update(stateBytes).digest("hex"),
    branch,
    head,
    dirtyEntries,
  };
}

function envelope(eventId, worker, occurredAt, data) {
  return { schema_version: 2, event_id: eventId, mission_id: "mission-control-live", occurred_at: occurredAt, data };
}

function stableSuffix(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 20);
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body.error ?? response.statusText}`);
  return body;
}
