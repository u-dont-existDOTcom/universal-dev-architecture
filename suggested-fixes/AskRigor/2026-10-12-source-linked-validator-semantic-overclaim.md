# Keep source-linked method-audit validation distinct from semantic scientific validation

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-12, by a ChatGPT research reviewer
- From: 2026-10-12 AskRigor source-linked method-audit calls and successful validation receipts
- Owner request: yes, the 2026-10-12 instruction to debug why research gates did not prevent the errors
- Existing pull request: none
- Supersedes: none

## What to do

Check the contract and UX of `validate_study_method_audit` / `validate_review_method_audit`. In a current run, an audit with generic domain claims plus blocks selected by regex/keyword presence returned `source_linked_study_audit_validated` for several papers. The validator's own caveat says it proves source linkage/checklist coverage, not semantic truth. Preserve that limited mechanical state, but prevent the response generator and finalizer from interpreting it as scientific-adequacy PASS. If needed, introduce a separate semantic claim-to-passage review: can the cited block actually entail the stated population/comparator/causal claim? A block containing the word 'funding' is not, by itself, a review of sponsor influence.

For controlled regression, submit a formally valid 13-domain audit whose 'harms_capture_and_follow_up' explanation discusses severe adverse-event incidence but cites a block about antibody titers. Check whether the structural validator accepts it (expected: it may), then ensure no answer or finalizer describes that receipt as a validated adverse-effect finding. Prefer an explicit `source_link_validated / semantic_not_assessed` interface over inventing certainty.

## Why

We observed a category error between machine-validated source IDs and human-reasoned scientific interpretation. Repeatedly loading all the relevant protocol prose did not prevent false attribution in generated claims. This is a gate-integration/verification-interface defect, not proof that the underlying studies are defective.

## Check first

Read `apps/research-mcp/src/actions/study-method-audit.ts` and the runtime interface from source, inspect existing validator assertions and protocol versions HRP 20.6.21 / Universal 20.5.41, then add semantic-distinction acceptance tests. Avoid a new expensive mandatory reviewer unless it changes decisions; source-linked receipt should remain useful for mechanical purposes.