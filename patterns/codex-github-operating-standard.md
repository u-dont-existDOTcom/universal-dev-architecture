# Codex + GitHub Operating Standard

**Canonical revision:** 2026-08-13

## Purpose

Codex should not depend on a giant prompt or one immortal conversation. The repository must make the correct workflow discoverable and mechanically enforceable: current knowledge, exact commands, isolated changes, deterministic tests, reviewable pull requests, protected canonical branches, bounded automation, and recoverable state.

Current project requirements and newer owner decisions outrank this universal standard. Any deviation must be explicit, reasoned, and time-bounded rather than silent.

## 1. Repository knowledge

- Keep root `AGENTS.md` concise. It is a map to authoritative project files, exact commands, branch roles, safety boundaries, and two or three consequential review rules—not a transcript or full manual.
- Keep the discovered instruction chain within Codex's default 32 KiB budget. Add nested `AGENTS.md` or `AGENTS.override.md` only where a subtree genuinely differs.
- Maintain `docs/INDEX.md` or an established equivalent. Distinguish current authority, generated evidence, historical material, and superseded documents.
- Put durable decisions, constraints, accepted plans, tests, and known failures in Git. Chat is working memory, not project state.
- For long-running work, maintain one concise `CURRENT-STATE.md` (or established equivalent) with goal, baseline, active decisions, completed work, checkpoint, remaining work, blockers, evidence/commits, and next safe action.
- After interruption, compaction, model switch, or a fresh thread, reconcile the checkpoint against the actual working tree, recent commits, tests, and artifacts before resuming.

## 2. Executable environment

Software repositories must:

- pin the runtime/toolchain version;
- commit dependency lockfiles where the ecosystem supports them;
- provide idempotent setup;
- expose one unambiguous complete deterministic verification command;
- separate hermetic tests from explicit, bounded live/provider checks;
- preserve explicit skip, partial, inaccessible, rate-limited, and error states;
- exclude credentials, local state, user content, and unrestricted raw logs from Git.

For Codex cloud environments, configure setup, environment variables, and internet access deliberately. Do not assume temporary setup-script exports persist. Keep internet disabled unless needed; then use the smallest practical allowlist and methods. Broad network access plus secrets and untrusted instructions requires an explicit threat model.

## 3. Task and plan shape

- Write tasks like good GitHub issues: objective, acceptance criteria, constraints, relevant paths, known evidence, and explicit non-goals.
- Start large changes with inspection and an implementation plan.
- Commit execution plans for multi-session, multi-subsystem, risky, or irreversible work. Record progress, decisions, validation, and recovery—not private chain-of-thought.
- Prefer one coherent concern per pull request.
- Use an isolated worktree or task branch. Concurrent workers must not mutate the same working tree.
- Scope ordinary work so one worker can understand and validate the entire change. Larger autonomous work requires checkpoints, bounded repair, and recovery.

## 4. Pull-request lifecycle

Ordinary substantive changes go through a pull request rather than directly to canonical or release branches.

Each PR should contain:

- the problem and exact acceptance criteria;
- implementation summary and non-goals;
- exact validation commands and results;
- risks and rollback/recovery path;
- documentation and durable-state impact;
- residual limitations or dated exceptions.

Self-review the final diff. Resolve review findings in the PR. Merge only after required checks pass on the final head commit, then verify the canonical branch contains the intended result.

For a solo-maintainer repository, do not require an impossible self-approval. Use required CI, resolved conversations, Codex review, and explicit owner judgment for consequential changes. Require independent approval when an independent reviewer actually exists or the domain demands it.

Use squash merge by default for software repositories dominated by agent fixup commits. Preserve another merge method only for a documented reason.

## 5. Branch authority and protection

Protect every canonical or installation/release authority—not only `main`. A repository with a `stable` installation branch must protect `stable` as well.

Where the GitHub plan permits, require:

- pull requests;
- successful, uniquely named status checks;
- strict base-branch freshness where appropriate;
- resolved review conversations;
- linear history;
- no force pushes;
- no branch deletion;
- rules applying to administrators/agents rather than being routinely bypassed.

A machine-written diagnostics/data branch may remain directly writable only when it is isolated from executable source, schema/path allowlisted, excludes secrets and user content by construction, and is never trusted without validation.

A workflow that pushes directly to a canonical branch is a protection blocker. Redesign it to update the originating PR, open a bot PR, or use a narrow reviewed bypass. Record the blocker; do not pretend protection is active.

Public repositories can use protected branches on GitHub Free. Private personal repositories generally require GitHub Pro or another qualifying plan. Treat an API `403` as a real limitation and record it rather than claiming success.

