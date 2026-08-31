# Current Codex Worker — Shared Supervision Bootstrap

**Purpose:** Apply the current Mission Control / supervision operating rules to an already-running Codex worker **without replacing or broadening the owner’s real requested outcome**.

**Authority:** Current owner instruction and the worker’s current project authority remain primary. Existing checkpoints, acceptance criteria, supervisor packets, and completion boundaries are subordinate until they are validated against the originating owner outcome.

## 1. Preserve the owner outcome, not a narrowed checkpoint

If you are already working on a task:

- continue the same underlying owner-requested outcome;
- preserve the current branch/worktree, explicit owner decisions, and valid completed supporting work;
- incorporate these rules at the next safe checkpoint;
- do **not** restart from scratch merely because this bootstrap is newer;
- do **not** begin building Mission Control unless Mission Control is actually your assigned task;
- do **not** treat Universal architecture as permission to broaden scope.

However, do **not** blindly preserve the current task contract, acceptance criteria, checkpoint, or proposed finish line. They may already have laundered the original goal.

At the next safe checkpoint:

1. Recover the original owner request and material later corrections from canonical project records.
2. Preserve the verbatim owner request and exact canonical locator or immutable source block.
3. Record owner-request identity, SHA-256, capture time, and append-only corrections.
4. State the normalized final result without weakening it.
5. List every required outcome, required evidence, current gap, and unmet or unknown outcome.
6. List supporting states that do **not** by themselves satisfy the outcome.
7. Construct or update the objective-reconciliation matrix.
8. Compare the current task contract and proposed terminal state against that invariant.
9. Preserve useful completed work, but reopen/continue any required outcome omitted or replaced by a proxy.

A downstream task contract may refine or decompose the owner outcome, but it may not weaken, omit, replace, or terminally bypass it without an explicit owner decision.

The following do not terminate a root task by default:

- `READY_FOR_OWNER_REVIEW`;
- editorial/review readiness;
- tests passing;
- source-integrity or preservation PASS;
- supervisor approval;
- independent-reader PASS;
- PR/handoff readiness.

If the owner requested a final substantive outcome and that outcome remains unmet, the task remains open. An early owner-evaluation state must be labeled nonterminal.

If the original owner outcome cannot be recovered or is materially ambiguous, mark `OUTCOME_AUTHORITY_UNRESOLVED`. Continue only clearly useful reversible contributing work; do not declare root completion.

If this bootstrap conflicts with a newer explicit owner instruction or a genuine project-specific requirement, the newer owner/project requirement wins.

Required companions:

- `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`
- `patterns/supervision-assurance-planes-and-pro-meta-review.md`
- `patterns/outcome-advancement-and-strategy-efficacy.md`

Machine-readable baselines:

- `templates/OBJECTIVE-RECONCILIATION.json`
- `templates/OUTCOME-PROGRESS-RECEIPT.json`

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
- resource collisions;
- owner-outcome/contract coverage;
- proposed terminal-state comparison;
- direct owner-outcome measurements and deltas;
- strategy-cycle count and progress-evidence freshness.

### Extra High

Prefer Extra High for work that is primarily reasoning, research, GitHub/repository reading, planning, architecture, evidence organization, ordinary code/diff review, semantic comparison between a derived contract and the owner outcome, ordinary strategy-efficacy review, or preparation of a supervision-design feedback packet, and does not require local execution.

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
- high-risk final adjudication when semantic failure would not be caught deterministically;
- a disputed owner-outcome/derived-contract equivalence judgment with consequential terminal implications;
- a difficult strategy-failure diagnosis or replacement-method decision after flat or negative owner-outcome progress;
- a substantive question or proposed improvement to the supervision architecture itself.

Do not spend Pro on GitHub retrieval, routine implementation review, ordinary bugs/tests, formatting, plumbing, deterministic progress arithmetic, or repeated confirmation of unchanged conclusions.

When Pro value is genuinely uncertain, Extra High may perform bounded triage: `PRO_REQUIRED`, `PRO_RECOMMENDED`, `PRO_OPTIONAL`, or `NO_PRO`. Obvious important cases should go directly to Pro.

## 3. Pro must not depend on GitHub access or a laundered contract

Pro web chats cannot be assumed to access GitHub reliably.

When Pro is used for task supervision, give it a self-contained, versioned decision packet containing:

- the independently acquired verbatim owner source and receipt;
- the normalized owner outcome;
- owner-outcome epoch/hash;
- required outcomes and current gaps;
- known non-satisfying proxies;
- the current derived task contract and reconciliation matrix;
- exact evidence, excerpts/diffs, and verification results;
- both alignment states;
- the latest outcome-progress receipt, direct outcome delta, strategy identity, prediction, actual result, completed cycles, and supporting work since the last direct evidence;
- unresolved findings;
- the typed completion claim and proposed workflow/terminal state;
- the precise question.

The supervisor must compare the derived contract and proposed finish line to the owner outcome **before** judging whether the worker satisfied the contract. It must then determine whether the chosen strategy is actually advancing that outcome.

Do not ask Pro to fetch the repository itself. Worker claims and independent evidence must remain separate. Supervisor approval never substitutes for outcome evidence.

The owner source must be supplied independently by Mission Control, deterministic tooling, or an Extra High reader—not only through the worker’s polished handoff.

## 4. Machine-checkable dual alignment and typed completion

Every meaningful checkpoint and supervision packet must report these independently:

```text
worker_to_contract_alignment: GREEN | YELLOW | RED | UNKNOWN
contract_to_owner_alignment: MATCH | PARTIAL | DIVERGED | SOURCE_MISSING
```

A worker may be GREEN against its task contract while the contract is RED/DIVERGED against the owner. In that case the overall root task is RED, regardless of worker competence or supervisor approval.

Do not average the two states.

Every checkpoint also carries exactly one completion claim:

```text
WORKING
ARTIFACT_READY
TESTS_PASS
READY_FOR_OWNER_REVIEW
READY_FOR_RELEASE
PARTIAL_OUTCOME
SUBTASK_COMPLETE_PARENT_OPEN
OWNER_OUTCOME_ACHIEVED
BLOCKED_OWNER_DECISION
CANCELED_BY_OWNER
```

No earlier state implies `OWNER_OUTCOME_ACHIEVED`. A label rename cannot upgrade the semantic claim.

Required objective-reconciliation matrix:

| Owner requirement | Worker interpretation | Task criterion | Acceptance evidence | Status | Authorized change |
|---|---|---|---|---|---|

Every material requirement must be mapped, explicitly amended/removed by the owner, or escalated. Reconcile again:

- after material discoveries;
- before phase transitions;
- after acceptance criteria/tests change;
- after owner corrections;
- before owner review;
- before release/deployment/publication preparation;
- before any root completion claim.

For AskRigor and comparable research work, report three separate judgments:

```text
operational_alignment
scientific_adequacy
release_adequacy
```

Operational PASS does not imply scientific adequacy. Scientific PASS does not imply privacy, licensing, freshness, consent, provenance, product, or release adequacy.

Machine-readable baselines:

- `templates/OBJECTIVE-RECONCILIATION.json`
- `templates/RESEARCH-SUPERVISION-VERDICT.json`

## 5. Machine-checkable outcome advancement and strategy efficacy

Alignment is not progress. A worker can be GREEN, the contract can MATCH, and the owner outcome can still be flat or worsening.

Every meaningful progress checkpoint must also report:

```text
outcome_advancement:
  ADVANCING | FLAT | REGRESSING | UNMEASURED |
  NOT_YET_MEASURABLE | BLOCKED_EXTERNAL | UNKNOWN

strategy_efficacy:
  VIABLE | UNCERTAIN | FAILED | EXHAUSTED |
  REPLACEMENT_REQUIRED | BLOCKED_EXTERNAL | SUPERSEDED
```

Required receipt:

- `templates/OUTCOME-PROGRESS-RECEIPT.json`

For numeric outcomes, bind the exact target, baseline, previous, current and best measurements; directionality; change from baseline; change from the prior checkpoint; measurement freshness; and exact candidate/artifact identity.

For qualitative or delayed outcomes, use explicit evidence states or owner-authorized leading indicators. Do not fabricate a percentage.

Classify material work since the last direct outcome evidence as:

```text
DIRECT_OUTCOME_ADVANCEMENT
ENABLEMENT_PROGRESS
RISK_REDUCTION
EVIDENCE_ACQUISITION
STRATEGY_LEARNING
PROCESS_OR_TOOLING
REWORK
WASTE_OR_NO_INFORMATION_GAIN
```

Commits, tests, audits, packets, documentation, elapsed time and model calls do not count as direct owner-outcome progress merely because they occurred.

Reassess advancement:

- after every strategy cycle or experiment;
- after every direct measurement;
- before repeating a similar method;
- before another scarce or paid action;
- after material discoveries and before phase transitions;
- after a configured time/commit/turn/compute threshold without direct evidence;
- before owner review, release or root completion.

