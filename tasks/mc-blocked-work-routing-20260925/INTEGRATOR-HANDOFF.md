# Integrator handoff: automatic reasoning on blocked execution

Integration destination: `chat/mc-claude-integrator-20260924`, active PR #254. Child branch: `chat/mc-blocked-work-routing-20260925`, based on `d3abe3d55d1aae84413ae28cfce1a0a744388d35`. This is an isolated proposed delta, not shared-runtime ownership or live deployment authority.

## Execute within the existing integration boundary
1. Fetch and inspect the child delta; integrate it only through the active integrator branch. Preserve intervening parent changes and the existing source-bound submission/decision/Work return contracts. Run the affected package tests and typecheck listed below after conflict resolution.
2. Recover the real private journal's current owner-source and task bindings through the authorized private runtime. Register an actual MC task/worker contract and a registered MC-only supervisor; never synthesize a historical native Work receipt, label a Node runner as native Work, or use a personal chat as an automation target. Importing a claimed outcome is not independent source verification.
3. Configure the existing source watcher for `MISSION_CONTROL_LIVE_SOURCE_FORMAT=JOURNAL_EXECUTION_V1`, an exact `MISSION_CONTROL_LIVE_WORKER_ID`, `MISSION_CONTROL_LIVE_TASK_ID`, `MISSION_CONTROL_LIVE_SOURCE`, and `MISSION_CONTROL_LIVE_WORKTREE`. Mount only the needed private state read-only. Verify the Git worktree's common-directory references are actually readable inside the runtime. Do not copy private paths or state bytes into public Git.
4. Use the existing authenticated named `owner:action watch-enroll` capability after the worker/task contract exists. Use the existing 60-second cadence (`--cadence-ms 60000`) for this blocked-execution watch; keep healthy ticks silent. Preserve unrelated disabled/paused projects. Reuse the existing daemon watcher and fleet timer; do not create a second submission scheduler or a consumer Task as a substitute.
5. Verify the configured registered supervisor, relay and executor have the required exact worker/task scope. Start with Extra High. Honor a current source-bound supervisor Pro escalation through the existing Pro lane. Credentials stay server-side; neither workers nor helper scripts may mint owner intent.
6. Obtain the existing required production confirmation before deploy/restart. Keep this as NOT_ACTIVE until the approved integrated version and source/watch/relay configuration are installed. Preserve a rollback to the existing image/config and do not interrupt the independent private inference surface unnecessarily.
7. Prove the complete actual consumer path: a durable blocked observation queues exactly one V6 review; the correct Chat controls are verified; its exact bound decision is admitted; a permitted evidence request or execution directive returns to the same task and verified execution destination. A true human gate is surfaced once. An unknown prior submission is reconciled, never blindly resubmitted.
8. Test restart/duplicate observations and an unavailable supervisor without another physical send, false completion, privacy leak, or loss of unrelated watches. Record actual route, delivery, decision and continuation receipts separately. Do not call QUEUED, schema validity, or a passing unit suite a successful live closed loop.

The private task-scoped activation details are staged in the existing deployment task directory under `mc-blocked-work-routing-20260925-activation.md`; read them privately. This packet contains control facts, not journal content. No owner clipboard/message relay is required.

## Package checks
From `tools/codex-mission-control/restored/codex-mission-control`, use the canonical test-efficiency observer with a package-cwd wrapper:
`node --import tsx --test tests/fleet-supervisor.test.ts tests/fleet-blocked-reasoning.test.ts tests/journal-execution-observation.test.ts tests/chatgpt-work-cloud-dispatch.test.ts`
`node node_modules/typescript/bin/tsc --noEmit --incremental false`

Prior measurements: 46 affected tests passed; 4 subsequent watcher recurrence tests passed; typecheck passed. Run broader release checks only at the actual integration/deployment checkpoint required by current policy.
