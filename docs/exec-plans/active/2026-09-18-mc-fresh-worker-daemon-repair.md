# Central daemon repair and same-fixture PM proof

Status: BLOCKED — EXPLICIT AUTHORITY STOP

Assurance: iteration for diagnosis/implementation, release before merge/install.

## Owner outcome

Repair the central Mission Control daemon availability/read path with no provider
sends, prove responsiveness across two reconciliation intervals, and then retry
only `MCP_BINDING_PRELOAD` on the existing reconciled route
`mc53-epoch4-pm-proof-v2-route-20260917`. Continue the same fixture to canonical
PM-mediated resolution and then complete the directive's deferred hardening.

Issue #53 comment `5723378677` is the narrow authority for retrying the already
reconciled binding-only boundary. All other ambiguous or crossed provider
boundaries continue to fail closed.

## Execution phases

1. Revalidate epoch-4 authority, PRIMARY quiescence, central integrity, exact
   route state, and absence of later provider/semantic/binding evidence.
2. With sends disabled, trace daemon liveness, deep health, one representative
   authenticated read, resource/event-loop symptoms, reconciliation timing, and
   container-health timing across at least two reconciliation intervals.
3. Implement the smallest architecture-preserving repair: incremental
   reconciliation before expensive validation, cheap liveness separated from
   deep integrity, and bounded request-serving work.
4. Run focused tests through the test-efficiency observer, then the release
   boundary gates and review.
5. Merge and install reversibly with the epoch-4 volume preserved and sends
   disabled; run the two-interval no-send soak.
6. Freshly admit and retry only the same route's binding preload; continue the
   existing fixture while every provider boundary remains exact.
7. After live proof passes, complete the deferred fence/lease/wrong-result
   hardening and close out the durable evidence.

## Hard stops

Stop on newer owner authority, lost single-active epoch-4 authority, invalid
chain/ledger, changed same-route retry state, later provider or semantic/binding
evidence, unresolved admission, a falsified diagnosis requiring a new
architecture decision, login/MFA, ambiguity after a new provider boundary,
production/spend, or a new trust boundary.

## Phase A checkpoint — 2026-09-18

The required 12-minute no-send trace crossed two configured five-minute GitHub
reconciliation intervals. The daemon listener remained present in all 360
samples, epoch-4 authority stayed single-active on SECONDARY, the queue stayed
empty, and the chain/ledger stayed valid. At the same time, the daemon used a
median 100.3% of one CPU core (281/360 samples at or above 90%), deep health
took 6.8–8.1 seconds, and the authenticated full worker read returned about
32.25 MB in 19.9–27.8 seconds before a later representative read timed out at
45 seconds. Routine Docker health probes took 20.9–43.5 seconds. This proves a
live-process request-starvation defect rather than authority loss and confirms
the repair seam: deduplicate/increment reconciliation before validation,
separate cheap liveness from deep readiness, yield bounded reconciliation
work, and give the relay a minimal transport projection instead of the full
operator/UI worker history.

## Phase B/C checkpoint — 2026-09-18

The candidate reconstructs finalized GitHub-comment identity and per-channel
high-water state from the append-only ledger, clamps scans to still-pending
routes/challenges, loads batch history once, updates it after appends, paginates,
and yields every bounded comment batch. Routine container health now uses cheap
daemon/BFF liveness while explicit deep readiness retains event-chain and
authority-ledger checks. The relay calls a new scoped transport projection;
the full operator/UI worker projection remains unchanged.

Focused gates pass 42/42 Mission Control and 92/92 relay/controller tests. Full
release gates pass Mission Control 276/276 plus typecheck/build, relay 208/208
plus syntax/service assets, and repository 338/338 with zero audit errors. The
10k-event concurrent responsiveness case completes in 2–5.3 seconds across
runs, materially below the 30-second relay timeout. No provider send occurred.

## Install and stop checkpoint — 2026-09-18

PR #148 merged the availability repair at `c156e3e7843aac850c9fcbc5dee725c34ca1a26b`.
A live startup measurement then proved that authoritative-volume initialization
took 25.14 seconds while the stack launcher allowed only 10 seconds; PR #151
merged the bounded 120-second liveness gate at
`22a70fdbf9b4f098562b4633bbb34cfc37267ea0`.

The exact merged image started against the preserved epoch-4 volume and passed
cheap liveness. Its explicit deep authority read failed closed because canonical
main does not accept the existing durable `PRECOMPOSITION_RECOVERED` status at
admission index 17, written by the previously deployed PR #120-derived runtime.
No SQLite mutation or second writer was used. The candidate was stopped and the
state-compatible runtime restored with only the reviewed bounded startup wait.
At `2026-09-18T19:08:44Z`, chain and ledger were valid, sequence was 12056,
queue depth was zero, unresolved admission and safety halt were null, transition
was CLEAR, and the last provider boundary remained
`2026-09-17T21:55:26.258Z`. The epoch-4 lease had expired at
`2026-09-18T18:50:40.711Z`, so scheduler state was `LEASE_STALE`.

That is an explicit directive stop. The post-install two-interval soak, binding
preload admission/retry, fixture continuation, and deferred hardening were not
attempted. Provider sends remained zero. SECONDARY has the exact merged relay
package from PR #149 installed, but the relay remains inactive with submit and
capability-test gates disabled. The blocked receipt is
`docs/evidence/2026-09-18-mc-fresh-worker-daemon-repair-receipt.json`.
