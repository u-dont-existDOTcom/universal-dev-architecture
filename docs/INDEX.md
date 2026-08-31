# Documentation index

Read in this order:

1. `../LESSON-INDEX.md`
2. `../patterns/codex-github-operating-system.md`
3. The other task-relevant current pattern
4. `../state/CURRENT-STATE.md`
5. Exact project artifacts, tests, and Git history

For substantial bespoke method/framework/architecture/metric/algorithm/taxonomy/protocol/evaluation/workflow invention that plausibly overlaps established knowledge, load `../patterns/research-before-reinvention.md` before further investment. When academic literature is material, that orchestration pattern routes to `../patterns/existing-work-scan-and-scholarly-discovery.md`; use a scholarly semantic search system such as SciSpace when available for terminology/literature discovery, then verify load-bearing claims against primary sources. Canonical repository-relative template: `templates/PRIOR-WORK-SCAN.md` (from this directory: `../templates/PRIOR-WORK-SCAN.md`).

For multi-worker Codex operation with ChatGPT semantic supervision, load all seven current Mission Control patterns. The first is controlling wherever older language is ambiguous:

1. `../patterns/chat-led-reasoning-codex-execution-separation.md`
2. `../patterns/codex-pro-supervision-mission-control.md`
3. `../patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md`
4. `../patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md`
5. `../patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`
6. `../patterns/supervision-assurance-planes-and-pro-meta-review.md`
7. `../patterns/outcome-advancement-and-strategy-efficacy.md`

**Controlling separation:** chats perform the reasoning; Codex performs only bounded execution that chats cannot reliably perform. Extra High is the default reasoning supervisor, Pro handles the highest-intelligence decisions, and Codex acts only from a current chat-authored execution directive. Codex may collect evidence and make tactical execution choices, but it may not choose strategy, interpret the owner outcome, author substantive prose, classify alignment/progress/adequacy/completion, decide Pro or owner escalation, or supervise itself.

Together the patterns separate ChatGPT reasoning, Symphony execution orchestration, Linear work state, GitHub authority, deterministic evidence, Codex local execution, Pro escalation, immutable/versioned owner-outcome authority, contract integrity, direct outcome advancement, strategy efficacy, and shared Pro meta-review.

Maintain a logical reasoning-supervision lane per task rather than one always-active Pro chat per Codex session. Every nontrivial Codex run must be bound to `../templates/CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json` and return `../templates/CODEX-EXECUTION-RECEIPT.json`. A Codex checkpoint or self-review is only an execution claim for independent chat review; it is never the supervisory judgment.

Reserve Pro especially for therapy-answer semantics, AskRigor methodological/conclusion flaws, difficult strategy-replacement judgments, consequential architecture/product questions, and supervision-design review. Reuse related reasoning chats with compact authority capsules and delta packets; roll over only at explicit context, authority, contamination, account, or independence boundaries. Default analysis, repository review, planning, article authoring, progress judgment, and strategy selection to Extra High. Require a concrete local-execution reason before allocating Codex. Pro web supervisors must never depend on reliable GitHub access.

Before preserving an existing task contract, acceptance criterion, checkpoint, or completion boundary, recover the original owner request independently and compare the downstream contract directly against it. A derived contract may refine or decompose the owner outcome but may not weaken, omit, replace, or terminally bypass it without an explicit owner decision. Every reasoning checkpoint and packet must carry the owner-source receipt, owner-outcome identity, current gap, objective-reconciliation record, alignment states, typed completion claim, outcome-progress receipt, strategy state, active execution directive, and reviewed evidence boundary.

Keep these states separate:

```text
worker_to_contract_alignment: GREEN | YELLOW | RED | UNKNOWN
contract_to_owner_alignment: MATCH | PARTIAL | DIVERGED | SOURCE_MISSING
outcome_advancement: ADVANCING | FLAT | REGRESSING | UNMEASURED |
                     NOT_YET_MEASURABLE | BLOCKED_EXTERNAL | UNKNOWN
strategy_efficacy: VIABLE | UNCERTAIN | FAILED | EXHAUSTED |
                   REPLACEMENT_REQUIRED | BLOCKED_EXTERNAL | SUPERSEDED
```

A worker may be GREEN against a laundered contract while contract-to-owner is DIVERGED; the root task is RED. A Codex executor may also follow a correct directive while the owner outcome is REGRESSING; the chat must stop the failed strategy and issue a replacement directive. Do not average these states.

`READY_FOR_OWNER_REVIEW`, tests green, preservation PASS, reviewer approval, and similar supporting states are nonterminal while a required owner outcome remains unmet. Commits, tests, audits, packets, documentation, and elapsed work do not count as direct owner-outcome progress merely because they occurred.

