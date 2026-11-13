# Codex on defect D5: the reviewer's final message, as returned

1. **P1 — Study-map passages can be checked against the wrong paper.** [research-finalization-gate.ts:4536](<tree>/apps/research-mcp/src/research-finalization-gate.ts:4536)  
   These lookups use `sourceLinks`, whose `PaperLinks` grouping joins papers through shared landing URLs. Give two different DOIs resolver receipts naming the same publisher landing page, and provide full text only for paper A: paper B’s request inherits A’s handle. A passage copied from A can consequently return `found` for B while finalization passes.

2. **P2 — A terminal Reddit continuation counts as a complete thread.** [research-finalization-gate.ts:2130](<tree>/apps/research-mcp/src/research-finalization-gate.ts:2130)  
   A receipt with `v=reddit`, `m` identifying a continuation, and `e=1` satisfies `whole`. Reddit continuations return only their newly loaded comments. Passing only that terminal receipt therefore supports `full_text_read` without evidence that earlier batches were read, potentially hiding adverse reports in those batches.

3. **P2 — Lead availability is promoted to verified reading.** [reading-summary.ts:112](<tree>/apps/research-mcp/src/reading-summary.ts:112)  
   An acquisition ending in `ABSTRACT_ONLY` or `PARTIAL_TEXT_READABLE` returns lead metadata without the acquired text or blocks. Nevertheless, this code counts it as an abstract or partial reading, and `source-reading.ts:210` also treats that availability as evidence of reading. With only this receipt, a passing answer can claim verified reading although the answering model never received the material.

4. **P2 — An unrelated registration can produce a definite scientific criticism.** [study-map.ts:787](<tree>/apps/research-mcp/src/study-map.ts:787)  
   Declare an unrelated NCT number for study A, whose available abstract neither establishes that number nor appears among the registry’s result papers. The tie remains `not_checked`. If that other trial registered late, `tie !== "not_found"` still instructs the AI to say **A** registered after starting. Require an established identity tie before issuing this factual assertion.

5. **P2 — An evidence citation suppresses explicitly declared cohort overlap.** [study-map.ts:818](<tree>/apps/research-mcp/src/study-map.ts:818)  
   Let trial A cite independent trial B as evidence and declare its extension A2 as `same_cohort`. The citation alone marks A as containing several groups, suppresses its explicit cohort join, and disables counting for claims using A. Thus a claim counting A and A2 as two independent cohorts receives no overlap warning, despite the map declaring their shared participants.

6. **P2 — Excluding a synonym counts as searching it.** [absence-searches.ts:81](<tree>/apps/research-mcp/src/absence-searches.ts:81)  
   Declare `Pilostigma reticulatum` as a searched variant and supply a receipt for `"Piliostigma reticulatum" NOT "Pilostigma reticulatum"`. Every variant word appears, so this returns true. Finalization then credits historical-name coverage and removes its corresponding warning, although the query expressly excluded the spelling that could contain contradictory efficacy or toxicity evidence.
