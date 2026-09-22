"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkerState } from "@/lib/projection";
import { StatusDot } from "./StatusDot";
import { SupervisorLink } from "./SupervisorLink";
import { FleetQueue } from "./WorkerChannel";
import type { WorkQueueItemProjection } from "@/lib/worker-channel";
import { ownerMutationHeaders } from "@/lib/browser-auth";
import { readDashboardData, validTaskSnapshot, validOperatorSnapshot, snapshotFailure, orderedOpenQueue, workerDisposition, type SnapshotFailure } from "@/lib/owner-view";
import type { LiveHealthState, OperatorStatusProjection } from "@/lib/operator-status-contract";

interface Snapshot {
  workers: WorkerState[];
  summary: string;
  latestEventId: number;
  generatedAt: string;
  fleetQueue: WorkQueueItemProjection[];
  channelSummary: {
    staleDirections: number;
    awaitingDelivery: number;
    awaitingAcknowledgement: number;
    deliveryFailures: number;
    openBlockers: number;
    openProposals: number;
  };
  connectionSummary: { connected: number; offlineConfigured: number; fixtureOnly: number; suppressedFixtureOnly: number };
  fleetSupervisor: {
    defaultCadenceMs: number;
    activeCount: number;
    watches: Array<{
      projectId: string; taskId: string; worker: string; state: "ACTIVE" | "PAUSED" | "TERMINAL" | "DISABLED";
      cadenceMs: number; nextTickAt: string | null; lastTickAt: string | null; lastTrigger: string | null;
      lastResult: string | null; notificationDisposition: string; notificationReason: string | null;
    }>;
  };
  liveSource: {
    worker: string;
    source_kind: "READ_ONLY_FILE_GIT";
    source_path: string;
    observed_at: string;
    file_modified_at: string;
    content_sha256: string;
    branch: string;
    head: string;
    directive_id: string | null;
    receipt_id: string | null;
    phase: string;
    summary: string;
  } | null;
}

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [operatorStatus, setOperatorStatus] = useState<OperatorStatusProjection | null>(null);
  const [failures, setFailures] = useState<Record<string, SnapshotFailure>>({});
  const [loading, setLoading] = useState(true);
  const [streamError, setStreamError] = useState(false);
  const [marking, setMarking] = useState(false);
  const busy = useRef(false);
  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    const results = await Promise.allSettled([
      readDashboardData<Snapshot>("/api/workers", validTaskSnapshot),
      readDashboardData<OperatorStatusProjection>("/api/operator-status", validOperatorSnapshot),
    ]);
    const next: Record<string, SnapshotFailure> = {};
    if (results[0].status === "fulfilled") setSnapshot(results[0].value); else next.Tasks = snapshotFailure(results[0].reason);
    if (results[1].status === "fulfilled") setOperatorStatus(results[1].value); else next.Infrastructure = snapshotFailure(results[1].reason);
    setFailures(next);
    setLoading(false);
    busy.current = false;
  }, []);
  useEffect(() => {
    void load();
    const source = new EventSource("/api/events/stream");
    source.addEventListener("mission-control-event", () => void load());
    source.onopen = () => setStreamError(false);
    source.onerror = () => setStreamError(true);
    return () => source.close();
  }, [load]);
  async function markViewed() {
    setMarking(true);
    try {
      const response = await fetch("/api/viewed", { method: "POST", headers: ownerMutationHeaders() });
      if (!response.ok) throw new Error("Could not mark history viewed. Retry after reconnecting.");
      await load();
    } catch { setFailures(previous => ({ ...previous, History: { kind: "server", message: "Could not mark history viewed. Retry after reconnecting." } })); }
    finally { setMarking(false); }
  }
  const workers = snapshot?.workers ?? [];
  const decisions = workers.filter(worker => worker.correction.ownerActionType !== "NONE");
  const recommended = orderedOpenQueue(snapshot?.fleetQueue ?? []).slice(0, 3);
  const knownProjects = snapshot ? new Set([
    ...snapshot.fleetQueue.map(item => item.projectId),
    ...snapshot.fleetSupervisor.watches.map(watch => watch.projectId),
  ]).size : 0;
  const partial = Object.keys(failures).length > 0;
  return <main className="shell mission-shell owner-shell">
    <header className="topbar"><div className="brand-row"><div className="brand-mark">MC</div><div><p className="eyebrow">YOUR WORK, IN VIEW</p><h1>Mission Control</h1></div></div><button className="owner-retry" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></header>
    <DashboardNotice failures={failures} hasSnapshot={Boolean(snapshot)} loading={loading} onRetry={() => void load()} />
    {streamError && <div role="status" className="error-banner">Live updates are reconnecting. Displayed information may be stale; use Refresh to check.</div>}
    {!snapshot && loading && !partial && <div role="status" className="loading-panel">Loading your recorded work…</div>}
    {snapshot && <>
      <p className="owner-coverage">Coverage: {knownProjects} known project{knownProjects === 1 ? "" : "s"}, {workers.length} worker task{workers.length === 1 ? "" : "s"}, {snapshot.fleetSupervisor.watches.length} project watch{snapshot.fleetSupervisor.watches.length === 1 ? "" : "es"}, and {snapshot.fleetQueue.length} queue items. This view covers work reported to Mission Control; it does not claim every chat or external project is represented. Snapshot {new Date(snapshot.generatedAt).toLocaleString()} · {relativeTime(snapshot.generatedAt)}.{failures.Tasks && " Task data is last-known; current status needs checking."}</p>
      <section className="owner-section" aria-labelledby="owner-decisions"><h2 id="owner-decisions">Your decisions and actions <span>{decisions.length}</span></h2>{decisions.length ? decisions.map(worker => <article className="owner-decision" key={worker.id}><Link href={`/worker/${worker.id}`}><h3>{shortName(worker)}</h3></Link><p>{worker.correction.ownerActionText || "Action details not recorded."}</p><OwnerDecisionDetails worker={worker} /></article>) : <p className="muted">No owner action is recorded in this snapshot.{partial || streamError ? " Reporting is incomplete; this does not establish that no action is needed." : ""}</p>}</section>
      <ProjectWatchSummary supervisor={snapshot.fleetSupervisor} queue={snapshot.fleetQueue} />
      <section className="owner-section" aria-labelledby="owner-next"><h2 id="owner-next">Recommended next to review</h2><p className="muted">Stored priority P0–P3, then stored queue order. This ordering does not grant permission to start.</p>{recommended.length ? <ol className="owner-next-list">{recommended.map(item => <li key={`${item.worker}:${item.queueRevisionId}:${item.itemId}`}><a href="#recorded-queue"><strong>{item.title}</strong></a><span>{item.priority} · {item.status.replaceAll("_", " ").toLowerCase()}</span><small>{item.projectId} · {item.taskId}</small></li>)}</ol> : <p>No unfinished queue items are recorded. Worker reporting may be incomplete.</p>}</section>
      <section className="owner-section" aria-labelledby="owner-tasks"><h2 id="owner-tasks">Current tasks</h2>{workers.length ? <div className="owner-task-grid">{workers.map(worker => <OwnerTaskCard key={worker.id} worker={worker} />)}</div> : <p className="empty-live-fleet">No known tasks are available in this snapshot. This does not establish that all work is complete; worker reporting may be missing.</p>}</section>
      <div id="recorded-queue"><FleetQueue queue={snapshot.fleetQueue} /></div>
    </>}
    {operatorStatus?.overallState !== "HEALTHY" && operatorStatus && !failures.Infrastructure && <p className="error-banner">Infrastructure reporting needs attention. Delivery or updates may be affected; check the details before relying on a new worker response.</p>}
    <details className="owner-technical"><summary>Infrastructure, reporting and evidence details{failures.Infrastructure ? " · unavailable / last-known" : ""}</summary><p className="muted">Transport health does not establish task progress, owner approval or integration readiness.</p>{operatorStatus && <InfrastructureHealth status={operatorStatus} />}{snapshot && <><LiveWorkerStrip source={snapshot.liveSource} /><p>{snapshot.connectionSummary?.connected ?? 0} reporting · {snapshot.connectionSummary?.offlineConfigured ?? 0} configured offline. Known stored tasks remain visible when reporting stops.</p><section className="mission-grid">{workers.map(worker => <MissionCard key={worker.id} worker={worker} selected={false} />)}</section><section className="change-summary secondary-history"><p>{snapshot.summary}</p><button onClick={markViewed} disabled={marking}>{marking ? "Marking…" : "Mark viewed"}</button></section></>}</details>
  </main>;
}

