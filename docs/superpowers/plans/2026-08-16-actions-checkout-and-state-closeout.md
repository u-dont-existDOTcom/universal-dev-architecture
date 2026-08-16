# Actions Checkout and State Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely advance the universal repository from `actions/checkout`
v4.2.2 to the reviewed immutable v7.0.1 commit, then make the canonical
recovery checkpoint and hosted-control receipt match current GitHub state.

**Architecture:** Treat the selected-Action allowlist and workflow pin as one
transaction. Temporarily allow only the old and new reviewed SHAs, update and
verify the existing Dependabot PR, merge it through the protected branch, then
restrict the allowlist to the new SHA and publish the repository-visible
template/profile/state closeout through one focused follow-up PR.

**Tech Stack:** Git, GitHub CLI/REST API, GitHub Actions YAML, Python 3 unittest

## Global Constraints

- Preserve all owner work and existing recovery refs.
- Keep remote Actions pinned to full 40-character commit SHAs.
- Never enable broad GitHub-owned or verified-creator Action access.
- Keep workflow permissions read-only and checkout credential persistence
  disabled.
- Use the existing stable required check `Deterministic repository audit`.
- Verify hosted settings through GitHub API; committed files are not proof.
- Do not merge until the exact PR head passes all required checks.

---

### Task 1: Verify the immutable dependency candidate and current hosted boundary

**Files:**
- Inspect: `.github/workflows/universal-architecture-tests.yml`
- Inspect: `.github/workflows/weekly-codex-github-audit.yml`

**Interfaces:**
- Consumes: Dependabot PR #2 head
  `3506d6db4e1a64036015f73fc9080e22d8e14e56`.
- Produces: a verified candidate pin and an exact pre-change Action allowlist
  receipt.

- [x] **Step 1: Verify the release tag and commit through the official
  `actions/checkout` repository**

  Run GitHub REST reads for tag `v7.0.1`, commit
  `3d3c42e5aac5ba805825da76410c181273ba90b1`, and the release action metadata.
  Confirm the tag resolves to that exact commit, GitHub reports a verified
  commit signature, and `action.yml` declares the expected Node action runtime.

- [x] **Step 2: Verify the repository uses compatible hosted runners and safe
  events**

  Inspect both workflow files on current `main`. Confirm `ubuntu-latest`,
  explicit `contents: read`, bounded timeouts, and no privileged untrusted
  checkout. Record the observed missing `persist-credentials: false` as a
  follow-up hardening finding rather than silently treating the default as
  compliant.

- [x] **Step 3: Read the current selected-Action policy**

  Run:

  ```bash
  gh api repos/u-dont-existDOTcom/universal-dev-architecture/actions/permissions/selected-actions
  ```

  Expected: broad GitHub-owned and verified-creator access are false, with only
  `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` allowed.

### Task 2: Transactionally validate and merge Dependabot PR #2

**Files:**
- Modify through existing PR: `.github/workflows/universal-architecture-tests.yml`
- Modify through existing PR: `.github/workflows/weekly-codex-github-audit.yml`

**Interfaces:**
- Consumes: verified old/new Action SHAs and current selected-Action policy.
- Produces: a protected `main` commit using only checkout v7.0.1.

- [x] **Step 1: Temporarily allow exactly both reviewed SHAs**

  Set `github_owned_allowed=false`, `verified_allowed=false`, and
  `patterns_allowed` to exactly the old v4.2.2 SHA plus the new v7.0.1 SHA.
  Read the setting back and stop if the returned policy differs.

- [x] **Step 2: Update the existing Dependabot branch onto current `main`**

  The installed GitHub CLI did not provide `gh pr update-branch`; use GitHub's
  official guarded REST endpoint instead:

  ```bash
  gh api --method PUT \
    repos/u-dont-existDOTcom/universal-dev-architecture/pulls/2/update-branch \
    -f expected_head_sha=3506d6db4e1a64036015f73fc9080e22d8e14e56
  ```

  Re-read the PR head and exact two-file patch. Do not add unrelated files to
  the dependency PR.

