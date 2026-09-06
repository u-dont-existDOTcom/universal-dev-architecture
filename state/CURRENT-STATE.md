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
  `8b322b7c5a80ce437bc8f47da38760325e69848d`.
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
same provider conversation. The fresh-session owner-response return mechanism
must be demonstrated or adapted without weakening provenance or privacy.

Post-merge issue #53 reconciliation is recorded in comment `5560926210`.

## Active bounded maintenance — issue #62

Issue #62 exists only to reconcile durable architecture/state after PR #58. Its
scope is documentation/state correction:

- update the canonical direct-PM/supervisor architecture to route v4;
- preserve the timestamp P0 exactly as unmet;
- preserve the current privacy/browser boundary;
- do not invent the still-open owner-response return transport;
- no executable behavior change;
- no deployment or production action.

Working branch:
`task/mission-control-post-pr58-architecture-20260906`.

Issues #63 and #64 were accidental empty connector artifacts, immediately
closed `not_planned`, and carry no task or semantic authority.

## Next safe action

Finish the issue #62 docs/state-only correction, open a small PR, inspect its
exact diff, let the normal deterministic repository/CodeQL checks run once, and
merge only if the durable merge policy is satisfied.

After that, return to issue #53. Continue only the independently safe direct
routing work that can preserve the accepted fresh-session and no-output-
extraction boundaries. If a concrete Project Manager locator/identity or a new
privacy acquisition path becomes necessary, stop at that exact owner/Chat
architecture decision rather than inventing it.

## Recovery rule

Do not repeat PR #58 hotfix deployment, Hostinger installation, capability
proof, ordinary acceptance, escalated `6 Pro` acceptance, or source-time probe
unless a later executable/environment change specifically invalidates that
accepted evidence. Do not touch production.
