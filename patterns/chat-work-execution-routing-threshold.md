# Chat / Work Execution Routing Threshold

Status: REQUIRED OWNER CORRECTION
Date: 2026-09-02

## Controlling rule

**Chat owns reasoning and ordinary GitHub work. Work/Codex is an execution surface, not a preferred reasoning surface.**

Do not hand a task to Work merely because Work could help, because the task mentions GitHub, because a repository contains many files, or because Work has terminal/browser tooling.

The routing question is not:

> Would Work be useful?

It is:

> Does the next bounded action materially require a terminal/computer execution surface, or is the repository operation genuinely long-range enough that Chat should supervise rather than execute it directly?

If the answer is no, keep the action in Chat.

## Keep in Chat

Chat normally retains:

- architecture and implementation design;
- strategy, methodology, prioritization, and tradeoff selection;
- owner-intent interpretation;
- supervisory review and verdicts;
- scientific, safety, therapy, editorial, and product judgment;
- substantive prose;
- ordinary GitHub reads and searches;
- creating/updating GitHub issues and pull requests;
- ordinary GitHub file reads/writes when the active Chat surface supports them;
- bounded branch/file edits that can be performed directly with Chat's GitHub tools;
- code/diff review;
- deciding whether a Work run is needed and authoring its exact directive;
- reviewing Work receipts and selecting the next consequential step.

GitHub availability in Work is **not** an execution requirement when Chat already has adequate GitHub actions.

## Use Work / Codex

Invoke Work/Codex when the bounded action genuinely requires one or more of:

- terminal commands;
- local filesystem or worktree operations unavailable to Chat;
- SSH or remote-shell execution;
- browser/computer/OS automation;
- local builds, tests, runtime/process inspection, or dependency installation;
- deployment mechanics that require an execution surface;
- genuinely long-range repository implementation where many stateful edits/commands make Chat-level direct execution impractical.

A long-range repository operation means sustained execution complexity, not simply a large repository or a multi-file idea. Prefer Chat for a bounded multi-file change when Chat can safely make and review the edits itself.

## Mixed tasks

When a task contains both reasoning and execution:

```text
Chat reasons first
-> Chat defines exact bounded directive and stop conditions
-> Work/Codex executes only that residue
-> Work/Codex returns facts, diffs, logs, tests, and blockers
-> Chat reviews the receipt and decides what happens next
```

Do not send the whole task to Work and ask it to decide the architecture while implementing it.

## Long-running ChatGPT recovery

Any already-authorized long-running supervisor chat can stop making progress before its current objective is finished, including Extra High, Pro, Project Manager, and specialist turns. Mission Control may use the exact one-word message:

```text
continue
```

as a **same-chat transport recovery nudge**. It is not an execution verdict or mission-guard `CONTINUE` decision.

Use objective non-content liveness signals where available:

- a turn remains in active generation state beyond the configured liveness timeout;
- ChatGPT exposes a visible recovery control such as `Continue`, `Continue generating`, `Resume`, `Retry`, or `Try again`;
- a stage with an expected durable completion artifact returns to idle but that artifact remains absent after its grace interval.

Recovery preserves the current conversation and current model/mode unless the admitted workflow itself requires a model switch. Do not infer semantic completion merely because the composer is idle.

Apply bounded recovery:

- the underlying Chat objective must already be authorized;
- send only the minimal `continue` message; do not rewrite the task or introduce new semantic direction;
- record recovery as transport evidence without claiming assistant content or hidden backend model identity;
- cap consecutive automatic nudges to prevent quota-burning loops;
- a failed or ambiguous nudge is not automatically replayed;
- when liveness remains unresolved after the recovery ceiling, return control to Chat rather than silently replanning in Work;
- never use `continue` to bypass an owner decision, Mission Control admission gate, safety/release gate, ambiguity state, spend/access boundary, or a required model switch.

For consumer ChatGPT surfaces where assistant output is not programmatically extracted, durable stage-completion/continue-required receipts are preferred when UI liveness alone cannot distinguish a normal idle-but-incomplete turn from true semantic completion.

## Work authority exclusions

Work/Codex must not author or acquire authority for:

- methodology;
- project strategy;
- prioritization;
- architecture decisions unless Chat supplied the decision and Work is only materializing it;
- supervisory verdicts;
- owner decisions;
- scientific or safety conclusions;
- substantive supervisory prose;
- decisions that a requirement is satisfied, a task is aligned, or an owner outcome is achieved.

Low-level tactical choices unavoidable inside an authorized implementation remain allowed, provided they do not change the architecture, acceptance boundary, owner outcome, or strategy.

## Anti-patterns

Reject these routing rationales:

```text
"Work is better for GitHub."
"Work would help here."
"This involves a repo, so hand it to Work."
"Work can inspect more files, so let it decide what to change."
"Let Work figure out the architecture and implement it."
```

Replace them with a bounded execution test:

```text
Can Chat make the required judgment and perform the next safe GitHub action directly?
  YES -> stay in Chat.
  NO, because terminal/computer execution is required -> delegate only that residue.
  NO, because the repo operation is genuinely long-range/stateful -> delegate bounded execution, keep reasoning in Chat.
```

## Mission Control implication

Mission Control should coordinate repeated Chat <-> Work cycles rather than treating Work as the default continuation surface.

A valid Work handoff records:

- source Chat decision/receipt;
- exact execution objective;
- allowed and forbidden actions;
- allowed tactical freedom;
- stop/review triggers;
- required evidence/tests;
- explicit semantic authority = none beyond the bounded implementation choices.

The returned execution receipt is input to Chat. It is not permission for Work to select the next consequential step.
