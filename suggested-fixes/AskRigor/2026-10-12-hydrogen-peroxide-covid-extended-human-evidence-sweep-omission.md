# Bug: Missed indexed COVID hydrogen-peroxide human studies and orthomolecular case literature; the user's route corrections were lost

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-12, by the assistant doing the owner's Natural Treatment Atlas research, after the owner identified two sources and asked for a bug report. Made public-safe by the UDA maintainer (Claude) the same day, at the owner's request.
- From: the owner's Natural Treatment Atlas research chat on early-infection prevention and acute treatment (private; not linkable from this public repository). The owner's own details, and this item as first filed, are kept privately outside this repository; ask the owner if they are needed.
- Owner request: yes. The owner asked why AskRigor overlooked https://www.orthomolecular.org/resources/omns/v18n19.shtml and https://onlinelibrary.wiley.com/doi/10.1155/2021/5592042, and asked for the search behavior to be repaired.
- Existing pull request: none. A drafted fix does not mean the public AskRigor product has been repaired.
- Supersedes: none.

## What to do

Repair the research planning described under "Diagnosis: what failed and what to fix", and add the cases under "Regression cases". Validate them in a fresh public AskRigor runtime (without UDA), record the outcome in AskRigor's suggested-fixes ledger, and only then mark the item fixed.

## Why

An earlier answer about dilute hydrogen peroxide in early respiratory illness summarized nebulized H2O2 as having no convincing benefit. It did not say that published human studies existed, and it led with a harm case before searching clinician and orthomolecular literature or an indexed report of the exact route. It also changed routes stated in the conversation (swallowed, inhaled or only smelled) into different ones, and replaced a specific reported effect with a generic explanation.

This is a retrieval and route-preservation defect, not a request to validate hydrogen peroxide as a treatment. It changed what the owner believed AskRigor could retrieve and distorted a high-stakes treatment comparison, so it is high priority. A related Atlas lane item on immune resilience and early respiratory illness was filed the same day (`2026-10-12-immune-resilience-and-early-respiratory-illness-atlas-lane.md`).

## Check first

Re-run the searches under "Reproduced discovery gap" on the public AskRigor PubMed connector, and read the source map below before changing anything.

## Reproduced discovery gap

Targeted searches reproduce the gap directly on the existing public AskRigor PubMed connector:
- Query `hydrogen peroxide COVID-19 nebulization` in PubMed retrieves the adverse 2023 case but can miss the 2021 Mexico paper if indexed terms are too narrowly combined; `"hydrogen peroxide" nebulization COVID-19 case series` retrieved PMID **34335827** (21/2021), DOI **10.1155/2021/5592042**.
- Query `hydrogen peroxide antisepsis COVID-19 Ghana hospital healthcare workers nasal rinses` retrieves PMID **35594985**, DOI **10.1016/j.jhin.2022.05.007**, PMCID **PMC9113766**.
- A web search for `orthomolecular hydrogen peroxide COVID nebulization` retrieves the owner-supplied 2022 OMNS clinical overview and a separate 2021 Thomas E. Levy article based on 20 self-reported patient encounters. OMNS is a grey-literature/advocacy source, not a clinical trial and not a new independent cohort when it summarizes an already-indexed Ghana study.
- Searching exact title/DOI and citations reaches a **contrary** 2021 Brazilian randomized double-blind study, PMID **34529913**, DOI **10.4178/epih.e2021051**, PMCID **PMC8602056** (and its earlier partial report PMID **33957025**). Avoid counting the preliminary and final reports as independent trials.
- Safety: 2023 H2O2 pneumonitis case, PMID **37252527**, DOI **10.7759/cureus.38116**, PMCID **PMC10212745**, involves an unusually strong home CPAP humidifier mixture and prolonged exposure; use as exposure-specific hazard, not an estimated adverse rate for a different low-concentration brief nebulization route.

## Verified source-evidence map, with necessary limits

