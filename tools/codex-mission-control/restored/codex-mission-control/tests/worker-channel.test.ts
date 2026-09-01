import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FleetQueue, WorkerChannel } from "../components/WorkerChannel";
import { MissionCard } from "../components/Dashboard";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import { producerMayEmit } from "../lib/ingestion-auth";
import type { MissionControlEventV2 } from "../lib/schema";
import { ContractInvariantError, EventStore } from "../lib/store";
import { seedIssue47Store, seedStore } from "../lib/seed";
import { projectWorkerConnection, projectWorkers } from "../lib/projection";
import { projectWorkerChannel, pullWorkerOutbox, recordOwnerMessage } from "../lib/worker-channel";

const owner: AuthenticatedProducer = { id: "owner:dashboard", kind: "UI", workerScopes: ["alpha"], taskScopes: ["task:alpha"] };
const worker: AuthenticatedProducer = { id: "worker:alpha", kind: "WORKER", workerScopes: ["alpha"], taskScopes: ["task:alpha"] };
const system: AuthenticatedProducer = { id: "system:outbound-delivery", kind: "SYSTEM", workerScopes: ["*"], taskScopes: ["*"] };
const now = "2026-08-31T22:00:00.000Z";

test("owner messages are ledgered atomically before delivery is observable", () => {
  const store = new EventStore(":memory:");
  const result = recordOwnerMessage(store, {
    worker: "alpha", kind: "DIRECTION", body: "Run the AstroHD survey first.", now,
    messageId: "message:alpha:1", directionId: "direction:alpha:1", deliveryId: "delivery:alpha:1",
    ownerEventId: "event:owner-message:alpha:1", deliveryEventId: "event:delivery-queued:alpha:1",
  }, owner);
  assert.equal(store.count(), 2);
  assert.equal(result.message.sequence + 1, result.delivery.sequence);
  assert.equal(result.delivery.previousHash, result.message.eventHash);
  recordOwnerMessage(store, {
    worker: "alpha", kind: "DIRECTION", body: "Run the AstroHD survey first.", now,
    messageId: "message:alpha:1", directionId: "direction:alpha:1", deliveryId: "delivery:alpha:1",
    ownerEventId: "event:owner-message:alpha:1", deliveryEventId: "event:delivery-queued:alpha:1",
  }, owner);
  assert.equal(store.count(), 2);
  assert.deepEqual(store.verifyChain(), { valid: true, errors: [] });
  const channel = projectWorkerChannel(store.workerEvents("alpha"));
  assert.equal(channel.latestDirectionBody, "Run the AstroHD survey first.");
  assert.equal(channel.messages[0].deliveryStatus, "QUEUED");
  assert.equal(channel.freshness, "AWAITING_DELIVERY");
  store.close();
});

test("invalid owner message batches roll back without an orphaned outbox record", () => {
  const store = new EventStore(":memory:");
  assert.throws(() => recordOwnerMessage(store, {
    worker: "alpha", kind: "DIRECTION", body: "   ", now,
    messageId: "message:alpha:bad", directionId: "direction:alpha:bad", deliveryId: "delivery:alpha:bad",
    ownerEventId: "event:owner-message:alpha:bad", deliveryEventId: "event:delivery-queued:alpha:bad",
  }, owner));
  assert.equal(store.count(), 0);
  store.close();
});

test("authenticated local or remote workers poll a durable outbox with retry leases", () => {
  const store = new EventStore(":memory:");
  recordOwnerMessage(store, {
    worker: "alpha", kind: "CONVERSATION", body: "What is blocking the current task?", now,
    messageId: "message:alpha:2", deliveryId: "delivery:alpha:2",
    ownerEventId: "event:owner-message:alpha:2", deliveryEventId: "event:delivery-queued:alpha:2",
  }, owner);
  assert.throws(() => pullWorkerOutbox(store, "alpha", { ...worker, id: "worker:beta", workerScopes: ["beta"] }), /authenticated worker/);
  const first = pullWorkerOutbox(store, "alpha", worker, { now, leaseSeconds: 30 });
  assert.equal(first.deliveries.length, 1);
  assert.equal(projectWorkerChannel(store.workerEvents("alpha")).messages[0].deliveryStatus, "DELIVERED");
  assert.equal(projectWorkerChannel(store.workerEvents("alpha")).freshness, "NO_DIRECTION");
  assert.equal(pullWorkerOutbox(store, "alpha", worker, { now: "2026-08-31T22:00:20.000Z" }).deliveries.length, 0);
  const retry = pullWorkerOutbox(store, "alpha", worker, { now: "2026-08-31T22:00:31.000Z" });
  assert.equal(retry.deliveries.length, 1);
  assert.equal(store.workerEvents("alpha").filter((event) => event.data.type === "outbound_delivery_lifecycle_recorded").length, 5);
  store.close();
});

