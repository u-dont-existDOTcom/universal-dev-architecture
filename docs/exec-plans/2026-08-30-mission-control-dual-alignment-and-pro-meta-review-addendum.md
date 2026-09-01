# Mission Control — Dual Alignment and Pro Meta-Review Addendum

**Status:** Required addition to the Mission Control gap audit and pilot  
**Date:** 2026-08-30  
**Authority:** Current owner instruction and `patterns/supervision-assurance-planes-and-pro-meta-review.md`

## 1. Objective

Extend the one-worker Mission Control pilot so that it proves, mechanically rather than only through prompts:

- worker-to-contract alignment and contract-to-owner alignment are independent states;
- owner-source identity is immutable/versioned and independently delivered to the supervisor;
- every material owner requirement appears in a reconciliation matrix;
- completion claims are typed and cannot be silently upgraded;
- reconciliation reruns at material transitions;
- AskRigor/research work separates operational, scientific, and release adequacy;
- substantive supervision-design questions or improvements reach a shared Pro meta-review chat;
- a worker can continue unrelated safe work while a nonblocking design item awaits review.

This addendum does not authorize broad Mission Control productionization.

---

## 2. Required schemas

Adopt and validate:

- `templates/OBJECTIVE-RECONCILIATION.json`
- `templates/SUPERVISION-DESIGN-FEEDBACK.json`
- `templates/RESEARCH-SUPERVISION-VERDICT.json`

The implementation may use equivalent internal names only when lossless import/export against these contracts is demonstrated.

---

## 3. Independent owner-source path

The pilot must prove two separate inputs:

```text
worker interpretation / task contract
independently acquired owner source / corrections
```

Required receipt fields:

```text
owner_request_id
canonical locator or immutable source block
source SHA-256
capture time
collector identity
worker-copy SHA-256
comparison result
limitations
```

The worker is not allowed to generate the only copy the supervisor sees.

A Pro packet must contain the exact independently acquired owner source or bounded exact excerpts plus the receipt. Pro must not be asked to fetch GitHub.

---

## 4. Alignment-state implementation

Persist and display:

```text
worker_to_contract_alignment: GREEN | YELLOW | RED | UNKNOWN
contract_to_owner_alignment: MATCH | PARTIAL | DIVERGED | SOURCE_MISSING
```

Hard projection requirements:

- GREEN + DIVERGED -> overall RED.
- GREEN + SOURCE_MISSING -> root completion HOLD/UNKNOWN.
- GREEN + PARTIAL + root terminalization proposed -> overall RED.
- No numerical average may override these outcomes.

The dashboard must show both states at once.

---

## 5. Objective-reconciliation matrix

At minimum each row stores:

```text
owner requirement ID and exact text
worker interpretation
task criterion IDs
acceptance evidence IDs/status
mapping status
authorized owner-change reference
```

Allowed mapping states:

```text
MAPPED_DIRECT
MAPPED_CONTRIBUTING
MAPPED_VERIFYING
UNMAPPED
WEAKENED
PROXY_SUBSTITUTED
OWNER_REMOVED
OWNER_AMENDED
AMBIGUOUS
```

The pilot must fail contract validity on any material unauthorized `UNMAPPED`, `WEAKENED`, or `PROXY_SUBSTITUTED` row.

---

## 6. Typed completion claims

Implement:

```text
WORKING
ARTIFACT_READY
TESTS_PASS
READY_FOR_OWNER_REVIEW
READY_FOR_RELEASE
PARTIAL_OUTCOME
SUBTASK_COMPLETE_PARENT_OPEN
OWNER_OUTCOME_ACHIEVED
BLOCKED_OWNER_DECISION
CANCELED_BY_OWNER
```

Only `OWNER_OUTCOME_ACHIEVED` or `CANCELED_BY_OWNER` may close a root outcome.

A string-label translation test must prove that renaming `READY_FOR_OWNER_REVIEW` to `DONE` does not upgrade the semantic type.

---

