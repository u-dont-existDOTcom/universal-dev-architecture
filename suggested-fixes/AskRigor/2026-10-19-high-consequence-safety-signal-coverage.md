# Prevent omission of low-frequency, high-consequence harms in intervention-safety research

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-19, by a ChatGPT research reviewer
- From: deidentified safety-comparison failure; companion generalized lesson submitted through AskRigor's private review intake
- Owner request: yes — send a substantive, generalizable bug report rather than a drug-specific one-line rule
- Existing pull request: none
- Supersedes: none

## What to do

**Diagnose the existing-rule execution path before editing protocol prose.** The observed failure was not necessarily absence of an anaphylaxis rule: HRP already addresses severe reactions, immune effects, incident serious events, delayed latency, exposure identity, and incomplete source coverage. Determine where applicability, search-query construction, mandatory source retrieval, or pre-delivery review failed to carry those rules through.

Proposed remediation for AskRigor's agent/router and evaluation coverage:

1. For a broad **safety** comparison, create a compact *exposure-specific serious-harm frontier* independently of the common-effect search. Select hazards by route, pharmacology, patient group, known labels, and relevant serious-event signals. Prioritize severity, urgency, preventability, latency, and uncertainty separately from how often a harm appears in trials or forums. Avoid an exhaustive universal symptom checklist or automatically treating every injectable as equally allergenic.
2. Search source families suited to rare and delayed harm: regulator-approved labeling and revisions, postmarketing safety information, trial serious-event tables and withdrawals, case reports, regulatory enforcement/case filings, and independently inspected community firsthand reports. Use event synonyms, not only the drug names and common side effects. For repeated exposure, inspect sensitization, delayed-onset reactions, reactions after previously tolerated doses, and events that appear after discontinuation where relevant.
3. Preserve a separate evidence state for each serious outcome: established product-level warning; documented but unattributed event; plausible lower-quality signal; not studied/not found; reassuring evidence bounded by population, ascertainment and surveillance duration. Never convert a single report into incidence, attribute a combination reaction to one ingredient without evidence, or infer that prior tolerability guarantees continued safety.
4. Integrate risk findings into the *actual user answer*. Surface high-consequence emergencies proportionately and early, with succinct symptom and emergency-action guidance when indicated; keep later speculative risks labeled as such. A final answer emphasizing edema, glucose and cancer is not a complete serious-adverse-event inventory if known plausible anaphylaxis or another treatment-specific emergency was never assessed.
5. Test whether already-declared mandatory HRP safety obligations were activated and executed. Incomplete coverage or `finalize_research.status=not_ready` must be represented as **provisional / incomplete**, never silently laundered into a comprehensive safety ranking. Allow safe, clearly qualified partial answers rather than imposing a blanket no-answer policy.

## Why

In a multi-compound growth-hormone and secretagogue safety comparison, the research pass searched for glucose dysregulation, edema, joint/nerve problems, cardiovascular effects and cancer uncertainty, but **not** anaphylaxis, severe hypersensitivity, angioedema or sensitization after repeated previously tolerated injections. Its output therefore omitted potentially life-threatening systemic allergic reactions.

A subsequent targeted check identified a somatropin postmarketing anaphylaxis warning, a recent published human immediate-reaction case (PMID 40465134), and weaker regulatory and firsthand reports involving compounded CJC-1295/ipamorelin after longer use. These have different causal confidence and no reliable shared population denominator. The existence of a well-grounded somatropin warning alongside uncertain compound-specific reports is exactly why a severity-focused, source-aware search was needed.

The previous AskRigor `finalize_research` result was `not_ready` for outstanding research and community coverage, yet the user-facing answer remained close to a broad safety synthesis. Its specific response did **not** flag missing anaphylaxis. The visible evidence therefore implicates **task-time HRP activation, independent high-severity query discovery, and pre-delivery completeness framing** more directly than source-connector failure. Do not presume that merely extending the prompt or adding a duplicate anaphylaxis rule will fix this class.

## Check first

- Verify the current complete HRP / Universal protocol text and its active version; preserve their exact authority.
- Inspect the applicable activation and enforcement chain in `project/PROJECT_INSTRUCTIONS.md`, `SafetyAndScopeGate`, `MedicationSupplementBotanicalSafety`, `AdverseEventAscertainmentAndActionabilityAudit`, `CrowdSourcedAndClinicalSignalAudit`, and existing safety / finalizer tests.
- Reconstruct a minimal provider-independent reproduction: recorded input, selected search terms, first-pass sources, completion status, and delivered conclusion. Distinguish model-origin query omission from a validator/connector defect.
- Check whether related lesson candidates and tests already cover the same failure. Prefer strengthening the existing activation/completion boundary to introducing a second overlapping safety module.
- Review any protocol-runtime/eval changes against the project's zero-spend, provenance, privacy and release gates.

## Acceptance regressions

1. **Previously tolerated injection, later emergency:** A generic question about injectable hormone/peptide safety triggers a search of established product-specific systemic hypersensitivity warnings and distinguishes the better-established licensed drug from uncertain combined experimental injections. The response says past tolerance does not eliminate later risk, without claiming that the risk occurs frequently.
2. **Other modality, different critical harm:** A broad safety comparison of an oral medication with an established uncommon severe hepatic or cardiac complication discovers that high-consequence harm through appropriate evidence, without mechanically inserting an irrelevant anaphylaxis section.
3. **Short negative trial:** A brief, small trial reporting no serious events is not treated as evidence excluding rare events or delayed-onset reactions; the answer conveys surveillance and power limits.
4. **Causation and rate:** A case report or enforcement filing involving two ingredients is coded as a signal, not proof of which ingredient caused it; absent denominator means no invented incidence.
5. **Completion and delivery:** When a mandatory serious-event source audit was not run, the evaluation exposes that gap, and a partial answer states its limits rather than quietly issuing a comprehensive safe/safer verdict.

**Desired disposition:** AskRigor maintainer to adopt/adapt/decline with evidence in the project's suggested-fix ledger; this is a proposed engineering and evaluation fix, **not** a claim that current published protocols or runtime were changed.
