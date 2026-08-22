# Transformation Preservation Proof

## Problem

A generative or optimizing transformation can satisfy its local objective while silently changing something outside the authorized scope. This happens in article rewriting, code generation, configuration migration, document conversion, data transformation, prompt-driven refactoring, and other source→target workflows.

The common weak pattern is:

`transform → inspect output → discover losses later`

A good prompt, a trusted model, a high style/quality score, or successful downstream evaluation does not prove that the particular transformation preserved the source obligations.

## Core pattern

Treat every consequential transformation as an **authorized delta over a frozen source baseline**, then validate the exact produced target bidirectionally before downstream acceptance.

The execution order is:

1. freeze source authority and exact identity;
2. enumerate the source obligations that must survive in the changed scope;
3. freeze the authorized-change whitelist;
4. perform the transformation;
5. trace every source obligation forward to the target or an already-authorized disposition;
6. trace every substantive target delta backward to a source obligation, whitelist item, or explicit authority;
7. fail on any unexplained delta;
8. only then run downstream quality, performance, detector, publication, or deployment gates;
9. repeat the proof after every subsequent substantive transformation.

This is a domain adaptation of requirements traceability, configuration/change control, and translation validation rather than a claim that generative transformations can be proven semantically correct by one universal metric.

## 1. Freeze authority

Record the authoritative source artifact, revision/hash, changed boundary, relevant dependencies, current owner/stakeholder instructions, and any protected invariants.

Do not use a convenient intermediate artifact merely because it is newer, prettier, or already passed a downstream evaluator.

If competing sources plausibly claim authority, resolve that before transforming.

## 2. Enumerate preservation obligations

Decompose the **changed scope plus load-bearing dependencies** into stable obligations at the granularity where independent loss is possible.

Examples by domain:

- editorial: claims, certainty, attribution, examples, rhetoric, links/media;
- code: observable behavior, API contracts, side effects, error handling, security properties;
- configuration: keys, defaults, environment bindings, permissions, secrets boundaries;
- data: fields, units, provenance, null semantics, ordering, referential relationships;
- document conversion: headings, links, captions, native objects, accessibility metadata;
- workflows: triggers, stop conditions, approvals, paid/irreversible boundaries, recovery state.

Give each obligation a stable ID, source location, authority, required context, and allowed disposition.

Avoid sentence/line-level atomization when a larger unit is inseparable. Split one source unit when it contains independently losable obligations.

## 3. Controlled dispositions

Typical allowed dispositions are:

- preserve exactly;
- preserve semantically;
- move to a named destination;
- consolidate into a named surviving realization;
- superseded by explicit higher authority;
- deleted by explicit higher authority.

There is no generic `omit because redundant/cleaner/easier` disposition for the transformer.

If removal requires judgment not already authorized, preserve it or request a decision.

## 4. Freeze the change whitelist

State what the transformation is actually allowed to change.

Examples:

- change representation but preserve behavior;
- change sentence architecture but preserve propositions and attribution;
- rename interfaces but preserve compatibility aliases;
- migrate storage format but preserve logical records and units;
- remove one deprecated field but preserve its replacement mapping;
- fix one misattribution without deleting the separately valid interpretation.

Anything outside the whitelist is presumed invariant.

When a predictable side effect would be dangerous, state it negatively as well: `may change X; may not change Y`.

## 5. Forward traceability: source → target

After transformation, map every unsuperseded source obligation to its target realization or authorized disposition.

Fail on:

- missing obligation;
- weakened/strengthened semantics outside authority;
- changed actor/recipient/owner;
- changed provenance;
- lost required context;
- relocation without dependency repair;
- consolidation that preserves topic but not function;
- target representation that exists syntactically but no longer performs the source contract.

Keyword or structural overlap alone is not sufficient evidence.

## 6. Reverse traceability: target → authority

Forward traceability finds losses. Reverse traceability finds unauthorized additions and drift.

Classify every substantive target delta. Each must trace to:

- the frozen whitelist;
- a source obligation requiring that target change;
- or a newer explicit authority.

Unexplained additions are failures too. This catches `gold plating`, invented explanations, new behavior, changed defaults, broadened claims, and hidden policy changes.

## 7. Zero-unexplained-delta gate

The transformation is eligible for downstream acceptance only when:

- all required source obligations are accounted for;
- all target deltas are authorized;
- required context/dependencies survive;
- zero unexplained deltas remain.

A downstream green result cannot override this gate.

Examples:

- detector Human but claim deleted → fail;
- tests green but API behavior changed outside whitelist → fail;
- rendered page looks correct but native-object identity changed → fail;
- migration completed but one unit conversion was implicit/untracked → fail.

## 8. Per-transformation validation, not transformer trust

This pattern borrows directly from **translation validation** in compiler verification: rather than assuming the translator is correct because it was designed carefully, validate the exact source→target result produced on each consequential run.

