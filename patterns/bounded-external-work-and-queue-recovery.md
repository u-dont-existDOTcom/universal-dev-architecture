# Bounded external work and queue recovery

## Activation and scope

Apply when developing, repairing or reviewing queued jobs, network retrieval, model/tool calls, subprocesses, browser workers or another external operation that holds a shared slot, lock, lease, pending entry or memory budget. This is a specialist engineering workflow; project limits and side-effect semantics remain authoritative. Prefer a mature runtime/library's deadlines and cancellation facilities to a new queue framework.

## Failure to prevent

A process can answer its health endpoint while its useful work is permanently blocked. A socket timeout, response destruction or caller timeout does not prove that the worker's awaited promise settles. A shared scheduler that releases its slot only after that promise settles can therefore reject every later request indefinitely.

## Implementation workflow

1. **Bound waiting and execution separately.** Set explicit queue capacity, queue-wait time and active execution time. The scheduler owns an absolute execution deadline that covers the whole operation: DNS/connect/TLS, headers, body, parsing, fallback routes and range/retry attempts. Each nested step receives the remaining budget; retries do not reset it.
2. **Make the deadline independent of dependency cooperation.** The scheduler must settle its own result when the dependency never resolves, rejects, emits an error or closes. An outer timer/race can bound the caller, but it does not cancel the losing operation. Couple it to actual cancellation of sockets, streams, browser tasks or child workers. If a resource cannot reliably stop cooperatively, isolate and terminate that worker, or fence its result and retain resource accounting until containment completes; do not release the resource budget on a timeout label alone.
3. **Release all owned state on every terminal path.** Use a single idempotent cleanup/finally path for timers/listeners, locks/slots, pending and deduplication maps, temporary files and partial buffers. Reject affected duplicate callers and permit a later retry of the same identity. Never let cleanup wait on the same unresponsive operation it is meant to contain.
4. **Fence late completion.** After every awaited boundary, recheck cancellation/deadline before another external action, cache insertion, durable write or success report. A canceled attempt must not resume a fallback, overwrite a newer attempt or populate a cache. For writes or paid/irreversible operations, preserve an unknown-outcome state and reconcile/idempotently recover; a local timeout never authorizes a duplicate side effect.
5. **Observe useful progress.** Report active age, queued count, expired/stalled state and recovery counters without private payloads or credentials. Base readiness/degraded state on the functional worker too. Where automatic recovery is promised, bind it to a tested restart/termination mechanism; a Docker unhealthy label alone is not proof of automatic restart. Never make readiness depend on an expensive external request on every probe.
6. **Prove failure recovery at the consumer boundary.** Inject a request that never settles, a body that ignores destruction, a missing terminal event, queue expiry, shared duplicates and a late result. Assert a bounded timeout, real cancellation/containment, state/buffer cleanup, no paid fallback or duplicate write, and successful subsequent work, including retry of the original identity. Also test ordinary success, source/security limits and real consumer retrieval after deployment. A happy-path burst and a process-only health check do not establish this property.

## Reusable starting point

`templates/async-work-deadline.mjs` supplies a small scheduler-owned deadline primitive. It is not a network adapter or a complete queue. The operation must pass its signal to an abort-capable resource, explicitly close it on abort, or use a terminable isolated worker. `tests/test_async_work_deadline.py` exercises never-settling work, cooperative resource cancellation, late-result rejection and recovery of a serialized consumer.

Use the project's existing scheduler; put the primitive inside its admitted-work/finally boundary. Preserve queue capacity, billing, privacy and caller cancellation semantics. One caller leaving must not cancel shared work still owned by other callers.

## Bug-repair closeout

After fixing an instance, apply the existing closeout in `patterns/durable-chat-learning.md` automatically. Record the exact failing behavior and regression locally, then classify the causal lesson as promoted, provisional, project-specific, superseded or no-new-lesson. Inspect the same mechanism in the current authorized work; file a deidentified suggestion for other maintained projects when warranted rather than silently changing their runtime. Document the prevention pattern, trigger and tests at the reusable development layer. A restart can restore service without establishing the initiating cause or completing a prevention fix.

## Basis and limits

This composes established deadline, cancellation, cleanup, idempotency and fault-injection practices. Node's HTTP documentation distinguishes timeout events from aborting a request; MDN documents that Promise.race settlement does not cancel its losing operations:

- https://nodejs.org/api/http.html
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race

Origin and bounded evidence: `audits/2026-11-03-async-queue-recovery-promotion.md`. No timer can guarantee progress while its event loop or host is stopped. Process isolation/health supervision is the separate containment layer for that failure class. This workflow does not establish universal live compliance merely because its text and portable tests exist.
