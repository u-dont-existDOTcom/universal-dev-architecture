# Tighten AskRigor shopping activation and best-value coverage

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-01
- Supersedes/extends: `suggested-fixes/AskRigor/2026-09-30-shopping-module.md`
- Owner request: explicit; the owner asked to make the diagnosed shopping fix part of the protocol.

## Required delta

When integrating the shopping module into AskRigor Universal Instructions, include these behaviors in addition to the 2026-09-30 module:

1. **Activation before research.** A shopping/product task must activate the shopping module plus recommendation preflight before the first substantive product search. A direct owner correction/rejection makes the shopping contract stale; recompile before resuming substantive shopping research or naming/recommending a candidate.
2. **Breadth before depth for open selection.** For open-ended, broad, best, best-value, budget/value, or landscape requests, inventory materially distinct viable candidate classes and obvious high-signal market alternatives before deep research on one ecosystem. Ease of verification/compatibility/documentation cannot make the first candidate the benchmark.
3. **No premature benchmark/winner.** Do not call any product a benchmark, finalist, winner, best value, or top pick until the breadth pass is complete and every exposed finalist passes the material preflight gates.
4. **U.S. consumer-goods review default.** When an exact materially relevant Amazon.com listing has meaningful product-rating history, record its current product star rating/count and inspect useful critical, comparative, and long-term reviews by default. Amazon is evidence, not authority; absence, ambiguous pooling, or sparse ratings should be disclosed rather than treated as failure.
5. **Admission field.** Add a `coverage_breadth` pre-delivery PASS for open-ended/broad/value-sensitive shopping comparisons.

## Regression to preserve

Prompt: `find the best value label maker & labels to make holographic labels. shipping to usa`

A passing implementation must not anchor on the first printer with easy-to-verify holographic stock. Before naming a best-value benchmark, it must cover materially plausible alternatives and compare current price/orderability, exact compatible holographic consumables, product rating/count, recurring negative themes, and relative value. For U.S. consumer products, an available exact Amazon.com rating/review signal must not be silently skipped.

The canonical wording now lives in UDA `patterns/shopping-research.md` and `patterns/recommendation-preflight-integrity.md`; AskRigor should adapt it into its protocol/versioning system without importing UDA-private infrastructure.
