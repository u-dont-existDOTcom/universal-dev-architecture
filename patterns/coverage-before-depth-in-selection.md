# Coverage Before Depth in Selection

## Problem

A broad comparison can look rigorous because a few selected items were audited
in great depth. That depth does not repair a narrow selection frame. Ten
near-identical cases can still omit the alternatives, failure modes, contexts,
or trajectories that would change the conclusion.

This failure appears in evidence reviews, product and vendor comparisons,
incident analyses, test suites, qualitative research, benchmark construction,
and community-source audits. It is especially dangerous when a broad umbrella
label hides materially different programs, configurations, or pathways.

## Core invariant

**Deep auditing cannot repair a narrow or redundant selection frame.**

For a broad comparison or landscape synthesis, establish coverage before
claiming that a deeply inspected subset represents the decision space. Breadth
and depth are separate gates: selection must cover the material alternatives,
and each selected item must still receive the required depth of verification.

## Activation

Use this pattern when the task asks for a broad comparison, option landscape,
real-world effectiveness synthesis, representative set of cases, alternative
pathways, or a conclusion whose ranking could change if a material class were
omitted.

It is normally unnecessary for a simple factual lookup, a deliberately narrow
analysis of one named item, or a task with no meaningful alternative space.
Current owner and project requirements determine the actual scope.

**Caller-supplied corpus-size or scope labels cannot deactivate hard structural coverage conditions.**
An authoritative task may deliberately be narrow, but an untrusted input field
such as `small`, `simple`, `few_candidates`, or `narrow_enough` cannot redefine
that task or waive coverage. When applicability depends on corpus structure,
derive applicability from the valid ledger: its unique candidate records,
material classes, normalized fingerprints, selected-set concentration,
unresolved hypotheses, and executable continuation state. If that derivation is
unavailable or contradictory, apply the invariant unconditionally and fail
closed rather than accepting the caller's label.

## 1. Build a material class inventory before deep selection

Before choosing the items that will receive expensive or exhaustive analysis,
write a **material class inventory**: the distinct alternatives, configurations,
contexts, outcome directions, and trajectories that could plausibly change the
answer.

The inventory is a discovery map, not an endorsement, credibility judgment, or
claim that every class works. It may begin deductively from current knowledge,
but discovery must be allowed to add, split, merge, or retire classes when
evidence shows that the starting taxonomy was wrong.

Do not collapse materially different classes into an umbrella label merely
because they share a familiar name. Categories such as “testing,” “automation,”
“therapy,” “migration,” “exercise,” “community evidence,” or “alternative” may
contain programs with different components, intensity, implementation,
population, context, comparator, outcome, and time horizon.

## 2. Give every candidate a decision-relevant fingerprint

A **candidate fingerprint** records the dimensions that determine whether two
items answer the same question. The domain owns those dimensions.

Examples include:

- components and co-interventions;
- version, configuration, delivery mode, or platform;
- intensity, frequency, duration, sequencing, and supervision;
- baseline state, population, environment, or failure precondition;
- comparator or nonaction state;
- outcome, direction, and time horizon;
- source independence and incentive relationship.

Missing fields remain unknown. **Missing fields remain unknown and must not be
filled from a generic class description, a nearby candidate, or the desired
comparison.** Render them as “not described,” “not reported,” or the project's
equivalent plain-language boundary.

Do not pool candidates with materially different fingerprints under a generic
label. If reports are too incomplete to establish comparability, narrow the
inference instead of assuming equivalence.

Normalize the structured fingerprint fields and derive a stable signature from
that field tuple. Caller-chosen fingerprint IDs or renamed display labels cannot
manufacture diversity: two IDs with the same material tuple remain one program.
Likewise, establish source independence from stable source identifiers tied to
retrieval receipts, not typed source names; unknown independence must remain
visible to the coverage decision.

## 3. Separate broad discovery from deep audit

**Breadth and depth are separate gates.** Use an iterative sequence:

1. Screen broadly enough to discover materially different classes and
   fingerprints.
2. Select a nonredundant subset for deep audit, prioritizing material
   differences, independent sources, specific descriptions, longitudinal
   outcomes, and benefit as well as failure, harm, discontinuation, or other
   task-relevant directions.
3. Reopen discovery when an audited item exposes a new material class,
   component, confound, or outcome trajectory.
4. Return newly material hypotheses to every evidence layer required by the
   project rather than letting one source type settle the conclusion alone.
5. Stop only when further executable expansion is unlikely to change the
   conclusion, or when a real access boundary requires a narrower result.

