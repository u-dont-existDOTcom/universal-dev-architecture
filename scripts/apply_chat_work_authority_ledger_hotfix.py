#!/usr/bin/env python3
"""Apply the 2026-09-01 Chat-to-Work authority hotfix deterministically.

The v2 event schema remains able to parse historical change_proposal_recorded
rows, but every new worker-authored proposal is removed from authenticated
producer permissions and rejected at the append-only ledger boundary.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "tools/codex-mission-control/restored/codex-mission-control"


def replace_exact(path: Path, old: str, new: str, *, expected_count: int = 1) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count == 0:
        if new in text:
            return
        raise RuntimeError(f"Expected source pattern not found in {path}")
    if count != expected_count:
        raise RuntimeError(
            f"Expected {expected_count} occurrence(s) in {path}, found {count}"
        )
    path.write_text(text.replace(old, new), encoding="utf-8")


def replace_regex(path: Path, pattern: str, replacement: str) -> None:
    text = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)
    if count == 0:
        if replacement in text:
            return
        raise RuntimeError(f"Expected regex source pattern not found in {path}")
    path.write_text(updated, encoding="utf-8")


def patch_ingestion_auth() -> None:
    path = APP / "lib/ingestion-auth.ts"
    replace_exact(
        path,
        '  "structured_blocker_recorded", "change_proposal_recorded", "worker_connection_observed",',
        '  "structured_blocker_recorded", "worker_connection_observed",',
        expected_count=2,
    )


def patch_store() -> None:
    path = APP / "lib/store.ts"
    replace_exact(
        path,
        '''  private validateWorkerChannel(envelope: AppendEnvelope, producer: AuthenticatedProducer) {
    const data = envelope.data;
    if (!["owner_message_recorded", "outbound_delivery_lifecycle_recorded", "outbound_message_acknowledged",
      "worker_message_recorded", "direction_acknowledged", "work_queue_published", "direction_reconciled",
      "structured_blocker_recorded", "change_proposal_recorded"].includes(data.type)) return;''',
        '''  private validateWorkerChannel(envelope: AppendEnvelope, producer: AuthenticatedProducer) {
    const data = envelope.data;
    if (data.type === "change_proposal_recorded") {
      throw new ContractInvariantError(
        "New worker-authored proposals are forbidden. Route immutable factual state automatically to a verified Project Manager or specialist supervisor chat for reasoning and proposal authorship.",
      );
    }
    if (!["owner_message_recorded", "outbound_delivery_lifecycle_recorded", "outbound_message_acknowledged",
      "worker_message_recorded", "direction_acknowledged", "work_queue_published", "direction_reconciled",
      "structured_blocker_recorded"].includes(data.type)) return;''',
    )
    replace_exact(
        path,
        '''    if (data.type === "structured_blocker_recorded" || data.type === "change_proposal_recorded") {
      if (!directionMessage(data.direction_id)) throw new ContractInvariantError("Structured worker issues must bind an existing owner direction.");
      const queueItemId = data.queue_item_id;
      if (queueItemId && !events.some((event) => event.data.type === "work_queue_published"
        && event.data.direction_id === data.direction_id && event.data.items.some((item) => item.item_id === queueItemId))) {
        throw new ContractInvariantError("Structured worker issues must bind a queue item from the same direction when one is named.");
      }
      if (data.type === "structured_blocker_recorded" && data.reported_by !== producer.id) {
        throw new ContractInvariantError("Blocker reporter must match the authenticated producer.");
      }
      if (data.type === "change_proposal_recorded") {
        if (data.proposer_id !== producer.id) throw new ContractInvariantError("Proposal author must match the authenticated producer.");
        if (data.authority_effect !== "NON_OPERATIVE" || data.reasoning_authority !== "WORKER_CLAIM") {
          throw new ContractInvariantError("Worker change proposals are non-operative claims and cannot assert decision authority.");
        }
      }
      return;
    }''',
        '''    if (data.type === "structured_blocker_recorded") {
      if (!directionMessage(data.direction_id)) throw new ContractInvariantError("Structured worker issues must bind an existing owner direction.");
      const queueItemId = data.queue_item_id;
      if (queueItemId && !events.some((event) => event.data.type === "work_queue_published"
        && event.data.direction_id === data.direction_id && event.data.items.some((item) => item.item_id === queueItemId))) {
        throw new ContractInvariantError("Structured worker issues must bind a queue item from the same direction when one is named.");
      }
      if (data.reported_by !== producer.id) {
        throw new ContractInvariantError("Blocker reporter must match the authenticated producer.");
      }
      return;
    }''',
    )


def patch_worker_channel_tests() -> None:
    path = APP / "tests/worker-channel.test.ts"
    replace_exact(
        path,
        'import type { MissionControlEventV2 } from "../lib/schema";',
        'import { parseEventV2, type MissionControlEventV2 } from "../lib/schema";',
    )

    replace_regex(
        path,
        r'test\("a worker proposal cannot claim owner reasoning authority or become operative", \(\) => \{.*?\n\}\);\n\ntest\("cross-worker and invented direction bindings fail closed"',
        '''test("worker-authored proposals are rejected at producer and ledger boundaries", () => {
  const store = new EventStore(":memory:");
  recordOwnerMessage(store, {
    worker: "alpha", kind: "DIRECTION", body: "Run the bounded survey.", now,
    messageId: "message:alpha:proposal", directionId: "direction:alpha:proposal", deliveryId: "delivery:alpha:proposal",
    ownerEventId: "event:owner-message:alpha:proposal", deliveryEventId: "event:delivery-queued:alpha:proposal",
  }, owner);
  const proposal: MissionControlEventV2 = {
    type: "change_proposal_recorded", worker: "alpha", proposal_id: "proposal:alpha:unauthorized", task_id: "task:alpha",
    direction_id: "direction:alpha:proposal", queue_item_id: null, status: "OPEN", title: "Add paid inference",
    rationale: "A worker-authored spending proposal.", expected_impact: "Would materially change cost and methodology.", affected_scope: ["task:alpha"],
    proposer_id: "worker:alpha", reasoning_authority: "WORKER_CLAIM", authority_effect: "NON_OPERATIVE",
    disposition: null, evidence_refs: [], requires_owner_decision: true, reported_at: now,
  };
  assert.equal(producerMayEmit(worker, proposal), false);
  assert.throws(
    () => store.append(envelope("event:proposal:alpha:unauthorized", now, proposal), undefined, worker),
    /worker-authored proposals are forbidden/,
  );
  assert.equal(store.count(), 2);
  store.close();
});

test("cross-worker and invented direction bindings fail closed"''',
    )

    replace_regex(
        path,
        r'test\("structured blockers and proposals remain queryable after restart", \(\) => \{.*?\n\}\);\n\ntest\("worker-channel event families are restricted to their authority lanes"',
        '''test("structured blockers persist while historical proposal records remain parseable only", () => {
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
      workaround: "A verified supervisor must decide whether a bounded read-only credential is acceptable.",
      required_actor: { kind: "SUPERVISOR", id: "chat:askrigor:methods-supervisor" },
      evidence_refs: ["evidence:credential-rejection"], reported_by: "worker:alpha", needs_owner: false, reported_at: now,
    }), undefined, worker);
    first.close();

    const reopened = new EventStore(filename);
    const channel = projectWorkerChannel(reopened.workerEvents("alpha"));
    assert.equal(channel.freshness, "CURRENT");
    assert.equal(channel.queue[0].itemId, "queue-item:alpha:5");
    assert.equal(channel.blockers[0].needsOwner, false);
    assert.equal(channel.proposals.length, 0);
    assert.deepEqual(reopened.verifyChain(), { valid: true, errors: [] });
    reopened.close();

    const historical = parseEventV2({
      type: "change_proposal_recorded", worker: "alpha", proposal_id: "proposal:legacy", task_id: "task:alpha",
      direction_id: "direction:alpha:5", queue_item_id: null, status: "WITHDRAWN", title: "Historical worker proposal",
      rationale: "Retained only so an existing append-only ledger can still be decoded.", expected_impact: "None.",
      affected_scope: ["task:alpha"], proposer_id: "worker:alpha", reasoning_authority: "WORKER_CLAIM",
      authority_effect: "NON_OPERATIVE", disposition: "SUPERSEDED_BY_CHAT_AUTHORITY_GATE", evidence_refs: [],
      requires_owner_decision: false, reported_at: now,
    });
    assert.equal(historical.type, "change_proposal_recorded");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("worker-channel event families are restricted to their authority lanes"''',
    )


def main() -> None:
    patch_ingestion_auth()
    patch_store()
    patch_worker_channel_tests()
    print("Chat-to-Work ledger hotfix applied or already present.")


if __name__ == "__main__":
    main()
