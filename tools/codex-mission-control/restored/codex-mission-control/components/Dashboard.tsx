"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkerState } from "@/lib/projection";
import { StatusDot } from "./StatusDot";
import { SupervisorLink } from "./SupervisorLink";
import { FleetQueue } from "./WorkerChannel";
import type { WorkQueueItemProjection } from "@/lib/worker-channel";
import { ownerMutationHeaders } from "@/lib/browser-auth";

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
  connectionSummary: { connected: number; offlineConfigured: number; fixtureOnly: number };
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
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState("article-failure");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/workers", { cache: "no-store" });
      if (!response.ok) throw new Error("Dashboard snapshot failed");
      setSnapshot(await response.json());
      setError(null);
    } catch {
      setError("Mission Control could not reach its local daemon.");
    }
  }, []);

  useEffect(() => {
    void load();
    const source = new EventSource("/api/events/stream");
    source.addEventListener("mission-control-event", () => void load());
    source.onerror = () => setError("Live updates are reconnecting…");
    return () => source.close();
  }, [load]);

  const workers = useMemo(() => {
    const order = ["mission-control-live-slice", "article-failure", "innersignal-review", "human-design-governance"];
    return [...(snapshot?.workers ?? [])].sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
  }, [snapshot]);

  async function markViewed() {
    setMarking(true);
    await fetch("/api/viewed", { method: "POST", headers: ownerMutationHeaders() });
    await load();
    setMarking(false);
  }

  if (!snapshot) return <main className="shell"><div className="loading-panel">Loading mission telemetry…</div></main>;
  return (
    <main className="shell mission-shell">
      <header className="topbar">
        <div className="brand-row">
          <div className="brand-mark">MC</div>
          <div>
            <p className="eyebrow">OWNER ATTENTION QUEUE</p>
            <h1>Codex Mission Control</h1>
          </div>
        </div>
        <div className="live-state"><StatusDot health="GREEN" pulse /><span>LIVE</span><span className="muted">daemon + SSE</span></div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      <LiveWorkerStrip source={snapshot.liveSource} />

      <div className="mission-heading">
        <div><p className="eyebrow">USER-VISIBLE VERTICAL SLICE · ISSUE #47</p><h2>Who is advancing, parked, or safe to continue?</h2></div>
        <span>{workers.filter((worker) => worker.operatorState.needsAttention).length} need attention · owner actions {workers.filter((worker) => worker.correction.ownerActionType !== "NONE").length}</span>
      </div>

      <nav className="scenario-index" aria-label="Worker scenarios">
        {workers.map((worker) => <button key={worker.id} className={selectedWorkerId === worker.id ? "selected" : ""} onClick={() => setSelectedWorkerId(worker.id)}><StatusDot health={worker.operatorState.traffic} /><span>{shortName(worker)}</span><strong>{dispositionLabel(worker)}</strong><small>Owner: {ownerActionLabel(worker)}</small></button>)}
      </nav>

      <section className="mission-grid" aria-label="All-worker current control projection">
        {workers.map((worker) => <MissionCard key={worker.id} worker={worker} selected={selectedWorkerId === worker.id} />)}
      </section>

      <section className="channel-fleet-summary" aria-label="Fleet communication status">
        <div><span>Workers connected</span><strong>{snapshot.connectionSummary.connected}</strong></div>
        <div><span>Offline configured</span><strong>{snapshot.connectionSummary.offlineConfigured}</strong></div>
        <div><span>Fixture only</span><strong>{snapshot.connectionSummary.fixtureOnly}</strong></div>
        <div><span>Dashboard behind owner</span><strong>{snapshot.channelSummary.staleDirections}</strong></div>
        <div><span>Awaiting delivery</span><strong>{snapshot.channelSummary.awaitingDelivery}</strong></div>
        <div><span>Awaiting acknowledgement</span><strong>{snapshot.channelSummary.awaitingAcknowledgement}</strong></div>
        <div><span>Delivery failures</span><strong>{snapshot.channelSummary.deliveryFailures}</strong></div>
        <div><span>Open blockers</span><strong>{snapshot.channelSummary.openBlockers}</strong></div>
        <div><span>Open proposals</span><strong>{snapshot.channelSummary.openProposals}</strong></div>
      </section>

      <FleetQueue queue={snapshot.fleetQueue} />

      <section className="change-summary secondary-history">
        <div className="summary-title"><span className="scan-icon">⌁</span><p className="eyebrow">APPEND-ONLY CHANGE HISTORY</p></div>
        <p>{snapshot.summary}</p>
        <button onClick={markViewed} disabled={marking}>{marking ? "Marking…" : "Mark viewed"}<span>✓</span></button>
      </section>

      <footer><span>Append-only v2 ledger · daemon-owned SQLite · read-only file/Git evidence</span><span>Projection updated {relativeTime(snapshot.generatedAt)}</span></footer>
    </main>
  );
}

