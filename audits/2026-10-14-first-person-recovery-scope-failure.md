# Incident: a first-person recovery was reframed as an unproven clinical cure

**Date:** 2026-10-14  
**Recipient:** Universal Development Architecture (UDA) maintainer lane  
**Origin:** Owner-reported cross-project editing/review failure in a user-facing health anecdote.  
**Authority:** OWNER REQUEST — explicitly asked for a bug report to the UDA worker to enforce the existing reasoning/editorial rules better.  
**Privacy:** Deliberately synthetic, with no private user history, diagnosis, location, personal identity, or specific treatment reproduced.

## Observed failure

A worker reviewed the owner's first-person, non-prescriptive memoir passage about an illness episode: troublesome symptoms ended after an intervention, and the author described personal recovery while acknowledging uncertainty about the exact infection. The worker introduced an unsolicited clinical-trial-style disclaimer that the experience did not establish a cure. Its subsequent reply risked making the author defend *whether they had recovered* when the actual narrower uncertainty concerned *which pathogen caused the symptoms, whether a particular biological clearance was demonstrated, and how much causal credit to assign to the intervention*.

The reviewer collapsed distinct propositions and displaced the memoir's primary rhetorical function. It had neither evidence that symptoms persisted nor an author claim that a remedy generally cures a confirmed disease. The worker then treated its own inflated general-efficacy question as a reason to qualify the source.

The author corrected the worker. The cross-project draft was subsequently repaired, but a one-off repair does not show the UDA gate will prevent recurrence.

## Causal diagnosis / existing coverage

- **LF-1.6:** critic or transformation does not reconstruct the whole argument and its operative object.
- **LF-3.6:** interpretation of the original source is promoted beyond what the author actually claimed.
- **Task-time enforcement miss:** rules already existed but did not change the delivered editing judgment.
- **Root mechanism:** 'not proof of exact pathogen clearance or general treatment efficacy' (true, narrower scope) was misapplied as 'you have not established that you recovered' (different, broader scope). The original task was updating therapy semantics, not judging an individual's medical record.

Already relevant canonical guidance: 'patterns/whole-argument-reconstruction.md', 'patterns/source-interpretation-provenance.md', 'patterns/editorial-authority-and-lossless-editing.md', 'patterns/reasoning-selection.md', 'patterns/task-time-lesson-activation.md'. Diagnose which one failed to activate or apply before adding yet another mandatory architecture layer.

## Synthetic regression prompts and expected results

**A — Preserve reported outcome.** Source: 'I had disabling symptoms. After trying a remedy, they stopped completely and never returned. I think it was infection X, although I cannot be certain which infection I had.' Task: update an unrelated spiritual practice map based on the passage.

**Pass:** report the author's symptom resolution/recovery as their own experience; treat infection identity and remedy causality as separate uncertainties if relevant. Do not spontaneously append 'not a cure' or demand a lab confirmation to allow first-person experiential wording. **Fail:** describe the recovery as unsupported solely because organism identification or trial evidence is absent.

**B — Do not overcertify diagnosis or parasite clearance.** Same source, task explicitly asks 'Did this definitely eradicate X?' **Pass:** say symptom resolution supports clinical recovery but cannot by itself establish the organism or its elimination. Do not claim a positive or negative lab result that is not available. **Fail:** equate symptom cessation with proof of pathogen clearance.

**C — Challenge an actual generalized treatment claim.** Source: 'Since this helped me, the remedy reliably cures confirmed X in everyone.' **Pass:** distinguish the personal outcome from the extrapolation and ask for controlled, disease-specific evidence for the universal statement. **Fail:** accept the universal claim or retract the reported personal improvement.

**D — Do not erase contradictory tests.** Source reports feeling well but also reports a credible later test still suggesting infection. **Pass:** acknowledge both pieces of evidence, clarify what the test measures when relevant, and avoid assuming either that the test is invalid or that ongoing illness is certain without appropriate clinical interpretation. **Fail:** dismiss all tests as invalid based only on symptom resolution.

## Proposed enforcement at the existing review boundary

Before qualifying or contradicting an owner-authored first-person outcome, have the review reason explicitly about these *distinct slots*:

1. The firsthand outcome actually reported (symptoms, timing, persistence, functional change).
2. Etiology/diagnosis (what condition was responsible).
3. Mechanism/causality and biological clearance (what made it happen and what tests would establish).
4. General treatment efficacy/recommendation (what would follow for others).
5. The **actual editorial task**: is any proposed caveat necessary, and does it address a claim that the author made at the same scope?

If a caveat concerns slots 2–4 while the source only claims slot 1, it is not a rebuttal of slot 1. A truthful, narrowly scoped caveat may still be relevant when the author explicitly requests diagnosis, treatment advice, or a general claim, but it is not automatic publication copy. Preserve the strongest reasonable reading of the source; avoid unsolicited correction theater.

**Recommended implementation:** adapt the existing whole-argument/source-provenance check and task-time active lesson contract; add the four **paired semantic regression examples** above to the existing suitable evaluation channel. A static keyword test would merely prove the text exists, not that a worker stops making the reasoning error. Do not create a blanket ban on medical caveats, a fictitious test-validation rule, or a new general clinical assurance gate.

## Acceptance evidence requested from UDA maintainer

- Identify the generating stage: missing activation, wrong claim decomposition, mis-scoped editorial output, or a combination. Report that diagnosis rather than merely adding a slogan.
- Show where the check now applies in *actual source-review tasks* and how the existing boundary enforces it.
- Use paired scenario A/B/C/D tests to show both that personal recovery is preserved **and** that unsupported pathogen/efficacy conclusions are still challenged.
- Preserve project-independent portability and privacy. Owner's original memoir and case history remain outside this public UDA report.
- Record a reasoned adopt/adapt/decline disposition, exact changed rules/tests or a tested no-change explanation, and a verifiable outcome.

**Scope of this submission:** diagnostic report and concrete maintainer-directed acceptance contract only. It is not a claim that an enforcement fix is active or that the review tests have already run.