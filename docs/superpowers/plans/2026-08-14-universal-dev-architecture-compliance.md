# Universal Development Architecture Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `u-dont-existDOTcom/universal-dev-architecture` to the strongest executable Codex + GitHub baseline its private-repository plan and available integration permissions support, without weakening the cross-project standard or overstating hosted controls.

**Architecture:** Keep `patterns/codex-github-operating-system.md` as the sole current standard, make every other entry point route to it, and keep `state/CURRENT-STATE.md` as the sole canonical recovery checkpoint. Strengthen the standard-library audit through behavior-first regression tests, consolidate ordinary CI around the declared deterministic gates, and make scheduled drift detection maintain one idempotent GitHub issue. Hosted settings remain an independently evidenced layer and never become inferred from repository files.

**Tech Stack:** Python 3.12 standard library, `unittest`, GitHub Actions YAML, Markdown, JSON, Git, GitHub REST/connector APIs.

## Global Constraints

- Repository kind is `policy`; it is active, long-running, private, and high risk.
- Work only on `codex/github-compliance-2026-08-14` in the isolated sibling worktree.
- Preserve all owner work and Git provenance; mark superseded entry points explicitly rather than silently rewriting history.
- Keep hosted-control checks separate from repository-visible checks.
- Record only commands that exist and pass on the final commit.
- Apply TDD to every audit behavior change: failing regression, observed expected failure, minimal implementation, focused pass, then full suite.
- Never print, commit, or package secrets or private user material.
- Do not require an impossible independent approval for the solo owner.

---

### Task 1: Repair the broken baseline import

**Files:**
- Modify: `tests/test_audit_codex_github.py`
- Modify: `scripts/audit_codex_github.py`

**Interfaces:**
- Consumes: `audit_repository(root, profile_relative)` from `scripts.audit_codex_github`.
- Produces: an importable module on Python 3.12 and a `pull_request_target` detector compiled with `re.MULTILINE` at the call level.

- [x] **Step 1: Preserve the observed baseline failure**

Record in `state/CURRENT-STATE.md` that both declared gates failed at commit `d1948c504687503f771c02dc4140f99bc66d2e0d` with `re.error: global flags not at the start` before any tests ran.

- [x] **Step 2: Add an import/behavior regression**

Add a focused test that writes a workflow using mapping-form `pull_request_target`, a full-SHA checkout, and asserts that `audit_repository` returns `actions.pull-request-target.checkout`. This test protects both module import and the unsafe-event behavior that the regex exists to detect.

- [x] **Step 3: Verify the red state**

Run: `python3 -m unittest tests.test_audit_codex_github.RepositoryAuditTests.test_pull_request_target_mapping_with_checkout_is_an_error -v`

Expected: import-time `re.error` before the test body runs.

- [x] **Step 4: Make the minimal regex repair**

Compile the complete alternation with `re.MULTILINE` passed to `re.compile(...)`; do not place a second inline mode flag after `|`.

- [x] **Step 5: Verify green and checkpoint**

Run the focused test, then `python3 -m unittest discover -s tests -v`. Commit the repair and its regression as one coherent baseline-fix commit.

---

### Task 2: Enforce the missing repository-visible audit behaviors

**Files:**
- Modify: `tests/test_audit_codex_github.py`
- Modify: `scripts/audit_codex_github.py`

**Interfaces:**
- Consumes: tracked/present repository paths, `.github/codex-repository.json`, and workflow text.
- Produces: deterministic findings with stable codes and severities; no hosted API calls.

- [x] **Step 1: Add profile validation regressions**

Add table-driven tests proving that empty/non-string command values are errors, active software requires nonempty `bootstrap` and `test`, active policy repositories require nonempty `test` and `audit`, and verified/enabled hosted-control claims without dated method/result evidence produce `github-control.evidence.missing`.

- [x] **Step 2: Run profile tests red**

Run only the new profile tests and confirm each fails because its finding code is absent.

- [x] **Step 3: Implement exact profile/evidence validation**

Validate every command value as a nonempty string. Add kind-specific command requirements. Accept existing string control states for backward compatibility, and require a sibling `github_control_evidence` record containing `checked_at`, `method`, and `result` only when a state claims `verified` or `enabled`.

- [x] **Step 4: Add instruction-budget regressions**

