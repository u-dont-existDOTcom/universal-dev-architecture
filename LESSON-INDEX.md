# Universal lesson index

Use this file as the entry point for cross-project lesson retrieval.

## Current required patterns

1. `patterns/durable-chat-learning.md` — repository-first durability, lesson closeout, semantic dispositions, exact-hash provenance, CI/weekly orphan audits, stale-bundle safety, and universal promotion.
2. `patterns/github-first-agent-bootstrap.md` — keep agent/project UI state minimal, fetch current canonical state from GitHub, separate canonical project state from specialist evidence, and never let stale bundles overwrite newer Git state.

## Reusable policy template

- `templates/PROJECT-LEARNING-POLICY.md` — paste/adapt into project instructions so agents close the learning loop without asking the owner to remind them.

## Promotion rule

Project-local evidence stays in the project repository. Promote a lesson here only when it is transferable beyond one project. Preserve the originating repository, source artifact, date/commit, rationale, and limits.

## Retrieval rule

Start with this index, then open only the relevant current pattern. Do not load every historical lesson indiscriminately. Newer owner correction and newer validated evidence supersede older conflicting guidance.
