# Reference for the blind replay (written before any reviewer was run)

> The local files this page names are on the owner's machine and are not published here.

Written 13 Nov 2026, before the first Codex or Claude run. Sources: the fix commits on main, `git blame` and
`git log -S` on the parent of each fix, the Greptile command-line tool's own history file on the laptop
(`~/.greptile/reviews.json`), the other session's audit script and saved outputs (`/tmp/greptile-four-audits-20261112.sh`,
`/tmp/askrigor-greptile-results-20261112/`), and that session's command log (Desktop Commander's call log and tool
history). Copies of the last three are in `greptile-12nov/` beside this file.

## The five defects

| # | Defect | Faulty code, in main just before the fixes (`1e7d662e`) | Fix commit and what it changed | Introduced by | What Greptile was reviewing when it reported it |
|---|---|---|---|---|---|
| D1 | `plan_research`'s `next_step` says go on although the research target is not the registered one | `apps/research-mcp/src/research-steering.ts` 1127-1154 (`planNextStep`, which never reads `target_matches_plain_answer`) | `a84665fb`: same file 1129-1147 (now 1241-1263), new constants at 1085-1115, the text at 1138-1146; `research-contributor-access-tool.ts` 1317-1359 | `a5266acb` (11 Nov), pull request 437, merged 12 Nov as `a826ad10` | Command-line review, 12 Nov 22:46-22:53 UTC, of `fc4d23e6..1d877300` (the twelve merges from pull request 414 to 439: 259 files, 24,809 added lines), Base tier, with an instruction naming "newest ask/plan/digest/next_step changes". Finding: `research-steering.ts:940-957`, "Target mismatch loses comparison" |
| D2 | A forum page with 50 links to other threads' later pages hides the thread's own page 2 | `packages/sources/src/forum-page.ts` 291-307 (`laterPageLinks`; the stop at line 304); read by `apps/research-mcp/src/forum-tools.ts` 175, 204, 212 | `fb44d97a`: `forum-page.ts` 51-125 and 290-306 (now 320-354); `forum-tools.ts` 168-204 | `d920b344` (6 Nov), pull request 421, merged 6 Nov as `9dbc743a` | Command-line review, 12 Nov 22:58-23:02 UTC, of that one commit (`58fb7f29..d920b344`: 10 files, 220 added lines), Base tier, with an instruction to "find an exploit where an unread/incomplete thread becomes complete". Finding: `forum-page.ts:304`, "Thread pager gets dropped" |
| D3 | A YouTube audit's continuation handle stays claimed when a call is refused for its input | `apps/research-mcp/src/actions/research-routes.ts` 250-252 (returns before the handle is given back; claimed at 224-231) | `af4ca682`: same file 247-298 (now 248-307) | `660eda1b` (27 Oct), pull request 381, merged 29 Oct as `9e35397b` | Command-line review, 12 Nov 23:07-23:10 UTC, of that one commit (`d89b459f..660eda1b`: 40 files, 45,094 added lines), Base tier, with an instruction about release integrity that does not mention the handle. Finding: `research-routes.ts:250-252`, "Invalid requests lock continuation handles" |
| D4 | A refused study audit carries no structured content, so ChatGPT shows "The tool failed internally" | `apps/research-mcp/src/register-tools.ts` 3925-3935 (`invokeOpenFullTextMcp`: text and `isError` alone) | `c9ff7562`: same file, 168 new lines at 3750, and 3925-3940 (now 4094-4137), 4209, 4216 | `cbd90d46` (7 Nov), pull request 433, merged 9 Nov as `dc4cf76a`. Before it the refusal was a thrown error, also without structured content | Command-line review, 12 Nov 23:04-23:07 UTC, of that one commit (`c4c60b7c..cbd90d46`: 26 files, 817 added lines), Base tier, with an instruction to "inspect changed claim-coverage, audit-source, lessons connector and tests". Finding: `register-tools.ts:3693-3696`, "ChatGPT hides audit repair instructions" |
| D5 | A full-text lead in state ABSTRACT_ONLY is counted as "read 1 study only as an abstract" | `apps/research-mcp/src/reading-summary.ts` 109-115; the same in `source-reading.ts` (`receiptReadings`) | `dac22cce`: `reading-summary.ts` 110-115 (now 119-123); `source-reading.ts` 119-340; `research-finalization-gate.ts` 3254, 3319, 3330 | `cb0a7134` (6 Nov), pull request 422, merged 6 Nov as `dc2887b1` | Command-line review, 12 Nov 22:54-22:58 UTC, of `fc4d23e6..1d877300` again, Base tier, with an instruction saying "lead only never means full text read". Finding: `reading-summary.ts:112-115`, "Unread leads count as read" |