For generative systems this distinction is especially important because the transformer is nondeterministic and may satisfy instructions inconsistently.

A prompt such as `preserve all meaning` is a requirement, not evidence that the output did so.

## 9. Change impact and dependency scope

Requirements engineering and configuration control emphasize impact analysis because one local change can affect upstream/downstream dependencies.

For each authorized delta, inspect only the dependencies that can materially change the result:

- callers/callees/interfaces;
- antecedents/callbacks;
- derived artifacts;
- tests/verification procedures;
- publication/export variants;
- state/checkpoints;
- security/privacy boundaries.

Do not turn a local transformation into whole-repository bureaucracy unless the dependency graph requires it.

## 10. Validate the validator with mutation testing

A preservation gate can appear rigorous while missing the failure modes that matter. Test it using deliberate mutants/fault injections.

Representative mutations:

- delete one unique obligation;
- remove a qualifier;
- invert polarity;
- swap actor and recipient;
- alter provenance;
- change a default;
- move a unit without its dependency;
- add unsupported behavior/explanation;
- mark two non-equivalent functions as duplicates;
- leave syntax present while breaking the semantic contract.

The validator/test suite should reject the mutants. A surviving mutant identifies a gap in the preservation mechanism.

Mutation testing evaluates the validator; it is not a production transformation strategy.

## 11. Metamorphic relations when direct equivalence is hard

When exact source-target equivalence is difficult to state, add domain-specific metamorphic relations: necessary relationships that should remain true across transformations.

Examples:

- formatting-only change must not alter semantic obligation mappings;
- moving an intact unit changes location but not its obligation identity;
- serialization/deserialization round trip preserves logical records;
- renaming preserves behavior under corresponding name substitution;
- style-only rewriting preserves claim/provenance units while style classification changes.

Use these as supplemental oracles, not substitutes for source authority.

## 12. Do not collapse quality axes

Text style-transfer research provides a direct warning: style success, content preservation, and naturalness are separate dimensions, and automatic content-preservation metrics can be misleading.

The same principle generalizes:

- performance improvement does not prove behavioral preservation;
- detector improvement does not prove semantic fidelity;
- readability improvement does not prove provenance preservation;
- successful rendering does not prove native-object identity;
- schema validation does not prove data meaning.

Keep the relevant axes separately measured and separately authoritative.

## 13. Minimum receipt

For each consequential transformation, record:

```text
Source authority: <path/revision/hash>
Changed scope: <boundary>
Preservation obligations: <count>
Forward traceability: PASS / FAIL; unresolved: <IDs>
Target substantive deltas: <count>
Reverse traceability: PASS / FAIL; unexplained: <IDs>
Dependency/impact checks: PASS / FAIL
Downstream eligibility: ELIGIBLE / BLOCKED
Downstream evaluations: <tests/detectors/rendering/etc.>
Authorized substantive changes: <exact list or none>
Remaining weakness: <exact>
```

## Existing-work basis

This pattern is **COMPOSE + ADAPT**, not a novel formal-method claim.

Established sources include:

- requirements baselines, bidirectional traceability, change-impact analysis, orphan detection, and verification mapping in requirements engineering (including NASA requirements-management/software-engineering guidance and ISO/IEC/IEEE 29148);
- Pnueli/Siegel/Singerman/Shtrichman translation validation: validate each source→target translation rather than assuming the translator is universally correct;
- mutation testing: inject faults to evaluate test/validator adequacy;
- metamorphic testing: validate necessary relations when a simple oracle is unavailable;
- text style-transfer evaluation: separate content preservation, style transfer, and naturalness rather than relying on one composite metric.

## Origin evidence

- Originating repository: `u-dont-existDOTcom/joel-articles`
- Origin date: 2026-08-22
- Origin task: repeated Romance humanization losses caught only after generation/detector work
- Independent conception snapshot and prior-art decision: `docs/HUMANIZATION-PRESERVATION-GATE-DESIGN-2026-08-22.md` on the originating task branch
- Project-local implementation: `docs/HUMANIZATION-PRESERVATION-GATE.md`

The transferable lesson is the source→target preservation architecture. Joel-specific prose, article content, Pangram thresholds, and Romance evidence remain project-local.

## Limits

- A ledger can omit an obligation; structural completeness does not prove semantic completeness. Use whole-source/requirements reconstruction and independent review where risk warrants it.
- Natural-language semantic equivalence cannot generally be proven by this process alone.
- Machine-readable traceability can enforce explicit dispositions but cannot automatically decide every equivalence claim.
- Overly fine decomposition can create bureaucracy and reduce judgment quality. Scope to independently losable obligations and material dependencies.
- Some transformations intentionally change semantics; in those cases the whitelist must explicitly authorize the change rather than pretending the transformation is lossless.
