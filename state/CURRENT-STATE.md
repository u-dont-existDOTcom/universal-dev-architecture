# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-29

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

- This file routes repository recovery and records repository-level state only.
- Resolve the active branch's task checkpoint before resuming task work.

## Task checkpoints

- Each task has one file in `state/tasks/`. The path helper percent encodes
  short branch names and hashes long ones. Start from `templates/CURRENT-STATE.md`.
- Read the path printed by
  `python3 scripts/task_checkpoint_path.py "$(git branch --show-current)"`.
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
