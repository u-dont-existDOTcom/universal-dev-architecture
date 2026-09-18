# Per-request supervisor handshake — isolated iteration

Owner outcome: OPEN. The remaining gap is a working unattended, zero-paid-inference supervisor cycle without separate capability messages. This pass implements and exercises a reversible candidate; tests do not establish live delivery.

Authority: owner continuation on 2026-09-18 adopting the pasted per-request architecture; live Universal main 1df60d86a08acceb34076488d7cbb33363a1c4d9. Existing capability-rotation PR is not the integration base. Historical route evidence, sealed V2 and frozen V3 are not migrated or replayed by this iteration.

## Plan
1. Read actual MC binding, receipt admission and relay consumer seams.
2. Implement an explicitly opt-in same-request handshake alongside legacy behavior, using the existing event store and scheduler rather than a second authority.
3. Exercise MCP HTTP -> server-observed access -> request-bound GitHub artifact and crash/replay behavior with deterministic adapters. No real provider sends.
4. Preserve candidate, exact tests and remaining live/integration gaps; only delegate genuinely unavailable execution.

## Active contract
- Chat owns design and ordinary GitHub operations; this is direct owner-authorized maintenance, not autonomous Work admission.
- No paid inference, production mutation, private locator disclosure, browser/clipboard access on the owner laptop, or host lease/fence changes.
- One real request; capability is request evidence, not a reusable certificate. New protocol must not emit a standalone preload.
- Preserve exact request/session/supervisor/outcome binding; server access observation is not cryptographic provider-session attestation.
- Unknown post-send state never authorizes replay. Request expiry remains distinct from obsolete capability expiry.
- An already produced final GitHub artifact is recovered, not regenerated. Existing GitHub write is the evidence; do not invent another ceremony by default.
- Isolation: only this writer branch may change. Focused/affected tests through canonical telemetry. No deployment claim from tests.
- Final delivery includes actual files and current timestamp, with literal boundary check.

## Existing-work decision
Independent conception is the owner-pasted design. Compose/adapt transactional-outbox and idempotent-consumer principles (AWS Prescriptive Guidance, transactional-outbox pattern), the existing MC append-only single-writer authority, and the existing private MCP tunnel. Local persistence does not give exactly-once execution at an uncooperative browser/provider boundary. Irreducible ambiguity remains explicit and blocks resend; immediate reconciliation is not guaranteed immediate success.

Current official OpenAI MCP documentation confirms private Secure MCP Tunnel availability; it does not establish exact conversation attribution for a tool call or guarantee that every consumer supervisor has writable GitHub. That is evaluated at the actual request consumer seam, without introducing a new provider-attestation prerequisite.

Sources checked this turn: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html ; https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

## Requirement derivation
Root status OPEN; removal of separate provider proof transactions directly implements current owner direction. Added protocol versioning is a reversible implementation detail, not a new owner acceptance criterion. Stronger cryptographic/provider-side attestation is NOT introduced. Single-writer, privacy, zero spend, no ambiguous resend and request-bound identity are retained requirements. Optional synthetic validation does not disable an existing route.

## Progress
Source inspection complete enough to identify two coupled legacy prerequisites: preload-session-only MCP lookup and reusable-capability admission in the final GitHub validator. Implementation and consumer-seam evidence are pending.

## Candidate checkpoint — 2026-09-18

142 focused/affected tests passed across the actual MCP HTTP handler, real SQLite receipt intake, legacy receipt/admission compatibility, relay consumer and central submission authority. Typecheck passed after correcting fixture-only static types. These are deterministic/offline tests, not live provider evidence. No paid inference, live supervisor message, deployment, fence/lease change, restart or experiment execution occurred.

V5 is explicitly opt-in in both server receipt policy (`requestBound.enabled` plus exact trusted relay producer IDs) and relay configuration (`MC_RELAY_REQUEST_BOUND_ENABLED=1`). Legacy routes remain legacy. One final GitHub decision doubles as the execution artifact; no preliminary GitHub proof write is added.

The implemented click-dispatch state closes a concrete unsafe classification: a lost CDP reply after dispatch cannot be treated as confirmed pre-click failure. The central authority now accepts only enumerated pre-click abort states. A crossed/unknown V5 rate-limit path cannot silently resend.

Remaining implementation is explicit: the canonical V5 enqueue ID prevents a second event but changed queue timestamps still need exact-key original-record acknowledgement rather than an idempotency conflict. Implement this in the admission consumer using a bounded existing-event lookup, not by weakening the EventStore immutability/producer contract. Concurrent, post-expiry, continuation and real central-pacer safe-retry cases still need direct coverage. Controller-mediated integration and live maintenance remain unverified. An attempted broader EventStore replay change was not applied.

NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT: read-only inspection confirms that currently connected maintenance accounts lack Docker/deployment-directory permissions. Existing host fencing and sealed/frozen experiment states were not altered. Work must use existing owner-authorized maintenance access and must not bypass denied permissions or turn this into a model escalation.

Known evidence limit: server-observed tool invocation plus trusted relay correlation and a GitHub artifact are not cryptographic attestation of the originating ChatGPT conversation. Nor does a final GitHub write independently attest the ordering of a prior GitHub read and internal reasoning. Preserve these limits instead of inventing a new certificate ceremony.

Lesson disposition: apply the existing exact-boundary, outcome, idempotency and assurance-lane rules. The newly found CDP uncertainty window is captured by central-pacer/authority regressions. Do not promote a new universal architecture rule from this un-deployed iteration.
