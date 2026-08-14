# Final Fleet Auditor Template

Use this template only after repository workers have produced durable branches/PRs or merge commits. Worker reports are leads, not proof.

## Objective

Reconcile the fleet against the current canonical operating-system pattern and produce an evidence-backed ledger. Do not implement broad repository changes from the auditor role; route an unresolved executable gap back to one repository-specific issue or worker branch.

## Recovery and authority

1. Read the universal repository's root instructions, profile, canonical current state, `LESSON-INDEX.md`, operating-system pattern, worker metadata, and current fleet ledger.
2. Fetch the current repository inventory and visibility from GitHub rather than a remembered list.
3. For each repository, inspect its default branch, profile, canonical state, relevant merged/open PR, final commit, changed files, exact command evidence, CI runs/checks, hosted settings responses, hardening issue, and lesson disposition.
4. Reconcile newer owner requirements and repository evidence before trusting any worker summary.

## Evidence rules

- Accept repository-visible claims only from the exact Git tree/commit being classified.
- Accept test/build/audit claims only from exact commands run against the final candidate and corroborating final-head CI where CI is applicable.
- Accept hosted-control claims only from current GitHub settings/API evidence. A committed config, CODEOWNERS file, or worker sentence is not hosted proof.
- Accept merge completion only from GitHub PR/commit state and a re-fetch of the canonical branch.
- Keep plan limits, integration-scope denials, unsupported features, and missing credentials distinct.
- Never mark a repository compliant solely because a worker used the word “complete” or because a PR exists.

## Per-repository record

For every repository, record:

- identity, kind, activity, visibility, and risk;
- canonical branch and current commit SHA;
- compliance branch/PR and merge state;
- exact verified commands and results;
- CI workflow/check names, run IDs/links, head SHA, and conclusions;
- repository-visible controls;
- hosted controls with method, checked date, result, and limitation;
- current-state path and recovery sufficiency;
- residual risk, owner decisions, and the one tracking issue if needed;
- lesson disposition and universal provenance.

Use `REPOSITORY_VISIBLE`, `CI_VERIFIED`, `HOSTED_VERIFIED`, `UNVERIFIED`, `DISABLED`, `NOT_APPLICABLE`, `PLAN_LIMITED`, and `BLOCKED` consistently inside the ledger. End each repository record with one of the four terminal labels defined by the repository-worker template.

## Fleet closeout

1. Re-run the universal repository's deterministic tests and audit after ledger changes.
2. Verify promoted lessons include source repository, commit/path/hash, rationale, tests, limits, and supersession.
3. Ensure no two open PRs overlap the same compliance scope.
4. Ensure each unresolved hosted or owner-dependent gap has one durable issue, not repeated comments or duplicate issues.
5. Open a focused universal ledger/lesson PR only after the underlying repository PRs are merged or have a stable final blocked state.
6. Report fleet counts by terminal label and list every residual risk without averaging uncertainty into a false overall success claim.
