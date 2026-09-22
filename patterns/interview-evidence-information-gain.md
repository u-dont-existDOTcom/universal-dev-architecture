# Interview evidence and information gain

## Purpose

Prevent interview and qualitative-measurement systems from confusing **more detail** with **more independent evidence**, imposing ritual anecdote quotas, or wasting participant effort on questions that cannot change the inference.

The governing invariant is:

> Ask the next question because it can discriminate among live interpretations, calibrate scope/frequency, expose exceptions, or resolve a required evidential gate — not because a preferred answer format feels more rigorous.

This pattern applies beyond interviews to surveys, chart review, qualitative coding, expert elicitation, investigative research, user research, and any workflow where a respondent supplies claims plus examples.

## Activation

Activate when designing, auditing, or conducting:

- interviews or interview agents;
- survey follow-ups;
- qualitative coding or annotation protocols;
- behavioral/personality measurement;
- recurrence/frequency elicitation;
- case-history or autobiographical evidence collection;
- expert elicitation;
- any method that asks for examples, episodes, incidents, counterexamples, or repeated-pattern reports.

Also activate when a project already has owner-supplied books, papers, manuals, transcripts, or a methodology corpus relevant to the interview/evidence design.

## 1. Retrieve relevant supplied methodology before bespoke design

If the owner/project has already supplied a methodology corpus relevant to the task, retrieve and inspect the relevant material before freezing or substantially refining a bespoke protocol.

Do not substitute remembered summaries, generic domain instincts, or a homemade method for available source authority. If the source corpus is large, search it for the specific methodological question rather than rereading everything indiscriminately.

This is a specialized application of `patterns/research-before-reinvention.md`: user-supplied methodology is prior work and may be more task-relevant than a generic literature scan.

If the corpus is unavailable, record the missing dependency rather than pretending it was consulted.

## 2. Specificity is not independence

A concrete incident may be more specific than a generalized statement, but specificity does not make it an independent observation.

Example:

- claim: `I always X`;
- follow-up: `Give me an example of X`;
- answer: a self-selected confirming anecdote.

That anecdote is conditionally sampled after the recurrence claim. It can clarify meaning, context, sequence, prerequisites, consequences, or an exception boundary, but merely being concrete does **not** independently strengthen the frequency proposition `I usually/always X`.

Do not count selected confirming examples as if they were random opportunities, independent replications, or an unbiased frequency sample.

The broader reasoning rule is:

> More detailed evidence can be more interpretable without being more independent.

Agreement, specificity, vividness, and repeated retelling are different properties from evidential independence.

## 3. Preserve direct behavioral recurrence self-report as evidence

A behavioral recurrence statement such as `I always checked the door before leaving` is direct evidence that the respondent reports/perceives that behavior as recurrent at the stated strength.

Do not demote it to zero evidence merely because it is not a bounded episode.

Preserve separately:

- the behavioral proposition;
- the respondent's quantifier (`always`, `usually`, `often`, `sometimes`, etc.);
- its scope/denominator;
- life period/context;
- stated exceptions;
- uncertainty in the quantifier.

Do not automatically upgrade ordinary-language `always` into a logically exceptionless universal. Calibrate it by scope and exceptions. If an exception is acknowledged, qualify the recurrence claim rather than rescuing the universal wording.

Distinguish behavioral recurrence from trait interpretation:

- `I always checked the door before leaving` = behavioral recurrence self-report;
- `I am always cautious` = primarily a trait/interpretive label unless behavioral content is supplied.

## 4. Exception-first recurrence probing

When a respondent gives a generalized behavioral recurrence statement such as `I always X`, the default follow-up sequence should target the denominator and possible falsifiers rather than solicit a confirming anecdote.

### 4.1 Define the scope/denominator

If unclear, ask what class of opportunities the quantifier applies to.

Examples:

- `When you say always, do you mean whenever [relevant opportunity] occurs?`
- `Which situations or life period are you talking about?`

A frequency claim without a meaningful denominator is underspecified.

### 4.2 Probe boundary conditions

