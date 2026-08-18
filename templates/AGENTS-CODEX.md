# Repository Agent Instructions

## Authority and startup

1. Follow current explicit owner instructions.
2. Read this repository's current authority/index files: `<PROJECT-INDEX>`.
3. Read `.github/codex-repository.json` for repository type, exact commands, risk, and continuity path.
4. Read only task-relevant documents and nested `AGENTS.md` files. More local instructions apply only within their subtree.
5. For universal workflow rules, start at `u-dont-existDOTcom/universal-dev-architecture/LESSON-INDEX.md`; do not rely on a remembered file list.

Never let an older chat, generated bundle, or stale checkpoint overwrite newer verified repository state or owner instruction.

## Repository map

- Canonical project state: `<PATH>`
- Current-state checkpoint: `<PATH OR NOT APPLICABLE>`
- Source: `<PATH>`
- Tests/validation: `<PATH>`
- Generated artifacts: `<PATH OR NONE>`
- Exact evidence/logs: `<PATH>`

## Exact commands

Use the commands declared in `.github/codex-repository.json`. Do not invent replacements.

- Bootstrap: `<COMMAND OR NOT APPLICABLE>`
- Focused test: `<COMMAND>`
- Full test: `<COMMAND>`
- Lint/format: `<COMMAND OR NOT APPLICABLE>`
- Typecheck: `<COMMAND OR NOT APPLICABLE>`
- Build/package: `<COMMAND OR NOT APPLICABLE>`
- Repository audit: `<COMMAND>`

When a required command fails, diagnose from repository state and logs, apply a bounded repair, rerun the affected gate, then rerun the full applicable gate.

## Work protocol

- Inspect repository and Git state before editing.
- For non-trivial work, create/update a durable task plan with objective, constraints, non-goals, acceptance criteria, and verification.
- Work on a task branch or isolated worktree; do not routinely edit the protected default branch directly.
- Preserve unrelated owner changes.
- Keep diffs scoped and commits coherent/reversible.
- Do not hand-edit generated files when a canonical generator exists.
- Record consequential decisions, rejected approaches worth avoiding, and unresolved risk in durable project files rather than only in chat.

When multiple safe in-scope execution approaches achieve the same outcome, choose the better-coordinated approach proportionately without asking the owner to select an execution mode. Default small or tightly coupled work to one agent and no durable plan artifact. Use isolated workspaces, a durable plan and recovery ledger, and delegation plus independent review when safely separable only when concrete complexity, concurrency, or recovery risk justifies them; serialize shared mutable state. This standing permission does not broaden task authority and does not replace substantive owner decisions.

Use the current empirical stack decisions in `u-dont-existDOTcom/universal-dev-architecture`: consult `audits/codex-plugin-stack/activation-rules.md` before enabling an optional component and use `audits/codex-plugin-stack/reports/final-report.md` for evidence and limits. Default to native Codex plus concise owner/repository instructions and exact repository checks, with no optional general workflow plugin. Do not automatically reinstall or reactivate components classified `REMOVE` or `REMOVE — HARMFUL`; leave uncertain or specialized components inactive until the task satisfies their exact trigger.

An owner answer, correction, upload, or requested clarification is input to the active task, not a completion event. After incorporating it, continue automatically to the next safe in-scope action while the stated goal remains unfinished. Do not return only an acknowledgment or ask the owner what to do next when repository state, the task plan, or the request already determines that step. Pause only for a genuine missing owner decision, new authority, destructive or irreversible risk, unavailable permission or credential, spending, publication, or access, or an explicit request to stop.

## Security and data integrity

- Never commit, print, or place secrets in instructions, prompts, logs, reports, or current-state files.
- Use redacted example configuration and secret stores.
- Treat workflow, release, authentication, migration, protocol, and canonical-evidence files as sensitive.
- Do not execute untrusted pull-request code in a privileged context.
- Do not claim GitHub-hosted controls are enabled unless verified through GitHub.

## Continuity

For active long-running work, update the declared current-state checkpoint at meaningful durable boundaries. It must identify the goal, baseline, active owner constraints, completed work not to repeat, current step, remaining work, blockers, evidence/commits, and next safe action.

After interruption, a fresh thread, context compaction, or model switch: inspect actual repository state and recent relevant commits/artifacts first; identify exactly what survived; repair stale checkpoint data; resume from the latest verified durable boundary without repeating completed work.

## Completion gate

Before reporting substantive work complete:

1. inspect the final diff and scope;
2. run every applicable exact verification command and retain evidence;
3. update current/final state;
4. disposition every substantive new finding under the project's lesson-closeout policy;
5. promote genuinely transferable lessons with provenance to `universal-dev-architecture`;
6. run the repository audit and lesson-integrity gate;
7. verify all required gates pass, or state exact blockers and residual risk without claiming completion.
