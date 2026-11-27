# One handoff line, not two that link the same file

## Goal

- Main objective: the owner's message of 27 November 2026, "why am i getting two github handoff lines with every turn?", quoting a reply from a lane whose handoff lives in GitHub that ended with a resume line and a GH handoff line linking the same file.
- Current contribution: when the resume line links the GitHub checkpoint, it is the GH handoff line (one line); a separate resume line stays only when it points somewhere else, such as a local note; never two lines to the same file.
- Scope boundaries: the last-lines line in root `AGENTS.md`; rule 5 and the reference implementation of `patterns/cross-account-continuity.md`; rule 2 and the verification of `patterns/owner-requested-terminal-github-handoff.md`; their `LESSON-INDEX.md` entries and coverage notes; the `docs/INDEX.md` route; the regenerated rule-graph files; a requirement record; `tests/test_handoff_lines_and_owner_checks.py`; this record.
- Branch: `claude/one-handoff-line-20261127`.
- Task ID: `pr-507`.

## Authority / baseline

- Baseline: `3fce032` (#505).
- Authority: the owner's message of 27 November 2026, quoted in `docs/requirements/2026-11-27-one-handoff-line.owner-requirement.json`, and the standing approval to merge Codex-reviewed changes with green CI.
- Failure classification: rule interaction. The 8 November rule told a chat without a local note to name the Git checkpoint in the resume line, and the GH handoff line names it too.

## Active lesson contract

- The owner's words are quoted exactly; keeping two lines where they point to different places, and the combined line's wording, are marked as the assistant's specification.
- Keep private repository locators, lane names and chat links out of public source.

## Completed

- Root `AGENTS.md`: the last-lines line now says one `GH handoff:` line, which is also the resume instruction; a separate resume line only when it points somewhere else.
- `patterns/cross-account-continuity.md` rule 5 (one line when the resume line links the GitHub checkpoint; two only for different places; never two to the same file) and its reference implementation.
- `patterns/owner-requested-terminal-github-handoff.md` rule 2 (the combined form) and its verification (no line just before it links the same file).
- `LESSON-INDEX.md` entries 85 and 87, two coverage review notes, the `docs/INDEX.md` route, the requirement record, the regenerated source lock and Work projection (rendered contract unchanged at 32706 bytes), tests.

- After a local Codex review (one P1, three P2s): the combined line keeps an explicit `Next:` (and `Closed:` for finished work); the local-note disclosure covers any failure to update it; tests check the open and closed forms and the fallback; the requirement record describes what the earlier rule prescribed and marks its two-line ending superseded in part, both ways.
- After a second local review (one P1, two P2s): a separate resume line only for a local note updated that turn, never a second GitHub link; finished work ends with one `Closed:` line linking the final artifact; the linked forms need a link verified that turn, otherwise the link-free line; the distinctness note marks the two-line root rule as history; regressions for each.

## Current checkpoint

- Ready for review. Not merged.

## Evidence / artifacts

- `python3 -m unittest discover -s tests -v`: **PASS**, 1058 tests.
- `GITHUB_HEAD_REF=claude/one-handoff-line-20261127 UDA_TASK_ID=pr-507 python3 scripts/audit_codex_github.py --root . --fail-on error`: **PASS**, 0 errors, 1 warning (a missing section in another task's record, already on main).

## Remaining

- A clean Codex review and hosted CI, then merge under the owner's standing OK.

## Blockers / unresolved

- None known for this change.

## Next safe action

- Read the hosted checks and the Codex review; fix what they find; merge.
