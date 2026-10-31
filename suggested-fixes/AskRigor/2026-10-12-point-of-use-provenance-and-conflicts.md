# Require read depth, exclusions, funding and limitations beside each clinical claim

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-12, by a ChatGPT research reviewer
- From: 2026-10-12 rabies vaccine study-source audit and owner correction; DOI 10.3390/vaccines13121176, DOI 10.7774/cevr.2016.5.1.60
- Owner request: yes, the 2026-10-12 instruction to report this precise bug
- Existing pull request: none
- Supersedes: none

## What to do

In HRP `UniversalFullTextAcquisitionProtocol`, `SourceVerificationAndCitationAudit`, `EvidenceQualityBiasAndCOI`, `StudyMethodReliabilityGate` and `finalize_research`, require display of each decision-important study's **actual read depth** (audited full text / full text read but not audited / partial / abstract only / secondary), study identity, intervention, and material funding or conflict at the location where its result is described. A later global audit-status paragraph does not satisfy the owner-facing requirement. Preserve the same qualifications when a section is rewritten. Independently check source claims against the full report, not only the title/abstract.

Regression 1: A direct-study table reports a percentage and three paragraphs later the source is revealed to have been abstract-only; per-study location check must fail or add the label next to the table row.

Regression 2: A 2025 controlled dog/cat study is used as strong supportive evidence while its article discloses all authors were employed by Merck/MSD Animal Health (DOI 10.3390/vaccines13121176). The response must state that sponsorship/employment **next to** the study, distinguish commercial conflict from proof of fraud, and not classify 'no external funding' as independence.

Regression 3: A 2016 Morocco experiment is described as demonstrating lasting population-level protection while source field data show serology at day 0/30 only and trial antibodies fall after a post-booster peak; source also says previous campaigns had not produced expected epidemiological results. Explicitly distinguish field-control failure, coverage uncertainty, antibody waning, challenge survival, and whether long-term disease incidence was measured.

## Why

A 'source-linked study audit validated' receipt was interpreted as an assurance of claim quality. The actual validator notes linkage and checklist coverage, **not** semantic correctness. The last answer omitted Merck employment beside the Merck study, and delayed read-depth disclosure to a footer after using animal studies to discuss human vaccine effects.

## Check first

Inspect the exact study full texts and conflict-of-interest section, especially 2025 DOI 10.3390/vaccines13121176 and 2016 DOI 10.7774/cevr.2016.5.1.60. Check existing point-of-use read-depth functionality (released 2026-10-12) before changing a gate; a fix must test final rendered/output text, not merely require schema presence.