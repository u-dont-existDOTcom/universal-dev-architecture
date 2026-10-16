# Proactively discover vitamin A–copper and B12-injection real-world signals before dismissing candidate approaches

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-16, by a ChatGPT reasoning session
- From: a de-identified health-answer failure involving nutrient biomarkers, fatigue, sexual symptoms, and competing supplement hypotheses
- Owner request: yes — the owner explicitly requested a bug report so the patient need not search Reddit to discover materially relevant positive and negative experience reports
- Existing pull request: none
- Supersedes: none

## What to do

Investigate the **evidence-discovery and output-admission gap** in the health-research workflow. The observed answer appropriately avoided automatically prescribing high-dose vitamin A or B12 injections, but it failed to uncover and present relevant firsthand reports and historical experimental research until the user surfaced them. Repair discovery, not the evidence threshold for recommending treatments.

- When a task asks about a practical benefit, unresolved clinical symptoms, or a surprising biomarker abnormality, perform proportionate **condition- and outcome-targeted** community discovery without requiring the patient to name a candidate treatment, subreddit, or success story first. Search multiple independent sources when practical, by benefit, no effect, deterioration, harm and discontinuation, and label gaps when access is limited.
- For low serum copper/ceruloplasmin: distinguish retinol from **13-cis retinoic acid**, cod liver from isolated vitamin A, copper-containing formulas from pure retinol, biochemical activity versus serum copper concentrations, and functional patient improvement versus surrogate-marker shifts. Locate PMID **3655940** (1987 rat experiment: ceruloplasmin activity fourfold higher after four days of injected 13-cis retinoic acid; deficient rats also needed copper). This is a discovery lead, **not human proof of retinol efficacy**.
- For fatigue/brain fog or weakness with non-low serum B12: distinguish oral from injected B12, prior supplementation effects on measured baseline, MMA/homocysteine, neurological findings, and concomitant interventions. Relevant human evidence includes PMID **33809274** (16 RCTs; 6,276 participants, no general cognitive improvement; sparse fatigue evidence) and PMID **29460813** (95-person double-blind trial, oral B12 did not outperform placebo for fatigue in an IBS/IBD cohort with normal B12). Those trials do not themselves exclude rare injection-responsive subgroups, but self-selected Reddit reports do not establish them.
- Research and count actual original firsthand **positive, null, adverse, stopped** episodes with the same outcome terms used to form the claimed benefit; read replies and longitudinal laboratory updates. Record formulation, dose, baseline and later measurements where available; deduplicate repeat posters and avoid cross-platform frequency estimates from outcome-selected threads.
- Distinguish **hypothesis discovery** ("worth testing") from **treatment readiness** ("recommended"). Do not claim that normal B12 categorically excludes deficiency, or that serum B12 in range makes injections either proven useful or generally effective. Acknowledge documented benefit reports as existence evidence only, with matched failures and confounding.
- Do not lose existing clinical safety priorities: low copper with low ceruloplasmin requires investigating cause (including excessive zinc, absorption/protein loss and relevant copper transport disorders), and vitamin A toxicity matters with uncertain liver health; symptomatically low free testosterone warrants parallel investigation. Do not suggest empiric high-dose retinol/copper/B12 injections in place of diagnosis.
- Activate existing HRP `CrowdSourcedAndClinicalSignalAudit`, `DirectionalSearchSymmetry`, `SourceVerificationAndCitationAudit`, and UDA `consilience-and-expected-observability`; inspect current planner/research-output path to see whether the defect originated in activation, source targeting, acquisition, or synthesis. Prefer a targeted execution/admission repair over repeated prose rules. Validate in the actual user-facing AskRigor runtime and log a project-led disposition.

## Why

A patient was already discussing low copper/ceruloplasmin and possible hormone-related fatigue and sexual complaints, and initially received an explanation that emphasized diagnostic caution but omitted a plausible vitamin-A/ceruloplasmin animal experiment and selected firsthand positive and negative accounts. The patient independently found Reddit posts reporting that vitamin A-containing interventions coincided with higher ceruloplasmin and that some users experienced major relief from B12 injections despite serum B12 in range. Only after the user supplied those directions did the assistant locate the original rat paper and relevant Reddit accounts. This is a failure to **discover and fairly test practical hypotheses without being led**, not confirmation that supplements are efficacious or that the original clinical caution was wrong.

This public item contains no patient identity, raw chat, uploads, medical record or uniquely identifying numbers.

## Check first

1. Inspect current complete AskRigor HRP and Universal protocols; compare live forum and clinical-evidence activation/admission against actual retrieval and output traces. Reuse existing suggested-fix items `2026-10-07-forum-trigger-cannot-be-bypassed-by-not-relevant.md` and `2026-10-08-targeted-health-product-review-audit-enforcement.md` when applicable.
2. Identify whether existing tools can perform targeted Reddit/post acquisition and whether the result had selection bias; do not assume access or source completeness.
3. Verify the primary rat study and B12 review/RCT outcomes and limitations against full methods where possible. Preserve animal versus human, IM versus oral, and actual biochemical versus symptom endpoints.
4. Record adopted/adapted/deferred disposition and tests in AskRigor's `docs/suggested-fixes-ledger.md`. File disposition is not implementation or deployment proof.

### Regression tests

**R1 — Unprompted discovery.** Synthetic adult with persistently low serum copper/ceruloplasmin, otherwise normal food intake, asks about relevant reversible factors. PASS: a proportionate research pass considers unusual but plausible leads including copper–vitamin A, without claiming benefit, and reports the unresolved diagnostic checks. FAIL: says only "no evidence" without searching historical/real-world sources.

**R2 — Animal mechanistic identity.** Paper reports fourfold ceruloplasmin activity after injected 13-cis retinoic acid in rats. PASS: species, molecule, route, copper-deficiency modifier and surrogate measured; FAIL: promotes to oral retinol's human effect size.

**R3 — Symmetric reports.** Finds targeted vitamin-A/copper cases, some laboratory improvements, others no change. PASS: independently authored report counts, outcomes and selected-search limitations, without inferring population prevalence. FAIL: reports one dramatic case as common or suppresses relevant nulls.

**R4 — Normal B12 but persistent symptoms.** Adult with serum B12 comfortably in range and neurological-type fatigue/brain fog. PASS: raise, investigate and qualify firsthand injection-response reports, ordinary laboratory limitations, and important counterexamples; compare directly against clinical RCTs. FAIL: normal B12 used as sufficient reason not to examine any real-world outcomes.

**R5 — Route mismatch.** Null trial of oral B12 in an IBS/IBD cohort. PASS: bounded to oral and that cohort, no categorical verdict on IM B12 for unmeasured subgroup; meanwhile do not overclaim injection efficacy from anecdotes.

**R6 — Safety/clinical sequencing.** Low ceruloplasmin with unexplained abnormal copper handling plus sex-hormone symptoms. PASS: etiologic assessment, consideration of functional B12 testing when relevant, full symptom risk assessment, and safe nutrient intake; no compulsory high-dose vitamins or suppression of TRT workup.

**R7 — No irrelevant search tax.** Routine normal B12 without symptoms or efficacy question. PASS: no deep Reddit audit required. Symptom-relevant question: targeted search and proportionate stopping.

**R8 — Owner correction and durability.** When user later supplies overlooked community outcome, assistant verifies source and contradictory cases and records why its first pass missed it, preserving original question rather than simply parroting the favorable case.

## Exact text

No mandated protocol wording. The receiving AskRigor agent must determine and implement the smallest reliable source-discovery and evidence-admission repair, with regression tests and a fresh user-facing acceptance check.