Every material strategy must state its chat-authored causal hypothesis, predicted result, success/failure threshold, measurement trigger, and cycle/budget limit. Flat, regressing, overdue, or exhausted strategies trigger chat review and replacement before the owner asks. Codex returns evidence and stops; it does not diagnose or choose the replacement strategy.

For AskRigor and comparable research work, separately record:

```text
operational_alignment
scientific_adequacy
release_adequacy
```

Scientific adequacy does not imply privacy, consent, licensing, freshness, provenance, security, product, or publication adequacy.

When a substantive supervision-design improvement, loophole, ambiguity, recurring failure, or question is found, Codex reports the execution observation, Extra High prepares `../templates/SUPERVISION-DESIGN-FEEDBACK.json`, and the shared Pro supervisor-design chat judges the architecture. Immediate-risk defects—including owner-outcome loss, Codex strategic reasoning, negative progress hidden by healthy alignment, false completion, or harmful therapy/research behavior—are reviewed immediately.

For the Mission Control pilot and dashboard adaptation, load all required addenda:

- `exec-plans/2026-08-30-mission-control-owner-outcome-terminal-integrity-addendum.md`
- `exec-plans/2026-08-30-mission-control-dual-alignment-and-pro-meta-review-addendum.md`
- `exec-plans/2026-08-30-mission-control-resource-routing-failover-and-tab-hygiene-addendum.md`
- `exec-plans/2026-08-30-mission-control-attention-and-correction-ux-addendum.md`
- `exec-plans/2026-08-31-mission-control-outcome-progress-and-stagnation-addendum.md`
- `exec-plans/2026-08-31-mission-control-chat-reasoning-codex-execution-migration.md`
- `exec-plans/2026-08-31-mission-control-active-task-authority-and-blocker-scope.md`

Run these hostile fixtures:

- `../evals/mission-control/contract-laundering-article-humanization-13.82.json`
- `../evals/mission-control/outcome-regression-somatic-r15.json`
- `../evals/mission-control/codex-self-supervision-articles-failure.json`

Machine-readable supervision templates:

- `../templates/OBJECTIVE-RECONCILIATION.json`
- `../templates/OUTCOME-PROGRESS-RECEIPT.json`
- `../templates/CHAT-TO-CODEX-EXECUTION-DIRECTIVE.json`
- `../templates/CODEX-EXECUTION-RECEIPT.json`
- `../templates/RESEARCH-SUPERVISION-VERDICT.json`
- `../templates/SUPERVISION-DESIGN-FEEDBACK.json`
- `../templates/SCOPED-BLOCKER.json`
- `../templates/WAIT-ADMISSION.json`

Resolve the current active-task lock and matching task-local checkpoint before consuming repository-global execution status. A global `BLOCKED`, `WAITING`, or `OWNER_DECISION_REQUIRED` label is not transitive across task IDs; it affects the active frontier only through a current scoped blocker and causal dependency. A wait additionally requires an exact changing condition, actor or mechanism, and bounded horizon.

Bind the current owner-source/correction record through a separately validated independent receipt, then bind the exact checkpoint path/ref/object/content hash before authorizing execution. Project frontier authorization and permitted action class separately from descriptive task state. Task independence cannot waive a causally applicable non-waivable policy. Substantive directives require a transactional exact match to current `VALID`/`AUTHORIZED` resolver and wait-admission outputs. Reasoning-review and owner-decision frontiers remain non-substantive. Blocker/owner/reasoning waits must match their authoritative unblock record with parsed start/check/horizon timing, and reasoning waits need continuous accepted lease coverage through their declared horizon.

For non-trivial software tasks where repeated testing could materially affect wall time, load `../patterns/test-efficiency-and-verification-budget.md`. Measure test wall-time share, use focused/affected tests in the inner loop, run full suites at explicit checkpoints, and require a specialist trigger for mutation testing.

For a broad comparison or landscape synthesis where omitted alternatives, configurations, contexts, or outcome directions could change the conclusion, load `../patterns/coverage-before-depth-in-selection.md` before deep candidate selection.

For a server-controlled, resumable, multi-provider, or multi-stage workflow, load `../patterns/executable-frontier-coherence.md` when unfinished state loses its next capability, terminal and retryable projections diverge, a failed lane suppresses independent work, or a wrapper weakens its specialist contract.

Templates live in `../templates/`. Execution plans live in `exec-plans/`.

`../patterns/codex-github-operating-standard.md` is retained as superseded provenance and routes to the operating-system pattern. It is not a second current standard.
