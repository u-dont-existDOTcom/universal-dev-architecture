# Exclusive Active-Task Locks and Artifact-Based Completion

## Problem

A long-running repository can contain several simultaneously valid but competing sources of “what to do next”:

- old conversation objectives;
- root and worktree handoffs;
- current-state files from another branch;
- autonomous roadmaps;
- open pull requests;
- recovery ledgers;
- specialist review queues;
- unrelated compliance or release blockers.

A detailed owner handoff can still lose operational control after a resumed conversation, context compaction, model switch, or generic instruction such as `continue`, `reassess the original objective`, or `what's next`. The agent may diligently complete the wrong historical task because task identity remained conversational rather than executable.

Ordinary tests do not solve this. A repository can be green while the owner task remains mostly unperformed. A package suite proves that implemented code passes its declared tests; it does not prove that every required corpus, comparison, live run, artifact, review, or merge receipt exists.

## Universal rule

For consequential multi-session work in a repository with competing task sources, make the active task **exclusive, source-controlled, branch-bound, and machine-gated**.

Use four distinct controls:

1. a machine-readable active-task lock;
2. a preflight that verifies task and branch identity;
3. a task-specific acceptance command that inspects required evidence;
4. explicit terminal-state semantics that distinguish incomplete, blocked, ready to merge, and complete.

Conversation is still disposable working memory. The active task is recovered from Git.

## 1. Store one machine-readable active-task lock

Use a repository-local file such as:

```text
tasks/ACTIVE-TASK.json
```

At minimum it should record:

```json
{
  "schemaVersion": 1,
  "taskId": "example-task-v1",
  "status": "active",
  "exclusive": true,
  "requiredBranch": "agent/example-task",
  "pullRequest": 123,
  "preflightCommand": "npm run task:preflight",
  "completionCommand": "npm run task:acceptance",
  "suspendedTaskSources": [
    "old handoffs",
    "global roadmap selection",
    "unrelated worktrees",
    "release queues"
  ]
}
```

The lock belongs in the **target repository and task branch**, not only in a source repository, external note, or prior chat.

The lock does not grant new authority. Current owner requirements, safety boundaries, access constraints, spending, publication, and irreversible actions retain their normal gates.

## 2. Make the task exclusive without deleting other valid state

An exclusive task lock means:

- other branches and worktrees remain intact;
- historical handoffs remain evidence;
- global roadmaps remain valid for later use;
- unrelated compliance or release blockers remain true;
- none of those sources may select the current worker's next task while the lock is active.

Name the suspended competing sources explicitly. Do not rely on a generic sentence such as “focus on this task.”

This avoids two bad extremes:

- deleting useful parallel state to reduce ambiguity;
- allowing every valid repository queue to compete for the current agent.

## 3. Run task preflight before reading roadmaps or old handoffs

After a fresh start, resume, context compaction, or model switch, the first repository command should verify:

- the active-task file exists and parses;
- `exclusive` is true when required;
- the current branch/worktree matches `requiredBranch`;
- the canonical current-state checkpoint names the same `taskId`;
- the checkpoint names the task-specific completion command;
- competing task sources are explicitly suspended.

A wrong branch is a **hard preflight failure**. It is not permission to choose a different task from the repository.

If the worker is in an old S001, guide-packet, compliance, release, or roadmap worktree, it should stop that task-selection process and move to the exact active-task worktree. It should not reinterpret the owner request to match the current directory.

## 4. Mirror the lock in the human-readable current-state checkpoint

The canonical recovery checkpoint should prominently state:

- task ID;
- exact branch or worktree;
- pull request when applicable;
- first preflight command;
- task-specific acceptance command;
- current partial progress;
- remaining acceptance conditions;
- suspended competing task sources;
- the rule that ordinary green tests are prerequisites, not completion.

If a repository must preserve an older compliance checkpoint verbatim for audit integrity, keep it as subordinate evidence. Put the exclusive task lock above it and say explicitly that the older “next safe action” is suspended for the active task.

