# Mission Control adapted architecture

```text
owner authority / workers / supervisors / evidence collectors / Symphony state
                              |
                              v
                    authenticated v2 events
                              |
                              v
Mission Control daemon — sole SQLite writer, append-only validation, SSE
                              |
                              v
                 Next.js read/proxy boundary
                              |
                              v
        all-worker attention queue + decision records
```

## Implemented owner↔worker channel

The next architecture slice is a tool-neutral communication channel for local,
VPS, and cloud workers:

```text
owner direction
    -> authenticate
    -> one daemon transaction: append owner event + durable outbox item
    -> local adapter or worker-initiated remote delivery
    -> delivered -> acknowledged -> direction-bound queue reconciliation
    -> worker messages, blockers, and proposed changes return to the ledger
```

The owner direction becomes current owner-source authority when committed, not
when a worker eventually receives it. Ordinary conversation and operative
directions remain different message classes. Transport delivery, worker
acknowledgement, and queue reconciliation are never inferred from each other.
When the newest direction is unreconciled, the dashboard must project
`DASHBOARD_BEHIND_OWNER` rather than presenting stale state as healthy.

This implementation does not change current roles: Symphony still orchestrates
Codex execution; Mission Control owns the ledger/outbox/projection; reasoning
chats remain the semantic authority; GitHub and Linear retain their durable and
live control-plane roles. The bounded Hermes worker experiment and n8n edge-
adapter evaluation remain unadopted. Executable manifests and comparison tools
live under `experiments/hermes/` and `experiments/n8n/`; their exact bounds and decision rules
are in
`docs/exec-plans/active/2026-08-31-mission-control-owner-worker-messaging-and-adapter-experiments.md`.

## Authority separation

| Dimension | Authority |
|---|---|
| Current owner intent | independently captured owner source and versioned owner outcome |
| Derived worker scope | task contract bound to the exact owner-outcome epoch |
| Contract completeness | objective reconciliation matrix |
| Worker trajectory | worker checkpoints plus durable evidence |
| Semantic supervision | supervisor assessment bound to an authority vector |
| Outcome advancement | direction-aware direct evidence plus strategy-efficacy accounting |
| Reasoning authority | Extra High/Pro review bound to evidence boundary, strategy, and chat epoch |
| Codex execution | one versioned chat-authored directive, exact start, factual receipt, then stop/review |
| Correction truth | append-only finding and correction lifecycle events |
| Terminal permission | deterministic owner-outcome comparator |
| Runtime execution state | read-only Symphony observation |
| Owner↔worker transport | Mission Control ledger plus durable outbound delivery events |
| Worker work queue | worker-published projection bound to the exact owner direction |
| Dashboard | rebuildable projection only |

## Stable supervisor with a fresh provider session per cycle

The registered identity is the supervisor, not one permanent browser conversation. Each admitted cycle uses **New chat in the current verified reusable ChatGPT tab** for every mandatory external-tool stage. A transport-only `MCP_BINDING_PRELOAD` session selects Mission Control, performs exactly one read of the session-local request binding, and has no semantic authority. After its generation completes and the current server-side tool receipt is visible, the relay derives a bounded hashed binding capsule in Mission Control transport state. Every semantic stage then starts a different provider conversation, selects GitHub, and writes its required durable receipt in that same first message:

```text
ordinary:   reusable tab -> New chat -> MC binding preload
                         -> New chat -> Extra High GitHub evidence/reason/#59 write
escalated:  reusable tab -> New chat -> MC binding preload
                         -> New chat -> Extra High GitHub reader/#61 receipt
                         -> New chat -> Pro GitHub decision/#61 receipt
                         -> New chat -> Extra High exact-copy/#59 write
                                      -> signed webhook -> Mission Control ledger
                                      -> periodic GitHub polling if the webhook was missed
```

The VPS browser relay may select the registered chat, select the registered model/mode, send a tiny control prompt, and observe generation controls. It never reads, copies, parses, hashes, or extracts assistant response text. The writer contract is `EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY`; reinterpretation is forbidden.

