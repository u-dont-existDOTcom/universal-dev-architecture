# Failed Strategy Lineage and Negative-Evidence Binding

**Status:** Required Mission Control companion control  
**Date:** 2026-08-31  
**Origin:** Somatic R15 humanization recurrence: a reasoning writer knew that conversational/direct-paraphrase humanization had already been rejected, then independently regenerated the same strategy family under different wording.

## 1. Problem

A system can correctly record:

```text
strategy_efficacy = FAILED
same_strategy_family_continuation_allowed = false
```

and still repeat the failed method if a later reasoning surface gives the descendant a new name.

The failure is **strategy-lineage laundering**:

```text
failed strategy is known
-> later planner changes surface tactics or labels
-> underlying causal mechanism / input representation / optimization loop is materially unchanged
-> planner declares "new strategy"
-> family budget and prohibition are bypassed
-> same failure recurs
```

This is distinct from ordinary task-contract laundering. The owner outcome may remain correctly represented and the worker may follow the new directive exactly. The defect is that negative evidence did not become an executable constraint on strategy descendants.

## 2. Existing controls and exact gap

Existing Mission Control controls already provide:

- stable `strategy_family_id`;
- strategy-family budgets;
- `NO_VALID_STRATEGY` when a proposed action is materially the same as an exhausted or failed family;
- context-saturation indicators including repeated similar strategies and strategy relabeling;
- independent-evaluation guidance.

Those are necessary but not sufficient.

The unresolved gap is:

> **What makes two nominal strategies materially the same family, and can the same reasoning context that generated the strategy authoritatively decide that question after repeated recurrence?**

A bare field such as `materialDifferenceFromPriorFamilies` is self-attestation. A new `strategy_family_id` is only a label unless its lineage is evidenced.

## 3. Durable rule

**Negative strategy evidence is binding. A failed or exhausted strategy family creates a descendant prohibition that survives renaming, fresh chats, local variants, decomposition, recombination, and surface-level tactic changes.**

Before another substantive cycle, the reasoning supervisor must pass a strategy-lineage gate against all materially relevant failed/exhausted families.

The gate is fail-closed:

```text
NEW_FAMILY
SAME_FAMILY
DESCENDANT_OF_FAILED_FAMILY
LINEAGE_UNRESOLVED
```

Only `NEW_FAMILY` can authorize a new family. `SAME_FAMILY`, `DESCENDANT_OF_FAILED_FAMILY`, or `LINEAGE_UNRESOLVED` cannot authorize substantive execution unless explicit re-enable conditions recorded when the family failed are now satisfied.

## 4. Strategy fingerprint

A stable family is defined by causal/operational dimensions, not its prose label.

Record at least:

```text
input_representation
information_exposure / blinding state
transformation_or_action_mechanism
search / iteration granularity
optimization signal or proxy
root outcome relationship
feedback loop
artifact architecture intentionally preserved or changed
review / validation topology
resource or external-call pattern when causally relevant
```

Not every dimension must differ for a genuinely new family. The reasoning supervisor must identify which changed dimension is expected to alter the failed causal pathway.

The following normally do **not** establish a new family by themselves:

```text
renaming the method
new prompt wording
fresh chat alone
synonyms or prose style
smaller or larger chunk size without a new causal reason
more iterations of the same loop
changing temperature/model parameters without a hypothesis
adding another self-review pass
reordering steps that preserve the same mechanism
changing a local proxy while preserving the same invalid root relationship
```

## 5. Negative-evidence ledger

When a strategy family fails, exhausts, or is superseded because of adverse evidence, record:

```text
family_id
failure_evidence_boundary
failure_reason
causal_failure_hypothesis
forbidden_descendant_predicates
known_non_novel_changes
scope_of_prohibition
reenable_conditions
budget_consumed
root_outcome_state_at_failure
```

`forbidden_descendant_predicates` are operational constraints, not prose warnings.

Example:

```text
family: direct paragraph paraphrase for article humanization
failure: detector regression + owner rejection of preserved model thought rhythm
forbidden descendants:
  - source prose remains primary generation scaffold
  - same conceptual-card ordering retained by default
  - main mechanism is conversational surface substitution
non-novel changes:
  - contractions
  - first-person conversion
  - synonym replacement
  - sentence-length variation
reenable condition:
  - new evidence shows one of those mechanisms was incorrectly implicated
```

## 6. Material-difference proof

A proposed new family must provide a bounded comparison to each relevant failed family:

```text
prior_family_id
shared_dimensions
changed_dimensions
why each changed dimension is causal rather than cosmetic
negative evidence specifically escaped
new falsifiable prediction
new failure threshold
```

Invalid proof:

```text
"this is a fresh approach"
"rewritten from scratch"
"different prompt"
"new model"
"more human / more robust / cleaner"
```

A material-difference claim that cannot state how the new mechanism escapes the observed failure is `LINEAGE_UNRESOLVED`.

## 7. Independence rule for lineage adjudication

Ordinary strategy selection can remain with the assigned reasoning chat. After a **recurrence event**, however, the same saturated context must not be the sole authority on whether its next idea belongs to the failed family.

Recurrence triggers include:

- a strategy explicitly rejected, then regenerated in materially similar form;
- repeated family relabeling;
- the reasoning surface forgetting or minimizing prior negative evidence;
- multiple cycles where the declared novelty does not survive outcome measurement;
- owner detection that the proposed fix repeats the known failure.

After a trigger, require a separate diagnostic-only lineage adjudication by a fresh reasoning context or otherwise meaningfully independent evaluator.

The lineage validator:

- receives the proposed strategy fingerprint and failed-family ledger;
- receives the relevant failure evidence;
- may inspect artifacts needed to compare mechanism;
- does **not** invent or rewrite the strategy;
- returns only lineage classification, supporting comparison, confidence, and unresolved dimensions.

The original planner may respond to the diagnosis in a later reasoning step, but cannot override a failed lineage gate by relabeling the strategy.

## 8. Asymmetric information isolation

Some failed strategies recur because the failed artifact itself anchors the next generator.

When the failure evidence implicates representation anchoring, direct imitation, or local optimization around a bad scaffold, separate information exposure:

**Generator / planner may receive:**

```text
owner outcome
semantic / functional requirements
hard locks and provenance
minimal context required for correctness
failure constraints expressed without reproducing the rejected solution when practical
```

**Lineage validator receives:**

```text
all of the above
+ failed/rejected strategy artifacts
+ failure reasons
+ negative-evidence ledger
+ proposed new artifact/strategy
```

The goal is not universal blinding. It is to prevent the failed realization from remaining the generator's dominant scaffold while preserving full negative evidence at the gate that must detect recurrence.

## 9. Fail-closed execution authorization

A substantive execution directive that begins a new or replacement strategy family must bind to a current lineage receipt.

Required conditions:

```text
strategy_authorization = VALID_NEXT_STRATEGY
lineage_verdict = NEW_FAMILY
lineage_receipt matches owner-outcome epoch
lineage_receipt matches reviewed evidence boundary
no relevant failed-family re-enable condition is falsely assumed
```

Otherwise:

```text
strategy_authorization = NO_VALID_STRATEGY
execution_state = PARKED_NO_VALID_STRATEGY
```

Codex may record fingerprints and run deterministic comparisons, but it cannot authoritatively decide semantic strategy lineage or invent the novelty rationale.

## 10. Relationship to outcome progress

A negative result can produce useful `STRATEGY_LEARNING`. That learning is lost if the same failed causal mechanism is immediately retried under a new label.

Therefore:

```text
negative outcome evidence
-> update failed-family ledger
-> bind descendant prohibition
-> require lineage gate before replacement execution
```

This complements, rather than replaces:

- `patterns/outcome-advancement-and-strategy-efficacy.md`;
- `docs/exec-plans/2026-08-31-mission-control-no-valid-strategy-kill-switch.md`;
- `patterns/independent-evaluation-separation.md`;
- `patterns/chat-led-reasoning-codex-execution-separation.md`.

## 11. Dashboard / attention requirements

Expose separately:

```text
active strategy id
active strategy family id
lineage verdict
nearest failed/exhausted ancestor family
material-difference summary
negative evidence bound to the family
independent lineage review required / complete
re-enable condition state
```

Required alerts:

```text
FAILED_STRATEGY_DESCENDANT
STRATEGY_LINEAGE_UNRESOLVED
STRATEGY_RENAME_BYPASS
NEGATIVE_EVIDENCE_NOT_BOUND
LINEAGE_REVIEW_REQUIRED
LINEAGE_REVIEW_NOT_INDEPENDENT
```

Do not represent a new label as a new strategy on the dashboard until lineage passes.

## 12. Somatic regression fixture

Observed sequence:

```text
known rejected family:
  direct paraphrase / conversationalization of model-shaped prose
known reasons:
  preserved model thought rhythm
  false autobiography risk
  surface informality did not solve structural AI shape
later proposal:
  contractions + first person + conversational transitions + local cold passes
planner assessment:
  materially more human
owner finding:
  much of apparent Human quality was owner-verbatim, and the actual AI-shaped material remained structurally similar
```

Expected lineage result:

```text
lineage_verdict = DESCENDANT_OF_FAILED_FAMILY
strategy_authorization = NO_VALID_STRATEGY for that candidate path
candidate_or_execution_advancement = blocked
owner_action = NONE
required_next_reasoning = construct a causally different strategy
```

A fresh name, fresh chat, or fresh candidate cannot change that result by itself.

## 13. Required tests

At minimum:

1. New strategy label + same fingerprint -> `SAME_FAMILY`.
2. Surface prompt changes only -> not a new family.
3. Fresh chat only -> not a new family.
4. Failed family + matching forbidden descendant predicate -> `DESCENDANT_OF_FAILED_FAMILY`.
5. Material causal mechanism change with falsifiable reason -> may return `NEW_FAMILY`.
6. Ambiguous material difference -> `LINEAGE_UNRESOLVED` and no substantive execution.
7. Family budget cannot reset through a new ID when fingerprint lineage matches.
8. Negative evidence survives reasoning-chat rollover.
9. Recurrence trigger requires independent diagnostic lineage review.
10. The lineage validator cannot rewrite the strategy it judges.
11. Generator input isolation may withhold rejected realization while validator retains it.
12. Codex cannot self-authorize `NEW_FAMILY`.
13. The Somatic conversationalization recurrence is blocked before detector/paid execution.

## 14. Limits

- Strategy similarity is partly semantic; deterministic fingerprints support the decision but do not eliminate reasoning judgment.
- Overbroad family definitions can suppress genuinely useful exploration. Record explicit scope and re-enable conditions.
- A mechanism can become viable after external conditions change. Re-enable only against recorded evidence, not because time passed or a new chat opened.
- Independent lineage review adds cost; require it after recurrence/high-consequence failures, not for every trivial strategy change.
