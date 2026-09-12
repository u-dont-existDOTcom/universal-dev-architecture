"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkerState } from "@/lib/projection";
import type { StoredEvent } from "@/lib/schema";
import { formatMessageTimestamp } from "@/lib/message-time";
import { StatusDot } from "./StatusDot";
import type { OperatorStatusProjection, OperatorSupervisorStatus } from "@/lib/operator-status-contract";

interface Snapshot {
  workers: WorkerState[];
  generatedAt: string;
}

interface ConfiguredSupervisorChat {
  scope: "PROJECT_MANAGER" | "SPECIALIST";
  supervisorId: string;
  chatId: string;
  label: string;
  url: string;
  workerId: string | null;
  requiredApp: string;
  consumerControls: {
    modelVisibleLabel: "GPT-5.6 Sol";
    thinkingControlLabel: "Thinking effort";
    thinkingVisibleLabel: "Extra High";
    thinkingOrdinal: "4 of 5";
    accountPlanLabel: "Pro";
    accountPlanRole: "PROVENANCE_METADATA_ONLY";
    accountPlanIsReasoningMode: false;
  };
  bootstrapCapability: { chatId: string; url: string; challengeId: string };
  locatorVerification: "OWNER_CONFIGURED_UNVERIFIED";
}

interface ConfiguredSupervisorDirectory {
  configurationState: "MISSING" | "CONFIGURED" | "INVALID";
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
  destinationSupervisorId: string;
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
  entries: [],
  error: null,
};
const internalRoutePrefix = "MISSION_CONTROL_INTERNAL_SUPERVISOR_ROUTE_V1\n";
const providerSessionRoutePrefixes = [
  "MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V4\n",
  "MISSION_CONTROL_INTERNAL_SUPERVISORY_CYCLE_V3\n",
] as const;