Every stable supervisor fails closed unless Mission Control read, GitHub read, GitHub write, and model/mode switching are established by current bootstrap capability receipts. Every cycle also requires exact binding and stage provider-session records/URLs, visible model proof, the server-observed `tools/call get_supervisory_request_binding` receipt for Stage 1, an exact mechanically derived binding capsule, and ordered first-message GitHub transport/stage receipts. Generic MCP traffic, app-chip state, prompt prose, and stale provider-session receipts do not satisfy preload. Every canonical decision receipt binds the request ID, stable supervisor ID, distinct binding/stage provider-session IDs, nonce, evidence-capsule ID/hash, current owner-outcome ID/epoch/hash, reasoning lane, and #59/#61 targets. Stale, mismatched, or cross-session GitHub receipts do not enter the ledger.

Managed ChatGPT tabs follow the owner-level 1/2/3 discipline: one in steady state, two only during bounded transition or recovery, and three as the absolute hard ceiling. The relay fails closed before opening a fourth. It opens a replacement only after same-target New chat navigation is irrecoverably unusable, verifies the replacement before immediately closing the superseded tab, never fans out duplicate tabs for one task, reports the managed count in doctor/status output, and deterministically cleans completed or superseded sessions back toward one. Bootstrap or pinned automation-owned tabs are not retained merely as history once durable capability evidence exists.

### Model-agnostic stuck-chat recovery

A generic mission-guard `CONTINUE` verdict remains forbidden. Separately, the browser relay may send the exact one-word prompt `continue` as **non-semantic transport recovery** for an already-authorized, tool-free supervisor turn that is observably stuck. Mandatory external-tool stages explicitly disable this path.

The browser has two no-content stuck signals:

- **active generation timeout:** the generation UI remains active for the full configured generation timeout (15 minutes by default). The relay invokes the visible Stop-generation control, waits for a safe idle composer, sends `continue` in the same conversation/current model, then resumes waiting;
- **recoverable idle control:** after the composer returns idle, a visible button/control is exactly labeled `Continue`, `Continue generating`, `Resume`, `Retry`, or `Try again`. The relay sends `continue` in the same conversation/current model instead of treating the turn as semantically complete.

The detector uses only composer/generation/recovery controls; it never searches assistant response text. Consecutive transport recoveries are capped (`MC_RELAY_STUCK_RECOVERY_MAX_NUDGES`, default 3, maximum 20), a failed or ambiguous recovery is not automatically replayed, and recovery cannot bypass owner, admission, spend/access, release, safety, or ambiguity gates.

If a mandatory stage finishes without its required durable receipt, the relay waits through reconciliation and may replay only the same immutable stage as a fresh first message in a new provider conversation. `CONTINUE_REQUIRED` from a Pro stage likewise creates a fresh Pro GitHub stage; it never relies on follow-up tool access.

A visually normal idle turn with no recovery control still does **not** prove semantic stage completion. Mission Control therefore treats browser `GENERATION_COMPLETE` as transport evidence only. Intermediate reasoning stages need explicit durable stage-completion/continue-required receipts to close that remaining liveness gap without assistant-output extraction.

Thus every `continue` described here resumes an existing admitted Chat objective; it is never semantic authorization for Work/Codex or a new Mission Control execution cycle.

## Chat and Work governance

Chat is the reasoning authority and the normal GitHub surface. Routine repository reads/writes, issue and pull-request updates, architecture decisions, reviews, supervisory reasoning, methodology, strategy, prioritization, verdicts, owner decisions, and substantive supervisory prose stay in Chat.

Work is execution-only. Mission Control may admit it only for terminal/computer work or a genuinely long-range repository operation under an exact source-bound directive. Convenience, GitHub access, or the ability to run tools does not transfer reasoning authority to Work.

Worker-to-contract and contract-to-owner alignment are never averaged. A worker can be GREEN against a laundered contract while the task remains overall RED and routes to contract repair.

## Correction invariants