export function DashboardNotice({ failures, hasSnapshot, loading, onRetry }: { failures: Record<string, SnapshotFailure>; hasSnapshot: boolean; loading: boolean; onRetry: () => void }) {
  if (!Object.keys(failures).length) return null;
  return <section role="alert" className="error-banner"><strong>{hasSnapshot ? "Partial / last-known view" : "Dashboard data could not be loaded"}</strong>{Object.entries(failures).map(([name, failure]) => <p key={name}>{name}: {failure.message}</p>)}<button className="owner-retry" onClick={onRetry} disabled={loading}>{loading ? "Retrying…" : "Retry"}</button></section>;
}

export function OwnerTaskCard({ worker }: { worker: WorkerState }) {
  return <article className="owner-task"><div className="owner-task-heading"><Link href={`/worker/${worker.id}`}><h3>{shortName(worker)}</h3></Link><span>{workerDisposition(worker)}</span></div><dl className="owner-four"><div><dt>Goal</dt><dd>{worker.objective.goal || "Not recorded"}</dd></div><div><dt>Where we are</dt><dd>{worker.currentStep || "Status needs checking"}</dd><dd className="muted">Latest recorded evidence: {worker.progress.latestEvidence || "Not recorded"}</dd></div><div><dt>Next needed</dt><dd>{worker.correction.directive || worker.nextSteps.join("; ") || worker.progress.requiredIntervention || "Not recorded"}</dd></div><div><dt>Your action</dt><dd>{worker.correction.ownerActionType === "NONE" ? "None recorded" : worker.correction.ownerActionText || "Action details not recorded"}</dd></div></dl><p className="owner-task-freshness">Checkpoint {relativeTime(worker.lastCheckpointAt)} · {worker.connection.state.replaceAll("_", " ").toLowerCase()}</p><Link className="owner-evidence" href={`/worker/${worker.id}`}>Open task and evidence →</Link></article>;
}

