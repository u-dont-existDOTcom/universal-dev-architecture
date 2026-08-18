# Inner Signal exclusive active-task lock — transferable lesson audit

Date: 2026-08-18  
Origin repository: `u-dont-existDOTcom/innerSignalGraph`  
Origin pull request: `#11`  
Origin task branch: `agent/merge-inner-child-protocol-20260818`  
Creative Tail source: `u-dont-existDOTcom/creativeTailSampling@af36a51e44a65067a3d7703a78a004fdb8ad7693`

## Incident

The owner supplied a detailed handoff for a 49-case therapy-protocol comparison and runtime integration. The handoff was pasted into Codex, but the worker was later resumed in an older conversation/worktree environment.

The resumed worker selected and completed older S001 work, then followed repository roadmap and Guide Packet r03/r04 state. Context compaction and generic instructions such as `continue`, `reassess the original objective`, and `what's next` allowed older task sources to regain control.

The failure was amplified by branch-local split-brain state:

- PR #11 was an owner-authorized therapy-policy integration;
- its `state/CODEX-CURRENT-STATE.md` still described the public-transition/App-permission task as current;
- it retained an obsolete instruction not to copy therapy changes;
- ordinary package CI could pass the preliminary protocol router and synthetic tests even though the 49-query corpus, genuine Map 15/16 comparisons, actual-model campaign, and multi-turn evidence did not exist.

## Project repair

InnerSignalGraph PR #11 added or updated:

- `tasks/ACTIVE-TASK.json` — exclusive branch-bound task identity;
- `scripts/verify-active-task.mjs` — preflight and artifact acceptance;
- `tests/active-task-lock.test.mjs` — wrong-branch, stale-state, missing-artifact, blocked-live-run, and grader-leak regressions;
- `package.json` — `task:preflight` and `therapy-protocol:acceptance` commands;
- `state/CODEX-CURRENT-STATE.md` — active task above retained compliance evidence;
- PR body — explicit `INCOMPLETE` status and completion semantics.

Prepared InnerSignalGraph task-lock head:

```text
bbcf8dad4e2fa00a00bf236b5f4fc9266b25a8ef
```

The verifier is designed to fail until durable evidence exists for:

- 49 unique real-query fixtures;
- query/grader separation;
- deterministic and actual-model results;
- Map 15 and Map 16 per-case comparisons and aggregate decisions;
- adversarial multi-turn trajectories;
- provenance/crosswalk documentation;
- exact-head verification;
- unchanged article and `stable` boundaries.

## Transfer rationale

This is not therapy-specific. Any repository with multiple worktrees, old handoffs, autonomous roadmaps, compliance tasks, and resumed agent conversations can exhibit the same failure:

```text
correct owner handoff
→ resumed/compacted agent
→ stale local task source regains authority
→ agent completes the wrong task
→ ordinary tests are green
→ owner deliverable remains missing
```

The transferable controls are:

- exclusive machine-readable task identity;
- branch/worktree preflight;
- explicit suspension of competing task sources;
- artifact-based task acceptance separate from repository tests;
- terminal states `INCOMPLETE`, `BLOCKED`, `READY_FOR_PROTECTED_MERGE`, and `COMPLETE`;
- protected merge and immutable closeout receipt.

## Validation evidence

The originating project regression file exercises six causal cases:

1. wrong branch fails preflight;
2. stale current-state identity fails preflight;
3. preliminary router alone cannot satisfy acceptance;
4. synthetic complete evidence satisfies the acceptance contract;
5. blocked actual-model campaign remains `BLOCKED` rather than complete;
6. query/grader leakage fails closed.

The universal promotion adds its own pattern/template tests. Exact repository CI and PR receipts remain project-local evidence and must not be invented here.

## Disposition

- **Promoted:** exclusive active-task lock, branch preflight, suspended competing sources, artifact acceptance, explicit terminal states.
- **Project-specific:** therapy corpus paths, 49-case counts, Map 15/16 names, PR #11, Creative Tail SHAs.
- **Not promoted:** any claim that the therapy protocol or model campaign is complete or clinically validated.

## Limits

- The control does not replace substantive implementation tests or qualified review.
- A lock cannot override new owner instructions, safety boundaries, permissions, spending, publication, or irreversible actions.
- Tiny one-turn tasks do not require this machinery.
- Parallel task locks require separate worktrees and serialized shared mutable state.
