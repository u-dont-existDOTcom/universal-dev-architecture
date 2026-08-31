# Mission Control — Owner-Discovered Supervision Escape Assurance

**Status:** CHAT-AUTHORED IMPLEMENTATION DIRECTIVE  
**Directive:** `MISSION-CONTROL-SUPERVISION-ESCAPE-ASSURANCE-v1.0.0`  
**Date:** 2026-08-31  
**Feedback ID:** `SDF-20260831-OWNER-DISCOVERED-SUPERVISION-ESCAPES-001`  
**Parent PR:** `u-dont-existDOTcom/universal-dev-architecture#42`  
**Independent conception / scan:** `audits/2026-08-31-mission-control-owner-discovered-supervision-escape-assurance.md`

## 1. Owner outcome

The owner identified a remaining structural weakness succinctly:

> `I feel like i need a mission control FOR the mission control`

and then authorized implementation:

> `Implement that`

The intended outcome is **not** another full supervisory hierarchy. It is a thin external assurance plane that can answer whether Mission Control itself is succeeding at noticing important problems before the owner must notice them manually.

The controlling question is:

> **During the review window, what important problem did the owner discover before Mission Control or its assigned reasoning supervisors did?**

A material owner-first discovery of an already detectable problem is a **supervision escape** and therefore evidence of a Mission Control design or operation defect.

## 2. Role and authority boundary

This document contains the semantic architecture, classification rules, acceptance criteria, and implementation plan. Codex implements them mechanically.

Codex may:

- add schemas and pure validators/reducers;
- connect those records to the existing append-only Mission Control event model;
- compute temporal ordering, counts, windows, repeated family identity, lifecycle state, and dashboard projections from already-authorized semantic records;
- add hostile fixtures and tests;
- adapt the current dashboard implementation to display the resulting state;
- return exact execution receipts and raw evidence.

Codex must not:

- decide from raw owner prose whether an intervention is a material supervision escape;
- decide whether evidence was semantically sufficient to make a problem detectable;
- decide whether an owner statement is a new requirement versus a missed pre-existing problem when that requires interpretation;
- create a new supervision layer because the assurance plane fails;
- choose or revise project strategy;
- create a new Pro review simply because this is called meta-assurance;
- replace or bypass the existing supervision-design feedback route.

Extra High is the default semantic reasoning authority for escape adjudication and architecture correction. Pro is used only when admitted by the current `PRO-ADMISSION` rules.

## 3. Existing-work disposition

Do not invent a new general monitoring framework.

**Decision: ADAPT + COMPOSE.**

Reuse:

- existing Mission Control event/evidence ledger;
- existing owner-source/correction identity;
- current worker/contract/outcome/strategy assurance planes;
- current finding and corrective-directive lifecycle;
- current `OWNER_FORCED_PROGRESS_REVIEW` and owner-forced continuation evidence;
- current `SUPERVISION_DESIGN_FEEDBACK` lane;
- current support/governance/supervision budgets;
- current Extra-High-default / Pro-admission gate.

Adapt:

- established black-box versus white-box monitoring: owner-view detection is the external assurance signal;
- established hierarchical monitoring: the new plane aggregates/evaluates lower-level Mission Control state without orchestrating it;
- incident/escape analysis: capture first-detectable boundary, first detector, missed control, repair, and recurrence.

Invent only:

- `SUPERVISION-ESCAPE` record;
- `MISSION-CONTROL-ASSURANCE` projection;
- owner-intervention disposition needed to avoid false escapes;
- anti-meta-recursion invariant and regressions.

## 4. The new plane is assurance, not control

Canonical topology:

```text
Owner
  -> Mission Control Assurance Plane (read/evaluate/route only)
       -> reads Mission Control events + owner interventions
       -> records supervision escapes / prevented escapes
       -> routes design defects through existing feedback/correction path
  -> Mission Control
       -> reasoning supervisors
       -> bounded execution directives
       -> Codex executors
```

The Assurance Plane has **no** authority to:

- schedule project work;
- mutate project code/content;
- issue Codex execution directives for a project;
- choose project strategy;
- replace task supervisors;
- create another assurance hierarchy.

It may cause a current architecture/design review to become due through the existing feedback mechanism.

Required invariant:

```text
MISSION_CONTROL_ASSURANCE != MISSION_CONTROL_2
```

## 5. Owner-intervention disposition

An owner message or action is first typed semantically by a reasoning authority. Required dispositions:

```text
PREEXISTING_PROBLEM_DISCOVERED
NEW_REQUIREMENT
NEW_EXTERNAL_FACT
RESERVED_OWNER_DECISION
SUBJECTIVE_OWNER_JUDGMENT
OWNER_CONFIRMATION_OF_EXISTING_FINDING
OWNER_REQUESTED_STATUS_ONLY
AMBIGUOUS_REVIEW_REQUIRED
```

Rules:

- `NEW_REQUIREMENT` is not an escape.
- `NEW_EXTERNAL_FACT` unavailable to the system beforehand is not an escape.
- `RESERVED_OWNER_DECISION` is not an escape.
- `SUBJECTIVE_OWNER_JUDGMENT` is not an escape unless the owner is identifying an objectively pre-existing supervision/process failure rather than merely supplying the judgment.
- `OWNER_CONFIRMATION_OF_EXISTING_FINDING` is not an escape when a current system finding/correction preceded the owner statement.
- `OWNER_REQUESTED_STATUS_ONLY` is not automatically an escape. It becomes one only when the status request reveals a material pre-existing problem the system should already have surfaced.
- `AMBIGUOUS_REVIEW_REQUIRED` cannot project a confirmed supervision escape.

## 6. Supervision escape definition

A semantic reasoning authority may classify `SUPERVISION_ESCAPE` only when all are true:

```text
problem_existed_before_owner_detection = true
materiality in {MATERIAL, CRITICAL}
detectable_evidence_available_before_owner_detection = true
system_had_authority_and_route_to_surface_problem = true
current_equivalent_finding_before_owner_detection = false
current_equivalent_correction_before_owner_detection = false
owner_detected_problem_first = true
```

Classification states:

```text
SUPERVISION_ESCAPE
PREVENTED_ESCAPE
NOT_AN_ESCAPE
REVIEW_REQUIRED
```

`PREVENTED_ESCAPE` means the system found and surfaced the issue before the owner independently raised it. It is positive evidence that the supervisory path worked; do not count it as a failure.

## 7. Create `templates/SUPERVISION-ESCAPE.json`

Minimum shape:

```json
{
  "schemaVersion": 1,
  "escapeId": "se_...",
  "architectureEpoch": "...",
  "taskId": "...",
  "ownerOutcomeRef": {
    "ownerOutcomeId": "...",
    "epoch": 1,
    "sha256": "..."
  },
  "ownerIntervention": {
    "ref": "...",
    "observedAt": "...",
    "disposition": "PREEXISTING_PROBLEM_DISCOVERED | NEW_REQUIREMENT | NEW_EXTERNAL_FACT | RESERVED_OWNER_DECISION | SUBJECTIVE_OWNER_JUDGMENT | OWNER_CONFIRMATION_OF_EXISTING_FINDING | OWNER_REQUESTED_STATUS_ONLY | AMBIGUOUS_REVIEW_REQUIRED"
  },
  "problem": {
    "summary": "...",
    "familyId": "...",
    "materiality": "LOW | MATERIAL | CRITICAL",
    "scope": "TASK | PROJECT | MISSION_CONTROL | UNIVERSAL_SUPERVISION"
  },
  "detectability": {
    "semanticJudgmentRef": "chat-authored-ref",
    "detectableSince": "...",
    "evidenceBoundaryRef": "...",
    "evidenceRefs": [],
    "evidenceWasAvailableToSystem": true,
    "systemHadAuthorityToSurface": true
  },
  "priorSystemHandling": {
    "equivalentFindingRef": null,
    "equivalentCorrectionRef": null,
    "firstSystemDetectionAt": null
  },
  "detection": {
    "firstDetector": "OWNER | MISSION_CONTROL | REASONING_SUPERVISOR | EXTERNAL | UNKNOWN",
    "ownerDetectedAt": "...",
    "systemDetectedAt": null,
    "ownerLeadSeconds": null
  },
  "classification": "SUPERVISION_ESCAPE | PREVENTED_ESCAPE | NOT_AN_ESCAPE | REVIEW_REQUIRED",
  "classificationReason": "chat-authored bounded rationale",
  "classificationAuthority": {
    "reasoningSurface": "CHATGPT_WEB_EXTRA_HIGH | CHATGPT_WEB_PRO",
    "chatEpochId": "...",
    "decisionRef": "..."
  },
  "repair": {
    "designFeedbackRef": null,
    "correctionRef": null,
    "state": "NONE | REQUIRED | PREPARED | ISSUED | DELIVERED | ACKNOWLEDGED | CORRECTING | EVIDENCE_SUBMITTED | VERIFIED | FAILED | SUPERSEDED",
    "verificationRef": null
  },
  "recordedAt": "..."
}
```

