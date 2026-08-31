# Current State

Updated: 2026-08-31 23:57 UTC

## Goal

Implement and durably publish the owner-approved Mission Control directive:
ledger-first bidirectional owner↔worker communication for local and remote
workers, direction-bound queues/blockers/proposals, machine-readable supervisor
access, and bounded non-authoritative Hermes/n8n experiments.

## Authority / baseline

- Working branch:
  `task/mission-control-owner-worker-channel-experiments-20260831`.
- Baseline: issue #47 live slice at `30c335e`.
- Owner directive: the 20-item `pasted isntructios` attachment approved in the
  continuing Mission Control conversation.
- Symphony remains execution orchestrator. Mission Control owns the event
  ledger, outbound delivery evidence, projections, and dashboard. Supervising
  chats retain semantic/reasoning authority; Hermes and n8n remain experiments.

## Completed implementation

- Owner conversation and operative directions now commit to the append-only
  ledger atomically with durable queued delivery.
- Authenticated worker-initiated local/VPS polling supports offline persistence,
  at-least-once retry leases, idempotent message IDs, delivery evidence,
  acknowledgement, interpretation, and queue reconciliation.
- Any unreconciled newest direction projects `DASHBOARD_BEHIND_OWNER`; old work
  cannot remain current merely because it was previously healthy.
- Workers publish persistent direction-bound queues plus structured blockers
  and visibly non-operative change proposals. The dashboard exposes both the
  per-worker channel and a filterable fleet queue.
- Human Design now leads with the AstroHD survey. The hostile live scenario
  proved immediate supersession, stale state before reconciliation, and CURRENT
  only after acknowledgement plus a new queue.
- Authenticated JSON and MCP-compatible reads expose the same fleet/worker
  projection to supervisors without scraping the UI.
- Hermes has an executable seven-day/three-scenario comparison contract and dry
  runner; n8n has an inactive pass-through workflow and parity evaluator. Both
  default to non-adoption.
- The source archive was rebuilt from 61 app source files into 31 base64 parts;
  SHA-256 `1ecf26dca669b7f9903254412a51da4ca85505c6c4562b61767e14826c2491ae`
  passes decode, checksum, unzip, and byte-for-byte tree comparison.

## Verification complete

- 87/87 deterministic application tests pass.
- TypeScript typecheck passes.
- Next.js production build passes with all new routes.
- Live HTTP scenario passes: offline owner direction, authenticated poll,
  delivery, acknowledgement, stale-before-queue behavior, reconciliation,
  blocker/proposal/fleet visibility, and valid global hash chain.
- Live MCP initialize/list/worker read passes; unauthenticated access is denied.
- Embedded-browser desktop and 375px compact acceptance passes with no
  horizontal overflow. The compact worker page exposes the composer, direction
  control, AstroHD state, lifecycle, blocker, and proposal.

## Current checkpoint

Implementation, app and repository gates, live acceptance, requirement audit,
source archive reconstruction, and final diff checks are complete locally.
Implementation commit `91a3c646f9f3a060acc6b8b800a361b463e41cb4` is
pushed. Stacked PR #51 is open against the issue #47 live-slice branch; its
required GitHub check is currently running.

## Evidence / artifacts

- Preserved repository-wide coverage-before-depth completion gate:
  `patterns/coverage-before-depth-in-selection.md`,
  `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`, and
  `tests/test_coverage_before_depth_pattern.py`.
- Implementation plan:
  `docs/exec-plans/active/2026-08-31-mission-control-owner-worker-messaging-and-adapter-experiments.md`
- 20-item closeout audit:
  `docs/audits/2026-08-31-mission-control-owner-worker-channel-directive-audit.md`
- Application:
  `tools/codex-mission-control/restored/codex-mission-control/`
- Source archive receipt:
  `tools/codex-mission-control/SOURCE-ARCHIVE.sha256`
- Test-efficiency telemetry:
  `/tmp/mission-control-full-implementation-20260831.jsonl`

## Remaining

1. Preserve this exact commit/PR receipt in GitHub.
2. Follow PR #51 CI until green or an external blocker is proven.

## Blockers / unresolved

- No implementation or verification blocker is open.
- A real Hermes run still requires a separately authorized spend ceiling and
  experiment credentials; this does not block the executable experiment queue.
- A real n8n comparison still requires a named recurring integration flow; this
  does not block the executable evaluator.

## Next safe action

Push this receipt update, then follow PR #51 checks to a terminal result.

## Recovery rule

Resume from the remaining list. Do not reclassify Hermes or n8n as adopted and
do not move Symphony authority. Do not close out until the audit records exact
GitHub branch, commit, PR, tests, and CI state.
