# Greptile: does it catch what Claude and Codex review miss? (13 Nov 2026)

> Classification: `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`. One owner's project findings (AskRigor and this
> repository), copied here on 13 Nov 2026 from the owner's working notes at the owner's direction, so that the
> stage issue can link to them. Desk research by AI research helpers unless a section says a test was run; the
> sources were gathered through a summarizing fetch tool and were not reread. Nothing here is an endorsement.
> The stage issue stays open: its place in the queue is the roadmap's to decide.

UDA issue 477: Greptile vs Claude/Codex code review. Stage 2 of the tool radar.

## Short answer

**PILOT, on risky changes only.** A blind replay on 13 Nov supports the exception rule the owner already set, and no more than that.

- **Codex and Claude each found 1 of Greptile's 5 serious defects, and it was the same one.** Codex was also at the right lines for a second, with a different fault. By the rule set before the run, 0 or 1 found supports using Greptile on risky changes. The details are in Experiment 1, at the end of this page.
- **It was not a like-for-like test.** Each Greptile review that found one of the five carried a written instruction saying what to look for. Codex and Claude got one neutral instruction. The one defect Greptile found without a pointer is the one they both found.
- **Greptile found real defects that our own checks had passed.** Five serious ones (grade P1), fixed in pull request 441, were each reproduced by a failing test. They were already in released builds. All five came from reviews at the Base tier, the cheapest.
- **The free reviewers found real defects too.** Seven of them are still in the code, and three of those were graded serious. Experiment 1 lists them.
- **The evidence is narrow.** In the helper's words: "one repo, one author, one fortnight". The replay was one run per reviewer.
- **Greptile missed what the owner saw in live use:** the wrong question answered, and the orange-peel and SMILES questions going straight to an answer. Only live runs caught those.

## What was measured, and by whom

The counts are the helper's own, taken from the project's pull requests (PRs), commit messages and release records. P1 is the more serious grade, P2 the lesser.

| Claim | Number | Measured by | What weakens it |
|---|---|---|---|
| Greptile findings recorded on AskRigor PRs 437 to 442 | "about 21" | The research helper | Its own breakdown adds up to 19, and it says two of those repeat other items |
| Split by grade | P1: 7. P2: "9 or more" | The research helper | Its own table lists 8 P1 (one on PR 437, two on 439, five on 441) and 8 P2 |
| Confirmed by a failing test | 5, all P1, all recorded on PR 441 | The project's own record: "Five confirmed defects, each reproduced by a failing test" | For the other fixes the test status is "NOT STATED". The two P2 fixes on PR 441 are also said to have tests that fail on the old code |
| False positives; declined | 1; 1 | The research helper | The text of the false positive was not found. The declined item is missing from the findings table |
| Reviews that found nothing | 3: PR 440, PR 442, a local re-review of 441 | The research helper | The same report lists two P2 findings on PR 440 |
| Minutes from the last commit to Greptile's review | About 11 (PR 437), about 11 (PR 439), about 9.5 (PR 441) | The research helper, from timestamps | Local command-line reviews "took 4 to 8 minutes", but their start times are not recorded |
| Other reviewers on PR 437 | Two adversarial reviews found 11 findings, then 3 | The project's own record (PR 437 body) | "The reviewer is NOT STATED." |
| Published accuracy of review tools | Greptile: precision 76.2%, recall 50.6%, F1 60.8%. CodeRabbit: 64.9%, 51.6%, F1 57.5% | Unknown. Search snippets only, not opened | Secondary reporting. No independent test of Claude Code or Codex review against Greptile was found |

Precision is the share of a tool's warnings that were real. Recall is the share of the real bugs it found. F1 combines the two.

**Where the report does not add up:**

- **PR 440 is counted both ways.** It is listed with two P2 findings, and also as a clean review where "Greptile found nothing".
- **"Passed own review and tests" mostly means tests.** The helper defines it as the project's verify or CI run "plus any adversarial review", and records such a review only for PR 437.
- **The proposed rule asks for the cheapest tier, Base.** The findings whose review tier is recorded came from dearer tiers: Apex on PRs 437 and 441, Plus on 439. No tier is recorded for PRs 440 and 442.
- **The one benchmark page opened had no usable numbers.** It was a post by Kilo, "a vendor that ranked first", about the Martian Code Review Bench. It gave no Greptile, CodeRabbit, Claude Code or Codex figures. The other benchmarks found are the vendors' own: Augment's test, Greptile's 50-bug evaluation, GitHub's ReviewBench, and Tenki.

