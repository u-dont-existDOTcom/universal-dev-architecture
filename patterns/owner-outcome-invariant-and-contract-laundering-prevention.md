# Owner-Outcome Invariant and Contract-Laundering Prevention

**Status:** Required owner correction and companion to the Mission Control architecture  
**Date:** 2026-08-30  
**Authority:** Current owner correction  

## 1. Normative correction

This pattern supersedes any workflow rule that tells an existing worker to preserve a current task checkpoint, acceptance criteria, completion boundary, or supervisor framing **without first validating it against the originating owner outcome**.

The governing invariant is:

> A downstream task contract, checkpoint, review packet, supervisor verdict, or workflow state may refine or operationalize the owner’s requested outcome, but it may not omit, weaken, replace, or terminally bypass that outcome without an explicit owner decision.

A technically valid body of supporting work does not prove task completion. Preservation gates, editorial readiness, tests, reviewer approval, source integrity, or `READY_FOR_OWNER_REVIEW` are non-satisfying proxies unless the owner’s actual requested outcome made one of them the final result.

The failure class is **contract laundering**:

```text
original owner outcome
    -> narrowed task contract
    -> packet evaluated only against the narrowed contract
    -> supervisor approves the packet framing
    -> intermediate proxy becomes the apparent finish line
    -> actual owner outcome remains unmet
```

Mission Control must prevent the laundering step rather than merely detecting ordinary drift after accepting the laundered contract as authority.

---

## 2. Failure model

Contract laundering can occur even when every participant is locally competent:

1. The owner requests an outcome.
2. A worker decomposes it into preservation, review, implementation, test, or handoff criteria.
3. One of those supporting criteria becomes the effective task objective.
4. The original result is omitted from later checkpoints or packets.
5. A supervisor evaluates only the supplied task contract.
6. The supervisor approves a coherent but weakened frame.
7. The worker stops with substantial valid supporting work and an unmet owner outcome.

This is not repaired by adding a stronger semantic supervisor alone. A more intelligent supervisor can still approve a laundered contract when the packet omits the parent outcome.

Required detections include:

- `CONTRACT_LAUNDERING`
- `SCOPE_CONTRACTION`
- `OBJECTIVE_SUBSTITUTION`
- `PROXY_SUBSTITUTION`
- `COMPLETION_ILLUSION`
- `OUTCOME_AUTHORITY_UNRESOLVED`

---

## 3. Established-work basis and adaptation decision

This control adapts established requirements-engineering ideas rather than inventing an unrelated task model:

- **Goal-oriented requirements engineering:** derive operational requirements from stakeholder goals while retaining explicit goal relationships.
- **Bidirectional requirements traceability:** follow a requirement backward to stakeholder need and forward to implementation, tests, and evidence.
- **Refinement assurance:** decomposed subgoals must collectively imply the parent goal; a child milestone is not automatically evidence of parent satisfaction.
- **Assurance cases:** claims require appropriate supporting evidence, and evidence for a subclaim does not prove the top-level claim by itself.

The reusable core is parent-goal traceability and refinement. The project-specific adaptation is a deterministic owner-outcome-to-terminal-state comparator integrated with agent checkpoints, supervisor packets, and workflow states.

Reference baseline:

- Ramesh and Jarke, “Toward Reference Models for Requirements Traceability,” IEEE Transactions on Software Engineering, DOI `10.1109/32.895989`.
- Jarke, “Requirements Tracing,” Communications of the ACM, DOI `10.1145/290133.290145`.
- Mylopoulos, “Goal-Oriented Requirements Engineering,” DOI `10.1109/APSEC.2005.68`.
- Habli et al., “Extending Argumentation to Goal-Oriented Requirements Engineering,” DOI `10.5555/1784542.1784591`.

Disposition: **adapt + compose**. Use traceability and refinement principles, then add exact task/packet/hash identity and fail-closed terminal comparison.

---

## 4. Owner-outcome authority

### 4.1 Versioned immutable epochs

“Immutable” means immutable within an outcome epoch, not that the owner can never change the goal.

Each owner outcome is append-only and versioned:

```text
owner-outcome / epoch-001
owner-outcome / epoch-002  # explicit owner amendment
```

A change requires:

- an explicit owner instruction or decision;
- a new outcome epoch/revision;
- a supersession link;
- an impact review of active derived tasks and packets.

A worker, supervisor, planner, or task generator cannot silently revise the owner outcome.

### 4.2 Source authority

The outcome record must preserve:

