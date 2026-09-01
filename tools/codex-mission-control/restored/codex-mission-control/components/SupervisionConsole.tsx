"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkerState } from "@/lib/projection";
import type { StoredEvent } from "@/lib/schema";
import { formatMessageTimestamp } from "@/lib/message-time";
import { StatusDot } from "./StatusDot";

interface Snapshot {
  workers: WorkerState[];
  generatedAt: string;
}

type ReasoningMessageData = Extract<StoredEvent["data"], { type: "reasoning_message_recorded" }>;
type ReasoningEvent = StoredEvent & { data: ReasoningMessageData };

interface MessageRow {
  worker: WorkerState;
  event: ReasoningEvent;
}

export function SupervisionConsole() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/workers", { cache: "no-store" });
      if (!response.ok) throw new Error("supervision snapshot failed");
      setSnapshot(await response.json());
      setError(null);
    } catch {
      setError("Mission Control could not load the supervision read model.");
    }
  }, []);

  useEffect(() => {
    void load();
    const source = new EventSource("/api/events/stream");
    source.addEventListener("mission-control-event", () => void load());
    source.onerror = () => setError("Live supervision updates are reconnecting…");
    return () => source.close();
  }, [load]);

  const messageRows = useMemo(() => {
    return (snapshot?.workers ?? []).flatMap((worker) => worker.timeline
      .filter(isReasoningEvent)
      .map((event) => ({ worker, event })));
  }, [snapshot]);

  if (!snapshot) {
    return <main className="shell"><div className="loading-panel">Loading supervision channels…</div></main>;
  }

  const projectManagerRows = messageRows.filter((row) => row.event.data.surface_role === "PROJECT_MANAGER");
  const latestProjectManager = latestMessage(projectManagerRows);
  const projectManagerLink = latestProjectManager?.event.data.immutable_provider_locator
    ?? realSupervisorLink(snapshot.workers.find((worker) => worker.id === "mission-control-live-slice"));
  const verifiedProjectManagerMessages = projectManagerRows.filter((row) => row.event.data.provenance_status === "VERIFIED").length;

  return <main className="shell detail-shell">
    <header className="topbar">
      <div className="brand-row">
        <div className="brand-mark">MC</div>
        <div><p className="eyebrow">SUPERVISION CONTROL PLANE</p><h1>Project Manager and specialist chats</h1></div>
      </div>
      <div className="live-state"><StatusDot health={projectManagerLink ? "GREEN" : "UNKNOWN"} pulse={Boolean(projectManagerLink)} /><span>{projectManagerLink ? "LINKED" : "NOT CONNECTED"}</span></div>
    </header>

    {error && <div className="error-banner">{error}</div>}

    <section className={`worker-connection ${projectManagerLink ? "connected" : "fixture_only"}`} aria-label="Overall Project Manager channel">
      <div><span className="field-label">OVERALL PROJECT MANAGER CHAT</span><strong>{projectManagerLink ? "REAL LINK AVAILABLE" : "NO REAL CHAT LINK OR PROVIDER MESSAGE"}</strong></div>
      <p>{projectManagerLink
        ? "Mission Control can expose the exact Project Manager conversation and source-bound messages recorded from it."
        : "The Project Manager architecture exists, but no real ChatGPT conversation has been registered. Mission Control cannot honestly claim automatic ChatGPT routing until that transport is connected."}</p>
      <code>{verifiedProjectManagerMessages} verified Project Manager message{verifiedProjectManagerMessages === 1 ? "" : "s"} · {projectManagerRows.length} total</code>
      {latestProjectManager && <MessageSummary row={latestProjectManager} />}
      {projectManagerLink
        ? <a href={projectManagerLink} target="_blank" rel="noreferrer">Open overall Project Manager chat →</a>
        : <strong className="bad">CHATGPT TRANSPORT / CHAT ID MISSING</strong>}
    </section>

    <section className="detail-grid" aria-label="Specialist supervision chats">
      {snapshot.workers.map((worker) => {
        const rows = messageRows.filter((row) => row.worker.id === worker.id && row.event.data.surface_role === "SUPERVISOR");
        const latest = latestMessage(rows);
        const link = latest?.event.data.immutable_provider_locator ?? realSupervisorLink(worker);
        const verified = rows.filter((row) => row.event.data.provenance_status === "VERIFIED").length;
        const state = link ? verified > 0 ? "SOURCE-BOUND CHAT" : "LINK CONFIGURED · NO VERIFIED MESSAGE" : "NO REAL CHAT LINK";
        return <article key={worker.id} className="healthy-card">
          <div className="healthy-card-head">
            <div><StatusDot health={link && verified > 0 ? "GREEN" : link ? "YELLOW" : "UNKNOWN"} /><h3>{worker.name}</h3></div>
            <span>{state}</span>
          </div>
          <p>{worker.executionSupervision.surface} · latest reasoning state {worker.executionSupervision.reviewFreshness}</p>
          <div className="healthy-planes">
            <span>Verified messages <strong>{verified}</strong></span>
            <span>Total messages <strong>{rows.length}</strong></span>
            <span>Chat link <strong>{link ? "REAL" : "MISSING / PLACEHOLDER"}</strong></span>
            <span>Owner decision <strong>{worker.correction.ownerActionType.replaceAll("_", " ")}</strong></span>
          </div>
          {latest ? <MessageSummary row={latest} /> : <p className="empty-channel">No source-bound specialist message has been ingested. A chat title or Codex summary does not count.</p>}
          <div className="detail-actions">
            {link && <a href={link} target="_blank" rel="noreferrer">Open specialist chat →</a>}
            <Link href={`/worker/${worker.id}`}>Open worker evidence and transcript →</Link>
          </div>
        </article>;
      })}
    </section>

    <section className="change-summary secondary-history">
      <div className="summary-title"><span className="scan-icon">⌁</span><p className="eyebrow">INTERFACE TRUTH</p></div>
      <p>This page is a supervision directory and transcript surface. It does not pretend to be an inline ChatGPT composer. Automatic two-way ChatGPT messaging still requires a registered provider/browser relay that returns exact chat and message receipts. Owner→worker messaging is a separate channel.</p>
      <Link href="/">Return to fleet dashboard →</Link>
    </section>

    <footer><span>Source-bound reasoning only · placeholders fail visibly</span><span>Projection updated {formatDisplayTime(snapshot.generatedAt)}</span></footer>
  </main>;
}

