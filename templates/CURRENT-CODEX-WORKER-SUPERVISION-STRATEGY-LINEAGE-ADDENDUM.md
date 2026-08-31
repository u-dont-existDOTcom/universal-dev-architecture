# Current Codex Worker — Strategy-Lineage Addendum

**Status:** ACTIVE COMPANION to `CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md` until incorporated into the shared bootstrap.  
**Date:** 2026-08-31

This addendum does not give Codex strategy authority. It prevents Codex from executing a replacement strategy merely because a reasoning chat gave it a new name.

Read with:

- `patterns/failed-strategy-lineage-and-negative-evidence-binding.md`
- `docs/exec-plans/2026-08-31-mission-control-no-valid-strategy-kill-switch.md`
- `patterns/independent-evaluation-separation.md`
- `templates/STRATEGY-LINEAGE-GATE.json`

## Mandatory rule

Before the first substantive execution cycle of a proposed replacement/new strategy family, require a current reasoning-authored strategy admission plus a strategy-lineage receipt.

A new strategy label or `strategy_family_id` is not evidence of novelty.

Accepted lineage state for new-family execution:

```text
lineage_verdict = NEW_FAMILY
strategy_authorization = VALID_NEXT_STRATEGY
```

Block substantive execution when:

```text
lineage_verdict = SAME_FAMILY
lineage_verdict = DESCENDANT_OF_FAILED_FAMILY
lineage_verdict = LINEAGE_UNRESOLVED
```

unless an explicit recorded re-enable condition for the failed family has been satisfied and the reasoning supervisor issues a new valid strategy decision.

## Recurrence trigger

If the owner, supervisor, or outcome evidence shows that a previously rejected/failed method was regenerated under different wording or local tactics:

1. preserve the current artifacts and evidence;
2. do not run another detector, paid call, build/deploy, experiment, or equivalent substantive cycle under that method;
3. mark `LINEAGE_REVIEW_REQUIRED`;
4. route the strategy fingerprint and failed-family ledger to a separate diagnostic-only reasoning context;
5. remain parked until the matching lineage receipt and strategy decision arrive.

Codex may collect deterministic facts for the fingerprint. Codex may not decide semantic lineage, invent the novelty rationale, or change `NO_VALID_STRATEGY` to `VALID_NEXT_STRATEGY`.

## Non-novel changes

Do not treat these as a new family by themselves:

- new prompt wording;
- fresh chat/model context alone;
- renamed strategy;
- synonyms or style changes;
- more/fewer iterations of the same loop;
- chunk-size changes without a causal hypothesis;
- another self-review pass;
- a different local proxy with the same invalid root-outcome relationship.

## Independent lineage review

After a recurrence event, the same reasoning context that regenerated the failed method cannot be the sole authority on whether its next proposal is materially different.

The lineage reviewer is diagnostic-only. It returns one of:

```text
NEW_FAMILY
SAME_FAMILY
DESCENDANT_OF_FAILED_FAMILY
LINEAGE_UNRESOLVED
```

It does not author the replacement strategy.

## Required alerts

```text
FAILED_STRATEGY_DESCENDANT
STRATEGY_LINEAGE_UNRESOLVED
STRATEGY_RENAME_BYPASS
NEGATIVE_EVIDENCE_NOT_BOUND
LINEAGE_REVIEW_REQUIRED
LINEAGE_REVIEW_NOT_INDEPENDENT
```

## Liveness

Parking a failed strategy family is not task completion and is not a reason to keep Codex busy. Preserve the durable reasoning handoff and wait for a valid strategy decision.
