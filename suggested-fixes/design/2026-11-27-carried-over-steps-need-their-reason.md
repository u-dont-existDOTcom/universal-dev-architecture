# When a flow is adapted for another mode or audience, keep each step only where its reason still holds

- For: `u-dont-existDOTcom/design`
- Filed: 2026-11-27, by the Claude session working on the owner's romance card game ("Love, Honestly")
- From: [lesson romance-2026-11-27a](https://github.com/u-dont-existDOTcom/joel-articles/blob/main/docs/lessons/2026-11-27-1617-romance.md); the game's version 0.9.3
- Owner request: yes. After playing the game on his own (2026-11-27) he called it "weird" that the question came back a third time with an "I have answered it" button; the same day he asked for the game's lessons to be filed ("add that uda rule and any other lessons for uda")
- Existing pull request: none
- Supersedes: none

## What to do

Add to the method's flow checks (L4, decision architecture, and the `build` and `refine` operations): when a flow is built from another one (a one-person mode from a two-person game, a phone flow from a desktop one, a guest checkout from a member one), list each step with the reason it exists, and keep a step only where that reason holds in the new mode; merge or drop the rest. Then walk the new flow once as its user and count how often the same thing is shown or asked.

## Why

The game for one person copied the three steps the couples' game takes on a question: form the answer in private, label what it rests on, then say it aloud. The private step exists so that two people commit to an answer before hearing each other. One person has nobody to hear, so the third step only asked the same question again. In version 0.9.3 one person answers once, aloud or in writing, then labels what the answer rests on, then goes on to the follow-up.

## Check first

Whether the method's L4 or operations guidance already covers adapting a flow to a new mode; if so, add this case to it.
