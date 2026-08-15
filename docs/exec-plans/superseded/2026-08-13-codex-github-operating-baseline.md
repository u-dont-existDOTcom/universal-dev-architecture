# Codex + GitHub operating baseline plan

Status: superseded as the active execution plan on 2026-08-14 by `docs/superpowers/plans/2026-08-14-universal-dev-architecture-compliance.md`. Retained here as rollout provenance.

## Goal

Create one reusable operating standard, verify every current repository against it, and apply repository-specific controls without inventing commands or breaking existing automation.

## Completed

- Current official OpenAI and GitHub guidance audited.
- Universal operating standard written.
- Root agent map, documentation index, current-state checkpoint, repository profile, and reusable templates added.

## Remaining

- Reconcile and verify the landed implementation through the current compliance plan.
- Keep each project upgrade in a separate non-overlapping pull request.
- Record plan- or permission-gated hosted controls without converting them into repository-visible success claims.

## Constraints

- No ordinary direct pushes to canonical branches.
- No impossible self-approval requirement for a solo owner.
- No branch protection on Pangram until its direct-to-main Action path is redesigned.
- No claim that a paid or permission-gated GitHub control is active without API verification.
