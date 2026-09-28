# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-28

## PR #275 Codex review follow-up at `15c101b` (2026-09-28)

- Parent outcome: **SATISFIED**. All four findings are valid; this review round
  is implemented, validated, committed on the existing pull-request branch,
  and reflected in the pull-request update metadata.
- Persisted journal work is still reconciled against the authoritative listing,
  including while paused. If no answer is present, an unresolved owner action
  returns `OWNER_ACTION_REQUIRED` and active readback backoff returns
  `BACKING_OFF`; both retain `state.current` and start no new submission ladder.
- Stuck-recovery queue keys now bind both the provider-session identity and the
  process-local logical wait/nudge sequence, preventing a restarted process from
  colliding with a durable queue key issued for a different session.
- The derived journal-work lock lifetime now includes the maximum four-times
  configured pacing delay before budgeting the complete submission ladder.
- Direct regression coverage proves owner-action retention, backoff retention,
  restarted-session recovery-key separation, and maximum pacing inclusion.
  Focused runner tests pass 34/34 and focused state/client tests pass 17/17.
- Completion gates are green: the relay `npm test` suite passes, repository unit
  tests pass 467/467, and the deterministic repository audit reports no
  findings.
- Active assurance lane: **release**, because the owner explicitly requires the
  existing pull request to remain merge-ready and names all three completion
  gates.
- Stop admission: the requested review-finding repair has reached its evidenced
  completion boundary; no independent implementation or validation action
  remains in scope.

## PR #275 Codex review follow-up at `504cca0` (2026-09-28)

- Parent outcome: **SATISFIED**. The five review regressions are implemented,
  validated, committed on the requested existing pull-request branch, and the
  pull-request update metadata has been recorded.
- All five findings are valid. The current candidate reconciles every persisted
  work ID with the authoritative listing before eligibility filtering, so an
  answer that lands across the persisted pre-readback crash window enters the
  import phase rather than being skipped.
- Provider-call accounting is now a separate durable daily `calls` counter,
  migrated conservatively from the former answered-item count. Every crossed
  journal submission boundary persists one call, pacing and admission use that
  counter, and the active recovery ladder stops before crossing the allowance.
- Initial and subsequent fresh chats now use distinct provider-session IDs and
  queue keys. Continue and Retry bind to the resulting conversation URL and the
  same provider-session ID as `BOUND_PROVIDER_SESSION` sends.
- The `journal-work` process-lock lifetime now derives from the complete
  configured ladder: every permitted fresh conversation plus Continue and
  Retry, with each logical submission including all configured stuck-recovery
  attempts. The explicit lock override remains authoritative.
- Regression coverage directly exercises crash-window reconciliation, durable
  per-call allowance enforcement, distinct fresh queue/session identities,
  bound recovery contexts, and the full-ladder lock calculation. Focused tests
  pass 44/44 after one diagnostic run exposed and repaired legacy state
  migration plus an intentionally exact CLI-source fixture.
- Completion gates at this candidate boundary are green: relay `npm test`
  passes 353/353 tests, repository unit tests pass 467/467, and the
  deterministic repository audit reports no findings.
- Active assurance lane: **release**, because the owner requires the existing
  pull request to remain merge-ready and explicitly requires all three gates.
- Stop admission: the requested review-finding repair has reached its evidenced
  completion boundary; no independent implementation or validation action
  remains in scope.

## Journal work runner implementation checkpoint (2026-09-28)

- The current `work` branch implements the specified, undeployed InnerSignal
  journal work runner in `tools/codex-mission-control/vps-browser-relay`.
- The runner uses only validated content-free dispatch records, the fixed
  work-ID instruction, fresh automation-owned conversations, exact consumer
  controls and app selection, the central submission scheduler, and the relay
  process lock. Listing readback—not page output—is the answer authority.
- Continue, exact failed-continue Retry, and fresh-chat recovery are implemented.
  Exact InnerSignal `submit_journal_work_result` confirmations may be approved;
  other app/tool confirmations fail closed with a content-free owner action.
- Owner-review alignment now uses the relay's structurally anchored Continue
  and failed-Continue Retry flow, skips a generation wait when no recovery
  action starts, reads account-calibrated model/effort observations from the
  private runner state, and enforces `freshChatThreshold` as the total fresh
  conversations allowed per item.
- Per-account runtime state holds tunable pacing/backoff/fresh-chat settings,
  UTC allowance counts, bounded outcomes, current rung, and allowlisted import
  summaries. Import parsing ignores npm header output, selects the last JSON
  object line, and retains `stage`, `blocker`, `completed_units`, and filtered
  plain-count `residuals`. Import runs serialize after answered items. No journal packet,
  answer, page text, private path, account identifier, or conversation URL is
  recorded.
- Verified locally after owner-review alignment: focused journal-runner
  regressions pass 20/20, relay `npm test` passes 346/346, repository unit tests
  pass 467/467, and the deterministic audit reports no findings. Deployment
  remains explicitly out of scope and has not occurred.

### Codex review round at `ce58e1c` (2026-09-28)

- All four review findings were valid. The runner now rechecks expiry after its
  pacing delay, so an expired dispatch is recorded without opening a chat or
  making a provider submission.
- A failed authoritative listing read after a send now records a `READBACK`
  phase and enters persistent backoff without advancing Continue, Retry, or
  fresh-chat recovery. After backoff, the runner reads the listing first and
  accepts an already-landed answer without another provider submission.
- A nonzero import remains in a durable `IMPORT` phase and reports
  `IMPORT_FAILED`, without incrementing the answered allowance or claiming an
  `ANSWERED` outcome. The next pass retries that import before dispatching more
  work; only a successful import completes the item.
- Successful item completion now clears any stale `ownerAction` in both runner
  and status state. Focused regression coverage was added for each finding.
- Verification at the review-round candidate boundary is green: the focused
  runner suite passes 24/24, relay `npm test` passes 350/350 tests, repository
  unit tests pass 467/467, and the deterministic audit reports no findings.
- Stop admission: the implementation and merge-ready validation portions of
  the parent outcome are **SATISFIED** at this checkpoint. The current worker
  still owns the authorized commit and existing-PR update before user-facing
  delivery; neither requires an owner decision.

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

## Native ChatGPT Work dispatch checkpoint (2026-09-19)

- Candidate branch: `task/mission-control-work-cloud-adapter-20260919`.
- The portable `chatgptWorkCloud` rule is already canonical on `main`; this
  candidate adds the missing Mission Control reference adapter, typed ledger
  events, projection/UI state, and exact native-Work lineage enforcement.
- A dispatch request is durably source-bound before the authenticated app
  executor is called, and the normalized result is recorded afterward.
  `PENDING_APPROVAL`, `PENDING_SETUP`, `READY`, `FAILED`, and `UNAVAILABLE`
  remain distinct. A Codex task cannot satisfy a Work request merely because its
  title begins with `Work —`.
- Continuation requires the exact previously verified native Work thread ID.
  Completed retries are idempotent; a request-only crash boundary is treated as
  ambiguous and blocks a second app call until recovered.
- The app-executor producer identity and explicit native-surface evidence are
  mandatory. Missing authenticated executor capability records
  `WORK_CLOUD_DISPATCH_UNAVAILABLE`; it never silently falls back to Codex.
- The current candidate is not installed or deployed. Validation is green:
  focused native-Work tests 15/15, affected Mission Control tests 151/151,
  full Mission Control tests 334/334 with bounded concurrency, production
  build, repository tests 360/360, and deterministic audit with zero errors.
  One initial unconstrained full-suite run hit a daemon startup timeout while a
  10k-event stress test saturated the same machine; the isolated daemon test
  passed and the complete bounded-concurrency rerun passed.

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
## Native ChatGPT Work controller live acceptance repair (2026-09-20)

- Current integration candidate branch: `chat/mc-work-cloud-integration-reconcile-20260920-1935`, isolated from current main `1aa61d91cf77819987dabf8f8518420ee270f772`. The older dirty Work-cloud worktree is quarantined as provenance and is not a merge source.
- A real isolated Mission Control daemon/ledger invoked the controller against ChatGPT desktop 26.903.61454 without mutating the prior smoke daemon or production. The direct fresh app-server mutation path correctly stopped at an invisible `PENDING_APPROVAL`; no approval response was fabricated.
- The accepted owner-deployment bridge is an already desktop-owned Codex driver task using the product's own automatic reviewer. Mission Control queues a tool-only directive, then trusts only the structured rollout `McpToolCall` receipt with exact server/tool/arguments. Wrong MCP actions, command/file actions, missing/failed receipts, concurrency, and extra mutations fail closed. Driver final prose is not evidence; a title-renaming canary demonstrated why by saying completion after the underlying app tool had failed.
- Live CREATE: one native `chatgptWorkCloud` task was created, persisted as `PENDING_SETUP`, then the same dispatch ID resolved read-only to one stable `READY` cloud thread. Replaying the terminal CREATE dispatch added zero driver activity and returned the same durable event.
- Live CONTINUE: `send_message_to_thread` targeted the exact verified stable Work id; readback found the follow-up in the same cloud thread. Replaying the continuation dispatch added zero driver activity and returned the same durable event.
- Provider title normalization replaced the requested `Work — …` title, and the Codex-only rename tool rejected the cloud Work id. The repair therefore writes an optional owner-private `WORK-THREAD-LOCATOR` cache after verified CREATE and extends `chatgpt-thread-find` to query the authenticated live app `list_threads` metadata index before stale browser/local-catalog fallbacks. The candidate helper recovered the existing canary from its originally requested Work title through the private durable locator, and stable-id lookup independently matched both the live app index and the durable locator, without message-body search or a provider send.
- Verification on the exact reconciled candidate: focused Work-controller tests 17/17; focused multi-surface recovery tests 5/5; affected Work-dispatch tests 19/19; TypeScript typecheck PASS; production build PASS; full Mission Control suite 375/375 PASS; repository suite 370/370 PASS; deterministic audit 0 errors with one pre-existing root-AGENTS size warning; diff check PASS.
- Privacy: stable cloud thread id, driver thread id, app-tools socket, rollout path, and private locator contents remain local only and are not committed.
- Evidence limit: this canary used a synthetic exact source-Chat binding. Native Work creation, stable-id continuation, duplicate suppression, and recovery are live-proven; the final natural Round-4 run must still bind the actual originating Chat URL/receipt lineage before the owner outcome can close.
- Parent outcome remains OPEN: publish/install the exact repair, dispatch the frozen AskRigor MAST Round-4 directive through native Work, supervise that same Work thread to terminal completion or a genuine boundary, and write the automation receipt.



## MAST Round-4 native Work terminal reconciliation — 2026-09-20

- The natural AskRigor MAST Round-4 execution used the already-created native
  ChatGPT Work task; no duplicate Work task was created during reconciliation.
  The exact stable Work identity and source-Chat locator remain private owner
  deployment state and are not committed here.
- The CREATE dispatch had already resolved to `READY / VERIFIED_NATIVE_WORK`.
  Provider title normalization changed the requested title, so durable recovery
  remains stable-ID-first with the owner-private requested-title locator and the
  authenticated live thread metadata index.
- The frozen Round-4 workflow is terminal **INDETERMINATE**. Provider response
  #1 completed, then frozen local admission rejected it because the admitted
  response schema rejected the required `chatMode` field. Generation therefore
  remained 0/120; J1/J2/J3 remained 0/0/0; no judging or adjudication ran; and no
  later generation prompt was sent.