Ask what conditions would lead the person not to X.

Example:

- `Are there any conditions where you would not X?`

### 4.3 Probe exception frequency

Ask how often the rule fails when the relevant opportunity occurs.

Example:

- `When those situations occur, how often does X not happen?`

Accept the respondent's natural resolution:

- never;
- almost never;
- sometimes;
- often;
- context-dependent;
- rough fraction/percentage;
- bounded count.

Do not force false numeric precision.

### 4.4 Probe temporal change only when relevant

Ask whether recurrence strength or boundary conditions changed across meaningful life periods if the construct requires temporal resolution.

### 4.5 Ask for a concrete incident only when it adds information

A specific incident is justified when it can resolve a live ambiguity, such as:

- what X actually means behaviorally;
- which of two plausible interpretations fits;
- temporal sequence;
- awareness, opportunity, feasibility, or non-action prerequisites;
- context dependence;
- the nature of an exception/counterexample;
- consequences or mechanisms relevant to the construct;
- whether a boundary condition actually applies.

Do not ask for a confirming anecdote solely to make an already-stated recurrence claim look better supported.

## 5. Counterexamples often have higher information value than confirming examples

For a strong recurrence claim, an exception can materially change the inference while another self-selected confirming example usually cannot.

Therefore, when the strongest uncertainty is whether a claimed rule has boundaries, prioritize:

- exceptions;
- failure cases;
- conditions under which the pattern changes;
- contexts in which the opposite behavior occurs;
- uncertainty about the denominator.

A concrete counterexample is not always necessary. If the respondent can state the boundary condition and approximate exception frequency clearly, preserve that directly. Ask for a specific exception episode only when it resolves further ambiguity.

Do not turn `counterexample seeking` into a ritual either; ask it when it can change the construct estimate or test a strong claim.

## 6. Use genuinely informative sampling for frequency claims

If the scientific target is the actual opportunity-level frequency rather than the respondent's self-reported recurrence, self-selected anecdotes are the wrong instrument.

Prefer, as appropriate:

- prospective diary/event sampling;
- random or structured opportunity sampling;
- bounded exhaustive enumeration of opportunities;
- externally logged/observed events;
- repeated measures with a defined sampling frame.

Do not pretend that several volunteered examples approximate a random sample merely because `n > 1`.

Keep distinct:

- self-reported recurrence;
- sampled opportunity-level frequency;
- concrete episode occurrence;
- trait interpretation;
- coder inference.

## 7. Do not collect evidence by format quota

Do not require `two episodes`, `three examples`, or another format quota unless that threshold has a defensible relationship to the inference being made.

A quota can create:

- selection bias;
- respondent burden;
- false confidence;
- duplicated/conditionally sampled evidence;
- pressure to invent or overinterpret anecdotes.

If the generalized self-report already answers the construct at the required resolution and no material uncertainty remains, stop asking for examples.

Ask the minimum additional question with expected information gain.

## 8. Separate evidence roles explicitly

A robust system should tag evidence by role rather than flattening all narrative into one pool.

Useful roles include:

- direct recurrence self-report;
- bounded episode observation;
- exception/counterexample;
- context/boundary statement;
- sampled opportunity-level observation;
- narrator interpretation/trait label;
- causal explanation;
- coder inference.

Do not let one role silently substitute for another.

## 9. Human judgment tasks need human-facing interfaces

If the substantive task is human annotation/judgment, JSON/JSONL/schema files are interchange formats, not an acceptable default user interface.

Provide a human-facing interface that:

- presents one judgment unit at a time in ordinary language;
- shows only evidence and rules authorized for that judgment;
- prevents impossible/schema-invalid combinations;
- captures uncertainty, exceptions, provenance, and notes without requiring knowledge of serialization;
- exports the exact machine-readable contract;
- does not alter the underlying measurement semantics;
- does not expose expected answers, automated labels, or target-model information when the pass must remain blind.

Do not mistake `machine-valid` for `human-usable`.

## 10. Stop and version the method when a conceptual defect is found before collection

