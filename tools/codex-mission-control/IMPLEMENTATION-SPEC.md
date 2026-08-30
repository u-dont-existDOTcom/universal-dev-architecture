# Codex Mission Control — implementation contract

## Purpose and non-goal

Mission Control is a local audit and observability layer answering one question: **are the workers still doing what the owner assigned them to do?** It ingests structured evidence from Codex workers and separate Pro supervisors, derives current state deterministically, and exposes evidence for human intervention. It does not independently supervise, redirect, edit, or execute worker tasks.

## Runtime composition

- Next.js App Router + React + TypeScript
- Node built-in `node:sqlite` for a lightweight local event store
- append-only event ledger with stable event IDs and a global hash chain
- Web Streams server-sent events as invalidation notifications
- client refreshes canonical snapshots from ordinary JSON endpoints after an SSE notification
- no ORM, external event bus, or LLM dependency in the scoring path

## Core authority model

1. The immutable objective contract is the baseline for drift analysis.
2. The append-only event ledger is the source of truth.
3. Current worker snapshots are projections derived by folding events.
4. Deterministic warnings cannot be erased by a high supervisor alignment estimate.
5. A supervisor can escalate risk immediately, but Mission Control never issues an autonomous redirect.
6. `mark viewed` appends a review cursor; it never mutates or deletes work evidence.

## Objective contract

```ts
export interface ObjectiveContract {
  worker: string;
  workerName: string;
  goal: string;
  acceptanceCriteria: string[];
  allowedScope: string[];
  forbiddenScope: string[];
  ownedAreas: string[];
  expectedMaxDiffLines?: number;
  checkpointStaleAfterMinutes?: number;
}
```

Exactly one `objective_created` event may establish a contract for a worker within a mission. A conflicting replacement fails closed. Retry of the same stable event ID and identical payload is idempotent.

## Worker heartbeat schema

```ts
export interface WorkerHeartbeatEvent {
  event_id: string;
  mission_id: string;
  occurred_at?: string;
  type: "worker_heartbeat";
  worker: string;
  objective: string;
  status?: "working" | "blocked" | "done";
  current_step: string;
  completed_steps?: string[];
  next_steps: string[];
  files_touched: string[];
  diff?: { files?: number; additions?: number; deletions?: number };
  tests: {
    passing: number;
    failing: number;
    command?: string;
    lint?: "passing" | "failing" | "not_run" | "unknown";
    build?: "passing" | "failing" | "not_run" | "unknown";
  };
  commits?: Array<{ sha: string; message: string; url?: string }>;
  plan_changed: boolean;
  plan_change_reason: string | null;
  blocker: string | null;
  blocker_legitimate?: boolean;
  assumptions?: string[];
  assumptions_changed?: boolean;
  assumptions_change_reason?: string | null;
  repeated_failure_count?: number;
  destructive_or_unexpected_action?: boolean;
  unexplained_architecture_rewrite?: boolean;
  major_contract_violation?: boolean;
  notes?: string;
}
```

The worker-provided `objective` is evidence for mismatch detection, not authority over the stored objective contract.

## Supervisor verdict schema

```ts
export type SupervisorVerdict = "ON_TRACK" | "WATCH" | "REDIRECT";
export type ReviewAfter =
  | "next_checkpoint"
  | "next_commit"
  | "after_tests"
  | "after_blocker"
  | "task_completion"
  | string;

export interface SupervisorVerdictEvent {
  event_id: string;
  mission_id: string;
  occurred_at?: string;
  type: "supervisor_verdict";
  worker: string;
  verdict: SupervisorVerdict;
  alignment: number; // inclusive 0..1
  reason: string;
  corrective_action: string | null;
  review_after: ReviewAfter;
  current_work_serves_objective?: boolean;
}
```

Displayed alignment is conservative: the lower of deterministic alignment and the latest supervisor estimate. A supervisor `REDIRECT` immediately forces RED.

## Event vocabulary

The accepted discriminated union includes:

- `objective_created`
- `worker_plan`
- `worker_heartbeat`
- `plan_changed`
- `command_run`
- `files_changed`
- `tests_run`
- `commit_created`
- `blocker_reported`
- `supervisor_verdict`
- `redirect_issued`
- `task_completed`
- `review_marked`

Events carry a stable `event_id`, `mission_id`, `worker` where applicable, server receipt time, payload, previous event hash, and event hash. Payload reuse under the same ID with different bytes is rejected.

## SQLite model

A minimal deployment uses these tables:

```sql
CREATE TABLE IF NOT EXISTS events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  mission_id TEXT NOT NULL,
  worker TEXT,
  type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  previous_hash TEXT,
  event_hash TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS events_mission_sequence
  ON events(mission_id, sequence);
CREATE INDEX IF NOT EXISTS events_worker_sequence
  ON events(mission_id, worker, sequence);
```

The ledger verifies the complete global chain before projecting a mission, so corruption outside one requested worker is not silently ignored.

## Configurable drift model

Configuration is data, not UI logic:

```ts
export interface DriftRuleConfig {
  weights: {
    supervisorOffObjective: number;        // default 35
    unexplainedPlanChange: number;         // default 25
    forbiddenScopeTouched: number;         // default 20
    testRegression: number;                // default 15
    excessiveDiff: number;                 // default 15
    repeatedFailureLoop: number;           // default 10
    assumptionsMateriallyChanged: number;  // default 10
    staleCheckpoint: number;               // default 10
  };
  thresholds: { yellow: number; red: number };
  immediateEscalations: {
    supervisorRedirect: boolean;
    destructiveUnexpectedAction: boolean;
    unexplainedArchitectureRewrite: boolean;
    anotherWorkerOwnedArea: boolean;
    majorObjectiveViolation: boolean;
  };
}
```

