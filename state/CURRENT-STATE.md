# Current State

Updated: 2026-09-06

## Current authority boundary

- Chat owns architecture, policy, methodology, prioritization, semantic review,
  owner-intent interpretation, ordinary GitHub work, and release decisions.
- Work/Codex is mechanical execution only: terminal/filesystem/SSH/browser/build/
  deploy mechanics after Chat has resolved the decision.
- A one-word `continue` is transport/liveness recovery only; it is not new
  semantic authority.
- Production promotion is not authorized.

## Canonical repository boundary

- Canonical `main` is
  `784144be749acbb989de95ef7e91914fcd483fd4` (merged architecture/state PR #65).
- PR #58, **Mission Control: add memory-bounded Hostinger browser relay**, is
  merged.
- Exact accepted pre-merge head after final `main` synchronization:
  `5e91f53ed4404001f59e3af80f5925326b1932f9`.
- The final base sync added only:
  - `feedback/mission-control/SDF-20260902-GITHUB-FINAL-HEAD-CHECK-LIVENESS-001.json`
  - `state/OWNER-CHAT-WORK-MODE-BOUNDARY-20260902.md`
- No executable relay or Mission Control bytes changed during that sync, so
  completed browser/live acceptance was not rerun.
- Exact-head and post-merge checks are green: deterministic repository audit,
  Mission Control tests/typecheck/build, relay tests/syntax/service assets, and
  CodeQL Actions/JavaScript-TypeScript/Python.

## Accepted Mission Control relay topology

Route v4 is the current accepted topology:

```text
stable supervisor identity
  -> fresh Extra High Mission Control binding-preload conversation
  -> verified current binding envelope
  -> distinct fresh decision conversation in the same reusable browser tab
       ordinary:  exact visible Extra High
       escalated: exact visible 6 Pro
  -> first-message GitHub evidence read + canonical #59 decision write
  -> Mission Control validation / admission
```

Hard invariants:

- exact visible model matching only: `Extra High` and `6 Pro`;
- no `Pro` <-> `6 Pro` alias and no hidden/backend identity claim;
- escalated internal lane remains `PRO_ESCALATED`;
- one reusable ChatGPT tab in steady state; temporary two, hard ceiling three;
- native browser sandbox; never `--no-sandbox`;
- loopback-only CDP;
- global minimum 60 seconds between actual ChatGPT submissions;
- AUTO memory guard uses the measured approximately 8 GB Hostinger envelope;
- generation STARTED must precede COMPLETE;
- ambiguous post-click state cannot automatically replay;
- browser automation does not inspect/copy/hash/parse assistant output;
- missing first-message GitHub decision receipt does not authorize same-chat
  semantic retry or a topology change.

Live ordinary v4 acceptance passed with canonical #59 comment `5553196186`.
Live escalated v4 acceptance passed with exact visible label `6 Pro`, canonical
#59 comment `5553905289`, and provenance
`VISIBLE_PRO_SESSION_GITHUB_ATTESTED`.

## Production / hotfix boundary

- The isolated Railway hotfix and Hostinger acceptance already succeeded before
  merge and remain the accepted live evidence.
- Production service remains explicitly outside the authorization boundary.
- Last verified production deployment remains
  `6b0e057b-24dd-4882-b26e-abcbdf233c41`.
- Do not promote, redeploy, mutate production variables, or reinterpret the PR
  merge as deployment authority.

## Preserved repository-wide completion gate

The Mission Control reconciliation does not supersede the repository-wide
coverage-before-depth requirement or its promotion evidence. Recovery state must
continue to preserve these exact active completion-gate references:

- `patterns/coverage-before-depth-in-selection.md`
- `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`
- `tests/test_coverage_before_depth_pattern.py`

This gate remains independent of the Mission Control relay merge and must not be
dropped merely because the active Mission Control checkpoint is rewritten.

## Open P0 — issue #53

Issue #53, **first-class ChatGPT message timestamps and direct PM/supervisor
routing**, remains open with two distinct states.

### Provider source timestamp

Requirement `REQ-MC-VISIBLE-CHATGPT-MESSAGE-TIME-20260901` remains terminal for
its own feature:

- `completion_allowed=false`;
- `RO-TIME-004=UNMET`;
- bounded no-send probe result: `SAFE_TIMESTAMP_ATTRIBUTE_FOUND=false`;
- exact blocker:
  `PROVIDER_SOURCE_TIMESTAMP_NOT_EXPOSED_WITHIN_PERMITTED_NON_CONTENT_UI_BOUNDARY`.

No safe native `<time datetime>`, `data-message-timestamp`, `data-sent-at`,
`data-created-at`, or `data-timestamp` was exposed on the accepted assistant
message structural row. GitHub creation time, relay/browser observation time,
Mission Control receive time, DOM order, or relative labels are not provider
source time.

Do not widen into network/app-state payloads, accessibility text, assistant
output extraction, OCR, conversation export/JSON, or another content-bearing
path without a new owner/Chat privacy decision. Missing provider time must
remain visibly `TIMESTAMP UNAVAILABLE · UNVERIFIED`.

### Direct PM / supervisor owner routing

The repository already implements the reusable mechanics:

- first-class `reasoning_message_recorded` events;
- producer-authority guards preventing WORKER/Codex from minting ChatGPT
  Project Manager/supervisor authority;
- owner decision route states from `OWNER_RESPONSE_REQUIRED` through exact
  verbatim forwarding and supervisor resolution;
- exact parent-message and body-SHA binding;
- direct supervisory locator presentation.

The live provider-bound owner-response return route is still unproven. PR #58
accepted the specialist `mc-hotfix-specialist`; the global fleet Project Manager
remains explicitly unregistered. Do not promote that specialist into the PM
role or invent a PM locator.

The old same-chat Extra High -> Pro -> Extra High assumption is superseded by
route v4. `Same supervisory lane` now means stable supervisor identity, not the
same provider conversation. The fresh-session owner-response continuation is
implemented on the task branch below; a live routing demonstration remains open.

Post-merge issue #53 reconciliation is recorded in comment `5560926210`.

## Active bounded implementation — issue #53

The architecture/state correction (PR #65) merged at the canonical base above.
The current branch is `task/issue-53-owner-response-continuation-20260906`, under
`docs/requirements/2026-09-06-owner-response-continuation.owner-requirement.json`.
The controlling design composes existing primitives (issue #53 comment
`5561018766`), with the current owner's explicit direct/PM path correction.

Status: `IMPLEMENTED_NOT_LIVE_VERIFIED`.

- Optional stable supervisor IDs have no defaults or historical backfill.
- Server-derived continuation supports direct OWNER replies and PM-mediated
  forwarding of OWNER bytes; it does not transport PM/assistant output.
- Admission and persistence validate authoritative causal history; private route
  metadata remains separate from the historical binding envelope. Public MCP
  remains metadata-only.
- Canonical schema-v3 exact continuation echo consumes one causal continuation
  and atomically records an ASSISTANT/SUPERVISOR resolution from the admitted
  GitHub artifact. Source time stays null and provenance stays UNVERIFIED.
- Focused direct/PM, ordinary/Pro, replay, injection, privacy, rollback, and
  historical-compatibility regressions pass. Final local/hosted checkpoint
  evidence is attached to the implementation PR at its exact head.
- No browser/live acceptance, Railway/Hostinger deployment, merge, or production
  operation is authorized by this implementation task.

Issues #63 and #64 remain closed accidental connector artifacts with no authority.

## Next safe action

Review the continuation PR and its exact-head repository compliance and CodeQL
receipts. Do not merge or repeat accepted live work. Any later live routing proof
needs a new bounded authorization and must preserve the independently unmet
provider source-timestamp requirement. A real distinct PM identity must be
available before claiming a live global-PM demonstration.

## Recovery rule

Do not repeat PR #58 hotfix deployment, Hostinger installation, capability
proof, ordinary acceptance, escalated `6 Pro` acceptance, or source-time probe
unless a later executable/environment change specifically invalidates that
accepted evidence. Do not touch production.