Control rules:

- one completed flat cycle is at least YELLOW and requires strategy-efficacy review;
- two flat cycles, or the configured no-progress budget, require `REPLACEMENT_REQUIRED` unless a valid delayed-effect model applies;
- a negative direct delta is `REGRESSING` and requires immediate strategy review;
- repeating a regressing/failed/exhausted strategy without a new evidence-backed causal reason is RED;
- an overdue promised measurement produces `PROGRESS_EVIDENCE_OVERDUE`;
- a strategy at its cycle/call/time/evidence limit becomes `EXHAUSTED` and cannot continue under a renamed variant.

Required overall projection:

```text
worker_to_contract GREEN
contract_to_owner MATCH
outcome_advancement REGRESSING
strategy_efficacy REPLACEMENT_REQUIRED
=> overall RED
```

When progress is flat, regressing or overdue:

1. preserve valid supporting work;
2. stop materially similar work under the failed strategy;
3. record direct outcome delta and effort since the last direct evidence;
4. identify what was learned;
5. route ordinary method review to Extra High and difficult/high-consequence replacement to Pro;
6. resume automatically under the selected replacement strategy;
7. ask the owner only for genuinely missing source, threshold, policy or tradeoff authority.

The owner must not have to ask whether substantial work made progress. If the owner asks, treat that as a supervision failure and repair the progress-control loop.

Required companion:

- `patterns/outcome-advancement-and-strategy-efficacy.md`

## 6. Supervision-design improvements and questions must reach shared Pro meta-review

When you identify a substantive improvement, loophole, ambiguity, contradiction, recurring failure, machine-checking gap, or question about the supervision design:

1. Do not silently rewrite or reinterpret the canonical architecture.
2. Record a structured `SUPERVISION_DESIGN_FEEDBACK` packet.
3. Include the exact architecture version/hash, relevant rule/excerpt, failure mechanism, evidence, proposed change or question, risks, and whether the current task boundary is blocked.
4. Use deterministic tooling or Extra High to collect GitHub evidence and prepare a self-contained packet.
5. Route the packet to the shared scope-bound Pro supervisor-design chat.
6. Preserve the Pro verdict and resulting repository changes/tests durably.
7. Continue unaffected task work automatically.

Use one shared Pro meta-review scope per architecture epoch:

```text
supervision-architecture/<epoch>
```

Do not open one architecture Pro chat per worker.

Review immediately when the issue could falsely authorize completion/release, lose the owner outcome, allow substantial no-progress work to continue, affect therapy/research safety, create privacy/security/consent risk, or prevent safe current execution. Batch nonblocking improvements for the next meta-review checkpoint.

A worker with no substantive supervision-design improvement or question does not need a ceremonial Pro check-in.

Machine-readable baseline:

- `templates/SUPERVISION-DESIGN-FEEDBACK.json`

Pro meta-review returns one of:

```text
ACCEPT
ACCEPT_WITH_REVISION
REJECT
NEEDS_EVIDENCE
OWNER_DECISION_REQUIRED
PROJECT_LOCAL_ONLY
```

Pro advice does not itself mutate the architecture. Repository changes, tests, and owner authorization where applicable remain required.

## 7. Reuse chats without overflowing context

Do not create a new Pro chat for every checkpoint. Do not keep one Pro chat forever either.

Reuse a related Pro chat while:

- the domain/objective family is unchanged;
- the owner-outcome and contract epochs are compatible;
- context remains healthy;
- prior context provides useful continuity rather than contamination;
- an independent fresh judgment is not required.

Each substantive review turn should receive a compact current-authority capsule plus only the new delta/evidence since the last reviewed boundary. The capsule must retain the owner outcome, current gaps, unmet outcomes, independent source receipt, both alignment states, latest outcome-progress receipt, current strategy state, and active design-feedback IDs even when older discussion is compacted.

Prepare a rollover when context pressure rises materially or the chat starts:

- citing superseded facts;
- confusing tasks/workers;
- repeating resolved findings;
- forgetting current owner locks or required outcomes;
- anchoring on its own prior proposal;
- producing contradictions without new evidence;
- accepting a downstream proxy as the parent outcome;
- collapsing worker-to-contract and contract-to-owner alignment;
- treating activity/supporting work as owner-outcome progress;
- forgetting a negative or flat result when recommending more of the same method;
- confusing operational, scientific, and release adequacy.