Selection rank is not credibility. Popularity, retrieval order, or repeated
appearance may help locate candidates but cannot substitute for independence,
fit, or evidence quality.

Numeric targets can be useful planning heuristics for screening or audit cost.
They are never proof of coverage. Reaching an item quota does not satisfy the
gate when material classes remain uncovered, and a smaller set may suffice when
the available landscape is genuinely narrow and that boundary is evidenced.

## 4. Keep an explicit coverage ledger

Before final synthesis, preserve at least:

- `classes_discovered`;
- `candidate_fingerprints`;
- `candidates_screened`;
- `selected_items`;
- `fully_audited_items`;
- `independent_source_pools`;
- `uncovered_material_classes`;
- `unresolved_material_hypotheses_from_all_batches`;
- `fingerprints_without_required_follow_up`;
- `retrieval_chain_receipts`;
- `scope_applicability_basis`;
- `further_expansion_likely_to_change_conclusion`;
- `access_boundaries`;
- `selection_coverage_lock`;
- `per_item_depth_lock`;
- `synthesis_lock`.

For every discovery batch, preserve its exact query or scope, literal access
state and pagination, covered class IDs, candidate IDs, and newly discovered
fingerprint IDs. Every candidate must reciprocally link to its discovery batch,
material class, structured fingerprint, stable source ID, and selection or
omission record. Counts must be derived from unique, internally valid linked
records rather than copied from caller totals. Invalid records must be returned
separately and excluded from every aggregate. The ledger must show why each
selected item is nonredundant, which material classes have no selected evidence,
and which omissions are caused by access rather than by a negative finding.

Classify each omission by decision impact. A supported omission that cannot
change the decision may warn only when nonrelevance follows from structured
state, such as nonmateriality or an already selected identical normalized
fingerprint. Caller assertion alone cannot waive a material class, distinct
fingerprint, required follow-up, or executable retrieval. A
confidence-changing, ranking-changing, potentially conclusion-changing, or
uncertain omission must block. This avoids
both silent undercoverage and a select-everything quota.

Represent access limits as structured records tied to the exact affected class,
candidate, source, or follow-up step, with status, materiality, likely impact,
terminality, retryability, recovery attempted, and a plain-language description.
An unmatched or self-contradictory boundary fails closed; a free-text caveat
cannot turn incomplete work into a pass. A live cursor, recommended
continuation, blocked or incomplete upstream receipt, rate limit, retryable
error, or otherwise executable work remains unfinished regardless of a caller's
terminal label. Only a terminal, nonretryable boundary after attempted recovery
may support a correspondingly bounded result.

## 5. Keep selection, item-depth, and overall locks separate

Set `selection_coverage_lock` to `fail` when any applicable condition remains
true:

- a material class remains unsearched;
- a decision-relevant hypothesis from any discovery batch remains unresolved;
- materially distinct available candidates remain unaudited and could change
  the comparison or ranking;
- the selected set remains concentrated in redundant fingerprints despite a
  broader available pool;
- required outcome directions were not deliberately sought;
- a material fingerprint has not received the cross-source or formal follow-up
  required by the project; class-level follow-up cannot close a distinct
  fingerprint;
- the ledger is missing, internally inconsistent, or unsupported by exact
  candidate records.

Set `per_item_depth_lock` to `fail` when any selected item has not reached the
project's required verification or terminal bounded state. Preserve literal
upstream receipt values and compute completion from deterministic projections
of the actual source receipt shapes. The production callable surface must emit
those projections; an internal helper or caller-declared “complete” summary is
not executable evidence. Preserve material source identity,
cursor or page-chain provenance, counts, content-track identity, and mismatch or
continuation state required by the project.

Continuation must use either an authenticated opaque continuation cursor that
binds the source, query, chain identity, position, expiry, and prior state, or
server-held continuation state referenced by an unguessable handle. An unsigned
or caller-editable cursor, offset, or page number is navigation input, not proof
that earlier pages were retrieved. Reject a skipped page, forged offset,
mismatched query or source, expired chain, and replay that conflicts with the
stored state.

Completion requires proof that the chain started at the first page, followed
contiguous page or offset progression, reconciled unique records and provider
counts, and reached a genuine terminal response. Even a lone continued page cannot
prove complete chain coverage. Emit truthful cumulative receipts that distinguish
records retrieved in this step from records retrieved across the validated
chain, bind them to one chain identity, and preserve mismatch and duplicate
reconciliation. If a chain must restart, treat the prior chain as incomplete;
never combine old and restarted chain counts.

Set the overall `synthesis_lock` to `fail` whenever either component lock fails
or a material reconciled boundary prevents the claimed scope. This separation
allows selection breadth to be tested before expensive deep audit and prevents
deep completion from laundering a narrow selection frame.

