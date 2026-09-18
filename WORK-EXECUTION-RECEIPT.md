# Mission Control per-request supervisor execution receipt

Prepared: 2026-09-18 21:16 UTC+00:00  
Controlling entrypoint: `WORK-MC-PER-REQUEST-HANDSHAKE.md`  
Owner outcome: **OPEN — code complete; live send stopped on stale authority**

## Source and Git identity

- Source packet SHA-256: `bebb50614a959c672c5f25b7f9937c1301f4c656c038a0d61aeb8baa4cf13ed2`; size: 48,036 bytes. Verified before recovery and preserved unchanged.
- Sealed candidate commit: `147fbeff7be90edbce76939075a09df7de9cc3ad`.
- Sealed candidate tree: `a9ea15a7fe5c07670557d87eb69268ef82da5ed9`.
- Candidate parent/base: `1df60d86a08acceb34076488d7cbb33363a1c4d9`.
- Current default branch merged into the owned worktree: `59a5799f3c964f39d326b1f922fc5863fbe8d806`.
- Reconciliation merge commit: `ce37304416657fb37cd07672c5caaf68465695f6`.
- Final implementation branch: `work/mc-per-request-finish-20260918-1928`.
- Final implementation commit: `38b36fbaaab580e9133e546740c3a81a663acf5f`.
- Final implementation tree: `bcc7a4669069ade670ad04468f28c8a6f3a41006`.
- The receipt-publication commit is the immediate child of the implementation commit. Git cannot embed a commit's own object ID in that commit; its exact ID is recorded in the pull request and originating-Chat return.

The sealed candidate branch, source packet, and prior test telemetry were not rewritten, amended, deleted, or force-pushed.

## Disposition of required work

### A. Original-enqueue acknowledgement — complete

- Added authenticated exact-key daemon lookup for one bounded `event_id`, preserving producer and worker scope. The historical full event read remains unchanged.
- Admission now detects the stable existing V5 event before evaluation, re-evaluates at the original `queuedAt`, and returns the original durable event, message, queue time, expiry, and binding.
- A racing append conflict is re-read and re-checked.
- Expired retries acknowledge the original record but cannot extend its deadline or authorize a send.
- The comparison binds request, worker/producer, destination, supervisor, owner epoch, evidence, execution context, nonce, lane, GitHub target, and continuation source. Only regenerated transport time is excluded from intent.
- Direct tests cover lost HTTP acknowledgement, concurrent identical requests, post-expiry acknowledgement, changed intent/context, and wrong producer/worker. All converge on one durable queue event without deadline renewal.

### B. Real consumer and recovery seams — complete in code/tests

- V5 is exercised through the actual admission route and exact daemon read, public MCP handler with persisted server observation, real SQLite EventStore, GitHub normalization/intake, relay serialization, central scheduler client/service, and controller continuation consumer.
- A controlled real CDP/WebSocket test disconnects after click dispatch and before the reply. The actual browser adapter reports `CLICK_DISPATCHED`; central abort is rejected; restart preserves ambiguity; the exact retry is rejected; only one click occurs.
- A centrally confirmed pre-click abort retries the same semantic request, provider session, target, and queue identity without allocating a conflicting job.
- PM-mediated V5 OWNER continuation carries exact OWNER bytes and causal digest, excludes PM assistant output, contains no preload/capability message, forbids recursive delegation, and atomically commits receipt, execution attestation, and controller resolution.
- The V5 atomic test injects a resolution-write failure, proves the receipt is rolled back, and then admits the unchanged retry.
- Remaining integration gap: these seams were not exercised against the deployed daemon/tunnel/browser because live authority was stale and exact queue state was not readable with this account.

### C. Live responsiveness — diagnosed and repaired in source

Bounded read-only probes found:

- Daemon `/health` took 13.504 seconds and 15.64 seconds on successive successful reads.
- During the read, the daemon consumed approximately 85–101% of one CPU core and held about 468 MiB RSS.
- The readiness response reported sequence 12,173, valid event chain, configured submission authority, valid submission ledger, and scheduler state `LEASE_STALE`.
- Daemon `/snapshot` and the app's aggregate runtime-status read returned no bytes within a 10-second bound.
- The deployed readiness path synchronously replayed and rehashed the full immutable event ledger on every request. The deployed reconciliation path also lacked the current bounded high-water/overlap implementation and the deployed daemon lacked the new exact event lookup.
- The repository repair caches the already-verified immutable prefix and uses the existing indexed `eventsAfter(sequence)` read to validate only the appended suffix. A reopened store revalidates its durable prefix once, then resumes incrementally. Append-only database triggers and the single-writer lock remain unchanged.
- No timeout was increased, no second scheduler/authority was introduced, and no durability or receipt checks were relaxed.

## Model, controls, and allowance

- Recommended setting was GPT-5.6 Sol / Extra High / `SET_REQUEST_SUFFICIENT` / `DO_NOT_ENABLE_FAST`.
- No task-level model/effort setter or independent readback was exposed in this execution surface. The actual model/effort therefore remains unobserved and is not claimed.
- Fast was not enabled and no Fast readback is claimed.
- Latest account observation: Pro plan; 22% of the 10,080-minute Codex window used (78% remaining); flexible credit balance 0; spend control not reached; one free reset available and unused.
- No reset was consumed, no credits were purchased, and no model switch was used to address access.

