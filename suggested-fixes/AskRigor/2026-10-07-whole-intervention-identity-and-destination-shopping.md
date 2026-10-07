# Promote whole-study interventions, enforce exact product identity, and bind shopping to destination

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-07, by the ChatGPT research-supervisor session using AskRigor
- From: owner correction during a male-vitality botanical research task on 2026-10-07
- Owner request: yes. The owner asked to debug why AskRigor did not investigate the named Ayurvedic formula until challenged, and objected to an India-only retailer being surfaced when international purchase was required.
- Existing pull request: none
- Supersedes: none

## What to do

Add three linked controls to AskRigor's research + shopping path.

1. **Whole-intervention promotion after a large practical signal.** When a study reports a materially large/surprising effect for a multi-ingredient intervention, do not treat it only as evidence for the ingredients. Promote the exact intervention arm itself into the candidate ledger and require identity resolution before synthesis can call the ingredient search complete. Resolve, where available: study label → registry code/name → sponsor/manufacturer → patent/formulation → current commercial descendant → material formula differences. Keep the exact formulation as its own evidence object; component evidence remains separate.

2. **Exact-product community admission.** Community/forum/video discovery for a named commercial product must pass a product-identity gate before its comments or outcomes are admitted. Require at least the exact product name plus compatible brand/manufacturer identity, or an explicit documented alias. Fuzzy lexical similarity, sibling products from the same brand, or look-alike names must be rejected. Regression from this task: a query for SAVA Herbals MUSSK admitted a SAVA Livstar video and an unrelated MUUCHSTAC face-wash video. Those should never enter the product's community corpus.

3. **Destination-bound shopping recommendation.** When the user needs to buy a product outside its domestic market, bind every owner-facing buy candidate to the destination and live offer state. A domestic-only retailer may be used for identity, label, reviews, or price context, but must not be phrased as a buy option unless its route to the destination is verified. If the domestic path fails, continue automatically through international storefronts/marketplaces, exporters and specialist Ayurvedic/TCM sellers, secondary marketplaces where appropriate, and only then report a bounded no-result. The offer state should distinguish `identity_only`, `domestic_orderable`, `international_storefront`, `destination_confirmed`, and `live_destination_orderable`.

4. **Cross-layer synthesis check.** Before finalizing a practical-effect ranking, explicitly ask whether a large study signal has the expected real-world observability for the exact commercial intervention. If public exposure is low, classify silence as underexposure rather than as strong negative evidence. If exposure is high and signal is absent, downgrade practical confidence.

5. **Pre-delivery mechanical fields.** Add blocking fields where applicable:
   - `whole_intervention_identity_resolved`
   - `community_exact_product_identity_pass`
   - `shopping_destination_bound`
   - `exact_offer_live_for_destination`
   Unknown values must block endorsement but not block non-shopping identity/context reporting.

## Why

The task exposed two distinct generating failures.

First, AskRigor found a positive randomized trial of an eight-herb Ayurvedic formulation but initially used it mainly to raise interest in three individual herbs. It did not investigate the intervention itself until challenged. A later identity trace showed that the trial product had a registry identity, SHL 1046, and a close current commercial descendant, SAVA Herbals MUSSK. This was decision-relevant and should have been discovered during the first pass.

Second, product-community discovery was not identity-safe: an exact MUSSK query admitted unrelated videos. That can corrupt benefit/no-effect/harm synthesis even if the final analyst notices some mismatches manually.

Third, an India-only retailer page was surfaced in a shopping context for a user outside India. The existing shopping rules already say destination and live orderability matter, but this task shows the rule was not mechanically enforced at the research-to-recommendation boundary.

These failures map to UDA LF-3.4/LF-3.9 (candidate coverage and expected observability), LF-5.4 (recommendation before deciding facts), LF-6.1/LF-7.3 (execution/receipt not matching the rule), and LF-9.4 (partial check presented too broadly).

## Check first

- Read the current `shopping_research`, `recommendation_preflight_integrity_gate`, community/forum modules, treatment-landscape candidate ledger, and any existing intervention-identity or source-entity normalization rules before adding new schema.
- Reuse existing candidate-state and identity machinery rather than creating a parallel shopping state system.
- Preserve component-level evidence: promoting the whole intervention must not imply that any one ingredient caused the effect.
- Do not require commercial lineage resolution for every ordinary trial; trigger it when the exact intervention could itself be a practical candidate or when the effect is large/surprising enough that the commercial identity would change actionability.
- Keep destination/orderability checks separate from medical efficacy. A product may be scientifically interesting but not recommendable as a buy option.
- Regression cases:
  1. A study of an unnamed or coded multi-herb formula shows a large testosterone/sexual-function effect. The system must search the trial registry/sponsor/formulation lineage and surface the current exact/near-match product if one exists before ranking individual ingredients.
  2. Query `SAVA Herbals MUSSK review`. A SAVA Livstar video and MUUCHSTAC face wash must be rejected before community synthesis.
  3. User outside India asks where to buy MUSSK. An India-only 1mg/PharmEasy page may be cited as identity/context, but cannot be presented as a buy option; search must continue to a destination-bound live route or a bounded no-result.
  4. A commercial product has almost no reviews because it has tiny exposure. The system must label the silence as underexposure, not as strong evidence of no effect.
