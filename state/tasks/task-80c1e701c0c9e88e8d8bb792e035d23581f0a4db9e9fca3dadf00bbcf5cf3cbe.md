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

- Root `AGENTS.md`: the last-lines line says one `GH handoff:` line; for open work it is also the resume instruction (`Next:`), for finished work it closes the work (`Closed:`); a separate resume line only for open work whose local note was updated that turn, never a second GitHub link.
- `patterns/cross-account-continuity.md` rule 5: one line when the resume line links the GitHub checkpoint; two only for a local note and open work; never two lines to the same file; finished work one `Closed:` line; which checkpoint or artifact the line links follows the GH handoff pattern's rules 3 to 5. Its reference implementation gives the combined line.
- `patterns/owner-requested-terminal-github-handoff.md` rule 2 (the combined form; `Closed:` in one line; never two GitHub links) and its final check; rules 4 and 5 unchanged from main.
- `LESSON-INDEX.md` entries 85 and 87, coverage review notes, the `docs/INDEX.md` route, the requirement record (with supersession markers on the 3 and 8 November records), regenerated rule-graph files, tests.
- Review history: nine local Codex rounds. Rounds 1 to 9 widened the fallback wording (failed saves, read-backs, unverifiable links) and each round found new edge cases in it. Following the root rule on compensating-fix chains, round 10's state was cut back to the owner's ask: the fallback rules (rules 4 and 5) stay as they are on main, and only the one-line ending changes.

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