## Validation

All commands used the repository test-efficiency observer and the verified Node 22.23.2 runtime.

Final successful results:

- Required app consumer set plus daemon-readiness coverage: **78 passed, 0 failed, 0 skipped**.
- Relay, central scheduler, CDP uncertainty, retry identity, and OWNER-continuation set: **99 passed, 0 failed, 0 skipped**.
- EventStore/ledger regression set: **77 passed, 0 failed, 0 skipped**.
- Focused daemon health/incremental verification: **4 passed, 0 failed, 0 skipped**.
- TypeScript: `tsc --noEmit --project tsconfig.json` — **passed**.
- `git diff --check` — **passed**.

Decision-relevant failures and corrections remain in telemetry:

- Invalid observer scope was rejected, then corrected to the canonical `focused` scope.
- The first V5 continuation fixture omitted the route's durable worker field; the real EventStore rejected it, the fixture was corrected, and the test passed.
- Earlier admission fixtures exposed execution-scope and producer-identity mistakes; each was corrected without erasing the failed record.
- The new readiness test initially triggered TypeScript's assertion narrowing; the assertion was rewritten without weakening the test and typecheck passed.
- Relay retry fixtures initially violated the failed-session state and configured retry delay; both were corrected and the final relay set passed.

The full repository/app/build/security/packaging release gates were intentionally not run: there was no deployment or release boundary after live authority failed closed.

## Release, deployment, and rollback

- Publication unit: the owned work branch and pull request only.
- Live deployment: **not performed**.
- Live build/install/restart: **not performed**.
- Deployed tree identity: not claimed. The running source did not expose a trustworthy release-commit marker and differed from the current reviewed tree.
- Rollback artifact: not created because no live mutation occurred; the existing runtime and its prior rollback state were left untouched.
- Provider services, tunnel configuration, credentials, browser targets, Docker membership, sudo policy, and security settings were not changed.

## Live correlation and counts

- Live supervisor admission requests created by this pass: **0**.
- Live provider sessions created: **0**.
- Live GitHub decision receipts created: **0**.
- Browser click/send attempts: **0**.
- Synthetic supervisor sends: **0**.
- Real supervisor sends: **0**.
- Paid model API calls: **0**.
- Paid model API spend: **0**.
- Scientific experiment runs: **0**.
- Production mutations: **0**.
- Restarts: **0**.
- Owner interventions during execution: **0**.

Counts are based on invoked operations: this pass used only source-control, test, local HTTP health/status reads, and bounded process inspection. It never invoked an admission mutation, browser relay send, provider submission, GitHub decision write, deployment, or restart endpoint. No live request/session/receipt correlation identifiers therefore exist for this pass.

## Runtime safety and unresolved state

- Event ledger at the bounded health read: valid.
- Submission-authority ledger at the bounded health read: valid.
- Scheduler state: `LEASE_STALE`.
- Exact queue depth, queue head, and unresolved admission: **unobserved**. The authenticated status endpoint requires a credential not available to this account, and Docker API access remains denied.
- Previously documented role/fence state was not modified. This pass did not activate a lease, release a fence, perform takeover/failover, or replay any historical request.
- The interrupted legacy preload transaction was not replayed or converted.
- Effective send eligibility for this pass: **disabled by safety hold**. No send was attempted after the stale lease was observed.
- The runtime was left running in its pre-existing state. Because exact authority/queue state is unavailable, this receipt does not assert that the service is generally safe to send.

Restart/replay evidence is test-only: SQLite restart preserves accepted receipts; crossed click uncertainty remains ambiguous and blocks replay; confirmed pre-click abort preserves the original queue/session identity. No live restart or replay occurred.

## Outcome and exact next action

The owner outcome remains **OPEN**. Green code/tests do not substitute for the requested useful live execution.

The originating Chat should hand this reviewed branch to an authorized platform operator who can:

1. Read the authenticated submission-authority status and bounded ledger, establishing exact queue depth, queue head, unresolved admissions, active role/epoch/lease, and both fences without changing them.
2. Resolve the stale lease only under the existing owner-authorized authority procedure; do not infer takeover or change host roles from this receipt.
3. Run the directive's full release gates against this exact branch head, build the canonical package, record its source/archive digest and rollback identity, and deploy with a volume-preserving controlled restart.
4. Verify first-read chain integrity and then near-constant readiness latency on an unchanged ledger, plus bounded reconciliation, queue coherence, 60-second pacing, active single-writer lease, and unchanged fencing.
5. Only after those checks are unambiguous, run exactly one harmless useful synthetic per-request supervisor task. If it completes with one send, exact MCP access, authorized GitHub receipt, and admitted decision, run one already-admissible bounded real non-scientific task.
6. Stop on any ambiguous send, unresolved admission, stale/contradictory lease, privacy concern, or access failure. Do not resume V3, remove legacy challenge machinery, replay the old preload transaction, or merge to main in this pass.
