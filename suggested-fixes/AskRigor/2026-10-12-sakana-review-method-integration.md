# Integrate the transferable Sakana review METHODS into AskRigor's research workflow

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-12, by ChatGPT research assistant, following the owner's correction
- From: Teo et al., *Beyond Imitation: A Framework and Benchmark for LLM-Assisted Peer Review*, arXiv:2610.11087v1 (2026-10-08), https://arxiv.org/abs/2610.11087 ; primary PDF https://arxiv.org/pdf/2610.11087 ; especially Sec. 2.1–2.2, Sec. 3, Fig. 2 (printed pp. 7–8), Appendix Fig. 12 (p. 32), Figs. 18–21 (pp. 42–44), Table 12 (p. 34).
- Owner request: **yes**, owner follow-up on the original limited proposal: "You sent a case pilot? What about sending sakana methods to integrate?" This is a request to hand over Sakana's transferable methods, not merely create a synthetic-error test set. It does not independently approve changing canonical HRP/Universal scientific policy, paid-model spending, or deployment.
- Existing pull request: none
- Supersedes: `2026-10-12-sakana-contradiction-benchmark.md` (pending handoff in UDA PR #370); this owner correction changes the **primary outcome** from proposing a benchmark to handing over a concrete integration design. Retain the old benchmark proposal only as a subordinate validation option, not a prerequisite.

## What to do

**Primary request: assess, adapt and integrate useful Sakana methods into AskRigor's actual evidence-reading and answer-verification route.** Do not reduce the task to a 20–50-case pilot or respond that the worker must first invent a benchmark. Choose the smallest compatible implementation, inspect existing canonical HRP/Universal and live workflow, reuse existing controls, implement authorized reversible work, run affected tests, and escalate genuine scientific/protocol changes through current owner authority. This handoff is an owner request to deliver the method-design to AskRigor; the receiving project's maintainer still controls how it integrates, protects privacy and the zero-spend boundary.

### Transferable method 1 — three progressive passes BEFORE a verdict

Sakana's **Review Agent**: (1) first pass gives a document-specific high-level outline; (2) second pass revises misconceptions and inspects details, figures and evidence supporting each important claim, actively challenging assumptions and gaps; (3) third pass reconciles that evidence with supporting context before producing the review. It is not three generic agents voting.

**AskRigor adaptation** using existing study/review audit artifacts if possible:

- **Pass 1: source-and-question map.** Classify design and scope; write down the exact decision question and the source's central hypotheses, conclusions, intervention/comparator/population/outcome/horizon and major dependencies. Explicitly label unknowns. Capture whether the source is an original study, review, preprint, case series, etc. This is an *intermediate comprehension record*, not an evidence verdict.
- **Pass 2: full-text verification and challenge.** Inspect decision-important original sections, tables, figures, appendices/supplements, methods, actual denominators, measured vs claimed endpoints, harms, registration/protocol, comparator composition, attrition, analyses and conflicting details. Correct Pass 1 misreadings. Each material finding needs source ID + exact section/table/page/quote/figure anchor and an explainable claim/evidence relation. Distinguish `supports`, `contradicts`, `unresolved`, and `not inspected`; do not substitute a polished paraphrase for an inspected source.
- **Pass 3: reconciliation and answer.** Incorporate specific appendix corrections and genuinely independently checked literature, then re-evaluate whether the source supports the exact intended answer. Prefer critical findings that would change the real-world conclusion to minor writing criticism. Repair or qualify unsupported claims, preserve uncertainty and counterevidence; only then allow synthesis under AskRigor's existing gates.

**Integration target:** existing source acquisition and full-text audit flow, study/review audit synthesis, and answer-draft/finalization logic; first inspect `project/PROJECT_INSTRUCTIONS.md`, `packages/contracts/`, `packages/sources/`, `apps/research-mcp/`, source-linked audit validators and current regression tests. Avoid a duplicate 3-step form if the semantic sequence is already reliably enforced. Treat "reading, checking, reconciling" as phases with testable artifacts/claims, not mere prompt slogans.

### Transferable method 2 — specialist appendix/supplement reading with quote-backed reconciliation

Sakana splits original PDF into main body and appendix; its cheaper Appendix Agent extracts experiments and implementation details **with quotes**. The final Review Agent corrects objections already resolved in the appendix (Sec. 3, Fig. 18 and Fig. 21). 

**AskRigor adaptation:** When supplements, extended methods, registry material or protocol documents are present, add a targeted *supplement discrepancy* extraction: interventions, randomization/blinding, sample-size calculation, prespecification, deviations, exclusion criteria, harms, subgroup details, funding and conflicts where applicable. Compare every potential weakness against the corresponding original passage before alleging omission or flaw. Record `addressed`, `contradictory`, `unresolved`, or `supplement inaccessible` with anchors. Reuse existing full-text reader and validators. A cheaper model is an optional implementation detail **only if already authorized and reliably available**; no new paid API access.

### Transferable method 3 — distinct literature-context challenge, not study self-citation

Sakana has an optional Literature Review Agent, separate from the paper author's own related-work section, to search external work, check novelty/context and avoid criticising well-established practices from stale model knowledge (Sec. 3, Fig. 19). The authors disable it on withdrawn-paper benchmarks to avoid ground-truth leakage.

**AskRigor adaptation:** Reuse HRP's existing bidirectional search, extended human evidence, grey literature, independent replication, contradictory studies, and citation ancestry, rather than launching a redundant "novelty" agent on every health question. For each load-bearing claim, an independent context pass can challenge whether other evidence contradicts it, whether authors omit relevant prior controls, whether a pooled effect comes from reused participants, and whether the cited source really entails the claim. Keep each evidence stream and source status visible. Suppress external lookup when it would leak the label into an evaluation. Independent searching can suggest leads; those leads must still pass full-text and provenance gates before changing a verdict.

### Transferable method 4 — original visual paper representation where text extraction loses facts

Sakana preserves original PDF for model inspection because plain-text extraction may destroy equations, tables and figure information (Sec. 3). It caps **main-text** reading at ten pages as a context/cost optimization.

**AskRigor adaptation:** On evidence-critical PDF figures, table layout, formulas or corrupted OCR/text, compare the original rendered region with extracted text. Mark `text-equivalent`, `rendered-image-verified`, or `unresolved` and preserve source identity/page. **DO NOT copy the ten-page limit**: clinical and scientific full-text validity may depend on late methods, limitations, supplement details and harms. This is selective visual repair, not an excuse to replace complete lawful full-text acquisition with screenshots or image summaries.

### Transferable method 5 — claim/evidence dependency graph and importance targeting

Sakana's **Contradiction Benchmark generator** (Sec. 2, Fig. 1, Table 2, Appendix Fig. 12) builds a paper-specific graph with main/secondary/tertiary Claim nodes; high/medium/low Evidence nodes; Methodology, Implementation, and Mathematical Theory nodes; edges `Supports` and `Contradicts`; direct quotes; and distance to main claims for grading synthetic-mutation severity.

**Correct scope:** The published graph is primarily part of the *benchmark construction/evaluation*, not demonstrated as a required live inference engine for MLR reviews. Do **not** present a graph as the proven cause of its 73.43% result.

**AskRigor adaptation:** Test a **minimal answer-to-evidence ledger** first: each decisive answer claim -> study claim -> exact original outcome/figure/table/method -> intervention/comparator/population/horizon, with support/contradiction/unresolved edges. Identify central dependencies and gaps, but do not mechanically convert graph distance into clinical severity. A "minor detail" may determine clinical safety; clinical priority must weight harm, effect and decision relevance. Build a full dynamic graph only if a real source-to-claim failure is otherwise difficult to diagnose or resolve.

### Transferable method 6 — error-focused evaluation (supporting, not the primary request)

Sakana modifies research-paper source text to plant known contradictions of differing centrality; re-renders the PDF; grades whether reviewers identify the *actual specific error*, not whether they sound like reviewers (Sec. 2, Fig. 1, Sec. 4). With **only Review Agent** for its synthetic benchmark, four reviews detected **73.43%** of planted central-claim contradictions, single review **60.79%**, and four-review pooled detection over all graph distances **40.95%**. On 211 naturally withdrawn papers, exact documented-error detection was **16.11%**, with similar-problem detection **26.07%** (Tables 3, 12, 14). Their automatic judge sometimes misclassifies vague criticism as catching a contradiction (Appendix A.1).

**AskRigor adaptation:** Retain the previously filed small contradiction tests as a **diagnostic for improvements**, but do not make building that pilot a mandatory precondition for cheap, compatible methods 1–4. Use clean controls, exact-error matching, blinded human adjudication, a representative set of real medical errors and matched model/source settings; measure wrong claims and false positives as well as recall. No claim of medical accuracy from Sakana's percentages.

## Do NOT copy these Sakana specifics

- **Third-pass prompt exclusion:** Appendix Fig. 21 instructs its reviewer to **ignore weaknesses regarding timelines, infeasibility or unrealistic experimental results**. This is particularly inappropriate for AskRigor; such red flags must stay inspectable, especially safety, plausibility and reproducibility.
- **ML conference scoring:** No NeurIPS 1–10 quality/acceptance score or "mentor" prose as a substitute for clinical source adequacy or specific answer accuracy.
- **Limits and infrastructure:** No ten-page full-text truncation, forced four-review ensemble, newly mandatory expensive agent, or automatic new fail-closed source/answer gate inferred only from this outside paper.
- **Security/false positives:** Treat PDF and web text as untrusted instructions. Sakana's manipulation-detection was 8/50 in the discussed benchmark, so a multi-pass model is not a prompt-injection defense. Keep parser/LLM-judge uncertainty and false accusations explicit.
- **Scope authority:** Do not amend canonical HRP or Universal silently. Respect AskRigor's exact source/identity/version/read-depth requirements, owner decision on scientific policy, and **$0 approved model-API spending**.

## Why

The prior suggestion sent **only a test-case pilot**, thereby omitting the user's real integration interest. Sakana's paper describes specific methods for reading and challenging source material; AskRigor's existing audit validators ensure checklists/source coverage but do not alone establish that the synthesized conclusion is semantically entailed. An adapted progressive comprehension->checking->reconciliation path plus quote-backed supplement verification directly targets that gap, without inventing another monolithic reviewer or blocking working research.

## Check first

1. Compare the current canonical HRP and Universal (not stale summaries), source-linked audit receipts, existing claim-integrity cases, and deployed answer path. Produce a small **reuse/adapt/omit** disposition for methods 1–6, naming overlap with existing controls.
2. **Advance compatible authorized work** (routing, prompts, source-linked artifacts/tests where project policy permits) rather than leaving the work as an indefinite study proposal. If a planned addition requires owner-approved scientific policy or paid inference, finish independent preparation, identify the exact gate and ask only about that decision.
3. Run affected hermetic tests; do not claim live/installed functionality without live evidence. Carry exact original paper version and per-method page/figure anchors. Verify the artifact reached AskRigor's project lane and record its adoption/adaptation/deferral in the AskRigor ledger.
