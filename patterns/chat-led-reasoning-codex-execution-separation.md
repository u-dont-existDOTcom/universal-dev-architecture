# Chat-Led Reasoning and Codex Execution Separation

**Status:** Required owner correction and superseding control for the Mission Control architecture  
**Date:** 2026-08-31  
**Authority:** Owner correction: chats perform the reasoning; Codex is used only for execution that chats cannot reliably perform.

## 1. Normative correction

The prior architecture still allowed Codex to behave as a combined controller, strategist, self-supervisor, and executor. That is prohibited.

The controlling rule is:

> **Chat surfaces own reasoning. Codex owns only bounded execution that chat surfaces cannot reliably perform.**

**Extra High by default; Pro only when the decision materially requires the highest available semantic judgment.**

Default reasoning surface:

```text
Extra High chat
```

Escalated reasoning surface:

```text
Pro chat
```

Execution surface:

```text
Codex
```

A Codex session is not a substitute for a reasoning supervisor merely because it can generate plans, explanations, prose, or supervisory packets. Those are reasoning outputs and belong to a chat.

The only reasoning Codex may perform is narrowly instrumental reasoning unavoidable for executing an already authorized directive, such as locating the precise file, resolving a compile error inside the declared scope, or choosing an equivalent command. Codex may not make project-level semantic, strategic, editorial, scientific, therapeutic, product, or supervision decisions.

---

## 2. Established-work mapping and disposition

This separation adapts established control/data-plane and planner/executor patterns:

- planner/executor separation;
- command versus observation separation;
- controller/actuator feedback loops;
- independent evaluator or critic roles;
- least-authority execution;
- human-in-the-loop supervisory control.

The reusable principle is that the component making consequential judgments must be distinct from the actuator performing the work and reporting its own success.

Disposition: **adapt + compose**.

The task-specific novel remainder is a ChatGPT/Codex routing contract that preserves chat intelligence and context while using Codex only for tool-backed execution.

---

## 3. Required topology

```text
OWNER
  -> REASONING SUPERVISOR CHAT
       default: Extra High
       escalation: Pro
       fresh adjudication: fresh Pro when independence matters
  -> EXECUTION DIRECTIVE
  -> CODEX EXECUTOR
  -> EXECUTION RECEIPT + RAW EVIDENCE
  -> DETERMINISTIC COLLECTOR / MISSION CONTROL
  -> REASONING SUPERVISOR CHAT
  -> next directive, strategy change, Pro escalation, or owner decision
```

Codex does not supervise itself.

Mission Control does not ask Codex to decide whether the task is aligned, progressing, scientifically adequate, safe, publishable, or complete. Mission Control supplies the evidence to a chat that decides those questions.

---

## 4. Chat reasoning authority

The assigned reasoning supervisor chat owns:

- reconstructing and preserving the owner outcome;
- task decomposition and contract derivation;
- strategy selection and causal hypothesis;
- deciding what evidence can change the strategy;
- interpreting ambiguous requirements;
- evaluating worker-to-contract alignment;
- evaluating contract-to-owner alignment;
- evaluating owner-outcome advancement;
- evaluating strategy efficacy;
- deciding whether a strategy must stop or change;
- deciding whether owner input is genuinely required;
- writing or editing substantive article prose;
- evaluating article meaning, voice, argument, and editorial function;
- ordinary architecture and implementation reasoning;
- evaluating scientific inference and research flaws;
- deciding whether Pro is required when that is not already obvious;
- composing the next bounded execution directive.

Default these functions to Extra High. Use Pro for the highest-intelligence decisions under the existing routing rules, especially therapy semantics, AskRigor scientific/conclusion validity, difficult strategy replacement, and consequential supervision-design judgments.

A chat may use deterministic tools, GitHub connectors, evidence dossiers, and files. Lack of local terminal access is a reason to delegate execution to Codex, not a reason to delegate reasoning.

