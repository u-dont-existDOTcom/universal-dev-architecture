import { z } from "zod";

const WorkerId = z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/);
const StableId = z.string().min(1).max(180).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
// Runtime and deterministic fixtures share the same content-addressing contract.
// Relaxed human-readable pseudo-hashes are never accepted at an ingestion boundary.
const FixtureSha = Sha256;
const NonEmpty = z.string().trim().min(1);
const Timestamp = z.string().datetime({ offset: true });
const Url = z.string().url().refine((value) => value.startsWith("https://"), {
  message: "External links must use HTTPS",
});

export const trafficSchema = z.enum(["GREEN", "YELLOW", "RED", "UNKNOWN"]);
export const workerAlignmentSchema = z.enum(["GREEN", "YELLOW", "RED", "UNKNOWN"]);
export const contractOwnerAlignmentSchema = z.enum(["MATCH", "PARTIAL", "DIVERGED", "SOURCE_MISSING"]);
export const ownerActionTypeSchema = z.enum([
  "NONE",
  "DECISION_REQUIRED",
  "MANUAL_INTERVENTION_REQUIRED",
  "VERIFY_RESULT",
]);
export const directiveKindSchema = z.enum([
  "WORKER_REDIRECT",
  "CONTRACT_REPAIR",
  "RELEASE_REMEDIATION",
  "EVIDENCE_REPAIR",
  "OWNER_DECISION",
]);
export const correctionTargetKindSchema = z.enum([
  "WORKER_RUN",
  "TASK_CONTRACT",
  "RELEASE_CANDIDATE",
  "EVIDENCE_SET",
  "OWNER_DECISION",
]);
export const continuationModeSchema = z.enum([
  "PAUSE_ALL",
  "SAFE_WITHIN_SCOPE",
  "CONTINUE_UNRESTRICTED",
  "UNKNOWN",
]);
export const completionClaimTypeSchema = z.enum([
  "WORKING",
  "ARTIFACT_READY",
  "TESTS_PASS",
  "READY_FOR_OWNER_REVIEW",
  "READY_FOR_RELEASE",
  "PARTIAL_OUTCOME",
  "SUBTASK_COMPLETE_PARENT_OPEN",
  "OWNER_OUTCOME_ACHIEVED",
  "BLOCKED_OWNER_DECISION",
  "CANCELED_BY_OWNER",
]);
export const findingTypeSchema = z.enum([
  "FORBIDDEN_SCOPE",
  "OBJECTIVE_CONTRADICTION",
  "UNEXPLAINED_PLAN_CHANGE",
  "INVALID_ASSUMPTION",
  "SCOPE_CONTRACTION",
  "OBJECTIVE_SUBSTITUTION",
  "PROXY_SUBSTITUTION",
  "COMPLETION_ILLUSION",
  "OWNER_SOURCE_MISSING",
  "OWNER_SOURCE_NOT_INDEPENDENT",
  "EVIDENCE_MISSING",
  "EVIDENCE_STALE",
  "EXACT_CANDIDATE_MISMATCH",
  "TEST_REGRESSION",
  "REPEATED_FAILURE_LOOP",
  "SCIENTIFIC_CONCLUSION_UNSUPPORTED",
  "RELEASE_REQUIREMENT_UNMET",
  "INTEGRATION_OR_RESOURCE_BLOCKER",
  "WORK_CONTINUED_AFTER_REDIRECT",
]);
export const correctionStatusSchema = z.enum([
  "DIRECTIVE_PREPARED",
  "DIRECTIVE_ISSUED",
  "DIRECTIVE_DELIVERED",
  "DIRECTIVE_DELIVERY_FAILED",
  "DIRECTIVE_ACKNOWLEDGED",
  "DIRECTIVE_SUPERSEDED",
  "DIRECTIVE_WITHDRAWN",
  "CORRECTION_STARTED",
  "CORRECTION_EVIDENCE_SUBMITTED",
  "CORRECTION_EVIDENCE_REJECTED",
  "CORRECTION_VERIFIED",
  "CORRECTION_RESOLVED",
  "CORRECTION_REOPENED",
  "CORRECTION_BLOCKED",
  "CORRECTION_FAILED",
]);

const ownerActionCommon = {
  exact_text: NonEmpty,
  reason_code: NonEmpty,
  subject_id: StableId,
  blocking_scope: z.array(NonEmpty).default([]),
  source_event_ids: z.array(StableId).min(1),
  due_at: Timestamp.nullable().default(null),
  escalation_at: Timestamp.nullable().default(null),
  status: z.enum(["NOT_REQUIRED", "OPEN", "COMPLETED", "SUPERSEDED"]),
};