Add tests proving an unreadable/non-UTF-8 instruction file is an error, a root instruction above 24 KiB warns, and any discovered root-to-nested instruction chain above the documented 32 KiB default produces `codex.agents.chain-oversized` as an error.

- [x] **Step 5: Run instruction tests red, implement, and rerun green**

Audit `AGENTS.md` and tracked nested `AGENTS.md`/`AGENTS.override.md` paths without loading unrelated directories. Compute each applicable root-to-directory chain and report the offending path without exposing file contents.

- [x] **Step 6: Add workflow-security regressions**

Add tests proving the audit catches top-level write permissions, every job missing `timeout-minutes`, unpinned reusable workflows as well as Actions, privileged `pull_request_target` checkout, and missing concurrency on workflows that contain job-level write permissions or deployment/release/publish mutation signals.

- [x] **Step 7: Run workflow tests red**

Run only the new workflow tests and confirm the stable finding codes are absent before implementation.

- [x] **Step 8: Implement conservative line-oriented workflow checks**

Keep the audit dependency-free. Parse top-level and job blocks by indentation, flag top-level write scopes as broad, require a timeout in every job, and require workflow concurrency only for write-capable or state-changing workflows. Do not infer hosted Actions defaults.

- [x] **Step 9: Add unsafe-filename and risk-posture regressions**

Add literal fixtures for leading-dash, control-character, backslash, and trailing-space/dot paths; assert `repo.filename.unsafe`. Preserve `.env.example` as allowed. Add tests that high/critical-risk repositories require `SECURITY.md` and CODEOWNERS, public repositories require a license and contributing guidance, and private normal content repositories do not inherit public-software ceremony.

- [x] **Step 10: Implement filename/risk checks and run the full suite**

Inspect names only, never suspected file contents. Run `python3 -m unittest discover -s tests -v` and commit the complete audit expansion only after all regression cases pass.

---

### Task 3: Reconcile the canonical policy, indexes, state, templates, and provenance

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `LESSON-INDEX.md`
- Modify: `docs/INDEX.md`
- Modify: `CURRENT-STATE.md`
- Modify: `state/CURRENT-STATE.md`
- Modify: `patterns/codex-github-operating-system.md`
- Modify: `patterns/codex-github-operating-standard.md`
- Modify: `templates/README.md`
- Modify: `.github/codex-repository.json`
- Create: `SECURITY.md`
- Delete as superseded: `.codex/repository-policy.json`
- Modify: `docs/exec-plans/active/2026-08-13-codex-github-operating-baseline.md`
- Modify: `audits/2026-08-14-implementation-status.md`

**Interfaces:**
- Consumes: the final audit behavior, current official OpenAI/GitHub documentation, and observed hosted API results.
- Produces: one authority route, one canonical state checkpoint, truthful profile evidence, and preserved supersession/provenance notes.

- [x] **Step 1: Make the canonical route unambiguous**

Point `AGENTS.md`, `README.md`, `LESSON-INDEX.md`, and `docs/INDEX.md` to `patterns/codex-github-operating-system.md` and `state/CURRENT-STATE.md`. Convert root `CURRENT-STATE.md` into an explicit non-canonical pointer rather than a second checkpoint.

- [x] **Step 2: Preserve the older standard as provenance**

Add a dated supersession banner to `patterns/codex-github-operating-standard.md` that routes all current decisions to the operating-system pattern. Remove the obsolete `.codex/repository-policy.json` only after the supersession is recorded in current state and Git history remains intact.

- [x] **Step 3: Reconcile risk-adjusted classifications**

In the canonical pattern, retain distinct requirements for software, research, content, policy, active artifact, inactive artifact, and archive repositories. State which commands and security controls are conditional by activity, visibility, dependencies, and risk.

- [x] **Step 4: Refresh the official source registry**

Replace stale/redirect-only links with the current OpenAI Learn and GitHub Docs targets verified on 2026-08-14. Record that OpenAI documents a 32 KiB default combined instruction chain and GitHub warns required check job names must be unique. Do not introduce interpretation beyond the cited primary sources.

- [x] **Step 5: Record exact hosted-control evidence**

Keep unavailable controls `unverified` or `disabled` as observed. Record the ruleset plan `403`, integration-scope `403` responses, code-scanning-not-enabled response, sole admin collaborator, zero environments, and the absence of CI status evidence without embedding tokens or raw sensitive responses.

