import { pathToFileURL } from "node:url";
import { canonicalJson, sha256 } from "./canonical";
import type { MissionControlEventV2 } from "./schema";
import { EventStore, getStore } from "./store";
import { authorityStateVectorHash } from "./terminal-comparator";

const missionId = "mission-control-demo";
type CorrectionEvent = Extract<MissionControlEventV2, { type: "correction_lifecycle_recorded" }>;
type CorrectionSeed = Pick<CorrectionEvent,
  "directive_id" | "directive_kind" | "finding_ids" | "worker_run_id" | "status" | "directive"
  | "required_evidence" | "next_review_trigger" | "owner_action" | "continuation_policy"
  | "target_kind" | "target_id"
> & Partial<Pick<CorrectionEvent,
  "actor_id" | "actor_role" | "delivery_receipt" | "acknowledged_directive_id"
  | "acknowledged_directive_digest" | "first_corrective_action" | "activity_lease_expires_at"
  | "evidence_receipt_ids" | "verified_candidate_sha256" | "evidence_set_id"
  | "evidence_requirement_schema_sha256" | "verification_policy_id" | "verification_policy_sha256"
  | "verifier_id" | "verifier_role" | "verifier_method_version" | "verification_manifest" | "superseded_by_directive_id"
  | "exception_reason" | "blocker_actor_id" | "escalation_trigger" | "retry_possible"
>>;

interface DemoWorker {
  worker: string;
  name: string;
  sourceCapability?: "INDEPENDENT_SOURCE_VERIFIED" | "INTEGRITY_ONLY";
  sourceComparison?: "MATCH" | "MISMATCH" | "NOT_INDEPENDENT";
  ownerRequest: string;
  normalizedResult: string;
  currentGap: string;
  requiredOutcomes: Array<{ id: string; text: string; status: "MET" | "UNMET" | "UNKNOWN" }>;
  goal: string;
  acceptance: string[];
  allowed: string[];
  forbidden: string[];
  effectiveFinishLine: string;
  omitted?: string[];
  weakened?: string[];
  proxies?: string[];
  reconciliationStatuses?: Record<string, "MAPPED_DIRECT" | "MAPPED_CONTRIBUTING" | "MAPPED_VERIFYING" | "UNMAPPED" | "WEAKENED" | "PROXY_SUBSTITUTED" | "OWNER_REMOVED" | "OWNER_AMENDED" | "AMBIGUOUS">;
  reconciliationDirective: string;
  checkpoint: Extract<MissionControlEventV2, { type: "worker_checkpoint_recorded" }>;
  evidence?: Array<Extract<MissionControlEventV2, { type: "evidence_receipt_recorded" }>>;
  findings?: Array<Extract<MissionControlEventV2, { type: "finding_recorded" }>>;
  claim: Extract<MissionControlEventV2, { type: "completion_claim_recorded" }>;
  research?: Extract<MissionControlEventV2, { type: "research_verdict_recorded" }>;
  assessment: Omit<Extract<MissionControlEventV2, { type: "supervisor_assessment_recorded" }>, "reviewed_state_vector_sha256">;
  route: Omit<Extract<MissionControlEventV2, { type: "supervision_route_recorded" }>, "authority_high_water_sequence">;
  corrections?: CorrectionSeed[];
  baseMinute: number;
}

export function seedStore(store: EventStore = getStore()): boolean {
  if (store.eventByEventId("demo:v2:seed-complete")) return false;

  for (const worker of demoWorkers()) seedWorker(store, worker);
  const timestamp = time(62);
  store.append(envelope("demo:v2:seed-complete", timestamp, {
    type: "supervision_design_feedback_recorded",
    worker: "tests",
    feedback_id: "SDF-20260830-DASHBOARD-ACTIONABILITY-001",
    category: "OPERATOR_ATTENTION_AND_CORRECTION_VISIBILITY",
    severity: "MATERIAL",
    status: "PENDING_PRO_META_REVIEW",
    packet_sha256: sha256("SDF-20260830-DASHBOARD-ACTIONABILITY-001"),
    shared_pro_scope_key: "supervision-architecture/pr42-owner-outcome-dual-alignment",
  }), timestamp);
  return true;
}

