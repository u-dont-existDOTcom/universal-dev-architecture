# Outcome Advancement and Strategy Efficacy

**Status:** Required owner correction and companion to the Mission Control architecture  
**Date:** 2026-08-31  
**Authority:** Current owner correction plus the Somatic R15 no-progress incident recorded in `u-dont-existDOTcom/joel-articles` PR #73

## 1. Normative correction

Mission Control must not treat either of these as proof that the owner outcome is advancing:

- the worker is faithfully executing its task contract; or
- the task contract faithfully represents the owner outcome.

Those controls prevent drift and contract laundering. They do not prove that the chosen strategy works.

A task can therefore validly have:

```text
worker_to_contract_alignment: GREEN
contract_to_owner_alignment: MATCH
outcome_advancement: REGRESSING
strategy_efficacy: REPLACEMENT_REQUIRED
overall_control_state: RED
```

The missing question is:

> Has the owner outcome measurably or evidentially advanced since the last meaningful checkpoint, and does the current strategy still have a justified path to the target?

The owner must never have to ask the worker manually whether any progress occurred after substantial work. A no-progress or negative-progress result must be surfaced automatically, along with the strategy response.

---

## 2. Failure model

The failure class is **activity without outcome advancement**:

```text
owner outcome is correctly captured
    -> task contract faithfully encodes it
    -> worker follows the contract
    -> many commits, gates, audits, packets, reviews, or tools are produced
    -> direct outcome metric remains flat or worsens
    -> alignment remains GREEN / MATCH
    -> worker continues or waits without an automatic strategy intervention
    -> owner must ask whether any progress happened
```

This can coexist with high-quality supporting work. The supporting work may preserve safety, fidelity, provenance, or future recoverability. It is still not direct outcome progress.

Required detections include:

- `OUTCOME_STAGNATION`
- `OUTCOME_REGRESSION`
- `STRATEGY_INEFFICACY`
- `STRATEGY_EXHAUSTED`
- `PROGRESS_EVIDENCE_OVERDUE`
- `ACTIVITY_PROGRESS_CONFUSION`
- `SUPPORTING_WORK_DOMINANCE`
- `MEASUREMENT_AVOIDANCE`

---

## 3. Existing-work basis and adaptation decision

This control adapts established ideas rather than inventing progress monitoring from nothing:

- feedback control: compare current state with target and intervene when error does not shrink;
- results-based/outcome-based management: distinguish activities and outputs from outcomes;
- hypothesis-driven experimentation: retire or revise a strategy when predictions fail;
- earned-value and project-control practice: compare effort and schedule with verified accomplishment rather than activity volume;
- goal-oriented requirements and assurance cases: evidence for subclaims or enabling work does not prove the top-level result.

The reusable core is a feedback loop around an independently measured target. The project-specific adaptation is a fail-closed, event-sourced outcome-advancement plane for long-running AI workers, plus automatic escalation when activity is high but outcome delta is absent or negative.

Disposition: **adapt + compose**.

---

## 4. Three independent control planes

Every nontrivial task must keep these independent:

### 4.1 Worker-to-contract alignment

```text
GREEN | YELLOW | RED | UNKNOWN
```

Question:

> Is the worker doing what the current task contract says?

### 4.2 Contract-to-owner alignment

```text
MATCH | PARTIAL | DIVERGED | SOURCE_MISSING
```

Question:

> Does the task contract still represent the owner’s actual outcome?

### 4.3 Owner-outcome advancement

```text
ADVANCING
FLAT
REGRESSING
UNMEASURED
NOT_YET_MEASURABLE
BLOCKED_EXTERNAL
UNKNOWN
```

Question:

> Has the owner outcome advanced since the last valid baseline or checkpoint?

Do not average these planes. Each can independently impose a hard control response.

---

## 5. Strategy efficacy state

Every material strategy or method has its own identity and state:

```text
VIABLE
UNCERTAIN
FAILED
EXHAUSTED
REPLACEMENT_REQUIRED
BLOCKED_EXTERNAL
SUPERSEDED
```

A strategy record includes:

