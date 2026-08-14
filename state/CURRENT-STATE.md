# Current State

Updated: 2026-08-14

## Goal

- Establish and roll out a source-grounded, risk-adjusted Codex + GitHub operating system across Joel's repositories.

## Authority / baseline

- Canonical repository: `u-dont-existDOTcom/universal-dev-architecture`
- Branch: `main`
- Universal entry point: `LESSON-INDEX.md`
- Current owner requirement: important project state and reusable working architectures must survive chat/context loss in GitHub.

## Completed

- Repository-first learning and context-compaction resilience patterns exist.
- A dated implementation plan for the Codex/GitHub audit exists.
- Tests defining the repository audit behavior were added before the implementation.
- A standard-library repository audit implementation and universal repository profile were added.

## Current checkpoint

- Current step: complete the canonical best-practices pattern, templates, source registry, and repository-by-repository audit/remediation.
- Last verified durable boundary: audit tests and implementation committed to `main`; execution verification still required.
- Working-tree status: GitHub-hosted edits only; no claimed local dirty state.

## Remaining

- Run and verify audit tests.
- Add the canonical Codex/GitHub operating pattern and reusable templates.
- Update `LESSON-INDEX.md`.
- Audit all connected project repositories and apply safe, non-destructive corrections.
- Verify GitHub-hosted rules/security settings where connector access permits.
- Record unresolved external controls precisely.

## Blockers / unresolved

- GitHub-hosted rulesets, secret scanning, push protection, and code-scanning settings cannot be inferred from repository files; each must be verified through GitHub APIs/settings.
- Repository-specific build/test commands must never be invented when absent or unclear.

## Evidence / artifacts

- Plan: `docs/plans/2026-08-14-codex-github-best-practices-audit.md`
- Tests: `tests/test_audit_codex_github.py`
- Audit implementation: `scripts/audit_codex_github.py`
- Repository profile: `.github/codex-repository.json`

## Next safe action

- Run `python3 -m unittest discover -s tests -v`, repair any failures, then run `python3 scripts/audit_codex_github.py --root . --fail-on error`.

## Recovery rule

On a fresh thread, interruption, context compaction, or model switch, inspect actual repository state and recent commits before trusting this file. Reconcile any mismatch, identify exactly what survived, update stale entries, and resume from the latest verified durable boundary without repeating completed work.