test("worker acknowledgement, interpretation, queue, and reconciliation advance one direction to CURRENT", () => {
  const store = new EventStore(":memory:");
  recordOwnerMessage(store, {
    worker: "alpha", kind: "DIRECTION", body: "Run the AstroHD survey first.", now,
    messageId: "message:alpha:3", directionId: "direction:alpha:3", deliveryId: "delivery:alpha:3",
    ownerEventId: "event:owner-message:alpha:3", deliveryEventId: "event:delivery-queued:alpha:3",
  }, owner);
  pullWorkerOutbox(store, "alpha", worker, { now });
  assert.equal(projectWorkerChannel(store.workerEvents("alpha")).freshness, "AWAITING_ACKNOWLEDGEMENT");
  const ackAt = "2026-08-31T22:01:00.000Z";
  store.appendMany([
    { event: envelope("event:message-ack:alpha:3", ackAt, {
      type: "outbound_message_acknowledged", worker: "alpha", acknowledgement_id: "ack:message:alpha:3",
      message_id: "message:alpha:3", delivery_id: "delivery:alpha:3", acknowledged_at: ackAt,
    }), producer: worker },
    { event: envelope("event:direction-ack:alpha:3", ackAt, {
      type: "direction_acknowledged", worker: "alpha", acknowledgement_id: "ack:direction:alpha:3",
      direction_id: "direction:alpha:3", message_id: "message:alpha:3",
      interpretation: "Prioritize the AstroHD survey before returning to governance work.",
      accepted_scope: ["AstroHD survey"], acknowledged_at: ackAt,
    }), producer: worker },
  ]);
  assert.equal(projectWorkerChannel(store.workerEvents("alpha")).freshness, "DASHBOARD_BEHIND_OWNER");
  store.appendMany([
    { event: envelope("event:queue:alpha:3", ackAt, {
      type: "work_queue_published", worker: "alpha", project_id: "project:alpha", task_id: "task:alpha",
      queue_revision_id: "queue:alpha:3", revision: 1, previous_queue_revision_id: null,
      direction_id: "direction:alpha:3", published_at: ackAt, items: [
        { item_id: "queue-item:astrohd-survey", title: "Run AstroHD survey", detail: "Collect and summarize the survey evidence.", status: "IN_PROGRESS", priority: "P0", ordinal: 0, depends_on: [], created_at: ackAt, updated_at: ackAt },
        { item_id: "queue-item:astrohd-review", title: "Review results", detail: "Return decision-changing findings to the owner.", status: "PLANNED", priority: "P1", ordinal: 1, depends_on: ["queue-item:astrohd-survey"], created_at: ackAt, updated_at: ackAt },
      ],
    }), producer: worker },
    { event: envelope("event:reconcile:alpha:3", ackAt, {
      type: "direction_reconciled", worker: "alpha", reconciliation_id: "reconcile:alpha:3",
      direction_id: "direction:alpha:3", queue_revision_id: "queue:alpha:3", status: "INCORPORATED",
      summary: "The queue now leads with the AstroHD survey.", reconciled_at: ackAt,
    }), producer: worker },
  ]);
  const channel = projectWorkerChannel(store.workerEvents("alpha"));
  assert.equal(channel.freshness, "CURRENT");
  assert.equal(channel.messages[0].acknowledged, true);
  assert.equal(channel.messages[0].incorporated, true);
  assert.equal(channel.messages[0].authorityEpoch, 1);
  assert.equal(channel.messages[0].priority, "NORMAL");
  assert.deepEqual(channel.queue.map((item) => item.itemId), ["queue-item:astrohd-survey", "queue-item:astrohd-review"]);
  const revisedAt = "2026-08-31T22:02:00.000Z";
  store.appendMany([
    { event: envelope("event:queue:alpha:3:rev2", revisedAt, {
      type: "work_queue_published", worker: "alpha", project_id: "project:alpha", task_id: "task:alpha",
      queue_revision_id: "queue:alpha:3:rev2", revision: 2, previous_queue_revision_id: "queue:alpha:3",
      direction_id: "direction:alpha:3", published_at: revisedAt, items: [
        { item_id: "queue-item:astrohd-survey", title: "Run AstroHD survey", detail: "Survey run is complete.", status: "SUPERSEDED", priority: "P0", ordinal: 0, depends_on: [], created_at: ackAt, updated_at: revisedAt },
        { item_id: "queue-item:astrohd-review", title: "Review results", detail: "Return decision-changing findings to the owner.", status: "WAITING_REVIEW", priority: "P1", ordinal: 1, depends_on: ["queue-item:astrohd-survey"], created_at: ackAt, updated_at: revisedAt },
      ],
    }), producer: worker },
    { event: envelope("event:reconcile:alpha:3:rev2", revisedAt, {
      type: "direction_reconciled", worker: "alpha", reconciliation_id: "reconcile:alpha:3:rev2",
      direction_id: "direction:alpha:3", queue_revision_id: "queue:alpha:3:rev2", status: "INCORPORATED",
      summary: "The revised queue preserves the completed survey and waits for review.", reconciled_at: revisedAt,
    }), producer: worker },
  ]);
  const revised = projectWorkerChannel(store.workerEvents("alpha"));
  assert.equal(revised.queueRevisionId, "queue:alpha:3:rev2");
  assert.deepEqual(revised.queue.map((item) => item.status), ["SUPERSEDED", "WAITING_REVIEW"]);
  assert.equal(pullWorkerOutbox(store, "alpha", worker, { now: "2026-08-31T23:00:00.000Z" }).deliveries.length, 0);
  store.close();
});