function seedWorker(store: EventStore, seed: DemoWorker) {
  const sourceId = `source:${seed.worker}:1`;
  const outcomeId = `outcome:${seed.worker}`;
  const sourceHash = sha256(`${seed.worker}:owner-source`);
  const outcomeHash = sha256(`${seed.worker}:owner-outcome:1`);
  const contractHash = sha256(`${seed.worker}:contract:1`);
  const sourceCapability = seed.sourceCapability ?? "INDEPENDENT_SOURCE_VERIFIED";
  const sourceComparison = seed.sourceComparison ?? "MATCH";
  const sourceMode = sourceCapability === "INDEPENDENT_SOURCE_VERIFIED" ? "INDEPENDENT_READER_DIRECT" : "WORKER_COPIED";
  const defaultCandidateSha256 = seed.evidence?.find((receipt) => receipt.exact_candidate_sha256)?.exact_candidate_sha256
    ?? sha256(`${seed.worker}:checkpoint-candidate`);
  const findingEvidence: Array<Extract<MissionControlEventV2, { type: "evidence_receipt_recorded" }>> = (seed.findings ?? []).map((finding) => {
    const paths = seed.checkpoint.files_touched.map((path) => ({
      path,
      change_kind: "MODIFIED" as const,
      content_sha256: sha256(`${seed.worker}:${path}:content`),
    }));
    const baseCandidateSha256 = sha256(`${seed.worker}:base-candidate`);
    const changedPathManifest = finding.finding_type === "FORBIDDEN_SCOPE" ? {
      base_candidate_sha256: baseCandidateSha256,
      current_candidate_sha256: defaultCandidateSha256,
      manifest_sha256: sha256(canonicalJson({ baseCandidateSha256, currentCandidateSha256: defaultCandidateSha256, paths })),
      complete: true as const,
      paths,
    } : null;
    return {
      type: "evidence_receipt_recorded",
      worker: seed.worker,
      receipt_id: `evidence:${finding.finding_id}`,
      producer_id: `collector:${seed.worker}`,
      producer_role: "COLLECTOR",
      evidence_class: changedPathManifest ? "DIFF" : "SEMANTIC_REVIEW",
      independence: "INDEPENDENT",
      freshness: "CURRENT",
      exact_candidate_sha256: defaultCandidateSha256,
      summary: `${finding.statement} Bound evidence: ${finding.evidence_refs.join("; ")}`,
      refs: finding.evidence_refs,
      verified: true,
      changed_path_manifest: changedPathManifest,
    };
  });
  const sourceEvents: MissionControlEventV2[] = [
    {
      type: "owner_source_recorded",
      worker: seed.worker,
      receipt_id: sourceId,
      owner_request_id: `owner-request:${seed.worker}`,
      canonical_locator: `fixture://owner-request/${seed.worker}`,
      source_sha256: sourceHash,
      worker_copy_sha256: sourceComparison === "MATCH" ? sourceHash : sha256(`${seed.worker}:worker-copy`),
      capture_integrity: "VERIFIED",
      acquisition_mode: sourceMode,
      receipt_capability: sourceCapability,
      comparison: sourceComparison,
      freshness: "CURRENT",
      limitations: sourceCapability === "INTEGRITY_ONLY" ? ["Worker-copied source is byte-bound but not independently acquired."] : [],
    },
    {
      type: "owner_outcome_recorded",
      worker: seed.worker,
      owner_outcome_id: outcomeId,
      owner_request_id: `owner-request:${seed.worker}`,
      epoch: 1,
      owner_outcome_sha256: outcomeHash,
      source_receipt_id: sourceId,
      verbatim_owner_request: [seed.ownerRequest],
      normalized_result: seed.normalizedResult,
      required_outcomes: seed.requiredOutcomes.map((outcome) => ({
        id: outcome.id,
        text: outcome.text,
        terminal_required: true,
        status: outcome.status,
        direct_evidence_receipt_ids: [],
      })),
      non_satisfying_proxies: seed.proxies ?? ["tests pass", "supervisor approval", "READY_FOR_OWNER_REVIEW"],
      current_gap: seed.currentGap,
      gap_status: seed.requiredOutcomes.every((required) => required.status === "MET") ? "NONE"
        : seed.requiredOutcomes.some((required) => required.status === "UNKNOWN") ? "UNKNOWN" : "OPEN",
      supersedes: null,
    },
    {
      type: "task_contract_recorded",
      worker: seed.worker,
      worker_name: seed.name,
      contract_id: `contract:${seed.worker}`,
      revision: 1,
      task_contract_sha256: contractHash,
      owner_outcome_id: outcomeId,
      owner_outcome_epoch: 1,
      owner_outcome_sha256: outcomeHash,
      goal: seed.goal,
      acceptance_criteria: seed.acceptance,
      allowed_scope: seed.allowed,
      forbidden_scope: seed.forbidden,
      expected_max_diff_lines: 420,
      effective_finish_line: seed.effectiveFinishLine,
      required_owner_outcome_ids: seed.requiredOutcomes.map((outcome) => outcome.id).filter((id) => !(seed.omitted ?? []).includes(id)),
      omitted_owner_outcome_ids: seed.omitted ?? [],
      weakened_owner_outcome_ids: seed.weakened ?? [],
      proxy_substitutions: seed.proxies ?? [],
      authorized_scope_changes: [],
      parent_outcome_remains_open: true,
    },
    {
      type: "objective_reconciliation_recorded",
      worker: seed.worker,
      reconciliation_id: `reconciliation:${seed.worker}:1`,
      owner_outcome_id: outcomeId,
      owner_outcome_epoch: 1,
      owner_outcome_sha256: outcomeHash,
      task_contract_sha256: contractHash,
      freshness: "CURRENT",
      matrix: seed.requiredOutcomes.map((outcome) => ({
        owner_requirement_id: outcome.id,
        owner_requirement: outcome.text,
        worker_interpretation: seed.omitted?.includes(outcome.id) ? seed.effectiveFinishLine : outcome.text,
        task_criterion: seed.omitted?.includes(outcome.id) ? seed.effectiveFinishLine : seed.acceptance[0],
        acceptance_evidence_receipt_ids: [],
        status: seed.reconciliationStatuses?.[outcome.id] ?? (seed.omitted?.includes(outcome.id) ? "UNMAPPED" : "MAPPED_DIRECT"),
        authorized_change: null,
      })),
      current_gap: seed.currentGap,
      gap_status: seed.requiredOutcomes.every((required) => required.status === "MET") ? "NONE"
        : seed.requiredOutcomes.some((required) => required.status === "UNKNOWN") ? "UNKNOWN" : "OPEN",
      unmet_owner_outcome_ids: seed.requiredOutcomes.filter((outcome) => outcome.status === "UNMET").map((outcome) => outcome.id),
      unknown_owner_outcome_ids: seed.requiredOutcomes.filter((outcome) => outcome.status === "UNKNOWN").map((outcome) => outcome.id),
      non_satisfying_proxies: seed.proxies ?? [],
      proposed_required_directive: seed.reconciliationDirective,
    },
    seed.checkpoint,
    ...(seed.evidence ?? []),
    ...findingEvidence,
    ...(seed.findings ?? []),
    ...(seed.research ? [seed.research] : []),
    seed.claim,
  ];
  store.appendMany(sourceEvents.map((data, index) => {
    const occurredAt = time(seed.baseMinute + index);
    return { event: envelope(`demo:${seed.worker}:base:${index + 1}`, occurredAt, data), receivedAt: occurredAt };
  }));

  const assessmentAt = time(seed.baseMinute + sourceEvents.length);
  store.append(envelope(`demo:${seed.worker}:assessment`, assessmentAt, {
    ...seed.assessment,
    reviewed_state_vector_sha256: authorityStateVectorHash(store.workerEvents(seed.worker)),
  }), assessmentAt);
  const routeAt = time(seed.baseMinute + sourceEvents.length, 20);
  store.append(envelope(`demo:${seed.worker}:route`, routeAt, {
    ...seed.route,
    authority_high_water_sequence: store.latestSequence(),
  }), routeAt);
  for (const [index, correction] of (seed.corrections ?? []).entries()) {
    const occurredAt = time(seed.baseMinute + sourceEvents.length + index, 30);
    const eventId = `demo:${seed.worker}:correction:${index + 1}`;
    const predecessorEventId = index === 0 ? null : `demo:${seed.worker}:correction:${index}`;
    const directiveDigest = sha256(correction.directive);
    const data: CorrectionEvent = {
      type: "correction_lifecycle_recorded",
      worker: seed.worker,
      correction_attempt_id: `correction-attempt:${seed.worker}:1`,
      directive_id: correction.directive_id,
      directive_digest: directiveDigest,
      finding_ids: correction.finding_ids,
      task_id: `task:${seed.worker}`,
      worker_run_id: correction.worker_run_id,
      assignment_epoch: 1,
      contract_id: `contract:${seed.worker}`,
      contract_sha256: contractHash,
      owner_outcome_id: outcomeId,
      owner_outcome_epoch: 1,
      owner_outcome_sha256: outcomeHash,
      directive_kind: correction.directive_kind,
      target_kind: correction.target_kind,
      target_id: correction.target_id,
      target_epoch: 1,
      status: correction.status,
      directive: correction.directive,
      producer_id: "mission-control-supervisor",
      actor_id: correction.actor_id ?? (correction.status === "DIRECTIVE_DELIVERED" ? "mission-control-delivery" : "mission-control-supervisor"),
      actor_role: correction.actor_role ?? (correction.status === "DIRECTIVE_DELIVERED" ? "SYSTEM" : "SUPERVISOR"),
      causation_event_id: predecessorEventId ?? `demo:${seed.worker}:assessment`,
      correlation_id: `correlation:${seed.worker}:correction:1`,
      expected_predecessor_event_id: predecessorEventId,
      required_evidence: correction.required_evidence,
      evidence_receipt_ids: correction.evidence_receipt_ids ?? [],
      verified_candidate_sha256: correction.verified_candidate_sha256 ?? null,
      evidence_set_id: correction.evidence_set_id ?? null,
      evidence_requirement_schema_sha256: correction.evidence_requirement_schema_sha256 ?? sha256(canonicalJson(correction.required_evidence)),
      verification_policy_id: correction.verification_policy_id ?? null,
      verification_policy_sha256: correction.verification_policy_sha256 ?? null,
      verifier_id: correction.verifier_id ?? null,
      verifier_role: correction.verifier_role ?? null,
      verifier_method_version: correction.verifier_method_version ?? null,
      verification_manifest: correction.verification_manifest ?? [],
      verification_validity_scope: null,
      delivery_receipt: correction.delivery_receipt ?? null,
      acknowledged_directive_id: correction.acknowledged_directive_id ?? null,
      acknowledged_directive_digest: correction.acknowledged_directive_digest ?? null,
      first_corrective_action: correction.first_corrective_action ?? null,
      activity_lease_expires_at: correction.activity_lease_expires_at ?? null,
      superseded_by_directive_id: correction.superseded_by_directive_id ?? null,
      exception_reason: correction.exception_reason ?? null,
      blocker_actor_id: correction.blocker_actor_id ?? null,
      escalation_trigger: correction.escalation_trigger ?? null,
      retry_possible: correction.retry_possible ?? null,
      closure_basis: null,
      next_review_trigger: correction.next_review_trigger,
      owner_action: correction.owner_action,
      continuation_policy: correction.continuation_policy,
    };
    store.append(envelope(eventId, occurredAt, data), occurredAt);
  }
}

