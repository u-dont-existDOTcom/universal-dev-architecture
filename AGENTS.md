# Universal development architecture

## Authority

1. Current owner and task requirements
2. `LESSON-INDEX.md`
3. `docs/INDEX.md`
4. The relevant current pattern
5. `state/CURRENT-STATE.md`, tests, artifacts, and Git history

Project-specific current requirements win on genuine conflict.

## Validation

Use the `repo-policy` GitHub Actions check. Keep this file concise and below Codex's default instruction budget.

## Workflow

Use a task branch or worktree and a pull request for substantive changes. Track complex work in `docs/exec-plans/active/`, update `CURRENT-STATE.md` at durable boundaries, run applicable checks, review the final diff, and complete lesson closeout before reporting completion.

When multiple safe in-scope execution approaches achieve the same outcome, choose the better-coordinated approach without asking the owner to select an execution mode: use isolated workspaces, a durable plan and recovery ledger, delegation plus independent review when safely separable, and serialize shared mutable state. This standing permission does not broaden task authority and does not replace substantive owner decisions.

## Branch roles

- `main`: canonical universal guidance
- task branches: proposed changes

## Code review rules

- Require transfer rationale and limits before promoting a project-specific finding as universal.
- Do not claim a control is active without mechanical evidence.
- Preserve provenance, supersession, and explicit blockers.

Treat chat as disposable working memory. A fresh worker must be able to recover from the repository alone.
