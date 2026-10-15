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
