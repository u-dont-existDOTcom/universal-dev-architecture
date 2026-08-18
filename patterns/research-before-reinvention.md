# Research before reinvention

## Purpose

Prevent avoidable reinvention of established methods, frameworks, architectures, metrics, algorithms, taxonomies, protocols, evaluation systems, and workflows without suppressing independent invention.

The governing invariant is:

> Think enough to preserve the independent conception; research before substantial commitment; then build only the remainder that still needs building.

Existing work supplements the owner's independent conception. It does not automatically replace it.

## Activation

Activate before substantial investment when the task is materially creating or repeatedly refining a bespoke:

- method or framework;
- system or software architecture;
- metric, score, benchmark, classifier, or evaluation method;
- algorithm or protocol;
- taxonomy, ontology, or schema;
- research methodology;
- substantial workflow or orchestration system;
- custom substitute for a mature tool, standard, library, or known implementation pattern.

Repeated bespoke patching or refinement is itself an activation signal. If the team has already spent multiple iterations improving a homemade solution, stop before further investment and check whether the underlying problem is substantially solved elsewhere.

Do not force this gate onto routine implementation, narrow transformations, ordinary creative writing, small local refactors, or cheap disposable experiments that have not crossed an architecture or commitment boundary.

## 1. Preserve independent conception when fixation risk is material

Prior examples can improve feasibility while also narrowing exploration. When the owner already has an idea, or when premature exposure to existing solutions could constrain genuinely creative ideation, capture a short independent conception snapshot before searching.

Record only what is actually present:

- problem being solved;
- candidate mechanism or insight;
- important constraints;
- predictions or success conditions;
- known unknowns.

Do not embellish the snapshot with ideas learned later. Do not retroactively rewrite the independent conception after seeing prior work.

The snapshot is provenance, not a design freeze.

## 2. Search the underlying problem, not only local terminology

A weak prior-art scan searches only the name the project invented. A strong scan translates the problem into multiple formulations.

Search, in proportion to the task:

1. strongest relevant academic literature, especially primary work and strong reviews;
2. applicable standards, specifications, reference architectures, and professional guidance;
3. mature implementations, libraries, products, and open-source tools;
4. adjacent disciplines that may solve the same structural problem under different terminology.

Generate search formulations from:

- the project's chosen terminology;
- the underlying phenomenon or job-to-be-done;
- likely academic terminology;
- component problems;
- adjacent fields with analogous constraints;
- known failure modes or confounds.

Stop when the reuse decision is decision-sufficient: additional searching is no longer materially changing what should be reused, adapted, benchmarked, or invented. Do not turn every implementation task into an unbounded literature review.

### Scholarly discovery specialization

When academic literature is materially relevant, also load `patterns/existing-work-scan-and-scholarly-discovery.md`. That pattern is the specialist discovery layer for terminology/literature topology and preserves its 2026-08-18 authorial-flow provenance.

Prefer a scholarly semantic-discovery system such as SciSpace when available for the first terminology/field-mapping pass, especially when the project's terminology is homegrown or spans disciplines. Then verify load-bearing methodological, performance, limitation, or novelty claims against primary papers, standards, or official implementations. A semantic index is a discovery layer, not final authority.

Use the strongest discovery source for each evidence class: scholarly semantic indexes for academic mapping, primary papers for methodological verification, standards bodies for standards, official documentation/source repositories for mature implementations, domain-specific databases where they materially improve recall, and ordinary web search for broader grey literature and implementation practice. Do not default to ordinary web search alone when a specialized scholarly tool materially improves discovery.

## 3. Build an existing-work map

Classify findings into these decision buckets:

### Already solved

An established method or implementation meets the material requirements closely enough that bespoke replacement would add little value.

Default action: reuse.

### Partially solved

Existing work handles substantial parts of the problem but misses project-specific constraints.

Default action: adapt or compose.

### Composable

Multiple established components together solve most of the architecture more cleanly than a new monolith.

Default action: compose.

### Incompatible

Existing approaches are mature but conflict with a material requirement, architecture boundary, license, privacy condition, performance need, owner constraint, or other real requirement.

Record the exact incompatibility. Do not dismiss an existing approach merely because the homemade design is familiar.

### Genuinely unresolved

A material remainder remains after the strongest relevant existing approaches are considered.

This is the legitimate invention surface.

### Apparently novel

No strong prior solution was found after the bounded scan, but absence of a located source is not proof of novelty. Preserve the distinction between `not found` and genuinely unresolved.

## 4. Choose an explicit disposition

Choose and record one primary disposition:

- `reuse` — adopt an existing solution substantially as-is;
- `adapt` — modify a strong existing solution for local constraints;
- `compose` — combine established components rather than inventing a monolith;
- `invent` — build a genuinely unresolved remainder;
- `experiment` — evidence is insufficient to choose confidently; run a discriminating experiment.

Do not perform a literature scan and then continue with the original homemade architecture by inertia.

## 5. Preserve the novel remainder

After the scan, separate:

- **Established:** what prior work already supports.
- **Borrowed:** what the project will reuse.
- **Modified:** what will be adapted and why.
- **Novel remainder:** what still appears to require invention.
- **Uncertain:** what needs experiment rather than assertion.

Independent convergence is useful evidence but is not proof of novelty.

## 6. Benchmark bespoke work externally

If `invent`, `adapt`, `compose`, or `experiment` leaves a bespoke remainder, name the strongest relevant external baseline before substantial implementation.

A new system should not be judged only against its previous homemade version. Compare it, where applicable, with:

- the strongest established academic method;
- the strongest mature implementation/tool;
- a simple baseline that tests whether the extra complexity earns its cost.

If the bespoke approach differs intentionally rather than outperforming the baseline, state the tradeoff being optimized.

## 7. Research debt for cheap exploration

A cheap exploratory prototype may defer the scan when early external exposure would be counterproductive or when the prototype's purpose is to discover the real problem.

Record:

- `PRIOR-WORK CHECK: DEFERRED`;
- why deferral is useful;
- the hard trigger that makes research mandatory.

Acceptable hard triggers include:

- architecture commitment;
- scaling;
- productionization;
- substantial implementation time;
- public claims of novelty;
- repeated refinement;
- creation of a reusable cross-project framework.

Research debt must not become indefinite exemption.

## 8. Durable prior-work ledger

Save the result in the project repository. At minimum preserve:

- independent conception snapshot when used;
- search formulations;
- decisive academic, standards, tooling, and adjacent-field sources;
- existing-work map;
- reuse/adapt/compose/invent/experiment decision;
- novel remainder;
- strongest external baseline;
- deferred research debt and trigger;
- provenance/date.

Use `templates/PRIOR-WORK-SCAN.md` unless a project already has an equivalent durable ledger. Reuse the ledger on later iterations instead of paying the same discovery cost again. Refresh only when the task changes materially or the relevant field is fast-moving.

## Mechanical contract

Task and execution-plan templates must contain an explicit research-before-reinvention section with an applicability state.

Allowed applicability states:

- `required`
- `not_applicable`
- `deferred`

Allowed dispositions:

- `reuse`
- `adapt`
- `compose`
- `invent`
- `experiment`
- `not_applicable`

`not_applicable` is a valid low-friction state for routine work; it must not be used to bypass a clearly triggered gate.

For work marked `required`, the durable record must include:

- an independent conception snapshot when fixation risk was material;
- an existing-work scan;
- an existing-work map;
- a disposition;
- a novel remainder when anything bespoke remains;
- an external baseline when bespoke work remains.

For work marked `deferred`, the durable record must include the reason and hard trigger.

## Anti-patterns

Do not:

- research only the project's invented phrase and conclude the idea is novel;
- expose a fragile early idea to examples before capturing it when fixation risk matters;
- treat consensus as a substitute for first-principles reasoning;
- treat first-principles reasoning as a substitute for checking established work;
- keep polishing a homemade system because sunk cost makes reuse emotionally unattractive;
- call an existing approach incompatible without naming the exact violated requirement;
- claim novelty from failure to find a paper;
- optimize a bespoke method only against its own earlier versions;
- let external literature silently overwrite an owner's independently developed insight;
- turn every trivial implementation decision into an academic review.

## Origin and composition evidence

This orchestration pattern was integrated on 2026-08-18 from the owner-supplied `research-before-reinvention-patch-2026-08-18.zip` and the already-live `patterns/existing-work-scan-and-scholarly-discovery.md` at `main` commit `88066557559e137397d3f6f441176c5616772590`.

The pre-existing scholarly pattern had itself been promoted from an authorial-flow research pass in `u-dont-existDOTcom/pangram-humanization-lab`. Its specialist discovery guidance remains authoritative for academic terminology/literature mapping; this pattern adds the broader orchestration, research-debt, durable-ledger, template, and contract-test layer. The two files are intentionally complementary, not competing universal standards.

## Completion check

Before substantial bespoke investment, ask:

> Am I inventing or repeatedly refining something that plausibly has an established research, standards, tooling, or implementation literature? If yes, did I preserve the independent conception when needed, search the underlying problem rather than only our terminology, identify reusable and genuinely novel parts, explicitly choose reuse/adapt/compose/invent/experiment, and define the external baseline before continuing?

If not, the task is not ready for substantial bespoke investment.
