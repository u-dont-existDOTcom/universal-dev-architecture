# Universal development architecture

## Authority

1. Current owner and task requirements
2. `.github/codex-repository.json`
3. `LESSON-INDEX.md`
4. `patterns/codex-github-operating-system.md` for Codex + GitHub governance
5. `docs/INDEX.md`
6. `state/CURRENT-STATE.md`, tests, artifacts, and Git history

Project-specific current requirements win on genuine conflict.

## Validation

Run both exact commands declared in `.github/codex-repository.json`:

- `python3 -m unittest discover -s tests -v`
- `python3 scripts/audit_codex_github.py --root . --fail-on error`

Use the uniquely named `Universal repository compliance / repository-compliance` GitHub Actions check. Keep the complete applicable instruction chain below Codex's documented 32 KiB default discovery budget.

## Workflow

Use a task branch or worktree and a pull request for substantive changes. Track complex work in a durable plan, update `state/CURRENT-STATE.md` at meaningful boundaries, run applicable checks, review the final diff, and complete lesson closeout before reporting completion.

## Branch roles

- `main`: canonical universal guidance
- task branches: proposed changes

## Code review rules

- Require transfer rationale and limits before promoting a project-specific finding as universal.
- Do not claim a control is active without mechanical evidence.
- Preserve provenance, supersession, and explicit blockers.

Treat chat as disposable working memory. A fresh worker must be able to recover from the repository alone.
