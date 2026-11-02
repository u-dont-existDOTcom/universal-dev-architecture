# Hand the owner one pull request to merge, not several

## Goal

- Main objective: the owner's request of 2 November 2026: when pull requests wait for his merge, give him one combined pull request instead of several, durably as a UDA rule.
- Current contribution: rule 5 of `patterns/agent-completable-merge-gates.md`, structured as a task-time record with its clause map, pins and fixtures; index entries; an owner requirement record; tests.
- Scope boundaries: the merge-gates pattern; its task-time record, coverage entry and independent pins; the regenerated source lock and Work projection; the counts in `docs/uda-enforcement-coverage.md`, the universal-enforcement-coverage requirement and `patterns/task-time-lesson-activation.md`; `LESSON-INDEX.md`; `docs/INDEX.md`; the new requirement record; `tests/test_agent_completable_merge_gates.py`; `tests/test_uda_review_merge_slice.py`; the new fixture folder; and this record.
- Branch: `claude/one-pull-request-to-merge-20261102`.
- Task ID: `pr-463`.

## Authority / baseline

- Baseline: `9298052a3a67e3c9f82acdd0b61644eb9c4f58fb`.
- Authority: the owner's message of 2 November 2026, quoted in `docs/requirements/2026-11-02-one-pull-request-to-merge.owner-requirement.json`, and the standing approval of 22 October to merge Codex-reviewed changes with green CI.
- Failure classification: instruction gap. Rule 4 batched unavoidable owner clicks into one step but left the pull requests separate, so each waited for an update and new checks after the one before it merged.

## Active lesson contract

- The owner's statement is quoted exactly; the examples of a real cost of combining, and closing the originals with a link, are marked as the assistant's specification of his "if possible".
- Keep private repository locators and chat links out of public source.

## Completed

- `patterns/agent-completable-merge-gates.md`: rule 5, a status note, a failure condition, the repair, and the requirement-accretion line.
- `rules/rule-graph/task-time-metadata.v1.json`: record `uda.merge-gate.one-pull-request` (selectors for each of rule 5's 13 clauses; one semantic handoff obligation to the owner questions page; reason-bound NOT_APPLICABLE allowed).
- `rules/rule-graph/enforcement-coverage.v1.json` and the universal-enforcement-coverage requirement: the 13 clauses mapped; whole-pattern and per-section pins repinned (status, rules, failure condition and repair, requirement-accretion declaration); slice summary 71 merge clauses, 15 records.
- Regenerated `rules/rule-graph/generated/source-lock.v1.json` and the Work handoff projection; the generic Work handoff selects none of the merge-gate records.
- `tests/fixtures/review-merge-slice/uda.merge-gate.one-pull-request/`: neutral envelope, violating, compliant and near-miss candidates, hash-free verdicts.
- `docs/uda-enforcement-coverage.md`: the 13 table rows and the counts; `patterns/task-time-lesson-activation.md`: the slice counts.
- `LESSON-INDEX.md`, `docs/INDEX.md`: entry and requirement routing. `docs/requirements/2026-11-02-one-pull-request-to-merge.owner-requirement.json`: the owner's words, required behavior, surfaces and nonclaims.

## Current checkpoint

- Ready for review. Not merged.

## Evidence / artifacts

- `python3 -m unittest discover -s tests -v`: **PASS**, 997 tests.
- `python3 scripts/uda_enforcement_coverage.py validate`: VALID. `python3 scripts/uda_rule_graph.py validate`: PASS.
- `GITHUB_HEAD_REF=claude/one-pull-request-to-merge-20261102 UDA_TASK_ID=pr-463 python3 scripts/audit_codex_github.py --root . --fail-on error`: **PASS**, 0 errors.

## Remaining

- A clean Codex review and hosted CI, then merge under the owner's standing OK.

## Blockers / unresolved

- None known for this change.

## Next safe action

- Read the hosted checks and the Codex review; fix what they find; merge.
