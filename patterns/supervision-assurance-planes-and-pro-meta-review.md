# Supervision Assurance Planes and Pro Meta-Review

**Status:** Required owner correction and companion to the Mission Control architecture  
**Date:** 2026-08-30  
**Authority:** Current owner instruction plus the AskRigor contract-integrity critique recorded at `reviews/2026-08-30-contract-integrity-review.md`

## 1. Normative correction

Mission Control must never collapse these two questions into one alignment score:

1. **Worker-to-contract alignment:** Is the worker faithfully executing the active task contract?
2. **Contract-to-owner alignment:** Does that task contract still faithfully represent the owner’s actual requested outcome?

A worker can be highly competent and fully aligned with a defective or narrowed contract. The system must therefore support this state without contradiction:

```text
worker_to_contract: GREEN
contract_to_owner: RED
root_task_traffic: RED
```

`contract_to_owner` is a hard upstream gate. A GREEN worker-to-contract result cannot make the root task GREEN when the contract is missing, weakened, divergent, or based on a non-satisfying proxy.

This pattern also establishes a shared **Pro supervisor-design meta-review lane**. When a Codex worker discovers a substantive weakness, ambiguity, contradiction, improvement, or question about the supervision architecture, it must not silently reinterpret or rewrite the architecture. It records a structured design-feedback packet and routes that packet to a dedicated Pro chat for supervisor-design review.

The dedicated meta-review lane is shared across workers. It is not one additional Pro chat per worker.

---

## 2. Required independent assurance planes

### 2.1 Worker-to-contract alignment

Machine state:

```text
GREEN
YELLOW
RED
UNKNOWN
```

This plane evaluates:

- adherence to the active task contract;
- scope discipline relative to that contract;
- execution of the assigned lane;
- checkpoint and evidence freshness;
- method and verification compliance;
- whether the worker is doing what the packet says.

It does **not** establish that the packet itself is faithful to the owner.

### 2.2 Contract-to-owner alignment

Machine state:

```text
MATCH
PARTIAL
DIVERGED
SOURCE_MISSING
```

Operational traffic projection:

```text
MATCH          -> eligible for GREEN, subject to other gates
PARTIAL        -> YELLOW or RED according to materiality; root terminalization forbidden
DIVERGED       -> RED
SOURCE_MISSING -> HOLD / UNKNOWN; root terminalization forbidden
```

This plane evaluates:

- owner-source identity and freshness;
- whether every owner requirement is mapped;
- whether modality, thresholds, target artifacts, and evidence classes were preserved;
- whether an owner-authorized change exists for every removed or altered requirement;
- whether the contract replaced an outcome with a proxy;
- whether a downstream subtask is being mistaken for the root outcome;
- whether a proposed terminal state is semantically valid.

### 2.3 Overall task projection

The overall state is constrained by both planes:

```text
if contract_to_owner == DIVERGED:
  overall = RED

if contract_to_owner == SOURCE_MISSING:
  overall = HOLD_OR_UNKNOWN

if contract_to_owner == PARTIAL and root_terminalization_proposed:
  overall = RED

if worker_to_contract == RED:
  overall = RED

if worker_to_contract == GREEN and contract_to_owner == MATCH:
  overall may be GREEN only if verification, evidence freshness,
  owner-decision, risk, and terminal-state gates also pass
```

Do not average the two states into a score that can hide a hard contract-integrity failure.

---

## 3. Immutable owner-source identity

Every supervised nontrivial root task must bind the owner source independently of the worker’s interpretation.

Required fields:

```text
owner_request_id
canonical_locator or immutable source block
owner_request_sha256
captured_at
captured_by
owner_corrections[]
```

Each correction is append-only and has its own:

```text
correction_id
canonical_locator or immutable source block
sha256
captured_at
effective_epoch
supersedes / amends relation
```

A summary, task handoff, normalized outcome, worker interpretation, or supervisor packet may annotate the owner source. None may replace it.

If the source is a conversation message whose durable external locator is unavailable, preserve an immutable exact-text source block, capture metadata, and hash. Mark any limitations honestly.

