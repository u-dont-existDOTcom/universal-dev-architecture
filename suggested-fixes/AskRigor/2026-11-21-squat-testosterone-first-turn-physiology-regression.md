# First-turn regression: squats, testosterone and persistent felt benefits

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-11-21, by ChatGPT research chat
- From: owner feedback comparing the first and second answers to a squat-and-testosterone question on 2026-11-21
- Owner request: yes; explicitly send this as a regression case so AskRigor gives the second-turn quality on the first turn
- Existing pull request: none
- Supersedes: none

## What to do

Create a **first-turn semantic answer-quality regression** using the original standalone user input (no conversation hint): “How much would 350 squats every other day boost my t? Vs less of jump squats (how many)?”

The observed first answer addressed acute-versus-resting testosterone, gave a plausible small-volume jump-squat plan, and said average long-term resting testosterone did not rise in healthy men. It missed a material part of the user's intended outcome: men sometimes experience **lasting** improvements in sexual drive, motivation, confidence or energy from training that they interpret as a rise in overall testosterone. The observed second answer, elicited only after a follow-up, explained several possible sources of that lasting experience while distinguishing them from a measured hormonal increase. The owner explicitly preferred that second-turn depth on turn one.

**First-turn pass criteria (judge semantic substance, not exact keywords):**

1. **Direct comparison first.** Answer the 350-squats-in-sets every-other-day question and the smaller-volume jump-squat alternative. Do not manufacture a serum-testosterone percentage, a dose-equivalence between jump squats and bodyweight squats, or an assurance that either raises baseline T. A power-oriented jump-squat volume is distinct from a hormonal replacement dose.
2. **Acute vs sustained.** Separate temporary exercise-related blood hormone responses, resting testosterone over weeks/months, and lasting feelings/functional changes often attributed to high testosterone. Do not end at “spike gone in an hour”; proactively address the durable lived effects implicit in “boost my T.”
3. **Competing mechanisms with evidence boundaries.** Explain that persistent changes in mood/motivation and confidence, training adaptation, conditioning, or vascular/erectile function may occur even without higher blood testosterone; distinguish erection quality from libido. Where validated human research supports it, mention possible changes in DHT or muscle-local androgen activity, explicitly separating these from causal proof of increased libido. Explain that exercise/weight loss may genuinely improve baseline T in some men with initially low T/metabolic dysfunction, unlike the average healthy eugonadal man. State uncertainty and avoid claiming any of these effects were proven specifically for 350 bodyweight squats.
4. **Scientific verification.** Support relevant empirical assertions with verified primary human studies and/or systematic reviews, and label extrapolations from aerobic training or heavy resistance exercise to this user's bodyweight squat routine. Verify any DHT effect size against the original source before quoting it. A mechanistic possibility is not a measured clinical benefit.
5. **Practical action.** Give a reasonable manageable exercise structure, note conditioning versus explosive-power tradeoffs and recovery/joint tolerance, and say that the hormone-focused choice has no established optimal repetition number.

## Why

This is a **target-selection and proactive explanatory-depth failure**, not proof that the first answer's negative resting-T finding was false. The first response narrowed “boost my T” to a serum assay and omitted the user-valued persistent sensations. The second response found the broader, more useful interpretation only after correction.

An AskRigor fix should answer the literal question and test the materially linked human outcome; it must not convert every narrow lab-test question into an unsolicited health essay. Follow existing target-fidelity, phenotype/outcome-first, and real-world-signal lessons rather than adding an unrelated universal endocrine rule.

## Check first

1. Run the **original prompt only** as a fresh AskRigor first-turn query and save its response plus source receipts; do not supply the later user correction to the model. Mark observed baseline `PASS`, `FAIL`, or `UNRUN` and name which criterion is missing.
2. Add a regression fixture and an actually executed semantic evaluator for all five criteria; explicit fail if an answer treats “no lasting serum testosterone rise” as exhausting the practical question, or asserts unverified causal hormone explanations. Test against the user-visible research answer, not only an internal tool payload. Record the first-turn baseline and post-fix result, not just fixture existence.
3. Negative control: a user who explicitly asks *only* for the 15–60-minute hormone time course should get the short, direct time-course answer without a forced broader essay.
4. Transfer control: a different training question framed as long-lasting “hormonal” energy or drive should reconstruct the same measured-hormone versus experienced-outcome distinction, not memorize the squat string.
5. Locate the real failure boundary (question interpretation, retrieval, source checking, synthesis or display), make the bounded change, and record the result in AskRigor's `docs/suggested-fixes-ledger.md`. The project's own scientific-method and release gates still apply.

**Status at filing:** submitted for recipient intake; regression implementation and live test result are not yet verified.
