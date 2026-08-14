# Codex + GitHub Operating System

Reviewed against official OpenAI and GitHub guidance: 2026-08-14

## Purpose

Codex is most reliable when the repository, not the conversation, contains the durable operating contract, executable environment, verification gates, and recovery state. GitHub should then enforce the parts that must not depend on an agent remembering them.

This pattern is risk-adjusted. It does **not** require a tiny prose/archive repository to imitate a production software service. Requirements apply according to repository kind, activity, visibility, and risk.

## Authority order

1. Current explicit owner instruction.
2. Current project repository state and project-specific `AGENTS.md` files.
3. Current project evidence, tests, and accepted specifications.
4. Current universal patterns indexed by `LESSON-INDEX.md`.
5. Older summaries, packages, generated bundles, and remembered chat context.

A universal pattern never silently overrides an explicit current project requirement.

## Repository classification

Every repository should declare a small machine-readable profile containing:

- repository kind: `software`, `research`, `content`, `artifact`, `policy`, or `archive`;
- whether the project is active and long-running;
- visibility and risk;
- exact bootstrap/test/lint/typecheck/build/audit commands that really exist;
- the canonical current-state checkpoint, when applicable;
- verified/unverified status of GitHub-hosted controls.

Do not invent commands or mark hosted controls verified merely because they are recommended.

---

## 1. Repository-persistent Codex instructions

### Use `AGENTS.md` as the operational contract

Keep a concise root `AGENTS.md` that a fresh Codex worker can use without the old chat. It should state:

- project purpose and authority entry points;
- what must be read before substantive work;
- repository map or pointers to it;
- exact environment/bootstrap and verification commands;
- project-specific constraints and invariants;
- branch/commit/PR expectations;
- security and secret-handling rules;
- current-state and lesson-closeout requirements;
- what to do when instructions conflict or required evidence is missing.

Use nested `AGENTS.md` files only where a subtree genuinely has different commands, conventions, risk, or ownership. More local instructions should add or override only what differs rather than duplicating the root file.

### Keep instruction files operational and bounded

Do not use `AGENTS.md` as:

- a chat transcript;
- a full architecture encyclopedia;
- a dump of every historical lesson;
- a place for credentials or private data;
- a copied snapshot of universal instructions that will go stale.

The root file should point to canonical indexes and exact commands. Long explanations belong in linked repository documents. Temporary override files should not become an undocumented second source of truth.

### Test instruction discovery

After changing instruction hierarchy, verify from the intended working directory that Codex sees the expected root and local instructions. Do not assume a nested file applies outside its subtree.

---

## 2. Give Codex a task contract, not a vague aspiration

For non-trivial work, the durable task/issue/spec should identify:

- objective and user-visible outcome;
- current baseline and relevant files/commits;
- constraints and invariants;
- explicit non-goals;
- acceptance criteria;
- required tests and validation;
- security/data/migration risks;
- artifacts or evidence expected at completion.

Codex should inspect the repository before editing. For multi-step work it should create or update a plan and current-state checkpoint before implementation, then work in small verified increments.

A good task can be completed and reviewed from repository evidence alone. A bad task depends on undocumented context such as “finish what we discussed yesterday.”

---

## 3. Make the environment reproducible

### One documented bootstrap path

Active software repositories should provide one idempotent bootstrap/install command that:

- pins or declares the required runtime/toolchain;
- installs from committed lock/resolution files;
- creates missing local configuration from redacted examples without overwriting real configuration;
- verifies required tool capabilities;
- is safe to rerun;
- fails with a precise diagnosis and next action.

Do not depend on global packages, an unexplained developer machine state, or manual steps that are absent from the repository.

### Separate configuration from secrets

Commit `.env.example` or an equivalent redacted schema, never real credentials. Keep tokens in Codex/GitHub secret stores or local ignored files. Setup scripts and logs must not print secrets.

Use the smallest network access needed. In Codex cloud environments, install/fetch dependencies during the intended setup phase and restrict later internet access rather than granting unrestricted egress by default.

### Pin what determines behavior

Commit lockfiles and runtime version declarations where the ecosystem supports them. Pin external automation dependencies to immutable versions, and update them through reviewed automation rather than floating references.

---

## 4. Isolate work and protect the baseline

For active code repositories:

- use a task branch or isolated worktree;
- do not make routine feature/fix changes directly on the default branch;
- preserve unrelated owner changes and dirty working-tree state;
- keep commits coherent and reversible;
- avoid combining feature work, mass formatting, dependency upgrades, and unrelated refactors in one change;
- update generated files only through their canonical generator and record the command;
- make migrations backward-compatible or explicitly staged when possible.

Long autonomous work should commit or checkpoint at verified durable boundaries. Commit frequency is for recovery and review, not an excuse to preserve broken intermediate states on the protected default branch.