export const ownerActionObligationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("NONE"),
    ...ownerActionCommon,
    status: z.literal("NOT_REQUIRED"),
    none_reason_code: NonEmpty,
    next_actor_kind: z.enum(["WORKER", "SUPERVISOR", "AUTOMATION", "CONTRACT_ISSUER", "VERIFIER"]),
    next_actor_id: StableId,
    next_action: NonEmpty,
    next_trigger: NonEmpty,
    next_due_at: Timestamp,
    escalation_policy: NonEmpty,
  }),
  z.object({
    kind: z.literal("DECISION_REQUIRED"),
    ...ownerActionCommon,
    decision_id: StableId,
    decision_question: NonEmpty,
    decision_context: NonEmpty,
    options: z.array(z.object({
      option_id: StableId,
      label: NonEmpty,
      benefits: z.array(NonEmpty).min(1),
      drawbacks: z.array(NonEmpty).min(1),
      downstream_consequences: z.array(NonEmpty).min(1),
    })).min(2),
    recommendation_option_id: StableId,
    recommendation_reasoning: NonEmpty,
    pro_analysis_ref: NonEmpty,
    default_if_no_decision: NonEmpty,
  }),
  z.object({ kind: z.literal("MANUAL_INTERVENTION_REQUIRED"), ...ownerActionCommon }),
  z.object({
    kind: z.literal("VERIFY_RESULT"),
    ...ownerActionCommon,
    evidence_set_id: StableId,
    candidate_digest: z.union([Sha256, FixtureSha]),
  }),
]).superRefine((obligation, context) => {
  if (obligation.kind === "DECISION_REQUIRED"
    && !obligation.options.some((option) => option.option_id === obligation.recommendation_option_id)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recommendation_option_id"],
      message: "recommendation_option_id must identify one of the fully described options",
    });
  }
});

export const continuationPolicySchema = z.object({
  mode: continuationModeSchema,
  allowed_scope: z.array(NonEmpty).default([]),
  forbidden_scope: z.array(NonEmpty).default([]),
  preconditions: z.array(NonEmpty).default([]),
  basis_finding_ids: z.array(StableId).default([]),
  basis_evidence_ids: z.array(StableId).default([]),
  expires_at: Timestamp.nullable().default(null),
  recheck_trigger: NonEmpty,
});

// Legacy PR #41 events remain decodable for migration and conservative display.
export const objectiveCreatedSchema = z.object({
  type: z.literal("objective_created"),
  worker: WorkerId,
  worker_name: NonEmpty,
  goal: NonEmpty,
  acceptance_criteria: z.array(NonEmpty).min(1),
  allowed_scope: z.array(NonEmpty).min(1),
  forbidden_scope: z.array(NonEmpty).default([]),
  expected_max_diff_lines: z.number().int().positive().optional(),
  supervisor_chat_url: Url,
  supervisor_chat_label: NonEmpty.default("Open Pro supervisor chat"),
});

export const workerHeartbeatSchema = z.object({
  type: z.literal("worker_heartbeat"),
  worker: WorkerId,
  objective: NonEmpty.optional(),
  status: z.enum(["working", "blocked", "done"]).default("working"),
  current_step: NonEmpty,
  completed_steps: z.array(NonEmpty).default([]),
  next_steps: z.array(NonEmpty).max(3).default([]),
  files_touched: z.array(NonEmpty).default([]),
  tests: z.object({
    passing: z.number().int().nonnegative(),
    failing: z.number().int().nonnegative(),
    lint: z.enum(["passing", "failing", "not_run"]).default("not_run"),
    build: z.enum(["passing", "failing", "not_run"]).default("not_run"),
  }),
  plan_changed: z.boolean().default(false),
  plan_change_reason: z.string().nullable().default(null),
  blocker: z.string().nullable().default(null),
  assumptions: z.array(NonEmpty).default([]),
  assumptions_materially_changed: z.boolean().default(false),
  diff_lines: z.number().int().nonnegative().default(0),
  repeated_failure_count: z.number().int().nonnegative().default(0),
  architecture_rewrite: z.boolean().default(false),
  architecture_rewrite_explained: z.boolean().default(false),
  destructive_action: z.boolean().default(false),
  touched_other_worker_area: z.boolean().default(false),
  major_contract_violation: z.boolean().default(false),
});

export const planChangedSchema = z.object({
  type: z.literal("plan_changed"), worker: WorkerId,
  previous_plan: z.array(NonEmpty), new_plan: z.array(NonEmpty), reason: z.string().nullable(),
});
export const commandRunSchema = z.object({
  type: z.literal("command_run"), worker: WorkerId, command: NonEmpty,
  exit_code: z.number().int().nullable(), summary: z.string().default(""),
});
export const filesChangedSchema = z.object({
  type: z.literal("files_changed"), worker: WorkerId, files: z.array(NonEmpty).min(1),
  additions: z.number().int().nonnegative(), deletions: z.number().int().nonnegative(),
  destructive_action: z.boolean().default(false), touched_other_worker_area: z.boolean().default(false),
});
export const testsRunSchema = z.object({
  type: z.literal("tests_run"), worker: WorkerId, command: NonEmpty,
  passing: z.number().int().nonnegative(), failing: z.number().int().nonnegative(),
  previously_passing_regressed: z.boolean().default(false),
});
export const commitCreatedSchema = z.object({
  type: z.literal("commit_created"), worker: WorkerId, sha: NonEmpty, message: NonEmpty,
});
export const blockerReportedSchema = z.object({
  type: z.literal("blocker_reported"), worker: WorkerId, blocker: NonEmpty,
  legitimate_dependency: z.boolean().default(false),
});
export const supervisorVerdictSchema = z.object({
  type: z.literal("supervisor_verdict"), worker: WorkerId,
  verdict: z.enum(["ON_TRACK", "WATCH", "REDIRECT"]), alignment: z.number().min(0).max(1),
  reason: NonEmpty, corrective_action: z.string().nullable().default(null), review_after: NonEmpty,
  work_no_longer_serves_objective: z.boolean().default(false),
});
export const redirectIssuedSchema = z.object({
  type: z.literal("redirect_issued"), worker: WorkerId, reason: NonEmpty, corrective_action: NonEmpty,
});
export const taskCompletedSchema = z.object({
  type: z.literal("task_completed"), worker: WorkerId, summary: NonEmpty,
});
export const supervisorChatLinkSetSchema = z.object({
  type: z.literal("supervisor_chat_link_set"), worker: WorkerId,
  supervisor_chat_url: Url, supervisor_chat_label: NonEmpty.default("Open Pro supervisor chat"), reason: NonEmpty,
});

export const legacyEventSchema = z.discriminatedUnion("type", [
  objectiveCreatedSchema, workerHeartbeatSchema, planChangedSchema, commandRunSchema,
  filesChangedSchema, testsRunSchema, commitCreatedSchema, blockerReportedSchema,
  supervisorVerdictSchema, redirectIssuedSchema, taskCompletedSchema, supervisorChatLinkSetSchema,
]);

const requiredOutcomeSchema = z.object({
  id: StableId,
  text: NonEmpty,
  terminal_required: z.boolean(),
  status: z.enum(["MET", "UNMET", "UNKNOWN"]),
  direct_evidence_receipt_ids: z.array(StableId).default([]),
});

export const ownerSourceRecordedSchema = z.object({
  type: z.literal("owner_source_recorded"),
  worker: WorkerId,
  receipt_id: StableId,
  owner_request_id: StableId,
  canonical_locator: NonEmpty,
  source_sha256: z.union([Sha256, FixtureSha]),
  worker_copy_sha256: z.union([Sha256, FixtureSha]).nullable(),
  capture_integrity: z.enum(["VERIFIED", "FAILED", "UNKNOWN"]),
  acquisition_mode: z.enum(["PROVIDER_DIRECT", "INDEPENDENT_READER_DIRECT", "OWNER_REATTESTED", "WORKER_COPIED", "UNKNOWN"]),
  receipt_capability: z.enum(["INDEPENDENT_SOURCE_VERIFIED", "OWNER_REATTESTED", "INTEGRITY_ONLY", "NONE", "UNKNOWN"]),
  comparison: z.enum(["MATCH", "MISMATCH", "NOT_INDEPENDENT", "UNKNOWN"]),
  freshness: z.enum(["CURRENT", "STALE", "UNKNOWN"]),
  limitations: z.array(NonEmpty).default([]),
});

export const ownerOutcomeRecordedSchema = z.object({
  type: z.literal("owner_outcome_recorded"),
  worker: WorkerId,
  owner_outcome_id: StableId,
  owner_request_id: StableId,
  epoch: z.number().int().positive(),
  owner_outcome_sha256: z.union([Sha256, FixtureSha]),
  source_receipt_id: StableId,
  verbatim_owner_request: z.array(NonEmpty).min(1),
  normalized_result: NonEmpty,
  required_outcomes: z.array(requiredOutcomeSchema).min(1),
  non_satisfying_proxies: z.array(NonEmpty).default([]),
  current_gap: NonEmpty,
  gap_status: z.enum(["OPEN", "NONE", "UNKNOWN"]),
  supersedes: StableId.nullable().default(null),
});

