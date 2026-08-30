# Mission Control PR #41 restored baseline

**Frozen:** 2026-08-30

**Implementation baseline:** `7fa261970b0d2f2227126b9883173fafed0474df` (`task/codex-mission-control-mvp-20260830`)

**Current architecture authority:** `90a230e85f78063080dc627ec36a0237c3234f72` (`architecture/codex-pro-supervision-mission-control-20260830`)

**Assurance lane:** iteration, with a hard baseline-before-adaptation gate

This receipt freezes the behavior and provenance of the reusable PR #41 dashboard before the dual-alignment adaptation. It does not treat the prior implementation contract as proof of behavior.

## Restore provenance and integrity

The PR #41 restore path does **not** work as committed.

- Declared archive SHA-256: `93454988d7d103718e43c44602386ba09566c5ca12f11bb7004f3c7085d387c1`
- Reconstructed bytes from the two committed base64 parts: `b8315c1d08848dd17b6fe713b3830dda1b6ab97fe824d64175f8d676e5b92db9`
- Reconstructed size: 12,000 bytes
- `unzip -t`: failed because the end-of-central-directory record is absent
- Recovery source: the valid Mission Control ZIP retained by the originating 2026-08-30 Codex Work run
- Recovered ZIP SHA-256: `6391b999bd6f0351f4f9d95fb08e9c7c03e9aa8adb3dddee50d77f125ae603fe`
- Surviving local source commit: `38e95a269ee9654a5020b0c3630f7c0324d2e1b3`
- Surviving local source tree: `e269eff88fcd8754038f8aab55dfebf1eb53e2d0`
- Every file tracked by that surviving commit is byte-identical in the recovered ZIP.
- The recovered ZIP additionally carries its Next.js-generated `AGENTS.md` and `CLAUDE.md` instruction pointer.
- Restored committed-file manifest fingerprint: `7900c63a7e66ef4f738e4fa7f500204c873172e2ba493670d614ceecfe3884d2`
- Per-file hashes: [`restored-tree.sha256`](restored-tree.sha256)

The PR README's claimed source commit `ea59bab` is not present in the surviving source repository. This receipt retains the discrepancy instead of rewriting provenance to make it appear consistent.

## Runtime and dependency receipt

| Item | Exact value/result |
|---|---|
| Package manager | npm with committed `package-lock.json` |
| Lockfile SHA-256 | `61699e15da8d404cbbd8c4aac8d0be1fc93ba87fcabf3118e6c40da59e7ca388` |
| Node | `v24.18.0` |
| npm | `11.16.0` |
| Install command | `npm install` |
| Sandboxed install | Failed at the esbuild postinstall because executable spawn was denied (`EPERM`) |
| Host-boundary install | Passed: 34 packages added, 35 audited, 0 vulnerabilities |
| Deterministic suite | `npm test`: 5/5 Node test cases passed |
| TypeScript | `npm run typecheck`: passed |
| Production build | `npm run build`: passed outside the sandbox; all nine application/API routes compiled |
| Server command | `npm run dev -- --hostname 127.0.0.1 --port 3000` |
| HTTP readback | `/` and `/worker/tests` returned `200` and populated through the real JSON/SSE runtime |

The production compiler also passed inside the sandbox, but Next's detached TypeScript `--showConfig` capture was sandbox-blocked. The same build passed completely at the host execution boundary, including TypeScript, page-data collection, and static-page generation.

The app README lists `npm start`, but `package.json` has no `start` script. The verified server path is `npm run dev`.

## Actual process and persistence boundary

- Default database: `tools/codex-mission-control/restored/codex-mission-control/data/mission-control.db`
- SQLite journal mode: WAL
- Ownership: the Next.js server process creates and writes SQLite directly through a module singleton
- Migration system: none
- Event schema version: none
- Long-running poller: the Next.js SSE route polls SQLite every 750 ms

Actual tables:

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX events_worker_id ON events(worker, id);

CREATE TABLE review_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_viewed_event_id INTEGER NOT NULL DEFAULT 0,
  viewed_at TEXT NOT NULL
);
```

The seeded runtime produced 15 events: four objectives, four heartbeats, four supervisor verdicts, one blocker, one tests-run event, and one redirect.

## Actual API and UI surface

Verified routes:

- `POST/GET /api/events`
- `GET /api/events/stream`
- `POST /api/viewed`
- `GET /api/workers`
- `GET /api/workers/[worker]`
- `POST /api/workers/[worker]/supervisor-chat`
- `/`
- `/worker/[worker]`

Actual accepted event types are defined by the unversioned Zod union in `lib/schema.ts`:

- `objective_created`
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
- `supervisor_chat_link_set`

The current objective is a single write-once worker-local record containing goal, acceptance criteria, allowed/forbidden scope, optional diff limit, and one supervisor-chat link. It has no independently acquired owner-source receipt, owner-outcome epoch, reconciliation, dual alignment, or typed completion.

## Visual receipt

- [Dashboard — 1440 px](dashboard-1440.png)
- [Worker detail — 1440 px](worker-tests-1440.png)
- [Dashboard — 390 px](dashboard-390.png)
- [Worker detail — 390 px](worker-tests-390.png)

The desktop dashboard and detail view render successfully. At 390 px, the dashboard stacks without horizontal clipping, but the worker-detail timeline's date/type/summary columns visibly overlap. The first detail capture also demonstrated a real asynchronous loading state before the API projection arrived; the frozen screenshot waits for the worker heading and shows the populated state.

## Claims that did not reproduce from PR #41

The prior README/implementation contract claims stable client event IDs, retry idempotency, payload-reuse conflicts, a global hash chain, append-only database enforcement, restart persistence tests, 17 deterministic tests, and an immutable objective event per mission. The restored implementation has none of the first four controls, does not enforce append-only SQLite writes mechanically, has no `mission_id`, and exposes five test cases. Those are gap-audit inputs, not baseline guarantees.

## Baseline conclusion

The existing dashboard is a real, runnable Next.js application and is therefore the correct UI/runtime baseline to adapt. Its visual system, intervention-first information hierarchy, event-fold shape, SSE invalidation concept, seeded demonstrations, and worker/detail routes are reusable. Its package integrity, persistence guarantees, authority model, supervision projection, and process boundary require explicit repair.
