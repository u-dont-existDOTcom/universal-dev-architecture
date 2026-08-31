# Mission Control owner↔worker messaging and adapter experiments

**Status:** owner channel implemented; Hermes/n8n executable evaluations queued, not adopted

**Date:** 2026-08-31

**Assurance lane:** decision experiments after the messaging foundation exists

**Controlling architecture:** `patterns/codex-pro-supervision-mission-control.md`

## Owner outcome

Mission Control must eventually let the owner communicate with workers from the
dashboard whether a worker runs locally, on a VPS, or in another cloud
environment. An operative owner direction must become durable Mission Control
authority before or atomically with delivery, and the dashboard must show what
happened to it. The worker must acknowledge and reconcile the direction, then
publish its current work, queue, blockers, and material changes it is
considering.

Hermes Agent and n8n remain bounded queue items. Neither is part of the accepted
runtime architecture, a source of truth, or a reasoning authority unless later
evidence supports a separately reviewed architecture decision.

## Implementation receipt and boundary

The issue #47 live slice now adds a tool-neutral channel alongside the existing
read-only `WORKER-STATE.json` observation. The Human Design projection and its
direction-bound queue lead with the AstroHD survey. Owner messages commit with
their queued delivery event before network delivery; local/VPS workers poll the
same authenticated outbox and return scoped event envelopes. Dashboard and MCP
consumers read the same projection.

This implementation does **not**:

- replace Symphony dispatch, workspaces, retries, reconciliation, or stopping;
- let Mission Control choose strategy or silently rewrite a task contract;
- install or authorize Hermes Agent or n8n;
- authorize new credentials, paid use, deployment, merge, or public exposure.

## Preserved role separation

| Dimension | Authority after this proposal |
| --- | --- |
| Exact owner direction | Authenticated append-only owner source/direction record |
| Durable task contract and owner decisions | GitHub |
| Live tracker state, priority, and dependencies | Linear |
| Codex dispatch, sessions, workspaces, retries, and reconciliation | Symphony |
| Message ledger, delivery evidence, projections, and dashboard | Mission Control |
| Strategy and semantic supervision | Current Extra High/Pro reasoning lane |
| Execution claims and receipts | The assigned worker, non-authoritative until independently checked |
| Genuine tradeoffs | Joel |

The owner-direction record becomes current owner-source authority immediately.
It does not make every sentence an executable instruction. Mission Control
must distinguish ordinary conversation from an operative `DIRECTION`, preserve
the exact authenticated source, and mark downstream task/worker projections
stale until they are reconciled. Existing safety, privacy, spending,
publication, permission, and irreversible-action gates continue to apply.

## Work queue

| Order | Queue ID | Item | State | Dependency | Adoption state |
| --- | --- | --- | --- | --- | --- |
| 1 | `MC-Q-OWNER-CHANNEL-001` | Ledger-first bidirectional owner↔worker messaging | `IMPLEMENTED_VERIFIED_IN_PR_51` | Existing Mission Control daemon/event ledger | Implemented, not orchestration authority |
| 2 | `MC-Q-DIRECTION-SYNC-001` | Direction acknowledgement, queue reconciliation, blockers, and proposed changes | `IMPLEMENTED_VERIFIED_IN_PR_51` | Owner channel event/outbox contract | Implemented, worker claims remain evidence |
| 3 | `MC-EXP-HERMES-001` | Bounded Hermes continuity/supervision comparison | `QUEUED_EXPERIMENT` | Stable worker-channel adapter and preregistered budget | Not adopted |
| 4 | `MC-EVAL-N8N-001` | Bounded n8n integration/event-routing evaluation | `QUEUED_EVALUATION` | Stable external event API and at least one real adapter burden | Not adopted |

The owner-channel foundation is first because both tool experiments need a
stable, tool-neutral contract. A positive experiment advances only to a later
architecture decision; it never silently changes these statuses to adopted.

## Queue item 1 — ledger-first bidirectional messaging

### Topology

```text
owner in dashboard
    -> authenticated Mission Control command endpoint
    -> one transaction: append owner event + enqueue delivery
    -> committed Mission Control ledger/outbox
    -> local adapter OR worker-initiated VPS/cloud connection/poll
    -> worker receives idempotent envelope
    -> transport receipt -> worker acknowledgement -> reconciliation
    -> worker messages/queue/blockers/proposals return through scoped ingress
    -> Mission Control ledger -> human dashboard + supervisor read APIs
```

