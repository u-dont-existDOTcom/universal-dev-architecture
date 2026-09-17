# Parallel chat write isolation

## Problem

Two or more ChatGPT conversations, workers, or agents can share the same GitHub credentials and task branch. Git file-level SHA checks can prevent some lost updates, but they do not prevent semantic races:

- one chat can advance the branch while another is still reasoning from an older head;
- both can create different successor state files;
- one can change the handoff or "next action" while the other is producing work under the previous state;
- both commits remain valid Git history even though the task now has conflicting control state.

This is not solved by an active-task lock alone when both writers share the same task and branch. A task lock selects **what work is active**. A writer lease selects **who may mutate which branch**.

## Universal rule

When two or more conversations or agents may work on the same repository task concurrently, **never let them share a mutable branch**.

Use:

1. one integration branch for the task;
2. one unique child branch/worktree per concurrent writer;
3. one branch-local writer lease;
4. explicit reconciliation back to the integration branch by one designated integrator.

The integration branch is read/reconcile-only for ordinary writers while parallel work is active.

## Writer lease

Each writer branch should contain a machine-readable lease such as:

```json
{
  "schema_version": 1,
  "status": "active",
  "exclusive_writer": true,
  "owned_branch": "chat/example-task-writer-a-20260917-2326",
  "integration_branch": "task/example-task",
  "integration_base_sha": "<exact sha>",
  "scope": "short plain-language description"
}
```

The lease is branch-local. It does not claim global exclusivity over the task; it claims exclusivity over that writer branch.

## Pre-write fence

Before every mutation in a concurrent task:

- verify the intended owned branch;
- verify the branch-local lease still names that branch and is active;
- read the current branch head;
- compare it with the writer's last known successful write or explicitly reconciled head;
- if the branch advanced unexpectedly, **fail closed** and reconcile before writing.

Do not interpret an unexpected head advance as permission to absorb the new state automatically.

GitHub file-SHA compare-and-swap remains useful for individual file updates, but it is not a substitute for branch isolation.

## Integration

Only one designated integrator may update the integration branch during the parallel phase.

The integrator must:

- compare each child branch against its declared integration base;
- identify semantic conflicts in state/handoff/authority files, not just textual merge conflicts;
- choose or combine work explicitly;
- preserve rejected competing work as provenance when useful;
- update the integration branch only after reconciliation.

Do not let child writers update integration-state files "just to keep everyone current." That recreates the shared mutable state race.

## Fresh contexts and independent tests

A genuinely fresh or blind writer should normally use:

- a read-only packet, or
- its own isolated child branch.

Do not give a supposedly independent writer write access to the supervising writer's mutable branch.

## Recovery

After compaction, restart, or model switch, a writer should recover in this order:

```text
current owner instruction
-> universal bootstrap
-> branch-local writer lease
-> branch-local task state/handoff
-> integration branch only as an explicit comparison source
```

If the conversation cannot recover its owned branch identity with confidence, stop before mutation and ask/reconcile rather than guessing.

## Closeout

When the parallel phase ends:

1. reconcile accepted child work into the integration branch;
2. mark each writer lease complete/superseded;
3. keep child branches for provenance until no longer useful;
4. resume ordinary single-branch work only when one writer again owns the mutable task state.

## Anti-patterns

Do not:

- run two chats on the same mutable task branch;
- rely on chat memory to decide which writer "owns" the branch;
- assume file-level SHA checks prevent semantic state races;
- allow every parallel writer to update the canonical handoff/current-state file;
- auto-reconcile unexpected branch movement;
- call same-branch concurrent work independent.

## Relationship to active-task locks

`patterns/exclusive-active-task-locks.md` remains the task-selection control.

Use both concepts when needed:

```text
active-task lock = which task is authoritative
writer lease     = which writer may mutate which branch
```

Parallel writers may work on the same active task only through separate owned branches/worktrees. Shared mutable state is serialized through the integrator.