If a material methodological defect is identified before the relevant data/calibration pass begins, do not collect data under the known-defective rule merely to preserve workflow chronology or sunk-cost continuity.

Instead:

1. preserve the old frozen artifact unchanged as historical development evidence;
2. record the defect and why it matters;
3. create a new versioned, theory/target-blind revision;
4. regenerate dependent development artifacts under the new version;
5. then collect the human/automated pass.

Do not silently reinterpret a frozen rule in place. Do not use target-model fit or desired outcomes to decide the revision.

This is a measurement-development correction, not license for post-hoc validation rescue.

## 11. Expected-information-gain gate for follow-up questions

Before asking a non-mandatory follow-up, identify what uncertainty it can reduce and what answer would change the interpretation, next question, code, or decision.

A practical test:

> If any plausible answer to this question would leave the inference unchanged, why am I asking it?

Exceptions:

- mandatory consent/safety/legal fields;
- provenance needed for auditability;
- explicit owner-requested fields;
- predetermined sampling required by a valid study design.

Otherwise, remove low-information ritual questions.

## Anti-patterns

Do not:

- equate `concrete` with `independent`;
- treat a self-selected example as an unbiased recurrence sample;
- ignore `I always X` because it is not an episode;
- treat ordinary-language `always` as automatically logically universal;
- rescue `always` after the respondent acknowledges exceptions;
- require anecdotes merely to satisfy an episode quota;
- ask only confirming questions after a recurrence claim;
- infer a frequency denominator that was never defined;
- force numerical precision the respondent does not possess;
- flatten recurrence claims, episodes, exceptions, trait labels and causal explanations into one evidence type;
- make humans hand-edit machine serialization as part of a substantive judgment task;
- continue a calibration pass after discovering a load-bearing measurement defect merely because artifacts are already frozen;
- design a bespoke interview method without consulting relevant owner-supplied methodology that is actually available.

## Implementation checklist

Before freezing an interview/evidence protocol, verify:

- [ ] Relevant owner-supplied methodology was searched/retrieved when available.
- [ ] Specificity and evidential independence are modeled separately.
- [ ] Direct behavioral recurrence self-report is preserved as its own evidence type.
- [ ] Scope/denominator can be represented.
- [ ] Boundary conditions and exception frequency can be elicited.
- [ ] Confirming anecdotes are not counted as independent frequency observations unless the sampling design warrants it.
- [ ] Concrete incidents are requested only for defined information gain or valid sampling.
- [ ] Counterexamples/exceptions can qualify strong recurrence claims without mismatch rescue.
- [ ] Trait labels are separated from behavioral recurrence.
- [ ] True-frequency estimation, when needed, has a sampling frame appropriate to the claim.
- [ ] Human annotators get a human-facing interface while machine contracts remain exact.
- [ ] Methodological defects discovered pre-collection trigger versioned revision rather than silent reinterpretation.

## Transfer rationale and limits

Originating incident: `u-dont-existDOTcom/humandesign`, Life Patterns development work, owner corrections on 2026-09-08 around recurrence evidence, episode quotas, exception-first probing, and human-calibration usability.

The transfer is universal because the underlying errors — specificity/independence confusion, conditional-example bias, low-information follow-ups, missing denominator/exception probing, machine-format burden, and failure to consult supplied methodology — recur across interviewing, survey design, qualitative research, annotation, and evidence synthesis.

Limits:

- This pattern does not imply that all self-report is accurate.
- It does not replace study-specific sampling theory or psychometrics.
- It does not prohibit concrete incidents; it restricts what evidential role may be inferred from them.
- It does not authorize post-hoc revision after confirmatory outcomes are visible.
- Mandatory safety/legal/provenance questions may be necessary even when their immediate information gain for the focal inference is low.

## Completion check

Before collecting another example, ask:

> What uncertainty can this example resolve? Is it independent evidence for the claim I intend to strengthen, or merely more specific detail selected because the claim was already made? Would scope, exceptions, exception frequency, or a genuinely sampled observation be more informative?

If the answer is `no material uncertainty` and no mandatory requirement applies, do not ask the question.