---

## 5. Verification is part of implementation

Before completion, run the repository-declared applicable gates:

1. focused tests for the changed behavior;
2. full relevant test suite;
3. lint/format checks;
4. type checks;
5. build/package checks;
6. security/dependency checks;
7. live smoke/integration validation when the change depends on real credentials or services;
8. final diff review for accidental churn, generated files, secrets, debug output, and scope creep.

Record exact commands and results in the PR or durable report. Never claim a gate passed from expectation, an earlier run against different code, or a partial output.

When a gate cannot run, state exactly why, what was run instead, and the residual risk. Do not silently downgrade verification.

---

## 6. Pull requests and default-branch governance

### Baseline ruleset for active software

Prefer a GitHub ruleset protecting the default branch. Normally require:

- changes through pull requests;
- required CI status checks;
- review conversations resolved;
- branch up to date or merge queue when concurrency makes this necessary;
- force pushes and branch deletion blocked;
- bypass limited to explicit emergency/maintenance actors.

For a solo repository, requiring an independent approval can make every PR impossible to merge. Keep the PR and status-check requirement, but require approving reviews only when an actual independent reviewer exists or the risk warrants a deliberate second person. Do not pretend self-review is independent review.

### Review routing

Use `CODEOWNERS` for security-sensitive or high-consequence paths such as:

- `.github/` workflows and repository policy;
- authentication, authorization, billing, deployment, or migration code;
- health/research protocols and canonical evidence rules;
- release and package-signing configuration.

CODEOWNERS routes review; it does not itself protect a branch unless rules require code-owner review.

### Merge discipline

Choose and document a merge strategy. Squash merge is a reasonable default for small task branches; rebase may be preferred where individual commits are deliberately curated. Avoid accidental mixed history. Delete merged branches unless they are intentionally long-lived evidence or release branches.

Auto-merge is acceptable only after required checks and required review conditions are enforced.

---

## 7. GitHub Actions hardening

Every workflow should be treated as privileged code.

### Least privilege

- Declare explicit `permissions`, normally beginning with `contents: read`.
- Grant write scopes only to the smallest job that needs them.
- Do not use `write-all`.
- Separate untrusted validation from privileged publishing/deployment.
- Use protected GitHub environments for consequential deployment/release secrets and approvals.

### Immutable automation dependencies

Pin remote actions and reusable workflows to reviewed full commit SHAs. Human-readable release tags may remain in comments. Configure Dependabot to propose updates so immutable pins do not become abandoned.

### Untrusted pull requests

Do not check out or execute untrusted pull-request code in a privileged `pull_request_target` context. Use read-only `pull_request` validation, or a carefully separated privileged workflow that never executes contributor-controlled code.

### Credentials and external clouds

Prefer OpenID Connect and short-lived credentials over stored long-lived cloud keys. Do not persist checkout credentials when a job does not need to push. Never interpolate untrusted input directly into shell commands.

### Operational controls

Use timeouts for jobs that can hang, concurrency controls for deploy/release jobs, deterministic caches, and explicit artifact retention where evidence matters. Logs must remain useful without exposing secrets or sensitive user data.

---

## 8. Supply-chain and repository security

Apply controls according to visibility and risk:

- Dependabot alerts and reviewed version updates for software dependencies and GitHub Actions;
- dependency review on pull requests where available;
- secret scanning and push protection for public/high-risk repositories;
- code scanning/CodeQL for supported public or high-risk software;
- a `SECURITY.md` with a private reporting route for public repositories;
- a declared license for public repositories;
- a contributing guide when outside contributions are possible;
- minimal collaborator and GitHub App permissions;
- periodic review of deploy keys, tokens, webhooks, installed Apps, and Actions permissions.

If a secret is committed, deleting the file in a later commit is insufficient: rotate/revoke the credential and remove it from history where appropriate.

---

## 9. Use Codex review as an additional control, not the only control

Codex can review GitHub pull requests and should be given repository-specific review priorities in `AGENTS.md`: correctness, regressions, security, data loss, evidence integrity, and test adequacy before style preferences.

Codex review does not replace:

- deterministic CI;
- security scanning;
- domain-expert review for high-consequence decisions;
- human responsibility for release/deployment decisions.

Automatic Codex review is most useful after the repository has stable instructions and low-noise tests. Otherwise it automates ambiguity.

---

## 10. Durable continuity and recovery

Conversation and model context are disposable working memory. For active long-running projects maintain one concise current-state checkpoint recording:

- goal;
- authoritative baseline;
- active decisions and owner constraints;
- completed work not to repeat;
- current step and last verified durable boundary;
- remaining work;
- blockers and uncertainty;
- relevant tests, artifacts, logs, branches, and commits;
- next safe action.

