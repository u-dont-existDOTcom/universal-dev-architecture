# Codex + GitHub Operating Standard

**Status:** Canonical cross-project standard  
**Revision:** 2026-08-13  
**Scope:** Repositories in the `u-dont-existDOTcom` GitHub account and future projects that use Codex or another coding agent.

## Purpose

A strong Codex workflow is not “give the model a large prompt and hope.” The repository must make correct work easier than incorrect work: current knowledge is discoverable, setup and validation are deterministic, risky actions are constrained, every consequential change has an auditable review path, and a fresh worker can resume without the old chat.

This standard distinguishes:

- **required controls** that apply to every active repository;
- **software controls** for executable code and automation;
- **knowledge controls** for research, articles, evidence, and protocols;
- **conditional controls** whose availability depends on repository visibility, GitHub plan, deployment architecture, or project risk.

Project-specific requirements and newer owner decisions outrank this document. A project may deviate only through an explicit, reasoned, expiring exception in `.codex/repository-policy.json` or its equivalent—not through silent drift.

## 1. Repository knowledge is the system of record

### Required

1. Keep a concise root `AGENTS.md` as a **map**, not an encyclopedia. It should normally be roughly 100 lines or less and point to deeper authoritative files.
2. Keep the combined Codex instruction chain below the default 32 KiB discovery budget. Use nested `AGENTS.md` or `AGENTS.override.md` files only where a subtree genuinely has different commands or review rules.
3. Maintain `docs/INDEX.md` (or a project-established equivalent) as the current documentation map. It must distinguish authoritative documents, generated evidence, historical material, and superseded files.
4. Record exact setup and validation commands in the repository. Do not depend on a prior chat, an undocumented local habit, or a human remembering the command.
5. Put durable decisions, constraints, accepted plans, test evidence, and known failures in Git. Chat context is working memory, not authority.
6. Verify instruction discovery when an agent behaves unexpectedly, for example by asking Codex to summarize the instructions active in the current directory.

### Long-running work

Maintain one concise recovery checkpoint such as `CURRENT-STATE.md` or `state/CURRENT-STATE.md`, recording:

- current goal and authoritative baseline;
- active owner decisions and invariants;
- completed work that must not be repeated;
- current verified checkpoint;
- remaining work and blockers;
- relevant artifacts, tests, branches, and commits;
- next safe action.

Reconcile the checkpoint against the actual working tree and Git history after interruption, compaction, a model switch, or a new thread. The checkpoint never outranks newer verified repository state.

## 2. Give Codex an executable environment

### Required for software repositories

1. Pin the runtime/toolchain version (`.nvmrc`, `engines`, `.python-version`, container digest, or equivalent).
2. Commit package-manager lockfiles whenever the ecosystem supports them and dependencies exist.
3. Provide one canonical verification command that runs the complete deterministic gate. Smaller targeted commands may exist, but “complete” must have one unambiguous meaning.
4. Make setup idempotent. Re-running it must preserve valid configuration, avoid duplicate work, and fail with a diagnostic rather than silently producing a different environment.
5. Separate hermetic tests from live/provider tests. Live tests must be explicitly opt-in, bounded, credential-aware, and truthfully report skips or partial access.
6. Keep generated state, credentials, local databases, model output, and private evidence out of Git unless the repository deliberately defines a safe redacted contract for them.

### Codex cloud and internet

- Use a setup script for dependencies and a maintenance script only when necessary.
- Do not assume setup-script exports persist into the agent phase; persist intended variables through the supported environment configuration.
- Keep agent internet access off unless the task needs it. Prefer an allowlist and the minimum HTTP methods needed.
- Never combine broad internet access, sensitive secrets, and untrusted repository instructions without a specific threat model.
- Cache dependencies only when cache invalidation is understood; a fast stale environment is worse than a slower correct one.

## 3. Shape work into reviewable units