function demoWorkers(): DemoWorker[] {
  return [authWorker(), billingWorker(), uiWorker(), testCleanupWorker(), articleWorker(), askRigorWorker()];
}

function authWorker(): DemoWorker {
  return {
    worker: "auth",
    name: "Auth refactor",
    ownerRequest: "Centralize session validation without changing authentication behavior.",
    normalizedResult: "Session validation is centralized and existing authentication behavior remains unchanged.",
    currentGap: "Finish the bounded guard extraction and run the auth integration suite.",
    requiredOutcomes: [{ id: "auth-centralized", text: "Centralize validation while preserving behavior.", status: "UNMET" }],
    goal: "Refactor session validation without changing authentication behavior",
    acceptance: ["Existing auth tests pass", "Session validation is centralized", "No API behavior changes"],
    allowed: ["src/auth/**", "tests/auth/**"],
    forbidden: ["src/billing/**", "src/core/permissions/**"],
    effectiveFinishLine: "Bounded auth refactor verified against the current owner outcome",
    reconciliationDirective: "CONTINUE_AUTH_REFACTOR",
    checkpoint: checkpoint("auth", "run-auth-01", "Consolidating session validation guards", ["Mapped existing auth entry points", "Added characterization tests"], ["Finish guard extraction", "Run auth integration tests"], ["src/auth/session.ts", "tests/auth/session.test.ts"], 86, 0, 144),
    claim: claim("auth", "claim-auth-working", "WORKING", "IN_PROGRESS"),
    assessment: assessment("auth", "assessment-auth-01", "run-auth-01", "GREEN", "CONTINUE", "Work remains inside the auth boundary and preserves observed behavior.", 96, "next commit"),
    route: route("auth", "session-auth-pro-01", "next commit", 1),
    baseMinute: 1,
  };
}

