# Controller-mediated PM GitHub loop execution plan

Status: ACTIVE
Assurance lane: RELEASE
Owner source: `docs/requirements/2026-09-09-controller-mediated-pm-github-loop.owner-requirement.json`
Canonical contract: issue #53 comment `5594633379`, exact body SHA-256 `1a712ce1bb1d58d7faf59d662baf6f00f54fc1ee85e5cf836e7c83603726d87b`
Starting canonical main: `b7bab6be84cc42c188fbd701c57d670b09759db1`
Task branch: `task/controller-mediated-pm-github-loop-20260909`

## Active lesson contract

| Lesson | Trigger | Required behavior | Failure condition | Repair | Enforcement |
| --- | --- | --- | --- | --- | --- |
| Owner-outcome integrity | Prior partial completions and an exact live boundary | Trace every change and claim to the literal end-to-end request; keep excluded proofs and proxies non-satisfying | Closing after code/CI/install without the fresh PM-mediated proof | Resume at the first unmet owner-observable transition | Semantic + mechanical |
| Task-time activation | Consequential multi-stage execution | Run this table before code, GitHub closeout, install, live send, and final delivery | A required rule has no concrete application evidence | Stop the boundary, repair, rerun the gate | Mechanical + semantic |
| Test efficiency | Repeated focused/full/hosted testing can dominate wall time | Start telemetry now, use focused tests in the inner loop, and run the full gates once at the release checkpoint | Repeating unchanged green full suites or omitting required telemetry | Return to focused tests or record the material rerun reason | Mechanical |
| Release assurance | The request includes merge, install, and live proof | Require focused tests, full repository gates, hosted exact-head checks, exact-diff review, rollback, install parity, and live evidence | Crossing PR/install/live boundaries without their applicable gate | Hold at the boundary and complete the missing gate | Mechanical |
| Executable frontier | Restart-safe multi-stage controller | Every nonfinal state exposes a named next action or explicit fail-closed state; generation completion alone never advances semantic state | A nonfinal state has no executable transition or advances without GitHub evidence | Preserve state and repair the missing field/transition only | Mechanical |
| Browser ownership | Shared authenticated browser/profile | Bind cycle targets by exact persisted target + window identity; never choose by latest/active/first/URL match; preserve pacing and bounded rate-limit recovery | Any unowned/window-mismatched target can be used, or URL/recency selects a target | Fail closed and recover/create/register only through ownership protocol | Mechanical |
| Chat-led reasoning | PM/origin chats own semantics and ordinary GitHub work | Controller sends exact control packets and immutable refs; prompts explicitly forbid GitHub delegation to Work; controller never consumes assistant DOM output | Controller authors/changes semantic bytes or treats browser completion as authority | Reject the transition and wait for a chat-authored GitHub artifact | Mechanical + semantic |
| Persistent permissions and rollback | Git/GitHub/install operations cross protected metadata/host boundaries | Use the existing reviewed execution boundary, preserve unrelated work and an exact rollback point, and never broaden into production | Unclear rollback, private data exposure, destructive/shared-history mutation, or production contact | Stop and durably record the exact blocker | Mechanical |

Pre-implementation admission: PASS — exact owner source and issue contract were fresh-read; canonical main was fetched; the isolated task branch is based at the exact fetched main; excluded work and production boundaries are explicit.

## Execution frontier

1. Inspect and compose the existing Mission Control route, GitHub receipt, owner-continuation, relay persistence, exact-browser-ownership, pacing, and restart primitives.
2. Implement the smallest controller state machine and deterministic focused tests.
3. Reconcile the owner requirement and current-state checkpoint; package the restored Mission Control source if changed.
4. Run focused/affected checks, then the single release checkpoint and repository audit under test-efficiency telemetry.
5. Review the exact diff, commit, push, open a focused PR, obtain hosted checks and an independent exact-head review, repair if needed, and merge through the protected path.
6. Install the exact merged relay package on the authorized non-production Hostinger relay with rollback preservation and parity/readiness checks.
7. Create and execute exactly one fresh disposable PM-mediated OWNER-byte fixture using only exact automation-owned targets; preserve GitHub/Mission Control/browser receipts without assistant-output inspection.
8. Record the live result and final requirement/current-state disposition in a reviewed closeout PR; leave production untouched and keep provider source time explicitly unverified.

## Durable stop rule

Stop only for one concrete missing field/transition, a genuine owner decision, or a safety/privacy boundary. Before stopping, record the exact blocker, affected state, preserved completed work, clearing actor/event, and next executable action on issue #53.
