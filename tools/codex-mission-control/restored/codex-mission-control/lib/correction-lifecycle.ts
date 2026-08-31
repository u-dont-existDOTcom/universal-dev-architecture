import { canonicalJson, sha256 } from "./canonical";
import type { CorrectionStatus, DirectiveKind, MissionControlEventV2 } from "./schema";

export class CorrectionInvariantError extends Error {}

const transitions: Record<CorrectionStatus, CorrectionStatus[]> = {
  DIRECTIVE_PREPARED: ["DIRECTIVE_ISSUED", "DIRECTIVE_SUPERSEDED", "DIRECTIVE_WITHDRAWN", "CORRECTION_RESOLVED"],
  DIRECTIVE_ISSUED: ["DIRECTIVE_DELIVERED", "DIRECTIVE_DELIVERY_FAILED", "DIRECTIVE_SUPERSEDED", "DIRECTIVE_WITHDRAWN", "CORRECTION_BLOCKED", "CORRECTION_FAILED", "CORRECTION_RESOLVED"],
  DIRECTIVE_DELIVERED: ["DIRECTIVE_ACKNOWLEDGED", "DIRECTIVE_SUPERSEDED", "DIRECTIVE_WITHDRAWN", "CORRECTION_BLOCKED", "CORRECTION_FAILED", "CORRECTION_RESOLVED"],
  DIRECTIVE_DELIVERY_FAILED: ["DIRECTIVE_ISSUED", "DIRECTIVE_SUPERSEDED", "DIRECTIVE_WITHDRAWN", "CORRECTION_BLOCKED", "CORRECTION_FAILED"],
  DIRECTIVE_ACKNOWLEDGED: ["CORRECTION_STARTED", "DIRECTIVE_SUPERSEDED", "DIRECTIVE_WITHDRAWN", "CORRECTION_BLOCKED", "CORRECTION_FAILED", "CORRECTION_RESOLVED"],
  DIRECTIVE_SUPERSEDED: [],
  DIRECTIVE_WITHDRAWN: [],
  CORRECTION_STARTED: ["CORRECTION_EVIDENCE_SUBMITTED", "DIRECTIVE_SUPERSEDED", "DIRECTIVE_WITHDRAWN", "CORRECTION_BLOCKED", "CORRECTION_FAILED", "CORRECTION_RESOLVED"],
  CORRECTION_EVIDENCE_SUBMITTED: ["CORRECTION_VERIFIED", "CORRECTION_EVIDENCE_REJECTED", "DIRECTIVE_SUPERSEDED", "DIRECTIVE_WITHDRAWN", "CORRECTION_BLOCKED", "CORRECTION_FAILED"],
  CORRECTION_EVIDENCE_REJECTED: ["CORRECTION_STARTED", "DIRECTIVE_SUPERSEDED", "DIRECTIVE_WITHDRAWN", "CORRECTION_BLOCKED", "CORRECTION_FAILED"],
  CORRECTION_VERIFIED: ["CORRECTION_RESOLVED", "CORRECTION_REOPENED"],
  CORRECTION_RESOLVED: ["CORRECTION_REOPENED"],
  CORRECTION_REOPENED: ["CORRECTION_STARTED", "DIRECTIVE_SUPERSEDED", "DIRECTIVE_WITHDRAWN", "CORRECTION_BLOCKED", "CORRECTION_FAILED"],
  CORRECTION_BLOCKED: ["CORRECTION_STARTED", "DIRECTIVE_SUPERSEDED", "DIRECTIVE_WITHDRAWN", "CORRECTION_FAILED"],
  CORRECTION_FAILED: [],
};

type CorrectionEvent = Extract<MissionControlEventV2, { type: "correction_lifecycle_recorded" }>;

