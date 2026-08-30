"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { WorkerState } from "@/lib/projection";
import type { StoredEvent } from "@/lib/schema";
import { StatusDot } from "./StatusDot";
import { SupervisorLink } from "./SupervisorLink";

export function WorkerDetail({ workerId }: { workerId: string }) {
  const [worker, setWorker] = useState<WorkerState | null>(null);
  const [missing, setMissing] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/workers/${encodeURIComponent(workerId)}`, { cache: "no-store" });
    if (response.status === 404) return setMissing(true);
    const body = await response.json();
    setWorker(body.worker);
  }, [workerId]);

  useEffect(() => {
    void load();
    const source = new EventSource("/api/events/stream");
    source.addEventListener("mission-control-event", () => void load());
    return () => source.close();
  }, [load]);

  if (missing) return <main className="shell"><Link href="/" className="back-link">← Mission Control</Link><div className="loading-panel">Worker not found.</div></main>;
  if (!worker) return <main className="shell"><div className="loading-panel">Loading worker trajectory…</div></main>;

  return (
    <main className="shell detail-shell">
      <Link href="/" className="back-link">← All workers</Link>
      <header className="detail-hero">
        <div className="detail-title">
          <StatusDot health={worker.health} pulse={worker.health === "RED"} />
          <div><p className="eyebrow">WORKER / {worker.id.toUpperCase()}</p><h1>{worker.name}</h1><p>{worker.objective.goal}</p></div>
        </div>
        <div className="detail-actions">
          <span className={`health-label ${worker.health.toLowerCase()}`}>{worker.health} · {worker.alignment}% aligned</span>
          <SupervisorLink url={worker.supervisorChatUrl} label={worker.supervisorChatLabel} placeholder={worker.supervisorChatIsPlaceholder} />
        </div>
      </header>

      <section className="detail-grid">
        <Panel eyebrow="IMMUTABLE BASELINE" title="Objective contract" className="contract-panel">
          <ContractSection title="Acceptance criteria" items={worker.objective.acceptance_criteria} />
          <ContractSection title="Allowed scope" items={worker.objective.allowed_scope} code />
          <ContractSection title="Explicitly forbidden" items={worker.objective.forbidden_scope} code danger />
          <div className="invariant-note"><span>⌾</span><p><strong>Contract locked</strong>This baseline cannot be replaced after creation. Corrections require a new worker objective.</p></div>
        </Panel>

        <Panel eyebrow="CURRENT TRAJECTORY" title={worker.currentStep}>
          <div className="trajectory-columns">
            <ListBlock title="Completed" items={worker.completedSteps} checked />
            <ListBlock title="Next 2–3 steps" items={worker.nextSteps} numbered />
          </div>
          <div className="trajectory-meta">
            <div><span className="field-label">PLAN CHANGED</span><strong>{worker.planChanged ? "Yes" : "No"}</strong><p>{worker.planChangeReason ?? "No trajectory change reported."}</p></div>
            <div><span className="field-label">BLOCKER</span><strong>{worker.blocker ? "Active" : "None"}</strong><p>{worker.blocker ?? "Worker can continue autonomously."}</p></div>
          </div>
          {worker.assumptions.length > 0 && <ListBlock title="Stated assumptions" items={worker.assumptions} />}
        </Panel>

        <Panel eyebrow="ACTUAL WORK" title="Evidence, not activity">
          <div className="evidence-stats">
            <Metric value={String(worker.filesTouched.length)} label="files touched" />
            <Metric value={String(worker.diffLines)} label="diff lines" />
            <Metric value={String(worker.tests.passing)} label="tests passing" tone="good" />
            <Metric value={String(worker.tests.failing)} label="tests failing" tone={worker.tests.failing ? "bad" : "good"} />
          </div>
          <div className="evidence-list"><span className="field-label">FILES TOUCHED</span>{worker.filesTouched.map((file) => <code key={file}>{file}</code>)}</div>
          <div className="build-row"><span>Lint <strong className={worker.tests.lint === "passing" ? "good" : ""}>{worker.tests.lint}</strong></span><span>Build <strong className={worker.tests.build === "passing" ? "good" : worker.tests.build === "failing" ? "bad" : ""}>{worker.tests.build}</strong></span></div>
          {worker.commits.length > 0 && <div className="commit-list">{worker.commits.map((commit) => <p key={commit.sha}><code>{commit.sha.slice(0, 8)}</code>{commit.message}</p>)}</div>}
        </Panel>

        <Panel eyebrow="PRO SUPERVISOR ASSESSMENT" title={worker.supervisor.verdict.replace("_", " ")} className={`supervisor-panel ${worker.health.toLowerCase()}`}>
          <p className="assessment-reason">{worker.supervisor.reason}</p>
          {worker.supervisor.correctiveAction && <div className="corrective"><span className="field-label">CORRECTIVE ACTION</span><p>{worker.supervisor.correctiveAction}</p></div>}
          <div className="review-after"><span>Review again</span><strong>{worker.supervisor.reviewAfter.replaceAll("_", " ")}</strong></div>
          <SupervisorLink url={worker.supervisorChatUrl} label={worker.supervisorChatLabel} placeholder={worker.supervisorChatIsPlaceholder} />
          <p className="link-history-note">Link updates are recorded as append-only <code>supervisor_chat_link_set</code> events.</p>
        </Panel>
      </section>

      <section className="timeline-panel">
        <div className="panel-heading"><div><p className="eyebrow">TRAJECTORY TIMELINE</p><h2>Assignment → evidence → intervention</h2></div><span>{worker.timeline.length} events</span></div>
        <div className="timeline">{worker.timeline.map((event) => <TimelineEvent key={event.id} event={event} />)}</div>
      </section>
    </main>
  );
}

function Panel({ eyebrow, title, children, className = "" }: { eyebrow: string; title: string; children: React.ReactNode; className?: string }) {
  return <section className={`detail-panel ${className}`}><div className="panel-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div></div>{children}</section>;
}

function ContractSection({ title, items, code = false, danger = false }: { title: string; items: string[]; code?: boolean; danger?: boolean }) {
  return <div className={`contract-section ${danger ? "danger" : ""}`}><span className="field-label">{title}</span><ul>{items.map((item) => <li key={item}>{code ? <code>{item}</code> : item}</li>)}</ul></div>;
}

function ListBlock({ title, items, checked = false, numbered = false }: { title: string; items: string[]; checked?: boolean; numbered?: boolean }) {
  return <div className="list-block"><span className="field-label">{title}</span>{items.length === 0 ? <p className="muted">None reported</p> : <ol>{items.map((item, index) => <li key={item}><span>{checked ? "✓" : numbered ? index + 1 : "·"}</span>{item}</li>)}</ol>}</div>;
}

function Metric({ value, label, tone = "" }: { value: string; label: string; tone?: string }) {
  return <div><strong className={tone}>{value}</strong><span>{label}</span></div>;
}

function TimelineEvent({ event }: { event: StoredEvent }) {
  return <div className={`timeline-event ${event.type.includes("redirect") ? "critical" : ""}`}><div className="timeline-dot" /><time>{new Date(event.occurredAt).toLocaleString()}</time><div><strong>{event.type.replaceAll("_", " ")}</strong><p>{eventSummary(event)}</p></div></div>;
}

function eventSummary(event: StoredEvent): string {
  const data = event.data;
  switch (data.type) {
    case "objective_created": return data.goal;
    case "worker_heartbeat": return data.current_step;
    case "supervisor_verdict": return `${data.verdict.replace("_", " ")} — ${data.reason}`;
    case "supervisor_chat_link_set": return `Supervisor chat changed: ${data.reason}`;
    case "tests_run": return `${data.passing} passing, ${data.failing} failing`;
    case "blocker_reported": return data.blocker;
    case "redirect_issued": return data.corrective_action;
    case "plan_changed": return data.reason ?? "No reason given";
    case "files_changed": return `${data.files.length} files, ${data.additions + data.deletions} changed lines`;
    case "command_run": return `${data.command} → ${data.exit_code ?? "running"}`;
    case "commit_created": return `${data.sha.slice(0, 8)} ${data.message}`;
    case "task_completed": return data.summary;
  }
}
