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
const projectId = value("--project-id", worker ? `project:${worker}` : null);
const taskId = value("--task-id", worker ? `task:${worker}` : null);
const dryRun = args.includes("--dry-run");
const watch = args.includes("--watch");
const intervalMs = Number(value("--interval-ms", "30000"));

if (!worker || !producerId || !projectId || !taskId) {
  throw new Error("Provide --worker; producer, project, and task IDs then derive safely or may be supplied explicitly.");
}
if (!dryRun && (!token || token.length < 32)) throw new Error("MISSION_CONTROL_WORKER_TOKEN or --token must contain at least 32 characters.");

if (dryRun) {
  const source = inspectRepository(repository, statePath);
  const preview = buildDirectionEvents({
    worker, projectId, taskId, source,
    delivery: {
      messageId: "message:adapter:dry-run", directionId: "direction:adapter:dry-run",
      deliveryId: "delivery:adapter:dry-run", receiptId: "receipt:adapter:dry-run",
      threadId: `thread:${worker}`, body: "Continue the current owner-prioritized work.", recordedAt: new Date().toISOString(),
    },
  });
  process.stdout.write(`${JSON.stringify({ dryRun: true, source: publicSource(source), events: preview }, null, 2)}\n`);
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
      ? buildDirectionEvents({ worker, projectId, taskId, source, delivery })
      : buildConversationEvents({ worker, source, delivery });
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
  return { worker, deliveries: outbox.deliveries?.length ?? 0, published, source: publicSource(source) };
}

function buildDirectionEvents({ worker, projectId, taskId, source, delivery }) {
  const now = new Date().toISOString();
  const suffix = stableSuffix(`${delivery.receiptId}:${delivery.directionId}`);
  const queueRevisionId = `queue:${worker}:${stableSuffix(delivery.directionId)}`;
  const items = queueItemsFromState(source.stateText, now);
  const events = [
    envelope(`adapter:message-ack:${suffix}`, worker, now, {
      type: "outbound_message_acknowledged", worker, acknowledgement_id: `ack:message:${suffix}`,
      message_id: delivery.messageId, delivery_id: delivery.deliveryId, acknowledged_at: now,
    }),
    envelope(`adapter:direction-ack:${suffix}`, worker, now, {
      type: "direction_acknowledged", worker, acknowledgement_id: `ack:direction:${suffix}`,
      direction_id: delivery.directionId, message_id: delivery.messageId,
      interpretation: `Continue the current repository-defined work from ${source.statePath} at ${source.branch}@${source.head.slice(0, 8)}; preserve the owner direction as the active boundary.`,
      accepted_scope: items.map((item) => item.title), acknowledged_at: now,
    }),
    connectionEnvelope(worker, source, now),
    envelope(`adapter:queue:${stableSuffix(delivery.directionId)}`, worker, now, {
      type: "work_queue_published", worker, project_id: projectId, task_id: taskId,
      queue_revision_id: queueRevisionId, revision: 1, previous_queue_revision_id: null,
      direction_id: delivery.directionId, published_at: now,
      items: items.map((item, ordinal) => ({ ...item, ordinal, depends_on: ordinal === 0 ? [] : [items[ordinal - 1].item_id] })),
    }),
  ];
  const ownerBlocker = ownerBlockerFromState(source.stateText);
  if (ownerBlocker) events.push(envelope(`adapter:blocker:${suffix}`, worker, now, {
    type: "structured_blocker_recorded", worker, blocker_id: `blocker:${worker}:owner-session`,
    task_id: taskId,
    direction_id: delivery.directionId, queue_item_id: items[0]?.item_id ?? null, status: "OPEN", severity: "MATERIAL",
    title: ownerBlocker.title, description: ownerBlocker.description, impact: ownerBlocker.impact,
    blocking_scope: ["owner-only acceptance"], workaround_available: false, workaround: null,
    required_actor: { kind: "OWNER", id: "owner:primary" }, evidence_refs: [`file:${source.statePath}`, `git:${source.head}`],
    reported_by: `worker:${worker}`, needs_owner: true, reported_at: now,
  }));
  events.push(envelope(`adapter:proposal:${suffix}`, worker, now, {
    type: "change_proposal_recorded", worker, proposal_id: `proposal:${worker}:current-sequence:${suffix}`,
    task_id: taskId,
    direction_id: delivery.directionId, queue_item_id: items[0]?.item_id ?? null, status: "OPEN",
    title: "Advance the repository-recorded next executable sequence",
    rationale: source.nextExecutable || "Use the current durable state as the work boundary.",
    expected_impact: "Keep worker execution aligned with the latest repository state and owner direction.",
    affected_scope: items.map((item) => item.title), proposer_id: `worker:${worker}`,
    reasoning_authority: "WORKER_CLAIM", authority_effect: "NON_OPERATIVE", disposition: null,
    evidence_refs: [`file:${source.statePath}`, `git:${source.head}`], requires_owner_decision: false, reported_at: now,
  }));
  events.push(envelope(`adapter:worker-message:${suffix}`, worker, now, {
    type: "worker_message_recorded", worker, message_id: `message:worker:${suffix}`, thread_id: delivery.threadId,
    message_kind: "RESPONSE", body: `Live adapter received the direction at ${source.branch}@${source.head.slice(0, 8)} and published ${items.length} real state-derived queue items.`,
    reply_to_message_id: delivery.messageId, direction_id: delivery.directionId,
  }));
  events.push(envelope(`adapter:reconcile:${suffix}`, worker, now, {
    type: "direction_reconciled", worker, reconciliation_id: `reconcile:${suffix}`,
    direction_id: delivery.directionId, queue_revision_id: queueRevisionId, status: "INCORPORATED",
    summary: `Direction incorporated against ${source.repository} ${source.branch}@${source.head.slice(0, 8)} using ${source.statePath}.`, reconciled_at: now,
  }));
  return events;
}