export function validateCorrectionTransition(current: CorrectionEvent, prior?: CorrectionEvent, priorEventId?: string): void {
  if (current.directive_digest !== sha256(current.directive)) {
    throw new CorrectionInvariantError("Directive digest must bind the exact directive text.");
  }
  if (!current.evidence_requirement_schema_sha256) {
    throw new CorrectionInvariantError("Every correction attempt must bind its evidence-requirement schema from the first lifecycle event.");
  }
  if (!prior) {
    if (!(current.status === "DIRECTIVE_PREPARED" || current.status === "DIRECTIVE_ISSUED")) {
      throw new CorrectionInvariantError(`Correction ${current.correction_attempt_id} must begin as DIRECTIVE_PREPARED or DIRECTIVE_ISSUED.`);
    }
    if (current.expected_predecessor_event_id !== null) {
      throw new CorrectionInvariantError("A new correction attempt cannot claim a predecessor lifecycle event.");
    }
  } else {
    const immutableIdentity = [
      "worker", "correction_attempt_id", "directive_id", "directive_digest", "directive", "directive_kind",
      "task_id", "worker_run_id", "assignment_epoch", "contract_id", "contract_sha256", "owner_outcome_id",
      "owner_outcome_epoch", "owner_outcome_sha256", "target_kind", "target_id", "target_epoch", "correlation_id",
    ] as const;
    for (const field of immutableIdentity) {
      if (prior[field] !== current[field]) throw new CorrectionInvariantError(`Correction lifecycle cannot change immutable ${field}.`);
    }
    const immutableStructured = [
      "finding_ids", "required_evidence", "evidence_requirement_schema_sha256", "owner_action", "continuation_policy",
    ] as const;
    for (const field of immutableStructured) {
      if (canonicalJson(prior[field]) !== canonicalJson(current[field])) {
        throw new CorrectionInvariantError(`Correction lifecycle cannot change immutable ${field}.`);
      }
    }
    if (prior.evidence_set_id && (prior.evidence_set_id !== current.evidence_set_id
      || prior.verified_candidate_sha256 !== current.verified_candidate_sha256
      || canonicalJson(prior.evidence_receipt_ids) !== canonicalJson(current.evidence_receipt_ids))) {
      throw new CorrectionInvariantError("An atomic correction evidence set cannot change within an attempt.");
    }
    if (prior.verification_validity_scope
      && canonicalJson(prior.verification_validity_scope) !== canonicalJson(current.verification_validity_scope)) {
      throw new CorrectionInvariantError("A verified validity scope cannot change within an attempt; reopen and create a new attempt.");
    }
    if (current.expected_predecessor_event_id !== priorEventId) {
      throw new CorrectionInvariantError("Correction transition must bind the exact predecessor event ID.");
    }
    if (!transitions[prior.status].includes(current.status)) {
      throw new CorrectionInvariantError(`Invalid correction transition ${prior.status} -> ${current.status}.`);
    }
  }

  if (current.status === "DIRECTIVE_DELIVERED") {
    const receipt = current.delivery_receipt;
    if (!receipt?.receiver_generated || receipt.directive_digest !== current.directive_digest) {
      throw new CorrectionInvariantError("Delivery requires a receiver-generated receipt bound to the directive digest.");
    }
  }
  if (current.status === "DIRECTIVE_DELIVERY_FAILED" && !current.exception_reason) {
    throw new CorrectionInvariantError("Delivery failure requires an exception reason.");
  }
  if (current.status === "DIRECTIVE_ACKNOWLEDGED"
    && (current.acknowledged_directive_id !== current.directive_id || current.acknowledged_directive_digest !== current.directive_digest)) {
    throw new CorrectionInvariantError("Acknowledgement must bind the exact directive ID and digest.");
  }
  if (current.status === "CORRECTION_STARTED") {
    if (!(current.actor_role === "WORKER" || current.actor_role === "AUTHORIZED_EXECUTOR")
      || !current.first_corrective_action || !current.activity_lease_expires_at) {
      throw new CorrectionInvariantError("Correction start requires the target or authorized executor, a first corrective action, and an expiring activity lease.");
    }
  }
  if (current.status === "CORRECTION_EVIDENCE_SUBMITTED") {
    if (current.evidence_receipt_ids.length === 0 || !current.evidence_set_id || !current.verified_candidate_sha256 || !current.evidence_requirement_schema_sha256) {
      throw new CorrectionInvariantError("Correction evidence submission requires one atomic evidence set bound to an exact candidate and requirement schema.");
    }
  }
  if (current.status === "CORRECTION_VERIFIED") {
    const requiredValidityDimensions = [
      "CANDIDATE", "CONTRACT", "OWNER_OUTCOME", "VERIFICATION_POLICY", "EVIDENCE_REQUIREMENT_SCHEMA",
      "ASSIGNMENT", "TARGET", "ENVIRONMENT", "SOURCE_SNAPSHOT", "VERIFIER_METHOD",
    ] as const;
    if (current.evidence_receipt_ids.length === 0 || !current.evidence_set_id || !current.verified_candidate_sha256
      || !current.evidence_requirement_schema_sha256 || !current.verification_policy_id || !current.verification_policy_sha256
      || !current.verifier_id || !current.verifier_role || !current.verifier_method_version
      || !current.verification_validity_scope
      || current.verification_validity_scope.exact_candidate_sha256 !== current.verified_candidate_sha256
      || current.verification_validity_scope.contract_sha256 !== current.contract_sha256
      || current.verification_validity_scope.owner_outcome_id !== current.owner_outcome_id
      || current.verification_validity_scope.owner_outcome_epoch !== current.owner_outcome_epoch
      || current.verification_validity_scope.owner_outcome_sha256 !== current.owner_outcome_sha256
      || current.verification_validity_scope.verification_policy_id !== current.verification_policy_id
      || current.verification_validity_scope.verification_policy_sha256 !== current.verification_policy_sha256
      || current.verification_validity_scope.evidence_requirement_schema_sha256 !== current.evidence_requirement_schema_sha256
      || current.verification_validity_scope.worker_run_id !== current.worker_run_id
      || current.verification_validity_scope.assignment_epoch !== current.assignment_epoch
      || current.verification_validity_scope.target_kind !== current.target_kind
      || current.verification_validity_scope.target_id !== current.target_id
      || current.verification_validity_scope.target_epoch !== current.target_epoch
      || current.verification_validity_scope.verifier_method_version !== current.verifier_method_version
      || requiredValidityDimensions.some((dimension) => !current.verification_validity_scope!.invalidate_on.includes(dimension))
      || current.verification_manifest.length !== current.required_evidence.length
      || current.required_evidence.some((requirement) => !current.verification_manifest.some((result) => result.requirement === requirement
        && current.evidence_receipt_ids.includes(result.evidence_receipt_id)))) {
      throw new CorrectionInvariantError("Correction verification requires exact evidence-set, candidate, requirement, policy, and verifier bindings.");
    }
  }
  if (current.status === "CORRECTION_RESOLVED" && !current.closure_basis) {
    throw new CorrectionInvariantError("Correction resolution requires an explicit closure basis.");
  }
  if (current.status !== "CORRECTION_RESOLVED" && current.closure_basis) {
    throw new CorrectionInvariantError("Closure basis is valid only on CORRECTION_RESOLVED.");
  }
  if (["CORRECTION_EVIDENCE_REJECTED", "CORRECTION_REOPENED", "DIRECTIVE_WITHDRAWN"].includes(current.status) && !current.exception_reason) {
    throw new CorrectionInvariantError(`${current.status} requires an explicit reason.`);
  }
  if (current.status === "DIRECTIVE_SUPERSEDED" && !current.superseded_by_directive_id) {
    throw new CorrectionInvariantError("A superseded directive must identify its replacement directive ID.");
  }
  if (current.status === "CORRECTION_BLOCKED"
    && (!current.exception_reason || !current.blocker_actor_id || !current.escalation_trigger || current.retry_possible === null)) {
    throw new CorrectionInvariantError("A blocked correction must identify its blocker, responsible actor, escalation trigger, and retry policy.");
  }
  if (current.continuation_policy.mode === "UNKNOWN" && current.continuation_policy.allowed_scope.length > 0) {
    throw new CorrectionInvariantError("UNKNOWN continuation cannot grant allowed scope.");
  }
}

