# Current State

Updated: 2026-09-07

## Persistent local worker permissions

The 2026-09-07 owner-authorized repair is documented in
`patterns/codex-worker-permissions.md`; its portable configuration, command rules,
and actual rule-matcher checks are in `templates/codex-permissions/`.
The existing GitHub operating-system pattern now owns the explicit five-condition
owner-interruption test and supervisor-link behavior. This local-worker setup
preserves existing project and Mission Control authority rather than creating a
new supervision lane. CLI 0.153.4 and desktop 26.901.41600 behavior is version-bound;
see the pattern for the desktop override, linked-worktree and review-persistence
caveats. Private machine configuration/backups are not repository artifacts.

## Current authority boundary

- Chat owns architecture, policy, methodology, prioritization, semantic review,
  owner-intent interpretation, ordinary GitHub work, and release decisions.
- Work/Codex is mechanical execution only: terminal/filesystem/SSH/browser/build/
  deploy mechanics after Chat has resolved the decision.
- A one-word `continue` by itself remains transport/liveness recovery rather than
  new semantic authority.
- Separately, the owner's current explicit standing instruction (2026-09-06) is
  to continue automatically through safe, reversible, in-scope actions and
  ordinary reviewed GitHub closeout/merge steps without asking for routine
  confirmation. Stop only at a genuine tradeoff or another non-resolvable owner
  decision; explain that choice in plain language and give the recommended option
  first.
- Production promotion is not authorized.

## Canonical repository boundary

- The canonical branch is `main`. Resolve its exact current tip from GitHub at
  action/review time rather than hard-coding a supposed current `main` SHA in this
  file: merging a state-only PR changes `main` and would make such a self-reference
  stale immediately.
- Immutable SHAs below are checkpoint anchors, not a substitute for a fresh
  current-tip read.
- PR #66, **Mission Control: continue owner responses in fresh supervisor
  sessions**, merged at
  `e345a65c2ec1058a562e6c9556dfc90c7f609338` from reviewed continuation head
  `840e80fad78d607899d7297ea1cd1c3d88c80ceb` onto prior canonical main
  `784144be749acbb989de95ef7e91914fcd483fd4`.
- PR #67, **Reconcile Mission Control state after PR #66 merge**, subsequently
  merged at `14bdc2fde41ab281bf44fb161f1e49e57a6982ec`; it was bookkeeping only.
- PR #58, **Mission Control: add memory-bounded Hostinger browser relay**, is
  merged.
- Exact accepted pre-merge head after final `main` synchronization for PR #58:
  `5e91f53ed4404001f59e3af80f5925326b1932f9`.
- The final PR #58 base sync added only:
  - `feedback/mission-control/SDF-20260902-GITHUB-FINAL-HEAD-CHECK-LIVENESS-001.json`
  - `state/OWNER-CHAT-WORK-MODE-BOUNDARY-20260902.md`
- No executable relay or Mission Control bytes changed during that PR #58 sync,
  so completed browser/live acceptance was not rerun.
- PR #66 exact-head verification was green before merge: deterministic repository
  audit, Mission Control tests/typecheck/build, relay tests/syntax/service assets,
  and CodeQL Actions/JavaScript-TypeScript/Python.
- PR #66 post-merge checks were also green, and PR #67 exact-head checks were
  green before its bookkeeping merge.

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
  #66/#67 merges as deployment authority.

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

The repository now canonically implements the reusable mechanics plus the
fresh-session owner-response continuation:

- first-class `reasoning_message_recorded` events;
- producer-authority guards preventing WORKER/Codex from minting ChatGPT
  Project Manager/supervisor authority;
- owner decision route states from `OWNER_RESPONSE_REQUIRED` through exact
  verbatim forwarding and supervisor resolution;
- exact parent-message and body-SHA binding;
- direct supervisory locator presentation;
- server-derived direct and PM-mediated OWNER continuations bound to stable
  supervisor identity and current authoritative history;
- fail-closed OWNER causal cardinality with no first-match/latest-wins rule;
- exact immutable GitHub receipt redelivery idempotency while genuinely new
  continuation replay remains rejected;
- GitHub-session-attested supervisor resolution with `sent_at_source=null`,
  `immutable_provider_locator=null`, and `provenance_status=UNVERIFIED`.

The direct provider-bound OWNER-response return route is now `LIVE_VERIFIED`;
the PM-mediated live route remains unproven. PR #58 accepted the specialist
`mc-hotfix-specialist`. On 2026-09-07 the owner authorized the permanent global
Project Manager identity exactly as `mc-project-manager`; the current requirement
and configuration lock that identity while preserving `mc-hotfix-specialist` as
a distinct specialist. The real Project Manager ChatGPT bootstrap locator,
bootstrap chat ID, and capability challenge remain unregistered and unverified.
Do not invent a PM locator or promote the specialist into that role.

The old same-chat Extra High -> Pro -> Extra High assumption is superseded by
route v4. `Same supervisory lane` now means stable supervisor identity, not the
same provider conversation. The fresh-session owner-response continuation is
merged and canonical; direct-path live proof passed, while PM-mediated live
demonstration remains open.

