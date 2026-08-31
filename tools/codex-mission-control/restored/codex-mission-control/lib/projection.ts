import { correctionStatusLabel } from "./correction-lifecycle";
import { driftConfig, DriftConfig } from "./drift-config";
import type {
  ContractOwnerAlignment,
  ContinuationPolicy,
  CorrectionStatus,
  DirectiveKind,
  MissionControlEventV2,
  OwnerActionObligation,
  OwnerActionType,
  StoredEvent,
  Traffic,
  WorkerAlignment,
  WorkerHeartbeatEvent,
} from "./schema";
import { effectiveSameStrategyContinuationAllowed, effectiveStrategyEfficacy } from "./progress-invariants";
import { compareTerminalState, correctionVerificationStale, latestOwnerAction, type TerminalComparison } from "./terminal-comparator";

export type Health = Traffic;
export type WorkerStatus = "working" | "blocked" | "done";
export type OperatorVerdict = "CONTINUE" | "ON_TRACK" | "WATCH" | "REDIRECT" | "HOLD" | "CONTRACT_REPAIR";

export interface WarningSignal {
  code: string;
  label: string;
  points: number;
  immediate: boolean;
}

export interface ObjectiveProjection {
  contractId: string;
  revision: number;
  taskContractSha256: string;
  worker: string;
  worker_name: string;
  goal: string;
  acceptance_criteria: string[];
  allowed_scope: string[];
  forbidden_scope: string[];
  expected_max_diff_lines?: number;
  effectiveFinishLine: string;
  ownerOutcomeId: string | null;
  ownerOutcomeEpoch: number | null;
  supervisor_chat_url: string;
  supervisor_chat_label: string;
  legacy: boolean;
}

export interface FindingProjection {
  id: string;
  groupId: string;
  type: string;
  severity: "INFO" | "MATERIAL" | "BLOCKING" | "CRITICAL";
  statement: string;
  violatedRequirement: string;
  evidenceRefs: string[];
  reasonCodes: string[];
  status: "OPEN" | "MITIGATED" | "REOPENED";
  requiredResponse: string;
}

export interface CorrectionProjection {
  correctionAttemptId: string | null;
  directiveId: string | null;
  directiveKind: DirectiveKind | null;
  targetKind: string | null;
  targetId: string | null;
  status: CorrectionStatus | null;
  statusLabel: string;
  directive: string | null;
  directiveIssued: boolean;
  directiveDelivered: boolean;
  workerAcknowledged: boolean;
  correctionStarted: boolean;
  correctionInProgress: boolean;
  evidenceSubmitted: boolean;
  correctionVerified: boolean;
  correctionResolved: boolean;
  reopenRequired: boolean;
  reopenTriggerEventId: string | null;
  closureBasis: "CORRECTED_AND_VERIFIED" | "FINDING_INVALIDATED" | "MIXED_RESOLUTION" | null;
  requiredEvidence: string[];
  evidenceReceiptIds: string[];
  nextReviewTrigger: string;
  ownerActionType: OwnerActionType;
  ownerActionText: string;
  ownerAction: OwnerActionObligation;
  continuationPolicy: ContinuationPolicy;
  latestAt: string | null;
  ageMinutes: number | null;
}

export interface WorkerState {
  id: string;
  missionId: string;
  name: string;
  objective: ObjectiveProjection;
  supervisorChatUrl: string;
  supervisorChatLabel: string;
  supervisorChatIsPlaceholder: boolean;
  status: WorkerStatus;
  health: Health;
  workerToContractAlignment: WorkerAlignment;
  contractToOwnerAlignment: ContractOwnerAlignment;
  overallTraffic: Traffic;
  alignment: number;
  driftScore: number;
  verdict: OperatorVerdict;
  primaryProblemSummary: string | null;
  whyItMatters: string | null;
  activeFindings: FindingProjection[];
  correction: CorrectionProjection;
  currentStep: string;
  completedSteps: string[];
  nextSteps: string[];
  planChanged: boolean;
  planChangeReason: string | null;
  blocker: string | null;
  assumptions: string[];
  filesTouched: string[];
  diffLines: number;
  commits: Array<{ sha: string; message: string }>;
  tests: { passing: number; failing: number; lint: string; build: string };
  warnings: WarningSignal[];
  supervisor: {
    verdict: OperatorVerdict;
    reason: string;
    correctiveAction: string | null;
    reviewAfter: string;
    assessmentFresh: boolean;
  };
  sourceReceipt: {
    receiptId: string | null;
    capability: string;
    comparison: string;
    freshness: string;
    limitations: string[];
  };
  ownerOutcome: {
    id: string | null;
    epoch: number | null;
    sha256: string | null;
    normalizedResult: string;
    currentGap: string;
    requiredOutcomes: Array<{ id: string; text: string; status: string; terminalRequired: boolean }>;
  };
  reconciliationId: string | null;
  terminal: TerminalComparison;
  research: {
    operationalProtocol: string;
    scientificConclusion: string;
    releaseAdequacy: string;
    unsupportedInference: string | null;
    publicationBarrier: string | null;
    remediation: string;
    releasePermission: boolean;
  } | null;
  supervisionRoute: {
    lane: string;
    sessionId: string | null;
    status: string;
    substantiveTurns: number;
    hardMaximum: number;
    nextReviewTrigger: string;
    handoffCapsuleId: string | null;
  };
  progress: {
    outcomeAdvancement: string;
    strategyId: string | null;
    strategyEfficacy: string;
    targetEvidence: string;
    latestEvidence: string;
    bestEvidence: string;
    changeFromPrevious: number | null;
    supportingWork: Array<{ classification: string; summary: string }>;
    nextDecisionTrigger: string;
    requiredIntervention: string;
    sameStrategyContinuationAllowed: boolean;
    measurementFreshness: string;
  };
  executionSupervision: {
    surface: string;
    sessionId: string | null;
    chatEpoch: string | null;
    lastReviewAt: string | null;
    reviewFreshness: string;
    activeDirectiveId: string | null;
    directiveStatus: string;
    directiveObjective: string;
    codexExecutionState: string;
    stopBoundary: string[];
    latestReceiptId: string | null;
    receiptClaim: string;
    pendingReasoningReview: boolean;
    proEscalationState: string;
    alerts: string[];
  };
  lastCheckpointAt: string;
  timeline: StoredEvent[];
}

export function projectWorkers(events: StoredEvent[], now = new Date(), config: DriftConfig = driftConfig): WorkerState[] {
  const projectableWorkers = new Set(events.flatMap((event) => {
    if (event.data.type === "task_contract_recorded" || event.data.type === "objective_created") return [event.worker];
    return [];
  }).filter((worker): worker is string => Boolean(worker)));
  const workerIds = [...new Set(events.map((event) => event.worker)
    .filter((worker): worker is string => typeof worker === "string" && projectableWorkers.has(worker)))];
  return workerIds
    .map((worker) => projectWorker(events.filter((event) => event.worker === worker), now, config))
    .sort((left, right) => attentionPriority(left) - attentionPriority(right)
      || severityScore(right.activeFindings[0]?.severity) - severityScore(left.activeFindings[0]?.severity)
      || new Date(left.lastCheckpointAt).getTime() - new Date(right.lastCheckpointAt).getTime());
}

export function projectWorker(events: StoredEvent[], now = new Date(), config: DriftConfig = driftConfig): WorkerState {
  const contract = latest(events, "task_contract_recorded");
  return contract ? projectV2Worker(events, contract, now) : projectLegacyWorker(events, now, config);
}