test("a stale direction overlays GREEN assurance and cannot render READY TO CONTINUE", () => {
  const store = new EventStore(":memory:");
  seedStore(store);
  const authOwner: AuthenticatedProducer = { id: "owner:dashboard", kind: "UI", workerScopes: ["auth"], taskScopes: ["*"] };
  recordOwnerMessage(store, {
    worker: "auth", kind: "DIRECTION", body: "Prioritize the fresh owner direction.", now,
    messageId: "message:auth:stale", directionId: "direction:auth:stale", deliveryId: "delivery:auth:stale",
    ownerEventId: "event:owner-message:auth:stale", deliveryEventId: "event:delivery-queued:auth:stale",
  }, authOwner);
  const projected = projectWorkers(store.allEvents()).find((candidate) => candidate.id === "auth")!;
  assert.equal(projected.overallTraffic, "GREEN", "the semantic assurance plane remains independent");
  assert.equal(projected.channel.freshness, "AWAITING_DELIVERY");
  assert.deepEqual(projected.operatorState, {
    traffic: "YELLOW",
    label: "YELLOW · AWAITING DELIVERY — NOT CURRENT",
    reason: "The latest owner direction is durable but has not reached the worker.",
    needsAttention: true,
  });
  const html = renderToStaticMarkup(createElement(MissionCard, { worker: projected, selected: false }));
  assert.match(html, /YELLOW · AWAITING DELIVERY — NOT CURRENT/);
  assert.doesNotMatch(html, /GREEN · READY TO CONTINUE/);
  store.close();
});

