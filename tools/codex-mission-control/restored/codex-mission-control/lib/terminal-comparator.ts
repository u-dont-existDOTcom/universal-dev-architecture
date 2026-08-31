import { canonicalJson, sha256 } from "./canonical";
import type {
  CompletionClaimType,
  ContractOwnerAlignment,
  MissionControlEventV2,
  StoredEvent,
  Traffic,
  WorkerAlignment,
  OutcomeAdvancement,
  StrategyEfficacy,
} from "./schema";
import { effectiveOutcomeAdvancement, effectiveStrategyEfficacy } from "./progress-invariants";

export type ContractStatus = "VALID" | "CONTRACT_LAUNDERING" | "OUTCOME_AUTHORITY_UNRESOLVED" | "UNKNOWN";
export type OwnerOutcomeStatus = "MET" | "UNMET" | "UNKNOWN";
export type TerminalDecision =
  | "CONTINUE_WORK"
  | "HOLD_SOURCE_AUTHORITY"
  | "HOLD_RECONCILIATION"
  | "HOLD_COMPLETION_EVIDENCE"
  | "REJECT_ROOT_TERMINALIZATION"
  | "ALLOW_SUBTASK_CLOSE_PARENT_OPEN"
  | "ALLOW_EARLY_OWNER_REVIEW_PARENT_OPEN"
  | "ALLOW_ROOT_CLOSE"
  | "ALLOW_OWNER_CANCELLATION";

export interface TerminalComparison {
  stateVectorSha256: string;
  workerToContractAlignment: WorkerAlignment;
  contractToOwnerAlignment: ContractOwnerAlignment;
  overallTraffic: Traffic;
  contractStatus: ContractStatus;
  ownerOutcomeStatus: OwnerOutcomeStatus;
  completionClaimType: CompletionClaimType;
  proposedTerminalState: string;
  decision: TerminalDecision;
  rootTerminalizationAllowed: boolean;
  requiredDirective: string;
  reasonCodes: string[];
  reconciliationFreshness: "CURRENT" | "STALE" | "UNKNOWN";
  currentGap: string;
  unmetOutcomeIds: string[];
  unknownOutcomeIds: string[];
  nonSatisfyingProxies: string[];
  supervisorAssessmentFresh: boolean;
  outcomeAdvancement: OutcomeAdvancement;
  strategyEfficacy: StrategyEfficacy;
  reasoningReviewFresh: boolean;
  activeDirectiveCurrent: boolean;
  pendingReasoningReview: boolean;
  unresolvedOwnerObligation: boolean;
}

const authorityVectorTypes = new Set<MissionControlEventV2["type"]>([
  "owner_source_recorded",
  "owner_outcome_recorded",
  "task_contract_recorded",
  "objective_reconciliation_recorded",
  "worker_checkpoint_recorded",
  "evidence_receipt_recorded",
  "finding_recorded",
  "finding_status_changed",
  "completion_claim_recorded",
  "owner_decision_recorded",
  "verification_validity_recorded",
  "research_verdict_recorded",
  "reasoning_supervision_recorded",
  "execution_directive_recorded",
  "outcome_progress_recorded",
  "supervision_alert_recorded",
]);

const terminalVectorTypes = new Set<MissionControlEventV2["type"]>([
  ...authorityVectorTypes,
  "supervisor_assessment_recorded",
  "correction_lifecycle_recorded",
  "supervision_route_recorded",
  "execution_receipt_recorded",
  "codex_execution_started",
]);

export function authorityStateVectorHash(events: StoredEvent[]): string {
  return vectorHash(events, authorityVectorTypes);
}

export function terminalStateVectorHash(events: StoredEvent[]): string {
  return vectorHash(events, terminalVectorTypes);
}

