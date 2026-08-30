# Mission Control Dashboard Adaptation — Next Codex Slice

**Status:** Ready for execution  
**Date:** 2026-08-30  
**Owner outcome:** Build a local Mission Control dashboard that lets the owner supervise several Codex workers while detecting both worker drift and laundered/narrowed task contracts, without rebuilding orchestration that Symphony already solves.

## Why this slice belongs in Codex

This slice requires local execution that Extra High cannot complete reliably by itself:

- restoring and inspecting the existing dashboard source archive;
- installing/running the actual Next.js application;
- exercising SQLite persistence and migrations;
- running tests/build/typecheck;
- starting the local server and inspecting rendered behavior;
- modifying source files and schemas;
- later attaching a stock Symphony read-only adapter.

Use Extra High for architecture/code-review checkpoints and evidence organization. Use Pro only for consequential supervision-design questions, especially if this slice exposes a loophole in the supervision model.

## Existing implementation authority

Do not create a new dashboard from scratch.

Reuse and audit PR #41:

- PR: `u-dont-existDOTcom/universal-dev-architecture#41`
- branch: `task/codex-mission-control-mvp-20260830`
- head at planning time: `7fa261970b0d2f2227126b9883173fafed0474df`
- source bundle: `tools/codex-mission-control/source-archive/`
- restore script: `tools/codex-mission-control/restore-source.sh`
- prior implementation contract: `tools/codex-mission-control/IMPLEMENTATION-SPEC.md`

PR #41 already contains a Next.js/React/TypeScript dashboard, SQLite append-only event ledger, SSE invalidation, worker/supervisor event ingestion, intervention-first dashboard, worker detail views, and deterministic tests. Treat that as the implementation baseline, not as current architecture authority.

Current architecture authority is PR #42 branch `architecture/codex-pro-supervision-mission-control-20260830` and all current Mission Control patterns/addenda.

## Slice objective

Restore and run the PR #41 dashboard locally, freeze an exact gap audit against PR #42, then adapt the smallest useful dashboard/runtime layer so that the old single objective/alignment model is replaced by the current owner-source, dual-alignment, typed-completion architecture.

Do **not** yet automate consequential redirects, account switching, Pro web interaction, deployment, or four-worker Symphony dispatch.

## Required read order

1. Current owner instructions.
2. `templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md` on PR #42 branch.
3. All current Mission Control patterns referenced by `docs/INDEX.md`, especially:
   - `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`
   - `patterns/supervision-assurance-planes-and-pro-meta-review.md`
4. Current Mission Control execution-plan addenda.
5. PR #41 README, architecture, implementation spec, restore script, and source archive.
6. Current `openai/symphony` SPEC/reference docs only for interface boundaries; do not fork Symphony.

## Phase A — restore and freeze the real baseline

Use a fresh worktree/branch derived from the chosen implementation baseline. Restore the source archive and record:

- exact archive SHA and restored-tree fingerprint;
- package manager and lockfile state;
- Node/npm versions;
- exact install command and result;
- exact test/typecheck/build commands and results;
- server start command;
- database path/schema;
- API routes;
- screenshots of current main dashboard and worker detail view;
- current event and objective schemas;
- whether the application truly works outside prior framework stubs.

Do not modify behavior until this snapshot is committed.

## Phase B — frozen gap audit

Classify each current PR #41 capability:

```text
KEEP
ADAPT
REPLACE_WITH_SYMPHONY
DELETE_AS_DUPLICATE
DEFER
UNKNOWN
```

At minimum audit:

- immutable `ObjectiveContract` versus independently sourced owner outcome;
- old single alignment number versus dual alignment planes;
- old supervisor verdict structure;
- worker heartbeat schema;
- typed completion claims;
- owner-source receipt;
- objective reconciliation matrix;
- contract laundering fail-closed states;
- AskRigor operational/scientific/release adequacy fields;
- append-only event ledger;
- SQLite ownership/process boundary;
- SSE projection;
- dashboard card fields/order;
- review cursor;
- drift scoring;
- worker claims versus independent evidence;
- any process/scheduling behavior Symphony should own.

Freeze this audit before broad code changes.

## Phase C — adapt the data model and event projection

Minimum new machine-visible state:

```text
owner_request_id
owner_request_sha256
owner_source_receipt_id
objective_reconciliation_id
task_contract_sha256
worker_to_contract_alignment
contract_to_owner_alignment
completion_claim_type
unmapped_owner_requirements
authorized_scope_changes
contract_divergence
evidence_receipts
reconciliation_freshness
supervision_design_feedback_ids
```