test("new directions advance authority epoch, supersede the prior outbox item, and retry idempotently", () => {
  const store = new EventStore(":memory:");
  recordOwnerMessage(store, {
    worker: "alpha", kind: "DIRECTION", body: "Continue governance consolidation.", now,
    messageId: "message:alpha:old", directionId: "direction:alpha:old", deliveryId: "delivery:alpha:old",
    ownerEventId: "event:owner-message:alpha:old", deliveryEventId: "event:delivery-queued:alpha:old",
  }, owner);
  const secondInput = {
    worker: "alpha", kind: "DIRECTION" as const, body: "Run the AstroHD survey first.",
    supersedesDirectionId: "direction:alpha:old", priority: "URGENT" as const,
    messageId: "message:alpha:new", directionId: "direction:alpha:new", deliveryId: "delivery:alpha:new",
    ownerEventId: "event:owner-message:alpha:new", deliveryEventId: "event:delivery-queued:alpha:new",
  };
  recordOwnerMessage(store, { ...secondInput, now: "2026-08-31T22:01:00.000Z" }, owner);
  const afterSecond = store.count();
  recordOwnerMessage(store, { ...secondInput, now: "2026-08-31T22:09:00.000Z" }, owner);
  assert.equal(store.count(), afterSecond);
  const channel = projectWorkerChannel(store.workerEvents("alpha"));
  assert.equal(channel.latestDirectionId, "direction:alpha:new");
  assert.equal(channel.messages.find((message) => message.messageId === "message:alpha:new")?.authorityEpoch, 2);
  assert.equal(channel.messages.find((message) => message.messageId === "message:alpha:new")?.priority, "URGENT");
  assert.equal(channel.messages.find((message) => message.messageId === "message:alpha:old")?.deliveryStatus, "SUPERSEDED");
  assert.throws(() => recordOwnerMessage(store, {
    worker: "alpha", kind: "DIRECTION", body: "Skip the current direction.", supersedesDirectionId: null,
    messageId: "message:alpha:bad-new", directionId: "direction:alpha:bad-new", deliveryId: "delivery:alpha:bad-new",
    ownerEventId: "event:owner-message:alpha:bad-new", deliveryEventId: "event:delivery-queued:alpha:bad-new",
  }, owner), /explicitly supersede/);
  assert.equal(store.count(), afterSecond);
  store.close();
});

test("remote delivery failure stays durable and recovers through the retry-safe outbox", () => {
  const store = new EventStore(":memory:");
  recordOwnerMessage(store, {
    worker: "alpha", kind: "CONVERSATION", body: "Report current status.", now,
    messageId: "message:alpha:failure", deliveryId: "delivery:alpha:failure",
    ownerEventId: "event:owner-message:alpha:failure", deliveryEventId: "event:delivery-queued:alpha:failure",
  }, owner);
  const failedAt = "2026-08-31T22:00:05.000Z";
  const baseDelivery = {
    type: "outbound_delivery_lifecycle_recorded" as const, worker: "alpha", delivery_id: "delivery:alpha:failure",
    message_id: "message:alpha:failure", source_message_event_id: "event:owner-message:alpha:failure",
    attempt: 1, transport: "REMOTE_POLL" as const, endpoint_id: "worker:alpha:poll",
    lease_expires_at: null, remote_receipt_id: null,
  };
  store.appendMany([
    { event: envelope("event:delivery-attempt:alpha:failure", failedAt, { ...baseDelivery, status: "DELIVERY_ATTEMPTED", next_attempt_at: null, error_code: null }), producer: system },
    { event: envelope("event:delivery-failed:alpha:failure", failedAt, { ...baseDelivery, status: "DELIVERY_FAILED", next_attempt_at: "2026-08-31T22:01:00.000Z", error_code: "REMOTE_UNREACHABLE" }), producer: system },
  ]);
  assert.equal(projectWorkerChannel(store.workerEvents("alpha")).messages[0].deliveryStatus, "DELIVERY_FAILED");
  assert.equal(pullWorkerOutbox(store, "alpha", worker, { now: "2026-08-31T22:00:59.000Z" }).deliveries.length, 0);
  assert.equal(pullWorkerOutbox(store, "alpha", worker, { now: "2026-08-31T22:01:00.000Z" }).deliveries.length, 1);
  assert.equal(projectWorkerChannel(store.workerEvents("alpha")).messages[0].deliveryStatus, "DELIVERED");
  store.close();
});