- [x] **Step 6: Add the private high-risk security posture**

Add `SECURITY.md` with the supported private-policy scope, a non-public reporting route appropriate to the sole collaborator, response expectations, and an explicit prohibition on placing secrets in reports. Do not claim GitHub private vulnerability reporting is enabled.

- [x] **Step 7: Reconcile active plans and ledgers**

Mark the 2026-08-13 baseline plan as superseded/completed where Git evidence supports it, list the present compliance branch and baseline defect, and keep other repositories unverified until their own commit/CI/hosted evidence is inspected.

- [x] **Step 8: Run policy tests**

Run the unit suite and repository audit. Review all warnings and ensure none is converted into a verified hosted claim.

---

### Task 4: Preserve the compliance-worker architecture durably

**Files:**
- Create: `templates/REPOSITORY-COMPLIANCE-WORKER.md`
- Create: `templates/FINAL-FLEET-AUDITOR.md`
- Create: `templates/REPOSITORY-COMPLIANCE-MANDATE-GUIDE.md`
- Create: `templates/COMPLIANCE-WORKER-METADATA.json`
- Create: `audits/2026-08-14-compliance-worker-architecture.md`
- Modify: `templates/README.md`
- Modify: `LESSON-INDEX.md`

**Interfaces:**
- Consumes: the canonical operating-system pattern and this task mandate’s reusable architecture.
- Produces: generic worker/final-auditor contracts plus version/review metadata without repository-specific facts.

- [x] **Step 1: Add the generic repository worker template**

Encode recovery-before-editing, risk classification, durable branches, TDD, hosted/file proof separation, PR discipline, semantic lesson closeout, required final evidence, and the four terminal labels. Keep repository identity, exact commands, and domain invariants as mandate-generation inputs rather than stale template facts.

- [x] **Step 2: Add the final fleet auditor template**

Require verification from repository commits, diffs, command results, CI runs, hosted API evidence, open audit issues, and merge state. Explicitly forbid accepting a worker prose report as proof.

- [x] **Step 3: Add mandate-generation guidance and metadata**

Define how to classify kind/activity/visibility/risk, extract exact commands and authority paths, add repository-specific review rules, set owner-decision boundaries, and version/review the templates in machine-readable JSON.

- [x] **Step 4: Complete semantic lesson closeout**

Document provenance from the 2026-08-14 compliance mandate, limits, anti-patterns, required regression/audit tests, and supersession rules. Index the architecture as a promoted universal lesson.

- [x] **Step 5: Validate JSON and run all deterministic gates**

Run `python3 -m json.tool templates/COMPLIANCE-WORKER-METADATA.json`, the unit suite, and the repository audit before committing.

---

### Task 5: Consolidate CI and make scheduled drift actionable without spam

**Files:**
- Modify: `.github/workflows/universal-architecture-tests.yml`
- Modify: `.github/workflows/weekly-codex-github-audit.yml`
- Delete as superseded: `.github/workflows/repo-policy.yml`
- Modify: `.github/dependabot.yml`
- Modify: `.github/pull_request_template.md`

**Interfaces:**
- Consumes: the two declared deterministic commands and stable audit finding output.
- Produces: unique check names, least-privilege jobs, bounded execution, and one idempotent drift issue titled `Codex + GitHub hardening audit`.

- [x] **Step 1: Consolidate ordinary CI**

Use one workflow named `Universal repository compliance` with job ID `repository-compliance`. Keep `contents: read`, full-SHA Action pins, a ten-minute timeout, and branch/ref-aware cancel-in-progress concurrency. Run the unit suite and repository audit exactly as declared in the profile.

- [x] **Step 2: Remove the obsolete duplicate workflow**

Delete `repo-policy.yml` after its historical checks are covered by the canonical audit and record the supersession in the implementation ledger. This prevents contradictory standard/profile checks and duplicate governance entry points.

- [x] **Step 3: Make weekly drift reporting idempotent**

Keep a read-only `drift-audit` job that runs the exact gates. Add a separate `drift-issue` job with only `issues: write`, no checkout, `if: always()`, and a timeout. On failure, create the exact audit issue only if it is not already open; on success, close an existing audit issue once. Never paste raw logs or secrets into the issue.

