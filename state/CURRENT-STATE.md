# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-17

## Goal

Complete one fresh PM-mediated controller cycle at the real consumer seam while
preserving the frozen recovery order: never Retry an original failed semantic
turn first; send exact same-chat `continue`, and only when that exact continue
turn visibly fails may the controller Retry that exact failed continue once.

## Authority / baseline

- Current owner authority is the 2026-09-16 v2 continuity directive as amended
  by the 2026-09-17 expired-cycle and capability-gate correction in
  `docs/requirements/2026-09-17-controller-expired-cycle-terminalization.owner-requirement.json`.
- Resolve the exact current canonical `main` tip from GitHub at action time.
- The historical 2026-09-09 controller cycle is evidence only. Its crossed send
  boundary and any original-turn Retry are ineligible for replay.
- Production and all hosts other than the two named owner VPS hosts remain out
  of scope.

## Current checkpoint

- Active repair candidate branch:
  `task/controller-expired-cycle-terminalization-20260917`.
- The controller now has restart-safe per-lane recovery state for origin, PM,
  and return waits. It sends exact `continue` only after generation completion,
  the configured grace interval, and a fresh artifact/final-receipt absence
  check through the shared submission scheduler.
- A Retry is eligible only when structural, non-content browser evidence binds
  one exact Retry control to the assistant turn created by that exact continue.
  Ambiguous ancestry, an original-turn Retry, crossed boundaries, exhaustion,
  or a second Retry fail closed.
- Focused controller/structure/pacing tests and the complete relay suite pass
  locally. The release checkpoint is green: repository 338/338 plus deterministic
  audit, Mission Control 270/270 plus typecheck and production build, relay
  201/201 plus syntax/service assets, source-archive reconstruction digest, and
  diff check. PR #132 passed hosted checks and merged as
  `b8d1ac4ea957627de8f26feaba3e1560c92f4269`; the exact package is installed on
  the authorized SECONDARY with file parity and rollback preserved.
- PRIMARY operator access is restored. The later browser reactivation was
  traced exactly to the completed managed Chromium-bridge qualification, not
  the disabled health timer or an in-flight provider send. PRIMARY is now
  protected by a root-owned durable fence marker plus a systemd instance mask;
  its system and alternate user start paths remain browser/CDP-quiescent.
- The smallest recurrence repair is commit
  `5f199485dc5efb8d25387c340dd235b7152ce7fc`: browser, health, qualification,
  and maintenance paths share the durable fence; health no longer depends on
  or starts the browser; explicit release is the only return transition. The
  exact package is installed reversibly on both authorized non-production
  hosts. Relay 203/203, focused 42/42 and 32/32, syntax, diff, repository,
  Mission Control, relay, and CodeQL checks pass on PR #140. No provider send
  occurred.
- PR #140 subsequently merged as
  `993068ff7c8917eca8bd4028a1d81d861cf5f8a0`. The owner-authorized controlled
  restart completed with the existing volume preserved: the central scheduler
  is healthy, epoch 4 is active on SECONDARY, PRIMARY remains durably fenced,
  and no provider send or production action occurred.
- The current candidate adds a truthful `EXPIRED` controller terminal state.
  It requires a fresh valid central ledger with no unresolved admission,
  target transition, or safety halt and no unresolved local send, continue, or
  Retry boundary. It preserves the historical cycle evidence, is idempotent,
  cannot consume a late artifact, and no longer monopolizes fresh admission.
- The separately asserted three-chat current-capability-receipt prerequisite
  prevents no material unsafe action beyond the existing direct consumer-seam
  controls. It is removed from ordinary admission but retained as a diagnostic;
  no live capability probe was sent. Focused regressions and the complete relay
  suite pass locally. The candidate is not merged, installed, or live-tested.

## Completed outcome

- PR #102 exact head `0fcbdcebe9f0218737ea4265fb6f72a3873cef4a`
  passed every repository, Mission Control, relay, and CodeQL hosted gate and
  merged normally as `09b41482880cb4ca111a76dc3b69d4ac7312fa9f`.
