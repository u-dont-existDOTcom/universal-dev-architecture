# Documentation index

Read in this order:

1. `../LESSON-INDEX.md`
2. `../patterns/codex-github-operating-system.md`
3. The other task-relevant current pattern
4. `../state/CURRENT-STATE.md`
5. Exact project artifacts, tests, and Git history

For substantial bespoke method/framework/architecture/metric/algorithm/taxonomy/protocol/evaluation/workflow invention that plausibly overlaps established knowledge, load `../patterns/research-before-reinvention.md` before further investment. When academic literature is material, that orchestration pattern routes to `../patterns/existing-work-scan-and-scholarly-discovery.md`; use a scholarly semantic search system such as SciSpace when available for terminology/literature discovery, then verify load-bearing claims against primary sources.

For multi-worker Codex operation in which separate ChatGPT Pro chats supervise durable tasks, load `../patterns/codex-pro-supervision-mission-control.md`. It separates Symphony execution, Linear work state, GitHub authority, deterministic evidence, optional Extra High repository retrieval, Pro judgment, and owner-decision gates; Pro web supervisors must receive self-contained versioned packets and must not depend on reliable GitHub access.

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