function buildConversationEvents({ worker, source, delivery }) {
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
      message_kind: "RESPONSE", body: `Live adapter received the message while tracking ${source.branch}@${source.head.slice(0, 8)}.`,
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
    detail: `Authenticated sidecar poll succeeded and bound live repository state at ${source.branch}@${source.head.slice(0, 8)}.`,
  });
}

function inspectRepository(repository, statePath) {
  const absoluteState = path.resolve(repository, statePath);
  const stateText = fs.readFileSync(absoluteState, "utf8");
  const git = (...gitArgs) => {
    const result = spawnSync("git", gitArgs, { cwd: repository, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || `git ${gitArgs.join(" ")} failed`);
    return result.stdout.trim();
  };
  const branch = git("branch", "--show-current") || "DETACHED";
  const head = git("rev-parse", "HEAD");
  const dirtyEntries = git("status", "--short").split(/\r?\n/).filter(Boolean);
  const nextExecutable = extractNextExecutable(stateText);
  return { repository, statePath, stateText, branch, head, dirtyEntries, nextExecutable };
}

function publicSource(source) {
  const { stateText: _stateText, ...safe } = source;
  return safe;
}

function extractNextExecutable(markdown) {
  const lines = markdown.split(/\r?\n/);
  const index = lines.findIndex((line) => /^- Next executable:/i.test(line.trim()));
  if (index === -1) return "";
  const captured = [lines[index].replace(/^\s*- Next executable:\s*/i, "")];
  for (const line of lines.slice(index + 1)) {
    if (/^\s*-\s+/.test(line) || /^#{1,6}\s/.test(line) || !line.trim()) break;
    captured.push(line.trim());
  }
  return captured.join(" ").replace(/\s+/g, " ").trim();
}

function queueItemsFromState(markdown, now) {
  const next = extractNextExecutable(markdown);
  const clauses = next.split(/;\s+|\band\s+(?=deploy\b|run\b|configure\b|verify\b|stage\b)/i).map((item) => item.trim()).filter(Boolean);
  const selected = clauses.length ? clauses : ["Inspect the current durable state and continue the first eligible task."];
  return selected.slice(0, 8).map((detail, index) => ({
    item_id: `repo-next:${stableSuffix(detail)}`,
    title: sentenceTitle(detail), detail,
    status: index === 0 ? "READY" : "PLANNED", priority: index === 0 ? "P0" : "P1",
    created_at: now, updated_at: now,
  }));
}

function ownerBlockerFromState(markdown) {
  const match = markdown.match(/(?:PENDING_OWNER_SESSION|pending the owner[^.]*|owner(?:'s)? first fresh study[^.]*)/i);
  if (!match) return null;
  return {
    title: "Owner-only acceptance input is pending",
    description: match[0].replaceAll("_", " "),
    impact: "The worker can prepare and verify the technical path, but cannot fabricate the owner's private acceptance session.",
  };
}

function sentenceTitle(value) {
  const cleaned = value.replace(/^\([^)]*\)\s*/, "").replace(/[.;]+$/, "").trim();
  return `${cleaned.slice(0, 1).toUpperCase()}${cleaned.slice(1, 96)}`;
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
