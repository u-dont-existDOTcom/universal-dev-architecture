# Have a reader with no context say each answer back before it reaches the user

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-11-18, by the Claude session working on the owner's private astrology project
- From: the owner's message of 2026-11-18 in that project, and the pattern proposed for this architecture, `patterns/write-for-a-reader-who-was-not-there.md` (pull request labelled `uda-lane`, opened the same day)
- Owner request: yes. His words: "it's not just that you can't explain science, you can't write clearly at all. DEBUG THAT! we need to get to the root of this and fix it in UDA and askrigor and everywhere."
- Existing pull request: none
- Supersedes: none

## What to do

1. Apply the pattern's eleven rules to the text AskRigor gives a user: the plain answer, the findings card and any explanation of a method or a study. In short: the claim first in everyday words; what it means for the user's decision; whether it is good news, bad news, mixed or unknown; no term of art without its meaning in the same sentence; one worked example before a general statement about a method; evidence and method last.
2. Add the cold-reader check before an answer is finalized. A reader with an empty context (a small model is enough) gets the draft answer alone and returns three lists: each paragraph said back in one sentence, every phrase it could not explain to a friend, and every question it still has. A paragraph it cannot say back, or says back wrongly, is rewritten. The natural place is `finalize_research`, next to the checks that already run on the draft.
3. Keep a short table of AskRigor's own words that users do not know (for example the names of its protocol steps, receipt and frontier terms, and statistical shorthand) with the plain wording to use for each, and check drafts against it.

## Why

In another of the owner's projects an agent wrote a long page and several explanations whose facts were right and which he could not understand. He asked what made-up words meant, whether a sentence was good or bad news, and what a paragraph was telling him to do. The rule to use plain words was already loaded. What was missing was a reader who had not done the work. AskRigor's answers are read by people deciding about their health, who were not part of the research either, so the same failure there costs more.

After the rewrite in that project, a small model and a model from another family each said back every section of a long page correctly, and the phrases they could not explain were fixed in one pass. The check took a few minutes.

## Check first

- Whether `finalize_research` or the answer protocol already has a readability or comprehension step. If it does, extend that step with the three lists instead of adding a second one.
- Whether a cold reader may see the draft at all under AskRigor's privacy rules. The draft answer can contain what the user said about their own situation; if that may not go to another model call, run the check on the general part of the answer only, or with the user's details removed.
- The cost: one small-model call per finalized answer. Decide whether it runs on every answer or only on answers above a length.
- A strict cold reader lists far more than needs fixing. The pattern says how to read its lists.
