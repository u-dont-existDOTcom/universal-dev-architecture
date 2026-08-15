# Universal Repository Compliance Report

Date: 2026-08-14
Repository: `u-dont-existDOTcom/universal-dev-architecture`
Branch: `codex/github-compliance-2026-08-14`
Recovered base: `d1948c504687503f771c02dc4140f99bc66d2e0d`
Compliance line before main integration: `e37f34b2abced55ba1af7138bd44a2a1795d3a92`
Integrated main boundary: `9e4f0d8d42bd4f2d227175edab7a8e6e4a1595be`

The exact published PR-head SHA and its workflow run are recorded in the pull request and final worker report. A document inside a Git commit cannot truthfully contain the SHA of the commit that contains it, so this file records the exact final implementation boundary and does not invent self-referential publication evidence.

## Repository classification and authority

- Kind: active, long-running `policy` repository.
- Visibility: public (owner-authorized 2026-08-15; hosted transition must be
  verified separately).
- Risk: high because its operating standard, audit, and reusable mandates affect every downstream repository.
- Canonical universal entry point: `LESSON-INDEX.md`.
- Canonical current standard: `patterns/codex-github-operating-system.md`.
- Canonical recovery checkpoint: `state/CURRENT-STATE.md`.
- The older `patterns/codex-github-operating-standard.md`, root `CURRENT-STATE.md`, and superseded execution plan remain as explicit provenance/pointers rather than competing authorities.

## Changed files and purpose

- `AGENTS.md`, `README.md`, `LESSON-INDEX.md`, `docs/INDEX.md`, `CURRENT-STATE.md`, `state/CURRENT-STATE.md` — route workers to one current policy and one recovery checkpoint.
- `patterns/codex-github-operating-system.md`, `patterns/codex-github-operating-standard.md` — reconcile current primary sources, risk-adjusted repository kinds, hosted/file proof separation, and supersession.
- `.github/codex-repository.json`, `SECURITY.md`, `LICENSE.md`,
  `CONTRIBUTING.md`, and `.github/pull_request_template.md` — record truthful
  classification/commands/hosted evidence, private security reporting, an
  explicit no-public-reuse posture, contribution boundaries, and exact PR
  evidence requirements.
- `.codex/repository-policy.json` — removed as a contradictory obsolete profile; provenance remains in Git history and the state/ledger.
- `scripts/audit_codex_github.py`, `tests/test_audit_codex_github.py` — restore Python 3.12 execution and enforce profile, instruction, workflow, secret, filename, risk, and hosted-claim invariants with regression tests.
- `.github/workflows/universal-architecture-tests.yml`, `.github/workflows/weekly-codex-github-audit.yml`, `.github/dependabot.yml` — provide one stable deterministic check, least-privilege/idempotent scheduled drift reporting, and bounded grouped pinned-Action updates.
- `.github/workflows/repo-policy.yml` — removed because it enforced the deleted `.codex` profile and duplicated the canonical audit.
- `templates/REPOSITORY-COMPLIANCE-WORKER.md`, `templates/FINAL-FLEET-AUDITOR.md`, `templates/REPOSITORY-COMPLIANCE-MANDATE-GUIDE.md`, `templates/COMPLIANCE-WORKER-METADATA.json`, `templates/README.md` — preserve the versioned worker architecture without stale repository facts.
- `audits/2026-08-14-compliance-worker-architecture.md`, `audits/2026-08-14-implementation-status.md`, `audits/2026-08-14-universal-compliance-report.md` — preserve semantic lesson closeout, evidence-separated fleet status, and this final repository report.
- `audits/2026-08-14-askrigor-transferable-controls.md` — promotes tested
  AskRigor lessons with exact source hashes, scope, limits, anti-patterns, and
  supersession rules; AskRigor-specific protocol policy remains local.
- `audits/2026-08-14-askrigor-lessons-transferable-design.md` — promotes the
  tested lesson-incubator architecture: non-authoritative ledgers, historical
  byte provenance, explicit freshness ownership, executable dispositions and
  supersession, and bounded sensitive-evidence intake.
- `docs/superpowers/plans/2026-08-14-universal-dev-architecture-compliance.md`, `docs/exec-plans/README.md`, `docs/exec-plans/superseded/2026-08-13-codex-github-operating-baseline.md` — preserve the executed plan and superseded provenance without a contradictory active plan.

## Exact verification evidence

Recovered `main` failed both declared commands before test discovery with Python 3.12 `re.error: global flags not at the start of the expression`. A focused mapping-form `pull_request_target` regression reproduced the failure before the regex repair.

Against the final implementation candidate:

