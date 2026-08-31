# Documentation index

Read in this order:

1. `../LESSON-INDEX.md`
2. `../patterns/codex-github-operating-system.md`
3. The other task-relevant current pattern
4. `../state/CURRENT-STATE.md`
5. Exact project artifacts, tests, and Git history

For substantial bespoke method/framework/architecture/metric/algorithm/taxonomy/protocol/evaluation/workflow invention that plausibly overlaps established knowledge, load `../patterns/research-before-reinvention.md` before further investment. When academic literature is material, that orchestration pattern routes to `../patterns/existing-work-scan-and-scholarly-discovery.md`; use a scholarly semantic search system such as SciSpace when available for terminology/literature discovery, then verify load-bearing claims against primary sources.

For multi-worker Codex operation with ChatGPT semantic supervision, load all six current Mission Control patterns:

1. `../patterns/codex-pro-supervision-mission-control.md`
2. `../patterns/codex-supervision-intelligence-routing-and-context-lifecycle.md`
3. `../patterns/codex-supervision-resource-routing-account-failover-and-browser-hygiene.md`
4. `../patterns/owner-outcome-invariant-and-contract-laundering-prevention.md`
5. `../patterns/supervision-assurance-planes-and-pro-meta-review.md`
6. `../patterns/outcome-advancement-and-strategy-efficacy.md`

Together they separate Symphony execution, Linear work state, GitHub authority, deterministic evidence, Extra High reasoning/repository review, Codex local execution, high-intelligence Pro judgment, immutable/versioned owner-outcome authority, machine-checkable contract integrity, direct owner-outcome advancement, strategy efficacy, and a shared Pro meta-review lane for supervision-design improvements/questions.

Maintain a logical supervision lane per task rather than one always-active Pro chat per worker; reserve Pro especially for therapy-answer semantics, AskRigor methodological/conclusion flaws, difficult strategy-replacement judgments, and substantive supervision-design review; reuse related Pro chats with compact authority capsules and delta packets; and roll over only at explicit context, authority, contamination, account, or independence boundaries. Default analysis and repository review to Extra High, require a concrete local-execution reason before allocating Codex, audit Pro/Codex efficiency periodically and on exhaustion, use verified owner-authorized account failover without treating accounts as merged, keep personal account identifiers out of public GitHub, and close stale system-opened Brave tabs through periodic leased-tab audits. Pro web supervisors must never depend on reliable GitHub access.

Before preserving an existing task contract, acceptance criterion, checkpoint, or completion boundary, recover the original owner request independently and compare the downstream contract directly against it. A derived contract may refine or decompose the owner outcome but may not weaken, omit, replace, or terminally bypass it without an explicit owner decision. Every checkpoint and packet must carry the owner-source receipt, owner-outcome identity, verbatim/normalized result, current gap, unmet outcomes, non-satisfying proxies, objective-reconciliation record, two alignment states, typed completion claim, latest outcome-progress receipt, strategy state, and terminal-comparator result.

Keep these states separate:

```text
worker_to_contract_alignment: GREEN | YELLOW | RED | UNKNOWN
contract_to_owner_alignment: MATCH | PARTIAL | DIVERGED | SOURCE_MISSING
outcome_advancement: ADVANCING | FLAT | REGRESSING | UNMEASURED |
                     NOT_YET_MEASURABLE | BLOCKED_EXTERNAL | UNKNOWN
strategy_efficacy: VIABLE | UNCERTAIN | FAILED | EXHAUSTED |
                   REPLACEMENT_REQUIRED | BLOCKED_EXTERNAL | SUPERSEDED
```

A worker may be GREEN against a laundered task contract while contract-to-owner is DIVERGED; the root task must then be RED. A worker may also be GREEN and the contract may MATCH while the owner outcome is REGRESSING; a repeated or failed strategy must then be RED and replaced. Do not average the states.

`READY_FOR_OWNER_REVIEW`, tests green, preservation PASS, reviewer approval, and similar supporting states are nonterminal by default while a required owner outcome remains unmet. Commits, tests, audits, packets, documentation and elapsed work do not count as direct owner-outcome progress merely because they occurred.

