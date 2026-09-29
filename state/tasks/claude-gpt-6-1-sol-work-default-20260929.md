# GPT-6.1 Sol Work routing amendment

Status: IMPLEMENTED_WITH_CHECKPOINT_PATH_TEST_CONFLICT

## Goal

Record the 2026-09-29T18:36Z owner decision verbatim and make GPT-6.1 Sol the active Sol model at the existing Work effort rungs wherever the execution surface offers it. GPT-6 Sol remains the same-effort fallback; GPT-6 Astra XHigh remains the qualified challenger. Preserve historical requirement words, trial entries, evidence, runtime code, and runtime configuration. The runner commits and pushes this working tree.

## Authority / baseline

- Branch: `claude/gpt-6-1-sol-work-default-20260929`.
- Task ID: `gpt-6-1-sol-work-default-20260929`.
- The owner approved this policy amendment and requires the runner to commit and push.
- The 2026-09-17 and 2026-09-28 owner requirements remain historical records; the 2026-09-29 record amends the live baseline.

## Plan

1. Add the owner amendment and update the canonical policy, cross-family reviewer, and entry-point wording.
2. Update live trial and telemetry template without changing recorded observations or entries.
3. Update affected policy tests, regenerate the rule-graph source lock if validation requires it, and review the diff.
4. Run socket-free affected tests and the audit. Record exact full Python gate as deferred to CI if its localhost test is blocked by the sandbox.

## Active constraints

- Current GitHub `main` could not be confirmed live: the browser tool returned a cached default-branch page. The owner-supplied instructions and local repository are the active authority for this run.
- The sandbox has no network or local sockets. Do not install packages or change tests to bypass that limitation.
- Test-efficiency telemetry uses `/tmp/gpt-6-1-sol-work-default-test-efficiency.jsonl` because `.git` is read only here.
- Assurance lane: iteration and runner handoff, with owner-requested repository gates at the supported boundary.

## Completed

- Initial authority, scope, and affected-test inventory.
- New owner amendment, policy, entry-point, trial, telemetry, and affected-test edits.
- Focused policy tests: 8 passed. Focused cross-family tests: 6 passed.

## Current checkpoint

- The policy, owner record, live trial, entry points, cross-family reviewer, and affected tests are updated. The rule-graph selector and source lock are current.
- The requested branch-named checkpoint conflicts with the repository's current hashed-filename test. The owner-specified path is retained; no test or helper was altered to hide the conflict.

## Remaining

- Runner commits and pushes; CI runs the socket-dependent test and resolves or records the checkpoint-path conflict under the owner's instruction before merge.

## Blockers / unresolved

- The exact full Python gate includes a localhost HTTP-server test that cannot run in this sandbox.
- One checkpoint-path test conflicts with the owner's requested branch-named path; this conflict is left visible for runner/CI review.

## Evidence / artifacts

- Focused Work-routing policy tests: **PASS**, 8 tests, 0 failures.
- Focused cross-family reasoning tests: **PASS**, 6 tests, 0 failures.
- `python3 -m unittest discover -s tests -v`: **UNVERIFIED** — counts unavailable for the exact gate because one test needs localhost; filtered discovery ran 498 socket-free tests with 2 failures before the checkpoint evidence repair. Focused checkpoint rerun: 5 tests, 1 remaining failure from the hashed-filename versus owner branch-name conflict.
- `python3 scripts/audit_codex_github.py --root . --fail-on error`: **PASS** — 0 errors, 0 warnings, 0 findings after checkpoint formatting repair.
- `python3 scripts/uda_rule_graph.py validate --write-lock rules/rule-graph/generated/source-lock.v1.json`: **PASS** — 37 graph nodes, 9 task-time rules, 0 errors.
- Root `AGENTS.md`: 23,666 bytes, below the 32 KiB discovery budget.
- Test-efficiency snapshot: 353.78 seconds elapsed, 5.54 seconds observed tests (1.56%); 3 focused runs, 1 filtered full run, 3 audit runs, 0 forced redundant green reruns.

## Stop admission

Parent outcome: OPEN at publication and CI. The policy change and local audit are complete; the next step is the owner's designated runner committing and pushing this working tree, then CI checking the socket test and the checkpoint-path conflict. This worker has no authorized push action.

## Next safe action

- Runner commits and pushes this working tree. CI runs the socket-dependent gate and reports the checkpoint-path conflict.