---

## 4. Independent supervisor receipt

The supervisor must not receive the owner source solely through the worker’s polished handoff.

Mission Control, a deterministic collector, or an Extra High evidence reader independently retrieves or constructs the owner-source record and produces:

```json
{
  "receipt_id": "osr_...",
  "owner_request_id": "OR-...",
  "canonical_locator": "...",
  "source_sha256": "...",
  "captured_at": "...",
  "collector": "mission-control | deterministic-tool | extra-high-reader",
  "worker_supplied_copy_sha256": "...",
  "comparison": "MATCH | MISMATCH | WORKER_COPY_ABSENT | SOURCE_UNAVAILABLE",
  "limitations": []
}
```

The Pro packet contains the independently acquired source bytes or bounded exact excerpts plus the receipt. It may also contain the worker’s interpretation, clearly separated.

Fail closed when:

- the independent source receipt is absent;
- the source hash is stale or mismatched;
- only the worker’s paraphrase is available;
- material owner corrections are omitted;
- the owner source is unavailable and the proposed action is root completion, release, publication, deployment, or irreversible mutation.

Useful reversible contributing work may continue under `SOURCE_MISSING` when the missing source does not make that work unsafe, but the root outcome cannot be declared achieved.

---

## 5. Required objective-reconciliation matrix

Before substantive execution and at every recurring reconciliation trigger, construct:

| Owner requirement | Worker interpretation | Task criterion | Acceptance evidence | Status | Authorized change |
|---|---|---|---|---|---|

Each row must contain stable identifiers and machine-readable status.

Required row states:

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

Required rules:

1. Every material owner requirement has a row.
2. `OWNER_REMOVED` or `OWNER_AMENDED` requires an explicit owner-authorized correction reference.
3. `UNMAPPED`, `WEAKENED`, `PROXY_SUBSTITUTED`, or material `AMBIGUOUS` prevents `MATCH`.
4. A child task may mark a requirement `MAPPED_CONTRIBUTING` while the parent remains open.
5. Acceptance evidence must be capable of proving the owner requirement, not merely task activity or review readiness.
6. The matrix is versioned and bound to owner-source and task-contract hashes.

The canonical machine-readable form is `templates/OBJECTIVE-RECONCILIATION.json`.

---

## 6. Typed completion claims

Every worker checkpoint, heartbeat, packet, and dashboard task state must carry exactly one completion-claim type:

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

Rules:

- No earlier state implies `OWNER_OUTCOME_ACHIEVED`.
- `READY_FOR_OWNER_REVIEW` means the owner can inspect or evaluate; it does not close the root task.
- `READY_FOR_RELEASE` means release preparation has reached a reviewable boundary; it does not prove scientific, privacy, licensing, safety, or owner-outcome adequacy.
- `SUBTASK_COMPLETE_PARENT_OPEN` is the only valid terminal claim for a completed bounded child contribution while parent outcomes remain.
- `OWNER_OUTCOME_ACHIEVED` requires current `contract_to_owner: MATCH`, exact-candidate evidence, all terminal-required outcomes `MET`, and all other applicable hard gates.
- A label rename cannot change the semantic type.

---

## 7. Recurring reconciliation

Contract-to-owner reconciliation is not a one-time bootstrap event.

Re-run it:

- before substantive work when no current receipt exists;
- after a material discovery that changes feasibility, method, evidence, or interpretation;
- before every material phase transition;
- after acceptance criteria or acceptance tests change;
- after any owner correction;
- before `READY_FOR_OWNER_REVIEW`;
- before `READY_FOR_RELEASE`;
- before merge, publication, deployment, or migration preparation;
- before any `OWNER_OUTCOME_ACHIEVED` claim;
- after a supervisor-design change that affects task semantics or terminalization;
- when a worker or supervisor identifies possible contract laundering.

Every reconciliation records:

```text
trigger
prior reconciliation ID
owner source/epoch/hash
contract hash
changed rows
current unmapped requirements
current divergences
authorized changes
completion claim
result
```

