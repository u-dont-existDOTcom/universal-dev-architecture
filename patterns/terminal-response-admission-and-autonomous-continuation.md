# Terminal-Response Admission and Autonomous Continuation

## Problem

A durable checkpoint, context-compaction boundary, response-token limit, browser cleanup, provider cooldown, or tool-heavy turn can feel like a natural place for an execution worker to stop. That conversational/session boundary is not evidence that the active owner task is finished or genuinely blocked.

This failure is especially damaging on an exclusive long-running task: the worker may preserve perfect recovery state, know the exact next action, and still emit an owner-facing terminal handoff merely because the current response is ending. The owner then becomes an unnecessary scheduler for work the repository and controller could already resume automatically.

## Universal rule

For an exclusive active task, **ending a response is a controlled terminal action**.

Before any worker emits a terminal response, it must reconcile the current authoritative execution state:

1. current owner instruction or correction;
2. branch-bound active-task lock;
3. canonical durable current-state checkpoint;
4. live artifact/evidence ledger and current queue;
5. current Mission Control terminal comparison and structured blockers;
6. current chat-authored directive and any required reasoning handoff.

A terminal response is admitted only when at least one of these current, source-bound conditions is true:

- the requested root outcome is complete under its actual acceptance/terminal evidence gate;
- the owner has explicitly canceled, stopped, or replaced the current outcome;
- a genuine owner decision is required and no independent safe in-scope work remains;
- a genuine external blocker prevents the required frontier, has no admitted workaround or independent safe work remaining, and is durably recorded;
- a bounded execution directive has reached a real reasoning-review stop and the exact factual receipt has already been routed automatically to the configured reasoning chat.

A reasoning-review or external-blocker pause ends only the current execution turn. It does **not** close the root task. The controller must preserve resumability and continue automatically when the new directive arrives or the blocking condition clears.

## Non-terminal recovery events

None of the following is, by itself, permission for a terminal response:

- context compaction or context-window pressure;
- response/token-budget pressure;
- many tool calls or a long-running turn;
- a checkpoint or recovery commit;
- browser-tab cleanup or browser-memory pressure;
- a provider cooldown, temporary rate limit, retry/backoff interval, or transient tool outage;
- the end of a batch when the next batch/ordinal is already determined;
- ordinary green tests while task acceptance remains open;
- a worker-authored `blocked`, `done`, or handoff statement without current structured authority/evidence.

Treat these as recovery events. Persist state, compact/reopen/restart as necessary, then recover the active task and continue from the first missing or stale action without repeating verified work.

## Provider waits and cooldowns

When a required provider action is temporarily unavailable:

1. record the exact changing condition and admitted wait horizon;
2. advance independent safe in-scope work that does not depend on the provider;
3. keep checking the changing condition at the configured bounded interval;
4. resume the blocked frontier automatically when it clears;
5. terminally pause only when the wait is a genuine external blocker for **all** remaining authorized work and the controller has durable evidence of that state.

A cooldown is not an owner decision.

## Mission Control mechanical gate

Mission Control-managed execution workers must consult the deterministic final-response gate immediately before an owner-facing terminal response:

```text
GET /api/worker-channel/<worker>/finalization
```

The endpoint authenticates the execution worker but does not accept worker-supplied terminal facts. Mission Control reads its own current projected ledger and returns either:

```text
200 terminalResponseAllowed:true
```

or:

```text
409 terminalResponseAllowed:false
mustContinue:true
requiredNextAction:<durably derived next action>
```

A `409` means the worker must not emit a terminal handoff. It must execute or route the returned safe next action within existing authority.

The gate reuses the canonical Mission Control terminal comparator rather than creating a second completion model. It additionally checks current READY/IN_PROGRESS queue work, durable checkpoint next steps, structured blocker ownership/workarounds, recoverable wait conditions, and whether a required reasoning-review stop has actually been routed.

## Legitimate pause semantics

Use precise semantics:

- `ALLOW_ROOT_CLOSE` — the source-bound terminal comparator permits actual task completion.
- `ALLOW_OWNER_CANCELLATION` — current owner authority canceled the outcome.
- `ALLOW_OWNER_DECISION_PAUSE` — a current owner obligation exists and no independent safe work remains.
- `ALLOW_EXTERNAL_BLOCKED_PAUSE` — a genuine external blocker prevents all remaining authorized work, with no workaround.
- `ALLOW_REASONING_HANDOFF_PAUSE` — the current bounded execution turn stopped for reasoning and the exact factual handoff is already durably routed.

All pause states except root close/cancellation leave the root task open.

## Fail-closed findings

A rejected terminal attempt should preserve an explicit reason such as:

```text
REJECT_SAFE_WORK_REMAINS
REJECT_RECOVERABLE_WAIT_TERMINALIZATION
REJECT_UNROUTED_REASONING_STOP
REJECT_SELF_OWNED_BLOCKER
REJECT_BLOCKER_WITH_WORKAROUND
REJECT_UNVERIFIED_BLOCKED_STATE
REJECT_TERMINAL_PROOF_MISSING
```

Do not convert these into an owner question when the required next action is already mechanically known.

## Relation to other controls

This rule operationalizes, rather than replaces:

- `patterns/exclusive-active-task-locks.md`;
- the standing continuous-next-step rule in `patterns/codex-github-operating-system.md`;
- `templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md`;
- the Mission Control terminal comparator.

It does not broaden task scope or authority. Safety, privacy, security, permission, spending, publication, irreversible-action, and explicit owner-stop boundaries remain controlling.

## Origin / transfer rationale

Promoted from a 2026-09-02 AskRigor execution incident because the failure mechanism was generic: an execution worker with an exclusive active task treated response/context closure and a durable checkpoint as a terminal handoff even though the repository and private artifact ledger identified the exact safe next ordinal and no owner input was required. The worker later recovered and resumed from the next ordinal without repeating the prior verified artifact, demonstrating that the earlier terminal handoff was unnecessary.

The project later encountered a different, legitimate source-fixed evaluator retry boundary. That later blocked state is intentionally not generalized into this control: the lesson here is about **premature response terminalization when safe work remains**, not about changing evaluator retry policy.

## Limits

- The gate can only be as current as the Mission Control ledger and project recovery artifacts it projects.
- A true semantic ambiguity must still go to the authorized reasoning chat; deterministic continuation may not invent strategy.
- A real safety, permission, spending, publication, access, or irreversible-action boundary is not bypassed merely because other execution is possible.
- Tiny one-shot tasks without an exclusive active-task contract do not require this machinery.