export function ProjectWatchSummary({ supervisor, queue }: { supervisor: Snapshot["fleetSupervisor"]; queue: WorkQueueItemProjection[] }) {
  const projectIds = [...new Set([...supervisor.watches.map(watch => watch.projectId), ...queue.map(item => item.projectId)])].sort();
  const dependencyLinks = queue.reduce((total, item) => total + item.dependsOn.length, 0);
  return <section className="owner-section" aria-labelledby="owner-projects">
    <h2 id="owner-projects">Projects and supervision <span>{projectIds.length}</span></h2>
    <p className="muted">Project → task/watch → worker/queue → prerequisite relationships derived from recorded Mission Control state.</p>
    <div className="owner-relationship-strip">
      <div><span>Active watches</span><strong>{supervisor.activeCount}</strong></div>
      <div><span>Dependency links</span><strong>{dependencyLinks}</strong></div>
      <div><span>Open queue items</span><strong>{queue.filter(item => !["DONE", "CANCELED", "SUPERSEDED"].includes(item.status)).length}</strong></div>
      <div><span>Default review cadence</span><strong>{formatInterval(supervisor.defaultCadenceMs)}</strong></div>
    </div>
    {projectIds.length ? <div className="owner-project-grid">{projectIds.map(projectId => {
      const watches = supervisor.watches.filter(watch => watch.projectId === projectId);
      const items = queue.filter(item => item.projectId === projectId);
      const openItems = items.filter(item => !["DONE", "CANCELED", "SUPERSEDED"].includes(item.status));
      const blocked = openItems.filter(item => ["BLOCKED", "WAITING_REVIEW"].includes(item.status) || item.dependsOn.length > 0);
      return <article className="owner-project" key={projectId}>
        <div className="owner-task-heading"><h3>{projectId}</h3><span>{watches.length ? watches.map(watch => watch.state).join(" · ") : "No active watch recorded"}</span></div>
        <p>{openItems.length} open work item{openItems.length === 1 ? "" : "s"} · {blocked.length} blocked/waiting/dependent.</p>
        {watches.length ? <ul>{watches.map(watch => <li key={`${watch.projectId}:${watch.taskId}:${watch.worker}`}><strong>{watch.taskId}</strong><span>{watch.worker} · {formatInterval(watch.cadenceMs)}</span><small>{watch.lastTickAt ? `last ${relativeTime(watch.lastTickAt)}` : "awaiting first tick"} · {watch.nextTickAt ? `next ${relativeTime(watch.nextTickAt)}` : "not scheduled"} · {watch.notificationDisposition}{watch.notificationReason ? `: ${watch.notificationReason}` : ""}</small></li>)}</ul> : <p className="muted">Queue evidence exists for this project, but no fleet-supervisor watch is recorded.</p>}
      </article>;
    })}</div> : <p>No project or queue relationships are recorded yet.</p>}
  </section>;
}

