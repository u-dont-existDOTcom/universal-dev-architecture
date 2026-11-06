# Owner-marked cost: a small rule change takes about an hour to reach a merge

- Date: 2026-10-12
- Reported by: the owner, to the Claude Code session running the InnerSignal journal import, with the suggestion to check with this repository's maintainer lane.
- Source quality: `EXACT_TEXT` for the owner's message quoted here; `BOUNDED_SUMMARY` for the timings, which come from the session's own transcript times, commit times and pull request comment times.
- Capture state: `CAPTURED_BRANCH_ONLY` until the pull request that adds this file merges.

## The owner's words

> 22a (that's insane that it would take an hour to change one tiny thing, is that possible to make more efficient? maybe check with uda worker also idk). i did merge tho'

## What happened (UTC)

- **11 Oct, 23:49.** The owner asked whether his merged plan meant the journal's map never goes live until every miss is cleared.
- **23:52.** The agent set out three options. B was the option his words pointed to: only the checks against harm block publication, and the other floors become reported targets with a log of misses. The agent priced B as "one more change to the plan and the build before deploying, which takes an hour or two plus Codex's review". It started B at once, unless he said otherwise.
- **00:11.** B was built and tested: code in three modules, three test files with 166 tests passing, the plan's text and the state record. That took 19 minutes. The owner's message above then chose A. B went onto a branch for a later round.
- **00:14 to 00:24.** Moving the already-reviewed build onto main took 10 minutes: merge, conflict, transfer to the laptop, push, base change, and an empty commit to start the checks. Codex's review then took about 4 minutes, and the checks about 15.

## Where the time goes

1. **The change itself, about 20 minutes.** In a project whose plan is the reviewer's spec, a rule change touches the code, the tests, the plan's text and the state record. Writing the code is the smallest part.
2. **Moving commits to GitHub, 5 to 10 minutes a push, and many tokens.** The cloud session's pushes to GitHub are refused, so each commit goes to the owner's laptop as an xz+base64 patch. There it is applied, its tree hash is checked, and it is pushed. Keeping B on a branch meant 36 KB of base64, written in five pieces.
3. **One review a push.** The project merges only after Codex's review of the final commit finds nothing. A clean review took about 4 minutes. A review with a finding costs a fix, a push and another review, about 15 to 20 minutes. The build behind this change needed 15 rounds, and 13 found something.
4. **Checks, about 15 minutes a push,** run alongside the review. One push went out while the pull request still pointed at a base branch that had already merged. It started no checks, and changing the base didn't start them either. That cost an empty commit and another review request.
5. **The merge click.** The safety layer refuses an agent's merge of its own pull request, so every merge waits for the owner.

So a one-line change still costs about 25 to 30 minutes from first push to merge-ready (items 2 to 4), and each review round that finds something adds 15 to 20.

## Repairs to weigh

1. **Edit where the push happens.** When the session can't push but a linked machine can, make small changes in that machine's clone through its shell, and run the targeted tests there. The patch transfer and its tokens go away.
2. **Review before the first push.** Run the same reviewer on the diff on the linked machine (read-only, network only for the model), and fix what it finds before pushing. The hosted review then starts from a diff that has already passed once. Rule 1 of `patterns/convergent-review-acceptance-gates.md` applies to these rounds too: after a fix, review the change, not the whole pull request again.
3. **Retarget before pushing.** When a pull request's base branch has merged, set its base to the default branch before pushing the update, so the push starts the checks.
4. **Give the owner the fixed cost with the options.** Before he weighs an option, give its cost in two parts: the change itself, and the fixed cost of any change (items 2 to 4 above). Here the fixed cost, not the change, decided it.
5. **When cost is the tradeoff, build only the reusable part first.** Rule 5 of `patterns/owner-questions-page.md` says to act on an option the owner's words choose. Here his words chose B's outcome, but not its cost, which he hadn't yet weighed. Building B wasted nothing, since it was kept for a later round. A cheaper move would have built the reusable part (here the misses log) while waiting for his answer.

## Status

- **The InnerSignal journal workstream** applies repairs 1, 3 and 4 itself from now on, and repair 2 within the owner's rule for local Codex runs ("No fast mode. No unrestricted network for local Codex runs.").
- **For this lane:** whether any of these belong in a pattern, and where.

No journal text, private locators or account identifiers are in this record.
