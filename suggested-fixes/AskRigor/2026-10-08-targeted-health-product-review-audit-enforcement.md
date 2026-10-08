# Enforce outcome-targeted health product review audits, not first-page previews

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-08, by ChatGPT reasoning chat investigating an AskRigor-assisted health research failure
- From: deidentified owner correction on 2026-10-08, following a public supplement/recovery evidence review
- Owner request: yes — "debug the lack of targeted review checking and send the bug report to askrigor"
- Existing pull request: none
- Supersedes: none

## What to do

Fix the **failure to execute and enforce an already-existing outcome-directed retail-review research requirement**. Do not start by adding redundant general prose to the protocol. Inspect the current research planner, acquisition implementation, answer synthesis, and `finalize_research` admission/telemetry. Make the smallest enforceable change that ensures an accessible large review corpus cannot be presented as adequately investigated for a specific treatment outcome when the caller read only a few default-ranked reviews and never searched relevant review text.

1. For efficacy/health-outcome questions about purchasable products, distinguish **two complementary review lanes**:
   - **Targeted signal discovery:** search review text for the exact indication and clinical endpoint, plus ordinary-user synonyms, positive, null, worsening and adverse variants. Open full matching reviews and relevant follow-ups, not snippets or only platform summaries.
   - **Outcome-neutral direction sampling:** when making claims about the frequency or direction of reports, use a declared sample frame not selected by favorable/negative outcome (e.g., all condition-mention reviews, chronological/random/rating-stratified), with actual counts and selection method. Targeted keyword hits alone cannot yield prevalence. A first page sorted by default/helpfulness does not represent 65,000 reviews.
2. Keep four denominators distinct: displayed **star ratings**, written reviews, reviews searched/retrieved, and independent firsthand treatment episodes that match the indication; preserve observed/retrieved/inspected and missing counts as unknown, never zero.
3. Require an **endpoint-matching test**: liver enzymes or digestive comfort are not evidence of biopsy-confirmed fibrosis reversal; FibroScan stiffness change can reflect inflammation; assess baseline and follow-up outcomes, diagnostic certainty and concurrent abstinence/diet/medications. Tag low-specificity proxies explicitly.
4. Keep **product identity** exact: brand, strength, extract/formulation and co-ingredients (e.g., a milk thistle product also containing artichoke/dandelion); do not attribute a combination product's reviews to isolated silymarin or transport across formulations without a reason.
5. On review platforms, activate existing critical `DirectionalSearchSymmetry`: query the condition/outcome words across available languages, and search benefit, no effect, deterioration, adverse events and discontinuation; inspect low-, middle- and high-rated reviews rather than only the platform default first page.
6. If a site restricts page depth, search or pagination, attempt authorized available review-data acquisition before stopping; then declare the corpus **partial / inaccessible** and identify the absent targeted outcome search. Never substitute Reddit/YouTube for a dominant retail corpus while calling that corpus audited.
7. Add a **pre-synthesis/admission check** bound to what was actually retrieved: a narrative saying "10 default first-page reviews; no outcome-target search" must NOT satisfy a claimed treatment-specific product review audit. It can still support a clearly labeled, narrow preview or an access-boundary result. Ensure any requested completion fields and messages are exposed in the live tool schema and satisfiable, consistent with the earlier finalizer-schema bug report.
8. Do not create a rigid minimum of 100, 500, etc. reviews: stopping is determined by target, access, sampling frame, saturation/decision impact and uncertainty. The critical failure is **selection and missing targeted investigation**, not the arbitrary number ten.

**Scope:** this is an implementation/admission bug. The current HRP already has the relevant requirements. The AskRigor worker owns where to enforce them and should avoid changing stable clinical/critical research behavior unrelated to buyer reviews.

## Why

### Reproduced behavior (public-safe, deidentified)

- User asked which interventions most credibly help reverse alcohol-associated liver damage, specifically requesting firsthand **forum signal** and comparison against clinical evidence.
- One prominent purchasable supplement led the analysis to iHerb, whose page displayed approximately **65,000 ratings** (not necessarily 65,000 written reviews).
- The assistant read **10 written reviews from the default first page**. The selection was **not randomized** and was **not an indication-/outcome-specific text search**.
- It did not search the review corpus for `cirrhosis`, `fibrosis`, `FibroScan`, `liver stiffness`, `reversal`, `ALT`, `AST`, `bilirubin`, `liver enzymes`, or negative/outcome-failure variants; it did not sample lower-/middle-rated reviews or systematically identify null and adverse outcomes.
- It nevertheless included this as a product-review evidence paragraph in an intervention comparison; the user subsequently discovered the coverage gap and asked how reviews were selected. The assistant acknowledged the method after being challenged.
- A clear disclosure that ten reviews were unrepresentative is necessary but not sufficient: **the authorized task was a relevant forum/review investigation**, not merely a transparent convenience preview. Do not conflate this with a product recommendation requiring purchase checkout.

