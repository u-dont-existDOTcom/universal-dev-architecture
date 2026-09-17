# Controller expired-cycle repair — candidate receipt

Date: 2026-09-17

Status: candidate ready for review; unmerged and not installed

## What this candidate changes

An expired controller cycle can now become truthfully terminal as `EXPIRED`. The controller first obtains a fresh Mission Control scheduler status and refuses terminalization unless the single-writer ledger is valid and the central admission, target-transition, and safety-halt fields are clear. It also refuses terminalization when any local original-send, continue-send, or Retry boundary remains unresolved.

The original cycle record is retained. Its send, recovery, admission, and artifact evidence is not deleted or rewritten. The terminal receipt adds the prior step, expiry, prior error, central clearance, last local admission identity, send summaries, and consumed-artifact identities. A repeat call returns the same terminal state without mutation, and an artifact arriving later is not reconciled into or allowed to revive that cycle. Ordinary relay admission and duplicate-request detection no longer treat a safely expired cycle as active.

## Capability-receipt decision

The proposed requirement for current tool/mode receipts from all three non-production chats is rejected as requirement accretion. The receipts predict that a chat could expose the expected model/mode and app at an earlier point in time. They do not establish a distinct safety property at the later fixture send.

| Proposed receipt | Failure it predicts | Existing direct control that already fails closed |
| --- | --- | --- |
| Current exact-mode receipt for each chat | The expected visible model or thinking control is unavailable | Exact visible consumer-control validation runs inside the centrally admitted submission immediately before intent is persisted or a click is allowed |
| Current Mission Control/tool receipt for each chat | The required app is unavailable or cannot be selected | Exact per-message app selection and required-label validation run on the bound target before submission; the binding preload additionally requires the current session's server-observed Mission Control receipt |
| Receipts collected separately from all three chats | One registered destination differs from the assumed chat | Exact `MISSION_CONTROL_ONLY` registration, supervisor identity, account/session checks, automation-owned target/window identity, provider-session URL binding, and fail-closed destination validation bind the actual route and target |

If any of these direct controls fails during the one fresh PM-mediated fixture, the fixture stops before an unsafe send or fails at its exact artifact/receipt boundary. A historical preflight receipt would not make that action safer. The fresh fixture itself supplies the relevant direct evidence, including current binding and server-observed GitHub/Mission Control receipts.

The explicit capability diagnostic and challenge commands remain available for troubleshooting. No live capability probe was sent for this decision, and no replacement receipt lifecycle was added because no material unsafe action requiring it was identified.

## Verification

- Focused controller and relay regressions: 53 passed.
- Complete browser-relay suite: 207 passed.
- Relay syntax, service-package assets, shell syntax, diff hygiene, and the deterministic repository audit passed.
- The focused cases cover safe expiry becoming terminal, fresh-route admission, idempotence, late-artifact non-revival, unresolved central admission, ambiguous local click state, and unchanged completed cycles.

The repository-wide Python policy suite has 10 pre-existing failures in the unrelated Work model-routing policy at canonical `main` `da2e38f45d5025cf7a691cf97e4dc6ba704e0bc2`. The same canonical `main` revision's hosted Universal repository compliance run is red. This candidate changes none of the failing Work-routing policy, template, result, or test files; the failure is recorded rather than expanded into this focused repair.

No provider message, live capability probe, fixture, production mutation, deployment, restart, or merge was performed by this candidate work.
