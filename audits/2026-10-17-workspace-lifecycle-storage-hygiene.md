# Candidate lesson: agents must close the lifecycle of extra workspaces

- Filed: 2026-10-17, by Codex.
- Disposition: UDA_CANDIDATE / provisional; maintainer intake, not active universal policy.
- Owner request: send the workspace-accumulation lesson to the UDA lane.
- Origin: a local storage diagnosis and instruction-loading repair on 2026-10-17. Raw host inventories and paths remain private.
- Scope: agent-created linked worktrees, temporary test clones, repeated batch checkouts, and their disposable caches.

## What failed and why

A local research checkout collection had grown to 111 worktrees using approximately 49 GiB. Identical earlier deliverable archives appeared as separate physical files in later worktrees. Repeated test dependencies added further storage use. Git worktrees share repository objects, but their checked-out files and dependencies still consume space independently.

The agents' workspace handling kept creating and retaining extra copies without a closeout policy that reached the actors creating them. The existing scheduled cleaner covered a different directory. The first repair reclaimed space and moved retained copies to a larger disk, but placed retention guidance only under that destination. Agents starting elsewhere could miss it. Relocation reduced pressure on the original disk without bounding growth on the destination.

This is an agent lifecycle failure, not evidence that the owner chose an inefficient workflow. It also does not establish that every Codex or Claude installation behaves this way.

## Portable lesson proposed for adoption

Pair write isolation with workspace lifecycle management:

1. Before creating another checkout, inspect the task's current workspace and existing worktrees. Reuse a suitable idle checkout for sequential work in the same workstream. A new batch, retry, review, or handoff alone does not require a full extra copy.
2. Preserve isolation for concurrent writers and independent evaluation. Never reuse another actor's active checkout or mutable branch, reset dirty work, or weaken a required evaluation boundary to reduce storage.
3. Use an explicit host/project storage policy for retained extra copies. Verify the configured filesystem is mounted before creating storage there, and avoid silent fallback onto the constrained disk. Keep storage roots, disk choice, performance exceptions, and retention counts in host/project configuration rather than universal rules.
4. Prefer canonical commits, checkpoints, and artifact references over repeated copies of all earlier outputs solely for handoff. Preserve required tracked inputs, scientific baselines, source artifacts, and privacy boundaries.
5. Before declaring a task complete, review the extra checkouts and caches it created or inherited. Retire its completed, clean, reproducible worktrees using ordinary Git operations only after checking branch/commit preservation, tracked changes, untracked and ignored data, locks, and current process/task use. Preserve named branches and commits. Retain uncertain or unique work and explain why.
6. Make the retention default explicit and bounded, with protected exceptions for active work, unique unfinished data, and required evidence. Clean only task-owned workspaces unless broader cleanup is authorized. Do not remove folders merely because they are old or a numerical limit has been exceeded.
7. Put the operative rule at instruction entry points the relevant actors actually load. A policy hidden under a storage destination is insufficient for an agent creating workspaces from another directory. Preserve unrelated instructions, keep one canonical policy owner, and record any deployed snapshots and their synchronization limits.
8. Verify native instruction loading separately from actual lifecycle behavior. An installed file, successful prompt-load check, directory move, or cleanup receipt is not evidence of an enforced quota or future compliance. Hooks, quotas, and scheduled deletion are separate implementation and authority decisions.

## Local repair and evidence limits

The local adaptation added safe reuse and closeout defaults to the global instructions of three Codex profiles and Claude Code. Existing instruction bytes were preserved. The previous storage-parent policy became a pointer to the canonical local policy.

On the installed Codex 0.163.0 binary, the offline native prompt renderer included the entire policy when launched from a real project for each profile. On Claude Code 2.1.295, its native InstructionsLoaded event reported loading the user instruction file at session start. A temporary submit-blocking hook prevented a model call during that loading probe. The running ChatGPT Work conversation also received the updated instruction payload.

These observations establish installation and loading for those tested local runtimes. They do not establish later agent adherence, universal version compatibility, coverage of ordinary web chats or remote hosts, or an enforced retention limit. No new unattended deletion service or quota was installed. The exact local paths and host-specific retention number are intentionally excluded from this public extract.

## Maintainer action and checks

Review the lifecycle addition alongside the existing write-isolation, instruction-composition, and task-time activation rules. Adapt it into the appropriate canonical pattern and index route if accepted; do not add a host-specific root instruction. The local repair does not by itself activate a universal rule.

Before implementing enforcement, identify the actual checkout producer and its lifecycle. Distinguish application-managed worktrees from manually created Git worktrees and test clones; an application's cleanup settings need not cover the latter. Prefer an existing lifecycle mechanism where it fits.

For an adopted runtime integration, check both:
- the relevant rule reaches each supported actor at creation and closeout;
- sequential work reuses a suitable checkout, eligible completed work is retired with branches preserved, and active, dirty, locked, unique-data, and independent-evaluation cases remain protected.

Do not substitute text-presence assertions for those behavioral checks. Do not install unattended deletion, hard-code this host's disk layout or retention number, or weaken research/evaluation requirements as part of accepting this lesson.

Related current rules: patterns/parallel-chat-write-isolation.md, patterns/instruction-composition-and-portable-intelligence.md, patterns/task-time-lesson-activation.md, and patterns/transformation-preservation-proof.md.

Remaining after filing: maintainer disposition and any resulting canonical rule, runtime integration, behavioral validation, and merge. This submission is a de-identified lesson handoff only.
