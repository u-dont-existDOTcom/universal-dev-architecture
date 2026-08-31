# Fresh Pro meta-review packet — Mission Control attention/correction UX

**Shared scope key:** `supervision-architecture/pr42-owner-outcome-dual-alignment`

**Feedback ID:** `SDF-20260830-DASHBOARD-ACTIONABILITY-001`

**Architecture authority:**
`u-dont-existDOTcom/universal-dev-architecture@e76dc37d7116bfe865f2fbef52299f7d05e1e86d`

**Local adoption boundary:** `73962d6546dd0ba585f2fa356226e6db2782f7ea`

**Deterministic fixture commit:** `06c2ffb`

**Attention/correction addendum SHA-256:**
`187fd414a4540fd8f8a39bacd5ef85196bf7706acc86bc0934782d98759b1251`

**Feedback packet SHA-256:**
`c875ceb66c42f32c11e70bf3bd4ebc947c3265fefe9f5393362994b0533b4bd9`

**Deterministic UX fixture SHA-256:**
`64fcfcdef451809574fe2f243114b03acb931e1bc55ac46502b226ba5382e3b3`

**Chat lifecycle:** this is turn 1 in a fresh Pro chat. Use at most 2–3
substantive turns, then hand off the exact authority capsule and verdict/delta
to a fresh chat. Do not ask for GitHub access; this packet is self-contained.

## Owner correction

The current score-first `RED · 21% aligned` presentation is rejected. The
default route must be an all-worker attention queue. Every RED/YELLOW worker
must immediately show:

- the exact problem and why it matters;
- evidence-backed reasons;
- the bounded corrective directive;
- whether it was issued, delivered, acknowledged, started, evidenced, and
  verified;
- the next review/evidence trigger;
- exact owner-action semantics;
- whether unaffected work can continue safely.

Numeric alignment remains secondary diagnostic metadata. A `REDIRECT` verdict
does not prove the directive was delivered, acknowledged, started, evidenced,
or verified.

## Proposed durable model

Material findings are append-only records with type, severity, plain-language
statement, violated owner requirement/contract/rule, evidence references,
status, and required response. Redundant detector signals may be grouped into
one operator explanation while raw findings remain auditable.

Each correction is an append-only lifecycle keyed by `finding_id`,
`directive_id`, `task_id`, and `worker_run_id`:

```text
FINDING_DETECTED
DIRECTIVE_PREPARED
REDIRECT_ISSUED
REDIRECT_DELIVERED
REDIRECT_ACKNOWLEDGED
CORRECTION_STARTED
CORRECTION_EVIDENCE_SUBMITTED
CORRECTION_VERIFIED
REDIRECT_RESOLVED
CORRECTION_BLOCKED
CORRECTION_FAILED
```

Projection rules are fail-closed:

1. Do not infer delivery from a verdict or issuance.
2. Do not infer acknowledgement from a generic heartbeat; it must bind the
   directive ID.
3. Do not infer correction start from acknowledgement.
4. Do not verify until all required evidence is current and exact-candidate
   bound.
5. `CORRECTION_VERIFIED` and `REDIRECT_RESOLVED` remain distinct.
6. No issued directive projects `NO CORRECTION ISSUED`.
7. A contract-to-owner divergence routes to contract repair, not a behavioral
   worker redirect, when the worker faithfully follows the wrong contract.
8. Owner action is one of `NONE`, `DECISION_REQUIRED`,
   `MANUAL_INTERVENTION_REQUIRED`, or `VERIFY_RESULT`, with exact text.

## Frozen Test cleanup fixture

```text
Task: remove flaky test setup without changing production logic
Allowed: tests/**, test-support/**
Forbidden: src/core/**, src/production/**
Worker current step: rewriting the production scheduler for test timing
Worker next step: update production callers
Plan changed: true; reason absent
Invalid assumption: production timing semantics may change

Worker -> Contract: RED
Contract -> Owner: MATCH
Overall: RED
Operator verdict: REDIRECT
Diagnostic index: 21/100 (secondary only)

Problem: Worker is changing the forbidden production scheduler and callers to
solve a test-only task.

Directive: Stop and revert production scheduler and caller changes; return to
tests/** or test-support/**; rerun the focused test command.

Lifecycle: REDIRECT_DELIVERED
Label: REDIRECT DELIVERED — AWAITING ACKNOWLEDGEMENT
Issued: 2026-08-30T19:51:00.000Z
Delivered: 2026-08-30T19:52:00.000Z
Acknowledged/started/evidenced/verified: null

Required evidence:
- revert commit or clean diff
- no forbidden production paths changed
- focused tests pass

Next review: after revert evidence and focused tests
Owner action: NONE
Safe for this worker to continue current path: false
```

The four-worker default fixture has one REDIRECT, one WATCH, two ON TRACK, and
zero owner decisions. Priority order is Test cleanup, Billing/webhooks, Auth,
UI. The Test cleanup problem, directive, pending lifecycle, and owner action
must all be in the top viewport. Billing is YELLOW with a material finding but
no directive and must display `NO CORRECTION ISSUED`.

## Additional hostile fixtures

- Delivered/unacknowledged remains pending.
- Acknowledged/no evidence remains unresolved.
- Evidence submitted/unverified remains pending.
- Verified remains distinct from resolved.
- Worker→Contract GREEN plus Contract→Owner DIVERGED shows contract repair,
  preserves supporting work, keeps the root open, and does not blame worker
  behavior.
- AskRigor operational PASS plus scientific FAIL names the unsupported
  inference and blocks release.
- AskRigor scientific PASS plus release FAIL names the publication barrier and
  remediation.
- No RED/YELLOW top viewport may show a numeric index without a visible direct
  problem and correction status.

## Pro questions

Return one structured verdict using:

```text
ACCEPT
ACCEPT_WITH_REVISION
REJECT
NEEDS_EVIDENCE
OWNER_DECISION_REQUIRED
PROJECT_LOCAL_ONLY
```

Then answer:

1. Is the explanation-first attention queue plus durable finding/correction
   lifecycle sufficient to allocate owner attention without falsely claiming
   correction is underway?
2. Are the lifecycle states and fail-closed transitions complete enough? Name
   any missing state, identity binding, freshness rule, or invalid inference.
3. Are the owner-action enum and independent-work flag sufficient, or can they
   still hide a required decision/manual intervention?
4. Does the contract-repair branch correctly avoid redirecting a worker that is
   GREEN against a laundered contract?
5. What minimum reason codes and evidence bindings must be visible in the
   projection for Test cleanup and AskRigor?
6. Identify any loophole that could still show `correction in progress`,
   `verified`, `resolved`, or owner action `NONE` without adequate durable
   evidence.

This review is schema-blocking only for lifecycle/owner-action public enum
claims. Routine UI implementation continues automatically.
