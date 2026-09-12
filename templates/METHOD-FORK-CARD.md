# Method Fork Card

Use only when the proposed method materially changes product meaning, who makes consequential judgments, evidence semantics, owner/user burden, long-lived architecture, or a costly dependency. Do **not** create this card for routine reversible implementation choices inside an already authorized method.

Keep the owner-facing card to roughly one screen. Explain the substantive choice before repository identifiers or implementation detail.

## What you asked for

`<plain-language owner outcome>`

## What I am additionally assuming

`<assistant/inherited/external method or prerequisite that was not already part of the owner outcome>`

Origin: `owner_required | externally_required | assistant_hypothesis | inherited_project_choice`

## Why it matters

`<how this assumption changes the product, evidence, user burden, authority, cost, or future architecture>`

## Simplest live alternative

`<materially simpler route that still appears capable of satisfying the owner outcome and genuine constraints>`

## What would fail without the added method

`<specific failure supported by evidence, or UNRESOLVED>`

Evidence: `<decision-changing evidence; do not cite method maturity as proof of necessity>`

## Concrete ordinary case

`<one realistic input -> actual user/system experience/output under the proposed method>`

## Current method status

`ESTABLISHED | UNRESOLVED | NOT_NECESSARY`

## Recommended next action

`<continue ordinary implementation | run smallest reversible discriminating probe | replace method | bounded owner decision>`

Owner action: `NONE | DECISION_REQUIRED`

If `DECISION_REQUIRED`, state the actual tradeoff and recommended default in ordinary language. Do not ask the owner to approve a method merely because the assistant can resolve the uncertainty with a cheap reversible experiment.

## Internal provenance (secondary)

- Owner source/ref:
- Constraint source/ref:
- Method-necessity record/ref:
- Candidate/task/ref:
