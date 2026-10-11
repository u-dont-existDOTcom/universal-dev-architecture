# Written rules and the checks that enforce them

## Status

Current universal pattern. Origin: **OWNER**, 2026-10-11. A writing workstream kept a written list of AI-sounding words and phrases ("tells") that drafts must avoid, and a linter that was supposed to check the mechanical ones before any detector run. Two of the listed words, "boring" and "quietly", had been on the list since 2026-08-26, but the linter checked "boring" only from 2026-10-07 and "quietly" only from 2026-10-10, so drafts carried them to the owner. When an assistant mentioned that these words "were in the tells list" but never checked, the owner asked for the failure to be debugged, and for the lesson to be kept here, because "any time something is not executing as intended it should be debugged". Later that day, after rewriting part of a section himself, the owner added a second rule: "it's a rule i hope that when i show you changes (and you agree) you need to fix yourself so you could have figured it out yourself (minus info you couldn't have, like my own experience)" (rule 7). Owner requirement: `docs/requirements/2026-10-11-written-rule-checker-coverage.owner-requirement.json`.

## Problem

A rule written in prose can name something a machine is meant to check: a banned word, a phrase, a required field, a forbidden command. The prose and the checker are kept in different places, by different turns, often by different agents. Nothing ties them together, so they drift apart without anyone noticing:

- **A rule with no check.** A new item goes into the written list, and no one adds it to the checker. Everyone reading the list believes it is enforced. In the reference case, an audit of 131 written tells found 82 that a pattern could find; the linter checked 51 and missed 31.
- **A check that can't fire.** The checker has a rule for the item, but the rule can never match real input: it looks for a pattern across two sentences while testing one sentence at a time, or matches a straight apostrophe when the text has a curly one, or matches only capitals. It reports a clean result that means nothing.
- **A flag that gets waved through.** The check fires, and the reviewer keeps the flagged text for a reason the rule doesn't allow (in the reference case, "it's the published wording", though the published text was itself machine-drafted).

Each looks like the rule working. The failure shows only when someone notices that a listed item reached the output.

A fourth failure has no written rule to point to: **a check nobody wrote.** The owner rewrites part of the work, and the change is plainly right. A signal was already there (a reviewer's question, a written rule, the text around the passage) and nothing acted on it, or no check covered the case at all. Unless each such change is traced to its cause, the owner keeps making the same kind of change by hand.

## Rule

1. **A written rule that names a mechanical check is a control.** It is not active until a check implements it and a test shows the check firing on an example of the thing the rule names (root `AGENTS.md`, Code review rules: "Do not claim a control is active without mechanical evidence"; `patterns/logic-failure-map.md`, LF-7.1 and LF-7.3).
2. **Keep a registry that ties each written item to its check.** One machine-readable file lists every item the written rules name: where it is written (file and the exact quoted words), whether a machine can check it, the check that does, and one example that should trigger it. Items only a reader can judge are listed too, with the reason, so the registry is the complete inventory.
3. **Test the registry, both ways.** A test runs the checker on every mechanical item's example and fails when the named check doesn't fire. It also fails when a registry entry's quoted words are no longer in the file it names, so a rewritten rule can't leave a stale entry behind.
4. **Add to both in the same change.** A change that adds an item to the written rules adds its registry entry, and its check and example when it is mechanical, in the same commit. A reviewer who sees one without the other treats the change as incomplete.
5. **When something doesn't run as intended, debug the mechanism, not the instance.** Find why it didn't run: a missing check, a check that can't match, an input it never sees, a disposition that waved it through. Fix that cause. Then audit every sibling item that shares the cause (the same list, the same matcher, the same normalization), because one instance found by the owner usually means more that nobody has found. Add the test that would have caught it. Record the finding on the logic-failure map (`patterns/logic-failure-map.md`, rule 1).
6. **A flag is resolved by the rule's own exceptions, not by where the text came from.** When a check flags text, the reviewer keeps it only for a reason the rule itself gives. "It was already there" is not one of those reasons unless the rule says so.
7. **An owner's change you agree with is a check that didn't run.** When the owner shows you a change to your work (a rewrite, a cut, a move) and you agree with it, find what would have let you make it yourself: the signal you already had and why nothing acted on it, or the check that didn't exist. Fix or add that check as in rule 5, and tell the owner in a line or two what it was. Leave out only what you couldn't have known, such as the owner's own experience or a preference they hadn't stated.

## Bounds

- This adds no gate on work that has no written mechanical rules. It applies where prose and a checker are meant to agree.
- A registry entry records what is checked; it does not make a judgment rule mechanical. Rules about meaning stay with a reader or a model judge.
- The registry test proves that each check fires on its example. It does not prove the check catches every phrasing a reader would call the same thing.
- Rule 7 covers changes you agree with. When you disagree with an owner's change, say why; that is a discussion, not a missed check.

## Reference implementation (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

The owner's article repository keeps its written tells in `AGENTS.md`, `SKILL.md`, `docs/HUMANIZATION-GATE.md` and two files in `tools/humanization/`, and the linter `tools/humanization/tells_lint.py`. The 2026-10-11 audit (`tools/humanization/TELLS-COVERAGE-20261011.md`) ran the linter on a test sentence for each of the 82 mechanical tells. Besides the 31 unchecked items it found four matchers that missed a curly apostrophe, a two-sentence pattern tested one sentence at a time, a case-sensitive acronym list, and a comma the "Sure, but" check required. The fix adds `tools/humanization/tells_registry.json` and a test that runs every mechanical example through the linter.

The second rule came from a rewrite the owner made to one section that evening. Traced change by change: a sentence he cut as redundant had drawn a reviewer's question about its key term, and the article's own review rules say such a question can mean the term doesn't belong, but it went to him as a question; his chat answer had been pasted in as article text, though a reviewer had flagged it; a paragraph inserted mid-section had left the next one's "Also" pointing at the wrong paragraph, and no sense check had been written for the paragraph after the insert; a phrase that says the same thing twice ("required as pre-reqs") had no check; and a contradiction a stance review had reported four rounds running had been relayed to him instead of resolved. Each got a check or a rule in the gate (`docs/HUMANIZATION-GATE.md`, "What Joel's message of 2026-10-11 18:35 UTC taught"), the redundant phrase a linter rule (O38) with a registry entry. The positions in his rewrite were his own, so nothing was traced for them.
