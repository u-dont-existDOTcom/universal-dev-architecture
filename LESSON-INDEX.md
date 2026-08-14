# Universal lesson index

Use this file as the entry point for cross-project lesson retrieval.

## Current required patterns

1. `patterns/codex-github-operating-system.md` — risk-adjusted repository profiles, exact commands, persistent instructions, isolated work, deterministic verification, least-privilege GitHub automation, hosted-control proof boundaries, durable recovery, and semantic lesson closeout.
2. `patterns/durable-chat-learning.md` — repository-first durability, lesson closeout, semantic dispositions, exact-hash provenance, CI/weekly orphan audits, stale-bundle safety, and universal promotion.
3. `patterns/github-first-agent-bootstrap.md` — keep agent/project UI state minimal, fetch current canonical state from GitHub, separate canonical project state from specialist evidence, and never let stale bundles overwrite newer Git state.
4. `patterns/context-compaction-resilience.md` — treat conversation as disposable working RAM, Git as durable project memory/audit history, maintain one concise current-state recovery checkpoint for long-running work, and reconcile that checkpoint against actual repository state after interruption, context compaction, model switch, or a fresh thread.

## Reusable policy template

- `templates/PROJECT-LEARNING-POLICY.md` — paste/adapt into project instructions so agents close the learning loop and preserve resumable durable state without asking the owner to remind them.
- `templates/CURRENT-STATE.md` — reusable recovery checkpoint for long-running or multi-session work.
- `templates/AGENTS-UNIVERSAL-BOOTSTRAP.md` — compact root `AGENTS.md` bootstrap for project repositories; points workers back to this index while embedding the minimum durable-continuity invariant locally.

## Repository compliance worker architecture

- `templates/COMPLIANCE-WORKER-METADATA.json` — versioned entry point for the repository worker, final fleet auditor, and mandate-generation guide.
- `audits/2026-08-14-compliance-worker-architecture.md` — promoted lesson with provenance, limits, anti-patterns, verification, and supersession rules.

## Promoted tested implementation lessons

- `audits/2026-08-14-askrigor-transferable-controls.md` — exact-byte
  authority, truthful partial-access states, bounded opt-in live validation,
  public read-only service safety, and structure-aware secret detection,
  promoted from AskRigor with source hashes, tests, and explicit limits.
- `audits/2026-08-14-askrigor-lessons-transferable-design.md` —
  non-authoritative lesson ledgers, immutable byte provenance, executable
  dispositions/supersession, explicit freshness ownership, and bounded
  sensitive-evidence intake, promoted from AskRigor-lessons with exact source
  hashes, tests, limits, and anti-patterns.

## Promotion rule

Project-local evidence stays in the project repository. Promote a lesson here only when it is transferable beyond one project. Preserve the originating repository, source artifact, date/commit, rationale, and limits.

## Retrieval rule

Start with this index, then open only the relevant current pattern. Do not load every historical lesson indiscriminately. Newer owner correction and newer validated evidence supersede older conflicting guidance.

For long-running or multi-session project work, the project bootstrap/index should also point to one obvious current-state checkpoint (`CURRENT-STATE.md`, `state/CURRENT-STATE.md`, or an equivalent machine-readable file). A fresh worker must reconcile that checkpoint with actual Git state before resuming.

For this repository, the one canonical checkpoint is `state/CURRENT-STATE.md`; root `CURRENT-STATE.md` is only a compatibility pointer.
