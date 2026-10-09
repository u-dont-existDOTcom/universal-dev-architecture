# Task-time lesson activation and enforcement

## Problem

Durable lesson capture does not guarantee durable lesson application. A project can have excellent lesson indexes, closeout ledgers, current-state files, and exact provenance while a fresh worker still fails because the relevant lessons never become active constraints on the current task.

The missing layer is **task-time activation plus an enforcement point** between `lesson exists` and `work is delivered`.

This pattern is an adaptation/composition of established controls rather than a new memory theory:

- policy-as-code / admission-control separation between policy storage, policy decision, and enforcement;
- requirements traceability and acceptance gates;
- explicit memory admission/retrieval for long-running agents;
- this repository's existing durable-chat-learning, GitHub-first bootstrap, current-state, and lesson-closeout patterns.

## Core model

Use four layers:

1. **Lesson store** — canonical lesson index, current summaries, exact evidence, owner corrections.
2. **Activation/compiler step** — identify only the lessons materially relevant to the current task and compile them into a small active contract.
3. **Enforcement point** — before consequential execution or owner delivery, require evidence that every active lesson was actually applied; fail closed on a substantive miss.
4. **Learning closeout** — new owner corrections and findings update the lesson store, then trigger re-activation for the next attempt.

Do not confuse any layer with another. A lesson being present in GitHub is not evidence that it influenced the current output.

## 0. Activation provenance / no implicit universal coverage

Before claiming that universal or project lesson controls protected a task, record **how those controls actually entered the reasoning path**.

Acceptable activation routes include:

- the current project `AGENTS.md` or equivalent bootstrap explicitly loading the current universal/project lesson index;
- a current task directive or owner instruction explicitly requiring that guidance;
- an authenticated supervision/admission path that supplies the current guidance and exact task-time lesson contract.

For the relevant guidance layer record:

- source repository and exact ref/commit when available;
- bootstrap/directive/admission source that triggered retrieval;
- active lesson contract path or exact in-context equivalent;
- activation status: `ACTIVE | NOT_ACTIVATED | STALE`.

Hard rules:

1. `rule exists in GitHub` is not activation evidence.
2. `the model may know the rule` is not activation evidence.
3. A project need not adopt universal guidance merely because it exists. But when current project/owner authority says the task is governed by it, `NOT_ACTIVATED` or `STALE` blocks consequential method commitment, release, or owner-facing substantive delivery until the reasoning path loads current guidance and compiles the relevant active lessons.
4. Direct current task/owner activation is valid even when the project lacks a permanent bootstrap; do not manufacture a repository-file dependency when the guidance was actually supplied another authoritative way.
5. Do not claim a task was protected by a control whose activation route cannot be shown. Record the protection gap honestly and repair the route for subsequent work.
6. A bootstrap or gate requirement that a task directive or handoff establishes stays in force for the whole task, including after context compaction. Write it into the task's recovery checkpoint so it survives the summary. A summary that names a rule is not activation evidence; after compaction the status is `STALE` until the current guidance is reloaded.

This provenance check is deliberately small. It verifies control-path reachability; it does **not** certify that a semantic lesson was interpreted correctly. The ordinary pre-action application gate below still owns that judgment.

## 1. Activation before substantive work

After current authority and the lesson index are loaded, classify the task by its actual operations and risks.

Retrieve only lessons whose trigger matches the current task. Prefer current owner/task-local lessons first, then project-local promoted lessons, then universal lessons. Newer owner correction supersedes older generic guidance on conflict.

Build an **Active Lesson Contract** before the first substantive attempt. Keep it short enough to remain cognitively live. It should normally contain only the lessons that could change the work now.

For every active lesson record:

- `lesson_id` or stable source anchor;
- source repo/ref/path;
- **trigger:** why this lesson applies to this task;
- **required behavior:** what the worker must actually do differently;
- **failure condition:** what observable result would show the lesson was not applied;
- **repair action:** what to do when the failure condition appears;
- `enforcement`: `mechanical`, `semantic`, or `owner-evaluated`.

Do not copy whole lesson files into the contract. Compile the operative rule.