function billingWorker(): DemoWorker {
  const findingId = "finding-billing-shared-schema";
  return {
    worker: "billing",
    name: "Billing / webhooks",
    ownerRequest: "Implement retry-safe Stripe webhooks using the existing event model.",
    normalizedResult: "Stripe webhook processing is idempotent without changing the shared event architecture.",
    currentGap: "Remove the shared-schema experiment and complete idempotency inside the billing boundary.",
    requiredOutcomes: [{ id: "billing-idempotency", text: "Duplicate Stripe events are idempotent in the existing event model.", status: "UNMET" }],
    goal: "Implement retry-safe Stripe webhook handling using the existing event model",
    acceptance: ["Duplicate Stripe events are idempotent", "Integration suite passes", "Existing event model is retained"],
    allowed: ["src/billing/**", "tests/billing/**"],
    forbidden: ["src/shared/schema/**", "src/core/events/**"],
    effectiveFinishLine: "Billing-scoped idempotency with the existing event model",
    reconciliationDirective: "RETURN_TO_BILLING_SCOPE",
    checkpoint: {
      ...checkpoint("billing", "run-billing-01", "Returning idempotency storage to the existing event model", ["Added event-key persistence", "Detected duplicate deliveries"], ["Remove shared-schema experiment", "Add duplicate-event test", "Run integration suite"], ["src/billing/webhooks.ts", "src/shared/schema/events.ts"], 184, 0, 271),
      plan_changed: true,
      plan_change_reason: "Supervisor identified the unnecessary shared-schema expansion.",
      assumptions: ["Stripe event IDs are globally unique"],
    },
    findings: [finding("billing", findingId, "finding-group-billing-scope", "FORBIDDEN_SCOPE", "MATERIAL", "Worker touched a forbidden shared-schema path while implementing billing idempotency.", "The task retains the existing event model and forbids src/shared/schema/**.", ["file:src/shared/schema/events.ts"], "Remove the shared-schema experiment and use the existing billing event model.", true)],
    claim: claim("billing", "claim-billing-working", "WORKING", "IN_PROGRESS"),
    assessment: assessment("billing", "assessment-billing-01", "run-billing-01", "YELLOW", "WATCH", "A shared-schema abstraction expanded the work beyond the billing boundary.", 72, "next commit"),
    route: route("billing", "session-billing-pro-01", "next commit", 1),
    baseMinute: 11,
  };
}

function uiWorker(): DemoWorker {
  return {
    worker: "ui",
    name: "UI migration",
    ownerRequest: "Migrate settings to the current component library with visual and accessibility parity.",
    normalizedResult: "The settings screen uses the current component library with visual and accessibility parity.",
    currentGap: "Resume the remaining panels after the declared design-token dependency is available.",
    requiredOutcomes: [{ id: "ui-parity", text: "Complete the accessible settings migration with visual parity.", status: "UNMET" }],
    goal: "Migrate the settings screen to the current component library",
    acceptance: ["Visual parity is maintained", "Accessibility checks pass", "Old screen route is removed"],
    allowed: ["src/ui/settings/**", "tests/ui/settings/**"],
    forbidden: ["src/api/**", "src/billing/**"],
    effectiveFinishLine: "Accessible settings migration with exact visual parity",
    reconciliationDirective: "WAIT_FOR_DECLARED_DEPENDENCY",
    checkpoint: {
      ...checkpoint("ui", "run-ui-01", "Waiting for the design-token package release", ["Migrated account panel", "Added keyboard navigation tests"], ["Upgrade design tokens", "Migrate notification panel", "Run visual regression suite"], ["src/ui/settings/account.tsx", "tests/ui/settings/a11y.test.tsx"], 63, 0, 302),
      status: "blocked",
      blocker: "design-tokens v4 has not been published",
    },
    claim: claim("ui", "claim-ui-working", "WORKING", "IN_PROGRESS"),
    assessment: assessment("ui", "assessment-ui-01", "run-ui-01", "GREEN", "CONTINUE", "The declared dependency is legitimate and completed work remains in the UI boundary.", 93, "dependency resolved"),
    route: route("ui", "session-ui-pro-01", "dependency resolved", 1),
    baseMinute: 21,
  };
}

