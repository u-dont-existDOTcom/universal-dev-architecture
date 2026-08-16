# External evaluation reproducibility

## Problem

A stored label such as `passed`, `Human/high`, `safe`, `valid`, `approved`, or `benchmark-green` can look like a reusable control long after the conditions that produced it have been lost.

If the original record does not preserve the exact evaluated input plus the evaluator's identity/version/configuration and boundary, a later worker cannot know whether a changed result comes from the new edit, evaluator drift, normalization, different boundaries, different rendering, or some other historical condition.

## Durable rule

**Historical evaluation labels are evidence history, not current certification, unless the control itself reproduces under the current evaluation path.**

Before using an old green result as the causal control for a new change:

1. recover the exact intended evaluated boundary;
2. preserve or compute the exact input hash;
3. identify the evaluator/model/version and relevant configuration;
4. preserve normalization/rendering rules where they affect the evaluated surface;
5. rerun the unchanged control through the current path;
6. only attribute a regression to the new change if the unchanged control still reproduces.

If the control itself no longer reproduces, stop causal attribution. Record the non-reproduction, establish a new current baseline if the evaluation remains useful, and return to domain/owner authority rather than rewriting material merely to reconcile stale evaluation history.

## Minimum durable evidence

For an evaluation intended to be reused later, preserve at least:

- exact input or immutable input reference;
- cryptographic input hash;
- evaluated boundary/surface, including reader-visible or rendered normalization when applicable;
- evaluator/tool/model name and version;
- relevant configuration or mode;
- date/time;
- result identity and raw/structured result;
- repeat status or known nondeterminism;
- provenance/authority of the evaluated artifact.

A summary label without these fields may still be useful historical context, but it must not silently become a regression test.

## Non-reproduction procedure

When a historical control changes result:

1. **Do not infer that the newest edit caused the change.** The control falsifies that attribution.
2. **Do not invent a token/phrase rule** from the new result.
3. Compare exact bytes/boundaries/configuration if the historical evidence allows it.
4. If the missing historical provenance prevents explanation, say so explicitly.
5. Preserve both outcomes rather than overwriting the old record.
6. Establish a current reproducible baseline only if continued evaluation serves the actual goal.
7. Keep substantive quality, semantics, safety, or owner authority above a classifier whose historical state cannot be reconstructed.

## Origin evidence

Promoted from `u-dont-existDOTcom/pangram-humanization-lab`, Romance Talk detector incident, 2026-08-15.

A Talk passage previously recorded in the project corpus as `HUMAN/HIGH` was rerun under the current Pangram 4.0 Actions path and measured 100% AI at High confidence. The current result is preserved as:

- experiment: `romance-talk-old-green-control-2026-08-15`;
- result source ref: `d5719a5e17a3c96d081a74b66ced7f6fa03a9968`;
- result-file SHA-256: `a61ddff02a708b3ea133f11d09c246d8a68fb364087f37ea3256905cb688968b`;
- evaluated-text SHA-256: `d2bb7df0beae08abf9debfdf32c4268bdeb9b988723c9cb2dd5b685596bedcb0`;
- current detector/version: Pangram 4.0;
- current result: 100% AI, High confidence.

The historical `HUMAN/HIGH` record did **not** preserve enough exact detector/version/boundary metadata to determine why the verdict differs. Therefore the promoted lesson is about provenance and reproducibility, not a claim that Pangram itself definitely drifted.

The same audit also provided a useful localization counterexample: a separately windowed owner making-love definition remained High-confidence Human while the surrounding Talk boundary was AI-labeled. That reinforced the need to preserve complete boundaries and avoid lexical causal stories.

## Generalization

This pattern applies beyond AI-text detectors to:

- model benchmarks and eval suites;
- security/static-analysis findings;
- lint/format/build outputs;
- moderation classifiers;
- quality gates and scoring services;
- scientific/ML experiment metrics;
- external APIs whose versions or normalization behavior can change.

Whenever an old result is used to argue that a new change caused a regression, **first prove that the old control still behaves like the old control.**

## Limits

- Reproducibility does not make an evaluator authoritative; it only makes comparisons interpretable.
- A reproduced green result does not prove the artifact is correct, safe, natural, or high quality.
- A failed reproduction does not prove evaluator drift; it only invalidates unsupported causal attribution until the discrepancy is explained.
- Some services are nondeterministic. In that case preserve repeat distributions and uncertainty rather than demanding identical single-run labels.