- `python3 -m unittest discover -s tests -v` — PASS, 80 tests after semantic integration with current `main`.
- `python3 scripts/audit_codex_github.py --root . --fail-on error` — PASS, 0 errors; three expected warnings for unverified default-branch rules, secret scanning, and push protection.
- `python3 -m json.tool templates/COMPLIANCE-WORKER-METADATA.json` — PASS.
- `python3 -c 'import yaml, sys; [yaml.safe_load(open(path, encoding="utf-8")) for path in sys.argv[1:]]; print("YAML syntax OK")' .github/workflows/universal-architecture-tests.yml .github/workflows/weekly-codex-github-audit.yml .github/dependabot.yml` — PASS (`YAML syntax OK`).
- `sed -n '/^          set -euo pipefail$/,/^          fi$/p' .github/workflows/weekly-codex-github-audit.yml | sed 's/^          //' | bash -n` — PASS.
- `git diff --check` — PASS.
- Audit tracked-file review — PASS for high-confidence private-key/provider-token content, likely secret filenames, and unsafe cross-platform filenames; matched values are never printed.
- AskRigor portable-audit regression — PASS: a standalone private-key marker in
  a negative archive assertion is not classified as a credential, while a
  complete plausible PEM block remains an error.
- Current-main workflow regressions — PASS: block-scalar scanner text is ignored;
  mapping/list/flow/alias/escaped trigger and action forms fail closed; harmless
  non-action `uses` mappings do not create false findings.
- Final fleet reconciliation — PASS against direct GitHub App evidence for the
  exact open PR heads, workflow runs/jobs, and hardening issues of universal,
  AskRigor, and AskRigor-lessons. The ledger preserves five other repositories
  as `WRITE ISSUED` / `GAP` rather than trusting earlier connector requests.

The canonical commands remain exactly:

- `python3 -m unittest discover -s tests -v`
- `python3 scripts/audit_codex_github.py --root . --fail-on error`

## CI contract and publication evidence

- Workflow: `Universal repository compliance`.
- Stable check: `Deterministic repository audit` (job ID `repository-compliance`).
- The workflow uses `contents: read`, a reviewed full-SHA checkout pin, a ten-minute timeout, and branch/ref-aware cancel-in-progress concurrency.
- Ordinary PR CI makes no hosted writes. `Weekly repository drift` grants `issues: write` only to its separate bounded reconciliation job and closes only an issue carrying its own workflow-management marker.
- Exact final-head run ID/link/conclusion must be taken from the published PR, not inferred from local execution.
- The independently verified integrated PR head
  `1d1e6d03a92bbcec65bdc02ea6490af6e640eda8` passed run `31848203559`, job
  `Deterministic repository audit` (`94918801742`). The final fleet-ledger
  commit needs its own replacement exact-head run after publication; the PR is
  the durable record.

## Hosted GitHub controls

The following is the last pre-transition hosted observation, refreshed through
the connected GitHub App/REST API on 2026-08-14:

- `HOSTED_VERIFIED`: private repository, default branch `main`, one collaborator (`u-dont-existDOTcom`) with admin, zero environments, auto-merge disabled.
- `PLAN_LIMITED`: rulesets returned HTTP 403 with GitHub's instruction to upgrade to GitHub Pro or make the repository public.
- `UNVERIFIED` (HTTP 403 integration-scope denial): classic branch protection, Actions policy/default token permission, secret scanning, push protection, vulnerability alerts, Dependabot security updates, and webhooks.
- `DISABLED`: code-scanning endpoint explicitly states code scanning is not enabled.
- `UNVERIFIED` (HTTP 404): private vulnerability reporting.

Repository files do not prove these hosted controls. The exact remaining actions are durable in [hardening issue #3](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/3).

## Residual risk and owner boundary

The owner selected public visibility on 2026-08-15 after a reachable-history
sensitive-content audit. This permits public-plan governance without granting
write access; `LICENSE.md` grants no broader reuse rights. Main-branch PR
enforcement, required-check enforcement, force-push/deletion prevention,
hosted scanning, private reporting, and Actions defaults still require direct
post-transition configuration and verification.

No fake independent approval rule is proposed for the sole maintainer. The stable deterministic check must succeed on the final PR head before it can be made required.

## Lesson closeout and merge boundary

- Disposition: `promoted` for the reusable repository-worker/final-auditor architecture, with provenance, limits, anti-patterns, tests, and supersession in `audits/2026-08-14-compliance-worker-architecture.md`.
- The policy/audit findings are incorporated into the canonical standard and tested locally.
- AskRigor's transferable protocol-byte, partial-access,
  bounded-live-validation, public-MCP, and scanner-precision lessons are
  promoted in `audits/2026-08-14-askrigor-transferable-controls.md` with explicit
  limits. AskRigor-specific health/research policy remains project-local.
- AskRigor-lessons' transferable non-authoritative ledger, immutable
  provenance, freshness-ownership, supersession, and sensitive-intake design is
  promoted in `audits/2026-08-14-askrigor-lessons-transferable-design.md` from
  exact source commit/path/hash and green CI evidence. Its community-comparator
  content remains project-local, provisional, and unverified.
- The fleet ledger is reconciled from exact repository/CI/issue evidence for
  universal PR #4 at pre-final-ledger head `1d1e6d03...`, AskRigor PR #7 at
  `1fbfb9c7...`, and AskRigor-lessons PR #3 at `469aa629...`. All remain
  `BLOCKED`; five other repositories remain `WRITE ISSUED` / `GAP`.
- Merge is not authorized until the published final-head check is green; even then, hosted main governance remains the issue #3 blocker.

`BLOCKED`
