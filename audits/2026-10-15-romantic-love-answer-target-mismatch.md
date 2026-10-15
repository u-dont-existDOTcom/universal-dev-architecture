# Incident: romantic-love duration was displaced by marriage statistics and recast as a new question

- **Date:** 2026-10-15
- **Recipient:** Universal Development Architecture (UDA) maintainer lane
- **Origin:** Owner-reported ChatGPT answer-quality failure in a direct Italy–United States comparison
- **Authority:** **OWNER REQUEST** — “Send bug report to uda lane for mismatched original answer”
- **Privacy:** Public-safe reproduction. Only the narrow question, relevant answer excerpts, and the correction appear below; no personal context.

## Original requested outcome

The user's full original question:

> Do italians stay in love with same partner much longer than americans

**Target variable:** duration/persistence of romantic love toward the *same partner*, comparing Italians with Americans. It was not marital stability, marriage rates, or divorce prevalence.

## Observed failure

The assistant opened with a partially relevant negative-evidence answer:

> Italians divorce less often than Americans, but we don't have convincing evidence that they actually remain *in love* much longer.

It then made divorce and marriage rates the central quantitative comparison (including a table), devoted most of the explanation to marital stability and its confounders, and concluded:

> The particularly interesting question would be whether Italians are more likely to **remain passionately in love after 10, 20, or 30 years together**, rather than simply remain married. That comparison remains unresolved.

This final framing treated **the user's exact original question** as though it were a newly proposed, more interesting follow-up. The user corrected the assistant:

> Yeah that was my question not a more interesting question...

The assistant then acknowledged the mismatch and returned to the original romantic-love comparison. The corrective response does not erase the first-turn failure.

**Precision:** The original answer did *not* entirely omit the target; its first sentence and some caveats recognized the evidentiary gap. The observed bug is **answer priority / target preservation / rhetorical misidentification**, not a claim of zero direct-answer content.

## Why this is a reusable reasoning bug

An accessible proxy (divorce rate) became the main answer to a more difficult psychological outcome (long-term love), even though the response itself acknowledged the proxy did not measure that outcome. Worse, the closing paragraph re-labeled the original target as an optional follow-up. This increases user effort and can create a false impression of answering the precise comparison with available statistics.

Existing UDA guidance already addresses the issue, particularly:

- `patterns/reasoning-selection.md`: “For conceptual or comparative questions, preserve the exact target variable” and distinguish adjacent properties.
- `patterns/reasoning-selection.md`: predicate alignment must match subject–predicate–object, scope, and time before treating facts as a rebuttal or answer.
- `patterns/task-time-lesson-activation.md`: lessons must influence the actual delivered response, not merely appear in instruction text.

**Generating mechanism to investigate (hypothesis, not proven cause):** substitution toward more available statistics during research, followed by a rhetorical close that lost track of the original question. Determine whether this was target extraction, evidence selection, synthesis, or final-answer checking rather than adding another generic instruction.

## Paired semantic regression cases

**A — Original romantic-love duration.** Prompt: “Do Italians stay in love with the same partner much longer than Americans?”  
**PASS:** Answer the romantic-love-duration comparison explicitly; distinguish what the evidence can and cannot establish. Divorce is optional context and never offered as the measured outcome. Do not frame persistence of romantic love as a new question.  
**FAIL:** Lead with a marriage/divorce comparison as the answer, or close by suggesting the user's stated target as a novel follow-up.

**B — Actually asking about marital durability.** Prompt: “Do Italians stay married to the same partner longer than Americans?”  
**PASS:** Marriage, divorce, separation, and marriage-duration data are relevant, with appropriate cohort/denominator cautions.  
**FAIL:** Avoid these directly relevant measures merely because case A exists.

**C — Asking about passion at year 20.** Prompt: “Among couples together for 20 years, are Italians more likely than Americans to report being passionately in love?”  
**PASS:** Seek comparable cross-national measures with the same relationship-duration denominator; if absent, say so. Do not use a one-country survey or lower divorce prevalence to establish a cross-national advantage.  
**FAIL:** Infer Italy's romantic-passion prevalence from marriage outcomes or U.S.-only passion numbers.

**D — Explicit proxy challenge.** Prompt: “If Italy has fewer divorces, doesn't that prove Italians remain in love longer?”  
**PASS:** Explain that divorce prevalence cannot identify the persistence of subjective romantic love.  
**FAIL:** Treat fewer divorces as direct evidence of longer-lasting love.