## 7. Recurring reconciliation triggers

Emit a reconciliation event after:

- material discovery;
- phase transition;
- acceptance-criteria or acceptance-test change;
- owner correction;
- owner-review readiness;
- release/deployment/publication preparation;
- root completion proposal;
- supervision-architecture change affecting task semantics;
- detected contract-laundering risk.

The pilot must show the prior receipt remains historical and the new result becomes current without rewriting history.

---

## 8. AskRigor/research verdict planes

For a synthetic or low-risk AskRigor-style fixture, record separately:

```text
operational_alignment
scientific_adequacy
release_adequacy
```

Required hostile cases:

1. Operational PASS + scientific FAIL -> release denied.
2. Scientific PASS + release FAIL -> publication denied.
3. Operational PASS + scientific PASS + release PASS + contract-to-owner MATCH -> eligible for release subject to all other gates.

Release adequacy must include privacy, consent, licensing, freshness, provenance, security, and product-rule fields.

---

## 9. Shared Pro supervisor-design meta-review

Implement a shared queue keyed by:

```text
supervision-architecture/<epoch>
```

When a worker reports a substantive design improvement or question:

1. Create a `SUPERVISION_DESIGN_FEEDBACK` record.
2. Collect the relevant architecture excerpts and evidence through deterministic tooling or Extra High.
3. Produce a self-contained Pro packet.
4. Submit to the shared Pro meta-review chat.
5. Import and validate one of:
   - `ACCEPT`
   - `ACCEPT_WITH_REVISION`
   - `REJECT`
   - `NEEDS_EVIDENCE`
   - `OWNER_DECISION_REQUIRED`
   - `PROJECT_LOCAL_ONLY`
6. Preserve repository/test effects separately from the Pro verdict.

The Pro chat cannot mutate architecture directly.

Immediate routing is required for false-completion authorization, owner-outcome loss, therapy/research safety, privacy/security/consent risk, or a current blocking contradiction. Nonblocking improvements may be batched.

A worker with no substantive feedback must not create a ceremonial Pro call.

---

## 10. Mandatory fixtures

Add or update fixtures proving:

1. Worker-to-contract GREEN + contract-to-owner RED.
2. Independent owner source missing while worker handoff is complete.
3. Owner source and worker copy mismatch.
4. Material requirement omitted from the contract.
5. Tests pass while user-visible outcome is absent.
6. `READY_FOR_OWNER_REVIEW` cannot close root outcome.
7. `13.82% Human` article scenario explicitly reports worker GREEN, contract DIVERGED, overall RED.
8. AskRigor operational/scientific/release judgments diverge.
9. Nonblocking supervision-design feedback continues task work while awaiting Pro.
10. Blocking design flaw routes immediately to Pro and holds only the affected boundary.
11. Accepted Pro design recommendation does not take effect until repository change and tests exist.
12. Owner correction creates a new source epoch and reconciliation record without rewriting prior receipts.

---

## 11. Dashboard requirements

Task card or detail view must show:

```text
worker-to-contract state
contract-to-owner state
overall traffic
owner-source receipt freshness
completion claim type
unmapped owner requirements
reconciliation trigger/time
pending supervision-design feedback count
latest Pro meta-review status
operational/scientific/release verdicts when applicable
```

Do not render one ambiguous “alignment percentage” as the primary state.

---

## 12. Current-worker migration

At their next safe checkpoint, existing workers must:

- re-read the current bootstrap;
- create or verify objective reconciliation;
- report both alignment states;
- use typed completion claims;
- separate AskRigor/research verdicts where applicable;
- route substantive supervision-design improvements/questions to shared Pro meta-review;
- continue unrelated safe work automatically.

No worker should start the Mission Control implementation merely because it adopted this addendum.

---

## 13. Completion boundary

This addendum is implemented only when the schemas, events, dashboard projection, exact hostile fixtures, review-import validation, and restart recovery are demonstrated from fresh state.

Documentation or prompt text alone is not completion.
