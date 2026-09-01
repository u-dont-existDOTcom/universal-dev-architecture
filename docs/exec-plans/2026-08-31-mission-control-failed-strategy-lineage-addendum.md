# Mission Control — Failed-Strategy Lineage Addendum

**Status:** CHAT-AUTHORED IMPLEMENTATION DIRECTIVE  
**Date:** 2026-08-31  
**Feedback ID:** `SDF-20260831-FAILED-STRATEGY-LINEAGE-001`  
**Parent PR:** `u-dont-existDOTcom/universal-dev-architecture#42`

## 1. Controlling reasoning decision

The existing `NO_VALID_STRATEGY` architecture correctly prohibits materially similar continuation after a failed/exhausted strategy and already requires stable strategy-family accounting. The missing enforcement seam is strategy lineage: a reasoning planner can still assign a new family ID and self-attest that its descendant is materially different.

The controlling correction is:

> **A failed or exhausted strategy family creates binding descendant constraints. A replacement/new family must pass a lineage gate against relevant negative evidence. After an observed recurrence, the planner that regenerated the failed method cannot be the sole authority on lineage. Only a diagnostic lineage verdict of `NEW_FAMILY` can permit a new family to proceed to `VALID_NEXT_STRATEGY` admission.**

This directive is the reasoning decision. Codex performs the mechanical repository implementation and tests. Codex does not redesign strategy lineage or adjudicate live semantic lineage.

## 2. Source artifacts to implement exactly

Treat these as authoritative for this slice:

- `patterns/failed-strategy-lineage-and-negative-evidence-binding.md`
- `templates/STRATEGY-LINEAGE-GATE.json`
- `templates/CURRENT-CODEX-WORKER-SUPERVISION-STRATEGY-LINEAGE-ADDENDUM.md`
- `evals/mission-control/failed-strategy-descendant-somatic-humanization.json`
- `feedback/mission-control/SDF-20260831-FAILED-STRATEGY-LINEAGE-001.json`

Also preserve compatibility with:

- `docs/exec-plans/2026-08-31-mission-control-no-valid-strategy-kill-switch.md`
- `patterns/outcome-advancement-and-strategy-efficacy.md`
- `patterns/independent-evaluation-separation.md`
- `patterns/chat-led-reasoning-codex-execution-separation.md`

If any current branch implementation has advanced beyond the exact file identities read by the reasoning chat, reconcile mechanically without weakening the controls. Stop and return an ambiguity if a semantic choice is required.

## 3. Schema integration

### 3.1 Strategy decision

If `templates/REASONING-STRATEGY-DECISION.json` now exists from the prior kill-switch slice, add fields equivalent to:

```text
lineageReceiptRef
lineageReceiptSha256
lineageVerdict
nearestFailedAncestorFamilyId
recurrenceTriggered
independentLineageReviewRequired
independentLineageReviewComplete
negativeEvidenceLedgerRefs
```

For a proposed **new or replacement family**, a reasoning decision cannot be `VALID_NEXT_STRATEGY` unless:

```text
lineageVerdict == NEW_FAMILY
lineage receipt is current for owner-outcome epoch
lineage receipt matches reviewed evidence boundary
independent lineage review is complete when recurrenceTriggered == true
```

A same-family continuation that remains within an already-authorized, non-failed, non-exhausted family does not need a fake `NEW_FAMILY` verdict every cycle. It remains governed by the existing family budget and strategy admission rules.

### 3.2 Execution directive

Extend the current `CHAT-TO-CODEX-EXECUTION-DIRECTIVE` implementation so the first substantive cycle of a new/replacement family binds to the lineage receipt/decision.

Reject execution when:

```text
lineage verdict is SAME_FAMILY for a purported new family
lineage verdict is DESCENDANT_OF_FAILED_FAMILY
lineage verdict is LINEAGE_UNRESOLVED
required independent lineage review is absent
lineage receipt owner-outcome epoch or evidence boundary is stale/mismatched
failed-family re-enable conditions are asserted without evidence
```

Do not permit a new `strategyFamilyId` to bypass these checks.

### 3.3 Progress / state projection

Where the existing strategy/outcome state model stores replacement-family status, project:

```text
lineageVerdict
nearestFailedAncestorFamilyId
negativeEvidenceBound
recurrenceTriggered
independentLineageReviewRequired
independentLineageReviewComplete
lineageParkReason
```

Do not invent lineage percentages.

## 4. Deterministic validator/reducer boundary

Add pure validation behavior equivalent to:

```python
validate_strategy_lineage_receipt(receipt, owner_outcome, evidence_boundary)
validate_failed_family_constraints(proposed_fingerprint, negative_evidence_ledger)
authorize_replacement_family(strategy_decision, lineage_receipt)
```

Deterministic code may validate:

- required fields;
- exact owner-outcome epoch/hash matching;
- evidence-boundary matching;
- declared verdict enums;
- recurrence/independence consistency;
- explicit forbidden-descendant predicates when machine-representable;
- family-ID reuse/rename inconsistencies;
- budget/history continuity;
- required reviewer identity separation when recurrence requires it.

Deterministic code must **not** infer the final semantic verdict `NEW_FAMILY` from lexical or numeric similarity alone. That verdict is reasoning-owned and comes from a chat-authored lineage receipt.

Required findings/alerts:

```text
FAILED_STRATEGY_DESCENDANT
STRATEGY_LINEAGE_UNRESOLVED
STRATEGY_RENAME_BYPASS
NEGATIVE_EVIDENCE_NOT_BOUND
LINEAGE_REVIEW_REQUIRED
LINEAGE_REVIEW_NOT_INDEPENDENT
STALE_STRATEGY_LINEAGE_RECEIPT
EXECUTION_WITHOUT_NEW_FAMILY_LINEAGE_PASS
```

