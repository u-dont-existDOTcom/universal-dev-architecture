# Prioritize clinical recovery while keeping microbiology and correction IDs distinct

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-13, by ChatGPT Atlas research auditor
- From: source-based assessment of the Global Remedies Atlas practitioner/community report and original assignment; no private testimony submitted
- Owner request: yes; the owner explicitly requested bug reports for these defects
- Existing pull request: none
- Supersedes: none

## What to do

For a treatment claimed to relieve longstanding symptomatic infection, preserve patient-valued endpoints first: pain/itching, inflammation or discharge, usable tissue/function, appearance, normal regrowth, durability (on versus off treatment), and tradeoffs. Maintain microbiological clearance as a separate etiologic endpoint: useful for organism eradication and recurrence inference, but not a veto on an observed symptomatic improvement. Do not infer that a negative culture with persistent symptoms proves clinical recovery; do not infer that symptom remission alone proves a pathogen-killing mechanism or permanent disease eradication. Compare endpoints rather than replacing one with the other.

At intake, verify every `supersedes` identifier against condition, intervention, person/study and original source identity before applying a correction. On collision, quarantine and require semantic reconciliation; never silently overwrite an unrelated record. Link the new version to the correctly matched original.

## Why

Two 2025 OMNS case reports of prolonged nail disease recorded striking but different clinical trajectories following reported dilute oral peroxide exposure. Case A: major relief from nail-fold symptoms and cosmetic distress after all ten affected nails detached, but no new nail regrowth by ~18 months. Case B: itching/discharge improved, and eight fingernails plus eight toenails were reportedly growing by 16 months. These are uncontrolled cases and do not establish microbiological eradication or causality. Yet repeatedly leading with 'no microbiological cure' diminishes their actual patient-centered outcomes. The converse mistake of promising a 'cure' would also be unjustified. Microbiological and clinical outcomes are related but nonidentical constructs.

A supplied correction packet labels these case histories `P026` and `P027`. In the existing practitioner pilot, `P026` and `P027` are **DMSO musculoskeletal pain cases**, while the oral peroxide onychomycosis cases are `P041` and `P042`. This is an exact cross-version identity collision. The packet should not be inserted as direct supersession without an entity-level reconciliation.

## Check first

Inspect canonical HRP patient-centered-outcomes, measurement, and evidence-identity modules for existing rules. Synthetic tests: (1) clinical outcome improves greatly without a negative pathogen assay: score observed patient benefit without asserting confirmed microbial clearance; (2) fungus becomes lab-negative while itching and nail function do not improve: do not declare clinically successful; (3) a correction references `CASE-7` for a different disease than the existing `CASE-7`: reject update until the correct identity is resolved.