The browser never connects directly to an arbitrary worker or opens a public
worker-control port. Remote workers authenticate to Mission Control and use an
outbound long-lived connection or bounded polling. A local worker uses the same
envelope through a local adapter.

### Message classes

- `CONVERSATION`: ordinary owner/worker dialogue; durable but not automatically
  task-authoritative.
- `DIRECTION`: an authenticated operative owner instruction. It declares task,
  worker or fleet scope; priority; supersession/amendment relation; and the
  current owner-outcome binding.
- `WORKER_RESPONSE`: worker-authored answer or clarification, stored as a claim.
- `WORKER_QUESTION`: a typed request for information or a genuine decision.
- `BLOCKER`: impact, affected queue items, causal scope, workaround, unblock
  actor/mechanism, and whether owner action is actually required.
- `CHANGE_PROPOSAL`: a material scope, ordering, method, architecture, or
  acceptance change. It remains non-operative until the proper authority
  accepts it.

Only an authenticated owner principal can create an owner `DIRECTION`.
Supervisors, adapters, n8n, Hermes, and workers may relay exact bytes with
provenance but may not impersonate that principal.

### Transaction and delivery semantics

Submitting a direction succeeds only after one daemon transaction:

1. validates owner identity, scope, current owner-outcome epoch, idempotency key,
   classification, and optimistic concurrency;
2. appends the immutable owner source/direction event;
3. appends an outbound delivery item bound to that exact event and content hash;
4. commits both or neither; and
5. returns the durable event/delivery receipt.

Network delivery starts only after commit. Delivery is at-least-once; workers
deduplicate by `message_id` plus content hash and reject same-ID/different-byte
replays. Every attempt is append-only. A worker connection, adapter, or UI
cannot edit an old message to make delivery appear successful.

Required states are separate:

```text
RECORDED -> QUEUED -> DELIVERY_ATTEMPTED -> DELIVERED
         -> DELIVERY_FAILED / EXPIRED / SUPERSEDED

DELIVERED -> ACKNOWLEDGED -> RECONCILED
          -> REJECTED_AS_AMBIGUOUS / REJECTED_AS_UNAUTHORIZED
```

- `DELIVERED` is transport evidence, not proof the worker understood it.
- `ACKNOWLEDGED` binds the worker's stated interpretation to the exact direction.
- `RECONCILED` binds a current work-queue publication to that direction and
  identifies retained, added, reordered, blocked, and superseded items.
- `INCORPORATED` may be a dashboard summary of acknowledged plus reconciled;
  it is never inferred from process liveness or a later Git commit.

Offline workers keep durable queued messages. Retry/backoff remains a transport
concern and does not make Mission Control a scheduler. Cancellation or
supersession creates a new event; it does not delete the prior direction.

### Direction and queue synchronization

Each work-queue publication carries:

```text
publication_id
worker_id / task_id
based_on_direction_id and owner_outcome epoch/hash
queue revision and previous publication
NOW item (zero or one, with reason when zero)
READY / IN_PROGRESS / BLOCKED / WAITING_REVIEW / DONE / SUPERSEDED items
dependencies and evidence boundary
open blockers
material change proposals
created_at and worker sequence
```

The owner direction remains separate from the worker's interpretation. If the
latest operative direction sequence exceeds the latest acknowledged or
reconciled sequence, the projection must fail visibly:

```text
DASHBOARD_BEHIND_OWNER — <n> DIRECTION(S) UNSYNCED
```

It may not show GREEN/current merely because the old queue is internally
consistent. Queue history is append-only; a new publication supersedes but
does not erase prior plans.

### Proposed event families

The accepted v2 schema uses these event families:

```text
owner_message_recorded
outbound_delivery_lifecycle_recorded
outbound_message_acknowledged
direction_acknowledged
worker_message_recorded
work_queue_published
direction_reconciled
structured_blocker_recorded
change_proposal_recorded
```

### Implemented interfaces

Human and machine consumers read one projection:

```text
GET  /api/workers
GET  /api/workers/:worker
POST /api/workers/:worker/messages
GET  /api/worker-channel/:worker/outbox
POST /api/worker-channel/:worker/events
POST /api/mcp
```

The dashboard, Extra High/Pro supervisors, and authorized automation consume
these APIs rather than scraping the human UI. Write capabilities remain
principal- and worker-scoped; read access does not imply write or owner
authority.

### Security and failure controls

- Per-worker credentials bind worker ID, task scope, allowed event families,
  expiry, and rotation identity.
- TLS is required off-loopback; deployments should prefer private overlay or
  reverse-tunnel networking over a public worker listener.
- No arbitrary shell command endpoint exists. A `DIRECTION` is task content,
  not an RPC command that bypasses the worker/controller contract.
- Sequence gaps, replay conflicts, expired leases, clock skew, offline state,
  and credential failure are projected explicitly.
- Message content follows classification and retention policy; exact authority
  bytes may be stored as a local content-addressed artifact with a ledger hash
  when they should not live inline.
- Secrets and credentials are never accepted as direction content.
- Backpressure and per-worker rate limits prevent one disconnected worker from
  exhausting the shared daemon.

### Acceptance evidence

1. A direction is queryable in the ledger while the target worker is offline.
2. A simulated crash between commit and send loses no direction; replay does not
   create two operative directions.
3. Same-ID/different-byte replay is rejected.
4. Local and remote adapters pass the same contract tests.
5. Dashboard states distinguish recorded, queued, delivered, acknowledged, and
   reconciled without inference.
6. A newer direction immediately makes an old worker projection stale.
7. A worker acknowledgement cannot rewrite the exact owner source.
8. Queue, blocker, and proposed-change publications bind the exact current
   direction and remain claims until independently checked where applicable.
9. A worker can be unreachable without freezing unrelated workers.
10. Supervisor read access works without access to the owner's dashboard tab.
11. Symphony behavior is unchanged.

## Queue item 3 — bounded Hermes experiment

### Question

Does Nous Research's Hermes Agent materially improve worker continuity and
Mission Control supervision compared with the current Symphony/Codex path?

### Fixed role and boundaries

Hermes is tested only as an **experimental non-authoritative worker runtime**
behind the same Mission Control message/checkpoint adapter. Mission Control's
ledger remains authoritative; GitHub, Linear, Symphony, and the reasoning chats
retain their existing roles. Hermes memory, skills, self-improvement, queue, and
claims are evidence to inspect, not owner intent, strategy authority, or proof
of completion.

Hermes may not:

- revise the owner outcome, contract, or accepted strategy;
- become the Mission Control event store, scheduler, semantic judge, or owner;
- persist a learned skill from experiment data into a production profile;
- use production credentials, merge, deploy, spend, publish, or perform an
  irreversible action without the existing independent authority.

### Bound

- At most three matched, reversible, non-production scenarios or seven calendar
  days, whichever completes first.
- One isolated Hermes profile with experiment-only memory and credentials.
- Same task contract, event stream, evidence boundary, stop conditions, and
  underlying model/provider where technically feasible; every mismatch is
  disclosed.
- Spend ceiling and credential authority must be recorded before launch; no new
  paid plan is implied by this queue item.
- Force at least one restart/context-loss recovery test.
- No architecture adoption from these three runs. A positive result can justify
  only a larger or production-representative trial.

### Measures

- direction-to-acknowledgement and direction-to-reconciliation latency;
- exact acknowledgement correctness and stale-direction detection;
- outstanding-work recall after restart and missed/superseded queue-item rate;
- useful blocker/change-proposal surfacing before owner discovery;
- owner relay/recovery interventions required;
- authority violations, unsupported initiative, and memory/skill contamination;
- outcome advancement, completion correctness, wall time, cost, and failures;
- quality of durable receipts and ease of Mission Control recovery.

### Decision rule

Pre-register scenario scoring before the first run. `MC-EXP-HERMES-001` passes
only if Hermes has zero critical authority violations, recovers the interrupted
scenario without owner reconstruction, and reduces owner relay/recovery effort
without a material regression in outcome, reliability, latency, or cost. Tied
or ambiguous evidence favors the simpler current architecture. Passing advances
Hermes to a separately reviewed candidate experiment; failing or inconclusive
results leave it unadopted.

