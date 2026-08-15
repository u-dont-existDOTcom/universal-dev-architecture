# Reusable Templates

Adapt these templates to the repository's actual type, risk, authority, and commands. Do not copy placeholders or software-only requirements into repositories where they are false or inapplicable.

## Core repository files

- `AGENTS-CODEX.md` — concise root Codex operating contract.
- `GITHUB-AGENTS.md` — scoped `.github/AGENTS.md` security and automation rules.
- `STATE-AGENTS.md` — scoped state/checkpoint integrity rules.
- `CODEX-REPOSITORY-PROFILE.json` — machine-readable repository classification, exact commands, continuity path, and hosted-control status.
- `CURRENT-STATE.md` — concise recovery checkpoint.
- `CODEX-TASK.md` — durable non-trivial task contract.
- `PULL_REQUEST_TEMPLATE.md` — exact verification, risk, diff audit, continuity, and lesson closeout.
- `PROJECT-LEARNING-POLICY.md` — learning dispositions, provenance, promotion, and CI/orphan-audit policy.

## Compliance worker architecture

- `REPOSITORY-COMPLIANCE-WORKER.md` — generic risk-adjusted worker contract; generate repository facts before execution.
- `FINAL-FLEET-AUDITOR.md` — direct-evidence fleet reconciliation that never accepts worker prose as proof.
- `REPOSITORY-COMPLIANCE-MANDATE-GUIDE.md` — how to classify a repository and generate a specific mandate without stale facts.
- `COMPLIANCE-WORKER-METADATA.json` — architecture version, review date, compatibility, provenance, and review cadence.

## Adaptation rules

- Replace every placeholder with a verified repository fact or remove the field.
- Never invent test/build/audit commands.
- Use nested `AGENTS.md` only for genuine subtree-specific differences.
- Record GitHub-hosted settings as `unverified` until checked through GitHub.
- A solo repository normally should require PRs and deterministic checks without pretending self-approval is independent review.
- Public or high/critical-risk repositories need additional security, ownership, licensing, and contribution decisions.
- Artifact repositories must record source commit, generator, version, checksums, and validation and must prohibit hand edits.
- Research/content repositories require provenance, claim/evidence status, owner-authority, privacy, and loss-prevention controls instead of irrelevant software ceremony.
- Generated compliance mandates must record the worker architecture version and remove all template markers before use.
