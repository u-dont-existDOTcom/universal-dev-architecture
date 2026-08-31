import type { MissionControlEventV2, OutcomeAdvancement, StrategyEfficacy } from "./schema";

export type OutcomeProgressEvent = Extract<MissionControlEventV2, { type: "outcome_progress_recorded" }>;

interface NumericProgress {
  changeFromBaseline: number | null;
  changeFromPrevious: number | null;
  directionalChangeFromPrevious: number | null;
}

export function numericProgress(progress: OutcomeProgressEvent): NumericProgress {
  const baseline = progress.baseline_evidence.numeric_value;
  const previous = progress.previous_evidence.numeric_value;
  const current = progress.current_evidence.numeric_value;
  const changeFromBaseline = baseline === null || current === null ? null : current - baseline;
  const changeFromPrevious = previous === null || current === null ? null : current - previous;
  const direction = progress.measurement_direction === "HIGHER_IS_BETTER" ? 1 : -1;
  return {
    changeFromBaseline,
    changeFromPrevious,
    directionalChangeFromPrevious: changeFromPrevious === null ? null : changeFromPrevious * direction,
  };
}

export function effectiveOutcomeAdvancement(progress?: OutcomeProgressEvent): OutcomeAdvancement {
  if (!progress) return "UNKNOWN";
  const delta = numericProgress(progress).directionalChangeFromPrevious;
  if (delta !== null) {
    if (delta < 0) return "REGRESSING";
    if (delta > 0) return "ADVANCING";
    return "FLAT";
  }
  if (progress.outcome_advancement === "ADVANCING"
    && (!qualitativeEvidenceAuthorizesAdvancement(progress.current_evidence)
      || !qualitativeEvidenceAuthorizesAdvancement(progress.best_evidence))) return "UNMEASURED";
  return progress.outcome_advancement;
}

export function effectiveStrategyEfficacy(
  progress: OutcomeProgressEvent | undefined,
  advancement = effectiveOutcomeAdvancement(progress),
): StrategyEfficacy {
  if (!progress) return "UNCERTAIN";
  if (["FAILED", "EXHAUSTED", "REPLACEMENT_REQUIRED", "SUPERSEDED"].includes(progress.strategy_efficacy)) {
    return progress.strategy_efficacy;
  }
  const methodExhausted = progress.strategy_cycle_index >= progress.strategy_cycle_budget
    || progress.progress_detection_flags.some((flag) => /REPEAT|EXHAUST|SECOND_FLAT/i.test(flag));
  if (["REGRESSING", "FLAT"].includes(advancement)) {
    if (methodExhausted) return "REPLACEMENT_REQUIRED";
    return progress.strategy_efficacy === "BLOCKED_EXTERNAL" ? "BLOCKED_EXTERNAL" : "UNCERTAIN";
  }
  if (["UNMEASURED", "UNKNOWN", "NOT_YET_MEASURABLE"].includes(advancement)
    && progress.strategy_efficacy === "VIABLE") return "UNCERTAIN";
  return progress.strategy_efficacy;
}

export function effectiveSameStrategyContinuationAllowed(progress?: OutcomeProgressEvent): boolean {
  if (!progress) return false;
  const advancement = effectiveOutcomeAdvancement(progress);
  const efficacy = effectiveStrategyEfficacy(progress, advancement);
  if (advancement === "REGRESSING") return false;
  if (["FAILED", "EXHAUSTED", "REPLACEMENT_REQUIRED", "SUPERSEDED"].includes(efficacy)) return false;
  return progress.same_strategy_continuation_allowed;
}

export function progressInvariantErrors(progress: OutcomeProgressEvent): string[] {
  const errors: string[] = [];
  const numeric = numericProgress(progress);
  if (!sameNullableNumber(progress.change_from_baseline, numeric.changeFromBaseline)) {
    errors.push("change_from_baseline must equal the exact current-minus-baseline numeric delta");
  }
  if (!sameNullableNumber(progress.change_from_previous, numeric.changeFromPrevious)) {
    errors.push("change_from_previous must equal the exact current-minus-previous numeric delta");
  }
  const advancement = effectiveOutcomeAdvancement(progress);
  if (numeric.directionalChangeFromPrevious === null && progress.outcome_advancement === "ADVANCING"
    && advancement !== "ADVANCING") {
    errors.push("nonnumeric ADVANCING requires current and best evidence bound to direct-outcome or validated-leading-indicator receipts");
  }
  if (numeric.directionalChangeFromPrevious !== null && progress.outcome_advancement !== advancement) {
    errors.push(`outcome_advancement must be ${advancement} for the recorded numeric direction and delta`);
  }
  if (advancement === "REGRESSING" && progress.same_strategy_continuation_allowed) {
    errors.push(`${advancement} direct evidence must hold same-strategy continuation for review`);
  }
  const efficacy = effectiveStrategyEfficacy(progress, advancement);
  if (efficacy === "REPLACEMENT_REQUIRED" && progress.strategy_efficacy !== "REPLACEMENT_REQUIRED") {
    errors.push("an exhausted flat/regressing strategy cycle must be REPLACEMENT_REQUIRED");
  }
  if ((advancement !== "ADVANCING" || ["FAILED", "EXHAUSTED", "REPLACEMENT_REQUIRED"].includes(efficacy))
    && progress.overall_control_state === "GREEN") {
    errors.push("non-advancing or nonviable strategy evidence cannot declare overall control GREEN");
  }
  if (progress.measurement_freshness === "OVERDUE" && progress.overall_control_state === "GREEN") {
    errors.push("overdue progress evidence cannot declare overall control GREEN");
  }
  return errors;
}

function qualitativeEvidenceAuthorizesAdvancement(
  evidence: OutcomeProgressEvent["current_evidence"] | OutcomeProgressEvent["best_evidence"],
): boolean {
  if (evidence.evidence_receipt_ids.length === 0) return false;
  if (evidence.evidence_role === "DIRECT_OUTCOME") return true;
  return evidence.evidence_role === "VALIDATED_LEADING_INDICATOR"
    && Boolean(evidence.predictive_basis)
    && Boolean(evidence.decision_boundary);
}

function sameNullableNumber(recorded: number | null, expected: number | null): boolean {
  if (recorded === null || expected === null) return recorded === expected;
  const tolerance = Number.EPSILON * 16 * Math.max(1, Math.abs(recorded), Math.abs(expected));
  return Math.abs(recorded - expected) <= tolerance;
}