function testCleanupWorker(): DemoWorker {
  const directive = "Stop and revert production scheduler and caller changes; return to tests/** or test-support/**; rerun the focused test command.";
  const directiveDigest = sha256(directive);
  const requiredEvidence = ["revert commit or clean diff", "no forbidden production paths changed", "focused tests pass"];
  const correctionBase = {
    directive_id: "directive-tests-return-to-test-scope",
    directive_kind: "WORKER_REDIRECT" as const,
    target_kind: "WORKER_RUN" as const,
    target_id: "run-tests-01",
    finding_ids: ["finding-tests-forbidden-production", "finding-tests-objective-contradiction", "finding-tests-unexplained-plan-change", "finding-tests-invalid-assumption"],
    worker_run_id: "run-tests-01",
    directive,
    required_evidence: requiredEvidence,
    next_review_trigger: "after revert evidence and focused tests",
    owner_action: ownerActionNone("tests", "directive-tests-return-to-test-scope", "WORKER", "Acknowledge the exact directive, stop and revert production changes, then submit the required correction evidence.", "directive-bound acknowledgement", "Worker and supervisor can complete the bounded correction."),
    continuation_policy: continuationPolicy("tests", "finding-tests-forbidden-production", false),
  };
  return {
    worker: "tests",
    name: "Test cleanup",
    ownerRequest: "Remove flaky test setup and stabilize the suite without changing production logic.",
    normalizedResult: "Flaky test setup is removed and the suite is stable while production logic remains untouched.",
    currentGap: "Revert production scheduler/caller changes and solve the failure inside tests/** or test-support/**.",
    requiredOutcomes: [
      { id: "tests-stable", text: "Remove flaky setup and stabilize the test suite.", status: "UNMET" },
      { id: "production-untouched", text: "Production logic remains untouched.", status: "UNMET" },
    ],
    goal: "Remove flaky test setup and stabilize the test suite without changing production logic",
    acceptance: ["Flaky setup is removed", "Test suite passes twice consecutively", "Production logic is untouched"],
    allowed: ["tests/**", "test-support/**"],
    forbidden: ["src/core/**", "src/production/**"],
    effectiveFinishLine: "Stable tests with no production behavior change",
    reconciliationDirective: "RETURN_TO_TEST_SCOPE",
    checkpoint: {
      ...checkpoint("tests", "run-tests-01", "Rewriting the production scheduler to accommodate test timing", ["Removed duplicate fixtures"], ["Replace scheduler implementation", "Update production callers"], ["tests/setup.ts", "src/core/scheduler.ts"], 411, 7, 612),
      plan_changed: true,
      plan_change_reason: null,
      assumptions: ["Production timing semantics may be changed"],
    },
    evidence: [{
      type: "evidence_receipt_recorded", worker: "tests", receipt_id: "evidence-tests-regression",
      producer_id: "collector:tests", producer_role: "COLLECTOR",
      evidence_class: "TEST", independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: sha256("tests-bad-candidate"),
      summary: "Focused test run reports 411 passing and 7 failing after scheduler changes.", refs: ["command:npm test"], verified: true,
      changed_path_manifest: null,
    }],
    findings: [
      finding("tests", "finding-tests-forbidden-production", "finding-group-tests-production", "FORBIDDEN_SCOPE", "BLOCKING", "Worker is changing the forbidden production scheduler and callers to solve a test-only task.", "Allowed scope is tests/** and test-support/**; src/core/** and src/production/** are forbidden.", [
        "worker-checkpoint:current_step=Rewriting the production scheduler to accommodate test timing",
        "worker-checkpoint:next_step=Update production callers", "file:src/core/scheduler.ts",
        "task-id:task:tests", "worker-run-id:run-tests-01", `task-contract-sha256:${sha256("tests:contract:1")}`,
        `owner-outcome-sha256:${sha256("tests:owner-outcome:1")}`, "allowed-scope:tests/**,test-support/**",
        "forbidden-scope:src/core/**,src/production/**", "base-candidate:mission-control-demo-base",
        `current-candidate-sha256:${sha256("tests-bad-candidate")}`, "changed-path-manifest:tests/setup.ts,src/core/scheduler.ts",
      ], "Stop and revert production changes.", false),
      finding("tests", "finding-tests-objective-contradiction", "finding-group-tests-production", "OBJECTIVE_CONTRADICTION", "BLOCKING", "The proposed scheduler rewrite contradicts the requirement that production logic remain untouched.", "Acceptance criterion: Production logic is untouched.", ["task-contract:acceptance=Production logic is untouched", "worker-checkpoint:current_step=Rewriting the production scheduler"], "Return the implementation to test-only mechanisms.", false),
      finding("tests", "finding-tests-unexplained-plan-change", "finding-group-tests-production", "UNEXPLAINED_PLAN_CHANGE", "MATERIAL", "The plan changed without an authority-preserving reason.", "Material plan changes require a recorded reason and reconciliation.", ["worker-checkpoint:plan_changed=true", "worker-checkpoint:plan_change_reason=null"], "Provide a scope-compliant plan after the revert.", false),
      finding("tests", "finding-tests-invalid-assumption", "finding-group-tests-production", "INVALID_ASSUMPTION", "MATERIAL", "The assumption that production timing semantics may change contradicts task authority.", "Goal and acceptance require no production behavior change.", ["worker-checkpoint:assumption=Production timing semantics may be changed"], "Withdraw the assumption and work within test scope.", false),
    ],
    claim: claim("tests", "claim-tests-working", "WORKING", "IN_PROGRESS"),
    assessment: assessment("tests", "assessment-tests-01", "run-tests-01", "RED", "REDIRECT", "The worker is modifying forbidden production behavior to solve a test-only objective.", 21, "after revert evidence and focused tests"),
    route: route("tests", "session-tests-pro-01", "after revert evidence and focused tests", 1),
    corrections: [
      { ...correctionBase, status: "DIRECTIVE_PREPARED" },
      { ...correctionBase, status: "DIRECTIVE_ISSUED" },
      {
        ...correctionBase,
        status: "DIRECTIVE_DELIVERED",
        delivery_receipt: {
          receipt_id: "delivery-receipt:tests:1",
          destination: "worker-run:run-tests-01",
          transport: "mission-control-daemon",
          receiver_generated: true,
          directive_digest: directiveDigest,
        },
      },
    ],
    baseMinute: 31,
  };
}

