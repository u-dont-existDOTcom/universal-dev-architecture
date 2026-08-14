# Project Learning Policy Template

Use/adapt this block in project instructions when the project should preserve transferable learning automatically.

## Canonical learning state

GitHub is the canonical durable store for project lessons and project continuity. Chat context and model memory are not sufficient persistence.

At the start of substantive work, read the project's current lesson index first. Follow its current read order, authority rules, and branch/evidence routing rather than relying on remembered file names.

## Codex and GitHub operating baseline

Classify the repository with `.github/codex-repository.json` and apply the risk-adjusted requirements in `patterns/codex-github-operating-system.md`. The root `AGENTS.md` must name the real authority/index files and exact commands rather than copying a stale universal snapshot.

For active software work, use isolated task branches/worktrees, pull requests, deterministic CI, explicit least-privilege workflow permissions, immutable remote Action references, and a protected default branch. Do not claim hosted GitHub controls are enabled unless settings/API evidence verifies them.

Run `scripts/audit_codex_github.py` or the project-approved equivalent as a completion gate. Repository-visible audit success does not prove rulesets, secret scanning, push protection, code scanning, GitHub App permissions, or Actions defaults; verify those separately.

## Durable current-state checkpoint

Treat conversation/context as disposable working RAM, the repository as durable project memory, Git history as the audit/rollback trail, and a concise current-state file as the recovery entry point.

For long-running, multi-step, autonomous, or multi-session work, maintain one obvious current recovery file such as `CURRENT-STATE.md`, `state/CURRENT-STATE.md`, or an equivalent machine-readable file referenced by the project bootstrap/index.

Record the current goal, important decisions and owner constraints, completed work that must not be repeated, current step, remaining work, blockers, relevant artifacts/tests/branches/commits, and the next safe resume action. Update it at meaningful durable boundaries, after consequential decisions or blockers, before handoff, and before claiming multi-step work complete.

After interruption, a fresh thread, context compaction, or a model switch, inspect the repository and recent relevant commits/artifacts, reconcile the checkpoint with actual Git state, identify exactly what survived, repair stale checkpoint data, and resume from the latest verified durable boundary without repeating completed work.

A stale checkpoint never outranks newer owner instructions or verified repository state. A robust project should be resumable by a fresh competent worker with repository access but no old transcript.

## Learning closeout gate

Before reporting any substantive implementation, debugging, editorial, research, detector, reconstruction, or automation pass complete:

1. identify the actual new findings from the pass;
2. disposition each as `promoted`, `provisional`, `project-specific`, `superseded`, or `no-new-lesson`;
3. give a reason for every non-promoted substantive finding;
4. update the project's current lesson summary/index for every promoted local lesson;
5. if a lesson is genuinely transferable across projects, promote the generalized rule with provenance into `u-dont-existDOTcom/universal-dev-architecture`;
6. update the current-state checkpoint/final state when the work is long-running or multi-step;
7. run the repository's exact implementation/research/editorial verification gates;
8. run the repository audit and lesson-integrity check/audit;
9. verify all required gates pass before claiming completion.

Do not ask the owner to remind you to do this.

## Evidence and provenance

Bind dispositions to exact source evidence (content hash plus repo/ref/path when possible). If source evidence changes, review it again; stale dispositions do not carry forward automatically.

Keep project-specific experiments/logs/incidents in the project repo. Universal promotion should preserve the generalized principle, originating repo, evidence pointer, rationale, and limits—not duplicate all raw evidence.

## Repository safety

Existing canonical Git state outranks generated/install snapshots. Never blindly overwrite same-path current repository files with an older bundle. Create missing files or perform an explicit compared merge.

## Backstop

Repositories with substantial ongoing work should enforce both the work-verification and lesson-closeout invariants in CI on push/PR and run a periodic orphan audit that surfaces undispositioned findings automatically.
