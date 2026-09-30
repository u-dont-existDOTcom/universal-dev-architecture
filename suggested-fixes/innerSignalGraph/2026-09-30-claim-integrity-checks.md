# Decide on the claim-integrity rules for the therapy protocol and reply prompts

- For: `u-dont-existDOTcom/innerSignalGraph`
- Filed: 2026-09-30, by the Claude session maintaining this architecture's rules
- From: this architecture's claim-integrity pack, `portable/claim-integrity/CHECKS.md`, and `docs/requirements/2026-09-27-claim-anchoring-and-review-integrity.owner-requirement.json`
- Owner request: yes. On 2026-09-27 the owner asked that every public-facing project carry the checks that apply to it, because published products don't load this architecture; on 2026-09-28 he named Inner Signal as one (`portable/PUBLIC-APPS.json`).
- Existing pull request: https://github.com/u-dont-existDOTcom/innerSignalGraph/pull/96
- Supersedes: none

## What to do

Pull request #96 adds five rules about what a reply claims, with six audit codes, to the served therapy protocol and to the prompts that draft, realize, audit, and repair replies. It now conflicts with main. Review it with your other fixes:

- Check that the wording fits how Inner Signal talks to people. Replies should stay natural: the rules govern what a reply claims about the person, never how it sounds, and nothing requires quoting or restating them.
- If you would adopt it, rebase it. The pull request notes that therapy prompt policy needs the owner's approval, so put the wording approval on your owner questions page. Show him the exact text from `plugins/inner-signal-therapy/skills/inner-signal-therapy/references/CLAIM-INTEGRITY.md`, what it prevents, and what it could cost in warmth or length.
- If you would change it, change it first, then ask.
- If you would not adopt it, say why on your owner questions page, since the owner asked for it.

Record the outcome in `docs/suggested-fixes-ledger.md`. An agent working in this architecture then updates `portable/TRANSFER-LEDGER.json`, which records Inner Signal as `PROPOSED` for this pack.

## Why

The rules keep a reply from stating what the person felt, did, or wants beyond their own words, adding backstory or motives about the people in their life, putting a paraphrase in quotation marks, saying "you never mentioned" without being able to see everything, or defending an old reflection after the person corrects it.

## Check first

- Whether newer changes to the prompts or the protocol already cover any of the rules.
- The served protocol's hash: the pull request moved it from the 7-file to an 8-file protocol. Recompute it after the rebase.