test("a worker proposal cannot claim owner reasoning authority or become operative", () => {
  const store = new EventStore(":memory:");
  recordOwnerMessage(store, {
    worker: "alpha", kind: "DIRECTION", body: "Run the bounded survey.", now,
    messageId: "message:alpha:proposal", directionId: "direction:alpha:proposal", deliveryId: "delivery:alpha:proposal",
    ownerEventId: "event:owner-message:alpha:proposal", deliveryEventId: "event:delivery-queued:alpha:proposal",
  }, owner);
  assert.throws(() => store.append(envelope("event:proposal:alpha:unauthorized", now, {
    type: "change_proposal_recorded", worker: "alpha", proposal_id: "proposal:alpha:unauthorized", task_id: "task:alpha",
    direction_id: "direction:alpha:proposal", queue_item_id: null, status: "OPEN", title: "Expand scope",
    rationale: "A worker-authored suggestion.", expected_impact: "Would materially change scope.", affected_scope: ["task:alpha"],
    proposer_id: "worker:alpha", reasoning_authority: "OWNER_AUTHORITY", authority_effect: "NON_OPERATIVE",
    disposition: null, evidence_refs: [], requires_owner_decision: true, reported_at: now,
  }), undefined, worker), /non-operative claims/);
  assert.equal(store.count(), 2);
  store.close();
});

test("cross-worker and invented direction bindings fail closed", () => {
  const store = new EventStore(":memory:");
  recordOwnerMessage(store, {
    worker: "alpha", kind: "DIRECTION", body: "Do alpha work.", now,
    messageId: "message:alpha:4", directionId: "direction:alpha:4", deliveryId: "delivery:alpha:4",
    ownerEventId: "event:owner-message:alpha:4", deliveryEventId: "event:delivery-queued:alpha:4",
  }, owner);
  assert.throws(() => store.append(envelope("event:queue:invented", now, {
    type: "work_queue_published", worker: "alpha", project_id: "project:alpha", task_id: "task:alpha",
    queue_revision_id: "queue:invented", revision: 1, previous_queue_revision_id: null,
    direction_id: "direction:invented", published_at: now, items: [],
  }), undefined, worker), ContractInvariantError);
  assert.throws(() => store.append(envelope("event:reply:invented", now, {
    type: "worker_message_recorded", worker: "alpha", message_id: "message:reply:invented",
    thread_id: "thread:alpha", message_kind: "RESPONSE", body: "Reply", reply_to_message_id: "message:beta:missing", direction_id: null,
  }), undefined, worker), /existing same-worker/);
  assert.equal(store.count(), 2);
  store.close();
});

