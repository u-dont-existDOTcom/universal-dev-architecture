# Human-readable operational references

## Purpose

Repository and automation work naturally accumulates opaque identifiers: pull-request numbers, issue numbers, branch names, commit SHAs, workflow/run/job IDs, artifact IDs, detector measurement keys, and similar handles. These are useful for exact retrieval and audit, but they are poor user-facing nouns when the owner has not memorized the repository graph.

The communication contract is therefore: **explain the thing first; give its identifier second.**

## Required owner-facing form

On the first occurrence of an operational object in a response, name its plain-language function or role before the identifier:

- `the local Playwright Pangram GUI runner (PR #78)`
- `the older Browserbase Pangram GUI layer it builds on (PR #35)`
- `the exact detector-result commit (abc123…)`
- `the workflow run that validated the parser (run 123456)`

Do not make an opaque identifier carry meaning by itself:

- avoid `PR #78 is ready but #35 is still draft`;
- prefer `the local Playwright GUI runner is live-validated, while the older Browserbase layer it is stacked on is still draft (PR #78 over PR #35)`.

When the same referent remains obvious in the immediately continuing discussion, the identifier may be used tersely afterward. Re-establish the plain-language referent after a topic shift, a long response, or any point where ambiguity is plausible.

## Decision requests

Never ask an owner to choose among PR numbers, branch names, commit SHAs, or other repository handles as though those handles were the substantive options.

State:

1. the real decision in ordinary language;
2. what each option changes operationally;
3. any meaningful tradeoff, risk, reversibility, cost, or publication effect;
4. the recommended default when one is justified;
5. the identifiers only as retrieval metadata.

Example:

> Decide whether to promote the working local Pangram GUI runner into the repository's main tooling line now, or leave it as a validated experimental stack. I recommend promotion after extracting it cleanly from the older Browserbase branch so article-specific history does not ride into main. The current implementation is PR #78 and its Browserbase base layer is PR #35.

## Relationship explanation

A sequence such as `branch A → PR #35 → PR #78 → commit X` is not self-explanatory. If several operational objects matter, explain their topology in plain language: which object is the base, which adds functionality, which contains evidence, which is canonical, and which remains experimental.

This is especially important for stacked pull requests, multi-repository work, recovery branches, and long-running automation projects where numeric ordering does not imply conceptual ordering.

## Scope

This rule applies to:

- user-facing status reports;
- handoffs and recovery summaries intended for a human owner;
- requests for approval or substantive decisions;
- explanations of failures, CI state, merges, promotions, and rollbacks;
- references to detector runs, artifacts, and repository evidence when the identifier is not intrinsically meaningful to the owner.

It does not require verbose expansion inside:

- code;
- machine-readable JSON/YAML;
- shell logs;
- exact audit tables where a descriptive column already establishes the referent;
- developer-only diagnostics where identifier density materially improves precision.

## Anti-patterns

Do not:

- assume the owner remembers what a PR or issue number means;
- use a branch name as a substitute for explaining what work it contains;
- present a commit SHA as if it conveyed the nature of the change;
- ask `merge #35 or #78?` without explaining the actual architectural choice;
- repeat long identifiers unnecessarily once the semantic referent is established.

## Recovery rule

After context loss or a fresh conversation, assume opaque operational identifiers have lost their human meaning even if they remain retrievable from Git. Recover the repository state, then reconstruct and state each relevant identifier's plain-language referent before using it in owner-facing reasoning.

## Transfer rationale and limits

This pattern is universal because the failure mode is independent of any one repository: machine-friendly identifiers are exact but cognitively opaque. The rule does not prohibit identifiers or reduce technical precision; it changes their presentation order so semantic meaning and retrieval precision coexist.