- the original owner request verbatim;
- later explicit owner corrections that materially affect the result;
- source references and timestamps where available;
- the normalized result;
- required evidence and thresholds;
- known non-satisfying proxies;
- exact hash.

If the original request is unavailable or materially ambiguous, the state is `OUTCOME_AUTHORITY_UNRESOLVED`. The worker may continue clearly useful reversible contributing work, but may not declare the root outcome satisfied.

### 4.3 Normalization is subordinate to verbatim authority

The normalized result exists to make execution testable. It must not soften modality, remove thresholds, narrow scope, or convert a final outcome into review readiness.

When the verbatim and normalized forms conflict, the verbatim owner request and later explicit corrections control until the owner resolves the discrepancy.

---

## 5. Required owner-outcome schema

Every nontrivial durable root task must include or reference:

```yaml
owner_outcome:
  schema_version: 1
  owner_outcome_id: OO-...
  epoch: 1

  source_refs:
    - source_type: owner_message
      ref: "..."
      recorded_at: "..."

  verbatim_owner_request:
    - "Exact owner wording..."

  normalized_result: >
    The exact final result that would satisfy the request.

  required_outcomes:
    - id: RO-001
      text: "Required final property or result"
      modality: must
      terminal_required: true
      target:
        type: threshold | exact_state | qualitative_judgment | artifact
        value: "..."
      required_evidence:
        - evidence class

  completion_evidence:
    - exact candidate/hash binding
    - outcome-specific direct evidence

  non_satisfying_proxies:
    - "review ready"
    - "tests pass"
    - "supervisor approved"

  permitted_intermediate_states:
    - state: EARLY_OWNER_EVALUATION
      terminal: false

  explicit_owner_amendments: []
  supersedes: null
  owner_outcome_sha256: "..."
```

The owner may supply a less structured request. The system constructs this record without changing its meaning.

---

## 6. Derived task-contract requirements

Every downstream task contract must declare its relationship to the owner outcome:

```yaml
derivation:
  parent_owner_outcome_id: OO-...
  parent_owner_outcome_epoch: 1
  parent_owner_outcome_sha256: "..."
  contribution_type: decompose | refine | implement | verify | support

  required_outcome_coverage:
    - required_outcome_id: RO-001
      relation: directly_satisfies | contributes | verifies | not_addressed
      task_criterion_ids: [AC-...]
      explanation: "..."

  intentionally_not_addressed:
    - required_outcome_id: RO-...
      parent_task_remains_open: true
      owner_authorization_ref: null
```

Hard rules:

1. A child contract may be narrower as a **subtask**, but it must preserve a trace to the parent outcome and state that the parent remains open.
2. A root task contract may not omit a terminal-required owner outcome.
3. A threshold may not be weakened.
4. `must` may not become `should`, “good enough,” “review ready,” or “owner can decide later.”
5. A direct outcome may not be replaced by a supporting proxy.
6. Deferral does not erase an outcome. It requires either an explicit owner decision or an open parent task that still owns the requirement.
7. A new task contract is invalid until the derivation comparison passes.

---

## 7. Outcome-preservation proof

Before accepting a derived contract, construct a coverage matrix:

| Owner required outcome | Derived criterion(s) | Relation | Evidence required | Weakened? | Parent remains open? |
|---|---|---|---|---|---|

The contract passes only when:

- every terminal-required owner outcome is represented;
- each mapped criterion has equal or stronger modality and target;
- the proposed evidence can prove that outcome rather than only a proxy;
- any unaddressed outcome remains explicitly owned by an open parent task;
- no terminal state is reachable while a required root outcome is unowned.

If semantic equivalence cannot be determined deterministically, route the bounded comparison to Extra High or Pro according to the intelligence-routing policy. The comparison must include both the verbatim owner outcome and the derived contract.

---

## 8. Checkpoint and packet requirements

Every meaningful checkpoint and every supervision packet must carry:

```text
owner_outcome_id / epoch / SHA-256
verbatim owner request
normalized final result
required owner outcomes
current evidence for each required outcome
current gap to each required outcome
unmet and unknown required outcomes
known non-satisfying proxies
current derived-contract mapping
proposed workflow/terminal state
terminal-comparator result
```

A compact packet may reference content-addressed records, but it may not omit the effective owner outcome.

Packet validation fails closed when:

- the owner-outcome record is absent;
- its hash or epoch is stale;
- a required outcome is omitted;
- the normalized result conflicts with verbatim authority;
- the packet presents only downstream acceptance criteria;
- current gaps or unmet outcomes are missing;
- a proxy is presented as direct completion evidence.

