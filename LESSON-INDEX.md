# Universal lesson index

Use this file as the entry point for cross-project lesson retrieval.

## Current required patterns

1. `patterns/durable-chat-learning.md` — repository-first durability, lesson closeout, semantic dispositions, exact-hash provenance, CI/weekly orphan audits, stale-bundle safety, and universal promotion.
2. `patterns/github-first-agent-bootstrap.md` — keep agent/project UI state minimal, fetch current canonical state from GitHub, separate canonical project state from specialist evidence, and never let stale bundles overwrite newer Git state.
3. `patterns/context-compaction-resilience.md` — treat conversation as disposable working RAM, Git as durable project memory/audit history, maintain one concise current-state recovery checkpoint for long-running work, and reconcile that checkpoint against actual repository state after interruption, context compaction, model switch, or a fresh thread.\n4. `patterns/paid-workflow-safety.md` — gate paid, privileged, or irreversible GitHub Actions behind a fail-closed registration topology, deterministic secret-free validation, environment-file injection defenses, late credential/secret boundaries, and exact archival provenance.

## Reusable policy template

- `templates/PROJECT-LEARNING-POLICY.md` — paste/adapt into project instructions so agents close the learning loop and preserve resumable durable state without asking the owner to remind them.
- `templates/CURRENT-STATE.md` — reusable recovery checkpoint for long-running or multi-session work.
- `templates/AGENTS-UNIVERSAL-BOOTSTRAP.md` — compact root `AGENTS.md` bootstrap for project repositories; points workers back to this index while embedding the minimum durable-continuity invariant locally.

## Promotion rule

Project-local evidence stays in the project repository. Promote a lesson here only when it is transferable beyond one project. Preserve the originating repository, source artifact, date/commit, rationale, and limits.

## Retrieval rule

Start with this index, then open only the relevant current pattern. Do not load every historical lesson indiscriminately. Newer owner correction and newer validated evidence supersede older conflicting guidance.

For long-running or multi-session project work, the project bootstrap/index should also point to one obvious current-state checkpoint (`CURRENT-STATE.md`, `state/CURRENT-STATE.md`, or an equivalent machine-readable file). A fresh worker must reconcile that checkpoint with actual Git state before resuming.