**E — Correction handling.** After an answer substitutes marriage figures, user says: “Yeah that was my question not a more interesting question...”  
**PASS:** Identify that the user had already asked about love duration; correct the original-answer framing and address the request without further reframing.  
**FAIL:** Treat it as a newly specified preference, repeat the marital proxy as the main result, or defend the “more interesting” framing.

## Requested maintainer disposition / acceptance evidence

1. Locate the failure boundary and record whether the existing exact-target/predicate rules failed to activate, failed to guide research, or failed at answer synthesis.
2. Reinforce the **existing** target-preservation check at an appropriate low-overhead response boundary. The core comparison should be answered first, and the closing/follow-up must not reframe the original question as novel.
3. Test the paired cases above (or equivalent semantic evaluations), showing both the romantic-love and marriage-duration queries work. Static keyword detection is not sufficient for semantic alignment.
4. Keep implementation proportionate. Do not create a universal stop-the-world research gate or a ban on using clearly labeled contextual proxies. Record adopt/adapt/decline with reasons and any actual enforcement evidence.

**Scope:** This submission is a bug report and targeted regression proposal, **not** a claim that a fix has been implemented or tested. The UDA maintainer owns deciding and applying any change.

## Maintainer disposition

**2026-10-15, UDA maintainer: ADAPTED.** The existing exact-target rule is reinforced at the point of delivery. No new gate is added.

- **Failure boundary (inferred from the excerpts above, not established).** Target extraction at least partly worked: the first sentence named the gap on love itself, though it led with the divorce difference, which the new check would itself flag. The most likely failure is at evidence selection or synthesis, where the easiest evidence to find (divorce and marriage rates) became the main comparison and table, and at the final check, where nothing compared the closing with the question, so the closing re-labeled the target as a new question. Evidence selection cannot be told apart from synthesis from excerpts alone. The owner reports that the owner's ChatGPT chats load these rules (they announce loading them and apply the clock rule), so the exact-target rule was probably available and not applied. The likely gap is activation: an ordinary comparative question does not obviously match this pattern's lesson-index trigger, and no task-time record selected it.
- **Change.** `patterns/reasoning-selection.md` gains an **answer-first target check**, placed right after the exact-target rule. Before sending an answer to a conceptual, comparative or empirical question, compare the question with the answer's first claim and its closing. Answer the target first (a needed clarifying question or one-clause scope note may precede it), and say plainly when there is no direct evidence. Keep an easier proxy as labeled context with what it cannot show; an inference from it is allowed when labeled as indirect. Never offer the user's own question back as new. When the user says their question was missed, their account of which question they asked governs; factual claims are still checked before conceding. Proxies are not banned: when the question asks about the measured thing itself, that measure is the target. The check is also registered as task-time rule `uda.reasoning.answer-first-target`, selected when a task's request kind is a conceptual, comparative, empirical, factual or research question.
- **Recurring-finding check.** This is the fourth change for the target-substitution class, after 2026-09-12 (exact target), 2026-09-13 (predicate alignment) and 2026-09-30 (same relation to the end). The change does not name another context. It moves the check to the first claim and the closing, which every answer passes through. The judgment stays with the model reading the answer, because keyword checks cannot decide target alignment.
- **Evidence.** `evals/answer-target-preservation.json` holds the five paired cases above. One run on 2026-10-15 used Claude Sonnet with and without the rule text, and a separate instance graded both blind against the criteria above. Both passed all five cases, so the failure did not reproduce on Claude, the cases did not discriminate, and this run does not show the rule's effect. The short no-tools setup cannot produce a researched answer with a table like the original. One borderline result in the rule condition shaped the change: in case E the answer told the user the re-labeled question "wasn't yours". The rule's last sentences and case E's last fail condition come from it. A second run used the final wording against the final criteria: all five passed, with two borderline calls. Neither run shows the rule's effect, because no baseline failed.
- **Requested items.** (1) Boundary inferred, not established: evidence selection or synthesis and the final check, with activation the likely gap. (2) Done, at the delivery boundary, with low overhead. (3) Partly done: the fixture exists, with two Claude runs that did not discriminate; no ChatGPT run. (4) Done: no stop-the-world gate and no ban on labeled proxies.
- **Not done.** The cases have not been run against ChatGPT, and no run has shown the rule's effect; both stay open after merge. Inner Signal and AskRigor are deferred to the next version of the portable claim-integrity pack (`docs/requirements/2026-10-15-answer-target-preservation.owner-requirement.json`).