Required packet status:

```text
CONTRACT_VALID
CONTRACT_LAUNDERING
OUTCOME_AUTHORITY_UNRESOLVED
PACKET_INCOMPLETE
```

A supervisor must not issue `ON_TRACK`, GREEN, or completion approval from a packet whose contract status is not `CONTRACT_VALID`.

---

## 9. Supervisor order of operations

The supervisor’s first question is not “Did the worker satisfy the task contract?”

It is:

> Does the current task contract and proposed finish line preserve the originating owner outcome without omission, weakening, or proxy substitution?

Required order:

1. Validate owner-outcome identity and authority.
2. Compare the derived contract to the owner outcome.
3. Validate the proposed terminal-state semantics.
4. Only then assess worker progress, method, verification, and alignment.

If the contract is laundered, the supervisor returns RED without approving the narrower framing, even when the worker completed every supplied acceptance criterion.

Supervisor approval is itself a judgment artifact. It is never substitute evidence for the owner outcome.

---

## 10. Deterministic terminal-state comparator

### 10.1 Inputs

```text
owner-outcome record
current derived task contract
root/subtask identity
proposed workflow state
candidate artifact/commit/hash
fresh evidence ledger
owner decisions/amendments
```

### 10.2 Comparison procedure

```text
1. Verify owner-outcome epoch and hash.
2. Verify the derived contract has a complete backward trace.
3. Detect omitted, weakened, deferred-without-owner, or proxy-replaced outcomes.
4. Determine whether the proposed state is terminal for the subtask, parent task, or root owner outcome.
5. Bind evidence to the exact candidate/commit/hash.
6. Evaluate every terminal-required outcome as MET / UNMET / UNKNOWN.
7. Refuse root terminalization unless every terminal-required outcome is MET.
8. Preserve supporting completed work and generate the remaining outcome gap.
```

### 10.3 Required decisions

```text
if owner outcome missing or ambiguous:
  HOLD: OUTCOME_AUTHORITY_UNRESOLVED

if derived contract omits or weakens a required outcome:
  RED: CONTRACT_LAUNDERING + SCOPE_CONTRACTION

if a proxy is used as direct satisfaction:
  RED: PROXY_SUBSTITUTION + COMPLETION_ILLUSION

if proposed root terminal state has any UNMET outcome:
  RED: OWNER_OUTCOME_UNMET + COMPLETION_ILLUSION

if proposed root terminal state has any UNKNOWN outcome:
  HOLD: COMPLETION_EVIDENCE_INSUFFICIENT

if a subtask is complete but parent outcomes remain:
  ALLOW: SUBTASK_COMPLETE_PARENT_OPEN

if owner requested early evaluation and state is explicitly nonterminal:
  ALLOW: EARLY_OWNER_EVALUATION_PARENT_OPEN

if every required root outcome is MET with fresh exact-candidate evidence:
  ALLOW: OWNER_OUTCOME_SATISFIED
```

### 10.4 No terminalization by naming

A workflow label does not determine whether a task is complete.

The following are nonterminal by default for a root outcome:

```text
READY_FOR_OWNER_REVIEW
HUMAN_REVIEW
HANDOFF_READY
EDITORIAL_REVIEW_READY
SUPERVISOR_APPROVED
PR_READY
TESTS_GREEN
```

They become terminal only when the owner explicitly requested that state as the final outcome.

---

## 11. Workflow-state semantics

Mission Control must distinguish:

```text
IN_PROGRESS
SUBTASK_COMPLETE_PARENT_OPEN
EARLY_OWNER_EVALUATION_PARENT_OPEN
HANDOFF_READY_PARENT_OPEN
DONE_CANDIDATE
OWNER_OUTCOME_SATISFIED
CANCELED_BY_OWNER
```

Only `OWNER_OUTCOME_SATISFIED` or an explicit owner cancellation/scope amendment closes the root outcome.

A worker may request early owner feedback without pretending the task is finished. The dashboard must show the current outcome gap and keep the task open.

---

## 12. Dashboard requirements

For every root task, show:

- verbatim/normalized owner outcome summary;
- outcome epoch and freshness;
- root outcome progress;
- subtask progress separately;
- unmet required outcomes;
- current gap;
- proposed terminal state;
- terminal-comparator result;
- proxy evidence warnings;
- contract-laundering status.

Do not display 100% task progress merely because a narrowed subtask or supporting gate is complete.

