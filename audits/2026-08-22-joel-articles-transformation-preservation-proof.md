# Joel Articles transformation-preservation proof promotion

Date: 2026-08-22
Status: candidate universal promotion

## Originating problem

Origin repository: `u-dont-existDOTcom/joel-articles`.

Repeated Romance humanization/detector repairs were catching semantic and provenance losses only after a candidate had already been generated and sometimes after paid detector work. The latest incident corrected a false attribution to Joel's father but simultaneously removed a distinct owner-required readiness/co-parenting question and its early-sex/red-flag function. Post-draft review caught the loss; the workflow did not prevent it.

The transferable failure class is broader than article editing: a source→target transformation can satisfy its local optimization objective while silently changing something outside the authorized scope.

## Independent conception

Before the prior-art scan, the origin task froze an independent conception in:

`docs/HUMANIZATION-PRESERVATION-GATE-DESIGN-2026-08-22.md`

Origin branch:

`task/humanization-preservation-gate-20260822`

The conception proposed:

- freeze source authority;
- enumerate independently losable preservation obligations before transformation;
- freeze an authorized-change whitelist;
- transform only inside that delta;
- trace every source obligation forward to the target;
- trace every substantive target delta backward to authority;
- require zero unexplained deltas before downstream detector acceptance;
- repeat after every subsequent substantive transformation.

## Existing-work scan

The bounded scan searched the underlying problem rather than the proposed local term.

### Requirements engineering / configuration control

NASA requirements-management and software-engineering guidance uses controlled baselines, bidirectional traceability, impact analysis, and orphan/extra-element detection. ISO/IEC/IEEE 29148 provides the broader requirements-engineering standards family.

Reusable lesson: trace both `requirement → realization` and `realization → requirement/authority`; changes to a baseline require impact analysis and explicit authorization.

### Translation validation

Pnueli, Siegel, Singerman, Shtrichman and later compiler-validation work established translation validation: validate each individual source→target translation rather than relying only on a proof or belief that the translator is correct in general.

Reusable lesson: correctness belongs to the exact produced transformation; transformer instructions or historical reliability are not sufficient evidence.

### Mutation and metamorphic testing

Mutation testing injects artificial faults to evaluate test-suite/validator adequacy. Metamorphic testing supplies necessary input-output relations when no simple oracle exists.

Reusable lesson: deliberately inject representative preservation failures to test the preservation validator, and use domain-specific invariants when exact equivalence is difficult.

### Text style-transfer evaluation

Style-transfer research treats style success, content preservation, and naturalness as separate dimensions and repeatedly finds that automatic content-preservation metrics can be misleading.

Reusable lesson: downstream style/detector success cannot stand in for preservation, and one similarity metric should not become semantic authority.

## Decision

**COMPOSE + ADAPT.**

Already solved/reusable:

- source baselines and bidirectional traceability;
- authorized change control and impact analysis;
- per-transformation validation;
- mutation testing of the validator;
- multi-axis evaluation.

Project-specific adaptation:

- editorial preservation-unit ledgers;
- provenance distinctions such as quotation vs later interpretation;
- Pangram as a downstream detector gate.

Transferable novel remainder:

- one compact cross-domain pattern that applies these established controls to generative/optimizing source→target transformations and makes `zero unexplained substantive deltas` the downstream-eligibility condition.

This is not claimed as a novel formal method or semantic-equivalence metric.

## External baseline

Current weak baseline:

`transform → post-hoc audit → downstream evaluation → catch losses later`

Strong composed baseline:

`freeze source → enumerate obligations + authorized delta → transform → bidirectional per-transformation validation → dependency/quality gates → downstream evaluation`

The promoted pattern adopts the stronger baseline.

## Universal candidate

- `patterns/transformation-preservation-proof.md`
- indexed from `LESSON-INDEX.md`

Project-local implementation remains in Joel Articles:

- `docs/HUMANIZATION-PRESERVATION-GATE.md`
- `docs/HUMANIZATION-PRESERVATION-TOOLING.md`
- `scripts/validate_preservation_proof.py`
- `tests/test_validate_preservation_proof.py`

Joel-specific article text, owner corrections, detector thresholds, and Pangram evidence are intentionally not copied here.

## Limits

- Explicit traceability does not guarantee the initial preservation-unit inventory was semantically complete.
- Natural-language equivalence remains partly judgment-based.
- Structural validators can enforce completed mappings and zero unexplained recorded deltas, but cannot automatically prove every mapping is truthful.
- Excessive decomposition creates bureaucracy; scope to independently losable obligations and material dependencies.
- Some transformations intentionally change semantics; the change whitelist must say so rather than presenting them as lossless.

## Promotion disposition

`promoted-candidate` pending branch review/merge.
