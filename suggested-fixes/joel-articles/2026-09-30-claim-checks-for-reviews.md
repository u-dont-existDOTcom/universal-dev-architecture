# Decide on claim checks for reviewing and editing Joel's writing

- For: `u-dont-existDOTcom/joel-articles`
- Filed: 2026-09-30, by the Claude session maintaining this architecture's rules
- From: this architecture's claim-integrity pack, `portable/claim-integrity/CHECKS.md`
- Owner request: no. The pack is required only in the owner's declared public apps (`portable/PUBLIC-APPS.json`), and this repository isn't one. On 2026-09-28 the owner said the pull request did not need to be undone.
- Existing pull request: https://github.com/u-dont-existDOTcom/joel-articles/pull/112
- Supersedes: none

## What to do

Pull request #112 adds claim checks for reviews and for the owner's own writing to the article skill. It now conflicts with main. Decide with your other fixes: rebase and merge it, keep only the parts your skill doesn't already cover, or close it with a reason.

Record the outcome in `docs/suggested-fixes-ledger.md`.

## Why

The checks came from mistakes made in exactly this kind of work: reviewing a published essay and the owner's draft reply to it. A reviewer stated inferences as what the essay said, put paraphrases in quotation marks, and sharpened a source's account while rewriting the owner's reply. Those are the failures the checks stop, so they may be worth keeping here even though this repository isn't a public app.

## Check first

- Whether the skill's current editing rules already cover the checks, especially rechecking every fact added to owner-authored text against its source.
- Whether the added text fits the skill's size and style.