Every material strategy must state its causal hypothesis, predicted result, success/failure threshold, measurement trigger and cycle/budget limit. Flat, regressing, overdue or exhausted strategies trigger automatic intervention before the owner has to ask whether progress occurred. Preserve valid supporting work, stop materially similar failed-strategy work, select a replacement through Extra High or Pro as appropriate, and continue automatically.

For AskRigor and comparable research work, separately record:

```text
operational_alignment
scientific_adequacy
release_adequacy
```

Scientific adequacy does not imply privacy, consent, licensing, freshness, provenance, security, product, or publication adequacy.

When a Codex worker identifies a substantive supervision-design improvement, loophole, ambiguity, recurring failure, or question, it must create `../templates/SUPERVISION-DESIGN-FEEDBACK.json`, assemble a self-contained evidence packet through deterministic tooling or Extra High, and route it to the shared scope-bound Pro supervisor-design chat. Immediate-risk defects—including owner-outcome loss, negative progress hidden by healthy alignment, false completion, or harmful therapy/research behavior—are reviewed immediately; nonblocking suggestions may be batched. Workers with no substantive feedback do not make ceremonial Pro calls.

For the Mission Control pilot and dashboard adaptation, load all required addenda:

- `exec-plans/2026-08-30-mission-control-owner-outcome-terminal-integrity-addendum.md`
- `exec-plans/2026-08-30-mission-control-dual-alignment-and-pro-meta-review-addendum.md`
- `exec-plans/2026-08-30-mission-control-resource-routing-failover-and-tab-hygiene-addendum.md`
- `exec-plans/2026-08-30-mission-control-attention-and-correction-ux-addendum.md`
- `exec-plans/2026-08-31-mission-control-outcome-progress-and-stagnation-addendum.md`

Run `../evals/mission-control/contract-laundering-article-humanization-13.82.json`, which must show worker-to-contract GREEN, contract-to-owner DIVERGED, and overall RED. Also implement the Somatic outcome-progress regression in the 2026-08-31 addendum: worker GREEN, contract MATCH, direct Human score regressing, strategy replacement required, and overall RED.

Machine-readable supervision templates:

- `../templates/OBJECTIVE-RECONCILIATION.json`
- `../templates/OUTCOME-PROGRESS-RECEIPT.json`
- `../templates/RESEARCH-SUPERVISION-VERDICT.json`
- `../templates/SUPERVISION-DESIGN-FEEDBACK.json`

For non-trivial software tasks where repeated testing could materially affect wall time, load `../patterns/test-efficiency-and-verification-budget.md`. Measure test cost from the start of substantive implementation, use focused/affected tests in the inner loop, run full suites at explicit checkpoints, and require a specialist trigger for mutation testing. Use `../scripts/test_efficiency.py` or a project-native equivalent to detect/skip redundant unchanged-state green full or mutation reruns and report test-time share.

For a broad comparison or landscape synthesis where omitted alternatives,
configurations, contexts, or outcome directions could change the conclusion,
load `../patterns/coverage-before-depth-in-selection.md` before deep candidate
selection. Deep audit completion and selection-space coverage are separate
gates. Derive structural applicability from the valid ledger rather than a
caller-supplied corpus label, and do not accept a continued page as complete
chain coverage without authenticated or server-held continuation state and
cumulative receipts.

For a server-controlled, resumable, multi-provider, or multi-stage workflow,
load `../patterns/executable-frontier-coherence.md` when unfinished state loses
its next capability, terminal and retryable projections diverge, a failed lane
suppresses independent work, or a compact wrapper may weaken its specialist
worker contract. A nonfinal state must expose server-directed work or an
explicit terminal blocked/bounded boundary; absence of a next capability never
authorizes finalization.

Templates live in `../templates/`. Use `../templates/PRIOR-WORK-SCAN.md` for durable prior-work/reuse/novelty ledgers. Execution plans live in `exec-plans/`.

`../patterns/codex-github-operating-standard.md` is retained as superseded provenance and routes to the operating-system pattern. It is not a second current standard.