export const taskContractRecordedSchema = z.object({
  type: z.literal("task_contract_recorded"),
  worker: WorkerId,
  worker_name: NonEmpty,
  contract_id: StableId,
  revision: z.number().int().positive(),
  task_contract_sha256: z.union([Sha256, FixtureSha]),
  owner_outcome_id: StableId,
  owner_outcome_epoch: z.number().int().positive(),
  owner_outcome_sha256: z.union([Sha256, FixtureSha]),
  goal: NonEmpty,
  acceptance_criteria: z.array(NonEmpty).min(1),
  allowed_scope: z.array(NonEmpty).min(1),
  forbidden_scope: z.array(NonEmpty).default([]),
  expected_max_diff_lines: z.number().int().positive().optional(),
  effective_finish_line: NonEmpty,
  required_owner_outcome_ids: z.array(StableId).min(1),
  omitted_owner_outcome_ids: z.array(StableId).default([]),
  weakened_owner_outcome_ids: z.array(StableId).default([]),
  proxy_substitutions: z.array(NonEmpty).default([]),
  authorized_scope_changes: z.array(NonEmpty).default([]),
  parent_outcome_remains_open: z.boolean(),
});

const reconciliationRowSchema = z.object({
  owner_requirement_id: StableId,
  owner_requirement: NonEmpty,
  worker_interpretation: NonEmpty,
  task_criterion: NonEmpty,
  acceptance_evidence_receipt_ids: z.array(StableId).default([]),
  status: z.enum([
    "MAPPED_DIRECT", "MAPPED_CONTRIBUTING", "MAPPED_VERIFYING", "UNMAPPED", "WEAKENED",
    "PROXY_SUBSTITUTED", "OWNER_REMOVED", "OWNER_AMENDED", "AMBIGUOUS",
  ]),
  authorized_change: StableId.nullable().default(null),
}).superRefine((row, context) => {
  if (["OWNER_REMOVED", "OWNER_AMENDED"].includes(row.status) && !row.authorized_change) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["authorized_change"], message: `${row.status} requires an owner-authorized correction reference` });
  }
});

export const reconciliationRecordedSchema = z.object({
  type: z.literal("objective_reconciliation_recorded"),
  worker: WorkerId,
  reconciliation_id: StableId,
  owner_outcome_id: StableId,
  owner_outcome_epoch: z.number().int().positive(),
  owner_outcome_sha256: z.union([Sha256, FixtureSha]),
  task_contract_sha256: z.union([Sha256, FixtureSha]),
  freshness: z.enum(["CURRENT", "STALE", "UNKNOWN"]),
  matrix: z.array(reconciliationRowSchema).min(1),
  current_gap: NonEmpty,
  gap_status: z.enum(["OPEN", "NONE", "UNKNOWN"]),
  unmet_owner_outcome_ids: z.array(StableId).default([]),
  unknown_owner_outcome_ids: z.array(StableId).default([]),
  non_satisfying_proxies: z.array(NonEmpty).default([]),
  proposed_required_directive: NonEmpty,
});

export const workerCheckpointRecordedSchema = z.object({
  type: z.literal("worker_checkpoint_recorded"),
  worker: WorkerId,
  worker_run_id: StableId,
  status: z.enum(["working", "blocked", "done"]),
  current_step: NonEmpty,
  completed_steps: z.array(NonEmpty).default([]),
  next_steps: z.array(NonEmpty).max(3).default([]),
  files_touched: z.array(NonEmpty).default([]),
  tests: z.object({
    passing: z.number().int().nonnegative(), failing: z.number().int().nonnegative(),
    lint: z.enum(["passing", "failing", "not_run"]), build: z.enum(["passing", "failing", "not_run"]),
  }),
  plan_changed: z.boolean().default(false),
  plan_change_reason: z.string().nullable().default(null),
  blocker: z.string().nullable().default(null),
  assumptions: z.array(NonEmpty).default([]),
  diff_lines: z.number().int().nonnegative().default(0),
  referenced_directive_ids: z.array(StableId).default([]),
});

export const supervisorAssessmentRecordedSchema = z.object({
  type: z.literal("supervisor_assessment_recorded"),
  worker: WorkerId,
  assessment_id: StableId,
  worker_run_id: StableId,
  worker_to_contract_alignment: workerAlignmentSchema,
  operator_verdict: z.enum(["CONTINUE", "WATCH", "REDIRECT", "HOLD", "CONTRACT_REPAIR"]),
  reason: NonEmpty,
  diagnostic_index: z.number().int().min(0).max(100).nullable(),
  next_review_trigger: NonEmpty,
  owner_action: ownerActionObligationSchema,
  continuation_policy: continuationPolicySchema,
  reviewed_state_vector_sha256: z.union([Sha256, FixtureSha]),
});

