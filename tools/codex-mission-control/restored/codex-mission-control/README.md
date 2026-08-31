# Codex Mission Control

A local, explanation-first supervision dashboard for determining which workers need attention, exactly what is wrong, what correction has actually happened, and whether the owner must act.

This is the adapted PR #41 application. It observes durable supervision evidence; it does not dispatch, retry, stop, resume, or otherwise control workers.

## Run locally

Requirements: Node.js 22.5+ and npm.

```bash
npm install
npm run dev
```

`npm run dev` starts:

- the single-writer Mission Control daemon at `http://127.0.0.1:4100`;
- the Next.js dashboard at `http://127.0.0.1:3000`.

Open the dashboard route. It seeds six deterministic supervision fixtures into `data/mission-control.db` unless `MISSION_CONTROL_SKIP_SEED=1` is set. Override the database with `MISSION_CONTROL_DB=/absolute/path/mission-control.db` and the daemon with `MISSION_CONTROL_DAEMON_URL=http://127.0.0.1:4100`.

Useful commands:

```bash
npm test
npm run typecheck
npm run build
npm start
```

## Operator semantics

The default route is the all-worker attention queue. RED, YELLOW, and UNKNOWN workers lead with:

- the exact problem and owner/contract consequence;
- evidence references and reproducible reason codes;
- the bounded directive or required response;
- independently derived issued, delivered, acknowledged, started, evidenced, verified, and resolved state;
- the current-path continuation policy;
- the next review trigger;
- the structured owner obligation.

Numeric alignment is secondary metadata. A `REDIRECT` assessment does not prove that a directive was issued or delivered. Evidence submission does not prove verification. Verification does not resolve a finding.

Test cleanup is the hostile default fixture: it states that the worker is changing forbidden production scheduler/caller code for a test-only task and directs it to stop, revert, return to `tests/**` or `test-support/**`, and rerun focused tests.

## Architecture

```text
workers / supervisors / adapters
            |
            v
Mission Control daemon :4100
  - sole SQLite owner
  - append-only validation
  - hash chain + idempotency
  - SSE event notification
            |
            v
Next.js BFF routes :3000
            |
            v
attention queue + worker decision records
```

The Next.js route handlers proxy the daemon and never open SQLite. SSE is driven by daemon append notifications, not database polling.

Important modules:

- `lib/schema.ts`: versioned owner authority, evidence, finding, directive/response, completion, route, research, and Symphony schemas;
- `lib/store.ts`: append-only SQLite ledger, v1 migration, exact idempotency, authority ordering, and hash-chain verification;
- `lib/terminal-comparator.ts`: worker→contract and contract→owner comparison plus typed terminal decisions;
- `lib/progress-invariants.ts`: numeric direction/delta validation and fail-closed outcome/strategy projection;
- `lib/correction-lifecycle.ts`: fail-closed transition and identity guards;
- `lib/supervision-handoff.ts`: state-vector-bound three-turn chat handoff identity;
- `lib/projection.ts`: attention ordering and operator projection;
- `daemon/server.ts`: single-writer HTTP/SSE daemon;
- `lib/symphony-adapter.ts`: read-only stock Symphony state normalization.

## Durable model

HTTP append requests use a v2 envelope:

```json
{
  "schema_version": 2,
  "event_id": "stable:event:id",
  "mission_id": "mission-id",
  "occurred_at": "2026-08-30T20:00:00.000Z",
  "data": {
    "type": "worker_checkpoint_recorded",
    "worker": "worker-id"
  }
}
```

The complete runtime contract is the Zod union in `lib/schema.ts`. Significant event families are:

- `owner_source_recorded`, `owner_outcome_recorded`, `task_contract_recorded`, and `objective_reconciliation_recorded`;
- `worker_checkpoint_recorded`, `supervisor_assessment_recorded`, and `evidence_receipt_recorded`;
- immutable `finding_recorded` plus event-derived `finding_status_changed`;
- `correction_lifecycle_recorded` with correction-attempt, directive digest, target, run, contract, owner outcome, predecessor, evidence-set, candidate, verification-policy, and verifier bindings;
- `completion_claim_recorded`, `supervision_route_recorded`, `research_verdict_recorded`, and `supervision_design_feedback_recorded`;
- `reasoning_supervision_recorded`, `execution_directive_recorded`, `codex_execution_started`, `execution_receipt_recorded`, `outcome_progress_recorded`, and `supervision_alert_recorded`;
- `symphony_runtime_observed` for the read-only upstream seam.

Outcome progress is an independent control plane. Numeric receipts declare `HIGHER_IS_BETTER` or `LOWER_IS_BETTER`; the store validates exact current-minus-baseline/current-minus-previous deltas, and projection derives advancement from those bytes instead of trusting a supplied healthy label. Nonnumeric `ADVANCING` requires current and best same-worker durable receipts classified as direct outcome evidence or a validated leading indicator. A leading indicator records its predictive basis and later direct-outcome decision boundary; missing, stale, unverified, cross-worker, supporting-only, or activity-only evidence fails closed. A regression holds same-strategy continuation and cannot project GREEN.

