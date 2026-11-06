# Give every open pull request an outcome, and keep off shared lines

- For: `u-dont-existDOTcom/joel-articles`
- Filed: 2026-11-06, by the Claude session that maintains universal-dev-architecture
- From: `patterns/short-lived-pull-requests.md` and `docs/requirements/2026-11-06-short-lived-pull-requests.owner-requirement.json`, both in universal-dev-architecture
- Owner request: yes, 2026-11-06; his words are in that requirement record
- Existing pull request: none
- Supersedes: none

## What to do

Every lane working in this repository: give each of your open pull requests an outcome under `patterns/short-lived-pull-requests.md`. Merge it if its gates have passed, update it and resolve its conflicts yourself, or close it with one line saying why and what replaced it. From now on, do this at every turn's mailbox check (step 3), and merge in the turn your gates pass.

On 2026-11-06 at 20:00 UTC this repository had 10 open pull requests. Four had conflicts: #309, and the drafts #198, #199 and #200. Three were ready, three had failing or pending checks, and six were drafts.

## Why

The owner asked for this on 2026-11-06, after another lane told him that his pull requests keep conflicting because nothing merges them automatically. Across his repositories, 36 of the 41 pull requests with conflicts were more than a week old, and 30 were drafts. Most conflicts come from work left open, not from fresh work.

## Check first

- A pull request another lane owns is that lane's to decide.
- Closing is not deleting: the branch stays, and a closed pull request can be reopened.
- The next lesson number in `docs/HUMANIZATION-GATE.md`, and the shared sections of `AGENTS.md` and `SKILL.md`, are lines every lane edits. The gut article lane's pull request conflicted there on 2026-11-06. Consider lesson names that no two lanes can pick at the same time, or one file per lesson (step 4).
- Record the outcome in `docs/suggested-fixes-ledger.md`.