export const evidenceReceiptRecordedSchema = z.object({
  type: z.literal("evidence_receipt_recorded"),
  worker: WorkerId,
  receipt_id: StableId,
  producer_id: StableId,
  producer_role: z.enum(["COLLECTOR", "VERIFIER", "OWNER", "WORKER", "SUPERVISOR"]),
  evidence_class: z.enum(["COMMAND", "TEST", "DIFF", "ARTIFACT", "SEMANTIC_REVIEW", "OWNER_OBSERVATION", "RESEARCH_VERDICT"]),
  independence: z.enum(["INDEPENDENT", "WORKER_REPORTED", "SAME_PROVENANCE", "UNKNOWN"]),
  freshness: z.enum(["CURRENT", "STALE", "UNKNOWN"]),
  exact_candidate_sha256: z.union([Sha256, FixtureSha]).nullable(),
  summary: NonEmpty,
  refs: z.array(NonEmpty).default([]),
  verified: z.boolean(),
  changed_path_manifest: z.object({
    base_candidate_sha256: Sha256,
    current_candidate_sha256: Sha256,
    manifest_sha256: Sha256,
    complete: z.literal(true),
    paths: z.array(z.object({
      path: NonEmpty,
      change_kind: z.enum(["ADDED", "MODIFIED", "DELETED", "RENAMED"]),
      content_sha256: Sha256.nullable().default(null),
    })).min(1),
  }).nullable().default(null),
}).superRefine((receipt, context) => {
  if (receipt.evidence_class === "DIFF" && !receipt.changed_path_manifest) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["changed_path_manifest"], message: "DIFF evidence requires a complete content-addressed base-to-candidate path manifest" });
  }
  if (receipt.changed_path_manifest && receipt.changed_path_manifest.current_candidate_sha256 !== receipt.exact_candidate_sha256) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["changed_path_manifest", "current_candidate_sha256"], message: "Path manifest must bind the receipt's exact candidate" });
  }
});

export const findingRecordedSchema = z.object({
  type: z.literal("finding_recorded"),
  worker: WorkerId,
  finding_id: StableId,
  principal_group_id: StableId,
  finding_type: findingTypeSchema,
  severity: z.enum(["INFO", "MATERIAL", "BLOCKING", "CRITICAL"]),
  statement: NonEmpty,
  violated_requirement: NonEmpty,
  evidence_refs: z.array(NonEmpty).min(1),
  evidence_receipt_ids: z.array(StableId).min(1),
  reason_codes: z.array(NonEmpty).min(1),
  status: z.literal("OPEN"),
  required_response: NonEmpty,
  owner_action: ownerActionObligationSchema,
  continuation_policy: continuationPolicySchema,
});

const findingStatusCommon = {
  type: z.literal("finding_status_changed"),
  worker: WorkerId,
  finding_id: StableId,
  from_status: z.enum(["OPEN", "MITIGATED", "RESOLVED", "INVALIDATED", "REOPENED"]),
  reason: NonEmpty,
  reason_code: NonEmpty,
  basis_event_ids: z.array(StableId).min(1),
  actor_id: StableId,
  actor_role: z.enum(["SUPERVISOR", "VERIFIER", "OWNER", "SYSTEM"]),
  exact_candidate_sha256: z.union([Sha256, FixtureSha]).nullable().default(null),
  contract_sha256: z.union([Sha256, FixtureSha]),
  owner_outcome_id: StableId,
  owner_outcome_epoch: z.number().int().positive(),
  owner_outcome_sha256: z.union([Sha256, FixtureSha]),
};

export const findingStatusChangedSchema = z.discriminatedUnion("status", [
  z.object({
    ...findingStatusCommon,
    status: z.literal("MITIGATED"),
    mitigation_evidence_receipt_ids: z.array(StableId).min(1),
    residual_risk: NonEmpty,
    remaining_required_response: NonEmpty,
    next_review_trigger: NonEmpty,
  }),
  z.object({
    ...findingStatusCommon,
    status: z.literal("RESOLVED"),
    resolution_path: z.literal("CORRECTION_VERIFIED"),
    verification_event_id: StableId,
    evidence_requirement_schema_sha256: Sha256,
    verification_policy_sha256: Sha256,
  }),
  z.object({
    ...findingStatusCommon,
    status: z.literal("INVALIDATED"),
    invalidation_evidence_receipt_ids: z.array(StableId).min(1),
    invalidator_method_version: StableId,
    affected_directive_event_ids: z.array(StableId).default([]),
  }),
  z.object({
    ...findingStatusCommon,
    status: z.literal("REOPENED"),
    invalidating_event_id: StableId,
    invalidated_closure_event_id: StableId,
    binding_change: NonEmpty,
  }),
]);

