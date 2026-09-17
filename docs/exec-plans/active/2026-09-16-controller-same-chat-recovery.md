# Controller-mediated PM same-chat recovery

Status: BLOCKED — CENTRAL SINGLE-WRITER MUST RECOVER BEFORE EPOCH 4

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
- PRIMARY access and sender quiescence are now proved. The later browser start
  was source-bound to the completed managed Chromium-bridge qualification.
  PRIMARY now has a durable marker plus systemd mask and remains browser/CDP
  quiescent after persistence, explicit system start, alternate user start,
  and health-path checks.
- Commit `5f199485dc5efb8d25387c340dd235b7152ce7fc` implements the smallest
  recurrence repair and is installed reversibly on both authorized
  non-production hosts. PR #140 is the review boundary; no automatic merge is
  authorized. Complete relay and focused tests pass and no provider send
  occurred.
- No-send readiness is now blocked at the central authority: after one clean
  stale-epoch-3/empty-queue/valid-ledger read, the single-writer daemon became
  CPU-bound and unresponsive and the live database could not be read without a
  lock. Stale evidence is ineligible for successor activation. No live fixture
  was created.
- Next: obtain owner authorization for PR #140 merge and one controlled
  volume-preserving restart of the non-production single-writer, re-read exact
  authority state, activate epoch 4 only if every gate remains clean, re-run
  no-send readiness, then create exactly one fresh fixture.

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