export function SupervisionConsole() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [directory, setDirectory] = useState<ConfiguredSupervisorDirectory>(emptyDirectory);
  const [operatorStatus, setOperatorStatus] = useState<OperatorStatusProjection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [snapshotResponse, directoryResponse, operatorResponse] = await Promise.all([
        fetch("/api/workers", { cache: "no-store" }),
        fetch("/api/supervisor-directory", { cache: "no-store" }),
        fetch("/api/operator-status", { cache: "no-store" }),
      ]);
      if (!snapshotResponse.ok || !operatorResponse.ok) throw new Error("supervision snapshot failed");
      setSnapshot(await snapshotResponse.json());
      setOperatorStatus(await operatorResponse.json());
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

  if (!snapshot || !operatorStatus) {
    return <main className="shell"><div className="loading-panel">Loading supervision channels…</div></main>;
  }

  const projectManagerRows = messageRows.filter((row) => row.event.data.surface_role === "PROJECT_MANAGER");
  const latestProjectManager = latestMessage(projectManagerRows);
  const configuredProjectManager = directory.entries.find((entry) => entry.scope === "PROJECT_MANAGER") ?? null;
  const projectManagerStatus = operatorStatus.supervisors.find((entry) => entry.scope === "PROJECT_MANAGER") ?? null;
  const workerProjectManagerLink = realSupervisorLink(snapshot.workers.find((worker) => worker.id === "mission-control-live-slice"));
  const projectManagerLink = latestProjectManager?.event.data.immutable_provider_locator
    ?? configuredProjectManager?.url
    ?? workerProjectManagerLink;
  const projectManagerSourceBound = projectManagerStatus?.sourceBound === true || Boolean(latestProjectManager?.event.data.immutable_provider_locator
    && latestProjectManager.event.data.provenance_status === "VERIFIED");
  const projectManagerReachable = projectManagerStatus?.reachable === true;
  const verifiedProjectManagerMessages = projectManagerRows.filter((row) => row.event.data.provenance_status === "VERIFIED").length;
  const configuredSpecialists = directory.entries.filter((entry) => entry.scope === "SPECIALIST");

  return <main className="shell detail-shell">
    <header className="topbar">
      <div className="brand-row">
        <div className="brand-mark">MC</div>
        <div><p className="eyebrow">SUPERVISION CONTROL PLANE</p><h1>Project Manager and specialist chats</h1></div>
      </div>
      <div className="live-state">
        <StatusDot health={trafficForProvider(operatorStatus.providerRelayState)} pulse={operatorStatus.providerRelayState === "HEALTHY"} />
        <span>PROVIDER TRANSPORT {operatorStatus.providerRelayState}</span>
      </div>
    </header>

    {error && <div className="error-banner">{error}</div>}

    <TransportSummary status={operatorStatus} />

    <section className={`worker-connection ${projectManagerReachable ? "connected" : projectManagerLink ? "offline_configured" : "fixture_only"}`} aria-label="Overall Project Manager channel">
      <div><span className="field-label">PERMANENT PROJECT MANAGER CHAT</span><strong>{projectManagerReachable ? projectManagerSourceBound ? "REGISTERED · REACHABLE · SOURCE BOUND" : "REGISTERED · REACHABLE" : projectManagerLink ? "REGISTERED · REACHABILITY UNAVAILABLE" : "NOT REGISTERED"}</strong></div>
      <p>{projectManagerReachable
        ? projectManagerSourceBound
          ? "Authenticated authority and browser health are current, and Mission Control has exact source-binding evidence for this chat."
          : "Authenticated provider transport is healthy, but no exact source-binding receipt has been recorded for this chat."
        : "Mission Control will not infer reachability from a saved chat link. Fresh authenticated provider/browser evidence is required."}</p>
      <code>{verifiedProjectManagerMessages} verified Project Manager message{verifiedProjectManagerMessages === 1 ? "" : "s"} · {projectManagerRows.length} total · route {projectManagerStatus?.latestRouteState.replaceAll("_", " ") ?? "unknown"} · latest reasoning {reasoningAge(projectManagerStatus)}</code>
      {latestProjectManager && <MessageSummary row={latestProjectManager} />}
      {projectManagerLink
        ? <a href={projectManagerLink} target="_blank" rel="noreferrer">Open overall Project Manager chat →</a>
        : <strong className="bad">CHATGPT TRANSPORT / CHAT ID MISSING</strong>}
    </section>

    {configuredSpecialists.length > 0 && <section className="detail-grid" aria-label="Configured specialist chat locators">
      {configuredSpecialists.map((entry) => {
        const live = operatorStatus.supervisors.find((candidate) => candidate.supervisorId === entry.supervisorId) ?? null;
        const matchingRows = messageRows.filter((row) => row.event.data.surface_role === "SUPERVISOR"
          && (row.event.data.stable_supervisor_id === entry.supervisorId
            || !row.event.data.stable_supervisor_id && row.event.data.immutable_provider_locator === entry.url));
        const latest = latestMessage(matchingRows);
        const verified = matchingRows.filter((row) => row.event.data.provenance_status === "VERIFIED").length;
        const queued = routeRows.filter((row) => row.packet.destinationSupervisorId === entry.supervisorId).length;
        return <article key={entry.supervisorId} className="healthy-card">
          <div className="healthy-card-head">
            <div><StatusDot health={live?.reachable ? "GREEN" : live?.registered ? "YELLOW" : "UNKNOWN"} /><h3>{entry.label}</h3></div>
            <span>{live?.reachable ? live.sourceBound ? "REGISTERED · REACHABLE · SOURCE BOUND" : "REGISTERED · REACHABLE" : "REGISTERED · REACHABILITY UNAVAILABLE"}</span>
          </div>
          <p>{entry.workerId ? `Assigned to ${workerLabel(snapshot.workers, entry.workerId)}` : "Specialist supervisor"} · provider transport {operatorStatus.providerRelayState.toLowerCase()}</p>
          <div className="healthy-planes">
            <span>Verified messages <strong>{verified}</strong></span>
            <span>Total messages <strong>{matchingRows.length}</strong></span>
            <span>Queued routes <strong>{queued}</strong></span>
            <span>Latest reasoning <strong>{reasoningAge(live)}</strong></span>
          </div>
          {latest ? <MessageSummary row={latest} /> : <p className="empty-channel">No verified source-bound reasoning message is currently recorded for this specialist.</p>}
          <div className="detail-actions"><a href={entry.bootstrapCapability.url} target="_blank" rel="noreferrer">Open specialist chat →</a></div>
        </article>;
      })}
    </section>}

    <section className="detail-grid" aria-label="Worker-bound specialist supervision chats">
      {snapshot.workers.map((worker) => {
        const rows = messageRows.filter((row) => row.worker.id === worker.id && row.event.data.surface_role === "SUPERVISOR");
        const latest = latestMessage(rows);
        const configured = directory.entries.find((entry) => entry.scope === "SPECIALIST" && entry.workerId === worker.id) ?? null;
        const live = configured ? operatorStatus.supervisors.find((entry) => entry.supervisorId === configured.supervisorId) ?? null : null;
        const link = latest?.event.data.immutable_provider_locator ?? configured?.url ?? realSupervisorLink(worker);
        const verified = rows.filter((row) => row.event.data.provenance_status === "VERIFIED").length;
        const state = workflowState(worker, routeRows.some((row) => row.worker.id === worker.id));
        return <article key={worker.id} className="healthy-card">
          <div className="healthy-card-head">
            <div><StatusDot health={live?.reachable ? "GREEN" : link ? "YELLOW" : "UNKNOWN"} /><h3>{worker.name}</h3></div>
            <span>{state}</span>
          </div>
          <p>Current supervisor: {configured?.label ?? worker.executionSupervision.surface} · execution {worker.executionSupervision.codexExecutionState.replaceAll("_", " ").toLowerCase()}</p>
          <div className="healthy-planes">
            <span>Verified messages <strong>{verified}</strong></span>
            <span>Total messages <strong>{rows.length}</strong></span>
            <span>Chat reachability <strong>{live?.reachable ? "REACHABLE" : "UNAVAILABLE"}</strong></span>
            <span>Owner decision <strong>{worker.correction.ownerActionType.replaceAll("_", " ")}</strong></span>
          </div>
          {latest ? <MessageSummary row={latest} /> : <p className="empty-channel">No verified source-bound specialist reasoning is recorded; summaries and saved titles do not count.</p>}
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
          const locator = directory.entries.find((entry) => entry.supervisorId === row.packet.destinationSupervisorId)?.bootstrapCapability.url ?? null;
          return <div className="gap-callout" key={row.event.eventId}>
            <span className="field-label">{row.packet.providerDeliveryState.replaceAll("_", " ")}</span>
            <p><strong>{row.worker.name}</strong> · blocked/routed action {row.packet.actionBlockedOrRouted.replaceAll("_", " ")}</p>
            <p>{row.packet.factualPacket.exactFactualState}</p>
            <p><strong>Decision requested:</strong> {row.packet.factualPacket.decisionRequested}</p>
            <code>{row.packet.requestId} · {row.packet.destinationSupervisorId} · {formatMessageTimestamp(row.packet.queuedAt).absolute}</code>
            {locator && <a href={locator} target="_blank" rel="noreferrer">Open bootstrap capability chat →</a>}
          </div>;
        })}
    </section>

    <section className="change-summary secondary-history">
      <div className="summary-title"><span className="scan-icon">⌁</span><p className="eyebrow">INTERFACE TRUTH</p></div>
      <p>Provider transport, reachability, source binding, route state, and reasoning age above come from authenticated Mission Control authority and expiring VPS health evidence. Saved chat links alone never count healthy. Owner→worker messaging remains a separate channel on each worker page, and missing or stale evidence fails unavailable rather than inventing success.</p>
      <Link href="/">Return to fleet dashboard →</Link>
    </section>

    <footer><span>Source-bound reasoning only · configured locators remain labeled</span><span>Projection updated {formatDisplayTime(snapshot.generatedAt)}</span></footer>
  </main>;
}

function TransportSummary({ status }: { status: OperatorStatusProjection }) {
  const minimum = status.pacing.configuredMinimumIntervalMs === null
    ? "unavailable"
    : `${Math.round(status.pacing.configuredMinimumIntervalMs / 1_000)} seconds`;
  return <section className="channel-fleet-summary supervision-health" aria-label="Authenticated supervision transport health">
    <div><span>Active VPS</span><strong>{status.activeHostLabel ?? "Unavailable"}</strong></div>
    <div><span>Authority</span><strong>{status.authority.state}</strong></div>
    <div><span>Provider transport</span><strong>{status.providerRelayState}</strong></div>
    <div><span>Queue depth</span><strong>{status.authority.queueDepth}</strong></div>
    <div><span>Minimum spacing</span><strong>{minimum}</strong></div>
    <div><span>Pacing violations</span><strong>{status.pacing.violationsBelowConfiguredMinimum ?? "Unavailable"}</strong></div>
    <div><span>Rate limit</span><strong>{status.pacing.rateLimitState.replaceAll("_", " ")}</strong></div>
    <div><span>Ledger</span><strong>{status.authority.ledgerIntegrity}</strong></div>
  </section>;
}

function trafficForProvider(state: OperatorStatusProjection["providerRelayState"]): "GREEN" | "YELLOW" | "UNKNOWN" {
  return state === "HEALTHY" ? "GREEN" : state === "DEGRADED" ? "YELLOW" : "UNKNOWN";
}

function reasoningAge(status: OperatorSupervisorStatus | null): string {
  return status?.latestReasoningAt ? formatMessageTimestamp(status.latestReasoningAt).relative : "not yet returned";
}

function workerLabel(workers: WorkerState[], workerId: string): string {
  return workers.find((worker) => worker.id === workerId)?.name ?? "a currently offline worker";
}

function workflowState(worker: WorkerState, hasPendingRoute: boolean): string {
  if (worker.status === "done") return "FINISHED";
  if (worker.correction.ownerActionType !== "NONE") return "WAITING FOR JOEL";
  if (hasPendingRoute || worker.executionSupervision.pendingReasoningReview) return "WAITING FOR SUPERVISOR";
  if (worker.correction.evidenceSubmitted && !worker.correction.correctionVerified) return "AWAITING EVIDENCE REVIEW";
  if (worker.connection.state !== "CONNECTED" || worker.executionSupervision.codexExecutionState === "PARKED") return "PARKED";
  return "EXECUTING";
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
  const providerSessionPrefix = providerSessionRoutePrefixes.find((candidate) => body.startsWith(candidate));
  const providerSession = Boolean(providerSessionPrefix);
  const prefix = providerSessionPrefix ?? internalRoutePrefix;
  if (!body.startsWith(prefix)) return null;
  try {
    const raw = JSON.parse(body.slice(prefix.length)) as Partial<InternalRoutePacket> & { destinationChatId?: string };
    const value = { ...raw, destinationSupervisorId: providerSession ? raw.destinationSupervisorId : raw.destinationChatId };
    if (typeof value.requestId !== "string" || typeof value.actionBlockedOrRouted !== "string"
      || typeof value.destination !== "string" || typeof value.destinationSupervisorId !== "string"
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
