# Current Codex Worker — Shared Supervision Bootstrap

**Purpose:** Apply the current Mission Control / supervision operating rules to an already-running Codex worker **without replacing or broadening that worker's assigned task**.

**Authority:** Current owner instruction and the worker's current project/task authority remain primary. This file supplies cross-cutting execution, supervision, browser, context, and resource-routing rules only.

## 1. Do not replace the current task

If you are already working on a task:

- continue that exact task;
- preserve its current branch/worktree, owner decisions, acceptance criteria, and project-local authority;
- incorporate these rules at the next safe checkpoint;
- do **not** restart from scratch merely because this bootstrap is newer;
- do **not** begin building Mission Control unless Mission Control is actually your assigned task;
- do **not** treat Universal architecture as permission to broaden scope.

If this bootstrap conflicts with a newer explicit owner instruction or a genuine project-specific requirement, the newer owner/project requirement wins.

## 2. Intelligence and execution routing

Use the cheapest/simplest surface that can reliably complete the next action, but do not under-escalate important judgments.

### Deterministic/local checks

Use exact tooling for facts such as:

- branch/HEAD/base identity;
- files changed;
- tests and CI;
- hashes;
- schema validation;
- runtime/process state;
- stale evidence;
- resource collisions.

### Extra High

Prefer Extra High for work that is primarily reasoning, research, GitHub/repository reading, planning, architecture, evidence organization, or ordinary code/diff review and does not require local execution.

### Codex

Use Codex when a named local execution capability is required, including:

- terminal commands;
- filesystem mutation;
- builds/tests;
- Git/worktree operations;
- local services;
- browser/OS control;
- deployment or equivalent executable work.

Do not keep Codex occupied with reasoning-only work that Extra High can perform. After the execution boundary is crossed, return reasoning/review work to Extra High when appropriate.

### Pro

Use Pro promptly when the decision materially benefits from the highest available semantic judgment, especially:

- therapy-answer semantics, safety, technique, relational interpretation, leading/coercive/invalidating behavior, or difficult edge cases;
- AskRigor methodological flaws, evidence sufficiency, protocol conflicts, access boundaries, and what conclusions research can or cannot support;
- a consequential unresolved architecture/product decision;
- a material disagreement between worker evidence and ordinary review;
- high-risk final adjudication when semantic failure would not be caught deterministically.

Do not spend Pro on GitHub retrieval, routine implementation review, ordinary bugs/tests, formatting, plumbing, or repeated confirmation of unchanged conclusions.

When Pro value is genuinely uncertain, Extra High may perform bounded triage: `PRO_REQUIRED`, `PRO_RECOMMENDED`, `PRO_OPTIONAL`, or `NO_PRO`. Obvious important cases should go directly to Pro.

## 3. Pro must not depend on GitHub access

Pro web chats cannot be assumed to access GitHub reliably.

When Pro is used, give it a self-contained, versioned decision packet containing the current authority, exact evidence, relevant excerpts/diffs, verification results, unresolved findings, and the precise question. Do not ask Pro to fetch the repository itself.

Worker claims and independent evidence must remain separate.

## 4. Reuse chats without overflowing context

Do not create a new Pro chat for every checkpoint. Do not keep one Pro chat forever either.

Reuse a related Pro chat while:

- the domain/objective family is unchanged;
- the contract epoch is compatible;
- context remains healthy;
- prior context provides useful continuity rather than contamination;
- an independent fresh judgment is not required.

Each substantive review turn should receive a compact current-authority capsule plus only the new delta/evidence since the last reviewed boundary.

Prepare a rollover when context pressure rises materially or the chat starts:

- citing superseded facts;
- confusing tasks/workers;
- repeating resolved findings;
- forgetting current owner locks;
- anchoring on its own prior proposal;
- producing contradictions without new evidence.

A new chat receives a deterministic handoff capsule from durable state, not only a free-form summary of the old chat.

## 5. Usage/resource exhaustion and account failover

The owner has authorized two account aliases: `primary` and `secondary`. Their actual identities are **private local configuration** and must not be committed to this public repository or copied into public logs.

If Pro, Codex, or another relevant resource becomes unavailable:

1. identify the exact exhausted/unavailable resource;
2. record the visible evidence (banner/error/usage state/reset time if shown);
3. checkpoint the current task, branch, HEAD, tests, chat epoch, and next safe action;
4. audit whether that resource was being used efficiently, including both overuse and harmful under-escalation;
5. consult the owner-private local account registry if it is available;
6. verify the secondary account actually has the required capability before switching;
7. switch only through a verifiable ordinary account-switch flow;
8. verify the active account after switching;
9. resume under the same durable task identity using an exact cross-account handoff capsule.

Do not rotate accounts to evade a policy restriction, suspicious-login condition, authentication challenge, or other guardrail. If automatic switching cannot be verified, stop only the affected boundary and tell the owner:

- which resource is unavailable;
- which account alias was active;
- why it appears unavailable;
- reset time if known;
- whether the secondary account appears usable;
- why automatic switching could not be completed;
- exact manual switching steps;
- exact resume artifact/state.

Do not guess fixed Pro or Codex quotas when the product does not expose them reliably.

## 6. Brave/browser hygiene

For automation-controlled browsing:

- default to headless unless a headed UI is genuinely required;
- keep headed Brave windows out of the owner's active workspace when possible;
- reuse the same relevant tab/session when it will be used again soon;
- treat system-opened tabs as leased resources, not permanent state;
- consider a tab "needed soon" when it is part of the next declared action or expected again within roughly 30 minutes;
- audit automation-owned tabs about every 30 minutes during active browser work, at major task switches, before/after account switching, after usage-limit events, and before ending a long work session;
- close stale, completed, duplicate, one-time evidence, and superseded automation-owned tabs once their result/URL/state is durably captured.

Never automatically close:

- owner/pre-existing tabs;
- owner-pinned tabs;
- tabs with unsaved forms;
- pending uploads/downloads;
- generating/pending-result tabs;
- paid or irreversible actions;
- tabs needed to reconcile an ambiguous operation.

A persistent Pro chat does not require keeping its tab open. Persist the chat URL, account alias, scope key, current capsule, and last reviewed boundary locally.

## 7. Continue automatically

An owner correction, answer, or new shared rule is input to the current task, not a completion event. After incorporating it, continue to the next safe in-scope action unless a genuine owner decision, unavailable permission/credential, destructive/irreversible boundary, spending, publication, or explicit stop requires pausing.

## 8. Mission Control-specific workers

Only if your assigned task **is Mission Control**, additionally read the current draft architecture on PR #42, especially:

- `patterns/codex-pro-supervision-mission-control.md`
- `patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md`
- `patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md`
- `docs/exec-plans/2026-08-30-mission-control-symphony-gap-audit-and-pilot.md`
- `docs/exec-plans/2026-08-30-mission-control-resource-routing-failover-and-tab-hygiene-addendum.md`

Do not make non-Mission-Control workers execute those implementation plans.

## 9. Current-worker receipt

At the next meaningful checkpoint, record briefly in durable task state that this bootstrap was adopted and note only any material effect on the current task. Do not create ceremony or stop productive work merely to acknowledge it.