Do not allow a branch-local current-state file to continue saying “do not change this policy” after a newer owner-authorized branch exists specifically to change it.

## 4A. Resolve task authority before global execution status

File order is not authority order. For continuation of a validated active task, use:

```text
current exact owner instruction or correction
-> active-task lock and matching task-local checkpoint
-> task-local plan and current chat-authored directive
-> task PR/code/tests/CI and execution evidence
-> repository-global operational state where causally applicable
-> historical task state, old issues, old handoffs, archived checkpoints
```

Repository-wide safety, privacy, security, permission, spending, publication, and irreversible-action policies remain controlling for affected operations. A more specific task-local checkpoint cannot waive them. But a generic global `BLOCKED`, `WAITING`, or `OWNER_DECISION_REQUIRED` label is not transitive across task IDs.

Before a blocker changes the active task state, require a machine-readable `templates/SCOPED-BLOCKER.json` record proving that it is unresolved, current enough, scoped to this task/frontier/operation, causally required, not superseded, and not displaced by higher-precedence authority that establishes independence.

Use these repository-global relations:

```text
CURRENT_AND_APPLICABLE
CURRENT_BUT_UNRELATED
STALE_BUT_APPLICABLE_REVALIDATION_REQUIRED
STALE_AND_UNRELATED
AMBIGUOUS
```

When a global blocker is unrelated, preserve it as `SUSPENDED_COMPETING_SOURCE`, leave the task-local execution state unchanged, and raise the applicable finding rather than deleting history. When scope is semantic or ambiguous, route to the reasoning chat; Codex does not decide.

Waiting is a separate controlled action. `templates/WAIT-ADMISSION.json` binds the active task, exact blocker or reasoning request, causal dependency, exact changing condition, source, actor/mechanism, poll or notification identity, next check, maximum horizon, horizon-expiry state, owner action, and unrelated-work policy. A bare `wait for GitHub to update`, `wait for CI`, `wait for issue`, or `wait for owner` fails closed.

Required findings include:

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

## 5. Use an artifact-based acceptance command

A task-specific command such as:

```bash
npm run task:acceptance
```

should fail closed until the actual owner deliverables exist.

It should inspect durable artifacts rather than infer completion from prose. Depending on the task, checks may include:

- exact corpus count and unique IDs;
- separation of model input from grader-only expectations;
- deterministic per-case results;
- actual non-mock model-run receipts;
- multi-turn trajectory results;
- comparison or ablation tables;
- aggregate metrics and explicit retain/simplify decisions;
- source provenance and runtime crosswalk;
- unresolved severe-failure count;
- exact-head verification commands;
- stable/release boundaries;
- article or source immutability;
- protected merge and post-merge receipt.

The acceptance command should print structured findings such as:

```text
CORPUS_MANIFEST_MISSING
LIVE_CAMPAIGN_BLOCKED
ABLATION_SUMMARY_MISSING
QUERY_INPUT_GRADER_LEAK
VERIFICATION_RECEIPT_MISSING
```

This turns “what remains?” into a deterministic query rather than a model judgment.

## 6. Separate repository correctness from task completeness

Use this distinction:

```text
ordinary test suite
  = implemented repository behavior is internally green

task-specific acceptance
  = the owner-requested work products and evidence exist

protected merge + immutable receipt
  = task closeout is complete
```

A worker may not use `npm test`, `npm run verify`, green CI, a passing mock replay, or a handful of synthetic tests as proof that a 49-case comparison, migration, audit, or live-validation campaign was completed.

## 7. Use explicit terminal states

Recommended vocabulary:

- `INCOMPLETE` — acceptance findings remain and work can continue;
- `BLOCKED` — a genuine external permission, credential, access, spending, safety, publication, or provider boundary prevents a required step and durable evidence names it;
- `READY_FOR_PROTECTED_MERGE` — task acceptance passes, but protected integration and receipt remain;
- `COMPLETE` — protected merge/readback and immutable closeout receipt exist.

Do not call missing implementation a blocker. Do not call a provider timeout a model rejection. Do not call a blocked live campaign complete.

