# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-28

## Goal

- Address all three Codex review findings at reviewed commit `af245cf`: recover
  an answer after a transient post-Claude listing failure, render usage windows
  against current time, and repair the stale committed recovery checkpoint.
- Parent outcome: **SATISFIED** for the requested uncommitted review fixes;
  sandbox-incompatible process/socket coverage remains assigned to CI.

## Authority / baseline

- Current owner request: fix each valid review finding with a regression, keep
  the change small, run the sandbox-compatible touched tests and repository
  gates without weakening tests, and leave changes uncommitted/unpushed.
- Canonical live default-branch `AGENTS.md` was re-fetched successfully on
  2026-09-28 through the available web surface; the shell sandbox remains
  networkless. Root, scoped, state, test-efficiency, assurance, continuation,
  and executable-frontier guidance was activated before implementation.
- Last verified durable boundary: `af245cf`, which already contains the two
  earlier review repairs on `claude/mc-journal-claude-worker-20260928`. The
  working tree was clean at this round's start.
- Active assurance lane: **release/handoff candidate**, because the owner
  explicitly requires the relay suite and both repository completion gates;
  deployment and publication remain unauthorized.

## Active lesson contract

- **Privacy (mechanical):** persist only allowlisted metadata, never packet,
  answer, Claude `result`, or `session_id`; the sentinel regression must pass.
- **Runner composition (mechanical/semantic):** reuse its reader, timeout-aware
  command runner, import sanitizer/status shape, and shared import-run lock.
- **Retry/state ownership (mechanical):** persist a content-free in-flight work
  ID before Claude, reconcile it before pause/selection, and atomically promote
  it to the existing pending-import retry state before import.
- **Time-window truth (mechanical):** rebuild UTC-day, rolling-seven-day, and
  pause-expiry metrics from the content-free usage log when rendering status.
- **Recovery truth (mechanical):** distinguish the committed `af245cf` boundary
  from this round's uncommitted delta so no worker repeats completed integration.
- **Explicit authority boundary (mechanical):** `journal-claude` performs no
  work unless `MC_JOURNAL_CLAUDE_ENABLED=1`; no deploy, install, push, or service
  mutation is authorized.
- **Verification (mechanical):** focused tests, one full relay checkpoint, and
  both repository gates; leave sandbox-incompatible coverage unchanged for CI.
- **Continuation (semantic):** final delivery must disclose the exact sandbox
  residuals and leave the working tree uncommitted, unpushed, and undeployed.

## Review finding disposition

- **Persist in-flight work before Claude — valid and fixed.** A content-free
  `in_flight.work_id` is durable before invocation. A later pass reconciles that
  exact record before pause/selection and imports it without invoking Claude again.
- **Update the checkpoint after committing — valid and fixed.** This checkpoint
  names `af245cf` as the prior durable handoff and scopes the runner's next commit
  to this round's new working-tree delta.
- **Refresh time-windowed status metrics — valid and fixed.** Rendering rebuilds
  the three time-sensitive projections from `claude-usage.jsonl`; a transient
  log read error alone falls back to the stored snapshot.
- Production promotion is not authorized; this task leaves an uncommitted,
  undeployed working-tree candidate for the repository runner.
- Preserve the active completion gate: `patterns/coverage-before-depth-in-selection.md`,
  `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`, and
  `tests/test_coverage_before_depth_pattern.py`.

## Current checkpoint

1. Reproduce all three findings with regressions. **Complete.**
2. Persist/reconcile in-flight work and refresh status metrics at render time.
   **Complete.**
3. Run sandbox-compatible affected coverage and the requested gates. **Complete.**
4. Review the final diff and preserve the uncommitted runner handoff. **Complete.**

## Completed

- Verified the clean requested baseline and loaded the applicable local authority.
- Started test-efficiency telemetry before implementation.
- Demonstrated expected pre-fix failures for code and checkpoint regressions.
- Added focused coverage proving post-failure reconciliation imports the answered
  item with one Claude invocation and render-time metrics cross day/window/pause
  boundaries from the usage log.
- Reviewed the complete working-tree diff and preserved the requested no-push,
  no-commit, and no-deploy boundary.

## Remaining

- CI must rerun the four sandbox-incomplete relay files and the repository test
  that opens a loopback socket. Tests remain unchanged for those restrictions.

## Blockers / unresolved

- No implementation or owner-decision blocker is currently observed.
- The sandbox cannot open local sockets and four process-heavy relay files do
  not expose their nested diagnostics here; CI owns those residual checks.

## Evidence / artifacts

- Focused code regressions: expected pre-fix failure, then PASS after source fixes.
- Focused recovery-state regression: expected pre-fix failure, then PASS.
- Relay syntax and touched-file tests: PASS. Full relay checkpoint: 20/24 files
  passed; the changed journal-worker file passed and four environment-bound files
  remain for CI.
- Exact repository unittest gate: 469 tests, 468 passed; the sole error is the
  expected `PermissionError` creating the prohibited `127.0.0.1` socket.
- Exact deterministic repository audit: PASS with no findings.
- Test telemetry: `/tmp/pr277-af245cf-review-round.jsonl`.

## Next safe action

- The repository runner may commit and push only this review round's working-tree
  delta, then let CI execute sandbox-incompatible coverage. Do not deploy without
  separate owner approval naming that step.