Default numeric score:

- +35 supervisor says current work no longer serves objective
- +25 plan changes without explanation
- +20 explicitly forbidden subsystem/files touched
- +15 previously passing tests regress
- +15 diff substantially exceeds the contract's expected scope
- +10 repeated failure/undo/retry loop
- +10 material requirement assumptions change
- +10 checkpoint becomes stale

Default state mapping is GREEN below yellow threshold, YELLOW at/above yellow, and RED at/above red. Immediate escalation bypasses thresholds.

Each warning is evidence-bearing and includes a stable rule ID, severity, score contribution, explanation, and related events/files where available. Resolved historical warnings remain visible in the timeline but do not keep the current score elevated.

## Derived snapshot

A worker snapshot exposes:

```ts
export interface WorkerSnapshot {
  worker: string;
  workerName: string;
  objective: ObjectiveContract;
  status: "working" | "blocked" | "done";
  color: "GREEN" | "YELLOW" | "RED";
  verdict: "ON_TRACK" | "WATCH" | "REDIRECT";
  alignment: number;
  driftScore: number;
  currentStep: string | null;
  completedSteps: string[];
  nextSteps: string[];
  planChanged: boolean;
  planChangeReason: string | null;
  blockers: Array<{ text: string; legitimate: boolean }>;
  assumptions: string[];
  filesTouched: string[];
  commits: Array<{ sha: string; message: string; url?: string }>;
  diff: { files: number; additions: number; deletions: number };
  tests: {
    passing: number;
    failing: number;
    lint: "passing" | "failing" | "not_run" | "unknown";
    build: "passing" | "failing" | "not_run" | "unknown";
    regressed: boolean;
  };
  supervisor: {
    reason: string | null;
    correctiveAction: string | null;
    reviewAfter: string | null;
  };
  activeWarnings: DriftWarning[];
  lastCheckpointAt: string | null;
  timeline: MissionEvent[];
}
```

A legitimate blocker changes status to `blocked` without itself creating drift. This permits a GREEN/blocked worker when trajectory remains aligned.

## API

### `POST /api/events`

Accepts one event or an array of events. Validates the discriminated union, enforces objective immutability and idempotency, appends transactionally, then emits an SSE invalidation.

Responses distinguish:

- newly appended events
- identical retry events
- validation failures
- event-ID payload conflicts
- objective-contract conflicts
- integrity failures

### `GET /api/dashboard?mission_id=<id>`

Returns the 30-second review summary, intervention-first ordering, review cursor, and all worker snapshots.

### `GET /api/workers/<worker>?mission_id=<id>`

Returns the objective contract, trajectory, work evidence, supervisor assessment, warnings, and chronological event stream.

### `POST /api/review/mark-viewed`

Appends a `review_marked` event for the mission at the current ledger sequence. The next summary covers only subsequent changes.

### `GET /api/stream?mission_id=<id>`

Sends SSE invalidations and periodic keep-alives. It is not a second state store; clients refetch canonical JSON.

### `GET /api/health`

Checks database availability and global ledger integrity.

## Curl examples

```bash
curl -sS http://127.0.0.1:3000/api/events \
  -H 'content-type: application/json' \
  --data-binary @worker-heartbeat.json
```

```bash
curl -sS http://127.0.0.1:3000/api/events \
  -H 'content-type: application/json' \
  --data-binary @supervisor-verdict.json
```

```bash
curl -N 'http://127.0.0.1:3000/api/stream?mission_id=demo'
```

```bash
curl -sS http://127.0.0.1:3000/api/review/mark-viewed \
  -H 'content-type: application/json' \
  -d '{"mission_id":"demo"}'
```

## Demo state

The demo is seeded through the same append-only ingestion path used in production:

1. Auth refactor — GREEN / ON_TRACK.
2. Billing/webhooks — YELLOW / WATCH after expanding into a shared event schema; supervisor requests return to the existing model.
3. UI migration — GREEN while blocked on a legitimate dependency.
4. Test cleanup — RED / REDIRECT after beginning to rewrite production core logic.

The first review summary names the state transitions, interventions, legitimate blocker, and unresolved test regression state in ordinary language. Mark viewed resets the review window without removing evidence.

## Required test boundaries

- objective contract cannot be replaced
- same event ID + same payload is idempotent
- same event ID + different payload fails closed
- append-only database enforcement
- persistence survives store restart
- global hash-chain corruption is detected
- forbidden file/area produces deterministic warning
- unexplained plan change produces warning
- supervisor `REDIRECT` forces RED
- deterministic violation survives an optimistic supervisor estimate
- legitimate blocker can remain GREEN
- prior passing-test regression is scored
- excessive diff is scored against contract expectation
- warning can resolve after corrective evidence
- `mark viewed` changes only the review cursor
- seeded demo folds to 2 GREEN, 1 YELLOW, 1 RED
- change summary is empty after mark viewed until a new event arrives

## Deliberate simplifications

- local single-process deployment; SQLite serializes writes
- SSE broadcasts invalidation rather than full snapshots
- no authentication by default because the server binds locally; remote exposure requires an auth boundary
- no autonomous LLM scoring in the critical path
- no generic charts; the interface prioritizes interventions, changes, alignment evidence, then raw activity
