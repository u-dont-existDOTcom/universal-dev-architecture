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

interface ConfiguredSupervisorChat {
  scope: "PROJECT_MANAGER" | "SPECIALIST";
  chatId: string;
  label: string;
  url: string;
  workerId: string | null;
  locatorVerification: "OWNER_CONFIGURED_UNVERIFIED";
}

interface ConfiguredSupervisorDirectory {
  configurationState: "MISSING" | "CONFIGURED" | "INVALID";
  providerRelayState: "NOT_CONNECTED";
  entries: ConfiguredSupervisorChat[];
  error: string | null;
}

type ReasoningMessageData = Extract<StoredEvent["data"], { type: "reasoning_message_recorded" }>;
type ReasoningEvent = StoredEvent & { data: ReasoningMessageData };
type WorkerMessageData = Extract<StoredEvent["data"], { type: "worker_message_recorded" }>;
type WorkerMessageEvent = StoredEvent & { data: WorkerMessageData };

interface MessageRow {
  worker: WorkerState;
  event: ReasoningEvent;
}

interface InternalRoutePacket {
  requestId: string;
  actionBlockedOrRouted: string;
  destination: string;
  destinationChatId: string;
  providerDeliveryState: "QUEUED_FOR_PROVIDER_RELAY";
  queuedAt: string;
  factualPacket: {
    taskId: string;
    exactFactualState: string;
    decisionRequested: string;
  };
}

interface RouteRow {
  worker: WorkerState;
  event: WorkerMessageEvent;
  packet: InternalRoutePacket;
}

const emptyDirectory: ConfiguredSupervisorDirectory = {
  configurationState: "MISSING",
  providerRelayState: "NOT_CONNECTED",
  entries: [],
  error: null,
};
const internalRoutePrefix = "MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1\n";