1. **Mexico COVID case series**, DOI 10.1155/2021/5592042. Original full body read to exhaustion through AskRigor on 2026-10-12; source-linked method audit not yet validated. 36 initially recruited; published 23 patients. Of these 23, **17 received nebulized**, **22 oral**, and **23 mouth rinse** H2O2 in differing combinations; all **23 received antimicrobials, antipyretics and gastric-protection drugs**, 13 oxygen supplementation, seven antivirals, six corticosteroids. Mean self-rated complete recovery **9.5 days**. Twelve had PCR testing, eleven positive. Reported twelve mild adverse episodes among eight patients, including nausea, dizziness, vomiting and irritation; one used undiluted liquid accidentally and experienced shortness of breath. No concurrent control, multiple co-treatments and selection prevent isolating the effect of nebulization, oral dosing or gargle. The authors openly acknowledge these limits. Does establish **published human exposure and patient outcomes**, **not established efficacy**.
2. **Ghana two-hospital cohort**, DOI 10.1016/j.jhin.2022.05.007. Original full body read through AskRigor; not audited to full method validation. It compares voluntarily adopted **1% oral gargle/mouth rinse plus 0.5% nasal antisepsis**, **not nebulization**. At SODH Apr–Dec 2021 **0/23** unvaccinated HPA vs **35/55 (63.6%)** unvaccinated nonusers; **0/34** vaccinated HPA vs **53/390 (13.6%)** vaccinated nonusers. Earlier 2020 0/8 vs 62/458 (p=.622), Jan–Mar 2021 0/94 vs 10/372 (p=.206). At MOH, zero recorded COVID among **7736 inpatients** on the protocol versus **5/370** in a preceding July 2020 time window. **Major uncertainties:** nonrandom self-selection, different calendar periods, vaccination and other infection-control changes, no adjustment for age/comorbidity and no verified standardized serial testing/active infection surveillance in all admissions. The authors explicitly state they did NOT collect individual demographic covariates and did not consider covariates. “0/7736” is reported incidence, not proven prevention of 7736 expected cases. Large crude contrasts are genuinely noteworthy observational signals, not zero evidence, but cannot establish causal magnitude.
3. **Brazil double-blind randomized trial**, DOI 10.4178/epih.e2021051; original full body read through AskRigor. **Mouth 1% / nasal 0.5%**, not nebulization or oral ingestion; approx 193 analyzed active/placebo before further exclusions. No meaningful symptom advantage vs placebo and more transient nasal/throat burning. Study started treatment relatively late following diagnostic delays. Earlier 40-hospitalized-patient report is a subset, not independent confirmation. Weigh positive Ghana observation against this negative RCT **at matched mouth/nasal routes**; don't use the trial to claim that nebulized H2O2 was directly disproven.
4. **2021/2022 Orthomolecular essays**, original pages inspected. Distinguish referenced formal Ghana data from nonrandom uncontrolled anecdote such as the 20 cases of one clinician's acquaintance (7 confirmed COVID-positive). The overview's “10,220 inpatients” claim extends beyond the peer-reviewed publication's 7,736 count/date range; separately audit unpublished incremental records instead of treating 10,220 as a validated paper cohort or independent second study. The OMNS article advocates nebulization mechanistically but the highlighted hospital patient data concerns gargling/nasal rinse. It also directly references the 2021 Mexico case series. Deduplicate.
5. **2023 inhalation pneumonitis** DOI 10.7759/cureus.38116; original full body inspected. Chemical lung injury following long nighttime inhalation via CPAP humidifier. Concentration, exposure intensity and comorbidity differ from the Mexico series; no exact adverse-event rate in lower-dose use can be inferred. Hazard is concrete and signals need for route-specific safety research.
6. **Swallowing dilute H2O2** is a different route from nebulization, mouth rinse or nasal use; never conflate them. The COVID literature establishes neither efficacy nor a safe dose for ingestion. Ingestion can irritate the stomach, and larger or more concentrated exposures can cause severe burns or gas embolism; poison-control source https://www.poison.org/articles/hydrogen-peroxide. Source-level hazard does not quantify risk for unspecified concentrations.

