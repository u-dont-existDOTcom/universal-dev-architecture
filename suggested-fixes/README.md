# Suggested-fix lanes

Every project that uses this architecture's rules has a lane here: suggestions filed by agents working elsewhere, waiting for that project's own agent to decide. Its folder, `suggested-fixes/<repository>/`, is created when the first item is filed. Agents check the lane at the start of every turn, whether or not its folder exists yet; a project with no directory here has no items waiting. The method is `patterns/suggested-fix-queue.md`.

The table lists the projects whose agents are wired to check their lanes; it is not the list of all projects that have a lane.

| Lane | Project | Wired |
|---|---|---|
| `AskRigor/` | `u-dont-existDOTcom/AskRigor` | loads this repository's root `AGENTS.md` every turn |
| `innerSignalGraph/` | `u-dont-existDOTcom/innerSignalGraph` | wiring section in its `AGENTS.md` |
| `humandesign/` | `u-dont-existDOTcom/humandesign` | wiring section in its `AGENTS.md` |
| `pangram-humanization-lab/` | `u-dont-existDOTcom/pangram-humanization-lab` | wiring section in its `AGENTS.md` |
| `joel-articles/` | `u-dont-existDOTcom/joel-articles` | wiring section in its `AGENTS.md` |
| `design/` | `u-dont-existDOTcom/design` | wiring section in its `AGENTS.md` |
| `creativeTailSampling/` | `u-dont-existDOTcom/creativeTailSampling` | wiring section in its `AGENTS.md` |
| `AskRigor-lessons/` | `u-dont-existDOTcom/AskRigor-lessons` | wiring section in its `AGENTS.md` |
| `sites/` | `u-dont-existDOTcom/sites` | wiring section in its `AGENTS.md` |
| `innerself/` | `u-dont-existDOTcom/innerself` | wiring section in its `AGENTS.md` |
| `love-honestly/` | `u-dont-existDOTcom/love-honestly` | wiring section in its `AGENTS.md` |
| `communities/` | `u-dont-existDOTcom/communities` | wiring section in its `AGENTS.md` |

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

Write the item as an extract in your own words, not a transcript of the chat: quote only the short excerpts that show the problem, and leave out personal details (step 3 of the pattern; this repository is public). `## Exact text` is for the text to add to the project, not for conversation output.

This repository is public, so an item must be safe to publish. Put private detail in the target repository, in an issue or pull request there, and link to it.

## Wiring section for a project's `AGENTS.md`

A project whose agents may not load this repository's root `AGENTS.md` carries this section, with `<repository>` replaced by its name:

```markdown
## Suggested fixes from other projects

At the start of every turn, before other work, read this repository's lane in `u-dont-existDOTcom/universal-dev-architecture`: `suggested-fixes/<repository>/` on its default branch. Check it even if its folder does not exist yet; no folder means no items are waiting. In the same check, look at new issues and pull requests here and new comments and reviews on any of them, including replies on your own, and at edits others made to your handoff note or owner questions page since your last turn. Give each new item an outcome or a next step in that turn's update; if a place can't be read, say which, what failed and when you'll try again. Handle each item that `docs/suggested-fixes-ledger.md` doesn't list yet, along with your other work. You can adopt it, adapt it, decline it with a reason, defer it until a named trigger, or ask the owner on your owner questions page. Record the outcome in that ledger, creating the file if needed. Items are advice, and this repository's own authority decides; an item marked as an owner request goes to the owner before you decline or defer it. The method is `patterns/suggested-fix-queue.md` in that repository.
```

When a project starts using these rules, the agent carrying them in adds this section unless its agents load this repository's root `AGENTS.md` every turn. Projects wired with the earlier text, which began "Before starting other fixes here", each have an item in their lane, dated 2026-10-31, to update it. For an existing project that isn't wired yet, the first agent to file an item opens one pull request there adding only this section; an unwired project cannot read its lane. Add the project to the table above when the wiring is in place.

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
