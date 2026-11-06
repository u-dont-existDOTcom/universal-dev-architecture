# Enforce patient-valued outcomes before surrogate metrics for breakthrough treatment discovery

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-14, by ChatGPT Atlas research auditor
- From: owner-requested source and code recheck of an outcome-confused clinical evidence summary
- Owner request: yes, debug the wrong-endpoint validation and file a concrete bug report
- Existing pull request: UDA PR #375 contains a preliminary unmerged endpoint and record-ID suggestion; this provides a code-location and construct-validity implementation target
- Supersedes: the 2026-10-13 clinical-outcomes-vs-fungal-tests-and-record-ids suggestion as a proposed repair, pending recipient reconciliation

## What to do

For an intervention-discovery mission, first define what genuinely improves a patient's condition: symptoms, function, durability, survival or a meaningful lived outcome. Keep objective tests, laboratory markers, cultures, histology, imaging and mechanism data, but label their separate roles: clinical primary endpoint, supportive objective endpoint, surrogate, etiologic/pathogen proof, safety, or contradiction. A negative microbiological test is not an acceptable substitute for unresolved painful symptomatic disease, just as improvement in symptoms does not automatically establish pathogen eradication or a causal cure.

Inspect `apps/research-mcp/src/actions/research-report-synthesis.ts`: `readerReportClaimCoreSchema` has undifferentiated free-text `outcome_and_horizon`; `validateReportPacket` validates structural/reference/formulation consistency but does not enforce endpoint construct validity or make user-valued improvement primary where the mission requires it. Propose a testable report-entry/semantic admission step that compares user objective -> outcome role -> evidence/uncertainty -> synthesized verdict, without making a generic new laboratory-test ban.

For condition-specific clinical research, retain the exact specimen/test and observed symptom change, including discordances. Do not call positive symptoms 'microbiological eradication' or casually call apparently healed nails 'infection cured' without a defined target; but do not dismiss sustained complete clinical recovery merely because no negative culture was collected. Differentiate nail shedding with nonregrowth from healthy nail regrowth, disease control from organism elimination, patient-reported symptom remission from unblinded causation, and prevention of recurrence from transient improvement. Include safety and possible treatment harms separately. All practical endpoints must be weighted by the user's discovery goal.

## Why

Two uncontrolled, unusual-treatment onychomycosis accounts documented marked symptom/function improvement and divergent nail recovery, while the evaluator repeatedly foregrounded missing microbiological cure verification even when that lab endpoint was not the treatment-discovery target. The opposite failure—proclaiming a permanent pathogen cure from symptom improvement alone—would also be unjustified. The root defect is a model/reporting output that replaces the asked clinical question with an attractive but different measurement question. The code currently ensures exact program matching, not endpoint relevance.

## Check first

1. Source-identity reconciliation before any automated case correction: in the historical Atlas pilot, fungal cases are P041/P042; supplied correction packet used P026/P027, already occupied by DMSO musculoskeletal cases.
2. Regression A: clinician-graded patient trial with complete sustained symptomatic recovery but no post-treatment culture. Output reports important clinical benefit and separately unverified clearance/causality; it must not reduce the result to 'unproven because no negative test'.
3. Regression B: negative culture but continuing severe pain and skin breakdown. Output cannot label the person clinically cured.
4. Regression C: observed healthy nail regrowth and restored function vs shedding without regrowth, both with uncontrolled exposure. Distinguish magnitude/durability and safety without upgrading to proven efficacy.
5. Check the final ChatGPT prose separate from the server-owned report Action: confirm where the endpoint was replaced before attributing root cause. Do not add another vaguely worded guideline if an actual semantic output gate is required.

No blanket alternative medical endorsement and no automatic promotion into canonical treatment evidence. No paid provider work or publication without owner authorization.