export function compareTerminalState(events: StoredEvent[]): TerminalComparison {
  const outcome = latest(events, "owner_outcome_recorded");
  const sourceEvent = outcome
    ? [...events].reverse().find((event) => event.data.type === "owner_source_recorded" && event.data.receipt_id === outcome.source_receipt_id)
    : undefined;
  const source = sourceEvent?.data.type === "owner_source_recorded" ? sourceEvent.data : undefined;
  const contract = latest(events, "task_contract_recorded");
  const reconciliation = latest(events, "objective_reconciliation_recorded");
  const assessment = latest(events, "supervisor_assessment_recorded");
  const claim = latest(events, "completion_claim_recorded");
  const research = latest(events, "research_verdict_recorded");
  const reasoningRecord = latest(events, "reasoning_supervision_recorded");
  const reasoning = reasoningRecord && outcome
    && reasoningRecord.owner_outcome_id === outcome.owner_outcome_id
    && reasoningRecord.owner_outcome_epoch === outcome.epoch
    && reasoningRecord.owner_outcome_sha256 === outcome.owner_outcome_sha256
    ? reasoningRecord : undefined;
  const directive = latest(events, "execution_directive_recorded");
  const receipt = latest(events, "execution_receipt_recorded");
  const progressRecord = latest(events, "outcome_progress_recorded");
  const progress = progressRecord && outcome && reasoning
    && progressRecord.owner_outcome_id === outcome.owner_outcome_id
    && progressRecord.owner_outcome_epoch === outcome.epoch
    && progressRecord.owner_outcome_sha256 === outcome.owner_outcome_sha256
    && progressRecord.reviewed_by_session_id === reasoning.reasoning_supervisor_session_id
    && progressRecord.reviewed_chat_epoch === reasoning.reasoning_supervisor_chat_epoch
    && progressRecord.strategy_id === reasoning.current_strategy_id
    ? progressRecord : undefined;
  const alertStatus = new Map<string, Extract<MissionControlEventV2, { type: "supervision_alert_recorded" }>>();
  for (const event of events) if (event.data.type === "supervision_alert_recorded") alertStatus.set(event.data.alert_id, event.data);
  const activeSupervisionAlerts = [...alertStatus.values()].filter((alert) => alert.status === "OPEN");
  const hardSupervisionAlert = activeSupervisionAlerts.some((alert) => [
    "CODEX_RUNNING_WITHOUT_CURRENT_DIRECTIVE", "DIRECTIVE_SCOPE_EXCEEDED", "CODEX_AUTHORED_STRATEGY_CHANGE",
    "CODEX_AUTHORED_SUPERVISORY_VERDICT", "CODEX_CONTINUED_AFTER_STOP_TRIGGER", "CODEX_SUBSTANTIVE_PROSE_AUTHORSHIP_UNAUTHORIZED",
  ].includes(alert.code));
  const ownerDecision = claim?.owner_decision_id
    ? events.find((event) => event.data.type === "owner_decision_recorded"
      && event.data.owner_decision_id === claim.owner_decision_id)?.data
    : undefined;
  const evidence = events
    .filter((event) => event.data.type === "evidence_receipt_recorded")
    .map((event) => event.data as Extract<MissionControlEventV2, { type: "evidence_receipt_recorded" }>);

  const reasonCodes: string[] = [];
  const requiredOutcomeIds = new Set(outcome?.required_outcomes.map((item) => item.id) ?? []);
  const reconciliationRows = new Map(reconciliation?.matrix.map((row) => [row.owner_requirement_id, row]) ?? []);
  const contractDiverged = Boolean(
    contract && (
      contract.omitted_owner_outcome_ids.length
      || contract.weakened_owner_outcome_ids.length
      || contract.proxy_substitutions.length
    )
  ) || Boolean(reconciliation?.matrix.some((row) => ["UNMAPPED", "WEAKENED", "PROXY_SUBSTITUTED", "AMBIGUOUS"].includes(row.status)))
    || Boolean(outcome && [...requiredOutcomeIds].some((id) => !reconciliationRows.has(id)));

  let contractToOwnerAlignment: ContractOwnerAlignment;
  if (contractDiverged) {
    contractToOwnerAlignment = "DIVERGED";
  } else if (!source || !outcome || !contract || !reconciliation) {
    contractToOwnerAlignment = "SOURCE_MISSING";
  } else if (
    source.owner_request_id !== outcome.owner_request_id
    || source.source_sha256 !== outcome.owner_source_sha256
    || source.comparison === "MISMATCH"
    || contract.owner_outcome_id !== outcome.owner_outcome_id
    || contract.owner_outcome_epoch !== outcome.epoch
    || contract.owner_outcome_sha256 !== outcome.owner_outcome_sha256
    || reconciliation.owner_outcome_sha256 !== outcome.owner_outcome_sha256
    || reconciliation.task_contract_sha256 !== contract.task_contract_sha256
  ) {
    contractToOwnerAlignment = "DIVERGED";
  } else if (
    !["INDEPENDENT_SOURCE_VERIFIED", "OWNER_REATTESTED"].includes(source.receipt_capability)
    || source.comparison !== "MATCH"
    || source.freshness !== "CURRENT"
    || reconciliation.freshness !== "CURRENT"
  ) {
    contractToOwnerAlignment = "PARTIAL";
  } else {
    contractToOwnerAlignment = "MATCH";
  }

  const workerToContractAlignment = assessment?.worker_to_contract_alignment ?? "UNKNOWN";
  const outcomeStatuses = outcome?.required_outcomes ?? [];
  const unmetOutcomeIds = [...new Set([
    ...outcomeStatuses.filter((item) => item.status === "UNMET").map((item) => item.id),
    ...(reconciliation?.unmet_owner_outcome_ids ?? []),
  ])];
  const unknownOutcomeIds = [...new Set([
    ...outcomeStatuses.filter((item) => item.status === "UNKNOWN").map((item) => item.id),
    ...(reconciliation?.unknown_owner_outcome_ids ?? []),
    ...outcomeStatuses.filter((item) => item.terminal_required && item.status === "MET"
      && !hasAdequateDirectEvidence(item.direct_evidence_receipt_ids, evidence)).map((item) => item.id),
  ])].filter((id) => !unmetOutcomeIds.includes(id));
  const ownerOutcomeStatus: OwnerOutcomeStatus = unmetOutcomeIds.length ? "UNMET" : unknownOutcomeIds.length || !outcome ? "UNKNOWN" : "MET";
  const completionClaimType = claim?.completion_claim_type ?? "WORKING";
  const proposedTerminalState = claim?.proposed_terminal_state ?? "IN_PROGRESS";
  const terminalAdjacent = ["READY_FOR_RELEASE", "OWNER_OUTCOME_ACHIEVED"].includes(completionClaimType);
  const rootAchievementClaimed = completionClaimType === "OWNER_OUTCOME_ACHIEVED";
  const rootCancellationClaimed = completionClaimType === "CANCELED_BY_OWNER";
  const gapOpen = outcome?.gap_status !== "NONE" || reconciliation?.gap_status !== "NONE";
  const supervisorAssessmentFresh = Boolean(assessment && assessment.reviewed_state_vector_sha256 === authorityStateVectorHash(events));
  const outcomeAdvancement = effectiveOutcomeAdvancement(progress);
  const strategyEfficacy = effectiveStrategyEfficacy(progress, outcomeAdvancement);
  const reasoningReviewFresh = reasoning?.review_freshness === "CURRENT";
  const activeDirectiveCurrent = Boolean(directive && directive.status === "ACTIVE" && reasoning
    && directive.owner_outcome_id === outcome?.owner_outcome_id
    && directive.owner_outcome_epoch === outcome?.epoch
    && directive.owner_outcome_sha256 === outcome?.owner_outcome_sha256
    && reasoning.owner_outcome_id === directive.owner_outcome_id
    && reasoning.owner_outcome_epoch === directive.owner_outcome_epoch
    && reasoning.owner_outcome_sha256 === directive.owner_outcome_sha256
    && directive.strategy_id === reasoning.current_strategy_id
    && directive.reasoning_supervisor_session_id === reasoning.reasoning_supervisor_session_id
    && directive.reasoning_chat_epoch === reasoning.reasoning_supervisor_chat_epoch
    && directive.chat_decision_id === reasoning.decision_id);
  const latestReceiptEvent = latestStored(events, "execution_receipt_recorded");
  const latestReasoningReviewEvent = [reasoning ? latestStored(events, "reasoning_supervision_recorded") : undefined,
    progress ? latestStored(events, "outcome_progress_recorded") : undefined]
    .filter((event): event is StoredEvent => Boolean(event)).sort((left, right) => right.sequence - left.sequence)[0];
  const pendingReasoningReview = Boolean(latestReceiptEvent && (!latestReasoningReviewEvent || latestReasoningReviewEvent.sequence < latestReceiptEvent.sequence));
  const currentSupervisionRequired = Boolean(outcome && outcome.epoch >= 4);

  const findingStatus = new Map<string, string>();
  const findingRecords = new Map<string, Extract<MissionControlEventV2, { type: "finding_recorded" }>>();
  for (const event of events) {
    if (event.data.type === "finding_recorded") {
      findingRecords.set(event.data.finding_id, event.data);
      findingStatus.set(event.data.finding_id, "OPEN");
    }
    if (event.data.type === "finding_status_changed") findingStatus.set(event.data.finding_id, event.data.status);
  }
  for (const [findingId, status] of findingStatus) {
    if (["RESOLVED", "INVALIDATED"].includes(status) && correctionVerificationStale(events, findingId)) findingStatus.set(findingId, "REOPENED");
  }
  const openMaterialFindingIds = [...findingRecords.values()]
    .filter((finding) => ["MATERIAL", "BLOCKING", "CRITICAL"].includes(finding.severity)
      && !["RESOLVED", "INVALIDATED"].includes(findingStatus.get(finding.finding_id) ?? "OPEN"))
    .map((finding) => finding.finding_id);
  const activeOwnerAction = latestOwnerAction(events);
  const unresolvedOwnerObligation = Boolean(activeOwnerAction && activeOwnerAction.kind !== "NONE" && activeOwnerAction.status === "OPEN");

  if (!source || !outcome) reasonCodes.push("OUTCOME_AUTHORITY_UNRESOLVED");
  if (source && !["INDEPENDENT_SOURCE_VERIFIED", "OWNER_REATTESTED"].includes(source.receipt_capability)) reasonCodes.push("OWNER_SOURCE_RECEIPT_NOT_INDEPENDENT");
  if (source?.freshness === "STALE") reasonCodes.push("OWNER_SOURCE_STALE");
  if (contractDiverged) {
    reasonCodes.push("CONTRACT_LAUNDERING");
    if (contract?.omitted_owner_outcome_ids.length) reasonCodes.push("SCOPE_CONTRACTION", "OBJECTIVE_SUBSTITUTION");
    if (contract?.proxy_substitutions.length) reasonCodes.push("PROXY_SUBSTITUTION", "COMPLETION_ILLUSION");
  }
  if (reconciliation?.freshness === "STALE") reasonCodes.push("RECONCILIATION_STALE");
  if (ownerOutcomeStatus === "UNMET") reasonCodes.push("OWNER_OUTCOME_UNMET");
  if (ownerOutcomeStatus === "UNKNOWN") reasonCodes.push("COMPLETION_EVIDENCE_INSUFFICIENT");
  if (currentSupervisionRequired && !reasoning) reasonCodes.push("REASONING_SUPERVISOR_MISSING");
  if (currentSupervisionRequired && !reasoningReviewFresh) reasonCodes.push("REASONING_REVIEW_OVERDUE");
  if (currentSupervisionRequired && !activeDirectiveCurrent) reasonCodes.push("SUPERVISION_DIRECTIVE_MISSING");
  if (pendingReasoningReview) reasonCodes.push("PENDING_REASONING_REVIEW");
  if (currentSupervisionRequired && !progress) reasonCodes.push("OUTCOME_PROGRESS_UNMEASURED");
  if (progress?.measurement_freshness === "OVERDUE") reasonCodes.push("PROGRESS_EVIDENCE_OVERDUE");
  if (outcomeAdvancement === "REGRESSING") reasonCodes.push("OWNER_OUTCOME_REGRESSING");
  if (outcomeAdvancement === "FLAT") reasonCodes.push("OWNER_OUTCOME_FLAT");
  if (["FAILED", "EXHAUSTED", "REPLACEMENT_REQUIRED"].includes(strategyEfficacy)) reasonCodes.push("STRATEGY_REPLACEMENT_REQUIRED");
  if (unresolvedOwnerObligation) reasonCodes.push("OWNER_ACTION_REQUIRED");
  reasonCodes.push(...activeSupervisionAlerts.map((alert) => alert.code));

  if (terminalAdjacent && claim) {
    if (claim.evidence_receipt_ids.length === 0) reasonCodes.push("EVIDENCE_RECEIPT_MISSING");
    const receipts = claim.evidence_receipt_ids.map((id) => evidence.find((receipt) => receipt.receipt_id === id));
    if (receipts.some((receipt) => !receipt)) reasonCodes.push("EVIDENCE_RECEIPT_MISSING");
    if (receipts.some((receipt) => receipt && (!receipt.verified || receipt.freshness !== "CURRENT"))) reasonCodes.push("EVIDENCE_NOT_CURRENT_OR_VERIFIED");
    if (receipts.some((receipt) => receipt && receipt.independence !== "INDEPENDENT")) reasonCodes.push("EVIDENCE_NOT_INDEPENDENT");
    if (!claim.exact_candidate_sha256 && rootAchievementClaimed) reasonCodes.push("EXACT_CANDIDATE_MISSING");
    if (claim.exact_candidate_sha256 && receipts.some((receipt) => receipt?.exact_candidate_sha256 !== claim.exact_candidate_sha256)) {
      reasonCodes.push("EXACT_CANDIDATE_MISMATCH");
    }
  }
  if (rootAchievementClaimed && claim && outcome && reconciliation) {
    for (const required of outcome.required_outcomes.filter((item) => item.terminal_required)) {
      const row = reconciliationRows.get(required.id);
      if (required.direct_evidence_receipt_ids.length === 0) reasonCodes.push("OUTCOME_DIRECT_EVIDENCE_MISSING");
      if (required.direct_evidence_receipt_ids.some((receiptId) => !claim.evidence_receipt_ids.includes(receiptId))) reasonCodes.push("OUTCOME_EVIDENCE_NOT_IN_CLAIM");
      if (!row || required.direct_evidence_receipt_ids.some((receiptId) => !row.acceptance_evidence_receipt_ids.includes(receiptId))) {
        reasonCodes.push("OUTCOME_EVIDENCE_NOT_RECONCILED");
      }
      const directReceipts = required.direct_evidence_receipt_ids.map((receiptId) => evidence.find((receipt) => receipt.receipt_id === receiptId));
      if (directReceipts.some((receipt) => !receipt || !receipt.verified || receipt.freshness !== "CURRENT"
        || receipt.independence !== "INDEPENDENT" || receipt.exact_candidate_sha256 !== claim.exact_candidate_sha256)) {
        reasonCodes.push("OUTCOME_DIRECT_EVIDENCE_INVALID");
      }
    }
  }
  if (research && !research.release_permission) reasonCodes.push("RESEARCH_RELEASE_BLOCKED");
  if (gapOpen && terminalAdjacent) reasonCodes.push("OWNER_OUTCOME_GAP_REMAINS");
  if (openMaterialFindingIds.length && terminalAdjacent) reasonCodes.push("OPEN_MATERIAL_FINDING");
  if (terminalAdjacent && !supervisorAssessmentFresh) reasonCodes.push("SUPERVISOR_ASSESSMENT_STALE");

  const cancellationAuthorized = Boolean(rootCancellationClaimed && claim?.owner_decision_id
    && ownerDecision?.type === "owner_decision_recorded"
    && ownerDecision.owner_decision_id === claim.owner_decision_id
    && ownerDecision.decision_kind === "CANCEL_OUTCOME"
    && outcome
    && ownerDecision.owner_outcome_id === outcome.owner_outcome_id
    && ownerDecision.owner_outcome_epoch === outcome.epoch
    && ownerDecision.owner_outcome_sha256 === outcome.owner_outcome_sha256);
  if (rootCancellationClaimed && !cancellationAuthorized) reasonCodes.push("OWNER_CANCELLATION_AUTHORITY_MISSING");

  const hardEvidenceFailure = reasonCodes.some((code) => [
    "EVIDENCE_RECEIPT_MISSING", "EVIDENCE_NOT_CURRENT_OR_VERIFIED", "EVIDENCE_NOT_INDEPENDENT",
    "EXACT_CANDIDATE_MISSING", "EXACT_CANDIDATE_MISMATCH", "OUTCOME_DIRECT_EVIDENCE_MISSING",
    "OUTCOME_EVIDENCE_NOT_IN_CLAIM", "OUTCOME_EVIDENCE_NOT_RECONCILED", "OUTCOME_DIRECT_EVIDENCE_INVALID",
  ].includes(code));
  let decision: TerminalDecision;
  if (contractToOwnerAlignment === "SOURCE_MISSING" || contractToOwnerAlignment === "PARTIAL") {
    decision = "HOLD_SOURCE_AUTHORITY";
  } else if (contractToOwnerAlignment === "DIVERGED") {
    decision = "REJECT_ROOT_TERMINALIZATION";
  } else if (reconciliation?.freshness !== "CURRENT") {
    decision = "HOLD_RECONCILIATION";
  } else if (rootCancellationClaimed) {
    decision = cancellationAuthorized ? "ALLOW_OWNER_CANCELLATION" : "HOLD_COMPLETION_EVIDENCE";
  } else if (ownerOutcomeStatus === "UNMET" && terminalAdjacent) {
    decision = "REJECT_ROOT_TERMINALIZATION";
  } else if (research && !research.release_permission && terminalAdjacent) {
    decision = "REJECT_ROOT_TERMINALIZATION";
  } else if (rootAchievementClaimed && (gapOpen || openMaterialFindingIds.length > 0
    || workerToContractAlignment !== "GREEN" || unresolvedOwnerObligation
    || hardSupervisionAlert || currentSupervisionRequired && (!progress || outcomeAdvancement !== "ADVANCING" || strategyEfficacy !== "VIABLE"
      || !reasoningReviewFresh || !activeDirectiveCurrent || pendingReasoningReview))) {
    decision = "REJECT_ROOT_TERMINALIZATION";
  } else if (rootAchievementClaimed && !supervisorAssessmentFresh) {
    decision = "HOLD_COMPLETION_EVIDENCE";
  } else if (hardEvidenceFailure || (terminalAdjacent && ownerOutcomeStatus === "UNKNOWN")) {
    decision = "HOLD_COMPLETION_EVIDENCE";
  } else if (completionClaimType === "SUBTASK_COMPLETE_PARENT_OPEN") {
    decision = "ALLOW_SUBTASK_CLOSE_PARENT_OPEN";
  } else if (completionClaimType === "READY_FOR_OWNER_REVIEW") {
    decision = "ALLOW_EARLY_OWNER_REVIEW_PARENT_OPEN";
  } else if (completionClaimType === "OWNER_OUTCOME_ACHIEVED" && ownerOutcomeStatus === "MET"
    && workerToContractAlignment === "GREEN" && !unresolvedOwnerObligation
    && (!currentSupervisionRequired || outcomeAdvancement === "ADVANCING" && strategyEfficacy === "VIABLE"
      && reasoningReviewFresh && activeDirectiveCurrent && !pendingReasoningReview)) {
    decision = "ALLOW_ROOT_CLOSE";
  } else {
    decision = "CONTINUE_WORK";
  }

  const rootTerminalizationAllowed = decision === "ALLOW_ROOT_CLOSE" || decision === "ALLOW_OWNER_CANCELLATION";
  let overallTraffic: Traffic;
  if (workerToContractAlignment === "RED" || contractToOwnerAlignment === "DIVERGED" || decision === "REJECT_ROOT_TERMINALIZATION"
    || hardSupervisionAlert || outcomeAdvancement === "REGRESSING" || ["FAILED", "EXHAUSTED", "REPLACEMENT_REQUIRED"].includes(strategyEfficacy)
    || (rootAchievementClaimed && !rootTerminalizationAllowed)) {
    overallTraffic = "RED";
  } else if (contractToOwnerAlignment === "SOURCE_MISSING") {
    overallTraffic = "UNKNOWN";
  } else if (workerToContractAlignment === "UNKNOWN") {
    overallTraffic = "UNKNOWN";
  } else if (workerToContractAlignment === "YELLOW" || contractToOwnerAlignment === "PARTIAL"
    || ["FLAT", "UNMEASURED", "NOT_YET_MEASURABLE", "BLOCKED_EXTERNAL", "UNKNOWN"].includes(outcomeAdvancement)
    || ["UNCERTAIN", "BLOCKED_EXTERNAL"].includes(strategyEfficacy) || progress?.measurement_freshness === "OVERDUE"
    || unresolvedOwnerObligation || currentSupervisionRequired && (!reasoningReviewFresh || !activeDirectiveCurrent || !progress)
    || (terminalAdjacent && !supervisorAssessmentFresh)
    || research?.scientific_conclusion === "FAIL" || research?.release_adequacy === "FAIL") {
    overallTraffic = "YELLOW";
  } else {
    overallTraffic = "GREEN";
  }

  const contractStatus: ContractStatus = contractDiverged
    ? "CONTRACT_LAUNDERING"
    : !source || !outcome
      ? "OUTCOME_AUTHORITY_UNRESOLVED"
      : contract && reconciliation
        ? "VALID"
        : "UNKNOWN";
  const requiredDirective = deriveDirective({
    decision,
    workerToContractAlignment,
    completionClaimType,
    reconciliationDirective: reconciliation?.proposed_required_directive,
    researchBlocked: Boolean(research && !research.release_permission),
    outcomeAdvancement,
    strategyEfficacy,
    currentSupervisionRequired,
    activeDirectiveCurrent,
    pendingReasoningReview,
  });
  const stateVectorSha256 = terminalStateVectorHash(events);
  if (assessment && !supervisorAssessmentFresh && !reasonCodes.includes("SUPERVISOR_ASSESSMENT_STALE")) reasonCodes.push("SUPERVISOR_ASSESSMENT_STALE");

  return {
    stateVectorSha256,
    workerToContractAlignment,
    contractToOwnerAlignment,
    overallTraffic,
    contractStatus,
    ownerOutcomeStatus,
    completionClaimType,
    proposedTerminalState,
    decision,
    rootTerminalizationAllowed,
    requiredDirective,
    reasonCodes: [...new Set(reasonCodes)],
    reconciliationFreshness: reconciliation?.freshness ?? "UNKNOWN",
    currentGap: reconciliation?.current_gap ?? outcome?.current_gap ?? "Owner outcome and reconciliation are not yet available.",
    unmetOutcomeIds,
    unknownOutcomeIds,
    nonSatisfyingProxies: reconciliation?.non_satisfying_proxies ?? outcome?.non_satisfying_proxies ?? [],
    supervisorAssessmentFresh,
    outcomeAdvancement,
    strategyEfficacy,
    reasoningReviewFresh,
    activeDirectiveCurrent,
    pendingReasoningReview,
    unresolvedOwnerObligation,
  };
}