## 1A. Obligation lifecycle and boundary binding

An instruction is satisfied only where its required effect must exist. Reading, understanding, planning, simulating, or mentioning it elsewhere does not discharge the obligation. This extends the existing Active Lesson Contract; do not create a second parallel ledger.

For each material active obligation, bind a compact tuple:

`rule/source + scope/authority + actor + trigger + due phase + destination + acceptance evidence + non-substitutes + carry-through + repair + enforcement`.

The due boundary may be source retrieval, reasoning, a tool action, a worker handoff, persistence, publication, or final delivery. Do not move every obligation to final output: authorization due before an irreversible action cannot be repaired by a later warning. A reasoning-only rule does not require exposing private reasoning. Give the conclusion and relevant evidence, not a transcript of hidden analysis.

An obligation remains open until its own acceptance condition is met, its trigger genuinely becomes inapplicable, or current authorized instruction supersedes it. Carry open obligations through summaries, handoffs, context compaction, model changes, and formatting rewrites. A recipient must receive the required constraint and source binding, not merely a statement that the sender considered it.

At the last controllable boundary, inspect the actual outgoing payload or observable state. Evidence in a plan, commentary, another artifact, an earlier draft, a queued message, or a different deployment is not evidence in the required destination. Repeat required output content in the final answer when it appeared only in an intermediate surface. If a final rewrite changes the relevant payload, recheck the changed obligations before delivery.

Use mechanical enforcement for genuinely mechanical predicates when available; retain semantic review for meaning, source entailment, target fidelity, and scientific adequacy. Calling a prompt a gate does not install a runtime guard. A check of rule presence does not prove behavior, and a model's own receipt is not independent verification. Unknown or unobserved evidence is not PASS. Fail closed only on the affected mandatory action/claim and continue independent authorized work.

Preserve the owner's 2026-09-12 result as OWNER_VALIDATED_CROSS_MODEL_FIX: the final-output timestamp formulation resolved the reported failures across tested models and thinking levels. Do not reopen that accepted fix merely to restate uncertainty, and do not claim independent measurements or an exhaustive list of tested configurations that the owner did not supply. Generalize the boundary-binding principle without assuming all other obligations are already fixed.

## 2. Keep the active set small

Lesson overload defeats lesson activation.

Do not load every historical lesson because it might be relevant. Use the current lesson index for routing, then choose the smallest set that covers the actual task.

A useful active contract is usually closer to 3–12 high-leverage rules than dozens of background notes. A project-specific live owner-correction state may itself be the primary active bundle.

If two lessons overlap, prefer the more specific/current one and retain the broader lesson as provenance rather than duplicating both as active constraints.

An owner's written checklist, or a gate that the project's authority files declare blocking, enters the contract as **one unit**: `run checklist X in full; evidence: its report`. Never sample it item by item. Keeping the contract small limits how many rules are compiled; it never licenses running part of a declared checklist or skipping a declared gate.

## 3. Separate hard controls from judgment controls

### Mechanical lessons

Examples: exact hash identity, required link preservation, forbidden file mutation, budget cap, branch/ref restriction, required tests.

Where practical, enforce these with code, CI, schema validation, assertions, or repository policy. Do not rely on the model remembering them.

### Semantic/judgment lessons

Examples: preserve causal direction, do not turn semantic obligations into rhetorical cards, avoid explanatory aftercare, keep source interpretation distinct, maintain reader-facing coherence.

These cannot be certified by file existence or a generic CI green check. The reasoning/writing agent must perform the semantic gate itself or use a genuinely independent evaluator when the current protocol requires one.

Codex or another execution worker must not become the editorial/reasoning judge merely because it can run scripts.

### Owner-evaluated lessons

When prior progress depended on owner corrections that models repeatedly failed to self-detect, treat those corrections as first-class active constraints and return the smallest useful candidate to the owner early. Do not replace owner cognition with model-only critique loops.

