import { canonicalJson, sha256 } from "./canonical";
import type {
  CompletionClaimType,
  ContractOwnerAlignment,
  MissionControlEventV2,
  StoredEvent,
  Traffic,
  WorkerAlignment,
} from "./schema";

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
]);

const terminalVectorTypes = new Set<MissionControlEventV2["type"]>([
  ...authorityVectorTypes,
  "supervisor_assessment_recorded",
  "correction_lifecycle_recorded",
  "supervision_route_recorded",
]);

export function authorityStateVectorHash(events: StoredEvent[]): string {
  return vectorHash(events, authorityVectorTypes);
}

export function terminalStateVectorHash(events: StoredEvent[]): string {
  return vectorHash(events, terminalVectorTypes);
}

export function compareTerminalState(events: StoredEvent[]): TerminalComparison {
  const source = latest(events, "owner_source_recorded");
  const outcome = latest(events, "owner_outcome_recorded");
  const contract = latest(events, "task_contract_recorded");
  const reconciliation = latest(events, "objective_reconciliation_recorded");
  const assessment = latest(events, "supervisor_assessment_recorded");
  const claim = latest(events, "completion_claim_recorded");
  const research = latest(events, "research_verdict_recorded");
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
    source.comparison === "MISMATCH"
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

  const findingStatus = new Map<string, string>();
  const findingRecords = new Map<string, Extract<MissionControlEventV2, { type: "finding_recorded" }>>();
  for (const event of events) {
    if (event.data.type === "finding_recorded") {
      findingRecords.set(event.data.finding_id, event.data);
      findingStatus.set(event.data.finding_id, "OPEN");
    }
    if (event.data.type === "finding_status_changed") findingStatus.set(event.data.finding_id, event.data.status);
  }
  const openBlockingFindingIds = [...findingRecords.values()]
    .filter((finding) => ["BLOCKING", "CRITICAL"].includes(finding.severity)
      && !["RESOLVED", "INVALIDATED"].includes(findingStatus.get(finding.finding_id) ?? "OPEN"))
    .map((finding) => finding.finding_id);

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
  if (openBlockingFindingIds.length && terminalAdjacent) reasonCodes.push("OPEN_BLOCKING_FINDING");
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
  } else if (rootAchievementClaimed && (gapOpen || openBlockingFindingIds.length > 0)) {
    decision = "REJECT_ROOT_TERMINALIZATION";
  } else if (rootAchievementClaimed && !supervisorAssessmentFresh) {
    decision = "HOLD_COMPLETION_EVIDENCE";
  } else if (hardEvidenceFailure || (terminalAdjacent && ownerOutcomeStatus === "UNKNOWN")) {
    decision = "HOLD_COMPLETION_EVIDENCE";
  } else if (completionClaimType === "SUBTASK_COMPLETE_PARENT_OPEN") {
    decision = "ALLOW_SUBTASK_CLOSE_PARENT_OPEN";
  } else if (completionClaimType === "READY_FOR_OWNER_REVIEW") {
    decision = "ALLOW_EARLY_OWNER_REVIEW_PARENT_OPEN";
  } else if (completionClaimType === "OWNER_OUTCOME_ACHIEVED" && ownerOutcomeStatus === "MET") {
    decision = "ALLOW_ROOT_CLOSE";
  } else {
    decision = "CONTINUE_WORK";
  }

  const rootTerminalizationAllowed = decision === "ALLOW_ROOT_CLOSE" || decision === "ALLOW_OWNER_CANCELLATION";
  let overallTraffic: Traffic;
  if (workerToContractAlignment === "RED" || contractToOwnerAlignment === "DIVERGED" || decision === "REJECT_ROOT_TERMINALIZATION"
    || (rootAchievementClaimed && !rootTerminalizationAllowed)) {
    overallTraffic = "RED";
  } else if (contractToOwnerAlignment === "SOURCE_MISSING") {
    overallTraffic = "UNKNOWN";
  } else if (workerToContractAlignment === "UNKNOWN") {
    overallTraffic = "UNKNOWN";
  } else if (workerToContractAlignment === "YELLOW" || contractToOwnerAlignment === "PARTIAL"
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

function deriveDirective(input: {
  decision: TerminalDecision;
  workerToContractAlignment: WorkerAlignment;
  completionClaimType: CompletionClaimType;
  reconciliationDirective?: string;
  researchBlocked: boolean;
}): string {
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