- [x] **Step 3: Require exact-head protected checks**

  Wait for `Deterministic repository audit` and CodeQL to complete successfully.
  Verify no unresolved review comments and require a clean merge state.

- [x] **Step 4: Merge with a head-SHA guard**

  Merge PR #2 using the repository merge strategy and `--match-head-commit`.
  Fetch `origin/main`, record the merge commit, and confirm the PR head is its
  ancestor.

- [x] **Step 5: Remove the old SHA immediately**

  Set the selected-Action allowlist to exactly
  `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, keep both broad
  allowances false, and read the policy back. Verify post-merge deterministic
  and CodeQL runs on the exact merge commit.

### Task 3: Publish the repository-visible maintenance closeout

**Files:**
- Modify: `.github/workflows/universal-architecture-tests.yml`
- Modify: `.github/workflows/weekly-codex-github-audit.yml`
- Modify: `templates/WORKFLOW-POLICY.yml`
- Modify: `.github/codex-repository.json`
- Modify: `state/CURRENT-STATE.md`
- Create: `docs/superpowers/plans/2026-08-16-actions-checkout-and-state-closeout.md`
- Verify: `tests/test_workflow_policy_template.py`
- Verify: `tests/test_audit_codex_github.py`

**Interfaces:**
- Consumes: exact merged PR #2 commit, post-merge run IDs, and final hosted
  selected-Action policy receipt.
- Produces: current reusable template, hosted evidence, and recovery state.

- [x] **Step 1: Update the reusable workflow template**

  Replace the v4.2.2 checkout pin/comment in `templates/WORKFLOW-POLICY.yml`
  with the exact v7.0.1 pin/comment. Add `persist-credentials: false`,
  read-only permissions, timeout, and concurrency behavior.

- [x] **Step 2: Disable unused checkout credential persistence**

  Add `with: persist-credentials: false` to checkout steps in
  `.github/workflows/universal-architecture-tests.yml` and
  `.github/workflows/weekly-codex-github-audit.yml`. Treat this as a bounded
  configuration-only hardening change: the portable audit cannot infer whether
  an arbitrary future workflow intentionally needs Git push credentials, and a
  source-text assertion would be a brittle change detector. Verify the real
  workflows through the protected PR checks without changing job permissions,
  triggers, or commands.

- [x] **Step 3: Update hosted-control evidence**

  In `.github/codex-repository.json`, record the final exact single-SHA
  allowlist, authenticated API method, and 2026-08-16 check date. Do not infer
  any hosted setting from the workflow files.

- [x] **Step 4: Reconcile the canonical checkpoint**

  In `state/CURRENT-STATE.md`, replace the obsolete active public-transition
  branch and pending PR language with the actual merged PR #13 evidence,
  current external-evaluation pattern boundary, merged checkout update, final
  hosted setting, remaining work, and next safe action.

- [x] **Step 5: Run focused and complete gates**

  Run:

  ```bash
  python3 -m unittest tests.test_workflow_policy_template -v
  python3 -m unittest discover -s tests -v
  python3 scripts/audit_codex_github.py --root . --fail-on error
  ```

  Expected: all tests pass, the audit reports no errors, and `git diff --check`
  is clean.

- [x] **Step 6: Commit and publish one focused closeout PR**

  Commit the template/profile/state/plan changes, push
  `codex/maintenance-closeout-2026-08-16`, open one PR with exact verification
  evidence, wait for protected checks, and merge only if the exact head remains
  clean and green.

- [x] **Step 7: Verify final `main` and lesson disposition**

  Confirm post-merge deterministic and CodeQL runs on the exact final commit.
  Record the maintenance finding as `no-new-lesson`: immutable Action
  allowlist transactions and state reconciliation are already required by the
  current universal operating pattern.
