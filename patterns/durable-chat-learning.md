# Durable Chat Learning as a Completion Gate

## Problem

Agentic projects routinely discover useful lessons during chats, debugging, experiments, reviews, and repairs. If those lessons remain only in conversation context, they are fragile: a new chat may not see them, a worker may forget to promote them, and later packages can accidentally overwrite newer repository state with stale snapshots.

The durable solution is to make learning capture part of the definition of "done" and enforce it mechanically in the canonical project repository.

## Universal pattern

### 1. Repository-first state

Treat the project's Git repository as canonical durable state. Chat memory, model memory, generated bundles, and handoff text are aids, not authorities.

A fresh worker should retrieve current state from the repository before relying on remembered instructions. If a project maintains a lesson index, read that index first.

### 2. Index-first retrieval

Maintain one current lesson index that controls:

- current read order;
- authority/supersession rules;
- where exact evidence lives;
- relevant long-lived branches or archives;
- which summaries are current.

Do not hard-code an old list of lesson files into workers or bundles. The index is the stable entry point while the underlying lesson set evolves.

### 3. Every substantive finding gets a disposition

Before a substantive pass is called complete, review its actual findings and assign each one a semantic disposition. A useful default vocabulary is:

- `promoted` — transferable enough to enter current durable lessons;
- `provisional` — potentially transferable, but still experimental or awaiting replication;
- `project-specific` — useful locally but not a general lesson;
- `superseded` — retained for provenance but replaced by newer evidence or owner correction;
- `no-new-lesson` — reviewed and found not to add a new lesson.

The names may vary by project, but the invariant should not: **no substantive finding is silently left unreviewed**.

Non-promoted findings should carry a reason. Promotion should identify the exact durable summary/index updated.

### 4. Bind dispositions to exact evidence

A disposition should be tied to the exact source artifact, preferably by cryptographic content hash plus repository/ref/path metadata.

If the source artifact changes, the old disposition must not silently satisfy the gate. The changed evidence needs review again.

This prevents stale provenance from certifying materially different content.

### 5. Separate evidence from promoted lessons

Keep raw experiments, logs, incident notes, test results, and project-specific findings in the originating project. Promote only the reusable principle.

A promoted universal lesson should preserve:

- originating repository;
- source artifact or experiment;
- relevant commit/ref/date;
- what failed or was falsified;
- why the lesson is transferable;
- known limits and counterexamples.

Do not turn one local success into a universal superstition.

### 6. Make closeout a completion requirement

Workers and subagents should not report substantive work complete until they have:

1. identified new findings;
2. recorded dispositions;
3. updated project lesson summaries/indexes for promoted findings;
4. promoted genuinely cross-project lessons into the universal repository when warranted;
5. run the repository's lesson-integrity check;
6. verified the check passes.

The owner should not have to remember to ask.

### 7. Enforce the invariant in CI

Use a repository-side check on pushes and pull requests. The check should be semantic rather than merely verifying that a lesson file changed.

A robust gate verifies that newly added or materially changed research/incident/result artifacts have current dispositions. For promoted findings, require the current lesson index/summary to be updated in the same checked range.

This allows legitimate `project-specific` or `provisional` results without forcing every experiment into a universal rule.

### 8. Add a periodic orphan audit

Run a scheduled audit as a backstop for interrupted sessions, failed pushes, or workers that bypassed closeout. The audit should detect new substantive artifacts with no current disposition and automatically surface them, for example by opening/updating one GitHub issue.

The scheduled audit is not a substitute for the per-pass completion gate.

### 9. Support branch-local evidence explicitly

Long-running experiments may store exact evidence on a non-default branch while current lesson summaries live on `main`. The lesson index/ledger should preserve the source ref explicitly rather than pretending all evidence lives on the default branch.

Fresh workers should follow the index's branch routing when exact evidence matters.

### 10. Never let stale bundles overwrite newer canonical state

Installation/bootstrap bundles are snapshots. When installing into an existing canonical repository:

- fetch/inspect current repository state first;
- never blindly copy snapshot files over same-path canonical files;
- default to create-missing-only or explicit migration after comparison;
- require a deliberate merge when snapshot and repository both contain changed versions.

**Existing canonical Git state outranks an older package snapshot.**

This is especially important when multiple chats or workers can update the repository independently.

### 11. Promote cross-project lessons twice: local and universal

A strong local pattern may need two durable homes:

- the project repository, with exact context/evidence;
- the universal lessons repository, with the generalized rule and provenance link.

This preserves both fidelity and reuse. Universal lessons should point back to the originating project instead of duplicating all raw evidence.

## Reference implementation evidence

This pattern was first enforced in `u-dont-existDOTcom/pangram-humanization-lab` on 2026-08-13.

Relevant implementation:

- `state/LESSON-INDEX.md`
- `state/LESSON-LEDGER.json`
- `docs/LESSON-CLOSEOUT.md`
- `src/pangram_lab/lesson_closeout.py`
- `.github/workflows/lesson-integrity.yml`
- PR #5, merged as `a5466e02847a7aa35607c6a99987b999b2164970`

The PR's full GitHub Actions gate ran 39 tests and passed the changed-range closeout check plus current-ref audit before merge.

## Limits

- Do not force every observation to become a universal lesson.
- Do not auto-promote detector/model quirks without independent editorial/engineering justification.
- Do not let the universal repository override current project-specific requirements.
- Do not trust a disposition after its source artifact changes.
- Do not use scheduled audits as an excuse to skip closeout at completion time.
