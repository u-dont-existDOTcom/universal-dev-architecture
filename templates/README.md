# Reusable Templates

Adapt these templates to the repository's actual type, risk, authority, and commands. Do not copy placeholders or software-only requirements into repositories where they are false or inapplicable.

## Core repository files

- `AGENTS-CODEX.md` — concise root Codex operating contract.
- `GITHUB-AGENTS.md` — scoped `.github/AGENTS.md` security and automation rules.
- `STATE-AGENTS.md` — scoped state/checkpoint integrity rules.
- `CODEX-REPOSITORY-PROFILE.json` — machine-readable repository classification, exact commands, continuity path, and hosted-control status.
- `CURRENT-STATE.md` — concise recovery checkpoint, including owner-source receipt, owner-outcome gap, chat supervisor/directive identity, dual alignment, typed completion, outcome advancement, strategy efficacy, research assurance, and supervision-design feedback.
- `CODEX-TASK.md` — durable non-trivial task contract with owner-source identity, objective reconciliation, dual alignment, typed completion, progress evidence, strategy limits, and chat-to-Codex routing.
- `ACTIVE-TASK.json` — exclusive machine-readable active-task lock with owner authority, reconciliation, alignment, completion, outcome advancement, strategy, reasoning-supervisor identity, and active execution directive.
- `OBJECTIVE-RECONCILIATION.json` — owner-requirement-to-contract/evidence matrix plus independent owner-source receipt and separate worker-to-contract / contract-to-owner alignment.
- `OUTCOME-PROGRESS-RECEIPT.json` — direct-outcome baseline/current/best/target evidence, work classification, outcome advancement, strategy efficacy, intervention, and next decision-changing evidence boundary.
- `CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json` — versioned chat-authored directive defining the exact execution objective, reasoning decision, strategy identity, scope, inputs, evidence, tests, tactical freedom, and stop/review boundary. Codex cannot start substantive execution without it.
- `CODEX-EXECUTION-RECEIPT.json` — execution-only receipt containing commands/actions, mutations, tests, measurements, artifacts, runtime facts, deviations, blockers, and stop trigger. It deliberately excludes supervisory authority.
- `RESEARCH-SUPERVISION-VERDICT.json` — separate operational, scientific, and release-adequacy judgments for AskRigor and comparable research systems.
- `SUPERVISION-DESIGN-FEEDBACK.json` — architecture question/improvement packet for the shared Pro supervisor-design meta-review lane.
- `PULL_REQUEST_TEMPLATE.md` — exact verification, risk, diff audit, continuity, and lesson closeout.
- `PROJECT-LEARNING-POLICY.md` — learning dispositions, provenance, promotion, and CI/orphan-audit policy.

## Compliance worker architecture

- `REPOSITORY-COMPLIANCE-WORKER.md` — generic risk-adjusted worker contract; generate repository facts before execution.
- `FINAL-FLEET-AUDITOR.md` — direct-evidence fleet reconciliation that never accepts worker prose as proof.
- `REPOSITORY-COMPLIANCE-MANDATE-GUIDE.md` — classify a repository and generate a specific mandate without stale facts.
- `COMPLIANCE-WORKER-METADATA.json` — architecture version, review date, compatibility, provenance, and review cadence.

## Adaptation rules

- **Chats perform the reasoning; Codex performs only bounded execution that chats cannot reliably perform.**
- Every nontrivial Codex run needs a current `CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json` authored by Extra High or Pro and returns `CODEX-EXECUTION-RECEIPT.json`.
- Codex may make tactical execution choices but may not choose strategy, interpret owner intent, author substantive prose, judge progress/adequacy/completion, or supervise itself.
- Replace every placeholder with a verified repository fact or remove the field.
- Never invent test/build/audit commands.
- Use nested `AGENTS.md` only for genuine subtree-specific differences.
- Record GitHub-hosted settings as `unverified` until checked through GitHub.
- A solo repository normally should require PRs and deterministic checks without pretending self-approval is independent review.
- Public or high/critical-risk repositories need additional security, ownership, licensing, and contribution decisions.
- Artifact repositories must record source commit, generator, version, checksums, and validation and must prohibit hand edits.
- Research/content repositories require provenance, claim/evidence status, owner authority, privacy, and loss-prevention controls instead of irrelevant software ceremony.
- Keep worker-to-contract and contract-to-owner alignment separate; never average away a contract-integrity failure.
- Keep owner-outcome advancement and strategy efficacy separate from alignment; high activity or supporting work cannot substitute for direct progress.
- For AskRigor/research, keep operational, scientific, and release adequacy separate.
- Route substantive supervision-design improvements/questions to the shared Pro meta-review lane instead of silently changing universal architecture.
- Generated compliance mandates must record the worker architecture version and remove all template markers before use.
