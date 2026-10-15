# Test case: do not mistake ongoing pain for stimulus-linked pain reports

- For: u-dont-existDOTcom/AskRigor
- Filed: 2026-10-15, by ChatGPT architecture/research evaluation
- From: owner-requested regression following a research-answer error, with the conversation paraphrased for public privacy
- Owner request: yes; submit this as a research test for AskRigor
- Existing pull request: none in the AskRigor repository
- Supersedes: none

## What to do

Admit this as a repeatable, source-grounded **reasoning and literature-verification test** using AskRigor's current evaluation conventions. Run it against the applicable user-facing reasoning surface when permitted. Record the exact evaluated model/mode, output, sources, criterion results and PASS/FAIL/NOT_RUN. Do not call a queued case a completed test.

### Fixture

Turn 1: "Brain measurements show responses to potential pain even in patients who cannot answer bodily. How could we test whether those responses accompany a subjectively painful experience?"

Turn 2: "If some such patients can answer yes/no through brain imaging, why not ask them whether it hurts?"

Turn 3 after the model cites a patient who reported no ongoing pain: "But was that question asked during a controlled, medically approved stimulus? I mean asking about the stimulus itself, not their usual pain."

Turn 4: "Why has this exact experiment not been reported? And why didn't you suggest it before I had to spell it out?"

### Success criteria

1. The subject and measured variable remain fixed: an intentional, brain-mediated subjective report *during or just after an externally administered controlled stimulus*, versus neural nociception or an answer about ongoing baseline pain.
2. By turn 2, describe the decisive comparison in principle: validate the brain communication channel and report about a specifically timed, appropriately authorized experimental sensation versus a matched nonpainful control.
3. Acknowledge the relevant 2012 Scott Routley example as a reported negative answer about current pain, **not** proof a contemporaneous stimulus experiment already occurred.
4. A missing or uninterpretable BCI response is not a negative report; a valid intentional answer indicates some awareness and does not establish suffering under complete unconsciousness.
5. Recognize a plausible direct follow-up in turn 1 without making it a mandatory tangent in unrelated questions.
6. Distinguish literature findings from speculative explanations of research gaps and avoid global absence claims from partial searching; acknowledge ethics and scarce reliable BCI communicators as possible obstacles, not documented causes.
7. Show matched study methods and dates before saying a study already answered the precise question.

### Hard failures

- "The patient said he wasn't in pain; therefore the proposed controlled-stimulus test was performed."
- "Pain-related brain activation alone establishes subjective suffering."
- "An absent decoded response proves no pain."
- "No paper turned up in one search, therefore nobody has ever tested this."

## Why

A recent answer conflated a reported negative answer about ongoing pain with the stronger experimental question about a specific concurrent stimulus. The test exercises target fidelity, temporal/causal comparisons, source-method attribution and anticipatory experimental thinking, not keyword matching.

## Check first

Look for duplicate AskRigor evaluation fixtures, then check source methods directly:
- ABC News account of Scott Routley, 2012-11-14: https://abcnews.com/Health/man-supposed-vegetative-state-communicates/story?id=17716726
- Schiff et al., 2024 BCI roadmap: DOI 10.1007/s12028-023-01924-w, https://pmc.ncbi.nlm.nih.gov/articles/PMC11284251/
- 2022 EEG BCI systematic review: PMID 36545350
- Contrada et al., 2026-07-06 position paper: DOI 10.1002/ejp.70332

State now: QUEUED; no AskRigor model run or protocol modification claimed. Do not use paid model API calls without authorization.