Early return comes **after** the candidate passes every check the owner has already stated and every gate the project declares before owner delivery. It means not stacking extra model critique on top of those. It never makes the owner the checker for rules the owner already gave, and where the project says the owner is not an intermediate QA surface, that wins. When the owner catches a violation of a rule he or she already stated, treat it as an enforcement failure at this boundary: repair the enforcement, not only the candidate.

## 4. Enforcement point before delivery

Immediately before a consequential tool action, publication/release boundary, or owner-facing substantive candidate, run the Active Lesson Contract as an **admission gate**.

Submitting a candidate to an external evaluator or detector is a consequential tool action. Persist the gate's evidence (for example, a checklist report and a written disposition table) before the call, so that a skipped gate shows in the record.

For every active lesson produce one of:

- `PASS — evidence: <specific span/action/result>`;
- `NOT_APPLICABLE — reason` only if the task changed so the trigger no longer holds;
- `FAIL — <specific violation>`.

A substantive `FAIL` blocks delivery/action. Repair the actual work, then rerun the gate.

A lesson that looks unhelpful for this task is still applied and still gets its `PASS` or `FAIL`. Add a flag for the owner with the change you suggest (see "Inherited rules that look unhelpful" in `patterns/owner-goal-followup-and-requirement-accretion.md`). `NOT_APPLICABLE` is only for a trigger that genuinely no longer holds, never for a rule the agent disagrees with.

`I read the lesson`, `I kept it in mind`, or `the prompt included it` are not evidence of application.

For semantic lessons, evidence should identify the literal candidate behavior or absence of the prohibited pattern. For mechanical lessons, evidence should point to the exact check/result.

## 5. Re-activation triggers

The active contract becomes stale when the task meaningfully changes. Recompile or amend it when any of these occur:

- direct owner correction;
- owner rejection of a candidate;
- task scope or goal change;
- article/source authority change;
- new controlled evidence that supersedes a lesson;
- phase change that activates different risks;
- repeated failure that reveals the current active contract did not encode the real generative/operational mistake;
- context compaction, a resumed session, or work continued from a summary or handoff;
- the start of each new unit of work inside a task, such as the next section of a document.

A direct owner correction should normally be activated before the next attempt, not merely saved for later closeout.

## 6. Preserve owner corrections as executable lessons

When an owner correction matters beyond one sentence, preserve at least:

1. what the owner actually objected to;
2. the underlying generative/operational mistake;
3. the next-attempt behavior required;
4. the failure condition that would show regression;
5. whether the repair has been owner-validated.

This turns `remember what Joel said` into an executable check without turning the rejected prose into a template.

## 7. Application receipts

For long-running, expensive, or repeatedly failing tasks, persist a compact task-local application receipt. Suggested shape:

```text
Task: <identity>
Authority checked: <repo/ref/state>
Guidance activation: ACTIVE|NOT_ACTIVATED|STALE — route/source: <...>
Active lessons:
- <lesson>: trigger / required behavior / failure condition / enforcement
...
Pre-attempt activation: PASS
Pre-delivery application gate:
- <lesson>: PASS|FAIL + evidence
...
Owner correction since last receipt: <none|summary + source>
Contract freshness: CURRENT|STALE
Result: ADMITTED|BLOCKED
```

The receipt is working state, not article/product authority. Keep it short and update it rather than accumulating one giant prompt.

### Structured semantic receipts and bootstrap state

The task-time compiler records `uda_activation` and `uda_protection`. Declare `bootstrap.state: LOADED` only after the current required root actually entered the reasoning path: this compiles to ACTIVE with the bootstrap record in `via` and UDA_GOVERNED protection. SKIPPED_BY_OWNER_EXEMPTION, NOT_LOADED and missing/other bootstrap states compile to NOT_ACTIVATED and OUTSIDE_UDA. Check without a contract or on an outside contract returns NOT_EVALUATED, never PASS or ADMITTED. These declarations record provenance; the compiler does not independently observe bootstrap retrieval. UDA cannot protect a turn it never loaded. Always load root AGENTS.md on every turn; deeper index-selected loading remains conditional under current owner authority.