- Issue #90's frozen dual-VPS requirement, multi-host hardening record, and the
  Work-access/MC-chat-creation requirement are `LIVE_VERIFIED` with 13/13 live
  acceptance cases.
- The historical recovery branch remains exact at
  `cb89966b83f12db49d974de4ebf402d10d310608`; later unrelated mainline work is
  preserved.

## Remaining

- Review and accept the expired-cycle repair PR. After the accepted candidate is
  merged and installed reversibly on the authorized SECONDARY, run the already-
  authorized single fresh disposable PM-mediated OWNER-byte fixture at the real
  consumer seam. Do not interpose a new three-chat preflight-proof chain.

## Blockers / unresolved

- The repair is intentionally unmerged and not installed. The historical
  expired `WAIT_*` cycle therefore remains nonterminal in the live installed
  version until this candidate is accepted and deployed. No live ambiguity or
  capability probe was introduced during candidate preparation.
- At candidate verification, base checkpoint
  `da2e38f45d5025cf7a691cf97e4dc6ba704e0bc2` had 10 unrelated Work
  model-routing policy-suite failures and its hosted repository-compliance run
  was red. This candidate changes none of that
  policy, template, result, or test surface; it must not hide the inherited gate
  or expand this controller repair to absorb it.

## Evidence / artifacts

- Completed plan:
  `docs/exec-plans/completed/2026-09-10-mission-control-multi-host-hardening.md`.
- Active controller recovery plan:
  `docs/exec-plans/active/2026-09-16-controller-same-chat-recovery.md`.
- Current live acceptance receipt:
  `docs/evidence/2026-09-12-owner-deployment-multi-host-live-acceptance.json`.
- Prior installed-host receipt:
  `docs/evidence/2026-09-10-owner-deployment-multi-host-hardening.json`.
- Prior live pacing audit:
  `docs/evidence/2026-09-10-owner-deployment-prechange-pacing.json`.
- Current epoch-4 fencing/readiness checkpoint:
  `docs/evidence/2026-09-17-epoch4-fence-recovery-readiness.json`.
- Current expired-cycle repair receipt:
  `docs/evidence/2026-09-17-controller-expired-cycle-terminalization-receipt.md`.
- Owner-specific current topology:
  `state/NON-UNIVERSAL-OWNER-MISSION-CONTROL-TOPOLOGY-2026-09-10.md`.
- Portable mechanisms:
  `patterns/shared-provider-submission-queue.md` and
  `patterns/mission-control-multi-host-submission-scheduling.md`.

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

## Current Chat / Work capability boundary

- Capability claims are exact directional source → destination edges with every
  user, UI, permission, and authorization gate. Evidence for one edge does not
  establish another destination, the reverse direction, autonomous invocation,
  or cross-interface availability. A required user click or approval is an
  automation blocker until satisfied.
- For the currently established architecture, Chat → Work requires explicit user
  acceptance; native Work ↔ Work coordination exists within Work after the tasks
  exist; Work → the originating Chat is unavailable.
- Mission Control should reuse native Work-internal coordination, but retains
  autonomous control-plane routing of supervision and escalation plus durable
  control across the Chat/Work boundary through explicit verified routes. This
  current product constraint does not transfer semantic reasoning authority,
  broaden Work or Mission Control authority, or authorize production.

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
  -> fresh GPT-5.6 Sol / Thinking effort Extra High (4 of 5) Mission Control binding-preload conversation
  -> verified current binding envelope
  -> distinct fresh decision conversation in the same reusable browser tab
       ordinary/escalated: exact GPT-5.6 Sol / Thinking effort Extra High (4 of 5)
  -> first-message GitHub evidence read + canonical #59 decision write
  -> Mission Control validation / admission
