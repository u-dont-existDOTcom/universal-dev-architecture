# Enforce user-value and owner-goal alignment at the final research output

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-14, by ChatGPT Atlas research auditor
- From: owner-requested debug after a practitioner/community outcome research report selected an adjacent resultless registry study rather than the relevant high-impact patient cases
- Owner request: yes, diagnose the weak 'need not' wording/enforcement and file a concrete bug report
- Existing pull request: UDA PR #375 contains a preliminary unmerged high-value-summary suggestion; this adds code-location diagnosis and regression
- Supersedes: the 2026-10-13 high-value-leads suggestion as a proposed repair, subject to receiving team's reconciliation

## What to do

Inspect the actual boundary between evidence discovery and final owner-facing text. On current AskRigor main, `apps/research-mcp/src/actions/research-report-synthesis.ts` defines `readerReportPacketBaseSchema` with free-form `bottom_line` and `comparative_conclusion` text, and `validateReportPacket()` checks reference IDs, program identity, source freshness/capabilities, access-limit preservation, and exact video listing. It does **not** enforce a connection between the owner's decision objective, top-ranked patient-important evidence, and the chosen reader-facing bottom lines; nothing verifies that findings with no efficacy outcomes should remain internal rather than appear prominently.

The controlling canonical HRP *already contains Critical rules*, not optional 'need not' suggestions: `EvidenceLayersAreNotAFixedDiscoveryOrder`, `ClaimSpecificEvidenceUtility`, `RelevanceControlsInclusionWeightControlsConclusion`. Diagnose why these rules failed at the semantic submission/finalization seam; add a minimal tested, server-owned admission condition binding report priorities to the stated user objective and evidence. Preserve semantic/model review for relevance judgment; do not use keyword counting. Do not replace the user objective with method adherence.

For novelty/breakthrough discovery, the external summary should prioritize patient-important positive, null, and harmful outcomes for exact practitioner interventions plus decision-changing verification limits; a completed trial with **no reported outcomes** on an **unmatched formulation** can remain in research ledgers but should not consume a prominent owner-facing result slot unless its absence is itself decision-relevant. A full report and its short summary must agree on top findings, their effects, their evidence status, and any blocked primary-corpus access.

## Why

The actual public summary introduced a generic probiotic histamine study, NCT07397962, involving a six-species product without posted results. The original practitioner intervention focused on Bifidobacterium-only or fermented colostrum; the study did not answer it. Meanwhile high-impact but unconfirmed AMD neuropathy, fibromyalgia and severe respiratory recovery reports were present in the research source but missing from the summary. This is a relevance and output-selection failure, not an objection to correctly preserving null records internally.

## Check first

1. Inspect `research-report-synthesis.ts` `readerReportPacketBaseSchema`, `createReportSynthesisWorkPackage`, `validateReportPacket`, `research-treatment-finalization.ts`, and real report outputs. Establish whether the demonstrated weakness is specific to the user-facing ChatGPT summary written outside the AskRigor report Action; do not incorrectly claim a server regression caused a chat-only response.
2. Regression A: synthetic breakthrough-remedy task; ledger includes several unusual treatment recoveries with huge reported effects and negative cases; related six-strain probiotic registry contains only 'completed, no results'. The owner-facing summary must not highlight that study, but must describe the unusual leads with exact effect and uncertainty.
3. Regression B: report covers only easily retrieved conventional RCTs while a required practitioner testimony archive remains inaccessible. Disallow 'completed breakthrough discovery' framing; preserve access boundary and owner-directed next action.
4. Regression C: old guideline says 'need not'; application/final output is still tested for behavior. Avoid equating loaded critical instruction text with an installed hard gate.

Do not require automatic publishing of uncontrolled patient anecdotes as treatment advice. No paid API/model inference, production deploy, protocol change or irreversible release without project authority.
