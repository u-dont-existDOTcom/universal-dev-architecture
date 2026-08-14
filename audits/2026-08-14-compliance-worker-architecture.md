# Repository Compliance Worker Architecture Lesson Closeout

Date: 2026-08-14
Disposition: `promoted`
Architecture version: `1.0.0`

## Provenance

- Source repository: `u-dont-existDOTcom/universal-dev-architecture`
- Source plan: `docs/superpowers/plans/2026-08-14-universal-dev-architecture-compliance.md`
- Source plan commit: `c83b99e`
- Canonical pattern: `patterns/codex-github-operating-system.md`
- Durable templates: `templates/REPOSITORY-COMPLIANCE-WORKER.md`, `templates/FINAL-FLEET-AUDITOR.md`, `templates/REPOSITORY-COMPLIANCE-MANDATE-GUIDE.md`
- Version metadata: `templates/COMPLIANCE-WORKER-METADATA.json`

## Promoted lesson

A scalable repository-compliance effort needs two distinct roles and an evidence-generating boundary:

1. a repository worker that recovers local truth, applies the risk-adjusted baseline, verifies the final candidate, and produces one repository PR/report;
2. a final fleet auditor that independently re-fetches commits, files, commands, CI, hosted settings, issues, and merge state rather than trusting worker prose;
3. a mandate generator that derives repository-specific facts and invariants from current evidence instead of hard-coding a fleet snapshot into the reusable worker.

This separation prevents optimistic prose from becoming fleet status and prevents a universal template from silently carrying stale project commands or domain policy.

## Limits

- The templates do not grant credentials, plan features, GitHub App scopes, independent reviewers, or domain expertise.
- A generated mandate is not evidence that its requirements are satisfied.
- Risk classification still requires repository and owner evidence; automation must not infer health, legal, release, or licensing decisions.
- Hosted controls remain outside the repository-visible audit and require GitHub API/settings inspection.
- Fleet reconciliation should occur only after repository branches/PRs have stable final evidence.

## Anti-patterns

- Marking a repository compliant from a worker's narrative alone.
- Copying a software mandate into research, content, artifact, inactive, or archive repositories.
- Embedding repository names, commands, branch roles, or protocol facts in the universal worker template.
- Treating CODEOWNERS, workflow YAML, or profile text as proof of active hosted rules/scanning.
- Opening overlapping remediation PRs or duplicate hardening issues.
- Promoting project-specific domain policy as a universal lesson without source/hash, tests, limits, and supersession.

## Verification model

- The repository audit's unit suite covers missing/invalid profiles, exact-command requirements, instruction budgets, workflow permissions/pins/timeouts/concurrency, privileged PR events, unsafe/secret filenames, risk posture, and unsupported hosted-control claims.
- `python3 -m json.tool templates/COMPLIANCE-WORKER-METADATA.json` validates the machine-readable version record.
- `python3 scripts/audit_codex_github.py --root . --fail-on error` validates the repository-visible baseline without making hosted claims.
- Each generated repository mandate must supply project-local focused/full gates and final-head CI/hosted evidence.

## Supersession

Future revisions must increment `architecture_version`, update `reviewed_at` and `next_review_due`, describe compatibility and changed interpretation, retain this closeout as provenance, and update the canonical lesson index. Repository mandates already in progress keep their recorded version unless the owner explicitly adopts a newer material requirement.
