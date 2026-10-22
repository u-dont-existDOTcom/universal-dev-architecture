# Current State — Mission Control: a held retry's search keeps the threads it ruled out, so ChatGPT's rate limit can't stop it finishing

## Goal

- Task ID: `pr-421`.
- Branch: `claude/mc-retry-search-progress-20261022`.
- On 2026-10-22 the owner authorized a retry of the Atlas task's failed Work start (#385, after #419). Before the retry's Work call, the controller must read every thread made since the failed start with no match. ChatGPT refuses the account's reads ("Too many requests") after 6 to 11 of them, and 21 threads must be read, so every try ended `PRIOR_ATTEMPT_SEARCH_INCOMPLETE` and started over. The receipt copiers' scans that caused most of the reads were throttled in #420; the limit was still in force at 20:29 UTC.

## Authority / baseline

- Owner direction: #385; the owner's standing OK of 2026-10-22 19:25 UTC (read-only checks on the server; merge and deploy once Codex finds no major issues).
- Baseline: `main` at `00a92993` (#420 merged).
- Evidence: the dispatcher's output on the server held the retry with `PRIOR_ATTEMPT_SEARCH_INCOMPLETE` every 5 minutes; its tries at 20:17, 20:23 and 20:29 UTC read 11, 6 and 6 threads before "Too many requests".

## Completed

- `lib/chatgpt-work-cloud-controller.ts`: `searchForPrompt` takes `ruledOut`, the threads earlier tries of the same search read with a first message matching neither the prompt nor a marker, and doesn't read them again (a thread's first message never changes). With it, a try reads at most 25 threads and says INCOMPLETE while others remain; it reads on past a temporary thread or one without a first message (still INCOMPLETE at the end, unless a later thread matches), and stops at the first failed read or an answer that isn't the thread asked for. `readPauseMs` spaces the reads. Without `ruledOut` the search behaves as before. `privatePriorSearchRuledOut` keeps the set in a private file (mode 0600) named for its search.
- `scripts/dispatch-chatgpt-work-cloud.ts`: the retry's search keeps its set in `<request>.prior-search.json` beside the private request, named for a digest of the failed start's prompt and dispatch ids, and pauses 2 seconds between reads.
- `tests/chatgpt-work-cloud-retry.test.ts`: a try cut short goes on where it stopped; ruled-out threads aren't read again; a match is still found; another search's file rules nothing out; the 25-read cap per try; temporary threads and refusals.
- README and `docs/CHATGPT-WORK-CLOUD-DISPATCH.md`.

## Current checkpoint

- Ready for review. This session can't run the repository's code (its safety check refuses running a downloaded repository), so the hosted checks are the test of record.

## Remaining

- Hosted checks and Codex review. Then merge (the owner's standing OK), and move the dispatcher on the server to the new version.

## Blockers / unresolved

- Follow-up: the search doesn't read pinned threads (`pinnedThreads`).

## Evidence / artifacts

- `python3 -m unittest discover -s tests -v`: **UNVERIFIED** in this session (it can't run the repository's code); hosted CI runs it, counts unavailable here.
- `GITHUB_HEAD_REF=claude/mc-retry-search-progress-20261022 UDA_TASK_ID=pr-421 python3 scripts/audit_codex_github.py --root . --fail-on error`: **UNVERIFIED** in this session; hosted CI runs it, counts unavailable here.

## Next safe action

- Read the hosted checks and Codex review; fix what they find; merge and move the dispatcher under the owner's standing OK.