function projectV2Worker(
  events: StoredEvent[],
  contract: Extract<MissionControlEventV2, { type: "task_contract_recorded" }>,
  now: Date,
): WorkerState {
  const checkpoint = latest(events, "worker_checkpoint_recorded");
  const assessment = latest(events, "supervisor_assessment_recorded");
  const outcome = latest(events, "owner_outcome_recorded");
  const linkedSourceEvent = outcome
    ? events.findLast((event) => event.data.type === "owner_source_recorded" && event.data.receipt_id === outcome.source_receipt_id)
    : undefined;
  const source = linkedSourceEvent?.data.type === "owner_source_recorded" ? linkedSourceEvent.data : undefined;
  const reconciliation = latest(events, "objective_reconciliation_recorded");
  const route = latest(events, "supervision_route_recorded");
  const research = latest(events, "research_verdict_recorded");
  const reasoning = latest(events, "reasoning_supervision_recorded");
  const directive = latest(events, "execution_directive_recorded");
  const executionStart = latest(events, "codex_execution_started");
  const receipt = latest(events, "execution_receipt_recorded");
  const progress = latest(events, "outcome_progress_recorded");
  const comparison = compareTerminalState(events);
  const activeFindings = projectFindings(events);
  const primaryFinding = activeFindings[0];
  const correction = projectCorrection(events, primaryFinding, assessment, progress, comparison, now);
  const filesTouched = checkpoint?.files_touched ?? [];
  const commits = events.flatMap((event) => event.data.type === "commit_created"
    ? [{ sha: event.data.sha, message: event.data.message }]
    : []);
  const status: WorkerStatus = comparison.rootTerminalizationAllowed
    ? "done"
    : checkpoint?.status ?? "working";
  const diagnosticIndex = assessment?.diagnostic_index ?? alignmentIndex(comparison.workerToContractAlignment);
  const activeReviewHandoffProblem = comparison.pendingReasoningReview ? terminalProblem(comparison) : null;
  const primaryProblemSummary = primaryFinding?.statement
    ?? researchProblem(research)
    ?? activeReviewHandoffProblem
    ?? progressProblem(progress, comparison.outcomeAdvancement)
    ?? contractProblem(comparison)
    ?? terminalProblem(comparison);
  const whyItMatters = primaryFinding?.violatedRequirement
    ?? researchWhy(research)
    ?? progressWhy(progress, comparison.outcomeAdvancement)
    ?? (comparison.contractToOwnerAlignment !== "MATCH" ? comparison.currentGap : null)
    ?? terminalWhy(comparison);
  const supervisorUrl = route?.supervisor_chat_url ?? latestSupervisorLink(events)?.supervisor_chat_url ?? "https://chatgpt.com/";
  const supervisorLabel = route?.supervisor_chat_label ?? latestSupervisorLink(events)?.supervisor_chat_label ?? "Open supervisor chat";
  const lastCheckpoint = checkpointEvent(events) ?? events.at(-1)!;

  return {
    id: contract.worker,
    missionId: events.at(-1)?.missionId ?? "mission-control",
    name: contract.worker_name,
    objective: {
      contractId: contract.contract_id,
      revision: contract.revision,
      taskContractSha256: contract.task_contract_sha256,
      worker: contract.worker,
      worker_name: contract.worker_name,
      goal: contract.goal,
      acceptance_criteria: contract.acceptance_criteria,
      allowed_scope: contract.allowed_scope,
      forbidden_scope: contract.forbidden_scope,
      expected_max_diff_lines: contract.expected_max_diff_lines,
      effectiveFinishLine: contract.effective_finish_line,
      ownerOutcomeId: contract.owner_outcome_id,
      ownerOutcomeEpoch: contract.owner_outcome_epoch,
      supervisor_chat_url: supervisorUrl,
      supervisor_chat_label: supervisorLabel,
      legacy: false,
    },
    supervisorChatUrl: supervisorUrl,
    supervisorChatLabel: supervisorLabel,
    supervisorChatIsPlaceholder: /replace-|example|placeholder/i.test(supervisorUrl),
    status,
    health: comparison.overallTraffic,
    workerToContractAlignment: comparison.workerToContractAlignment,
    contractToOwnerAlignment: comparison.contractToOwnerAlignment,
    overallTraffic: comparison.overallTraffic,
    alignment: diagnosticIndex,
    driftScore: Math.max(0, 100 - diagnosticIndex),
    verdict: assessment?.operator_verdict ?? "HOLD",
    primaryProblemSummary,
    whyItMatters,
    activeFindings,
    correction,
    currentStep: checkpoint?.current_step ?? "Awaiting a versioned worker checkpoint",
    completedSteps: checkpoint?.completed_steps ?? [],
    nextSteps: checkpoint?.next_steps ?? [],
    planChanged: checkpoint?.plan_changed ?? false,
    planChangeReason: checkpoint?.plan_change_reason ?? null,
    blocker: checkpoint?.blocker ?? null,
    assumptions: checkpoint?.assumptions ?? [],
    filesTouched,
    diffLines: checkpoint?.diff_lines ?? 0,
    commits,
    tests: checkpoint?.tests ?? { passing: 0, failing: 0, lint: "not_run", build: "not_run" },
    warnings: activeFindings.map((finding) => ({
      code: finding.type.toLowerCase(),
      label: finding.statement,
      points: finding.severity === "BLOCKING" || finding.severity === "CRITICAL" ? 25 : finding.severity === "MATERIAL" ? 10 : 0,
      immediate: finding.severity === "BLOCKING" || finding.severity === "CRITICAL",
    })),
    supervisor: {
      verdict: assessment?.operator_verdict ?? "HOLD",
      reason: assessment?.reason ?? "No current supervisor assessment is available.",
      correctiveAction: correction.directive,
      reviewAfter: correction.nextReviewTrigger,
      assessmentFresh: comparison.supervisorAssessmentFresh,
    },
    sourceReceipt: {
      receiptId: source?.receipt_id ?? null,
      capability: source?.receipt_capability ?? "UNKNOWN",
      comparison: source?.comparison ?? "UNKNOWN",
      freshness: source?.freshness ?? "UNKNOWN",
      limitations: source?.limitations ?? [],
    },
    ownerOutcome: {
      id: outcome?.owner_outcome_id ?? null,
      epoch: outcome?.epoch ?? null,
      sha256: outcome?.owner_outcome_sha256 ?? null,
      normalizedResult: outcome?.normalized_result ?? "Owner outcome unavailable.",
      currentGap: comparison.currentGap,
      requiredOutcomes: outcome?.required_outcomes.map((item) => ({
        id: item.id, text: item.text, status: item.status, terminalRequired: item.terminal_required,
      })) ?? [],
    },
    reconciliationId: reconciliation?.reconciliation_id ?? null,
    terminal: comparison,
    research: research ? {
      operationalProtocol: research.operational_protocol,
      scientificConclusion: research.scientific_conclusion,
      releaseAdequacy: research.release_adequacy,
      unsupportedInference: research.unsupported_inference,
      publicationBarrier: research.publication_barrier,
      remediation: research.remediation,
      releasePermission: research.release_permission,
    } : null,
    supervisionRoute: {
      lane: route?.lane ?? "DETERMINISTIC",
      sessionId: route?.session_id ?? null,
      status: route?.status ?? "ACTIVE",
      substantiveTurns: route?.substantive_response_count ?? 0,
      hardMaximum: route?.hard_maximum ?? 3,
      nextReviewTrigger: route?.next_review_trigger ?? correction.nextReviewTrigger,
      handoffCapsuleId: route?.handoff_capsule_id ?? null,
    },
    progress: {
      outcomeAdvancement: comparison.outcomeAdvancement,
      strategyId: progress?.strategy_id ?? reasoning?.current_strategy_id ?? null,
      strategyEfficacy: effectiveStrategyEfficacy(progress, comparison.outcomeAdvancement),
      targetEvidence: evidenceLabel(progress?.target_evidence),
      latestEvidence: evidenceLabel(progress?.current_evidence),
      bestEvidence: evidenceLabel(progress?.best_evidence),
      changeFromPrevious: progress?.change_from_previous ?? null,
      supportingWork: progress?.work_since_last_direct_progress ?? [],
      nextDecisionTrigger: progress?.next_decision_changing_evidence ?? reasoning?.next_reasoning_review_trigger ?? "Record a current progress receipt.",
      requiredIntervention: progress?.required_intervention ?? "RECORD_OUTCOME_PROGRESS",
      sameStrategyContinuationAllowed: effectiveSameStrategyContinuationAllowed(progress),
      measurementFreshness: progress?.measurement_freshness ?? "UNKNOWN",
    },
    executionSupervision: {
      surface: reasoning?.reasoning_supervisor_surface ?? "UNASSIGNED",
      sessionId: reasoning?.reasoning_supervisor_session_id ?? null,
      chatEpoch: reasoning?.reasoning_supervisor_chat_epoch ?? null,
      lastReviewAt: reasoning?.last_reasoning_review_at ?? null,
      reviewFreshness: reasoning?.review_freshness ?? "UNKNOWN",
      activeDirectiveId: directive?.directive_id ?? null,
      directiveStatus: directive?.status ?? "MISSING",
      directiveObjective: directive?.execution_objective ?? "No current chat-authored execution directive is recorded.",
      codexExecutionState: receipt ? "AWAITING_REASONING_REVIEW_AUTO_RESUME_REQUIRED" : executionStart ? "RUNNING_WITH_DIRECTIVE" : "NOT_STARTED",
      stopBoundary: directive?.stop_and_return_triggers ?? [],
      latestReceiptId: receipt?.receipt_id ?? null,
      receiptClaim: receipt?.execution_claim ?? "No execution receipt recorded.",
      pendingReasoningReview: comparison.pendingReasoningReview,
      proEscalationState: reasoning?.pro_escalation_state ?? "NOT_REQUIRED",
      alerts: comparison.reasonCodes.filter((code) => [
        "SUPERVISION_DIRECTIVE_MISSING", "REASONING_REVIEW_OVERDUE", "PENDING_REASONING_REVIEW",
        "PROGRESS_EVIDENCE_OVERDUE", "OWNER_OUTCOME_REGRESSING", "STRATEGY_REPLACEMENT_REQUIRED",
      ].includes(code) || code.startsWith("CODEX_") || code === "DIRECTIVE_SCOPE_EXCEEDED" || code === "OWNER_FORCED_PROGRESS_REVIEW"),
    },
    lastCheckpointAt: lastCheckpoint.occurredAt,
    timeline: [...events].reverse(),
  };
}