function InfrastructureHealth({ status }: { status: OperatorStatusProjection }) {
  const pacing = status.pacing;
  const latestIntervals = pacing.recentIntervalsMs.slice(-3).map(formatInterval).join(" · ") || "No interval samples";
  return <section className={`infrastructure-health ${status.overallState.toLowerCase()}`} aria-label="Infrastructure and transport health">
    <div className="infrastructure-head">
      <div><p className="eyebrow">INFRASTRUCTURE / TRANSPORT</p><h2>{status.overallState === "HEALTHY" ? "Mission Control is healthy" : status.overallState === "DEGRADED" ? "Mission Control needs attention" : "Live transport evidence is unavailable"}</h2></div>
      <strong>{status.activeHostLabel ?? "No active VPS proven"}</strong>
    </div>
    <div className="infrastructure-facts">
      <HealthFact label="Active lease" value={status.authority.activeLeaseRole ? `${status.authority.activeLeaseRole} · epoch ${status.authority.epoch ?? "unknown"}` : "Unavailable"} />
      <HealthFact label="Shared send authority" value={`${status.authority.state} · ${status.authority.writer.replaceAll("_", " ")}`} />
      <HealthFact label="Provider/browser transport" value={status.providerRelayState} />
      <HealthFact label="Shared queue" value={`${status.authority.queueDepth} pending`} />
      <HealthFact label="Last provider send" value={pacing.lastProviderSendBoundaryAt ? relativeTime(pacing.lastProviderSendBoundaryAt) : "No boundary recorded"} />
      <HealthFact label="Minimum pacing" value={pacing.configuredMinimumIntervalMs === null ? "Unavailable" : formatInterval(pacing.configuredMinimumIntervalMs)} />
      <HealthFact label="Observed intervals" value={`${pacing.minimumObservedIntervalMs === null ? "No minimum" : `minimum ${formatInterval(pacing.minimumObservedIntervalMs)}`} · recent ${latestIntervals}`} />
      <HealthFact label="Pacing violations" value={pacing.violationsBelowConfiguredMinimum === null ? "Unavailable" : String(pacing.violationsBelowConfiguredMinimum)} />
      <HealthFact label="Rate limit / cooldown" value={`${pacing.rateLimitState.replaceAll("_", " ")} · ${pacing.cooldownRemainingMs ? `${formatInterval(pacing.cooldownRemainingMs)} remaining` : "clear"}`} />
      <HealthFact label="Append-only ledger" value={status.authority.ledgerIntegrity} />
    </div>
    <div className="host-health-grid">
      {status.hosts.map((host) => <article key={host.role}>
        <div><StatusDot health={trafficForHealth(host.reportFresh && host.browserState === "HEALTHY" && host.relayWorkerState === "HEALTHY" ? "HEALTHY" : host.reportFresh ? "DEGRADED" : "UNAVAILABLE")} /><strong>{host.label}</strong><span>{host.active ? "ACTIVE" : "STANDBY"}</span></div>
        <p>Relay worker {host.relayWorkerState.toLowerCase()} · browser {host.browserState.toLowerCase()} · authority binding {host.authorityBindingState.toLowerCase()} · {host.ownedTargetCount} automation-owned target{host.ownedTargetCount === 1 ? "" : "s"}</p>
        <small>{host.reportFresh && host.observedAt ? `Authenticated report ${relativeTime(host.observedAt)}` : "No fresh authenticated report"}</small>
      </article>)}
    </div>
  </section>;
}

