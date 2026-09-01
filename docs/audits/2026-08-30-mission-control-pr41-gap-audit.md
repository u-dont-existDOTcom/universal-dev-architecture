# Frozen PR #41 → current Mission Control gap audit

**Frozen:** 2026-08-30

**Baseline commit:** `c1bb87879edb773cb6d2db0bd309b13b6098a596`

**Implementation authority inspected:** PR #41 head `7fa261970b0d2f2227126b9883173fafed0474df`

**Architecture authority applied:** PR #42 head `90a230e85f78063080dc627ec36a0237c3234f72`

**Owner-source receipt:** `mc-owner-source-20260830-e3`, SHA-256 `9b214d2ff5dc5d277e28e77972f79c398d35e98313b2c8e6bd73aea48df13058`

This audit classifies the restored implementation, not the claims in its prior contract. `KEEP` means the actual implementation can remain materially intact. `ADAPT` means preserve useful behavior while replacing its authority or data model. `REPLACE_WITH_SYMPHONY` means stock Symphony owns the capability. `DELETE_AS_DUPLICATE` means remove a conflicting local implementation. `DEFER` means retain only a typed seam/state in this slice. `UNKNOWN` means evidence is insufficient.

## Capability disposition

| Capability | Disposition | Frozen evidence and required change |
|---|---|---|
| Intervention-first dashboard shell, worker cards, worker detail route | KEEP | Real Next.js UI renders at desktop/mobile and provides useful fleet/detail hierarchy. Preserve incumbent identity, routes, and component ownership. |
| Dark control-room visual system and status colors | KEEP | Clear within-product identity. Extend tokens and non-color labels; do not redesign the visual world. |
| Immutable `ObjectiveContract` as root authority | ADAPT | A worker-local goal is write-once, but it is not independently sourced and corrections require a new worker ID. Introduce append-only owner request/outcome epochs, independent source receipts, derived contract revisions, and reconciliation. |
| Old lone `alignment: number` | ADAPT | It is a supervisor-supplied percentage and the UI presents it as controlling objective alignment. Demote legacy values to a noncontrolling historical/rubric diagnostic; never map them into either new plane. |
| Worker → Contract alignment | ADAPT | Derive a categorical plane from contract-scoped deterministic evidence and current semantic review. Preserve GREEN even when the separate contract plane diverges. |
| Contract → Owner alignment | ADAPT | Add `MATCH | PARTIAL | DIVERGED | SOURCE_MISSING` from an independently sourced owner outcome and reconciliation matrix. Never average it with worker alignment. |
| Overall traffic projection | ADAPT | Add deterministic precedence. `GREEN + DIVERGED` projects RED; missing source/reconciliation cannot authorize root completion. |
| Old `ON_TRACK | WATCH | REDIRECT` supervisor verdict | ADAPT | Retain as historical/contract-scoped review evidence only. Bind current reviews to task, contract hash, owner epoch/hash, reconciliation, exact candidate, packet, and evidence receipts. It cannot override deterministic gates. |
| Worker heartbeat schema | ADAPT | Keep progress/runtime evidence, but add stable event identity/version and typed completion; separate worker claims from independently collected evidence and owner receipts. |
| Typed completion claim | ADAPT | Add the canonical exact enum. A `task_completed` label is currently terminal by event presence and must not translate `READY_FOR_OWNER_REVIEW` into outcome achievement. |
| Owner-source receipt | ADAPT | Absent. Add owner request ID/hash, receipt ID, locator, collector, comparison, epoch, corrections, limitations, and fail-closed source state. |
| Objective reconciliation matrix | ADAPT | Absent. Add exact requirement text, worker interpretation, criterion IDs, acceptance evidence, mapping status, authorized change ref, freshness, and history. |
| Contract-laundering comparator | ADAPT | Absent. Add separate contract validity, owner-outcome status, terminal comparator, root permission, required directive, and findings. |
| Unmapped owner requirements / authorized scope changes / divergence | ADAPT | Absent as machine-visible state. Add first-class fields and event-backed history. |
| Evidence receipts and freshness | ADAPT | Current tests/files are worker claims. Add candidate-bound independent receipts plus `CURRENT | STALE | MISSING` reconciliation/evidence projections. |
| AskRigor operational/scientific/release judgments | ADAPT | Absent. Add optional independent planes and explicit `release_permission`; no generic approval or average. |
| Stable event IDs and retry idempotency | ADAPT | Claimed in PR docs but absent from source/SQLite. Add client `event_id`, canonical-payload comparison, identical retry acceptance, and conflicting retry rejection. |
| Append-only event ledger | ADAPT | Application code normally inserts, but rows have no hash chain/version and SQLite does not prevent update/delete. Add event version, previous/event hashes, sequence validation, and database triggers rejecting update/delete. |
| Historical event readability | ADAPT | Current decoder validates every row against the latest Zod union. Preserve legacy v1 bytes and decode explicitly without silently supplying modern semantics. |
| SQLite write ownership/process boundary | ADAPT | Next.js owns a singleton writer today. Move durable ingestion/projection to a separate Mission Control daemon boundary; the UI consumes read-only snapshots/streams. |
| SSE invalidation | KEEP | The invalidation/refetch concept is sound. Keep SSE payloads non-authoritative and source them from the daemon/projection boundary. |
| SSE polling inside the Next.js route | DELETE_AS_DUPLICATE | A route-local 750 ms SQLite poller couples process lifetime and persistence. Replace with daemon-owned change notification or read-only adapter stream. |
| Review cursor | ADAPT | Current mutable `review_state` advances in place. Represent review advancement as an append-only event/projection so history and replay are reconstructible. |
| Drift scoring | ADAPT | Keep configurable contract-scope warning evidence, but do not treat a score as owner alignment, completion, or confidence. Immediate hard vetoes remain categorical. |
| Worker claims versus independent evidence | ADAPT | Current projection trusts reported tests/files/diff. Store claims separately and link independent deterministic receipts; show their provenance/freshness. |
| Card information order | ADAPT | Replace single alignment with title/state, owner outcome/current gap, both planes, overall state, typed claim, freshness, top divergence, route/trigger, and optional research planes. |
| Worker-detail information architecture | ADAPT | Replace “immutable baseline” root framing with owner source/outcome, derived contract, reconciliation, claims/evidence, comparator, and history while preserving the evidence/timeline route. |
| Mobile worker-detail timeline | ADAPT | At 390 px its date/type/summary columns overlap. Stack timeline metadata/content at the narrow breakpoint and verify long text. |
| Supervisor chat links | ADAPT | Keep logical lane links/metadata, add scope/epoch/turn count/context health/rollover state, and cap each Pro or Extra High chat at 2–3 substantive turns before deterministic handoff. |
| Pro web interaction and account switching | DEFER | Store route/reason/next-trigger and private alias references only. No browser automation/account switching in this slice. |
| Consequential redirects, stops, retries, resume, dispatch | REPLACE_WITH_SYMPHONY | Stock Symphony owns execution control. Mission Control remains read-only toward workers. |
| Tracker polling, eligibility, workspaces, App Server, concurrency/backoff | REPLACE_WITH_SYMPHONY | Do not implement or fork these capabilities. |
| Current PR #41 archive packaging | ADAPT | The two committed base64 parts are truncated. Regenerate a complete, verified archive after the adapted source is green and keep the baseline failure receipt. |
| Authentication/remote deployment | DEFER | Local-only server remains the slice boundary. Remote exposure would require a separate auth/security decision. |

## Current design diagnosis

The primary owner job is to identify which worker needs attention **without accepting a narrowed contract as success**. The surface mode is **Operate**. This is a refinement, not a redesign.

| Layer | Current evidence | Violation/risk | Adaptation requirement | Verification |
|---|---|---|---|---|
| L0 cognitive load | Cards expose one large alignment percentage and a supervisor verdict. | The easiest signal can be green while the contract is laundered. | Put both categorical planes and overall traffic before diagnostic scores; show one current gap/divergence. | The `13.82% Human` fixture is Worker→Contract GREEN, Contract→Owner DIVERGED, Overall RED without reading detail. |
| L1 first impression | Intervention banner, dark control-room identity, and color coding communicate live operations quickly. | “Objective alignment” falsely implies root authority. | Preserve identity and intervention hierarchy; rename/split the controlling signals. | First viewport shows both planes and root-open directive for the hostile fixture. |
| L2 processing fluency | Desktop cards and panels scan well; mobile cards stack. | Dense new fields could become label noise; the mobile detail timeline overlaps. | Group source/outcome, dual alignment, completion/freshness, and route as distinct regions; fix narrow timeline layout. | Browser checks at 390 and 1440 px, visible focus, non-color labels, long-token resilience. |
| L3 perception/evidence | Reported tests/files look authoritative. | Worker claims and independent receipts are visually collapsed. | Label provenance and freshness; never fabricate or imply independent verification. | Hostile tests prove stale/missing evidence cannot authorize root completion. |
| L4 decision architecture | Detail route exposes evidence and a Pro-chat action. | No trail from owner source through contract to terminal comparator; Pro can appear overriding. | Show owner-source receipt, reconciliation, comparator, preserved supporting work, and next review trigger. Keep worker control absent. | Root terminalization remains false under missing source, divergence, stale reconciliation, or nonterminal claim. |

