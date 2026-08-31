# Chat-Led Reasoning and Codex Execution Separation

**Status:** Required owner correction and superseding control for the Mission Control architecture  
**Date:** 2026-08-31  
**Authority:** Owner correction: chats perform the reasoning; Codex is used only for execution that chats cannot reliably perform.

## 1. Normative correction

The prior architecture still allowed Codex to behave as a combined controller, strategist, self-supervisor, and executor. That is prohibited.

The controlling rule is:

> **Chat surfaces own reasoning. Codex owns only bounded execution that chat surfaces cannot reliably perform.**

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