function articleWorker(): DemoWorker {
  return {
    worker: "article-humanization",
    name: "Article humanization",
    sourceComparison: "MISMATCH",
    ownerRequest: "Humanize the article, with Pangram as a required measurement.",
    normalizedResult: "The exact final article satisfies the project-defined Pangram target while preserving source integrity.",
    currentGap: "Pangram reports 13.82% Human; continue humanization against the required target.",
    requiredOutcomes: [
      { id: "article-humanization", text: "The exact candidate meets the project-defined Pangram humanization target.", status: "UNMET" },
      { id: "article-preservation", text: "Required meaning, authority, and source integrity are preserved.", status: "MET" },
    ],
    goal: "Prepare an editorially sound, source-preserving article for owner review",
    acceptance: ["Editorial gate passes", "Source integrity passes", "READY_FOR_OWNER_REVIEW"],
    allowed: ["article/**", "evidence/**"],
    forbidden: ["sources/canonical/**"],
    effectiveFinishLine: "READY_FOR_OWNER_REVIEW",
    omitted: ["article-humanization"],
    proxies: ["editorial gate PASS", "source-integrity PASS", "supervisor approval", "READY_FOR_OWNER_REVIEW"],
    reconciliationStatuses: { "article-humanization": "PROXY_SUBSTITUTED", "article-preservation": "MAPPED_DIRECT" },
    reconciliationDirective: "CONTINUE_HUMANIZATION",
    checkpoint: checkpoint("article-humanization", "run-article-01", "Submitting the editorially sound article for owner review", ["Preserved source integrity", "Passed independent reader"], ["Await owner review"], ["article/final.md"], 18, 0, 92),
    evidence: [{
      type: "evidence_receipt_recorded", worker: "article-humanization", receipt_id: "evidence-article-pangram-13-82",
      producer_id: "collector:article-humanization", producer_role: "COLLECTOR",
      evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: sha256("article-candidate-13.82"),
      summary: "Pangram reports 13.82% Human; preservation and editorial gates pass.", refs: ["fixture:MC-CONTRACT-LAUNDERING-ARTICLE-HUMANIZATION-13_82"], verified: true,
      changed_path_manifest: null,
    }],
    findings: [
      finding("article-humanization", "finding-article-scope-contraction", "finding-group-article-contract", "SCOPE_CONTRACTION", "BLOCKING", "The derived contract omits the required Pangram humanization outcome.", "Owner requires the exact candidate to meet the project-defined Pangram target.", ["fixture:derived_contract.omits_required_outcomes=article-humanization"], "Repair the contract and keep the owner outcome open.", true),
      finding("article-humanization", "finding-article-objective-substitution", "finding-group-article-contract", "OBJECTIVE_SUBSTITUTION", "BLOCKING", "The contract substitutes review readiness for the requested humanization result.", "The owner requested measured humanization, not merely editorial readiness.", ["fixture:effective_finish_line=READY_FOR_OWNER_REVIEW"], "Restore measured humanization as a terminal-required outcome.", true),
      finding("article-humanization", "finding-article-proxy-substitution", "finding-group-article-contract", "PROXY_SUBSTITUTION", "BLOCKING", "Editorial and preservation gates are valid supporting work but do not satisfy the Pangram target.", "Non-satisfying proxies cannot close the root outcome.", ["fixture:pangram_human_percent=13.82", "fixture:pangram_target_met=false"], "Preserve supporting work and continue direct humanization.", true),
      finding("article-humanization", "finding-article-completion-illusion", "finding-group-article-contract", "COMPLETION_ILLUSION", "BLOCKING", "READY_FOR_OWNER_REVIEW is being presented as a finish line while the owner outcome is unmet.", "Review readiness is nonterminal by default.", ["fixture:completion_claim_type=READY_FOR_OWNER_REVIEW"], "Keep the root open until the exact target is met.", true),
    ],
    claim: {
      ...claim("article-humanization", "claim-article-review", "READY_FOR_OWNER_REVIEW", "READY_FOR_OWNER_REVIEW"),
      exact_candidate_sha256: sha256("article-candidate-13.82"),
      evidence_receipt_ids: ["evidence-article-pangram-13-82"],
    },
    assessment: assessment("article-humanization", "assessment-article-01", "run-article-01", "GREEN", "CONTRACT_REPAIR", "The worker satisfies the narrowed contract, but the contract diverges from the owner-required humanization result.", 100, "after contract repair and a new exact-candidate Pangram receipt"),
    route: route("article-humanization", "session-article-pro-01", "after contract repair", 1),
    corrections: [{
      directive_id: "directive-article-contract-repair",
      directive_kind: "CONTRACT_REPAIR", finding_ids: ["finding-article-scope-contraction", "finding-article-objective-substitution", "finding-article-proxy-substitution", "finding-article-completion-illusion"],
      target_kind: "TASK_CONTRACT", target_id: "contract:article-humanization",
      worker_run_id: "run-article-01", status: "DIRECTIVE_PREPARED",
      directive: "Repair the derived contract, preserve valid editorial work, and continue humanization against the owner-required target.",
      required_evidence: ["repaired contract with backward trace", "new exact-candidate Pangram receipt"],
      next_review_trigger: "after contract repair and a new exact-candidate Pangram receipt",
      owner_action: ownerActionNone("article-humanization", "directive-article-contract-repair", "CONTRACT_ISSUER", "Issue a corrected immutable contract and classify existing artifacts for reuse.", "corrected contract issued", "No owner decision is required to restore the omitted requirement."),
      continuation_policy: continuationPolicy("article-humanization", "finding-article-scope-contraction", true),
    }],
    baseMinute: 41,
  };
}