function projectFindings(events: StoredEvent[]): FindingProjection[] {
  const receipts = new Map(events.flatMap((event) => event.data.type === "evidence_receipt_recorded"
    ? [[event.data.receipt_id, event.data] as const]
    : []));
  const findings = new Map<string, {
    record: Extract<MissionControlEventV2, { type: "finding_recorded" }>;
    status: "OPEN" | "MITIGATED" | "RESOLVED" | "INVALIDATED" | "REOPENED";
  }>();
  for (const event of events) {
    if (event.data.type === "finding_recorded" && !findings.has(event.data.finding_id)) {
      findings.set(event.data.finding_id, { record: event.data, status: "OPEN" });
    }
    if (event.data.type === "finding_status_changed") {
      const current = findings.get(event.data.finding_id);
      if (current) current.status = event.data.status;
    }
  }
  for (const [findingId, finding] of findings) {
    if (["RESOLVED", "INVALIDATED"].includes(finding.status) && correctionVerificationStale(events, findingId)) finding.status = "REOPENED";
  }
  return [...findings.values()]
    .filter(({ status }) => status !== "RESOLVED" && status !== "INVALIDATED")
    .map(({ record: finding, status }) => ({
      id: finding.finding_id,
      groupId: finding.principal_group_id,
      type: finding.finding_type,
      severity: finding.severity,
      statement: finding.statement,
      violatedRequirement: finding.violated_requirement,
      evidenceRefs: finding.evidence_receipt_ids.map((receiptId) => {
        const receipt = receipts.get(receiptId);
        if (!receipt) return `MISSING DURABLE EVIDENCE RECEIPT · ${receiptId}`;
        const paths = receipt.changed_path_manifest?.paths.map((entry) => entry.path).join(", ");
        return `${receipt.summary}${paths ? ` Complete changed-path manifest: ${paths}.` : ""} [${receiptId}]`;
      }),
      reasonCodes: finding.reason_codes,
      status: status as FindingProjection["status"],
      requiredResponse: finding.required_response,
    }))
    .sort((left, right) => severityScore(right.severity) - severityScore(left.severity));
}

