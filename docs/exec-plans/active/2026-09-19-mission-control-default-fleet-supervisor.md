# Default timed fleet supervisor

Owner outcome: **OPEN** until the merged source is installed and one disposable
native live acceptance passes. Controlling source: GitHub issue #177 and
`docs/requirements/2026-09-19-default-fleet-supervisor.owner-requirement.json`.

Assurance lane: **release** because the owner explicitly requires PR, hosted CI,
merge, reversible deployment, and live acceptance.

## Implementation boundary

- Extend the existing daemon loop and daemon-owned SQLite store; do not add a
  second scheduler.
- Auto-enroll nonterminal `work_queue_published` projects at one hour.
- Persist active/paused/terminal/disabled state, cadence, next/last tick,
  trigger/result, and notification disposition/reason/fingerprint.
- Classify cheap deterministic state before invoking the established internal
  reasoning route. Strategy/method replacement remains reasoning-owned.
- Permit only explicitly pre-send/process mechanical recovery through existing
  idempotent worker-channel semantics.
- Deduplicate owner notifications and deactivate terminal/paused watches.
- Expose watch state in the dashboard snapshot and authenticated daemon API.

## Verification checkpoints

- [x] Focused issue #177 tests: enrollment, healthy silence, mechanical recovery,
  reasoning escalation, owner notification/dedup, terminal deactivation,
  hard-gate preservation, persistence, and duplicate ticks.
- [x] TypeScript compile after the implementation checkpoint.
- [x] Complete Mission Control suite and production build.
- [x] Repository test and deterministic audit release gates.
- [x] Exact diff review and source-archive parity.
- [ ] Hosted CI green on the exact PR head.
- [ ] Merge, reversible non-production deployment, and synthetic live acceptance.

## External fallback disposition
