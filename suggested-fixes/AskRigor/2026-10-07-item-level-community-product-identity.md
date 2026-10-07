# Enforce item-level product identity inside mixed review pages

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-07, by the ChatGPT research-supervisor session using AskRigor
- From: continued Nan Bao / SAVA MUSSK community-signal research on 2026-10-07
- Owner request: yes. The owner asked to debug and fix the AskRigor failures exposed by this research.
- Existing pull request: none
- Supersedes: none

## What to do

Extend the exact-product community admission rule from page/video identity to **each admitted review or report**.

1. A review page whose title, URL, or product header matches the target is not enough. Before a review contributes benefit/no-effect/harm signal, check the review text itself for a contradictory manufacturer, brand, formulation, product, or condition.
2. If the report explicitly names a different manufacturer/product, exclude it from the target-product corpus and optionally retain it only in a clearly labeled generic-formula/other-variant corpus.
3. If the page pools generic-drug reviews across registered manufacturers and the individual review does not identify its exact manufacturer, mark the report `variant_unresolved`; do not attribute it to the page's displayed manufacturer.
4. Preserve two levels of community signal when useful:
   - `exact_product_signal`
   - `generic_formula_or_variant_unresolved_signal`
5. Require the exact-product corpus to pass this item-level identity check before manufacturer-specific prevalence/direction claims.

## Why

A current regression exposed that page-level identity can still contaminate the corpus. The 39 Health page labeled **Tianjin Lisheng Nan Bao** contains at least one visible user review whose text explicitly says the user was taking **Jilin Changhong** Nan Bao. Treating all reviews on that page as Lisheng-specific would therefore overstate manufacturer-specific signal.

This is the same class of failure as fuzzy video matching, but at a finer boundary: the page is correct while an individual evidence item is not. The fix must bind identity at the evidence-item level rather than trusting the container.

## Check first

- Reuse the product/offer identity machinery from the existing shopping and community modules.
- Do not discard useful generic-formula evidence; downgrade and relabel it instead.
- Regression:
  1. Target = Tianjin Lisheng Nan Bao.
  2. Review page header = Tianjin Lisheng.
  3. One review text says it used Jilin Changhong Nan Bao.
  4. Expected: that review is excluded from the Lisheng-specific corpus and marked as another-variant evidence.
- Combine this with the existing 2026-10-07 whole-intervention / exact-product identity suggestion rather than creating a parallel identity system.
