# Mission Control owner↔worker directive audit

Date: 2026-08-31

Branch: `task/mission-control-owner-worker-channel-experiments-20260831`

Directive source: owner-approved `pasted isntructios` attachment

Current release state: implementation pushed; stacked PR #51 open; required CI green

Status vocabulary is copied from the owner directive. “Verified” means the
required behavior has deterministic or live acceptance evidence, not that an
experimental third-party tool has been adopted.

| # | Status | Requirement | Exact evidence |
| --- | --- | --- | --- |
| 1 | IMPLEMENTED+VERIFIED | Bidirectional dashboard↔worker communication for local/VPS/cloud workers | `components/WorkerChannel.tsx` provides the per-worker conversation and composer with distinct Message/Direction controls. Authenticated outbound polling and worker event publication use the same envelope for local or remote workers. Desktop and 375px browser acceptance found the composer and Direction control. |
| 2 | IMPLEMENTED+VERIFIED | Ledger before/atomic with delivery | `recordOwnerMessage` appends the owner record and queued delivery in one `appendMany` transaction. Tests prove consecutive hash-chain records, exact idempotency, and full rollback for an invalid batch. Live acceptance observed the direction as `DASHBOARD_BEHIND_OWNER` before worker polling. |
| 3 | IMPLEMENTED+VERIFIED | Durable authenticated remote delivery lifecycle | The daemon exposes a worker-scoped durable outbox with retry leases. Delivery events project RECORDED, QUEUED, DELIVERED, ACKNOWLEDGED, and INCORPORATED independently. Tests cover cross-worker denial, offline persistence, lease retry, duplicate suppression after acknowledgement, and restart survival. |
| 4 | IMPLEMENTED+VERIFIED | First-class owner message/direction events | `owner_message_recorded` is separate from corrective directives and carries source/provenance, message class, priority, scope, authority epoch/hash, and supersession. Schema, authority-lane, store-invariant, and supersession tests pass. |
| 5 | IMPLEMENTED+VERIFIED | Mechanical stale-direction detection | `projectWorkerChannel` returns `DASHBOARD_BEHIND_OWNER` whenever the latest direction lacks exact acknowledgement plus queue reconciliation. The UI renders the stale badge instead of current/healthy channel state. Acknowledgement without a queue remains stale in tests and live acceptance. |
| 6 | IMPLEMENTED+VERIFIED | HumanDesign AstroHD hostile regression | The Human Design seed goal and current directive are AstroHD-first. A newer live direction immediately superseded the seed direction, produced stale state, and returned to CURRENT only after acknowledgement, queue publication, and reconciliation. Static UI and full projection tests reject the old governance-first state. |
| 7 | IMPLEMENTED+VERIFIED | Persistent structured per-worker work queue | `work_queue_published` carries item ID, exact direction, revision, status, priority, dependency IDs, timestamps, ordinal, and provenance. The state model includes PLANNED/READY/IN_PROGRESS/BLOCKED/WAITING_REVIEW/DONE/SUPERSEDED; the current publication survives restart. |
| 8 | IMPLEMENTED+VERIFIED | Fleet-wide filterable work queue | `FleetQueue` aggregates all workers and filters by worker, status, priority, and blocked state. It rendered in desktop and compact browser acceptance without horizontal overflow. |
| 9 | IMPLEMENTED+VERIFIED | Structured blockers/issues | `structured_blocker_recorded` captures affected direction/task, queue item, impact, blocking severity/scope, workaround, required actor/owner need, status, evidence, and timestamp. Persistence, projection, fleet counts, and browser visibility passed. |
| 10 | IMPLEMENTED+VERIFIED | Structured non-operative change proposals | `change_proposal_recorded` captures proposer provenance, rationale, affected direction/queue item, expected impact, owner-decision requirement, status, and disposition. Worker authority can publish a proposal but cannot emit owner authority or make it operative; authority-lane and browser tests pass. |
| 11 | IMPLEMENTED+VERIFIED | Authenticated machine-readable supervisor read model | Existing JSON worker/fleet APIs plus authenticated `POST /api/mcp` expose fleet and worker projections including direction, freshness, queue, blockers, proposals, timeline, and attention state. Live MCP initialize/list/worker-read succeeded; unauthenticated access returned 401. |
| 12 | IMPLEMENTED+VERIFIED | Bounded executable Hermes experiment, not adopted | `experiments/hermes/experiment.json` and `scripts/run-hermes-experiment.mjs` define a maximum seven-day, three-scenario baseline-versus-Hermes comparison across continuity, initiative, obligations, drift, owner burden, reliability, latency, and resource use. Dry-run execution passes and the default decision is `DO_NOT_ADOPT`; Hermes has no authority. |
| 13 | IMPLEMENTED+VERIFIED | Bounded n8n adapter evaluation, not authoritative | `experiments/n8n/` contains an inactive pass-through workflow, eight-hour evaluation contract, empirical burden criteria, and exact event/order parity comparator. Matching input passes, changed input fails closed to `KEEP_DIRECT_ADAPTER`; n8n is not source of truth, scheduler, or reasoning authority. |
| 14 | IMPLEMENTED+VERIFIED | Preserve Symphony/Mission Control separation | Architecture and implementation contracts retain Symphony orchestration and Mission Control ledger/projection roles. The stock Symphony adapter remains read-only; route-source tests ensure new Next routes proxy the daemon rather than opening SQLite. |
| 15 | IMPLEMENTED+VERIFIED | Deterministic hostile tests | The 87-test application suite covers supersession/staleness, offline direction recording, exact retry idempotency across time, acknowledgement without reconciliation, queue revision/supersession, blocker visibility, unauthorized proposals attempting authority, delivery failure/recovery, and AstroHD stale-state prevention. Repository contract tests cover the architecture boundary. |
| 16 | IMPLEMENTED+VERIFIED | Dashboard/detail UI and desktop/mobile browser evidence | Embedded-browser acceptance covered fleet and Human Design detail views. Desktop width was 1280px with no root overflow; the compact iframe viewport had 375px root/client/body widths, matched the mobile media query, and had no overflow. The compact worker view exposed composer, direction control, AstroHD, lifecycle, blocker, and proposal. |
| 17 | IMPLEMENTED+VERIFIED | Focused and required full gates | Focused channel and adapter tests, 87/87 full app tests, 243/243 repository tests, typecheck, production build, live hash-chain/HTTP/MCP checks, archive verification, and the repository audit with zero findings pass. |
| 18 | IMPLEMENTED+VERIFIED | Durable GitHub branch/PR/CI | Branch `task/mission-control-owner-worker-channel-experiments-20260831`, implementation commit `91a3c646f9f3a060acc6b8b800a361b463e41cb4`, and receipt commit `e65f54b` are pushed. Stacked PR [#51](https://github.com/u-dont-existDOTcom/universal-dev-architecture/pull/51) targets `task/mission-control-live-slice-issue-47`; its required `Deterministic repository audit` passed in 8 seconds on the receipt head. |
| 19 | IMPLEMENTED+VERIFIED | Automatically continue through eligible slices | The execution proceeded from ledger/outbox through queue/UI, experiments, hostile tests, live delivery, responsive acceptance, MCP, and archive reconstruction without stopping at an intermediate green slice. |
| 20 | IMPLEMENTED+VERIFIED | Requirement-by-requirement closeout audit | This document accounts for all 20 requirements with exact local, GitHub, PR, and CI evidence. No non-blocked item remains missing. |

## Browser and live acceptance receipt

- Fresh SQLite ledger remained hash-chain valid throughout the live scenario.
- The new owner direction was visible before polling and projected stale.
- An authenticated worker poll delivered the exact direction; a cross-scope or
  unauthenticated poll was denied.
- Acknowledgement alone stayed stale; exact queue publication plus
  reconciliation moved the worker to CURRENT.
- The hardened projection carried owner epoch 2, URGENT priority, exact worker
  scope, the former direction's SUPERSEDED delivery, two priority-bearing queue
  items, one structured blocker, and one explicitly NON_OPERATIVE proposal.
- Desktop root width/scroll width: `1265/1265` inside a 1280 browser viewport.
- Compact root/client/body width/scroll width: `375/375`; compact media query
  matched; no horizontal overflow.

## Experiment boundary

The executable Hermes and n8n artifacts are evaluation machinery, not evidence
for adoption. No external credentials, paid run, production install, authority
transfer, or change to Symphony behavior occurred in this implementation.
