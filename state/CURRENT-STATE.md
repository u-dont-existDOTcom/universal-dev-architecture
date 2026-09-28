# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-28

## Goal

- Implement `tools/codex-mission-control/vps-browser-relay/JOURNAL-CLAUDE-WORKER.md`
  on `claude/mc-journal-claude-worker-20260928`, based on the journal work
  runner as merged on current `main`.
- Parent outcome: **SATISFIED** for the requested uncommitted implementation;
  sandbox-incompatible process/socket coverage remains explicitly assigned to CI.

## Authority / baseline

- Current owner request: reuse the earlier worker implementation where it fits,
  adapt it to the final merged runner, run all sandbox-compatible touched tests
  and the standard-library repository gates, do not weaken tests for the
  no-network/no-local-socket sandbox, and leave changes uncommitted/unpushed.
- Canonical live default-branch `AGENTS.md` was retrieved successfully on
  2026-09-28 before task reasoning. Root and scoped Mission Control instructions,
  the task specification, declared gate configuration, lesson index, and
  task-relevant patterns were loaded.
- Baseline: task specification `767aa97` atop final runner `7475dd3`; compare
  `origin/claude/mc-journal-claude-worker-20260928-first-build`.
- Active assurance lane: **release/handoff candidate**, because the owner
  explicitly requires the relay suite and both repository completion gates;
  deployment and publication remain unauthorized.
- Chat → Work requires explicit user acceptance; Work ↔ Work uses native
  Work-internal coordination; Work → the originating Chat is unavailable.
  Mission Control's autonomous control-plane routing of supervision and escalation
  does not create a native return edge or transfer semantic reasoning authority.

## Active lesson contract

- **Privacy (mechanical):** persist only allowlisted metadata, never packet,
  answer, Claude `result`, or `session_id`; the sentinel regression must pass.
- **Runner composition (mechanical/semantic):** reuse its reader, timeout-aware
  command runner, import sanitizer/status shape, and shared import-run lock.
- **Explicit authority boundary (mechanical):** `journal-claude` performs no
  work unless `MC_JOURNAL_CLAUDE_ENABLED=1`; no deploy, install, push, or service
  mutation is authorized.
- **Verification (mechanical):** focused tests, one full relay checkpoint, and
  both repository gates; leave sandbox-incompatible coverage unchanged for CI.
- **Continuation (semantic):** final delivery must disclose the exact sandbox
  residuals and leave the working tree uncommitted, unpushed, and undeployed.

## Review finding disposition

- The earlier Claude-worker implementation and all three follow-up repair
  commits were reviewed against the final merged runner. Applicable privacy,
  configuration, stale-lock, status, and usage fixes were retained; obsolete
  runner code was not transplanted.
- Production promotion is not authorized; this task leaves an uncommitted,
  undeployed working-tree candidate for the runner to collect.
- Preserve the repository-wide coverage-before-depth completion gate at
  `patterns/coverage-before-depth-in-selection.md`,
  `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`, and
  `tests/test_coverage_before_depth_pattern.py`.

## Current checkpoint

1. Reconcile prior build with the final runner. **Complete.**
2. Implement worker, shared lock, meter, status surface, examples/docs. **Complete.**
3. Add and run sandbox-compatible specified regressions. **Complete.**
4. Run full relay and both repository gates as far as the sandbox permits.
   **Complete.**
5. Review diff/evidence and preserve the uncommitted runner handoff. **Complete.**

## Completed

- Verified the clean requested baseline; loaded live/local authority and the
  earlier implementation's four implementation/review commits.
- Started test-efficiency telemetry before implementation.
- Implemented the disabled Claude lane, content-free usage meter, loopback
  status page, user-service/tunnel examples, and shared import lock against the
  final runner's reader, timeouts, status schema, and import sanitizer.
- Added every task-specification regression plus current-runner coverage for
  the status role, import timeout budget, and legacy-lock recovery.
- Reviewed the complete modified/untracked set, executable modes, documentation,
  placeholder configuration, and secret-pattern scan; `git diff --check` passes.
- Inspected the installed Claude CLI help. It exposes no documented
  non-interactive plan-usage command, so the optional plan meter is omitted.

## Remaining

- CI should rerun the four relay files whose child-process diagnostics are
  suppressed in this sandbox and the repository test that opens a loopback
  socket. No source or test change is required for those environment residuals.

## Blockers / unresolved

- No implementation or owner-decision blocker.
- The sandbox cannot open local sockets and suppresses output from some nested
  child processes. Tests were left unchanged; CI owns those remaining checks.

## Evidence / artifacts

- New Claude-worker test file: PASS.
- Affected runner/lock/config selections: PASS.
- Relay syntax check: PASS.
- Full relay checkpoint: 20/24 files passed; four process-heavy files are
  sandbox-incomplete. The new worker file passed. Touched assertions outside
  suppressed child-process diagnostics passed separately.
- Exact repository unittest gate after checkpoint repair: 468 tests executed,
  467 passed and the sole error is the expected `PermissionError` when
  `test_chatgpt_storage_canary` creates `127.0.0.1` socket state.
- Exact deterministic repository audit: PASS with no findings.
- Test-efficiency telemetry: no forced redundant green reruns; final summary is
  recorded in `/tmp/task4b-journal-claude-worker-test-efficiency.jsonl`.

## Next safe action

- The repository runner may collect, commit, and push this working tree, then
  let CI execute the sandbox-incompatible relay and socket coverage. Do not
  deploy without separate owner approval naming that step.
