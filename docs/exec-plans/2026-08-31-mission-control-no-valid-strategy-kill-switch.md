# Mission Control — Reasoning-Strategy Competence and `NO_VALID_STRATEGY` Kill Switch

**Status:** Required owner correction; chat-authored implementation directive for the Mission Control Codex executor  
**Date:** 2026-08-31  
**Feedback ID:** `SDF-20260831-NO-VALID-STRATEGY-001`  
**Parent PR:** `u-dont-existDOTcom/universal-dev-architecture#42`

## 1. Controlling owner correction

The previous fixes kept the Codex↔reasoning-chat handoff alive and separated chat reasoning from Codex execution. They did not require the reasoning chat to admit when it lacked a justified next strategy.

The Somatic article loop therefore continued through many chat-authored short-fragment experiments while the whole-document owner outcome remained unmeasured or regressing. Codex followed bounded directives, but the reasoning supervisor kept issuing weak directives.

The governing correction is:

> **Automatic continuation requires a valid next strategy. If the reasoning chat cannot state a falsifiable root-level strategy, bounded execution cycle, direct evidence boundary, and kill condition, it must return `NO_VALID_STRATEGY`; Codex must stop substantive execution and remain parked.**

Liveness means the task and handoff remain recoverable. It does not mean substantive execution must continue.

## 2. Role boundary

This document is the reasoning decision. Codex must implement it mechanically.

Codex must not:

- redesign the rule;
- decide what counts as a valid strategy;
- invent a replacement strategy;
- choose thresholds for a live project;
- reinterpret the Somatic article evidence;
- resume the Somatic fragment method;
- treat implementation of this architecture as permission to supervise another task itself.

Extra High or Pro chats continue to own strategy selection and validity judgments. Codex implements schemas, validators, reducers, dashboard projections, fixtures, and tests exactly within this directive.

## 3. New independent control state

Add a reasoning-strategy authorization state independent of alignment and outcome progress:

```text
strategy_authorization:
  VALID_NEXT_STRATEGY
  NO_VALID_STRATEGY
  OWNER_DECISION_REQUIRED
  BLOCKED_EXTERNAL
  TASK_COMPLETE
  UNKNOWN
```

Add strategy-justification validity:

```text
strategy_justification:
  VALID
  INVALID
  INCOMPLETE
  STALE
  UNKNOWN
```

Required projection:

```text
worker_to_contract: GREEN
contract_to_owner: MATCH
outcome_advancement: FLAT or REGRESSING
strategy_justification: INCOMPLETE or INVALID
strategy_authorization: NO_VALID_STRATEGY
overall_control_state: RED
execution_state: PARKED_NO_VALID_STRATEGY
task_terminal: false
```

Do not average these states.

## 4. `VALID_NEXT_STRATEGY` admission contract

A reasoning chat may authorize another substantive Codex cycle only by supplying all of the following in a versioned reasoning decision:

```text
strategy_id
strategy_family_id
reasoning_supervisor identity and chat epoch
reviewed evidence boundary
root owner-outcome metric or explicit qualitative outcome state
causal hypothesis connecting the proposed action to the root outcome
why this strategy is materially different from failed/exhausted strategies
predicted root-level outcome change or decision-changing information
success threshold
failure threshold
one bounded execution cycle
cycle budget and cumulative family budget
maximum elapsed/turn/compute/call/spend limits as applicable
next direct root evidence boundary and deadline
proxy/leading-indicator status and validation receipt, if any
kill condition
what work is forbidden after failure or budget exhaustion
what would change the reasoning decision
owner-action state
```

A missing field yields:

```text
strategy_justification: INCOMPLETE
strategy_authorization: NO_VALID_STRATEGY
```

Vague directives such as these are invalid:

```text
keep trying
continue improving
try another variant
see what happens
work until done
make progress
find a better strategy
```

The execution directive template may reference a valid strategy decision, but Codex cannot author or repair that decision.

## 5. Proxy and child-metric rule

A fragment, subtask, local test, simulated score, reviewer judgment, or other child metric may justify continued root-task execution only when a current `LEADING_INDICATOR_VALIDATION` receipt establishes:

```text
root outcome metric
proxy metric
causal or empirical reason the proxy predicts the root metric
validation evidence
known limits and confounders
conditions under which the relationship holds
falsification condition
maximum proxy cycles before direct root measurement
expiry or revalidation boundary
reason the next proxy observation can change a named decision
```

Without that receipt:

- proxy improvement is not owner-outcome advancement;
- proxy success cannot authorize another similar cycle;
- the result may count only as bounded `STRATEGY_LEARNING` or `EVIDENCE_ACQUISITION`;
- the reasoning supervisor must return to direct root evidence or stop.

If evidence shows that the proxy is non-compositional, anchor-dependent, unstable, or dominated by unrelated context, set:

```text
proxy_validation: INVALIDATED
same_proxy_family_continuation_allowed: false
```

A Human `1.0` fragment, for example, cannot be treated as progress toward a whole-document Human `1.0` result without validated predictive evidence.

## 6. Strategy-family budgets

Every strategy belongs to a stable `strategy_family_id` and has a cumulative budget. Renaming, rewording, splitting, recombining, or changing a local variant does not reset the family budget.

Required budget dimensions, with `NOT_APPLICABLE` permitted only when truthful:

```text
maximum_cycles
maximum_elapsed_seconds
maximum_reasoning_turns
maximum_execution_runs
maximum_external_calls
maximum_paid_calls
maximum_spend
root_evidence_due_by_cycle
root_evidence_due_at
```

Each completed cycle must update:

```text
family_cycles_used
family_elapsed_used
reasoning_turns_used
execution_runs_used
external_calls_used
paid_calls_used
spend_used
root_evidence_status
```

When any hard family budget is exhausted:

```text
strategy_efficacy: EXHAUSTED
strategy_authorization: NO_VALID_STRATEGY
same_strategy_family_continuation_allowed: false
execution_state: PARKED_NO_VALID_STRATEGY
```

A fresh reasoning chat does not reset the evidence or family budget. It may authorize a materially different family only by satisfying the full admission contract.

## 7. Mandatory reasoning-stop behavior

The reasoning supervisor must return `NO_VALID_STRATEGY` when any of these applies:

- it cannot articulate a causal hypothesis tied to the root owner outcome;
- it cannot name direct or validated decision-changing evidence due at the end of the cycle;
- it cannot provide a hard kill condition;
- the proposed action is materially the same as an exhausted or failed strategy family;
- the only justification is activity, information volume, local elegance, or hope;
- the proposed proxy is unvalidated or invalidated;
- the direct root metric is overdue and another proxy cycle would postpone it;
- the budget is exhausted;
- the reasoning context is saturated or contaminated and cannot reliably assess the next move;
- available evidence does not distinguish among proposed strategies enough to authorize execution.

`NO_VALID_STRATEGY` means:

```text
task remains open
Codex substantive execution stops
safe checkpoint/evidence preservation may finish
reasoning handoff remains durable
owner is not automatically required
dashboard explains why the task is parked
```

The owner is asked only when owner authority, source, threshold, policy, spending, publication, destructive action, or a genuine tradeoff is required. “The chat does not know what to try” is not by itself an owner decision.

## 8. Liveness precedence correction

Amend the closed-loop handoff rule:

```text
A live handoff guarantees that every nonterminal task has a truthful next control state.
It does not guarantee that every nonterminal task has a substantive execution action.
```

Permitted nonterminal frontiers include:

```text
WAITING_FOR_REASONING_REVIEW
PARKED_NO_VALID_STRATEGY
BLOCKED_EXTERNAL
OWNER_DECISION_REQUIRED
```

Automatic resumption is permitted only for a validated response containing:

```text
strategy_authorization: VALID_NEXT_STRATEGY
```

A response containing `NO_VALID_STRATEGY` must be imported exactly once and must park Codex. The controller continues monitoring state; it does not repeatedly ask the same chat to invent another strategy.

## 9. Reasoning-context saturation

Add:

```text
reasoning_context_state:
  HEALTHY
  COMPACT_REQUIRED
  ROLLOVER_REQUIRED
  SATURATED
```

Indicators include:

- repeated generation of materially similar strategies;
- revival of invalidated proxies;
- confusion between local and root metrics;
- failure to remember prior negative results;
- strategy relabeling without material difference;
- inability to state what would falsify the current hypothesis;
- high reasoning volume with no new decision-changing evidence.

When `SATURATED`:

```text
current_chat_may_authorize_substantive_execution: false
```

A fresh chat may review a compact evidence capsule. Rollover does not itself authorize work. The fresh chat must still satisfy the complete `VALID_NEXT_STRATEGY` contract or return `NO_VALID_STRATEGY`.

## 10. Required schemas

Create:

```text
templates/REASONING-STRATEGY-DECISION.json
templates/LEADING-INDICATOR-VALIDATION.json
```

### 10.1 `REASONING-STRATEGY-DECISION.json`

It must include all admission fields in section 4 and explicit fields for:

```text
strategyAuthorization
strategyJustification
strategyFamilyId
materialDifferenceFromPriorFamilies
proxyValidationRef
budget
budgetConsumed
rootEvidenceBoundary
killCondition
forbiddenAfterFailure
reasoningContextState
whatWouldChangeDecision
ownerActionRequired
```

### 10.2 `LEADING-INDICATOR-VALIDATION.json`

It must include every field in section 5 and states:

```text
VALID
PARTIAL
INVALIDATED
EXPIRED
UNVALIDATED
```

## 11. Existing schema changes

### 11.1 `templates/CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json`

Increase the schema version and require:

```text
strategyDecisionRef
strategyDecisionSha256
strategyAuthorization == VALID_NEXT_STRATEGY
strategyFamilyId
cycleOrdinal
familyBudgetSnapshot
rootEvidenceDueAtStopBoundary
killCondition
```

Reject a substantive execution directive whose referenced reasoning decision is missing, stale, invalid, incomplete, mismatched to the owner-outcome epoch/evidence boundary, or not `VALID_NEXT_STRATEGY`.

Add to forbidden decisions:

```text
invent or repair a missing strategy justification
continue because the task is nonterminal
continue after NO_VALID_STRATEGY
reset a strategy-family budget through relabeling
interpret an unvalidated proxy as root-outcome progress
```

### 11.2 `templates/OUTCOME-PROGRESS-RECEIPT.json`

Add:

```text
strategyAuthorization
strategyJustification
strategyFamilyId
proxyValidationState
familyBudgetConsumed
rootEvidenceOverdue
reasoningContextState
parkReason
```

### 11.3 `templates/EXECUTOR-REASONING-HANDOFF.json`

Accept these reasoning response kinds:

```text
NEXT_EXECUTION_DIRECTIVE
NO_VALID_STRATEGY
REASONING_HOLD
OWNER_DECISION_REQUIRED
NO_FURTHER_EXECUTION_AUTHORIZED
```

`NO_VALID_STRATEGY` transitions to `PARKED_NO_VALID_STRATEGY`, not `EXECUTION_RESUMED` and not task completion.

### 11.4 Shared bootstrap

Add an explicit rule:

> **Do not keep Codex busy merely because the task remains open. A reasoning chat that lacks a valid next strategy must say so and park execution.**

## 12. Reference validator/reducer

Extend or create a deterministic pure validator for reasoning-strategy admission. It must provide behavior equivalent to:

```python
validate_reasoning_strategy_decision(decision, owner_outcome, evidence_state, strategy_history)
validate_leading_indicator(receipt, root_outcome)
authorize_execution_directive(directive, strategy_decision)
apply_strategy_result(strategy_state, result)
```

It must detect:

```text
STRATEGY_JUSTIFICATION_MISSING
STRATEGY_JUSTIFICATION_INCOMPLETE
NO_VALID_STRATEGY
UNVALIDATED_PROXY_CONTINUATION
INVALIDATED_PROXY_REUSED
STRATEGY_FAMILY_BUDGET_EXCEEDED
ROOT_EVIDENCE_OVERDUE
SAME_STRATEGY_FAMILY_RELABELED
REASONING_CONTEXT_SATURATED
EXECUTION_AFTER_NO_VALID_STRATEGY
```

Codex implements the validator mechanically from these rules. It does not choose live strategy validity.

## 13. Mission Control dashboard

Each task card/detail page must show:

```text
reasoning strategy authorization
strategy justification state
active strategy and stable family ID
causal hypothesis
root owner-outcome metric
proxy metric and validation state, if any
cycle and cumulative family budget used/remaining
root evidence due boundary
kill condition
reasoning context state
park reason
owner action
```

Required owner-readable state:

```text
PARKED — NO VALID STRATEGY

Why:
The reasoning supervisor cannot currently justify another bounded action that
has a validated path to the owner outcome.

What stopped:
Substantive Codex execution and the exhausted strategy family.

What remains active:
The task, evidence, and reasoning handoff.

Owner action:
NONE, unless an exact owner decision/source is separately identified.
```

Do not show a parked task as `worker stopped`, `done`, or generic `blocked`.

## 14. Exact Somatic regression

Create a hostile fixture based on the observed failure:

```text
owner root metric: whole-document Pangram Human == 1.0
best whole-document result: 0.1547368467
later whole-document results: 0.1381948739 and 0.1231321841
fourteen short surface experiment directives
some fragment boundaries: Human 1.0
whole-document progress from those fragments: unmeasured
proxy validation: absent, then invalidated by anchor dependence/non-compositionality
same strategy family: local fragment detector optimization
root-level cycle budget: absent or exceeded
owner had to ask why no progress occurred
```

Required result before a fifteenth fragment family/cycle:

```text
strategy_justification: INVALID
strategy_authorization: NO_VALID_STRATEGY
strategy_efficacy: EXHAUSTED
same_strategy_family_continuation_allowed: false
execution_state: PARKED_NO_VALID_STRATEGY
task_terminal: false
owner_action_required: false
alerts:
  - UNVALIDATED_PROXY_CONTINUATION
  - ROOT_EVIDENCE_OVERDUE
  - STRATEGY_FAMILY_BUDGET_EXCEEDED
  - OWNER_FORCED_PROGRESS_REVIEW
```

The system fails if it issues another fragment directive merely because the preceding experiment generated information.

## 15. Required executable tests

At minimum, execute these cases:

1. A complete, current strategy decision satisfying every field authorizes exactly one bounded execution cycle.
2. Missing causal hypothesis yields `NO_VALID_STRATEGY`.
3. Missing direct evidence boundary yields `NO_VALID_STRATEGY`.
4. Missing kill condition yields `NO_VALID_STRATEGY`.
5. Vague “keep trying” directive is rejected.
6. An unvalidated proxy improvement cannot be classified as root progress or authorize another proxy cycle.
7. An invalidated proxy cannot be reused under a renamed experiment.
8. A renamed strategy with the same family does not reset cumulative budget.
9. Family cycle/time/call/spend exhaustion parks execution.
10. Root evidence overdue blocks another proxy cycle.
11. `NO_VALID_STRATEGY` imports exactly once and transitions to `PARKED_NO_VALID_STRATEGY`.
12. Parked execution leaves the task open and owner action `NONE` by default.
13. The durable controller may remain live while Codex is parked.
14. A fresh chat rollover does not reset budget or automatically authorize execution.
15. Saturated reasoning context cannot issue a new substantive directive.
16. A genuinely materially different strategy family with a new causal hypothesis may be considered, but only after full admission validation.
17. The exact Somatic 14-fragment failure parks before another fragment cycle.
18. A whole-document strategy with one complete rewrite cycle, direct whole-document measurement boundary, and explicit failure threshold passes admission.
19. If that whole-document result is at or below the prior best, AI rewrite continuation is forbidden unless a materially different family is independently authorized.
20. If it improves but remains below target, the result returns to reasoning review; it does not automatically open a fragment loop.
21. No Codex function or receipt may authoritatively change `strategyAuthorization` from `NO_VALID_STRATEGY` to `VALID_NEXT_STRATEGY`.
22. Dashboard projection clearly distinguishes `PARKED_NO_VALID_STRATEGY` from completion, ordinary blocking, and waiting for a response.

## 16. Bounded implementation scope

Modify only the Universal supervision architecture, schemas, reference reducer/tests, dashboard contract/fixtures, indexes, and PR documentation needed to implement this correction.

Do not:

- modify the active Somatic article or its strategy;
- run article detector actions;
- create a live replacement strategy for any project;
- reopen closed handoff-liveness or resource-accounting feedback;
- claim the runtime/dashboard enforcement is deployed unless exercised end to end;
- expand into a general autonomous strategy generator.

## 17. Verification

Run:

```text
focused new tests
all existing Universal tests
JSON validation
Python compile where relevant
git diff --check
repository audit
hosted CI on the final provenance head
```

Return one immutable Codex execution receipt containing exact heads, files, tests, deviations, and missing evidence. Route it to the shared Pro supervision-design lane for implementation review.

## 18. Completion boundary

This implementation slice is complete only when:

- the schemas and reducer reject substantive execution without a valid strategy decision;
- `NO_VALID_STRATEGY` parks Codex without closing the task;
- unvalidated proxies cannot sustain a strategy family;
- family budgets and root-evidence deadlines are enforced across renamed variants and chat rollovers;
- the Somatic regression stops before another fragment cycle;
- the dashboard contract makes the parked state and owner action obvious;
- all verification passes;
- Pro implementation review is recorded or its exact external blocker is preserved.
