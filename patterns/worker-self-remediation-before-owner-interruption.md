# Worker self-remediation before owner interruption

Status: current universal execution-friction pattern.

## Problem

A reasoning chat can correctly diagnose that an execution worker is blocked by its sandbox, permissions, configuration, or runtime roots and still waste owner time by turning the repair into a manual checklist. This is especially easy when the current worker process cannot immediately perform the final blocked operation: the chat may incorrectly jump from “this process cannot write the target” to “the owner must edit the worker configuration.”

Those are different facts. A worker can often repair its own user-level configuration, task profile, workspace roots, or other reversible execution settings even when the current sandbox cannot write the eventual target. The only irreducible owner action may be restarting or relaunching the worker so the new sandbox takes effect.

## Core rule

**Before assigning any routine configuration, permission, recovery, or setup work to the owner, determine whether the active worker can safely perform that step itself. If it can, the worker performs it. The owner receives only the smallest genuinely irreducible action.**

Do not make the owner copy commands, edit config files, create folders, inspect routine state, or choose ordinary permission modes merely because those steps are easy to describe. Ease for the assistant is not a justification for transferring executable work to the owner.

This rule does not authorize the worker to bypass security gates, self-approve privileged actions, expand semantic scope, publish, spend, delete destructively, or make owner decisions.

## Trigger

Activate this pattern when all of the following are true:

1. an execution worker such as Codex/Work is already the selected execution surface;
2. progress is blocked or degraded by sandbox roots, permissions, user-level configuration, task initialization, runtime environment, or other worker-local setup;
3. the proposed owner instructions contain steps the worker could plausibly execute within current task authority.

Common signals include:

- the worker reports `EROFS`, `EACCES`, `EPERM`, missing writable roots, or sandbox namespace restrictions;
- the worker can write its own home/config area but not the target path;
- a configuration change will require a new worker process before it becomes effective;
- the reasoning chat is about to tell the owner to edit `~/.codex/config.toml`, task profiles, rule files, or similar worker-local settings;
- the owner asks “can’t the worker do that itself?”

## Required behavior

### 1. Separate capability layers

Identify independently:

- what the current worker process can write now;
- what user-level/task-level configuration the worker can safely modify;
- what change requires a process/task restart to take effect;
- what operation truly requires owner interaction because of an external security, OS, account, credential, spending, publication, destructive, or product-level gate.

Do not infer owner necessity from the current sandbox alone.

### 2. Prefer worker self-remediation

If the worker can safely repair its own user-level configuration or task-scoped setup under current authority, instruct the worker to:

1. back up the affected configuration when appropriate;
2. preserve unrelated settings;
3. make the smallest required change;
4. validate the resulting configuration or syntax;
5. stop at the exact boundary where a fresh process/session is required.

The reasoning chat should deliver this as a same-turn runnable worker directive under `patterns/worker-directive-delivery-and-chat-output-budget.md`.

### 3. Minimize the owner handoff

If a restart, relaunch, reconnect, hardware action, or direct security prompt genuinely cannot be performed by the worker, reduce the owner action to that irreducible step only.

Bad handoff:

```text
Open the config file, add these settings, save it, exit Codex, restart Codex, test the path, then continue.
```

Correct handoff when the worker can edit its own config:

```text
Worker edits and validates its configuration itself, then stops.
Owner performs only the required restart/relaunch.
Fresh worker verifies the new permission and resumes automatically.
```

Do not require the owner to reconstruct or repeat context after the restart; the worker directive or durable task state must carry the continuation.

### 4. Fail closed on genuine boundaries

A worker must not:

- click or approve its own security prompt;
- weaken sandboxing globally merely to avoid owner friction;
- grant itself unrelated filesystem/network scope;
- modify privileged/system configuration without existing authority;
- disguise a denied action through another command or wrapper;
- treat a semantic/product decision as routine technical setup.

When a genuine boundary remains, report the exact blocked action and why the owner is required.

## Admission check before owner-facing manual steps

Before sending any manual operational instruction to the owner while a worker is active, answer:

1. Can the worker execute this step itself now?
2. If not, can the worker safely change its own task/user configuration so that a fresh process can execute it?
3. If a restart is required, can every pre-restart step be completed by the worker first?
4. Is the remaining owner action genuinely irreducible?

If answers 1–3 reveal self-remediable work, assigning that work to the owner is a failure.

## Codex-specific interaction

For Codex permission and sandbox problems, apply this pattern together with `patterns/codex-worker-permissions.md`.

In particular:

- the worker, not the owner, selects routine task-scoped permission/profile settings;
- diagnose host mount state separately from the Codex namespace;
- an `EROFS` bind mount inside Codex does not imply the host filesystem is read-only;
- when Codex can write its own user configuration but the current namespace cannot write the target, Codex should perform the authorized configuration repair itself and ask the owner only for any restart/relaunch that the current process cannot perform;
- after restart, verify the exact target write before resuming consequential work.

## Failure condition and repair

Failure condition:

- the owner is given a multi-step manual configuration/setup procedure even though the active worker could safely perform one or more of those steps itself.

Repair:

1. withdraw the unnecessary owner work;
2. send the worker a bounded self-remediation directive immediately;
3. leave only the irreducible owner gate;
4. after the gate, resume the original task automatically;
5. record the correction through the durable-learning lifecycle when it exposes a reusable gap.

## Relationship to existing patterns

This pattern makes an existing principle operational rather than replacing it:

- `patterns/codex-worker-permissions.md` already requires the worker, not the owner, to select routine permissions and says owner-managed tasks should be initialized/resumed with authorized settings rather than asking the owner to configure them;
- `patterns/task-time-lesson-activation.md` requires relevant lessons to be activated before consequential action and reactivated after owner correction;
- `patterns/worker-directive-delivery-and-chat-output-budget.md` requires same-turn runnable worker instructions once worker execution is selected;
- root `AGENTS.md` already says Work selects authorized task-scoped access and routine permission choices should not be pushed to the owner.

The new contribution is the explicit **self-remediation-before-owner-interruption admission check**: inability of the current sandbox to perform the final target operation is not enough to transfer the repair procedure to the owner.

## Transfer rationale and limits

Promoted from a 2026-09-13 local Codex recovery incident where the host HDD was writable, the Codex namespace exposed it read-only, and the reasoning chat initially gave the owner manual Codex configuration steps even though Codex could edit its own user configuration. The owner correction exposed an activation/application gap, not a missing general permission principle.

This pattern applies to routine reversible worker-local setup. It does not remove human gates that are genuinely required by security, authorization, irreversible effects, account boundaries, credentials, spending, publication, or product-level controls.
