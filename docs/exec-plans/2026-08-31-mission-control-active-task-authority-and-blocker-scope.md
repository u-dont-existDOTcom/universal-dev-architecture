# Mission Control — Active-Task Authority and Blocker-Scope Precedence

**Status:** Required owner correction; chat-authored implementation directive for the Mission Control Codex executor  
**Date:** 2026-08-31  
**Feedback ID:** `SDF-20260831-ACTIVE-TASK-BLOCKER-SCOPE-001`  
**Parent PR:** `u-dont-existDOTcom/universal-dev-architecture#42`

## 1. Controlling owner correction

A live InnerSignal Commons worker became stuck waiting for a GitHub update because its handoff told it to read the repository-global `state/CODEX-CURRENT-STATE.md` before the current task state. That global checkpoint still carried a historical repository-hardening `BLOCKED` state for installed GitHub App permission readback, while the active Commons task had green CI and a different next gate: independent privacy/security/therapy-boundary review.

The worker therefore inherited an unrelated stale blocker and waited for an event that was not causally required by its active task.

The governing correction is:

> **Blockers are scoped, not contagious. A repository-global `BLOCKED` state does not block an active task unless the blocker is explicitly and currently bound to that task or to a dependency the task actually requires. Current task-local authority outranks stale repository-global execution state for task continuation.**

A worker must never wait for a GitHub update, issue change, CI result, owner action, credential, or external event merely because some broader repository checkpoint mentions it. Waiting itself requires admission evidence.

## 2. Role boundary

This document is the reasoning decision. Codex implements it mechanically.

Codex must not invent blocker scope, reinterpret owner intent, or decide that a historical repository issue blocks a current task. Mission Control and deterministic validators resolve declared scope mechanically; ambiguous semantic scope returns to the reasoning chat.

## 3. Authority precedence for an active task

For execution continuation, use this precedence unless the current owner explicitly overrides it:

```text
1. current exact owner instruction / correction
2. current active-task contract and task-local current state
3. current task-local design/spec/plan and versioned chat-authored directive
4. current task PR/code/tests/CI and exact execution evidence
5. repository-global current state and general repository policy
6. historical task state, old issues, old handoffs, archived checkpoints
```

Higher-precedence task-local authority may not weaken repository-wide safety, privacy, release, security, or destructive-action policy. But a repository-global operational blocker from another task cannot silently become a dependency of the active task.

A handoff that says to read repository-global state before task-local state must not cause the global status label to override a more specific active-task continuation state.

## 4. Scoped blocker contract

Every blocker that can stop or park substantive execution must have a durable machine-readable record with at least:

```text
blocker_id
scope_type
scope_id
source_ref
source_observed_at
source_freshness_state
blocking_condition
causal_dependency
applies_to_task_ids
applies_to_strategy_family_ids
unblock_event
unblock_event_source
unblock_capability_owner
owner_action_required
owner_action
retry_or_recheck_policy
maximum_wait_horizon
unrelated_work_allowed
supersedes / superseded_by
status
```

Permitted `scope_type` values:

```text
REPOSITORY
TASK
STRATEGY_FAMILY
DIRECTIVE
RELEASE
SECURITY_POLICY
EXTERNAL_SERVICE
OWNER_DECISION
```

A repository-scoped blocker applies to every task only when its semantics actually prohibit the affected operation repository-wide, for example a confirmed repository security freeze or inability to perform any required Git write.

A repository-scoped blocker does **not** automatically block unrelated work merely because it exists in a global current-state document.

## 5. Blocker applicability test

Before a blocker can transition an active task into a waiting or blocked state, deterministic control must establish all of:

```text
1. blocker is unresolved;
2. blocker evidence is current enough for the decision;
3. blocker scope includes this task, strategy family, directive, or a required operation;
4. the active task has a causal dependency on the blocked capability or event;
5. no higher-precedence current task authority explicitly establishes the work as independent;
6. the requested wait can actually lead to a changed executable frontier.
```

If any requirement fails:

```text
blocker_applicability = NOT_APPLICABLE
active_task_execution_state = unchanged
```

If semantic scope cannot be determined mechanically:

```text
blocker_applicability = AMBIGUOUS
reasoning_review_required = true
```

Codex may not choose the answer.

## 6. Wait-admission contract