function hasAdequateDirectEvidence(
  receiptIds: string[],
  evidence: Array<Extract<MissionControlEventV2, { type: "evidence_receipt_recorded" }>>,
): boolean {
  if (receiptIds.length === 0) return false;
  return receiptIds.every((receiptId) => {
    const receipt = evidence.find((candidate) => candidate.receipt_id === receiptId);
    return Boolean(receipt && receipt.verified && receipt.freshness === "CURRENT" && receipt.independence === "INDEPENDENT");
  });
}

function vectorHash(events: StoredEvent[], allowed: Set<MissionControlEventV2["type"]>): string {
  return sha256(canonicalJson(events
    .filter((event) => event.schemaVersion === 2 && allowed.has(event.type as MissionControlEventV2["type"]))
    .map((event) => ({ eventId: event.eventId, eventHash: event.eventHash }))));
}

function latest<T extends MissionControlEventV2["type"]>(events: StoredEvent[], type: T): Extract<MissionControlEventV2, { type: T }> | undefined {
  const data = [...events].reverse().find((event) => event.schemaVersion === 2 && event.data.type === type)?.data;
  return data?.type === type ? data as Extract<MissionControlEventV2, { type: T }> : undefined;
}

function latestStored<T extends MissionControlEventV2["type"]>(events: StoredEvent[], type: T): StoredEvent | undefined {
  return [...events].reverse().find((event) => event.schemaVersion === 2 && event.data.type === type);
}

