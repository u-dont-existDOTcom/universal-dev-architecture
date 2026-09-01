# Somatic Fragment-Proxy Failure — Root-Outcome Control Addendum

**Status:** Pro-adjudicated supervision-design defect; integration required  
**Date:** 2026-08-31  
**Evidence source:** `u-dont-existDOTcom/joel-articles`, task `somatic-r15-clean-continuation-20260830`

## Incident

The owner outcome was exact Pangram 4.0 Human fraction `1.0` on one frozen whole article. Whole-document evidence regressed:

- `0.1547368467`
- `0.1381948739`
- `0.1231321841`

After the regression was already known, the reasoning-supervision loop authorized many short-boundary experiments. Some inherited-anchor boundaries returned Human `1.0`; two small local repairs were applied. The current whole article remained unmeasured. The owner had to ask whether the work had made any progress.

The worker-to-contract plane was GREEN and contract-to-owner was MATCH. The failure was in the outcome-advancement plane and in the supervisor's interpretation of local measurements.

## Defect

A child or fragment metric was treated as a leading indicator for the root outcome without evidence that it predicted the root metric.

The local Pangram measurements were not compositional:

- identical tail wording changed classification when the anchor changed;
- a large inherited Human anchor could dominate a short boundary;
- paragraph-level Human `1.0` did not imply a positive whole-document delta;
- local information gain was repeatedly mistaken for owner-outcome advancement;
- preserving a scarce whole-document call became measurement avoidance rather than prudent budgeting.

The existing outcome-advancement pattern says that a leading indicator must be owner-authorized and have a future falsification boundary. The implementation needs a stronger machine-checkable rule for hierarchical metrics.

## Required correction

### 1. Child-metric results are not root advancement by default

Every child/fragment metric must be classified as one of:

```text
DIRECT_ROOT_OUTCOME_EVIDENCE
VALIDATED_ROOT_LEADING_INDICATOR
LOCAL_QUALITY_EVIDENCE
STRATEGY_LEARNING_ONLY
```

Only the first two may affect `outcome_advancement` for the root task.

### 2. Validated leading-indicator contract

A child metric may be promoted to `VALIDATED_ROOT_LEADING_INDICATOR` only when its strategy record contains:

```text
root_outcome_metric
child_metric
causal_link_to_root
validation_evidence
expected_direction
minimum_effect_or_decision_rule
known_context_interactions
falsification_boundary
root_measurement_deadline
```

Absent those fields, a local Human score is strategy learning only.

### 3. Non-compositionality guard

When the same local edit reverses or materially changes under a different anchor or boundary:

```text
LOCAL_METRIC_NONCOMPOSITIONAL = true
```

Then:

- local scores may not be summed, averaged, or projected to the root metric;
- no further local optimization may be called root progress;
- the next strategy review must decide whether to move to a complete-artifact candidate or abandon the local method.

### 4. Root-evidence freshness deadline

Every strategy using child metrics must predeclare a root-measurement trigger. Examples:

- after one full candidate is assembled;
- after at most N local experiments;
- after a fixed elapsed-time/call budget;
- immediately after a local method first appears successful.

If the trigger is reached without root evidence:

```text
outcome_advancement = UNMEASURED
finding = PROGRESS_EVIDENCE_OVERDUE
same_local_strategy_continuation_allowed = false
```

### 5. Fragment budget cannot reset by family naming

All materially similar fragment experiments under one root strategy share one aggregate no-progress budget. Renaming the section, family, or tail does not reset it.

### 6. Dashboard projection

The root task card must show:

```text
Root target
Best/latest root evidence
Age of root evidence
Child measurements since last root evidence
Validated-leading-indicator status
Local-to-root predictive evidence
Root-measurement deadline
```

A list of local Human `1.0` results must never visually imply root advancement when the whole result is flat, regressing, or unmeasured.

## Somatic fixture

Given:

```text
root target: whole article Human 1.0
best root evidence: 0.1547368467
latest root evidence: 0.1231321841
local boundary: Human 1.0 beside inherited Human anchor
no validated local-to-root model
current whole candidate: unmeasured
```

Required projection:

```text
worker_to_contract: GREEN
contract_to_owner: MATCH
outcome_advancement: REGRESSING
strategy_efficacy: EXHAUSTED
local_result_class: STRATEGY_LEARNING_ONLY
progress_evidence: OVERDUE
same_fragment_strategy_continuation_allowed: false
overall: RED
```

## Required tests

1. A fragment Human `1.0` with no validated causal link does not change root advancement.
2. A local edit that reverses under a different anchor sets `LOCAL_METRIC_NONCOMPOSITIONAL`.
3. Repeated fragment families share one aggregate no-progress budget.
4. Reaching the root-evidence deadline blocks more local calls.
5. Preserving a scarce root measurement cannot indefinitely postpone a root strategy decision.
6. A valid local repair remains visible as supporting work without being counted as direct progress.
7. Owner-forced progress review is emitted when the owner asks before the system surfaces the stale/regressing root metric.

## Disposition

**ACCEPT — architecture defect confirmed.**

Integrate this addendum into the outcome-advancement pattern, progress-receipt schema, Mission Control dashboard, and regression suite. The Somatic article task may continue under its replacement whole-article strategy without waiting for that integration.
