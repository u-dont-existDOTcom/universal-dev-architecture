# Mission Control Owner-Discovered Supervision Escape Assurance

**Status:** Required Mission Control assurance pattern  
**Date:** 2026-08-31  
**Directive:** `MISSION-CONTROL-SUPERVISION-ESCAPE-ASSURANCE-v1.0.0`

## Purpose

Mission Control must be evaluated not only from its own internal supervisory state but also from the owner’s external viewpoint.

The controlling assurance question is:

> **What important problem did the owner discover before Mission Control or its assigned reasoning supervisors did?**

A confirmed material owner-first detection of an already detectable problem is a **supervision escape**. It is evidence that Mission Control failed at its own supervisory purpose even when workers, contracts, tests, or local dashboards are otherwise internally coherent.

This pattern adds an assurance plane, not a second Mission Control.

## External versus internal assurance

Internal/white-box planes already include, among others:

```text
worker_to_contract_alignment
contract_to_owner_alignment
outcome_advancement
strategy_efficacy
root_delivery_frontier
evidence_capability
reasoning_review_freshness
correction_lifecycle
execution_state
```

These remain necessary. None alone proves that the supervisory organization catches the important failure before the owner has to intervene.

The external/black-box plane records the ordering between:

```text
problem becomes detectably evidenced
Mission Control / reasoning supervisor surfaces it
owner independently surfaces it
```

## Supervision escape

A reasoning authority may classify a record as `SUPERVISION_ESCAPE` only when all are established:

```text
problem existed before owner detection
problem is MATERIAL or CRITICAL
detectable evidence was available to the supervised system before owner detection
the system had an authorized route to surface the problem
no equivalent current system finding preceded owner detection
no equivalent current correction preceded owner detection
owner detected the problem first
```

A supervision escape cannot be inferred mechanically from the mere presence of an owner correction.

Owner-intervention dispositions that must be distinguished:

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

New requirements, genuinely new facts, reserved owner decisions, and owner confirmation of an already-current finding are not supervision escapes.

## Prevented escape

When Mission Control or the assigned reasoning supervisor surfaces a material issue before the owner independently raises it, the system may record:

```text
PREVENTED_ESCAPE
SUPERVISION_ESCAPE_PREVENTED
```

This is positive evidence for the supervisory path. It does not prove the entire architecture is correct.

## Assurance projection

Canonical record templates:

- `templates/SUPERVISION-ESCAPE.json`
- `templates/MISSION-CONTROL-ASSURANCE.json`

Assurance states:

```text
PASS
WARN
FAIL
UNMEASURED
```

Rules:

```text
UNMEASURED -> no valid bounded assurance window / semantic evidence
PASS       -> no confirmed MATERIAL/CRITICAL escape or failed repeat repair in the measured window
WARN       -> relevant semantic review outstanding or lower-severity signal needs review
FAIL       -> >=1 confirmed MATERIAL/CRITICAL escape or a materially equivalent escape recurs after verified repair
```

Do not average this state into worker/task alignment. Do not turn it into a primary percentage.

A zero count means only:

> no confirmed supervision escapes were measured in this bounded window.

It does not mean Mission Control is universally correct.

## Repeat-family repair verification

Every confirmed escape must bind, when possible, to a stable semantic `familyId` authorized by the reasoning layer.

Required findings:

```text
SUPERVISION_ESCAPE_DETECTED
OWNER_DISCOVERED_BEFORE_SYSTEM
REPEAT_SUPERVISION_ESCAPE
SUPERVISION_REPAIR_FAILED
```

If a materially equivalent family recurs after a correction previously reached `VERIFIED`, the repair is not accepted merely because its implementation tests passed.

Required projection:

```text
assuranceState = FAIL
requiredAction = REDESIGN_EXISTING_CONTROL
```

This closes the loop between architecture correction and evidence that the correction actually prevented recurrence.

## Role separation

Semantic judgments belong to the current reasoning authority, Extra High by default and Pro only when admitted.

Codex/deterministic code may validate:

- schema and identity;
- timestamp ordering;
- evidence/finding/correction references;
- already-authorized family IDs;
- repeated family counts;
- lifecycle transitions;
- bounded assurance-window projection.

