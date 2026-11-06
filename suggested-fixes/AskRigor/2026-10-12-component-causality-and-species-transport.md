# Prevent PEP-package effects being attributed to the rabies vaccine alone

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-12, by a ChatGPT research reviewer
- From: A 2026-10-12 rabies-vaccination literature review, with subsequent owner correction; public corroboration DOI 10.1016/S1473-3099(22)00641-7 and DOI 10.7774/cevr.2016.5.1.60
- Owner request: yes, the 2026-10-12 owner instruction to send the verified failures and debug their gates
- Existing pull request: none
- Supersedes: none

## What to do

Repair the current HRP `ComparatorLineageAndProgramCongruenceAudit`, `PublicHealthInterventionAudit`, `ResearchQuestionAndEstimandGate`, and synthesis execution boundary so that evidence for wound washing + rabies immunoglobulin + vaccination is **not** attributed to vaccination alone. Classify each source by species, vaccine platform (inactivated cell-culture, historical nerve-tissue, recombinant particle, live-attenuated), exposure stage, comparator, RIG inclusion, and directly measured endpoint (rabies disease/death versus serology). Require an explicit per-claim component-attribution ledger and no stronger final language than the observed contrast. For human outcome questions, canine challenge experiments remain indirect and cannot substitute for human efficacy percentages.

Add hostile regressions:
- User asks incremental vaccine-only benefit; model cites a WHO near-100% **PEP package** estimate as vaccine efficacy -> reject.
- User asks clinical disease/death; model cites all subjects reaching an antibody threshold -> do not upgrade a surrogate without clinical validation.
- Model interprets 'cell-culture vaccine' as **live vaccine** -> reject the material-identity substitution: the 2016 Morocco Rabivac is inactivated (BHK21 culture, beta-propiolactone).
- The 2008 dog experiment screened 50 healthy dogs, excluded 10 antibody-positive at baseline, and studied 40 seronegative dogs: require this selection decision next to the 30/30 vaccine-only outcome, without assuming the 10 were infected and recovered.

## Why

The assistant called PEP 'almost 100% effective' under a table titled vaccination effectiveness while no vaccine-only component contrast was shown. Later it invoked animal challenge results to suggest human benefit without adequately delimiting the species/product differences. The 2008 source's baseline exclusion is decision-relevant because it changes the population under study.

## Check first

Current canonical HRP/Universal XML already prohibit the error. Diagnose why the activated conceptual gate did not bind the final answer rather than adding another unenforced prose reminder; test the semantic owner-outcome/claim matrix on model-generated final text. Compare original papers and their vaccine labels, including DOI 10.1016/j.vaccine.2008.09.053, before designing assertions. Never infer natural rabies survival from baseline seropositivity alone.