Do not emit a broad comparison, ranking, or decision synthesis while
`synthesis_lock` is `fail`. Continue the executable work. If work cannot
continue because of a real access or authority boundary, return a bounded
answer that names the uncovered area and narrows the conclusion; do not turn an
unavailable class into negative evidence.

A `pass` means only that the declared coverage criteria were satisfied within
the recorded boundary and that the supplied ledger is internally consistent.
It does not prove semantic completeness or representativeness, and it does not
certify the truth, credibility, quality, safety, or causal force of the selected
evidence.

## 6. Project the rule into an executable control

For repeated, high-consequence, or decision-critical synthesis, prose alone is
not enough. The project should make the coverage ledger machine-readable and
have the controller or tool compute the synthesis lock from its state.
Downstream synthesis must require a passing lock instead of accepting a model's
unsupported statement that coverage is sufficient.

The executable projection should:

- reject a passing lock when uncovered material classes remain;
- detect redundant fingerprints rather than count only raw items;
- represent each fingerprint through structured domain fields and derive its
  missing-field state instead of trusting a completeness boolean;
- derive stable program signatures and source independence rather than trust
  caller IDs or display names;
- require reciprocally linked discovery-batch, class, candidate, fingerprint,
  source, selection, and omission records rather than aggregate screen counts;
- derive coverage counters from unique valid records and reject contradictory
  states such as “no candidate” with a positive candidate count;
- derive coverage applicability from valid ledger structure rather than trust a
  caller-supplied corpus-size, scope, simplicity, or exemption label; when it
  cannot be derived, apply the structural invariant unconditionally;
- require provenance for selected candidates and coverage decisions;
- preserve explicit unknown, inaccessible, partial, and deferred states;
- reconcile every material access boundary to the exact affected record and
  continue retryable work or narrow the result only when that boundary is
  terminal, nonretryable, and recovery was attempted;
- classify omission impact so decision-relevant or uncertain omissions block
  while only structurally supported nondecision omissions can warn;
- emit deterministic source-receipt projections from the callable production
  boundary instead of asking the caller to hand-flatten proof of completion;
- keep continuation state authenticated or server-held, validate chain
  membership and contiguous progression, and emit truthful cumulative chain
  receipts before any complete status can pass;
- exclude invalid records from every aggregate and return them separately;
- bound accepted input and emitted output together so a maximum-sized accepted
  request has a tested transportable result, or provide resumable output;
- keep new material fingerprints from every discovery batch unresolved until
  their required selection or supported omission and follow-up are complete;
- return separate selection, item-depth, and overall locks;
- test each failure cause in isolation plus a bounded positive control, so a
  regression cannot pass merely because another blocker happened to fire.

If the executable controller is available only on some product surfaces, make
that capability difference explicit. Surfaces that advertise it must call it;
other surfaces must compute the same ledger locally, record the missing
capability, and fail closed on unsupported state rather than invoke an
undeclared tool or silently waive the gate.

Instructions still matter: they define the domain-specific inventory,
fingerprint, required evidence directions, and reader-facing boundary. The tool
enforces the repeatable state transition; it does not decide substantive truth.

## Regression cases

### Many audited items, one material class

Many items have been deeply audited, but most share substantially the same
fingerprint while discoverable alternatives remain uncovered. Fail the lock.
Raw item count cannot establish landscape coverage.

### Two items presented as a broad audit

Two sources are completely retrieved and analyzed, but the task is broad and
additional nonredundant classes and independent pools remain readily
discoverable. Fail the lock and continue discovery.

### Quota reached with uncovered classes

A planning target for screened or audited items has been met, but at least one
material class remains unsearched. Fail the lock. A heuristic is not a coverage
criterion.

### Small-corpus label contradicts the ledger

A caller labels the corpus small or exempt while the valid linked ledger contains
twenty or more valid candidates across material classes or fingerprints. Ignore
the label, derive applicability from the ledger, and enforce every structural
coverage condition.

### Concentrated selection labeled narrow enough

A caller labels a concentrated selected set narrow enough even though the
authoritative task is broad and the ledger contains additional material classes
or distinct fingerprints. The label cannot deactivate coverage; fail the lock
and continue nonredundant selection.

### Unresolved fingerprint from an earlier batch

An earlier discovery batch produced a decision-relevant fingerprint that the
latest batch did not repeat. Keep it in the unresolved set, reopen the required
searches or evidence layers, and fail the lock until it is explicitly closed.

### Renamed fingerprints presented as diversity