For research/AskRigor tasks additionally support optional:

```text
operational_alignment
scientific_adequacy
release_adequacy
release_permission
```

Rules:

- Do not average worker-to-contract and contract-to-owner states.
- `GREEN + DIVERGED` projects overall RED.
- `SOURCE_MISSING` fails closed for root completion/release while allowing safe reversible contributing work where valid.
- `READY_FOR_OWNER_REVIEW` is not `OWNER_OUTCOME_ACHIEVED`.
- Supervisor approval cannot override missing owner-source receipt or unmet owner outcome.
- Old events remain readable where feasible; use explicit versioning/migration rather than silently reinterpreting historical bytes.

## Phase D — adapt the UI

Main card should prioritize:

1. task title and current execution state;
2. owner-outcome summary/current gap;
3. **Worker → Contract** state;
4. **Contract → Owner** state;
5. overall traffic state;
6. typed completion claim;
7. verification/evidence freshness;
8. top unmapped requirement or contract divergence;
9. Pro/Extra High route and next review trigger;
10. AskRigor three-plane verdicts when applicable.

Never show a lone `Alignment: 91%` as the controlling signal.

Add a visible state demonstrating:

```text
Worker → Contract: GREEN
Contract → Owner: DIVERGED
Completion claim: READY_FOR_OWNER_REVIEW
Overall: RED
Directive: CONTINUE_HUMANIZATION
```

using the `13.82% Human` regression fixture.

## Phase E — deterministic regressions

Implement automated tests for at least:

1. old healthy worker remains GREEN when both alignment planes pass;
2. worker GREEN + contract DIVERGED => overall RED;
3. independent owner-source receipt missing => no root completion;
4. material owner requirement unmapped => no MATCH;
5. `READY_FOR_OWNER_REVIEW` cannot become outcome achieved by label translation;
6. supervisor ON_TRACK cannot override contract divergence;
7. exact `13.82% Human` regression projects RED and continued humanization;
8. AskRigor operational PASS + scientific FAIL => no release;
9. AskRigor scientific PASS + release FAIL => no publication permission;
10. append-only ledger/idempotency/hash-chain guarantees continue to pass;
11. existing valid supporting work remains visible after contract repair;
12. stale reconciliation is visible and cannot authorize root completion.

## Phase F — read-only Symphony seam

Only after the adapted dashboard is green locally, define and if practical implement the **thin read-only seam** for one stock Symphony instance:

```text
Symphony JSON state/API
    -> adapter
    -> normalized Mission Control runtime events
    -> existing append-only ledger
    -> dashboard projection
```

Do not let Mission Control dispatch, retry, stop, or reconcile Codex workers in this slice. Those remain Symphony-owned.

If live Symphony setup requires unavailable Linear/account configuration, preserve the adapter boundary and fixture-based test, and report the exact blocker instead of building a custom scheduler.

## Pro supervisor-design checkpoint

After the frozen gap audit and again if a material architecture loophole is discovered, prepare a self-contained `SUPERVISION-DESIGN-FEEDBACK` packet for the shared Pro meta-review lane. Ask Pro specifically whether the proposed adaptation preserves independent owner-source receipt, dual alignment, typed completion, fail-closed terminalization, and separation from Symphony orchestration.

Do not use Pro for routine code review or build/test debugging.

## Completion boundary for this slice

This slice is complete when:

- PR #41 source is restored and actually runs locally;
- the baseline and gap audit are committed;
- the dashboard shows dual alignment and typed completion;
- owner-source receipt/reconciliation state is machine-visible;
- the strengthened contract-laundering fixture passes end to end through projection/UI data;
- AskRigor three-plane verdict data can be represented without collapsing it;
- deterministic existing ledger guarantees remain green;
- a one-worker Symphony read-only seam exists or its exact external blocker is documented;
- no custom Symphony-replacement scheduler was added;
- exact commands, screenshots, test receipts, current-state checkpoint, and next slice are durable in GitHub.

Do not claim the overall Mission Control owner outcome complete. This is an implementation slice.

## Next likely slice after this one

If this slice passes, the next slice is:

**one live Symphony-managed Codex worker -> Mission Control telemetry/evidence packet -> optional Extra High review -> focused Pro semantic review -> validated review import**, still read-only with respect to worker control.
