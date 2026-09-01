# Mission Control — Chat Reasoning / Codex Execution Migration

**Status:** Required owner correction and immediate implementation boundary  
**Date:** 2026-08-31  
**Controlling pattern:** `patterns/chat-led-reasoning-codex-execution-separation.md`

## 1. Objective

Remove reasoning-controller authority from Codex workers. Make Extra High the default task reasoning supervisor, Pro the escalation path for the highest-intelligence decisions, and Codex a bounded executor used only for local/tool-backed work chats cannot reliably perform.

The migration is incomplete until the runtime and current workers demonstrate:

```text
chat decision -> versioned execution directive -> Codex execution receipt
-> independent chat review -> next directive
```

Codex-generated self-supervision or strategy selection is not accepted as supervision.

## 2. Immediate current-worker containment

At each current Codex worker's next safe boundary:

1. Stop new substantive execution.
2. Preserve branch/worktree, artifacts, tests, runtime state, and unresolved blockers.
3. Identify the last exact chat-authored directive.
4. If none exists, set `SUPERVISION_DIRECTIVE_MISSING`.
5. Identify strategic, editorial, scientific, product, progress, completion, or Pro-routing decisions Codex made itself.
6. Reclassify those decisions as non-authoritative proposals/claims.
7. Return a `CODEX-EXECUTION-RECEIPT` containing exact evidence.
8. Send the receipt and current authority capsule to the assigned Extra High reasoning chat.
9. Resume only after receiving a versioned `CHAT-TO-CODEX-EXECUTION-DIRECTIVE`.

Do not discard valid work. Preserve it as evidence or supporting work.

## 3. Reasoning supervisor assignment

Every active task must have:

```text
reasoning_supervisor_surface: EXTRA_HIGH | PRO
reasoning_supervisor_session_id
reasoning_supervisor_chat_epoch
last_reasoning_review_at
last_reasoning_reviewed_head_or_artifact
current_strategy_id
active_execution_directive_id
next_reasoning_review_trigger
```

Default to Extra High. Allocate Pro only for a named decision under the current routing rules.

A task without an assigned/current reasoning supervisor may preserve state but cannot begin new substantive Codex execution.

## 4. Directive and receipt implementation

Implement and validate:

- `templates/CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json`
- `templates/CODEX-EXECUTION-RECEIPT.json`

Required runtime behavior:

- reject a substantive Codex start with no active directive;
- reject an expired/superseded directive;
- bind directive to task, owner-outcome epoch/hash, chat decision, strategy and evidence boundary;
- record allowed/forbidden actions and decision authority;
- stop at the first declared review trigger;
- import execution receipt separately from supervisory verdicts;
- prevent receipt fields from populating authoritative progress/adequacy/completion state;
- require chat review before the next directive.

## 5. Dashboard changes

Show on every task card/detail:

```text
Reasoning supervisor: Extra High / Pro
Reasoning chat epoch and last review age
Active strategy
Active execution directive
Codex execution state
Directive stop/review boundary
Latest execution receipt
Pending reasoning review
Outcome progress and strategy efficacy from the chat supervisor
Pro escalation state
Owner action
Handoff ID and lease owner
Review request delivery state
Compact polling freshness and next poll
Reasoning response import state
Next directive and automatic-resume state
```

Required alerts:

```text
SUPERVISION_DIRECTIVE_MISSING
CODEX_RUNNING_WITHOUT_CURRENT_DIRECTIVE
DIRECTIVE_SCOPE_EXCEEDED
REASONING_REVIEW_OVERDUE
CODEX_AUTHORED_STRATEGY_CHANGE
CODEX_AUTHORED_SUPERVISORY_VERDICT
CODEX_CONTINUED_AFTER_STOP_TRIGGER
CODEX_SUBSTANTIVE_PROSE_AUTHORSHIP_UNAUTHORIZED
OWNER_FORCED_PROGRESS_REVIEW
EXECUTOR_HANDOFF_DROPPED
REASONING_RESPONSE_NOT_AWAITED
DUPLICATE_REASONING_REQUEST
REASONING_RESPONSE_DUPLICATE_IMPORT
HANDOFF_LEASE_EXPIRED
HANDOFF_BLOCKED
```

The dashboard must never label a task supervised merely because Codex produced a detailed checkpoint or contacted Pro.

## 6. Article workflow migration

For Somatic and other article tasks:

```text
Extra High / Pro chat
  -> interprets owner source
  -> chooses editorial strategy
  -> authors or approves exact candidate prose
Codex
  -> stores exact source/candidate bytes
  -> materializes the chat-authored candidate
  -> runs preservation, traceability, link/native-object, detector and browser execution
  -> returns exact receipts
Chat
  -> decides whether the outcome advanced and what prose/strategy changes next
```

Codex may not author the substantive humanization candidate, decide its editorial quality, or select the next prose strategy.

Current Somatic boundary:

- old model-led rewrite strategy is failed/superseded;
- Pro selected owner-transcript reconstruction;
- the owner-language request is chat reasoning, not Codex strategy authority;
- after owner source arrives, a chat must interpret it and author the new candidate;
- Codex may preserve the transcript, apply exact chat-authored text, run checks/measurement, and return evidence.

## 7. Software workflow migration

For Mission Control and other software tasks:

```text
Extra High chat
  -> architecture / acceptance criteria / patch plan / tests
Codex
  -> bounded implementation / local runtime / tests
Extra High chat
  -> diff/evidence review / next directive
Pro
  -> only a genuinely Pro-level decision
```

Codex tactical implementation freedom is allowed only inside the declared architecture and behavior boundary.

## 8. Browser relay

Codex/browser automation may:

- open/reuse the specified reasoning chat;
- paste an exact chat-authored packet;
- submit once;
- recover the exact response;
- return it for durable import;
- execute verified account switching and tab cleanup.

It may not choose the model/chat, author the substantive question, interpret the answer as architecture authority, or issue the next directive.

## 8A. Closed-loop handoff implementation

The migration is not complete when Codex merely returns an execution receipt.

Implement:

```text
receipt persisted
-> one review request submitted
-> delivery confirmed
-> WAITING_FOR_REASONING_REVIEW
-> compact PENDING/READY polling
-> response persisted and imported exactly once
-> next directive validated
-> execution resumed
```

The active executor or deterministic relay must retain a handoff lease. It may
not terminate the loop and make the owner relay the receipt or restart Codex.

Use Codex-held waiting only as the current compatibility implementation. The
target runtime moves waiting and wake-up responsibility into Mission Control or
the Symphony-compatible orchestrator so that Codex usage is not consumed by an
idle wait.

No polling operation may send a second chat message or retrieve a full
conversation transcript. Large completed responses are persisted externally and
referenced by identity/hash.

A wait-horizon failure becomes `HANDOFF_BLOCKED`, not completion.

Mission Control projects:

```text
handoff_id
handoff_lease_owner
review_request_id
review_request_delivery_state
reasoning_handoff_state
last_compact_poll_at
next_poll_at
reasoning_response_id
reasoning_response_artifact_ref
response_import_state
next_directive_id
automatic_resume_state
```

The dashboard must show, for example:

```text
Waiting for Extra High review — request rr_123
Last checked: 42 seconds ago
Next check: 18 seconds
No owner action required
```

It must not describe this nonterminal state as `Worker stopped`.

## 9. Hostile acceptance fixtures

Implement `evals/mission-control/codex-self-supervision-articles-failure.json` and test:

1. Codex executes extensive article work and direct outcome regresses.
2. Codex remains locally compliant.
3. Codex initiates progress review only after owner prompting.
4. Result is `REASONING_SUPERVISION_FAILED`, not successful supervision.
5. Codex strategy authority is `NONE`.
6. Same-strategy execution stops.
7. Extra High/Pro selects replacement strategy.
8. Codex receives only a bounded directive.
9. An exact chat-authored prose candidate may be materialized/tested by Codex.
10. Codex-authored substantive prose without directive authority fails closed.

Also test:

- Codex starts without directive -> HOLD/FAIL;
- directive expires at measurement -> reasoning review required;
- Codex returns a progress classification -> stored only as a non-authoritative claim;
- Codex changes strategy after test failure -> RED/HOLD;
- chat issues a replacement strategy -> new directive accepted;
- low-level compile repair within tactical freedom -> accepted;
- chat unavailability holds only the affected substantive boundary.

## 10. Resource and context behavior

- Extra High is the default persistent reasoning supervisor where available.
- Use compact authority capsules and delta evidence to avoid context overflow.
- Reuse the reasoning chat while scope/context remains healthy.
- Roll over with a deterministic capsule at context, authority, contamination, account, or independence boundaries.
- A Pro limit does not authorize Codex to reason in its place; route ordinary reasoning to Extra High or hold the specific Pro-level decision.
- A Codex limit does not block chat reasoning; prepare directives/reviews and execute later or through the authorized secondary execution account.

## 11. Completion criteria

This migration slice is complete only when:

1. Current workers stop self-identifying as reasoning controllers.
2. Every nontrivial Codex run is directive-bound.
3. Every run returns an execution-only receipt.
4. Extra High or Pro assigns alignment, progress, strategy, adequacy and completion state.
5. Codex cannot author strategy changes or substantive supervisory verdicts.
6. Article substantive prose is chat-authored or exact-transformation-authorized.
7. Dashboard exposes reasoning supervisor, directive, receipt and review freshness.
8. Hostile fixtures pass.
9. Current Somatic task is migrated to chat-led transcript interpretation and candidate authoring.
10. The shared Pro design review is recorded or an exact external-review blocker remains visible.
11. Every reasoning-review boundary retains a durable handoff lease, imports one matching response exactly once, and resumes automatically or records an authoritative hold/blocker.

Do not claim the overall Mission Control outcome complete at this slice.
