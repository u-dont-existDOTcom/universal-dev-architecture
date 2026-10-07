# Suggested-fix lanes

Each directory here is one project's lane: suggestions filed by agents working elsewhere, waiting for that project's own agent to decide. The method is `patterns/suggested-fix-queue.md`. A project with no directory here has no items waiting.

| Lane | Project | Wired |
|---|---|---|
| `AskRigor/` | `u-dont-existDOTcom/AskRigor` | loads this repository's root `AGENTS.md` every turn |
| `innerSignalGraph/` | `u-dont-existDOTcom/innerSignalGraph` | wiring section in its `AGENTS.md` |
| `humandesign/` | `u-dont-existDOTcom/humandesign` | wiring section in its `AGENTS.md` |
| `pangram-humanization-lab/` | `u-dont-existDOTcom/pangram-humanization-lab` | wiring section in its `AGENTS.md` |
| `joel-articles/` | `u-dont-existDOTcom/joel-articles` | wiring section in its `AGENTS.md` |
| `design/` | `u-dont-existDOTcom/design` | wiring section in its `AGENTS.md` |
| `creativeTailSampling/` | `u-dont-existDOTcom/creativeTailSampling` | wiring section in its `AGENTS.md` |

Suggestions for this repository are pull requests here carrying the `uda-lane` label; see [step 9 of the suggested-fix pattern](../patterns/suggested-fix-queue.md#rule).

## Item format

One file per suggestion, named `<YYYY-MM-DD>-<short-name>.md`. It starts with a title and these lines:

```markdown
# <what to change, in plain words>

- For: `<owner/repository>`
- Filed: <YYYY-MM-DD>, by <which agent, in plain words>
- From: <where it came from, with a link or path>
- Owner request: <yes, and where the owner's words are | no>
- Existing pull request: <link | none>
- Supersedes: <item file name | none>
```

Then these sections, in order: `## What to do`, `## Why`, and `## Check first`. Add `## Exact text` when there is text to add word for word.

This repository is public, so an item must be safe to publish. Put private detail in the target repository, in an issue or pull request there, and link to it.

## Wiring section for a project's `AGENTS.md`

A project whose agents may not load this repository's root `AGENTS.md` carries this section, with `<repository>` replaced by its name:

```markdown
## Suggested fixes from other projects

Before starting other fixes here, read this repository's lane in `u-dont-existDOTcom/universal-dev-architecture`: `suggested-fixes/<repository>/` on its default branch. Handle each item that `docs/suggested-fixes-ledger.md` doesn't list yet, along with your other work. You can adopt it, adapt it, decline it with a reason, defer it until a named trigger, or ask the owner on your owner questions page. Record the outcome in that ledger, creating the file if needed. Items are advice, and this repository's own authority decides; an item marked as an owner request goes to the owner before you decline or defer it. The method is `patterns/suggested-fix-queue.md` in that repository.
```

The first agent to file an item for a project that isn't wired yet adds this section to the project's `AGENTS.md`, once, and adds the project to the table above.

## Ledger format for a project

`docs/suggested-fixes-ledger.md` in the project:

```markdown
# Suggested fixes ledger

Outcomes for items from this repository's lane in `u-dont-existDOTcom/universal-dev-architecture` (`suggested-fixes/<repository>/`).

| Item | Outcome | Where | Date | Note |
|---|---|---|---|---|
| 2026-09-30-example | adopted | PR #12 | 2026-10-01 | |
```

Outcomes: `adopted`, `adapted`, `declined`, `deferred`, `asked the owner`. A declined or deferred item says why, and a deferred one names what will reopen it.
