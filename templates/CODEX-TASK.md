# Codex Task Contract: <TITLE>

## Owner-outcome invariant

Do not begin from this task contract alone. Recover and preserve the originating owner request and material later corrections.

- Owner-request ID:
- Canonical locator or immutable source block:
- Source capture time:
- Owner-source SHA-256:
- Independent owner-source receipt ID/status:
- Owner-outcome ID:
- Outcome epoch / revision:
- Verbatim owner request:
- Normalized final result:
- Owner-outcome SHA-256:
- Append-only owner correction IDs:

### Required owner outcomes

- `RO-001` — <Required final result/property, modality, threshold, and required evidence.>
- `RO-002` — <Required final result/property, modality, threshold, and required evidence.>

### Known non-satisfying proxies

- <Supporting gate/state that does not itself prove the final result.>
- <Examples: tests green, review ready, supervisor approved, source-integrity PASS.>

### Current gap

- Current evidence/state:
- Unmet required outcomes:
- Unknown required outcomes:

If the original owner request is unavailable or materially ambiguous, record `OUTCOME_AUTHORITY_UNRESOLVED`. Continue only clearly useful reversible contributing work; do not declare root completion.

A downstream task contract may refine or decompose this outcome but may not omit, weaken, replace, or terminally bypass it without an explicit owner decision. Follow:

- `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`
- `patterns/supervision-assurance-planes-and-pro-meta-review.md`

## Objective-reconciliation matrix

Machine-readable record: `<PATH TO OBJECTIVE-RECONCILIATION.json OR EQUIVALENT>`

| Owner requirement | Worker interpretation | Task criterion | Acceptance evidence | Status | Authorized change |
|---|---|---|---|---|---|
| `RO-001` |  | `AC-001` |  | `UNMAPPED` |  |

Allowed statuses:

- `MAPPED_DIRECT`
- `MAPPED_CONTRIBUTING`
- `MAPPED_VERIFYING`
- `UNMAPPED`
- `WEAKENED`
- `PROXY_SUBSTITUTED`
- `OWNER_REMOVED`
- `OWNER_AMENDED`
- `AMBIGUOUS`

Every material owner requirement must be mapped, explicitly changed by the owner, or escalated.

## Independent alignment states

- Worker-to-contract alignment: `GREEN` / `YELLOW` / `RED` / `UNKNOWN`
- Contract-to-owner alignment: `MATCH` / `PARTIAL` / `DIVERGED` / `SOURCE_MISSING`
- Overall task traffic:
- Alignment evidence/reference:

A GREEN worker-to-contract state cannot make the root task GREEN when contract-to-owner is `DIVERGED`, `SOURCE_MISSING`, or materially `PARTIAL`.

## Derived task objective

<Concrete contribution to the owner outcome. Do not restate an intermediate proxy as the final owner result.>

### Derivation / outcome-coverage proof

- Parent owner-outcome ID/epoch/hash:
- Contribution type: `decompose` / `refine` / `implement` / `verify` / `support`
- Root task or subtask:

| Required owner outcome | Task criterion(s) | Relation: directly satisfies / contributes / verifies / not addressed | Parent remains open? | Owner authorization if deferred |
|---|---|---|---|---|
| `RO-001` | `AC-001` |  |  |  |

The task contract is invalid if a terminal-required owner outcome is omitted, weakened, replaced by a proxy, or left without an open parent owner.

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

- `AC-001` [ ] <Observable criterion linked to a required owner outcome or explicitly labeled supporting work.>
- `AC-002` [ ] <Observable criterion.>
- [ ] No unrelated behavior or files changed.

Passing every derived acceptance criterion does not close the root task unless the owner-outcome comparator also reports `OWNER_OUTCOME_SATISFIED`.

## Reconciliation triggers

Re-run objective reconciliation after:

- material discoveries;
- phase transitions;
- acceptance-criteria or acceptance-test changes;
- owner corrections;
- owner-review readiness;
- release/deployment/publication preparation;
- any root completion proposal;
- supervision-design changes affecting task semantics.

## Verification

- Focused test/check: `<COMMAND>`
- Affected test/check or selection mechanism: `<COMMAND / TOOL / NOT APPLICABLE>`
- Full test/check: `<COMMAND>`
- Full-suite checkpoint trigger(s): `<baseline / integration-boundary / high-risk-change / pre-commit / pre-pr / pre-handoff / release-gate / ci / owner-request>`
- Mutation testing: `<NOT APPLICABLE OR COMMAND + EXPLICIT TRIGGER>`
- Test-efficiency telemetry: `<scripts/test_efficiency.py / PROJECT-NATIVE EQUIVALENT / NOT APPLICABLE>`
- Test-efficiency observer acquisition if absent: `<VENDOR CURRENT CANONICAL OBSERVER / RUN CANONICAL OBSERVER WITH --root <PROJECT> / VERIFIED PROJECT-NATIVE EQUIVALENT>`
- Test-efficiency task id: `<TASK-ID>`
- Lint/format: `<COMMAND OR NOT APPLICABLE>`
- Typecheck: `<COMMAND OR NOT APPLICABLE>`
- Build/package: `<COMMAND OR NOT APPLICABLE>`
- Live/manual validation: `<EXACT PROCEDURE OR NOT APPLICABLE>`
- Owner-outcome evidence: `<EXACT OUTCOME-SPECIFIC EVIDENCE, TARGET, AND CANDIDATE/HASH BINDING>`
- Repository audit: `<COMMAND>`