function HealthFact({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function LiveWorkerStrip({ source }: { source: Snapshot["liveSource"] }) {
  return <section className={`live-worker-strip ${source ? "connected" : "missing"}`} aria-label="Current live worker evidence source">
    <div><StatusDot health={source ? "GREEN" : "UNKNOWN"} pulse={Boolean(source)} /><span><b>LIVE WORKER</b>{source?.worker ?? "source not configured"}</span></div>
    {source ? <>
      <p>{source.summary}</p>
      <dl><div><dt>Source</dt><dd>Authenticated file + Git</dd></div><div><dt>Git</dt><dd>{source.branch}@{source.head.slice(0, 8)}</dd></div><div><dt>Directive / receipt</dt><dd>{source.directive_id ?? "none"} / {source.receipt_id ?? "pending"}</dd></div><div><dt>Evidence</dt><dd>{source.phase} · {relativeTime(source.observed_at)}</dd></div></dl>
    </> : <p>Set MISSION_CONTROL_LIVE_SOURCE and MISSION_CONTROL_LIVE_WORKTREE to observe the current worker read-only.</p>}
  </section>;
}

function trafficForHealth(state: LiveHealthState): "GREEN" | "YELLOW" | "UNKNOWN" {
  return state === "HEALTHY" ? "GREEN" : state === "DEGRADED" ? "YELLOW" : "UNKNOWN";
}

function formatInterval(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  const seconds = milliseconds / 1_000;
  return Number.isInteger(seconds) ? `${seconds} s` : `${seconds.toFixed(1)} s`;
}

export function MissionCard({ worker, selected }: { worker: WorkerState; selected: boolean }) {
  const evidenceTime = worker.lastCheckpointAt;
  return <article className={`mission-card ${worker.operatorState.traffic.toLowerCase()} ${selected ? "selected" : ""}`} data-worker={worker.id}>
    <div className="mission-card-head"><div><StatusDot health={worker.operatorState.traffic} pulse={worker.operatorState.traffic === "RED"} /><span><small>{worker.status.toUpperCase()} · {worker.connection.state.replaceAll("_", " ")}</small><Link href={`/worker/${worker.id}`}><h3>{shortName(worker)}</h3></Link></span></div><strong>{dispositionLabel(worker)}</strong></div>
    <div className="mission-planes"><Plane label="Worker → Contract" value={worker.workerToContractAlignment} /><Plane label="Contract → Owner" value={worker.contractToOwnerAlignment} /><Plane label="Outcome" value={worker.progress.outcomeAdvancement} /><Plane label="Strategy" value={worker.progress.strategyEfficacy} /></div>
    <div className="mission-direction"><span>LATEST OWNER DIRECTION</span><p>{worker.channel.latestDirectionBody ?? "No direction recorded in the worker channel."}</p><strong className={freshnessClass(worker.channel.freshness)}>{worker.channel.freshness.replaceAll("_", " ")}</strong><small>{worker.channel.queue.length} queued item{worker.channel.queue.length === 1 ? "" : "s"} · {worker.channel.blockers.length} blocker{worker.channel.blockers.length === 1 ? "" : "s"} · {worker.channel.proposals.length} proposal{worker.channel.proposals.length === 1 ? "" : "s"}</small></div>
    <div className="mission-decision"><div><span>EXACT PROBLEM</span><p>{worker.primaryProblemSummary ?? "No active problem statement recorded."}</p></div><div><span>CURRENT CORRECTION / NEXT ACTION</span><p>{worker.correction.directive ?? worker.progress.requiredIntervention}</p></div></div>
    <div className="mission-evidence"><span>DIRECT EVIDENCE</span><p><b>Target</b> {worker.progress.targetEvidence} <i>·</i> <b>Baseline</b> {worker.progress.baselineEvidence} <i>·</i> <b>Previous</b> {worker.progress.previousEvidence} <i>·</i> <b>Latest</b> {worker.progress.latestEvidence} <i>·</i> <b>Best</b> {worker.progress.bestEvidence}</p></div>
    <div className="mission-control-row"><div><span>STATE</span><strong>{executionPath(worker)}</strong><small>{worker.correction.statusLabel}</small></div><div><span>OWNER ACTION</span><strong>{ownerActionLabel(worker)}</strong><small>{worker.correction.ownerActionText}</small></div><div><span>REASONING / EXECUTION</span><strong>{worker.executionSupervision.surface} · PRO {worker.executionSupervision.proEscalationState.replaceAll("_", " ")}</strong><small>{worker.executionSupervision.activeDirectiveId ?? "No executable directive"} · Codex {worker.executionSupervision.codexExecutionState.replaceAll("_", " ")}{worker.id === "article-failure" ? " · replacement review PENDING" : ""}</small></div></div>
    {worker.operatorState.needsAttention && <div className="mission-lifecycle"><span>OPERATOR STATE</span><small>{worker.operatorState.reason}</small><span>NEXT REVIEW</span><small>{worker.correction.nextReviewTrigger}</small></div>}
    <div className="mission-card-foot"><span>Evidence {new Date(evidenceTime).toISOString()} · {relativeTime(evidenceTime)}</span><Link href={`/worker/${worker.id}`}>Open evidence trail →</Link></div>
  </article>;
}

function lifecycleCompact(worker: WorkerState): string {
  return `issued ${yesNo(worker.correction.directiveIssued)} · delivered ${yesNo(worker.correction.directiveDelivered)} · acknowledged ${yesNo(worker.correction.workerAcknowledged)} · started ${yesNo(worker.correction.correctionStarted)} · evidenced ${yesNo(worker.correction.evidenceSubmitted)} · verified ${yesNo(worker.correction.correctionVerified)}`;
}

function yesNo(value: boolean): string { return value ? "YES" : "NO"; }

function freshnessClass(freshness: WorkerState["channel"]["freshness"]): string {
  if (freshness === "CURRENT" || freshness === "NO_DIRECTION") return "good";
  if (freshness === "DELIVERY_FAILED") return "bad";
  return "warn";
}

function shortName(worker: WorkerState): string {
  return worker.name.split(" · ")[0];
}

function dispositionLabel(worker: WorkerState): string {
  if (worker.progress.strategyEfficacy === "EXHAUSTED" && !worker.progress.sameStrategyContinuationAllowed) return "RED · PARKED — NO VALID STRATEGY";
  if (["FAILED", "REPLACEMENT_REQUIRED"].includes(worker.progress.strategyEfficacy) && !worker.progress.sameStrategyContinuationAllowed) return "RED · PARKED — REPLACEMENT REQUIRED";
  if (worker.channel.freshness !== "CURRENT" && worker.channel.freshness !== "NO_DIRECTION") return worker.operatorState.label;
  return workerDisposition(worker);
}

function executionPath(worker: WorkerState): string {
  if (worker.progress.strategyEfficacy === "EXHAUSTED" && !worker.progress.sameStrategyContinuationAllowed) return "PARKED_NO_VALID_STRATEGY · strategy authorization NO_VALID_STRATEGY";
  if (worker.executionSupervision.codexExecutionState === "PARKED") return "PARKED · same strategy prohibited";
  return workerDisposition(worker);
}

export function AttentionCard({ worker }: { worker: WorkerState }) {
  const topEvidence = worker.activeFindings.flatMap((finding) => finding.evidenceRefs).slice(0, 3);
  return (
    <article className={`attention-card ${worker.overallTraffic.toLowerCase()}`}>
      <div className="card-health-line" />
      <div className="attention-card-head">
        <div className="worker-title-line"><StatusDot health={worker.overallTraffic} pulse={worker.overallTraffic === "RED"} /><div><p className="eyebrow">{worker.status.toUpperCase()} · {worker.activeFindings.length} MATERIAL FINDING{worker.activeFindings.length === 1 ? "" : "S"}</p><Link href={`/worker/${worker.id}`}><h3>{worker.name}</h3></Link></div></div>
        <div className="verdict-stack"><span className={`verdict-badge ${worker.overallTraffic.toLowerCase()}`}>{verdictLabel(worker)}</span><span>{worker.overallTraffic} overall</span></div>
      </div>

      <div className="plane-row">
        <Plane label="Worker → Contract" value={worker.workerToContractAlignment} />
        <Plane label="Contract → Owner" value={worker.contractToOwnerAlignment} />
        <Plane label="Outcome progress" value={worker.progress.outcomeAdvancement} />
        <Plane label="Strategy" value={worker.progress.strategyEfficacy} />
        <Plane label="Verification" value={verificationLabel(worker)} />
        <Plane label="Freshness" value={worker.terminal.reconciliationFreshness} />
      </div>

      <div className="problem-block">
        <span className="block-kicker">WHAT IS WRONG</span>
        <h4>{worker.primaryProblemSummary ?? "No plain-language problem statement recorded."}</h4>
        <p>{worker.whyItMatters}</p>
        {topEvidence.length > 0 && <ul className="evidence-points">{topEvidence.map((item) => <li key={item}>{formatEvidence(item)}</li>)}</ul>}
        <div className="reason-codes"><span className="field-label">REASON CODES</span>{worker.activeFindings.flatMap((finding) => finding.reasonCodes).map((code) => <code key={code}>{code}</code>)}</div>
      </div>

      <div className="correction-block">
        <div className="correction-copy">
          <span className="block-kicker">{worker.correction.directiveIssued ? "CORRECTIVE DIRECTIVE" : "REQUIRED RESPONSE"}</span>
          <p>{worker.correction.directive ?? "No correction has been prepared."}</p>
        </div>
        <div className="correction-state">
          <span className="block-kicker">CORRECTION STATUS</span>
          <strong>{worker.correction.statusLabel}</strong>
          <Lifecycle worker={worker} />
        </div>
      </div>

      <div className="operator-row">
        <div><span className="block-kicker">NEXT REVIEW</span><strong>{worker.correction.nextReviewTrigger}</strong></div>
        <div><span className="block-kicker">CURRENT PATH</span><strong>{continuationLabel(worker)}</strong><small>Recheck: {worker.correction.continuationPolicy.recheck_trigger}</small></div>
        <div className={worker.correction.ownerActionType === "NONE" ? "owner-none" : "owner-needed"}><span className="block-kicker">OWNER ACTION</span><strong>{ownerActionLabel(worker)}</strong><small>{worker.correction.ownerActionText}</small><OwnerDecisionDetails worker={worker} /></div>
      </div>

      <TaskControlState worker={worker} />

      <div className="attention-card-foot">
        <span>Reasoning supervisor: {worker.executionSupervision.surface} · {worker.executionSupervision.chatEpoch ?? "epoch missing"}</span>
        <span>Directive: {worker.executionSupervision.activeDirectiveId ?? "MISSING"} · {worker.executionSupervision.directiveStatus}</span>
        <span>Codex: {worker.executionSupervision.codexExecutionState.replaceAll("_", " ")}</span>
        <span>Receipt: {worker.executionSupervision.latestReceiptId ?? "none"} · review {worker.executionSupervision.pendingReasoningReview ? "PENDING" : worker.executionSupervision.reviewFreshness}</span>
      </div>

      <div className="attention-card-foot">
        <span>Last meaningful checkpoint {relativeTime(worker.lastCheckpointAt)}</span>
        <span>Claim: {worker.terminal.completionClaimType.replaceAll("_", " ")}</span>
        <span className="diagnostic-meta">Diagnostic index {worker.alignment}/100 · {worker.activeFindings.length} active finding{worker.activeFindings.length === 1 ? "" : "s"}</span>
        <Link href={`/worker/${worker.id}`}>Evidence + decision trail →</Link>
      </div>
    </article>
  );
}

export function HealthyCard({ worker }: { worker: WorkerState }) {
  return (
    <article className="healthy-card">
      <div className="healthy-card-head"><div><StatusDot health="GREEN" /><Link href={`/worker/${worker.id}`}><h3>{worker.name}</h3></Link></div><span>{worker.status}</span></div>
      <p>{worker.currentStep}</p>
      <div className="healthy-planes">
        <span>Worker → Contract <strong>{worker.workerToContractAlignment}</strong></span>
        <span>Contract → Owner <strong>{worker.contractToOwnerAlignment}</strong></span>
        <span>Outcome <strong>{worker.progress.outcomeAdvancement.replaceAll("_", " ")}</strong></span>
        <span>Strategy <strong>{worker.progress.strategyEfficacy.replaceAll("_", " ")}</strong></span>
      </div>
      <TaskControlState worker={worker} />
      <SupervisorLink url={worker.supervisorChatUrl} label={worker.supervisorChatLabel} placeholder={worker.supervisorChatIsPlaceholder} />
      <Link className="healthy-evidence-link" href={`/worker/${worker.id}`}>Evidence + decision trail →</Link>
    </article>
  );
}

function TaskControlState({ worker }: { worker: WorkerState }) {
  const supportingWork = worker.progress.supportingWork.length
    ? worker.progress.supportingWork.map((item) => `${item.classification.replaceAll("_", " ")}: ${item.summary}`).join(" · ")
    : "No supporting work recorded.";
  const reviewAge = worker.executionSupervision.lastReviewAt ? relativeTime(worker.executionSupervision.lastReviewAt) : "missing";
  return (
    <div className="task-control-grid" aria-label={`${worker.name} complete task control state`}>
      <ControlFact label="Owner outcome target" value={worker.progress.targetEvidence} />
      <ControlFact label="Owner outcome gap" value={worker.ownerOutcome.currentGap} />
      <ControlFact label="Latest direct evidence" value={worker.progress.latestEvidence} />
      <ControlFact label="Best direct evidence" value={worker.progress.bestEvidence} />
      <ControlFact label="Active strategy" value={`${worker.progress.strategyId ?? "MISSING"} · ${worker.progress.strategyEfficacy.replaceAll("_", " ")}`} />
      <ControlFact label="Supporting work" value={supportingWork} />
      <ControlFact label="Next decision-changing measurement / intervention" value={`${worker.progress.nextDecisionTrigger} · ${worker.progress.requiredIntervention}`} />
      <ControlFact label="Reasoning review" value={`${worker.executionSupervision.surface} · session ${worker.executionSupervision.sessionId ?? "missing"} · chat ${worker.executionSupervision.chatEpoch ?? "missing"} · reviewed ${reviewAge} · ${worker.executionSupervision.reviewFreshness}`} />
      <ControlFact label="Active directive" value={`${worker.executionSupervision.activeDirectiveId ?? "MISSING"} · ${worker.executionSupervision.directiveStatus} · ${worker.executionSupervision.directiveObjective}`} />
      <ControlFact label="Codex execution" value={worker.executionSupervision.codexExecutionState.replaceAll("_", " ")} />
      <ControlFact label="Stop / review boundary" value={`Stop: ${worker.executionSupervision.stopBoundary.join("; ") || "none recorded"} · Review: ${worker.progress.nextDecisionTrigger}`} />
      <ControlFact label="Execution receipt / claim" value={`${worker.executionSupervision.latestReceiptId ?? "none"} · ${worker.executionSupervision.receiptClaim} · independent review ${worker.executionSupervision.pendingReasoningReview ? "PENDING" : worker.executionSupervision.reviewFreshness}`} />
      <ControlFact label="Pro escalation" value={worker.executionSupervision.proEscalationState.replaceAll("_", " ")} />
      <ControlFact label="Owner action" value={`${worker.correction.ownerActionType.replaceAll("_", " ")} · ${worker.correction.ownerActionText}`} />
      <ControlFact label="Next review" value={worker.correction.nextReviewTrigger} />
    </div>
  );
}

function ControlFact({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><p>{value}</p></div>;
}

function Lifecycle({ worker }: { worker: WorkerState }) {
  const steps = [
    ["Issued", worker.correction.directiveIssued],
    ["Delivered", worker.correction.directiveDelivered],
    ["Acknowledged", worker.correction.workerAcknowledged],
    ["Started", worker.correction.correctionStarted],
    ["Evidenced", worker.correction.evidenceSubmitted],
    ["Verified", worker.correction.correctionVerified],
  ] as const;
  return <div className="lifecycle" aria-label="Correction lifecycle">{steps.map(([label, complete], index) => <span key={label} className={complete ? "complete" : index === steps.findIndex(([, value]) => !value) ? "current" : "pending"}><i>{complete ? "✓" : index + 1}</i>{label}</span>)}</div>;
}

function Plane({ label, value }: { label: string; value: string }) {
  const tone = /RED|DIVERGED|FAIL/.test(value) ? "bad" : /YELLOW|PARTIAL|UNKNOWN|MISSING/.test(value) ? "warn" : "good";
  return <div><span>{label}</span><strong className={tone}>{value.replaceAll("_", " ")}</strong></div>;
}

function Count({ value, label, tone }: { value: number; label: string; tone: string }) {
  return <div className={`queue-count ${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function OperatorFact({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className={`operator-fact ${tone}`}><span>{label}</span><p>{value}</p></div>;
}

function verdictLabel(worker: WorkerState): string {
  if (["FAILED", "EXHAUSTED", "REPLACEMENT_REQUIRED"].includes(worker.progress.strategyEfficacy)) return "STRATEGY REPLACEMENT";
  if (worker.progress.outcomeAdvancement === "REGRESSING") return "OUTCOME REGRESSING";
  if (worker.correction.ownerActionType !== "NONE" && worker.overallTraffic === "GREEN") return "OWNER DECISION";
  return worker.verdict.replaceAll("_", " ");
}

function verificationLabel(worker: WorkerState): string {
  if (worker.correction.correctionVerified) return "VERIFIED";
  if (worker.correction.evidenceSubmitted) return "PENDING";
  if (worker.tests.failing > 0) return "FAIL";
  return worker.sourceReceipt.freshness === "CURRENT" ? "CURRENT" : "PARTIAL";
}

function ownerActionLabel(worker: WorkerState): string {
  return worker.correction.ownerActionType === "NONE"
    ? "NONE"
    : worker.correction.ownerActionType.replaceAll("_", " ");
}

function OwnerDecisionDetails({ worker }: { worker: WorkerState }) {
  const action = worker.correction.ownerAction;
  if (action.kind !== "DECISION_REQUIRED") return null;
  return <div className="owner-decision-packet"><p>{action.decision_context}</p><strong>{action.decision_question}</strong>{action.options.map((option) => <div key={option.option_id}><b>{option.label}</b><span>Benefits: {option.benefits.join("; ")}</span><span>Drawbacks: {option.drawbacks.join("; ")}</span><span>Consequences: {option.downstream_consequences.join("; ")}</span></div>)}<p>Recommendation: {action.recommendation_option_id} — {action.recommendation_reasoning}</p><p>Default if unanswered: {action.default_if_no_decision}</p><small>Full Pro analysis: {action.pro_analysis_ref}</small></div>;
}

function continuationLabel(worker: WorkerState): string {
  const policy = worker.correction.continuationPolicy;
  if (policy.mode === "UNKNOWN") return "UNKNOWN — PAUSE AND REPAIR OBSERVABILITY";
  if (policy.mode === "PAUSE_ALL") return "UNSAFE — PAUSE ALL WORK";
  if (policy.mode === "CONTINUE_UNRESTRICTED") return "SAFE — CONTINUE";
  if (policy.preconditions.length > 0) return `UNSAFE — STOP; AFTER ${policy.preconditions.join("; ")}, SAFE WITHIN ${policy.allowed_scope.join(", ")}`;
  return `SAFE WITHIN ${policy.allowed_scope.join(", ")}`;
}

function formatEvidence(value: string): string {
  return value.replaceAll(":", " · ").replaceAll("=", " = ");
}

function relativeTime(value: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Not recorded";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
