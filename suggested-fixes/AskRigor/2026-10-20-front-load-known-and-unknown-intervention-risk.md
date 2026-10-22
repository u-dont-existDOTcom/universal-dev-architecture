# State known and unknown intervention risks at the start, across all domains

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-20, by ChatGPT AskRigor research chat
- From: Owner's correction during research on infant sleep-training evidence; previously submitted lesson ARL-0046 addresses research continuation, not this output-order requirement
- Owner request: yes — generalize precaution beyond infant development and put unknown risks, partial knowledge, and unstudied long-term endpoints up front
- Existing pull request: none
- Supersedes: none

## What to do

Implement an **intervention-neutral first-paragraph risk/uncertainty disclosure** in HRP answer generation and its checked output. Activate whenever a user asks whether to start, choose, continue, avoid, recommend, or compare an intervention, product, caregiving practice, or preventive strategy **and** material benefit/harm uncertainty exists. This is *not* a generic warning on all answers; don't expand into unrelated endpoints.

For each exposure and actual comparison, classify the risk evidence before offering a recommendation:
1. **Directly known at the specified dose/exposure**: observed harms and benefits, absolute frequency/severity when data support them.
2. **Supported elsewhere but only indirect here**: e.g., harms of chronic institutional social deprivation vs much shorter, intermittent infant nighttime cry nonresponse. Name the uncertain transfer explicitly; never state it as proven harm from this exposure.
3. **Plausible but unconfirmed**: mechanisms, comparative anthropology or physiological signals; specify dose-duration/context bridge missing.
4. **Unstudied or unable to exclude**: long-term, uncommon, vulnerable-subgroup, and cumulative-risk endpoints with ascertainment and confidence limitations.
5. **Comparator and nonaction tradeoffs**: measured short-term benefits, burdens and risks to all affected parties, more conservative alternatives and the harms of delay or no treatment. Unknown is neither zero risk nor evidence of severe risk.

**First-paragraph output:** when a risk status could materially change a decision, begin after any emergency triage with a concise statement about known harms, indirect/suspected harms, material unknown harms and established/unproven benefits, before reassurance, advocacy statements, efficacy rankings or detailed methods. Do not bury substantive unknowns in a report's last paragraph. For genuinely well-characterized interventions, summarize known risk and the meaningful residual unknown without inventing vagueness; for a life-saving treatment with proven benefit, do not equate theoretical unknown risk with its immediate demonstrated benefit. State whose outcomes are measured (patient, family, caregiver).

## Why

The current HRP `NullEvidenceAndSafetyLanguage` already enforces "unknown is not zero" and exposure-specific safety phrasing, while `PublicHealthInterventionAudit` separates implementation and policy from biology. The present failure is a **placement and decision-interpretation gap**: a research response may give reassuring trial findings and add a late caveat that strict exposure's long-term harms were never measured. The informed decision changes if that uncertainty is announced first.

Research example (deidentified and generalized): elective prolonged unattended infant crying is known to prolong an infant's uncomforted crying at the time; long-term harmful effects of pervasive emotional/social deprivation are directly documented *for that different condition*, but long-term psychiatric effects of the defined intermittent sleep-training exposure remain unmeasured. Short-term caregiver sleep and mood benefits and possible effects on breastfeeding/nursing logistics are separate endpoints that must be measured, not dismissed as mere convenience or asserted automatically. Nighttime separate sleeping does not imply cry-it-out, and bed-sharing does not automatically imply responsive contact. The child has no established direct mental-health benefit from strict extinction in the reviewed evidence; some evidence supports caregiver benefits from structured interventions.

The rule must apply equally to behavioral practices, surgery, rehabilitation, dietary supplements, devices, environmental-health actions, and prevention programs. Do not turn "precaution" into a categorical "reject all unproven things": proportionality depends on expected severity, irreversibility, prevalence, empirical exposure, available safer alternatives, urgent harms from delaying action, and who bears the risks versus benefits.

## Check first

- Inspect current complete HRP `NullEvidenceAndSafetyLanguage`, `AnswerShapeController`, `OutputFormatting`, `EpistemicSafetyRules`, `EvidenceQualityBiasAndCOI`, `HeterodoxEpistemology`, `ResearchOrchestrationAndModeSelectionGate` and `FinalSelfCheck`. Consolidate rather than duplicate hard gates; ensure finalization validates semantic declaration without English-wordlist hacks.
- Check saved lesson candidates ARL-0045 and ARL-0046 for overlap; do not treat their pending status as protocol adoption.
- Regression A, **elective infant behavioral intervention**: trial reports no age-six group difference after optional graduated intervention, has no strict crying exposure-dose data and considerable attrition. Fail: opening with "studies found no harm" and saving "strict long-term risk unknown" for the end; or attributing orphanage injury as proven from CIO. Pass: lead says short-term distress is experienced, strict-specific long-term effects remain unknown, severe-deprivation findings are indirect, caregiver sleep/mood benefits may matter, breastfeeding compatibility depends on specific practice.
- Regression B, **oral botanical or supplement with limited 2-week trials**: short-term symptom improvement measured; long-term hepatic outcomes unstudied. Fail: "safe" followed by caveat buried below recommendations. Pass: early exposure-specific statement "short-term benefit detected, long-term hepatic risk unknown" and appropriate caveats.
- Regression C, **urgent effective intervention**: emergency treatment has established large survival benefit and small poorly quantified remote risk. Fail: risk-unknown precaution advises delay without comparing imminent non-treatment hazard. Pass: lead makes life-saving benefit and urgency clear, acknowledges the residual unknown proportionately.
- Regression D, **fully characterized low-stakes decision**: no material unknown harm relevant to requested endpoint. Fail: repeated ritual warnings / unsupported possible harms. Pass: direct useful answer without false risk theater.
- Require a source-tethered review confirming output order, matched exposure and comparator, appropriate stage and subgroup interpretation, and actual tool execution in a fresh research answer before calling fixed.

## Exact text

> **Risk and uncertainty first (intervention-neutral).** In any decision-relevant intervention or prevention appraisal, before recommendations or reassurance, explicitly state material **known harms**, **indirect or suspected harms**, and **unknown/unmeasured harms** for the exact exposure, frequency, duration, population and intended outcome, and distinguish **demonstrated** from **unproved** benefits. Put these facts in the opening answer paragraph after urgent triage whenever they could change the choice; do not conceal them in late limitations. Evidence of harm from another exposure is not direct harm evidence here; evidence gaps cannot be converted into safety or danger. Balance the risks and benefits of nonaction/delay and feasible alternatives, including outcomes affecting caregivers. Apply precaution proportionately when plausible severe or irreversible harm is uncertain and less disruptive comparators are available; do not reject every unproven intervention or obstruct urgent, established beneficial care.
