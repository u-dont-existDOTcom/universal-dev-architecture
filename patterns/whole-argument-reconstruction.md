# Whole-Argument Reconstruction Before Critique or Editing

## Problem

A worker can read every sentence correctly and still misread the source. The common failure is to treat one local sentence as the complete argument, drop its operative object or qualification, overlook the concept's full explanation elsewhere, and then criticize the author for an omission or overclaim that the complete source does not contain.

This creates especially damaging false repairs:

- a narrow claim is paraphrased into a broader claim and then rebutted;
- a later qualification is mistaken for a retraction rather than context;
- an idea already present elsewhere is called missing instead of recognizing a setup or placement problem;
- a generic outside framework replaces the source's actual architecture;
- selective owner feedback causes every unmentioned proposal to disappear from the working set.

## Core invariant

**Reconstruct the whole argument before judging or changing any part of it.**

A critique or edit is not ready merely because the local quotation is accurate. The worker must be able to state the author's complete claim, including the relevant definitions, qualifications, examples, later applications, and explicit exceptions distributed across the source.

## Whole-argument reconstruction gate

Before criticizing, fact-checking, summarizing, editing, or converting a long-form source into another artifact:

1. Recover the complete current source boundary and its current architecture/map when one exists.
2. For every proposed defect, quote the exact local passage.
3. Trace every other passage where the same concept is defined, qualified, narrowed, contradicted, exemplified, or applied.
4. Reconstruct the claim with its full grammar and scope:
   - subject or actor;
   - action or relation;
   - operative object;
   - time and chronology;
   - modality and certainty;
   - scope and population;
   - exceptions and concessions;
   - evidence or epistemic status;
   - later qualification or callback.
5. State the reconstructed claim in one sentence before evaluating it.
6. Classify the actual defect as one of:
   - precise factual conflict;
   - local ambiguity;
   - concept introduced too late;
   - primary explanatory home unclear;
   - transition or causal dependency unclear;
   - repeated proof;
   - genuine contradiction;
   - no defect.
7. If the objection disappears after this reconstruction, withdraw it. Do not manufacture a replacement criticism merely to preserve the appearance of progress.

A source-wide search is necessary but not sufficient. Matching keywords do not prove that two passages perform the same function. The worker must understand the paragraph job and the setup-to-payoff architecture.

## Manifest-first, concept-wide reading receipts

A substantial document critique can fail even with accurate excerpts if it silently selects an older source, reads selected sections as the whole, or treats the absence of a keyword as the absence of a concept. The existing whole-argument gate therefore includes an **evidence-topology read receipt** when the conclusion depends on whether a large or evolving source already addresses something.

1. **Resolve the authoritative version before reading.** Prefer a source registry or manifest with exact path, revision, content hash, and authority role. Record whether the source is canonical, a derivative, an earlier version, a secondary summary, or an executable/implementation representation. Do not let a historically named file or a more accessible excerpt silently replace the active document. If authority is unknown or competing, report that limitation before a completeness or novelty verdict.
2. **Disclose the actual read mode.** Distinguish full-source reading, complete file retrieval followed by targeted inspection, structural/headings inspection, keyword search, semantic/concept search, and prior-context inference. Full retrieval is not proof of complete semantic review. Note unavailable/truncated spans; never describe a partial read as exhaustive.
3. **Build a concept-to-passage ledger, not just a table of contents.** For each requested concept, gather its direct explanation, later examples, qualifications, counterexamples, contrary cases, procedural instructions, and dependent claims even when dispersed under unrelated headings. Record exact source anchors and, when applicable, links to its implementation or decision nodes. A concept can live in several sections and can be expressed without its conventional term.
4. **Separate evidence binding from understanding.** Deterministic tools can verify exact file/hash identity, passage quotes, section locations, node references, and staleness. They cannot certify paraphrase equivalence, completeness, clinical validity, or that a runtime actually uses the cited rule. A meaning-capable reviewer must judge those claims and disclose uncertainty.
5. **Gate absence, novelty and proposed fixes.** Before declaring a technique missing, classify it as *present*, *present but hard to discover*, *present but not routed/implemented*, *same function but a different procedure*, *partial*, *unverified*, or *genuinely missing after an adequate review*. Name the precise incremental action the outside proposal would enable, and preserve the strongest existing reading that already covers the point. If the objection disappears, withdraw it; do not manufacture a replacement.
6. **Use discriminating countercase tests.** Include cases where a middle-of-document explanation changes the result, where a keyword is absent but the concept is present, where a similarly named procedure is functionally different, where a later qualification reverses a local reading, and where an old source would produce a false omission. Test the evidence mechanism with stale hashes and invented quotes, and test semantic claims separately with source-bound review.

