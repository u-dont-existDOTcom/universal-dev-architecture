# Existing-work scan and scholarly discovery

## Problem

A project can spend substantial time refining a bespoke method, architecture, metric, taxonomy, workflow, or evaluation system when the underlying problem already has mature academic, standards, or tooling literature under unfamiliar terminology.

Ordinary web search is often poor at this stage because the project's own vocabulary may not match the field's vocabulary. The result is a false novelty signal: search returns little, so the worker assumes the problem is unexplored and keeps inventing.

## Durable rule

**Before substantial investment in a bespoke mechanism that plausibly overlaps established knowledge, perform a bounded existing-work scan using tools matched to the evidence domain.**

When academic literature is materially relevant, prefer a scholarly semantic-discovery system (for example SciSpace when available) for the first terminology/field-mapping pass, then verify important claims against primary papers, standards, or official implementations.

A specialized academic index is a discovery layer, not final authority.

## Why specialized scholarly semantic search matters

Scholarly semantic search is especially useful when the project has a valid independent conception but does not know the established terminology. It can bridge from the underlying problem to adjacent research traditions that ordinary keyword search may miss.

Typical examples:

- a homegrown "authorial flow" concept maps into writing-process research, knowledge-constituting writing, idea-generation dynamics, discourse coherence, sentence histories, keystroke logging, and process-oriented idiolect;
- a custom evaluation framework may map into measurement theory, psychometrics, benchmark design, or causal inference;
- a workflow-control mechanism may map into transaction processing, distributed systems, state machines, reliability engineering, or safety cases.

The value is **terminology discovery and literature topology**, not merely retrieving more links.

## Required sequence

### 1. Preserve the independent conception first when premature exposure would constrain it

Before searching, record a compact conception snapshot when useful:

- problem being solved;
- proposed mechanism;
- important constraints;
- candidate insight or novelty claim;
- what evidence would falsify it.

This prevents literature exposure from silently replacing the user's independent idea before comparison.

### 2. Search the underlying problem, not only the project's chosen name

Issue several semantic questions that attack the problem from different angles:

- cognitive/mechanistic framing;
- empirical measurement framing;
- implementation/tooling framing;
- adjacent-discipline analogy;
- known failure modes or confounds.

Do not conclude "no literature" because the project's coined term has few hits.

### 3. Use the strongest discovery source for each evidence class

Use, when applicable:

- scholarly semantic indexes such as SciSpace for academic discovery and terminology mapping;
- primary papers and publisher/repository copies for methodological verification;
- official standards bodies for standards;
- official documentation/source repositories for mature implementations and tools;
- ordinary web search for broader grey literature, implementation practice, and missing terminology;
- domain-specific databases where they materially improve recall.

If a specialized scholarly tool is available and the question is substantially academic, do not default to ordinary web search alone merely because it is familiar.

### 4. Classify what the scan found

For each relevant prior-work cluster, distinguish:

- **solved/reusable** — mature solution should be adopted directly;
- **partially solved/adaptable** — established component should be adapted;
- **composable** — multiple established pieces solve most of the architecture when combined;
- **incompatible** — prior method conflicts with the project's real constraints;
- **unresolved** — literature identifies the problem but does not solve the required remainder;
- **apparently novel** — no strong prior solution found after the bounded scan.

Do not collapse "related" into "already solved."

### 5. Choose build/adapt/reuse explicitly

After the scan, state which path is justified:

- reuse;
- adaptation;
- composition;
- bespoke invention;
- bounded experiment before further investment.

If invention remains warranted, benchmark it against the strongest established baseline rather than against a weak straw-man control.

### 6. Verify before promoting claims

Search-result abstracts and semantic summaries are useful for triage, but important claims about methodology, performance, limitations, or novelty must be checked against the primary paper/standard/implementation before they become project architecture or published assertions.

## When SciSpace-style discovery is particularly high-value

Use a scholarly semantic search tool early when several of these are true:

- the project is inventing or refining a nontrivial method/framework;
- the topic spans multiple academic disciplines;
- the project's terminology is homegrown;
- ordinary search is returning superficially related but conceptually weak results;
- the task is to determine novelty, reuse, or experimental baselines;
- literature structure matters more than one exact factual answer.

It is usually unnecessary overhead for simple factual lookups, ordinary software documentation, or questions already governed by one obvious standard/source.

## Tool division of labor

A good default is:

`specialized scholarly discovery -> terminology map -> primary-source verification -> project comparison -> build/adapt/reuse decision -> experiment against strongest baseline`

Do not invert this into:

`invent extensively -> search project's coined name -> find little -> declare novelty`.

## Origin evidence

Promoted on 2026-08-18 from an authorial-flow research pass in `u-dont-existDOTcom/pangram-humanization-lab`.

The project had independently developed a recurrent "authorial flow" hypothesis. A SciSpace semantic pass materially improved the scan by surfacing several differently named but directly relevant literatures in one pass, including knowledge-constituting writing, dynamic idea generation, discourse-level authorship signals, process-oriented idiolect, keystroke-process stability, and sentence-history modeling. This changed the architecture rather than merely adding citations: the project retained its recurrent-composition hypothesis, reused established discourse/process concepts, added important confound boundaries, and narrowed the genuinely novel remainder to personalized transition/process preservation under AI-assisted composition.

The transferable lesson is about **research-tool routing and novelty discipline**, not about authorial flow itself.

## Limits

- A scholarly semantic index can return duplicates, weakly related papers, or incomplete abstracts.
- Search quality does not eliminate the need to read primary sources for load-bearing claims.
- Academic literature may lag engineering practice; standards and mature implementations still require separate scanning.
- Existing work should supplement, not automatically overwrite, a preserved independent conception.
- A bounded scan is not an obligation to perform an exhaustive systematic review unless the task actually requires one.
