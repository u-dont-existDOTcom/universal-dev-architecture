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
  if (!worker) return <main className="shell"><div className="loading-panel">Loading worker decision record…</div></main>;

  return (
    <main className="shell detail-shell">
      <Link href="/" className="back-link">← All-worker attention queue</Link>
      <header className="detail-hero">
        <div className="detail-title">
          <StatusDot health={worker.overallTraffic} pulse={worker.overallTraffic === "RED"} />
          <div><p className="eyebrow">WORKER / {worker.id.toUpperCase()}</p><h1>{worker.name}</h1><p>{worker.objective.goal}</p></div>
        </div>
        <div className="detail-actions">
          <span className={`verdict-badge ${worker.overallTraffic.toLowerCase()}`}>{worker.verdict.replaceAll("_", " ")} · {worker.overallTraffic}</span>
          <span className="diagnostic-caption">Diagnostic index {worker.alignment}/100 · secondary metadata</span>
          <SupervisorLink url={worker.supervisorChatUrl} label={worker.supervisorChatLabel} placeholder={worker.supervisorChatIsPlaceholder} />
        </div>
      </header>

      <DecisionStrip worker={worker} />

      <section className="detail-grid">
        <Panel eyebrow="OWNER AUTHORITY" title="Owner outcome and current gap" className="authority-panel">
          <div className="authority-identity">
            <Identity label="Outcome" value={worker.ownerOutcome.id ?? "MISSING"} />
            <Identity label="Epoch" value={worker.ownerOutcome.epoch?.toString() ?? "UNKNOWN"} />
            <Identity label="Source" value={worker.sourceReceipt.capability.replaceAll("_", " ")} />
            <Identity label="Reconciliation" value={worker.reconciliationId ?? "MISSING"} />
          </div>
          <p className="outcome-result">{worker.ownerOutcome.normalizedResult}</p>
          <div className="gap-callout"><span className="field-label">CURRENT GAP</span><p>{worker.ownerOutcome.currentGap}</p></div>
          <div className="outcome-list">{worker.ownerOutcome.requiredOutcomes.map((outcome) => <div key={outcome.id}><span className={`outcome-state ${outcome.status.toLowerCase()}`}>{outcome.status}</span><p>{outcome.text}</p></div>)}</div>
        </Panel>

        <Panel eyebrow="DERIVED TASK CONTRACT" title="Checked against owner authority" className="contract-panel">
          <ContractSection title="Acceptance criteria" items={worker.objective.acceptance_criteria} />
          <ContractSection title="Allowed scope" items={worker.objective.allowed_scope} code />
          <ContractSection title="Explicitly forbidden" items={worker.objective.forbidden_scope} code danger />
          <div className="contract-binding"><span className="field-label">BINDING</span><code>{worker.objective.taskContractSha256}</code><p>Revision {worker.objective.revision} · finish line: {worker.objective.effectiveFinishLine}</p></div>
          <div className="invariant-note"><span>⌾</span><p><strong>Append-only authority</strong>Contract revisions do not rewrite the owner outcome. Reconciliation and the terminal comparator remain independent.</p></div>
        </Panel>

        <Panel eyebrow="CURRENT TRAJECTORY" title={worker.currentStep}>
          <div className="trajectory-columns">
            <ListBlock title="Completed" items={worker.completedSteps} checked />
            <ListBlock title="Next 2–3 steps" items={worker.nextSteps} numbered />
          </div>
          <div className="trajectory-meta">
            <div><span className="field-label">PLAN CHANGED</span><strong>{worker.planChanged ? "Yes" : "No"}</strong><p>{worker.planChangeReason ?? "No authority-preserving reason recorded."}</p></div>
            <div><span className="field-label">BLOCKER</span><strong>{worker.blocker ? "Active" : "None"}</strong><p>{worker.blocker ?? "Worker can continue within the current boundary."}</p></div>
          </div>
          {worker.assumptions.length > 0 && <ListBlock title="Stated assumptions" items={worker.assumptions} />}
        </Panel>

        <Panel eyebrow="OWNER-OUTCOME PROGRESS" title={`${worker.progress.outcomeAdvancement.replaceAll("_", " ")} · ${worker.progress.strategyEfficacy.replaceAll("_", " ")}`} className={`terminal-panel ${worker.overallTraffic.toLowerCase()}`}>
          <div className="comparator-planes">
            <Identity label="Target" value={worker.progress.targetEvidence} />
            <Identity label="Latest direct evidence" value={worker.progress.latestEvidence} />
            <Identity label="Best direct evidence" value={worker.progress.bestEvidence} />
            <Identity label="Measurement" value={worker.progress.measurementFreshness} />
          </div>
          <div className="directive-callout"><span className="field-label">ACTIVE STRATEGY</span><strong>{worker.progress.strategyId ?? "MISSING"}</strong><p>{worker.progress.requiredIntervention}</p></div>
          <div className="evidence-list"><span className="field-label">SUPPORTING WORK SINCE DIRECT PROGRESS</span>{worker.progress.supportingWork.map((item) => <code key={`${item.classification}:${item.summary}`}>{item.classification}: {item.summary}</code>)}</div>
          <p><span className="field-label">NEXT DECISION-CHANGING EVIDENCE</span>{worker.progress.nextDecisionTrigger}</p>
        </Panel>

        <Panel eyebrow="CHAT-LED EXECUTION" title={`${worker.executionSupervision.surface} · ${worker.executionSupervision.reviewFreshness}`}>
          <div className="comparator-planes">
            <Identity label="Chat epoch" value={worker.executionSupervision.chatEpoch ?? "MISSING"} />
            <Identity label="Active directive" value={worker.executionSupervision.activeDirectiveId ?? "MISSING"} />
            <Identity label="Directive status" value={worker.executionSupervision.directiveStatus} />
            <Identity label="Codex execution" value={worker.executionSupervision.codexExecutionState.replaceAll("_", " ")} />
            <Identity label="Pro escalation" value={worker.executionSupervision.proEscalationState} />
          </div>
          <div className="directive-callout"><span className="field-label">EXECUTION OBJECTIVE</span><strong>{worker.executionSupervision.directiveObjective}</strong></div>
          <div className="contract-section danger"><span className="field-label">STOP / REVIEW BOUNDARY</span><ul>{worker.executionSupervision.stopBoundary.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <p><span className="field-label">LATEST EXECUTION RECEIPT</span>{worker.executionSupervision.latestReceiptId ?? "None"} — {worker.executionSupervision.receiptClaim}</p>
          <div className="freshness-row"><span>Pending reasoning review</span><strong className={worker.executionSupervision.pendingReasoningReview ? "bad" : "good"}>{worker.executionSupervision.pendingReasoningReview ? "YES" : "NO"}</strong></div>
          {worker.executionSupervision.alerts.length > 0 && <div className="reason-codes">{worker.executionSupervision.alerts.map((code) => <code key={code}>{code}</code>)}</div>}
        </Panel>

        <Panel eyebrow="ACTUAL WORK" title="Evidence, not activity">
          <div className="evidence-stats">
            <Metric value={String(worker.filesTouched.length)} label="files touched" />
            <Metric value={String(worker.diffLines)} label="diff lines" />
            <Metric value={String(worker.tests.passing)} label="tests passing" tone="good" />
            <Metric value={String(worker.tests.failing)} label="tests failing" tone={worker.tests.failing ? "bad" : "good"} />
          </div>
          <div className="evidence-list"><span className="field-label">FILES TOUCHED</span>{worker.filesTouched.map((file) => <code key={file}>{file}</code>)}</div>
          <div className="evidence-list finding-bindings"><span className="field-label">FINDING BINDINGS</span>{worker.activeFindings.flatMap((finding) => finding.evidenceRefs).map((ref) => <code key={ref}>{ref}</code>)}</div>
          <div className="build-row"><span>Lint <strong className={worker.tests.lint === "passing" ? "good" : ""}>{worker.tests.lint}</strong></span><span>Build <strong className={worker.tests.build === "passing" ? "good" : worker.tests.build === "failing" ? "bad" : ""}>{worker.tests.build}</strong></span></div>
          {worker.commits.length > 0 && <div className="commit-list">{worker.commits.map((commit) => <p key={commit.sha}><code>{commit.sha.slice(0, 8)}</code>{commit.message}</p>)}</div>}
        </Panel>

        <Panel eyebrow="TERMINAL COMPARATOR" title={worker.terminal.decision.replaceAll("_", " ")} className={`terminal-panel ${worker.overallTraffic.toLowerCase()}`}>
          <div className="comparator-planes">
            <Identity label="Contract status" value={worker.terminal.contractStatus.replaceAll("_", " ")} />
            <Identity label="Owner outcome" value={worker.terminal.ownerOutcomeStatus} />
            <Identity label="Claim" value={worker.terminal.completionClaimType.replaceAll("_", " ")} />
            <Identity label="Root close" value={worker.terminal.rootTerminalizationAllowed ? "ALLOWED" : "FORBIDDEN"} />
          </div>
          <div className="directive-callout"><span className="field-label">REQUIRED DIRECTIVE</span><strong>{worker.terminal.requiredDirective.replaceAll("_", " ")}</strong></div>
          <div className="reason-codes"><span className="field-label">REASON CODES</span>{worker.terminal.reasonCodes.map((code) => <code key={code}>{code}</code>)}</div>
          <p className="state-vector">State vector <code>{worker.terminal.stateVectorSha256}</code></p>
        </Panel>

        <Panel eyebrow="SUPERVISION ROUTE" title={`${worker.supervisionRoute.lane} · ${worker.supervisionRoute.status.replaceAll("_", " ")}`}>
          <div className="route-meter"><span>Substantive turns</span><strong>{worker.supervisionRoute.substantiveTurns} / {worker.supervisionRoute.hardMaximum}</strong></div>
          <p className="route-trigger"><span className="field-label">NEXT ROUTE TRIGGER</span>{worker.supervisionRoute.nextReviewTrigger}</p>
          <p className="assessment-reason">{worker.supervisor.reason}</p>
          <div className="freshness-row"><span>Assessment binding</span><strong className={worker.supervisor.assessmentFresh ? "good" : "bad"}>{worker.supervisor.assessmentFresh ? "CURRENT" : "STALE"}</strong></div>
          <SupervisorLink url={worker.supervisorChatUrl} label={worker.supervisorChatLabel} placeholder={worker.supervisorChatIsPlaceholder} />
        </Panel>

        {worker.research && <Panel eyebrow="RESEARCH ASSURANCE" title="Operational, scientific, and release planes" className="research-panel">
          <div className="research-planes">
            <ResearchPlane label="Operational protocol" value={worker.research.operationalProtocol} />
            <ResearchPlane label="Scientific conclusion" value={worker.research.scientificConclusion} />
            <ResearchPlane label="Release adequacy" value={worker.research.releaseAdequacy} />
          </div>
          {worker.research.unsupportedInference && <div className="research-finding"><span className="field-label">UNSUPPORTED INFERENCE</span><p>{worker.research.unsupportedInference}</p></div>}
          {worker.research.publicationBarrier && <div className="research-finding"><span className="field-label">PUBLICATION BARRIER</span><p>{worker.research.publicationBarrier}</p></div>}
          <div className="directive-callout"><span className="field-label">REMEDIATION</span><strong>{worker.research.remediation}</strong></div>
        </Panel>}
      </section>

      <section className="timeline-panel">
        <div className="panel-heading"><div><p className="eyebrow">APPEND-ONLY DECISION TRAIL</p><h2>Authority → evidence → finding → correction</h2></div><span>{worker.timeline.length} events</span></div>
        <div className="timeline">{worker.timeline.map((event) => <TimelineEvent key={event.eventId} event={event} />)}</div>
      </section>
    </main>
  );
}