```

Hard invariants:

- exact current visible controls only: model `GPT-5.6 Sol` plus `Thinking effort`
  `Extra High` (`4 of 5`);
- `Pro` is account-plan provenance metadata, never a reasoning-mode control;
- no hidden/backend identity claim;
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

Historical pre-surface-correction ordinary v4 acceptance passed with canonical
#59 comment `5553196186`.
Historical pre-surface-correction escalated v4 acceptance passed with exact visible label `6 Pro`, canonical
#59 comment `5553905289`, and provenance
`VISIBLE_PRO_SESSION_GITHUB_ATTESTED`. Those controls and provenance are retained
as evidence only and are ineligible for current sends.

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

## Active P0 contract — issue #53

Issue #53, **first-class ChatGPT message timestamps and direct PM/supervisor
routing**, is closed in GitHub's issue-state field but has a newer controlling
execution contract in comment `5594633379`. Treat that exact comment, not the
older issue-state field or this checkpoint alone, as the current PM-loop
execution authority. The timestamp and routing outcomes remain distinct.

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
a distinct specialist. The owner has now supplied a real dedicated ChatGPT
bootstrap locator and conversation ID for `mc-project-manager`. Because this
repository is public, their exact values are intentionally not committed; the
privacy-safe hashes and attestation are in
`docs/evidence/2026-09-07-global-pm-owner-attested-locator.json`. The locator is
owner-attested, not provider-verified. The newer exact contract records the
private `MISSION_CONTROL_SUPERVISOR_CHATS_JSON` registration, matching fresh
`MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON` challenge, and live PM capability
verification as already deployed and accepted. Do not repeat those capability
attempts, publish the private locator, fabricate a challenge, or promote the
specialist into the PM role.

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

## Controller-mediated PM execution checkpoint — 2026-09-09

Issue #53 comment `5594633379` supersedes the obsolete assumption that the PM
must invoke Mission Control through developer MCP. The smallest accepted path
keeps GitHub as the semantic mailbox: exact origin reasoning chat -> exact
origin artifact -> permanent `mc-project-manager` reasoning chat -> exact PM
artifact -> fresh decision chat on the exact prior origin target -> canonical
GitHub decision and Mission Control resolution. Each reasoning chat performs
its own ordinary GitHub reads/writes and may not delegate them to Work/Codex.

The controller implementation in the current release candidate adds an
owner-only restart ledger, exact immutable-comment reconciliation, explicit
pre/post-send boundaries, bounded no-replay ambiguity, exact automation target
and window operations, PM-target force creation, exact OWNER-byte preservation,
and final GitHub/Mission Control resolution admission. Generation completion is
transport evidence only. Local focused and complete relay tests pass; hosted
exact-head verification, reviewed merge, non-production Hostinger installation,
and one fresh disposable live proof are not yet claimed by this checkpoint.
Production remains outside authority.

## Historical next safe action (superseded 2026-09-11)

The direct-path live proof is complete. Preserve its durable checkpoint and keep
the consumed fixture closed; do not repeat OWNER delivery, binding preload or
decision submission. Both send gates stay disabled.

Complete the controller candidate's release gate and reviewed GitHub merge,
install that exact merged package on the authorized non-production Hostinger
relay with rollback preserved, then execute exactly one fresh disposable
PM-mediated OWNER-byte cycle. Do not repeat browser isolation, direct-path,
developer-MCP, or capability probes. Do not promote `mc-hotfix-specialist`,
publish the private PM locator, or touch production. Provider source timestamp
remains independently unmet; widening into content-bearing/provider-internal
acquisition is a privacy tradeoff requiring explicit owner/Chat consideration.

## Historical recovery rule (superseded 2026-09-11)

Do not repeat PR #58 hotfix deployment, Hostinger installation, capability
proof, historical ordinary acceptance, historical escalated `6 Pro` acceptance,
or source-time probe
unless a later executable/environment change specifically invalidates that
accepted evidence. Do not repeat PR #66 implementation/review unless a later
canonical change invalidates it. Do not touch production.

## 2026-09-18 — Per-request Mission Control candidate (not deployed)

Owner outcome OPEN. A separate opt-in per-request candidate has 142 focused/affected passing tests and a passing typecheck. Existing rotation/preload work is not the migration base; old runtime evidence is retained. The candidate is not merged or deployed, and V2/V3 remain sealed/frozen. See `docs/exec-plans/active/2026-09-18-mc-per-request-handshake.md` and `docs/requirements/2026-09-18-mc-per-request-handshake.owner-requirement.json` for exact remaining execution gaps. Current runtime permissions block deployment; Work receives only the specified residue.
