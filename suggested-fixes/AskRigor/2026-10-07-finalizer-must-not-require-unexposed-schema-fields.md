# Keep finalize_research next steps within the connector's exposed input schema

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-07, by ChatGPT reasoning chat after reproducing an AskRigor connector contract mismatch
- From: owner correction/debugging in an AskRigor ChatGPT session on 2026-10-07
- Owner request: yes — owner explicitly asked to submit the detailed bug reports to the AskRigor lane
- Existing pull request: none
- Supersedes: none

## What to do

Fix a connector/server contract mismatch in `finalize_research`.

Observed behavior after running the missing community audit:

`finalize_research` returned `not_ready` with this required next step:

> State in commercial_review_applicability whether the question concerns a product or service people buy...

But the connector's exposed `finalize_research` input schema available to the calling model did **not** contain a `commercial_review_applicability` property.

The caller therefore received a mandatory repair instruction it could not satisfy through the advertised API.

Required fix:

- Either add `commercial_review_applicability` to the public MCP schema with its exact allowed shape and semantics, or stop requiring that field and derive the fact from existing structured inputs such as `principal_communities`, `community_searches`, `review_corpora`, and the research target.
- Server validation and exposed tool schema must be generated from the same authoritative contract or checked for drift.
- Every `next_steps` item returned by `finalize_research` must be satisfiable using:
  1. a currently exposed tool/input field,
  2. another explicitly named available AskRigor operation, or
  3. a clearly stated external/user action where that is genuinely necessary.
- A next step must never name an internal field that the caller cannot send.

### Regression test

Given a community-researched supplement comparison with mapped buyer reviews, call `finalize_research`.

If commercial-review applicability is unresolved:

Expected outcome A: the exposed schema includes a documented `commercial_review_applicability` field, and sending the required value clears that next step.

or

Expected outcome B: the finalizer infers applicability from existing data and never requests the absent field.

Failure condition: `not_ready.next_steps` requires any property absent from the tool schema delivered to the caller.

Add a generic contract test:

1. enumerate all field names mentioned as caller-supplied requirements in `next_steps`;
2. verify each maps to the current public input schema or to an explicit callable operation;
3. fail CI on drift.

Also test version skew: backend newer than plugin/tool descriptor and plugin/tool descriptor newer than backend.

## Why

A fail-closed research gate is correct only if the caller has a valid route to satisfy it.

This mismatch can create an infinite or impossible repair loop: the model follows the server's next step, but the runtime rejects the unknown field because the public schema does not permit it.

It also obscures the true state. The problem is not missing research judgment; it is interface serialization/version drift between the finalizer's validator and its published MCP contract.

This failure appeared immediately after correcting a separate forum-routing defect, which makes it especially important: stronger enforcement must not introduce unsatisfiable gates.

## Check first

1. Compare the deployed backend validator's expected `finalize_research` payload with:
   - the generated MCP schema;
   - the installed plugin/tool descriptor;
   - the current source TypeScript type/schema;
   - any OpenAPI or JSON Schema artifact used to generate the connector.
2. Determine whether `commercial_review_applicability` is:
   - an intended public field omitted from schema generation,
   - a removed/renamed field still referenced by validation,
   - or an internal derived state that should never have been requested from callers.
3. Check for other validator messages that reference unavailable fields.
4. Add schema-contract tests at build and deployment boundaries.
5. Test a freshly opened ChatGPT conversation after deployment so a stale conversation-local tool schema does not mask or simulate the fix.
6. Preserve backward compatibility where practical: old clients should receive a satisfiable fallback rather than an impossible next step.
