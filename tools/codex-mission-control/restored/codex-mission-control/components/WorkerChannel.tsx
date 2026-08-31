"use client";

import { useState } from "react";
import type { WorkerState } from "@/lib/projection";
import type { WorkQueueItemProjection } from "@/lib/worker-channel";

export function WorkerChannel({ worker, onRefresh }: { worker: WorkerState; onRefresh: () => Promise<void> }) {
  const [kind, setKind] = useState<"CONVERSATION" | "DIRECTION">("CONVERSATION");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"URGENT" | "HIGH" | "NORMAL" | "LOW">("NORMAL");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channel = worker.channel;

  async function send() {
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/workers/${encodeURIComponent(worker.id)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, body: body.trim(), priority, mission_id: worker.missionId, idempotency_key: crypto.randomUUID() }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? "Message could not be recorded.");
      }
      setBody("");
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Message could not be recorded.");
    } finally {
      setSending(false);
    }
  }

  return <section className="worker-channel" aria-label="Owner and worker communication">
    <div className="channel-direction-head">
      <div><p className="eyebrow">LATEST OWNER DIRECTION</p><h2>{channel.latestDirectionBody ?? "No owner direction recorded yet"}</h2></div>
      <span className={`freshness-badge ${freshnessTone(channel.freshness)}`}>{channel.freshness.replaceAll("_", " ")}</span>
    </div>
    <div className="channel-lifecycle" aria-label="Owner direction lifecycle">
      {lifecycle(channel).map(([label, complete, current]) => <span key={label} className={complete ? "complete" : current ? "current" : "pending"}><i>{complete ? "✓" : "○"}</i>{label}</span>)}
    </div>
    {channel.acknowledgementInterpretation && <div className="worker-interpretation"><span className="field-label">WORKER INTERPRETATION</span><p>{channel.acknowledgementInterpretation}</p></div>}

    <div className="channel-grid">
      <div className="conversation-panel">
        <div className="channel-panel-head"><div><p className="eyebrow">CONVERSATION</p><h3>Owner and worker</h3></div><span>{channel.messages.length} messages</span></div>
        <div className="conversation-thread">
          {channel.messages.length === 0 && <p className="empty-channel">No messages yet. A message is informational; a direction changes the active work boundary.</p>}
          {channel.messages.slice(-20).map((message) => <article key={message.messageId} className={`channel-message ${message.author.toLowerCase()} ${message.kind.toLowerCase()}`}>
            <div><strong>{message.author} · {message.kind}</strong><time>{new Date(message.recordedAt).toLocaleString()}</time></div>
            <p>{message.body}</p>
            {message.author === "OWNER" && <small>{message.priority ? `${message.priority} · EPOCH ${message.authorityEpoch} · ` : ""}{message.deliveryStatus.replaceAll("_", " ")}{message.acknowledged ? " · ACKNOWLEDGED" : ""}{message.incorporated ? " · INCORPORATED" : ""}</small>}
          </article>)}
        </div>
        <div className="owner-composer">
          <div className="composer-kind" role="group" aria-label="Message authority">
            <button type="button" className={kind === "CONVERSATION" ? "selected" : ""} onClick={() => setKind("CONVERSATION")}>Message</button>
            <button type="button" className={kind === "DIRECTION" ? "selected direction" : "direction"} onClick={() => setKind("DIRECTION")}>Direction</button>
          </div>
          <label htmlFor="owner-worker-message">{kind === "DIRECTION" ? "New owner direction" : "Message to worker"}</label>
          {kind === "DIRECTION" && <label className="composer-priority">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option>NORMAL</option><option>HIGH</option><option>URGENT</option><option>LOW</option></select></label>}
          <textarea id="owner-worker-message" value={body} maxLength={20_000} onChange={(event) => setBody(event.target.value)} placeholder={kind === "DIRECTION" ? "State the new priority or work boundary…" : "Ask a question or share context…"} />
          {error && <p className="composer-error">{error}</p>}
          <div><span>Ledgered before delivery · local and remote workers poll the same durable outbox</span><button type="button" onClick={() => void send()} disabled={!body.trim() || sending}>{sending ? "Recording…" : "Record + send"}</button></div>
        </div>
      </div>

      <div className="channel-operations">
        <QueuePanel queue={channel.queue} directionId={channel.latestDirectionId} />
        <div className="structured-issues">
          <IssuePanel title="Blockers" count={channel.blockers.length} tone="red">
            {channel.blockers.map((blocker) => <article key={blocker.blockerId}><strong>{blocker.title}</strong><p>{blocker.description}</p><small>{blocker.severity} · {blocker.needsOwner ? "OWNER NEEDED" : "WORKER OWNED"} · {blocker.impact} · ACTOR {blocker.requiredActor.kind}:{blocker.requiredActor.id}{blocker.workaround ? ` · WORKAROUND ${blocker.workaround}` : ""}</small></article>)}
          </IssuePanel>
          <IssuePanel title="Proposals" count={channel.proposals.length} tone="yellow">
            {channel.proposals.map((proposal) => <article key={proposal.proposalId}><strong>{proposal.title}</strong><p>{proposal.rationale}</p><small>NON-OPERATIVE · {proposal.reasoningAuthority.replaceAll("_", " ")} · {proposal.requiresOwnerDecision ? "OWNER DECISION" : "INFORMATIONAL"} · {proposal.expectedImpact}</small></article>)}
          </IssuePanel>
        </div>
      </div>
    </div>
  </section>;
}

