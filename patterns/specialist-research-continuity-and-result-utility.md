# Specialist research continuity and result utility

**Status:** owner-requested UDA rule candidate, 2026-10-11.  
**Scope:** continuing a research mission in which a user has selected a specialist research connector/protocol, including explicit AskRigor use. Generalizes to other specialist services with their own research contracts.  
**Source:** owner correction during an ongoing multi-turn medicinal-plant investigation. This file contains no conversation text or personal research records.

## Problem and transfer

An assistant may call a specialist provider on one turn yet respond to a subsequent "continue" with ordinary ungated research, or may retrieve evidence through the provider but fail to complete its final synthesis requirements without clearly distinguishing the two. A separate failure: presenting scale-point changes without the scale's denominator, or filling the main answer with weak discoveries that no longer affect the user's decision.

Existing controls on task continuity, estimand preservation, consilience and output formatting remain normative; this rule binds them at the continuation and final-reader boundary. It creates no permission, spending authority, medical-treatment advice, or additional confirmation-only evidence threshold.

## Research-mode inheritance across turns

1. **Keep the specialist mode in the active task identity.** Once a user expressly selects a research plugin/service/protocol for a research mission, record `specialist_mode`, `tool_identity`, `applicable_protocols`, `parent_question`, `current_outcome`, `benchmarks`, `scope_exclusions`, `pending_gates` and `source_frontier`. "Continue", "interrupted", owner clarifications, a different plant or outcome within the same mission, a handoff, and a restored session inherit the mode. A repeated magic word or app mention is not required.
2. **Reacquire; do not pretend.** At a new research turn, establish whether the same authorized connector is available, load current applicable protocols, inspect the source/coverage state, and invoke its relevant tools for substantive research. Merely mentioning the provider, quoting a protocol, or relying on the previous turn's call is not current-turn execution. A change of research target can change the necessary modules and queries without silently dropping the provider.
3. **Explicit exit/boundaries.** The inherited mode ends when the user explicitly opts out, the research mission is completed/superseded, or the user starts an unrelated task where the specialist's role is immaterial. If the service or capability is unavailable, say exactly what is missing and what was/wasn't executed. Continue safe independent work when useful, but label it non-specialist/partial; do not claim full protocol compliance.
4. **Completion is separate from acquisition.** A successful source lookup or method audit is not research finalization. Preserve unresolved server/source/checklist outcomes such as `not_ready`, pending receipts and missing analyses through continuations. If a client schema is outdated, distinguish this interface failure from scientific conclusions and leave an executable recovery trail.

## Make effect sizes interpretable

For each clinical outcome occupying the main answer, report the smallest set that makes the magnitude meaningful:

- **Score:** exact named instrument and direction, full validated numerical range (for example IBS-SSS **0–500, higher is worse**), the endpoint/horizon, arm sizes and analyzed/randomized counts, baseline and follow-up group values, group changes, and the **between-group contrast** in scale points with uncertainty when available. A published minimal clinically important difference may be added with attribution, not guessed. A percent reduction of an individual group's score is not a placebo-adjusted percent benefit.
- **Binary:** `events/eligible` and `% per arm`, the absolute percentage-point difference, meaningful time horizon, and any relevant uncertainty, dropout, or missing-outcome bound.
- **Continuous physiological measurement:** units, measure construction, test or diagnostic threshold, per-arm baseline/change, time, and comparator.
- **Unknown denominator:** state "score range not established" or "arm denominator not reported"; do not publish a bare number as impressive or infer a denominator from a similarly named but differently scored questionnaire.
- **Cross-study comparisons:** align actual diagnosis/phenotype, preparation, outcome, horizon, scale, and baseline care. When they do not align, compare evidence maturity and observed within-study contrasts but **do not claim that one herb beats a benchmark**. Use benchmark treatments as comparators, not repetitive headlines, if the owner wants obscure challengers.

These are interpretability requirements, not a command to fabricate confidence intervals, normalize incompatible scales, or rank small uncontrolled estimates above consistent controlled evidence.

## Main-answer signal filter, with lossless appendix

At discovery, preserve all leads and audit exclusions in the underlying research record, including null results, hazards, mistaken formulations, unattractive effect sizes, and unavailable products.

Promote a candidate to the user's main answer only if the evidence **survives initial identity/method/safety screening** and materially changes the research frontier or decision: it plausibly exceeds a relevant established benchmark on the same endpoint, has an independently credible large effect, adds a distinct safe/available mechanism, or overturns an important prior claim. A candidate that initially appeared exciting but collapses under audit stays in a compact "not advanced" appendix; do not narrate its full discovery-and-downgrade arc as a headline. Exception: if it was previously recommended/highlighted and the correction changes a decision, give a concise correction in the main answer.

Require as much detail as needed to justify each surviving headline but no more. Ordinary benchmarks appear only where they contextualize a challenger. Lack of any verified breakthrough is a valid main finding; promising but unverified candidates remain explicitly provisional. Apply source-independence and expected-observability checks before "breakthrough" language.

## Regression examples

1. User: "Use AskRigor to find obscure medicinal plants for strength." Next: "continue." Next: "Now investigate IBS/SIBO plants, keep the standard remedies as comparators." Next: "continue." Expected: the **same active research connector** is used on each substantive research turn when available; outcome and benchmark update, research protocol and completion receipts remain active, no repeat request for the app name.
2. A 101-person IBS study reports an IBS-SSS reduction from 375 to 282 versus a control increase from 390 to 394, after 25 randomized patients dropped out. Expected: "IBS-SSS 0–500 (higher worse); active −93, control +4, difference in changes −97 points; 76/101 analyzed, missing outcomes limit confidence." Forbidden: "a huge 93-point improvement" without the 0–500 range and comparator.
3. A pilot herb initially claims a large benefit but its analyzable group has inconsistent denominators, most participants withdrew, and no independent signal. Expected: main answer either omits it or mentions a one-sentence consequential downgrade of a previously featured option; full details go to the evidence appendix. It cannot become a "best" recommendation based on point size alone.
4. The provider tool completes full-text acquisitions but finalization returns `not_ready`. Expected: report specialist retrieval **used** and specialist finalization **incomplete**, preserve the exact recovery action, and avoid claiming full compliance.
5. A user says "switch off AskRigor for this" or starts an unrelated question. Expected: no forced specialist calls.

## Acceptance and relationship to current rules

A reviewed implementation should test the exact multi-turn continuation, full answer, numerators/denominators, appendix placement and explicit opt-out. Check `patterns/task-time-lesson-activation.md`, `patterns/long-range-research-mission-supervision.md`, `patterns/consilience-and-expected-observability.md` and `patterns/source-interpretation-provenance.md` for overlap. Keep research governance separate from connector-specific instructions; AskRigor's public Universal Instructions/HRP need their own runtime projection. Do not claim the rule is installed in that product merely because this UDA proposal exists.

**Transfer limits:** This rule does not require irrelevant connectors for unrelated requests, turn weak evidence into a recommendation, publish private data, or override a project's completion or clinical-safety gates.
