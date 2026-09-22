# Worker self-remediation before owner interruption

Status: current universal execution-friction pattern.

## Problem

A reasoning chat can correctly diagnose that an execution worker is blocked by its sandbox, permissions, configuration, or runtime roots and still waste owner time by turning the repair into a manual checklist. This is especially easy when the current worker process cannot immediately perform the final blocked operation: the chat may incorrectly jump from “this process cannot write the target” to “the owner must edit the worker configuration.”

Those are different facts. A worker can often repair its own user-level configuration, task profile, workspace roots, or other reversible execution settings even when the current sandbox cannot write the eventual target. The only irreducible owner action may be restarting or relaunching the worker so the new sandbox takes effect.

A second failure mode is repairing the **wrong control plane**. A configuration file may contain the intended setting while the client/task initializer supplies runtime roots or sandbox policy from somewhere else. Repeating edits to a non-controlling config—or repeatedly restarting into the same managed runtime—does not advance the outcome.

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
- a fresh worker repeats the same missing runtime roots even though the intended user config is present;
- the worker's own configuration area is itself exposed read-only;
- the reasoning chat is about to tell the owner to edit `~/.codex/config.toml`, task profiles, rule files, or similar worker-local settings;
- the owner asks “can’t the worker do that itself?”

## Required behavior

### 1. Separate capability layers

Identify independently:

- what the current worker process can write now;
- what user-level/task-level configuration the worker can safely modify;
- what control plane actually determines the effective runtime roots, sandbox, or permission profile;
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


### 3B. Carry forward valid owner approval

A valid owner confirmation is not single-use merely because one execution surface failed. When destination, data boundary, scope, and consequence remain unchanged, carry the existing approval across retries, resumed execution, and alternate authorized transport paths.

- A failed tool call, safety review, credential helper, remote transport, or equivalent execution-path failure does not by itself require asking the owner again.
- Before interrupting, try the safe authorized recovery path or alternate execution surface already available under the same approval.
- Re-ask only if a material fact changes, a new consequence or destination is introduced, the prior approval was explicitly revoked or narrowed, or the platform itself requires a fresh human gesture.
- When an owner interruption is irreducible, explain the concrete downside or risk of the available options, why the owner is required, and the recommended default. Do not send a bare “approve?” or “what do you want me to do?” prompt.
- Carry-forward approval does not authorize spending, publication to a different destination, broader data egress, destructive scope, credential disclosure, or another action whose material consequences were not covered by the prior confirmation.


### 3A. Human-only browser gates are resumable owner-assist states

A CAPTCHA, anti-bot challenge, 2FA/passkey prompt, login approval, or equivalent human-only browser gate does **not** by itself terminate an otherwise-authorized Work run.

When such a gate appears:

1. finish every safe preparatory step Work can perform without crossing the human gate;
2. preserve the exact browser page/window/session at the gate;
3. expose that exact live browser state through the configured owner-interactive GUI channel;
4. if Work has authorized control of the owner's local viewer, open or focus the viewer instead of asking the owner to set it up;
5. tell the owner only the exact human action required, without asking for credentials or codes in chat;
6. keep the task-scoped resumable state alive while waiting, including temporary browser/tunnel/session state needed to continue, subject to a bounded security timeout;
7. detect the gate clearing and resume automatically; if reliable detection is unavailable, ask only for a minimal acknowledgement such as `done`.

Do not emit a terminal execution receipt merely because a human-only gate was encountered when the configured assist channel is available. Use an intermediate `OWNER_INTERACTION_PENDING` state. A terminal blocker is appropriate only if the human-assist channel is unavailable, the bounded security timeout expires, or the gate introduces a new owner decision/authority boundary.

The worker must not solve or bypass CAPTCHAs itself, capture passwords/2FA codes/passkeys, or use the assist channel to substitute for a new spending, publication, destructive-action, or semantic owner decision.

Owner-specific assist channels are deployment bindings rather than universal infrastructure. Apply the current owner binding when one exists; private hostnames, ports, passwords, cookies, and tokens remain outside the public portable rule.

An owner deployment binding may be broader than the human-gate case above. When the active binding requires viewer-first assistance, open or focus the configured viewer and bring the exact relevant remote window or control into view **before every request for the owner to view or interact**. Apply that requirement to visual inspection and ordinary GUI collaboration as well as login, MFA, approval, and other human-only gates; a textual request or claim that the session is ready does not satisfy the binding when authorized viewer control is available.

### 4. Diagnose the controlling surface before repeating remediation

