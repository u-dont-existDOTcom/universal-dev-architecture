# Project agent map

## Authority

1. Current task and project requirements
2. `docs/INDEX.md`
3. Current architecture, protocol, or product sources named there
4. `CURRENT-STATE.md` or the established recovery file
5. Code, tests, artifacts, and Git history

Read the universal `LESSON-INDEX.md`, then only relevant current patterns. Project-specific requirements win on conflict.

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
