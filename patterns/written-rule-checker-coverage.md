# Written rules and the checks that enforce them

## Status

Current universal pattern. Origin: **OWNER**, 2026-10-11. A writing workstream kept a written list of AI-sounding words and phrases ("tells") that drafts must avoid, and a linter that was supposed to check the mechanical ones before any detector run. Two of the listed words, "boring" and "quietly", had been on the list since 2026-08-26, but the linter checked "boring" only from 2026-10-07 and "quietly" only from 2026-10-10, so drafts carried them to the owner. When an assistant mentioned that these words "were in the tells list" but never checked, the owner asked for the failure to be debugged, and for the lesson to be kept here, because "any time something is not executing as intended it should be debugged". Owner requirement: `docs/requirements/2026-10-11-written-rule-checker-coverage.owner-requirement.json`.

## Problem

A rule written in prose can name something a machine is meant to check: a banned word, a phrase, a required field, a forbidden command. The prose and the checker are kept in different places, by different turns, often by different agents. Nothing ties them together, so they drift apart without anyone noticing:

- **A rule with no check.** A new item goes into the written list, and no one adds it to the checker. Everyone reading the list believes it is enforced. In the reference case, an audit of 131 written tells found 82 that a pattern could find; the linter checked 51 and missed 31.
- **A check that can't fire.** The checker has a rule for the item, but the rule can never match real input: it looks for a pattern across two sentences while testing one sentence at a time, or matches a straight apostrophe when the text has a curly one, or matches only capitals. It reports a clean result that means nothing.
- **A flag that gets waved through.** The check fires, and the reviewer keeps the flagged text for a reason the rule doesn't allow (in the reference case, "it's the published wording", though the published text was itself machine-drafted).

Each looks like the rule working. The failure shows only when someone notices that a listed item reached the output.

## Rule

1. **A written rule that names a mechanical check is a control.** It is not active until a check implements it and a test shows the check firing on an example of the thing the rule names (root `AGENTS.md`, Code review rules: "Do not claim a control is active without mechanical evidence"; `patterns/logic-failure-map.md`, LF-7.1 and LF-7.3).
2. **Keep a registry that ties each written item to its check.** One machine-readable file lists every item the written rules name: where it is written (file and the exact quoted words), whether a machine can check it, the check that does, and one example that should trigger it. Items only a reader can judge are listed too, with the reason, so the registry is the complete inventory.
3. **Test the registry, both ways.** A test runs the checker on every mechanical item's example and fails when the named check doesn't fire. It also fails when a registry entry's quoted words are no longer in the file it names, so a rewritten rule can't leave a stale entry behind.
4. **Add to both in the same change.** A change that adds an item to the written rules adds its registry entry, and its check and example when it is mechanical, in the same commit. A reviewer who sees one without the other treats the change as incomplete.
5. **When something doesn't run as intended, debug the mechanism, not the instance.** Find why it didn't run: a missing check, a check that can't match, an input it never sees, a disposition that waved it through. Fix that cause. Then audit every sibling item that shares the cause (the same list, the same matcher, the same normalization), because one instance found by the owner usually means more that nobody has found. Add the test that would have caught it. Record the finding on the logic-failure map (`patterns/logic-failure-map.md`, rule 1).
6. **A flag is resolved by the rule's own exceptions, not by where the text came from.** When a check flags text, the reviewer keeps it only for a reason the rule itself gives. "It was already there" is not one of those reasons unless the rule says so.

## Bounds

- This adds no gate on work that has no written mechanical rules. It applies where prose and a checker are meant to agree.
- A registry entry records what is checked; it does not make a judgment rule mechanical. Rules about meaning stay with a reader or a model judge.
- The registry test proves that each check fires on its example. It does not prove the check catches every phrasing a reader would call the same thing.

## Reference implementation (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

The owner's article repository keeps its written tells in `AGENTS.md`, `SKILL.md`, `docs/HUMANIZATION-GATE.md` and two files in `tools/humanization/`, and the linter `tools/humanization/tells_lint.py`. The 2026-10-11 audit (`tools/humanization/TELLS-COVERAGE-20261011.md`) ran the linter on a test sentence for each of the 82 mechanical tells. Besides the 31 unchecked items it found four matchers that missed a curly apostrophe, a two-sentence pattern tested one sentence at a time, a case-sensitive acronym list, and a comma the "Sure, but" check required. The fix adds `tools/humanization/tells_registry.json` and a test that runs every mechanical example through the linter.
