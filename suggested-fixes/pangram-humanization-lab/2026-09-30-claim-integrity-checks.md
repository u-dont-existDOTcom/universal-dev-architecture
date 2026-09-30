# Decide on the claim-integrity checks in the lab's runtime instructions

- For: `u-dont-existDOTcom/pangram-humanization-lab`
- Filed: 2026-09-30, by the Claude session maintaining this architecture's rules
- From: this architecture's claim-integrity pack, `portable/claim-integrity/CHECKS.md`
- Owner request: no. The owner hasn't decided whether this lab will become a standalone app; `portable/PUBLIC-APPS.json` lists it as undecided, and undecided projects carry the pack only when he says so. On 2026-09-28 he said the pull request did not need to be undone.
- Existing pull request: https://github.com/u-dont-existDOTcom/pangram-humanization-lab/pull/174
- Supersedes: none

## What to do

Pull request #174 adds the claim-integrity checks to the lab's runtime instructions. It merges cleanly today. Decide with your other fixes: merge it, keep only what the lab doesn't already cover, or close it with a reason. If the owner later declares the lab a public app, the pack becomes required and the decision reopens.

Record the outcome in `docs/suggested-fixes-ledger.md`.

## Why

The checks stop claims about a source that no checked passage supports, paraphrases in quotation marks, and absence claims made without searching. They matter wherever the lab's agents report on texts or edit them.

## Check first

- Whether the lab's current rules already cover these checks.
- Whether the added text changes any output the lab measures, such as detector scores, since that would make earlier and later runs differ.