const verificationBindingSchema = z.object({
  binding_id: StableId,
  binding_sha256: Sha256,
});

export const verificationValidityRecordedSchema = z.object({
  type: z.literal("verification_validity_recorded"),
  worker: WorkerId,
  context_id: StableId,
  supersedes_context_id: StableId.nullable().default(null),
  change_reason: NonEmpty,
  changed_dimensions: z.array(z.enum([
    "CANDIDATE", "CONTRACT", "OWNER_OUTCOME", "VERIFICATION_POLICY", "EVIDENCE_REQUIREMENT_SCHEMA",
    "ASSIGNMENT", "TARGET", "ENVIRONMENT", "SOURCE_SNAPSHOT", "VERIFIER_METHOD",
  ])).default([]),
  exact_candidate_sha256: Sha256,
  contract_sha256: Sha256,
  owner_outcome_id: StableId,
  owner_outcome_epoch: z.number().int().positive(),
  owner_outcome_sha256: Sha256,
  verification_policy_id: StableId,
  verification_policy_sha256: Sha256,
  evidence_requirement_schema_sha256: Sha256,
  worker_run_id: StableId,
  assignment_epoch: z.number().int().positive(),
  target_kind: correctionTargetKindSchema,
  target_id: StableId,
  target_epoch: z.number().int().positive(),
  environment_bindings: z.array(verificationBindingSchema).default([]),
  source_snapshot_bindings: z.array(verificationBindingSchema).default([]),
  verifier_method_version: StableId,
});

const verificationValidityScopeSchema = verificationValidityRecordedSchema.omit({
  type: true, worker: true, supersedes_context_id: true, change_reason: true, changed_dimensions: true,
}).extend({
  invalidate_on: z.array(z.enum([
    "CANDIDATE", "CONTRACT", "OWNER_OUTCOME", "VERIFICATION_POLICY", "EVIDENCE_REQUIREMENT_SCHEMA",
    "ASSIGNMENT", "TARGET", "ENVIRONMENT", "SOURCE_SNAPSHOT", "VERIFIER_METHOD",
  ])).min(1),
});

export const correctionLifecycleRecordedSchema = z.object({
  type: z.literal("correction_lifecycle_recorded"),
  worker: WorkerId,
  correction_attempt_id: StableId,
  directive_id: StableId,
  directive_digest: z.union([Sha256, FixtureSha]),
  finding_ids: z.array(StableId).min(1),
  task_id: StableId,
  worker_run_id: StableId,
  assignment_epoch: z.number().int().positive(),
  contract_id: StableId,
  contract_sha256: z.union([Sha256, FixtureSha]),
  owner_outcome_id: StableId,
  owner_outcome_epoch: z.number().int().positive(),
  owner_outcome_sha256: z.union([Sha256, FixtureSha]),
  directive_kind: directiveKindSchema,
  target_kind: correctionTargetKindSchema,
  target_id: StableId,
  target_epoch: z.number().int().positive(),
  status: correctionStatusSchema,
  directive: NonEmpty,
  producer_id: StableId,
  actor_id: StableId,
  actor_role: z.enum(["SUPERVISOR", "WORKER", "AUTHORIZED_EXECUTOR", "CONTRACT_ISSUER", "VERIFIER", "OWNER", "SYSTEM"]),
  causation_event_id: StableId.nullable().default(null),
  correlation_id: StableId,
  expected_predecessor_event_id: StableId.nullable().default(null),
  required_evidence: z.array(NonEmpty).min(1),
  evidence_receipt_ids: z.array(StableId).default([]),
  verified_candidate_sha256: z.union([Sha256, FixtureSha]).nullable().default(null),
  evidence_set_id: StableId.nullable().default(null),
  evidence_requirement_schema_sha256: z.union([Sha256, FixtureSha]).nullable().default(null),
  verification_policy_id: StableId.nullable().default(null),
  verification_policy_sha256: z.union([Sha256, FixtureSha]).nullable().default(null),
  verifier_id: StableId.nullable().default(null),
  verifier_role: z.enum(["INDEPENDENT", "POLICY_AUTHORIZED_SELF", "OWNER"]).nullable().default(null),
  verifier_method_version: StableId.nullable().default(null),
  verification_manifest: z.array(z.object({
    requirement: NonEmpty,
    evidence_receipt_id: StableId,
    conclusion: z.literal("PASS"),
  })).default([]),
  verification_validity_scope: verificationValidityScopeSchema.nullable().default(null),
  delivery_receipt: z.object({
    receipt_id: StableId,
    destination: NonEmpty,
    transport: NonEmpty,
    receiver_generated: z.boolean(),
    directive_digest: z.union([Sha256, FixtureSha]),
  }).nullable().default(null),
  acknowledged_directive_id: StableId.nullable().default(null),
  acknowledged_directive_digest: z.union([Sha256, FixtureSha]).nullable().default(null),
  first_corrective_action: z.string().nullable().default(null),
  activity_lease_expires_at: Timestamp.nullable().default(null),
  superseded_by_directive_id: StableId.nullable().default(null),
  exception_reason: z.string().nullable().default(null),
  blocker_actor_id: StableId.nullable().default(null),
  escalation_trigger: z.string().nullable().default(null),
  retry_possible: z.boolean().nullable().default(null),
  closure_basis: z.enum(["CORRECTED_AND_VERIFIED", "FINDING_INVALIDATED", "MIXED_RESOLUTION"]).nullable().default(null),
  next_review_trigger: NonEmpty,
  owner_action: ownerActionObligationSchema,
  continuation_policy: continuationPolicySchema,
});