## Frozen adaptation invariants

1. Append-only events remain authority and projections remain rebuildable.
2. Legacy events remain readable but never gain invented modern semantics.
3. Worker and contract alignment remain separate categorical planes.
4. `GREEN + DIVERGED` is Worker→Contract GREEN and Overall RED.
5. Exactly one typed completion claim exists; labels cannot upgrade it.
6. Missing owner source, unmapped material requirements, stale reconciliation, or candidate mismatch fails closed for root completion/release.
7. Supervisor approval cannot override source, reconciliation, divergence, evidence, or terminal comparator failures.
8. Contract repair preserves valid supporting work/evidence.
9. AskRigor planes remain separate and publication permission is explicit.
10. Mission Control observes stock Symphony and never dispatches, retries, stops, resumes, closes, or reconciles a worker.
11. Chat lifecycle is explicit: 2–3 substantive turns maximum per Pro/Extra High chat, followed by an exact capsule handoff; earlier rollover remains allowed.

## Required hostile proof

The checked-in `13.82% Human` fixture must project and render:

```text
Worker → Contract: GREEN
Contract → Owner: DIVERGED
Completion claim: READY_FOR_OWNER_REVIEW
Overall: RED
Directive: CONTINUE_HUMANIZATION
Root remains open
Supporting work preserved
```

with `SCOPE_CONTRACTION`, `OBJECTIVE_SUBSTITUTION`, `PROXY_SUBSTITUTION`, and `COMPLETION_ILLUSION` findings.

## Shared Pro meta-review boundary

The Extra High checkpoint found four architecture questions that must not be silently resolved in implementation:

1. whether “no GREEN for invalid contract” prohibits only overall/root GREEN or also the intentionally independent Worker→Contract GREEN plane;
2. whether `HOLD` is an overall traffic enum, a directive, or a separate gate state when source is missing;
3. whether reconciliation schema v2 embeds the complete owner outcome or references a separately hashed owner-outcome record;
4. the exhaustive terminal-comparator decision and reason-code vocabulary.

Structured packets are stored under `state/mission-control-dashboard-adaptation/supervision-design-feedback/`. They are nonblocking for source recovery, legacy preservation, UI adaptation, tests, and the read-only Symphony seam, but block inventing a supposedly canonical public schema for the unresolved enum/vocabulary choices.
