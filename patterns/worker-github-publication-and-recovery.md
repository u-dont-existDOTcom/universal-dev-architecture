# Worker GitHub publication and recovery

Status: current universal repository-worker pattern.

## Problem

Parallel repository work can finish correctly inside an isolated scratch worktree yet still fail as a deliverable because the coordinator cannot retrieve that local commit. A clean local commit is evidence that execution bytes were preserved in that workspace; it is **not** evidence that the integration owner can fetch, review, or merge them.

A related failure occurs when shell `git push` lacks credentials even though an authorized connected GitHub API/connector can publish the same already-approved worker output. Treating the shell transport failure as an owner blocker wastes work and transfers routine recovery to the owner.

A third failure occurs at directive authoring: the worker is told to “commit” or “save to the repo” without a precise publication contract, so the worker stops at a local commit or refuses remote branch publication while the coordinator expects merge-ready output.

## Trigger

Apply this pattern when any of the following is true:

- a worker/child branch produces repository output that a coordinator or integrator must later consume;
- a task runs in an isolated scratch worktree, ephemeral workspace, or separate conversation;
- worker closeout claims a local Git commit as completion;
- shell Git publication fails or credentials are unavailable;
- the coordinator cannot resolve a reported worker commit/branch remotely;
- a worker directive expects repository integration but does not state the publication destination and completion evidence.

## Core invariant

**Repository worker completion is destination-bound.**

For work intended for later GitHub integration:

```text
local execution complete
!= remotely published
!= remotely verified
!= integration ready
```

Use these states:

- `LOCAL_COMPLETE_REMOTE_UNPUBLISHED` — the assigned work exists in the worker workspace and may be committed locally, but the coordinator cannot yet retrieve it from the authorized durable surface.
- `PUBLISHED_UNVERIFIED` — the worker output is remotely retrievable, but exact content/diff verification is not complete.
- `INTEGRATION_READY` — the declared worker output is remotely retrievable, exact content or intended diff is verified, and no unrelated changes are present.
- `BLOCKED` — no authorized transport or durable recovery path can make the output retrievable; state the exact boundary.

A local-only commit must never be reported as integration-ready completion.

## Publication contract in the worker directive

When a worker is expected to hand repository output to another worker/coordinator, the parent directive must state:

- target repository;
- unique worker branch/ref or other authorized durable destination;
- integration base/ref when relevant;
- files/scope the worker owns;
- whether remote branch publication is authorized or intentionally forbidden;
- required publication evidence;
- fallback transport behavior when the default transport fails;
- who performs final reconciliation/merge.

Do not rely on ambiguous verbs such as “commit,” “save,” or “put it in the repo” when downstream integration depends on remote retrievability.

If the owner/project has already authorized same-repository worker-branch publication for this task, a failed transport does not consume that authorization. Carry it across authorized fallback transports unless destination, visibility, scope, or consequence changes.

## Worker publication preflight

Before substantial isolated work, determine how completed output will become retrievable:

1. identify the intended remote branch/destination;
2. verify whether the current shell Git remote is authenticated for the required write;
3. discover current authorized GitHub connector/API capability;
4. identify the exact fallback if shell Git is unavailable;
5. record the integration base/ref and owned paths.

Do not defer publication-path discovery until after hours of work when the worker is disposable or isolated.

## Transport ladder

Use the least lossy authorized path that completes the existing publication contract.

### 1. Authenticated Git push

If shell Git can publish the exact worker commit safely, push the worker branch and verify the remote ref/commit.

### 2. Connected GitHub API/connector fallback

If shell `git push` fails because credentials are absent but an authorized connected GitHub API/connector can write the same repository, use it before interrupting the owner.

For a path-isolated worker delta:

1. verify the local worktree is clean and record the full local HEAD;
2. read the exact completed local file contents;
3. create the assigned remote worker branch from the declared integration base;
4. create/update only the worker-owned files using the exact local contents;
5. fetch the remote files back;
6. verify exact content equality, preferably by hash;
7. compare the remote branch against the declared base/current integration state and confirm no unrelated changes;
8. report both the original local HEAD and the remote publication commit, because API recreation may change commit identity while preserving content.

Do not silently recreate a complex commit on a different base if its semantics depend on parent commits, renames, deletes, binary state, mode bits, merge ancestry, or changes outside the declared owned paths. In that case use a commit-preserving authorized Git transport, Git-data API reconstruction that preserves the intended delta, or a durable checkpoint/recovery path.

### 3. Durable recovery checkpoint

