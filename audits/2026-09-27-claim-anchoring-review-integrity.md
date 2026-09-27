# Claim anchoring and review integrity audit

Date: 2026-09-27
Owner requirement: `docs/requirements/2026-09-27-claim-anchoring-and-review-integrity.owner-requirement.json`

## What happened

The owner asked a chat assistant what was wrong with the lesson of a published essay, then asked for its view of the owner's draft reply, pushed back on several points, and asked for a corrected draft. The owner then asked for every error to be collected and prevented in future.

The essay, the owner's draft, and the transcript are not committed. They are private or third-party material, and the lesson transfers without them.

## Errors

26 errors across four replies, plus two borderline style slips.

| Class | Count | Examples |
|---|---|---|
| The reviewer's inference stated as the source's content | 11 | unwillingness where the essay was silent; an outcome the essay left open; "everyone" met in one role; compressed paraphrases in quotation marks; a sharpened account of a canonical text in the owner's draft |
| The owner's meaning resolved against the owner | 5 | a contradiction claimed between a view and a warning about its misuse; a misread phrase fact-checked; rejected flags re-raised as warnings about readers |
| Unverified category claims | 2 | "not canonical language"; "not a clinical distinction" |
| A secondary figure its own citation contradicted | 3 | a 95% figure whose only citation said 92%, finally written into the owner's draft |
| Verification claimed beyond what was checked | 1 | a quotation "checks out" after only parts were compared |
| Contradiction across turns | 1 | a later claim that undercut an earlier point |
| Estimate reported as a measurement | 1 | response durations guessed from minute-resolution timestamps |
| Concession made without checking | 1 | a contested reading conceded as the text's only reading |
| Own action misreported | 1 | a deleted clause described as a fixed typo |

In the review of the owner's draft, the assistant made 18 points: 7 held up, 1 held up but came with a wrong replacement figure, 2 were neutral, and 9 were wrong or overstated.

## Who found them

- The owner caught 7 during the conversation.
- The assistant's own first audit, written in the same context after the owner raised the session to the highest reasoning setting, logged 8 more, called the owner's draft ready to publish, and logged one item it later withdrew.
- An independent checker, given only the sources, a transcript, and that audit, found the other 11, including all three in the draft the owner was about to publish, and more than a dozen problems in the audit itself. It made 107 tool calls over about four hours.

## Why

Trace facts: the chat surface loaded the owner's saved preferences, not this repository. The relevant preferences were scoped by topic: anchoring to what the owner says about people in the owner's life, verification to specific named entities, and clarifying questions to complex or emotionally charged situations. No independent check ran before the owner asked for the audit.

Supported inference: topic-scoped rules did not fire on claims about a text already in the conversation, on claims about what a tradition or field says, or on a review of the owner's own writing. The same context treated a text it had read as a text it had checked, both when writing and when auditing. Most inferences drifted in exactly where they strengthened an argument the reviewer was making.

Not established: whether the reasoning-effort setting contributed.

## What changed

Rules, each added to the pattern that already owns its topic:

- `patterns/source-interpretation-provenance.md`: point-of-use anchoring.
- `patterns/reasoning-selection.md`: category-claim check, figure-provenance check, verification-scope statement, measurement resolution, cross-turn consistency, and checking before conceding.
- `patterns/whole-argument-reconstruction.md`: reviewing the owner's own writing.
- `patterns/editorial-authority-and-lossless-editing.md`: rechecking facts added to owner-authored text.
- `patterns/independent-evaluation-separation.md`: the claim check before delivery, with a budget, and an experimental key-condition recoverability probe for verdicts.

Public products:

- `portable/claim-integrity/CHECKS.md`: the self-contained pack that public products adapt, because they do not load this repository.
- `portable/TRANSFER-LEDGER.json`: where each public project stands.
- `scripts/portable_checks.py`: validates the ledger and checks project clones for recorded anchors.

Regression:

- `evals/review-integrity/claim-anchoring-review-v1.json`: a synthetic three-stage fixture that reproduces each trap without the private material.
- `tests/test_claim_anchoring_review_integrity.py` and `tests/test_portable_checks.py`.

## Transfer rationale and limits

The mechanism is not specific to this review: any agent that critiques texts, reviews an owner's writing, or edits text the owner will publish can treat reading as checking, and topic-scoped rules miss claims made in other settings.

The rules do not ban interpretation; they require labeling it. The claim check applies only to drafts in its trigger. The key-condition probe is an untested adaptation of Wu et al. (EMNLP 2024), limited to verdict-style outputs and never blocking; the owner excluded companion replies because natural replies are not built to restate what they answer. The fixture is synthetic, so passing it does not prove behavior on real texts.