The exact schema may be normalized to current repository conventions, but the semantic fields above must survive.

## 8. Create `templates/MISSION-CONTROL-ASSURANCE.json`

Minimum shape:

```json
{
  "schemaVersion": 1,
  "assuranceId": "mca_...",
  "architectureEpoch": "...",
  "reviewWindow": {
    "start": "...",
    "end": "..."
  },
  "assuranceState": "PASS | WARN | FAIL | UNMEASURED",
  "materialEscapeCount": 0,
  "criticalEscapeCount": 0,
  "preventedEscapeCount": 0,
  "reviewRequiredCount": 0,
  "ownerForcedProgressReviewCount": 0,
  "ownerForcedContinuationCount": 0,
  "repeatEscapeFamilies": [],
  "openEscapeIds": [],
  "openArchitectureCorrectionRefs": [],
  "lastVerifiedRepairAt": null,
  "lastCleanWindowRef": null,
  "nextAssuranceReviewTrigger": "...",
  "ownerAction": {
    "required": false,
    "action": "NONE"
  }
}
```

Projection rules:

```text
UNMEASURED = no valid assurance window / semantic records
PASS       = no MATERIAL/CRITICAL escapes; no failed repeat repair
WARN       = semantic review outstanding or low-materiality signal requiring review
FAIL       = >=1 MATERIAL/CRITICAL confirmed escape OR failed repeat repair
```

Do not derive a misleading percentage and do not average this plane with worker/task alignment.

## 9. Repeat-family repair verification

A one-time escape is evidence of a defect. A repeated materially equivalent escape after a purported repair is stronger evidence that the repair failed.

Required findings:

```text
SUPERVISION_ESCAPE_DETECTED
REPEAT_SUPERVISION_ESCAPE
SUPERVISION_REPAIR_FAILED
OWNER_DISCOVERED_BEFORE_SYSTEM
```

Required positive state:

```text
SUPERVISION_ESCAPE_PREVENTED
```

A repeated family match is semantic when causal equivalence is nontrivial. Deterministic code may compare an already-authorized stable `familyId`; it may not invent semantic lineage from free text.

When the same family reappears after a correction reached `VERIFIED`:

```text
assuranceState = FAIL
repairState = FAILED or REOPENED
requiredAction = REDESIGN_EXISTING_CONTROL
```

## 10. Anti-meta-recursion rule

This is a hard invariant:

> **If the Mission Control Assurance Plane itself repeatedly requires owner correction, redesign or replace that assurance plane. Do not create a third supervisory layer.**

Forbidden outputs/concepts:

```text
META_META_SUPERVISOR
MISSION_CONTROL_3
ASSURANCE_OF_ASSURANCE_SERVICE
SECOND_ASSURANCE_DASHBOARD
SECOND_ASSURANCE_EVENT_LEDGER
```

Required finding when such a proposal is attempted:

```text
META_SUPERVISION_RECURSION
```

Required disposition:

```text
REDESIGN_EXISTING_ASSURANCE_PLANE
```

This control must integrate with current `GOVERNANCE_RECURSION`, `SUPERVISION_RECURSION`, and `PRO_REVIEW_RECURSION` rules.

## 11. Deterministic implementation boundary

Create or extend pure deterministic behavior equivalent to:

```python
validate_supervision_escape_record(record)
validate_mission_control_assurance_record(record)
project_mission_control_assurance(escape_records, correction_records, review_window)
detect_repeat_escape_family(escape_records, repair_records)
validate_meta_supervision_recursion(proposed_architecture_change)
```

Permitted deterministic checks:

- required fields and enum membership;
- hash/identity bindings;
- timestamp ordering;
- whether `detectableSince <= ownerDetectedAt` when a confirmed escape says the evidence pre-existed;
- whether a claimed prior finding/correction actually predates owner detection;
- whether a `PREVENTED_ESCAPE` has a qualifying system detection before owner detection;
- count and grouping of already-authorized family IDs;
- correction lifecycle consistency;
- review-window projection;
- forbidden meta-recursion topology tokens/typed states where represented structurally.

Forbidden deterministic judgments:

- interpreting owner prose;
- determining materiality from natural language;
- deciding semantic evidence sufficiency;
- deciding causal equivalence from text;
- deciding whether Extra High or Pro is necessary beyond validating an admission record.

If a semantic field required for projection is absent:

```text
classification = REVIEW_REQUIRED
assuranceState cannot become PASS from that record
```