export const completionClaimRecordedSchema = z.object({
  type: z.literal("completion_claim_recorded"),
  worker: WorkerId,
  claim_id: StableId,
  completion_claim_type: completionClaimTypeSchema,
  proposed_terminal_state: NonEmpty,
  exact_candidate_sha256: z.union([Sha256, FixtureSha]).nullable(),
  evidence_receipt_ids: z.array(StableId).default([]),
  owner_decision_id: StableId.nullable().default(null),
  parent_outcome_remains_open: z.boolean(),
}).superRefine((claim, context) => {
  if (claim.completion_claim_type === "OWNER_OUTCOME_ACHIEVED" && !claim.exact_candidate_sha256) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["exact_candidate_sha256"], message: "Root achievement requires an exact candidate digest" });
  }
  if (claim.completion_claim_type === "CANCELED_BY_OWNER" && !claim.owner_decision_id) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["owner_decision_id"], message: "Owner cancellation requires an explicit owner decision record" });
  }
});

export const ownerDecisionRecordedSchema = z.object({
  type: z.literal("owner_decision_recorded"),
  worker: WorkerId,
  owner_decision_id: StableId,
  decision_kind: z.enum(["CANCEL_OUTCOME", "AMEND_OUTCOME", "REMOVE_REQUIREMENT", "AUTHORIZE_SCOPE_CHANGE"]),
  owner_outcome_id: StableId,
  owner_outcome_epoch: z.number().int().positive(),
  owner_outcome_sha256: Sha256,
  source_receipt_id: StableId,
  exact_text: NonEmpty,
  authorized_by: StableId,
  decision_sha256: Sha256,
});

export const supervisionRouteRecordedSchema = z.object({
  type: z.literal("supervision_route_recorded"),
  worker: WorkerId,
  session_id: StableId,
  lane: z.enum(["DETERMINISTIC", "EXTRA_HIGH", "PRO"]),
  predecessor_session_id: StableId.nullable().default(null),
  chat_scope_key: NonEmpty,
  supervisor_chat_url: Url,
  supervisor_chat_label: NonEmpty,
  next_review_trigger: NonEmpty,
  substantive_response_count: z.number().int().min(0).max(3),
  hard_maximum: z.literal(3),
  status: z.enum(["ACTIVE", "ROLLOVER_REQUIRED", "CLOSED", "FORKED"]),
  handoff_capsule_id: StableId.nullable().default(null),
  handoff_capsule_sha256: z.union([Sha256, FixtureSha]).nullable().default(null),
  accepted_state_vector_sha256: z.union([Sha256, FixtureSha]).nullable().default(null),
  authority_high_water_sequence: z.number().int().nonnegative(),
});

export const researchVerdictRecordedSchema = z.object({
  type: z.literal("research_verdict_recorded"),
  worker: WorkerId,
  verdict_id: StableId,
  operational_protocol: z.enum(["PASS", "FAIL", "UNKNOWN"]),
  scientific_conclusion: z.enum(["PASS", "FAIL", "UNKNOWN"]),
  release_adequacy: z.enum(["PASS", "FAIL", "UNKNOWN"]),
  unsupported_inference: z.string().nullable(),
  publication_barrier: z.string().nullable(),
  remediation: NonEmpty,
  evidence_receipt_ids: z.array(StableId).default([]),
  release_permission: z.boolean(),
});

