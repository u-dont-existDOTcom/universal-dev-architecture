# Tighten AskRigor shopping activation and best-value coverage

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-01, by the UDA maintenance chat
- From: `suggested-fixes/AskRigor/2026-09-30-shopping-module.md` plus the owner's 2026-10-01 correction
- Owner request: yes, the owner asked to make the diagnosed shopping fix part of the protocol
- Existing pull request: none
- Supersedes: none

## What to do

When integrating the shopping module into AskRigor Universal Instructions, include these behaviors in addition to the 2026-09-30 module:

1. **Activation before research.** A shopping/product task activates the shopping module plus recommendation preflight before the first substantive product search. A direct owner correction/rejection makes the shopping contract stale; recompile before resuming substantive shopping research or naming/recommending a candidate.
2. **Breadth before depth for open selection.** For open-ended, broad, best, best-value, budget/value, or landscape requests, inventory materially distinct viable candidate classes and obvious high-signal market alternatives before deep research on one ecosystem. Ease of verification, compatibility, or documentation cannot make the first candidate the benchmark.
3. **No premature benchmark/winner.** Do not call any product a benchmark, finalist, winner, best value, or top pick until the breadth pass is complete and every exposed finalist passes the material preflight gates.
4. **U.S. consumer-goods review default.** When an exact materially relevant Amazon.com listing has meaningful product-rating history, record its current product star rating/count and inspect useful critical, comparative, and long-term reviews by default. Amazon is evidence, not authority; absence, ambiguous pooling, or sparse ratings should be disclosed rather than treated as failure.
5. **Admission field.** Add a `coverage_breadth` pre-delivery PASS for open-ended/broad/value-sensitive shopping comparisons.
6. **Exact live-offer recheck.** Immediately before recommending or directly linking a buy option, open that exact offer, follow redirects, confirm the intended product/variant, and require a current purchase path/orderability state. Search snippets, cached cards, manufacturer/catalog pages without a purchase path, category pages, sold-out pages, "no longer available" pages, or seller pages that do not establish the exact item cannot pass.
7. **Dead-offer continuation.** If a leading candidate fails the live-offer gate, remove it from buy options and continue automatically: search alternate legitimate sellers/channels for the same materially identical product first, then materially equivalent brands/products, rerunning affected fit/price/review/value gates. eBay/Etsy and other secondary marketplaces are valid discovery channels when appropriate, but seller/provenance/condition/returns risks must be checked.
8. **Pre-delivery admission field.** Add `exact_offer_live` PASS for every surfaced buy link; a dead/out-of-stock historical favorite may appear only as unavailable comparison context, never as a recommended option/value winner.

## Why

The holographic-label search reproduced a first-candidate anchoring failure. The later edible-glitter search exposed a second failure after that fix: a product was surfaced through an unavailable U.S. retailer/manufacturer path instead of being removed from buy options and triggering alternate-seller/alternate-brand continuation. The owner explicitly asked for both generating conditions to be fixed in the shopping protocol rather than handled as one-off corrections.

## Check first

- Preserve AskRigor's current protocol versioning, manifest, hash, and held-out-testing rules.
- Keep `recommendation_preflight_integrity_gate` as the sole owner of candidate states/admission if that remains its current name.
- Preserve the original 2026-09-30 shopping module's owner-authored text byte-for-byte where AskRigor's current requirement freezes it; add this as a supplement rather than silently rewriting the frozen block.
- Regression prompt: `find the best value label maker & labels to make holographic labels. shipping to usa`. A passing implementation must not anchor on the first printer with easy-to-verify holographic stock and must not silently skip an available exact Amazon.com rating/review signal.
- Regression prompt: `find the best edible glitter dust without artificial dyes, all natural`. If an initially preferred product's U.S. retailer page says unavailable/no longer available, a passing implementation must remove it from buy options, search alternate legitimate sellers (including secondary marketplaces when appropriate), then equivalent brands if necessary, and surface only exact live/orderable offers as recommendations.
