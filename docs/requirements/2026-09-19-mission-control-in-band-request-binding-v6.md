# Mission Control route-schema-v6: in-band request binding

Status: release candidate; not deployed

Protocol: `IN_BAND_REQUEST_BINDING_V1`

Accepted execution provenance: `IN_BAND_REQUEST_BINDING_GITHUB_OBSERVED`
Controlling authority: issue #53 comment 5744485891

## Purpose

Route-schema-v6 removes model-mediated Mission Control MCP invocation from the
consumer path. Mission Control remains the authority. Its durable request, the
central single-use submission admission, and a trusted relay's durable pre-send
receipt bind the one provider message to the one canonical GitHub decision.
The in-band envelope transports that authority; it is not a second authority
store.

V6 does not select or call Mission Control, run a capability test or MCP
preload, use reader/writer stages, or permit Continue or Retry. It selects only
GitHub and permits one semantic message in one fresh provider session.

## Exact binding envelope

Mission Control and the relay independently derive the same canonical JSON
payload from the durable route and configured GitHub decision target:

- binding schema and execution protocol;
- request ID and nonce;
- supervisor, provider-session, and worker IDs;
- execution context and reasoning lane;
- queue and expiry times;
- evidence capsule and current owner outcome;
- exact GitHub repository, issue number, and immutable issue URL.

`in_band_binding_sha256` is the existing SHA-256 function applied to the
existing canonical-JSON representation of that payload. No HMAC or parallel
signing service is introduced: authenticity comes from the trusted producer on
the durable pre-send event, the exact central admission, and the immutable
event chain.

## Pre-send transaction

The relay constructs the final one-message prompt with the complete binding
envelope embedded verbatim and computes its exact body SHA-256. The central
scheduler admits that request, relay producer, provider session, queue identity,
send path, and exact body digest. Before browser submission, the relay appends
one verified `MISSION_CONTROL_IN_BAND_REQUEST_BINDING_PRE_SEND_V1` receipt to
Mission Control. The receipt binds the request, supervisor, provider session,
worker, protocol, schema, binding digest, body digest, GitHub target, admission,
trusted producer, and `semantic_authority:false`.

An app-selection, expiry, control, or pre-click failure aborts before the
provider boundary. Regardless of local failure classification, a V6 route has
no replay action. Durable reconciliation may acknowledge an already accepted
GitHub decision but cannot create a second provider turn.

## Canonical GitHub decision

V6 uses canonical decision schema version 5. The authorized writer must publish
exactly one decision at the bound GitHub issue. It echoes the request,
supervisor, provider session, in-band binding digest, evidence capsule, owner
outcome, reasoning lane, decision block and digest, writer contract, and the
distinct V6 provenance.

Ingestion recomputes the envelope and validates, fail closed:

1. one current pending route-schema-v6 request;
2. exact binding digest and exact configured GitHub locator/writer;
3. exactly one current trusted pre-send receipt from a configured relay;
4. exact provider-body digest and single-use central admission;
5. exact request, supervisor, provider-session, queue, send-path, and producer
   bindings;
6. the existing model/control observation and one complete provider-session
   lifecycle;
7. exactly one GitHub-only generation start and completion in the allowed time
   window;
8. no Mission Control selection, MCP receipt, or MCP tool evidence;
9. the current owner-outcome epoch and evidence capsule; and
10. canonical decision and writer-contract integrity.

Only after all checks pass are the GitHub decision receipt, execution directive,
and V6 attestation appended atomically.

## Compatibility and deployment boundary

V4 split-session and V5 request-bound MCP behavior remain unchanged. A V6
decision cannot use `REQUEST_BOUND_MCP_GITHUB_OBSERVED`; V5 cannot use the V6
proof fields. Public MCP exposes no V6 resolution path.

The existing `requestBound.enabled` and trusted relay-producer policy is reused
as the activation and trust allowlist. An admission must explicitly request
`IN_BAND_REQUEST_BINDING_V1`; otherwise the currently enabled request-bound
policy continues to create V5. No policy migration or new durable database is
required.

This candidate is offline only. Deployment requires a reviewed Mission Control
image and matching relay bytes built from the same final commit. Live deployment
and the single V6 acceptance send require a separate consequential authorization.

Originating Chat: [Reject API Migration Recommendation](https://chatgpt.com/g/g-p-6a9dd02e724c8191bc41b5202580718f-mission-control/c/6aa8117e-6714-83e9-af68-233747ceceb7)
