# Make finalization attainable for honest bounded evidence reviews and diagnose failures exactly

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-12, by a ChatGPT research reviewer
- From: 2026-10-12 `finalize_research` diagnostic response on a vaccine-vs-PEP literature review
- Owner request: yes, the 2026-10-12 instruction to investigate repeated finalizer `not_ready` outcomes and report bugs
- Existing pull request: none
- Supersedes: none

## What to do

Diagnose the observed `not_ready` result as **several independent failure classes**, retaining correct gates and fixing the wrong ones:

1. Model-generated answer_draft omitted each key study's visible live link and same-line source marker. That rejection was CORRECT. Ensure the final **rendered** answer, including per-study read-depth disclosure, matches the draft actually finalized, rather than writing a different answer after failed finalization.
2. Model presented lead/abstract papers as evidence for `not_established` absence/strength claims without full-text audits. That rejection was CORRECT. Allow evidence-bounded statements about what the *read abstract* reports without implying the full study has been audited.
3. Model classified a component-level research analysis as `treatment_choice: compared`, forcing YouTube/forum and review-site modules not material to controlled rabies death rates. Test routing separately for `comparative empirical evidence audit` versus `practical choosing a treatment`; do not silently deselect genuinely needed community safety signals.
4. `receipts_rejected: [{ index: 9, reason: signature_invalid }]` lacked an actionable provenance diagnostic beyond 'pass exactly.' Reproduce this exact class and identify session/identity/malformed receipt failure without echoing secrets; allow controlled removal of inadmissible receipt while preserving the public record's limitation.
5. An unavailable 2008 publisher full text (`CANDIDATE_FOUND_FETCH_BLOCKED`) and incomplete older reports must remain explicitly visible as `lead_only` / `inaccessible`, not be used as audited evidence and not automatically prevent a separately marked bounded answer once all executable lawful routes are exhausted.
6. Distinguish independent gates for source-verification completeness, study-method assurance, claim-specific limitations, and publication-level/full-HRP completion. `ready_with_limits` or another accurate bounded-completion state should be attainable when appropriate instead of forcing the assistant to publish after `not_ready`.

Suggested tests: one case with valid full-text study audit plus one explicitly inaccessible relevant paper; one with structurally valid but semantically irrelevant cited block; one with non-treatment decision research and zero forums; one with a truly treatment-choice request; one with exact bad receipt signature. Preserve safety and no-fabrication gates.

## Why

A prior real diagnostic rejected a draft for missing links, unaudited sources, community routing and a single unverified receipt, then the assistant delivered a substantive reply anyway. Some checks properly caught errors, but other conditions were misclassified or presented as absolute research stoppers, making the finalization layer hard to use honestly.

## Check first

Read the live finalizer implementation and the current canonical HRP/Universal/Project router. Identify if this is caller classification, draft-interface mismatch, source-access boundary, or server policy design before modifying. An inaccessible source should block only claims that require that source, not independent bounded findings. Keep a distinction between partial delivery and a claim of full HRP completion.