Prior approvals remain historical. They are invalidated for current authority when a later owner correction, material discovery, or reconciliation failure changes their premise.

### 7.1 Claim-level authority and unauthorized specificity

An authentic owner-source receipt proves the source bytes; it does not authorize
specificity absent from those bytes. Every load-bearing numeric, scientific,
product, release, identity, or supervisory claim must be a versioned
`templates/CLAIM-RECORD.json` instance bound to an immutable subject and claim
digest.

Authority is **scoped and conjunctive**, never ordinal. Do not compare an
authority rank or assume that one apparently stronger role can satisfy a
differently scoped requirement. A claim may simultaneously require artifact
authority to assert a fact, owner authority to promote that fact into a policy,
and a separately admitted reasoning-surface receipt to author a supervisory
verdict. Every `requiredAuthorizations` entry for the requested operation must
be `SATISFIED` by an exact current source with the required issuer class and
scope. The relying party supplies that source through immutable,
digest-validated `templates/AUTHORITY-SOURCE-REGISTRY.json`; the evaluator must
not derive authority from the claim's own `currentAuthorities` array. A
load-bearing `ASSERT_FACT` with no applicable requirement fails closed.

Every immutable authority, transition, reproduction-independence, or browser-
ownership registry is exact-type checked. Its validated factories are the only
public construction API, but factory origin, an underscore helper, or a private
construction token is never treated as trust evidence. Every evaluator and
`resolve` boundary must decode the complete canonical immutable record sequence,
rerun all record and chain semantics without calling `resolve`, recompute the
registry identity/digest/head/order, and compare the rebuilt immutable state
exactly. Public dataclass construction, subclassing, lookalike objects, partial
records, helper-minted instances, or immutable-looking caller state therefore
have no trust weight.

The authority classes are:

```text
OWNER_EXPLICIT
OWNER_CORRECTION
REASONING_DECISION
ARTIFACT_DERIVED_FACT
OBSERVED_PLATFORM_STATE
EXECUTOR_PROPOSAL
```

The authorization operations are:

```text
ASSERT_FACT
PROMOTE_TO_POLICY
AUTHOR_SUPERVISORY_VERDICT
AUTHORIZE_EXECUTION
AUTHORIZE_RELEASE
```

These types are not interchangeable. `ARTIFACT_DERIVED_FACT` may establish
that a production mapping currently contains 23 unique IDs. It cannot select
23 as the scientific completeness gate. A `REASONING_DECISION` can analyze or
recommend that criterion, but it cannot satisfy an `OWNER_EXPLICIT`
requirement. `EXECUTOR_PROPOSAL` may preserve a hypothesis for reasoning
review. It cannot enter an owner-facing definitive statement, task acceptance
criterion, supervisor premise, or release condition.

Required reconciliation failures include:

```text
UNAUTHORIZED_ADDITION
INFERRED_NUMERIC_SCOPE
DERIVATION_UNVERIFIED
```

An executor-added denominator, threshold, sample size, validation phase,
evidence-sufficiency rule, scientific criterion, product decision, or release
condition is `DIRECTIVE_SCOPE_EXCEEDED` unless a current owner source or
versioned reasoning-chat directive explicitly authorizes it. Directives must
enumerate the authorized criteria and load-bearing numeric claim references;
silence grants no authority.

Do not convert a rejected or unsupported inference into a fake owner decision.
Before emitting `OWNER_DECISION_REQUIRED`, a missing-policy blocker, or a menu
of values for the owner, cite the exact current owner-contract source that
establishes that decision surface. If no such source exists, remove the
invented constraint and return `INVENTED_OWNER_DECISION`. Extra High or Pro
repetition cannot create the missing decision surface.

Re-run objective reconciliation automatically whenever any registered
acceptance count, threshold, evidence class, validation phase, scientific
criterion, product decision, or release condition changes. Invalidate prior
reviews whose premises contain the superseded or unauthorized claim.

Require production-artifact cardinality evidence reproduced against the exact
production artifact and identity. A synthetic, fake, or reduced test fixture
may verify a mechanism but cannot satisfy production-cardinality evidence. The
independent reviewer must reproduce every load-bearing cardinality or return
`UNKNOWN`.

Owner-facing definitive rendering fails closed for unregistered load-bearing
claims. If preserving the observation is useful, render it only as
`executor hypothesis—unverified` until the authority and evidence fields pass.

Load-bearing status is determined from the actual use site, not a worker-set
boolean. Any claim referenced by an acceptance criterion, release condition,
owner-facing definitive rendering, execution authorization, or supervisory
verdict is load-bearing even if the producer marked it false.

### 7.2 Append-only claim transitions

A fact cannot become policy through a mutable `claimTransition` flag, field
rename, copied value, contract placement, or reviewer repetition. Use a
separate `templates/CLAIM-TRANSITION.json` ledger with immutable `fromClaimRef`
and `toClaimRef`, canonical digests, `previousTransitionDigest`, and one of:

```text
DERIVED
PROMOTED
REVOKED
SUPERSEDED
```

A `PROMOTED` transition creates a new claim version, identifies a new authority
source that permits the target policy use, satisfies every required
authorization conjunctively, and preserves the artifact-derived fact as a
separate descriptive claim. Corrections append new owner sources and
transitions; they never rewrite an existing exact owner-source block.
The use evaluator accepts promotion only after validating the complete
transition against its from/to claims, canonical digest, external authority
registry, and a separately supplied immutable
`templates/CLAIM-TRANSITION-REGISTRY.json`. The transition binds the registry
identity and digest. Its `previousTransitionDigest` must equal the registry's
trusted head, that exact predecessor must be a registry member, and its
`toClaimRef` must equal the current `fromClaimRef`. The registry validates the
full append-only chain from claim version one. A digest-consistent record
manufactured by the claimant or caller is not trusted history, even when every
field is schema-complete. The registry must be an exact-type instance whose
complete canonical records, claim identity, digest, trusted head, order, and
chain semantics reproduce through the validated factory at the use boundary;
invoking a public field constructor or fabricating a partial internal mapping
cannot establish membership. A caller-supplied
`{"transitionType":"PROMOTED"}` object has no authorization weight.

### 7.3 Subject-bound reproduction

Independent reproduction uses
`templates/CLAIM-REPRODUCTION-RECEIPT.json`. Bind the claim version and digest,
exact repository commit or other subject, producer evidence, exact method bytes
and digest, exact canonical result value/bytes and digest, claim-listed receipt
reference, freshness, and synthetic/production status. Bind the receipt to a
separately supplied immutable
`templates/REPRODUCTION-INDEPENDENCE-REGISTRY.json`: its admission identifies
distinct producer/reproducer identities and trust domains, an independent
reproducer type, the exact evidence and basis, and a distinct relying-party
admitter. The registry and admission digests are immutable inputs rather than
receipt-authored proof. `reproductionRequirement` on the claim is authoritative; callers
cannot disable it with an optional evaluation flag. Synthetic fixtures can
validate a mechanism but cannot satisfy a production reproduction requirement.
The evaluator validates the required producer-evidence reference, independent
reproducer identity/type/trust domain, independence basis, method reference,
and strict RFC3339 timezone-bound reproduction timestamp; absent, self-
contradictory, same-producer/process, or registry-unbound evidence fails closed.

Reproduction establishes only the artifact fact. `promotesAuthority` is always
`false`; policy promotion requires its own qualifying authority source and
append-only `PROMOTED` transition. A changed subject commit, source digest,
directive version, packet digest, or session marks dependent decision use
`STALE`.

### 7.4 Reasoning-surface observation and verdict binding

Current browser/UI evidence is an **observation receipt**, not attestation.
Use `templates/REASONING-SURFACE-OBSERVATION-RECEIPT.json`; do not use a
reasoning-surface attestation template for browser evidence and never claim
cryptographic platform attestation.

