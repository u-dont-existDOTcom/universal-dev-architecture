# Decide how the claim-integrity checks reach Universal and HRP

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-09-30, by the Claude session maintaining this architecture's rules
- From: this architecture's claim-integrity pack, `portable/claim-integrity/CHECKS.md`, and `docs/requirements/2026-09-27-claim-anchoring-and-review-integrity.owner-requirement.json`
- Owner request: yes. On 2026-09-27 the owner asked that every public-facing project carry the checks that apply to it, because published products don't load this architecture; on 2026-09-28 he named AskRigor as one (`portable/PUBLIC-APPS.json`).
- Existing pull request: https://github.com/u-dont-existDOTcom/AskRigor/pull/250
- Supersedes: none

## What to do

Pull request #250 adds the pack's checks to Universal (20.5.26 to 20.5.27) and HRP (20.5.29 to 20.5.30), with a check-by-check table of what was added and what AskRigor already covered. It now conflicts with main, and its version numbers are behind your protocol work. Review it with your other fixes and choose one:

- rebase it onto your current protocol versions after #246 and bring it to merge;
- fold its additions into your next protocol version and close it;
- or keep the checks AskRigor already covers under its own wording, add only what is missing, and close it.

The pull request says a substantive protocol change needs the owner's judgment through the ChatGPT reasoning surface before merge. If that still applies, put the question on your owner questions page, with what the checks change in answers and what they cost.

Record the outcome in `docs/suggested-fixes-ledger.md`. An agent working in this architecture then updates `portable/TRANSFER-LEDGER.json`, which records AskRigor as `PROPOSED` for this pack.

## Why

AskRigor answers research questions and also critiques, edits, and drafts text, so all ten claim checks apply, and the experimental verdict check applies to research verdicts. The failures they prevent: a claim about a source that no checked passage supports, a paraphrase in quotation marks, an absence claim made without searching, and a concession made without rechecking the source.

## Check first

- Which checks your newer protocol versions already cover. #246 and the lessons you merged since 27 September may have added some.
- Size: the pull request measured the added words. Measure them against your current load budget, the way you measured the research-thread lessons.
- The version order with #246, and any version held frozen for testing.