export function latestOwnerAction(events: StoredEvent[]) {
  for (const event of [...events].reverse()) {
    if (event.data.type === "correction_lifecycle_recorded" || event.data.type === "finding_recorded"
      || event.data.type === "supervisor_assessment_recorded" || event.data.type === "outcome_progress_recorded") return event.data.owner_action;
  }
  return undefined;
}

export function correctionVerificationStale(events: StoredEvent[], findingId: string): boolean {
  const correction = [...events].reverse().find((event) => event.data.type === "correction_lifecycle_recorded"
    && event.data.finding_ids.includes(findingId) && ["CORRECTION_VERIFIED", "CORRECTION_RESOLVED"].includes(event.data.status))?.data;
  if (correction?.type !== "correction_lifecycle_recorded") return false;
  if (correction.closure_basis === "FINDING_INVALIDATED") return false;
  const scope = correction.verification_validity_scope;
  const validity = latest(events, "verification_validity_recorded");
  const contract = latest(events, "task_contract_recorded");
  const outcome = latest(events, "owner_outcome_recorded");
  const checkpoint = latest(events, "worker_checkpoint_recorded");
  return !scope || !validity
    || validity.context_id !== scope.context_id
    || validity.exact_candidate_sha256 !== scope.exact_candidate_sha256
    || validity.contract_sha256 !== scope.contract_sha256
    || contract?.task_contract_sha256 !== scope.contract_sha256
    || outcome?.owner_outcome_id !== scope.owner_outcome_id
    || outcome?.epoch !== scope.owner_outcome_epoch
    || outcome?.owner_outcome_sha256 !== scope.owner_outcome_sha256
    || validity.verification_policy_id !== scope.verification_policy_id
    || validity.verification_policy_sha256 !== scope.verification_policy_sha256
    || validity.evidence_requirement_schema_sha256 !== scope.evidence_requirement_schema_sha256
    || validity.worker_run_id !== scope.worker_run_id
    || validity.assignment_epoch !== scope.assignment_epoch
    || validity.target_kind !== scope.target_kind
    || validity.target_id !== scope.target_id
    || validity.target_epoch !== scope.target_epoch
    || canonicalJson(validity.environment_bindings) !== canonicalJson(scope.environment_bindings)
    || canonicalJson(validity.source_snapshot_bindings) !== canonicalJson(scope.source_snapshot_bindings)
    || validity.verifier_method_version !== scope.verifier_method_version
    || checkpoint?.worker_run_id !== scope.worker_run_id;
}

