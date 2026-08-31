"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkerState } from "@/lib/projection";
import { StatusDot } from "./StatusDot";
import { SupervisorLink } from "./SupervisorLink";

interface Snapshot {
  workers: WorkerState[];
  summary: string;
  latestEventId: number;
  generatedAt: string;
}

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
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

  const queue = useMemo(() => snapshot?.workers.filter((worker) => worker.overallTraffic !== "GREEN") ?? [], [snapshot]);
  const healthy = useMemo(() => snapshot?.workers.filter((worker) => worker.overallTraffic === "GREEN") ?? [], [snapshot]);
  const counts = useMemo(() => ({
    redirect: snapshot?.workers.filter((worker) => worker.verdict === "REDIRECT").length ?? 0,
    watch: snapshot?.workers.filter((worker) => worker.verdict === "WATCH" || worker.verdict === "CONTRACT_REPAIR" || worker.verdict === "HOLD").length ?? 0,
    onTrack: snapshot?.workers.filter((worker) => ["CONTINUE", "ON_TRACK"].includes(worker.verdict)).length ?? 0,
    owner: snapshot?.workers.filter((worker) => worker.correction.ownerActionType !== "NONE").length ?? 0,
  }), [snapshot]);

  async function markViewed() {
    setMarking(true);
    await fetch("/api/viewed", { method: "POST" });
    await load();
    setMarking(false);
  }

  if (!snapshot) return <main className="shell"><div className="loading-panel">Loading mission telemetry…</div></main>;
  const highest = queue[0];

  return (
    <main className="shell">
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

      <section className="operator-summary" aria-label="Needs attention now">
        <div className="operator-summary-head">
          <div className="attention-title"><span className="alert-icon">!</span><div><p className="eyebrow">NEEDS ATTENTION NOW</p><h2>{queue.length} worker{queue.length === 1 ? "" : "s"} need explanation or correction</h2></div></div>
          <div className="queue-counts" aria-label="Fleet state counts">
            <Count value={counts.redirect} label="redirect" tone="red" />
            <Count value={counts.watch} label="watch / repair" tone="yellow" />
            <Count value={counts.onTrack} label="on track" tone="green" />
            <Count value={counts.owner} label="owner actions" tone={counts.owner ? "red" : "green"} />
          </div>
        </div>
        {highest ? (
          <div className="highest-priority">
            <div className="highest-label"><span>HIGHEST PRIORITY</span><strong>{highest.name} — {verdictLabel(highest)}</strong></div>
            <div className="highest-facts">
              <OperatorFact label="Why" value={highest.primaryProblemSummary ?? "No active problem explanation recorded."} />
              <OperatorFact label={highest.correction.directiveIssued ? "Correction" : "Required response"} value={highest.correction.directive ?? "No corrective directive has been prepared."} />
              <OperatorFact label="Status" value={highest.correction.statusLabel} tone={highest.correction.status === "DIRECTIVE_DELIVERED" ? "warning" : undefined} />
              <OperatorFact label="Current path" value={continuationLabel(highest)} tone={highest.correction.continuationPolicy.mode === "CONTINUE_UNRESTRICTED" ? "good" : "warning"} />
              <OperatorFact label="Owner action" value={ownerActionLabel(highest)} tone={highest.correction.ownerActionType === "NONE" ? "good" : "warning"} />
            </div>
            <Link href={`/worker/${highest.id}`} className="summary-open">Open decision record <span>→</span></Link>
          </div>
        ) : <p className="all-clear">No active RED, YELLOW, or UNKNOWN worker state.</p>}
      </section>

      <section className="change-summary">
        <div className="summary-title"><span className="scan-icon">⌁</span><p className="eyebrow">WHAT CHANGED SINCE I LAST LOOKED?</p></div>
        <p>{snapshot.summary}</p>
        <button onClick={markViewed} disabled={marking}>{marking ? "Marking…" : "Mark viewed"}<span>✓</span></button>
      </section>

      <div className="section-heading">
        <div><p className="eyebrow">ALL-WORKER ATTENTION QUEUE</p><h2>Problems, directives, and proof of correction</h2></div>
        <div className="legend"><span><StatusDot health="RED" />redirect</span><span><StatusDot health="YELLOW" />inspect</span><span><StatusDot health="UNKNOWN" />authority unknown</span></div>
      </div>

      <section className="attention-queue">
        {queue.map((worker) => <AttentionCard key={worker.id} worker={worker} />)}
      </section>

      <div className="section-heading healthy-heading">
        <div><p className="eyebrow">SAFE TO CONTINUE</p><h2>Healthy or independently continuing work</h2></div>
        <span className="healthy-count">{healthy.length} worker{healthy.length === 1 ? "" : "s"}</span>
      </div>
      <section className="healthy-grid">
        {healthy.map((worker) => <HealthyCard key={worker.id} worker={worker} />)}
      </section>

      <footer><span>Append-only v2 ledger · daemon-owned SQLite · read-only Symphony seam</span><span>Updated {relativeTime(snapshot.generatedAt)}</span></footer>
    </main>
  );
}

function AttentionCard({ worker }: { worker: WorkerState }) {
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

      <div className="attention-card-foot">
        <span>Last meaningful checkpoint {relativeTime(worker.lastCheckpointAt)}</span>
        <span>Claim: {worker.terminal.completionClaimType.replaceAll("_", " ")}</span>
        <span className="diagnostic-meta">Diagnostic index {worker.alignment}/100 · {worker.activeFindings.length} active finding{worker.activeFindings.length === 1 ? "" : "s"}</span>
        <Link href={`/worker/${worker.id}`}>Evidence + decision trail →</Link>
      </div>
    </article>
  );
}

function HealthyCard({ worker }: { worker: WorkerState }) {
  return (
    <article className="healthy-card">
      <div className="healthy-card-head"><div><StatusDot health="GREEN" /><Link href={`/worker/${worker.id}`}><h3>{worker.name}</h3></Link></div><span>{worker.status}</span></div>
      <p>{worker.currentStep}</p>
      <div className="healthy-planes"><span>Worker → Contract <strong>{worker.workerToContractAlignment}</strong></span><span>Contract → Owner <strong>{worker.contractToOwnerAlignment}</strong></span></div>
      <div className="healthy-foot"><span>Next: {worker.correction.nextReviewTrigger}</span><span>Owner action: {worker.correction.ownerActionType}</span></div>
      <SupervisorLink url={worker.supervisorChatUrl} label={worker.supervisorChatLabel} placeholder={worker.supervisorChatIsPlaceholder} />
    </article>
  );
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