The receipt is a compact provenance and evidence summary, not a new mandatory user-facing form. Scale it to the task: a one-paragraph answer needs far less machinery than a multi-version research audit or a proposed rewrite of an owner's long work. This refinement composes with existing claim-scope verification and coverage-before-depth; it does not replace them.

### Claim map for long or high-stakes texts

When a critique, edit or summary of a long or high-stakes text depends on what the text claims, keep step 3's ledger at the level of claims (owner choice, 2026-10-31: `docs/requirements/2026-10-31-claim-map-and-study-map.owner-requirement.json`).

1. **Pin each claim to its passage.** Each claim the text makes is one entry, with its exact passage: the quote and where it sits. A criticism targets a pinned claim. A point that matches no pinned claim is the reviewer's own reading and is labeled that way, never presented as what the text says.
2. **Type the links between claims.** *Supports*, *qualifies*, *contradicts*, *depends on*, *example of*: each link points to the passage that makes it. Before editing a passage, list the claims that depend on it, so a change to a setup doesn't silently break its payoff.
3. **Count what was read.** Mark each paragraph read or not, and give the count in the read receipt ("41 of 41 paragraphs"). A partial read says which parts were left.
4. **Make an absence claim a search with a control.** "Not found" names the paragraphs searched, and the method is checked on a text that really lacks the idea (the negative control of step 6).
5. **Split the work by kind.** A cheaper model may draft entries and links. A meaning-capable reviewer judges them, as step 4 requires. A script checks that each quote matches the source at its recorded hash and that both ends of every link exist.
6. **Use it only where the claim structure decides the outcome:** a long source, a contested reading, a proposed rewrite of the owner's text, or an omission or novelty claim. Where a project already keeps an architecture map that pins claims to passages, that map serves.

For research that combines studies, the same idea becomes a study map: each study's identifiers and cohort, links such as same cohort or reanalysis, and each claim of the answer tied to the passage it rests on. AskRigor's item is `suggested-fixes/AskRigor/2026-10-31-study-map-for-decision-claims.md`.

## Never broaden the claim while paraphrasing it

Preserve the operative object and modality. For example, a claim about **promising a future feeling** is not a claim about whether that feeling historically existed. A claim that something **usually biases** behavior is not a claim that it deterministically causes one outcome. A claim based on one person's experience is not automatically a universal rule.

Before rebutting a paraphrase, compare it against the exact sentence and ask what grammatical or modal information disappeared. If the rebuttal applies only to the broadened paraphrase, it does not apply to the source.

## Claim-scope contradiction gate

A correction or rebuttal is valid only if the evidence actually negates the proposition being corrected at the same relevant scope and level of abstraction. Do not treat evidence against one mechanism, implementation, proxy, or narrower subclaim as evidence against a broader relation unless the broader claim logically entails that narrower proposition.

Before declaring a claim false, contradicted, disproven, or corrected:

1. Represent the target proposition explicitly enough to preserve:
   - subject/actor;
   - relation or predicate;
   - object/target;
   - scope or population;
   - quantifier/frequency;
   - modality/strength;
   - time window;
   - proposed mechanism, when the mechanism is actually part of the claim.
2. Represent the evidence proposition at the same level of detail.
3. Ask whether the evidence is the logical negation of the target proposition, or whether it merely narrows one possible mechanism or interpretation.
4. Preserve relation direction and polarity. Evidence about who operates, owns, administers, influences, regulates, funds, or controls something cannot be substituted for another relation without an explicit entailment argument.
5. If the evidence falsifies only a narrower mechanism, rewrite the conclusion as a qualification of that mechanism rather than rejection of the broader relation.
6. If the entailment needed for contradiction is unstated or unsupported, classify the result as `not established`, `mechanism narrowed`, or another appropriately limited conclusion—not `disproved`.

### Regression example

Claim: **“Actor A controls platform B.”**

Evidence: **“Actor A does not directly operate platform B.”**

Invalid inference: **“Therefore Actor A does not control platform B.”**

Correct treatment: direct operation is one possible mechanism of control. Unless the original claim specifically equated control with direct operation, disproving direct operation does not by itself negate the broader control relation. Test the broader control claim separately using evidence that bears on that relation.

This gate applies in both directions: do not broaden a positive claim beyond its evidence, and do not broaden a negative finding into a stronger negation than the evidence supports.

## A true behavior label may still be an incomplete explanation

Do not force a choice between accurately naming a behavior and contextualizing it.

A person may have lied, withdrawn, shouted, forgotten, or broken an agreement. Later context—mental illness, confusion, fear, incapacity, coercion, or another mechanism—may explain why the behavior occurred without making the behavioral description false.

When the author's intended movement is **accurate behavioral label → broader context**, preserve both layers. Do not rewrite it as **the original label was wrong** unless the author actually retracts it.

## Distinguish missing content from missing setup

Before saying that a source omits a concept:

1. trace every occurrence of the concept;
2. identify its first seed;
3. identify its full explanatory home;
4. identify later applications;
5. determine whether a reader's confusion comes from absence, delayed definition, weak transition, or a callback that appears to introduce the idea anew.

Prefer a clearer transition, a short setup seed, or movement of existing prose over adding a second explanatory section. Do not duplicate an argument merely because its first complete explanation arrives later than expected.

## Preserve selective feedback and unchallenged proposals

When an owner or reviewer responds to only part of a proposal set:

- apply each explicit correction;
- keep every unaddressed proposal in the durable proposal ledger rather than silently discarding the batch;
- do not infer final approval from silence unless the owner has explicitly established that review convention;
- when the owner has established that unmentioned proposals in the current review are accepted, record that bounded convention and carry those proposals forward;
- if a correction logically changes an unmentioned proposal, mark the dependency and explain the change instead of silently dropping it.

Selective feedback is an update to the active task, not permission to forget the remainder.

## Reviewing the owner's own writing

When the artifact under review is the owner's own writing, the reviewer's reading of it is the part most likely to be wrong.

- Before flagging a problem, state the strongest reading under which it is not one. If that reading is plausible, drop the flag.
- When a flag depends on what the owner meant, ask. Do not resolve an ambiguous phrase silently and then correct the owner for the reading the reviewer chose.
- Report a contradiction only when the two statements cannot both be true under any reasonable reading. A view the owner holds and a warning about how that view gets misused can both stand.
- Once the owner rejects a flag, drop it. Do not bring it back as a prediction about readers or in a new framing unless new evidence appears.
- Sort findings into verified problems and suggestions that depend on a reading. There is no minimum number of findings; a review that finds little has not failed.

Regression: asked what they thought of the owner's draft reply to a published essay, a reviewer returned 18 points, and 9 were wrong or overstated. They included a claimed contradiction between a view the owner held and the owner's warning about its misuse, a correction that treated one of two readings the source supports as the only one, a fact-check of a phrase the reviewer had misread, and, after the owner rejected two of the flags, both of them again as warnings about how readers might take the text.

## Exact repair contract

Every substantive proposed repair should provide:

- exact current text and location;
- the worker's exact reading of it;
- the complete source-wide concept trace;
- the precise defect classification;
- exact replacement or movement;
- the claims, qualifications, actors, severity, and uncertainty that remain unchanged;
- affected architecture/map nodes;
- evidence needed if the objection is factual.

This requirement prevents a worker from hiding a changed argument inside smoother prose.

## Anti-patterns