## Against what we do now

- **Our own checks before Greptile saw the code:** the project's full test run, `npm run verify`. It shows 6,441 passed on PR 437, 6,459 on 439, 6,474 on 440 and 6,512 on 441. Also CI (the automatic checks on each change), and on PR 437 two adversarial reviews (reviews that set out to find faults).
- **The five confirmed defects, in the report's words:** `next_step` says go on when the target is not the registered one; a lead is counted as an abstract read; a forum page with 50 other links hides its own page 2; a refused study audit shows ChatGPT "failed internally"; a YouTube handle stays claimed.
- **What other checks caught and Greptile did not report:** the release probe of #437 found a tool-list notice ordering bug. The owner's ChatGPT test runs found the refused-menu loops and the ignored "you decide" ask. Round 5 found the orange-peel and SMILES questions going straight to an answer.
- **Found in production by an outside user:** nothing in these records.
- **Where the history shows Greptile helping:** protocol or step-order logic across modules, state and paging, and structured-versus-text output paths. It found nothing on small changes with a narrow diff.
- **The rule the helper proposes:** "Request one Base review of a cross-module or protocol-control change that has already passed the tests and Claude+Codex review. Skip it for small, single-module, documentation or wording changes."

## Costs and limits

- **Price** (greptile.com/pricing): the Starter plan is free with "50 free credits per month". On Pro: "Buy credits as you need them at $1 each".
- **Credits per review:** "Base review: 1 credit", "Plus review: 3 credits", "Apex review: 10 credits".
- **What this history used**, by the badge in each review comment: PR 437 Apex (10 credits), PR 439 Plus (3 credits), PR 441 Apex (10 credits). PRs 440 and 442 show no tier badge.
- **Command-line reviews:** the docs say the free plan does not include them. A secondary source (wavect.io, a search snippet) says the command-line tool defaults to Base.
- **Billing:** only completed reviews spend credits. Whether a review with no comments is billed "is not stated".
- **An unrequested review:** the owner's note in the issue says a Base review ran on the first #443 revision ("2 files reviewed, 0 comments"). "Its charge is unverified."
- **Privacy:** the issue forbids private-data uploads. The helper says this does not apply to the experiment below, "since AskRigor is public".

## First experiment

