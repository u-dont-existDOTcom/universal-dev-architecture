# One handoff line, not two that link the same file

## Goal

- Main objective: the owner's message of 27 November 2026, "why am i getting two github handoff lines with every turn?", quoting a reply from a lane whose handoff lives in GitHub that ended with a resume line and a GH handoff line linking the same file.
- Current contribution: when the resume line links the GitHub checkpoint, it is the GH handoff line (one line); a separate resume line stays only when it names a local note updated that turn; never two GitHub links.
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

- Root `AGENTS.md`: the last-lines line says one `GH handoff:` line, which is also the handoff for the other account; a separate resume line only when it names a local note updated that turn, never a second GitHub link.
- `patterns/cross-account-continuity.md` rule 5: one line when the resume line links the GitHub checkpoint; two only for a local note; never two GitHub links; what the line links follows the GH handoff pattern's rules 2 to 5. Its reference implementation gives the combined line.
- `patterns/owner-requested-terminal-github-handoff.md` rule 2 (the combined form; never two GitHub links) and its final check (a separate resume line names only a local note; at most one GitHub link); rules 3 to 5 unchanged from main.
- `LESSON-INDEX.md` entries 85 and 87, coverage review notes, the `docs/INDEX.md` route, the requirement record (with supersession markers on the 3 and 8 November records), regenerated rule-graph files, tests.
- Review history: ten local Codex rounds. Rounds 1 to 10 widened the wording (failed saves, read-backs, unverifiable links, finished work) and each round found new edge cases in what had been added. Following the root rule on compensating-fix chains, the change was cut back to the owner's ask: only the two-line ending changes; closing, which checkpoint, and the link-free line stay as on main.
- Round 12 (NO_MAJOR_ISSUES, three P2s): the task summary uses the exact local-note condition; the combined example and the record keep rule 3's `Closed:` form for completed work; a test covers the updated-note fallback.
- Round 13 (NO_MAJOR_ISSUES, three P2s): rule 5's combined form and example are for open work, with completed work routed to rule 3's `Closed:` form; the example names the checkpoint's next action, not a section heading; the test checks the example itself.
- Round 14 (NO_MAJOR_ISSUES, four P2s): the two-line form links the checkpoint as rules 2 and 4 say, naming a failed save; the one-link limit covers only the handoff ending, not earlier citations; tests check the Next and disclosure clauses and no longer pin the local path.
- Round 15 (NO_MAJOR_ISSUES, three P2s): the one-line rule and its final check are scoped to this owner, with another owner's explicit format kept; the combined line's Next reflects the current state and names a failed save; a failed local-note update is disclosed in every form.

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