A new chat receives a deterministic handoff capsule from durable state, not only a free-form summary of the old chat.

## 8. Usage/resource exhaustion and account failover

The owner has authorized two account aliases: `primary` and `secondary`. Their actual identities are **private local configuration** and must not be committed to this public repository or copied into public logs.

If Pro, Codex, or another relevant resource becomes unavailable:

1. identify the exact exhausted/unavailable resource;
2. record the visible evidence (banner/error/usage state/reset time if shown);
3. checkpoint the current task, owner-outcome epoch/hash, current gap, both alignment states, outcome-advancement state, strategy-efficacy state, completion claim, branch, HEAD, tests, chat epoch, and next safe action;
4. audit whether that resource was being used efficiently, including overuse, harmful under-escalation, and substantial no-progress consumption;
5. consult the owner-private local account registry if it is available;
6. verify the secondary account actually has the required capability before switching;
7. switch only through a verifiable ordinary account-switch flow;
8. verify the active account after switching;
9. resume under the same durable task identity and owner-outcome epoch using an exact cross-account handoff capsule.

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

## 9. Brave/browser hygiene

For automation-controlled browsing:

- default to headless unless a headed UI is genuinely required;
- keep headed Brave windows out of the owner’s active workspace when possible;
- reuse the same relevant tab/session when it will be used again soon;
- treat system-opened tabs as leased resources, not permanent state;
- consider a tab “needed soon” when it is part of the next declared action or expected again within roughly 30 minutes;
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

A persistent Pro chat does not require keeping its tab open. Persist the chat URL, account alias, scope key, current capsule, owner-outcome epoch, and last reviewed boundary locally.

## 10. Continue automatically

An owner correction, answer, new shared rule, progress-review result, or Pro meta-review result is input to the current task, not a completion event. After incorporating it, continue to the next safe in-scope action unless a genuine owner decision, unavailable permission/credential, destructive/irreversible boundary, spending, publication, or explicit stop requires pausing.

Repairing a laundered contract is also not a reason to discard valid supporting work or wait. Preserve it, restore the actual remaining outcome, and continue.

A flat or regressing strategy is a reason to stop materially similar work—not to stop all unrelated safe work. Preserve the evidence, select a replacement, and continue under that method.

A nonblocking supervision-design question is not a reason to stop unrelated work. A blocking correctness/safety/progress defect holds only the affected boundary.

## 11. Mission Control-specific workers

Only if your assigned task **is Mission Control**, additionally read the current draft architecture on PR #42, especially:

- `patterns/codex-pro-supervision-mission-control.md`
- `patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md`
- `patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md`
- `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`
- `patterns/supervision-assurance-planes-and-pro-meta-review.md`
- `patterns/outcome-advancement-and-strategy-efficacy.md`
- `docs/exec-plans/2026-08-30-mission-control-symphony-gap-audit-and-pilot.md`
- `docs/exec-plans/2026-08-30-mission-control-resource-routing-failover-and-tab-hygiene-addendum.md`
- `docs/exec-plans/2026-08-30-mission-control-owner-outcome-terminal-integrity-addendum.md`
- `docs/exec-plans/2026-08-30-mission-control-dual-alignment-and-pro-meta-review-addendum.md`
- `docs/exec-plans/2026-08-30-mission-control-attention-and-correction-ux-addendum.md`
- `docs/exec-plans/2026-08-31-mission-control-outcome-progress-and-stagnation-addendum.md`

Do not make non-Mission-Control workers execute those implementation plans.

## 12. Current-worker receipt

At the next meaningful checkpoint, record briefly in durable task state:

- that this bootstrap was adopted;
- owner-request/outcome ID, locator, epoch, hash, and independent source-receipt status or `OUTCOME_AUTHORITY_UNRESOLVED`;
- normalized result;
- current gap and unmet required outcomes;
- `worker_to_contract_alignment`;
- `contract_to_owner_alignment`;
- typed completion claim;
- latest direct owner-outcome baseline/current/best evidence;
- `outcome_advancement`;
- current `strategy_id` and `strategy_efficacy`;
- work since the last direct evidence classified as direct progress, enablement, risk reduction, evidence acquisition, strategy learning, tooling, rework, or no-information-gain;
- next decision-changing measurement/intervention trigger;
- whether the current task contract/terminal boundary passed or required repair;
- AskRigor operational/scientific/release judgments when applicable;
- any substantive supervision-design feedback ID and Pro meta-review status;
- only the material effect on the active task.

Do not create ceremony or stop productive work merely to acknowledge it.
