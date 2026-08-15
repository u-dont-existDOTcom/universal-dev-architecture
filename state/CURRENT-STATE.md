# Current State

Updated: 2026-08-15

## Goal

Maintain and apply a source-grounded, risk-adjusted Codex + GitHub operating system across repositories, with executable audits, durable recovery, and exact lesson provenance.

## Authority / baseline

- Canonical repository: `u-dont-existDOTcom/universal-dev-architecture`
- Canonical branch: `main`
- Active compliance branch: `codex/github-compliance-2026-08-14`
- Recovery branch before the current integration: `recovery/universal-compliance-pre-main-e37f34b`
- Recovery branch before final fleet reconciliation: `recovery/universal-pre-final-fleet-1d1e6d0`
- Main integrated into the current candidate: `9e4f0d8d42bd4f2d227175edab7a8e6e4a1595be`
- Universal entry point: `LESSON-INDEX.md`
- Current Codex/GitHub policy: `patterns/codex-github-operating-system.md`
- Repository profile and exact commands: `.github/codex-repository.json`
- Current owner/project requirements outrank universal defaults on genuine conflict.

## Completed

- Repository-first learning, context-compaction resilience, GitHub bootstrap, the Codex/GitHub operating pattern, templates, executable audit, least-privilege CI, drift reporting, and durable worker/fleet-auditor templates exist.
- Compliance commits `c83b99e` through `e37f34b` repair Python 3.12 compatibility; add exact-command, profile, current-state, instruction-budget, workflow, unsafe-filename, secret-content, risk-posture, and hosted-claim checks; reconcile the policy authority chain; preserve worker architecture; consolidate CI; and promote the tested AskRigor and AskRigor-lessons lessons with exact provenance and limits.
- Main commits through `9e4f0d8` add the structure-aware workflow parser and causal regressions, Inner Signal transfer lessons, paid-workflow safety, editorial authority/lossless editing, and the owner-approved universal coordination rule.
- The current candidate semantically integrates both lines of work. The robust structure-aware workflow parser remains authoritative while the compliance branch's timeout, concurrency, scoped-write, secret-content, unsafe-filename, profile, and instruction-budget checks are retained.
- Root compatibility state points only to this canonical checkpoint. The superseded operating-standard file remains provenance, not a competing current entry point.
- AskRigor PR #8 was merged as `f8e7ca1e10c096e050207828eeb9eb7957d7ef6f` after exact-head checks and bounded live Action acceptance; the synthetic lesson issue was safely closed. The separate AskRigor compliance PR and AskRigor-lessons compliance PR remain subject to their own current reconciliation and hosted-control evidence.
- AskRigor compliance PR #7 is reconciled at `1fbfb9c7b67afc5866e55f56de57fdf58508f599`; deterministic run `31849152200` / job `94921467390` and workflow-policy run `31849152180` / job `94921467289` succeeded. Its approved live smoke passed two public-provider tests with three credential-gated skips.
- AskRigor-lessons PR #3 is reconciled at `469aa62938a638145b1b848b9199710767e868aa`; run `31849634303` / job `Lesson integrity` (`94922840626`) succeeded. Its sole lesson remains provisional/unverified because originating incident/test provenance is absent.
- Official OpenAI and GitHub registry links were reviewed on 2026-08-14. Repository files do not assert hosted settings without API evidence.
- The owner authorized public visibility on 2026-08-15 after a remote-history
  path/content audit found no sensitive filenames, private-key material, or
  provider-token material across the repository's reachable remote refs.
  `LICENSE.md` deliberately grants no public reuse rights, and public visibility
  does not grant GitHub write access.

## Current checkpoint

- Pull request: #4, `codex/github-compliance-2026-08-14` into `main`.
- The semantic merge of `origin/main` at `9e4f0d8` is resolved against recovery branch `recovery/universal-compliance-pre-main-e37f34b`.
- Documentation resolves to one authority chain; audit/test integration retains both non-overlapping control sets and the newer structure-aware parser.
- Final local evidence on the resolved tree: 80/80 unit tests pass; self-audit passes with 0 errors and 3 truthful hosted-control warnings; JSON, YAML, scheduled-shell syntax, and diff checks pass.
- Integrated candidate `1d1e6d03a92bbcec65bdc02ea6490af6e640eda8` passed exact-head run `31848203559`, job `Deterministic repository audit` (`94918801742`).
- Only the final fleet-ledger evidence refresh and its replacement exact-head CI remain before repository-visible closeout.
- The owner-approved public transition removes the private-plan ruleset limit
  once GitHub visibility changes. Terminal status remains `BLOCKED` until that
  hosted mutation and the resulting governance controls are directly verified.

## Remaining

- Run the full unit suite and self-audit plus syntax/metadata/diff checks on the final fleet-ledger tree, review the final diff, and commit from recovery ref `recovery/universal-pre-final-fleet-1d1e6d0`.
- Push the exact verified candidate to PR #4, capture its replacement check/run ID, and update the PR and issue with final evidence.
- Change hosted visibility to public, then configure and verify the applicable
  ruleset, Actions defaults, security controls, and exact required check.
- Keep PR #4 unmerged until the exact final-head check and hosted controls are
  verified.

## Blockers / unresolved

- `UNVERIFIED`: branch protection, Actions defaults, secret scanning, push protection, vulnerability alerts, and private vulnerability reporting. Prior REST inspection returned integration-scope `403` or `404`; committed files cannot resolve this.
- `HISTORICAL / RESOLVING`: private-repository rulesets returned `403`; the
  owner has selected GitHub's public-visibility path, but the hosted transition
  is not yet verified.
- `DISABLED`: the code-scanning endpoint explicitly reported that code scanning is not enabled; private enablement may require an unavailable plan/security entitlement.
- The available local `gh` credential did not provide the missing administrative scope. SSH Git transport cannot inspect hosted settings.
- Hardening issue [#3](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/3) records the precise remaining hosted actions and must remain open.
- Repository visibility is resolved: public. Readers may view/fork the public
  history under GitHub's platform terms, but they cannot modify the canonical
  repository without write permission; `LICENSE.md` grants no broader reuse
  rights.

## Evidence / artifacts

- Current implementation plan: `docs/superpowers/plans/2026-08-14-universal-dev-architecture-compliance.md`
- Audit implementation: `scripts/audit_codex_github.py`
- Audit regressions: `tests/test_audit_codex_github.py`
- Repository profile: `.github/codex-repository.json`
- Operating policy: `patterns/codex-github-operating-system.md`
- Compliance architecture: `templates/COMPLIANCE-WORKER-METADATA.json` and `audits/2026-08-14-compliance-worker-architecture.md`
- Project lesson promotions: `audits/2026-08-14-askrigor-transferable-controls.md`, `audits/2026-08-14-askrigor-lessons-transferable-design.md`, and `audits/2026-08-14-inner-signal-compliance-lessons.md`
- Additional current patterns: `patterns/paid-workflow-safety.md` and `patterns/editorial-authority-and-lossless-editing.md`
- Final repository report: `audits/2026-08-14-universal-compliance-report.md`
- Hosted-control evidence: `.github/codex-repository.json`, hardening issue #3, and pull-request CI evidence.

## Next safe action

Publish the public-posture candidate to PR #4, complete the authorized hosted
visibility/governance transition, record exact-head CI and settings evidence,
and merge only if the final completion gate permits it.

## Recovery rule

After interruption, inspect Git/merge state, this checkpoint, `LESSON-INDEX.md`, the operating-system pattern, open pull requests/checks, hardening issue #3, and newer owner instructions. Preserve both the recovery branch and unrelated work; never infer hosted enforcement from repository files.