Post-merge issue #53 reconciliation before PR #66 was recorded in comment
`5560926210`; the PR #66 implementation checkpoint was recorded in comment
`5562010387`; the owner-authorized PR #66 merge was recorded in comment
`5562132254`.

## Merged bounded implementation — issue #53

PR #66 merged at
`e345a65c2ec1058a562e6c9556dfc90c7f609338`. Its reviewed implementation head
was `840e80fad78d607899d7297ea1cd1c3d88c80ceb`, under
`docs/requirements/2026-09-06-owner-response-continuation.owner-requirement.json`.
The controlling design composes existing primitives (issue #53 comment
`5561018766`), with the owner's explicit direct/PM path correction.

Aggregate status: `IMPLEMENTED_NOT_LIVE_VERIFIED`, `completion_allowed:false`.
The direct supervisor path alone is now `LIVE_VERIFIED`; this does not satisfy
the dual-path requirement or close issue #53.

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
  historical-compatibility regressions pass. Final exact-head local/hosted
  checkpoint evidence is preserved on the merged PR.
- No browser/live acceptance, Railway/Hostinger deployment, or production
  operation accompanied the merge.

Issues #63 and #64 remain closed accidental connector artifacts with no authority.

## Direct-path live checkpoint — 2026-09-07

Durable issue #53 checkpoint: comment `5574768121`.

**Direct supervisor path: LIVE VERIFIED (PASS).** The one disposable fixture
`mc53-direct-owner-20260906` reached `RESOLVED`. Its exact 70-byte OWNER reply was
delivered once on the original SUPERVISOR surface and recorded as the direct
child of the originating question. No PM participated. Mission Control derived
the DIRECT continuation from authoritative events; a fresh Extra High binding
preload received its server-observed tool receipt, followed by a distinct fresh
Extra High decision conversation in the same reusable browser tab.

The canonical schema-v3 decision (GitHub #59 comment `5574688708`) selected
**Amber** and echoed the exact continuation binding and digest. Normal
reconciliation admitted receipt
`github-decision-receipt:74a379d21964a4ec1b49cff337f0a002` (128), session attestation
(129), and supervisor resolution (130) atomically at
`2026-09-07T19:02:09.604Z`. The receipt and resolution counts remain one in the
`2026-09-07T19:07:58.998Z` snapshot. No-send relay closeout reports
`DECISION_RECEIPT_INGESTED`; both send gates remain disabled.

A pre-click composer failure was repaired in PR #70, merged at
`422b21351fda1b3da538bfa106aa549cd84ef791`, with required local/hosted checks and
independent review. All 30 installed relay files matched that revision. The
existing guarded operator recovery preserved the completed binding and failed
pre-click session; only one actual continuation decision was submitted. No
submission ambiguity occurred. OWNER bytes, authority and privacy boundaries
remained unchanged.

Six bounded replay/binding checks passed locally against captured live data with
zero writes: immutable-comment redelivery, different-comment replay, resolved
fresh admission, the independent consumed-ID guard, altered binding and wrong
digest. These are local checks using canonical production functions, not newly
created live comments, provider duplicates or an attested live webhook replay.
Repeated live counts span the normal poll interval; a specific zero-event poll
is not claimed because successful no-op polls have no durable receipt.

Exact causal IDs, binding/digest, provider sessions, model/tool/stage receipts,
observation times, recovery history and limits are preserved in
`docs/evidence/2026-09-07-direct-owner-continuation-live.json`. Parent/message IDs
are authoritative Mission Control causal records, not native provider ancestry.
Provider `sent_at_source` remains null and provenance remains UNVERIFIED:
`TIMESTAMP UNAVAILABLE · UNVERIFIED`.

The hotfix-only recorder credentials were separately authorized by the owner.
Hotfix deployment `a55ec89f-e0ff-4216-812f-5613e945c35c` remains healthy with backend
application bytes identical to current canonical code; no backend redeploy was
needed for the relay repair. Production deployment remains unchanged. Final
doctor is READY with one tab, NORMAL memory and no ambiguities. Native sandbox,
loopback CDP and the authenticated profile remain intact. Capability receipt is
current through `2026-09-10T23:59:59.000Z`. The owner accepted the existing connected
GitHub route without a selected composer chip; do not reopen that settled choice.

## Next safe action

The direct-path live proof is complete. Preserve its durable checkpoint and keep
the consumed fixture closed; do not repeat OWNER delivery, binding preload or
decision submission. Both send gates stay disabled.

PM-mediated live demonstration remains a separate future step. The permanent
global Project Manager identity is already owner-authorized as
`mc-project-manager`; the next PM-routing blocker is obtaining and registering a
real, dedicated ChatGPT bootstrap locator/capability for that identity and then
running the PM-mediated live proof. Do not promote `mc-hotfix-specialist` or
fabricate a locator. Provider source timestamp remains independently unmet;
widening into content-bearing/provider-internal acquisition is a privacy tradeoff
requiring explicit owner/Chat consideration. Issue #53 remains open.

## Recovery rule

Do not repeat PR #58 hotfix deployment, Hostinger installation, capability
proof, ordinary acceptance, escalated `6 Pro` acceptance, or source-time probe
unless a later executable/environment change specifically invalidates that
accepted evidence. Do not repeat PR #66 implementation/review unless a later
canonical change invalidates it. Do not touch production.
