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

An owner answer, correction, upload, or requested clarification is input to the active task, not a completion event. After incorporating it, continue automatically to the next safe in-scope action while the stated goal remains unfinished. Do not return only an acknowledgment or ask the owner what to do next when repository state, the task plan, or the request already determines that step. Pause only for a genuine missing owner decision, new authority, destructive or irreversible risk, unavailable permission or credential, spending, publication, or access, or an explicit request to stop.

## Owner-facing outbound-link quality

Immediately before surfacing any outbound link to the owner, open the exact destination, follow redirects, and verify that the final page resolves successfully to the intended current content—not an error, 404, dead, parked, or stale page. Search snippets, cached previews, remembered URLs, and earlier checks do not count as verification. If the exact link cannot be verified in the current turn, do not surface it. Never present a broken or unverified link as a recommendation.

## Security and data integrity

- Never commit, print, or place secrets in instructions, prompts, logs, reports, or current-state files.
- Use redacted example configuration and secret stores.
- Treat workflow, release, authentication, migration, protocol, and canonical-evidence files as sensitive.
- Do not execute untrusted pull-request code in a privileged context.
- Do not claim GitHub-hosted controls are enabled unless verified through GitHub.

## Continuity

For active long-running work, update the declared current-state checkpoint at meaningful durable boundaries. It must identify the goal, baseline, active owner constraints, completed work not to repeat, current step, remaining work, blockers, evidence/commits, and next safe action.

After interruption, a fresh thread, context compaction, or model switch: inspect actual repository state and recent relevant commits/artifacts first; identify exactly what survived; repair stale checkpoint data; resume from the latest verified durable boundary without repeating completed work.

## Pre-final continuation gate

On a Mission Control-managed exclusive active task, immediately before any owner-facing terminal response run the current deterministic final-response admission check (for the Mission Control package, `npm run worker:finalize:check -- --worker <worker>`). The check reads Mission Control's own projected ledger; do not self-report completion or blocked status as a substitute.

If the gate returns `terminalResponseAllowed:false`, `mustContinue:true`, or exits with code 75, do **not** send a terminal handoff. Execute or route its `requiredNextAction` within existing authority, then check again only at the next genuine final-response boundary.

Context compaction, response/token pressure, many tool calls, browser/tab cleanup, a checkpoint commit, the end of a batch with a known next ordinal, provider cooldown, retry/backoff, and other recoverable execution pressure are recovery events rather than terminal conditions. Persist state and continue from the first missing/stale action without repeating verified work. During an admitted wait, advance independent safe in-scope work and continue bounded checks of the changing condition.

For managed ChatGPT browser work, a fresh conversation means New chat in the current verified reusable tab. Keep one managed ChatGPT tab in steady state, allow two only for bounded transition/recovery, and fail closed before opening a fourth because three is the absolute hard ceiling. Replace a tab only when the current one is irrecoverably unusable, then close the superseded automation-owned tab immediately after verifying the replacement. Never fan out duplicate task tabs. Include `managedChatGptTabCount` in doctor/status telemetry and clean completed or superseded provider-session tabs deterministically back toward one; bootstrap or pinned automation-owned tabs are not retained merely for history when durable capability exists.

A permitted reasoning-review or external-blocker pause ends only the current execution turn and leaves the root task open/resumable. See `patterns/terminal-response-admission-and-autonomous-continuation.md`.

## Completion gate

Before reporting substantive work complete:

1. inspect the final diff and scope;
2. run every applicable exact verification command and retain evidence;
3. update current/final state;
4. disposition every substantive new finding under the project's lesson-closeout policy;
5. promote genuinely transferable lessons with provenance to `universal-dev-architecture`;
6. run the repository audit and lesson-integrity gate;
7. verify all required gates pass, or state exact blockers and residual risk without claiming completion.