- Card002 remains DEVELOPMENT. No post-response scientific patch, retuning, or
  substitute execution was admitted. The frozen AskRigor evidence branch is
  `task/mast-fresh-validation-round-4-20260919` at
  `dd324d19f7224bc4a55feea8831d5e3a433a2491` (PR #232). Both AskRigor
  deterministic verification and repository workflow policy were green on that
  frozen head.
- The owner-private Mission Control automation receipt now records the terminal
  Work lineage and an owner-openable recovery route through
  `chatgpt-thread-find`. Private stable thread IDs, source-Chat locators, and
  local locator contents remain outside this public repository.
- After the issue-178 lane explicitly ceded shared-runtime ownership, the
  non-production central Mission Control runtime was updated reversibly from the
  older `c45facd…` application image to canonical application commit
  `a03e19ee6aff88cb67cef2be1c3d6285203d0c49`. The existing durable state
  volume was preserved and the prior healthy container remains stopped as
  rollback.
- Post-install readiness reported event-chain validity, authority-ledger
  validity, and `ACTIVE_LEASE`. The fenced owner-secondary relay/browser state
  was not changed. No provider send, Work CREATE, Work CONTINUE, paid API
  inference, or scientific execution occurred during this runtime
  reconciliation.
- This final repository reconciliation changes only documentation/state. It does
  not change Mission Control executable bytes and does not invalidate the
  accepted exact-current application build or require another runtime reinstall.
- Issue #178 remains OPEN for its distinct automated-self-development
  acceptance. Round 4 demonstrates native Work dispatch, isolated execution, and
  terminal receipt preservation, but does not independently prove the required
  automatic supervisor-return/closure loop. No duplicate issue-178 canary was
  run in this lane; shared-runtime ownership is released back to that lane after
  this checkpoint is merged.
- The Round-4 owner outcome is satisfied at the automation boundary. The
  scientific result is INDETERMINATE by the frozen study rule; continuing the
  same Work thread would violate its terminal stop condition.

## Unified native Work autodispatch / issue #178 integration — 2026-09-21

- Mission Control integration/runtime writes are serialized through the canonical ACTIVE integration-owner lock for `chat/mc-unified-integrator-20260921`. Child Mission Control lanes may only hand isolated deltas to that integrator; they may not independently mutate canonical main or the shared non-production runtime.
- The stale native-Work autodispatch branch is reference-only and is not a merge source. The current candidate preserves the canonical direct native Work controller and request-binding V6 architecture.
- Candidate behavior now includes explicit native-Work execution-surface routing, Codex exclusion, automatic direct-controller launch from durable state, durable pre-boundary handoff intent, request-only proven-unsent recovery, post-intent ambiguity/no replay, queue fairness, privacy-safe Work completion receipt ingestion, and exactly one V6 return route to the original stable supervisor/current owner outcome.
- Native Work completion receipts are first-class execution receipts for pending reasoning review/final-response state while Codex-specific profile/preflight requirements remain Codex-only. Direct `VERIFIED_NATIVE_WORK` evidence is required; weaker source-attested fallback semantics were not ported.
- Focused/affected local acceptance is green and TypeScript passes. Hosted exact-head release gates and live non-production acceptance are not yet claimed.
- Issue #178 remains OPEN until one harmless live `mission-control-development` cycle proves supervisor reasoning -> durable decision -> automatic bounded executor -> isolated child branch -> execution receipt -> automatic reasoning return/closure without owner clipboard relay. No production deployment is authorized.

## Owner external-model API route — 2026-09-22

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT**.

- Owner preference: standard UDA-controlled external LLM API calls use the
  authenticated model gateway first instead of direct OpenRouter calls when the
  required model/capability is available.
- The current gateway is Venice-backed; `gpt-5.6-sol` resolves to
  `openai-gpt-56-sol`.
- Canonical portable caller: `scripts/uda_model_gateway.py`.
- Runtime-only configuration: `UDA_MODEL_GATEWAY_URL` and
  `UDA_MODEL_GATEWAY_TOKEN`; live values are intentionally absent from Git.
- Live boundary verified: health 200, unauthenticated chat 401, and one
  authenticated paid GPT-5.6 Sol smoke returned HTTP 200 with exact
  `VENICE_GATEWAY_OK`.
- OpenRouter remains permitted only where the required capability/model is
  provider-specific or unavailable through the gateway. Canonical direct caller:
  `scripts/uda_openrouter.py`, using local runtime `OPENROUTER_API_KEY` and the
  explicit OpenRouter model ID. This path is direct local process -> OpenRouter;
  Railway is not part of the inference architecture. TypeSafe Jev Decisions
  remains an existing OpenRouter-specific exception.
- Canonical repository closeout: the gateway/client change passed local and
  hosted release gates, merged as `c89bf0417353fbf480bae82afecd3a1a3d921248`,
  and Railway is now sourced from `main` with the merge-commit deployment
  healthy. The obsolete task branch was removed.
- Owner outcome status: SATISFIED. No further Venice-gateway implementation
  work is required unless a new caller/runtime needs its own secret injection.


## Operational owner-method enforcement repair — 2026-09-24

A repeated method-substitution failure exposed a coverage gap: generic policy and prose-presence tests did not compare the launched experiment with the permitted owner method. The existing requirement-accretion pattern now preserves operational dimensions and quantifiers at launch. `scripts/owner_method_admission.py` and behavioral regressions reject component-by-component substitution, invented weight fitting, missing arms, prohibited authorized refitting, and child-only root closure. This is a portable projection comparator, not a proof of semantic extraction or universal runtime enforcement. A downstream research runner is being bound to the comparator in an isolated development branch.

## Relay-lock lifecycle fix ported to main — 2026-09-25

The owner-authorized relay-lock lifecycle repair (requirement
`docs/requirements/2026-09-13-mission-control-relay-lock-lifecycle.owner-requirement.json`)
was live-verified on PRIMARY on 2026-09-13 from source commit
`5be4d444041c8e1681d56a5b7256a01b3090f690` on the unmerged branch
`task/mission-control-relay-lock-lifecycle-20260912`. That branch never reached
`main`, so any later PRIMARY/SECONDARY relay deploy from `main` most likely
reinstalled the old `wx` + `/proc/<pid>` lock and dropped the repair.

The port branch `claude/funny-heisenberg-lsbn3b-relay-lock` carries the same
code onto current `main`: `src/relay-lock.mjs` (kernel `flock` guard on the
persistent `relay.lock.guard` inode, atomically published PID/start-ticks/boot-ID
owner metadata, identity-checked release, fail-closed malformed/unverifiable
metadata), `src/relay-lock-watchdog.mjs` (out-of-process finite-helper deadline),
`state.mjs` delegation, and CLI `finally` release plus `lock-status`. Current
`main` behavior is preserved: `health-report` still takes no exclusive lock and
`once-exact` is a bounded one-shot owner. Once merged, `main` carries the code
that was live-verified on 2026-09-13; the next relay release from `main` must
still be installed and verified on the hosts before claiming it is live again.
Never delete `relay.lock.guard`; stop old-version relay/helper processes before
upgrading so mixed lock versions never run together.

Review hardening on the same branch (2026-09-26) goes beyond the live-verified
code, so the next host release must verify it too: CLI one-shots now derive
their default watchdog lifetime from the configured page-ready, submit,
generation (times the stuck-recovery nudge cap plus one) and, for `once` with
Codex preview enabled, Codex execution ceilings plus a 10-minute margin, capped
at 6 hours, instead of a fixed 30 minutes that could kill a configured 60-minute
Codex run or generation wait. `MC_RELAY_LOCK_MAX_MS` remains an explicit
override and library helpers keep the 30-minute default. The relay units declare
`SuccessExitStatus=143` because the lock lifecycle exits 143 on SIGTERM.

## Relay support for ChatGPT's September 2026 page — 2026-09-26

Requirement: `docs/requirements/2026-09-26-mission-control-relay-chatgpt-september-page.owner-requirement.json`
(IMPLEMENTED_NOT_LIVE_VERIFIED).

- Cause of the SECONDARY outage (no provider send since 2026-09-24T19:48:57Z):
  automatic system updates on 2026-09-25 at 06:18 UTC restarted the relay's
  browser, which closed its ChatGPT tab. The relay opened a replacement window
  (the central WINDOW_REPLACE transition stayed OPEN). The new tab is signed in,
  but ChatGPT's September 2026 page no longer has `#prompt-textarea`, the
  send/stop test IDs, the old model menu or the plus-menu chips, so readiness
  never passed.
- Live mapping (owner-approved, read-only apart from opening and closing menus):
  the composer is an unlabeled ProseMirror textbox in `form[data-chatgpt-composer]`;
  the model button (`data-codex-intelligence-trigger`) opens a Radix menu with
  model radios (top: "Latest") and a Power slider (`data-reasoning-slider`) whose
  status line reads "<effort>, <n> of 5."; "Add files and more" opens a
  scrollable list (`data-mention-list-scroll-area`) that includes Mission Control
  and GitHub; the page strings name Send/Stop controls and "Remove <app>" pills.
- The relay's page contract was updated with DOM-level tests against the
  recorded structures, cleared seven automated review rounds and was merged to
  `main` as `3d4754f` (UDA #268; 325/325 relay tests).
- Conversation pages would not load in the relay browser's spare tab ("Could
  not load this ChatGPT conversation"), so per-turn markers are unmapped.
- Installed 2026-09-26 (evidence:
  `docs/evidence/2026-09-26-relay-chatgpt-september-page-deploy.json`):
  SECONDARY at 18:12Z with its relay restarted at 18:14:15Z; PRIMARY at 18:23Z,
  still fenced with relay, browser and health timer left inactive as found.
  Both run app tree `b6bb4dc2…`, pass 113/113 focused host tests on Node
  22.23.2, and keep the previous app copy for rollback.
- Verified live on SECONDARY: the relay lock is held by the persistent service,
  the window replacement committed (central transition CLEAR; the commit runs
  only after the installed readiness check finds a visible composer), and the
  read-only doctor reports READY with one automation-owned ChatGPT tab
  (RO-PAGE-2). A read-only probe of the live tab at 18:39Z with the installed
  relay's own page functions found the composer, one closed model button
  (showing "Medium") and the "Add files and more" control, idle and ready.
  A no-choice dry run (18:50–18:53Z) opened the model menu and the app list and
  ran the relay's own decision logic: top model "Latest" is selected, the one
  Power slider reads Medium (status "2 of 5") so the relay would step it to
  Extra High, and scrolling reached exactly one in-view "Mission Control" and
  "GitHub" entry. Everything was closed again, composer empty.
- Not yet verified: a real provider send (RO-PAGE-3). All 13 requests the relay
  can see expired; the newest was queued 2026-09-24T15:50Z, so nothing is
  eligible until a worker queues a new supervision request. Moving the Power
  slider, clicking the GitHub entry, composer insertion and Send are first
  exercised by that request and fail closed on a mismatch.
- Lease (RO-PAGE-4, live-verified): the owner renewed the SECONDARY lease;
  first seen 19:21:45Z. Same identity (epoch 6, SECONDARY,
  SINGLE_ACTIVE_CONFIRMED), expires 2026-10-27T00:00Z; central ACTIVE_LEASE
  and ready.
- Central stall (found 2026-09-26, `centralStall` in the evidence file): the
  central Mission Control daemon blocks for 15–17 s once a minute. Its
  fleet-supervisor tick (default every 60 s) reloads, parses and reprocesses
  the watched worker's whole event history synchronously for each due watch
  (the chain check itself is incremental), and the cost grows with that
  history. Even the daemon's local `/live` stalls; the scheduler status call through the
  tunnel takes 8–18 s at that point of each minute. The secondary's health
  reports time out (10 s) in 2–3 minute runs about every 15 minutes, and a
  live send could fail mid-way the same way (in-band requests then go
  ambiguous).
- Mitigation prepared: a 30 s relay central-call timeout (systemd drop-in,
  non-secret). It is installed on the PRIMARY (relay inactive). On the
  SECONDARY it needs a relay restart that the assistant's execution
  environment refused, so it is owner-run (offered 20:52Z). Root fix: stop
  reprocessing the worker's whole history on every tick, or run the tick off
  the request event loop (Mission Control change plus central redeploy).
- Next: owner decides on the SECONDARY timeout and the central fix; on the
  next queued request, read the relay journal, read-only doctor and central
  ledger until a new submission is recorded or the failing step is identified.

## Journal work runner Codex review round — 2026-09-28

- Parent outcome: **SATISFIED for this review round**. The gap at round start was four Codex findings against reviewed commit `be3d080`; all four findings were confirmed against the scheduler admission, npm stdout, durable restart, and stuck-recovery seams.
- Implemented: journal submissions now use an existing owner-registered `MISSION_CONTROL_ONLY` chat's exact `supervisorId`, `registrationId`, and `task:<workerId>` authorization; the private environment selects that supervisor with `MC_JOURNAL_SUPERVISOR_ID`.
- Implemented: the command runner forces npm's log level to `silent`, and the documented dispatch command uses `npm --silent run`, preserving strict validation of every nonblank dispatch line rather than weakening the parser.
- Implemented: state now durably reserves a monotonically increasing `nextFreshAttempt` before target creation. Legacy state derives its first new value above the persisted provider-call count, so an unanswered pre-upgrade `INITIAL:1` cannot be rebound to a new target after restart.
- Implemented: the CLI records each journal target's registered session identity and routes stuck-generation nudges through a journal-aware recovery context; nudge scheduler-attempt keys keep those sends distinct while retaining the same registered supervisor, task authorization, and provider session.
- Regression evidence: focused journal/scheduler tests passed 68/68 after one test-only assertion correction; the full relay `npm test` gate passed. New regressions cover registered admission fields, real npm preamble suppression, legacy restart identity migration, and journal recovery wiring/identity.
- Bootstrap constraint: live default-branch `AGENTS.md` retrieval was attempted through raw GitHub and the browser fetch surface before task work; the available endpoints returned HTTP 403 and 401. Local root and scoped instructions were loaded instead. This is an access limitation, not a claim that live bootstrap succeeded.
- Verified boundary: relay `npm test`, the 467-test Python suite, and the deterministic repository audit all passed on the completed implementation. The repair was committed and pull-request metadata was prepared; no owner decision or implementation action remains for this round.

## Journal work runner Codex review follow-up — 2026-09-28

- Parent outcome: **SATISFIED for the review of commit `6d3577d`**. All four findings were correct and were repaired at their consumer boundaries.
- The Chrome DevTools verifier now recognizes the documented exact three-label journal calibration (`modelVisibleLabel`, `thinkingControlLabel`, and `thinkingVisibleLabel`) while retaining the stricter current and historical policies for ordinary routes. A DOM-level regression exercises the real verifier rather than only the journal runner's fake browser.
- Stuck recovery assigns every generation wait a monotonically increasing logical-wait sequence, so a later wait starts with a new scheduler key instead of reusing the terminal `nudge:1` item from an earlier wait.
- Journal waits now carry an allowance precheck and a durable provider-boundary callback. The CLI composes that callback with the central scheduler callback before the raw browser send, so recovery nudges increment and persist `today.calls` and cannot cross `dailyAllowance`.
- Journal recovery selects a per-wait content-free log policy that omits `conversationUrl`; ordinary recovery logging retains its existing URL field.
- Regression evidence covers the calibrated control verifier, two independently stalled generation waits, persisted allowance exhaustion caused by a recovery nudge, CLI callback composition, and absence of conversation locators from journal recovery logs.
- Bootstrap constraint: live default-branch `AGENTS.md` retrieval was attempted through raw GitHub and the browser fetch surface before task work; the available endpoints returned HTTP 403 and 401. Local root and scoped instructions were loaded instead. This is an access limitation, not a claim that live bootstrap succeeded.
- Verified boundary: relay `npm test` passed 360/360 tests, the repository Python suite passed 467/467 tests, and the deterministic audit returned `PASS: no findings.` No implementation or verification action remains for this review round.

## Journal work runner Codex review at `bbd9fda` — 2026-09-28

- Parent outcome: **SATISFIED**. All four findings against reviewed commit `bbd9fda` were confirmed as correct; none was rejected.
- The runner now records `GLOBAL_SUBMISSION_COOLDOWN` as resumable timed backoff using the scheduler's `retryAfterMs`, rather than creating a permanent owner action after a fast generation/listing cycle.
- The journal command loads persisted settings before acquiring its process lock and uses those effective `paceMs` and `freshChatThreshold` values both for watchdog sizing and the runner, preventing a persisted longer ladder from outliving an environment-sized lock.
- The runner rolls its UTC allowance day after pacing and at every provider-boundary allowance assertion. A scheduler replay now invokes that assertion immediately before each click, so an internal rate-limit retry cannot exceed the daily allowance.
- Verified evidence: focused journal-runner and lock/config tests passed 56/56; the full relay suite passed 368/368; the repository Python suite passed 467/467; and the deterministic audit returned `PASS: no findings.` New regressions cover cooldown between ladder rungs, exact cooldown duration, midnight-crossing pacing, persisted lock inputs, and a scheduler replay at the final allowed provider call.
- Bootstrap constraint: live default-branch root `AGENTS.md` retrieval was attempted before task reasoning; raw GitHub returned HTTP 403. Local root and scoped instructions were loaded instead. This is an access limitation, not a claim that live bootstrap succeeded.
- Delivery boundary: the completed repair is committed on the current review branch and pull-request metadata was updated after all required gates passed. No implementation, verification, or owner action remains for this review round.
