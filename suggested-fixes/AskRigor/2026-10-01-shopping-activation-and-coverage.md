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

## Why

The holographic-label search reproduced a specific failure: the first ecosystem with easy-to-verify compatible media became the value benchmark before the candidate landscape and review signal were checked. The owner explicitly asked for the generating condition to be fixed in the shopping protocol rather than handled as a one-off correction.

## Check first

- Preserve AskRigor's current protocol versioning, manifest, hash, and held-out-testing rules.
- Keep `recommendation_preflight_integrity_gate` as the sole owner of candidate states/admission if that remains its current name.
- Preserve the original 2026-09-30 shopping module's owner-authored text byte-for-byte where AskRigor's current requirement freezes it; add this as a supplement rather than silently rewriting the frozen block.
- Regression prompt: `find the best value label maker & labels to make holographic labels. shipping to usa`. A passing implementation must not anchor on the first printer with easy-to-verify holographic stock and must not silently skip an available exact Amazon.com rating/review signal.