1. Describe tasks like good GitHub issues: objective, acceptance criteria, constraints, relevant paths/components, known evidence, and explicit non-goals.
2. For substantial changes, inspect and plan before implementation. Commit an execution plan with progress and decision logs when the work spans multiple sessions, subsystems, or irreversible choices.
3. Prefer one coherent concern per pull request. Avoid mixing refactors, dependency upgrades, policy changes, and product behavior unless they are inseparable.
4. Use an isolated worktree or task branch for concurrent or risky work. Never let two workers mutate the same working tree.
5. Keep temporary exploration disposable. Promote only verified implementation, evidence, and decisions into canonical state.
6. Scope ordinary tasks so one worker can understand and validate the complete change. Large autonomous runs are acceptable only when checkpoints, bounded repair, and recovery are first-class parts of the design.

## 4. Pull requests are the default integration boundary

### Required

- Do not push ordinary implementation or documentation changes directly to protected canonical branches.
- Open a PR containing the problem, implementation summary, exact validation, risk analysis, documentation impact, and rollback path.
- Run a self-review against the diff before requesting or invoking another review.
- Resolve review findings in the PR, not in an undocumented side conversation.
- Merge only after required checks pass on the final head commit.
- Delete merged task branches automatically.

### Solo-maintainer rule

Do not require an impossible approval from the author’s own account. For a solo repository, use required CI, resolved conversations, Codex review, and explicit owner judgment for consequential changes. Add required human or CODEOWNERS approval when independent collaborators actually exist or a regulated/high-risk process requires it.

### Merge history

Use squash merge by default for software repositories dominated by agent-generated fixup commits. It creates one auditable change unit per PR and supports linear-history protection. Preserve merge or rebase options only when the project has a documented reason, such as retaining experimentally meaningful commit topology.

## 5. Protect canonical branches mechanically

For canonical branches, require as many of the following as the GitHub plan supports:

- changes through pull requests;
- current required status checks with strict base-branch freshness;
- unique check names;
- resolved review conversations;
- linear history;
- no force pushes;
- no branch deletion;
- rules applying to administrators as well as agents.

Protect every installation/release authority, not only `main`. A project with a `stable` release branch must protect `stable` too.

### Exceptions

A machine-generated diagnostics/data branch may remain writable when all of these are true:

- it is not merged into executable source;
- its schema and path allowlist are deterministic;
- secrets and user content are excluded by construction;
- the branch role is documented;
- source/release branches never trust it as executable input without validation.

A workflow that pushes directly to a canonical branch is a blocker to normal protection. Redesign it to update the originating PR, create a bot PR using appropriate authentication, or use a narrowly controlled ruleset bypass. Do not quietly leave the branch open forever.

## 6. Harden GitHub Actions

Every workflow must:

1. Declare least-privilege `permissions` explicitly. The repository default should be read-only, and workflows should elevate only the specific job that writes.
2. Pin every remote Action or reusable workflow to a full 40-character commit SHA. Keep the human-readable release tag in a same-line comment and let Dependabot maintain the pin.
3. Set `timeout-minutes` for every job.
4. Use `concurrency` deliberately: cancel obsolete CI runs, but serialize deployments or state-mutating jobs rather than canceling midway.
5. Avoid interpolating untrusted issue/PR text directly into shell scripts. Pass it through environment variables or structured inputs and quote it correctly.
6. Avoid `pull_request_target` for building or executing untrusted fork code. If it is unavoidable, use a reviewed, minimal, read-only design.
7. Keep secrets out of untrusted PR workflows and logs. Prefer OIDC or short-lived credentials to long-lived cloud keys.
8. Bound artifacts, caches, logs, retries, provider calls, and retention.
9. Separate read-only validation jobs from write-capable automation jobs.
10. Fail closed when a required check cannot establish completeness.

## 7. Make review rules repository-specific

A root `## Code review rules` section should contain two or three high-consequence checks that automated tests may miss. Examples:

- preserve explicit partial/inaccessible/error states rather than upgrading them to complete;
- never let generated diagnostics contain user content or credentials;
- preserve owner-final prose and protected rhetorical function during editorial changes.

Use nested rules only for a subtree with materially different risks. Do not waste Codex review context on formatting that CI can enforce. Review rules supplement tests and branch protection; they do not replace them.

Enable Codex PR review where available. Use `@codex review` for consequential PRs and automatic reviews only after the repository’s custom rules are stable enough to avoid noise.

