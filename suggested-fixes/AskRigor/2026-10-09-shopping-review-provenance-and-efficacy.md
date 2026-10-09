# Distinguish review authenticity, accessibility, and product effectiveness

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-09, by the ChatGPT research assistant
- From: owner-requested shopping-review research feedback, generalized from an e-commerce supplement review audit (no private chat data)
- Owner request: yes — the owner asked that the shopping lesson be sent to AskRigor on 2026-10-09
- Existing pull request: none
- Supersedes: none

## What to do

Evaluate a small, specific extension to AskRigor's **existing** Universal `shopping_research` section, especially §§6–7, and coordinate any health/supplement implications with HRP's `CrowdSourcedAndClinicalSignalAudit`. Avoid copying the shopping module again or adding a parallel review policy.

1. **Separate three questions:** (a) whether a merchant's testimonial and rating presentation is independently auditable; (b) whether each visible review reflects a genuine customer's experience; and (c) whether the product causes the reported benefit. A negative answer to (a) does not establish a negative answer to (b), and neither directly settles (c).
2. **Check review provenance and the actual corpus:** distinguish merchant-curated text, embedded/static testimonials, independent platform accounts, syndication/imports, email-verified reviewer, order-verified purchaser, incentivized posts, and unknown status. Report displayed rating/review totals separately from the number of actual review texts retrieved and the selection method. If "load more" or a public API fails or returns zero despite a populated initial widget, reproduce/report the access boundary where feasible; do not call unretrieved reviews fabricated or extrapolate from the handful exposed.
3. **Reconcile channels before judging mismatches:** check whether one platform imports/syndicates from another, its order-ID eligibility rules, the seller's historical product IDs, and whether old testimonials were migrated. Different totals, absent cross-platform duplicates, or reviews older than a current listing's creation can have benign explanations; keep authenticity unresolved until better evidence. Conversely, do not treat high average ratings, email-only badges, opaque moderation, or generic praise as independent validation.
4. **Preserve potentially real beneficial signals:** distinguish content-free praise ("great", five stars), specific firsthand symptoms/function with duration and co-exposures, repeatable stop/restart (dechallenge/rechallenge) reports, objectively verified outcomes, no-effect/harm reports, and conflicting outcomes. Search positive *and* negative reports. Credible detailed improvements can raise the probability of benefit in a subgroup even if the merchant's review practice is suspect; they do not determine its prevalence or causal effect, and controlled human evidence retains its role.
5. **Handle suspicion proportionately:** AI-writing detection and promotional tone are investigation clues, not proof a person or review is fictional. A messy or manipulative marketing operation and an effective ingredient are compatible hypotheses. State what would discriminate fake testimonials, selective display, and genuinely varied user response, without declaring fraud absent primary evidence.

## Why

An audit can find older seller-hosted five-star testimonials, an unresponsive review API, uncertain purchase verification, and a separate purchaser platform with many brief praise ratings plus some specific, credible-seeming benefit and no-effect reports. Two opposite errors are tempting: treating uninspectable testimonials as proven fabrications and writing off all product efficacy, or treating a high purchaser-platform star average as evidence of clinical effectiveness. Current AskRigor shopping rules already require critical reviews, provenance and caution about AI detectors; the missing task-time discriminator is to explicitly **untangle the review source's reliability from the existence and strength of the product's actual response signal**.

## Check first

- Current Universal `shopping_research` v0.3 (§§6–7) already says seller-controlled silence is weak reassurance, copies are not independent, and badges/AI detectors do not certify authenticity. Add only the specific missing distinctions and a targeted regression; preserve the existing canonical module.
- HRP `CrowdSourcedAndClinicalSignalAudit` already requires exact-product versus ingredient cohorts, neutral review sampling and directional reports. Extend neither with a fabricated proportion from a selected review subset.
- Check the AskRigor suggested-fixes ledger: the 2026-09-30 shopping module was already adopted and released. Record adopt/adapt/decline/defer in that ledger and follow existing protocol release/owner-review authority.
- Do not automatically turn this suggestion into a new blocking requirement or imply a platform API failure proves content fraud; use proportionate source confidence and explicit access-state labeling.

## Exact text (suggested compact rule)

> When a merchant website and buyer-review platform disagree, AskRigor should first separate **review provenance, review accessibility, purchase verification, and clinical/product efficacy**. It should compare displayed counts with actual retrieved text, investigate imports/syndication and eligibility before interpreting missing overlap, and treat inaccessible or promotional testimonials as uncertain rather than necessarily fake. It should weigh specific, sustained positive, no-effect, and adverse firsthand experiences by their information content and confounding, not merely by star averages. A commercially questionable review presentation can coexist with genuine benefits; neither automatically proves nor disproves efficacy.

## Synthetic regression

A hypothetical wellness supplement's merchant widget advertises 600 reviews, displays five older five-star, email-verified testimonials, and returns an empty array when asked for the other 595. A buyer app separately shows 490 ratings with generic five-star praise, a few detailed three-week improvements, and some explicit nonresponse. The older merchant comments do not appear on the buyer app, which excludes CSV imports without linked order IDs. **Pass:** explain the incomplete corpus and distinct verification criteria, avoid fraud allegations based only on nonoverlap/API failure, preserve both detailed positive and negative buyer experiences as low-certainty real-world signals, and withhold any claimed buyer benefit percentage or causal efficacy conclusion. **Fail:** label all merchant reviews fake from the mismatch, ignore detailed positive purchaser reports, add the two review totals as independent customers, or claim the rating proves the supplement works.