- **What to run:** a blind replay of the five PR 441 defects. Check out the parent commit `1e7d662e`, which still has them, and have Codex and Claude each review it with no hint of the bugs (the report's words: "Codex-on-Claude and Claude-self"). Do not run Greptile: its findings are already on record.
- **Cost:** "zero Greptile credits; model tokens only".
- **Pass or fail:** Greptile's five confirmed P1 defects are the reference. If the cheaper reviewers find at least 3 of the 5, Greptile is not worth credits. If they find 0 or 1, that supports PILOT. The report does not say what 2 of 5 would mean.
- **What it needs from the owner:** the owner's authorization for the Codex or Claude review sessions, which was given on 13 Nov 2026; the run is Experiment 1 below.

## Receipt for the issue

```text
## Investigation result
Outcome: PILOT
Evidence: https://github.com/u-dont-existDOTcom/universal-dev-architecture/blob/main/docs/research/ai-tool-radar/stage-02-greptile-code-review.md
Comparison: Greptile found five serious defects in AskRigor that had passed the project's own tests, CI and reviews and shipped, each confirmed by a failing test. In a blind replay on 13 Nov 2026, Codex and Claude each reviewed, with one neutral instruction, the changes that introduced the five; each found one of them, the same one, and Codex was at the right lines for a second. By the rule set beforehand (0 or 1 found) this supports Greptile for risky changes only.
Unresolved: Each Greptile review that found one of the five was given a written instruction saying what to look for, and the replay's reviewers were not, so whether Codex or Claude would find the other four with the same instructions is not known. A second replay would show it (model use only, no Greptile credits).
```

## Sources

As the helper's report lists them:

- Issue #477, `docs/ai-tool-radar-roadmap.md`.
- AskRigor PRs 437, 439, 440, 441 and 442: bodies, commits, Greptile comments and reviews.
- AskRigor issue 438. It is not a PR, has no Greptile content, and is open.
- AskRigor audit records of 2026-11-12 (three) and 2026-11-13 (greptile-fixes).
- Docs: `docs/greptile-credit-policy.md` on the #443 head SHA; main returned 404.
- Docs: `docs/superpowers/plans/2026-11-09-research-steering.md` and `2026-11-07-next-build.md`, `docs/design-decisions.md`.
- Web: greptile.com/pricing, greptile.com/docs/account/billing-seats.md, blog.kilo.ai Martian page (blog.kilo.ai/p/martians-independent-benchmark-tested).
- Search snippets only: wavect.io, augmentcode.com and other benchmark posts.
- NOT OPENED: greptile.com/ai-code-review-evaluation and the Martian bench site. `docs/audits/2026-11-10-owner-answer-286-production-release.md` was only keyword-grepped.

These were gathered by a research helper on 13 Nov 2026, the web pages through a summarizing fetch tool, and were not reread by the main session.

## Experiment 1: blind replay with Codex and Claude (13 Nov 2026)

**Each of our two free reviewers found 1 of Greptile's 5 serious defects, and both found the same one.** By the rule set before the run, 0 or 1 found supports using Greptile on risky changes. The test was harder for them than it had been for Greptile, which had been told what to look for.

- **Found by both:** the YouTube audit's continuation handle that stays claimed.
- **Partly found, by Codex only:** the forum page. Codex pointed at the right lines and named a different fault.
- **Found by neither:** `next_step` saying go on for the wrong research target, the refused study audit, and the full-text lead counted as a reading.
- **Still in the code:** the two reviewers also reported seven real defects that nobody has fixed. Three were graded serious (P1) by at least one of them. They are listed below.
- **Greptile was not run.** No credits were used.

### What Greptile found, and what it was looking at

This comes from the fix commits, the code's history, the Greptile tool's own history file on the laptop (`~/.greptile/reviews.json`), and the script, saved outputs and command log of the session that ran the reviews.

- **GitHub shows none of the five.** Greptile's comments on pull requests 437, 439, 440 and 441 are about other things. Pull request 441 says only "Greptile's reviews of 12 Nov 2026".
- **They came from six command-line reviews of old code.** Another session ran them on 12 Nov between 22:46 and 23:10 UTC. Five reported one serious defect each. The sixth, on privacy, reported nothing.
- **Each review carried a written instruction saying what to look for.** For four of the five defects the instruction named the fault or its area. The table quotes them.
- **All six ran at the Base tier**, the cheapest (1 credit each on the price list). The line above about dearer tiers is true of the GitHub reviews only.
- **Greptile had passed over the first defect before.** Seven earlier reviews that day covered the same function and did not report it: two on GitHub (pull request 437 at the Apex tier, 439 at Plus) and five from the command line. Its wider reviews that afternoon had also been shown the code of D2, D4 and D5 without reporting them.
- **Not recorded:** why that session chose those stretches of code and those instructions.

| # | Defect | Faulty code in main just before the fixes (`1e7d662e`) | Fixed by | Introduced by | What Greptile was shown | What its instruction said |
|---|---|---|---|---|---|---|
| D1 | `plan_research`'s `next_step` said to go on although the research target was not the registered one | `apps/research-mcp/src/research-steering.ts` 1127-1154 (`planNextStep`) | `a84665fb`: that function (old lines 1129-1147), the text beside it (1041-1043), and the call in `research-contributor-access-tool.ts` (1317-1359) | `a5266acb`, 11 Nov, pull request 437 | Twelve merged pull requests as one diff, 414 to 439 (`fc4d23e6..1d877300`: 259 files, 24,809 added lines) | "Review newest ask/plan/digest/next_step changes". It names the function's output |
| D2 | A forum page with 50 links to other threads' later pages hid the thread's own page 2 | `packages/sources/src/forum-page.ts` 291-307 (`laterPageLinks`, the stop at line 304); read at `apps/research-mcp/src/forum-tools.ts` 175 | `fb44d97a`: `forum-page.ts` (old lines 51-125 and 290-306) and `forum-tools.ts` (168-204) | `d920b344`, 6 Nov, pull request 421 | That one commit (`58fb7f29..d920b344`: 10 files, 220 added lines) | "Find an exploit where an unread/incomplete thread becomes complete". It names the fault |
| D3 | A YouTube audit's continuation handle stayed claimed when a call was refused for its input | `apps/research-mcp/src/actions/research-routes.ts` 250-252 | `af4ca682`: the same file (old lines 247-298) | `660eda1b`, 27 Oct, pull request 381 | That one commit (`d89b459f..660eda1b`: 40 files, 45,094 added lines, most of them generated tool lists) | About release integrity: tool lists, versions, packages. Nothing about the handle |
| D4 | A refused study audit carried no structured content, so ChatGPT showed "The tool failed internally" | `apps/research-mcp/src/register-tools.ts` 3925-3935 (`invokeOpenFullTextMcp`) | `c9ff7562`: the same file (168 new lines after 3749; old lines 3925-3940, 4209, 4216) | `cbd90d46`, 7 Nov, pull request 433. Before it the refusal was also an error with no structured content | That one commit (`c4c60b7c..cbd90d46`: 26 files, 817 added lines) | "Inspect changed claim-coverage, audit-source, lessons connector and tests". It names the area |
| D5 | A full-text lead in state ABSTRACT_ONLY was counted as "read 1 study only as an abstract" | `apps/research-mcp/src/reading-summary.ts` 109-115; the same in `source-reading.ts` | `dac22cce`: `reading-summary.ts` (old lines 110-115), `source-reading.ts` (119-340), `research-finalization-gate.ts` (3254, 3319, 3330) | `cb0a7134`, 6 Nov, pull request 422 | The same twelve pull requests as D1, reviewed a second time | "lead only never means full text read". It names the fault |

### The review units

One unit per defect: the pull request that introduced it, as one diff, with the code as it stood right after that pull request was merged.

| Unit | For | The change the reviewer got | Code state |
|---|---|---|---|
| U1 | D1 | Pull request 437 (47 files, 1,882 added lines, 308 KB) | `a826ad10` |
| U2 | D2 | Pull request 421 (40 files, 1,621 added lines, 213 KB) | `9dbc743a` |
| U3 | D5 | Pull request 422 (51 files, 3,923 added lines, 363 KB) | `dc2887b1` |
| U4 | D4 | Pull request 433 (80 files, 5,066 added lines, 546 KB) | `dc4cf76a` |
| U5 | D3 | Ten whole files (about 4,600 lines, 200 KB), not a pull request | `1e7d662e` |

- **Unit 5 is the exception the task allowed.** The pull request that introduced the YouTube defect is a 2.66 MB diff. So the reviewers got the faulty file and nine of the ten files it calls, shown as new files. The tenth, `register-tools.ts` (253 KB), stayed in the folder for them to open.
- **Pull requests 439 and 440 are not units.** They changed the function with the first defect, but its faulty lines are only unchanged lines in their diffs.
- **How they were made:** each diff is `git diff <merge>^1 <merge>`, and the code was exported with `git archive`, so the folder held no Git history.

### The instruction

Every run got exactly this text and nothing else:

```text
You are given one change to review.

- The change is the file `change.diff` in the current directory. The repository in the current directory is at the state after the change.
- Review the change for correctness defects only: wrong behaviour, missing cases, states that cannot be left, results a client cannot read.
- Read whatever surrounding code you need. Do not run tests. Do not use the network.
- Report at most 12 findings, the most serious first. For each one give the file and line, what goes wrong in a concrete scenario, and a severity (P0, P1 or P2).
- Report nothing you cannot point to a line for.
- You have about 15 minutes and at most 50 rounds of tool use. Your last message must be the findings themselves.
```

The last line is an addition to what the task asked for. It tells the reviewer the limits it ran under, so that it reports before being cut off.

### How the reviewers were run

- **Codex:** `codex exec`, version 0.167.0, read-only sandbox, model gpt-6.1-sol at its highest reasoning setting ("xhigh").
- **Claude:** Claude Code 2.1.322 in print mode, model Opus 5.5 (`claude-opus-5-5`), at most 60 turns, tools Read, Grep and Glob. Claude Code also let it run a few read-only shell commands (grep, sed, wc, ls) without asking.
- **Both:** inside the exported folder, with `change.diff` in it, 20 minutes at most, three runs at a time, from a clean environment so that nothing of this session carried over.
- **Two switches were added to the Codex command as given:** `--disable apps` and web search off. In a trial run Codex fetched twelve files from GitHub through ChatGPT's GitHub app before it did anything, as its standing instructions on this laptop tell it to. With that app on it could also have read the fixed code on GitHub.
- **Checked afterwards:** every tool call of all eleven runs was read back. No run used the network or an app. No run opened a file outside its folder, except that one Codex run read the laptop's installed AskRigor plugin instructions (dated 6 Nov, nothing about the defects). No reviewer mentioned Greptile.

```text
codex exec --skip-git-repo-check -s read-only -c mcp_servers.<each of the five local servers>.enabled=false
  --disable browser_use --disable browser_use_external --disable in_app_browser --disable computer_use
  --disable apps -c 'web_search="disabled"' -C <exported folder> --json -o out.md - < prompt.md
claude -p --model claude-opus-5-5 --max-turns 60 --allowedTools "Read,Grep,Glob" --strict-mcp-config
  --mcp-config '{"mcpServers":{}}' < prompt.md > out.md        (run from inside the exported folder)
```

### Results

**Found** means a finding that names the same faulty behaviour at the same place. **Partly** means the right place and a different or vaguer fault. The rule for each defect was written down before the first run.

| # | Defect | Codex | Claude |
|---|---|---|---|
| D1 | `next_step` and the wrong research target | **Not found.** Three findings on this pull request, none about the research target or `next_step` | **Not found.** Five findings, none about it |
| D2 | Forum page 2 hidden by 50 other links | **Partly.** The right lines (`forum-tools.ts:168`), a different fault: "the reader discovers the link, but this destructuring removes it without populating `next_page`. The result reports `access_status: complete` and `pagination.exhausted: true`, while its receipt says the thread is unfinished." It did not see that 50 other links can push the thread's own link out | **Not found.** The first run stopped at its 60-turn limit and printed no review. The rerun gave two findings, both elsewhere |
| D3 | YouTube handle stays claimed | **Found**, graded P2: "`apps/research-mcp/src/actions/research-routes.ts:250` returns immediately for `invalid_input` without rolling back a claimed handle." "Correcting the input cannot recover the handle" | **Found**, graded P2, at `research-routes.ts:250`: "That path skips both commit and rollback." "A corrected retry with the same handle gets `youtube_action_continuation_invalid_or_expired`, so the chain is lost." |
| D4 | Refused study audit has no structured content | **Not found.** It reported the same kind of fault in another tool: instructions that exist only in a result's text (`research-contributor-access-tool.ts:844`) | **Not found** |
| D5 | Full-text lead counted as an abstract read | **Not found.** It reported another counting fault in the same file (`reading-summary.ts:205`) | **Not found** |

| | Found | Partly | Not found |
|---|---|---|---|
| Codex | 1 | 1 | 3 |
| Claude | 1 | 0 | 4 |
| The two together | 1 | 1 | 3 |

### What the totals mean

The rule was set before the run. With 3 or more found, Greptile is not worth paying for on ordinary changes. With 0 or 1, the result supports using Greptile on risky changes. 2 is inconclusive.

- **Counted strictly, it is 1 of 5**, for each reviewer and for the two together. That supports using Greptile on risky changes.
- **If Codex's part-find counts as a find, it is 2 of 5**, which the rule calls inconclusive.
- **Neither count reaches 3.** So the replay gives no ground for dropping Greptile on risky changes.
- **It does not show that Greptile is the better reviewer.** The one defect Greptile found without being pointed at it is the one both free reviewers found. It found the other four with a pointer, and the free reviewers had none.
- **Grades differ.** Both free reviewers graded the defect they found P2. Greptile graded it P1.

### Real defects the reviewers found that are still in the code

Checked by reading main as it is now (`e24f6d3b`). Only the first was timed, and none of the others was run. Line numbers are main's.

1. **`packages/sources/src/forum-page.ts:315`** (called at line 146). The check for a bot-challenge page slows with the square of the page's size when the page is full of `<script` text. Timed on its own, it took 3.8 seconds on a 128 KB page. By the same rule that is about 38 minutes at the reader's 3 MB limit, and as the code is written the server would answer nothing else meanwhile. Codex, P1. Pull request 441 lists two other slow patterns as known and queued, not this one.
2. **`apps/research-mcp/src/actions/research-routes.ts:340`** (with lines 281 and 298). A YouTube audit's reply to the Custom GPT is cut to 56,000 bytes, and then a coverage receipt is added that repeats the list of reply-count mismatches. With a few dozen mismatches the reply passes the 60,000-byte limit and is refused, after the old continuation handle was used up, so the audit cannot go on. Codex and Claude, both P1.
3. **`apps/research-mcp/src/actions/treatment-landscape-coverage-route.ts:1610`** (with lines 1643 and 24). A complete YouTube comment audit whose count differs from YouTube's own figure can never pass the per-video check. It is not counted as complete, and the access limit it is then asked to cite cannot be written. Claude P1, Codex P2.
4. **`apps/research-mcp/src/gemini-video-tool.ts:454`** with **`apps/research-mcp/src/tool-result.ts:136`**. A video claims report may be up to 120,000 bytes, and every app but ChatGPT gets it twice, as data and as text. That passes the 150,000 characters the project's own notes say Claude's apps take. Codex, P2. The apps themselves were not tested.
5. **`apps/research-mcp/src/forum-tools.ts:136`** (with lines 138, 168 and 230). A forum page whose pager has no rel tags is reported as complete, with nothing after it and no link to page 2, while its signed receipt says the thread is part read. Codex, P2. This is the part-find for D2.
6. **`apps/research-mcp/src/actions/treatment-landscape-coverage-route.ts:1328`** (with lines 1975-2008 and 1457). Two last searches that failed still count as "found nothing new", so the result says discovery is saturated. Claude, P2.
7. **`apps/research-mcp/src/youtube-community-audit.ts:264`**. A comment sample cut to fit the reply is still labelled "all". The counts and a note beside it are right. Codex and Claude, both P2.

Numbers 2, 3, 6 and 7 are in the code of unit 5, where the reviewers read whole files and not a change. Nothing was fixed.

### Their other findings

The first figure is every finding in the review. The figure in brackets leaves out the one scored above.

| Unit | Codex | Claude |
|---|---|---|
| U1 | 3 (3) | 5 (5) |
| U2 | 5 (4) | none in the run that stopped; 2 (2) in the rerun |
| U3 | 5 (5) | 4 (4) |
| U4 | 5 (5) | 5 (5) |
| U5 | 9 (8) | 6 (5) |
| All | 27 (25) | 22 (21) |

Five of each reviewer's most serious-looking other findings were checked against main:

| Reviewer | Finding | Against main |
|---|---|---|
| Codex | U2: the forum challenge check can hold up the server (P1) | Real and still there (number 1 above) |
| Codex | U5: the audit reply grows too large after the handle is used (P1) | Real and still there (number 2) |
| Codex | U5: a count difference strands a complete audit (P2) | Real and still there (number 3) |
| Codex | U4: a video report sent twice passes the app's limit (P2) | Real and still there (number 4) |
| Codex | U1: a task added in mid-research goes on without asking (P2) | Real and since fixed, in pull request 439 on 12 Nov |
| Claude | U5: the audit reply grows too large after the handle is used (P1) | Real and still there (number 2) |
| Claude | U5: a count difference blocks the per-video check for good (P1) | Real and still there (number 3) |
| Claude | U1: a repeat pass both asks for closing questions and forbids them (P2) | Real and since fixed, in pull request 441 |
| Claude | U5: discovery called saturated after failed searches (P2) | Real and still there (number 6) |
| Claude | U5: a cut sample labelled "all" (P2) | Real and still there (number 7) |

- **None of the ten was false.** The other 20 Codex findings and 16 Claude findings were not checked, except the three below.
- **Looked at in passing:** Codex's "two chats' settings overwrite each other" (U4) was real and was fixed in pull request 439. Its "cut sample labelled all" (U5) is number 7. Its "finishing the chosen task reopens the ones not chosen" (U1) is how the code behaves, but the code's own note says that is meant for autonomous research, so whether it is a fault could not be told.
- **Three of these findings match other Greptile findings of 12 Nov, outside the five.** Codex's mid-research task is Greptile's "New research starts without asking" (its P1, same lines). Codex's settings finding is Greptile's "Saved preferences overwrite each other" (P2, same lines). Claude's repeat-pass finding is Greptile's P2 that pull request 441 also fixed. All three were fixed after Greptile reported them.

### Limits

- **One run each.** One review per reviewer per unit, plus one rerun. These reviewers do not give the same findings twice.
- **One model each.** Codex ran gpt-6.1-sol at its highest reasoning setting. Claude ran Opus 5.5, capped at 60 turns. Greptile ran its Base tier. Other models, settings or tiers may do differently.
- **Harder for the free reviewers than for Greptile:**
  - Greptile was told what to look for. Its reviews that found D1, D2, D4 and D5 carried instructions naming the fault or its area. Codex and Claude got one neutral instruction. Only D3 was found by Greptile without a pointer, and D3 is the one both found.
  - For D2 and D4 Greptile was shown one commit (220 and 817 added lines). The free reviewers were shown the whole pull request (1,621 and 5,066).
  - They had one try. Greptile reported D1 on its eighth review of that function that day.
  - Claude ran out of turns. Its first run on unit 2 stopped at the 60-turn limit with no review. Its runs on units 1, 3 and 4 ended at 58, 60 and 57 turns, so the limit probably cut their reading short too.
- **Easier for the free reviewers than for Greptile:**
  - For D1 and D5 Greptile was shown twelve pull requests at once (24,809 added lines). The free reviewers saw only the one that introduced each (1,882 and 3,923).
  - For D3 they were handed ten whole files with the faulty one among them. Greptile had a commit of 45,094 added lines. They had no marks showing which lines were new, though.
  - The four kinds of fault named in the instruction were written by someone who knew the five defects.
  - Their folder's name contained "greptile-replay". None of them referred to it.
- **What was not tested:** Codex or Claude given the same instructions Greptile was given. That is the like-for-like test, and it would cost model use only.
- **Codex's standing instructions got in its way a little.** They tell it to load UDA from GitHub first. With the network off it said it could not, and went on.
- **The scoring was not blind.** It was done by the session that knew the answers, against rules written down four minutes before the first run. The quotes are there so the scores can be checked.
- **"Still in the code" rests on reading**, not on running, except the one timing.

### How long each run took

| Unit | Codex | Claude |
|---|---|---|
| U1 | 6 min 29 s | 10 min 21 s |
| U2 | 9 min 39 s | 10 min 15 s (stopped at 60 turns, no review); rerun 10 min 10 s |
| U3 | 10 min 11 s | 10 min 10 s |
| U4 | 10 min 50 s | 9 min 9 s |
| U5 | 8 min 43 s | 5 min 44 s |
| All | 45 min 52 s | 55 min 49 s |

- **Start to finish:** 39 minutes, 15:18 to 15:58 UTC, three runs at a time. No run reached the 20-minute limit.
- **Greptile's six reviews** took 2 to 6 minutes each, 22 minutes in all.
- **Model use, on the two plans:** Codex read about 18 million tokens (17 million of them from cache) and wrote 77,000. Claude wrote 311,000, and its sessions re-read about 50 million tokens from cache.

### Where the files are

The instruction, the reference written before the first run and every reviewer's final output are published beside this page in [`stage-02-evidence/`](stage-02-evidence/). The five diffs can be rebuilt from the public AskRigor repository with the commands in the units table. The reviewers' traces and the copies of the Greptile records hold local paths and stay on the owner's machine. The exported code folders were deleted after the runs.
