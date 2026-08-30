# Shared Pro supervisor-design packet

**Scope key:** `supervision-architecture/2026-08-30-pr42`

**Packet ID:** `mc-pro-design-packet-20260830-gap-audit-r1`

**Architecture identity:** `u-dont-existDOTcom/universal-dev-architecture@90a230e85f78063080dc627ec36a0237c3234f72`

**Owner outcome epoch/hash:** `mission-control-dashboard-adaptation@3` / `9b214d2ff5dc5d277e28e77972f79c398d35e98313b2c8e6bd73aea48df13058`

**Objective reconciliation:** `mc-recon-20260830-gap-audit-r1`

**Chat lifecycle constraint:** use this shared Pro chat for at most 2–3 substantive turns, then hand off this exact capsule plus the verdict/delta to a fresh chat. Roll over earlier if context pressure, contamination, authority change, or independence requires it.

## Verbatim owner source

> Your assigned task is now the Mission Control dashboard adaptation slice. Read fresh from u-dont-existDOTcom/universal-dev-architecture, branch architecture/codex-pro-supervision-mission-control-20260830, path docs/exec-plans/2026-08-30-mission-control-dashboard-adaptation-slice.md. Follow the current shared supervision bootstrap and all referenced Mission Control patterns. Reuse PR #41 rather than rebuilding the dashboard. First restore/run it and freeze the gap audit; then continue through the slice automatically. Use Extra High for reasoning/review checkpoints and the shared Pro supervisor-design lane for substantive supervision-design questions or improvements.

Current correction:

> correction, i think the chat tabs should have max 2-3 turns before handoff because longer running chats are slowing down the browser too much

## Normalized owner outcome and current gap

Restore and adapt the existing PR #41 dashboard into the current owner-source, dual-alignment, typed-completion architecture without recreating stock Symphony orchestration. The baseline and gap audit are frozen. Remaining work is the data model/ledger migration, UI adaptation, deterministic regressions, a read-only Symphony seam, archive repair, and final evidence. The overall multi-worker Mission Control owner outcome remains open.

Current states:

```text
worker_to_contract_alignment: GREEN
contract_to_owner_alignment: MATCH
completion_claim: WORKING
overall_traffic: YELLOW
root_terminalization_allowed: false
required_directive: CONTINUE_ADAPTATION_SLICE
```

Non-satisfying proxies include: app runs, tests pass, audit frozen, `READY_FOR_OWNER_REVIEW`, and supervisor approval.

## Independently observed baseline

- PR #41's committed base64 archive is truncated and fails its own SHA/unzip checks.
- The original valid Codex Work output was recovered; all source files tracked by its surviving commit are byte-identical.
- The real Next.js app installs, passes 5/5 tests, typechecks, builds, serves, and renders at 1440/390 px.
- The implementation does **not** contain the stable event IDs, idempotency, hash chain, append-only enforcement, mission identity, schema versioning, 17-test suite, or separate writer process claimed in its prior contract.
- It stores a write-once worker goal as authority, displays one supervisor alignment percentage, trusts worker-reported evidence, and treats `task_completed` presence as done.
- Next.js writes SQLite directly and an SSE route polls it every 750 ms.
- The 390 px worker timeline overlaps.

## Proposed adaptation

1. Preserve the incumbent routes, visual identity, intervention-first hierarchy, event-fold concept, SSE invalidation role, and worker/detail split.
2. Introduce versioned append-only records for owner source receipt, owner outcome epoch, derived task contract revision/hash, objective reconciliation, worker claims, independent evidence receipts, semantic reviews, typed completion claims, supervision-design feedback, and optional AskRigor verdicts.
3. Add stable event IDs, canonical-payload idempotency, previous/event hashes, sequence validation, and SQLite update/delete rejection triggers. Decode legacy v1 events explicitly and project their new fields conservatively as unknown/missing.
4. Project independent planes:

```text
worker_to_contract: GREEN | YELLOW | RED | UNKNOWN
contract_to_owner: MATCH | PARTIAL | DIVERGED | SOURCE_MISSING
overall_traffic: GREEN | YELLOW | RED | UNKNOWN
```

5. Keep `HOLD` out of traffic and represent it as `required_directive` plus `root_terminalization_allowed=false`. `SOURCE_MISSING` is Overall UNKNOWN unless another hard RED rule applies.
6. Preserve Worker→Contract GREEN under Contract→Owner DIVERGED; deterministically project Overall RED and forbid root terminalization.
7. Use a separately hashed append-only owner-outcome record. Reconciliations bind the exact owner-outcome ID/epoch/hash and project current gap/unmet/unknown/proxy fields.
8. Keep terminal axes separate: contract status, owner-outcome status, terminal decision, root permission, required directive, and versioned reason codes. Never upgrade by label translation.
9. Add explicit session route, trigger, substantive turn count, max turns (3), context state, handoff capsule ID, and rollover-required projection for Pro and Extra High lanes.
10. Place durable writing/projection behind a Mission Control daemon boundary. Next.js reads snapshots/SSE only.
11. Add a pure read-only stock-Symphony normalizer. Mission Control never dispatches, retries, stops, resumes, closes, reconciles, polls Linear eligibility, owns workspaces, launches App Server, or implements concurrency/backoff.

## Required hostile projection

The exact `13.82% Human` fixture must retain:

```text
Worker → Contract: GREEN
Contract → Owner: DIVERGED
Completion claim: READY_FOR_OWNER_REVIEW
Overall: RED
Directive: CONTINUE_HUMANIZATION
Root remains open
Supporting work preserved
Findings: SCOPE_CONTRACTION, OBJECTIVE_SUBSTITUTION,
          PROXY_SUBSTITUTION, COMPLETION_ILLUSION
```

## Questions for Pro

Return one structured verdict for the proposal and one answer per question. Do not fetch GitHub; this packet is the authority capsule.

1. Does the proposal preserve independently acquired owner-source receipt, true dual alignment, typed completion, fail-closed terminalization, preserved supporting work after contract repair, and strict separation from Symphony execution ownership? Identify any loophole that could still authorize false root completion.
2. Confirm or reject this interpretation: the blanket prohibition on GREEN for an invalid contract applies to overall/root GREEN and supervisory completion approval, not the independent Worker→Contract plane.
3. Confirm or reject this state model: traffic remains `GREEN | YELLOW | RED | UNKNOWN`; `HOLD` is a workflow directive/gate, not a traffic value.
4. Confirm or reject the separately hashed owner-outcome record referenced by reconciliation, rather than embedding authoritative owner bytes in every reconciliation.
5. Recommend canonical separate terminal-comparator axes and minimum reason codes, or explain why a different structure is safer.
6. Does the explicit 2–3 substantive-turn handoff rule introduce any supervision integrity risk beyond the need for exact authority capsules and append-only continuity?

Allowed Pro verdicts:

```text
ACCEPT
ACCEPT_WITH_REVISION
REJECT
NEEDS_EVIDENCE
OWNER_DECISION_REQUIRED
PROJECT_LOCAL_ONLY
```

The review is schema-blocking only for public canonical enum/vocabulary claims. Unaffected implementation work continues while the packet is pending.
