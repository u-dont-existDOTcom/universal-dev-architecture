# Recommendation preflight integrity

**Status:** Required universal recommendation control  
**Date:** 2026-09-17  
**Updated:** 2026-09-21

## Purpose

Prevent discovery candidates from leaking into owner-facing recommendations before the checks that can reverse the recommendation have been completed.

A recommendation is a terminal classification after evidence integration. It is not a promising search result followed by caveats that disqualify it.

## Activation

Apply this pattern when an answer will tell an owner what to buy, subscribe to, upgrade, prepay, replace, choose, use, shortlist, rank, or treat as the best/top/value option and the available evidence can materially distinguish candidates.

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

## Software plans, subscriptions, and paid replacements

For software plans, cloud services, subscriptions, paid integrations, and other recurring services, the material pre-endorsement gates are not exhausted by feature presence or nominal monthly price.

Before recommending a new recurring charge, upgrade, prepaid/annual plan, or paid replacement, freeze the **exact owner outcome** and verify the candidate on the same identity and execution surfaces where the owner needs the benefit. A feature available somewhere in a vendor account is not proof that it is available in the owner's existing account, workspace, chat, agent, Work/Codex surface, client, device, role, region, or usage pool.

Resolve these dimensions before endorsement:

1. **Target-surface fit** — list the exact account(s), workspace(s), client(s), mode(s), device(s), and existing artifacts/workflows that must continue to work.
2. **Entitlement mapping** — distinguish account-level from workspace-level entitlement; personal from managed/business workspace; web/desktop from mobile; Chat from Work/Codex/agent surfaces; read/fetch from write/action capability; and role/region/rollout constraints.
3. **Replacement proof** — identify the current paid tool or cost the candidate is supposed to replace and prove that it can actually be canceled after the purchase. State explicitly **what the purchase does not replace**.
4. **Allowance fit** — verify that the relevant message, model, reasoning, Work/agent, tool-call, storage, seat, or other allowance fits the owner's actual workload. Model availability is not the same as usable quota.
5. **Billing separation** — keep subscription entitlement, workspace credits, API credits, external-provider charges, add-ons, and metered overage distinct. Do not imply that one pool covers another without current evidence.
6. **Full effective cost** — include minimum seat counts, annual prepayment, required add-ons, external services, and any old subscription that must be retained because the replacement is incomplete.
7. **Workflow continuity** — if the candidate works only by moving activity into another workspace/account/client, describe that as a migration or split workflow, not as a transparent replacement.
8. **Current first-party verification** — for fast-changing plan features and limits, verify current vendor documentation immediately before recommending purchase; remembered plan behavior is not sufficient.
9. **Reversibility** — before recommending an annual or otherwise difficult-to-reverse commitment, validate the decisive premise through the **cheapest reversible path** when available: an existing account, free tier, trial, monthly plan, sandbox, capability test, or documented entitlement check.

If a decision-relevant entitlement, allowance, surface, or billing boundary is unresolved and could reverse the decision, the candidate remains `UNKNOWN` and must not be recommended as a purchase or replacement.

### Paid-commitment fit statement

For a consequential paid recommendation, the owner-facing answer must make the replacement claim auditable. State:

```text
owner_outcome: <what cost/workflow is being improved or replaced>
works_on_required_surfaces: <yes/no + exact surfaces>
does_not_replace: <retained tools/costs/workflows>
allowance_fit: <verified limits relevant to actual use>
full_effective_cost: <including minimum seats/add-ons/retained costs>
reversible_validation: <what was tested or why no cheaper test exists>
```

Do not recommend annual prepayment merely because it lowers the monthly equivalent. The annual recommendation is justified only after the core workflow is proven on the required surfaces and material capability regressions or retained costs are resolved.

A plan may still be worth buying for a secondary benefit even when it does not replace the original tool. Treat that as a new value proposition and evaluate it separately rather than using it to rescue a failed replacement claim.

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


## 2026-09-21 entitlement-scope recurrence

A cross-project owner correction exposed a replacement-claim failure in a software-plan recommendation: a capability scoped to one workspace was treated as though it extended to the owner's other workspace and existing workflow, and an annual commitment was recommended before that surface boundary and workload allowance were proven.

The exact private source provenance is retained in the owner's private logic-lesson ledger rather than copied into Universal infrastructure. Public promotion records only the generalized recurrence and source-byte SHA-256 `7f9620de9fb431b26487d4108c0a641bb2aea338c7b80345d991714159b30be5`.

The promotion is limited to the entitlement-fit, replacement-proof, allowance, billing-separation, and reversibility controls above. It does not encode any named vendor's current plan capabilities; those remain version-sensitive and must be reverified at recommendation time.