Substantive Codex execution is also independently supervised: a current reasoning review bound to the exact owner-outcome ID, epoch, and hash authorizes one exact versioned directive; the worker records a directive-bound start; Codex emits an execution-only receipt with supervisory fields fixed to `null`; and a later independent review is required before another directive. The successor review must occur later in the durable ledger than the matching prior receipt, and the new directive must bind that review's exact owner authority and capsule. Legacy reasoning records without owner-outcome bindings remain readable but cannot authorize directives or progress. A missing directive, stale owner epoch, predated review, capsule mismatch, or pending review fails closed visibly.

A pending review is nonterminal. Mission Control projects it as a controller-owned route/await/resume handoff, never as a stopped task or a request for the owner to send `continue`. The dashboard remains observational—it does not dispatch or resume workers—but it requires the owning controller to keep the receipt handoff live and resume the next already-specified slice after the matching reasoning directive arrives.

Derived contracts must also disclose `unsupported_added_constraints`. This covers a material gate, staffing rule, institutional process, approval regime, or other operating constraint that was added by a controller but cannot be traced to the owner source or an exact external authority. A nonempty list makes contract-to-owner alignment `DIVERGED` and the root RED even when the worker is GREEN against that contract. Safety and privacy controls can still constrain the affected handling surface; they do not become owner-requested product strategy through inference.

Legacy PR #41 events remain decodable and migrate without being reinterpreted as current owner authority. Legacy completion remains nonterminal until independently sourced owner outcome and reconciliation exist.

## Correction and owner-action invariants

Durable directive states are target-neutral. Worker redirects receive redirect-specific UI labels; contract repairs target the contract, not a conforming worker.

Delivery requires a receiver-generated receipt bound to the exact directive digest. Acknowledgement binds the same ID and digest. Correction start requires the target or an authorized executor, a first action, and an expiring activity lease. Verification requires one current exact-candidate evidence set, a complete PASS manifest, policy identity, and authorized verifier identity. Binding changes reopen verification fail-closed.

Owner action is a structured obligation. `NONE` requires a known non-owner next actor, action, trigger, due time, and escalation policy. Missing/overdue telemetry, conflicting directives, non-retrying delivery failure, or owner-held blockers become `MANUAL_INTERVENTION_REQUIRED`. A `DECISION_REQUIRED` event must carry the full Pro decision packet, including options, benefits, drawbacks, consequences, recommendation, and reasoning.

Every owner-action-bearing event family binds each `source_event_id` to an existing event in the same worker ledger. Missing or cross-worker evidence provenance is rejected before append.

Both owner-facing views render that complete choice packet, including the consequence of every option and the explicit default if no decision is made. A short summary or link to the Pro analysis is not a sufficient owner handoff. Every dashboard task card, including a GREEN healthy card, uses the same complete control-state renderer for owner target and gap, latest and best direct evidence, progress, strategy, supporting work, next measurement/intervention, reasoning identity and age, directive identity/status/objective, Codex state, stop/review boundary, receipt/claim, Pro escalation, owner action, and next review.

Continuation is `PAUSE_ALL`, `SAFE_WITHIN_SCOPE`, `CONTINUE_UNRESTRICTED`, or `UNKNOWN`; it is not a Boolean. `UNKNOWN` grants no allowed scope.

## API

Dashboard-facing Next.js BFF:

- `GET /api/workers`
- `GET /api/workers/:worker`
- `GET /api/events`
- `POST /api/events`
- `GET /api/events/stream`
- `POST /api/viewed`
- `POST /api/workers/:worker/supervisor-chat`

Daemon:

- `GET /health`
- `GET /snapshot`
- `GET|POST /events`
- `GET /events/stream`
- `POST /viewed`
- `GET /workers/:worker`
- `POST /workers/:worker/supervisor-chat`

### Authenticated ingestion

The daemon rejects every mutation without its process-internal bearer secret. `npm run dev` and `npm start` generate that secret in memory and share it only with the daemon and Next.js broker.

External `POST /api/events` is disabled by default. To enable it, configure a distinct credential per producer ID:

```bash
export MISSION_CONTROL_INGEST_CREDENTIALS='{"collector:tests":{"kind":"COLLECTOR","token":"replace-with-at-least-32-secret-characters","workers":["tests"],"tasks":["task:tests"]}}'
```

Then submit with the configured immutable identity:

```bash
curl -sS http://127.0.0.1:3000/api/events \
  -H 'authorization: Bearer replace-with-at-least-32-secret-characters' \
  -H 'x-mission-control-producer-id: collector:tests' \
  -H 'content-type: application/json' \
  --data-binary @event.json
```

The credential fixes the producer kind. Event-class/status authorization is checked again at the daemon, and evidence/correction/status records must carry the same embedded producer or actor ID and role. A caller cannot promote itself by changing a role header or payload field.
Credentials without explicit worker and task scopes are invalid. The BFF forwards those authenticated scopes to the daemon, which checks them again for every event family.

## Symphony boundary

The adapter consumes stock Symphony `GET /api/v1/state` output pinned to the audited upstream commit and emits normalized read-only observations for the existing ledger.

Mission Control does not own Symphony dispatch, claim/release, retry, continue/stop/resume, tracker eligibility, concurrency/backoff, workspace lifecycle, App Server integration, workflow configuration, tracker writes, or recovery.

Unmapped Symphony items are persisted as diagnostic-only events with `control_semantics: false`; diagnostic-only identities are excluded from the worker projection, so they cannot create or crash a dashboard worker.