---

## 5. Codex execution authority

Codex may:

- run terminal commands;
- inspect local runtime/process state;
- apply exact text, patch, or structured changes authored or authorized by a chat;
- perform bounded multi-file implementation within an explicit design;
- install dependencies;
- build, lint, typecheck, and test;
- launch and inspect local services;
- perform Git/worktree operations;
- collect hashes, diffs, logs, screenshots, and runtime artifacts;
- use browser/OS automation when required;
- submit or retrieve an already authorized external action;
- record exact execution evidence;
- report an execution ambiguity or blocker without deciding it.

Codex may not:

- choose the project strategy;
- decide what the owner “really meant”;
- rewrite the task contract or acceptance boundary;
- classify overall alignment, progress, strategy efficacy, safety, scientific adequacy, release adequacy, or completion;
- decide that supporting work constitutes owner-outcome progress;
- author a substantive article rewrite or editorial theory unless a chat supplied the wording or an explicitly bounded mechanical transformation;
- decide which evidence should overrule the owner outcome;
- decide whether Pro is needed;
- decide whether an owner decision is needed, except to report that the directive lacks required authority or input;
- compose a supervisory verdict;
- compose the substantive question for a Pro supervisor from its own interpretation;
- continue beyond the directive’s declared stop/review boundary;
- respond to failure by inventing a new strategy.

Codex can recommend that the reasoning supervisor review an ambiguity, but the recommendation is only an execution observation.

---

## 6. Execution directive contract

Every nontrivial Codex run must be bound to a chat-authored, versioned directive.

Canonical template:

`templates/CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json`

Required fields:

```text
directive_id
task_id
owner_outcome_id / epoch / hash
reasoning_supervisor_session_id
reasoning_supervisor_mode
strategy_id
directive_revision
exact execution objective
chat-authored reasoning summary
allowed actions and paths
forbidden actions and decisions
exact inputs and candidate/artifact identities
commands or implementation boundaries
required evidence and tests
stop/review triggers
maximum execution horizon
ambiguity behavior
owner-decision prohibition
```

A directive may leave tactical implementation freedom, but it must state the decision boundary. “Continue until done,” “figure out what to do,” or “improve the article/system” is not a valid Codex execution directive.

For editorial work, the directive must include one of:

- exact chat-authored replacement text;
- exact authorized transformation operations;
- a bounded request to materialize/compare/validate candidates already authored in chat.

It must not ask Codex to invent the prose strategy.

---

## 7. Execution receipt contract

Codex returns facts, artifacts, and execution claims—not a supervisory decision.

Canonical template:

`templates/CODEX-EXECUTION-RECEIPT.json`

Required fields:

```text
receipt_id
directive_id
task_id
run_id
starting and ending repository identity
commands/actions attempted
files changed and exact diff/artifact refs
tests/checks and exact results
runtime observations
unexpected deviations
unresolved ambiguities
hard blockers
owner input physically unavailable, if applicable
required evidence collected / missing
stop trigger reached
Codex self-claim of execution completion
```

The receipt must not contain authoritative fields for:

```text
contract_to_owner_alignment
outcome_advancement
strategy_efficacy
scientific_adequacy
release_adequacy
owner_outcome_achieved
```

Those are chat-supervisor outputs.

---

## 8. Required review cycle

A reasoning supervisor review is required:

- before the first nontrivial Codex directive;
- after every directive reaches its stop boundary;
- after every direct outcome measurement;
- after any material deviation or blocker;
- before repeating a materially similar failed action;
- before a new strategy begins;
- before consuming another scarce/paid resource;
- at phase transitions;
- before owner review, release, publication, deployment, or completion;
- when a configured time/turn/commit/compute horizon expires without a supervisor review.

Codex may execute multiple commands inside one bounded directive. It may not free-run across strategy or phase boundaries.

A task without a current reasoning-supervisor directive is:

```text
SUPERVISION_DIRECTIVE_MISSING
```

and cannot begin new substantive execution.

Safe mechanical cleanup, evidence preservation, and checkpointing may continue when explicitly pre-authorized.

---

## 8A. Closed-loop reasoning-handoff liveness

A directive stop or review trigger stops only further substantive execution under
that directive. It does not make the task, executor run, workflow, or
owner-facing interaction terminal.

When a Codex execution receipt requires reasoning review, the authoritative next
state is:

```text
WAITING_FOR_REASONING_REVIEW
```

This is a nonterminal control-plane state with an executable frontier.

Before relinquishing the active handoff lease, the execution controller must:

1. persist the immutable execution receipt;
2. create one reasoning-review request ID and idempotency key;
3. submit the exact pre-authorized review packet to the directive-bound reasoning chat;
4. recover exact request identity after ambiguous submission rather than resubmitting speculatively;
5. confirm that exactly one logical request is outstanding;
6. await the matching response through read-only compact polling;
7. persist the completed response under an exact response ID and SHA-256;
8. validate its request ID, task ID, owner-outcome epoch, evidence boundary, response kind, and directive schema;
9. import and apply the response exactly once;
10. resume automatically when a valid next execution directive is present.

The reasoning chat does not reactivate Codex. The durable execution controller
owns continuation.

This reasoning-handoff loop does not authorize generic waiting elsewhere. Any
non-handoff wait must pass the current scoped-blocker and wait-admission
controls. A repository-global status label or open issue is not a wait source
without current task scope, causal dependency, an exact condition capable of
changing, an actor or mechanism, and a bounded horizon.

The directive's action class is part of execution authority. `SUBSTANTIVE_EXECUTION` requires a validated exact task checkpoint and an `AUTHORIZED` frontier. `AUTHORITY_RECOVERY`, `EVIDENCE_PRESERVATION`, and `REASONING_HANDOFF` are narrow non-substantive classes with explicit action allowlists; they may preserve or restore control under unresolved, invalid, or ambiguous authority but may not mutate the product. An unfilled placeholder directive is parseable JSON, not executable authority.

Until a deterministic Mission Control relay is operational, the active
Codex/browser controller holds this lease where the execution surface permits.
The target architecture transfers the lease to Mission Control or the
Symphony-compatible orchestrator so that Codex may be parked without making the
workflow terminal.

### Polling contract

Intermediate polls are read-only and must not send repeated messages into the
reasoning conversation.

Each intermediate poll returns only one compact envelope:

```json
{
  "state": "PENDING",
  "requestId": "rr_...",
  "observedAt": "...",
  "retryAfterSeconds": 30
}
```

or:

```json
{
  "state": "READY",
  "requestId": "rr_...",
  "responseId": "resp_...",
  "responseRef": "artifact-or-message-reference",
  "sha256": "...",
  "sizeBytes": 0
}
```

Intermediate polling must never return or re-ingest complete conversation
turns, the full prior packet, or the completed response body.

Polling intervals, maximum wait horizon, and owner-visible update interval are
explicit directive/runtime configuration. Polling uses bounded backoff and
must not create an unbounded busy loop.

### Response handling

A completed response is persisted outside conversation context when practical.
The executor receives only the validated response envelope and bounded next
directive required for execution.

The transport may re-read the same response ID after an interrupted read that
occurred before durable persistence. Import and directive application remain
exactly once through a stable idempotency key.

Duplicate `READY` observations, duplicate browser reads, or repeated event
delivery must not produce duplicate response imports or duplicate execution.

### Genuine boundaries

The handoff loop may stop without a next directive only when one of these is
durably established:

- genuine owner decision or missing owner source;
- unavailable authentication, permission, or credential;
- destructive or irreversible-action boundary;
- spending, publication, deployment, or equivalent owner gate;
- explicit owner stop or cancellation;
- reasoning surface unavailable beyond its configured wait horizon;
- platform/runtime termination after the handoff lease has been durably transferred to Mission Control;
- explicit reasoning response that no further execution is currently authorized.

