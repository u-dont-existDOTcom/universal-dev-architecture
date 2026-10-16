# Research-answer regression: covert communication versus stimulus-linked subjective report

Date: 2026-10-15. Owner-requested UDA lane bug report. Source: a conversation with a user, summarized without transcripts, identifying data, or personal medical information. Status: proposed repair, not deployed.

## Observed failure

The assistant discussed neural responses to potentially harmful stimulation in behaviorally unresponsive people and distinguished such activity from subjective experience. When the user suggested a brain-computer yes/no question, the assistant asserted that an earlier patient's general answer about *ongoing* pain had already tested the user's concept.

The user's actual target was different: whether an established nonmotor communication channel can report an experience during a *contemporaneous, medically approved* experimental stimulus. A general baseline answer is not evidence about a specifically timed intervention.

The assistant also failed to mention the most relevant nearby hypothesis on its own before the correction.

## Existing controls and suggested repair

Applies to LF-1.1 (target substitution) and evidence-method mismatch under the existing reasoning-selection and source-interpretation rules. Before saying a study "already did precisely that", check the stimulus, comparator, timing, exact question, and reported outcome. When distinguishing objective neurological processing from unobservable subjective experience, and a communication channel is established, consider mentioning the obvious direct-report comparison when relevant. Never infer a negative subjective state from a missing decoded signal.

Do not promote a speculative reason for a missing study to established fact. The 2024 Schiff et al. BCI roadmap (DOI 10.1007/s12028-023-01924-w) noted absence of nociceptive stimuli as BCI applications then, a narrower scope than all subjective-report experiments. The 2026 Contrada et al. position paper (DOI 10.1002/ejp.70332) reinforces the uncertainty.

## Acceptance

Regression cases must distinguish a contemporaneous controlled-stimulus question from an unstimulated baseline-pain question, and proactively suggest that comparison when it naturally follows. Verify actual research before making an absence or prior-completion claim.

Companion research evaluation is proposed for AskRigor. No runtime verification has been performed.

## Maintainer disposition

**2026-10-15, UDA maintainer: COVERED BY EXISTING CHECKS.** No new rule is added, as the report asked.

- **Failure class.** Target substitution (LF-1.1). An answer to a nearby question was treated as if it had tested the user's question: a patient's answer about ongoing pain stood in for a report during a controlled, timed stimulus. This is the second report of the class on the same day, after `audits/2026-10-15-romantic-love-answer-target-mismatch.md`.
- **Checks that already decide it.** The answer-first target check in `patterns/reasoning-selection.md` (added for the romantic-love report) keeps a nearby result as labeled context with what it cannot show; here, a baseline answer cannot show anything about a timed stimulus. The predicate-alignment check applies too. Saying a study "already did precisely that" rebuts the user's proposal, so the study has to match it in subject, predicate, condition and time. A question about ongoing pain without a stimulus does not match a question about pain during a given stimulus.
- **Recurring-finding check.** The answering model reading the question is what decides this class, and these checks already ask for that. A new rule about "already done" claims or brain-interface questions would be a local special case. The likely gap is activation, as in the romantic-love report. Both answers came from ChatGPT, and the answer-first check is now registered as a task-time rule for conceptual, comparative, empirical, factual and research questions. If the class recurs once that is live, the next step is a discriminating evaluation on ChatGPT, not another rule.
- **The missed test.** The user's first question asked how the link to experience could be tested. The most direct test was the answer to that question: ask through an established brain channel during a controlled stimulus, against a matched non-painful control. Under the answer-first check, an answer to "how could we test it" leads with the most direct test it knows, so nothing new is needed.
- **Evidence.** The four-turn fixture and its criteria are in `suggested-fixes/AskRigor/2026-10-15-stimulus-locked-pain-bci-research-test.md`, for AskRigor's own agent to evaluate under its protocol.
- **Not done.** No model was run on this case. The maintainer did not re-read the sources the report cites. Nothing here shows a change in behavior.