function LiveWorkerStrip({ source }: { source: Snapshot["liveSource"] }) {
  return <section className={`live-worker-strip ${source ? "connected" : "missing"}`} aria-label="Current live worker evidence source">
    <div><StatusDot health={source ? "GREEN" : "UNKNOWN"} pulse={Boolean(source)} /><span><b>LIVE WORKER</b>{source?.worker ?? "source not configured"}</span></div>
    {source ? <>
      <p>{source.summary}</p>
      <dl><div><dt>Source</dt><dd>{source.source_path}</dd></div><div><dt>Git</dt><dd>{source.branch}@{source.head.slice(0, 8)}</dd></div><div><dt>Directive / receipt</dt><dd>{source.directive_id ?? "none"} / {source.receipt_id ?? "pending"}</dd></div><div><dt>Evidence</dt><dd>{source.phase} · {relativeTime(source.observed_at)}</dd></div></dl>
    </> : <p>Set MISSION_CONTROL_LIVE_SOURCE and MISSION_CONTROL_LIVE_WORKTREE to observe the current worker read-only.</p>}
  </section>;
}

export function MissionCard({ worker, selected }: { worker: WorkerState; selected: boolean }) {
  const evidenceTime = worker.lastCheckpointAt;
  return <article className={`mission-card ${worker.operatorState.traffic.toLowerCase()} ${selected ? "selected" : ""}`} data-worker={worker.id}>
    <div className="mission-card-head"><div><StatusDot health={worker.operatorState.traffic} pulse={worker.operatorState.traffic === "RED"} /><span><small>{worker.status.toUpperCase()} · {worker.connection.state.replaceAll("_", " ")}</small><Link href={`/worker/${worker.id}`}><h3>{shortName(worker)}</h3></Link></span></div><strong>{dispositionLabel(worker)}</strong></div>
    <div className="mission-planes"><Plane label="Worker → Contract" value={worker.workerToContractAlignment} /><Plane label="Contract → Owner" value={worker.contractToOwnerAlignment} /><Plane label="Outcome" value={worker.progress.outcomeAdvancement} /><Plane label="Strategy" value={worker.progress.strategyEfficacy} /></div>
    <div className="mission-direction"><span>LATEST OWNER DIRECTION</span><p>{worker.channel.latestDirectionBody ?? "No direction recorded in the worker channel."}</p><strong className={freshnessClass(worker.channel.freshness)}>{worker.channel.freshness.replaceAll("_", " ")}</strong><small>{worker.channel.queue.length} queued item{worker.channel.queue.length === 1 ? "" : "s"} · {worker.channel.blockers.length} blocker{worker.channel.blockers.length === 1 ? "" : "s"} · {worker.channel.proposals.length} proposal{worker.channel.proposals.length === 1 ? "" : "s"}</small></div>
    <div className="mission-decision"><div><span>EXACT PROBLEM</span><p>{worker.primaryProblemSummary ?? "No active problem; direct owner-outcome evidence improved."}</p></div><div><span>CURRENT CORRECTION / NEXT ACTION</span><p>{worker.correction.directive ?? worker.progress.requiredIntervention}</p></div></div>
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
  return `${worker.overallTraffic} · READY TO CONTINUE`;
}

function executionPath(worker: WorkerState): string {
  if (worker.progress.strategyEfficacy === "EXHAUSTED" && !worker.progress.sameStrategyContinuationAllowed) return "PARKED_NO_VALID_STRATEGY · strategy authorization NO_VALID_STRATEGY";
  if (worker.executionSupervision.codexExecutionState === "PARKED") return "PARKED · same strategy prohibited";
  if (worker.id === "innersignal-review") return "CONTINUE CURRENT FRONTIER · GITHUB WAIT: NO";
  return `CONTINUE · ${worker.executionSupervision.codexExecutionState.replaceAll("_", " ")}`;
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
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
