# Mission Control — Attention and Correction UX Addendum

**Status:** Required owner correction for the dashboard adaptation slice  
**Date:** 2026-08-30  
**Owner observation:** The current screen shows `RED · 21% aligned` but does not clearly explain which workers are misaligned, how they are misaligned, or what is being done to correct them.  
**Related feedback:** `feedback/mission-control/SDF-20260830-DASHBOARD-ACTIONABILITY-001.json`

## 1. Owner outcome

The dashboard must let the owner understand, within approximately ten seconds:

1. which workers need attention;
2. what each worker is doing wrong or what contract/outcome defect exists;
3. why the issue matters;
4. what corrective action has been issued;
5. whether that correction was delivered, acknowledged, started, evidenced, and verified;
6. whether the owner must do anything;
7. whether unaffected workers can continue safely.

A numeric alignment percentage is not a satisfactory answer to any of those questions.

## 2. Current screenshot diagnosis

The displayed `Test cleanup` scenario is actually understandable from the underlying evidence, but the UI makes the owner reconstruct it manually.

### Assigned outcome and boundaries

```text
Goal: Remove flaky test setup and stabilize the test suite without changing production logic.
Allowed: tests/**, test-support/**
Forbidden: src/core/**, src/production/**
Acceptance: production logic is untouched.
```

### Current worker trajectory

```text
Rewriting the production scheduler to accommodate test timing.
Next: replace scheduler implementation; update production callers.
Plan changed: yes.
Plan-change reason: absent.
Assumption: production timing semantics may be changed.
```

### Direct explanation

The worker is RED because it is attempting to modify forbidden production behavior to solve a test-only task. The new assumption directly contradicts the acceptance criterion and scope. The supervisor verdict is `REDIRECT`.

The dashboard should say that plainly. `21% aligned` may remain available as secondary diagnostic metadata, but it must not be the primary operator message.

## 3. Required main-screen attention summary

The default route must be the all-worker attention queue, not a worker detail page with a tiny `ALL WORKERS` escape link.

Top summary example:

```text
NEEDS ATTENTION NOW

1 REDIRECT active
1 WATCH
2 ON TRACK
0 owner decisions required

Highest priority:
Test cleanup — modifying forbidden production scheduler to fix tests.
Correction: stop/revert production changes and return to tests/test-support scope.
Status: directive issued; awaiting worker acknowledgement.
Owner action: none.
```

The summary must distinguish:

```text
worker problem
contract-to-owner problem
verification/evidence problem
owner-decision problem
integration/resource problem
```

Do not combine these into a single unexplained risk number.

## 4. Required worker card

Each RED/YELLOW card must show, without opening the detail page:

```text
worker/task
execution state
worker -> contract alignment
contract -> owner alignment
overall traffic/verdict
one-sentence active problem
number of blocking/material findings
correction directive summary
correction lifecycle status
next evidence/review trigger
owner action: required / not required
last meaningful checkpoint age
```

Example:

```text
TEST CLEANUP                                      REDIRECT
Worker -> Contract: RED     Contract -> Owner: MATCH

Why: Worker is rewriting the production scheduler even though production
     code is forbidden and must remain untouched.

Blocking findings (4):
- forbidden scope: src/production/**
- objective contradiction: production logic must be untouched
- unexplained plan change
- invalid assumption: production timing semantics may change

Correction: Stop and revert production changes; solve within tests/** or
            test-support/**; rerun the focused test command.
Status: REDIRECT DELIVERED — AWAITING ACKNOWLEDGEMENT
Owner action: NONE
Next review: after revert evidence and focused tests
```

Healthy cards may remain compact. RED and YELLOW cards expand enough to explain themselves.

## 5. Required detail-page decision strip

Place this above the contract and trajectory panels:

| Field | Required content |
|---|---|
| **What is wrong** | Plain-language problem statement, not a score |
| **Why it matters** | Exact owner outcome, task criterion, scope, safety, release, or evidence consequence |
| **Evidence** | Top 2–5 evidence-linked facts with exact files/events where available |
| **Corrective directive** | Bounded instruction to the worker |
| **Correction status** | Lifecycle state backed by events |
| **Next verification** | What evidence will prove correction |
| **Owner action** | `NONE`, exact decision, or exact manual intervention |

The top strip must remain usable without scrolling.

## 6. Correction lifecycle must be explicit

A supervisor verdict is not proof that a correction is occurring.

Add machine-visible correction states/events such as:

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

Minimum record:

```json
{
  "finding_id": "...",
  "directive_id": "...",
  "task_id": "...",
  "worker_run_id": "...",
  "status": "REDIRECT_DELIVERED",
  "directive": "Stop and revert production scheduler changes...",
  "issued_at": "...",
  "delivered_at": "...",
  "acknowledged_at": null,
  "correction_started_at": null,
  "required_evidence": [
    "revert commit or clean diff",
    "no forbidden production paths changed",
    "focused tests pass"
  ],
  "next_review_trigger": "after correction evidence",
  "owner_action_required": false
}
```

Rules:

- Never infer delivery from `REDIRECT` alone.
- Never infer acknowledgement from a later heartbeat unless it references the directive.
- Never label correction verified until required evidence is current and exact-candidate bound.
- Preserve the complete correction history after resolution.
- If no directive has been issued, say `NO CORRECTION ISSUED` rather than implying otherwise.
- If a worker continues the prohibited path after delivery, escalate visibly.

## 7. Finding explanation and grouping

Every material finding needs:

```text
finding type
severity
plain-language statement
violated owner requirement / contract criterion / rule
evidence references
current status
required response
```

Group redundant detector signals into one operator explanation while preserving raw findings below.

For the screenshot scenario, four signals may be shown as one principal problem with supporting reasons:

```text
Principal problem:
Using forbidden production-code changes to solve a test-only objective.

Supporting reasons:
- current step rewrites production scheduler;
- next step changes production callers;
- allowed paths exclude production code;
- acceptance criterion requires production logic untouched;
- plan changed without explanation;
- new assumption contradicts task authority.
```

## 8. Numeric alignment becomes secondary

Do not delete useful diagnostics, but demote `21% aligned`.

Preferred presentation:

```text
Overall: REDIRECT
Worker -> Contract: RED
Contract -> Owner: MATCH
Verification: PARTIAL
Evidence freshness: CURRENT

Diagnostic index: 21/100
Why: see 4 active findings
```

The index must expose its dimension/rule breakdown on demand. It is not a probability and must never compete visually with the direct explanation and directive.

## 9. Owner-action semantics

Every RED/YELLOW task must explicitly say one of:

```text
OWNER ACTION: NONE — worker/supervisor correction in progress
OWNER ACTION: DECISION REQUIRED — exact question and options
OWNER ACTION: MANUAL INTERVENTION REQUIRED — exact action and reason
OWNER ACTION: VERIFY RESULT — exact artifact/behavior to inspect
```

Do not send the owner to a Pro or Codex chat merely to discover whether action is required.

## 10. Main-screen ordering

Sort by:

1. owner safety/privacy/research-release decision;
2. worker continuing after a validated redirect;
3. unacknowledged REDIRECT;
4. contract-to-owner DIVERGED;
5. evidence/verification failure at a completion boundary;
6. other RED;
7. WATCH/YELLOW;
8. blocked/stalled;
9. healthy work.

Within equal priority, sort by severity and age since the last meaningful response—not raw activity volume.

## 11. Required API/projection additions

Dashboard/task projections should expose at least:

```text
active_findings[]
primary_problem_summary
corrective_directive
correction_status
correction_age
worker_acknowledged
required_correction_evidence[]
next_review_trigger
owner_action_type
owner_action_text
safe_to_continue_independent_work
```

These fields must derive from durable events and evidence, not ad hoc UI prose.

## 12. Acceptance fixtures

### 12.1 Screenshot scenario

Given the current `Test cleanup` fixture, the top viewport must show:

```text
Test cleanup — REDIRECT
Why: forbidden production scheduler changes for a test-only task
Correction: stop/revert production changes; return to test scope
Status: exact current correction lifecycle state
Owner action: none unless a real decision exists
```

The owner must not have to scroll to discover `REDIRECT` or infer the violation from separate panels.

### 12.2 Multi-worker summary

Given four workers with two GREEN, one WATCH, and one REDIRECT, the default page must identify the RED and WATCH workers by name, explain each problem and correction, and state the owner-action count.

### 12.3 No correction yet

A RED finding without an issued directive must show:

```text
Correction status: NO CORRECTION ISSUED
```

not “redirect active.”

### 12.4 Directive lifecycle

A delivered but unacknowledged directive must remain visibly pending. An acknowledged directive must not become resolved until evidence is verified.

### 12.5 Dual alignment

A worker-to-contract GREEN / contract-to-owner DIVERGED scenario must explain that the worker is faithfully executing the wrong contract and show the contract repair, not a worker behavioral redirect, as the correction.

### 12.6 AskRigor

An AskRigor card with operational PASS and scientific FAIL must say what inference is unsupported and what review/research action is underway. Scientific PASS plus release FAIL must explain the publication barrier and remediation.

### 12.7 Alignment index

No RED/YELLOW top viewport may contain a numeric alignment score without a visible direct problem statement and correction status.

## 13. Pro supervisor-design review

The owner observation is a material supervision-design defect and blocks acceptance of the current dashboard information hierarchy.

Prepare and submit:

```text
feedback/mission-control/SDF-20260830-DASHBOARD-ACTIONABILITY-001.json
```

to the shared Pro meta-review lane. Ask Pro to evaluate whether the explanation-first attention queue, explicit correction lifecycle, owner-action semantics, and demotion of the alignment index are sufficient to satisfy the Mission Control owner outcome without creating false claims that correction is underway.

Routine visual implementation choices and build bugs do not need Pro.

## 14. Completion boundary

This addendum is complete only when:

- the default dashboard identifies all non-GREEN workers and their active problems;
- every RED/YELLOW item states what correction is happening and its exact lifecycle status;
- every item states whether owner action is required;
- the screenshot scenario is understandable within the top viewport;
- numeric alignment is secondary and explainable;
- correction status derives from durable events;
- all acceptance fixtures pass;
- the shared Pro design review is recorded or the exact external-review blocker is preserved;
- unrelated dashboard-adaptation work continues automatically.