## What the records do and do not show

- GitHub shows none of the five. Greptile's comments on pull requests 437, 439, 440 and 441 are about other things.
  Pull request 441 and the release record say only "Greptile's reviews of 12 Nov 2026".
- The five came from six command-line reviews run by another session on 12 Nov between 22:46 and 23:10 UTC, on
  old code, each with a written instruction. Five reported one serious defect each; the sixth (privacy) found none.
- Each review's range, time, tier (Base), instruction and finding text are on the laptop, in the files named above.
  The other session's reasons for choosing those ranges are not recorded.
- Greptile had already reviewed D1's code without reporting it, as far as its comments and summaries show: on GitHub
  for pull request 437 (Apex tier, 4 other findings, one of them another gap in the same function) and for pull
  request 439 (Plus tier), and in command-line reviews at 15:02-15:20 and 18:53 UTC the same day. The full comment
  text of those command-line reviews is not on the laptop, only their summaries and counts.

## Units (decided before the replay)

One unit per defect: the pull request that introduced it, as the merge's first-parent diff, with the tree at the merge.

| Unit | Defect | Change given | Tree |
|---|---|---|---|
| U1 | D1 | Pull request 437: `git diff a826ad10^1 a826ad10` (47 files, 1,882 added lines, 308 KB) | `a826ad10` |
| U2 | D2 | Pull request 421: `git diff 9dbc743a^1 9dbc743a` (40 files, 1,621 added lines, 213 KB) | `9dbc743a` |
| U3 | D5 | Pull request 422: `git diff dc2887b1^1 dc2887b1` (51 files, 3,923 added lines, 363 KB) | `dc2887b1` |
| U4 | D4 | Pull request 433: `git diff dc4cf76a^1 dc4cf76a` (80 files, 5,066 added lines, 546 KB) | `dc4cf76a` |
| U5 | D3 | Pull request 381's diff is 2.66 MB, so files instead: `research-routes.ts` and the nine files it imports other than `register-tools.ts` (253 KB, left in the tree), shown as new files (about 190 KB) | `1e7d662e` |

Pull requests 439 and 440 are not units: they carry D1's function only as unchanged lines around their own changes.

## Scoring rule (decided before the replay)

- **Found:** a finding that names the same faulty behaviour at the same place.
- **Partly:** the right place, a different or vaguer fault.
- **Not found:** anything else.

| # | Same place | Same faulty behaviour |
|---|---|---|
| D1 | `planNextStep` in `research-steering.ts`, or where `next_step` is put in the result | With a research target that is not the registered one, `next_step` (the structured content) still says to go on, or to ask, without the correction the text carries |
| D2 | `laterPageLinks` in `forum-page.ts`, or `pagedHere` in `forum-tools.ts` | The limit of 50 counts links of any thread, so the thread's own later-page link can be left out and a thread of several pages reads as complete |
| D3 | The early return for invalid input in `research-routes.ts` | The claimed continuation handle is neither committed nor given back on that way out, so the retry is refused |
| D4 | The `AuditSourceMismatchError` branch in `invokeOpenFullTextMcp` in `register-tools.ts` | The refusal and its repair instructions are an error result with text alone, which a client that shows or reads structured content does not see |
| D5 | The `full_text_lead` branch in `reading-summary.ts`, or the same in `source-reading.ts` | A lead that found an abstract or part of a text readable counts as that much read, though the lead gave the AI no text |