function deriveDirective(input: {
  decision: TerminalDecision;
  workerToContractAlignment: WorkerAlignment;
  completionClaimType: CompletionClaimType;
  reconciliationDirective?: string;
  researchBlocked: boolean;
  outcomeAdvancement: OutcomeAdvancement;
  strategyEfficacy: StrategyEfficacy;
  currentSupervisionRequired: boolean;
  activeDirectiveCurrent: boolean;
  pendingReasoningReview: boolean;
}): string {
  if (input.pendingReasoningReview) return "STOP_AND_RETURN_TO_REASONING_SUPERVISOR";
  if (input.currentSupervisionRequired && !input.activeDirectiveCurrent) return "OBTAIN_CURRENT_CHAT_AUTHORED_EXECUTION_DIRECTIVE";
  if (input.outcomeAdvancement === "REGRESSING" || ["FAILED", "EXHAUSTED", "REPLACEMENT_REQUIRED"].includes(input.strategyEfficacy)) {
    return "HOLD_SAME_STRATEGY_AND_SELECT_REPLACEMENT_METHOD";
  }
  if (input.outcomeAdvancement === "FLAT") return "REVIEW_STRATEGY_EFFICACY_BEFORE_REPEAT";
  if (input.decision === "HOLD_SOURCE_AUTHORITY") return "RECOVER_OWNER_SOURCE";
  if (input.decision === "HOLD_RECONCILIATION") return "REFRESH_OBJECTIVE_RECONCILIATION";
  if (input.decision === "HOLD_COMPLETION_EVIDENCE") return "KEEP_ROOT_OPEN_AND_REFRESH_TERMINAL_EVIDENCE";
  if (input.decision === "REJECT_ROOT_TERMINALIZATION" && input.completionClaimType === "OWNER_OUTCOME_ACHIEVED") return "KEEP_ROOT_OPEN_AND_CORRECT_TERMINAL_CLAIM";
  if (input.researchBlocked) return "HOLD_RELEASE";
  if (input.workerToContractAlignment === "RED") return "FOLLOW_ACTIVE_CORRECTION";
  if (input.reconciliationDirective) return input.reconciliationDirective;
  if (input.decision === "ALLOW_ROOT_CLOSE") return "ROOT_CLOSE_ALLOWED";
  return "CONTINUE_WORK";
}
