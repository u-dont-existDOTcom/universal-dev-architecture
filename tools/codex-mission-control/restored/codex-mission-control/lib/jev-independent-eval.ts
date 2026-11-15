/**
 * Jev V2 exploratory judgment input. NOT a replacement for deterministic routing.
 * The V1 prompt includes an ordered answer key. This V2 prompt deliberately does not.
 * No provider request is made by this module.
 */
import type { JevShadowState } from "./jev-shadow";

export const JEV_INDEPENDENT_EVAL_VERSION = "jev-independent-v2-20261115";
export const JEV_INDEPENDENT_ACTIONS = [
  "hold_integrity", "stop_terminal", "notify_owner", "wait_external",
  "continue_mechanical", "route_reasoning", "no_action_healthy",
] as const;
export type JevIndependentAction = typeof JEV_INDEPENDENT_ACTIONS[number];

export const JEV_INDEPENDENT_QUESTIONS = {
  owner_decision_required: {
    type: "noul",
    instructions: "Does progress genuinely require a substantive decision or unavoidable action by the owner, rather than a recoverable technical fix or existing supervisor judgment? Distinguish an alert from a decision request.",
  },
  engineering_blocker: {
    type: "noul",
    instructions: "Is a technical or execution-control fault preventing useful progress that could be resolved under already delegated authority?",
  },
  stalled_or_regressing: {
    type: "noul",
    instructions: "Is there evidence of flat, deteriorating, or futile progress rather than meaningful advancement toward the owner outcome?",
  },
  next_action: {
    type: "choice",
    instructions: "Independently judge the safest useful next step from the supplied sanitized facts. Do not infer that the owner should be interrupted merely because supervision or troubleshooting is required.",
    criteria: {
      hold_integrity: "Pause action until the evidence/control-plane integrity can be established.",
      stop_terminal: "No further supervised work is needed because the task is terminal.",
      notify_owner: "Only the owner can supply the consequential missing decision/action.",
      wait_external: "An external dependency must act first.",
      continue_mechanical: "An authorized operator can repair a technical/execution problem.",
      route_reasoning: "An existing reasoning supervisor should assess the next course.",
      no_action_healthy: "The current course is measurably healthy and needs no intervention.",
    },
  },
  consequence_level: {
    type: "score",
    instructions: "How consequential would an unsupervised change be? Rate 0 for observation, 1 for reversible maintenance, 2 for supervised strategy changes, 3 for owner-gated or integrity-sensitive actions.",
    criteria: ["Observation only", "Reversible maintenance", "Supervisor judgment", "Owner/irreversible/integrity gate"],
  },
} as const;

/** Reconstruct from the privacy allowlist; never spread untrusted state fields. */
export function sanitizeIndependentJevState(s: JevShadowState): JevShadowState {
  return {
    chain_valid: s.chain_valid,
    queue_terminal: s.queue_terminal,
    owner_action_kind: s.owner_action_kind,
    open_blocker_present: s.open_blocker_present,
    blocker_actor_kind: s.blocker_actor_kind,
    delivery_status: s.delivery_status,
    delivery_error_family: s.delivery_error_family,
    contract_owner_alignment: s.contract_owner_alignment,
    outcome_advancement: s.outcome_advancement,
    strategy_efficacy: s.strategy_efficacy,
    correction_owner_action_type: s.correction_owner_action_type,
    pending_reasoning_review: s.pending_reasoning_review,
    review_freshness: s.review_freshness,
    active_directive_present: s.active_directive_present,
    execution_state: s.execution_state,
  };
}

export function buildIndependentJevRequest(
  state: JevShadowState,
  model = "typesafe/jev-1.13",
) {
  return {
    model,
    state: sanitizeIndependentJevState(state),
    questions: JEV_INDEPENDENT_QUESTIONS,
    provider: { allow_fallbacks: false },
  };
}

export interface JevJudgedObservation {
  /** Independent, evidence-adjudicated case ID, not the source provider response ID. */
  case_id: string;
  /** Hash of real control state; this is the unit of evidence. */
  state_fingerprint: string;
  cohort: "DEVELOPMENT" | "CONFIRMATION";
  evidence_ref: string;
  gold_action: JevIndependentAction;
  deterministic_action: JevIndependentAction;
  jev_action?: JevIndependentAction;
  stronger_action?: JevIndependentAction;
  response_id?: string;
  fallback_identity?: string;
  provider_status: "OK" | "ERROR" | "NOT_RUN";
  latency_ms?: number;
  cost_usd?: number;
}