function isReasoningEvent(event: StoredEvent): event is ReasoningEvent {
  return event.data.type === "reasoning_message_recorded";
}

function latestMessage(rows: MessageRow[]): MessageRow | null {
  return [...rows].sort((left, right) => messageTime(right).localeCompare(messageTime(left)) || right.event.sequence - left.event.sequence)[0] ?? null;
}

function messageTime(row: MessageRow): string {
  return row.event.data.sent_at_source ?? row.event.data.received_at_mission_control ?? row.event.occurredAt;
}

function realSupervisorLink(worker: WorkerState | undefined): string | null {
  if (!worker || worker.supervisorChatIsPlaceholder) return null;
  return worker.supervisorChatUrl.startsWith("https://") ? worker.supervisorChatUrl : null;
}

function MessageSummary({ row }: { row: MessageRow }) {
  const message = row.event.data;
  const timestamp = formatMessageTimestamp(message.sent_at_source ?? "");
  return <div className="gap-callout">
    <span className="field-label">LATEST SOURCE MESSAGE</span>
    <p><strong>{timestamp.absolute}</strong> · {timestamp.relative} · {message.provenance_status.replaceAll("_", " ")}</p>
    <p>{message.exact_visible_body ?? "Exact body unavailable; use the immutable provider locator."}</p>
    <code>{message.message_id} · {message.body_sha256}</code>
  </div>;
}

function formatDisplayTime(value: string): string {
  return formatMessageTimestamp(value).absolute;
}
