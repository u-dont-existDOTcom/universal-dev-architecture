# Short-lived pull requests: merge when ready, fix conflicts yourself

## Status

Current universal pattern. Origin: **OWNER** request, 2026-11-06, after another lane told him that his pull requests keep conflicting because nothing merges them automatically: "can we then add that UDA or what". Owner requirement: `docs/requirements/2026-11-06-short-lived-pull-requests.owner-requirement.json`.

## Problem

A pull request conflicts when the branch it targets, usually main, changes the same lines while it waits. The longer it stays open, the more other work merges around it. Without automation, a pull request merges only when someone is there to merge it: an agent whose turn has ended, or the owner, who is then told "pr has conflicts".

On 2026-11-06 the owner's seven repositories had 130 open pull requests: 41 with conflicts, 61 mergeable but behind main, 22 ready. Of the 41 with conflicts, 36 were more than a week old and 30 were drafts. Most of the conflicts sat in old or abandoned work, not in fresh pull requests.

There are three causes, and automation fixes one of them:

1. **Waiting.** A ready pull request waits for a click while other work merges. Merging it the moment its gates pass removes the wait, and GitHub's auto-merge does that with no one present.
2. **Leftovers.** Drafts and replaced pull requests stay open and keep conflicting. Only closing them helps.
3. **Shared lines.** Lanes edit the same lines of the same files: a running list, the next number in a sequence, a count kept by hand. Two such pull requests conflict however fast they merge.

## Rule

1. **Merge when the gates pass.** A lane merges its own pull request in the turn its gates pass, under the authority it has for that repository (`patterns/agent-completable-merge-gates.md`). If a required check is still running when the turn ends, the lane turns on auto-merge (`gh pr merge <number> --auto`, with the repository's merge method, such as `--squash`), so GitHub merges the pull request when the check passes. That needs the repository to allow auto-merge, and its rules must enforce the gates (`patterns/codex-github-operating-system.md`, **Merge discipline**). When the gate is the owner's yes, the pull request is made ready first, up to date and free of conflicts, and auto-merge goes on right after his yes.
2. **Conflicts are the lane's job.** Before asking for a merge, before merging, and whenever its pull request shows conflicts, the lane updates the branch from the branch it targets and resolves the conflicts itself. It keeps what each side meant to do: both changes where they fit together, and where they contradict, the one current authority supports, with the other side's useful work kept and its source noted. Then it runs its checks again. A conflict goes to the owner only when it is a real decision that current authority can't settle, as one question with a recommendation (`patterns/worker-self-remediation-before-owner-interruption.md`). A branch that is only behind is updated (`gh pr update-branch <number>`) and its checks run again.
3. **No pull request sits.** At each turn's mailbox check (`patterns/suggested-fix-queue.md`), the lane lists its own open pull requests with their state (ready, behind, conflicting or draft) and their age, and gives each one an outcome: merge it, fix it or close it. A pull request it has handed over, such as one labeled for this repository's maintainer lane (`patterns/suggested-fix-queue.md`, rule 9), is the holder's to decide: the lane records who holds it and the next step, and changes it only if the holder asks. A draft it won't finish, or one that another change replaced, is closed with one line saying why and what replaced it. A pull request open for more than a week has its reason and next step in the lane's handoff.
4. **Keep off shared lines.** Prefer one file per item to one long shared file. Prefer collision-free names, such as a date and a slug, to the next number in a sequence. Prefer counts computed by a script to counts kept by hand. When a change must touch a shared line, it touches only that line and merges fast. When a repository's own rules make every change edit the same lines, the fix is to change the repository.
5. **Start from the current target branch.** A new pull request branches from the branch it will merge into, as that branch is now. That is the repository's default branch (main in most repositories), unless the pull request targets another branch on purpose, such as a release branch. It doesn't branch from another open pull request's branch unless it is deliberately stacked on it and says so. A stacked pull request is updated from the branch it is stacked on.

## What GitHub offers

Checked on 2026-11-06 in GitHub's documentation ("Automatically merging a pull request"; "Managing a merge queue"):

- **Auto-merge** merges a pull request "automatically after all required reviews and status checks pass". It must be allowed in the repository's settings, and GitHub offers it only while something is still required. It is available in public repositories on GitHub Free, and in private repositories on paid plans.
- **A merge queue** keeps branches up to date so that authors don't have to. GitHub offers it only in repositories owned by an organization (public ones, or private ones on GitHub Enterprise Cloud), not in a personal account's repositories. It removes a pull request that has conflicts and does not resolve them.
- **"Up to date before merging"**: with this rule on, every merge leaves the other open pull requests behind main, and auto-merge waits until the branch is updated. Step 2 covers that.

Neither tool resolves a conflict. Both merge only what already merges cleanly.

## Existing-work basis

- `patterns/codex-github-operating-system.md`, section 6: the baseline ruleset, merge discipline, auto-merge only after checks and reviews are enforced, and deleting merged branches.
- `patterns/agent-completable-merge-gates.md`: gates the agent can complete, and one pull request for the owner to merge.
- `patterns/parallel-chat-write-isolation.md`: one writer per branch. This pattern covers the step from branch to main.
- `patterns/suggested-fix-queue.md`: the mailbox check where step 3 happens.

## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

On 2026-11-06 a lane editing the owner's gut-health article had its pull request conflict while it waited for his merge. During that wait, another article lane merged two pull requests into the same shared files: the writing rules every lane reads, and the next number in the shared list of lessons. That lane merged each of its pull requests within a minute of opening it; the gut lane's waited for the owner.

In this repository, every new pattern edits the same count lines in `docs/uda-enforcement-coverage.md` and the end of `LESSON-INDEX.md`. Two pattern pull requests open at the same time therefore always conflict.

## Limits

- What GitHub offers depends on its plans and settings, which change; check its current documentation.
- This pattern grants no merge authority. The owner and each repository's gates decide who may merge what.
- A static test checks this text and its routing. Whether lanes act on their open pull requests shows only in their turns (WORKFLOW_ONLY).
