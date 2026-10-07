# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-10-07

## Goal

- Keep one obvious repository recovery entry point while each concurrent task
  maintains its own checkpoint.

## Authority / baseline

- Canonical repository: `u-dont-existDOTcom/universal-dev-architecture`.
- Current owner decisions and exact Git state outrank recovery summaries.
- The owner approved per-task checkpoints on 2026-09-29 (17:12 UTC).

## Completed

- Repository-level guidance, templates, tests, and audit are maintained here.
- Earlier task checkpoints remain in `state/tasks/` after merge as task records.

## Current checkpoint

- On 2026-10-07, an opaque remote-device connector outage exposed an owner-friction gap: one failed transport was incorrectly treated as target-wide inaccessibility even though a healthy authorized endpoint already had an SSH route to the same host. UDA now requires semantic identity recovery plus authorized access-topology recovery before owner escalation: inspect bounded task-relevant mappings, verify target equivalence with read-only probes, use an equivalent authorized alternate route when available, and never ask the owner to recognize a machine-generated target label merely because the first connector failed. The canonical rule is in `patterns/worker-self-remediation-before-owner-interruption.md`, projected to root/reusable agent instructions and `patterns/human-readable-operational-references.md`, with provenance in `audits/2026-10-07-opaque-target-access-recovery.md` and regression coverage in `tests/test_worker_self_remediation_before_owner_interruption.py`.

- This file routes repository recovery and records repository-level state only.
- Resolve the active branch's task checkpoint before resuming task work.

## Task checkpoints

- Each task has one file in `state/tasks/`. Assign a stable unique task ID;
  use `pr-<number>` for a pull request. The helper hashes the exact branch and
  task ID into a portable filename. Start from `templates/CURRENT-STATE.md`.
- Read the path printed by
  `python3 scripts/task_checkpoint_path.py "$(git branch --show-current)" "<task-id>"`.
- A task edits only its own checkpoint. Edit this entry point only when
  repository-level state changes; keep completed task files after merge.

## Preserved architecture boundaries

- Chat → Work requires explicit user acceptance; Work ↔ Work uses native
  Work-internal coordination; Work → the originating Chat is unavailable.
  Mission Control's autonomous control-plane routing of supervision and
  escalation does not create a native return edge or transfer semantic
  reasoning authority.
- Production promotion is not authorized by this change.
- Coverage-before-depth completion references remain active in
  `patterns/coverage-before-depth-in-selection.md`,
  `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`, and
  `tests/test_coverage_before_depth_pattern.py`.

## Remaining

- Preserve this entry point and route each new branch to its own task file.

## Blockers / unresolved

- No repository-level blocker recorded here; consult the active task checkpoint.

## Evidence / artifacts

- Task-specific evidence and gate results live in the derived task checkpoint.
- Exact implementation state is established by Git, tests, and task artifacts.

## Next safe action

- Identify the active branch, open its task checkpoint, and reconcile it with
  the working tree and current owner instructions before continuing.