Codex/deterministic code must not decide:

- what the owner meant;
- whether a new owner request was actually a pre-existing failure;
- semantic materiality;
- semantic evidence sufficiency;
- causal equivalence from free text;
- whether Pro is needed beyond validating a current admission record.

Ambiguity fails to:

```text
classification = REVIEW_REQUIRED
```

not to a fabricated escape or fabricated PASS.

## Existing machinery to reuse

The assurance plane consumes and reuses:

- the current append-only Mission Control event ledger;
- owner-source/correction identity;
- `OWNER_FORCED_PROGRESS_REVIEW` and owner-forced continuation evidence as candidate inputs;
- current finding and corrective-directive lifecycle;
- current `SUPERVISION_DESIGN_FEEDBACK` route;
- current support/governance/supervision recursion budgets;
- current Extra-High/Pro admission rules;
- the existing Mission Control dashboard.

It does not create another service, scheduler, database, event ledger, or dashboard.

## Anti-meta-recursion invariant

Hard rule:

> **If this assurance plane itself repeatedly requires owner correction, redesign or replace this assurance plane. Never create a third supervisory layer.**

Forbidden repair topology includes:

```text
META_META_SUPERVISOR
MISSION_CONTROL_3
ASSURANCE_OF_ASSURANCE_SERVICE
SECOND_ASSURANCE_DASHBOARD
SECOND_ASSURANCE_EVENT_LEDGER
```

Required finding:

```text
META_SUPERVISION_RECURSION
```

Required response:

```text
REDESIGN_EXISTING_ASSURANCE_PLANE
```

This composes with existing `GOVERNANCE_RECURSION`, `SUPERVISION_RECURSION`, and `PRO_REVIEW_RECURSION` controls.

## Dashboard contract

The owner-facing surface must answer directly:

```text
How is Mission Control assurance doing?
What did the owner catch before the system?
When was each issue already detectable?
Why did the system miss it?
What correction is underway?
Has the repair prevented recurrence?
Does the owner need to act?
```

Example:

```text
MISSION CONTROL ASSURANCE — FAIL

2 material supervision escapes in this review window.

Outcome regression not surfaced
First detectable: R16 whole-document evidence
First detector: OWNER
Repair: VERIFIED
Recurrence: NONE

Scoped stop projected to root chain
First detectable: accepted bounded continuation child
First detector: OWNER
Repair: CORRECTING

Owner action: NONE
```

## Acceptance regressions

At minimum, executable tests must establish:

1. Owner has to request a progress audit after measurable outcome regression was already visible and unhandled -> `SUPERVISION_ESCAPE` / `FAIL`.
2. Mission Control raises the regression first -> `PREVENTED_ESCAPE` or `NOT_AN_ESCAPE`.
3. Owner adds a genuinely new requirement -> `NOT_AN_ESCAPE`.
4. Owner has to correct Codex acting as its own reasoning controller after the role breach was already observable -> `SUPERVISION_ESCAPE`.
5. Owner has to force continuation after a project-local stop was wrongly projected to the root chain -> `SUPERVISION_ESCAPE`.
6. A repeated family after a verified repair -> `SUPERVISION_REPAIR_FAILED` / `FAIL`.
7. Proposal to add a meta-meta supervisor -> `META_SUPERVISION_RECURSION` / rejected.
8. Ambiguous owner prose -> `REVIEW_REQUIRED`; Codex does not infer semantics.

## Relationship to other patterns

This pattern is a companion to:

- `patterns/supervision-assurance-planes-and-pro-meta-review.md`
- `patterns/outcome-advancement-and-strategy-efficacy.md`
- `patterns/chat-led-reasoning-codex-execution-separation.md`
- `patterns/codex-pro-supervision-mission-control.md`
- `docs/exec-plans/2026-08-31-mission-control-delivery-frontier-governance-recursion-and-pro-admission.md`

The other planes determine whether workers, contracts, strategies, and evidence are valid. This plane determines whether the **supervisory organization itself is allowing important detectable failures to escape upward to the owner**.