```text
strategy_id
strategy_description
causal_hypothesis
predicted_outcome_change
success_threshold
failure_threshold
measurement_trigger
budget or cycle limit
started_at
completed_cycles
current_state
supersedes / superseded_by
```

A strategy cannot remain `VIABLE` merely because its supporting gates pass. Its predicted owner-outcome effect must survive contact with current evidence.

---

## 6. Required outcome-progress receipt

Every meaningful progress checkpoint must produce or update a machine-readable receipt containing:

```text
owner_outcome_id / epoch / hash
progress_receipt_id
strategy_id
baseline evidence
previous evidence
current evidence
best evidence
owner target
measurement direction
change from baseline
change from previous checkpoint
required outcomes newly met
required outcomes still unmet or unknown
work since previous direct evidence
enablement/risk-reduction evidence
measurement freshness
outcome advancement status
strategy efficacy status
next measurement or intervention trigger
owner action state
```

Canonical template:

`templates/OUTCOME-PROGRESS-RECEIPT.json`

### 6.1 Numeric outcomes

When the owner outcome has a valid numeric measure, record exact values and directionality.

Example:

```text
baseline: Human 0.1547368467
micro repair: Human 0.1381948739
article-wide reconstruction: Human 0.1231321841
target: Human 1.0
advancement: REGRESSING
```

Do not replace a negative direct delta with a positive percentage for supporting work.

### 6.2 Qualitative or delayed outcomes

Do not manufacture a fake percentage.

Use explicit owner-authorized evidence states such as:

```text
DIRECT_OUTCOME_MET
DIRECT_OUTCOME_PARTIAL
DIRECT_OUTCOME_UNMET
VALIDATED_LEADING_INDICATOR_ADVANCED
ENABLEMENT_ONLY
RISK_REDUCTION_ONLY
NO_DIRECT_EVIDENCE
```

A leading indicator counts only when the task contract explains why it predicts the owner outcome and names the later falsification/measurement boundary.

---

## 7. Work classification

Every material work interval must classify its result:

```text
DIRECT_OUTCOME_ADVANCEMENT
enablement_PROGRESS
RISK_REDUCTION
EVIDENCE_ACQUISITION
STRATEGY_LEARNING
PROCESS_OR_TOOLING
REWORK
WASTE_OR_NO_INFORMATION_GAIN
```

Valid preservation, testing, safety, privacy, provenance, and recovery work may be essential. Display it honestly as supporting work.

Do not count:

- commits;
- changed files;
- tests run;
- supervisor packets;
- audits;
- documentation volume;
- elapsed work time;
- model calls;

as owner-outcome progress unless they directly satisfy a required owner outcome or advance a validated leading indicator.

---

## 8. Recurring progress checkpoints

Re-evaluate outcome advancement:

- after every completed strategy cycle or experiment;
- after any direct measurement;
- after a material phase transition;
- before repeating a similar method;
- before consuming another scarce or paid resource;
- after a material discovery changes the strategy hypothesis;
- after a configured elapsed-time, commit-count, turn-count, compute, or spending threshold without direct outcome evidence;
- whenever work volume rises while the current owner-outcome evidence remains unchanged;
- before owner review, release, publication, deployment, or root completion;
- when the owner asks whether progress occurred.

The last trigger is a failure-detection fallback, not the intended operating mechanism. The system should have surfaced the answer first.

---

## 9. Fail-closed control rules

### 9.1 Direct regression

```text
if current direct outcome is worse than the valid baseline:
  outcome_advancement = REGRESSING
```

A first regression requires immediate strategy review. Repeating the same strategy without a new evidence-backed causal reason is RED.

### 9.2 Flat result

```text
if a completed strategy cycle produces no direct or validated leading-indicator advance:
  outcome_advancement = FLAT
```

One flat cycle is at least YELLOW and requires a bounded efficacy review before another materially similar cycle.

Two flat cycles, or a configured effort/budget threshold with no advance, sets:

```text
strategy_efficacy = REPLACEMENT_REQUIRED
```

unless a documented delayed-effect model and upcoming measurement boundary justify continuation.

### 9.3 Overdue measurement

If the strategy promised a measurement by a defined checkpoint and no current evidence exists:

```text
outcome_advancement = UNMEASURED
finding = PROGRESS_EVIDENCE_OVERDUE
```