## Queue item 4 — bounded n8n evaluation

### Question

Does n8n remove enough recurring custom integration/event-routing work to
justify operating another component around Mission Control?

### Fixed role and boundaries

n8n may be evaluated only as an optional edge adapter:

```text
external webhook/schedule/app event
    -> n8n transform and route
    -> authenticated Mission Control append API
    -> Mission Control validates, appends, and projects
```

n8n is never the event ledger, owner source, task contract, reasoning authority,
semantic judge, Symphony scheduler, or completion authority. It cannot write
SQLite or GitHub authority records directly. Mission Control validates every
canonical event and preserves the original external source identity plus the
n8n workflow/execution identity as transport provenance.

### Bound

- Do not prototype until one real recurring integration burden is named.
- Compare one direct adapter with one n8n workflow for the same low-risk flow;
  cap implementation/evaluation at one working day.
- Use test credentials and a non-production endpoint; no broad app permissions.
- Exercise duplicate delivery, retry, malformed input, secret redaction, n8n
  outage, and Mission Control outage/replay.
- Prefer the direct adapter unless n8n materially reduces implementation **and**
  ongoing operational burden.

### Measures and decision rule

Measure setup and maintenance effort, custom code/configuration, idempotency and
replay correctness, observability, latency, failure recovery, secret surface,
upgrade/deployment burden, and operator comprehensibility. Adoption requires at
least two credible recurring integration flows and evidence that n8n reduces
total adapter/operations burden without weakening provenance, validation, or
recovery. Otherwise keep direct adapters and remove the experimental workflow.

## Research-before-reinvention ledger

- **Applicability:** `required`
- **Trigger:** distributed owner/worker messaging plus evaluation of two mature
  external tools.
- **Independent conception:** record owner input first, deliver through a
  durable outbox, show transport/acknowledgement/reconciliation separately, and
  keep tool experiments outside authority until measured.
- **Search formulations:** durable command delivery to offline agents,
  event-ledger/outbox messaging, remote worker pull channels, agent continuity,
  integration/event-routing adapters, and human-in-the-loop workflows.
- **Already solved:** vendor-neutral event envelopes and HTTP/WebSocket
  bindings; authenticated web delivery; retry/idempotency primitives; Hermes
  cross-session memory/skills; n8n webhooks/integration workflows.
- **Partially solved:** these tools can transport or remember work, but none is
  the accepted Mission Control owner-authority, reconciliation, or evidence
  model.
- **Composable:** Mission Control ledger/outbox + scoped worker adapters +
  Symphony execution + optional n8n edge adapters.
- **Incompatible as central authority:** Hermes self-modifying memory/skills and
  n8n workflow state do not satisfy the current independent owner-intent and
  reasoning-authority boundaries.
- **Genuinely unresolved:** whether either tool materially reduces Joel's
  supervision/continuity burden in this exact system.
- **Disposition:** `compose` for the tool-neutral channel; `experiment` for
  Hermes; `experiment` for n8n only after a real adapter burden appears.
- **Novel remainder:** direction-to-queue reconciliation and owner-staleness
  invariants across local and remote heterogeneous workers.
- **Simple baseline:** direct Mission Control adapter with Symphony/Codex and no
  new component.
- **Research refresh trigger:** implementation start, a material Hermes/n8n
  release, or expansion beyond the bounded experiments.

Primary sources checked on 2026-08-31:

- CloudEvents specification and HTTP/WebSocket bindings:
  `https://github.com/cloudevents/spec`
- Hermes Agent official repository and documentation:
  `https://github.com/NousResearch/hermes-agent`
- n8n official documentation:
  `https://docs.n8n.io/`

## Next safe actions

1. Publish this implemented channel through the stacked pull request and keep
   its CI green.
2. Connect one isolated real VPS/cloud worker through the authenticated outbound
   polling contract when deployment credentials and TLS/private networking are
   separately authorized.
3. Preregister the spend ceiling and scoring sheet before running the bounded
   Hermes comparison; the executable dry run is not evidence for adoption.
4. Run the n8n evaluation only when the integration backlog names a real
   repeated flow; keep the direct adapter unless the measured criteria pass.

Release, merge, deployment, external credentials, and tool installation remain
separate owner-authorized boundaries.
