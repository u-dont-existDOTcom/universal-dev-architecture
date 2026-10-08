# Current State — deferred review findings

## Goal

- Task ID: `review-follow-ups-20261008-0400`.
- Branch: `codex/review-follow-ups-20261008-0400`.
- Owner outcome: check every deferred finding from issues #329 and #337 against this branch; fix applicable findings with regression coverage, record each outcome, and leave changes for the runner to commit and push.
- Root outcome: SATISFIED; both findings and their recorded outcomes are integrated in the commit containing this checkpoint. No integration of the original repairs remains; unfiltered CI validation remains separate.

## Authority / baseline

- Direct owner-authorized maintenance, bounded to the supplied findings; no autonomous task-creation or model-routing receipt required.
- Baseline: `e38abd90`, initially clean working tree.
- Live default-branch GitHub bootstrap succeeded; root `AGENTS.md` blob `c27948c88cf7553f95241cbae7edab27f87689d2`, repository profile, lesson index and relevant current patterns loaded.
- Current owner constraints: no package installation, sockets, test changes to evade sandbox restrictions, commits or pushes; keep fixes small; leave socket validation to CI; no checkpoint-wording, commit-ID or round-detail tests.
- Edit `state/CURRENT-STATE.md` only if a finding requires it; neither finding does. The explicitly requested historical checkpoint repair is the sole exception to editing only this task's checkpoint.

## Active lesson contract

- `codex-github-operating-system` / `state/AGENTS.md`: reconcile exact Git evidence and retain a concise task checkpoint; failure is stale integration state or unrelated edits; repair the scoped record and review the diff (semantic / mechanical).
- `task-time-lesson-activation`: enforce the owner's complete constraints at edits and delivery; plans are not evidence of execution; repair missing checks before handing off (semantic).
- `development-assurance-lanes` / `test-efficiency-and-verification-budget`: focused regression first, affected tests next, one socket-free repository checkpoint plus audit; record timings in `/tmp/review-follow-ups-20261008-0400-tests.jsonl`; no redundant green full rerun (mechanical).
- `runtime-chat-work-authority-admission-and-internal-routing`, maintenance path: use the owner's direct repair authority without adding a routing dependency; retain access and spending boundaries (semantic).
- `owner-goal-followup-and-requirement-accretion` / `owner-outcome-invariant-and-contract-laundering-prevention`: address only these findings; no extra acceptance gates or project changes; preserve optional-polish discretion and the working-tree handoff boundary (semantic).
- `human-readable-operational-references`: deliver a direct local checkpoint link and concise evidence; final answer begins with the second UTC clock reading and total elapsed time (semantic).
- Graph-covered rules resolved successfully; operational-reference and maintenance bindings remain index-routed. No UDA directory-lane items apply: its lane uses labeled pull requests, and this task names its exact deferred findings.

## Completed

- Confirmed the historical handoff still describes the pending-lane repair as uncommitted, although the merged commit and current HEAD contain identical checkpoint and queue-test bytes.
- Confirmed `parseJevResponse` passes empty/overlong string metadata through while persistence requires provider length 1–200 and response ID length 1–300.
- Corrected the historical checkpoint's current step, remaining work, next action and continuation boundary to describe the repair as committed and merged.
- Omit malformed optional provider/response-ID metadata in the parser's shared metadata path, preserving valid values, usage, answers and invalid-answer status.
- Added one behavioral regression covering both fields at empty, over-limit, nonstring, minimum and maximum values across OK, missing-answer and malformed-answer responses; checks actual persistence, durable counts and costs. It fails without the fix and passes with it.

## Current checkpoint

- Current step: original repairs are committed; inspect CI results and reconcile only subsequent authorized changes.
- Last verified durable boundary: the commit containing this checkpoint; resolve it from this file's Git history after any resquash, then reconcile actual `HEAD` when resuming. Current review evidence is in the checkpoint below.
- Completion claim: ARTIFACT_READY; the requested local result is complete, with no live deployment or publication claim.

## Finding outcomes

### Issue #329

- Finding 1 (P2): **fixed** — the checkpoint now describes the pending-lane repair and regression as committed and merged, eliminating the stale runner integration action; no checkpoint-pinning test added under the owner's explicit restriction.

### Issue #337

