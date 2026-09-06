# Structured-Output Failure Boundary

**Status:** Required universal supervision rule
**Date:** 2026-09-03
**Authority:** Owner-approved supervision-design verdict following repeated malformed structured evaluator output

## Purpose

Supervised work must distinguish a structured-output serialization/interface
failure from a semantic, scientific, alignment, or hypothesis failure. A model
can complete substantive reasoning while still failing to produce an artifact
that crosses a strict parser and validator boundary.

The canonical failure class is:

```text
STRUCTURED_OUTPUT_SYNTAX_FAILURE
```

This classification means the required structured artifact was not validly
admitted. It does not mean the underlying reasoning, scientific hypothesis,
worker alignment, or controlling methodology failed.

## Required failure evidence

Every structured-output failure record preserves, directly or through an
immutable private reference:

- the raw output;
- the exact parser error and parser position, including line and column when
  available;
- the exact input or sealed-packet hash;
- the visible or otherwise source-authorized model and mode identity;
- the attempt number and source-fixed maximum-attempt ceiling;
- the strict validator result and validator identity/version;
- the controlling source-bound directive identity and digest;
- a normalized parser fingerprint suitable for comparison with other attempts.

Sensitive raw output may remain private, but its immutable reference and hash
must be retained. A summary is not a substitute for the raw failure artifact.

The canonical machine-readable form is
`templates/STRUCTURED-OUTPUT-FAILURE.json`.

## Source-fixed attempt ceiling

The controlling directive's maximum-attempt ceiling is absolute. When the
ceiling is exhausted, the current execution path is blocked. Without a **NEW
source-bound directive**, the worker, parser, validator, or supervisor must not:

- make a third or otherwise additional attempt;
- change the model or mode;
- change the prompt, input packet, or transport;
- perform deterministic repair, JSON cleanup, or semantic correction;
- use an alternate or relaxed parser;
- substitute another evaluator or artifact.

No source-fixed attempt budget may be silently expanded. A later recovery
instruction is valid only when it has new source identity and an exact body
digest under the normal supervision authority rules.

## Repeated fingerprint handling

Repeated identical or materially similar parser fingerprints against the same
input hash must be surfaced as a likely systematic serialization failure. An
identical parser locus, such as the same line and column, is strong evidence for
that classification.

Identical fingerprints may trigger early escalation before the remaining
authorized attempt budget is exhausted. Early escalation is informational and
fail-safe: it does **not** cancel, consume, or revoke attempts already
authorized by the controlling directive. Only the source authority may change
that attempt budget.

## No silent repair

Malformed structured output remains malformed. Deterministic repair is
forbidden unless the controlling source-bound directive explicitly authorizes
one specific repair transform and defines the validation boundary for the
transformed artifact. General permission to validate, retry, or continue is not
permission to repair.

An unauthorized cleanup cannot become an admitted evaluator artifact, even if
the cleanup appears obvious or preserves the worker's inferred meaning.

## Downstream admission block

Until a valid structured artifact is admitted or a new source-bound directive
changes the requirement, the system blocks all dependent:

- comparison and scoring;
- metrics and aggregation;
- unblinding;
- substitution;
- release or scientific conclusions that require the missing artifact.

Independent work that does not depend on the missing artifact may continue
only when ordinary scope and authority controls already permit it.

## Precise blocked-state meaning

The canonical blocked state means:

```text
execution path exhausted under current directive;
valid structured evaluator artifact unavailable
```

It must not be projected as scientific-hypothesis failure, semantic failure,
worker misalignment, or evaluator inadequacy. Scientific adequacy remains
unavailable unless and until a valid artifact is admitted and assessed.

## Required invariants

1. Serialization/interface failure and semantic/scientific failure are
   separate machine states.
2. Raw evidence and exact parser/validator provenance survive escalation.
3. The source-fixed maximum-attempt ceiling cannot be exceeded locally.
4. Repeated fingerprints are surfaced as likely systematic serialization
   failure without autonomously cancelling authorized attempts.
5. No repair transform is implied or silently applied.
6. Dependent scoring, aggregation, unblinding, substitution, and conclusions
   remain blocked until admission or new source authority.
7. Blocked execution does not rewrite alignment or scientific truth.

## Transfer limits

This is a universal execution-interface and supervision-authority rule. It does
not alter any project's scientific methodology, evaluator design, prompt,
schema, retry budget, or substantive recovery choice. Those changes remain
with the controlling source authority.