function DecisionStrip({ worker }: { worker: WorkerState }) {
  const evidence = worker.activeFindings.flatMap((finding) => finding.evidenceRefs).slice(0, 5);
  const reasonCodes = worker.activeFindings.flatMap((finding) => finding.reasonCodes);
  return (
    <section className={`decision-strip ${worker.overallTraffic.toLowerCase()}`} aria-label="Operator decision strip">
      <DecisionCell label="WHAT IS WRONG" value={worker.primaryProblemSummary ?? "No active problem."} emphasis />
      <DecisionCell label="WHY IT MATTERS" value={worker.whyItMatters ?? "No owner-outcome consequence recorded."} />
      <div className="decision-cell evidence-cell"><span>EVIDENCE</span>{evidence.length ? <ul>{evidence.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No material finding evidence.</p>}{reasonCodes.length > 0 && <div className="reason-codes">{reasonCodes.map((code) => <code key={code}>{code}</code>)}</div>}</div>
      <DecisionCell label={worker.correction.directiveIssued ? "CORRECTIVE DIRECTIVE" : "REQUIRED RESPONSE"} value={worker.correction.directive ?? "No correction issued."} />
      <DecisionCell label="CORRECTION STATUS" value={worker.correction.statusLabel} emphasis />
      {(worker.correction.reopenTriggerEventId || worker.correction.closureBasis) && <DecisionCell label="REOPEN / CLOSURE BASIS" value={worker.correction.reopenTriggerEventId ? `Reopened by ${worker.correction.reopenTriggerEventId}` : worker.correction.closureBasis!.replaceAll("_", " ")} emphasis />}
      <DecisionCell label="CURRENT PATH" value={continuationLabel(worker)} emphasis />
      <DecisionCell label="NEXT VERIFICATION" value={worker.correction.nextReviewTrigger} />
      <DecisionCell label="OWNER ACTION" value={`${worker.correction.ownerActionType.replaceAll("_", " ")} — ${worker.correction.ownerActionText}`} emphasis />
      <OwnerDecisionDetails worker={worker} />
    </section>
  );
}

function DecisionCell({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={`decision-cell ${emphasis ? "emphasis" : ""}`}><span>{label}</span><p>{value}</p></div>;
}

function OwnerDecisionDetails({ worker }: { worker: WorkerState }) {
  const action = worker.correction.ownerAction;
  if (action.kind !== "DECISION_REQUIRED") return null;
  return <div className="decision-cell owner-decision-packet"><span>FULL PRO DECISION PACKET</span><p>{action.decision_context}</p><strong>{action.decision_question}</strong>{action.options.map((option) => <div key={option.option_id}><b>{option.label}</b><small>Benefits: {option.benefits.join("; ")}</small><small>Drawbacks: {option.drawbacks.join("; ")}</small><small>Consequences: {option.downstream_consequences.join("; ")}</small></div>)}<p>Recommendation: {action.recommendation_option_id} — {action.recommendation_reasoning}</p><p>Default if unanswered: {action.default_if_no_decision}</p><small>Full Pro analysis: {action.pro_analysis_ref}</small></div>;
}

function continuationLabel(worker: WorkerState): string {
  const policy = worker.correction.continuationPolicy;
  if (policy.mode === "UNKNOWN") return "UNKNOWN — PAUSE AND REPAIR OBSERVABILITY";
  if (policy.mode === "PAUSE_ALL") return "UNSAFE — PAUSE ALL WORK";
  if (policy.mode === "CONTINUE_UNRESTRICTED") return "SAFE — CONTINUE";
  if (policy.preconditions.length > 0) return `UNSAFE — STOP; AFTER ${policy.preconditions.join("; ")}, SAFE WITHIN ${policy.allowed_scope.join(", ")}`;
  return `SAFE WITHIN ${policy.allowed_scope.join(", ")}`;
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

function Identity({ label, value }: { label: string; value: string }) {
  return <div><span className="field-label">{label}</span><strong>{value}</strong></div>;
}

function ResearchPlane({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong className={value === "PASS" ? "good" : value === "FAIL" ? "bad" : "warn"}>{value}</strong></div>;
}

function TimelineEvent({ event }: { event: StoredEvent }) {
  const critical = event.data.type === "finding_recorded" && ["BLOCKING", "CRITICAL"].includes(event.data.severity)
    || event.data.type === "correction_lifecycle_recorded" && ["CORRECTION_BLOCKED", "CORRECTION_FAILED"].includes(event.data.status)
    || event.type.includes("redirect");
  return <div className={`timeline-event ${critical ? "critical" : ""}`}><time>{new Date(event.occurredAt).toLocaleString()}</time><div className="timeline-dot" /><div><strong>{event.type.replaceAll("_", " ")}</strong><p>{eventSummary(event)}</p><small>{event.eventId}</small></div></div>;
}

function eventSummary(event: StoredEvent): string {
  const data = event.data;
  switch (data.type) {
    case "owner_source_recorded": return `${data.receipt_capability.replaceAll("_", " ")} · ${data.comparison}`;
    case "owner_outcome_recorded": return `Outcome ${data.owner_outcome_id} epoch ${data.epoch}: ${data.current_gap}`;
    case "task_contract_recorded": return `${data.goal} · revision ${data.revision}`;
    case "objective_reconciliation_recorded": return `${data.freshness}: ${data.current_gap}`;
    case "worker_checkpoint_recorded": return data.current_step;
    case "supervisor_assessment_recorded": return `${data.operator_verdict}: ${data.reason}`;
    case "evidence_receipt_recorded": return `${data.evidence_class}: ${data.summary}`;
    case "finding_recorded": return `${data.severity}: ${data.statement}`;
    case "finding_status_changed": return `${data.status}: ${data.reason}`;
    case "correction_lifecycle_recorded": return `${data.status}: ${data.directive}`;
    case "verification_validity_recorded": return `Validity context ${data.context_id}: ${data.change_reason}`;
    case "completion_claim_recorded": return `${data.completion_claim_type}: ${data.proposed_terminal_state}`;
    case "owner_decision_recorded": return `${data.decision_kind}: ${data.exact_text}`;
    case "supervision_route_recorded": return `${data.lane} ${data.substantive_response_count}/${data.hard_maximum}: ${data.next_review_trigger}`;
    case "reasoning_supervision_recorded": return `${data.reasoning_supervisor_surface} ${data.reasoning_supervisor_chat_epoch}: ${data.next_reasoning_review_trigger}`;
    case "execution_directive_recorded": return `${data.status}: ${data.execution_objective}`;
    case "codex_execution_started": return `${data.execution_mode}: ${data.declared_tactical_boundary}`;
    case "execution_receipt_recorded": return `${data.receipt_id}: ${data.execution_claim}`;
    case "outcome_progress_recorded": return `${data.outcome_advancement} · ${data.strategy_efficacy}: ${data.required_intervention}`;
    case "supervision_alert_recorded": return `${data.code} ${data.status}: ${data.statement}`;
    case "research_verdict_recorded": return `Operational ${data.operational_protocol} · scientific ${data.scientific_conclusion} · release ${data.release_adequacy}`;
    case "supervision_design_feedback_recorded": return `${data.feedback_id}: ${data.status}`;
    case "symphony_runtime_observed": return `${data.kind}: ${data.issue_identifier} (${data.tracker_state ?? "provider state unavailable"})`;
    case "symphony_adapter_diagnostic_recorded": return `${data.reason_code}: ${data.statement}`;
    case "review_marked": return `Reviewed through sequence ${data.reviewed_through_sequence}`;
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