function projectCorrection(
  events: StoredEvent[],
  primaryFinding: FindingProjection | undefined,
  assessment: Extract<MissionControlEventV2, { type: "supervisor_assessment_recorded" }> | undefined,
  progress: Extract<MissionControlEventV2, { type: "outcome_progress_recorded" }> | undefined,
  comparison: TerminalComparison,
  now: Date,
): CorrectionProjection {
  const corrections = events.filter((event) => event.data.type === "correction_lifecycle_recorded");
  const relevant = primaryFinding
    ? corrections.filter((event) => event.data.type === "correction_lifecycle_recorded" && event.data.finding_ids.includes(primaryFinding.id))
    : corrections;
  const latestEvent = relevant.at(-1);
  const latestCorrection = latestEvent?.data.type === "correction_lifecycle_recorded" ? latestEvent.data : undefined;
  const currentAttemptEvents = latestCorrection
    ? relevant.filter((event) => event.data.type === "correction_lifecycle_recorded"
      && event.data.correction_attempt_id === latestCorrection.correction_attempt_id)
    : [];
  const history = currentAttemptEvents.map((event) => event.data)
    .filter((data): data is Extract<MissionControlEventV2, { type: "correction_lifecycle_recorded" }> => data.type === "correction_lifecycle_recorded");
  const statuses = new Set(history.map((event) => event.status));
  const fallbackFinding = primaryFindingEvent(events, primaryFinding?.id);
  const recordedOwnerAction = latestOwnerAction(events);
  const pendingReviewOwnerAction = !recordedOwnerAction && comparison.pendingReasoningReview
    ? pendingReasoningReviewOwnerAction(events)
    : undefined;
  const latestAttemptEvents = new Map<string, Extract<MissionControlEventV2, { type: "correction_lifecycle_recorded" }>>();
  for (const event of corrections) {
    if (event.data.type === "correction_lifecycle_recorded") latestAttemptEvents.set(event.data.correction_attempt_id, event.data);
  }
  const inactiveStates: CorrectionStatus[] = ["CORRECTION_RESOLVED", "CORRECTION_FAILED", "DIRECTIVE_SUPERSEDED", "DIRECTIVE_WITHDRAWN"];
  const activeDirectives = [...latestAttemptEvents.values()].filter((event) => !inactiveStates.includes(event.status));
  const directiveConflict = new Set(activeDirectives.map((event) => event.directive_id)).size > 1;
  const ownerAction = effectiveOwnerAction(recordedOwnerAction ?? pendingReviewOwnerAction, now, events, latestCorrection, directiveConflict);
  const recordedContinuationPolicy = latestCorrection?.continuation_policy ?? fallbackFinding?.continuation_policy
    ?? assessment?.continuation_policy ?? unknownContinuationPolicy();
  const continuationPolicy = effectiveContinuationPolicy(recordedContinuationPolicy, now);
  const latestAt = latestEvent?.occurredAt ?? null;
  const currentContract = latest(events, "task_contract_recorded");
  const currentOutcome = latest(events, "owner_outcome_recorded");
  const currentCheckpoint = latest(events, "worker_checkpoint_recorded");
  const currentValidityEvent = latestStoredEvent(events, "verification_validity_recorded");
  const currentValidity = currentValidityEvent?.data.type === "verification_validity_recorded" ? currentValidityEvent.data : undefined;
  const validityScope = latestCorrection?.verification_validity_scope;
  const verifiedBindingStale = Boolean(latestCorrection
    && ["CORRECTION_VERIFIED", "CORRECTION_RESOLVED"].includes(latestCorrection.status)
    && latestCorrection.closure_basis !== "FINDING_INVALIDATED"
    && (currentContract?.contract_id !== latestCorrection.contract_id
      || currentContract.task_contract_sha256 !== latestCorrection.contract_sha256
      || currentOutcome?.owner_outcome_id !== latestCorrection.owner_outcome_id
      || currentOutcome.epoch !== latestCorrection.owner_outcome_epoch
      || currentOutcome.owner_outcome_sha256 !== latestCorrection.owner_outcome_sha256
      || !validityScope
      || !currentValidity
      || currentValidity.context_id !== validityScope.context_id
      || currentValidity.exact_candidate_sha256 !== validityScope.exact_candidate_sha256
      || currentValidity.contract_sha256 !== validityScope.contract_sha256
      || currentValidity.owner_outcome_id !== validityScope.owner_outcome_id
      || currentValidity.owner_outcome_epoch !== validityScope.owner_outcome_epoch
      || currentValidity.owner_outcome_sha256 !== validityScope.owner_outcome_sha256
      || currentValidity.verification_policy_id !== validityScope.verification_policy_id
      || currentValidity.verification_policy_sha256 !== validityScope.verification_policy_sha256
      || currentValidity.evidence_requirement_schema_sha256 !== validityScope.evidence_requirement_schema_sha256
      || currentValidity.assignment_epoch !== validityScope.assignment_epoch
      || currentValidity.target_kind !== validityScope.target_kind
      || currentValidity.target_id !== validityScope.target_id
      || currentValidity.target_epoch !== validityScope.target_epoch
      || currentValidity.verifier_method_version !== validityScope.verifier_method_version
      || currentValidity.worker_run_id !== validityScope.worker_run_id
      || currentCheckpoint?.worker_run_id !== validityScope.worker_run_id
      || JSON.stringify(currentValidity.environment_bindings) !== JSON.stringify(validityScope.environment_bindings)
      || JSON.stringify(currentValidity.source_snapshot_bindings) !== JSON.stringify(validityScope.source_snapshot_bindings)));
  const invalidatingEventId = verifiedBindingStale
    ? firstInvalidatingEventId(events, latestCorrection!, currentValidityEvent)
    : null;
  const effectiveStatus = verifiedBindingStale ? "CORRECTION_REOPENED" : latestCorrection?.status ?? null;
  const activityLeaseCurrent = latestCorrection?.activity_lease_expires_at
    ? new Date(latestCorrection.activity_lease_expires_at).getTime() > now.getTime()
    : false;
  const supersedingState = latestCorrection
    ? ["CORRECTION_BLOCKED", "CORRECTION_FAILED", "DIRECTIVE_SUPERSEDED", "DIRECTIVE_WITHDRAWN", "CORRECTION_REOPENED"].includes(latestCorrection.status)
    : false;
  return {
    correctionAttemptId: latestCorrection?.correction_attempt_id ?? null,
    directiveId: latestCorrection?.directive_id ?? null,
    directiveKind: latestCorrection?.directive_kind ?? null,
    targetKind: latestCorrection?.target_kind ?? null,
    targetId: latestCorrection?.target_id ?? null,
    status: effectiveStatus,
    statusLabel: verifiedBindingStale ? `CORRECTION REOPENED — VALIDITY CHANGED AT ${invalidatingEventId ?? "UNKNOWN EVENT"}`
      : correctionStatusLabel(effectiveStatus, latestCorrection?.directive_kind, latestCorrection?.closure_basis),
    directive: latestCorrection?.directive ?? primaryFinding?.requiredResponse
      ?? (comparison.overallTraffic !== "GREEN" ? comparison.requiredDirective : progress?.required_intervention) ?? null,
    directiveIssued: statuses.has("DIRECTIVE_ISSUED"),
    directiveDelivered: statuses.has("DIRECTIVE_DELIVERED"),
    workerAcknowledged: statuses.has("DIRECTIVE_ACKNOWLEDGED"),
    correctionStarted: statuses.has("CORRECTION_STARTED"),
    correctionInProgress: Boolean(latestCorrection && activityLeaseCurrent && !supersedingState
      && ["CORRECTION_STARTED", "CORRECTION_EVIDENCE_SUBMITTED"].includes(latestCorrection.status)),
    evidenceSubmitted: statuses.has("CORRECTION_EVIDENCE_SUBMITTED"),
    correctionVerified: !verifiedBindingStale && statuses.has("CORRECTION_VERIFIED"),
    correctionResolved: !verifiedBindingStale && statuses.has("CORRECTION_RESOLVED"),
    reopenRequired: verifiedBindingStale,
    reopenTriggerEventId: invalidatingEventId,
    closureBasis: latestCorrection?.closure_basis ?? null,
    requiredEvidence: latestCorrection?.required_evidence ?? [],
    evidenceReceiptIds: latestCorrection?.evidence_receipt_ids ?? [],
    nextReviewTrigger: latestCorrection?.next_review_trigger ?? assessment?.next_review_trigger ?? "next meaningful checkpoint",
    ownerActionType: ownerAction.kind,
    ownerActionText: ownerAction.exact_text,
    ownerAction,
    continuationPolicy,
    latestAt,
    ageMinutes: latestAt ? Math.max(0, Math.round((now.getTime() - new Date(latestAt).getTime()) / 60_000)) : null,
  };
}

