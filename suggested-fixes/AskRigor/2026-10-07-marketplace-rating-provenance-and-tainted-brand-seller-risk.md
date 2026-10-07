# Distinguish marketplace seller reputation from product evidence and escalate tainted-brand seller risk

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-07, by the ChatGPT research-supervisor session using AskRigor
- From: owner correction during SAVA MUSSK international-sourcing research
- Owner request: yes. The owner flagged IndiaMART/BR. Herbals Health Garden as untrustworthy and asked that the problem be reported.
- Existing pull request: none
- Supersedes: none

## What to do

Strengthen shopping/recommendation admission for B2B marketplaces and high-risk supplement sellers.

1. **Separate seller-platform reputation from product reviews.**
   - A seller badge such as `4.2 (1356)`, TrustSEAL, response rate, years on platform, GST/IEC, or platform-verification status is seller/platform metadata.
   - It must never be represented as the rating or review count for the exact product.
   - Product-level evidence requires reviews tied to the exact product/variant.
   - If clicking a seller's rating exposes only a small, mixed set of comments across unrelated product categories, preserve that mismatch explicitly rather than treating the headline count as product confidence.

2. **Audit review-corpus relevance before using marketplace reputation.**
   - Record how many displayed comments are actually visible and what they concern.
   - Exclude delivery-only, communication-only, price-dispute, unrelated-product, or empty comments from product-efficacy signal.
   - Preserve seller-service complaints separately because they remain decision-relevant for transaction risk.

3. **High-risk supplement-seller escalation.**
   - For sellers of sexual-enhancement/bodybuilding products, inspect whether the catalog includes brands/products with regulator-documented hidden-drug history, counterfeit/adulteration history, prescription-only actives, or implausible 'herbal/natural' positioning.
   - A regulator warning tied to the same brand name is a **seller/provenance red flag**, not proof that every current item or lot from that seller contains the same adulterant.
   - Before recommending another supplement from such a seller, require stronger exact-product provenance: manufacturer identity, sealed packaging/batch, authorized supply chain where available, current expiry, and destination-valid transaction protection.

4. **Marketplace professionalism is not a binary trust label.**
   - Poor communication, nonresponse, delivery failures, pricing mismatches, deleted seller messages, or product-category chaos should lower seller confidence and may block a recommendation when safer equivalent channels exist.
   - Do not let a platform trust badge mechanically override contradictory firsthand seller feedback.

5. **B2B exporter route language.**
   - `in stock` + Import Export Code + 'contact supplier' qualifies only as an exporter lead.
   - It does not qualify as a verified consumer buy option without exact destination quote/order path, seller risk review, and product provenance.

## Why

### Evidence from the current regression

The BR. Herbals Health Garden IndiaMART page presented:
- seller-level `4.2 (1356)`, TrustSEAL, payment-protection and response-rate metadata;
- the exact SAVA MUSSK listing marked `In Stock`;
- a large catalog spanning supplements, sexual-wellness devices, testosterone gel, prescription/grey-market style products and 'herbal male enhancement' products.

The owner opened the seller's review comments and found only a much smaller visible corpus spanning unrelated products, including:
- nonresponse / phone not picked up;
- delivery not received;
- rude/ill-mannered service;
- major displayed-price versus quoted-price discrepancy;
- a report that seller messages/demo material were deleted after the buyer declined;
- many generic one-word reviews on unrelated products.

This does not mathematically prove the headline `1356` count is false; it proves that the visible comment corpus is not an exact-product review corpus and cannot support MUSSK quality/efficacy.

The seller also lists Vimax-branded male-enhancement products. The U.S. FDA has a public notification that a product sold as **Vimax** for sexual enhancement contained undeclared tadalafil (2014 notice, updated 2015). This is enough to trigger provenance escalation for a seller marketing Vimax-branded 'herbal/natural' male-enhancement inventory, but it is **not** enough to claim the seller's exact current Vimax SKU or every Vimax lot contains tadalafil without exact identity/lot confirmation.

## Check first

### Regression

Given:
- target product = SAVA Herbals MUSSK;
- seller page = BR. Herbals Health Garden on IndiaMART;
- platform shows `4.2 (1356)`;
- visible text reviews are sparse, cross-product and include service complaints;
- seller catalog includes Vimax-branded sexual-enhancement products;
- FDA has documented hidden tadalafil in a Vimax sexual-enhancement product;

Expected:
1. Do **not** write `MUSSK has 4.2/5 from 1,356 reviews`.
2. Record `seller aggregate/platform reputation only; exact-product review signal unavailable`.
3. Apply seller-risk escalation.
4. Classify the IndiaMART listing as `exporter lead / destination-unconfirmed`, not a recommended consumer buy option.
5. Search safer international channels before surfacing this seller as a preferred route.
