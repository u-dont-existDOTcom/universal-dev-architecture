# Change implementation plan

**Goal:** One testable outcome.

**Baseline:** Branch/commit and authoritative files.

## Research-before-reinvention gate

- **Applicability:** `required` / `not_applicable` / `deferred`
- **Independent conception snapshot:** problem, candidate mechanism/insight, constraints, and predictions captured before outside exposure when fixation risk is material.
- **Existing-work scan:** strongest relevant academic literature, standards, mature implementations/tools, and adjacent disciplines; search the underlying problem rather than only local terminology. When academic literature is material, use the repository's scholarly-discovery specialization.
- **Existing-work map:** what is already solved, partially solved, composable, incompatible, genuinely unresolved, and merely not found/apparently novel.
- **Disposition:** `reuse` / `adapt` / `compose` / `invent` / `experiment` / `not_applicable`
- **Novel remainder:** what remains to build or test after reuse/adaptation/composition.
- **External baseline:** strongest established approach the bespoke remainder must beat or justify differing from.
- **Research debt:** if deferred, state why and the hard trigger before architecture commitment, scaling, productionization, repeated refinement, or substantial implementation.

**Acceptance criteria:**

- [ ] Exact observable result
- [ ] Exact non-regression result

**Non-goals:** State what will not change.

## Test-efficiency plan

For non-trivial software testing, follow `patterns/test-efficiency-and-verification-budget.md`.

- **Telemetry:** `scripts/test_efficiency.py` / project-native equivalent / not applicable
- **Task id:** stable identifier used for the telemetry session
- **Focused tests:** smallest behavior-specific checks used in the edit/debug loop
- **Affected-test selection:** project-native impact analysis, dependency/package selection, coverage-based selection, or explicit rationale
- **Full-suite checkpoint trigger(s):** baseline / integration-boundary / high-risk-change / pre-commit / pre-pr / pre-handoff / release-gate / ci / owner-request
- **Mutation-testing trigger:** test-quality-change / high-risk-logic / survivor-followup / explicit-owner / release-gate / not applicable
- **Redundant-green rule:** unchanged green full/mutation runs are skipped unless a material force-rerun reason is recorded
- **Completion metrics:** task wall time; test wall time/share; scope breakdown; failure-discovering runs; full/mutation time; forced redundant-green time; redundant runs skipped and estimated time avoided

## Decisions

| Date | Decision | Evidence | Consequence |
| --- | --- | --- | --- |

## Tasks

For each coherent task, name exact files, write or reproduce the failing test/invariant, implement the smallest correct change, run targeted/affected verification during the inner loop, run complete verification at the applicable checkpoint, update documentation/state, and commit a recoverable checkpoint.

Do not reflexively run the full suite after every edit. Do not launch mutation testing merely because ordinary tests are green.

## Progress

| Date | Completed | Evidence/commit | Next action or blocker |
| --- | --- | --- | --- |

## Completion

Record final commit, pull request, checks, test-efficiency summary, remaining limitations, and lesson disposition.