### Existing canonical requirement — likely enforcement lapse, not absent instruction

HRP `20.6.11`, `CrowdSourcedAndClinicalSignalAudit`:
- `PrincipalPlatformMapping`: "A large relevant review corpus is a principal community."
- `ReviewCorpusSelectionAndCounts`: top-ranked reviews are *discovery*, not evidence of prevalence; distinguish written-review count, inspected count and selection.
- `DirectionalSearchSymmetry`: **"On review platforms, search the review text the same way ... using the condition's and outcome's everyday words ... and read low-, middle-, and high-rated reviews rather than only those ranked first."**
- `ClosedPlatformAndAccessDisclosure`: first-page-only availability means partial corpus, and available authorized review-data tools should be checked.

Root-cause classification to test: **execution/activation and synthesis-admission gap** between a critical protocol rule and live retrieval behavior. Determine whether the current finalizer relies on self-declared `review_corpora` counts without checking outcome-query provenance; whether the planner erroneously treats default-page selection as a finished product-review lane; or whether page/search access genuinely failed and the limitation wasn't propagated. These are hypotheses until the AskRigor worker inspects the exact logs and implementation; do not assert an unverified server bug.

The user explicitly requested this debug and delivery to AskRigor's development lane, rather than having to relay instructions manually.

## Check first

1. Current full `protocols/HRP_Full.xml` (especially `CrowdSourcedAndClinicalSignalAudit`, `ReviewCorpusSelectionAndCounts`, `DirectionalSearchSymmetry`, `ClosedPlatformAndAccessDisclosure`, `CommunityCorpusCompletionGate`) and corresponding `project/FORUM_SIGNAL_MODULE.md`.
2. `finalize_research` current server validator, exposed MCP schema, and any `commercial_review_applicability` / `community_searches[].review_corpora` fields. Avoid recreating the schema drift already reported in `suggested-fixes/AskRigor/2026-10-07-finalizer-must-not-require-unexposed-schema-fields.md`.
3. Product-review retrieval routes actually available to the ChatGPT/AskRigor session, including iHerb search/filter/pagination restrictions and any authorized web-data provider. Distinguish unavailable acquisition from unattempted acquisition.
4. Existing tests for product reviews, retail buyer review mapping, matching objective clinical outcomes, source selection, and incomplete-access output. Reuse before inventing a new subsystem.
5. Current AskRigor suggested-fixes ledger: record this item's adoption/adaptation/deferral and the test or implementation evidence. Report unresolved source-access boundaries instead of claiming product research is solved.

### Regression tests

**R1 — first-page failure:** Input: "For alcohol-related liver fibrosis reversal, check clinical evidence, communities and milk-thistle buyer reviews." Stub a review product displaying 65,000 star ratings, 40,000 written reviews, and 10 default-ranked first-page reviews about energy, packaging and digestion. No endpoint search is performed. Expected: result cannot claim the target-specific buyer-review audit is complete or derive a direction/frequency; continue outcome-targeted acquisition if available, otherwise label a partial preview. FAIL if ten reviews are admitted as an adequate matching treatment-efficacy check.

**R2 — successful bidirectional target audit:** With accessible review-text search, run affirmative, null, harm and discontinuation queries including `fibrosis/cirrhosis/FibroScan/ALT/AST/liver enzymes` and everyday synonyms; inspect returned whole reviews and contrast with a declared outcome-neutral sampling frame. Verify exact query names, sample selection, counts, endpoint type, combinations and time horizon are reflected in the reported coverage. PASS even if no clinically credible outcomes appear; do not invent hits.

**R3 — ascertainment and denominator:** Platform has 65,000 *ratings* but only 12,000 written reviews. Expected: separate denominators; no "N out of 65,000 reviews" claim; no response-rate inference from keyword-targeted hits.

**R4 — objective outcome / formulation mismatch:** One positive review says "digestion improved" on a multi-ingredient formula; one says "liver enzymes improved after quitting alcohol." Expected: neither counts as independent verified reversal of fibrosis nor isolated silymarin effectiveness.

**R5 — real access boundary:** Only 10 reviews visible, text search genuinely blocked and authorized alternate data route not available. Expected: preserve useful limited observations, mark targeted reviewer signal unmeasured/inaccessible, and allow a bounded medical answer with candid limitation; no mandatory impossible field.

**R6 — ongoing regression gate:** Trigger in both brief first-pass and deep HRP paths, and in a fresh connector session after deployment. Exercise the live tool contract as well as deterministic mocks. A disclosure of small `reviews_read` must not make the targeted-outcome search requirement silently optional.

## Exact text

No prescribed protocol wording; current authoritative HRP already states the rule. Prefer a small execution/admission repair with tests and preserve exact protocol bytes unless the AskRigor worker demonstrates a genuine semantic gap.
