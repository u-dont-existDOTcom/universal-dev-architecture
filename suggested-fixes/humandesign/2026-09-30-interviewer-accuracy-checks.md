# Decide on accuracy checks for the participant interviewer GPT

- For: `u-dont-existDOTcom/humandesign`
- Filed: 2026-09-30, by the Claude session maintaining this architecture's rules
- From: this architecture's claim-integrity pack, `portable/claim-integrity/CHECKS.md`, and `docs/requirements/2026-09-27-claim-anchoring-and-review-integrity.owner-requirement.json`
- Owner request: yes. On 2026-09-27 the owner asked that every public-facing project carry the checks that apply to it; on 2026-09-28 he confirmed that the participant interviewer GPT counts as one (`portable/PUBLIC-APPS.json`).
- Existing pull request: https://github.com/u-dont-existDOTcom/humandesign/pull/42
- Supersedes: none

## What to do

Pull request #42 appends an accuracy section to the three Custom GPT instruction blocks in `reference/custom_gpt/`, adds a note to `docs/36_astrohd_owner_pilot.md`, and adds `tests/unit/test_custom_gpt_accuracy_checks.py`, which pins the phrases and the 8,000-character budget. It merges cleanly today. Review it with your other fixes and choose one:

- merge the full section as it is;
- replace it with the compact version below;
- or adapt it to fit the evidence-record format and the Action schema.

The change alters how evidence records are written. The pull request notes that this is acceptable only while the owner pilot stays a development case with outside participants closed. If the project's own state doesn't confirm that, put that one question on your owner questions page.

Once a version is merged, paste the updated short block into the private interviewer GPT. The block's SHA-256 is the `interviewer_instructions_sha256` receipt, so the receipt only matches what runs after the paste.

Record the outcome in `docs/suggested-fixes-ledger.md`.

## Why

The main risk is the evidence records. A reflection or record saying a participant "always" did something, or "was forced", when they never said so puts invented data into the study. The checks also stop paraphrases in quotation marks, "you never mentioned" claims made without checking, caving or digging in when a participant corrects a reflection, and reveal claims that go beyond what AstroHD returned.

## Check first

- **Size.** The short interviewer block is the deployable one:

  | Branch | Characters | Line breaks counted twice | UTF-8 bytes |
  |---|---|---|---|
  | main | 6,686 | 6,813 | 6,700 |
  | pull request #42 | 7,843 | 7,989 | 7,857 |
  | draft pull requests #23 and #24, which both rewrite the block | 7,789 | 7,933 | 7,807 |

  If #42 merges first, the full section fits. If #23 or #24 merges first, the full section gives 8,946 characters (9,109 on the strict count), about 1,100 over; the compact version needs about 670 characters cut on the strict count.
- **Tone.** Whether the wording reads naturally to participants or makes the interviewer stiff.
- **Fit.** Whether anything conflicts with the evidence-record format or the Action schema.
- **Two optional additions,** left out of the pull request:
  - an expertise line, 113 characters: "If they say they know Human Design well, do not correct their use of its terms from general knowledge alone."
  - a pre-summary self-check, 139 characters: "Before a post-reveal summary, check each claim in it against the returned results and their words; do not call that check independent."

## Exact text

The compact version (724 characters; 737 with line breaks counted twice), which keeps the core of each rule:

```markdown
## Accuracy checks

- Say what the participant said, did, felt, or wanted, including words like always,
  never, kept, willing, or forced, only when their words in this conversation
  support it, in replies and in evidence records. Otherwise call it your reading.
  Add no unstated motive or backstory.
- Put only their exact words in quotation marks.
- Say they never mentioned something only after checking the whole conversation.
- If they correct how you reflected them, return to their words. If they dispute a
  result, recheck the Action response before agreeing or defending.
- After reveal, state what AstroHD predicted only from the returned results, and
  openly correct any conflict with what you said earlier.
```

It drops these details of the full version: rechecking each sentence, the ban on joined quotes, "mark translations", the caveat for a partial search, "neither defend your reading nor adopt one they did not say", labeling estimates, and keeping derived numbers no more precise than their inputs. If more has to be cut, keep the first two lines; they protect the evidence records.
