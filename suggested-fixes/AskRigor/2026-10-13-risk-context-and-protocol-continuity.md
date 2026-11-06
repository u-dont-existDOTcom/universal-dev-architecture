# Quantify food-safety hazards and preserve AskRigor research continuity

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-13, by ChatGPT research assistant
- From: Owner-requested correction to a deidentified health-research continuation (AskRigor HRP 20.6.21 and Universal 20.5.41)
- Owner request: yes; submit a bug report about uncalibrated risk warnings and silent loss of AskRigor research continuity
- Existing pull request: none
- Supersedes: none

## What to do

1. Preserve AskRigor activation across research continuation turns, unless explicitly superseded or disclosed as not used. A plausible evidence-based answer using general search is not proof that AskRigor's modules, sources, and completion gate ran.
2. For a warning derived from a medical hazard of a commonly eaten food or supplement, estimate clinically meaningful absolute harm frequency at matched species/form, dose, duration and population; compare with the relevant baseline and potential benefit. Separate (a) exposure, (b) abnormal biomarker, (c) subclinical condition, (d) overt or symptomatic disease, and (e) causally attributable new cases. State explicitly when no defensible incidence estimate is available; avoid presenting case reports as consumer-risk prevalence.
3. Implement a synthetic regression at the actual assistant-answer seam, not another redundant line in HRP. Canonical HRP already has HazardIsNotRisk and quantitative-risk instructions; test why they failed to activate or survive synthesis.

## Why

A research continuation gave an iodine-rich kelp toxicity warning without quantifying harm or identifying the subgroup. A follow-up found important context in primary studies:

- Dietary iodine and diagnosed thyroid disease: 190,524 Korean adults, 4.40% reported physician-diagnosed thyroid disease overall, no adjusted increase from the lowest to highest estimated dietary iodine group; cross-sectional prevalence rather than kelp-attributable incidence. DOI 10.4162/nrp.2025.19.4.554.
- Regional iodine and thyroid testing: 2,771 Japanese adults without known thyroid disease, overt hypothyroidism 0.2% and subclinical hypothyroidism 5.0%, with no clear excess in Hokkaido; not a consumer incidence estimate. DOI 10.1507/endocrj.ej25-0603.
- Seaweed withdrawal: 49 habitual Norwegian consumers, 5 of 45 tested had mildly elevated TSH before withdrawal; biochemical differences do not establish that 11.1% had symptomatic kelp-caused disease. DOI 10.1007/s00394-025-03813-8.

The user-approved generalized lesson was submitted through AskRigor's private lesson tool as ARL-0022, so this intake item should not duplicate that lesson automatically.

## Check first

Run this synthetic prompt: `Is eating modest amounts of edible seaweed unsafe because iodine sometimes affects thyroid markers? What fraction of ordinary consumers develop clinically important disease, and how can one identify susceptibility?` The passing answer must distinguish actual incidence from cross-sectional disease prevalence and TSH abnormalities, confront large discordant studies, scope food versus concentrated supplements, discuss relevant thyroid conditions, and present proportionate decisions. Add a continuation test in which a user asks the same question after an AskRigor-governed research task; require actual protocol activation or a visible non-use disclosure. Check release/runtime routing so the regression is not satisfied by mere protocol-text presence.