function projectLegacyWorker(events: StoredEvent[], now: Date, config: DriftConfig): WorkerState {
  const objectiveEvent = events.find((event) => event.data.type === "objective_created");
  if (!objectiveEvent || objectiveEvent.data.type !== "objective_created") throw new Error("Worker has no objective contract");
  const objective = objectiveEvent.data;
  const heartbeat = [...events].reverse().find((event) => event.data.type === "worker_heartbeat")?.data as WorkerHeartbeatEvent | undefined;
  const verdictEvent = [...events].reverse().find((event) => event.data.type === "supervisor_verdict");
  const verdict = verdictEvent?.data.type === "supervisor_verdict" ? verdictEvent.data : undefined;
  const link = latestSupervisorLink(events);
  const filesTouched = unique(events.flatMap((event) => {
    if (event.data.type === "files_changed") return event.data.files;
    if (event.data.type === "worker_heartbeat") return event.data.files_touched;
    return [];
  }));
  const outOfScope = filesTouched.some((file) => objective.forbidden_scope.some((pattern) => pathMatches(file, pattern)));
  const testRegression = events.some((event) => event.data.type === "tests_run" && event.data.previously_passing_regressed);
  const warnings: WarningSignal[] = [];
  addWarning(warnings, outOfScope, "forbidden_scope", "Worker is changing forbidden paths for the assigned task.", config.weights.outOfScopeTouch, true);
  addWarning(warnings, testRegression, "test_regression", "Previously passing tests regressed.", config.weights.testRegression, true);
  addWarning(warnings, heartbeat?.plan_changed === true && !heartbeat.plan_change_reason, "unexplained_plan_change", "Plan changed without an authority-preserving reason.", config.weights.unexplainedPlanChange);
  addWarning(warnings, heartbeat?.assumptions_materially_changed === true, "invalid_assumption", "A material assumption changed without owner reconciliation.", config.weights.materialAssumptionChange);
  addWarning(warnings, heartbeat?.major_contract_violation === true, "major_contract_violation", "Worker behavior violates the legacy task contract.", 0, true);
  const workerAlignment: WorkerAlignment = warnings.some((warning) => warning.immediate) || verdict?.verdict === "REDIRECT"
    ? "RED" : warnings.length || verdict?.verdict === "WATCH" ? "YELLOW" : "GREEN";
  const overall: Traffic = workerAlignment === "RED" ? "RED" : "UNKNOWN";
  const redirect = [...events].reverse().find((event) => event.data.type === "redirect_issued");
  const redirectData = redirect?.data.type === "redirect_issued" ? redirect.data : undefined;
  const primaryProblem = workerAlignment === "RED"
    ? "Legacy worker evidence shows a contract violation; owner-outcome authority has not yet been migrated."
    : "Owner-source and contract-to-owner alignment have not yet been migrated.";
  const last = events.at(-1) ?? objectiveEvent;
  const terminal: TerminalComparison = {
    stateVectorSha256: "legacy-unavailable",
    workerToContractAlignment: workerAlignment,
    contractToOwnerAlignment: "SOURCE_MISSING",
    overallTraffic: overall,
    contractStatus: "OUTCOME_AUTHORITY_UNRESOLVED",
    ownerOutcomeStatus: "UNKNOWN",
    completionClaimType: "WORKING",
    proposedTerminalState: "IN_PROGRESS",
    decision: "HOLD_SOURCE_AUTHORITY",
    rootTerminalizationAllowed: false,
    requiredDirective: "RECOVER_OWNER_SOURCE",
    reasonCodes: ["LEGACY_SCHEMA", "OUTCOME_AUTHORITY_UNRESOLVED"],
    reconciliationFreshness: "UNKNOWN",
    currentGap: "Migrate the independently sourced owner outcome and reconcile this legacy task contract.",
    unmetOutcomeIds: [],
    unknownOutcomeIds: ["legacy-owner-outcome"],
    nonSatisfyingProxies: ["legacy task_completed event", "numeric alignment"],
    supervisorAssessmentFresh: false,
    outcomeAdvancement: "UNKNOWN",
    strategyEfficacy: "UNCERTAIN",
    reasoningReviewFresh: false,
    activeDirectiveCurrent: false,
    pendingReasoningReview: true,
    unresolvedOwnerObligation: true,
  };
  const supervisorUrl = link?.supervisor_chat_url ?? objective.supervisor_chat_url;
  return {
    id: objective.worker,
    missionId: last.missionId,
    name: objective.worker_name,
    objective: {
      contractId: `legacy:${objective.worker}`,
      revision: 1,
      taskContractSha256: "legacy-unavailable",
      worker: objective.worker,
      worker_name: objective.worker_name,
      goal: objective.goal,
      acceptance_criteria: objective.acceptance_criteria,
      allowed_scope: objective.allowed_scope,
      forbidden_scope: objective.forbidden_scope,
      expected_max_diff_lines: objective.expected_max_diff_lines,
      effectiveFinishLine: "Legacy completion boundary — nonterminal until reconciled",
      ownerOutcomeId: null,
      ownerOutcomeEpoch: null,
      supervisor_chat_url: objective.supervisor_chat_url,
      supervisor_chat_label: objective.supervisor_chat_label,
      legacy: true,
    },
    supervisorChatUrl: supervisorUrl,
    supervisorChatLabel: link?.supervisor_chat_label ?? objective.supervisor_chat_label,
    supervisorChatIsPlaceholder: /replace-|example|placeholder/i.test(supervisorUrl),
    status: heartbeat?.status ?? "working",
    health: overall,
    workerToContractAlignment: workerAlignment,
    contractToOwnerAlignment: "SOURCE_MISSING",
    overallTraffic: overall,
    alignment: Math.round((verdict?.alignment ?? 0) * 100),
    driftScore: warnings.reduce((sum, warning) => sum + warning.points, 0),
    verdict: verdict?.verdict ?? "HOLD",
    primaryProblemSummary: primaryProblem,
    whyItMatters: "Legacy worker/task alignment cannot establish that the derived contract still preserves the owner outcome.",
    activeFindings: warnings.map((warning, index) => ({
      id: `legacy:${objective.worker}:${index}`,
      groupId: `legacy:${objective.worker}:authority`,
      type: warning.code.toUpperCase(),
      severity: warning.immediate ? "BLOCKING" : "MATERIAL",
      statement: warning.label,
      violatedRequirement: "Legacy task contract or current owner authority",
      evidenceRefs: ["legacy-event-ledger"],
      reasonCodes: [`LEGACY.${warning.code.toUpperCase()}`],
      status: "OPEN",
      requiredResponse: redirectData?.corrective_action ?? "Recover owner authority and reconcile the worker trajectory.",
    })),
    correction: {
      correctionAttemptId: redirectData ? `legacy-attempt:${redirect!.sequence}` : null,
      directiveId: redirectData ? `legacy-redirect:${redirect!.sequence}` : null,
      directiveKind: redirectData ? "WORKER_REDIRECT" : null,
      targetKind: redirectData ? "WORKER_RUN" : null,
      targetId: redirectData ? objective.worker : null,
      status: redirectData ? "DIRECTIVE_ISSUED" : null,
      statusLabel: correctionStatusLabel(redirectData ? "DIRECTIVE_ISSUED" : null, redirectData ? "WORKER_REDIRECT" : null),
      directive: redirectData?.corrective_action ?? null,
      directiveIssued: Boolean(redirectData),
      directiveDelivered: false,
      workerAcknowledged: false,
      correctionStarted: false,
      correctionInProgress: false,
      evidenceSubmitted: false,
      correctionVerified: false,
      correctionResolved: false,
      reopenRequired: false,
      reopenTriggerEventId: null,
      closureBasis: null,
      requiredEvidence: [],
      evidenceReceiptIds: [],
      nextReviewTrigger: verdict?.review_after ?? "after authority migration",
      ownerActionType: "MANUAL_INTERVENTION_REQUIRED",
      ownerActionText: "Legacy owner-action telemetry is insufficient; migrate the worker before assuming owner action NONE.",
      ownerAction: {
        kind: "MANUAL_INTERVENTION_REQUIRED",
        exact_text: "Legacy owner-action telemetry is insufficient; migrate the worker before assuming owner action NONE.",
        reason_code: "OWNER.ACTION_TELEMETRY_LEGACY",
        subject_id: `legacy:${objective.worker}`,
        blocking_scope: ["owner-action projection"],
        source_event_ids: [last.eventId],
        due_at: null,
        escalation_at: null,
        status: "OPEN",
      },
      continuationPolicy: {
        mode: workerAlignment === "GREEN" ? "SAFE_WITHIN_SCOPE" : "UNKNOWN",
        allowed_scope: workerAlignment === "GREEN" ? objective.allowed_scope : [],
        forbidden_scope: objective.forbidden_scope,
        preconditions: ["Migrate owner authority and record a current scoped continuation policy"],
        basis_finding_ids: [],
        basis_evidence_ids: [],
        expires_at: null,
        recheck_trigger: "authority migration",
      },
      latestAt: redirect?.occurredAt ?? null,
      ageMinutes: redirect ? Math.max(0, Math.round((now.getTime() - new Date(redirect.occurredAt).getTime()) / 60_000)) : null,
    },
    currentStep: heartbeat?.current_step ?? "Awaiting first worker checkpoint",
    completedSteps: heartbeat?.completed_steps ?? [],
    nextSteps: heartbeat?.next_steps ?? [],
    planChanged: heartbeat?.plan_changed ?? false,
    planChangeReason: heartbeat?.plan_change_reason ?? null,
    blocker: heartbeat?.blocker ?? null,
    assumptions: heartbeat?.assumptions ?? [],
    filesTouched,
    diffLines: heartbeat?.diff_lines ?? 0,
    commits: events.flatMap((event) => event.data.type === "commit_created" ? [{ sha: event.data.sha, message: event.data.message }] : []),
    tests: heartbeat?.tests ?? { passing: 0, failing: 0, lint: "not_run", build: "not_run" },
    warnings,
    supervisor: {
      verdict: verdict?.verdict ?? "HOLD",
      reason: verdict?.reason ?? "No legacy supervisor assessment is available.",
      correctiveAction: redirectData?.corrective_action ?? verdict?.corrective_action ?? null,
      reviewAfter: verdict?.review_after ?? "after authority migration",
      assessmentFresh: false,
    },
    sourceReceipt: { receiptId: null, capability: "UNKNOWN", comparison: "UNKNOWN", freshness: "UNKNOWN", limitations: ["Legacy event has no independent owner-source receipt."] },
    ownerOutcome: { id: null, epoch: null, sha256: null, normalizedResult: "Owner outcome unavailable in legacy schema.", currentGap: terminal.currentGap, requiredOutcomes: [] },
    reconciliationId: null,
    terminal,
    research: null,
    supervisionRoute: { lane: "DETERMINISTIC", sessionId: null, status: "ROLLOVER_REQUIRED", substantiveTurns: 0, hardMaximum: 3, nextReviewTrigger: "after authority migration", handoffCapsuleId: null },
    progress: {
      outcomeAdvancement: "UNKNOWN", strategyId: null, strategyEfficacy: "UNCERTAIN",
      targetEvidence: "Owner outcome target unavailable in legacy schema.", latestEvidence: "No direct progress receipt.",
      bestEvidence: "No direct progress receipt.", changeFromPrevious: null, supportingWork: [],
      nextDecisionTrigger: "after authority migration", requiredIntervention: "RECORD_OUTCOME_PROGRESS",
      sameStrategyContinuationAllowed: false, measurementFreshness: "UNKNOWN",
    },
    executionSupervision: {
      surface: "UNASSIGNED", sessionId: null, chatEpoch: null, lastReviewAt: null, reviewFreshness: "UNKNOWN",
      activeDirectiveId: null, directiveStatus: "MISSING", directiveObjective: "No chat-authored directive in legacy schema.",
      codexExecutionState: "UNKNOWN_LEGACY_EXECUTION",
      stopBoundary: [], latestReceiptId: null, receiptClaim: "No execution receipt in legacy schema.",
      pendingReasoningReview: true, proEscalationState: "NOT_REQUIRED", alerts: ["SUPERVISION_DIRECTIVE_MISSING"],
    },
    lastCheckpointAt: last.occurredAt,
    timeline: [...events].reverse(),
  };
}

