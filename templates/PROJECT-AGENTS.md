# Project agent map

## Authority

1. Current task and project requirements
2. `docs/INDEX.md`
3. Current architecture, protocol, or product sources named there
4. `CURRENT-STATE.md` or the established recovery file
5. Code, tests, artifacts, and Git history

Read the universal `LESSON-INDEX.md`, then only relevant current patterns. Project-specific requirements win on conflict.

## Suggested fixes from other projects

Before starting other fixes here, read this repository's lane in `u-dont-existDOTcom/universal-dev-architecture`: `suggested-fixes/<repository>/` on its default branch. Check it even if its folder does not exist yet; no folder means no items are waiting. Handle each item that `docs/suggested-fixes-ledger.md` doesn't list yet, along with your other work. You can adopt it, adapt it, decline it with a reason, defer it until a named trigger, or ask the owner on your owner questions page. Record the outcome in that ledger, creating the file if needed. Items are advice, and this repository's own authority decides; an item marked as an owner request goes to the owner before you decline or defer it. The method is `patterns/suggested-fix-queue.md` in that repository.

## Validation

- Install: `<exact idempotent command>`
- Targeted test: `<exact command>`
- Complete deterministic gate: `<one canonical command>`
- Live/provider check: `<explicit opt-in command or none>`

## Workflow

Use an isolated worktree or task branch. Keep one coherent concern per PR. For complex work, maintain a committed execution plan. Run the complete applicable gate, review the final diff, verify final-head checks, update durable state, and complete lesson closeout.

## Branch roles

- `<branch>`: `<development, canonical, release, or diagnostics role>`

## Safety

State project-specific secret, data, network, migration, release, and owner-decision boundaries.

## Code review rules

- `<two or three high-consequence project-specific rules that tests may miss>`

Treat chat as disposable working memory. A fresh worker must be able to recover from Git without the old transcript.