- sentence-by-sentence critique without section- or source-wide reconstruction;
- replacing the author's framework with a generic professional, clinical, academic, or product framework;
- saying a topic is “complicated” without identifying the exact false or ambiguous clause;
- treating an experiential claim and a cited laboratory result as merged merely because they occur in the same section;
- adding mechanical epistemic labels that make memoir read like an incident report;
- interpreting contextualization as denial of the original behavior;
- treating evidence against a narrower mechanism as contradiction of a broader relation without entailment;
- changing relation type, direction, polarity, quantifier, or modality while paraphrasing evidence;
- calling a concept missing after finding it elsewhere;
- discarding accepted or still-live proposals because the owner corrected different items.

## Verification

Before completion, run a whole-source cold read and answer:

1. Can every criticism be tied to an exact clause rather than a broader paraphrase?
2. Was every relevant qualification or later explanation considered?
3. For every claimed contradiction, does the evidence negate the same proposition at the same scope, relation, direction, polarity, and modal strength?
4. Did any negative finding about one mechanism get improperly generalized into denial of a broader relation?
5. Did any proposed fix introduce an argument the source already contains?
6. Did contextualization accidentally retract a behavior the author still affirms?
7. Did any unaddressed proposal disappear after selective feedback?
8. Does the architecture/map still reflect the actual setup, primary home, and callbacks?
9. Would the author recognize the repaired passage as the same argument stated more clearly?
10. For a review of the owner's own writing, did every flag survive the strongest reading, did every flag that depends on the owner's meaning become a question, and did any rejected flag come back in a new framing?

If any answer is uncertain, the critique/edit remains provisional.

## Origin evidence

- Originating work: long-form Romance article and derivative card-game review; later generalized by a public-claim correction failure in which evidence about direct operation was incorrectly treated as negating a broader control relation
- Promotion dates: 2026-08-17; claim-scope contradiction extension 2026-09-13; owner-writing review extension 2026-09-27 (`docs/requirements/2026-09-27-claim-anchoring-and-review-integrity.owner-requirement.json`)
- Failure classes: multiple sentence-local readings broadened narrow claims, overlooked qualifications elsewhere, treated contextualization as retraction, temporarily dropped unchallenged proposals after selective feedback, and generalized evidence against a narrower mechanism into denial of a broader relation without entailment
- Owner corrections: require exact prose, exact reading, full-source reconstruction, durable Mermaid mapping, natural integration, preservation of unaddressed accepted suggestions, and proposition-level scope matching before declaring contradiction
- 2026-10-31 owner choice: the claim map for long or high-stakes texts, and a study map suggested to AskRigor (`docs/requirements/2026-10-31-claim-map-and-study-map.owner-requirement.json`). It came from the September review failure in which the reviewer's own reading of an article was written as the article's content; pinning claims to passages makes that difference visible.
- 2026-10-29 owner-requested addition: a multi-version guide audit selected an earlier file as though current and inferred absence from conventional keywords despite the active source addressing the ideas under other headings. A project-local manifest-bound, cross-section concept ledger detected the failure and verified source anchors. Transfer is limited to source authority, read receipts, cross-cutting evidence, qualified absence claims and regression designs; the project-specific therapy content is not copied, and mechanical quote checks do not validate semantic completeness.

The source article, personal examples, and project-specific candidate wording remain in their private project boundary. This pattern promotes only the transferable reasoning and review controls.

## Limits

- Whole-source reconstruction does not make the source correct; it makes the target of criticism accurate.
- A real contradiction may remain after all passages are traced. Name it directly rather than smoothing it away.
- Evidence can legitimately refute a broader claim when the broader claim entails the falsified narrower proposition; the gate requires making that entailment explicit rather than assuming it.
- Long sources may require a concept map or retrieval matrix; do not claim completeness from a few keyword matches.
- Silence is not universal approval. Carry unaddressed proposals forward, and apply an acceptance-by-silence convention only when the owner explicitly establishes it.
- The gate should not become bureaucratic prose inside the artifact. The analysis may be structured while the final writing remains natural.