## 8. Dependency and secret security

### All repositories

- Enable the dependency graph, Dependabot alerts, and Dependabot security updates where available.
- Add `.github/dependabot.yml` for version updates of package ecosystems and GitHub Actions.
- Never commit provider credentials, private keys, tokens, `.env`, or copied browser/session state.
- Rotate a leaked credential immediately; deleting it from the latest commit is not sufficient.
- Add `SECURITY.md` to public software repositories with a private reporting route and supported-version policy.

### Public repositories

Enable free secret scanning/push protection and CodeQL default setup for supported languages unless a documented incompatibility exists.

### Private personal repositories

GitHub plan limitations may prevent protected branches, CodeQL, or secret scanning. Record the limitation explicitly, retain local/CI scanners where appropriate, and re-run the fleet configurator after a plan upgrade. Do not claim a paid control is active when the API returns `403`.

## 9. Documentation and architecture must be testable

- Check relative documentation links in CI.
- Keep architecture, security, reliability, quality, and product/policy documents separated by responsibility.
- Version active and completed execution plans.
- Keep generated documentation clearly marked and reproducible.
- Add a recurring doc-gardening/technical-debt pass for active projects. It should open PRs, not silently rewrite canonical documents.
- Feed repeated review findings and agent failures back into tests, scripts, docs, or rules. Repeating the same warning in chat is not a durable control.

## 10. Autonomy must be earned by the harness

Codex may independently implement, test, review, repair, and merge low-risk changes only when the repository has deterministic gates and recovery. Escalate for:

- product, therapy, health, safety, legal, or ethical policy;
- destructive migrations or irreversible data changes;
- credentials, permissions, billing, or public release;
- genuinely competing architectural choices;
- missing canonical evidence or owner intent.

Do not use dangerous sandbox/approval bypasses as a routine convenience. A task that repeatedly needs unrestricted execution is evidence that the repository needs a better deterministic tool or explicit permission boundary.

## 11. Completion gate

Before a substantive task is called complete:

1. reconcile the diff against the task and explicit non-goals;
2. run targeted tests and the complete canonical verification command;
3. inspect results rather than merely noting exit code zero;
4. run the repository-policy audit;
5. update affected docs, current state, execution plan, and durable lessons;
6. self-review the final diff;
7. verify required PR checks on the final commit;
8. record any remaining limitation as an issue or dated policy exception;
9. merge through the declared integration path;
10. verify the canonical branch contains the intended result.

## 12. Repository profiles

### Software

Requires deterministic CI, lockfiles where applicable, PR template, Dependabot, exact validation commands, code-review rules, and protected canonical/release branches.

### Knowledge/research/content

Requires authority/read order, provenance, current-state recovery, semantic review, and protected canonical state. CI should validate links, schemas, citations, indexes, or other deterministic invariants that actually exist; do not invent meaningless build theater.

### Incubator/empty

Requires a minimal README, concise AGENTS bootstrap, declared purpose/status, and no secrets. Before substantive implementation begins, promote it to the appropriate profile and establish its validation and branch policy.

## Mechanical enforcement

This repository provides:

- `scripts/codex_repo_audit.py` — local repository policy and workflow linter;
- `scripts/codex_github_fleet.py` — GitHub-side audit/configurator using authenticated `gh`;
- `config/github-fleet.json` — declared fleet, branch roles, check names, and temporary blockers;
- templates for AGENTS, repository policy, docs index, execution plans, current state, and pull requests.

Mutating fleet commands are dry-run unless `--execute` is supplied.

## Primary sources

- OpenAI, [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/)
- OpenAI, [Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- OpenAI, [GitHub integration and pull-request review](https://learn.chatgpt.com/docs/third-party/github)
- OpenAI, [Git worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- OpenAI, [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environment)
- OpenAI, [Agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security)
- OpenAI, [Agent internet access](https://learn.chatgpt.com/docs/cloud/internet-access)
- GitHub, [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- GitHub, [Security hardening for GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)
- GitHub, [Workflow syntax](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)
- GitHub, [Dependabot security updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates)
- GitHub, [GitHub security features](https://docs.github.com/en/code-security/getting-started/github-security-features)
