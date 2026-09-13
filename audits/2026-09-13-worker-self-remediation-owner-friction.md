# Worker self-remediation / owner-friction incident — 2026-09-13

## Incident

During a local SSD→HDD migration recovery, the host filesystems were confirmed writable, but the active Codex execution namespace exposed `/mnt/hdd` as a read-only bind mount. The reasoning chat initially proposed that the owner manually edit Codex configuration, restart Codex, and verify the new writable root.

The owner corrected this: Codex itself could perform the user-level configuration edit, leaving only the process restart as a genuinely irreducible owner action.

## Exact finding

The assistant conflated two different facts:

1. the **current Codex sandbox** could not write the HDD target;
2. the **Codex worker** could still write its own user-level configuration and therefore could perform the authorized repair itself before restart.

This transferred avoidable operational work to the owner.

## Existing coverage

The underlying permission principle was already present in current universal guidance:

- `patterns/codex-worker-permissions.md` states that the worker, not the owner, selects routine task-scoped permission settings and that owner-managed tasks should be initialized/resumed with authorized settings rather than asking the owner to configure them;
- root `AGENTS.md` says Work selects authorized task-scoped access and the automatic reviewer and that the owner should not choose routine permissions;
- `patterns/task-time-lesson-activation.md` says an existing lesson is not enough unless it is activated and applied at task time.

Therefore the incident is **not** evidence that the broad permission rule was missing. It is evidence of an activation/application gap at the exact owner-interruption seam.

## Disposition

- Existing broad permission lesson: `no-new-lesson` — already represented.
- New transferable refinement: `promoted` — before assigning routine manual setup/configuration to the owner, explicitly test whether the active worker can self-remediate its own task/user configuration and reduce the owner handoff to the smallest irreducible action.
- New universal pattern: `patterns/worker-self-remediation-before-owner-interruption.md`.

## Required behavior

When an execution worker is already active and routine progress is blocked by sandbox roots, permissions, worker-local config, or task initialization:

1. distinguish current-process target access from worker ability to edit its own configuration;
2. have the worker perform every safe authorized self-remediation step it can;
3. stop only at a genuine restart/security/OS/account/credential/destructive/publication/spending gate;
4. give the owner only that irreducible action;
5. carry continuation state so the fresh worker resumes automatically.

## Regression condition

Regression occurs if an owner receives a multi-step manual worker-configuration procedure while the active worker could safely perform any of those steps itself.

## Limits

This does not permit self-approval, global sandbox weakening, privileged changes without authority, or bypassing genuine human/security gates. It applies to routine reversible worker-local setup within current task authority.