## 5. Recurrence semantics

When recurrence is recorded:

```text
recurrenceTriggered = true
independentLineageReviewRequired = true
```

Then the planner's own material-difference assertion is insufficient.

Require a lineage reviewer that is meaningfully separate from the planner context and is diagnostic-only. It may classify lineage and explain the comparison. It may not author or repair the proposed strategy inside the same lineage receipt.

If reviewer independence cannot be established:

```text
lineageVerdict = LINEAGE_UNRESOLVED
strategyAuthorization = NO_VALID_STRATEGY
executionState = PARKED_NO_VALID_STRATEGY
```

The task remains open. Owner action remains `NONE` unless separate owner authority is actually required.

## 6. Generator/validator information firewall

Do not turn this into a universal requirement to blind every planner.

Support an optional generation-context policy for cases where the failed artifact itself is implicated as an anchoring scaffold:

```text
generatorInputPolicy
validatorInputPolicy
withheldFailedArtifactRefs
semanticOrFunctionalPacketRefs
```

The architecture must permit:

- generator receives owner outcome, semantic/function requirements, provenance/locks, minimal correctness context;
- validator receives the above plus rejected/failed artifacts and negative-evidence ledger.

This policy is reasoning-authored. Codex merely persists and enforces declared artifact exposure boundaries where technically possible.

## 7. Dashboard integration

Add owner-readable fields to the task detail / strategy correction area:

```text
Strategy lineage: NEW_FAMILY | SAME_FAMILY | FAILED DESCENDANT | UNRESOLVED
Nearest failed ancestor
Why this is / is not materially different
Negative evidence bound
Independent lineage review: required / complete / not required
Re-enable condition state
```

Required attention messages:

### Failed descendant

```text
PARKED — FAILED STRATEGY DESCENDANT

Why:
The proposed replacement still uses the causal mechanism already rejected or
falsified under an earlier strategy family.

What stopped:
Substantive execution under the descendant strategy.

What remains active:
The task, evidence, and reasoning handoff.

Owner action:
NONE unless a separate owner decision is identified.
```

### Unresolved lineage

```text
PARKED — STRATEGY LINEAGE UNRESOLVED

Why:
The reasoning system cannot yet establish that the proposed replacement is
materially different from the failed family.
```

Do not show a fresh strategy ID as a new strategy in owner-facing UI before lineage passes.

## 8. Required hostile tests

Use `evals/mission-control/failed-strategy-descendant-somatic-humanization.json` as a regression fixture.

At minimum add executable tests proving:

1. New strategy ID + same causal fingerprint cannot become a new family by relabeling.
2. New family ID + matching forbidden descendant predicate is blocked.
3. Prompt wording changes alone do not bypass failed-family constraints.
4. Fresh chat identity alone does not establish `NEW_FAMILY`.
5. A recurrence with no independent lineage review yields `LINEAGE_UNRESOLVED` / `NO_VALID_STRATEGY`.
6. A recurrence where planner and lineage reviewer are the same context is rejected.
7. A valid diagnostic-only independent lineage receipt with `NEW_FAMILY` may proceed to ordinary strategy admission.
8. `NEW_FAMILY` does not itself imply `VALID_NEXT_STRATEGY`; all existing causal hypothesis, root evidence, budget, and kill-condition gates still apply.
9. Same viable family ordinary next-cycle execution remains possible under the existing budget without demanding fake novelty.
10. Failed-family history and negative evidence survive chat rollover and family relabeling.
11. Somatic fixture returns `DESCENDANT_OF_FAILED_FAMILY`, blocks paid detector/execution advancement, leaves task nonterminal, owner action `NONE`.
12. Codex cannot authoritatively mutate the reasoning-owned lineage verdict.
13. Dashboard exposes failed ancestor and reason instead of a generic RED/blocked state.

Run targeted lineage/strategy tests and then the repository's full applicable test suite. Preserve exact commands/results in the execution receipt.

## 9. Existing bootstrap integration

After tests pass, mechanically incorporate the strategy-lineage addendum into the shared bootstrap and any indexes/templates that enumerate required companions. Preserve the controlling rule that chats reason and Codex executes.

The integrated bootstrap must state, in substance:

> A new strategy name or family ID does not establish novelty. Failed strategy evidence binds descendants. After observed recurrence, require independent diagnostic lineage review before a purported new family can authorize execution.

Do not delete the temporary addendum until the integrated bootstrap/schema/test path is verifiably equivalent.

## 10. Explicit prohibitions for this Codex slice

Codex must not:

- decide whether the live Somatic replacement strategy is genuinely new;
- author Somatic candidate prose;
- run Pangram or another paid detector for Somatic;
- invent strategy fingerprints or negative-evidence predicates for unrelated live tasks;
- weaken independent review after recurrence;
- infer `NEW_FAMILY` from a different name/model/chat alone;
- merge PR #42;
- close the feedback item or claim Pro meta-review acceptance;
- broaden this implementation into a general semantic similarity classifier.

## 11. Stop / return conditions

Return a `CODEX-EXECUTION-RECEIPT` when:

- implementation and tests complete; or
- a semantic ambiguity requires reasoning; or
- current branch changes conflict materially with this frozen reasoning decision; or
- required prior kill-switch schemas/validator seams do not yet exist and implementing lineage first would create duplicate architecture.

If blocked by sequencing, preserve this directive and resume after the prerequisite implementation lands. Do not redesign around the blocker.
