# Current State

Updated: 2026-09-01 00:54 UTC

## Goal

Implement and durably publish the owner-approved Mission Control continuation:
truthful operator status, event-backed experiment queues, live worker adapters,
private supervisor MCP access, hardened owner authentication, hosted application
CI, and evidence-based Hermes/n8n decisions.

## Authority / baseline

- Working branch:
  `task/mission-control-owner-worker-channel-experiments-20260831`.
- Pull request: #51, stacked on the issue #47 live-slice branch.
- Requested continuation baseline:
  `edb63f62a567b89b0e880f257f03e7aba0eed5fc`.
- Symphony remains execution orchestrator. Mission Control owns its event
  ledger, outbound delivery evidence, projections, and dashboard. Supervising
  chats retain semantic/reasoning authority. Hermes and n8n are not adopted.

## Completed implementation

- Added an operator-state overlay without collapsing assurance planes. Stale,
  awaiting, failed, or unreconciled owner directions cannot appear as the
  primary green/current answer and now enter the attention projection.
- Published `MC-EXP-HERMES-001` and `MC-EVAL-N8N-001` as real event-backed Fleet
  Work Queue items with dependencies and adoption state.
- Added truthful `CONNECTED`, `OFFLINE_CONFIGURED`, and `FIXTURE_ONLY` worker
  connection states with expiring connected leases.
- Added a generic authenticated outbound-polling worker adapter/sidecar. It
  derives queues and current work from a real repository, emits delivery and
  direction acknowledgements, publishes blockers/proposals, and reconciles
  without making Mission Control a scheduler or exposing worker-control ports.
- Completed a live Human Design/AstroHD acceptance against `/home/joel/humandesign`:
  owner record sequence 81 preceded delivery 85, acknowledgement 87, real queue
  publication 89, and reconciliation 93.
- Added a real owner-auth boundary: distinct owner principal, signed expiring
  session, HttpOnly/SameSite cookie, double-submit CSRF, exact-origin checks,
  scoped bearer credentials, loopback default, and HTTPS configuration required
  before non-loopback binding.
- Added a distinct stdio MCP bridge/client and verified live
  `mission_control_get_fleet` and `mission_control_get_worker` calls against the
  service. Added the private Secure MCP Tunnel bootstrap and deployment notes.
- Added hosted CI for 92 application tests, TypeScript typecheck, Next.js
  production build, and the existing 243-test repository audit.
- Ran 18 matched scenarios through the official isolated Hermes Agent runtime.
  The automatic adoption gate failed: baseline median recovery 13.461 ms versus
  Hermes 575.444 ms, with no correction wins. Decision:
  `DO_NOT_ADOPT_KEEP_BASELINE`.
- Kept n8n `PLANNED`/`WAITING_DEPENDENCY`; no genuine recurring adapter burden
  appeared and no connectivity or adoption was fabricated.
- Rebuilt the lossless application source archive from 95 files into 39 parts.
  SHA-256: `295cf3bb44f5472d1811dc0c263e39cbfc29d8c732c18ced1edfb17345b11394`.

## Verification complete locally

- Focused operator/channel/adapter and hostile-auth tests pass.
- 92/92 deterministic application tests pass.
- 243/243 repository tests pass.
- TypeScript typecheck and Next.js production build pass.
- Live Human Design worker-channel acceptance passes.
- Live distinct-client MCP acceptance passes.
- Live hostile owner-auth acceptance passes.
- Source archive checksum, unzip integrity, and reconstructed tree parity pass.
- Repository audit reports no findings.

## Evidence / artifacts

- Preserved repository-wide coverage-before-depth completion gate:
  `patterns/coverage-before-depth-in-selection.md`,
  `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`, and
  `tests/test_coverage_before_depth_pattern.py`.
- Implementation and experiment plan:
  `docs/exec-plans/active/2026-08-31-mission-control-owner-worker-messaging-and-adapter-experiments.md`
- Live receipts:
  `docs/evidence/mission-control-continuation/`
- Hermes raw receipts and score:
  `tools/codex-mission-control/restored/codex-mission-control/experiments/hermes/results/2026-09-01-provider-independent/`
- Application and adapters:
  `tools/codex-mission-control/restored/codex-mission-control/`
- Source archive receipt:
  `tools/codex-mission-control/SOURCE-ARCHIVE.sha256`
- Test-efficiency telemetry task:
  `mission-control-pr51-continuation-20260901`

## Remaining release work

1. Commit and push this continuation to PR #51.
2. Verify the new hosted application job and repository audit are green at the
   exact pushed head; fix any failure before closeout.
3. Record the exact final Git head and check-run state in this file.

## Current checkpoint

All implementation and local verification gates are green. The continuation is
ready for its release commit, push to PR #51, and exact-head hosted CI check.

## External/account-bound follow-up

- ChatGPT consumption through the private Secure MCP Tunnel requires the owner
  to create or associate a tunnel in the OpenAI platform, provide the tunnel ID
  and runtime API key to the isolated runtime, and select the tunnel in a
  developer-mode ChatGPT app. All server, scoped auth, stdio bridge, bootstrap,
  and local distinct-client acceptance work is complete.
- LLM-backed Hermes semantic scenarios require an experiment-only inference
  credential and explicit spend ceiling. Every provider-independent official
  runtime scenario ran; production credentials were not imported.
- n8n remains deferred until at least one real recurring burden exists,
  preferably two credible flows under the recorded adoption gate.

## Blockers / unresolved

- No local implementation or verification blocker remains.
- ChatGPT tunnel association and LLM-backed Hermes semantic runs remain the
  explicit account/credential boundaries described above.

## Next safe action

Commit and push the verified continuation, then follow both hosted PR checks to
terminal green before writing the exact-head closeout receipt.

## Recovery rule

Resume from the remaining release work. Do not classify account-bound ChatGPT
tunnel registration as mechanically complete, do not adopt Hermes after its
failed gate, do not run n8n without its dependency, and do not claim hosted CI
green until the exact final head has check-run evidence.
