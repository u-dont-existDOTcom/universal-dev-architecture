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

## 4. Enforcement point before delivery

Immediately before a consequential tool action, publication/release boundary, or owner-facing substantive candidate, run the Active Lesson Contract as an **admission gate**.

For every active lesson produce one of:

- `PASS — evidence: <specific span/action/result>`;
- `NOT_APPLICABLE — reason` only if the task changed so the trigger no longer holds;
- `FAIL — <specific violation>`.

A substantive `FAIL` blocks delivery/action. Repair the actual work, then rerun the gate.

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
- repeated failure that reveals the current active contract did not encode the real generative/operational mistake.

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
