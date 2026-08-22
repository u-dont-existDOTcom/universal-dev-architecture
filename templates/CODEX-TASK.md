# Codex Task Contract: <TITLE>

## Objective

<Concrete user-visible or repository-visible outcome.>

## Baseline

- Repository:
- Branch/ref:
- Relevant commit:
- Relevant files/artifacts:
- Current behavior/evidence:

## Research-before-reinvention gate

- Applicability: `required` / `not_applicable` / `deferred`
- Independent conception snapshot:
- Underlying-problem search formulations:
- Academic/standards/tooling/adjacent-discipline scan:
- Existing-work map: solved / partially solved / composable / incompatible / unresolved / apparently novel or not found
- Disposition: `reuse` / `adapt` / `compose` / `invent` / `experiment` / `not_applicable`
- Novel remainder:
- Strongest external baseline:
- Research debt and hard trigger, if deferred:

## Constraints and invariants

- <Requirement that must remain true.>
- <Owner decision that must not be softened or silently changed.>
- <Security/data/protocol constraint.>

## Non-goals

- <Explicitly excluded work.>

## Acceptance criteria

- [ ] <Observable criterion.>
- [ ] <Observable criterion.>
- [ ] No unrelated behavior or files changed.

## Verification

- Focused test/check: `<COMMAND>`
- Affected test/check or selection mechanism: `<COMMAND / TOOL / NOT APPLICABLE>`
- Full test/check: `<COMMAND>`
- Full-suite checkpoint trigger(s): `<baseline / integration-boundary / high-risk-change / pre-commit / pre-pr / pre-handoff / release-gate / ci / owner-request>`
- Mutation testing: `<NOT APPLICABLE OR COMMAND + EXPLICIT TRIGGER>`
- Test-efficiency telemetry: `<scripts/test_efficiency.py / PROJECT-NATIVE EQUIVALENT / NOT APPLICABLE>`
- Test-efficiency task id: `<TASK-ID>`
- Lint/format: `<COMMAND OR NOT APPLICABLE>`
- Typecheck: `<COMMAND OR NOT APPLICABLE>`
- Build/package: `<COMMAND OR NOT APPLICABLE>`
- Live/manual validation: `<EXACT PROCEDURE OR NOT APPLICABLE>`
- Repository audit: `<COMMAND>`

For non-trivial software testing, start telemetry before substantive implementation. Use focused/affected tests in the inner loop, full suites at explicit checkpoints, and mutation testing only under an explicit specialist trigger. Do not repeat an unchanged green full or mutation suite without a recorded material reason. Follow `patterns/test-efficiency-and-verification-budget.md`.

## Risks and rollback

- Risk:
- Mitigation:
- Rollback/recovery path:

## Durable outputs

- Files expected to change:
- Evidence/report location:
- Current-state update required: yes/no
- Lesson-closeout required: yes/no

## Completion record

- Final commit(s):
- Commands actually run and results:
- Test-efficiency summary: task wall time; test wall time/share; scope breakdown; failure-discovering runs; full/mutation time; forced redundant-green time; redundant runs skipped/estimated time avoided
- Deviations/blockers/residual risk:
- Lesson dispositions: