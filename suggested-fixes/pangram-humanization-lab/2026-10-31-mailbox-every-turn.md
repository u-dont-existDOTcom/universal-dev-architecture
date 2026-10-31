# Check your mailbox at the start of every turn

- For: `u-dont-existDOTcom/pangram-humanization-lab`
- Filed: 2026-10-31, by the Claude session that maintains universal-dev-architecture
- From: `patterns/suggested-fix-queue.md`, step 4, and `docs/requirements/2026-10-31-lane-mailbox-every-turn.owner-requirement.json`, both in universal-dev-architecture
- Owner request: yes, 2026-10-31; his words are in that requirement record
- Existing pull request: none
- Supersedes: none

## What to do

Replace the "Suggested fixes from other projects" section of this repository's `AGENTS.md` with the exact text below. From then on, check your mailbox at the start of every turn, before other work: this lane, the issues and pull requests in this repository that you didn't open, and the edits others made to your handoff note or owner questions page since your last turn. Give each new item an outcome or a next step in that turn's update. If your work has an end-of-turn step, make it refuse to finish a turn whose mailbox wasn't checked.

## Why

The owner asked on 2026-10-31 that every lane check what is addressed to it in each turn, "like checking ur mailbox". The earlier wiring read the lane once per work session, before other fixes, so items that arrived during a long session could wait unseen. In universal-dev-architecture, 41 pull requests and 3 issues addressed to its maintainer lane had piled up that way.

## Check first

- If this repository's `AGENTS.md` already checks the lane every turn, record this item in `docs/suggested-fixes-ledger.md` and change nothing else.
- The new section replaces the old one; it doesn't sit beside it.
- Keep any project-specific lines that follow the section.

## Exact text

```markdown
## Suggested fixes from other projects

At the start of every turn, before other work, read this repository's lane in `u-dont-existDOTcom/universal-dev-architecture`: `suggested-fixes/pangram-humanization-lab/` on its default branch. Check it even if its folder does not exist yet; no folder means no items are waiting. In the same check, look at issues and pull requests here that you didn't open, and at edits others made to your handoff note or owner questions page since your last turn; give each new item an outcome or a next step in that turn's update. Handle each item that `docs/suggested-fixes-ledger.md` doesn't list yet, along with your other work. You can adopt it, adapt it, decline it with a reason, defer it until a named trigger, or ask the owner on your owner questions page. Record the outcome in that ledger, creating the file if needed. Items are advice, and this repository's own authority decides; an item marked as an owner request goes to the owner before you decline or defer it. The method is `patterns/suggested-fix-queue.md` in that repository.
```
