# Controller-mediated PM same-chat recovery

Status: BLOCKED — CONTROLLED FAILOVER REQUIRES PROVEN PRIMARY QUIESCENCE

Assurance lane: release only after the focused candidate proves the current seam.

## Owner outcome

`OPEN`. Close the remaining PM-mediated live-proof gap at the real consumer
seam without changing the controller-mediated GitHub semantic-mailbox
architecture.

The first bounded diagnosis is confirmed on canonical `main`
`deef93b718af234d37bd2c2c04ccd26f9d2a0feb`: the origin and PM durable-artifact
waits only poll GitHub and never invoke the current same-chat recovery
semantics. The generic stuck-turn wrapper also has no mechanically bound
Retry-of-failed-continue operation.

## Frozen recovery order

```text
original semantic turn
-> exact same-chat `continue`
-> only if that exact continue turn visibly fails, one Retry bound to that turn
-> wait for the same durable artifact
```

Retrying the original semantic turn first is forbidden. A generic Retry control
or ambiguous send/click ancestry fails closed.

## Plan and recovery ledger

1. Add structural, non-content browser evidence that binds a Retry control to
   the exact failed controller-authored `continue` turn.
2. Add restart-safe controller recovery state for origin, PM, and return
   durable-artifact waits, with semantic-nudge and transport-retry counts kept
   separate and every send routed through the shared submission authority.
3. Add focused controller, browser, pacing, restart, ambiguity, and negative
   Retry-original regressions, plus one narrow consumer-seam simulation.
4. Run focused and affected tests through the test-efficiency observer.
5. If the candidate is sound, enter the release lane for exact repository and
   relay gates, reviewed PR/hosted checks, protected merge, reversible install
   on the authorized non-production topology, and exactly one fresh PM-mediated
   live fixture.

## Current checkpoint

- Implementation and focused/affected verification are complete.
- Release gates are green locally: repository 338/338 and deterministic audit;
  Mission Control 270/270, typecheck, and production build; relay 201/201,
  syntax, and service assets; archive reconstruction digest and diff check.
- PR #132 passed hosted checks and merged as
  `b8d1ac4ea957627de8f26feaba3e1560c92f4269`. The exact package is installed
  on the authorized SECONDARY with file parity and rollback preserved.
- No-send readiness is blocked: the shared authority reports a stale PRIMARY
  lease, SECONDARY remains correctly fenced, and repeated local and
  SECONDARY-origin control probes cannot prove the old PRIMARY browser sender
  quiescent. Automatic partition failover is forbidden by the active multi-host
  policy. No live fixture was created.
- Next: restore authorized PRIMARY operator access or independent fencing,
  prove quiescence, activate a controlled successor lease, re-run no-send
  readiness, then create exactly one fresh fixture.

## Stop conditions

- Do not replay the historical Sep-9 cycle or any crossed send boundary.
- Do not reopen the historical AskRigor source search.
- Do not inspect assistant content, invent semantic GitHub output, touch
  production, buy inference, or relax exact target/ownership/pacing controls.
- Stop at the first demonstrated owner, security, privacy, access, ambiguous
  boundary, or architecture-changing blocker.

## Evidence to preserve

- canonical and installed revisions;
- exact changed files and focused/release test receipts;
- PR, merge, install, and rollback evidence when reached;
- per-lane continue and Retry-of-continue receipts;
- the fresh fixture's origin, PM, return, and final canonical resolution
  evidence;
- `assistantDomOutputInspected:false`,
  `controllerSemanticSubstitution:false`, `paidInference:false`, and
  `productionMutated:false`.