- Findings are immutable OPEN records; every later state is a validated status event.
- A finding cannot become RESOLVED without current correction verification bound to its finding, candidate, contract, owner outcome, evidence schema, and policy.
- INVALIDATED and MITIGATED require current independent verified evidence; invalidation is not displayed as successful corrective work.
- Correction attempts keep immutable finding, directive, authority, evidence requirement, owner-action, and continuation identities.
- Delivery, acknowledgement, start, evidence submission, verification, and resolution are distinct claims.
- Verification binds candidate, contract, owner outcome, policy, evidence schema, assignment, target, environment, source snapshot, worker run, and verifier method. A declared binding change reopens fail-closed and identifies its durable cause.
- Resolution records `CORRECTED_AND_VERIFIED`, `FINDING_INVALIDATED`, or `MIXED_RESOLUTION`.
- Invalidation-only closure withdraws the active directive, binds exact proposition evidence and the withdrawal event, then closes without fabricating delivery, acknowledgement, start, evidence-submission, or verification milestones.

## Progress and execution supervision

- Outcome receipts declare measurement direction and exact baseline/previous/current evidence. Numeric deltas are recalculated; inconsistent receipts are rejected and hostile in-memory projections still derive the effective state. Nonnumeric advancement requires current and best same-worker durable direct-outcome or validated-leading-indicator receipts; the latter binds a predictive basis and later decision boundary. Supporting, missing, stale, unverified, cross-worker, and activity-only evidence cannot authorize `ADVANCING` or GREEN.
- Alignment GREEN/MATCH never masks FLAT, REGRESSING, overdue, or externally blocked progress.
- Regressing evidence holds same-strategy continuation; exhausted flat/regressing cycles require replacement.
- A current reasoning review binds the exact owner-outcome ID, epoch, and hash plus strategy, chat session/epoch, capsule, and reviewed evidence boundary. Legacy unbound reasoning remains readable but is non-authoritative.
- A successor directive after an execution receipt requires a strictly later durable reasoning review and the exact review capsule; active-directive labels cannot substitute for ledger causality.
- Codex cannot start without the current exact directive, continue after its stop receipt, or use an execution receipt to author progress, strategy, adequacy, completion, owner escalation, or Pro escalation.
- Turn-three handoffs bind the exact durable authority vector and high-water sequence; a forged capsule or stale vector is rejected.
- All owner-action source references must exist in the same worker ledger, and both attention and healthy task cards use one complete progress and execution-supervision state renderer.

## Completion invariants

Root closure requires independently sourced current owner authority, current complete reconciliation, exact-candidate independent evidence mapped through the owner outcome, no open blocking finding, and a fresh supervisor assessment of the same authority vector. `READY_FOR_OWNER_REVIEW`, a green worker assessment, or a related receipt cannot translate into owner-outcome achievement.

Owner cancellation requires an explicit durable owner decision bound to the current owner-outcome epoch. Owner removal or amendment in reconciliation likewise requires a matching durable owner decision.

## Security and process boundary

The daemon requires an internal bearer secret for every mutation. The Next ingestion route uses a separate per-producer credential map; credentials bind producer ID, kind, worker scopes, and task scopes. Those authenticated scopes are forwarded and checked again by the daemon for every event, along with event-class/status authorization and embedded producer/actor identity. UI mutation routes also require exact same-origin authority.

SQLite is daemon-owned. The Next routes never import the event store. SSE is notification only; clients refetch the canonical projection.

External workers authenticate with the existing scoped producer credential map,
poll `/api/worker-channel/{worker}/outbox`, and publish acknowledgement,
response, queue, blocker, and proposal envelopes to
`/api/worker-channel/{worker}/events`. The optional `/api/mcp` JSON-RPC seam is
read-only and uses the same producer identity and worker scopes.

## Symphony boundary

The adapter consumes the stock Symphony state shape pinned in `lib/symphony-adapter.ts` and emits normalized read-only events only for workers that already have a task contract. Unmapped observations become durable diagnostic-only events and diagnostic identities are excluded from fleet projection. No Symphony-owned orchestration behavior exists here.