export function SupervisionConsole() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [directory, setDirectory] = useState<ConfiguredSupervisorDirectory>(emptyDirectory);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [snapshotResponse, directoryResponse] = await Promise.all([
        fetch("/api/workers", { cache: "no-store" }),
        fetch("/api/supervisor-directory", { cache: "no-store" }),
      ]);
      if (!snapshotResponse.ok) throw new Error("supervision snapshot failed");
      setSnapshot(await snapshotResponse.json());
      if (directoryResponse.ok) {
        const configured = await directoryResponse.json() as ConfiguredSupervisorDirectory;
        setDirectory(configured);
        setError(configured.error);
      } else {
        setDirectory(emptyDirectory);
        setError("Mission Control could not load the configured supervisor-chat directory.");
      }
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

  const routeRows = useMemo(() => {
    return (snapshot?.workers ?? []).flatMap((worker) => worker.timeline
      .filter(isWorkerMessageEvent)
      .flatMap((event) => {
        const packet = parseInternalRoutePacket(event.data.body);
        return packet ? [{ worker, event, packet }] : [];
      }))
      .sort((left, right) => right.event.occurredAt.localeCompare(left.event.occurredAt));
  }, [snapshot]);

  if (!snapshot) {
    return <main className="shell"><div className="loading-panel">Loading supervision channels…</div></main>;
  }

  const projectManagerRows = messageRows.filter((row) => row.event.data.surface_role === "PROJECT_MANAGER");
  const latestProjectManager = latestMessage(projectManagerRows);
  const configuredProjectManager = directory.entries.find((entry) => entry.scope === "PROJECT_MANAGER") ?? null;
  const workerProjectManagerLink = realSupervisorLink(snapshot.workers.find((worker) => worker.id === "mission-control-live-slice"));
  const projectManagerLink = latestProjectManager?.event.data.immutable_provider_locator
    ?? configuredProjectManager?.url
    ?? workerProjectManagerLink;
  const projectManagerSourceBound = Boolean(latestProjectManager?.event.data.immutable_provider_locator
    && latestProjectManager.event.data.provenance_status === "VERIFIED");
  const verifiedProjectManagerMessages = projectManagerRows.filter((row) => row.event.data.provenance_status === "VERIFIED").length;
  const configuredSpecialists = directory.entries.filter((entry) => entry.scope === "SPECIALIST");

  return <main className="shell detail-shell">
    <header className="topbar">
      <div className="brand-row">
        <div className="brand-mark">MC</div>
        <div><p className="eyebrow">SUPERVISION CONTROL PLANE</p><h1>Project Manager and specialist chats</h1></div>
      </div>
      <div className="live-state">
        <StatusDot health={projectManagerSourceBound ? "GREEN" : projectManagerLink ? "YELLOW" : "UNKNOWN"} pulse={projectManagerSourceBound} />
        <span>{projectManagerSourceBound ? "SOURCE BOUND" : projectManagerLink ? "LOCATOR CONFIGURED" : "NOT CONNECTED"}</span>
      </div>
    </header>

    {error && <div className="error-banner">{error}</div>}

    <section className={`worker-connection ${projectManagerSourceBound ? "connected" : "fixture_only"}`} aria-label="Overall Project Manager channel">
      <div><span className="field-label">OVERALL PROJECT MANAGER CHAT</span><strong>{projectManagerSourceBound ? "SOURCE-BOUND CHAT" : projectManagerLink ? "CONFIGURED LOCATOR · PROVIDER UNVERIFIED" : "NO REAL CHAT LINK OR PROVIDER MESSAGE"}</strong></div>
      <p>{projectManagerSourceBound
        ? "Mission Control exposes the exact Project Manager conversation and source-bound messages recorded from it."
        : projectManagerLink
          ? "The owner-configured chat is directly reachable, but Mission Control has not received a provider-bound transcript or delivery receipt. The link is not evidence that automatic routing works."
          : "The Project Manager architecture exists, but no real ChatGPT conversation has been registered. Mission Control cannot honestly claim automatic ChatGPT routing until that transport is connected."}</p>
      <code>{verifiedProjectManagerMessages} verified Project Manager message{verifiedProjectManagerMessages === 1 ? "" : "s"} · {projectManagerRows.length} total · provider relay {directory.providerRelayState.replaceAll("_", " ")}</code>
      {latestProjectManager && <MessageSummary row={latestProjectManager} />}
      {projectManagerLink
        ? <a href={projectManagerLink} target="_blank" rel="noreferrer">Open overall Project Manager chat →</a>
        : <strong className="bad">CHATGPT TRANSPORT / CHAT ID MISSING</strong>}
    </section>

    {configuredSpecialists.length > 0 && <section className="detail-grid" aria-label="Configured specialist chat locators">
      {configuredSpecialists.map((entry) => {
        const matchingRows = messageRows.filter((row) => row.event.data.surface_role === "SUPERVISOR"
          && (row.event.data.immutable_provider_locator === entry.url || row.worker.id === entry.workerId));
        const latest = latestMessage(matchingRows);
        const verified = matchingRows.filter((row) => row.event.data.provenance_status === "VERIFIED").length;
        const queued = routeRows.filter((row) => row.packet.destinationChatId === entry.chatId).length;
        return <article key={entry.chatId} className="healthy-card">
          <div className="healthy-card-head">
            <div><StatusDot health={verified > 0 ? "GREEN" : "YELLOW"} /><h3>{entry.label}</h3></div>
            <span>{verified > 0 ? "SOURCE-BOUND CHAT" : "CONFIGURED LOCATOR"}</span>
          </div>
          <p>{entry.workerId ? `Worker ${entry.workerId}` : "Specialist supervisor"} · provider relay {directory.providerRelayState.replaceAll("_", " ")}</p>
          <div className="healthy-planes">
            <span>Verified messages <strong>{verified}</strong></span>
            <span>Total messages <strong>{matchingRows.length}</strong></span>
            <span>Queued routes <strong>{queued}</strong></span>
            <span>Locator <strong>OWNER CONFIGURED</strong></span>
          </div>
          {latest ? <MessageSummary row={latest} /> : <p className="empty-channel">No provider-bound specialist message has been ingested. The configured URL remains directly usable but unverified by Mission Control.</p>}
          <div className="detail-actions"><a href={entry.url} target="_blank" rel="noreferrer">Open specialist chat →</a></div>
        </article>;
      })}
    </section>}

    <section className="detail-grid" aria-label="Worker-bound specialist supervision chats">
      {snapshot.workers.map((worker) => {
        const rows = messageRows.filter((row) => row.worker.id === worker.id && row.event.data.surface_role === "SUPERVISOR");
        const latest = latestMessage(rows);
        const configured = directory.entries.find((entry) => entry.scope === "SPECIALIST" && entry.workerId === worker.id) ?? null;
        const link = latest?.event.data.immutable_provider_locator ?? configured?.url ?? realSupervisorLink(worker);
        const verified = rows.filter((row) => row.event.data.provenance_status === "VERIFIED").length;
        const state = verified > 0 ? "SOURCE-BOUND CHAT" : link ? "LINK CONFIGURED · NO VERIFIED MESSAGE" : "NO REAL CHAT LINK";
        return <article key={worker.id} className="healthy-card">
          <div className="healthy-card-head">
            <div><StatusDot health={link && verified > 0 ? "GREEN" : link ? "YELLOW" : "UNKNOWN"} /><h3>{worker.name}</h3></div>
            <span>{state}</span>
          </div>
          <p>{worker.executionSupervision.surface} · latest reasoning state {worker.executionSupervision.reviewFreshness}</p>
          <div className="healthy-planes">
            <span>Verified messages <strong>{verified}</strong></span>
            <span>Total messages <strong>{rows.length}</strong></span>
            <span>Chat link <strong>{link ? "REAL LOCATOR" : "MISSING / PLACEHOLDER"}</strong></span>
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

    <section className="change-summary secondary-history" aria-label="Internal supervisor routing queue">
      <div className="summary-title"><span className="scan-icon">⇢</span><p className="eyebrow">INTERNAL SUPERVISOR ROUTES</p></div>
      <p>Pre-action gate requests appear here before a worker may form methodology, priority, spending, proposal, or consequential-tradeoff decisions. A queued item blocks that worker action and never asks the owner to relay it.</p>
      {routeRows.length === 0
        ? <p className="empty-channel">No pre-action supervisor route packets are recorded.</p>
        : routeRows.slice(0, 20).map((row) => {
          const locator = directory.entries.find((entry) => entry.chatId === row.packet.destinationChatId)?.url ?? null;
          return <div className="gap-callout" key={row.event.eventId}>
            <span className="field-label">{row.packet.providerDeliveryState.replaceAll("_", " ")}</span>
            <p><strong>{row.worker.name}</strong> · blocked/routed action {row.packet.actionBlockedOrRouted.replaceAll("_", " ")}</p>
            <p>{row.packet.factualPacket.exactFactualState}</p>
            <p><strong>Decision requested:</strong> {row.packet.factualPacket.decisionRequested}</p>
            <code>{row.packet.requestId} · {row.packet.destinationChatId} · {formatMessageTimestamp(row.packet.queuedAt).absolute}</code>
            {locator && <a href={locator} target="_blank" rel="noreferrer">Open destination chat →</a>}
          </div>;
        })}
    </section>

    <section className="change-summary secondary-history">
      <div className="summary-title"><span className="scan-icon">⌁</span><p className="eyebrow">INTERFACE TRUTH</p></div>
      <p>This page now exposes configured overall and specialist chat locators, source-bound transcripts, and the internal routing queue. It does not pretend to be an inline ChatGPT composer. Owner→worker messaging is a separate channel on each worker page. Automatic two-way ChatGPT messaging still requires a registered provider/browser relay that returns exact chat and message receipts. Until that relay exists, routes remain visibly queued rather than being bounced to the owner.</p>
      <Link href="/">Return to fleet dashboard →</Link>
    </section>

    <footer><span>Source-bound reasoning only · configured locators remain labeled</span><span>Projection updated {formatDisplayTime(snapshot.generatedAt)}</span></footer>
  </main>;
}

function isReasoningEvent(event: StoredEvent): event is ReasoningEvent {
  return event.data.type === "reasoning_message_recorded";
}

function isWorkerMessageEvent(event: StoredEvent): event is WorkerMessageEvent {
  return event.data.type === "worker_message_recorded";
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

function parseInternalRoutePacket(body: string): InternalRoutePacket | null {
  if (!body.startsWith(internalRoutePrefix)) return null;
  try {
    const value = JSON.parse(body.slice(internalRoutePrefix.length)) as Partial<InternalRoutePacket>;
    if (typeof value.requestId !== "string" || typeof value.actionBlockedOrRouted !== "string"
      || typeof value.destination !== "string" || typeof value.destinationChatId !== "string"
      || value.providerDeliveryState !== "QUEUED_FOR_PROVIDER_RELAY" || typeof value.queuedAt !== "string"
      || !value.factualPacket || typeof value.factualPacket.taskId !== "string"
      || typeof value.factualPacket.exactFactualState !== "string" || typeof value.factualPacket.decisionRequested !== "string") return null;
    return value as InternalRoutePacket;
  } catch {
    return null;
  }
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