- [x] **Step 4: Validate workflow policy behavior**

Run the audit against fixture workflows and the repository itself. Confirm every job has a timeout, all remote actions are full-SHA pinned, write permission exists only on the issue-reporting job, and both workflows use concurrency where applicable.

- [x] **Step 5: Update PR evidence requirements**

Require branch/SHA, changed-file purpose, exact commands/results, final CI links/IDs, hosted-control evidence/UNVERIFIED results, current-state path, lesson disposition, residual risk, and merge/blocker status.

---

### Task 6: Verify, publish, inspect CI, and close the universal phase

**Files:**
- Modify: `state/CURRENT-STATE.md`
- Modify: `audits/2026-08-14-implementation-status.md`
- Create: `audits/2026-08-14-universal-compliance-report.md`

**Interfaces:**
- Consumes: final branch diff, deterministic gates, GitHub API evidence, and CI runs on the final PR head.
- Produces: one focused PR, one durable hosted-control issue if needed, and a truthful terminal status.

- [x] **Step 1: Run fresh final verification**

Run `python3 -m unittest discover -s tests -v`, `python3 scripts/audit_codex_github.py --root . --fail-on error`, JSON validation, workflow static audit, `git diff --check`, and a tracked-file secret/unsafe-name review against the final candidate.

- [x] **Step 2: Review the final diff**

Inspect `git status`, `git diff --stat`, and the complete diff for accidental churn, debug files, generated output, secret values, semantic weakening, and stale claims.

- [ ] **Step 3: Commit and push the durable branch**

Use coherent commits, push `codex/github-compliance-2026-08-14`, and open one focused PR against `main` containing exact evidence and residual hosted-control limitations.

- [ ] **Step 4: Inspect final-head CI**

Use GitHub workflow/check APIs to capture workflow names, run IDs/links, conclusions, and final head SHA. Repair failures on the same branch and rerun all local gates before updating the PR.

- [x] **Step 5: Apply/verify safe governance or create one blocker issue**

Attempt only additive, non-weakening controls supported by the plan and current API scope. If rules/protection/scanning/Actions defaults remain plan- or permission-blocked, create or update one `Codex + GitHub hardening audit` issue with the exact remaining action and impact.

- [ ] **Step 6: Merge only if policy permits**

If required checks are green and no applicable executable requirement remains, squash-merge through GitHub and verify `main` contains the result. Otherwise leave the single PR ready to merge and record the exact blocker.

- [ ] **Step 7: Record terminal evidence**

Write branch/final SHA, changed files and purposes, exact commands/results, CI IDs/links, hosted-control states, residual risk, canonical current-state path, lesson disposition, and merge result using exactly one of `COMPLIANT`, `COMPLIANT_WITH_DECLARED_EXCEPTIONS`, `BLOCKED`, or `NOT_COMPLIANT`.

---

### Task 7: Reconcile the fleet ledger after AskRigor completes

**Files:**
- Modify later in a non-overlapping follow-up branch: `audits/2026-08-14-implementation-status.md`
- Modify later if a transferable finding exists: `LESSON-INDEX.md`
- Modify later if a transferable finding exists: `audits/2026-08-14-codex-github-lesson-closeout.md`

**Interfaces:**
- Consumes: merged AskRigor commit/PR, final-head command and CI evidence, hosted-setting API results, and its project-local lesson dispositions.
- Produces: evidence-based fleet status; never copies worker prose as proof.

- [ ] **Step 1: Re-fetch AskRigor evidence after its own compliance PR**

Verify the merge commit, changed files, exact final commands, workflow runs/checks, hosted-control responses, open audit issue, and terminal status directly from GitHub and the repository.

- [ ] **Step 2: Update only proven fleet claims**

Mark each AskRigor control with repository-visible, CI-verified, hosted-verified, unverified, disabled, not-applicable, or blocked evidence. Preserve all other repositories’ existing uncertainty unless independently rechecked.

- [ ] **Step 3: Promote only transferable lessons**

Record source repository, commit/path/hash, rationale, tests, scope limits, and supersession data for any promoted AskRigor lesson; otherwise record `project-specific` or `no-new-lesson`.

- [ ] **Step 4: Use a separate focused PR**

Open this follow-up only after the initial universal PR is merged, so there is no overlapping PR chain.