## 6. GitHub Actions hardening

Every workflow should:

1. declare least-privilege `permissions` explicitly;
2. pin every remote Action or reusable workflow to a full 40-character commit SHA, with the human-readable release in a comment;
3. set `timeout-minutes` for each job;
4. use `concurrency` deliberately—cancel obsolete CI, serialize state-changing jobs;
5. avoid placing untrusted issue/PR text directly into shell programs;
6. avoid `pull_request_target` for executing untrusted fork code;
7. keep credentials out of untrusted PR workflows and logs;
8. prefer short-lived/OIDC credentials over long-lived cloud keys;
9. bound artifacts, caches, logs, retries, provider calls, and retention;
10. separate read-only validation from write-capable automation;
11. fail closed when completeness cannot be established.

Set the repository's default workflow token to read-only. Elevate only the exact job that needs write access.

## 7. Repository-specific review rules

Root `AGENTS.md` should carry two or three high-consequence review rules that tests may miss, such as:

- never silently upgrade partial evidence to complete;
- never include user content or credentials in diagnostics;
- preserve owner-final prose and protected rhetorical function;
- preserve release-branch authority and rollback invariants.

Formatting belongs in deterministic tooling, not review prose. Review rules supplement tests and branch controls; they do not replace them.

Use Codex PR review for consequential changes once the repository rules are stable enough to produce useful signal.

## 8. Dependency, secret, and public-repository security

- Enable the dependency graph, Dependabot alerts, and Dependabot security updates where available.
- Add `.github/dependabot.yml` for package ecosystems and GitHub Actions.
- Never commit provider keys, tokens, private keys, `.env`, browser/session state, or copied secrets. Rotate a leaked credential immediately; deleting it from the latest commit is insufficient.
- Public software repositories should include `SECURITY.md` with a private reporting path and supported-version policy.
- Enable secret scanning/push protection and CodeQL default setup for supported public repositories unless a documented incompatibility exists.
- Private-plan limitations must be explicit. Re-audit after a plan change.

## 9. Testable documentation and feedback loops

- Check relative documentation links and required indexes in CI.
- Separate architecture, security, reliability, quality, and product/policy documents by responsibility.
- Version active and completed execution plans.
- Mark generated documents and identify their producer/freshness signal.
- Run periodic documentation and technical-debt gardening through PRs.
- Convert repeated review findings and agent failures into tests, scripts, docs, or rules. Repeating warnings in chat is not a durable control.

## 10. Autonomy boundary

Codex may autonomously implement, test, review, repair, and merge low-risk changes only when deterministic gates and recovery exist.

Escalate for:

- product, therapy, health, safety, legal, or ethical policy;
- destructive migrations or irreversible data changes;
- credentials, permissions, billing, or public release;
- genuinely competing architecture choices;
- missing canonical evidence or owner intent.

Do not normalize dangerous sandbox or approval bypasses. Repeated need for unrestricted execution means the repository needs a better deterministic tool or explicit boundary.

## 11. Completion gate

Before substantive work is called complete:

1. reconcile the final diff with acceptance criteria and non-goals;
2. run targeted tests and the complete deterministic gate;
3. inspect the results, not merely the exit code;
4. verify repository-policy controls;
5. update affected docs, current state, plan, and durable lessons;
6. self-review the final diff;
7. verify required checks on the final PR head;
8. record remaining limitations as issues or dated exceptions;
9. merge through the declared integration path;
10. verify the canonical branch contains the result.

## 12. Repository profiles

### Software

Requires exact setup/verification commands, runtime pinning, lockfiles where applicable, deterministic CI, PR template, dependency maintenance, repository-specific review rules, and protected canonical/release branches.

### Knowledge/research/content

Requires authority/read order, provenance, current-state recovery, semantic review, and protected canonical state. CI should validate real invariants—links, indexes, schemas, citations, or ledgers—not invent meaningless build theater.

### Incubator/empty

Requires a minimal README, concise `AGENTS.md`, declared purpose/status, and no secrets. Promote it to the correct profile before substantive implementation.

## Primary sources

- OpenAI: [How OpenAI uses Codex](https://openai.com/business/guides-and-resources/how-openai-uses-codex/)
- OpenAI: [Introducing Codex](https://openai.com/index/introducing-codex/)
- OpenAI: [Harness engineering](https://openai.com/index/harness-engineering/)
- OpenAI Codex docs: AGENTS.md, GitHub integration, worktrees, environments, approvals, and internet access
- GitHub: protected branches, rulesets, Actions security hardening, workflow syntax, Dependabot, secret scanning, and CodeQL documentation
