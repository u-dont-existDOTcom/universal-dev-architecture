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
| Dashboard | rebuildable projection only |

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

## Symphony boundary

The adapter consumes the stock Symphony state shape pinned in `lib/symphony-adapter.ts` and emits normalized read-only events only for workers that already have a task contract. Unmapped observations become durable diagnostic-only events and diagnostic identities are excluded from fleet projection. No Symphony-owned orchestration behavior exists here.
