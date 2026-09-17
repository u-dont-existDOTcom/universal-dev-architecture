# Recommendation preflight integrity

**Status:** Candidate universal control from owner-corrected recurrence  
**Date:** 2026-09-17

## Purpose

Prevent discovery candidates from leaking into owner-facing recommendations before the checks that can reverse the recommendation have been completed.

A recommendation is a terminal classification after evidence integration. It is not a promising search result followed by caveats that disqualify it.

## Activation

Apply this pattern when an answer will tell an owner what to buy, choose, use, shortlist, rank, or treat as the best/top/value option and the available evidence can materially distinguish candidates.

For broad option searches, compose with `patterns/coverage-before-depth-in-selection.md`: inventory materially different alternatives before deep auditing, but do not expose failed discovery candidates merely to demonstrate coverage.

## Candidate states

Use these semantic states during reasoning:

```text
DISCOVERED   -> found; not evaluated enough to expose as a recommendation
SCREENED     -> obvious mismatches removed; material gates still open
VERIFIED     -> every currently material pre-endorsement gate has passed
RECOMMENDED  -> verified candidate selected for owner-facing recommendation
REJECTED     -> failed a material gate
UNKNOWN      -> evidence needed for a material gate is unavailable or contradictory
```

Only `VERIFIED` candidates may become `RECOMMENDED`.

`REJECTED` and `UNKNOWN` candidates are normally internal search state. Do not pad an owner-facing shortlist with them. Show rejected candidates only when the owner explicitly asks to see rejects/tradeoffs, or when a sufficiently broad search produced no valid recommendation and the failure reasons are necessary to explain the bounded result.

## Pre-endorsement gate

Before a candidate can be called recommended, best value, strongest candidate, top pick, or be included in a recommendation shortlist, resolve every material dimension that could reverse the conclusion.

For shopping tasks, this normally includes:

1. **Exact use-case fit** — load, dimensions, operating mode, required features, destination/country constraints, and owner budget/value objective.
2. **Current orderability** — retailer listing is not enough. Verify a current purchase path, stock/order state, or equivalent live offer evidence for the exact variant when retailer-specific availability matters.
3. **Current price** — a value claim requires a visible current price or tightly bounded current range. Include material shipping, tax, forwarding, required battery/accessory, or variant costs when known; otherwise mark them unresolved.
4. **Product review signal** — check the exact product/variant rating, review count, and recurring negative themes when available. Do not substitute seller/store ratings for product ratings. A high mean rating does not erase recurring serious defects.
5. **Compatibility** — voltage, frequency, plug/grounding, protocols, platform, power topology, waveform, connectors, physical fit, or other task-specific compatibility.
6. **Performance for the actual load** — capacity, runtime, throughput, durability, or other outcome relevant to the owner's use rather than headline capacity alone.
7. **Variant/source identity** — confirm that price, rating, specifications, and availability refer to the same materially relevant variant. Conflicting feeds remain `UNKNOWN` until reconciled.
8. **Relative value** — compare only against other candidates that also pass their material gates. A cheap failed candidate does not set the valid value baseline.

If a material gate is missing, contradictory, or failed, do not endorse the candidate. Continue searching if executable alternatives remain.

## Price/value invariant

For a request framed as **best value**, **cheap**, **budget**, **worth it**, or a price-sensitive comparison:

> **No visible current price = no owner-facing value recommendation.**

A recommendation table or shortlist must include the current price evidence used for the value judgment. If the price can change materially by destination or variant, state the exact observed price context rather than presenting it as universal.

## Reliability invariant

Do not recommend a product with a materially worse customer-reliability signal than comparable valid alternatives merely because its specifications or nominal capacity look attractive.

Inspect recurring negative themes with special attention to failures that defeat the product's core purpose or raise safety concerns: premature failure, battery defects, power interruptions, overheating/burning odor, incompatible transfer behavior, misleading capacity, or inability to use the advertised function.

Low review counts remain low-confidence evidence even when the average is high.

## Orderability invariant

For retailer-specific requests:

- `listed` is not `in stock`;
- a comparison-engine price is not proof that the retailer can currently sell the exact variant;
- an inaccessible or stale offer remains `UNKNOWN`, not available;
- a page with no purchase path is not a buy option.

When the user allows alternate marketplaces or forwarding, broaden discovery there rather than repeatedly surfacing unavailable retailer listings.

## Pre-delivery admission

Immediately before the owner-facing answer, inspect the actual candidates that will be exposed as recommendations.

For every recommendation, require specific evidence for:

```text
use_case_fit              PASS
orderability              PASS
price_visible             PASS when value-sensitive
rating_review_signal      PASS or explicitly justified NOT_AVAILABLE
serious_review_themes     PASS
compatibility             PASS
performance_for_load      PASS
variant_identity          PASS
relative_value            PASS
```

A substantive `FAIL` blocks that candidate from the recommendation output. `UNKNOWN` blocks an endorsement when the unknown dimension could reverse the decision.

If no candidate passes after a reasonable broad search, return **no verified recommendation found in the checked set** and state the remaining access/evidence boundary. Do not manufacture a recommendation from the rejected pool.

## Failure modes

Reject these patterns:

- recommending a retailer item and discovering afterward that it is out of stock;
- recommending a cheap product and checking its weak rating only after the owner objects;
- showing a product as a candidate and then explaining in the same answer why its known topology/specification makes it unsuitable;
- omitting prices from a best-value shortlist;
- surfacing a no-buy-option product as an owner-facing option;
- including a product with recurring safety/reliability complaints merely because it was one of the closest search results;
- treating a branch-local feedback record as evidence that the behavior is already enforced on future turns.

## Learning and projection

A captured failure is not a repaired execution surface. Owner correction triggers immediate task-time re-activation under `patterns/task-time-lesson-activation.md`. The durable lesson must then be routed into the authority chain that governs the relevant recommendation surface before claiming general enforcement.

Originating Mission Control evidence:

- `feedback/mission-control/SDF-20260917-SHOPPING-RECOMMENDATION-PREFLIGHT-001.json`

The originating recurrence demonstrated that **capture without projection/enforcement was insufficient**. Future acceptance therefore requires behavior at the owner-facing recommendation boundary, not merely the presence of this file.
