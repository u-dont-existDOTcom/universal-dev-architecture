# Show evidence-access depth for every material study in AskRigor health research answers

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-11, by ChatGPT research continuation agent
- From: user-identified failure in an ongoing botanical IBS/SIBO literature review (no private account data retained). Related comparison-integrity report: AskRigor issue #310.
- Owner request: yes — “i notice you aren't always telling me whether you read the full study or just the abstract. does askrigor not require that? it should, send report to askrigor”
- Existing pull request: none
- Supersedes: none

## What to do

Implement a mandatory **user-visible, per-material-study source-depth marker** at point of claim or in a compact accompanying evidence table; do not hide it solely in a global limitations paragraph, citation, footnote, or internal receipt. This is a project-specific public AskRigor behavior, not a duplicate UDA instruction.

Status vocabulary to cover:
- **Full study inspected**: exact identified complete methods and results read, with provenance and version, not merely a URL to PDF. If not all tables/supplements available, say so.
- **Full text extracted but incomplete/uncertain**: distinguish extraction with missing figures/tables from truly complete inspection.
- **Full text located, not yet inspected**: fetching/acquisition is not reading, nor a validated method audit.
- **Study-method audit validated**: only when the actual source-linked full-text audit validation succeeded. Do not conflate it with reading full text.
- **Partial text only**, **abstract only**, **conference abstract only**, **review-derived or secondary summary only**, **citation/metadata only**, **source inaccessible**, **fetch/route error**, and **identity unresolved**.

Use concise consistent phrasing, e.g. `[Full text inspected; method audit pending]`, `[Abstract only; critical methods unverified]` or a table's `Evidence actually read` column. Each table row and every major ranked or recommended intervention must be traceable to at least one status. A full-text *review* does not upgrade the primary studies it discusses to full text read. A full-text tool return with `exhausted:false` does not prove full inspection. If an exact full text was exhausted but the source-linked audit failed/was skipped, state both separately. Show evidence depth even when user requests concise presentation, prioritizing the studies that drive the ranking; append a grouped status ledger for other studies.

At finalization, mechanically compare material studies actually used in the answer with read-depth markers and underlying access/audit receipts. Fail the public research completion status if the final output omits any or implies broader inspection than occurred. Preserve a bounded partial answer when required access is impossible, with the marker intact. Apply source-depth labeling to gray/ethnographic field records and primary-vs-secondary research where relevant, not just journal studies. Keep complete abstracts as usable leads, not as audited full-text findings.

## Why

The current **HRP v20.6.15 already requires** `UniversalFullTextAcquisitionProtocol/FullTextAccessStatusClassification` (classify full text inspected vs extraction vs partial vs abstract vs error), `NoSilentAbstractSubstitution`, `SourceVerificationAndCitationAudit/AbstractPreambleAndEscalation`, `StudyMethodReliabilityGate/AccessibleFullTextFirst`, and `OutputFormatting/ClaimLevelUncertainty`. The research output nevertheless repeatedly presented numerical study claims without saying whether they came from original full texts or just PubMed abstracts. Some passages represented full text read and validated method audit as if synonymous; others used independent metadata/abstract access. This is an **answer-generation + validation/enforcement + evidence ledger propagation defect**, not an absence of all protocol language.

A reader cannot judge certainty without knowing what actually was examined, and silent abstraction can inflate claims and hide attrition, adverse effects, endpoints, dose/form and subgroup problems. The owner already requested study access explicitly.

## Check first

1. Inspect current HRP and Universal canonical XML, finalizer fields and public output shape. Determine whether clause already mandates individual user-visible markers; repair the missing enforcement/representation rather than redundantly adding lengthy prose.
2. Consult issue #310 to coordinate with the same trial-evidence / comparator-integrity class; avoid solving an unrelated finalizer schema failure by adding a new hard dependency.
3. Test **public AskRigor without UDA** as the product pass condition. An internal UDA rescue must be detected and reported as such, not credited to public instructions.
4. Preserve a legitimate partial or bounded answer when some PDFs are inaccessible; the gate protects truthful disclosure, not perfection or forced full-text retrieval of peripheral citations.
5. Validate canonical instructions, packaging, deterministic regression tests and the fresh installed runtime before saying this is fixed or deployed.

## Regression tests

- Three decisive studies: one exact original full text inspected to completion but method audit unvalidated; one abstract-only result; one full-text review that **cites** a study whose original full text was **not** fetched. Answer must show three distinct markers **at the relevant claims**. No unqualified “studies show”.
- A source is `acquire_open_full_text:full_text_available` but `coverage_receipt.exhausted=false`: must not say “read full study”.
- A source has `coverage_receipt.exhausted=true` but method-audit validation fails: “full text read, methodological audit incomplete/failed,” not “HRP verified.”
- A conference abstract with apparently large effect and no methods/tables: must say conference abstract only, never conflate with a completed RCT report.
- Multiple rows in a ranked table: deleting the source-depth marker from one row causes the answer finalizer to reject research-complete while preserving the rest of the correct research.
- An upstream tool fetch error (including stale finalizer schema): classifies route error, not proven inaccessibility.
- UDA disabled and only a “continue” prompt sent after earlier AskRigor invocation: still uses public AskRigor and provides access-status markers independently of UDA.

## Exact text

“When citing a study as material support for a treatment claim or ranking, state in the answer whether its actual original full text (including relevant methods/results) was inspected, whether only extracted/partial text, abstract, conference abstract, or secondary description was read, and whether its source-linked methods audit was validated. Do this beside the claim or in the same evidence table; distinguish full-text availability from full-text inspection and method-audit completion. If the status is unknown, say unknown rather than implying full inspection.”