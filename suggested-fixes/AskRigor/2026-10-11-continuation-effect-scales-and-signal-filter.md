# Preserve AskRigor across continuations; quantify effects; surface only high-value leads

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-11, by ChatGPT reasoning chat
- From: 2026-10-11 owner-directed correction during continuing specialist herbal-benefit research; generalized and privacy-safe
- Owner request: yes — carry AskRigor use through continuing research turns without restating the app; require interpretable effect sizes and keep low-value leads out of the main answer
- Existing pull request: none
- Supersedes: none

## What to do

1. **Fix Universal activation persistence.** Inspect `protocols/Universal_Instructions.xml`, especially `<askrigor_keyword>`, current protocol activation and continuity semantics. The present condition "Whenever I include AskRigor anywhere in a new message" misses a follow-up such as "continue" or a closely related new botanical target without repeating the word. Add a clear active-mission carry-forward rule. In an already active AskRigor research mission, the exact authorized connector remains required for substantive source work and its current protocols/gates remain active unless the user explicitly opts out, the mission ends, or capability is unavailable. Merely quoting the rules is not the same as invoking the available plugin. On tool unavailability, identify the exact boundary, do safe remaining work, and do not claim completed AskRigor research.
2. **Make effect sizes interpretable.** In HRP's existing `ComparisonEstimandAndDoseExposureIntegrityGate`, `QuantitativeRiskAndResearchAudit` or `OutputFormatting` (choose one normative owner, deduplicate), ensure clinical outcome summaries include the **full score range and direction**, group denominators, baseline/follow-up, between-group absolute differences, timing, uncertainty where available, and clinically meaningful threshold when published. For binary outcomes use events/eligible and absolute percentage-point difference. For inconsistent/missing denominators or mismatched scales make the absence explicit and do not inflate or normalize. Require relative superiority to a standard treatment only when comparators/endpoints/populations match.
3. **Reader-value gate.** The owner wants uncommon, potentially breakthrough plant preparations, with famous treatments such as berberine as reference comparators. After screening, only genuinely decision-changing, plausible large or distinct effects remain in main prose. Weak, refuted, non-comparable, contraindicated, tiny or stale leads go into the supporting research appendix with their sources (or remain internal if no reusable appendix is called for). A prior featured claim that is materially reversed gets a short correction, not a lengthy "first interesting, then disappointing" narration. A verified negative landscape result ("nothing yet beats comparator") can be stated concisely after sufficient coverage. Preserve full discovery breadth internally; this is an **output filter**, not a search-scope restriction.
4. **End-to-end enforcement.** Confirm the tool server/client exposes the fields needed for `finalize_research`. Acquisition, validated audit and finalization are distinct completion states; when only part succeeds, report that part. A stale client tool schema must not produce impossible required fields without an explicit refresh path. Extend the project's actual protocol tests, exact version/date hashes, and task-time activation. Check any existing overlapping fixes in the local suggested-fix ledger before duplicating requirements.
5. **Acceptance receipt.** After implementation and owner-required policy review, verify the **installed public consumer seam** using a multi-turn test, the canonical protocol text, regression tests and an actual connector call; don't certify effectiveness from source edits alone. Record disposition/PR/version in `docs/suggested-fixes-ledger.md`. No deployment is authorized by this proposal alone.

## Why

The research service was used for source retrieval on some turns, but the final visible answer lacked a properly contextualized outcome magnitude and full protocol finalization. Existing `<askrigor_keyword>` binds activation to a literal word in a new message, which fails a task continuing with "continue". Several weak leads were featured in prose even though the owner wanted only candidates plausibly exceeding standard treatments. These are separable failures: task inheritance, provider execution/admission, measurement interpretation, and reader attention.

## Check first