A task can display:

```text
supporting work: 100%
owner outcome: 13.82% / target unmet
state: IN_PROGRESS
traffic: RED if terminalization proposed; otherwise YELLOW/working
```

---

## 13. Exact regression scenario: article humanization at 13.82%

### 13.1 Given

Owner outcome:

```text
Humanize the final article, with Pangram as a required measurement.
```

Normalized required result:

```text
The exact final article satisfies the current project-defined Pangram humanization target while preserving required source integrity and editorial constraints.
```

Supporting evidence:

- preservation/integrity gates pass;
- article is editorially sound;
- supervisor approves review readiness;
- independent reader passes;
- candidate is bound to an exact hash;
- Pangram result is `13.82% Human` and does not meet the required target.

Proposed terminal state:

```text
READY_FOR_OWNER_REVIEW
```

Known non-satisfying proxies:

- editorially sound;
- source-integrity PASS;
- supervisor approval;
- `READY_FOR_OWNER_REVIEW`;
- independent-reader PASS.

### 13.2 Expected result

```text
traffic_light: RED
contract_status: CONTRACT_LAUNDERING
findings:
  - SCOPE_CONTRACTION
  - OBJECTIVE_SUBSTITUTION
  - PROXY_SUBSTITUTION
  - COMPLETION_ILLUSION
root_outcome_status: UNMET
required_directive: CONTINUE_HUMANIZATION
owner_decision_required: false
```

The completed preservation and editorial work remains valid evidence and must not be discarded. It is supporting work, not the final outcome.

A supervisor that returns GREEN or accepts root termination fails the regression.

---

## 14. Existing-task migration

At the next safe checkpoint, every active nontrivial worker must:

1. recover the original owner request and material later corrections;
2. create or verify the owner-outcome record;
3. compare the current task contract and completion boundary against it;
4. preserve valid supporting work;
5. reopen or continue any required outcome that was omitted or replaced by a proxy;
6. update the current gap and unmet-outcome ledger;
7. invalidate stale supervisor approvals that evaluated only a laundered contract.

Do not restart the project or discard valid work merely because the contract was narrowed. Repair the authority chain and continue from the latest useful boundary.

If the original request cannot be recovered, do not silently preserve the narrowed checkpoint. Mark `OUTCOME_AUTHORITY_UNRESOLVED`, search the canonical project records, and pause only the terminal/completion decision if useful reversible work can continue safely.

---

## 15. Required implementation tests

Mission Control must test at least:

1. Complete derived contract passes.
2. Omitted owner outcome returns `CONTRACT_LAUNDERING`.
3. Weakened threshold returns `CONTRACT_LAUNDERING`.
4. `must` changed to `should` fails.
5. Supporting proxy substituted for direct outcome fails.
6. Subtask completion with parent open succeeds without closing root.
7. Early owner evaluation succeeds only as nonterminal.
8. Supervisor GREEN cannot override an unmet required outcome.
9. Stale owner-outcome epoch invalidates packet and review.
10. Exact-candidate mismatch invalidates completion evidence.
11. Unknown required outcome blocks root terminalization.
12. The `13.82% Human` regression returns RED and continued humanization.
13. Explicit owner amendment creates a new outcome epoch and safely re-evaluates active tasks.
14. Valid supporting work survives contract repair.

Mutation/adversarial tests must include:

- deleting the Pangram outcome from the packet;
- renaming `READY_FOR_OWNER_REVIEW` to `DONE`;
- replacing the direct target with “supervisor approved”;
- lowering the target in a child contract;
- hiding unmet outcomes from the dashboard;
- marking parent closed when only a subtask is complete.

---

## 16. Limits

- Owner language can be genuinely ambiguous. The system must preserve uncertainty rather than manufacture a precise target.
- Not every outcome is numeric. Qualitative outcomes still require explicit criteria and evidence appropriate to the claim.
- A child task may validly finish before the owner outcome is satisfied, provided the parent remains open and the state is labeled truthfully.
- An owner may explicitly redefine the finish line. That creates a new outcome epoch; it does not retroactively make the old contract faithful.
- Deterministic mapping catches structural omissions and threshold weakening. Semantic equivalence may still require Extra High, Pro, or the owner.

---

## 17. Required relationship to other Mission Control patterns

This pattern is a required companion to:

- `patterns/codex-pro-supervision-mission-control.md`
- `patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md`
- `patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md`

When they conflict, this owner correction governs task-contract authority and terminal-state integrity.