A reasoning-surface timeout or temporary `PENDING` state is not completion.

When the wait horizon expires, persist:

```text
HANDOFF_BLOCKED
```

with the exact request ID, last poll, reason, retry schedule, lease owner, and
owner-action state. Do not silently end the task.

### Required failures

Raise `EXECUTOR_HANDOFF_DROPPED` when a receipt requiring reasoning review is
produced but no durable review request or accepted lease transfer follows.

Raise `REASONING_RESPONSE_NOT_AWAITED` when the execution controller voluntarily
relinquishes the handoff while a matching response can still be awaited within
the authorized boundary.

Raise `DUPLICATE_REASONING_REQUEST` when more than one logical request is
created for the same receipt and review boundary.

Raise `REASONING_RESPONSE_DUPLICATE_IMPORT` when the same response identity is
imported or applied more than once.

A task must not appear supervised merely because an execution receipt exists.
The closed loop is complete only after the receipt is reviewed and the resulting
directive, hold, owner gate, or no-further-execution decision is durably
recorded.

---

## 9. Progress and strategy ownership

The reasoning supervisor, aided by deterministic evidence, owns the outcome-progress receipt.

Codex supplies:

- exact measurements;
- work performed;
- artifacts;
- errors;
- elapsed execution facts;
- candidate identities.

The chat supervisor determines:

- whether the owner outcome advanced;
- whether a negative result is useful strategy learning;
- whether the current method remains viable;
- what work must stop;
- what replacement method should be tried;
- what next evidence can change the decision.

Therefore:

```text
Codex-generated progress audit = non-authoritative
Chat-supervisor progress judgment = authoritative when bound to current evidence
```

A progress review initiated only after the owner asks is a supervision failure, even when Codex subsequently prepares a good packet.

---

## 10. Editorial and article workflow

For article work:

```text
Extra High / Pro chat
  -> reconstructs argument and owner voice
  -> writes or approves exact candidate prose
Codex
  -> materializes exact candidate
  -> runs preservation, traceability, links/native-object checks
  -> runs authorized detector/browser actions
  -> returns exact receipts
Chat
  -> reads evidence
  -> decides whether the candidate improved and what to change next
```

Codex does not perform substantive humanization reasoning, select prose strategies, or decide that a candidate is editorially acceptable.

A Pro chat may be used for difficult article reasoning only when the decision truly merits Pro. Extra High remains the default authoring/editorial reasoning surface.

---

## 11. Software workflow

For software work:

```text
Extra High chat
  -> designs architecture, acceptance criteria, patch plan, and tests
Codex
  -> applies the plan, handles local tactical implementation, runs tests
Extra High chat
  -> reviews diff/evidence and selects next directive
Pro
  -> only for a genuinely high-intelligence semantic or consequential design decision
```

Codex may choose low-level implementation details inside the directive, but it may not silently change architecture, requirements, or product behavior.

---

## 12. Browser relay and account switching

Codex may automate browser execution only under a chat-authored directive, for example:

- open/reuse a specified chat;
- paste a specified packet;
- submit once;
- recover the exact response;
- switch an authorized account through a verified ordinary flow;
- close stale automation-owned tabs.

Codex does not author the substantive packet or decide which chat/model should answer it. The reasoning supervisor or deterministic routing controller does.

---

## 13. Mission Control requirements

Mission Control must show separately:

```text
reasoning_supervisor_surface
reasoning_supervisor_chat_epoch
last_reasoning_review_at
last_reasoning_reviewed_head/artifact
active_execution_directive_id
active_strategy_id
Codex execution state
execution horizon / review deadline
latest execution receipt
pending reasoning review
Pro escalation state
```

Required alerts:

- `CODEX_RUNNING_WITHOUT_CURRENT_DIRECTIVE`
- `DIRECTIVE_SCOPE_EXCEEDED`
- `REASONING_REVIEW_OVERDUE`
- `CODEX_AUTHORED_STRATEGY_CHANGE`
- `CODEX_AUTHORED_SUPERVISORY_VERDICT`
- `CODEX_CONTINUED_AFTER_STOP_TRIGGER`
- `CODEX_SUBSTANTIVE_PROSE_AUTHORSHIP_UNAUTHORIZED`
- `OWNER_FORCED_PROGRESS_REVIEW`
- `EXECUTOR_HANDOFF_DROPPED`
- `REASONING_RESPONSE_NOT_AWAITED`
- `DUPLICATE_REASONING_REQUEST`
- `REASONING_RESPONSE_DUPLICATE_IMPORT`
- `HANDOFF_LEASE_EXPIRED`
- `HANDOFF_BLOCKED`

Mission Control projects these handoff fields separately:

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

The dashboard shows the live frontier in owner-readable form, for example:

```text
Waiting for Extra High review — request rr_123
Last checked: 42 seconds ago
Next check: 18 seconds
No owner action required
```

It must not collapse this state to `Worker stopped`.

A task card must not appear supervised merely because Codex has produced a detailed checkpoint or contacted Pro itself.

---

## 14. Exact articles regression

### Given

- Codex performs extensive article edits, preservation checks, reader rounds, tooling work, and supervisor-packet preparation.
- Direct Human measurements regress.
- Codex remains `GREEN/MATCH/WORKING`.
- Codex initiates a progress audit only after Joel asks whether any progress occurred.

### Expected

```text
reasoning_supervision_state: FAILED
owner_forced_progress_review: true
outcome_advancement: REGRESSING
Codex_strategy_authority: NONE
same_strategy_execution_allowed: false
required_action: CHAT_SUPERVISOR_SELECT_REPLACEMENT_STRATEGY
```

The test fails if Codex is credited as the supervisor because it eventually produced a good progress audit.

After a chat selects a replacement strategy, Codex receives only a bounded execution directive.

For owner-transcript article reconstruction, the chat—not Codex—must interpret the transcript and author the candidate. Codex may preserve the transcript, materialize the exact chat-authored candidate, run checks, and return evidence.

---

## 15. Migration of current workers

At the next safe checkpoint every active Codex worker must:

1. stop representing itself as the reasoning controller or supervisor;
2. preserve its current execution evidence and state;
3. identify the last chat-authored directive, or mark `SUPERVISION_DIRECTIVE_MISSING`;
4. report any strategic/editorial/scientific decisions it made without chat authority;
5. stop at the current execution boundary;
6. route the exact evidence to the assigned Extra High reasoning supervisor;
7. receive a new versioned execution directive before substantive continuation;
8. continue automatically once that directive arrives.

Do not discard valid work. Reclassify it as execution evidence or supporting work and let the chat supervisor decide its meaning.

---

## 16. Limits

- Codex must still perform tactical reasoning inherent to execution; attempting to eliminate all local judgment would make execution brittle. The boundary is that tactical reasoning cannot alter strategy, semantics, owner outcomes, or acceptance authority.
- Extra High chat access to local files/runtime may be incomplete. Mission Control and Codex must provide exact evidence packets; the chat should not guess.
- Some very small reversible tasks can combine planning and execution in one Codex instruction, but the reasoning still originates in the chat-authored directive.
- A chat supervisor can also fail. Independent Pro adjudication, owner-outcome receipts, hostile fixtures, and deterministic checks remain necessary.

---

## 17. Relationship to other patterns

This pattern supersedes any contrary language in:

- `patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md`
- `patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md`
- `templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md`

In particular, “Codex self-check,” “ordinary Codex review,” or Codex-authored progress/strategy judgment means only an execution claim for independent chat review. It never grants reasoning authority.
