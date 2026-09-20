# Functional-neighborhood discovery for monitoring

## Status

Current universal pattern.

## Purpose

Prevent recurring monitors, research briefs, and watchlists from confusing a
named target with the user's actual interest.

The governing invariant is:

> A watched entity is an anchor into a function/outcome space, not a closed list
> of literal search terms.

If the user is interested in an intervention, product, compound, method, model,
vendor, standard, or other target because of what it does, monitoring must also
look for things that appear to do that job equally well, better, more safely,
more conveniently, or usefully alongside it.

## Activation

Apply this pattern to recurring or repeated monitoring in any domain where the
owner's interest has an identifiable function, outcome, use case, or problem to
solve. This includes health interventions, drugs/compounds, software, AI models,
products, markets, regulations, standards, vendors, and community practices.

Activation does **not** require a ban, shortage, recall, reformulation, or other
displacement event. Those events increase the urgency of adjacent discovery but
are only one special case.

## Required functional-neighborhood scan
On each substantive monitoring pass, search both the named target and its
decision-relevant functional neighborhood.

Use at least these directions when they can change the conclusion:

1. **Equivalent or superior alternatives** — things researchers or users report
   as comparably effective, more effective, safer, easier to stop, cheaper, more
   available, or otherwise practically preferable for the same outcome.
2. **Adjuncts and complements** — things reported to improve the target, reduce
   its adverse effects, extend its usefulness, fill a gap it leaves, or combine
   with it to solve the same underlying problem.
3. **Sibling/family candidates** — related compounds, products, methods,
   architectures, or mechanisms suggested by primary literature, patents,
   standards, source trees, or other authoritative family maps.
4. **Different-mechanism solutions** — interventions outside the target's family
   that solve the same practical problem by another route.
5. **Community innovation and migration** — newly appearing aliases, comparison
   threads, formulations, practices, combinations, unnamed products, and claims
   such as "works like", "better than", "helped more", or "easier to quit".
6. **Successors after displacement** — when regulation, supply loss, vendor exit,
   reformulation, renaming, or migration occurs, explicitly search replacements,
   successors, workarounds, "2.0" labels, and post-displacement substitutes.

The sixth direction is a subset of the general rule, not the trigger for the
first five.

## Query expansion

Do not rely on one static synonym list. Generate queries from the user's
underlying outcome and from language people naturally use when comparing options:
alternative, better than, works like, helped more, adjunct, add-on, combination,
potentiates, reduces side effects, easier to stop, replacement, successor,
analogue/analog, related compound, new formulation, and domain-specific
comparative language.
## Identity and evidence discipline

A nickname, marketing label, code name, fork name, "2.0" label, or vendor label
is not identity proof.

For each candidate preserve:
- canonical or claimed identity;
- aliases/marketing names;
- identity confidence and evidence;
- whether reports can legitimately be pooled;
- evidence class: controlled human, observational, preclinical/mechanistic,
  repeated community signal, isolated anecdote, or seller/maintainer claim;
- important adverse effects, interactions, discontinuation/rollback behavior,
  legal/regulatory status, and practical availability when relevant.

Treat seller/maintainer claims as discovery leads, not independent confirmation.
Do not convert community prevalence into efficacy proof. Preserve
conclusion-level deduplication across runs.

## Candidate admission and reporting

A candidate belongs in the monitored frontier when it could materially change
what the user should know, compare, test, monitor, avoid, discuss, or add to a
guide. It need not wait for a formal paper when multiple independent, specific
community reports converge and the evidence is clearly labeled as community
signal.

Do not report every adjacent item. Prefer candidates with decision-relevant
evidence that they are:
- as effective or more effective for the underlying outcome;
- safer, easier to discontinue, or more practical;
- a useful adjunct/complement;
- a meaningful new failure/safety alternative;
- or sufficiently promising to change what should be watched next.

## Boundedness and stop condition

This is a recall correction, not an instruction to enumerate the universe.
Stop expanding when materially plausible functional classes have been checked,
new query formulations are no longer changing the action/conclusion, and
remaining candidates are too remote, speculative, or weak to be decision-relevant.
## Anti-patterns

- Treating a named watch target as the user's whole interest.
- Searching only "news about X" when the real question is "what best solves the
  problem X was being used to solve?"
- Looking for alternatives only after X is banned or unavailable.
- Missing adjuncts because they are not substitutes.
- Searching only chemical siblings when a different mechanism may solve the same
  practical problem.
- Treating "no new paper on X" as "nothing important changed."
- Pooling products because they share a marketing nickname.
- Counting repeated posts by one person as independent replication.

## Origin evidence

Promoted on 2026-09-20 after an SR-17018 monitor failed to surface SR-15099 until
the owner named it. The first repair correctly added successor discovery after
displacement. The owner then identified the deeper failure: interest in SR-17018
is interest in the underlying withdrawal/tolerance problem, so monitoring should
continuously discover anything users or researchers find as effective, more effective, or a useful adjunct even when no ban, shortage, or substitution event
has occurred.

The transferable lesson is to preserve the owner's latent function/outcome as the
retrieval target and use named entities as high-priority anchors within that
functional neighborhood.

## Limits

- Functional adjacency increases recall; it does not increase evidentiary
  certainty.
- Do not infer that a sibling/adjunct is equivalent without evidence.
- Do not broaden into unrelated general news merely because a remote mechanism
  can be connected conceptually.
- Regulatory similarity is not proof of identical legal treatment.
- Current task-specific scope and explicit exclusions still control.
