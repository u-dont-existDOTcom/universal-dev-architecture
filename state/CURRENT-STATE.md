# Current State

Updated: 2026-08-14

## Goal

- Establish and roll out a source-grounded, risk-adjusted Codex + GitHub operating system across Joel's repositories.

## Authority / baseline

- Canonical repository: `u-dont-existDOTcom/universal-dev-architecture`
- Canonical branch: `main`
- Active task branch: `codex/github-compliance-2026-08-14`
- Recovered baseline commit: `d1948c504687503f771c02dc4140f99bc66d2e0d`
- Universal entry point: `LESSON-INDEX.md`
- Current Codex/GitHub policy: `patterns/codex-github-operating-system.md`
- Current owner requirement: important project state and reusable working architectures must survive chat/context loss in GitHub.

## Completed

- Repository-first learning and context-compaction resilience patterns exist.
- The original Codex/GitHub pattern, templates, audit, CI, and lesson closeout landed on `main`; their execution and hosted claims still required reconciliation.
- The current compliance plan is committed as `c83b99e`.
- The Python 3.12 audit import repair and regression are committed as `c1c96cb`.
- Audit expansion for exact commands, hosted-claim evidence, instruction budgets, workflow permissions/timeouts/concurrency, unsafe filenames, and risk posture is committed as `5d599a0`; all 30 tests passed before that commit.
- Current official OpenAI and GitHub source-registry targets were checked on 2026-08-14.
- Hosted inspection directly verified one admin collaborator and zero environments. Other settings remain separated below.

## Current checkpoint

- Current step: execute `docs/superpowers/plans/2026-08-14-universal-dev-architecture-compliance.md` on branch `codex/github-compliance-2026-08-14`.
- Recovered baseline: `main` at `d1948c504687503f771c02dc4140f99bc66d2e0d` was clean, but both declared gates failed before running tests because `PULL_REQUEST_TARGET_RE` raised `re.error: global flags not at the start` on Python 3.12.
- Last verified durable boundary: Task 2 commit `5d599a0`; the staged Task 3 candidate passes JSON validation, all 30 unit tests, and the repository audit with zero errors and two truthful hosted-control warnings.
- Working-tree status: isolated sibling worktree at `/home/joel/universal-dev-architecture-worktrees/codex-github-compliance-2026-08-14`; Task 3 awaits commit.

## Remaining

- Commit Task 3 policy/index/state reconciliation.
- Add/version the reusable compliance-worker and final fleet-auditor architecture.
- Consolidate CI and make scheduled drift reporting idempotent.
- Run final local gates, open one universal PR, inspect final-head CI, and merge only if policy permits.
- Audit/remediate AskRigor on its own branch/PR, then re-fetch its evidence before updating this repository's fleet ledger in a non-overlapping follow-up.

## Blockers / unresolved

- `UNVERIFIED`: branch protection, Actions defaults, secret scanning, push protection, vulnerability alerts, and private vulnerability reporting. Their REST endpoints returned integration-scope `403` or `404`; repository files cannot resolve them.
- `PLAN-LIMITED`: rulesets returned `403` with GitHub's instruction to upgrade to Pro or make the private repository public.
- `DISABLED`: code-scanning endpoint explicitly reported that code scanning is not enabled. Enabling it may also require a private-repository plan/security entitlement not available to this integration.
- The local `gh` credential is invalid, so it cannot provide the missing administration scope. SSH Git transport remains functional but cannot inspect or mutate hosted settings.

## Evidence / artifacts

- Current plan: `docs/superpowers/plans/2026-08-14-universal-dev-architecture-compliance.md`
- Historical rollout plan: `docs/plans/2026-08-14-codex-github-best-practices-audit.md`
- Tests: `tests/test_audit_codex_github.py`
- Audit implementation: `scripts/audit_codex_github.py`
- Repository profile: `.github/codex-repository.json`
- Hosted evidence: `.github/codex-repository.json` and the final compliance report to be added in Task 6.

## Next safe action

- Commit the verified Task 3 candidate, then create and index the reusable compliance-worker architecture from Task 4.

## Recovery rule

On a fresh thread, interruption, context compaction, or model switch, inspect actual repository state and recent commits before trusting this file. Reconcile any mismatch, identify exactly what survived, update stale entries, and resume from the latest verified durable boundary without repeating completed work.
