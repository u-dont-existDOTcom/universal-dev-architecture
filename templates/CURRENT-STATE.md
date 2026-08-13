# Current State

Use this file as the concise recovery entry point for long-running or multi-session work. Keep it current enough that a fresh worker with repository access but no old chat transcript can resume correctly.

## Goal

- Current task / intended outcome:

## Authority / baseline

- Canonical repository:
- Relevant branch/ref:
- Relevant baseline commit:
- Current owner constraints / decisions:

## Completed

- Durable work already completed and not to be repeated:

## Current checkpoint

- Current step:
- Last verified durable boundary:
- Working-tree status if relevant:

## Remaining

- Remaining work:

## Blockers / unresolved

- Blockers:
- Open questions / uncertainty:

## Evidence / artifacts

- Relevant files:
- Tests / validation:
- Logs / reports:
- Relevant branches / commits:

## Next safe action

- Exact next action or command:

## Recovery rule

On a fresh thread, interruption, context compaction, or model switch, inspect actual repository state and recent relevant commits/artifacts before trusting this file. Reconcile any mismatch, identify exactly what survived, update stale entries, and resume from the latest verified durable boundary without repeating completed work.
