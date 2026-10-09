# Route checks that judge text to a model: point your AGENTS.md at the pattern-matching fit check

- For: `u-dont-existDOTcom/pangram-humanization-lab`
- Filed: 2026-10-09, by the Claude session working in `u-dont-existDOTcom/joel-articles` (the community article's humanization)
- From: `patterns/reasoning-selection.md` (the pattern-matching fit check and the recurring-finding check), widened to build time in the pull request that files this item; the owner's corrections in joel-articles on 2026-10-07
- Owner request: yes. Joel, 2026-10-09 03:33 UTC, in the joel-articles session: "is there something we should add to UDA so i don't have to explain obvious things to you again like "LLMs understand language" "don't use brittle methods if not needed"?"
- Existing pull request: none here
- Supersedes: none

## What to do

Add the section below to your `AGENTS.md` (or to the file your agents load every turn), unless your agents already reach the pattern-matching fit check at the moment they build or extend a check that judges text.

## Why

The rule has been in `patterns/reasoning-selection.md` since 2026-09-29. It still didn't reach the joel-articles agent when it built a linter check from a word list of abstract nouns, and the owner had to say twice that a model can judge meaning directly: first that the list was brittle, then, after it became a parser with a dictionary lookup, "why can't you simply look at a word and know it's an abstract concept, isn't that what LLMs are great at?" The rule was written for answering questions and was routed only when "selecting a reasoning method or evaluating a claim"; the miss happens while building a check, so the line has to sit where agents build.

## Check first

- Whether your `AGENTS.md` already carries this, or your agents load `patterns/reasoning-selection.md` every turn.
- Whether a check of yours decides meaning with word lists or patterns today. If one does, that's a recurring-finding check to run now, not a reason to skip this item.

## Exact text

```markdown
## Checks that judge text

Before you write or extend anything that decides something about text (a linter rule, a filter, a matcher, a validator, a score or a prompt rule), apply the pattern-matching fit check in `u-dont-existDOTcom/universal-dev-architecture`, `patterns/reasoning-selection.md`. Word lists, regular expressions and parsers fit exact questions: a fixed string, an identifier, a count, a format. Judgments about meaning (tone, register, idiom, stance, relevance, whether two texts say the same thing) go to a model that reads the text. A model reads language; a script only matches it. When a list or pattern helps at all, it only lists candidates, and a model judges each one. When a second finding of the same kind comes in against the same check, redesign the check instead of adding to its list (the recurring-finding check in the same file).
```