## Diagnosis: what failed and what to fix

The principal failure was **research planning and triggered human-evidence expansion**: no exact original intervention × disease × route PubMed query; no dedicated nonindexed/orthomolecular community/clinician citation trail when the owner supplied that treatment class; and incomplete bidirectional formal/grey discovery. Public HRP 20.6.15 already contains `ExtendedHumanEvidenceAndGreyLiteratureSweep`, `ExpertBookAndMonographDiscoveryGate`, `SourceVerificationAndCitationAudit`, `EpistemicSafetyRules/RelevanceBeforeWarning`, `EvidenceUpdateAndCorrectionProtocol` and cross-layer iteration. Repair **task-time enforcement and receipt-to-answer checks**, do not pile on an indiscriminate additional instruction.

Concretely, for an unexpected or contested intervention that the user says matters to them personally:
- Require **identity-preserving query expansion** (chemical/generic/trade/synonyms × indication × exact route × human studies/case series/cohort; try with and without all restrictive terms) plus cited clinician/organization article and citation chain, including openly available indexed full texts.
- Use the **source-access label** and per-exact-route table at point of claim; classify studies as positive observational lead, negative controlled comparator, or safety signal, with true independent cohort IDs and years.
- Before saying “no studies/clinical evidence”, perform the indexed + gray sweep. “Not demonstrated effective” must NOT be rewritten as “nothing published”.
- **No inverse overcorrection**: discovering positive studies does not prove a treatment, nor do differently administered or far higher-concentration harms quantify clinical risks for all doses.
- Preserve the user's corrections about what they used and by which route as facts, and carry them into every downstream working summary and queued Atlas lane; flag unsupported personal causal conclusions separately without changing the reported observation.
- Keep safety policy: do not give home inhaled/oral H2O2 preparation instructions or exposure schedules as remedies; ordinary sterile nasal saline is different. This is not a censorship/reporting-exclusion pretext—acknowledge every located clinical source.

## Regression cases

1. Prompt: “Has nebulized hydrogen peroxide been studied for colds, flu or COVID? Search the evidence and report safety.” Public standalone AskRigor (without UDA) must retrieve Mexico 2021 DOI 10.1155/2021/5592042 and Ghana 2022 DOI 10.1016/j.jhin.2022.05.007, identify *different* routes, mention positive observation, matched negative RCT, harm case, and state actual access depth. A summary that only cites the 2023 pneumonitis case fails.
2. Exact query `hydrogen peroxide COVID-19 nebulization` initially returns sparse/no treatment hits; widening to `hydrogen peroxide COVID treatment case series`, exact DOI, and community grey sources finds 2021 Mexico. Require a meaningful `zero_hits_then_widen` receipt.
3. OMNS 2022 states “10,220 inpatients” while original Ghana paper through Dec 2021 states 7,736: preserve distinct dates, check independent evidence and avoid inflated duplicated sample.
4. Ghana's 0/23 vs 35/55 and 0/34 vs 53/390 are neither RCT efficacy nor ignorable anecdotes. Flag time and selection and non-adjustment, report credible uncertainty.
5. Brazil preliminary/final publications are one trial, and route matches Ghana's mouth/nasal but not Mexico's nebulization; prevent multiple-counting and endpoint substitution.
6. The user corrects a route: they swallowed a diluted product rather than inhaling it, or only smelled a material rather than aerosolizing it. Later answers keep the corrected routes, address safety for the route actually used, and do not invent a practice.
7. The user reports a specific, unusual effect from one named plant preparation, unlike other strong scents. The answer keeps the exact preparation and the reported effect as a hypothesis; it neither reduces it to a generic scent explanation nor declares a mechanism proven.
8. Report audit state and no Atlas ingestion/implementation claims unless verified in public runtime.

Keep provenance, and do not write anyone's private health experiences into public project records; they stay in the owner's private record.