If a proposed repair is present but the fresh worker still exposes the same blocked namespace, treat that as evidence that the attempted repair may not control the runtime.

The worker/reasoning chat must then determine which surface actually supplies enforcement, such as:

- client-supplied workspace roots;
- task/thread initialization or resume parameters;
- a selected permission profile;
- a desktop/app task mode;
- managed policy or host wrapper;
- user configuration, only if current evidence shows it is authoritative.

Do not treat informational environment variables, config-file presence, or a successful edit as proof of effective enforcement. Verify the effective runtime roots/policy directly.

If the worker's own config path is read-only, or the intended setting is already present but absent from the effective runtime roots, **stop trying to repair that config path**. Repeated config edits or identical restarts are the wrong control plane. Instead, prepare the smallest supported relaunch/task-initialization override that changes the controlling surface, verify its syntax from the local/current client when possible, and leave the owner only the irreducible relaunch/security action.

A fresh-process failure is therefore a strategy checkpoint, not a reason to repeat the same setup procedure.

### 5. Fail closed on genuine boundaries

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
3. If that configuration is not writable or not authoritative, has the actual runtime-control surface been identified?
4. If a restart/relaunch is required, can every pre-restart step and command construction/validation be completed by the worker first?
5. Is the remaining owner action genuinely irreducible?

If answers 1–4 reveal self-remediable work, assigning that work to the owner is a failure.

## Codex-specific interaction

For Codex permission and sandbox problems, apply this pattern together with `patterns/codex-worker-permissions.md`.

In particular:

- the worker, not the owner, selects routine task-scoped permission/profile settings;
- diagnose host mount state separately from the Codex namespace;
- an `EROFS` bind mount inside Codex does not imply the host filesystem is read-only;
- when Codex can write its own user configuration but the current namespace cannot write the target, Codex should perform the authorized configuration repair itself and ask the owner only for any restart/relaunch that the current process cannot perform;
- when Codex cannot write its own config, or a present config change does not appear in the effective runtime roots, diagnose client/thread/task initialization rather than looping on `config.toml`;
- treat `CODEX_PERMISSION_PROFILE`-style environment labels as diagnostic metadata unless the current implementation proves they are the enforcing control;
- after any restart or sandbox/profile override, verify the exact target write before resuming consequential work.

## Failure condition and repair

Failure condition:

- the owner is given a multi-step manual worker-configuration procedure even though the active worker could safely perform one or more of those steps itself; or
- the owner is sent through repeated config edits/restarts after evidence shows that configuration surface does not control the effective runtime.

Repair:

1. withdraw the unnecessary owner work;
2. send the worker a bounded self-remediation directive immediately;
3. identify the actual enforcement/control surface if the first remediation did not change runtime behavior;
4. leave only the irreducible owner gate;
5. after the gate, resume the original task automatically;
6. record the correction through the durable-learning lifecycle when it exposes a reusable gap.

## Relationship to existing patterns

This pattern makes an existing principle operational rather than replacing it:

- `patterns/codex-worker-permissions.md` already requires the worker, not the owner, to select routine permissions and says owner-managed tasks should be initialized/resumed with authorized settings rather than asking the owner to configure them;
- `patterns/task-time-lesson-activation.md` requires relevant lessons to be activated before consequential action and reactivated after owner correction;
- `patterns/worker-directive-delivery-and-chat-output-budget.md` requires same-turn runnable worker instructions once worker execution is selected;
- root `AGENTS.md` already says Work selects authorized task-scoped access and routine permission choices should not be pushed to the owner.

The new contribution is the explicit **self-remediation-before-owner-interruption admission check** plus a **control-plane checkpoint**: inability of the current sandbox to perform the final target operation is not enough to transfer the repair procedure to the owner, and failure of a proposed repair means identify the actual enforcing surface before repeating it.

## Transfer rationale and limits

Promoted from a 2026-09-13 local Codex recovery incident where the host HDD was writable, the Codex namespace exposed it read-only, and the reasoning chat initially gave the owner manual Codex configuration steps even though Codex could edit its own user configuration. Follow-up evidence then showed a stronger variant: a fresh managed runtime still omitted the HDD from effective writable roots, the intended config change was present but non-controlling, and Codex's own config directory was read-only. That refined the lesson from self-remediation alone to self-remediation **at the actual controlling surface**.

This pattern applies to routine reversible worker-local setup. It does not remove human gates that are genuinely required by security, authorization, irreversible effects, account boundaries, credentials, spending, publication, or product-level controls.