test("structured blockers and proposals remain queryable after restart", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-channel-"));
  const filename = path.join(directory, "mission-control.db");
  try {
    const first = new EventStore(filename);
    recordOwnerMessage(first, {
      worker: "alpha", kind: "DIRECTION", body: "Investigate AstroHD.", now,
      messageId: "message:alpha:5", directionId: "direction:alpha:5", deliveryId: "delivery:alpha:5",
      ownerEventId: "event:owner-message:alpha:5", deliveryEventId: "event:delivery-queued:alpha:5",
    }, owner);
    pullWorkerOutbox(first, "alpha", worker, { now });
    first.appendMany([
      { event: envelope("event:message-ack:alpha:5", now, {
        type: "outbound_message_acknowledged", worker: "alpha", acknowledgement_id: "ack:message:alpha:5",
        message_id: "message:alpha:5", delivery_id: "delivery:alpha:5", acknowledged_at: now,
      }), producer: worker },
      { event: envelope("event:direction-ack:alpha:5", now, {
        type: "direction_acknowledged", worker: "alpha", acknowledgement_id: "ack:direction:alpha:5",
        direction_id: "direction:alpha:5", message_id: "message:alpha:5", interpretation: "Investigate AstroHD first.",
        accepted_scope: ["AstroHD"], acknowledged_at: now,
      }), producer: worker },
      { event: envelope("event:queue:alpha:5", now, {
        type: "work_queue_published", worker: "alpha", project_id: "project:alpha", task_id: "task:alpha",
        queue_revision_id: "queue:alpha:5", revision: 1, previous_queue_revision_id: null,
        direction_id: "direction:alpha:5", published_at: now, items: [{
          item_id: "queue-item:alpha:5", title: "Investigate AstroHD", detail: "Run the bounded investigation.",
          status: "IN_PROGRESS", priority: "P0", ordinal: 0, depends_on: [], created_at: now, updated_at: now,
        }],
      }), producer: worker },
      { event: envelope("event:reconcile:alpha:5", now, {
        type: "direction_reconciled", worker: "alpha", reconciliation_id: "reconcile:alpha:5",
        direction_id: "direction:alpha:5", queue_revision_id: "queue:alpha:5", status: "INCORPORATED",
        summary: "Queue is current.", reconciled_at: now,
      }), producer: worker },
    ]);
    first.append(envelope("event:blocker:alpha:5", now, {
      type: "structured_blocker_recorded", worker: "alpha", blocker_id: "blocker:alpha:5", task_id: "task:alpha",
      direction_id: "direction:alpha:5", queue_item_id: "queue-item:alpha:5", status: "OPEN", severity: "BLOCKING",
      title: "Survey credentials missing", description: "The remote survey source rejects the current credential.",
      impact: "Evidence collection cannot start.", blocking_scope: ["queue-item:alpha:5"], workaround_available: true,
      workaround: "Use a bounded read-only service credential.", required_actor: { kind: "OWNER", id: "owner:dashboard" },
      evidence_refs: ["evidence:credential-rejection"], reported_by: "worker:alpha", needs_owner: true, reported_at: now,
    }), undefined, worker);
    first.append(envelope("event:proposal:alpha:5", now, {
      type: "change_proposal_recorded", worker: "alpha", proposal_id: "proposal:alpha:5", task_id: "task:alpha",
      direction_id: "direction:alpha:5", queue_item_id: "queue-item:alpha:5", status: "OPEN", title: "Use a read-only service credential",
      rationale: "It unblocks survey collection without granting write access.", expected_impact: "Restores bounded evidence collection.",
      affected_scope: ["queue-item:alpha:5"], proposer_id: "worker:alpha", reasoning_authority: "WORKER_CLAIM",
      authority_effect: "NON_OPERATIVE", disposition: null, evidence_refs: ["evidence:credential-rejection"],
      requires_owner_decision: true, reported_at: now,
    }), undefined, worker);
    first.close();
    const reopened = new EventStore(filename);
    const channel = projectWorkerChannel(reopened.workerEvents("alpha"));
    assert.equal(channel.freshness, "CURRENT");
    assert.equal(channel.queue[0].itemId, "queue-item:alpha:5");
    assert.equal(channel.blockers[0].needsOwner, true);
    assert.equal(channel.proposals[0].requiresOwnerDecision, true);
    assert.deepEqual(reopened.verifyChain(), { valid: true, errors: [] });
    reopened.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("worker-channel event families are restricted to their authority lanes", () => {
  const workerMessage: MissionControlEventV2 = {
    type: "worker_message_recorded", worker: "alpha", message_id: "message:worker:1", thread_id: "thread:alpha",
    message_kind: "QUESTION", body: "Should I expand the survey?", reply_to_message_id: null, direction_id: null,
  };
  assert.equal(producerMayEmit(worker, workerMessage), true);
  assert.equal(producerMayEmit({ ...worker, kind: "COLLECTOR", id: "collector:alpha" }, workerMessage), false);
  const ownerMessage: MissionControlEventV2 = {
    type: "owner_message_recorded", worker: "alpha", message_id: "message:owner:1", thread_id: "thread:alpha",
    message_kind: "CONVERSATION", body: "Status?", direction_id: null, reply_to_message_id: null,
    created_by: "owner:dashboard", delivery_required: true, supersedes_direction_id: null,
    priority: null, scope: null, authority_epoch: null, owner_outcome_id: null, owner_outcome_sha256: null,
    authority_semantics: "INFORMATIONAL",
  };
  assert.equal(producerMayEmit(owner, ownerMessage), true);
  assert.equal(producerMayEmit(worker, ownerMessage), false);
});

test("connection projection distinguishes live, expired configured, and fixture-only workers", () => {
  const store = new EventStore(":memory:");
  const connectedAt = "2026-08-31T22:00:00.000Z";
  const connected = envelope("event:connection:alpha", connectedAt, {
    type: "worker_connection_observed", worker: "alpha", connection_id: "connection:alpha:1",
    state: "CONNECTED", runtime_kind: "POLLING_SIDECAR", endpoint_id: "worker:alpha:poll",
    observed_at: connectedAt, lease_expires_at: "2026-08-31T22:05:00.000Z",
    source: { repository: "/repo/alpha", branch: "main", head: "a".repeat(40), state_path: "state/CURRENT-STATE.md" },
    detail: "Live authenticated poll succeeded.",
  });
  store.append(connected, undefined, worker);
  assert.equal(projectWorkerConnection(store.allEvents(), new Date("2026-08-31T22:01:00.000Z")).state, "CONNECTED");
  assert.equal(projectWorkerConnection(store.allEvents(), new Date("2026-08-31T22:06:00.000Z")).state, "OFFLINE_CONFIGURED");
  assert.equal(projectWorkerConnection([]).state, "FIXTURE_ONLY");
  store.close();
});

test("new Next machine routes remain daemon proxies rather than SQLite writers", () => {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const route of [
    "app/api/workers/[worker]/messages/route.ts",
    "app/api/worker-channel/[worker]/outbox/route.ts",
    "app/api/worker-channel/[worker]/events/route.ts",
    "app/api/mcp/route.ts",
  ]) {
    const source = fs.readFileSync(path.join(appRoot, route), "utf8");
    assert.match(source, /daemon-client/);
    assert.doesNotMatch(source, /(?:@\/lib|\.\.\/.*\/lib)\/store/);
  }
});

test("owner and fleet surfaces render the AstroHD direction, lifecycle, queue, and controls", () => {
  const store = new EventStore(":memory:");
  seedIssue47Store(store);
  const workers = projectWorkers(store.allEvents());
  const humanDesign = workers.find((item) => item.id === "human-design-governance")!;
  const channelHtml = renderToStaticMarkup(createElement(WorkerChannel, { worker: humanDesign, onRefresh: async () => {} }));
  assert.match(channelHtml, /Run the AstroHD survey first/);
  assert.match(channelHtml, /RECORDED[\s\S]*QUEUED[\s\S]*DELIVERED[\s\S]*ACKNOWLEDGED[\s\S]*INCORPORATED/i);
  assert.match(channelHtml, /Validate AstroHD survey inputs[\s\S]*Run the AstroHD survey[\s\S]*Review decision-changing evidence/);
  assert.match(channelHtml, /Record \+ send/);
  const fleetQueue = workers.flatMap((item) => item.channel.queue);
  const fleetHtml = renderToStaticMarkup(createElement(FleetQueue, { queue: fleetQueue }));
  assert.match(fleetHtml, /FLEET WORK QUEUE[\s\S]*human-design-governance[\s\S]*AstroHD/);
  assert.match(fleetHtml, /Worker \/ project[\s\S]*Status[\s\S]*Priority[\s\S]*Sort[\s\S]*Blocked only/);
  assert.match(fleetHtml, /project:human-design[\s\S]*P0/);
  assert.match(fleetHtml, /mission-control-live-slice[\s\S]*MC-EXP-HERMES-001/);
  assert.match(fleetHtml, /MC-EVAL-N8N-001[\s\S]*WAITING_DEPENDENCY/);
  const missionControl = workers.find((item) => item.id === "mission-control-live-slice")!;
  const hermes = missionControl.channel.queue.find((item) => item.itemId === "MC-EXP-HERMES-001")!;
  const n8n = missionControl.channel.queue.find((item) => item.itemId === "MC-EVAL-N8N-001")!;
  assert.deepEqual([hermes.status, hermes.dependsOn], ["PLANNED", ["mc:live-worker-channel"]]);
  assert.deepEqual([n8n.status, n8n.dependsOn], ["PLANNED", ["mc:recurring-adapter-burden"]]);
  store.close();
});

function envelope(eventId: string, occurredAt: string, data: MissionControlEventV2) {
  return { schema_version: 2 as const, event_id: eventId, mission_id: "mission-control-test", occurred_at: occurredAt, data };
}