Do not allow indefinite supporting work to postpone a decision-relevant measurement.

### 9.4 Strategy exhaustion

When a strategy reaches its predeclared cycle, call, time, or evidence limit without meeting its success condition:

```text
strategy_efficacy = EXHAUSTED
same_strategy_continuation_allowed = false
```

The next action is strategy replacement, bounded owner decision, or truthful terminal classification—not cosmetic iteration.

### 9.5 Overall projection

```text
if worker_to_contract == RED:
  overall = RED

if contract_to_owner == DIVERGED:
  overall = RED

if outcome_advancement == REGRESSING and current strategy is repeated or exhausted:
  overall = RED

if outcome_advancement == FLAT:
  overall = YELLOW, or RED when the no-progress threshold is exceeded

if outcome_advancement == UNMEASURED and measurement is overdue:
  overall = YELLOW or RED according to consequence

if worker_to_contract == GREEN
and contract_to_owner == MATCH
and outcome_advancement == ADVANCING:
  overall may be GREEN subject to verification, safety, evidence freshness,
  owner-decision, and release gates
```

`GREEN + MATCH` is therefore necessary but not sufficient for a healthy task.

---

## 10. Supervisor order of operations

At each substantive checkpoint the supervisor must answer, in order:

1. Is the owner source current?
2. Does the contract still match it?
3. Is the worker following the contract?
4. **What direct owner-outcome progress occurred since the last review?**
5. What supporting work occurred, and why was it necessary?
6. Did the current strategy’s prediction hold?
7. What method or work must stop?
8. What exact strategy continues or replaces it?
9. When will the next decision-changing evidence arrive?
10. Does the owner need to act?

A supervisor verdict that omits question 4 is incomplete for a long-running task.

Required additional verdicts:

```text
OUTCOME_ADVANCING
OUTCOME_STALLED
OUTCOME_REGRESSING
PROGRESS_EVIDENCE_REQUIRED
STRATEGY_REPLACEMENT_REQUIRED
STRATEGY_EXHAUSTED
```

A worker must not wait for the owner to ask whether the work helped.

---

## 11. Automatic intervention and continuation

### 11.1 No-progress intervention

When progress is FLAT, REGRESSING, or overdue:

1. preserve valid supporting work;
2. stop materially similar work under the failed strategy;
3. record the exact outcome delta and effort since last direct evidence;
4. identify what was learned;
5. prepare a decision-specific strategy-efficacy packet;
6. route ordinary method review to Extra High and genuinely difficult/high-consequence method replacement to Pro;
7. resume automatically under the replacement strategy once decided;
8. ask the owner only for genuinely missing source, threshold, policy, or tradeoff authority.

### 11.2 Do not freeze unrelated work

Independent work that cannot contaminate the strategy decision may continue. The hold applies to the failed strategy and affected boundary, not automatically to the entire project.

### 11.3 No ceremony loops

Do not spend more work producing progress reports about no progress. One complete receipt and one decision packet are sufficient unless new evidence appears.

---

## 12. Dashboard requirements

Every task card must display these separately:

```text
Worker -> Contract
Contract -> Owner
Outcome advancement
Strategy efficacy
Current target and latest/best evidence
Progress since last review
Supporting work since last direct progress
Next measurement/intervention trigger
Correction or replacement strategy status
Owner action
```

Example:

```text
SOMATIC HUMANIZATION                            RED — STRATEGY REPLACEMENT
Worker -> Contract: GREEN
Contract -> Owner: MATCH
Outcome advancement: REGRESSING

Target: Human 1.0
Baseline: 0.1547
Latest measured strategy result: 0.1231
Change from baseline: -0.0316

What happened:
Substantial preservation, reader, tooling and supervision work completed,
but the measured owner outcome worsened under both tested repair strategies.

Current action:
Same-strategy work stopped. Focused Pro progress audit is selecting a
replacement method.

Owner action: NONE unless the replacement method requires new owner source.
```

Do not display “working,” “aligned,” or a large volume of completed supporting work without showing the direct owner-outcome delta.

---

## 13. Exact Somatic R15 regression fixture

### 13.1 Given

Owner outcome:

```text
Exact frozen final article reaches Pangram 4.0 Human fraction 1.0 while all preservation and editorial gates pass.
```

Measured evidence:

```text
exact R15 baseline: Human 0.1547368467
micro-repair candidate: Human 0.1381948739
article-wide reconstruction: Human 0.1231321841
direct-owner candidate: unmeasured because production surprise gate = NO
```

Supporting work:

- source integrity and preservation gates pass;
- multiple reader and supervisor rounds complete;
- extensive tooling, receipts, audits, and branch recovery complete;
- worker-to-contract is GREEN;
- contract-to-owner is MATCH;
- completion claim is WORKING.

### 13.2 Expected result

```text
outcome_advancement: REGRESSING
strategy_efficacy: REPLACEMENT_REQUIRED
overall_control_state: RED
same_strategy_continuation_allowed: false
required_directive: HOLD_SAME_STRATEGY_AND_SELECT_REPLACEMENT_METHOD
owner_decision_required: false unless new owner source is genuinely required
supporting_work_preserved: true
```

The worker must generate the progress intervention before the owner asks whether progress occurred.

Any implementation that reports the task as healthy because the two alignment planes pass fails this regression.

---

## 14. Existing-task migration

At the next safe checkpoint, each active nontrivial worker must:

1. identify the owner outcome’s direct evidence and valid leading indicators;
2. freeze the last valid baseline and current/best evidence;
3. classify work since the last direct evidence;
4. calculate or describe the outcome delta without inventing a percentage;
5. record outcome advancement and strategy efficacy separately from alignment;
6. trigger a strategy review when flat, regressing, overdue, or exhausted;
7. preserve valid supporting work;
8. stop materially similar work under a failed strategy;
9. continue automatically under an authorized replacement method.

Tasks with no currently measurable outcome must define the next decision-changing evidence boundary and cannot remain `NOT_YET_MEASURABLE` indefinitely.

---

## 15. Required tests

At minimum test:

1. Worker GREEN + contract MATCH + outcome REGRESSING yields overall RED under a repeated/failed strategy.
2. Worker GREEN + contract MATCH + outcome ADVANCING may remain GREEN.
3. One flat completed cycle yields at least YELLOW and strategy review.
4. Two flat cycles trigger `REPLACEMENT_REQUIRED` unless a valid delayed-effect model applies.
5. High activity with no direct evidence is not counted as progress.
6. Preservation/safety work remains visible as supporting work.
7. A promised measurement that is overdue produces `PROGRESS_EVIDENCE_OVERDUE`.
8. Strategy-cycle limits are enforced.
9. A new strategy resets strategy-specific cycle accounting but not the owner-outcome baseline/history.
10. A qualitative outcome uses explicit evidence states rather than a fabricated percentage.
11. A child task can advance enablement while the root outcome remains flat.
12. The Somatic R15 numeric regression yields RED and replacement-method review before owner prompting.
13. Pro/Extra High unavailability blocks only the affected strategy decision, not unrelated safe work.
14. Dashboard shows direct delta, supporting work, replacement status, and owner-action state.

---

## 16. Limits

- Some outcomes have long latency. Use owner-authorized leading indicators and explicit future falsification boundaries rather than demanding immediate final results.
- Exploration can generate value without immediate improvement. Its strategy contract must name the information it is buying, its budget, and the decision it can change.
- Negative results can be legitimate progress when they eliminate a live strategy. They are `STRATEGY_LEARNING`, not direct owner-outcome advancement.
- A strategy may temporarily regress one metric to improve a higher-priority owner outcome. That tradeoff requires an explicit multi-outcome contract and cannot be inferred after the fact.
- Model judges cannot reliably invent the true progress metric. It must derive from the owner outcome and direct evidence.

---

## 17. Relationship to other Mission Control patterns

This is a required companion to:

- `patterns/codex-pro-supervision-mission-control.md`
- `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`
- `patterns/supervision-assurance-planes-and-pro-meta-review.md`
- `patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md`

The owner-outcome pattern preserves the correct target. The dual-alignment pattern ensures the worker and contract point at it. This pattern closes the remaining loop by proving whether the strategy is actually moving toward it and forcing intervention when it is not.