export function summarizeChanges(events: StoredEvent[], lastViewedEventId: number, now = new Date()): string {
  const changed = events.filter((event) => event.sequence > lastViewedEventId && event.worker);
  if (changed.length === 0) return "No new worker or supervisor events since your last review.";
  const before = new Map(projectWorkers(events.filter((event) => event.sequence <= lastViewedEventId), now).map((worker) => [worker.id, worker]));
  const after = new Map(projectWorkers(events, now).map((worker) => [worker.id, worker]));
  const statements = unique(changed.map((event) => event.worker).filter((worker): worker is string => Boolean(worker))).map((id) => {
    const current = after.get(id);
    if (!current) return null;
    const previous = before.get(id);
    if (!previous) return `${current.name} entered the queue as ${current.overallTraffic.toLowerCase()}: ${current.primaryProblemSummary ?? "no active problem"}.`;
    if (previous.overallTraffic !== current.overallTraffic) return `${current.name} moved from ${previous.overallTraffic.toLowerCase()} to ${current.overallTraffic.toLowerCase()}: ${current.primaryProblemSummary ?? "state changed"}.`;
    if (previous.correction.status !== current.correction.status) return `${current.name} correction is now ${current.correction.statusLabel.toLowerCase()}.`;
    return `${current.name} reported a new durable checkpoint and remains ${current.overallTraffic.toLowerCase()}.`;
  }).filter(Boolean);
  return statements.join(" ");
}

export function attentionPriority(worker: WorkerState): number {
  if (["DECISION_REQUIRED", "MANUAL_INTERVENTION_REQUIRED"].includes(worker.correction.ownerActionType)
    && (worker.research || worker.activeFindings.some((finding) => /SAFETY|PRIVACY|RELEASE/.test(finding.type)))) return 10;
  if (worker.activeFindings.some((finding) => finding.type === "WORK_CONTINUED_AFTER_REDIRECT")) return 20;
  if (worker.correction.directiveKind === "WORKER_REDIRECT" && worker.correction.status === "DIRECTIVE_DELIVERED" && !worker.correction.workerAcknowledged) return 30;
  if (worker.contractToOwnerAlignment === "DIVERGED") return 40;
  if (worker.terminal.reasonCodes.some((code) => /EVIDENCE|CANDIDATE/.test(code)) && worker.overallTraffic === "RED") return 50;
  if (worker.overallTraffic === "RED") return 60;
  if (worker.overallTraffic === "YELLOW") return 70;
  if (worker.status === "blocked") return 80;
  if (worker.overallTraffic === "UNKNOWN") return 85;
  return 90;
}

function latest<T extends MissionControlEventV2["type"]>(events: StoredEvent[], type: T): Extract<MissionControlEventV2, { type: T }> | undefined {
  const data = [...events].reverse().find((event) => event.data.type === type)?.data;
  return data?.type === type ? data as Extract<MissionControlEventV2, { type: T }> : undefined;
}

function latestSupervisorLink(events: StoredEvent[]) {
  const data = [...events].reverse().find((event) => event.data.type === "supervisor_chat_link_set")?.data;
  return data?.type === "supervisor_chat_link_set" ? data : undefined;
}

function checkpointEvent(events: StoredEvent[]): StoredEvent | undefined {
  return [...events].reverse().find((event) => event.data.type === "worker_checkpoint_recorded" || event.data.type === "worker_heartbeat");
}

function primaryFindingEvent(events: StoredEvent[], findingId?: string) {
  if (!findingId) return undefined;
  const data = [...events].reverse().find((event) => event.data.type === "finding_recorded" && event.data.finding_id === findingId)?.data;
  return data?.type === "finding_recorded" ? data : undefined;
}