For a semantic obligation, run `python3 scripts/uda_rule_graph_task_time.py receipt --contract contract.json --phase final-delivery --payload final.txt --output receipts.json`. It prints a bound skeleton for each due semantic obligation. Fill its verdict, short evidence tied to the literal candidate, actor id/kind/relation and timezone-bearing issued_at; the blank skeleton cannot admit work. Run `check --contract contract.json --task task.json --phase final-delivery --destination owner-visible-final --payload final.txt --receipts receipts.json` with the same script. Preserve the ordinary mechanical check inputs, including both clock readings where required. Full commands and the owner-side bootstrap instruction draft are in `docs/uda-enforcement-coverage.md`.

A receipt binds contract_sha256 (the compiled content_sha256), rule_id, obligation_id, phase, destination and payload_sha256 of the exact payload bytes. Missing, malformed, mismatched, unbound, stale or duplicate matching receipts leave semantic obligations UNKNOWN and block admission. FAIL blocks. NOT_APPLICABLE requires both an obligation with `not_applicable_allowed: true` and a nonempty not_applicable_reason; otherwise it blocks. An obligation with `independent_review_required: true` accepts only INDEPENDENT receipts. Owner correction requires recompile; any final rewrite requires a new payload receipt. Unresolved applicability remains blocking.

When the current task envelope is supplied to either check CLI or `check_contract(current_task=...)`, its full canonical JSON hash must match the contract's `task_envelope_sha256` before refresh-boundary or receipt evaluation at every phase/destination. Use the compiler's sorted keys, compact separators and unescaped Unicode encoded as UTF-8. A task-ID mismatch keeps its specific reason; changes to `owner_correction`, `request` or any other envelope field require recompilation and fresh contract-bound receipts even when selection and refresh facts are unchanged. Equivalent JSON formatting or key order remains valid. Checks without a current envelope retain their existing behavior.

A destination-scoped check evaluates only obligations due there, lists the others under `out_of_scope`, and returns NOT_EVALUATED if none match. A phase with several destinations is admitted when each destination's scoped check is ADMITTED with its own payload: the final answer for `owner-visible-final`, the checkpoint text for `durable-task-checkpoint`. Unscoped checks still evaluate every due obligation.

Every task-time record must declare `refresh_on_facts` covering all selection and activation inputs. Validation observes reads through the compiler's own `applicability` (`scope` and `evaluate`) and `selection_context` paths: every trigger arm, every populated `applies_to` dimension, and the top-level bootstrap and legacy-selection controls. `envelope.bootstrap` and `envelope.legacy_rule_ids` bind the complete corresponding envelope fields; `envelope.*` is reserved and cannot name a trigger fact. Missing required inputs, absent policies and empty policies fail validation. Extra guards remain valid. The compiled contract retains every record's refresh boundaries, even when no rule currently applies. At the declared phase/destination, supply the full current envelope with `check --task task.json` or `current_task` in `check_contract`. Facts-only callers must also supply explicit state/value observations for the `envelope.*` controls; missing observations block, and changed state/value requires recompilation and new contract-bound receipts. A correction from `role=external` to `universal_internal` therefore blocks an initially empty contract at the destination rather than returning NOT_EVALUATED. Rendered reminders state facts common to all boundaries once, then list each boundary's additional facts; structured guards remain complete. Refresh `usage_warning_visible` at persistence so a warning that appears during work activates the immediate checkpoint and small-step obligation. Explicit ABSENT remains a valid observation; the checker verifies declared inputs, not an unseen provider signal.

Results state RECEIPT_BINDING_VERIFIED and identify who asserted the judgment, with judgment_proved false. SAME_AGENT is application evidence, never independent verification; INDEPENDENT is an independent-review assertion. The code verifies bindings and receipt shape, not semantic truth, identity authentication or actual reviewer independence. A well-formed but mistaken PASS assertion can admit a violating candidate. Do not turn this admission path into a claim of universal behavioral proof or use receipts to substitute for mechanical checks.


## 8. Chat vs execution-worker boundary

Where a project distinguishes reasoning chats from execution workers:

- the reasoning/writing Chat owns semantic lesson activation, interpretation, and owner interaction;
- Codex/execution workers implement already-decided repository/file/test actions and return evidence;
- a mechanical worker must not reinterpret an owner correction or decide prose/argument merely because it is maintaining the repository.