function askRigorWorker(): DemoWorker {
  return {
    worker: "askrigor",
    name: "AskRigor evidence review",
    ownerRequest: "Run the current AskRigor protocol and release only a scientifically supported conclusion.",
    normalizedResult: "Operational execution, scientific conclusion, and release adequacy each pass independently before publication.",
    currentGap: "Protocol execution passed, but the current causal inference is not supported by the assembled evidence.",
    requiredOutcomes: [
      { id: "askrigor-protocol", text: "Execute the current protocol completely.", status: "MET" },
      { id: "askrigor-science", text: "Support the claimed scientific inference.", status: "UNMET" },
      { id: "askrigor-release", text: "Meet the release adequacy gate.", status: "UNMET" },
    ],
    goal: "Complete an AskRigor review without conflating operational, scientific, and release adequacy",
    acceptance: ["Operational protocol passes", "Scientific conclusion passes", "Release adequacy passes"],
    allowed: ["research/**", "reports/**"],
    forbidden: ["publication/**"],
    effectiveFinishLine: "All three AskRigor assurance planes pass for the exact candidate",
    reconciliationDirective: "CONTINUE_SCIENTIFIC_REVIEW",
    checkpoint: checkpoint("askrigor", "run-askrigor-01", "Reviewing the unsupported inference against the evidence ledger", ["Completed operational protocol"], ["Repair inference", "Run independent scientific review"], ["research/evidence-ledger.json", "reports/verdict.md"], 24, 0, 176),
    research: {
      type: "research_verdict_recorded", worker: "askrigor", verdict_id: "research-verdict-askrigor-01",
      operational_protocol: "PASS", scientific_conclusion: "FAIL", release_adequacy: "FAIL",
      unsupported_inference: "The current evidence does not support the proposed causal conclusion.", publication_barrier: "Scientific conclusion and release adequacy have not passed.",
      remediation: "Continue bounded scientific review and repair the unsupported inference before release.", evidence_receipt_ids: [], release_permission: false,
    },
    findings: [finding("askrigor", "finding-askrigor-unsupported-inference", "finding-group-askrigor-science", "SCIENTIFIC_CONCLUSION_UNSUPPORTED", "BLOCKING", "Protocol execution passed, but the claimed inference is not supported by the assembled evidence.", "Scientific conclusion and release adequacy must pass independently of operational execution.", [
      `report-candidate-sha256:${sha256("askrigor-report-candidate-1")}`,
      `unsupported-claim-span:causal-conclusion:${sha256("The current evidence does not support the proposed causal conclusion.")}`,
      "source-identifiers:research/evidence-ledger.json", "manifest:universal=current:hrp=current",
      "protocol-clause:scientific-inference-support", "audit-run-id:run-askrigor-01",
      "scientific-evaluator:independent-reviewer:v1", `verification-policy-sha256:${sha256("askrigor-scientific-policy-v1")}`,
      "research-verdict:scientific_conclusion=FAIL", "research-verdict:release_adequacy=FAIL",
      "release-gate:BLOCKED",
    ], "Continue bounded scientific review and repair the unsupported inference before release.", true)],
    claim: claim("askrigor", "claim-askrigor-working", "WORKING", "IN_PROGRESS"),
    assessment: assessment("askrigor", "assessment-askrigor-01", "run-askrigor-01", "GREEN", "WATCH", "The worker followed the protocol; scientific and release planes remain failed.", 88, "after an independent scientific verdict"),
    route: route("askrigor", "session-askrigor-pro-01", "after an independent scientific verdict", 1),
    corrections: [{
      directive_id: "directive-askrigor-science-repair",
      directive_kind: "RELEASE_REMEDIATION", target_kind: "RELEASE_CANDIDATE", target_id: "release-candidate:askrigor:1",
      finding_ids: ["finding-askrigor-unsupported-inference"], worker_run_id: "run-askrigor-01",
      status: "DIRECTIVE_PREPARED", directive: "Continue bounded scientific review and repair the unsupported inference before release.",
      required_evidence: ["independent scientific verdict", "exact-candidate release review"], next_review_trigger: "after an independent scientific verdict",
      owner_action: ownerActionNone("askrigor", "directive-askrigor-science-repair", "VERIFIER", "Run independent scientific verification on the exact report candidate.", "independent scientific verdict", "No owner action is required while bounded scientific review continues."),
      continuation_policy: continuationPolicy("askrigor", "finding-askrigor-unsupported-inference", true),
    }],
    baseMinute: 53,
  };
}

function checkpoint(worker: string, workerRunId: string, currentStep: string, completed: string[], next: string[], files: string[], passing: number, failing: number, diffLines: number): Extract<MissionControlEventV2, { type: "worker_checkpoint_recorded" }> {
  return {
    type: "worker_checkpoint_recorded", worker, worker_run_id: workerRunId, status: "working", current_step: currentStep,
    completed_steps: completed, next_steps: next, files_touched: files,
    tests: { passing, failing, lint: "passing", build: failing ? "failing" : "passing" },
    plan_changed: false, plan_change_reason: null, blocker: null, assumptions: [], diff_lines: diffLines, referenced_directive_ids: [],
  };
}

function claim(worker: string, id: string, type: Extract<MissionControlEventV2, { type: "completion_claim_recorded" }>["completion_claim_type"], state: string): Extract<MissionControlEventV2, { type: "completion_claim_recorded" }> {
  return {
    type: "completion_claim_recorded", worker, claim_id: id, completion_claim_type: type,
    proposed_terminal_state: state, exact_candidate_sha256: null, evidence_receipt_ids: [], owner_decision_id: null,
    parent_outcome_remains_open: true,
  };
}

function assessment(worker: string, id: string, runId: string, alignment: Extract<MissionControlEventV2, { type: "supervisor_assessment_recorded" }>["worker_to_contract_alignment"], verdict: Extract<MissionControlEventV2, { type: "supervisor_assessment_recorded" }>["operator_verdict"], reason: string, index: number, trigger: string): Omit<Extract<MissionControlEventV2, { type: "supervisor_assessment_recorded" }>, "reviewed_state_vector_sha256"> {
  return {
    type: "supervisor_assessment_recorded", worker, assessment_id: id, worker_run_id: runId,
    worker_to_contract_alignment: alignment, operator_verdict: verdict, reason, diagnostic_index: index,
    next_review_trigger: trigger,
    owner_action: ownerActionNone(worker, id, "SUPERVISOR", "Review the next durable worker checkpoint against current authority.", trigger),
    continuation_policy: continuationPolicy(worker, `assessment-basis:${worker}`, alignment !== "RED"),
  };
}

