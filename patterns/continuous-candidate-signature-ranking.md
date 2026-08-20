# Continuous Candidate Signature Ranking

## Purpose

Rank a large set of timestamp/location candidates against a structured multi-dimensional target signature without brittle single-variable rejection rules.

## Independent conception snapshot

- Problem: raw candidates may be near-identical on coarse categorical features but differ materially at degree/coordinate level.
- Mechanism: derive latent features from each raw candidate, score every target dimension continuously, combine with declared weights, then use deterministic secondary ordering.
- Constraints: avoid hard cutoffs, preserve all dimensions, handle circular variables correctly, and expose sensitivity to under-specified target parameters.
- Candidate insight: separate the exact transformation layer from the interpretive scoring layer so computational precision is not confused with evidentiary validity.

## Existing-work scan and reuse decision

Reuse mature transformation libraries whenever the latent features have an established implementation. For astronomical birth-chart coordinates, Swiss Ephemeris is the baseline for planetary longitudes and Ascendant calculations from UT plus geographic coordinates. IANA timezone data should be used for historical local-time conversion.

Do not invent a bespoke ephemeris or timezone engine.

The semantic mapping from a behavioral description to exact astrological degrees has no standardized, empirically validated scoring rule. Therefore the scoring layer must be explicitly modeled as a template-matching convention rather than presented as a discovered scientific relationship.

Decision: **compose** established transformation tooling with a transparent fuzzy composite scorer; do not claim that the behavioral score validates the underlying interpretive theory.

## Pipeline

1. Preserve original dataset index.
2. Normalize local date/time and location.
3. Resolve each location to latitude, longitude, and IANA timezone.
4. Convert local civil time to UT using historical timezone rules.
5. Derive all requested latent variables.
6. Represent angular targets on the 0–360° circle.
7. Score each dimension continuously using circular distance or fuzzy target-band membership.
8. Apply the user-supplied dimension weights to a 0–100 composite.
9. Sort deterministically by composite, then requested secondary dimensions, then original index.
10. Run a bounded sensitivity sweep across any materially under-specified target center or width.
11. Report whether the winner is robust or parameter-sensitive.

## Continuous angular scoring

For a point target at angle `mu`, use circular distance:

`d(theta, mu) = abs(((theta - mu + 180) % 360) - 180)`

A simple non-brittle score is:

`score = 100 * exp(-0.5 * (d / sigma)^2)`

For a categorical sign target, a plateau-with-soft-tails scorer is preferable when no exact degree was specified: full membership inside the requested sign, then Gaussian decay outside the sign boundary.

For a narrow explicit band such as 12–14°, either:

- use a midpoint Gaussian with a declared width, or
- use full/near-full membership inside the interval plus Gaussian tails outside it.

Never imply that an exact center was supplied when it was inferred from wording such as “late.”

## Composite

`Composite = sum(weight_i * score_i)`

Weights must sum to 1.0. A weighted arithmetic mean is the default because it preserves partial compensation across dimensions and avoids implicit hard vetoes.

## Sensitivity audit

If wording such as “late sign” leaves the exact degree center ambiguous, vary plausible centers and widths. Record:

- winner frequency,
- top-k membership stability,
- rank swaps among near-ties,
- which under-specified parameter causes the swap.

If the winner changes under plausible calibrations, return a deterministic ranking for the declared baseline but explicitly label the top set as calibration-sensitive.

## Reproducibility requirements

Record:

- ephemeris/library version,
- timezone source,
- location coordinates,
- target centers/bands,
- score widths,
- weights,
- tie-break order,
- original dataset indices.

This keeps exact computational astronomy separate from the interpretive assumptions of the scoring model and makes later reruns comparable.
