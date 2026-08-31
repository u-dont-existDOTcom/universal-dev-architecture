# Mission Control — Outcome Progress and Stagnation Addendum

**Status:** Required owner correction for the Mission Control pilot and dashboard adaptation  
**Date:** 2026-08-31  
**Related pattern:** `patterns/outcome-advancement-and-strategy-efficacy.md`  
**Related feedback:** `feedback/mission-control/SDF-20260831-OUTCOME-ADVANCEMENT-001.json`

## 1. Objective

Extend Mission Control so that it supervises not only whether a worker follows a faithful contract, but whether the owner outcome is actually advancing and whether the current strategy remains viable.

The owner must not need to ask a worker manually whether substantial work produced progress.

## 2. Required control state

Add separate machine-visible fields:

```text
worker_to_contract_alignment
contract_to_owner_alignment
outcome_advancement
strategy_efficacy
overall_control_state
```

Required outcome states:

```text
ADVANCING
FLAT
REGRESSING
UNMEASURED
NOT_YET_MEASURABLE
BLOCKED_EXTERNAL
UNKNOWN
```

Required strategy states:

```text
VIABLE
UNCERTAIN
FAILED
EXHAUSTED
REPLACEMENT_REQUIRED
BLOCKED_EXTERNAL
SUPERSEDED
```

Never average these states.

## 3. Required data model

Implement the fields in `templates/OUTCOME-PROGRESS-RECEIPT.json`, including:

- owner-outcome identity;
- strategy identity and causal hypothesis;
- success/failure thresholds;
- target, baseline, previous, current and best direct evidence;
- exact change from baseline and prior checkpoint when numeric;
- explicit evidence states when qualitative;
- newly met, unmet and unknown owner outcomes;
- work classification since the last direct evidence;
- measurement freshness;
- progress/strategy intervention;
- next decision-changing evidence boundary;
- owner-action state.

Persist receipts as append-only artifacts/events. A new strategy may reset strategy-cycle accounting but never erase the owner-outcome history.

## 4. Work classification

Require material work intervals to classify as one of:

```text
DIRECT_OUTCOME_ADVANCEMENT
ENABLEMENT_PROGRESS
RISK_REDUCTION
EVIDENCE_ACQUISITION
STRATEGY_LEARNING
PROCESS_OR_TOOLING
REWORK
WASTE_OR_NO_INFORMATION_GAIN
```

Commits, tests, audits, packets and documentation are not direct owner-outcome progress by default.

## 5. Automatic trigger rules

Trigger a progress checkpoint:

- after each completed strategy cycle;
- after each direct measurement;
- before repeating a similar method;
- before another scarce/paid action;
- at phase transitions;
- after material discoveries;
- when a configured time/commit/turn/compute threshold passes without direct evidence;
- before owner review/release/root completion;
- when the owner asks about progress, as a failure fallback.

Default intervention behavior:

```text
one flat cycle -> at least YELLOW and strategy efficacy review
two flat cycles -> REPLACEMENT_REQUIRED unless delayed-effect rationale passes
negative direct delta -> REGRESSING; immediate strategy review
negative delta plus repeated/exhausted method -> overall RED
measurement overdue -> PROGRESS_EVIDENCE_OVERDUE
```

Thresholds are task-configurable. They may not be disabled merely because the task has produced much supporting work.

## 6. Dashboard changes

The all-worker attention queue and task detail page must show:

```text
Owner outcome target
Latest and best direct evidence
Progress since last meaningful review
Outcome advancement status
Current strategy and efficacy
Supporting work since last direct progress
Next measurement or strategy-decision trigger
Replacement/correction status
Owner action
```

For nonnumeric tasks, show explicit evidence states rather than a fabricated percentage.

A task with alignment GREEN/MATCH but progress REGRESSING must not look healthy.

## 7. Supervisor packet and prompt

Every substantive supervisor packet must include:

```text
last valid progress receipt
work since that receipt
strategy hypothesis
predicted result
actual result
direct outcome delta
supporting-work value
strategy-cycle count/budget
work proposed next
```

Supervisor asks:

1. What owner-outcome progress occurred?
2. If none, what decision-changing information was gained?
3. Does the evidence still support the current strategy?
4. What work must stop?
5. What replacement strategy is authorized?
6. When will the next direct evidence arrive?
7. Does the owner need to supply anything?

Use deterministic/Extra High review for ordinary accounting and technical method alternatives. Use Pro for genuinely difficult/high-consequence strategy diagnosis or replacement.

## 8. Exact Somatic regression

Create a fixture with:

```text
owner target: Human 1.0
baseline R15: 0.1547368467
micro candidate: 0.1381948739
article-wide candidate: 0.1231321841
worker_to_contract: GREEN
contract_to_owner: MATCH
completion_claim: WORKING
```

Expected:

```text
outcome_advancement: REGRESSING
strategy_efficacy: REPLACEMENT_REQUIRED
overall_control_state: RED
same_strategy_continuation_allowed: false
required_directive: HOLD_SAME_STRATEGY_AND_SELECT_REPLACEMENT_METHOD
owner_action_required: false unless new owner source is genuinely necessary
```

The fixture fails if the task is shown as healthy because its alignment states pass.

## 9. Immediate Somatic containment and current replacement boundary

Project evidence records that `SOMATIC-R15-PROGRESS-AUDIT-012` received a matching Pro decision.

The decision found that the model-led preservation-clean rewrite method was falsified by the downward result sequence. It requires:

- stop measuring or refining the frozen candidate;
- stop treating intact R15 surface text as the wording substrate;
- acquire one article-scale rough owner-language batch;
- reconstruct from owner verbatim or minimum normalization, with normally at most one necessary bridge sentence per natural section;
- keep every major section unmeasured while it still depends primarily on intact known-red R15 wording.

The exact owner-source request is frozen in the project repository at:

`tasks/somatic-r15-clean-continuation-20260830/OWNER-LANGUAGE-ACQUISITION-PROMPT-20260831.md`

Current truthful state:

```text
outcome_advancement: REGRESSING
old_strategy_efficacy: FAILED / SUPERSEDED
new_strategy: OWNER_TRANSCRIPT_RECONSTRUCTION
new_strategy_efficacy: BLOCKED_EXTERNAL pending owner source
same_old_strategy_continuation_allowed: false
owner_action_required: true — provide one rough 15–25-minute response
```

Until that source is supplied:

- no additional prose under the failed method;
- no Pangram action;
- no expansion of supporting-work ceremony beyond preserving state or exact requested evidence;
- keep the root task open;
- retain all valid preservation, reader, tooling and supervision artifacts;
- continue only unaffected work that cannot contaminate the replacement strategy.

After owner source arrives, preserve it verbatim as an immutable artifact, instantiate a new strategy ID with causal hypothesis, success/failure threshold, cycle/budget limit and next measurement trigger, then continue automatically.

## 10. Pro meta-review

Submit `feedback/mission-control/SDF-20260831-OUTCOME-ADVANCEMENT-001.json` to the shared Pro supervisor-design chat.

Ask whether the third progress plane, strategy-efficacy state, automatic no-progress trigger, and dashboard intervention are sufficient to prevent a worker from remaining GREEN/MATCH while making no or negative owner-outcome progress.

Do not use Pro to compute numeric deltas or count commits.

## 11. Acceptance criteria

This addendum is implemented when:

1. A direct numeric regression automatically changes task control state without owner prompting.
2. Alignment GREEN/MATCH does not mask FLAT/REGRESSING progress.
3. High activity cannot substitute for direct outcome evidence.
4. Supporting work remains visible but separately labeled.
5. Repeated flat/negative strategy cycles trigger a hold/replacement decision.
6. The dashboard names the progress failure, current method, replacement status and owner action.
7. Progress receipts survive restart and strategy changes.
8. Nonnumeric tasks do not receive fake percentages.
9. The Somatic fixture passes.
10. The Pro meta-review verdict is recorded, or the exact external-review blocker is preserved.

## 12. Completion boundary

This is a required adaptation slice, not completion of Mission Control. Do not claim the system supervises owner-outcome progress until the runtime, dashboard and hostile fixtures demonstrate it end to end.