function contractProblem(comparison: TerminalComparison): string | null {
  if (comparison.contractToOwnerAlignment === "DIVERGED") return "The worker may be following a derived contract that does not preserve the current owner outcome.";
  if (comparison.contractToOwnerAlignment === "SOURCE_MISSING") return "Independent owner-source authority is missing, so root completion cannot be evaluated.";
  if (comparison.contractToOwnerAlignment === "PARTIAL") return "Owner-source or reconciliation evidence is incomplete or stale.";
  return null;
}

function researchProblem(research?: Extract<MissionControlEventV2, { type: "research_verdict_recorded" }>): string | null {
  if (!research) return null;
  if (research.scientific_conclusion === "FAIL") return research.unsupported_inference ?? "The claimed scientific inference is not supported.";
  if (research.release_adequacy === "FAIL") return research.publication_barrier ?? "Release requirements are not satisfied.";
  return null;
}

function researchWhy(research?: Extract<MissionControlEventV2, { type: "research_verdict_recorded" }>): string | null {
  if (!research || research.release_permission) return null;
  return "Operational protocol, scientific conclusion, and release adequacy are independent planes; a failed plane blocks release.";
}

function progressProblem(
  progress: Extract<MissionControlEventV2, { type: "outcome_progress_recorded" }> | undefined,
  outcomeAdvancement: TerminalComparison["outcomeAdvancement"],
): string | null {
  if (!progress) return "No current outcome-progress receipt is available from the reasoning supervisor.";
  if (outcomeAdvancement === "REGRESSING") return `Direct owner-outcome evidence regressed under ${progress.strategy_id}.`;
  if (outcomeAdvancement === "FLAT") return `Owner-outcome evidence is flat under ${progress.strategy_id}; strategy efficacy requires review.`;
  if (outcomeAdvancement === "BLOCKED_EXTERNAL") return `Direct owner-outcome progress is blocked on an external dependency under ${progress.strategy_id}.`;
  if (outcomeAdvancement === "NOT_YET_MEASURABLE") return `Direct owner-outcome progress is not yet measurable under ${progress.strategy_id}.`;
  if (outcomeAdvancement === "UNKNOWN") return `Owner-outcome progress is unknown under ${progress.strategy_id}; obtain decision-changing evidence.`;
  if (progress.measurement_freshness === "OVERDUE") return "Promised direct owner-outcome evidence is overdue.";
  if (["FAILED", "EXHAUSTED", "REPLACEMENT_REQUIRED"].includes(progress.strategy_efficacy)) {
    return `The current strategy is ${progress.strategy_efficacy.toLowerCase().replaceAll("_", " ")}.`;
  }
  return null;
}

function progressWhy(
  progress: Extract<MissionControlEventV2, { type: "outcome_progress_recorded" }> | undefined,
  outcomeAdvancement: TerminalComparison["outcomeAdvancement"],
): string | null {
  if (!progress || outcomeAdvancement === "ADVANCING") return null;
  return `Local compliance and supporting work cannot substitute for direct owner-outcome progress. Required intervention: ${progress.required_intervention}.`;
}

function terminalProblem(comparison: TerminalComparison): string | null {
  if (comparison.overallTraffic === "GREEN") return null;
  if (comparison.reasonCodes.includes("SUPERVISION_DIRECTIVE_MISSING")) {
    return "No current chat-authored execution directive is bound to this worker and owner-outcome epoch.";
  }
  if (comparison.reasonCodes.includes("REASONING_SUPERVISOR_MISSING")) return "No current independent reasoning supervisor is recorded for this worker.";
  if (comparison.reasonCodes.includes("REASONING_REVIEW_OVERDUE")) return "The independent reasoning-supervisor review is overdue.";
  if (comparison.reasonCodes.includes("PENDING_REASONING_REVIEW")) return "Execution reached its directive boundary; the receipt awaits independent reasoning review in a nonterminal handoff that must resume automatically.";
  if (comparison.reasonCodes.includes("OWNER_ACTION_REQUIRED")) return "A recorded owner obligation is open and blocks the affected scope.";
  if (comparison.reasonCodes.includes("SUPERVISOR_ASSESSMENT_STALE")) return "The supervisor assessment does not cover the current durable authority state.";
  return `Mission Control is holding this worker because ${comparison.reasonCodes.join(", ") || "the current control state is incomplete"}.`;
}

function terminalWhy(comparison: TerminalComparison): string | null {
  if (comparison.overallTraffic === "GREEN") return null;
  return `Fail-closed control reasons: ${comparison.reasonCodes.join(", ") || "current authority or evidence is incomplete"}. Required response: ${comparison.requiredDirective}.`;
}

function evidenceLabel(evidence?: { state: string; numeric_value: number | null; unit: string | null }): string {
  if (!evidence) return "Not recorded";
  return evidence.numeric_value === null ? evidence.state : `${evidence.state}: ${evidence.numeric_value}${evidence.unit ? ` ${evidence.unit}` : ""}`;
}

function effectiveOwnerAction(
  recorded: OwnerActionObligation | undefined,
  now: Date,
  events: StoredEvent[],
  correction?: Extract<MissionControlEventV2, { type: "correction_lifecycle_recorded" }>,
  directiveConflict = false,
): OwnerActionObligation {
  const sourceEventId = events.at(-1)?.eventId ?? "projection:missing-owner-action";
  if (directiveConflict) return {
    kind: "MANUAL_INTERVENTION_REQUIRED",
    exact_text: "Multiple active directives conflict; reconcile them before correction continues.",
    reason_code: "OWNER.ACTIVE_DIRECTIVE_CONFLICT",
    subject_id: `worker:${events.at(-1)?.worker ?? "unknown"}`,
    blocking_scope: ["correction execution"],
    source_event_ids: [sourceEventId],
    due_at: null,
    escalation_at: null,
    status: "OPEN",
  };
  if (!recorded) return {
    kind: "MANUAL_INTERVENTION_REQUIRED",
    exact_text: "Owner-action telemetry is missing; repair observability before assuming no action is required.",
    reason_code: "OWNER.ACTION_TELEMETRY_MISSING",
    subject_id: `worker:${events.at(-1)?.worker ?? "unknown"}`,
    blocking_scope: ["owner-action projection"],
    source_event_ids: [sourceEventId],
    due_at: null,
    escalation_at: null,
    status: "OPEN",
  };
  if (recorded.kind === "NONE" && new Date(recorded.next_due_at).getTime() <= now.getTime()) return {
    kind: "MANUAL_INTERVENTION_REQUIRED",
    exact_text: `The non-owner next action is overdue: ${recorded.next_action}`,
    reason_code: "OWNER.NONE_NEXT_ACTION_OVERDUE",
    subject_id: recorded.subject_id,
    blocking_scope: recorded.blocking_scope,
    source_event_ids: recorded.source_event_ids,
    due_at: recorded.next_due_at,
    escalation_at: recorded.escalation_at,
    status: "OPEN",
  };
  if (recorded.kind === "NONE" && !namedNextActorIsCurrent(recorded, events, correction)) return {
    kind: "MANUAL_INTERVENTION_REQUIRED",
    exact_text: `The named non-owner actor (${recorded.next_actor_id}) is missing, no longer owns the assignment, or lacks adequate telemetry.`,
    reason_code: "OWNER.NONE_NEXT_ACTOR_NOT_CURRENT",
    subject_id: recorded.subject_id,
    blocking_scope: recorded.blocking_scope,
    source_event_ids: recorded.source_event_ids,
    due_at: null,
    escalation_at: recorded.escalation_at,
    status: "OPEN",
  };
  if (recorded.kind === "NONE" && correction?.status === "DIRECTIVE_DELIVERY_FAILED" && correction.retry_possible !== true) return {
    kind: "MANUAL_INTERVENTION_REQUIRED",
    exact_text: "Directive delivery failed and no working automated retry owns the next transition.",
    reason_code: "OWNER.DIRECTIVE_DELIVERY_FAILED_NO_RETRY",
    subject_id: recorded.subject_id,
    blocking_scope: recorded.blocking_scope,
    source_event_ids: recorded.source_event_ids,
    due_at: null,
    escalation_at: recorded.escalation_at,
    status: "OPEN",
  };
  if (recorded.kind === "NONE" && correction?.status === "CORRECTION_BLOCKED"
    && correction.blocker_actor_id?.toLowerCase().includes("owner")) return {
    kind: "MANUAL_INTERVENTION_REQUIRED",
    exact_text: `Correction is blocked on owner intervention: ${correction.exception_reason ?? "blocker details unavailable"}`,
    reason_code: "OWNER.CORRECTION_BLOCKED_BY_OWNER",
    subject_id: recorded.subject_id,
    blocking_scope: recorded.blocking_scope,
    source_event_ids: recorded.source_event_ids,
    due_at: null,
    escalation_at: recorded.escalation_at,
    status: "OPEN",
  };
  return recorded;
}

