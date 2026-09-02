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

## Long-running Extra High recovery

A long-running Extra High supervisory chat can occasionally stop before completing its already-authorized work. When there is an objective durable completion signal and that signal is still missing after the normal retry/grace interval, Mission Control may send the exact one-word message:

```text
continue
```

This is a **same-chat recovery nudge**, not an execution verdict or mission-guard `CONTINUE` decision.

Apply it conservatively:

- only to an Extra High turn that was already authorized and is still pursuing the same bounded objective;
- only when the expected durable completion artifact/state transition has not appeared;
- keep the same chat and same model/mode;
- send at most one automatic `continue` nudge for that logical step;
- record the nudge as transport/recovery evidence, without claiming semantic content or model identity beyond the visible UI label;
- if the expected completion artifact is still absent after that recovery turn, mark the step stalled and return control to Chat rather than creating an automatic loop;
- never use `continue` to bypass an owner decision, Mission Control admission gate, safety/release gate, ambiguity state, spend/access boundary, or a required model switch.

For same-chat Personal Pro escalation, the strongest objective use is after an Extra High step that is expected to create a durable GitHub receipt. A Pro reasoning turn must not receive this generic recovery nudge merely because it is slow or difficult.

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