export const supervisionDesignFeedbackRecordedSchema = z.object({
  type: z.literal("supervision_design_feedback_recorded"),
  worker: WorkerId,
  feedback_id: StableId,
  category: NonEmpty,
  severity: z.enum(["NONBLOCKING", "MATERIAL", "IMMEDIATE_RISK"]),
  status: z.enum(["PENDING_PRO_META_REVIEW", "ACCEPTED", "ACCEPTED_WITH_REVISION", "REJECTED", "IMPLEMENTED"]),
  packet_sha256: z.union([Sha256, FixtureSha]),
  shared_pro_scope_key: NonEmpty,
});

const symphonySourceSchema = z.object({
  system: z.literal("openai/symphony"),
  endpoint: z.literal("/api/v1/state"),
  upstream_commit: z.string().regex(/^[a-f0-9]{40}$/),
  generated_at: Timestamp,
  received_at: Timestamp,
  payload_sha256: Sha256,
});

export const symphonyRuntimeObservedSchema = z.object({
  type: z.literal("symphony_runtime_observed"),
  worker: WorkerId,
  source: symphonySourceSchema,
  kind: z.enum(["running", "retrying", "blocked"]),
  issue_id: NonEmpty,
  issue_identifier: NonEmpty,
  tracker_state: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
});

export const reviewMarkedSchema = z.object({
  type: z.literal("review_marked"),
  worker: z.null(),
  reviewed_through_sequence: z.number().int().nonnegative(),
});

export const eventSchemaV2 = z.union([
  ownerSourceRecordedSchema, ownerOutcomeRecordedSchema, taskContractRecordedSchema,
  reconciliationRecordedSchema, workerCheckpointRecordedSchema, supervisorAssessmentRecordedSchema,
  evidenceReceiptRecordedSchema, findingRecordedSchema, findingStatusChangedSchema, correctionLifecycleRecordedSchema,
  verificationValidityRecordedSchema, completionClaimRecordedSchema, ownerDecisionRecordedSchema,
  supervisionRouteRecordedSchema, researchVerdictRecordedSchema,
  supervisionDesignFeedbackRecordedSchema, symphonyRuntimeObservedSchema, reviewMarkedSchema,
  supervisorChatLinkSetSchema,
]);

export const eventSchema = z.union([legacyEventSchema, eventSchemaV2]);

export const appendEnvelopeSchema = z.object({
  schema_version: z.literal(2),
  event_id: StableId,
  mission_id: StableId,
  occurred_at: Timestamp,
  data: eventSchemaV2,
});

export type LegacyMissionControlEvent = z.infer<typeof legacyEventSchema>;
export type MissionControlEventV2 = z.infer<typeof eventSchemaV2>;
export type MissionControlEvent = LegacyMissionControlEvent | MissionControlEventV2;
export type AppendEnvelope = z.infer<typeof appendEnvelopeSchema>;
export type ObjectiveCreatedEvent = z.infer<typeof objectiveCreatedSchema>;
export type WorkerHeartbeatEvent = z.infer<typeof workerHeartbeatSchema>;
export type SupervisorVerdictEvent = z.infer<typeof supervisorVerdictSchema>;
export type SupervisorChatLinkSetEvent = z.infer<typeof supervisorChatLinkSetSchema>;
export type Traffic = z.infer<typeof trafficSchema>;
export type WorkerAlignment = z.infer<typeof workerAlignmentSchema>;
export type ContractOwnerAlignment = z.infer<typeof contractOwnerAlignmentSchema>;
export type OwnerActionType = z.infer<typeof ownerActionTypeSchema>;
export type OwnerActionObligation = z.infer<typeof ownerActionObligationSchema>;
export type ContinuationPolicy = z.infer<typeof continuationPolicySchema>;
export type ContinuationMode = z.infer<typeof continuationModeSchema>;
export type DirectiveKind = z.infer<typeof directiveKindSchema>;
export type CompletionClaimType = z.infer<typeof completionClaimTypeSchema>;
export type CorrectionStatus = z.infer<typeof correctionStatusSchema>;
export type FindingType = z.infer<typeof findingTypeSchema>;

export interface StoredEvent {
  id: number;
  sequence: number;
  eventId: string;
  schemaVersion: 1 | 2;
  missionId: string;
  worker: string | null;
  type: MissionControlEvent["type"];
  occurredAt: string;
  receivedAt: string;
  previousHash: string | null;
  eventHash: string;
  data: MissionControlEvent;
}

export function parseLegacyEvent(input: unknown): LegacyMissionControlEvent {
  return legacyEventSchema.parse(input);
}

export function parseEventV2(input: unknown): MissionControlEventV2 {
  return eventSchemaV2.parse(input);
}

export function parseAppendEnvelope(input: unknown): AppendEnvelope {
  return appendEnvelopeSchema.parse(input);
}

export function eventWorker(data: MissionControlEvent): string | null {
  return data.worker;
}
