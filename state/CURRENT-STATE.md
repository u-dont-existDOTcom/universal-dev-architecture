# Current State

Updated: 2026-08-15

## Goal

Maintain and apply a source-grounded, risk-adjusted Codex + GitHub operating
system across repositories, with executable audits, durable recovery, exact
lesson provenance, and directly verified hosted governance.

## Authority / baseline

- Canonical repository: `u-dont-existDOTcom/universal-dev-architecture`
- Canonical branch: `main`
- Active compliance branch: `codex/github-compliance-2026-08-14`
- Current `main` integrated into the candidate: `385fb1201c68dd12552c9d21f14857bd0cdad6cd`
- Recovery refs: `recovery/universal-compliance-pre-main-e37f34b`,
  `recovery/universal-pre-final-fleet-1d1e6d0`,
  `recovery/universal-pre-public-c37f012`, and
  `recovery/universal-pre-main-9de3671-394e419`, and
  `recovery/universal-pre-main-385fb12-1c53752`
- Universal entry point: `LESSON-INDEX.md`
- Current Codex/GitHub policy: `patterns/codex-github-operating-system.md`
- Repository profile and exact commands: `.github/codex-repository.json`
- Current owner/project requirements outrank universal defaults on genuine
  conflict.

## Completed

- Repository-first learning, context-compaction resilience, GitHub bootstrap,
  the Codex/GitHub operating pattern, templates, executable audit,
  least-privilege CI, drift reporting, and durable worker/fleet-auditor
  templates exist.
- Compliance commits `c83b99e` through `e37f34b` repair Python 3.12
  compatibility and add exact-command, profile, state, instruction-budget,
  workflow, unsafe-filename, secret-content, risk-posture, and hosted-claim
  checks with regression coverage.
- The current candidate retains `main`'s structure-aware workflow parser,
  Inner Signal lessons, paid-workflow safety, editorial authority/lossless
  editing, universal coordination, and continuous next-step advancement after
  owner input.
- PR #11 merged the tested next-step rule as
  `5e8ab185a4bf052313698ea5348031e344fcd930`; merge-head runs
  `31856690969` / job `94942680272` and `31856691275` / job `94942681121`
  succeeded. PR #12 completed its state-only closeout as current `main`
  `9de36712e9250b79092b2ecd12cda5e005760d83`.
- Root compatibility state points only to this checkpoint, and the superseded
  operating-standard file remains provenance rather than a competing authority.
- AskRigor PR #8 merged as
  `f8e7ca1e10c096e050207828eeb9eb7957d7ef6f` after exact-head checks and
  bounded live Action acceptance; the synthetic lesson issue was safely closed.
- AskRigor compliance PR #7 is published at
  final head `43e5b9442c5456bcfaba9b76194bf6474f74346d` and merged as
  `9134e22784e4d26dcf3c6d24a299bb5f783455ad`; exact-head deterministic,
  workflow-policy, and CodeQL runs succeeded, issue #6 closed, and merged-main
  CodeQL closed the fixed alert.
- AskRigor-lessons PR #3 final head
  `c99a02492efa34d23bb836791aef00e08ce535ff` merged as
  `8e894ea73b1d589444fd5a059c517177eb4eb5d8`; exact-head and merged-main
  integrity/CodeQL gates succeeded. Its sole lesson remains
  provisional/unverified because originating incident/test provenance is absent.
- Official OpenAI and GitHub registry links were reviewed on 2026-08-15.
  Repository files do not assert hosted settings without API evidence.
- The owner authorized public visibility on 2026-08-15 after a reachable
  remote-history audit found no sensitive filenames, private-key material, or
  provider-token material. `LICENSE.md` deliberately grants no public reuse
  rights, and public visibility does not grant GitHub write access.
- Hosted public-repository governance is directly verified: active ruleset
  `20882387` requires pull requests and strict `Deterministic repository
  audit`, blocks deletion/force pushes, and retains the sole owner as the only
  bypass without requiring fake independent approval.
- Actions are limited to the repository's exact SHA-pinned checkout Action;
  default workflow tokens are read-only and cannot approve pull requests.
  Secret scanning, push protection, vulnerability alerts, Dependabot security
  updates, private vulnerability reporting, and CodeQL are enabled. CodeQL
  setup run `31862468675` succeeded for Actions/Python with zero open alerts.

## Current checkpoint

- Pull request: #4, `codex/github-compliance-2026-08-14` into `main`.
- Current `main` through `385fb12` has been merged locally into the compliance
  candidate. Rollback refs preserve both pre-integration boundaries. The first
  integration resolved the lesson-index/state conflicts semantically; the
  latest source-provenance lesson merged without conflict.
- Integrated head `e434f84af8398aa4d47fb034b4430082c230415d` passed 83/83
  unit tests, the self-audit with zero errors, JSON/YAML, scheduled-shell
  syntax, diff, and sensitive-history review. Exact-head workflow run
  `31857250098`, job `94944261385`, succeeded before the hosted evidence
  refresh; the final evidence commit requires its own replacement run.

## Remaining

- Reconcile the fleet ledger with the actual AskRigor and AskRigor-lessons merge
  commits and merged-main checks.
- Re-run the declared gates on this final integrated/evidence tree, publish PR #4's final
  head, require its replacement exact-head check, update/close issue #3, and
  merge only after every completion gate is green.

## Blockers / unresolved

- No applicable repository-control blocker remains. Historical private-plan
  `403` results are superseded by the dated public-repository API evidence in
  `.github/codex-repository.json`.
- Hardening issue
  [#3](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/3)
  is ready for exact final-head evidence and closure.
- Repository visibility is resolved: public. Readers may view/fork the history
  under GitHub's platform terms, but they cannot modify the canonical repository
  without write permission; `LICENSE.md` grants no broader reuse rights.

## Evidence / artifacts

- Current implementation plan:
  `docs/superpowers/plans/2026-08-14-universal-dev-architecture-compliance.md`
- Audit implementation and regressions: `scripts/audit_codex_github.py` and
  `tests/test_audit_codex_github.py`
- Repository profile: `.github/codex-repository.json`
- Operating policy: `patterns/codex-github-operating-system.md`
- Compliance architecture: `templates/COMPLIANCE-WORKER-METADATA.json` and
  `audits/2026-08-14-compliance-worker-architecture.md`
- Project lesson promotions:
  `audits/2026-08-14-askrigor-transferable-controls.md`,
  `audits/2026-08-14-askrigor-lessons-transferable-design.md`, and
  `audits/2026-08-14-inner-signal-compliance-lessons.md`
- Current patterns: `patterns/paid-workflow-safety.md`,
  `patterns/editorial-authority-and-lossless-editing.md`, and the next-step
  continuation rule recorded in
  `audits/2026-08-15-universal-next-step-continuation-rule.md`
- Final report: `audits/2026-08-14-universal-compliance-report.md`
- Hosted evidence: `.github/codex-repository.json`, issue #3, and PR CI.

## Next safe action

Finish the two downstream compliance PRs, reconcile their actual merge commits
into the fleet ledger, run/publish the final universal evidence head, and merge
PR #4 only after its required check succeeds.

## Recovery rule

After interruption, inspect the Git/merge state, this checkpoint,
`LESSON-INDEX.md`, the operating-system pattern, PR #4/checks, issue #3, and
newer owner instructions. Treat PR #11/#12 as complete, preserve every recovery
ref and unrelated branch, and never infer hosted enforcement from files.