Several selected items use different caller-assigned fingerprint IDs and source
names, but their normalized program fields are identical and their receipts
resolve to one stable source. Count one program and one independent source, fail
coverage, and continue nonredundant discovery.

### Aggregate count without a candidate ledger

A caller reports that many candidates were screened but supplies records for
only one class and one selected item. Reject the unsupported count. Derive the
screen total only from reciprocally linked batch and candidate records.

### Retryable boundary presented as completion

A selected source is rate-limited, partial, or failed with a retryable error.
Keep the depth and overall locks failed and continue recovery; a retryable state
cannot authorize terminal bounded synthesis.

### Four sources repeat one fingerprint

Four independently identified sources are fully audited, but all share one
normalized fingerprint in a broader available landscape. Fail selection
coverage. Source independence cannot manufacture option diversity.

### Unsupported nondecision waiver

A caller labels a material class, distinct fingerprint, required follow-up, or
live retrieval as not decision-relevant without structured support. Reject the
waiver and keep the lock failed.

### Live cursor labeled terminal

An upstream receipt has a live cursor, recommended continuation, blocked state,
or retryable error while a caller-supplied boundary says terminal. Preserve the
upstream executable state and continue; the boundary cannot override it.

### Skipped pages or forged offset

A caller edits an unsigned cursor or offset to skip a page, jump forward, or
claim a later cumulative position. Reject the continuation because no authenticated
or server-held chain state proves contiguous coverage. Keep the item-depth
and overall locks failed and restart the exact chain when recovery permits.

### Lone continued page presented as complete

A continued page returns no next token, but no validated receipt proves that the
chain began at the first page or that intermediate pages were contiguous. Treat
the page as partial. Terminal state on one page cannot substitute for truthful
cumulative chain receipts.

### Class follow-up hides a fingerprint gap

An umbrella class has a completed return pass, but a materially distinct
fingerprint inside it has not. Fail selection coverage until that fingerprint's
required cross-source follow-up is resolved.

### Receipt helper absent from production

A deterministic projection exists in source code but the callable production
surface does not emit it. Treat the receipt as unavailable; internal capability
is not executable evidence for downstream synthesis.

### Maximum accepted request exceeds output transport

A schema-valid maximum-sized request produces a response larger than the
declared transport cap. Fail the controller contract. Tighten the accepted
schema, compact the output, or add resumable output and test the exact boundary.

### Genuine access boundary

A material class or source pool cannot be accessed after the required bounded
attempts. Preserve the boundary and permit only a correspondingly bounded
answer. Do not report the unseen direction as absent, favorable, or
unfavorable.

### Diverse bounded selection

The material class inventory is searched, the selected set spans nonredundant
fingerprints and independent pools, required directions and follow-up are
complete, no discovery batch leaves a material hypothesis unresolved, and
remaining limits are explicit. The lock may pass, but the evidence still
requires ordinary
quality and inference review.

## Existing-work composition

This pattern composes established controls rather than claiming a new sampling
science:

- the Cochrane Handbook's guidance on planning clinically meaningful
  intervention groups, components, delivery, dose, duration, context, and
  insufficiently described interventions;
- PRISMA-ScR's separation of evidence mapping, source selection, data charting,
  source characteristics, and synthesis;
- maximal marginal relevance as an information-retrieval precedent for
  balancing relevance with novelty rather than returning a redundant set;
- theoretical sampling as a precedent for expanding collection when a
  conceptual gap emerges;
- NIST combinatorial coverage as a testing precedent for evaluating a set by
  covered characteristics rather than raw test count.

See:

- <https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-03>
- <https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-17>
- <https://www.prisma-statement.org/scoping>
- <https://aclanthology.org/X98-1025/>
- <https://onlinelibrary.wiley.com/doi/10.1111/j.1475-6773.2006.00684.x>
- <https://csrc.nist.gov/pubs/journal/2016/12/measuring-specifying-combinatorial-coverage-test-i/final>

The project-specific origin and exact promotion status are recorded in
`audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`.

## Limits

- No finite inventory proves that every possible class was discovered.
- A purposive diverse selection is not a probability sample and cannot support
  population prevalence estimates by itself.
- Diversity is not credibility. Weak evidence does not become strong merely
  because it is nonredundant.
- Excessive splitting can make synthesis unusable. Fingerprints should preserve
  differences that could change the decision, not every incidental variation.
- Exact fields, thresholds, outcome directions, and terminal boundaries remain
  domain- and project-specific.
- A tool-level lock enforces declared state; it cannot guarantee that the
  original inventory or fingerprint dimensions were substantively correct.
