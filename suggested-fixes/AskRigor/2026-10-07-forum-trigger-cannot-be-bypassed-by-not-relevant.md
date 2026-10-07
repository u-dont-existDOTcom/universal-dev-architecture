# Enforce mandatory forum and review applicability instead of trusting a wrong not-relevant declaration

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-07, by ChatGPT reasoning chat after reproducing an AskRigor research-routing failure
- From: owner correction in an AskRigor ChatGPT session on 2026-10-07
- Owner request: yes — owner explicitly asked to submit the detailed bug reports to the AskRigor lane
- Existing pull request: none
- Supersedes: none

## What to do

Repair the forum/community applicability boundary so a caller cannot bypass a mandatory forum/review audit merely by submitting `community_evidence: "not_relevant"` with a plausible-sounding reason.

Observed reproduction:

Research target was a practical comparison of oral apple pectin versus purified clinoptilolite as gastrointestinal toxin binders.

The formal evidence state itself contained several mandatory-trigger conditions:

- pectin human evidence was old and sparse;
- formulation chemistry materially changes pectin behavior;
- clinoptilolite evidence depended strongly on a specifically purified product;
- the task compared interventions people actually buy and use;
- the answer made a practical recommendation about which binder was more useful.

The live HRP rules say the forum module activates by default when formal human evidence is sparse, old, small, heterogeneous, formulation-sensitive, poorly replicated, or plausibly unrepresentative and a forum audit could materially alter the synthesis. Buyer review platforms must also be mapped for purchasable products.

Despite that, the caller passed:

`community_evidence: "not_relevant"`

with basis:

`no_real_world_outcome`

and `finalize_research` eventually returned `ready_with_limits` rather than rejecting the applicability claim.

That allowed a completed-looking practical comparison without the mandatory community/review layer.

Required repair:

1. Make community applicability an independently checked admission decision, not a caller assertion that the finalizer accepts at face value.
2. The server should derive or verify mandatory-trigger facts already visible in the research state:
   - intervention-effectiveness or practical-use question;
   - purchasable supplement/product;
   - sparse/old/small/heterogeneous/formulation-sensitive formal evidence;
   - real-world tolerability, usability, or formulation differences that can affect the decision.
3. If any mandatory trigger is present, reject `not_relevant` and require community execution or an access-boundary completion.
4. Preserve legitimate nontriggers: pure definition/calculation/chemistry with no real-world outcome, emergency-before-triage, or genuinely no plausible user corpus.
5. Do not make the gate keyword-only. The same semantic task must trigger across paraphrases and languages.
6. Where exact deterministic inference is not possible, require a structured applicability declaration with evidence and have the reasoning layer adjudicate it; do not accept a bare enum plus free-text justification as authoritative.
7. For purchasable interventions, couple this to the existing buyer-review requirement so a product-comparison task cannot complete while review-platform applicability remains unresolved.

### Regression case

Input task:

`Compare how useful apple pectin is as a gut toxin binder versus a good purified clinoptilolite.`

Evidence state:

- one modern human clinoptilolite absorption trial;
- older/sparse pectin human evidence;
- formulation sensitivity for both;
- both sold as consumer supplements.

Caller attempts:

`community_evidence = not_relevant`
`not_relevant_basis = no_real_world_outcome`

Expected: finalizer returns `not_ready` and explicitly requires the forum/review module.

Control case:

`What is the ion-exchange mechanism of clinoptilolite?`

Expected: `not_relevant` can pass if no practical-effectiveness or lived-experience claim is made.

Also add adversarial paraphrases such as:

- “Which one is actually more useful?”
- “Which should I choose as a binder?”
- “Does this work better in practice?”
- equivalent non-English phrasings.

## Why

This is a gate-authority failure, not just one model making a bad judgment.

The protocol already contained the correct mandatory trigger. The research model misclassified applicability, but the finalizer then accepted that misclassification and converted a caller error into a server-approved completion state.

A completion gate should be strongest precisely where the caller can make the wrong semantic admission decision. Otherwise mandatory modules are only advisory: any model can bypass them by labeling them “not relevant.”

This also defeated AskRigor's consilience rule. A practical recommendation was made from a small formal evidence base without checking whether real-world use, formulation differences, buyer reviews, harms, no-effect reports, and discontinuation patterns supported or complicated it.

## Check first

1. Read the complete current canonical HRP sections:
   - `AnswerShapeController / ForumSignalDefaultTrigger`
   - `CrowdSourcedAndClinicalSignalAudit`
   - `ProtocolExecutionAndComplianceGate`
   - `FinalSelfCheck`
   - the bidirectional evidence loop and consilience rule.
2. Inspect every code path by which `community_evidence: not_relevant` reaches `finalize_research`.
3. Identify whether applicability is currently verified semantically, structurally, or only trusted from caller input.
4. Preserve the current access-boundary path: a mandatory module that cannot be reached is `inaccessible/completed-with-access-boundary`, not `not_relevant`.
5. Add end-to-end tests proving the practical binder comparison above cannot finalize without community/review work.
6. Test that purely mechanistic questions still avoid unnecessary forum work.
7. Avoid brittle word-list routing; this is a semantic classification problem under the current UDA pattern-matching rule.
