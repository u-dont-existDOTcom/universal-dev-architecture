# Claim-scope preservation

## Problem

A source can respond to only part of a compound claim. Summaries become inaccurate when they widen that local response into a broader acceptance or rejection than the source actually expressed.

This is a general reasoning error, not a domain-specific one. It can occur in research, policy, debugging, requirements, incident review, journalism, legal analysis, product work, and ordinary conversation.

## Core invariant

Preserve the exact scope of what a source **accepts, rejects, qualifies, reframes, or leaves unresolved**.

Do not infer a stance on proposition B merely because the source took a stance on related proposition A.

## Proposition decomposition

When the distinction could affect the conclusion, decompose a compound claim into materially distinct propositions, for example:

- whether an event, conduct, state, or observation occurred;
- its scope, frequency, magnitude, or timing;
- the proposed cause, mechanism, intent, or motive;
- a characterization or label applied to it;
- consequences or responsibility attributed to it.

Track the source's stance on each relevant proposition separately.

## Hard rules

1. Rejecting a characterization does not by itself reject the underlying factual predicate.
2. Defending, normalizing, or justifying a practice does not by itself admit every factual detail alleged about that practice.
3. Silence is neither admission nor denial.
4. A denial of one proposition must not be widened to adjacent propositions.
5. A qualification must not be paraphrased as a categorical acceptance or rejection.
6. A paraphrase must be no stronger, broader, or more categorical than the source language supports.
7. When several layers are materially different, report them separately instead of compressing them into umbrella language such as `denied the allegation` or `admitted it`.

## Pre-delivery check

Before delivering a load-bearing paraphrase of a disputed or compound claim, ask:

**What exact proposition did the source accept, reject, qualify, reframe, or leave unresolved?**

Then compare that answer with the sentence being written. If the sentence covers more than the supported proposition, narrow it.

## Relationship to provenance

This rule complements `source-interpretation-provenance.md`. Provenance asks whether a statement really came from the cited source; claim-scope preservation asks whether the summary kept the same logical extent and polarity as the source.

A summary can cite the correct source and still be wrong by widening the source's stance.

## Correction procedure

When a scope error is identified:

1. recover the exact source wording or the strongest available faithful paraphrase;
2. decompose the compound claim into the propositions that matter;
3. mark the source's stance on each proposition separately;
4. identify which proposition was widened, collapsed, or mislabeled;
5. correct dependent summaries and conclusions that relied on the widened claim;
6. preserve the transferable rule without encoding the triggering topic as a special case.

## Limits

- Absence of a denial is not evidence of admission.
- Absence of an admission is not evidence of denial.
- Decomposition is required only where collapsing propositions could change the meaning or conclusion.
- This rule preserves source meaning; it does not decide whether the source is truthful or correct.