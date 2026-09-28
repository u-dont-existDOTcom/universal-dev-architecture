# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-28

## Goal

- Address the exhausted-work-ID Codex finding on the journal Claude worker in
  pull request #277, reviewed at `a330fe7`, with a regression that fails before
  repair. Leave the result uncommitted and unpushed for the repository runner.
- Local outcome: **SATISFIED for runner handoff**. CI owns the sandbox-incompatible
  full relay and local-socket tests.

## Authority / baseline

- Current owner request: fix the finding, run touched socket-free tests and
  sandbox-compatible repository gates, change no test to bypass the sandbox,
  record this round, and leave the working tree uncommitted/unpushed.
- The live default-branch `AGENTS.md` was fetched through the GitHub connector
  this turn; the shell remains networkless.
- Last verified durable boundary: `af245cf`, which already contains the two
  earlier review repairs. Current baseline: clean task branch
  `claude/mc-journal-claude-worker-20260928` at
  `a330fe79335771630cd7bcef2db1179fd7aba7f2`.
- Active assurance lane: **review/handoff candidate**. No deploy, install, push,
  or service mutation is authorized from this workspace.
- Chat → Work requires explicit user acceptance; Work ↔ Work uses native
  Work-internal coordination; Work → the originating Chat is unavailable.
  Mission Control's autonomous control-plane routing of supervision and
  escalation does not create a native return edge.
- Production promotion is not authorized from this workspace.

## Active lesson contract

- **Privacy:** persist only opaque work IDs and expiry timestamps for exhausted
  items; never packet, answer, Claude `result`, or `session_id`.
- **Retry/state ownership:** record exhaustion atomically with clearing the
  in-flight item after its second unanswered, error, or timeout attempt. Preserve
  markers when usage summaries rebuild; clear them on disappearance or expiry.
- **Verification:** show the new regression red at the reviewed code and green
  after repair; run the touched Node file, static checks, non-socket Python
  tests, and deterministic audit. Leave local-socket coverage to CI.

## Review finding disposition

- **Exhaustion finding — valid.** The reviewed code logged two failed runs but
  retained no selection state. A later pass chose `hard-1` again. The new test
  failed before the repair because the second pass chose `hard-1` instead of
  moving to `hard-2`.
- The worker now stores content-free `{work_id, expires_at}` exhaustion markers
  in its summary, excludes marked IDs, and prunes markers when a listed ID has
  disappeared or its original expiry passes. An answered item still imports;
  a usage-limit response still pauses without exhausting the ID.
- The regression proves movement to another ID, suppression across passes,
  removal on disappearance, and reissue after expiry. It passes after repair.
- Previous round: the detached-child ownership finding reviewed at `e234294`
  was repaired before this baseline; its SIGTERM, SIGHUP, and exit regressions
  remain passing. The in-flight and pending-import retry state remains intact.
- Preserve the active completion gate: `patterns/coverage-before-depth-in-selection.md`,
  `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`, and
  `tests/test_coverage_before_depth_pattern.py`.

## Current checkpoint

1. Reproduce the exhaustion finding at the reviewed code. **Complete.**
2. Persist and prune exhaustion markers; add regression coverage. **Complete.**
3. Run sandbox-compatible checks and review the diff. **Complete.**
4. Preserve the uncommitted runner handoff. **Complete.**

## Completed

- Added a regression that was red before repair and green afterward. The worker
  test file passes 22/22 using Node's built-in runner with
  `--test-isolation=none` in this sandbox. `npm run check` passes.
- Repository unittests excluding exactly one test that binds `127.0.0.1` pass
  468/468. The exact deterministic repository audit passes without findings.
- Reviewed the source, test, and state diff; no tests were changed to bypass
  the sandbox.

## Remaining

- CI must run the full relay `npm test` gate and the exact unfiltered Python
  unittest gate, including the local-socket case.

## Blockers / unresolved

- No implementation or owner-decision blocker remains. The sandbox prohibits
  local sockets; full socket coverage is a CI-only residual.

## Evidence / artifacts

- Red regression: second pass returned `UNANSWERED hard-1`, expected `hard-2`.
  Green regression: `hard-2` selected; exhausted IDs suppressed; reissue allowed.
- Node worker tests: 22/22 PASS. Relay static check: PASS. Non-socket Python
  tests: 468/468 PASS. Deterministic audit: PASS.
- Test-cost telemetry: `/tmp/pr277-exhaustion.jsonl`.

## Next safe action

- The repository runner may commit and push this source, test, and state delta,
  then let CI execute the sandbox-incompatible gates. Do not commit or push
  from this workspace.