For non-trivial software testing, start telemetry before substantive implementation. Use focused/affected tests in the inner loop, full suites at explicit checkpoints, and mutation testing only under an explicit specialist trigger. Do not repeat an unchanged green full or mutation suite without a recorded material reason. If the project lacks the observer, vendor/run the current canonical observer or use a verified equivalent; a missing local observer is not a valid reason to mark telemetry not applicable. Follow `patterns/test-efficiency-and-verification-budget.md`.

## Research/AskRigor assurance planes

Complete when applicable; otherwise state `NOT_APPLICABLE`.

- Operational alignment: `PASS` / `WARN` / `FAIL` / `UNKNOWN` / `NOT_APPLICABLE`
- Scientific adequacy: `PASS` / `WARN` / `FAIL` / `UNKNOWN` / `NOT_APPLICABLE`
- Release adequacy: `PASS` / `WARN` / `FAIL` / `UNKNOWN` / `NOT_APPLICABLE`
- Research verdict record: `<PATH TO RESEARCH-SUPERVISION-VERDICT.json OR EQUIVALENT>`

Scientific support does not imply privacy, licensing, consent, freshness, provenance, security, product, or publication adequacy.

## Supervision-design feedback

- Substantive supervision-design improvement/question found: yes/no
- Feedback ID(s):
- Blocks current boundary: yes/no
- Shared Pro meta-review scope: `supervision-architecture/<epoch>`
- Pro meta-review status:
- Resulting repository/test references:

Do not silently change universal supervision rules. Use `templates/SUPERVISION-DESIGN-FEEDBACK.json` and route substantive improvements/questions to the shared Pro meta-review chat. Continue unaffected work automatically.

## Risks and rollback

- Risk:
- Mitigation:
- Rollback/recovery path:

## Durable outputs

- Files expected to change:
- Evidence/report location:
- Current-state update required: yes/no
- Lesson-closeout required: yes/no

## Proposed workflow / terminal state

- Completion claim type:
  - `WORKING`
  - `ARTIFACT_READY`
  - `TESTS_PASS`
  - `READY_FOR_OWNER_REVIEW`
  - `READY_FOR_RELEASE`
  - `PARTIAL_OUTCOME`
  - `SUBTASK_COMPLETE_PARENT_OPEN`
  - `OWNER_OUTCOME_ACHIEVED`
  - `BLOCKED_OWNER_DECISION`
  - `CANCELED_BY_OWNER`
- Proposed state:
- Root task / subtask:
- Parent owner outcome remains open: yes/no
- Exact candidate/commit/hash:
- Required owner outcomes: `MET` / `UNMET` / `UNKNOWN` with evidence references
- Current gap:
- Non-satisfying proxies present:
- Worker-to-contract alignment:
- Contract-to-owner alignment:
- Terminal comparator result:
  - `OWNER_OUTCOME_SATISFIED`
  - `SUBTASK_COMPLETE_PARENT_OPEN`
  - `EARLY_OWNER_EVALUATION_PARENT_OPEN`
  - `CONTRACT_LAUNDERING`
  - `OUTCOME_AUTHORITY_UNRESOLVED`
  - `COMPLETION_EVIDENCE_INSUFFICIENT`

`READY_FOR_OWNER_REVIEW`, `HANDOFF_READY`, tests green, supervisor approval, and similar states are nonterminal by default for the root owner outcome.

## Completion record

- Final commit(s):
- Commands actually run and results:
- Independent owner-source receipt verified:
- Owner-outcome epoch/hash verified:
- Objective-reconciliation record:
- Worker-to-contract final state:
- Contract-to-owner final state:
- Completion claim type:
- Exact candidate/hash bound to outcome evidence:
- Required owner outcomes and final statuses:
- Terminal comparator result:
- Operational/scientific/release verdicts if applicable:
- Supervision-design feedback and Pro meta-review status if applicable:
- Remaining parent outcome, if this is only a subtask:
- Test-efficiency summary: task wall time; test wall time/share; scope breakdown; failure-discovering runs; full/mutation time; forced redundant-green time; redundant runs skipped/estimated time avoided
- Deviations/blockers/residual risk:
- Lesson dispositions:
