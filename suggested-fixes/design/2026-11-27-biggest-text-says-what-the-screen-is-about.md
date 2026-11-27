# Make the biggest text on a screen say what the screen is about

- For: `u-dont-existDOTcom/design`
- Filed: 2026-11-27, by the Claude session working on the owner's romance card game ("Love, Honestly")
- From: [lesson romance-2026-11-26d](https://github.com/u-dont-existDOTcom/joel-articles/blob/main/docs/lessons/2026-11-26-2326-romance.md); the game's versions 0.9.1 and 0.9.2
- Owner request: yes. The rule is his (2026-11-26: "the top text should be the biggest heading, because people read the biggest one first and that's the one that explains what this is about"), and on 2026-11-27 he asked for the game's lessons to be filed ("add that uda rule and any other lessons for uda")
- Existing pull request: none
- Supersedes: none

## What to do

Add to the method's first check of a screen, its reading order (L0 and L1 in `core/PERCEPTUAL-DIAGNOSIS.md`, or the hierarchy guidance it points to): the biggest text is read first, so it names what the screen is about, often as the question the screen asks. An instruction ("Pick the one that fits best.") goes in a smaller line under that heading, starting where the heading starts; it is never the heading, and the screen doesn't open with a small line above the heading. On a step that asks about an earlier answer, the earlier question is shown under the heading, smaller, as what is being answered ("Your answer to ..."), not as the heading.

## Why

Two screens of the card game got this wrong the same way. The one-person label screen put a small line naming the step over a big instruction, so the eye went to the instruction and had to work back up to learn what it was for. Step 2 ("What is this answer based on?") showed the card's question as its biggest text, so the screen read as asking the question again. Both came from copying a neighbouring screen's layout without asking what the new screen is about.

## Check first

Whether the method already states a reading-order rule for headings and instructions. If it does, add these two cases to it as examples rather than writing a second rule.
