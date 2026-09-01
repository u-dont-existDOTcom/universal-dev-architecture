# Current State

Use this file as the concise recovery entry point for long-running or multi-session work. Keep it current enough that a fresh worker with repository access but no old chat transcript can resume correctly.

## Owner-source and owner-outcome invariant

- Owner-request ID:
- Canonical locator or immutable source block:
- Source capture time:
- Owner-source SHA-256:
- Independent owner-source receipt ID/status:
- Worker-copy/source comparison: `MATCH` / `MISMATCH` / `WORKER_COPY_ABSENT` / `SOURCE_UNAVAILABLE`
- Append-only owner correction IDs:
- Owner-outcome ID / epoch:
- Owner-outcome SHA-256:
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
- Current derived task contract and revision/hash:
- Objective-reconciliation record:
- Outcome-coverage/derivation proof location:

## Independent alignment states

- Worker-to-contract alignment: `GREEN` / `YELLOW` / `RED` / `UNKNOWN`
- Contract-to-owner alignment: `MATCH` / `PARTIAL` / `DIVERGED` / `SOURCE_MISSING`
- Overall task traffic:
- Unmapped owner requirements:
- Contract divergences:
- Authorized owner changes:
- Last reconciliation trigger/time:

A GREEN worker-to-contract state does not override a `DIVERGED`, `SOURCE_MISSING`, or materially `PARTIAL` contract-to-owner state.

## Completed

- Durable work already completed and not to be repeated:
- Which required owner outcomes this directly satisfies:
- Supporting work that is valid but does not itself satisfy the owner outcome:

## Current checkpoint

- Current step:
- Last verified durable boundary:
- Exact candidate/commit/hash:
- Working-tree status if relevant:
- Typed completion claim:
  - `WORKING`
  - `ARTIFACT_READY`
  - `TESTS_PASS`
  - `READY_FOR_OWNER_REVIEW`
  - `READY_FOR_RELEASE`
  - `PARTIAL_OUTCOME`
  - `SUBTASK_COMPLETE_PARENT_OPEN`
  - `OWNER_OUTCOME_ACHIEVED`
  - `BLOCKED_OWNER_DECISION`
  - `CANCELED_BY_OWNER`
- Current proposed workflow state:
- Terminal comparator result:

## Owner-outcome gap

- Required outcomes currently `MET`:
- Required outcomes currently `UNMET`:
- Required outcomes currently `UNKNOWN`:
- Exact current gap:
- Why any review/handoff/readiness state is nonterminal:

## Research / AskRigor assurance planes

Complete when applicable; otherwise record `NOT_APPLICABLE`.

- Operational alignment:
- Scientific adequacy:
- Release adequacy:
- Research-verdict record:
- Current release/publication permission and reason:

Operational PASS does not establish scientific adequacy. Scientific PASS does not establish privacy, licensing, consent, freshness, provenance, security, product, or release adequacy.

## Supervision-design feedback

- Substantive supervision-design improvements/questions found:
- Feedback ID(s):
- Blocks current boundary:
- Shared Pro meta-review scope:
- Pro meta-review status:
- Resulting architecture/test references:

Substantive supervision-design feedback must be routed to the shared scope-bound Pro meta-review chat. Nonblocking feedback does not stop unrelated safe work.

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
- Independent owner-source receipt:
- Objective-reconciliation matrix:
- Logs / reports:
- Relevant branches / commits:
- Prior supervisor judgments invalidated by contract laundering, if any:

## Next reconciliation trigger

- Trigger:
- Expected boundary/time:

Required triggers include material discoveries, phase transitions, changed acceptance criteria/tests, owner corrections, owner-review readiness, release/deployment/publication preparation, root completion proposals, and supervision-design changes affecting task semantics.

## Next safe action

- Exact next action or command:

## Terminal-state rule

Passing the current task’s derived acceptance criteria, reaching `READY_FOR_OWNER_REVIEW`, obtaining supervisor approval, or completing supporting gates does not close the root task while any terminal-required owner outcome is `UNMET` or `UNKNOWN`.

A subtask may be recorded as `SUBTASK_COMPLETE_PARENT_OPEN`. Only exact fresh evidence for all terminal-required outcomes plus `contract_to_owner: MATCH` permits `OWNER_OUTCOME_ACHIEVED`, unless the owner explicitly amends or cancels the outcome.

Follow:

- `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`
- `patterns/supervision-assurance-planes-and-pro-meta-review.md`

## Recovery rule

On a fresh thread, interruption, context compaction, account switch, or model switch, inspect actual repository state and recent relevant commits/artifacts before trusting this file. Reconcile any mismatch, independently recover the original owner source rather than trusting a narrowed checkpoint or worker handoff, update both alignment planes and stale entries, and resume from the latest verified durable boundary without repeating completed work.