The active lesson contract should follow the reasoning task, not force the owner into the execution worker's interface.

## 9. Failure modes this pattern prevents

Reject these substitutes for application:

- lesson exists in GitHub, therefore it was applied;
- worker read the entire lesson corpus once at task start;
- more instructions were appended to an already overloaded prompt;
- the same model self-certified its own repeated blind spot without specific evidence;
- Codex ran repository checks, therefore semantic lessons passed;
- a lesson was captured only at closeout after the next bad attempt had already happened;
- every lesson was loaded, creating enough context noise that the important ones disappeared.

## 10. Relationship to existing patterns

This pattern complements rather than replaces:

- `patterns/durable-chat-learning.md` — ensures lessons are captured and promoted;
- `patterns/github-first-agent-bootstrap.md` — ensures fresh workers recover canonical state;
- `patterns/context-compaction-resilience.md` — preserves resumable current state;
- `patterns/transformation-preservation-proof.md` — validates source→target transformations;
- `patterns/independent-evaluation-separation.md` — supplies genuinely independent evaluation where warranted;
- project-specific specialist lesson indexes and gates.

The full loop is:

**capture → index → task-time activate → perform work → enforce before delivery → owner/evidence feedback → update lesson store → reactivate.**

## External baseline

This architecture deliberately reuses the policy decision/enforcement split used by Open Policy Agent and admission-control systems: policies are managed separately from the point where a request is allowed or denied. It also aligns with current agent-memory research emphasizing explicit, interpretable admission/control rather than indiscriminate accumulation.

The project-specific novelty is limited to applying those established control principles to durable human/agent lessons and semantic writing/reasoning workflows.


## Enforcement coverage inventory

Before adding or migrating a rule, classify its exact source in `rules/rule-graph/enforcement-coverage.v1.json`. Every pattern file and every root level-two section has one disposition. An explicit index or parent trigger is an activation route; prose presence, an index listing, a graph node and compilation alone do not prove application.

`STRUCTURED_PARTIAL` and `LEGACY_UNSTRUCTURED` remain the exact migration backlog pinned in `rules/rule-graph/enforcement-legacy-baseline.v1.json`. New behavioral rules must arrive with structured admission or a specific specialist workflow justification; expanding legacy backlog requires an owner quote, date and source. Large patterns with narrow task-time records remain partial, and semantic UNKNOWN never becomes enforcement PASS.

Run `python3 scripts/uda_enforcement_coverage.py validate` for the deterministic gate and `python3 scripts/uda_enforcement_coverage.py report` for disposition counts, exact prioritized backlog and evidence classes. The repository audit runs the same validator at error level. `docs/uda-enforcement-coverage.md` explains its scope and limits. The first integration inventories the gaps and supplies semantic receipts, activation state and the dominated-route regression. Neither inventory nor a green coverage audit closes the owner outcome while behavioral obligations remain unstructured.

Kernel migration slice 1 preserves 103 operative clauses across six root sections: 102 clauses map to 23 coherent task-time behaviors, with one bootstrap-not-loaded exception. Those six sections have complete `obligation_map` entries and both ADMISSION and BEHAVIORAL_REGRESSION evidence. At kernel slice 1 the inventory had 6 enforced, 6 partial, 10 workflow-only, 72 legacy and 2 inactive; backlog shrank from the immutable 84-identity baseline to 78, with no additions. Counts after corrected continuation/closure slice 2a were 9 enforced, 8 partial, 10 workflow-only, 69 legacy and 2 inactive; backlog was 77. Slice 2b leaves 9 enforced, 9 partial, 10 workflow-only, 68 legacy and 2 inactive; backlog remains 77. The remaining P1 patterns stay open for later slices. The owner-authored root wording is unchanged.