After interruption, compaction, model switch, or a fresh thread, inspect actual repository state first, reconcile the checkpoint, identify exactly what survived, repair stale entries, and resume without repeating completed work.

Transferable findings still require lesson disposition and promotion. A current-state file is not a lesson index.

---

## 11. Machine-check the baseline

Use `.github/codex-repository.json` and `scripts/audit_codex_github.py` from this universal repository to detect repository-visible failures such as:

- missing `AGENTS.md`, README, profile, or required current-state checkpoint;
- missing exact test command or CI in active software;
- implicit/write-all Actions permissions;
- unpinned remote Actions references;
- dangerous `pull_request_target` plus checkout;
- likely committed secret filenames;
- missing public/high-risk security and ownership files;
- unverified GitHub-hosted controls.

The audit cannot prove hosted settings merely from files. Rulesets, secret scanning, push protection, code scanning, App permissions, and repository Actions defaults require GitHub API/settings verification.

Run the audit locally and in CI. Treat errors as completion blockers; disposition warnings rather than ignoring them indefinitely.

---

## 12. Minimum baseline by repository type

### Active software repository

Required:

- operational root `AGENTS.md`;
- repository profile with exact bootstrap/test commands;
- lock/resolution file when supported;
- CI with explicit least-privilege permissions;
- protected default branch requiring PRs and status checks;
- current-state checkpoint if long-running;
- redacted configuration examples and ignored real secrets;
- Dependabot/security controls appropriate to visibility/risk;
- PR verification evidence.

### Research or content repository

Required:

- clear README and source/authority structure;
- root `AGENTS.md` defining editorial/research invariants;
- repository profile;
- current-state checkpoint if active and long-running;
- provenance and loss-prevention rules;
- validation appropriate to the work (link/data checks, schemas, detector checks, citations, or editorial gates).

Do not require a software build pipeline when there is no software.

### Artifact or archive repository

Required:

- README explaining whether files are generated, canonical, or archival;
- `AGENTS.md` preventing accidental edits to generated/canonical artifacts;
- provenance/version/hash policy where integrity matters;
- profile marking inactive or `long_running: false` when appropriate.

### Public or high/critical-risk repository

Add:

- security policy and private reporting path;
- license and contribution expectations;
- CODEOWNERS for sensitive paths;
- verified secret scanning/push protection;
- verified branch rules;
- code/dependency scanning where applicable;
- stricter release and human/domain review gates.

---

## 13. Anti-patterns

Do not:

- keep indispensable decisions only in a giant Codex conversation;
- stuff the full project history into `AGENTS.md`;
- duplicate stale universal instructions across repositories;
- give Codex a vague goal with no acceptance test;
- let an agent commit directly to an unprotected default branch as routine practice;
- merge because Codex said “looks good” without deterministic evidence;
- use floating Action tags in privileged workflows;
- grant broad token permissions “just in case”;
- expose secrets during setup, logging, debugging, or evidence packaging;
- run untrusted PR code with privileged events/secrets;
- force independent-approval rules in a solo repo and then bypass them habitually;
- claim GitHub security controls are enabled without verifying settings;
- apply production software ceremony to an inactive prose archive with no corresponding risk.

---

## Official source registry

These are the primary sources reviewed for this pattern. Recheck them before a major policy revision because Codex and GitHub capabilities change.

### OpenAI

- Codex instruction files / `AGENTS.md`: `https://developers.openai.com/codex/guides/agents-md/`
- Codex cloud environments: `https://developers.openai.com/codex/cloud/environments/`
- Codex cloud internet access: `https://developers.openai.com/codex/cloud/internet-access/`
- Codex GitHub integration: `https://developers.openai.com/codex/integrations/github/`
- Codex code review: `https://developers.openai.com/codex/guides/code-review/`

### GitHub

- Repository best practices: `https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories`
- Rulesets: `https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets`
- Protected branches: `https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches`
- CODEOWNERS: `https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners`
- Actions security hardening: `https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions`
- GitHub token permissions: `https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication`
- OIDC: `https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect`
- Dependabot configuration: `https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file`
- Dependency review: `https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review`
- Secret-scanning push protection: `https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection`
- Code scanning default setup: `https://docs.github.com/en/code-security/code-scanning/enabling-code-scanning/configuring-default-setup-for-code-scanning`
- Security policy: `https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository`
- Pull-request templates: `https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository`

## Review cadence

- Recheck OpenAI Codex documentation before changing instruction-discovery, environment, or GitHub-integration policy.
- Recheck GitHub security guidance before changing Actions, rulesets, token permissions, or scanning controls.
- Perform a formal source review at least quarterly while these products are changing rapidly, and record the date and disposition in the universal lesson system.