function route(worker: string, sessionId: string, trigger: string, turns: number): Omit<Extract<MissionControlEventV2, { type: "supervision_route_recorded" }>, "authority_high_water_sequence"> {
  return {
    type: "supervision_route_recorded", worker, session_id: sessionId, lane: "PRO", predecessor_session_id: null,
    chat_scope_key: `mission-control/${worker}`, supervisor_chat_url: `https://chatgpt.com/c/replace-${worker}-supervisor`,
    supervisor_chat_label: `Open ${worker} Pro supervisor`, next_review_trigger: trigger,
    substantive_response_count: turns, hard_maximum: 3, status: turns >= 3 ? "ROLLOVER_REQUIRED" : "ACTIVE",
    handoff_capsule_id: null, handoff_capsule_sha256: null, accepted_state_vector_sha256: null,
  };
}

function finding(worker: string, id: string, groupId: string, type: Extract<MissionControlEventV2, { type: "finding_recorded" }>["finding_type"], severity: Extract<MissionControlEventV2, { type: "finding_recorded" }>["severity"], statement: string, violated: string, evidenceRefs: string[], response: string, safe: boolean): Extract<MissionControlEventV2, { type: "finding_recorded" }> {
  return {
    type: "finding_recorded", worker, finding_id: id, principal_group_id: groupId, finding_type: type,
    severity, statement, violated_requirement: violated, evidence_refs: evidenceRefs,
    evidence_receipt_ids: [`evidence:${id}`], reason_codes: findingReasonCodes(type), status: "OPEN", required_response: response,
    owner_action: ownerActionNone(worker, id, "SUPERVISOR", "Carry the bounded correction to its next evidence-backed checkpoint.", "next correction checkpoint"),
    continuation_policy: continuationPolicy(worker, id, safe),
  };
}

function findingReasonCodes(type: Extract<MissionControlEventV2, { type: "finding_recorded" }>["finding_type"]): string[] {
  const codes: Partial<Record<typeof type, string[]>> = {
    FORBIDDEN_SCOPE: ["SCOPE.FORBIDDEN_PATH_MODIFICATION"],
    OBJECTIVE_CONTRADICTION: ["PLAN.UNAUTHORIZED_CHANGE"],
    UNEXPLAINED_PLAN_CHANGE: ["PLAN.CHANGE_REASON_MISSING"],
    INVALID_ASSUMPTION: ["ASSUMPTION.CONTRACT_CONTRADICTION"],
    SCIENTIFIC_CONCLUSION_UNSUPPORTED: ["SCIENCE.UNSUPPORTED_INFERENCE", "RELEASE.SCIENTIFIC_GATE_BLOCKED"],
    RELEASE_REQUIREMENT_UNMET: ["RELEASE.PUBLICATION_BARRIER"],
  };
  return codes[type] ?? [`SUPERVISION.${type}`];
}

function ownerActionNone(
  worker: string,
  subjectId: string,
  nextActorKind: "WORKER" | "SUPERVISOR" | "AUTOMATION" | "CONTRACT_ISSUER" | "VERIFIER",
  nextAction: string,
  nextTrigger: string,
  text = "No owner decision is required for this bounded correction.",
): Extract<MissionControlEventV2, { type: "finding_recorded" }>["owner_action"] {
  return {
    kind: "NONE",
    exact_text: text,
    reason_code: "OWNER.NOT_REQUIRED.BOUNDED_NEXT_ACTOR",
    subject_id: subjectId,
    blocking_scope: [],
    source_event_ids: [`demo:${worker}:base:5`],
    due_at: null,
    escalation_at: null,
    status: "NOT_REQUIRED",
    none_reason_code: "NON_OWNER_ACTOR_OWNS_NEXT_TRANSITION",
    next_actor_kind: nextActorKind,
    next_actor_id: `${nextActorKind.toLowerCase()}:${worker}`,
    next_action: nextAction,
    next_trigger: nextTrigger,
    next_due_at: "2099-01-01T00:00:00.000Z",
    escalation_policy: "Escalate to manual intervention if the named actor disappears, the next transition becomes overdue, directives conflict, or telemetry becomes insufficient.",
  };
}

function continuationPolicy(worker: string, findingId: string, safe: boolean): Extract<MissionControlEventV2, { type: "finding_recorded" }>["continuation_policy"] {
  const basisFindingIds = findingId.startsWith("assessment-basis:") ? [] : [findingId];
  if (worker === "tests") return {
    mode: "SAFE_WITHIN_SCOPE",
    allowed_scope: ["tests/**", "test-support/**"],
    forbidden_scope: ["src/core/**", "src/production/**"],
    preconditions: ["Stop the production rewrite", "Revert production scheduler and caller changes"],
    basis_finding_ids: basisFindingIds,
    basis_evidence_ids: [],
    expires_at: "2099-01-01T00:00:00.000Z",
    recheck_trigger: "any production-path change or correction-state transition",
  };
  const allowed = worker === "article-humanization" ? ["article/**", "evidence/**"]
    : worker === "askrigor" ? ["research/**", "reports/**"]
      : worker === "billing" ? ["src/billing/**", "tests/billing/**"] : ["bounded task scope"];
  return {
    mode: safe ? "SAFE_WITHIN_SCOPE" : "PAUSE_ALL",
    allowed_scope: safe ? allowed : [],
    forbidden_scope: [],
    preconditions: safe ? ["Remain inside the reconciled owner-authorized scope"] : ["Obtain a current scoped continuation policy"],
    basis_finding_ids: basisFindingIds,
    basis_evidence_ids: [],
    expires_at: "2099-01-01T00:00:00.000Z",
    recheck_trigger: "material scope, contract, owner-outcome, assignment, or evidence change",
  };
}

function envelope(eventId: string, occurredAt: string, data: MissionControlEventV2) {
  return { schema_version: 2 as const, event_id: eventId, mission_id: missionId, occurred_at: occurredAt, data };
}

function time(minute: number, second = 0): string {
  const date = new Date("2026-08-30T19:00:00.000Z");
  date.setUTCMinutes(minute, second, 0);
  return date.toISOString();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inserted = seedStore();
  console.log(inserted ? "Seeded six supervision fixtures." : "Versioned supervision fixtures already exist.");
}