## 8. Keep expected answers out of model input

For black-box model testing, the lock and acceptance harness should mechanically separate:

```text
model-facing query
```

from:

```text
expected route
prohibited behavior
assertions
grader metadata
framework hints
```

The acceptance gate should fail if grader fields leak into model input, even if all campaign result files exist.

## 9. Define closeout and retirement

The task lock should not become a permanent competing authority.

After protected merge:

1. record exact source and merged SHAs;
2. record required check results;
3. record immutable post-merge receipt;
4. set task status to complete or archive the lock under a historical task path;
5. update the canonical current-state checkpoint;
6. re-enable normal roadmap selection only after closeout.

A later task creates a new lock with a new task ID. It must not silently repurpose an old task lock.

## 10. Regression tests for the control plane

At minimum test that:

- preflight rejects the wrong branch;
- preflight rejects a stale current-state task identity;
- preliminary code plus ordinary green tests cannot satisfy acceptance;
- acceptance passes only when all declared artifacts exist;
- a blocked live campaign yields `BLOCKED`, not `COMPLETE`;
- model-input/grader leakage fails closed;
- unrelated roadmap or worktree state is not selected while the task is exclusive.

## Anti-patterns

Do not rely on:

- a long prompt alone;
- a resumed conversation's hidden memory of the handoff;
- `continue` or `what's next` as task selectors;
- a global roadmap when a branch-specific owner task is active;
- a current-state file from another branch;
- ordinary CI as proof of owner-task completion;
- a PR body that says “work in progress” while the worker reports complete;
- conversational promises to compare without per-case comparison artifacts;
- deleting parallel worktrees merely to prevent task drift.

## Recommended project instruction

> For consequential multi-session work with competing repository task sources, maintain one machine-readable exclusive active-task lock in the target branch. After any fresh start, resume, compaction, or model switch, run the task preflight before consulting old handoffs or global roadmaps. A branch mismatch fails closed. Ordinary tests are prerequisites, not task completion. Claim readiness only when the task-specific acceptance command verifies every required artifact; claim completion only after protected merge and an immutable receipt.

## Origin / evidence

Promoted on 2026-08-18 from `u-dont-existDOTcom/innerSignalGraph` PR #11 and its Creative Tail integration task.

The incident combined these conditions:

- the owner had supplied the correct detailed handoff;
- a resumed Codex conversation later recovered older S001 and Guide Packet work;
- context compaction and generic continuation language allowed those sources to regain task-selection authority;
- the PR #11 branch's canonical state still pointed to a GitHub App permission action and retained an obsolete instruction not to change therapy policy;
- ordinary CI passed a preliminary router and synthetic tests while the required 49-case corpus, actual comparisons, live campaign, and multi-turn evidence were absent.

The project repair added:

- `tasks/ACTIVE-TASK.json`;
- `npm run task:preflight`;
- `npm run therapy-protocol:acceptance`;
- branch/task mismatch tests;
- fail-closed corpus, live-run, comparison, multi-turn, documentation, and verification checks;
- explicit suspension of S001, Guide Packet, roadmap, compliance, and release queues for PR #11.

Originating source baseline:

- Creative Tail source: `af36a51e44a65067a3d7703a78a004fdb8ad7693`;
- one-inner-parent semantic checkpoint: `db591713a3feb0a1576943408ae356685c0034ec`;
- InnerSignalGraph PR #11 task-lock head at promotion preparation: `bbcf8dad4e2fa00a00bf236b5f4fc9266b25a8ef`.

The lesson is transferable because the failure concerns agent task selection and completion semantics, not therapy content.

## Limits

- Tiny one-shot tasks do not need a dedicated lock.
- A lock cannot override newer owner instructions, safety policy, legal constraints, permissions, spending, publication, or irreversible-action gates.
- A task-specific acceptance script is only as strong as its artifact schemas and tests; keep it reviewed and mutation-sensitive.
- Parallel agents may have separate locks in separate worktrees, but shared mutable state must still be serialized.
- A lock prevents task drift; it does not prove the substantive implementation is correct.