export function correctionStatusLabel(
  status: CorrectionStatus | null,
  kind?: DirectiveKind | null,
  closureBasis?: "CORRECTED_AND_VERIFIED" | "FINDING_INVALIDATED" | "MIXED_RESOLUTION" | null,
): string {
  const directiveWord = kind === "WORKER_REDIRECT" ? "REDIRECT" : "DIRECTIVE";
  switch (status) {
    case null: return "NO CORRECTION ISSUED";
    case "DIRECTIVE_PREPARED": return `${directiveWord} PREPARED — NOT YET ISSUED`;
    case "DIRECTIVE_ISSUED": return `${directiveWord} ISSUED — DELIVERY UNCONFIRMED`;
    case "DIRECTIVE_DELIVERED": return `${directiveWord} DELIVERED — AWAITING ACKNOWLEDGEMENT`;
    case "DIRECTIVE_DELIVERY_FAILED": return `${directiveWord} DELIVERY FAILED`;
    case "DIRECTIVE_ACKNOWLEDGED": return `${directiveWord} ACKNOWLEDGED — EVIDENCE PENDING`;
    case "DIRECTIVE_SUPERSEDED": return `PRIOR ${directiveWord} SUPERSEDED — NO LONGER ACTIVE`;
    case "DIRECTIVE_WITHDRAWN": return `PRIOR ${directiveWord} WITHDRAWN — NO ACTIVE DIRECTIVE`;
    case "CORRECTION_STARTED": return "CORRECTION STARTED — EVIDENCE PENDING";
    case "CORRECTION_EVIDENCE_SUBMITTED": return "CORRECTION EVIDENCE SUBMITTED — VERIFICATION PENDING";
    case "CORRECTION_EVIDENCE_REJECTED": return "CORRECTION EVIDENCE REJECTED — REWORK REQUIRED";
    case "CORRECTION_VERIFIED": return "CORRECTION VERIFIED";
    case "CORRECTION_RESOLVED":
      if (closureBasis === "FINDING_INVALIDATED") return "CLOSED — FINDING INVALIDATED";
      if (closureBasis === "MIXED_RESOLUTION") return "CLOSED — VERIFIED CORRECTION AND FINDING INVALIDATION";
      return kind === "WORKER_REDIRECT" ? "REDIRECT RESOLVED" : "CORRECTION RESOLVED";
    case "CORRECTION_REOPENED": return "CORRECTION REOPENED";
    case "CORRECTION_BLOCKED": return "CORRECTION BLOCKED";
    case "CORRECTION_FAILED": return "CORRECTION FAILED";
  }
}