The relying party supplies the required reviewer role, canonical non-anonymous
signed-in account reference, review subject,
repository head, exact input bytes, exact submitted bytes, admission-question
bytes, and exact response bytes independently of the receipt. The receipt independently binds those
requirements plus packet and input digests, exact submitted-visible payload or a declared reproducible transform,
admission question, repository heads, signed-in surface, account, exact visible
mode before submission, conversation session, submission, one completed
response, response digest, and exact visible mode after response. Every
observation is bound to the same transaction and conversation session. Exact
mode equality is required: a Pro-plan account does not prove visible Pro mode,
and visible Extra High does not satisfy Pro.

A declared payload transform is not proved by a description and output hash.
The relying party supplies exact canonical declarative transform-spec bytes.
The evaluator supports only named fixed implementations, binds the spec digest
and byte definition, executes the transform repeatedly over the exact input,
and requires both results to equal the exact submitted bytes. Arbitrary or
stateful callables have no admission path. The transform type is sealed against
subclass overrides, admission requires the exact type, and execution calls the
evaluator-owned pure implementation directly rather than virtual `apply`
dispatch. Every `VERIFIED` UI observation also
requires a nonempty evidence reference and strict RFC3339 timezone-bearing
observation time; ISO week/ordinal dates and a space in place of `T` fail
closed. Every non-null field declared as schema `format: date-time` must receive
the same real-calendar RFC3339 validation in the runtime path that admits or
uses it: claim creation/expiry, transition recording, reproduction, receipt and
nested observation evidence, verdict issue/admission, and browser receipt
recording. Verdict timestamps fail before durable receipt consumption. The
repository schema validator enforces the same check, so regex-shaped dates such
as February 30 cannot pass either boundary.

Agent and subagent names, task names, role labels, branch names, worktree paths,
process names, environment variables, prompt requests, packet-author claims,
GitHub assertions, and model self-description have zero receipt weight. A
corrected observation gets a new receipt and transaction and references the
old mismatch; it never overwrites the incident.

Receipts are single-use through an append-only, durable consumption ledger; an
optional in-memory list of prior receipts is not replay protection. Bind the exact completed response to
`templates/SUPERVISION-VERDICT-ADMISSION.json`. The verdict cannot become
authoritative unless the receipt is `VERIFIED_COMPLETE`, unused, same-session,
payload-matched, account-matched, and its response and admission-question
digests exactly match the verdict record. The durable consumption event binds
the externally required account and both digests.
Only `admissionState: ADMITTED` permits `authoritative: true`.

Executable reference controls are in
`scripts/mission_control_provenance.py`; the templates and schemas are the
machine boundary. Required failures include:

```text
UNAUTHORIZED_CLAIM_PROMOTION
AUTHORIZATION_REQUIREMENT_UNSATISFIED
SUBJECT_BINDING_STALE
PRODUCTION_REPRODUCTION_MISSING
DEFINITIVE_RENDERING_REJECTED
SELF_ASSERTED_REASONING_IDENTITY_REJECTED
REASONING_SURFACE_MODE_MISMATCH
REASONING_RECEIPT_SESSION_MISMATCH
REASONING_RECEIPT_REPLAY_REJECTED
REASONING_RECEIPT_PAYLOAD_MISMATCH
REASONING_RECEIPT_INCOMPLETE
VERDICT_RECEIPT_BINDING_MISMATCH
ASSURANCE_CLASS_OVERCLAIM
AUTHORITY_REGISTRY_MISSING
AUTHORITY_SOURCE_UNREGISTERED
TRANSITION_VALIDATION_REQUIRED
TRANSITION_CHAIN_INVALID
REPRODUCTION_BYTES_MISMATCH
REPRODUCTION_RECEIPT_UNBOUND
REPRODUCTION_INDEPENDENCE_UNVERIFIED
REASONING_REQUIREMENT_BINDING_MISMATCH
ADMISSION_QUESTION_BINDING_MISMATCH
REASONING_OBSERVATION_EVIDENCE_INVALID
```

---

## 8. Fail-closed supervisor order and verdicts

A task supervisor must proceed in this order:

1. Validate the independently acquired owner-source receipt.
2. Validate the objective-reconciliation matrix.
3. Determine `contract_to_owner` state.
4. Validate the typed completion claim.
5. Only then evaluate `worker_to_contract` alignment, method, progress, verification, and evidence.

Additional required supervisor verdicts:

```text
OBJECTIVE_SOURCE_MISSING
CONTRACT_RECONCILIATION_REQUIRED
OBJECTIVE_DIVERGED
COMPLETION_CLAIM_UNSUPPORTED
```

The supervisor cannot issue `ON_TRACK`, GREEN root completion, release approval, or `OWNER_OUTCOME_ACHIEVED` when:

- the owner source is missing or mismatched;
- a material requirement is unmapped;
- the contract is weakened or divergent;
- an unauthorized scope change exists;
- evidence proves only an intermediate completion type;
- the independent owner-source receipt is absent;
- the proposed completion claim is semantically stronger than the evidence.

---

## 9. AskRigor and research assurance planes

AskRigor and comparable research systems require three distinct supervisor judgments. They must not be collapsed into one “approved” state.

### 9.1 Operational alignment

Question:

> Is the worker correctly executing its assigned research or implementation lane under the current contract?

State:

```text
PASS
WARN
FAIL
UNKNOWN
NOT_APPLICABLE
```

Examples:

- correct source route;
- correct protocol version;
- complete required search/read steps;
- appropriate lane boundaries;
- current artifact and evidence identity;
- no unauthorized mutation.

### 9.2 Scientific adequacy

Question:

> Does the available evidence and method justify the inference, uncertainty statement, flaw severity, synthesis, and conclusion?

State:

```text
PASS
WARN
FAIL
UNKNOWN
NOT_APPLICABLE
```

Examples:

- study design and bias implications;
- evidence-selection sufficiency;
- access and validation gaps;
- inference boundaries;
- contradiction and heterogeneity handling;
- whether conclusions exceed the methods.

This is normally a Pro-level judgment when consequential or genuinely difficult.

### 9.3 Release adequacy

Question:

> May this exact result be released or published under applicable privacy, consent, licensing, freshness, provenance, security, product, and owner-outcome rules?

State:

```text
PASS
WARN
FAIL
UNKNOWN
NOT_APPLICABLE
```

A scientifically supportable result may still fail release adequacy. A release-adequate artifact may still contain a scientifically inadequate conclusion. Operational PASS proves neither.

The canonical machine-readable form is `templates/RESEARCH-SUPERVISION-VERDICT.json`.

For AskRigor, overall release permission requires all applicable hard conditions rather than an average:

```text
operational_alignment != FAIL
scientific_adequacy == PASS or an explicitly authorized bounded state
release_adequacy == PASS
contract_to_owner == MATCH
required access/protocol/freshness gates satisfied
```

---

## 10. Shared Pro supervisor-design meta-review lane

### 10.1 Trigger

A Codex worker must create a design-feedback record when it identifies a substantive:

- supervision loophole;
- architecture ambiguity;
- conflicting supervisor rule;
- recurring failure not explained by worker error alone;
- machine-checking gap;
- harmful context, routing, account, browser, evidence, or terminal-state behavior;
- improvement that could materially reduce drift or owner burden;
- question whose answer affects how supervision should operate across tasks.

Typos, non-semantic formatting, and obvious local documentation repairs do not require Pro meta-review.

### 10.2 Required worker behavior

The worker must not:

- silently rewrite the canonical supervision architecture;
- reinterpret the architecture in its own project as if that were a universal change;
- block unrelated safe work merely because it has a nonblocking suggestion;
- send the Pro chat a GitHub link and assume it can retrieve the context.

The worker must:

1. Record a `SUPERVISION_DESIGN_FEEDBACK` packet.
2. Include the relevant owner outcome, current architecture version/hash, exact problematic rule, observed or hypothetical failure, evidence, proposed change, risks, and open question.
3. State whether the issue blocks the current task boundary.
4. Route repository retrieval and packet assembly through deterministic tooling or Extra High.
5. Submit the self-contained packet to the shared Pro supervisor-design chat.
6. Preserve the Pro verdict and any owner decision as durable evidence.
7. Continue unaffected task work automatically.