- Current `protocols/Universal_Instructions.xml` version **20.5.37** as exposed by the connected AskRigor service on 2026-10-11; authoritative repository bytes and version may be newer. Current `<askrigor_keyword>` contains "Whenever I include AskRigor anywhere in a new message" and requires `finalize_research`.
- Current HRP service version **20.6.15**. `ComparisonEstimandAndDoseExposureIntegrityGate` already has `PrimaryOutcomeContinuity` and `CrossAgentRankingResolution`; preserve these rather than duplicate them. `OutputFormatting` already says "numbers before verbal labels". This proposal adds **scale interpretability, continuation binding, and headline selectivity**, not a replacement.
- `project/PROJECT_INSTRUCTIONS.md`, the actual specialist connector adapter, and the finalizer's exposed schema. Compare current read-back with release metadata.
- UDA PR in this same change introduces the portable research-continuity rule; adopt locally only what materially applies to AskRigor's public runtime.
- Existing suggested-fixes ledger and unmerged protocol PRs; do not overwrite concurrent current work.

## Exact text (suggested, adapt to existing XML)

For Universal near `<askrigor_keyword>`:

```xml
<rule name="ActiveAskRigorResearchContinuation" priority="Critical">
  An existing AskRigor research task retains its active specialist connector and applicable protocol obligations across "continue", "interrupted", clarifications, and related changes of research target. Do not require the user to repeat the word AskRigor. When the authorized connector is available, invoke it for substantive research in the continuing task, not merely discuss its protocols. Re-evaluate modules if the research question changes. Preserve unresolved finalization and source-coverage gates until executed or explicitly bounded. Release the mode only on explicit opt-out, completed or superseded task, unrelated new task, or unavailable access; disclose an access boundary rather than claiming full compliance.
</rule>
```

For the current HRP normative home for quantitative interpretation:

```xml
<Rule name="ReaderInterpretableClinicalMagnitude" priority="Critical">
  Every reader-facing clinically meaningful numeric effect must identify its actual instrument/endpoint and time horizon; a symptom scale's full valid range and direction (for example IBS-SSS 0–500, higher=worse), baseline and final values and change by arm when available, intervention and comparator counts (events/eligible for binary outcomes), the absolute between-arm contrast in the same units, and confidence/uncertainty when available. State material attrition and any published clinically meaningful threshold. Never describe bare scale points or within-arm percentages as clinical magnitude without the denominator or a comparator. Do not extrapolate between mismatched scales, diagnoses, preparations or research stages.
</Rule>
```

For HRP output control:

```xml
<Rule name="DecisionRelevantDiscoveryPresentation" priority="Critical">
  Broadly discover and preserve all candidate records; show in the main answer only verified decision-changing findings and genuinely promising, non-refuted frontier leads, prioritizing user-named novelty, impact, identity, safety and availability. Keep lower-value, ultimately unsupported, noncomparable and rejected leads in the research appendix (or internal ledger); do not narrate their full discovery-and-dismissal arcs unless correcting a previously consequential claim. Benchmarks are context, not discoveries. Report no verified breakthrough when appropriate, without implying a completed landscape sweep unless coverage proves it.
</Rule>
```

## Regression tests (required)

1. User turn: "Use AskRigor to find rare plants for endurance"; next turn "continue"; next turn "focus on rare IBS/SIBO plants, standard agents only comparators"; next turn "continue." All in-scope research turns must invoke current AskRigor connector when connected, load appropriate live protocols, and keep finalizer obligations.
2. Explicit "do not use AskRigor anymore" or an unrelated simple question terminates inherited mode; unavailable connector is explained without pretending the research was completed with it.
3. A paper gives IBS-SSS 375→282 versus placebo 390→394 with 101 randomized but only 76 analyzed. The answer must report **IBS-SSS 0–500, higher=worse; intervention −93, placebo +4, group difference in changes −97 scale points**, and **25/101 missing**; do not present 93 as an unqualified impressive effect. If the published instrument's declared range conflicts with its table, flag the source contradiction.
4. A binary clinical report of 28 versus 8 responders with incomplete group denominators must NOT turn into percent response or risk ratio without reconciling those denominators; move unreliable magnitude to appendix.
5. A researched plant shows a huge animal/in vitro effect but no directly relevant human outcome and safety concerns; the main answer retains the actual meaningful new shortlist, while the rejected lead is recorded in the appendix, with any consequential correction one sentence.
6. Tool acquisition succeeds but `finalize_research` returns `not_ready` owing to outdated schema: output says what AskRigor did and did not finish; receipt and refresh route preserved.

No private health narratives, raw user messages, proprietary dataset, or community user identifiers are included in this public submission.
