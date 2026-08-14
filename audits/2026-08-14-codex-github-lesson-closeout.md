# Codex + GitHub Audit Lesson Closeout

Date: 2026-08-14

## Promoted universal lessons

### 1. Codex reliability requires a repository operating system, not merely access to a repository

Disposition: `promoted`

Durable locations:

- `patterns/codex-github-operating-system.md`
- `LESSON-INDEX.md`
- `templates/AGENTS-CODEX.md`
- `templates/CODEX-REPOSITORY-PROFILE.json`
- `templates/CODEX-TASK.md`
- `templates/PULL_REQUEST_TEMPLATE.md`

General rule: persistent instructions, exact task contracts, reproducible environments, isolated branches/PRs, deterministic verification, least-privilege automation, durable recovery state, and lesson closeout must work together. A large chat or a GitHub connection alone is not durable project architecture.

### 2. Repository-visible controls and hosted GitHub controls require different proof

Disposition: `promoted`

Durable locations:

- `patterns/codex-github-operating-system.md`
- `scripts/audit_codex_github.py`
- `.github/codex-repository.json`
- `audits/2026-08-14-connected-repositories.md`
- `audits/2026-08-14-implementation-status.md`

General rule: files can prove instructions, profiles, workflows, permissions declarations, Action pins, state checkpoints, and policy files. They cannot prove rulesets, branch protection, secret scanning, push protection, code scanning, GitHub App permissions, or Actions defaults. Hosted controls remain `unverified` until GitHub settings/API evidence exists.

### 3. Risk-adjust repository governance rather than copying production software ceremony everywhere

Disposition: `promoted`

Durable location: `patterns/codex-github-operating-system.md`

General rule: active software, research/content, artifact/archive, public, and high/critical-risk repositories need different baselines. Apply provenance/editorial/privacy gates to research and content; source/version/hash/generator rules to artifacts; deterministic build/test/security controls to software.

### 4. A solo repository should not fake independent review

Disposition: `promoted`

Durable locations:

- `patterns/codex-github-operating-system.md`
- `audits/2026-08-14-implementation-status.md`

General rule: require pull requests, stable deterministic checks, resolved conversations, and blocked force pushes/deletion. Require independent approval only when an independent reviewer actually exists or the risk class demands one. Keep an explicit emergency/admin bypass rather than normalizing habitual bypass of an impossible approval rule.

### 5. Exact commands are facts; do not invent them to make a profile look complete

Disposition: `promoted`

Durable locations:

- `patterns/codex-github-operating-system.md`
- `templates/CODEX-REPOSITORY-PROFILE.json`
- `scripts/audit_codex_github.py`

General rule: a missing test/build/audit command is an explicit gap. Record commands only from current repository scripts/instructions or verified execution. A profile that says `unverified` is safer than plausible fiction.

### 6. Workflow security should be machine-enforced before repository-specific CI is trusted

Disposition: `promoted`

Durable locations:

- `templates/WORKFLOW-POLICY.yml`
- `.github/workflows/universal-architecture-tests.yml`
- `.github/workflows/weekly-codex-github-audit.yml`
- `templates/GITHUB-AGENTS.md`

General rule: every workflow must declare explicit permissions, reject `write-all`, pin remote dependencies to immutable commit SHAs, and prevent privileged execution of untrusted pull-request code. A workflow-policy gate can expose pre-existing failures before exact product test gates are standardized.

## Project-specific findings

Disposition: `project-specific`

Durable locations:

- `audits/2026-08-14-connected-repositories.md`
- repository-local `.github/codex-repository.json`
- repository-local recovery checkpoints
- repository-local audit issues

These include AskRigor protocol/live-validation commands, Pangram lesson-system reconciliation, Inner Signal model/safety gates, communities research provenance, AskRigor-lessons authority boundaries, article owner-lock/editorial rules, and artifact release provenance. They should not be flattened into one universal implementation.

## Provisional findings

### Cross-repository hosted-settings automation

Disposition: `provisional`

Reason: read-only API auditing is broadly reusable. Mutating rulesets, branch protection, scanning, Actions defaults, security policies, or issue state must remain conservative, idempotent, permission-aware, and dry-run-first before becoming a canonical universal tool. Existing stronger settings must never be overwritten.

### Automatic remediation of floating Action references

Disposition: `provisional`

Reason: resolving a tag to a commit SHA is mechanically possible, but an update still requires provenance review and must preserve reusable-workflow semantics. The current universal policy detects the problem; a generalized repair tool requires its own tests and review before promotion.

## No-new-lesson dispositions

- Adding CODEOWNERS, PR templates, profiles, and scoped `AGENTS.md` files followed existing promoted principles; these are implementations, not separate universal lessons.
- Enabling additive GitHub security features where the API permits them is application of standard security guidance, not a new general principle.

## Verification boundary

The universal architecture and repository-visible controls were written through GitHub and a live audit/evidence bundle was generated. Full per-repository compliance still requires current file re-fetches, successful exact command/CI evidence, repair of workflow findings, and hosted-setting verification. The implementation status file intentionally preserves that distinction.

## Next universal action

After exact repository commands and stable CI check names are verified, add those checks to default-branch protection and rerun the live audit. Do not configure guessed status-check names.
