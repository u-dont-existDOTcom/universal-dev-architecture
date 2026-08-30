# Current State

Use this file as the concise recovery entry point for long-running or multi-session work. Keep it current enough that a fresh worker with repository access but no old chat transcript can resume correctly.

## Owner-outcome invariant

- Owner-outcome ID / epoch:
- Owner-outcome SHA-256:
- Source reference(s):
- Verbatim owner request:
- Normalized final result:
- Required owner outcomes:
- Known non-satisfying proxies:

If the original request is unavailable or materially ambiguous, record `OUTCOME_AUTHORITY_UNRESOLVED`; do not silently substitute the current checkpoint or acceptance criteria.

## Goal

- Current task / contribution to the owner outcome:
- Root task or subtask:
- Parent task/outcome that remains open:

## Authority / baseline

- Canonical repository:
- Relevant branch/ref:
- Relevant baseline commit:
- Current owner constraints / decisions:
- Current derived task contract and revision:
- Outcome-coverage/derivation proof location:

## Completed

- Durable work already completed and not to be repeated:
- Which required owner outcomes this directly satisfies:
- Supporting work that is valid but does not itself satisfy the owner outcome:

## Current checkpoint

- Current step:
- Last verified durable boundary:
- Exact candidate/commit/hash:
- Working-tree status if relevant:
- Current proposed workflow state:
- Terminal comparator result:

## Owner-outcome gap

- Required outcomes currently `MET`:
- Required outcomes currently `UNMET`:
- Required outcomes currently `UNKNOWN`:
- Exact current gap:
- Why any review/handoff/readiness state is nonterminal:

## Remaining

- Remaining work required by the owner outcome:
- Remaining supporting work:

## Blockers / unresolved

- Blockers:
- Open questions / uncertainty:
- Genuine owner decisions required:

## Evidence / artifacts

- Relevant files:
- Tests / validation:
- Owner-outcome-specific evidence and candidate binding:
- Logs / reports:
- Relevant branches / commits:
- Prior supervisor judgments invalidated by contract laundering, if any:

## Next safe action

- Exact next action or command:

## Terminal-state rule

Passing the current task’s derived acceptance criteria, reaching `READY_FOR_OWNER_REVIEW`, obtaining supervisor approval, or completing supporting gates does not close the root task while any terminal-required owner outcome is `UNMET` or `UNKNOWN`.

A subtask may be recorded as `SUBTASK_COMPLETE_PARENT_OPEN`. Early owner feedback may be recorded as `EARLY_OWNER_EVALUATION_PARENT_OPEN`. Only exact fresh evidence for all terminal-required outcomes permits `OWNER_OUTCOME_SATISFIED`, unless the owner explicitly amends or cancels the outcome.

Follow `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`.

## Recovery rule

On a fresh thread, interruption, context compaction, or model switch, inspect actual repository state and recent relevant commits/artifacts before trusting this file. Reconcile any mismatch, identify exactly what survived, recover the original owner outcome rather than trusting a narrowed checkpoint, update stale entries, and resume from the latest verified durable boundary without repeating completed work.
