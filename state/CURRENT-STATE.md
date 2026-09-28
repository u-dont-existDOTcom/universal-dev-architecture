# Current State

Classification: **NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT** where this file
records actual accounts, hosts, service IDs, machine paths, private locator
attestations, or live topology. Portable rules remain in `patterns/` and
`templates/`; no owner secret or private locator belongs here.

Updated: 2026-09-28

## Goal

- Address the attempt-budget Codex finding on the journal Claude worker in
  pull request #277, reviewed at `6af37bb`, with a regression that fails before
  repair. Leave the result uncommitted and unpushed for the repository runner.
- Local outcome: **SATISFIED for runner handoff**. CI owns the sandbox-incompatible
  full relay and local-socket tests.

## Authority / baseline

- Current owner request: fix the finding, run touched socket-free tests and
  sandbox-compatible repository gates, change no test to bypass the sandbox,
  record this round, and leave the working tree uncommitted/unpushed.
- The live default-branch `AGENTS.md` was fetched through the web surface
  this turn; the shell remains networkless.
- Previous-round record: Last verified durable boundary: `af245cf`, which
  already contains the two earlier review repairs.
- Current baseline: clean task branch
  `claude/mc-journal-claude-worker-20260928` at
  `6af37bb3e424f0e8c9b6f264b62ddb9329fb798a`.
- Active assurance lane: **review/handoff candidate**. No deploy, install, push,
  or service mutation is authorized from this workspace.
- Chat → Work requires explicit user acceptance; Work ↔ Work uses native
  Work-internal coordination; Work → the originating Chat is unavailable.
  Mission Control's autonomous control-plane routing of supervision and
  escalation does not create a native return edge.
- Production promotion is not authorized from this workspace.

## Active lesson contract

- **Privacy:** persist only opaque work IDs, attempt numbers, and expiry
  timestamps; never packet, answer, Claude `result`, or `session_id`.
- **Retry/state ownership:** persist the consumed attempt before invoking Claude,
  retain it through failed listings and usage backoff, and exhaust an unanswered
  item after its second invocation. Clear markers on answer, disappearance, or
  expiry; conservatively exhaust legacy markers with no attempt count.
- **Verification:** show the new regression red at the reviewed code and green
  after repair; run the touched Node file, static checks, non-socket Python
  tests, and deterministic audit. Leave local-socket coverage to CI.

## Review finding disposition

- **Attempt-budget finding — valid.** The reviewed code persisted only `work_id`
  after a Claude invocation followed by a listing failure, then cleared it on
  the next successful listing. That reset the loop to attempt one. The new
  regression failed at the reviewed code because the marker lacked `attempt: 1`.
- The worker now persists `{work_id, attempt}` before each invocation. It resumes
  at the next attempt after listing recovery, retaining the marker between
  attempts and through usage backoff. After a second invocation whose listing
  fails, the next successful listing marks the item exhausted without another
  Claude call. A legacy marker without an attempt count is treated as consumed
  twice; an answered item still imports first.
- The alternating-failure regression confirms exactly two Claude invocations,
  durable attempt counts of one and two, and suppression on later passes. It is
  green after repair. The earlier exhausted-ID, process-group, import, and
  usage-limit regressions remain green.
- Preserve the active completion gate: `patterns/coverage-before-depth-in-selection.md`,
  `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`, and
  `tests/test_coverage_before_depth_pattern.py`.

## Current checkpoint

1. Reproduce the attempt-budget finding at the reviewed code. **Complete.**
2. Persist and honor attempt counts; add regression coverage. **Complete.**
3. Run sandbox-compatible checks and review the diff. **Complete.**
4. Preserve the uncommitted runner handoff. **Complete.**

## Completed

- Added a regression that was red before repair and green afterward. The worker
  test file passes 23/23 using Node's built-in runner with
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

- Red regression: the first failed-listing marker had no attempt count. Green
  regression: attempt counts one and two survived alternating listing failures;
  the item was then exhausted with no third invocation.
- Node worker tests: 23/23 PASS. Relay static check: PASS. Non-socket Python
  tests: 468/468 PASS. Deterministic audit: PASS.
- Test-cost telemetry: `/tmp/pr277-attempt-budget.jsonl`.

## Next safe action

- The repository runner may commit and push this source, test, and state delta,
  then let CI execute the sandbox-incompatible gates. Do not commit or push
  from this workspace.