### 10.3 Shared chat, not one per worker

Use one scope-bound Pro meta-review chat per supervision-architecture epoch:

```text
scope_key: supervision-architecture/<epoch>
```

Reuse it while context remains healthy. Apply the existing context-pressure and rollover rules. Workers submit feedback through the shared queue rather than opening four independent architecture chats.

### 10.4 Immediate versus batched review

Review immediately when the feedback describes:

- a supervision defect that can falsely authorize completion, release, publication, deployment, or harmful therapy/research behavior;
- owner-outcome loss or contract laundering;
- security, privacy, consent, or irreversible-action risk;
- a contradiction that prevents safe current execution.

Batch nonblocking improvements for the next Pro meta-review checkpoint. A reasonable starting checkpoint is the earlier of:

- three pending substantive items;
- seven active days;
- the next Mission Control architecture phase boundary;
- owner request.

This batching conserves Pro without allowing material defects to wait.

### 10.5 Pro output

The Pro meta-review chat returns one of:

```text
ACCEPT
ACCEPT_WITH_REVISION
REJECT
NEEDS_EVIDENCE
OWNER_DECISION_REQUIRED
PROJECT_LOCAL_ONLY
```

It must identify:

- exact feedback IDs reviewed;
- current architecture epoch/hash;
- reasoning summary linked to evidence;
- affected patterns/templates/tests;
- compatibility and migration impact;
- whether current worker/task approvals are invalidated;
- next required action.

Pro advice does not itself mutate the architecture. A repository change, tests, and owner authorization where applicable remain required.

The canonical worker packet is `templates/SUPERVISION-DESIGN-FEEDBACK.json`.

---

## 11. Mission Control event and dashboard requirements

Required machine fields:

```json
{
  "owner_request_id": "...",
  "owner_request_sha256": "...",
  "owner_source_receipt_id": "...",
  "task_contract_sha256": "...",
  "worker_to_contract_alignment": "GREEN | YELLOW | RED | UNKNOWN",
  "contract_to_owner_alignment": "MATCH | PARTIAL | DIVERGED | SOURCE_MISSING",
  "objective_reconciliation_id": "...",
  "unmapped_owner_requirements": [],
  "authorized_scope_changes": [],
  "completion_claim_type": "WORKING | ARTIFACT_READY | TESTS_PASS | READY_FOR_OWNER_REVIEW | READY_FOR_RELEASE | PARTIAL_OUTCOME | SUBTASK_COMPLETE_PARENT_OPEN | OWNER_OUTCOME_ACHIEVED | BLOCKED_OWNER_DECISION | CANCELED_BY_OWNER",
  "contract_divergence": [],
  "evidence_receipts": [],
  "supervision_design_feedback_ids": []
}
```

Dashboard cards must show separately:

- worker-to-contract alignment;
- contract-to-owner alignment;
- completion claim type;
- unmapped owner requirements;
- reconciliation freshness;
- owner-source receipt status;
- pending Pro meta-review feedback;
- AskRigor operational/scientific/release judgments when applicable.

Never render “Alignment: GREEN” without making both alignment planes visible or clearly deriving the overall state from them.

---

## 12. Required acceptance and hostile fixtures

At minimum, test:

1. Worker-to-contract GREEN plus contract-to-owner RED yields overall RED.
2. Worker and task contract align, but the contract omits a material owner sentence.
3. Existing acceptance criteria faithfully encode the wrong objective.
4. Supervisor receives only a worker-polished handoff; independent receipt is missing.
5. Independent owner source differs from the worker copy.
6. Owner source is unavailable.
7. Review readiness is substituted for a requested measured outcome.
8. Tests pass while the user-visible owner outcome is absent.
9. Material discovery makes the approved plan incapable of satisfying the owner outcome.
10. Later owner correction creates a new epoch without rewriting prior history.
11. `READY_FOR_OWNER_REVIEW` cannot become `OWNER_OUTCOME_ACHIEVED` by label translation.
12. A completed subtask can close while the parent remains open.
13. AskRigor operational PASS plus scientific FAIL does not permit release.
14. AskRigor scientific PASS plus release FAIL does not permit publication.
15. A substantive supervision loophole creates a design-feedback packet and reaches the shared Pro meta-review lane.
16. A nonblocking design suggestion does not stop unrelated task execution.
17. An immediate-risk design defect is not delayed for batching.
18. A Pro meta-review verdict cannot silently rewrite the architecture without repository change and tests.
19. Owner source defines no completion policy; executor infers 76 and receives `SCIENTIFIC_SCOPE_UNAUTHORIZED`.
20. Executor reacts to that rejection by blocking on a supposed 23-versus-76 owner choice and receives `INVENTED_OWNER_DECISION`.
21. Extra High or Pro inherits that fake choice without an owner-contract source and still receives `INVENTED_OWNER_DECISION`.
22. Owner explicitly creates a 76-item policy with a current receipt, a new qualifying source, and an append-only `PROMOTED` transition; only that new policy claim is accepted.
23. A contract says 76 while the exact production artifact exposes 23 and receives `CONTRACT_ARTIFACT_MISMATCH`.
24. A fake backend proves phase filtering without proving production cardinality and release remains blocked.
25. Worker-to-contract GREEN plus an unauthorized scientific criterion yields root RED.
26. Tests pass while owner-facing numeric prose lacks claim provenance and definitive rendering is rejected.
27. A mapping identity, subject commit, or directive-version change marks the prior claim `SUBJECT_BINDING_STALE` automatically.
28. An executor receipt attempts to choose a denominator or populate scientific adequacy and schema admission fails.
29. A reviewer repeats a producer-supplied cardinality without reproduction and review remains `UNKNOWN`.
30. A copied or renamed fact cannot become policy without an append-only `PROMOTED` transition and new authority source.
31. A synthetic reproduction verifies fixture behavior but cannot satisfy production reproduction.
32. A worker marks a claim non-load-bearing, but a definitive owner-facing use site still triggers the rendering gate.
33. An agent or subagent name contains `extra_high`; its receipt weight remains zero.
34. A model says it is Pro; self-description remains zero-weight evidence.
35. A Pro-plan account with no verified visible Pro mode leaves the receipt partial.
36. Required Pro plus observed Extra High produces `REASONING_SURFACE_MODE_MISMATCH`.
37. A completed response from another session cannot be paired with the current receipt.
38. A previously used receipt cannot admit the same or a different response.
39. An unexplained input-to-submitted digest change fails payload binding.
40. A valid observation receipt paired with a different response digest rejects verdict admission.
41. Browser-observed evidence claiming cryptographic platform attestation fails.

The article-humanization `13.82% Human` fixture must explicitly demonstrate:

```text
worker_to_contract: GREEN
contract_to_owner: DIVERGED
completion_claim: READY_FOR_OWNER_REVIEW
overall: RED
required directive: CONTINUE_HUMANIZATION
```

---

## 13. Existing-task migration

At the next safe checkpoint, active workers must:

1. Create or verify an objective-reconciliation record.
2. Record both alignment states.
3. Use typed completion claims.
4. Reconcile after the listed triggers.
5. For AskRigor/research work, separate operational, scientific, and release adequacy.
6. Submit any substantive supervision-design improvement or question through the shared Pro meta-review lane.
7. Preserve valid supporting work and continue automatically unless the discovered defect blocks the affected boundary.

A worker with no supervision-design improvement or question does not need a ceremonial Pro check-in.

---

## 14. Relationship to other patterns

This is a required companion to:

- `patterns/codex-pro-supervision-mission-control.md`
- `patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md`
- `patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md`
- `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`

The owner-outcome pattern governs source authority and contract-laundering prevention. This pattern makes the resulting assurance planes, independent receipt, typed claims, research verdicts, and supervision-design feedback mechanically visible and reviewable.