export function FleetQueue({ queue }: { queue: WorkQueueItemProjection[] }) {
  const [status, setStatus] = useState<"OPEN" | WorkQueueItemProjection["status"]>("OPEN");
  const [priority, setPriority] = useState<"ALL" | WorkQueueItemProjection["priority"]>("ALL");
  const [workerProject, setWorkerProject] = useState("");
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [sort, setSort] = useState<"PRIORITY" | "WORKER" | "STATUS">("PRIORITY");
  const rank = { P0: 0, P1: 1, P2: 2, P3: 3 } as const;
  const needle = workerProject.trim().toLowerCase();
  const visible = queue.filter((item) => {
    const statusMatch = status === "OPEN" ? !["DONE", "CANCELED", "SUPERSEDED"].includes(item.status) : item.status === status;
    const identityMatch = !needle || `${item.worker} ${item.projectId} ${item.taskId}`.toLowerCase().includes(needle);
    return statusMatch && (priority === "ALL" || item.priority === priority) && identityMatch && (!blockedOnly || item.status === "BLOCKED");
  }).sort((left, right) => sort === "PRIORITY" ? rank[left.priority] - rank[right.priority] || left.ordinal - right.ordinal
    : sort === "WORKER" ? left.worker.localeCompare(right.worker) || left.ordinal - right.ordinal
      : left.status.localeCompare(right.status) || rank[left.priority] - rank[right.priority]);
  return <section className="fleet-queue" aria-label="Fleet work queue">
    <div className="fleet-queue-head">
      <div><p className="eyebrow">FLEET WORK QUEUE</p><h2>Direction-bound work across every worker and project</h2></div>
      <div className="fleet-filters">
        <label>Worker / project<input type="text" value={workerProject} onChange={(event) => setWorkerProject(event.target.value)} placeholder="Filter…" /></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="BLOCKED">Blocked</option><option value="READY">Ready</option><option value="PLANNED">Planned</option><option value="WAITING_REVIEW">Waiting review</option><option value="DONE">Done</option><option value="SUPERSEDED">Superseded</option></select></label>
        <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="ALL">All</option><option>P0</option><option>P1</option><option>P2</option><option>P3</option></select></label>
        <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="PRIORITY">Priority</option><option value="WORKER">Worker</option><option value="STATUS">Status</option></select></label>
        <label className="blocked-toggle"><input type="checkbox" checked={blockedOnly} onChange={(event) => setBlockedOnly(event.target.checked)} />Blocked only</label>
      </div>
    </div>
    <div className="fleet-queue-table" role="table">
      <div role="row" className="queue-table-head"><span>Worker / project</span><span>Work item</span><span>Direction</span><span>State</span></div>
      {visible.length === 0 && <p className="empty-channel">No work items match this filter.</p>}
      {visible.map((item) => <div role="row" className="queue-table-row" key={`${item.worker}:${item.queueRevisionId}:${item.itemId}`}><strong>{item.worker}<small>{item.projectId}</small></strong><div><b>{item.title}</b><small>{item.detail}</small></div><code>{item.directionId}</code><span className={`queue-status ${item.status.toLowerCase()}`}>{item.priority} · {item.status.replaceAll("_", " ")}</span></div>)}
    </div>
  </section>;
}

function QueuePanel({ queue, directionId }: { queue: WorkQueueItemProjection[]; directionId: string | null }) {
  return <section className="queue-panel"><div className="channel-panel-head"><div><p className="eyebrow">DIRECTION-BOUND WORK QUEUE</p><h3>{directionId ?? "Awaiting first direction"}</h3></div><span>{queue.filter((item) => !["DONE", "CANCELED", "SUPERSEDED"].includes(item.status)).length} open</span></div><div className="worker-queue-list">{queue.length === 0 && <p className="empty-channel">The worker has not published a queue for this direction.</p>}{queue.map((item) => <article key={item.itemId}><i>{item.ordinal + 1}</i><div><strong>{item.title}</strong><p>{item.detail}</p>{item.dependsOn.length > 0 && <small>After {item.dependsOn.join(", ")}</small>}</div><span className={`queue-status ${item.status.toLowerCase()}`}>{item.priority} · {item.status.replaceAll("_", " ")}</span></article>)}</div></section>;
}

function IssuePanel({ title, count, tone, children }: { title: string; count: number; tone: string; children: React.ReactNode }) {
  return <section className={`issue-panel ${tone}`}><div><span>{title}</span><strong>{count}</strong></div>{count === 0 ? <p className="empty-channel">None open</p> : children}</section>;
}

function freshnessTone(freshness: WorkerState["channel"]["freshness"]) {
  if (freshness === "CURRENT" || freshness === "NO_DIRECTION") return "green";
  if (freshness === "DELIVERY_FAILED") return "red";
  return "yellow";
}

function lifecycle(channel: WorkerState["channel"]): Array<[string, boolean, boolean]> {
  const direction = [...channel.messages].reverse().find((message) => message.kind === "DIRECTION" && message.author === "OWNER");
  const delivered = direction?.deliveryStatus === "DELIVERED" || Boolean(direction?.acknowledged);
  const steps: Array<[string, boolean]> = [
    ["Recorded", Boolean(direction)],
    ["Queued", Boolean(direction && direction.deliveryStatus !== "RECORDED")],
    ["Delivered", delivered],
    ["Acknowledged", Boolean(direction?.acknowledged)],
    ["Incorporated", Boolean(direction?.incorporated)],
  ];
  const firstIncomplete = steps.findIndex(([, complete]) => !complete);
  return steps.map(([label, complete], index) => [label, complete, index === firstIncomplete]);
}
