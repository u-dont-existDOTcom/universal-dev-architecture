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

## Completion invariants

Root closure requires independently sourced current owner authority, current complete reconciliation, exact-candidate independent evidence mapped through the owner outcome, no open blocking finding, and a fresh supervisor assessment of the same authority vector. `READY_FOR_OWNER_REVIEW`, a green worker assessment, or a related receipt cannot translate into owner-outcome achievement.

Owner cancellation requires an explicit durable owner decision bound to the current owner-outcome epoch. Owner removal or amendment in reconciliation likewise requires a matching durable owner decision.

## Security and process boundary

The daemon requires an internal bearer secret for every mutation. The Next ingestion route uses a separate per-producer credential map; credentials bind producer ID and kind. The daemon then checks event-class/status authorization and embedded producer/actor identity. UI mutation routes also require exact same-origin authority.

SQLite is daemon-owned. The Next routes never import the event store. SSE is notification only; clients refetch the canonical projection.

## Symphony boundary

The adapter consumes the stock Symphony state shape pinned in `lib/symphony-adapter.ts` and emits normalized read-only events only for workers that already have a task contract. Unmapped observations fail before projection. No Symphony-owned orchestration behavior exists here.
