# Current State

Updated: 2026-09-07

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

The live provider-bound owner-response return route is still unproven. PR #58
accepted the specialist `mc-hotfix-specialist`; the global fleet Project Manager
remains explicitly unregistered. Do not promote that specialist into the PM
role or invent a PM locator.

The old same-chat Extra High -> Pro -> Extra High assumption is superseded by
route v4. `Same supervisory lane` now means stable supervisor identity, not the
same provider conversation. The fresh-session owner-response continuation is
merged and canonical; a live routing demonstration remains open.

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
  historical-compatibility regressions pass. Final exact-head local/hosted
  checkpoint evidence is preserved on the merged PR.
- No browser/live acceptance, Railway/Hostinger deployment, or production
  operation accompanied the merge.

Issues #63 and #64 remain closed accidental connector artifacts with no authority.

## Direct-path live checkpoint — 2026-09-07

The one disposable fixture `mc53-direct-owner-20260906` has now reached
`SUPERVISOR_RESOLUTION_REQUIRED`. Its exact 70-byte OWNER reply was delivered once
on the original SUPERVISOR surface and recorded as the direct child of the
originating question. No PM participated. Mission Control derived the DIRECT
continuation from authoritative events and admitted the fresh route; the fresh
Extra High binding preload and server-observed tool receipt completed.

The fresh decision stage stopped **before clicking Send** because the composer
byte check omitted four paragraph separators and the browser converted one
generated instruction-line leading space to a nonbreaking space. OWNER bytes
were unchanged. The decision provider session has
no assigned conversation URL, the global pacer still records only the completed
binding submission, and no submission ambiguity exists. This is a narrow
composer serialization defect; continuation authority, exact OWNER bytes,
historical ordinary prompt bytes, and privacy boundaries remain unchanged. The narrow correction passed against the actual
unsent composer at `2026-09-07T18:37:05.813Z`, with exact 5,220-character equality
and no send. The operator-only pre-submit retry correction also passed a local
no-write dry run against captured live state at `2026-09-07T18:49:04.151Z`; it
revalidates the current server binding and retains the original completed preload.
Automatic failed-decision replay remains blocked. Live continuation is not yet verified.

Exact causal IDs, hashes, observation times, and the no-send diagnosis are in
`docs/evidence/2026-09-07-direct-owner-continuation-live.json`.
The hotfix-only recorder credentials were separately authorized by the owner;
production remains untouched. The owner also accepted the existing connected
GitHub route without a selected composer chip; do not reopen that settled choice.

## Next safe action

Continue the **same** direct-path fixture after the narrow composer newline
verification and operator-only pre-submit retry fixes are reviewed, merged,
installed with both send gates disabled, and pass no-send diagnostics. Use the
existing `resolve <same-route-key> retry` once, then resume only the unsent decision
stage through the normal relay. Do not create a second fixture or repeat the direct OWNER reply or
completed binding preload. The detailed checkpoint above controls recovery.

The PM-mediated live demonstration remains separate until a real distinct global
Project Manager identity/locator exists. Provider source timestamp remains
independently unmet; widening into content-bearing/provider-internal acquisition
is a privacy tradeoff and requires explicit owner/Chat consideration rather than
being smuggled into the routing proof.

## Recovery rule

Do not repeat PR #58 hotfix deployment, Hostinger installation, capability
proof, ordinary acceptance, escalated `6 Pro` acceptance, or source-time probe
unless a later executable/environment change specifically invalidates that
accepted evidence. Do not repeat PR #66 implementation/review unless a later
canonical change invalidates it. Do not touch production.