- Finding 1 (P2): **fixed** — invalid provider/ID metadata is omitted before either OK or INVALID_RESPONSE observations return, so durable counts and costs survive; the new persistence regression fails without the fix.

## Remaining

- No original repair implementation or integration remains. CI retains its unfiltered gates; later review corrections are a separate handoff.

## Blockers / unresolved

- CI-only: `test_chatgpt_storage_canary.StorageCanaryTests.test_http_surface_requires_auth_and_round_trips_exact_text` requires a local socket and is excluded only at invocation, without modifying its source.
- CI-only: Jev telemetry's existing `import CLI reads file or stdin through the normal store and prints counts only` test needs a child Node process; the sandbox returns `spawnSync ... EPERM` even for a trivial child. Excluded only at invocation; no test changed. System Node is version 18 and cannot run this package's SQLite/in-process runner.
- Reused existing exact `zod` 4.1.5 and `tsx` 4.20.5 packages through temporary local symlinks, now removed; no packages installed. Node v26.8.1 runs the affected tests with `--test-isolation=none`, avoiding the denied child runner.

## Evidence / artifacts

- Historical repair: `state/tasks/task-0ca2b0bd2d1f231f4c4169fe83295438e620729d7044ce6f6348e48b6b21773d.md`; merged implementation in `e42a3215`; no subsequent delta in it or `tests/test_suggested_fix_queue.py` through HEAD.
- Runtime and regression: `tools/codex-mission-control/restored/codex-mission-control/lib/jev-shadow.ts` and `tests/jev-shadow-telemetry.test.ts` under that package.
- Checkpoint derived with `scripts/task_checkpoint_path.py` using the exact branch and task ID above.
- Socket-free equivalent of `python3 -m unittest discover -s tests -v`: **PASS**, 794 tests, 0 failures/errors/skips in 43.669s; standard-library discovery/recursive flattening asserts exactly one excluded HTTP socket test. The exact unfiltered gate remains for CI. Invocation: `python3 /tmp/review-follow-ups-20261008-0400-socket-free.py`; log: `/tmp/review-follow-ups-20261008-0400-python.log`.
- `python3 scripts/audit_codex_github.py --root . --fail-on error`: **PASS**, 0 errors, 0 warnings (`PASS: no findings.`), with `UDA_TASK_ID=review-follow-ups-20261008-0400`.
- Checkpoint/path/queue tests: **PASS**, 26 tests, using `python3 -m unittest tests.test_current_state_concision tests.test_task_checkpoint_paths tests.test_suggested_fix_queue -v`.
- New metadata regression: **FAIL before fix** (`'' !== undefined`), **PASS after fix**; 36 response/metadata cases reach actual SQLite persistence and cost summaries.
- Affected Jev suites: **PASS**, 36 tests, 0 failures, with the single child-process CLI test excluded by anchored `--test-skip-pattern`; five `jev-shadow*.test.ts` files, Node's built-in runner and `--import tsx --test --test-isolation=none`. Log: `/tmp/review-follow-ups-20261008-0400-jev-final.log`.
- An initial runner used the root cwd without the package tsconfig; corrected alias resolution. Child-isolated attempts failed because nested Node execution is denied; the in-process runner exposed the expected regression. The first broad run passed 36 tests and failed only the existing child-process CLI test. No product repair or test alteration made for these environment failures.
- Lesson closeout: existing metadata-sanitization and truthful-checkpoint rules suffice; no new universal rule or cross-project promotion.
- Diff review / `git diff --check`: **PASS**; exactly four scoped files, including this checkpoint. `state/CURRENT-STATE.md` and all existing test bodies unchanged. No relay changes, packages installed, commits or pushes.
- Test telemetry: one full socket-free run, no mutation or redundant-green full rerun; 67.67s measured through the main validation checkpoint (including environment failures), about 20% of the measured implementation phase.

## Next safe action

- Resume the current review correction from `state/tasks/task-0ca2b0bd2d1f231f4c4169fe83295438e620729d7044ce6f6348e48b6b21773d.md`; CI owns socket and child-process validation. Do not repeat the committed original repairs.

## Continuation and stop admission

- Original local outcome SATISFIED: both findings and their verification are committed; no original integration remains. Later authorized review work follows the current correction checkpoint above; the two environment-dependent tests remain with CI. No unfiltered-suite, merge or live-runtime claim.
