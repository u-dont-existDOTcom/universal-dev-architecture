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

When multiple safe in-scope execution approaches achieve the same outcome, choose the better-coordinated approach without asking the owner to select an execution mode: use isolated workspaces, a durable plan and recovery ledger, delegation plus independent review when safely separable, and serialize shared mutable state. This standing permission does not broaden task authority and does not replace substantive owner decisions.

When coordinating work from a ChatGPT Chat, keep Chat as the owner-facing supervisor for discussion, editorial judgment, synthesis, repository reading, source comparison, and actions available through its current connectors or tools. Repository involvement alone is not a reason to create a separate Work task. When the next step genuinely requires terminal or shell execution, local-filesystem tooling unavailable in Chat, tests or scripts, command-line Git, or another execution-heavy capability Chat does not have, there is standing permission to create one bounded ChatGPT Work task in the appropriate local or cloud environment. Follow that task, retrieve its result, and continue in the originating Chat without asking the owner to shuttle prompts, logs, files, or results. This routing rule does not broaden task scope, permissions, spending authority, publication authority, or destructive-action authority.

## Supervised long-task handoffs

For any long work task that needs supervision, keep the originating Chat as the owner-facing supervisor and GitHub as the canonical durable state. Before handing execution to a fresh Codex worker or requesting higher-level supervision, write the task instructions and a full self-contained handoff into the task's canonical GitHub issue, pull request, or committed recovery artifact. Include the goal and acceptance criteria, authority and constraints, relevant background and decisions, completed/current/remaining work, exact evidence and repository locations, blockers and uncertainty, and the next safe action. The handoff must support resumption without the old chat while still obeying existing secret, privacy, and data-sharing rules.

Give the owner one very short paste-ready bootstrap instruction: `Resume the long task from <GitHub handoff URL/path>; verify current state and continue until complete unless a genuine owner tradeoff is required.`

When higher-level supervision is needed and the supervisor does not need direct GitHub access, use Brave to open a new Pro chat and paste the complete handoff and all context needed for judgment into that chat; a GitHub link alone is insufficient because Pro chats in Brave cannot reliably access GitHub. If the supervisor must access GitHub, use GPT with extra-high reasoning instead of Pro. Also use extra-high without Pro when the task is not complex enough to justify Pro. Default therapy-bot work to Pro for therapy or clinical-conceptual considerations, AskRigor work to Pro for research-methodology or scientific considerations, and article work to extra-high without Pro unless it is unusually complex.

Stop only when the Pro supervisor identifies a genuine owner decision involving material tradeoffs or another existing authority boundary requires owner input. Surface the choice, consequences, and recommended default to the owner, and do not cross the affected boundary. Otherwise apply the supervision and continue automatically without asking for approval. Write supervisory decisions and updated status back to the canonical GitHub handoff before continuing. If Brave or Pro is unavailable, record the exact capability failure in the GitHub handoff, use an available GPT extra-high route when adequate, and continue; pause only when required supervision remains unavailable or another genuine pause boundary applies.

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
