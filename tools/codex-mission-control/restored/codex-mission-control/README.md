# Codex Mission Control

A local audit and observability dashboard for answering one question quickly: **are my Codex workers still doing what I asked them to do?**

Four or more workers append structured events to SQLite. Their assigned Pro supervisor chats append assessments to the same log. The dashboard derives present state, deterministic drift warnings, intervention priority, and a concise “since I last looked” summary. It observes; it does not autonomously supervise or redirect workers.

## Run locally

Requirements: Node.js 22.5+ (the app uses Node's built-in SQLite module) and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first dashboard request seeds four realistic demo workers. To start with an empty database, set `MISSION_CONTROL_SKIP_SEED=1`. To choose another database file, set `MISSION_CONTROL_DB=/absolute/path/mission-control.db`.

Useful checks:

```bash
npm test
npm run typecheck
npm run build
npm start
```

SQLite data lives at `data/mission-control.db` by default and is intentionally excluded from Git.

## Architecture

- Next.js, React, and TypeScript for the local dashboard and API
- Node's built-in SQLite for persistent append-only events
- SSE at `GET /api/events/stream` for live updates
- Zod runtime schemas in `lib/schema.ts`
- Derived worker state and deterministic drift scoring in `lib/projection.ts`
- Configurable weights and thresholds in `config/drift-rules.json`

The `events` table is append-only: application code only inserts and reads. Current worker state is projected from ordered events. The `review_state` table stores only the dashboard cursor used by “mark viewed”; it does not alter worker history.

### Objective-contract invariant

`objective_created` is write-once per worker. A second objective is rejected with HTTP 409. A heartbeat that repeats a different `objective` string is also rejected. To undertake a different objective, create a new worker ID and a new contract.

Supervisor chat links do not weaken this invariant. The initial link is stored with `objective_created`; later corrections use `supervisor_chat_link_set`. The projection uses the latest link event while retaining the original contract and complete change history.

## Demo Pro supervisor chat links

The four seeded URLs are explicit placeholders such as:

```text
https://chatgpt.com/c/replace-billing-supervisor
```

They appear on every dashboard card and worker detail page with a **demo link** flag. Replace them with actual Pro chat URLs by appending a link event:

```bash
curl -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' \
  -d '{
    "type": "supervisor_chat_link_set",
    "worker": "billing",
    "supervisor_chat_url": "https://chatgpt.com/c/YOUR-REAL-CONVERSATION-ID",
    "supervisor_chat_label": "Open Billing Pro supervisor",
    "reason": "Connected the assigned durable supervisor chat"
  }'
```

There is also a focused convenience endpoint. It creates the same append-only event:

```bash
curl -X POST http://localhost:3000/api/workers/billing/supervisor-chat \
  -H 'content-type: application/json' \
  -d '{
    "supervisor_chat_url": "https://chatgpt.com/c/YOUR-REAL-CONVERSATION-ID",
    "supervisor_chat_label": "Open Billing Pro supervisor",
    "reason": "Replaced the seeded demo URL"
  }'
```

## Event ingestion API

Append one validated event:

```text
POST /api/events
Content-Type: application/json
```

Read events with `GET /api/events`. Read the projected fleet with `GET /api/workers` and one worker with `GET /api/workers/:worker`. All POST responses contain the new event ID and timestamp. Malformed events return 400; objective-contract conflicts return 409.

### Create an objective contract

Do this once before sending any other event for a worker:

```bash
curl -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' \
  -d '{
    "type": "objective_created",
    "worker": "search",
    "worker_name": "Search indexing",
    "goal": "Make document indexing retry-safe",
    "acceptance_criteria": ["Duplicate jobs are idempotent", "Integration tests pass"],
    "allowed_scope": ["src/search/**", "tests/search/**"],
    "forbidden_scope": ["src/billing/**", "src/core/auth/**"],
    "expected_max_diff_lines": 400,
    "supervisor_chat_url": "https://chatgpt.com/c/YOUR-SEARCH-SUPERVISOR-ID",
    "supervisor_chat_label": "Open Search Pro supervisor"
  }'
```

### Worker heartbeat schema and example

The canonical TypeScript/Zod schema is `workerHeartbeatSchema` in `lib/schema.ts`. Fields use snake case at the HTTP boundary. Defaults are applied for optional evidence fields.

```bash
curl -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' \
  -d '{
    "type": "worker_heartbeat",
    "worker": "billing",
    "objective": "Implement retry-safe Stripe webhook handling using the existing event model",
    "status": "working",
    "current_step": "Adding idempotency storage",
    "completed_steps": ["Mapped webhook entry points"],
    "next_steps": ["Add duplicate-event test", "Run integration suite"],
    "files_touched": ["src/billing/webhooks.ts", "src/billing/events.ts"],
    "tests": {"passing": 184, "failing": 0, "lint": "passing", "build": "passing"},
    "plan_changed": false,
    "plan_change_reason": null,
    "blocker": null,
    "assumptions": ["Stripe event IDs are stable"],
    "diff_lines": 188,
    "repeated_failure_count": 0,
    "assumptions_materially_changed": false,
    "architecture_rewrite": false,
    "architecture_rewrite_explained": false,
    "destructive_action": false,
    "touched_other_worker_area": false,
    "major_contract_violation": false
  }'
```

### Pro supervisor verdict schema and example

The canonical schema is `supervisorVerdictSchema` in `lib/schema.ts`. `alignment` is evidence supplied by the supervisor; it does not replace deterministic drift warnings.

```bash
curl -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' \
  -d '{
    "type": "supervisor_verdict",
    "worker": "billing",
    "verdict": "WATCH",
    "alignment": 0.72,
    "reason": "Worker introduced a new event abstraction not required by the task.",
    "corrective_action": "Finish idempotency using the existing event model.",
    "review_after": "next_commit",
    "work_no_longer_serves_objective": false
  }'
```

## Supported event types

`objective_created`, `worker_heartbeat`, `plan_changed`, `command_run`, `files_changed`, `tests_run`, `commit_created`, `blocker_reported`, `supervisor_verdict`, `redirect_issued`, `task_completed`, and `supervisor_chat_link_set`.

Each is a member of the discriminated TypeScript union `MissionControlEvent`. The worker detail timeline renders every stored member.

## Deterministic drift scoring

Weights, thresholds, diff limits, retry counts, and checkpoint staleness are loaded from `config/drift-rules.json`, not hardcoded in the UI. Warning points cover supervisor misalignment, unexplained plan changes, forbidden-scope touches, regressions, oversized diffs, retry loops, material assumption changes, and stale checkpoints.

These immediately force RED regardless of total score: supervisor redirect, destructive action, unexplained architecture rewrite, touching another worker's area, and major objective-contract violation.

Color semantics:

- GREEN — continue autonomously
- YELLOW — inspect the next checkpoint
- RED — redirect before more work proceeds

## Mark viewed and live updates

`POST /api/viewed` advances a single local review cursor to the latest event ID. The next summary includes only subsequent events. SSE clients receive appended events without changing history; the browser then fetches a fresh deterministic projection.