For complete section coverage, each map item quotes an exact owning sentence or clause and names its record/obligation. The record's exact-text selectors contain that sentence. Several sentences may map to one coherent behavior. Each mapped record obligation must exist; every record obligation and exact selector clause must be mapped. Only bootstrap-not-loaded duties or owner-settings changes may instead have an obligation-level exception, with exact sentence, specific reason and named resolvable carrier. The report exposes exceptions; difficult semantic behavior is still structured. Removing a baseline identity requires STRUCTURED_ENFORCED, never workflow-only or inactive reclassification. Partial maps retain an exact operative legacy remainder.

Every-turn kernel records use `governance_required`; the live-root requirement also uses `owner_requires_live_root`, and maintenance uses the existing `action_classes` declaration. Unknown applicability blocks. Conditional payload/action obligations remain selected and permit NOT_APPLICABLE only with a bound reason. Kernel timestamp shape and elapsed-time presence/calculation use the existing mechanical predicates; the separate clock-cadence obligation judges actual current-turn provenance. Receipts cannot override mechanical results. No new fact or predicate kind is introduced. These source mappings and attributed judgments do not prove universal live invocation, semantic truth or protection of unactivated turns.


### Review/merge-gate migration slice 2

The complete review-convergence and agent-completable merge-gate patterns now have exact clause maps and whole-source/per-section independent pins, following kernel slice 1. Their 14 records bind 128 operative clauses to 16 semantic behaviors at review, acceptance, hosted-capability, owner handoff and post-action boundaries. The existing action_classes fact adds review_round, review_finding_judgment and merge_gate; generic example handoffs declare them absent and select none of these records. Unknown applicability remains blocking. Payload-dependent duties stay selected with reason-bound NOT_APPLICABLE; authority invariants do not allow that verdict. No new exceptions, baseline changes or legacy additions were made; that historical slice left backlog at 78; corrected continuation/closure slice 2a now leaves 77. Docs and regressions distinguish receipt admission from semantic truth or live runtime invocation.

### Continuation/closure migration slice 2a

Corrected slice 2a carries 281 mapped clause rows in 31 records and 32 semantic behaviors: 65 terminal, 73 compaction and 143 task-lock rows. Only task locks are fully enforced; compaction retains 17 literal clauses plus wider persistence scope, and terminal admission retains three lifetime polling/resume clauses. Their exact legacy remainders, owner-authorized corrective dispositions and independent source/map pins remain. Continuity is restored in representative Work with original provenance; full persistence selectors are consolidated without shortening them. Exact-head claim gates, actual final-response/authority-resolver output, stop-time non-substitutes, action-class refresh, one-shot instruction adoption and independent phase/trigger/N/A pins have regressions with bespoke near-misses. The Work contract was 31,317 rendered bytes at the reviewed baseline; it is now 32,429 rendered bytes and 37,194 injected bytes with complete selection-input refresh, under unchanged 32,768/40,960 budgets. Counts are 9 enforced, 8 partial, 10 workflow-only, 69 legacy and 2 inactive; backlog 77, immutable baseline 84, seven removals and no additions. The parent remains OPEN for slice 2b and later. Receipt binding does not prove semantic truth or universal live behavior.


### Owner-outcome migration slice 2b

The unchanged owner-outcome invariant has 158 clause rows: 48 in five semantic worker records, 14 in exact existing Mission Control code/test obligations, 96 literal legacy, zero exceptions. Whole-pattern/per-section/clause/carrier pins retain every operative section; explanatory histories and relationships remain context. Worker duties stay at pre-action or closure boundaries. Existing server evidence never becomes a worker receipt. Source recovery, checkpoint carriage and migration-repair proposals remain budget-deferred CANDIDATE definitions outside active metadata: unchanged Work facts would select them and each exceeds the rendered cap. Five active event records add only refresh guards to representative Work: 32,429/37,194 becomes 32,561/37,194 rendered/injected bytes under unchanged 32,768/40,960 caps. Existing continuity selection, envelopes and normative prose remain unchanged. Counts are 9 enforced, 9 partial, 10 workflow-only, 68 legacy and 2 inactive; backlog remains 77 against baseline 84, seven removals and no additions. Parent remains OPEN for operating-system slice 2c and later. Bound judgments and exact test references establish admission structure, not semantic truth, authenticated identity or universal live invocation.
