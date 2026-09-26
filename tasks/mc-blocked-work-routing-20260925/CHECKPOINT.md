
## 2026-09-26 second review repair
The 32cf524 re-review found three additional P1 consumer-boundary defects. This repair:
- evaluates an answered trusted route against the task evidence boundary before downstream receipt/directive events can advance that boundary;
- passes the actual fleet tick timestamp into route creation, so an overdue watch cannot emit a route already expired at creation;
- distinguishes current versus superseded evidence boundaries, holding an unresolved old route without duplicate submission and suppressing any execution directive derived from a late decision for superseded evidence.

A dedicated fleet evidence-boundary parser now recognizes only SYSTEM-produced fleet routes and compares the exact factual boundary carried in the V6 request. A receipt without an execution directive remains unresolved and receives a new source-bound Pro follow-up only when the underlying task evidence is still current.

Regression evidence:
- the three new tests failed on the reviewed 32cf524 behavior before repair;
- 15 focused fleet tests now pass, including stale-decision non-execution;
- 52 affected fleet/Work/journal tests pass;
- TypeScript no-emit check passes.

The owner outcome remains OPEN until merge, deployment/restart, J10 onboarding, and a real blocked -> Chat decision -> authorized same-task continuation are demonstrated.