If neither shell Git nor an authorized API/connector can publish safely, preserve the exact intended output and hashes in the authorized durable checkpoint mechanism under `patterns/durable-write-checkpoints.md`.

Do not ask the owner to copy file contents or manually shuttle routine branch data if another authorized worker/coordinator surface can recover it.

## Coordinator reconciliation

The designated integrator must not trust worker prose alone.

For every worker expected in the parallel wave:

1. discover/resolve the declared remote branch or checkpoint;
2. verify the branch/destination exists;
3. compare it against the declared integration base/current integration state;
4. verify only assigned paths/deltas are present, or explicitly reconcile any justified exception;
5. verify expected files/artifacts exist and are readable;
6. only then mark the worker `INTEGRATION_READY`;
7. merge/reconcile in a serialized order;
8. verify the integrated destination after merge.

If a worker reports `LOCAL_COMPLETE_REMOTE_UNPUBLISHED`, the coordinator first attempts authorized publication/recovery. Do not immediately turn the problem into an owner task.

## Owner interruption rule

Apply `patterns/worker-self-remediation-before-owner-interruption.md`.

A missing shell credential is not automatically an owner credential request. Before interrupting the owner, check whether the already-authorized connected GitHub API/connector or another task-scoped transport can complete the same publication without broadening destination, visibility, data boundary, spending, or destructive scope.

Ask the owner only when the remaining gate is genuinely irreducible, such as:

- no authorized writable GitHub surface exists;
- a new account/login/2FA/security gesture is required;
- publication would change visibility or destination;
- a protected branch/release action needs fresh owner authority;
- the only recovery path would expose or disclose material not already authorized.

Never ask the owner to paste credentials into chat.

## Completion evidence

A worker closeout for integration-bound repository work should include:

- worker/task identity;
- local workspace/worktree identity when relevant;
- local full HEAD or exact artifact hash;
- publication state;
- remote branch/ref or durable checkpoint;
- remote publication commit/hash when available;
- content/diff verification result;
- confirmation of unrelated-change absence or explicit exception;
- remaining blocker, if any.

A statement such as “committed locally but not pushed” is `LOCAL_COMPLETE_REMOTE_UNPUBLISHED`, not `COMPLETED`.

## Anti-patterns

Do not:

- treat a clean local scratch commit as coordinator-deliverable completion;
- wait until closeout to discover that the worker cannot publish;
- retry unauthenticated `git push` repeatedly after the failure mode is known;
- ask the owner to configure shell Git when an already-authorized connector/API can publish the exact output;
- tell the owner to copy worker files between chats/workspaces as ordinary recovery;
- recreate a complex commit on a different base without proving the resulting delta is equivalent;
- let child workers merge themselves into the integration branch during a parallel phase;
- declare a whole parallel wave complete while expected worker outputs remain local-only or unverified.

## Relationship to other patterns

- `patterns/parallel-chat-write-isolation.md` owns branch/worktree isolation and single-integrator reconciliation.
- `patterns/worker-directive-delivery-and-chat-output-budget.md` owns complete runnable worker directives; for integration-bound repository workers those directives must include this publication contract.
- `patterns/worker-self-remediation-before-owner-interruption.md` owns fallback execution before owner interruption.
- `patterns/durable-write-checkpoints.md` owns ambiguous/unverified repository-write recovery.
- `patterns/codex-github-operating-system.md` remains the broader repository/GitHub authority.

## Transfer rationale and limits

Promoted from the 2026-09-28 `humandesign` empirical-astrology parallel extraction. Seven workers completed correct local commits in isolated scratch worktrees, but shell Git lacked credentials and the coordinator could not retrieve those commits. The owner had to relay worker status before the workflow switched to the already-connected GitHub API, which successfully recreated the exact two-file worker deltas on remote branches and allowed serialized coordinator merges.

The portable lesson is not “always use the GitHub API.” It is: **bind worker completion to retrievability at the integration destination, preflight publication transport, and treat transport failure as a recoverable execution-path failure rather than an owner task when an authorized equivalent transport exists.**

This pattern does not authorize publication to a new repository, broader visibility, release, spending, destructive mutation, credential disclosure, or semantic changes that were not already authorized.

## Compact rules moved from root `AGENTS.md`

For integration-bound repository workers, also apply `patterns/worker-github-publication-and-recovery.md`: a local-only scratch commit is nonterminal, worker directives must define the remote publication contract, and an authorized GitHub connector/API is the required fallback before owner interruption when shell Git cannot publish.