Waiting or polling is itself a controlled action. Before entering a wait state, require:

```text
wait_id
active_task_id
reason_for_wait
blocking_blocker_id or reasoning_request_id
causal_dependency
exact_condition_expected_to_change
condition_source
source_observed_at
who_or_what_can_change_condition
poll_or_notification_mechanism
polling_needed
next_check_at
maximum_wait_horizon
state_if_horizon_expires
owner_action_required
unrelated_work_allowed
```

A worker may wait only when the condition can plausibly change and the change matters to its next authorized action.

Invalid waits include:

```text
wait for GitHub to update
wait for issue to change
wait for CI
wait for owner
wait for permission
```

without exact identity, causal dependency, expected event, and horizon.

If no external actor or mechanism is expected to change the condition, polling is prohibited. Persist a scoped `BLOCKED_EXTERNAL`, `OWNER_DECISION_REQUIRED`, `NO_VALID_STRATEGY`, or other truthful state instead.

## 7. Staleness and cross-task inheritance

Every global checkpoint consumed by an active task must be treated as evidence with scope and freshness, not as an absolute status oracle.

Required states:

```text
global_state_relation_to_active_task:
  CURRENT_AND_APPLICABLE
  CURRENT_BUT_UNRELATED
  STALE_BUT_APPLICABLE_REVALIDATION_REQUIRED
  STALE_AND_UNRELATED
  AMBIGUOUS
```

Historical `BLOCKED`, `WAITING`, `OWNER_DECISION_REQUIRED`, or `PENDING` labels are non-transitive across task IDs.

A blocker from task A may affect task B only through an explicit current dependency edge.

Task rollover, branch reuse, handoff reuse, or repository-global state reuse must not manufacture that dependency.

## 8. Exact InnerSignal regression

Hostile fixture: `innersignal-commons-stale-global-blocker.json`.

Given:

```text
repository: u-dont-existDOTcom/innerSignalGraph
active task: opt-in-community-mvp-20260830
active branch: design/opt-in-community-learning-20260830
active PR: #15
active-task state: executable MVP complete; CI green; next gate = independent privacy/security/therapy-boundary review
repository-global state: BLOCKED on old installed-GitHub-App permission readback
old blocker source: issue #4
old blocker task: repository public-transition/hardening
old blocker change capability: requires GitHub-App-authorized authentication not held by the worker
handoff ordering: repository-global state appears before task-local state
```

Expected result:

```text
global_state_relation_to_active_task: STALE_AND_UNRELATED
blocker_applicability: NOT_APPLICABLE
active_task_execution_state: REASONING_REVIEW_DUE
wait_for_github_update: false
owner_action_required: false
required_action: ROUTE_CURRENT_TASK_EVIDENCE_TO_REASONING_CHAT
alert: STALE_GLOBAL_BLOCKER_INHERITED
```

The implementation fails if it parks the Commons task, polls issue #4, waits for GitHub, or asks the owner to resolve the unrelated App-permission readback.

## 9. Counter-regressions

Also test blockers that legitimately propagate:

1. A repository-wide confirmed credential leak requiring all writes to stop -> applicable to every write directive.
2. A branch-protection/CI requirement explicitly named by the active task -> applicable until exact required checks complete.
3. A release-only blocker -> does not block ordinary development work.
4. A publication permission blocker -> does not block local tests or non-public drafting.
5. A task-specific owner decision -> blocks only the dependent task boundary.
6. A stale global blocker that has been superseded -> never blocks.
7. A blocker whose source is current but whose causal dependency is absent -> does not block.
8. A blocker with no actor/mechanism capable of changing it -> no polling loop; persist truthful blocked state.

## 10. Required alerts

Add:

```text
STALE_GLOBAL_BLOCKER_INHERITED
BLOCKER_SCOPE_MISMATCH
BLOCKER_CAUSAL_DEPENDENCY_MISSING
GLOBAL_STATE_STALE_FOR_ACTIVE_TASK
WAIT_CONDITION_NOT_ACTIONABLE
WAIT_WITHOUT_ADMISSION
GITHUB_UPDATE_WAIT_WITHOUT_CAUSAL_DEPENDENCY
CROSS_TASK_BLOCKER_LEAKAGE
```

## 11. Dashboard projection

For each task, separately show:

```text
active task authority ref
active task state age
repository-global state ref and age
repository-global relation to active task
active blockers with scope
ignored/unrelated blockers
current wait reason, if any
wait start and horizon
who/what can unblock
owner action or NONE
unrelated work allowed
```

A task card must never show simply `BLOCKED` because the repository is blocked elsewhere.

Example:

```text
InnerSignal Commons — REVIEW DUE
Task blocker: none
Repository-global blocker: GitHub App permission readback
Relation: unrelated historical repository-hardening blocker
Waiting: no
Next action: Extra High privacy/security/product review; Pro only if therapy semantics require escalation
Owner action: NONE
```

## 12. Existing handoff/bootstrap changes

Amend `templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md` so active task recovery explicitly resolves authority in the precedence order above.

The bootstrap must state:

> A repository-global `BLOCKED`, `WAITING`, or `OWNER_DECISION_REQUIRED` label does not block the active task unless a current scoped blocker record proves causal applicability. Never wait merely because an older global checkpoint or issue is unresolved.

Amend worker-handoff guidance so repository-global state is read for policy and dependencies but cannot override the active task state by file ordering alone.

## 13. Required schemas

Create:

```text
templates/SCOPED-BLOCKER.json
templates/WAIT-ADMISSION.json
```

Add current blocker IDs and wait-admission identity to the execution directive and Mission Control task projection.

## 14. Required deterministic logic

Implement pure validators/reducers equivalent to:

```text
resolve_active_task_authority(...)
evaluate_blocker_applicability(...)
validate_wait_admission(...)
project_task_blockers(...)
```

The resolver must not infer semantic scope from a generic word such as `BLOCKED`. It uses explicit IDs, dependency edges, task authority, and freshness evidence.

## 15. Required executable tests

At minimum:

1. Exact InnerSignal Commons regression above.
2. Global blocker from unrelated historical task does not block active task.
3. File-read ordering cannot change authority precedence.
4. Current task-local state overrides stale global operational state while preserving repository-wide safety policy.
5. Explicit current dependency edge makes a global blocker applicable.
6. Removing that dependency makes it inapplicable.
7. Stale-but-applicable blocker forces revalidation rather than indefinite wait.
8. Wait without exact changing condition fails admission.
9. Wait for issue update with no expected actor fails admission.
10. CI wait requires exact workflow/check identity and active-task dependency.
11. Completed CI automatically invalidates the associated wait.
12. Owner-decision wait requires exact decision ID and owner action.
13. Blocked credential unavailable to worker but not needed by active task does not block.
14. Release blocker does not block development.
15. Publication blocker does not block local work.
16. Repository-wide security freeze correctly propagates.
17. Superseded blocker never propagates.
18. Dashboard exposes ignored unrelated blocker rather than hiding it.
19. Cross-task blocker leakage raises `CROSS_TASK_BLOCKER_LEAKAGE`.
20. An unbounded `wait for GitHub update` instruction is rejected.

Presence-only tests are insufficient; execute the resolver and wait-admission logic against hostile fixtures.

## 16. Current-worker migration

At the next safe boundary every active worker must:

1. identify the exact active task ID;
2. identify current task-local authority;
3. list every blocker currently affecting its state;
4. bind each blocker to scope and causal dependency;
5. discard inherited unrelated blocker effects while preserving them as repository evidence;
6. validate any current waiting state through the wait-admission contract;
7. if a wait is invalid, stop polling and route the actual current task frontier to the reasoning chat;
8. do not ask the owner merely to clear an unrelated repository blocker.

## 17. Mechanical Codex directive

Implement this document exactly on PR #42.

Do not redesign the policy. Do not modify InnerSignalGraph as part of this Universal slice. Do not reopen closed handoff-liveness or resource-accounting feedback.

Required implementation surface:

- shared bootstrap;
- relevant Mission Control patterns;
- scoped blocker and wait-admission templates;
- directive/task projection fields;
- deterministic authority/blocker/wait resolver;
- dashboard requirements and alerts;
- exact InnerSignal hostile fixture;
- executable regressions listed above;
- index/README routes where required.

Run focused tests, the complete Universal test suite, JSON validation, compile checks, `git diff --check`, repository audit, and hosted CI on the final provenance head.

Return one immutable execution receipt to the assigned reasoning review lane. Continue automatically only under a validated next directive.
