# Prevent false omissions when reading long or evolving documents

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-29, by ChatGPT reasoning worker in the InnerSignal source-review lane
- From: a source-grounded review of an evolving, multi-version long-form guide; transferable reading failure and verified development technique, not personal/clinical material
- Owner request: yes, 2026-10-29 instruction to send universal large-document improvements to UDA and AskRigor lanes
- Existing pull request: none in AskRigor
- Supersedes: none

## What to do

Adopt or adapt a **manifest-first semantic coverage receipt** for AskRigor tasks that critically evaluate, summarize, compare, claim a document omits something, or identify a novel remedy/technique from long or versioned documents. Use the relevant existing Universal/HRP authority and research pipelines; do not copy InnerSignal's guide, therapy content, or its client-facing question structure.

1. **Choose the right document before reading.** Where a manifest, dated edition or registered master exists, resolve the exact canonical source, version, byte/hash identity and authority role. Do not silently replace an active long document with an older historical snapshot, an accessible derivative, a search result, or a truncated summary.
2. **Log how much was actually read.** Distinguish full text inspected, full bytes retrieved but selected passages inspected, a section map, keyword matches, semantic retrieval, abstracts/excerpts, and prior-context inference. Record absent or unread sections and retrieval failures. A successful download is not proof of comprehensive reading.
3. **Use cross-section evidence cards for each concept.** Find conceptual equivalents under different terms and section headings. Gather primary support, qualifying examples, contrary cases, limitations, applicable populations, temporal context, and citations to exact source locations. For a whole-document claim, check the complete relevant scope, including middle sections and later qualifications. Do not require a keyword hit.
4. **Before saying 'not covered' or 'novel', choose an honest status:** present; present but dispersed/hard to discover; present in prose but not operationalized; similar function with different procedure; partially covered; unknown/unread; supported absence after adequate search. For any proposed import, state the genuinely additional function and expected decision improvement rather than renaming material the source already contains.
5. **Machine-check only what is mechanically checkable.** Exact source hash, reference identity, section anchors, verbatim quote offsets, node/claim-link existence, and stale-source invalidation are suitable deterministic checks. Semantic equivalence, interpretation, relevance, whether a negation applies, and document-level adequacy require model reasoning and independent source-bound review. Do not turn a regex list into a 'meaning' detector.
6. **Attach an understandable read receipt to substantive conclusions.** Suggested fields: source authority and version/hash; read mode; cited sections; relevant areas not inspected; conceptual-support and countercase links; status per target concept; exact limit to any absence or novelty finding. Keep the public answer compact; detailed evidence can be an attached report or audit ledger.

A **typed implementation contract** should fit AskRigor's own source adapters and HRP/Universal rules. Source/quote receipts should be generated from existing retrieval metadata when possible; introducing a parallel source-of-truth or broad new privacy-sensitive store is not requested. Run development/discovery freely, but do not label internal test passes confirmation of research novelty or external efficacy.

## Why

A real audit failure selected an earlier edition despite a newer registered guide. The reviewer then proposed several supposedly missing therapeutic methods that were already explicit in the active guide under headings that did not contain the conventional keyword. It also collapsed related imagery methods into allegedly identical procedures. The repair combined the correct manifest, source map (37 sections covering nearly the entire active document), human-curated cross-section concept cards, countercase inspection, exact quotation and graph-node validation, and honest read-mode disclosure.

The key transfer is not a better keyword list or a demand that models reread everything every time. It is **source identity -> concept-wide evidence -> countercases -> scoped status -> truthful claim of completeness**.

An implementation should be judged by fewer false omission/novelty claims and better calibrated source claims, not merely more citations, fewer tokens, or a larger context window.

## Check first

- Read current AskRigor source retrieval, full-text access, research completion, provenance, owner-source adjudication, and review rules before designing a new module. Reuse established contracts, including no-pay/zero-spend boundaries.
- Check current Universal `patterns/whole-argument-reconstruction.md`, its 2026-10-29 source-reading refinement, and the existing source-provenance and coverage-before-depth patterns. Avoid duplicating those in the canonical XML if the consumer already receives them.
- Before calling a current source missing, inventory exact source/manifest coverage, incomplete pipeline states, retrieval provenance, translation/semantic-match needs, and whether the alleged gap is in explanation, execution, or evaluation.
- Create synthetic regression cases: active version vs stale file; conceptual synonym with no keyword; essential counterexample hidden mid-document; derivative mistaken for canonical; adjacent but not identical technique; quote accidentally misattributed to another source; a true contradiction whose polarity was flipped; truncated retrieval misreported as full; a false 'not covered' verdict. Keep different languages where the meaning test is cross-lingual.
- Include a negative control where the document really does omit a concept, so anti-omission discipline does not become a bias to assume everything is already covered.
- Preserve the difference between a checked link, a passage citation, a semantic adequacy judgment, a research gate, and an actual delivered answer. Tests should detect source staleness and evidence drift; do not claim mechanical tests prove semantic model compliance.

## Boundary

This is an owner-directed suggested fix. AskRigor's own receiving lane decides which layer should implement it and which tests are necessary. It does not alter live HRP/Universal protocol bytes or expand external research/data access by itself.