## 12. Event integration

Reuse the current event ledger. Do not create another store.

Add event types or current-schema equivalents for:

```text
OWNER_INTERVENTION_RECORDED
SUPERVISION_ESCAPE_RECORDED
SUPERVISION_ESCAPE_PREVENTED
MISSION_CONTROL_ASSURANCE_CHANGED
SUPERVISION_REPAIR_FAILED
META_SUPERVISION_RECURSION_DETECTED
```

Existing signals such as these become **candidate evidence**, not automatic semantic escape verdicts:

```text
OWNER_FORCED_PROGRESS_REVIEW
owner-forced continuation / premature terminalization evidence
owner correction of Codex reasoning authority
owner correction of dashboard actionability
```

The reasoning layer adjudicates whether the candidate qualifies.

## 13. Trigger policy

Run or refresh assurance at these boundaries without creating busywork:

- any owner correction concerning supervision, progress visibility, continuation, role authority, task terminalization, or Mission Control behavior;
- any `OWNER_FORCED_PROGRESS_REVIEW` or owner-forced continuation event;
- verification of a Mission Control architecture repair;
- recurrence of an existing escape family;
- before claiming the Mission Control architecture itself is accepted/complete;
- bounded periodic architecture review if an existing scheduler already supports it.

Do **not** create a new polling daemon merely for this plane.

If no existing runtime mechanism can trigger a periodic review, event-driven checks are sufficient for this slice. Runtime automation remains a separate implementation boundary.

## 14. Dashboard projection

Add one compact Mission Control assurance panel to the existing dashboard; do not build a separate dashboard.

Primary display is semantic, for example:

```text
MISSION CONTROL ASSURANCE — FAIL

Owner caught 2 material supervision failures before the system.

1. Article outcome was regressing; progress review began only after owner asked.
   First detectable: outcome evidence R16
   First detector: OWNER
   Missed control: automatic progress/strategy review
   Repair: VERIFIED / FAILED / ...

2. Project-local stop was projected to the root supervision chain.
   First detectable: accepted bounded Universal child
   First detector: OWNER
   Repair: CORRECTING

Owner action: NONE
```

Required fields visible or drillable:

```text
assurance state
review window
material/critical escape count
prevented escape count
each escape summary
first detectable evidence boundary
first detector
owner/system detection timestamps or relative order
missed finding/correction
escape family
repair state
repair verification
repeat-family state
next assurance trigger
owner action or NONE
```

Do not make `0 escapes` a claim of complete correctness; it means no confirmed escapes in the bounded measured window.

## 15. Exact hostile regressions

### 15.1 Somatic owner-forced progress review

Given:

```text
worker_to_contract = GREEN
contract_to_owner = MATCH
direct Human evidence declines across multiple whole-document measurements
no current Mission Control outcome-regression finding or strategy-replacement action exists
owner asks whether any progress occurred
only after that prompt does the worker/system initiate the focused progress audit
```

Expected:

```text
ownerInterventionDisposition = PREEXISTING_PROBLEM_DISCOVERED
classification = SUPERVISION_ESCAPE
familyId = outcome-regression-not-surfaced
finding includes OWNER_DISCOVERED_BEFORE_SYSTEM
assuranceState = FAIL
ownerAction = NONE
```

This should compose with, not replace, the existing Somatic outcome-regression fixture.

### 15.2 Same outcome regression, system catches it first

Given the same underlying regression, but before any owner comment:

```text
Mission Control emits current outcome-regression finding
same-strategy continuation is held
reasoning review / strategy replacement is started
```

Then the owner later asks about progress.

Expected:

```text
ownerInterventionDisposition = OWNER_CONFIRMATION_OF_EXISTING_FINDING or OWNER_REQUESTED_STATUS_ONLY
classification = PREVENTED_ESCAPE or NOT_AN_ESCAPE
materialEscapeCount unchanged
preventedEscapeCount increments when explicitly recorded as PREVENTED_ESCAPE
```

### 15.3 Genuine new owner requirement

Given:

```text
system is correctly executing current task
owner adds a new product requirement not previously present
```

Expected:

```text
disposition = NEW_REQUIREMENT
classification = NOT_AN_ESCAPE
```

### 15.4 Codex reasoning-controller failure

Given:

```text
Codex has been selecting strategy, performing substantive reasoning, and judging its own progress
existing events make this role breach observable
no Mission Control authority-breach finding exists
owner says that chats should reason and Codex should only execute
```

Expected:

```text
classification = SUPERVISION_ESCAPE
familyId = reasoning-execution-authority-collapse
assuranceState = FAIL
```

Compose with `codex-self-supervision-articles-failure.json`.

### 15.5 Premature terminalization / owner-forced continuation

Given:

```text
project-local NO_FURTHER_EXECUTION_AUTHORIZED is valid
separate accepted supervision-design verdict contains one bounded Universal implementation child
no OWNER_DECISION_REQUIRED or root terminal state exists
execution controller stops and returns owner-facing final
owner asks why it stopped
```

Expected:

```text
disposition = PREEXISTING_PROBLEM_DISCOVERED
classification = SUPERVISION_ESCAPE
familyId = scoped-stop-projected-to-root-chain
assuranceState = FAIL
```

Compose with `SDF-20260831-CODEX-PREMATURE-TERMINALIZATION-002` evidence.

### 15.6 Anti-recursion regression

Given:

```text
Mission Control Assurance Plane itself misses an observable class of owner-first failure
owner corrects the assurance design
proposed repair = add a meta-meta supervisor above it
```

Expected:

```text
finding = META_SUPERVISION_RECURSION
proposed repair = REJECTED
required disposition = REDESIGN_EXISTING_ASSURANCE_PLANE
no new scheduler/service/dashboard/event ledger
```

### 15.7 Ambiguous owner statement

Given owner prose whose status as new requirement versus pre-existing failure is genuinely unclear.

Expected:

```text
disposition = AMBIGUOUS_REVIEW_REQUIRED
classification = REVIEW_REQUIRED
assuranceState != PASS solely because ambiguity was ignored
Codex does not decide semantics
```

## 16. Acceptance criteria

This slice is accepted only when all are true:

1. The independent conception and prior-work scan remain preserved.
2. `SUPERVISION-ESCAPE` and `MISSION-CONTROL-ASSURANCE` machine schemas exist and validate.
3. Semantic adjudication remains chat-owned; deterministic code fails closed on missing semantic authority.
4. Confirmed material owner-first discovery projects Mission Control assurance `FAIL` even if underlying workers are otherwise GREEN.
5. A prior system finding prevents false owner-first escape classification.
6. New owner requirements / owner-only decisions do not inflate escape count.
7. Repeated escape families after verified repair expose `SUPERVISION_REPAIR_FAILED`.
8. The anti-meta-recursion hostile test rejects a third supervisory layer.
9. Existing supervision-design feedback and correction lifecycle are reused rather than duplicated.
10. Existing anti-governance/supervision recursion and Pro-admission controls remain intact.
11. The dashboard adds one assurance projection rather than a second dashboard.
12. Existing applicable regression suites pass.
13. New tests exercise reducer/validator behavior, not only vocabulary presence.
14. Repository audit and `git diff --check` pass at the implementation checkpoint.
15. A Codex execution receipt names exact changed files, tests, head SHA, and any runtime/dashboard portion not yet operational.

## 17. Implementation order for the current Codex worker

At the next safe boundary on the current PR #42 work:

1. Re-read the current branch head and this directive; do not implement from a stale packet.
2. Reconcile against any newer Mission Control architecture changes and reuse current schema/reducer conventions.
3. Add the two schemas/templates.
4. Add/extend the deterministic assurance reducer/validator without semantic NLP classification.
5. Add exact hostile fixtures and executable tests.
6. Update current Mission Control pattern/index/bootstrap references minimally.
7. Add the assurance projection to the existing dashboard adaptation path; do not restart PR #41 or create a separate app.
8. Run focused tests, then applicable full suite at the existing checkpoint policy.
9. Run deterministic repository audit and `git diff --check`.
10. Push the durable boundary and return a `CODEX-EXECUTION-RECEIPT` to the active Extra High reasoning lane.

Hard stops:

- stop if implementation would require Codex to interpret owner prose semantically;
- stop if a third supervisory layer is proposed;
- stop if a second dashboard/store/scheduler is required by the proposed implementation rather than reusing the current one;
- stop the affected boundary if current schema changes create a material semantic conflict that this directive does not resolve;
- do not stop unaffected work for a nonblocking review;
- owner decision is required only if an actual competing owner-level choice emerges.

## 18. Expected owner-facing effect

The owner should no longer have to infer from a pile of worker cards whether Mission Control is functioning. The system should be able to state directly:

```text
What important problems did the owner catch before we did?
Why did we miss them?
What repair is underway?
Has that repair actually prevented the same failure from escaping again?
Does the owner need to act?
```

That is the entire purpose of this plane.