export function scoreJevIndependentValue(rows: readonly JevJudgedObservation[]) {
  const seenProvider = new Set<string>();
  const deduplicated: JevJudgedObservation[] = [];
  for (const row of rows) {
    if (!row.state_fingerprint || !row.case_id || !row.evidence_ref) {
      throw new Error("An independent evaluation requires a real fingerprint, case ID, and adjudication evidence.");
    }
    if (!JEV_INDEPENDENT_ACTIONS.includes(row.gold_action) || !JEV_INDEPENDENT_ACTIONS.includes(row.deterministic_action)) {
      throw new Error("Invalid action in independently adjudicated case.");
    }
    const identity = row.response_id ? "response:" + row.response_id
      : row.fallback_identity ? "fallback:" + row.fallback_identity : null;
    if (identity && seenProvider.has(identity)) continue;
    if (identity) seenProvider.add(identity);
    deduplicated.push(row);
  }

  const states = new Map<string, JevJudgedObservation[]>();
  for (const row of deduplicated) {
    const group = states.get(row.state_fingerprint) ?? [];
    if (group.length > 0 && group.some((prior) =>
      prior.gold_action !== row.gold_action || prior.cohort !== row.cohort
        || prior.deterministic_action !== row.deterministic_action)) {
      throw new Error("Conflicting adjudication or cohort for one fingerprint.");
    }
    group.push(row);
    states.set(row.state_fingerprint, group);
  }
  const by_type: Record<string, { n: number; jev_correct: number; baseline_correct: number }> = {};
  let comparable = 0, baselineCorrect = 0, jevCorrect = 0, incrementalCatches = 0;
  let introducedErrors = 0, falseOwnerInterruptions = 0, missedOwnerActions = 0;
  let strongerComparable = 0, strongerCorrect = 0, unstableStates = 0;
  let errorStates = 0;
  for (const group of states.values()) {
    // The first successful distinct provider observation is the primary verdict.
    const first = group.find((r) => r.provider_status === "OK" && r.jev_action !== undefined);
    if (!first) { errorStates++; continue; }
    const distinctChoices = new Set(group.filter((r) => r.provider_status === "OK").map((r) => r.jev_action).filter(Boolean));
    if (distinctChoices.size > 1) unstableStates++;
    comparable++;
    const baselineOK = first.deterministic_action === first.gold_action;
    const jevOK = first.jev_action === first.gold_action;
    if (baselineOK) baselineCorrect++;
    if (jevOK) jevCorrect++;
    if (!baselineOK && jevOK) incrementalCatches++;
    if (baselineOK && !jevOK) introducedErrors++;
    if (first.jev_action === "notify_owner" && first.gold_action !== "notify_owner") falseOwnerInterruptions++;
    if (first.jev_action !== "notify_owner" && first.gold_action === "notify_owner") missedOwnerActions++;
    if (first.stronger_action !== undefined) {
      strongerComparable++;
      if (first.stronger_action === first.gold_action) strongerCorrect++;
    }
    const bucket = by_type[first.gold_action] ?? { n: 0, jev_correct: 0, baseline_correct: 0 };
    bucket.n++;
    if (jevOK) bucket.jev_correct++;
    if (baselineOK) bucket.baseline_correct++;
    by_type[first.gold_action] = bucket;
  }
  return {
    raw_unique_observations: deduplicated.length,
    distinct_state_fingerprints: states.size,
    distinct_comparable_states: comparable,
    states_without_successful_jev: errorStates,
    checkpoint_25: states.size >= 25,
    checkpoint_100: states.size >= 100,
    checkpoint_500: states.size >= 500,
    by_type, baseline_correct: baselineCorrect, jev_correct: jevCorrect,
    incremental_catches: incrementalCatches, introduced_errors: introducedErrors,
    false_owner_interruptions: falseOwnerInterruptions, missed_owner_actions: missedOwnerActions,
    unstable_states: unstableStates,
    stronger_comparable: strongerComparable, stronger_correct: strongerCorrect,
    provider_failures: deduplicated.filter((r) => r.provider_status === "ERROR").length,
    latency_ms: deduplicated.filter((r) => r.provider_status === "OK" && r.latency_ms !== undefined).map((r) => r.latency_ms!),
    cumulative_cost_usd: deduplicated.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0),
    // Exact-policy agreement is a different metric, never used to compute independent value.
  };
}
