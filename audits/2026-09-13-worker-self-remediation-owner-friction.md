# Worker self-remediation / owner-friction incident — 2026-09-13

NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT

## Incident

During a local SSD→HDD migration recovery, the host filesystems were confirmed writable, but the active Codex execution namespace exposed `/mnt/hdd` as a read-only bind mount. The reasoning chat initially proposed that the owner manually edit Codex configuration, restart Codex, and verify the new writable root.

The owner corrected this: Codex itself could perform the user-level configuration edit, leaving only the process restart as a genuinely irreducible owner action.

Follow-up execution evidence then exposed a stronger variant. After a fresh Codex process, the HDD remained `EROFS`; the intended config change was present, but the effective runtime writable-root list still omitted `/mnt/hdd/storage/joel`. The managed runtime also exposed `/home/joel/.codex` read-only, so the worker could not safely back up or alter its own config. The runtime was therefore being controlled by client/task initialization rather than the attempted user-config edit.

## Exact finding

The initial assistant failure conflated two different facts:

1. the **current Codex sandbox** could not write the HDD target;
2. the **Codex worker** could still write its own user-level configuration and therefore could perform the authorized repair itself before restart.

This transferred avoidable operational work to the owner.

The follow-up then revealed a second failure mode: **repairing a non-controlling surface**. The user config contained the intended change, but the fresh managed runtime did not project it into effective writable roots. Repeating the same config/restart loop would therefore have wasted more owner time.

The corrected control-plane model is:

- host filesystem state and Codex namespace state are separate;
- editable config is only useful if current evidence shows it controls the runtime;
- when a fresh runtime repeats the same effective roots despite the config change, diagnose client/task runtime authority next;
- if the worker config directory is itself read-only, stop trying to repair that path;
- reduce owner work to the smallest irreducible relaunch or security action after the worker/reasoning chat has prepared the exact controlling override.

## Existing coverage

The underlying permission principle was already present in current universal guidance:

- `patterns/codex-worker-permissions.md` states that the worker, not the owner, selects routine task-scoped permission settings and that owner-managed tasks should be initialized/resumed with authorized settings rather than asking the owner to configure them;
- root `AGENTS.md` says Work selects authorized task-scoped access and the automatic reviewer and that the owner should not choose routine permissions;
- `patterns/task-time-lesson-activation.md` says an existing lesson is not enough unless it is activated and applied at task time.

Therefore the original incident is **not** evidence that the broad permission rule was missing. It is evidence of an activation/application gap at the exact owner-interruption seam.

The follow-up adds a distinct operational refinement: self-remediation must target the **actual enforcement/control surface**, not merely the nearest writable configuration file.

## Disposition

- Existing broad permission lesson: `no-new-lesson` — already represented.
- Initial transferable refinement: `promoted` — before assigning routine manual setup/configuration to the owner, explicitly test whether the active worker can self-remediate its own task/user configuration and reduce the owner handoff to the smallest irreducible action.
- Follow-up transferable refinement: `promoted` — when the proposed config repair is present but the effective runtime is unchanged, treat that as a control-plane failure; identify client/task runtime authority before repeating remediation.
- Universal pattern updated: `patterns/worker-self-remediation-before-owner-interruption.md`.

## Required behavior

When an execution worker is already active and routine progress is blocked by sandbox roots, permissions, worker-local config, or task initialization:

1. distinguish current-process target access from worker ability to edit its own configuration;
2. identify which surface actually determines the effective runtime roots/policy;
3. have the worker perform every safe authorized self-remediation step it can on that controlling surface;
4. if the intended config is non-controlling or itself read-only, stop looping on it and switch to the client/task runtime authority;
5. stop only at a genuine restart/security/OS/account/credential/destructive/publication/spending gate;
6. give the owner only that irreducible action;
7. carry continuation state so the fresh worker resumes automatically.

## Regression condition

Regression occurs if either:

- an owner receives a multi-step manual worker-configuration procedure while the active worker could safely perform any of those steps itself; or
- the owner is sent through repeated config edits/restarts after evidence shows that config does not control the effective runtime.

## Limits

This does not permit self-approval, global sandbox weakening, privileged changes without authority, or bypassing genuine human/security gates. It applies to routine reversible worker-local setup within current task authority and requires explicit scope when a broader runtime mode is used for a task that truly spans multiple filesystem roots.
