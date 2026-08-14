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
- Policy authority, source-registry links, repository classification guidance, hosted evidence, and canonical state routing are reconciled in `c32b5eb`.
- Versioned compliance-worker, mandate-generation, and final-fleet-auditor architecture is committed as `883ed04`.
- CI consolidation and idempotent drift reporting are committed as `f6f129f`.
- High-confidence committed-secret content detection and three red/green regressions are committed as `ff26e6e`; the suite is now 33 tests.
- AskRigor exposed a portable-audit false positive on a negative private-key
  archive assertion. The red/green structural PEM fix is committed as
  `4b8247c`; the suite is now 34 tests and still catches complete plausible PEM
  blocks without printing matches.
- AskRigor's transferable exact-byte authority, access-truth, bounded-live,
  public-MCP, and scanner lessons are promoted at commit `7870cd2`; PR #4 head
  `7870cd2e649c8a09b0b09f96e0411c546e5f1782` passed `Universal repository
  compliance` run `31775698854`, job `94690572217`.
- AskRigor PR #7 head `9d9dc78294abbed06cf3acabe9e764ece0f57be8`
  was independently re-fetched; deterministic run `31776458050` and workflow
  policy run `31776458058` both succeeded. Hosted blockers remain in issue #6.
- AskRigor-lessons PR #3 head
  `dd9305a39c50251fa8858ecbf45aedb16a407f64` was independently re-fetched;
  lesson-integrity run `31777936617`, job `94697224159`, succeeded. Its sole
  lesson remains provisional/unverified and hosted blockers remain in issue #2.
- The reusable lesson-incubator design is promoted with exact AskRigor-lessons
  source hashes, tests, limits, anti-patterns, and supersession rules in
  `audits/2026-08-14-askrigor-lessons-transferable-design.md`.
- The fleet ledger now distinguishes the three independently audited blocked
  candidates from five repositories that remain historical `WRITE ISSUED` / `GAP`.
- Current official OpenAI and GitHub source-registry targets were checked on 2026-08-14.
- Hosted inspection directly verified one admin collaborator and zero environments. Other settings remain separated below.

## Current checkpoint

- Current step: verify and publish the final AskRigor-lessons promotion/fleet
  reconciliation to existing universal PR #4, then capture its new exact-head
  CI without advancing any repository from its evidence-backed `BLOCKED` state.
- Recovered baseline: `main` at `d1948c504687503f771c02dc4140f99bc66d2e0d` was clean, but both declared gates failed before running tests because `PULL_REQUEST_TARGET_RE` raised `re.error: global flags not at the start` on Python 3.12.
- Last verified durable boundary: AskRigor lesson promotion and green PR head
  `7870cd2e649c8a09b0b09f96e0411c546e5f1782`.
- Current candidate: AskRigor-lessons transferable-design promotion, explicit
  policy baseline, and direct GitHub-evidence fleet reconciliation.
- Working-tree status: isolated sibling worktree at
  `/home/joel/universal-dev-architecture-worktrees/codex-github-compliance-2026-08-14`;
  the final update awaits local gates, commit/push, and replacement PR CI.

## Remaining

- Run both canonical universal gates, metadata/YAML/shell/diff checks, review the
  complete final diff, commit/push to PR #4, and capture the exact replacement
  `Deterministic repository audit` run.
- Keep universal, AskRigor, and AskRigor-lessons PRs unmerged while their exact
  hardening issues record applicable hosted blockers.
- Five additional fleet repositories remain `WRITE ISSUED` / `GAP`; they
  require their own repository-specific workers before any status advancement.

## Blockers / unresolved

- `UNVERIFIED`: branch protection, Actions defaults, secret scanning, push protection, vulnerability alerts, and private vulnerability reporting. Their REST endpoints returned integration-scope `403` or `404`; repository files cannot resolve them.
- `PLAN-LIMITED`: rulesets returned `403` with GitHub's instruction to upgrade to Pro or make the private repository public.
- `DISABLED`: code-scanning endpoint explicitly reported that code scanning is not enabled. Enabling it may also require a private-repository plan/security entitlement not available to this integration.
- The local `gh` credential is invalid, so it cannot provide the missing administration scope. SSH Git transport remains functional but cannot inspect or mutate hosted settings.
- Hardening issue [#3](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/3) contains the precise plan/access/settings actions and must remain open until direct hosted evidence exists.

## Evidence / artifacts

- Current plan: `docs/superpowers/plans/2026-08-14-universal-dev-architecture-compliance.md`
- Historical rollout plan: `docs/plans/2026-08-14-codex-github-best-practices-audit.md`
- Tests: `tests/test_audit_codex_github.py`
- Audit implementation: `scripts/audit_codex_github.py`
- Repository profile: `.github/codex-repository.json`
- Hosted evidence: `.github/codex-repository.json`, hardening issue #3, and the final compliance report.
- Final universal report: `audits/2026-08-14-universal-compliance-report.md`.

## Next safe action

- Run final universal verification, publish only the scoped promotion/ledger
  update to PR #4, inspect its exact-head CI, and update the PR with that run.

## Recovery rule

On a fresh thread, interruption, context compaction, or model switch, inspect actual repository state and recent commits before trusting this file. Reconcile any mismatch, identify exactly what survived, update stale entries, and resume from the latest verified durable boundary without repeating completed work.