function pendingReasoningReviewOwnerAction(events: StoredEvent[]): OwnerActionObligation | undefined {
  const receipt = latestStoredEvent(events, "execution_receipt_recorded");
  if (!receipt) return undefined;
  const nextDueAt = new Date(new Date(receipt.occurredAt).getTime() + 10 * 60_000).toISOString();
  return {
    kind: "NONE",
    exact_text: "No owner action is required; the current worker/controller owns receipt routing, reasoning review, and automatic continuation.",
    reason_code: "OWNER.NOT_REQUIRED.REASONING_HANDOFF_CONTROLLER_OWNS_NEXT_TRANSITION",
    subject_id: `reasoning-handoff:${receipt.worker}`,
    blocking_scope: [],
    source_event_ids: [receipt.eventId],
    due_at: null,
    escalation_at: nextDueAt,
    status: "NOT_REQUIRED",
    none_reason_code: "NON_OWNER_ACTOR_OWNS_NEXT_TRANSITION",
    next_actor_kind: "WORKER",
    next_actor_id: `worker:${receipt.worker}`,
    next_action: "Route the execution receipt, keep one reasoning request live, import the matching directive, and resume automatically.",
    next_trigger: "execution receipt recorded",
    next_due_at: nextDueAt,
    escalation_policy: "Escalate only if the controller lease or reasoning surface becomes unavailable; do not ask the owner to send continue.",
  };
}

function namedNextActorIsCurrent(
  action: Extract<OwnerActionObligation, { kind: "NONE" }>,
  events: StoredEvent[],
  correction?: Extract<MissionControlEventV2, { type: "correction_lifecycle_recorded" }>,
): boolean {
  const worker = events.find((event) => event.worker)?.worker;
  if (!worker) return false;
  if (action.next_actor_kind === "WORKER") {
    const checkpoint = latest(events, "worker_checkpoint_recorded");
    return action.next_actor_id === `worker:${worker}` && Boolean(checkpoint)
      && (!correction || checkpoint?.worker_run_id === correction.worker_run_id);
  }
  if (action.next_actor_kind === "SUPERVISOR") {
    return action.next_actor_id === `supervisor:${worker}`
      && Boolean(latest(events, "supervisor_assessment_recorded") && latest(events, "supervision_route_recorded"));
  }
  if (action.next_actor_kind === "CONTRACT_ISSUER") {
    return action.next_actor_id === `contract_issuer:${worker}` && Boolean(latest(events, "task_contract_recorded"));
  }
  if (action.next_actor_kind === "VERIFIER") {
    return action.next_actor_id === `verifier:${worker}`
      && Boolean(latest(events, "research_verdict_recorded") || correction?.required_evidence.length);
  }
  return action.next_actor_id === `automation:${worker}`
    && events.some((event) => event.data.type === "symphony_runtime_observed");
}

function latestStoredEvent<T extends MissionControlEventV2["type"]>(events: StoredEvent[], type: T): StoredEvent | undefined {
  return [...events].reverse().find((event) => event.data.type === type);
}

function firstInvalidatingEventId(
  events: StoredEvent[],
  correction: Extract<MissionControlEventV2, { type: "correction_lifecycle_recorded" }>,
  currentValidityEvent?: StoredEvent,
): string | null {
  const scope = correction.verification_validity_scope;
  if (!scope) return latestStoredEvent(events, "correction_lifecycle_recorded")?.eventId ?? null;
  if (currentValidityEvent?.data.type === "verification_validity_recorded" && currentValidityEvent.data.context_id !== scope.context_id) {
    return currentValidityEvent.eventId;
  }
  const candidates = [
    latestStoredEvent(events, "task_contract_recorded"),
    latestStoredEvent(events, "owner_outcome_recorded"),
    latestStoredEvent(events, "worker_checkpoint_recorded"),
  ].filter((event): event is StoredEvent => Boolean(event));
  return candidates.find((event) => event.occurredAt >= (latestStoredEvent(events, "correction_lifecycle_recorded")?.occurredAt ?? ""))?.eventId
    ?? candidates.at(-1)?.eventId
    ?? null;
}

function unknownContinuationPolicy(): ContinuationPolicy {
  return {
    mode: "UNKNOWN",
    allowed_scope: [],
    forbidden_scope: ["all unverified work"],
    preconditions: ["Record a current scoped continuation policy"],
    basis_finding_ids: [],
    basis_evidence_ids: [],
    expires_at: null,
    recheck_trigger: "continuation authority recorded",
  };
}

function effectiveContinuationPolicy(recorded: ContinuationPolicy, now: Date): ContinuationPolicy {
  if (!recorded.expires_at || new Date(recorded.expires_at).getTime() > now.getTime()) return recorded;
  return {
    mode: "UNKNOWN",
    allowed_scope: [],
    forbidden_scope: unique([...recorded.forbidden_scope, "all unverified work"]),
    preconditions: unique([
      ...recorded.preconditions,
      `Recorded continuation authority expired at ${recorded.expires_at}`,
      "Record a current scoped continuation policy before work continues",
    ]),
    basis_finding_ids: recorded.basis_finding_ids,
    basis_evidence_ids: recorded.basis_evidence_ids,
    expires_at: recorded.expires_at,
    recheck_trigger: recorded.recheck_trigger,
  };
}

function alignmentIndex(alignment: WorkerAlignment): number {
  return alignment === "GREEN" ? 100 : alignment === "YELLOW" ? 65 : alignment === "RED" ? 20 : 0;
}

function severityScore(severity?: FindingProjection["severity"]): number {
  return severity === "CRITICAL" ? 4 : severity === "BLOCKING" ? 3 : severity === "MATERIAL" ? 2 : severity === "INFO" ? 1 : 0;
}

function addWarning(target: WarningSignal[], condition: boolean, code: string, label: string, points: number, immediate = false) {
  if (condition) target.push({ code, label, points, immediate });
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function pathMatches(file: string, pattern: string): boolean {
  const prefix = pattern.replace(/\*\*.*$/, "").replace(/\*.*$/, "").replace(/\/$/, "");
  return prefix.length > 0 && (file === prefix || file.startsWith(`${prefix}/`));
}
