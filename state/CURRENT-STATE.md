# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-28

## Goal

- Address the review finding on the journal Claude worker in pull request #277,
  reviewed at `e234294`, with a regression that fails before the repair.
- Local outcome: **SATISFIED for runner handoff**; full relay and socket coverage
  remain assigned to CI.

## Authority / baseline

- Current owner request: fix the detached-child ownership race, run the touched
  socket-free tests and sandbox-compatible repository gates without weakening
  tests, record this round, and leave it uncommitted/unpushed.
- Owner-provided root instructions and local guidance were active before
  implementation. The live default-branch `AGENTS.md` was confirmed via the
  GitHub connector on 2026-09-28 after a cached web read; the shell remains
  networkless.
- Last verified durable boundary: `af245cf`, which already contains the two
  earlier review repairs. Current baseline: `e2342945d4d6ffd4fdf8d2309e02c4306570564f`
  on `claude/mc-journal-claude-worker-20260928`, clean at task start.
- Active assurance lane: **review/handoff candidate**; the exact full relay and
  Python socket gates remain with CI due to the explicit sandbox limit.
  Deployment and publication remain unauthorized.
- Chat → Work requires explicit user acceptance; Work ↔ Work uses native
  Work-internal coordination; Work → the originating Chat is unavailable.
  Mission Control's autonomous control-plane routing of supervision and escalation
  does not create a native return edge or transfer semantic reasoning authority.

## Active lesson contract

- **Privacy (mechanical):** persist only allowlisted metadata, never packet,
  answer, Claude `result`, or `session_id`; the sentinel regression must pass.
- **Retry/state ownership (mechanical):** persist a content-free in-flight work
  ID before Claude, reconcile it before pause/selection, and atomically promote
  it to the existing pending-import retry state before import.
- **Detached-child lifecycle (mechanical):** kill an active Claude process group
  before the worker lock releases on SIGTERM, SIGHUP, or another worker exit.
- **Explicit authority boundary (mechanical):** `journal-claude` performs no
  work unless `MC_JOURNAL_CLAUDE_ENABLED=1`; no deploy, install, push, or service
  mutation is authorized.
- **Verification (mechanical):** show the new regression red at the reviewed
  code and green after repair; run touched socket-free tests, static checks,
  non-socket repository tests, and the exact audit; leave restricted tests for CI.
- **Continuation (semantic):** final delivery must disclose the exact sandbox
  residuals and leave the working tree uncommitted, unpushed, and undeployed.

## Review finding disposition

- **Detached-child ownership finding — valid.** Before this repair, the new
  SIGTERM regression observed a live sleeping Claude process after the worker
  exited. The lock's signal handler calls `process.exit()`, while `runClaude()`
  previously killed its detached child group only on timeout. A restarted pass
  could clear the unanswered in-flight marker and launch duplicate Claude work.
- `runClaude()` now installs an exit listener ahead of the lock's exit listener,
  killing the child group before lock release. Temporary signal listeners cover
  direct use without the lock; all listeners are removed after child completion.
  The socket-free regression covers SIGTERM, SIGHUP, and an independent
  `process.exit()` path through the actual lock and runner functions.
- Production promotion is not authorized; this task leaves an uncommitted,
  undeployed working-tree candidate for the repository runner.
- Preserve the active completion gate: `patterns/coverage-before-depth-in-selection.md`,
  `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`, and
  `tests/test_coverage_before_depth_pattern.py`.

## Current checkpoint

1. Reproduce the detached-child survival at the reviewed code. **Complete.**
2. Kill the child group before lock release and add signal/exit regression
   coverage. **Complete.**
3. Run sandbox-compatible tests and audit. **Complete.**
4. Review the final diff and preserve the uncommitted runner handoff. **Complete.**

## Completed

- Verified the clean baseline, loaded local authority, and started test-cost
  telemetry before implementation. The GitHub connector confirmed the live
  root instructions during final review; the shell remains networkless.
- Added a regression that failed at the reviewed code: Claude remained
  `State: S (sleeping)` after SIGTERM and worker exit.
- Added shutdown cleanup before lock release and confirmed all three signal/exit
  regressions pass. No existing tests or privacy boundaries were weakened.
- Ran the socket-free checks and reviewed the final source, test, and state diff.

## Remaining

- CI must run the full relay `npm test` gate and the exact Python unittest gate,
  including the sole test that binds `127.0.0.1`.

## Blockers / unresolved

- No implementation or owner-decision blocker is currently observed.
- Two tests in the unchanged adjacent journal work runner file received empty
  stdout from sandbox-spawned shell commands (70/72 passed). That file and its
  imported source do not depend on the changed Claude worker. CI owns the full
  relay suite; no test was altered for this environment failure.

## Evidence / artifacts

- Focused shutdown tests: 3/3 PASS; changed journal Claude worker file: PASS
  under Node's built-in runner. `npm run check`: PASS.
- Adjacent journal work runner file: 70/72 PASS; the two sandbox shell-stdout
  failures are outside the changed module.
- Repository unittest suite excluding exactly one prohibited local-socket test:
  468/468 PASS. The exact unfiltered gate remains for CI.
- Exact deterministic repository audit: PASS with no errors or warnings.
- Test telemetry: `/tmp/pr277-inflight-signal.jsonl`.

## Next safe action

- The repository runner may commit and push this worker, regression-test, and
  state-file delta, then let CI execute the sandbox-incompatible relay and
  socket coverage. Do not commit or push from this workspace.
