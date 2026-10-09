# Point your agents at the universal strategy rule: fit the method to the task, and switch when it isn't working

- For: `u-dont-existDOTcom/innerself`
- Filed: 2026-10-09, by the Claude session working in `u-dont-existDOTcom/joel-articles` (the community article's humanization)
- From: the strategy fit and efficacy rule in `patterns/reasoning-selection.md` (Universal core), added in the pull request that files this item: the universal form of Mission Control's `patterns/outcome-advancement-and-strategy-efficacy.md`
- Owner request: yes. Joel, 2026-10-09 05:02 UTC, in the joel-articles session: "the MC rule should have been a UDA rule actually. so fix that. and it's not specific to this exact case." Earlier, 03:33 UTC: "is there something we should add to UDA so i don't have to explain obvious things to you again like 'LLMs understand language' 'don't use brittle methods if not needed'?"
- Existing pull request: none here
- Supersedes: none (an earlier draft of this item in the same unmerged pull request covered only checks that judge text)

## What to do

Add the section below to your `AGENTS.md` (or to the file your agents load every turn), unless your agents already reach the strategy fit and efficacy rule in `patterns/reasoning-selection.md` on every substantive task.

## Why

The rule that work is steered by the outcome, and that a failing method is replaced rather than patched again, lived only in Mission Control's companion pattern, written for a supervisor with receipts and dashboards. Agents doing ordinary work didn't read it as their own, so the owner kept pointing out the better method himself: that a model can judge meaning a word list can't, that a brittle method wasn't needed, that the same fix kept failing. He asked for the general rule, not one more rule for one case.

## Check first

- Whether your `AGENTS.md` already carries this, or your agents load `LESSON-INDEX.md` and select entry 38 ("For any substantive or iterative task, when choosing, building or switching a method") on every substantive task.
- Whether a method in your project is being patched again for the same kind of failure today. If one is, that's a switch to make now, not a reason to skip this item.

## Exact text

```markdown
## Method fit and switching

For every substantive or iterative task, apply the strategy fit and efficacy rule in `u-dont-existDOTcom/universal-dev-architecture`, `patterns/reasoning-selection.md` (Universal core). Before you choose or build a method, say what the task has to decide or produce, and pick the capability that fits it: a model reads and judges language, meaning, tone and intent; code computes exact, structural and repeatable things; a test or a measurement answers what can be observed. Don't build a brittle stand-in for a capability you already have. Judge progress by the owner's outcome, not by the work done. When the same kind of fix keeps being needed, attempts fail the same way, or the outcome stays flat, say why and switch to a causally different approach, not the same one renamed. Report a lack of progress yourself and keep going; ask the owner early, and only for decisions or knowledge that are theirs.
```
