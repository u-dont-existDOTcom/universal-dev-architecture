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
      setError("Mission Control could not reach its local event store.");
    }
  }, []);

  useEffect(() => {
    void load();
    const source = new EventSource("/api/events/stream");
    source.addEventListener("mission-control-event", () => void load());
    source.onerror = () => setError("Live updates are reconnecting…");
    return () => source.close();
  }, [load]);

  const intervention = useMemo(() => snapshot?.workers.filter((worker) => worker.health === "RED") ?? [], [snapshot]);
  const watch = useMemo(() => snapshot?.workers.filter((worker) => worker.health === "YELLOW") ?? [], [snapshot]);

  async function markViewed() {
    setMarking(true);
    await fetch("/api/viewed", { method: "POST" });
    await load();
    setMarking(false);
  }

  if (!snapshot) return <main className="shell"><div className="loading-panel">Loading mission telemetry…</div></main>;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-row">
          <div className="brand-mark">MC</div>
          <div>
            <p className="eyebrow">LOCAL OBSERVABILITY LAYER</p>
            <h1>Codex Mission Control</h1>
          </div>
        </div>
        <div className="live-state"><StatusDot health="GREEN" pulse /><span>LIVE</span><span className="muted">SSE connected</span></div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="attention-bar" aria-label="Intervention summary">
        <div className="attention-heading">
          <span className="alert-icon">!</span>
          <div><p className="eyebrow">REQUIRES ATTENTION</p><strong>{intervention.length} redirect · {watch.length} watch</strong></div>
        </div>
        <div className="attention-workers">
          {intervention.map((worker) => <Link key={worker.id} href={`/worker/${worker.id}`}><StatusDot health="RED" />{worker.name}<span>redirect now →</span></Link>)}
          {watch.map((worker) => <Link key={worker.id} href={`/worker/${worker.id}`}><StatusDot health="YELLOW" />{worker.name}<span>inspect next →</span></Link>)}
        </div>
      </section>

      <section className="change-summary">
        <div className="summary-title"><span className="scan-icon">⌁</span><p className="eyebrow">WHAT CHANGED SINCE I LAST LOOKED?</p></div>
        <p>{snapshot.summary}</p>
        <button onClick={markViewed} disabled={marking}>{marking ? "Marking…" : "Mark viewed"}<span>✓</span></button>
      </section>

      <div className="section-heading">
        <div><p className="eyebrow">WORKER FLEET</p><h2>Objective alignment at a glance</h2></div>
        <div className="legend"><span><StatusDot health="GREEN" />continue</span><span><StatusDot health="YELLOW" />inspect</span><span><StatusDot health="RED" />redirect</span></div>
      </div>

      <section className="worker-grid">
        {snapshot.workers.map((worker) => <WorkerCard key={worker.id} worker={worker} />)}
      </section>

      <footer><span>Append-only SQLite event store</span><span>Updated {relativeTime(snapshot.generatedAt)}</span></footer>
    </main>
  );
}

function WorkerCard({ worker }: { worker: WorkerState }) {
  const testTone = worker.tests.failing > 0 ? "bad" : "good";
  return (
    <article className={`worker-card ${worker.health.toLowerCase()}`}>
      <div className="card-health-line" />
      <div className="card-head">
        <div className="worker-identity"><StatusDot health={worker.health} pulse={worker.health === "RED"} /><div><Link href={`/worker/${worker.id}`}><h3>{worker.name}</h3></Link><span className={`status-chip ${worker.status}`}>{worker.status}</span></div></div>
        <span className={`health-label ${worker.health.toLowerCase()}`}>{worker.health}</span>
      </div>

      <p className="objective">{worker.objective.goal}</p>
      <SupervisorLink url={worker.supervisorChatUrl} label={worker.supervisorChatLabel} placeholder={worker.supervisorChatIsPlaceholder} />

      <div className="alignment-row">
        <div><span>Objective alignment</span><strong>{worker.alignment}%</strong></div>
        <div className="alignment-track"><span style={{ width: `${worker.alignment}%` }} /></div>
      </div>

      <div className="card-section">
        <span className="field-label">SUPERVISOR VERDICT</span>
        <div className="verdict"><span className={worker.verdict.toLowerCase()}>{worker.verdict.replace("_", " ")}</span><p>{worker.supervisor.reason}</p></div>
      </div>

      <div className="current-step"><span className="field-label">CURRENT STEP</span><p>{worker.currentStep}</p></div>

      <div className="metrics-row">
        <div><span className="field-label">CHECKPOINT</span><strong>{relativeTime(worker.lastCheckpointAt)}</strong></div>
        <div><span className="field-label">TESTS</span><strong className={testTone}>{worker.tests.passing} pass · {worker.tests.failing} fail</strong></div>
        <div><span className="field-label">DRIFT</span><strong>{worker.driftScore} pts</strong></div>
      </div>

      <div className="warnings">
        <span className="field-label">ACTIVE DRIFT WARNINGS</span>
        {worker.warnings.length === 0
          ? <p className="clear"><span>✓</span>No active warning signals</p>
          : <ul>{worker.warnings.slice(0, 3).map((warning) => <li key={warning.code}><span>!</span>{warning.label}{warning.points > 0 && <em>+{warning.points}</em>}</li>)}</ul>}
      </div>

      <Link className="detail-link" href={`/worker/${worker.id}`}>View objective evidence and timeline <span>→</span></Link>
    </article>
  );
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
