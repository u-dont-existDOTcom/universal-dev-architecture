# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-28

## Goal

- Address both Codex review findings on the journal Claude worker at reviewed
  commit `bd52bbe`: retain failed imports for retry and prevent Claude import
  reporting from racing the standard runner's shared status writes.
- Parent outcome: **SATISFIED** for the requested uncommitted review fixes;
  sandbox-incompatible process/socket coverage remains explicitly assigned to CI.

## Authority / baseline

- Current owner request: fix each valid review finding with a regression, keep
  the change small, run the sandbox-compatible touched tests and repository
  gates without weakening tests, and leave changes uncommitted/unpushed.
- Canonical live default-branch `AGENTS.md` was retrieved successfully on
  2026-09-28 before the original implementation. For this review round, the
  required re-fetch was unavailable because the sandbox has no network; the
  owner-supplied instructions and checked-out authority files were loaded instead.
- Baseline: reviewed commit `bd52bbe` on
  `claude/mc-journal-claude-worker-20260928`.
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
- **Retry/state ownership (mechanical):** persist a content-free pending-import
  marker before import, retry it before listing or limit checks, and keep Claude
  import reporting out of the standard runner's shared status file.
- **Explicit authority boundary (mechanical):** `journal-claude` performs no
  work unless `MC_JOURNAL_CLAUDE_ENABLED=1`; no deploy, install, push, or service
  mutation is authorized.
- **Verification (mechanical):** focused tests, one full relay checkpoint, and
  both repository gates; leave sandbox-incompatible coverage unchanged for CI.
- **Continuation (semantic):** final delivery must disclose the exact sandbox
  residuals and leave the working tree uncommitted, unpushed, and undeployed.

## Review finding disposition

- **Retain failed imports for retry — valid and fixed.** The Claude-owned usage
  summary now keeps `pending_import.work_id`; a later pass retries it before
  selecting work or honoring a Claude usage pause, and success alone clears it.
- **Synchronize the shared status update — valid and fixed by independent
  ownership.** The Claude worker no longer writes `journal-work-status.json`.
  Its `last_import` lives in `claude-usage-summary.json`, and the read-only status
  page chooses the newest standard-runner or Claude import summary.
- Production promotion is not authorized; this task leaves an uncommitted,
  undeployed working-tree candidate for the runner to collect.
- Preserve the active completion gate: `patterns/coverage-before-depth-in-selection.md`,
  `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`, and
  `tests/test_coverage_before_depth_pattern.py`.

## Current checkpoint

1. Reproduce both review findings with regressions. **Complete.**
2. Persist/retry failed imports and isolate Claude import state. **Complete.**
3. Run focused coverage, the relay checkpoint, and both repository gates as far
   as the sandbox permits. **Complete.**
4. Review the final diff and preserve the uncommitted runner handoff. **Complete.**

## Completed

- Verified the clean requested baseline and loaded the applicable local authority.
- Started test-efficiency telemetry before implementation.
- Demonstrated that the new focused regressions fail at the reviewed commit,
  then pass after the fixes. The retry regression also proves that the second
  pass performs no new listing or Claude invocation.
- Moved Claude's last-import summary into its independently owned summary file;
  a later standard-runner status write can no longer erase it or be overwritten
  by a stale Claude read-modify-write.

## Remaining

- CI should rerun the four relay files whose child-process diagnostics are
  suppressed in this sandbox and the repository test that opens a loopback
  socket. No source or test change is required for those environment residuals.

## Blockers / unresolved

- No implementation or owner-decision blocker.
- The sandbox cannot open local sockets and suppresses output from some nested
  child processes. Tests were left unchanged; CI owns those remaining checks.

## Evidence / artifacts

- Focused Claude-worker regression file: PASS after an expected pre-fix failure.
- Relay syntax check: PASS.
- Full relay checkpoint: 20/24 files passed; four process-heavy files are
  sandbox-incomplete. The changed worker file passed. Touched assertions outside
  suppressed child-process diagnostics passed separately.
- Exact repository unittest gate after checkpoint repair: 468 tests executed,
  467 passed and the sole error is the expected `PermissionError` when
  `test_chatgpt_storage_canary` creates `127.0.0.1` socket state.
- Exact deterministic repository audit: PASS with no findings.
- Test telemetry: 525.32s elapsed, 31.02s observed (5.91%); focused 3/3.66s,
  affected 2/0.13s, full 7/27.23s, mutation 0; forced redundant 0 and skipped 0.
  Log: `/tmp/pr277-review-round-test-efficiency.jsonl`.

## Next safe action

- The repository runner may collect, commit, and push this working tree, then
  let CI execute the sandbox-incompatible relay and socket coverage. Do not
  deploy without separate owner approval naming that step.
